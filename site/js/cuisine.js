// L'écran de la cuisine.
//
// Réservé à l'équipe : la lecture des commandes et l'avancement des statuts
// passent par le compte Supabase de service (voir equipe.js) — le RLS ne
// laisse rien voir à un visiteur qui trouverait cette page.
//
// L'écran se rafraîchit tout seul toutes les 8 secondes. Pas de temps réel :
// une paillote n'en a pas besoin, et un simple GET périodique survit à tout
// (wifi capricieux, tablette qui sort de veille…).

import { euros } from './config.js';
import { seConnecter, seDeconnecter, connecte, base } from './equipe.js';

const INTERVALLE_MS = 8000;

const SUIVANT = {
  recue: ['en_preparation', 'Commencer la préparation'],
  en_preparation: ['prete', 'C’est prêt'],
  prete: ['servie', 'Servie — au suivant'],
};

const connexion = document.getElementById('connexion');
const service = document.getElementById('service');
const etat = document.getElementById('service-etat');

let minuterie = null;
let sonnerieOuverte = false;
let numerosConnus = null; // null tant que la première lecture n'est pas faite

// --- Sonnerie --------------------------------------------------------------
// Deux notes brèves quand un ticket apparaît. L'API audio ne se débloque
// qu'après un geste : le bouton sert aussi à ça.

function sonner() {
  if (!sonnerieOuverte) return;
  const ctx = new AudioContext();
  [0, 0.18].forEach((depart, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = i ? 1318 : 880; // la, puis mi aigu
    gain.gain.setValueAtTime(0.001, ctx.currentTime + depart);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + depart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + depart + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + depart);
    osc.stop(ctx.currentTime + depart + 0.4);
  });
  setTimeout(() => ctx.close(), 1200);
}

document.getElementById('bouton-son').addEventListener('click', (e) => {
  sonnerieOuverte = !sonnerieOuverte;
  e.target.textContent = sonnerieOuverte ? '🔔 Sonnerie ouverte' : '🔕 Sonnerie coupée';
  e.target.setAttribute('aria-pressed', String(sonnerieOuverte));
  if (sonnerieOuverte) sonner(); // fait office de test et débloque l'audio
});

// --- Lecture ---------------------------------------------------------------

function debutDeJournee() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function lireCommandes() {
  const filtre =
    `select=id,numero_jour,mode,table_numero,client_nom,note,statut,` +
    `statut_paiement,total_cents,created_at,` +
    `lignes_commande(nom,prix_cents,quantite)` +
    `&created_at=gte.${encodeURIComponent(debutDeJournee())}` +
    `&order=created_at.asc`;
  return base(`commandes?${filtre}`);
}

// --- Rendu -----------------------------------------------------------------

