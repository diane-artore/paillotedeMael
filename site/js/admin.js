// L'administration de la carte : rayons et articles.
//
// Même porte que la cuisine : un code d'équipe, vérifié par la base à
// chaque geste (voir pin.js). Les fonctions admin_* couvrent tout l'écran —
// lire la carte complète (ruptures comprises), enregistrer un article,
// le supprimer, créer ou retoucher un rayon.

import { creerRpc } from './pin.js';

const rpc = creerRpc('La carte — admin');
const etat = document.getElementById('admin-etat');
const hote = document.getElementById('rayons');

function dire(texte) {
  etat.textContent = texte;
}

// --- Petites briques de formulaire -----------------------------------------

function champ(libelle, entree) {
  const bloc = document.createElement('label');
  bloc.className = 'admin-champ';
  const nom = document.createElement('span');
  nom.className = 'champ__label';
  nom.textContent = libelle;
  bloc.append(nom, entree);
  return bloc;
}

function entreeTexte(valeur, largeur) {
  const e = document.createElement('input');
  e.type = 'text';
  e.value = valeur || '';
  if (largeur) e.style.maxWidth = largeur;
  return e;
}

function entreePrix(cents) {
  const e = document.createElement('input');
  e.type = 'number';
  e.min = '0';
  e.step = '0.01';
  e.inputMode = 'decimal';
  e.value = cents == null ? '' : (cents / 100).toFixed(2);
  e.style.maxWidth = '7rem';
  return e;
}

// --- Une ligne d'article ----------------------------------------------------

function ligneArticle(article, rayonId) {
  const ligne = document.createElement('form');
  ligne.className = 'admin-article';
  if (article.disponible === false) ligne.dataset.rupture = '';

  const nom = entreeTexte(article.nom);
  nom.required = true;
  nom.maxLength = 80;
  const description = entreeTexte(article.description);
  description.maxLength = 200;
  const prix = entreePrix(article.prix_cents);
  prix.required = true;

  const dispo = document.createElement('input');
  dispo.type = 'checkbox';
  dispo.checked = article.disponible !== false;
  const dispoBloc = document.createElement('label');
  dispoBloc.className = 'admin-dispo';
  dispoBloc.append(dispo, document.createTextNode(' En vente'));

  const enregistrer = document.createElement('button');
  enregistrer.type = 'submit';
  enregistrer.className = 'bouton admin-bouton';
  enregistrer.textContent = article.id ? 'Enregistrer' : 'Créer';

  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'service__bouton';
  supprimer.textContent = 'Supprimer';

  ligne.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prixCents = Math.round(parseFloat(prix.value.replace(',', '.')) * 100);
    if (!Number.isFinite(prixCents)) {
      dire('Le prix est illisible.');
      return;
    }
    enregistrer.disabled = true;
    try {
      await rpc('admin_sauver_article', {
        p_id: article.id || null,
        p_rayon_id: rayonId,
        p_nom: nom.value,
        p_description: description.value,
        p_prix_cents: prixCents,
        p_disponible: dispo.checked,
        p_position: article.position ?? 0,
      });
      dire(`« ${nom.value.trim()} » enregistré.`);
      await charger();
    } catch (err) {
      console.error(err);
      dire(err.message);
      enregistrer.disabled = false;
    }
  });

  supprimer.addEventListener('click', async () => {
    if (!article.id) {
      ligne.remove();
      return;
    }
    if (!confirm(`Supprimer « ${article.nom} » ?`)) return;
    try {
      await rpc('admin_supprimer_article', { p_id: article.id });
      dire(`« ${article.nom} » supprimé (ou retiré de la vente s'il figure dans d'anciennes commandes).`);
      await charger();
    } catch (err) {
      console.error(err);
      dire(err.message);
    }
  });

  const colonnes = document.createElement('div');
  colonnes.className = 'admin-article__colonnes';
  colonnes.append(
    champ('Nom', nom),
    champ('Prix (€)', prix),
    dispoBloc,
    enregistrer,
    supprimer,
  );
  ligne.append(colonnes, champ('Description (facultative)', description));
  return ligne;
}

// --- Un rayon ---------------------------------------------------------------

function blocRayon(rayon) {
  const bloc = document.createElement('section');
  bloc.className = 'admin-rayon';

  const entete = document.createElement('form');
  entete.className = 'admin-rayon__entete';
  const nom = entreeTexte(rayon.nom, '18rem');
  nom.required = true;
  nom.maxLength = 60;
  nom.className = 'admin-rayon__nom';
  const renommer = document.createElement('button');
  renommer.type = 'submit';
  renommer.className = 'service__bouton';
  renommer.textContent = 'Renommer';
  entete.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await rpc('admin_sauver_rayon', {
        p_id: rayon.id,
        p_nom: nom.value,
        p_position: rayon.position ?? 0,
      });
      dire(`Rayon renommé « ${nom.value.trim()} ».`);
      await charger();
    } catch (err) {
      console.error(err);
      dire(err.message);
    }
  });
  entete.append(nom, renommer);
  bloc.append(entete);

  for (const article of rayon.articles || []) {
    bloc.append(ligneArticle(article, rayon.id));
  }

  const ajouter = document.createElement('button');
  ajouter.type = 'button';
  ajouter.className = 'bouton bouton--creux admin-bouton';
  ajouter.textContent = '+ Ajouter un article';
  ajouter.addEventListener('click', () => {
    const prochainePosition =
      Math.max(0, ...(rayon.articles || []).map((a) => a.position ?? 0)) + 1;
    bloc.insertBefore(
      ligneArticle({ position: prochainePosition, disponible: true }, rayon.id),
      ajouter,
    );
  });
  bloc.append(ajouter);

  return bloc;
}

// --- Chargement -------------------------------------------------------------

async function charger() {
  try {
    const rayons = (await rpc('admin_carte')) || [];
    hote.textContent = '';
    for (const rayon of rayons) hote.append(blocRayon(rayon));
    dire(
      rayons.length
        ? `${rayons.length} rayon${rayons.length > 1 ? 's' : ''} — à jour.`
        : 'Aucun rayon : créez le premier ci-dessous.',
    );
  } catch (err) {
    console.error(err);
    dire('La base ne répond pas. Rechargez la page.');
  }
}

document.getElementById('formulaire-rayon').addEventListener('submit', async (e) => {
  e.preventDefault();
  const entree = document.getElementById('rayon-nom');
  try {
    await rpc('admin_sauver_rayon', {
      p_id: null,
      p_nom: entree.value,
      p_position: 99,
    });
    dire(`Rayon « ${entree.value.trim()} » créé.`);
    entree.value = '';
    await charger();
  } catch (err) {
    console.error(err);
    dire(err.message);
  }
});

charger();
