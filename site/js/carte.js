// La carte et le panier.
//
// Le panier ne vit que dans le navigateur (et dans sessionStorage, pour
// survivre à un rechargement au bord du bassin). Il ne contient que des
// identifiants d'articles et des quantités : les prix affichés viennent de la
// base, et le total qui fait foi est recalculé par la fonction `commander`.
// Un panier trafiqué ne change donc rien à l'addition.

import { lire, appeler, euros } from './config.js';
import { retenirCommande } from './commandes.js';

const CLE_PANIER = 'paillote.panier';

/** @type {Map<string, number>} id d'article → quantité */
let panier = new Map();
/** @type {Map<string, object>} id d'article → article */
let catalogue = new Map();

// --- Panier -----------------------------------------------------------------

function charger() {
  try {
    const brut = JSON.parse(sessionStorage.getItem(CLE_PANIER) || '[]');
    if (Array.isArray(brut)) {
      panier = new Map(
        brut.filter(
          ([id, q]) => typeof id === 'string' && Number.isInteger(q) && q > 0
        )
      );
    }
  } catch {
    panier = new Map();
  }
}

function ranger() {
  try {
    sessionStorage.setItem(CLE_PANIER, JSON.stringify([...panier]));
  } catch {
    // Navigation privée, quota plein : le panier reste en mémoire, tant pis.
  }
}

function ajuster(id, delta) {
  const quantite = (panier.get(id) || 0) + delta;
  if (quantite <= 0) panier.delete(id);
  else panier.set(id, Math.min(20, quantite));
  ranger();
  redessiner();
}

const totalArticles = () => [...panier.values()].reduce((s, q) => s + q, 0);

const totalCents = () =>
  [...panier].reduce(
    (s, [id, q]) => s + (catalogue.get(id)?.prix_cents || 0) * q,
    0
  );

// --- Rendu de la carte -------------------------------------------------------

function ligneArticle(article) {
  const quantite = panier.get(article.id) || 0;
  const li = document.createElement('li');
  li.className = 'plat';
  li.dataset.article = article.id;
  li.innerHTML = `
    <div class="plat__texte">
      <p class="plat__nom"></p>
      <p class="plat__description"></p>
    </div>
    <p class="plat__prix"></p>
    <div class="compteur" data-quantite="${quantite}">
      <button type="button" class="compteur__bouton" data-action="moins"
              aria-label="Retirer un ${article.nom}"${quantite ? '' : ' hidden'}>−</button>
      <output class="compteur__valeur"${quantite ? '' : ' hidden'}>${quantite}</output>
      <button type="button" class="compteur__bouton compteur__bouton--plus"
              data-action="plus" aria-label="Ajouter un ${article.nom}">+</button>
    </div>`;
  // textContent : les intitulés viennent de la caisse, on ne les interprète pas.
  li.querySelector('.plat__nom').textContent = article.nom;
  const desc = li.querySelector('.plat__description');
  if (article.description) desc.textContent = article.description;
  else desc.remove();
  li.querySelector('.plat__prix').textContent = euros(article.prix_cents);
  return li;
}

function dessinerCarte(rayons) {
  const hote = document.getElementById('carte');
  const sommaire = document.getElementById('sommaire');
  hote.textContent = '';
  if (sommaire) sommaire.textContent = '';

  for (const rayon of rayons) {
    if (!rayon.articles.length) continue;

    if (sommaire) {
      const lien = document.createElement('a');
      lien.href = `#rayon-${rayon.slug}`;
      lien.className = 'sommaire__lien';
      lien.textContent = rayon.nom;
      sommaire.append(lien);
    }

    const section = document.createElement('section');
    section.className = 'rayon';
    section.id = `rayon-${rayon.slug}`;
    const titre = document.createElement('h2');
    titre.className = 'rayon__titre';
    titre.textContent = rayon.nom;
    const liste = document.createElement('ul');
    liste.className = 'plats';
    liste.append(...rayon.articles.map(ligneArticle));
    section.append(titre, liste);
    hote.append(section);
  }
}