function carteTicket(c, active) {
  const ticket = document.createElement('article');
  ticket.className = 'ticket';
  ticket.dataset.statut = c.statut;

  const entete = document.createElement('div');
  entete.className = 'ticket__entete';
  const numero = document.createElement('span');
  numero.className = 'ticket__numero';
  numero.textContent = `n° ${c.numero_jour}`;
  const ou = document.createElement('span');
  ou.className = 'ticket__ou';
  ou.textContent =
    c.mode === 'a_emporter'
      ? `À emporter${c.client_nom ? ' — ' + c.client_nom : ''}`
      : `Table ${c.table_numero || '?'}`;
  const heure = document.createElement('span');
  heure.className = 'ticket__heure';
  heure.textContent = new Date(c.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  entete.append(numero, ou, heure);
  ticket.append(entete);

  const lignes = document.createElement('div');
  lignes.className = 'ticket__lignes';
  for (const l of c.lignes_commande || []) {
    const ligne = document.createElement('div');
    ligne.className = 'ticket__ligne';
    const q = document.createElement('span');
    q.className = 'ticket__quantite';
    q.textContent = `${l.quantite}×`;
    ligne.append(q, document.createTextNode(l.nom));
    lignes.append(ligne);
  }
  ticket.append(lignes);

  if (c.note) {
    const note = document.createElement('p');
    note.className = 'ticket__note';
    note.textContent = c.note;
    ticket.append(note);
  }

  const pied = document.createElement('div');
  pied.className = 'ticket__pied';
  const total = document.createElement('span');
  total.className = 'ticket__total';
  total.textContent = euros(c.total_cents);
  pied.append(total);

  const paiement = document.createElement('button');
  paiement.type = 'button';
  paiement.className = 'ticket__paiement';
  if (c.statut_paiement === 'paye') {
    paiement.textContent = 'Encaissée ✓';
    paiement.dataset.paye = '';
    paiement.disabled = true;
  } else {
    paiement.textContent = 'À encaisser — espèces';
    paiement.addEventListener('click', () =>
      avancer(c.id, { statut_paiement: 'paye' }),
    );
  }
  pied.append(paiement);
  ticket.append(pied);

  if (active) {
    const actions = document.createElement('div');
    actions.className = 'ticket__actions';
    const [prochain, libelle] = SUIVANT[c.statut];
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'ticket__suivant';
    bouton.textContent = libelle;
    bouton.addEventListener('click', () => avancer(c.id, { statut: prochain }));
    actions.append(bouton);

    const annuler = document.createElement('button');
    annuler.type = 'button';
    annuler.className = 'ticket__annuler';
    annuler.textContent = 'Annuler';
    annuler.addEventListener('click', () => {
      if (confirm(`Annuler la commande n° ${c.numero_jour} ?`)) {
        avancer(c.id, { statut: 'annulee' });
      }
    });
    actions.append(annuler);
    ticket.append(actions);
  }

  return ticket;
}

function afficher(commandes) {
  const actives = commandes.filter((c) =>
    ['recue', 'en_preparation', 'prete'].includes(c.statut),
  );
  const finies = commandes.filter(
    (c) => c.statut === 'servie' || c.statut === 'annulee',
  );

  const hoteActifs = document.getElementById('tickets-actifs');
  hoteActifs.textContent = '';
  for (const c of actives) hoteActifs.append(carteTicket(c, true));
  document.getElementById('service-vide').hidden = actives.length > 0;

  const hoteFinis = document.getElementById('tickets-finis');
  hoteFinis.textContent = '';
  // Les plus récentes d'abord dans l'historique.
  for (const c of [...finies].reverse()) hoteFinis.append(carteTicket(c, false));
  document.getElementById('historique-compte').textContent = finies.length;

  // Sonne pour tout numéro jamais vu — sauf au premier chargement.
  const numeros = new Set(commandes.map((c) => c.numero_jour));
  if (numerosConnus !== null) {
    for (const n of numeros) {
      if (!numerosConnus.has(n)) {
        sonner();
        break;
      }
    }
  }
  numerosConnus = numeros;
}

// --- Boucle ----------------------------------------------------------------

async function rafraichir() {
  try {
    afficher(await lireCommandes());
    etat.textContent = `À jour — ${new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  } catch (e) {
    console.error(e);
    if (!connecte()) return basculer(); // session périmée → écran de connexion
    etat.textContent = 'La base ne répond pas — nouvelle tentative bientôt.';
  }
}

async function avancer(id, changement) {
  try {
    await base(`commandes?id=eq.${id}`, changement);
    await rafraichir();
  } catch (e) {
    console.error(e);
    alert("Le changement n'a pas été enregistré. Réessayez.");
  }
}

function basculer() {
  const ouverte = connecte();
  connexion.hidden = ouverte;
  service.hidden = !ouverte;
  clearInterval(minuterie);
  if (ouverte) {
    numerosConnus = null;
    rafraichir();
    minuterie = setInterval(rafraichir, INTERVALLE_MS);
  }
}

document
  .getElementById('formulaire-connexion')
  .addEventListener('submit', async (e) => {
    e.preventDefault();
    const erreur = document.getElementById('connexion-erreur');
    erreur.hidden = true;
    try {
      await seConnecter(
        document.getElementById('email').value.trim(),
        document.getElementById('mot_de_passe').value,
      );
      basculer();
    } catch (ex) {
      erreur.textContent = ex.message || 'Connexion impossible.';
      erreur.hidden = false;
    }
  });

document.getElementById('bouton-sortir').addEventListener('click', () => {
  seDeconnecter();
  basculer();
});

basculer();
