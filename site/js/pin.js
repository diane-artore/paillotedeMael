// Le PIN d'équipe, partagé par la cuisine et l'admin.
//
// La vérité est côté base : chaque fonction cuisine_* / admin_* vérifie le
// code reçu (verifier_pin) avant d'agir. Ici on ne fait que demander le
// code, le retenir pour l'appareil, et l'oublier si la base le refuse.

import { SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';

const RANGEMENT = 'paillote-pin';
let porte = null; // une seule porte à l'écran, même si plusieurs appels attendent

function pinRetenu() {
  return localStorage.getItem(RANGEMENT);
}

function retenirPin(pin) {
  localStorage.setItem(RANGEMENT, pin);
}

function oublierPin() {
  localStorage.removeItem(RANGEMENT);
}

function demanderPin(titre, refuse) {
  if (porte) return porte;
  porte = new Promise((resoudre) => {
    const section = document.createElement('section');
    section.className = 'porte-pin';
    section.innerHTML = `
      <form class="porte-pin__carte formulaire">
        <h1 class="connexion__titre">${titre}</h1>
        <div class="champ">
          <label class="champ__label" for="porte-pin-code">Code d'équipe</label>
          <input type="password" id="porte-pin-code" autocomplete="current-password"
                 required autofocus>
        </div>
        <p class="message message--erreur" ${refuse ? '' : 'hidden'}>
          Ce n'est pas le bon code.
        </p>
        <button type="submit" class="bouton">Entrer</button>
      </form>`;
    section.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = section.querySelector('input').value.trim();
      if (!code) return;
      section.remove();
      porte = null;
      resoudre(code);
    });
    document.body.append(section);
    section.querySelector('input').focus();
  });
  return porte;
}

/**
 * Fabrique l'appel RPC d'un écran protégé : ajoute le PIN à chaque corps de
 * requête, demande le code au premier passage, le redemande si la base le
 * refuse, et le retient une fois accepté.
 */
export function creerRpc(titreEcran) {
  let pin = pinRetenu();
  let refuse = false;

  return async function rpc(fonction, corps = {}) {
    for (;;) {
      if (!pin) {
        pin = await demanderPin(titreEcran, refuse);
      }
      const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_CLE_PUBLIABLE,
          Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_pin: pin, ...corps }),
      });
      if (reponse.ok) {
        retenirPin(pin);
        refuse = false;
        return reponse.status === 204 ? null : reponse.json();
      }
      const donnees = await reponse.json().catch(() => ({}));
      if ((donnees.message || '').includes('PIN incorrect')) {
        oublierPin();
        pin = null;
        refuse = true;
        continue; // repose la question
      }
      throw new Error(donnees.message || `La base a répondu ${reponse.status}.`);
    }
  };
}
