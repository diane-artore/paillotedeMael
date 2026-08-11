// Session de l'équipe.
//
// Les écrans de service (cuisine, plus tard l'admin) parlent à la base avec
// un compte Supabase Auth, pas avec la clé publiable seule : le RLS n'ouvre
// `commandes`, `lignes_commande` et la gestion de la carte qu'aux comptes
// présents dans la table `equipe` (fonction est_equipe()).
//
// Pas de bibliothèque : deux appels REST à GoTrue suffisent — l'un pour se
// connecter, l'autre pour rafraîchir le jeton. La session vit dans
// localStorage, comme la mémoire des commandes côté client.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';

const CLE_SESSION = 'paillote.equipe';

// Marge avant expiration : on rafraîchit un peu avant l'heure plutôt que de
// laisser une requête partir avec un jeton mort.
const MARGE_MS = 60_000;

function lireSession() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_SESSION));
    return brut && brut.access_token && brut.refresh_token ? brut : null;
  } catch {
    return null;
  }
}

function retenirSession(s) {
  localStorage.setItem(
    CLE_SESSION,
    JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expire_a: Date.now() + (s.expires_in ?? 3600) * 1000,
    }),
  );
}

async function gotrue(chemin, corps) {
  const reponse = await fetch(`${SUPABASE_URL}/auth/v1/${chemin}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
  });
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    const detail = donnees.error_description || donnees.msg || donnees.error;
    throw new Error(detail || `Connexion refusée (${reponse.status}).`);
  }
  return donnees;
}

export async function seConnecter(email, mot_de_passe) {
  const s = await gotrue('token?grant_type=password', {
    email,
    password: mot_de_passe,
  });
  retenirSession(s);
}

export function seDeconnecter() {
  localStorage.removeItem(CLE_SESSION);
}

export function connecte() {
  return lireSession() !== null;
}

/** Jeton d'accès en cours de validité, rafraîchi au besoin. */
async function jeton() {
  const s = lireSession();
  if (!s) throw new Error('Session absente.');
  if (Date.now() < s.expire_a - MARGE_MS) return s.access_token;
  try {
    const neuve = await gotrue('token?grant_type=refresh_token', {
      refresh_token: s.refresh_token,
    });
    retenirSession(neuve);
    return neuve.access_token;
  } catch (e) {
    // Un refresh_token refusé ne se soigne pas : on repasse par l'écran
    // de connexion plutôt que de boucler sur des 401.
    seDeconnecter();
    throw e;
  }
}

/** Appel REST authentifié. `corps` absent → GET ; sinon `methode` (PATCH…). */
export async function base(chemin, corps, methode) {
  const acces = await jeton();
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    method: corps === undefined ? 'GET' : methode || 'PATCH',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${acces}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (reponse.status === 401) {
    seDeconnecter();
    throw new Error('Session expirée — reconnectez-vous.');
  }
  if (!reponse.ok) throw new Error(`La base a répondu ${reponse.status}.`);
  return reponse.status === 204 ? null : reponse.json();
}
