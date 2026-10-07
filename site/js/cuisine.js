// L'écran de la cuisine.
//
// Pas de compte, mais un code d'équipe : la base vérifie le PIN à chaque
// geste (voir pin.js), et les fonctions cuisine_* donnent exactement les
// gestes du service — lire les tickets du jour, avancer un statut,
// encaisser. Ni téléphone client, ni suppression, ni écriture libre.
//
// L'écran se rafraîchit tout seul toutes les 8 secondes. Pas de temps réel :
// une paillote n'en a pas besoin, et un simple GET périodique survit à tout
// (wifi capricieux, tablette qui sort de veille…).

import { euros, SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';
import { creerRpc } from './pin.js';

const rpc = creerRpc('L’écran de service');

/** Les fonctions publiques (service_etat…) ne prennent pas de PIN. */
async function rpcPublic(fonction) {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!reponse.ok) throw new Error(`La base a répondu ${reponse.status}.`);
  return reponse.json();
}

const INTERVALLE_MS = 8000;

const SUIVANT = {
  recue: ['en_preparation', 'Commencer la préparation'],
  en_preparation: ['prete', 'C’est prêt'],
  prete: ['servie', 'Servie — au suivant'],
};

const etat = document.getElementById('service-etat');

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

async function lireCommandes() {
  return (await rpc('cuisine_commandes')) || [];
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

  // Le client a demandé à être servi à une heure précise : la cuisine doit
  // la voir tout de suite, pas la découvrir en lisant le mot en bas du
  // ticket.
  if (c.heure_souhaitee) {
    const voulue = document.createElement('p');
    voulue.className = 'ticket__heure-voulue';
    voulue.textContent = `⏱ Servir vers ${c.heure_souhaitee}`;
    ticket.append(voulue);
  }

  const lignes = document.createElement('div');
  lignes.className = 'ticket__lignes';
  for (const l of c.lignes || []) {
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
  if (c.remise_cents > 0) {
    const remise = document.createElement('small');
    remise.className = 'ticket__remise';
    remise.title = c.remise_detail || '';
    remise.textContent = ` (remise −${euros(c.remise_cents)} déjà comptée)`;
    total.append(remise);
  }
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
      agir('cuisine_encaisser', { p_id: c.id }),
    );
  }
  pied.append(paiement);
  ticket.append(pied);

  const actions = document.createElement('div');
  actions.className = 'ticket__actions';

  if (active) {
    const [prochain, libelle] = SUIVANT[c.statut];
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'ticket__suivant';
    bouton.textContent = libelle;
    bouton.addEventListener('click', () =>
      agir('cuisine_avancer', { p_id: c.id, p_statut: prochain }),
    );
    actions.append(bouton);

    const annuler = document.createElement('button');
    annuler.type = 'button';
    annuler.className = 'ticket__annuler';
    annuler.textContent = 'Annuler';
    annuler.addEventListener('click', () => {
      if (confirm(`Annuler la commande n° ${c.numero_jour} ?`)) {
        agir('cuisine_avancer', { p_id: c.id, p_statut: 'annulee' });
      }
    });
    actions.append(annuler);
  }

  // Supprimer efface pour de bon — commande d'essai, doublon, erreur de
  // saisie. Annuler garde une trace dans l'historique du jour ; Supprimer
  // n'en laisse aucune.
  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'ticket__supprimer';
  supprimer.textContent = 'Supprimer';
  supprimer.addEventListener('click', () => {
    if (
      confirm(
        `Supprimer la commande n° ${c.numero_jour} ? Elle disparaîtra pour de bon, sans passer par l'historique.`,
      )
    ) {
      agir('cuisine_supprimer', { p_id: c.id });
    }
  });
  actions.append(supprimer);
  ticket.append(actions);

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

// --- L'interrupteur du service -----------------------------------------------
// Trois positions : « auto » suit les horaires réglés dans l'admin, les deux
// autres tranchent à la main (orage, coup de feu, plus rien à servir).

const SERVICE_SUIVANT = { auto: 'ferme', ferme: 'ouvert', ouvert: 'auto' };

function direService(etat) {
  const bouton = document.getElementById('bouton-service');
  const ouvert = etat.ouvert ? 'ouvert' : 'fermé';
  bouton.textContent =
    etat.mode === 'auto'
      ? `⏱ Horaires (${ouvert})`
      : etat.mode === 'ouvert'
        ? '🟢 Ouvert (forcé)'
        : '🔴 Fermé (forcé)';
  bouton.dataset.mode = etat.mode;
}

document.getElementById('bouton-service').addEventListener('click', async (e) => {
  const mode = SERVICE_SUIVANT[e.currentTarget.dataset.mode || 'auto'];
  try {
    direService(await rpc('cuisine_basculer_service', { p_mode: mode }));
  } catch (err) {
    console.error(err);
    alert("Le service n'a pas pu être basculé.");
  }
});

// --- Les ruptures -------------------------------------------------------------
// Plus d'huîtres à 19 h : on décoche, l'article quitte la carte publique.

let rupturesChargees = false;

