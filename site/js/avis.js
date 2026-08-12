// La page des avis.
//
// Lecture seule : avis_publics() renvoie les cinquante derniers — note,
// petit mot, prénom, date, et ce qui avait été commandé. Le dépôt, lui,
// se fait sur la page de suivi, une fois la commande servie.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';

const etat = document.getElementById('avis-etat');
const hote = document.getElementById('avis');

function etoiles(note) {
  const bloc = document.createElement('p');
  bloc.className = 'avis-carte__etoiles';
  bloc.setAttribute('aria-label', `${note} sur 5`);
  bloc.textContent = '★★★★★'.slice(0, note) + '☆☆☆☆☆'.slice(0, 5 - note);
  return bloc;
}

function carteAvis(avis) {
  const carte = document.createElement('article');
  carte.className = 'avis-carte';

  carte.append(etoiles(avis.note));

  if (avis.commentaire) {
    const mot = document.createElement('p');
    mot.className = 'avis-carte__mot';
    mot.textContent = avis.commentaire;
    carte.append(mot);
  }

  const signature = document.createElement('p');
  signature.className = 'avis-carte__signature';
  const quand = new Date(avis.quand).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
  signature.textContent = `${avis.prenom || 'Un client'} — ${quand}`;
  carte.append(signature);

  if (avis.articles?.length) {
    const commande = document.createElement('p');
    commande.className = 'avis-carte__commande';
    commande.textContent = `A commandé : ${avis.articles.join(', ')}`;
    carte.append(commande);
  }

  return carte;
}

async function charger() {
  try {
    const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/avis_publics`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CLE_PUBLIABLE,
        Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!reponse.ok) throw new Error(`La base a répondu ${reponse.status}.`);
    const avis = (await reponse.json()) || [];
    if (!avis.length) {
      etat.textContent =
        'Pas encore d’avis — le premier sera peut-être le vôtre, après votre prochaine commande.';
      return;
    }
    etat.hidden = true;
    for (const a of avis) hote.append(carteAvis(a));
  } catch (e) {
    console.error(e);
    etat.className = 'message message--erreur';
    etat.textContent = 'Les avis ne sont pas joignables pour le moment.';
  }
}

charger();
