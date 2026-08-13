// Les horaires de la page d'accueil : lus en direct depuis la base (mêmes
// réglages que ceux qui gouvernent la carte), pour ne jamais avoir de texte
// à mettre à jour à la main.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

async function serviceEtat() {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/service_etat`, {
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

/** Regroupe les jours ouverts en plages compactes : « Lun–Dim », « Mar, Jeu, Sam »… */
function resumerJours(jours) {
  if (!jours || jours.length === 0) return 'Fermé cette saison';
  if (jours.length === 7) return 'Tous les jours';

  const tries = [...jours].sort((a, b) => a - b);
  const plages = [];
  let debut = tries[0];
  let precedent = tries[0];

  for (let i = 1; i <= tries.length; i++) {
    const courant = tries[i];
    if (courant === precedent + 1) {
      precedent = courant;
      continue;
    }
    plages.push(debut === precedent ? JOURS[debut] : `${JOURS[debut]}–${JOURS[precedent]}`);
    debut = courant;
    precedent = courant;
  }
  return plages.join(', ');
}

function heureCourte(hhmm) {
  return hhmm ? hhmm.replace(':00', 'h').replace(':', 'h') : '';
}

export async function afficherHoraires(conteneur) {
  const badge = conteneur.querySelector('[data-horaires-badge]');
  const jours = conteneur.querySelector('[data-horaires-jours]');
  const plage = conteneur.querySelector('[data-horaires-plage]');

  try {
    const etat = await serviceEtat();

    jours.textContent = resumerJours(etat.jours);
    plage.textContent = etat.debut && etat.fin
      ? `${heureCourte(etat.debut)} – ${heureCourte(etat.fin)}`
      : 'Ouvert jusqu\u2019à la nuit tombée';

    badge.textContent = etat.ouvert ? '● Ouvert maintenant' : '○ Fermé pour le moment';
    badge.classList.toggle('horaires__badge--ouvert', etat.ouvert);
    badge.classList.toggle('horaires__badge--ferme', !etat.ouvert);
  } catch {
    // La base ne répond pas : on retombe sur une phrase sobre plutôt que de
    // laisser un bandeau vide ou une erreur visible.
    jours.textContent = 'Du printemps à la fin de l\u2019été';
    plage.textContent = 'Ouvert jusqu\u2019à la nuit tombée';
    badge.hidden = true;
  }
}
