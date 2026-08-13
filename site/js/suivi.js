// Suivi d'une commande.
//
// Le client ne lit pas la table `commandes` — le RLS la lui interdit. Il
// appelle la fonction `suivi_commande(jeton)`, qui ne renvoie que
// l'avancement : ni son nom, ni son téléphone, ni le détail des lignes. Le
// jeton est dans l'URL et périme au bout d'une journée, côté base.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE, euros } from './config.js';
import { commandesRecentes, oublierCommande } from './commandes.js';

const ETAPES = [
  ['recue', 'Reçue'],
  ['en_preparation', 'En préparation'],
  ['prete', 'Prête'],
  ['servie', 'Servie'],
];

const PAIEMENT = {
  a_regler_sur_place: 'À régler au comptoir, en espèces.',
  paye: 'Réglée. Merci !',
};

const jeton =
  new URLSearchParams(location.search).get('c') ||
  commandesRecentes()[0]?.jeton;

const etat = document.getElementById('suivi-etat');
const corps = document.getElementById('suivi-corps');

async function interroger() {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suivi_commande`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_jeton: jeton }),
  });
  if (!reponse.ok) throw new Error(`Suivi indisponible (${reponse.status}).`);
  const lignes = await reponse.json();
  return Array.isArray(lignes) ? lignes[0] : lignes;
}

function afficher(commande) {
  document.getElementById('suivi-numero').textContent = commande.numero_jour;
  document.getElementById('suivi-total').textContent = euros(commande.total_cents);
  document.getElementById('suivi-mode').textContent =
    commande.mode === 'a_emporter' ? 'À emporter' : 'Sur place';
  document.getElementById('suivi-paiement').textContent =
    PAIEMENT[commande.statut_paiement] || '';

  guetterPrete(commande.statut);
  // Plus rien à guetter une fois le plateau sur la table.
  document.getElementById('alerte-prete').hidden =
    ['prete', 'servie', 'annulee'].includes(commande.statut);

  if (commande.statut === 'annulee') {
    document.getElementById('suivi-etapes').hidden = true;
    const annulee = document.getElementById('suivi-annulee');
    annulee.hidden = false;
    return true;
  }

  const rang = ETAPES.findIndex(([cle]) => cle === commande.statut);
  const hote = document.getElementById('suivi-etapes');
  hote.textContent = '';
  ETAPES.forEach(([, libelle], i) => {
    const li = document.createElement('li');
    li.className = 'suivi__etape';
    li.textContent = libelle;
    if (i === rang) li.dataset.actuelle = '';
    else if (i < rang) li.dataset.passee = '';
    hote.append(li);
  });

  if (commande.statut === 'servie') proposerAvis();
  return commande.statut === 'servie';
}

/** Quand la commande n'existe plus, on propose une porte de sortie. */
function montrerLaSuite(suivante) {
  if (document.getElementById('suivi-suite')) return;
  const p = document.createElement('p');
  p.id = 'suivi-suite';
  p.style.marginTop = '2rem';
  const lien = document.createElement('a');
  lien.className = 'bouton';
  if (suivante) {
    lien.href = `suivi.html?c=${encodeURIComponent(suivante.jeton)}`;
    lien.textContent = suivante.numero
      ? `Suivre la commande n° ${suivante.numero}`
      : 'Suivre ma commande en cours';
  } else {
    lien.href = 'carte.html';
    lien.textContent = 'Voir la carte';
  }
  p.append(lien);
  document.getElementById('suivi-etat').after(p);
}

async function rafraichir() {
  try {
    const commande = await interroger();
    if (!commande) {
      // La base ne la connaît plus : effacée au comptoir, ou d'hier. On
      // cesse de la proposer sur cet appareil, sinon l'onglet « Vos
      // commandes en cours » ramènerait indéfiniment sur cette page vide.
      oublierCommande(jeton);
      const onglet = document.getElementById('nav-commandes');
      const [suivante] = commandesRecentes();
      if (onglet) {
        if (suivante) onglet.href = `suivi.html?c=${encodeURIComponent(suivante.jeton)}`;
        else onglet.hidden = true;
      }

      etat.className = 'message';
      etat.textContent = suivante
        ? "Cette commande n'est plus suivie. Vous en avez une autre en cours."
        : "Cette commande n'est plus suivie — elle a été clôturée au comptoir, ou elle date d'hier.";
      etat.hidden = false;
      corps.hidden = true;
      document.getElementById('avis-bloc').hidden = true;
      document.getElementById('facture-choix').hidden = true;
      montrerLaSuite(suivante);
      return true;
    }
    etat.hidden = true;
    corps.hidden = false;
    document.getElementById('facture-choix').hidden = false;
    return afficher(commande);
  } catch (e) {
    console.error(e);
    etat.className = 'message message--erreur';
    etat.textContent = "Le suivi n'est pas joignable pour le moment.";
    etat.hidden = false;
    return false;
  }
}

// Si d'autres commandes de cet appareil sont encore en cours, on propose
// d'aller les suivre — sans rien montrer quand celle-ci est la seule.
const autres = commandesRecentes().filter((c) => c.jeton !== jeton);
if (autres.length) {
  const liste = document.getElementById('suivi-autres-liste');
  for (const c of autres) {
    const li = document.createElement('li');
    const lien = document.createElement('a');
    lien.href = `suivi.html?c=${encodeURIComponent(c.jeton)}`;
    lien.textContent = c.numero
      ? `Commande n° ${c.numero}`
      : `Commande de ${new Date(c.quand).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
    li.append(lien);
    liste.append(li);
  }
  document.getElementById('suivi-autres').hidden = false;
}

