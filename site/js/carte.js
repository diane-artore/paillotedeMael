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

/**
 * @type {Map<string, number>} clé de panier → quantité
 *
 * La clé est l'id de l'article, ou `id|composition` pour une formule : deux
 * formules composées différemment font deux lignes, deux identiques
 * s'additionnent. La composition est du texte d'affichage — le prix vient
 * toujours de l'article, jamais de la clé.
 */
let panier = new Map();
/** @type {Map<string, object>} id d'article → article */
let catalogue = new Map();
/** @type {Array<object>} les rayons chargés, pour composer les formules */
let rayonsCharges = [];

const idDe = (cle) => cle.split('|', 1)[0];
const choixDe = (cle) => {
  const i = cle.indexOf('|');
  return i === -1 ? null : cle.slice(i + 1);
};

/** Une formule se compose ; le reste s'ajoute tel quel. */
const estFormule = (article) => /^formule/i.test(article.nom);

const quantiteArticle = (articleId) =>
  [...panier].reduce((s, [cle, q]) => (idDe(cle) === articleId ? s + q : s), 0);

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
    (s, [cle, q]) => s + (catalogue.get(idDe(cle))?.prix_cents || 0) * q,
    0
  );

// --- Rendu de la carte -------------------------------------------------------

function ligneArticle(article) {
  const quantite = quantiteArticle(article.id);
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
    const quantite = quantiteArticle(li.dataset.article);
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
    for (const [cle, quantite] of panier) {
      const article = catalogue.get(idDe(cle));
      if (!article) continue;
      const li = document.createElement('li');
      li.className = 'recap__ligne';
      const nom = document.createElement('span');
      nom.textContent = `${quantite} × ${article.nom}`;
      const choix = choixDe(cle);
      if (choix) {
        const detail = document.createElement('small');
        detail.className = 'recap__choix';
        detail.textContent = choix;
        nom.append(detail);
      }
      const prix = document.createElement('span');
      prix.className = 'recap__prix';
      prix.textContent = euros(article.prix_cents * quantite);
      li.append(nom, prix);
      recap.append(li);
    }
    document.getElementById('recap-total').textContent = euros(totalCents());
  }
}

// --- Composer un article -----------------------------------------------------
// Le même dialogue sert deux cas :
//   · une formule — trois menus déroulants (entrée, plat, dessert) nourris
//     par les rayons de la carte ;
//   · un article à variantes — un menu déroulant (le parfum d'une glace…),
//     déclaré dans l'admin.
// Le choix devient la clé de panier `id|…` : il s'affiche au récapitulatif,
// part avec la commande, et finit sur le ticket de cuisine et la facture.
// Le prix reste celui de l'article.

// Composition par défaut d'une formule ; une formule peut la remplacer via
// variantes.rayons (réglé en base, ex. la formule à 25 € ajoute la boisson).
const RAYONS_FORMULE_DEFAUT = ['a-grignoter', 'faim-de-loup', 'desserts'];

// Le libellé au-dessus de chaque menu déroulant, plus parlant que le nom du
// rayon quand on compose un repas.
const LIBELLES_RAYON = {
  'a-grignoter': 'Entrée',
  entrees: 'Entrée',
  'faim-de-loup': 'Plat',
  plats: 'Plat',
  desserts: 'Dessert',
  'se-rafraichir': 'Boisson',
};

let formuleEnCours = null;

function champDeroulant(libelle, valeurs) {
  const bloc = document.createElement('div');
  bloc.className = 'champ';
  const label = document.createElement('label');
  label.className = 'champ__label';
  label.textContent = libelle;
  const select = document.createElement('select');
  select.required = true;
  label.append(select);
  for (const valeur of valeurs) {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = valeur;
    select.append(option);
  }
  bloc.append(label);
  return bloc;
}

