// Raccordement au projet Supabase « paillote-caisse ».
//
// La clé ci-dessous est la clé PUBLIABLE : elle est faite pour vivre dans le
// navigateur, tout le monde peut la lire. Ce n'est pas elle qui protège les
// données — c'est le RLS côté base (voir supabase/migrations/) :
//
//   · la carte est lisible par tous ;
//   · les commandes ne sont ni lisibles ni modifiables depuis le navigateur ;
//   · une commande ne peut naître que par la fonction `commander`, qui
//     recalcule les prix côté serveur.
//
// La clé SECRÈTE (service_role) ne doit JAMAIS apparaître ici ni nulle part
// dans ce dossier : elle contourne le RLS.

export const SUPABASE_URL = 'https://qhavgcbckxswmhxauavy.supabase.co';
export const SUPABASE_CLE_PUBLIABLE = 'sb_publishable_mEVZ19y5hFq31GiDw7pyYQ_yywIlnWs';

/** Prix en centimes → « 4,80 € ». */
export function euros(cents) {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2,
  });
}

/** Appel REST sur la base, en lecture publique. */
export async function lire(chemin) {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
    },
  });
  if (!reponse.ok) {
    throw new Error(`Lecture impossible (${reponse.status}).`);
  }
  return reponse.json();
}

/** Appel d'une Edge Function. */
export async function appeler(fonction, corps) {
  const reponse = await fetch(`${SUPABASE_URL}/functions/v1/${fonction}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
  });
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new Error(donnees.erreur || `La demande a échoué (${reponse.status}).`);
  }
  return donnees;
}