// --- La facture -------------------------------------------------------------
// Imprimer, ou l'emporter par e-mail. Les lignes viennent de
// `facture_commande(jeton)` : même serrure que le suivi, mais avec le détail.

const ADRESSE = 'Sandiade, Chemin des Hubacs, 83210 Solliès-Toucas';
let facture = null;

async function chargerFacture() {
  if (facture) return facture;
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/facture_commande`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_jeton: jeton }),
  });
  if (!reponse.ok) throw new Error(`Facture indisponible (${reponse.status}).`);
  facture = await reponse.json();
  return facture;
}

function datePassage(f) {
  return new Date(f.passee_a).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function remplirGabarit(f) {
  const hote = document.getElementById('facture');
  hote.textContent = '';

  const titre = document.createElement('h1');
  titre.textContent = 'La Paillote de Maël';
  const sousTitre = document.createElement('p');
  sousTitre.textContent = ADRESSE;
  const repere = document.createElement('p');
  repere.textContent = `Commande n° ${f.numero_jour} — ${datePassage(f)}`;
  hote.append(titre, sousTitre, repere);

  const table = document.createElement('table');
  for (const l of f.lignes || []) {
    const tr = document.createElement('tr');
    const quoi = document.createElement('td');
    quoi.textContent = `${l.quantite} × ${l.nom}`;
    const combien = document.createElement('td');
    combien.textContent = euros(l.prix_cents * l.quantite);
    tr.append(quoi, combien);
    table.append(tr);
  }
  if (f.remise_cents > 0) {
    const tr = document.createElement('tr');
    const quoi = document.createElement('td');
    quoi.textContent = `Remises${f.remise_detail ? ` (${f.remise_detail})` : ''}`;
    const combien = document.createElement('td');
    combien.textContent = `−${euros(f.remise_cents)}`;
    tr.append(quoi, combien);
    table.append(tr);
  }
  const total = document.createElement('tr');
  total.className = 'facture__total';
  const totalNom = document.createElement('td');
  totalNom.textContent = 'Total';
  const totalValeur = document.createElement('td');
  totalValeur.textContent = euros(f.total_cents);
  total.append(totalNom, totalValeur);
  table.append(total);
  hote.append(table);

  const paiement = document.createElement('p');
  paiement.textContent =
    f.statut_paiement === 'paye'
      ? 'Réglée — merci !'
      : 'À régler au comptoir, en espèces.';
  const merci = document.createElement('p');
  merci.textContent = 'Merci, et à bientôt au bord du bassin.';
  hote.append(paiement, merci);
}

function texteFacture(f) {
  const lignes = (f.lignes || []).map(
    (l) => `${l.quantite} × ${l.nom} — ${euros(l.prix_cents * l.quantite)}`,
  );
  return [
    'La Paillote de Maël',
    ADRESSE,
    '',
    `Commande n° ${f.numero_jour} — ${datePassage(f)}`,
    '',
    ...lignes,
    ...(f.remise_cents > 0
      ? [`Remises : −${euros(f.remise_cents)}${f.remise_detail ? ` (${f.remise_detail})` : ''}`]
      : []),
    '',
    `Total : ${euros(f.total_cents)}`,
    f.statut_paiement === 'paye'
      ? 'Réglée — merci !'
      : 'À régler au comptoir, en espèces.',
    '',
    'Merci, et à bientôt au bord du bassin.',
  ].join('\n');
}

// --- « C'est prêt ! » --------------------------------------------------------
// Le client n'a pas à surveiller son téléphone : quand la cuisine passe la
// commande à « Prête », ça sonne et ça vibre. Le navigateur n'autorise le
// son qu'après un geste — d'où le bouton, qui sert aussi d'essai.

let alerteOuverte = false;
let statutPrecedent = null;

function sonnerPrete() {
  if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  if (!alerteOuverte) return;
  const ctx = new AudioContext();
  [0, 0.22, 0.44].forEach((depart, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = [880, 1108, 1318][i];
    gain.gain.setValueAtTime(0.001, ctx.currentTime + depart);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + depart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + depart + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + depart);
    osc.stop(ctx.currentTime + depart + 0.45);
  });
  setTimeout(() => ctx.close(), 1500);
}

document.getElementById('alerte-prete').addEventListener('click', (e) => {
  alerteOuverte = !alerteOuverte;
  e.target.textContent = alerteOuverte
    ? '🔔 Vous serez prévenu'
    : '🔕 Alerte coupée';
  e.target.setAttribute('aria-pressed', String(alerteOuverte));
  if (alerteOuverte) {
    sonnerPrete(); // essai, et déverrouillage du son
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
});

/** Appelée à chaque rafraîchissement : ne sonne qu'au passage à « prête ». */
function guetterPrete(statut) {
  if (statut === 'prete' && statutPrecedent && statutPrecedent !== 'prete') {
    sonnerPrete();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('La Paillote de Maël', {
        body: 'Votre commande est prête — à récupérer au comptoir !',
        icon: 'assets/apple-touch-icon.png',
      });
    }
  }
  statutPrecedent = statut;
}

// --- L'avis -----------------------------------------------------------------
// Proposé une fois la commande servie. Le jeton sert de droit d'écrire :
// c'est la base qui vérifie (servie, un seul avis, dans la journée).

let noteChoisie = 0;
let avisPropose = false;

const cleAvisDonne = () => `paillote.avis.${jeton}`;

function proposerAvis() {
  if (avisPropose || !jeton) return;
  avisPropose = true;
  const bloc = document.getElementById('avis-bloc');
  bloc.hidden = false;
  let deja = false;
  try {
    deja = !!localStorage.getItem(cleAvisDonne());
  } catch {
    /* rien */
  }
  if (deja) {
    document.getElementById('avis-formulaire').hidden = true;
    document.getElementById('avis-merci').hidden = false;
  }
}

document.getElementById('avis-etoiles').addEventListener('click', (e) => {
  const bouton = e.target.closest('[data-note]');
  if (!bouton) return;
  noteChoisie = +bouton.dataset.note;
  for (const b of document.querySelectorAll('#avis-etoiles [data-note]')) {
    b.classList.toggle('avis-etoiles--pleine', +b.dataset.note <= noteChoisie);
  }
  document.getElementById('avis-envoyer').disabled = noteChoisie === 0;
});

document.getElementById('avis-formulaire').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!noteChoisie) return;
  const bouton = document.getElementById('avis-envoyer');
  const erreur = document.getElementById('avis-erreur');
  bouton.disabled = true;
  erreur.hidden = true;
  try {
    await rpcPublic('avis_deposer', {
      p_jeton: jeton,
      p_note: noteChoisie,
      p_commentaire: document.getElementById('avis-commentaire').value,
    });
    try {
      localStorage.setItem(cleAvisDonne(), '1');
    } catch {
      /* rien */
    }
    document.getElementById('avis-formulaire').hidden = true;
    document.getElementById('avis-merci').hidden = false;
  } catch (err) {
    erreur.textContent = err.message;
    erreur.hidden = false;
    bouton.disabled = false;
  }
});

// --- Fidélité et roue -------------------------------------------------------
// Le téléphone donné à la commande est retenu sur l'appareil : il suffit à
// afficher les points et à faire tourner la roue. Le tirage est fait par la
// base (roue_tourner) — l'animation ne fait qu'atterrir sur le résultat.

const COULEURS_ROUE = ['#17565C', '#E8894A', '#C8425A', '#7C8F4E', '#A8D5D0', '#C99A5E'];
let telephoneFidele = null;
let lotsRoue = [];

try {
  telephoneFidele = localStorage.getItem('paillote.telephone');
} catch {
  /* rien */
}

async function rpcPublic(fonction, corps) {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
  });
  const donnees = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    throw new Error(donnees?.message || `La base a répondu ${reponse.status}.`);
  }
  return donnees;
}

function dessinerRoue(lots) {
  const disque = document.getElementById('roue-disque');
  disque.textContent = '';
  const n = lots.length || 1;
  const part = 360 / n;
  lots.forEach((lot, i) => {
    const debut = ((i * part - 90) * Math.PI) / 180;
    const fin = (((i + 1) * part - 90) * Math.PI) / 180;
    const grand = part > 180 ? 1 : 0;
    const secteur = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    secteur.setAttribute(
      'd',
      `M 100,100 L ${100 + 98 * Math.cos(debut)},${100 + 98 * Math.sin(debut)} ` +
        `A 98,98 0 ${grand} 1 ${100 + 98 * Math.cos(fin)},${100 + 98 * Math.sin(fin)} Z`,
    );
    secteur.setAttribute('fill', COULEURS_ROUE[i % COULEURS_ROUE.length]);
    disque.append(secteur);

    const angleTexte = (i + 0.5) * part;
    const texte = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    texte.setAttribute('x', '100');
    texte.setAttribute('y', '22');
    texte.setAttribute('text-anchor', 'middle');
    texte.setAttribute('fill', '#F7F0E4');
    texte.setAttribute('font-size', '8.5');
    texte.setAttribute('transform', `rotate(${angleTexte} 100 100)`);
    texte.textContent =
      lot.titre.length > 22 ? `${lot.titre.slice(0, 21)}…` : lot.titre;
    disque.append(texte);
  });
  const moyeu = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  moyeu.setAttribute('cx', '100');
  moyeu.setAttribute('cy', '100');
  moyeu.setAttribute('r', '14');
  moyeu.setAttribute('fill', '#F7F0E4');
  disque.append(moyeu);
}

async function montrerFidelite() {
  if (!telephoneFidele) return;
  let solde;
  try {
    solde = await rpcPublic('fidelite_solde', { p_telephone: telephoneFidele });
  } catch {
    return; // pas de réseau, pas de bloc — le suivi reste l'essentiel
  }
  if (!solde || !solde.fidelite_active) return;

  const bloc = document.getElementById('fidelite');
  bloc.hidden = false;
  document.getElementById('fidelite-points').textContent = solde.points;
  // Dire à quel numéro ces points sont attachés : c'est lui qu'il faudra
  // redonner à la prochaine commande pour les retrouver.
  document.getElementById('fidelite-numero').textContent =
    `Attachés au ${telephoneFidele}`;
  const detail = document.getElementById('fidelite-detail');
  const manque = Math.max(0, solde.seuil - solde.points);
  detail.textContent =
    solde.points >= solde.seuil && solde.roue_active
      ? 'Le compte y est : la roue vous attend.'
      : `Encore ${manque} point${manque > 1 ? 's' : ''} et la roue tourne (1 € = 1 point).`;

  const listeAvoirs = document.getElementById('fidelite-avoirs');
  listeAvoirs.textContent = '';
  for (const avoir of solde.avoirs || []) {
    const li = document.createElement('li');
    li.textContent = `🎁 ${avoir.titre} — appliqué à votre prochaine commande`;
    listeAvoirs.append(li);
  }

  lotsRoue = solde.lots || [];
  const boutonRoue = document.getElementById('fidelite-roue');
  boutonRoue.hidden = !(
    solde.roue_active && lotsRoue.length && solde.points >= solde.seuil
  );
}

document.getElementById('fidelite-roue').addEventListener('click', () => {
  dessinerRoue(lotsRoue);
  const resultat = document.getElementById('roue-resultat');
  resultat.hidden = true;
  document.getElementById('roue-lancer').disabled = false;
  document.getElementById('roue-disque').style.transform = '';
  document.getElementById('dialogue-roue').showModal();
});

document.getElementById('roue-lancer').addEventListener('click', async (e) => {
  const bouton = e.currentTarget;
  bouton.disabled = true;
  let gain;
  try {
    gain = await rpcPublic('roue_tourner', { p_telephone: telephoneFidele });
  } catch (err) {
    bouton.disabled = false;
    alert(err.message);
    return;
  }
  // 5 tours pleins, puis arrêt au milieu du segment gagnant (sous la flèche).
  const part = 360 / lotsRoue.length;
  const arrivee = 5 * 360 - (gain.index + 0.5) * part;
  const disque = document.getElementById('roue-disque');
  disque.style.transition = 'transform 4s cubic-bezier(0.16, 1, 0.3, 1)';
  disque.style.transform = `rotate(${arrivee}deg)`;
  setTimeout(() => {
    const resultat = document.getElementById('roue-resultat');
    resultat.textContent = `🎉 ${gain.titre} ! Le lot s'appliquera tout seul à votre prochaine commande.`;
    resultat.hidden = false;
    montrerFidelite(); // points et avoirs à jour
  }, 4200);
});

document
  .querySelector('#dialogue-roue [data-fermer]')
  .addEventListener('click', () => document.getElementById('dialogue-roue').close());

document.getElementById('facture-imprimer').addEventListener('click', async () => {
  try {
    remplirGabarit(await chargerFacture());
    window.print();
  } catch (e) {
    console.error(e);
    alert("La facture n'est pas joignable pour le moment.");
  }
});

document.getElementById('facture-email').addEventListener('click', async () => {
  try {
    const f = await chargerFacture();
    const sujet = `Facture — La Paillote de Maël, commande n° ${f.numero_jour}`;
    location.href = `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texteFacture(f))}`;
  } catch (e) {
    console.error(e);
    alert("La facture n'est pas joignable pour le moment.");
  }
});

if (!jeton) {
  etat.textContent =
    "Aucune commande à suivre. Composez la vôtre depuis la carte.";
} else {
  // Un rafraîchissement toutes les 15 s : une paillote n'a pas besoin de
  // temps réel côté client, et ça évite une connexion ouverte en permanence.
  rafraichir().then(function boucler(fini) {
    if (fini) return;
    setTimeout(() => rafraichir().then(boucler), 15000);
  });
}

montrerFidelite();
