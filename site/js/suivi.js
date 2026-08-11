// Suivi d'une commande.
//
// Le client ne lit pas la table `commandes` — le RLS la lui interdit. Il
// appelle la fonction `suivi_commande(jeton)`, qui ne renvoie que
// l'avancement : ni son nom, ni son téléphone, ni le détail des lignes. Le
// jeton est dans l'URL et périme au bout d'une journée, côté base.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE, euros } from './config.js';

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
  sessionStorage.getItem('paillote.derniere-commande');

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
    return afficher(commande);
  } catch (e) {
    console.error(e);
    etat.className = 'message message--erreur';
    etat.textContent = "Le suivi n'est pas joignable pour le moment.";
    etat.hidden = false;
    return false;
  }
}

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