async function chargerRuptures() {
  if (rupturesChargees) return;
  rupturesChargees = true;
  const etat = document.getElementById('ruptures-etat');
  const corps = document.getElementById('ruptures-corps');
  etat.textContent = 'Chargement…';
  try {
    const rayons = (await rpc('cuisine_carte')) || [];
    corps.textContent = '';
    etat.hidden = true;
    for (const rayon of rayons) {
      if (!rayon.articles.length) continue;
      const bloc = document.createElement('section');
      bloc.className = 'ruptures__rayon';
      const titre = document.createElement('h2');
      titre.className = 'passees__titre';
      titre.textContent = rayon.nom;
      bloc.append(titre);
      for (const article of rayon.articles) {
        const ligne = document.createElement('label');
        ligne.className = 'rupture';
        const case_ = document.createElement('input');
        case_.type = 'checkbox';
        case_.checked = article.disponible;
        case_.addEventListener('change', async () => {
          case_.disabled = true;
          try {
            await rpc('cuisine_rupture', {
              p_id: article.id,
              p_disponible: case_.checked,
            });
            ligne.dataset.rupture = case_.checked ? '' : 'oui';
          } catch (err) {
            console.error(err);
            case_.checked = !case_.checked;
            alert("Le changement n'a pas été enregistré.");
          }
          case_.disabled = false;
        });
        ligne.append(case_, document.createTextNode(` ${article.nom}`));
        if (!article.disponible) ligne.dataset.rupture = 'oui';
        bloc.append(ligne);
      }
      corps.append(bloc);
    }
  } catch (e) {
    console.error(e);
    rupturesChargees = false;
    etat.textContent = 'La carte ne répond pas.';
  }
}

document.getElementById('ruptures').addEventListener('toggle', (e) => {
  if (e.currentTarget.open) chargerRuptures();
});

// --- Les services précédents ------------------------------------------------
// L'écran repart à zéro chaque jour à 1 h du matin (le jour de service va de
// 1 h à 1 h : une commande de minuit et demi appartient encore à la soirée).
// Rien n'est effacé — tout se relit ici, groupé par journée, à la demande.

let passeesChargees = false;

function titreDuJour(cle) {
  const [an, mois, jour] = cle.split('-').map(Number);
  const date = new Date(an, mois - 1, jour);
  const aujourdhui = new Date();
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);
  const memeJour = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (memeJour(date, hier)) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

async function chargerPassees() {
  if (passeesChargees) return;
  passeesChargees = true;
  const etat = document.getElementById('passees-etat');
  const corps = document.getElementById('passees-corps');
  etat.textContent = 'Chargement…';
  try {
    const commandes = (await rpc('cuisine_passees')) || [];
    corps.textContent = '';
    if (!commandes.length) {
      etat.textContent = "Rien avant aujourd'hui : c'est le premier service.";
      return;
    }
    etat.hidden = true;

    // Un groupe par journée, le plus récent en tête.
    const journees = new Map();
    for (const c of commandes) {
      if (!journees.has(c.jour)) journees.set(c.jour, []);
      journees.get(c.jour).push(c);
    }
    for (const [jour, duJour] of journees) {
      const bloc = document.createElement('section');
      bloc.className = 'passees__jour';
      const titre = document.createElement('h2');
      titre.className = 'passees__titre';
      const recette = duJour
        .filter((c) => c.statut !== 'annulee')
        .reduce((s, c) => s + c.total_cents, 0);
      titre.textContent = `${titreDuJour(jour)} — ${duJour.length} commande${
        duJour.length > 1 ? 's' : ''
      }, ${euros(recette)}`;
      const tickets = document.createElement('div');
      tickets.className = 'tickets';
      for (const c of duJour) tickets.append(carteTicket(c, false));
      bloc.append(titre, tickets);
      corps.append(bloc);
    }
  } catch (e) {
    console.error(e);
    passeesChargees = false; // on pourra réessayer en refermant/rouvrant
    etat.textContent = 'Les services précédents ne répondent pas.';
  }
}

document.getElementById('passees').addEventListener('toggle', (e) => {
  if (e.currentTarget.open) chargerPassees();
});

// --- Boucle ----------------------------------------------------------------

async function rafraichir() {
  try {
    afficher(await lireCommandes());
    // L'état du service peut changer sans nous (horaires, autre tablette).
    rpcPublic('service_etat').then(direService).catch(() => {});
    etat.textContent = `À jour — ${new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  } catch (e) {
    console.error(e);
    etat.textContent = 'La base ne répond pas — nouvelle tentative bientôt.';
  }
}

async function agir(fonction, corps) {
  try {
    await rpc(fonction, corps);
    await rafraichir();
    // Le geste peut porter sur un ticket d'un service précédent : la
    // rubrique se relit alors elle aussi.
    const passees = document.getElementById('passees');
    if (passees.open) {
      passeesChargees = false;
      await chargerPassees();
    }
  } catch (e) {
    console.error(e);
    alert("Le changement n'a pas été enregistré. Réessayez.");
  }
}

rafraichir();
setInterval(rafraichir, INTERVALLE_MS);
