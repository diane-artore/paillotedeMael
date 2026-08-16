// La carte et le panier.
//
// Le panier ne vit que dans le navigateur (et dans sessionStorage, pour
// survivre à un rechargement au bord du bassin). Il ne contient que des
// identifiants d'articles et des quantités : les prix affichés viennent de la
// base, et le total qui fait foi est recalculé par la fonction `commander`.
// Un panier trafiqué ne change donc rien à l'addition.

import { lire, appeler, euros, SUPABASE_URL, SUPABASE_CLE_PUBLIABLE } from './config.js';
import { retenirCommande } from './commandes.js';

/** Une fonction de la base, en lecture publique. */
async function rpcPublic(fonction, corps = {}) {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CLE_PUBLIABLE,
      Authorization: `Bearer ${SUPABASE_CLE_PUBLIABLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
  });
  if (!reponse.ok) throw new Error(`La base a répondu ${reponse.status}.`);
  return reponse.json();
}

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

/**
 * Dans un rayon couvert par un lot, c'est l'article le plus cher du panier
 * qui est offert — même règle que `commander`, pour que l'écran ne promette
 * rien d'autre que l'addition. Tant que le panier est vide de ce rayon, tout
 * le rayon est candidat.
 */
function eluDuRayon(slug) {
  // Le client a désigné son article : c'est lui, et rien d'autre.
  if (lotSur) {
    const choisi = catalogue.get(lotSur);
    if (choisi && rayonDeLArticle.get(choisi.id) === slug && quantiteArticle(choisi.id) > 0) {
      return choisi;
    }
  }
  // Sinon, le plus cher du rayon présent dans le panier — même règle que
  // `commander` quand aucun choix n'est transmis.
  let elu = null;
  for (const [cle] of panier) {
    const article = catalogue.get(idDe(cle));
    if (!article || rayonDeLArticle.get(article.id) !== slug) continue;
    if (!elu || article.prix_cents > elu.prix_cents) elu = article;
  }
  return elu;
}

/** Les articles du panier sur lesquels le lot de rayon peut s'appliquer. */
function candidatsDuLot() {
  if (!lotDuRayon) return [];
  const vus = new Set();
  const liste = [];
  for (const [cle] of panier) {
    const article = catalogue.get(idDe(cle));
    if (!article || vus.has(article.id)) continue;
    if (rayonDeLArticle.get(article.id) !== lotDuRayon.rayon_slug) continue;
    vus.add(article.id);
    liste.push(article);
  }
  return liste.sort((a, b) => b.prix_cents - a.prix_cents);
}

/** Le choix du lot : une case par article candidat, dans le récapitulatif. */
function dessinerLeChoixDuLot() {
  const bloc = document.getElementById('choix-lot');
  if (!bloc) return;
  const candidats = candidatsDuLot();
  // Un seul candidat : le choix n'a pas lieu d'être posé.
  if (candidats.length < 2) {
    bloc.hidden = true;
    return;
  }
  document.getElementById('choix-lot-titre').textContent =
    `Appliquer « ${lotDuRayon.titre} » sur`;
  const options = document.getElementById('choix-lot-options');
  const elu = eluDuRayon(lotDuRayon.rayon_slug);
  options.textContent = '';
  for (const article of candidats) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'lot-sur';
    radio.value = article.id;
    radio.checked = elu?.id === article.id;
    radio.addEventListener('change', () => {
      lotSur = article.id;
      redessiner();
    });
    label.append(radio, document.createTextNode(` ${article.nom} — ${euros(article.prix_cents)}`));
    options.append(label);
  }
  bloc.hidden = false;
}

/** Cet article est-il offert par un lot gagné ? */
function estOffert(article) {
  if (!article) return false;
  if (article.debloque_par_roue) return articlesGagnes.has(article.id);
  const slug = rayonDeLArticle.get(article.id);
  if (!slug || !rayonsOfferts.has(slug)) return false;
  // Rien de choisi dans ce rayon : personne n'est encore « offert », tout
  // le rayon est candidat (voir estCandidat) et garde son prix affiché.
  const elu = eluDuRayon(slug);
  return !!elu && elu.id === article.id;
}

/** Un article candidat, dans un rayon où rien n'est encore choisi. */
function estCandidat(article) {
  const slug = rayonDeLArticle.get(article?.id);
  return !!slug && rayonsOfferts.has(slug) && !eluDuRayon(slug);
}

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
  [...panier].reduce((s, [cle, q]) => {
    const article = catalogue.get(idDe(cle));
    if (!article) return s;
    const paye = estOffert(article) ? Math.max(0, q - 1) : q;
    // Un lot n'offre qu'une unité : le reste se paie.
    return s + (article.prix_cents || 0) * (article.debloque_par_roue ? 0 : paye);
  }, 0);

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
  peindreLePrix(li, article);
  return li;
}

/** Le prix d'une ligne : offert, candidat au lot, ou payant. */
function peindreLePrix(li, article) {
  const prix = li.querySelector('.plat__prix');
  const offert = estOffert(article);
  const candidat = !offert && estCandidat(article);
  li.classList.toggle('plat--offert', offert || candidat);
  if (offert) prix.textContent = 'Offert 🎁';
  else if (candidat) prix.textContent = `${euros(article.prix_cents)} · offert 🎁`;
  else prix.textContent = euros(article.prix_cents);
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

    // Un lot ne se prend qu'une fois : `commander` refuse le second, mais
    // il vaut mieux éteindre le bouton que refuser l'addition à l'envoi.
    const article = catalogue.get(li.dataset.article);
    if (article) {
      peindreLePrix(li, article);
      if (article.debloque_par_roue && estOffert(article)) {
        compteur.querySelector('.compteur__bouton--plus').disabled = quantite >= 1;
      }
    }
  }

  const n = totalArticles();
  const barre = document.getElementById('barre-panier');
  // Hors service, la carte reste une carte : on la lit, on ne commande pas.
  barre.hidden = n === 0 || !serviceOuvert;
  if (!serviceOuvert) {
    for (const bouton of document.querySelectorAll('.compteur__bouton')) {
      bouton.disabled = true;
    }
  }
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
      if (estOffert(article)) {
        prix.classList.add('recap__prix--offert');
        prix.textContent = 'Offert';
      } else {
        prix.textContent = euros(article.prix_cents * quantite);
      }
      li.append(nom, prix);
      recap.append(li);
    }
    document.getElementById('recap-total').textContent = euros(totalCents());
  }

  dessinerLeChoixDuLot();
  direLeBandeauDuLot();
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

function champDeroulant(libelle, valeurs, descriptions, nom) {
  const bloc = document.createElement('div');
  bloc.className = 'champ';

  // Tous les choix (glace, jus de fruit, recette de pizza, formule, heure
  // de service…) se présentent de la même façon : une liste de boutons
  // radio, le nom en gras et — quand il existe — un descriptif en petit
  // dessous. Un <select> natif ne peut afficher qu'une seule ligne par
  // option, donc ne convenait pas dès qu'on a voulu détailler une
  // recette ; par cohérence, tous les choix de la carte suivent
  // maintenant ce même habillage, avec ou sans descriptif.
  const titre = document.createElement('span');
  titre.className = 'champ__label';
  titre.textContent = libelle;
  bloc.append(titre);

  const groupe = document.createElement('div');
  groupe.className = 'champ-choix';
  // Le nom du groupe radio : fixe (fourni par l'appelant) quand ce champ
  // doit être relu par son `name` — le formulaire de commande — sinon
  // tiré au sort pour ne jamais entrer en collision avec les autres
  // champs de la même formule.
  const nomGroupe = nom || `choix-${Math.random().toString(36).slice(2)}`;
  valeurs.forEach((valeur, i) => {
    const item = document.createElement('label');
    item.className = 'champ-choix__option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = nomGroupe;
    radio.value = valeur;
    radio.checked = i === 0;
    radio.required = true;
    const texte = document.createElement('span');
    const nom2 = document.createElement('strong');
    nom2.textContent = valeur;
    texte.append(nom2);
    if (descriptions?.[valeur]) {
      const desc = document.createElement('small');
      desc.textContent = descriptions[valeur];
      texte.append(document.createElement('br'), desc);
    }
    item.append(radio, texte);
    groupe.append(item);
  });
  bloc.append(groupe);

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
      // Un article à variantes se déplie : « Glace — Vanille », « Glace —
      // Magnum Classic »… Le goût se choisit donc aussi dans une formule.
      const noms = (rayon?.articles || []).flatMap((a) =>
        a.variantes?.valeurs?.length
          ? a.variantes.valeurs.map((v) => `${a.nom} — ${v}`)
          : [a.nom],
      );
      // Un rayon vide ne bloque pas la formule : le champ n'apparaît pas.
      if (noms.length) {
        champs.append(champDeroulant(LIBELLES_RAYON[slug] || rayon.nom, noms));
      }
    }
    document.getElementById('formule-ajouter').textContent = 'Ajouter la formule';
  } else {
    const v = article.variantes;
    champs.append(champDeroulant(v.titre || 'Choix', v.valeurs, v.descriptions));
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
    const morceaux = [...document.querySelectorAll('#formule-champs .champ')].map(
      (bloc) => bloc.querySelector('input[type="radio"]:checked')?.value,
    );
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

// --- Le service et l'heure mystère -------------------------------------------
// Deux bandeaux, deux vérités qui viennent de la base : hors service, la
// carte se consulte mais ne prend plus de commande (et `commander` refuse
// de toute façon) ; pendant l'heure mystère, on l'annonce — c'est tout
// l'intérêt d'une remise surprise.

let serviceOuvert = true;
/** Les articles que la roue a débloqués pour ce téléphone. */
let articlesGagnes = new Set();
/** Les rayons dont un article est offert par un lot (« une boisson offerte »). */
let rayonsOfferts = new Set();
/** Le lot en attente qui vise un rayon, s'il y en a un. */
let lotDuRayon = null;
/** Tous les lots en attente, pour ce que le bandeau doit annoncer. */
let lotsEnAttente = [];
/** L'article sur lequel le client a choisi d'appliquer son lot. */
let lotSur = null;
/** Le rayon d'un article, pour savoir à quel lot il se rattache. */
let rayonDeLArticle = new Map();

function fermerLaCommande(message, longue) {
  serviceOuvert = false;
  const bandeau = document.getElementById('bandeau-ferme');
  bandeau.textContent = message;
  // Une fermeture de saison se lit plus fort qu'un « fermé ce soir ».
  bandeau.classList.toggle('bandeau--saison', !!longue);
  bandeau.hidden = false;
  document.getElementById('barre-panier').hidden = true;
  for (const bouton of document.querySelectorAll('.compteur__bouton')) {
    bouton.disabled = true;
  }
}

function annoncerHeureMystere(hh) {
  const bandeau = document.getElementById('bandeau-heure');
  const fin = new Date(hh.jusqu_a);
  const dire = () => {
    const minutes = Math.max(0, Math.round((fin - Date.now()) / 60000));
    if (minutes === 0) {
      bandeau.hidden = true;
      return false;
    }
    const ou = hh.rayon_nom ? ` sur ${hh.rayon_nom}` : '';
    bandeau.textContent =
      hh.mode === 'aleatoire'
        ? `🎉 C'est l'heure mystère : −${hh.pourcentage} %${ou}, encore ${minutes} min !`
        : `🎉 Happy hour : −${hh.pourcentage} %${ou}, encore ${minutes} min !`;
    bandeau.hidden = false;
    return true;
  };
  if (!dire()) return;
  setInterval(dire, 30000);
}

/**
 * Les lots gagnés à la roue, s'il y en a : le bandeau les rappelle, et les
 * articles qu'ils débloquent entrent dans la carte. C'est `commander` qui
 * tranche vraiment — ici on ne fait que montrer.
 */
async function reclamerSesLots() {
  let tel = null;
  try {
    tel = localStorage.getItem('paillote.telephone');
  } catch {
    return;
  }
  if (!tel) return;
  const solde = await rpcPublic('fidelite_solde', { p_telephone: tel }).catch(() => null);
  const avoirs = solde?.avoirs || [];
  if (!avoirs.length) return;

  articlesGagnes = new Set(avoirs.map((a) => a.article_id).filter(Boolean));
  rayonsOfferts = new Set(avoirs.map((a) => a.rayon_slug).filter(Boolean));
  lotDuRayon = avoirs.find((a) => a.rayon_slug && !a.article_id) || null;

  lotsEnAttente = avoirs;
  direLeBandeauDuLot();
}

/**
 * Le bandeau dit ce qui va réellement se passer. Un lot qui ne trouve rien
 * à offrir dans le panier n'est pas perdu — il reste en attente — mais il
 * ne faut pas promettre une déduction qui n'arrivera pas. C'est le cas
 * d'une formule : son dessert est un texte dans la ligne, pas un article
 * du rayon « desserts ».
 */
function direLeBandeauDuLot() {
  const bandeau = document.getElementById('bandeau-lot');
  if (!bandeau || !lotsEnAttente.length) return;

  const lot = lotsEnAttente[0];
  const suite = lotsEnAttente.length > 1
    ? ` (${lotsEnAttente.length - 1} autre${lotsEnAttente.length > 2 ? 's' : ''} en réserve)`
    : '';

  let applicable;
  let commentFaire = '';
  if (lot.article_id) {
    applicable = quantiteArticle(lot.article_id) > 0;
    commentFaire = ` Ajoutez « ${lot.article_nom} » à votre commande pour en profiter.`;
  } else if (lot.rayon_slug) {
    applicable = candidatsDuLot().length > 0;
    const ou = lot.rayon_nom ? ` du rayon « ${lot.rayon_nom} »` : '';
    commentFaire = ` Ajoutez un article${ou} à la carte pour en profiter — une formule ne compte pas, son contenu est déjà inclus.`;
  } else {
    applicable = panier.size > 0;
    commentFaire = ' Il s’appliquera dès que vous aurez choisi quelque chose.';
  }

  bandeau.textContent = applicable
    ? `🎁 Vous avez gagné : ${lot.titre} — c'est déduit de cette commande${suite}.`
    : `🎁 Vous avez gagné : ${lot.titre}${suite}.${commentFaire}`;
  bandeau.dataset.applicable = applicable ? 'oui' : 'non';
  bandeau.hidden = false;
}

