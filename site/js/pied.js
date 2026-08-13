// Le bandeau d'infos du pied de page.
//
// Le HTML porte déjà les horaires écrits en clair : si la base ne répond
// pas, le pied reste juste et lisible. Ce module ne fait qu'enrichir —
// il rafraîchit la phrase depuis les réglages et ajoute la pastille
// « ouvert / fermé », qu'aucun texte figé ne saurait dire.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** « 12:00 » → « 12 h », « 14:30 » → « 14 h 30 ». */
function heure(hhmm) {
  const [h, m] = (hhmm || '').split(':');
  if (!h) return '';
  return m === '00' ? `${+h} h` : `${+h} h ${m}`;
}

/** Les jours ouverts, dits comme on les dirait : « tous les jours », « du mardi au dimanche »… */
function jours(ouverts) {
  if (!ouverts?.length) return 'Fermé cette saison';
  if (ouverts.length === 7) return 'Tous les jours';

  // Les jours ouverts se suivent-ils, en tournant sur la semaine ?
  const tries = [...ouverts].sort((a, b) => a - b);
  const manquants = [0, 1, 2, 3, 4, 5, 6].filter((j) => !tries.includes(j));
  if (manquants.length === 1) return `Tous les jours sauf le ${JOURS[manquants[0]]}`;

  const suite = [];
  for (let i = 0; i < 7; i++) {
    const jour = (manquants[manquants.length - 1] + 1 + i) % 7;
    if (tries.includes(jour)) suite.push(jour);
    else break;
  }
  if (suite.length === tries.length && suite.length > 1) {
    return `Du ${JOURS[suite[0]]} au ${JOURS[suite[suite.length - 1]]}`;
  }
  return tries.map((j) => JOURS_COURTS[j]).join(', ');
}

export async function garnirLePied(pied) {
  if (!pied) return;
  const pastille = pied.querySelector('[data-pastille]');
  const phrase = pied.querySelector('[data-horaires]');

  try {
    const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/service_etat`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CLE_PUBLIABLE,
        Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!reponse.ok) throw new Error(String(reponse.status));
    const etat = await reponse.json();

    if (etat.debut && etat.fin) {
      phrase.textContent = `${jours(etat.jours)}, de ${heure(etat.debut)} à ${heure(etat.fin)}`;
    }
    pastille.textContent = etat.ouvert ? 'Ouvert maintenant' : 'Fermé pour le moment';
    pastille.dataset.ouvert = etat.ouvert ? 'oui' : 'non';
    pastille.hidden = false;

    // L'annonce de fermeture, si la page en prévoit une. Une fermeture
    // longue se dit plus fort : c'est la première chose à savoir.
    const bandeau = document.getElementById('bandeau-service');
    if (bandeau && !etat.ouvert && etat.message) {
      bandeau.textContent = etat.message;
      bandeau.classList.toggle('bandeau--saison', !!etat.fermeture_longue);
      bandeau.hidden = false;
    }
  } catch {
    // Le texte écrit dans la page fait déjà le travail : on se contente
    // de retirer la pastille, qui serait un mensonge sans la base.
    pastille.remove();
  }
}