function ouvrirComposition(article) {
  const dialogue = document.getElementById('dialogue-formule');
  const champs = document.getElementById('formule-champs');
  formuleEnCours = article;
  document.getElementById('formule-titre').textContent = article.nom;
  champs.textContent = '';

  if (estFormule(article)) {
    const slugs = Array.isArray(article.variantes?.rayons)
      ? article.variantes.rayons
      : RAYONS_FORMULE_DEFAUT;
    for (const slug of slugs) {
      const rayon = rayonsCharges.find((r) => r.slug === slug);
      const noms = (rayon?.articles || []).map((a) => a.nom);
      // Un rayon vide ne bloque pas la formule : le champ n'apparaît pas.
      if (noms.length) {
        champs.append(champDeroulant(LIBELLES_RAYON[slug] || rayon.nom, noms));
      }
    }
    document.getElementById('formule-ajouter').textContent = 'Ajouter la formule';
  } else {
    const v = article.variantes;
    champs.append(champDeroulant(v.titre || 'Choix', v.valeurs));
    document.getElementById('formule-ajouter').textContent = 'Ajouter';
  }
  dialogue.showModal();
}

function brancherComposition() {
  const dialogue = document.getElementById('dialogue-formule');
  dialogue.querySelector('[data-fermer]').addEventListener('click', () =>
    dialogue.close()
  );
  document.getElementById('formulaire-formule').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formuleEnCours) return;
    const morceaux = [
      ...document.querySelectorAll('#formule-champs select'),
    ].map((s) => s.value);
    // La barre verticale sépare l'id du choix dans la clé : elle ne doit
    // donc jamais entrer dans le choix lui-même.
    const choix = morceaux.join(' · ').replaceAll('|', '/');
    ajuster(`${formuleEnCours.id}|${choix}`, 1);
    dialogue.close();
  });
}

/** L'article demande-t-il un choix au moment de l'ajouter ? */
const seCompose = (article) =>
  estFormule(article) || (article.variantes?.valeurs?.length > 0);

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
      lignes: [...panier].map(([cle, quantite]) => ({
        article_id: idDe(cle),
        quantite,
        choix: choixDe(cle),
      })),
      mode: donnees.get('mode') || 'sur_place',
      table_numero: donnees.get('table_numero'),
      client_nom: donnees.get('client_nom'),
      note: donnees.get('note'),
    });

    // Le jeton est la seule clé de suivi : on le retient pour cet appareil
    // (voir js/commandes.js et l'onglet « Vos commandes en cours »). Le
    // téléphone aussi : c'est lui qui porte les points et la roue.
    retenirCommande(commande);
    const tel = donnees.get('client_tel');
    try {
      if (tel && String(tel).replace(/\D/g, '').length >= 9) {
        localStorage.setItem('paillote.telephone', String(tel));
      }
    } catch {
      /* sans stockage, le suivi n'affichera simplement pas les points */
    }
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
      'rayons?select=slug,nom,position,articles(id,nom,description,prix_cents,position,disponible,variantes)' +
        '&order=position.asc'
    );

    for (const rayon of rayons) {
      rayon.articles = (rayon.articles || [])
        .filter((a) => a.disponible)
        .sort((a, b) => a.position - b.position);
      for (const article of rayon.articles) catalogue.set(article.id, article);
    }
    rayonsCharges = rayons;

    // Un article retiré de la carte depuis la dernière visite ne doit pas
    // rester dans le panier : il serait refusé à l'envoi.
    for (const cle of [...panier.keys()]) {
      if (!catalogue.has(idDe(cle))) panier.delete(cle);
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
    const article = catalogue.get(id);
    const plus = bouton.dataset.action === 'plus';

    if (article && seCompose(article)) {
      if (plus) {
        ouvrirComposition(article);
      } else {
        // On retire la dernière formule ajoutée pour cet article.
        const cles = [...panier.keys()].filter((cle) => idDe(cle) === id);
        if (cles.length) ajuster(cles[cles.length - 1], -1);
      }
      return;
    }
    ajuster(id, plus ? 1 : -1);
  });

  brancherComposition();

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

  // Le téléphone déjà donné une fois se représente tout seul.
  try {
    const tel = localStorage.getItem('paillote.telephone');
    if (tel) document.getElementById('client_tel').value = tel;
  } catch {
    /* rien */
  }
}

demarrer();