// Les créneaux de « heure souhaitée » : toutes les demi-heures entre
// l'ouverture et la fermeture du service (repli 11 h–22 h si les
// réglages n'ont pas encore répondu). « Dès que possible » est toujours
// le premier choix, coché par défaut — la grande majorité des clients ne
// veulent pas se donner la peine de choisir une heure.
function creneauxService(service) {
  const debut = service?.debut || '11:00';
  const fin = service?.fin || '22:00';
  const [hD, mD] = debut.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  let minutes = hD * 60 + (mD || 0);
  const finMinutes = hF * 60 + (mF || 0);
  const creneaux = [];
  while (minutes < finMinutes && creneaux.length < 60) {
    const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    creneaux.push(`${h}:${m}`);
    minutes += 30;
  }
  return creneaux;
}

function afficherChampHeure(service) {
  const cible = document.getElementById('champ-heure');
  if (!cible) return;
  const bloc = champDeroulant(
    'Vous voulez être servi vers…',
    ['Dès que possible', ...creneauxService(service)],
    null,
    'heure_souhaitee',
  );
  bloc.id = 'champ-heure';
  cible.replaceWith(bloc);
}

async function verifierLeService() {
  try {
    const [service, hh] = await Promise.all([
      rpcPublic('service_etat'),
      rpcPublic('happy_hour_etat'),
    ]);
    if (service && service.ouvert === false) {
      fermerLaCommande(
        service.message || 'La paillote est fermée pour le moment.',
        service.fermeture_longue,
      );
    }
    if (hh?.actif) annoncerHeureMystere(hh);
    afficherChampHeure(service);
  } catch (e) {
    // Pas de réseau pour ces deux-là : on laisse la carte se comporter
    // normalement, `commander` tranchera.
    console.error(e);
    afficherChampHeure(null);
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
      lignes: [...panier].map(([cle, quantite]) => ({
        article_id: idDe(cle),
        quantite,
        choix: choixDe(cle),
      })),
      mode: donnees.get('mode') || 'sur_place',
      table_numero: donnees.get('table_numero'),
      client_nom: donnees.get('client_nom'),
      // Sans lui, la fidélité ne s'accroche à personne : c'est le
      // téléphone qui porte les points, la roue et les avoirs.
      client_tel: donnees.get('client_tel'),
      // L'article désigné pour le lot ; sans lui, le serveur prend le plus cher.
      lot_sur: donnees.get('lot-sur') || null,
      note: donnees.get('note'),
      // « Dès que possible » n'est pas une heure : on l'envoie comme
      // absence de préférence, `commander` la traite pareil qu'un champ
      // laissé vide.
      heure_souhaitee:
        donnees.get('heure_souhaitee') === 'Dès que possible'
          ? null
          : donnees.get('heure_souhaitee'),
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

  await reclamerSesLots();

  try {
    const rayons = await lire(
      'rayons?select=slug,nom,position,articles(id,nom,description,prix_cents,position,disponible,variantes,debloque_par_roue)' +
        '&order=position.asc'
    );

    for (const rayon of rayons) {
      rayon.articles = (rayon.articles || [])
        .filter((a) => a.disponible)
        // Un article qui se gagne à la roue n'apparaît que pour qui l'a
        // gagné : les autres n'ont pas à lire un plat qu'ils ne peuvent
        // pas commander.
        .filter((a) => !a.debloque_par_roue || articlesGagnes.has(a.id))
        .sort((a, b) => a.position - b.position);
      for (const article of rayon.articles) {
        catalogue.set(article.id, article);
        rayonDeLArticle.set(article.id, rayon.slug);
      }
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

  // Le téléphone déjà donné une fois se représente tout seul — et on le
  // dit, pour que le client sache que ses points suivent.
  try {
    const tel = localStorage.getItem('paillote.telephone');
    if (tel) {
      const champ = document.getElementById('client_tel');
      champ.value = tel;
      champ.closest('.champ').querySelector('.champ__aide').textContent =
        'Numéro déjà enregistré sur cet appareil — vos points continuent de s’y ajouter.';
    }
  } catch {
    /* rien */
  }

  // Le QR du chevalet ouvre /carte?table=7 : la table est déjà connue, le
  // client n'a plus qu'à choisir. Elle est retenue pour la session, le
  // temps qu'il fasse le tour de la carte.
  let table = new URLSearchParams(location.search).get('table');
  try {
    if (table) sessionStorage.setItem('paillote.table', table);
    else table = sessionStorage.getItem('paillote.table');
  } catch {
    /* sans stockage, la table vaut pour cette page seulement */
  }
  if (table) {
    const champ = document.getElementById('table_numero');
    champ.value = table.replace(/[^0-9A-Za-z-]/g, '').slice(0, 10);
    formulaire.querySelector('[name="mode"][value="sur_place"]').checked = true;
    champTable.hidden = false;
    champ.closest('.champ').querySelector('.champ__aide').textContent =
      'Reconnue depuis le QR de votre table — corrigez si besoin.';
  }

  verifierLeService();
}

demarrer();
