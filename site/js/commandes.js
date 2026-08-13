// Les commandes passées depuis cet appareil.
//
// Quand la fonction `commander` répond, la carte confie ici le jeton de
// suivi. Il est rangé dans localStorage — contrairement au panier, il doit
// survivre à la fermeture de l'onglet — pour que « Vos commandes en cours »,
// dans l'en-tête, ramène le client à sa commande. Le jeton périme au bout
// d'une journée côté base : au bout de douze heures, on l'oublie aussi ici.

const CLE_COMMANDES = 'paillote.commandes';
const DOUZE_HEURES = 12 * 60 * 60 * 1000;

/**
 * Les commandes encore fraîches, la plus récente d'abord.
 * @returns {{jeton: string, numero?: number, quand: number}[]}
 */
export function commandesRecentes() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_COMMANDES) || '[]');
    if (!Array.isArray(brut)) return [];
    return brut
      .filter(
        (c) =>
          c &&
          typeof c.jeton === 'string' &&
          typeof c.quand === 'number' &&
          Date.now() - c.quand < DOUZE_HEURES
      )
      .sort((a, b) => b.quand - a.quand);
  } catch {
    return [];
  }
}

/**
 * Oublie une commande que la base ne connaît plus — annulée par le
 * comptoir, effacée, ou simplement trop vieille. Sans ça, l'appareil
 * continuerait de proposer « Vos commandes en cours » vers une page vide.
 */
export function oublierCommande(jeton) {
  try {
    const liste = commandesRecentes().filter((c) => c.jeton !== jeton);
    localStorage.setItem(CLE_COMMANDES, JSON.stringify(liste));
  } catch {
    /* sans stockage, il n'y avait rien à oublier */
  }
}

/** Retient une commande qui vient d'être passée (et balaie les périmées). */
export function retenirCommande(commande) {
  try {
    const liste = commandesRecentes().filter((c) => c.jeton !== commande.jeton);
    liste.unshift({
      jeton: commande.jeton,
      numero: commande.numero_jour,
      quand: Date.now(),
    });
    localStorage.setItem(CLE_COMMANDES, JSON.stringify(liste.slice(0, 10)));
  } catch {
    // Navigation privée, quota plein : le suivi reste accessible par l'URL.
  }
}

// --- L'onglet « Vos commandes en cours » -------------------------------------
// Présent (mais caché) dans l'en-tête de chaque page ; on ne le montre que si
// l'appareil a une commande fraîche, et il mène au suivi de la plus récente.
// S'il y en a plusieurs, la page de suivi liste les autres.

const onglet = document.getElementById('nav-commandes');
if (onglet) {
  const [derniere] = commandesRecentes();
  if (derniere) {
    onglet.href = `suivi.html?c=${encodeURIComponent(derniere.jeton)}`;
    onglet.hidden = false;
  }
}
