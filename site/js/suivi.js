// Suivi d'une commande.
//
// Le client ne lit pas la table `commandes` — le RLS la lui interdit. Il
// appelle la fonction `suivi_commande(jeton)`, qui ne renvoie que
// l'avancement : ni son nom, ni son téléphone, ni le détail des lignes. Le
// jeton est dans l'URL et périme au bout d'une journée, côté base.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE, euros } from './config.js';
import { commandesRecentes } from './commandes.js';

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

  return commande.statut === 'servie';
}

async function rafraichir() {
  try {
    const commande = await interroger();
    if (!commande) {
      etat.className = 'message';
      etat.textContent =
        "Cette commande est introuvable — elle date peut-être d'hier. Passez nous voir au comptoir.";
      etat.hidden = false;
      corps.hidden = true;
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
    '',
    `Total : ${euros(f.total_cents)}`,
    f.statut_paiement === 'paye'
      ? 'Réglée — merci !'
      : 'À régler au comptoir, en espèces.',
    '',
    'Merci, et à bientôt au bord du bassin.',
  ].join('\n');
}

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