/** Met à jour les compteurs et le récapitulatif sans redessiner la carte. */
function redessiner() {
  for (const li of document.querySelectorAll('.plat')) {
    const quantite = panier.get(li.dataset.article) || 0;
    const compteur = li.querySelector('.compteur');
    compteur.dataset.quantite = quantite;
    compteur.querySelector('.compteur__valeur').textContent = quantite;
    compteur.querySelector('[data-action="moins"]').hidden = quantite === 0;
    compteur.querySelector('.compteur__valeur').hidden = quantite === 0;
    li.classList.toggle('plat--choisi', quantite > 0);
  }

  const n = totalArticles();
  const barre = document.getElementById('barre-panier');
  barre.hidden = n === 0;
  document.getElementById('panier-compte').textContent =
    n === 0 ? '' : `${n} article${n > 1 ? 's' : ''}`;
  document.getElementById('panier-total').textContent = euros(totalCents());

  const recap = document.getElementById('recap-lignes');
  if (recap) {
    recap.textContent = '';
    for (const [id, quantite] of panier) {
      const article = catalogue.get(id);
      if (!article) continue;
      const li = document.createElement('li');
      li.className = 'recap__ligne';
      const nom = document.createElement('span');
      nom.textContent = `${quantite} × ${article.nom}`;
      const prix = document.createElement('span');
      prix.className = 'recap__prix';
      prix.textContent = euros(article.prix_cents * quantite);
      li.append(nom, prix);
      recap.append(li);
    }
    document.getElementById('recap-total').textContent = euros(totalCents());
  }
}

// --- Envoi de la commande ----------------------------------------------------

async function envoyer(evenement) {
  evenement.preventDefault();
  const formulaire = evenement.currentTarget;
  const bouton = formulaire.querySelector('[type="submit"]');
  const erreur = document.getElementById('commande-erreur');
  const donnees = new FormData(formulaire);

  if (!panier.size) return;

  bouton.disabled = true;
  bouton.textContent = 'Envoi…';
  erreur.hidden = true;

  try {
    const commande = await appeler('commander', {
      lignes: [...panier].map(([article_id, quantite]) => ({ article_id, quantite })),
      mode: donnees.get('mode') || 'sur_place',
      table_numero: donnees.get('table_numero'),
      client_nom: donnees.get('client_nom'),
      note: donnees.get('note'),
    });

    // Le jeton est la seule clé de suivi : on le retient pour cet appareil
    // (voir js/commandes.js et l'onglet « Vos commandes en cours »).
    retenirCommande(commande);
    try {
      sessionStorage.removeItem(CLE_PANIER);
    } catch {
      /* sans stockage, le numéro affiché ci-dessous suffit */
    }
    panier = new Map();
    location.href = `suivi.html?c=${encodeURIComponent(commande.jeton)}`;
  } catch (e) {
    erreur.textContent = e.message;
    erreur.hidden = false;
    bouton.disabled = false;
    bouton.textContent = 'Envoyer la commande';
  }
}

// --- Mise en route -----------------------------------------------------------

async function demarrer() {
  charger();
  const etat = document.getElementById('carte-etat');

  try {
    const rayons = await lire(
      'rayons?select=slug,nom,position,articles(id,nom,description,prix_cents,position,disponible)' +
        '&order=position.asc'
    );

    for (const rayon of rayons) {
      rayon.articles = (rayon.articles || [])
        .filter((a) => a.disponible)
        .sort((a, b) => a.position - b.position);
      for (const article of rayon.articles) catalogue.set(article.id, article);
    }

    // Un article retiré de la carte depuis la dernière visite ne doit pas
    // rester dans le panier : il serait refusé à l'envoi.
    for (const id of [...panier.keys()]) {
      if (!catalogue.has(id)) panier.delete(id);
    }
    ranger();

    if (!catalogue.size) {
      etat.textContent = "La carte du jour n'est pas encore affichée.";
      return;
    }

    etat.hidden = true;
    dessinerCarte(rayons);
    redessiner();
  } catch (e) {
    etat.className = 'message message--erreur';
    etat.textContent =
      "La carte n'a pas pu être chargée. Vérifiez votre connexion, ou demandez-nous au comptoir.";
    console.error(e);
    return;
  }

  // Un seul écouteur pour toute la carte : les boutons vont et viennent.
  document.getElementById('carte').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-action]');
    if (!bouton) return;
    const id = bouton.closest('.plat').dataset.article;
    ajuster(id, bouton.dataset.action === 'plus' ? 1 : -1);
  });

  const dialogue = document.getElementById('dialogue-commande');
  document.getElementById('ouvrir-commande').addEventListener('click', () => {
    redessiner();
    dialogue.showModal();
  });
  dialogue.querySelector('[data-fermer]').addEventListener('click', () =>
    dialogue.close()
  );

  // Le numéro de table ne concerne que le service sur place.
  const formulaire = document.getElementById('formulaire-commande');
  const champTable = document.getElementById('champ-table');
  formulaire.addEventListener('change', (e) => {
    if (e.target.name === 'mode') {
      champTable.hidden = e.target.value !== 'sur_place';
    }
  });
  formulaire.addEventListener('submit', envoyer);
}

demarrer();
