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
        p_variantes: ligne.recolterVariantes(),
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

  // Les variantes : « Parfum » et ses valeurs, séparées par des virgules.
  // Vide = pas de choix à faire. Le client verra un menu déroulant.
  const varianteTitre = entreeTexte(article.variantes?.titre || '', '9rem');
  varianteTitre.maxLength = 30;
  varianteTitre.placeholder = 'Parfum';
  const varianteValeurs = entreeTexte((article.variantes?.valeurs || []).join(', '));
  varianteValeurs.placeholder = 'Vanille, Chocolat, Magnum Classic…';

  ligne.recolterVariantes = () => {
    const valeurs = varianteValeurs.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    // La composition d'une formule (variantes.rayons) se règle en base :
    // l'enregistrement depuis l'admin la préserve sans y toucher.
    const rayons = article.variantes?.rayons;
    if (!valeurs.length && !rayons) return null;
    return {
      titre: varianteTitre.value.trim() || 'Choix',
      valeurs,
      rayons,
    };
  };

  const colonnes = document.createElement('div');
  colonnes.className = 'admin-article__colonnes';
  colonnes.append(
    champ('Nom', nom),
    champ('Prix (€)', prix),
    dispoBloc,
    enregistrer,
    supprimer,
  );
  const variantes = document.createElement('div');
  variantes.className = 'admin-article__colonnes';
  const blocValeurs = champ('Choix proposés (facultatif, séparés par des virgules)', varianteValeurs);
  blocValeurs.style.flex = '1';
  variantes.append(champ('Titre du choix', varianteTitre), blocValeurs);
  ligne.append(colonnes, champ('Description (facultative)', description), variantes);
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

// --- Réductions & fidélité ---------------------------------------------------
// Cinq mécaniques, un formulaire chacune. Chaque « Enregistrer » écrit son
// réglage via admin_sauver_reglage (ou admin_sauver_roue), qui borne tout.

let derniersRayons = [];

function entreeNombre(valeur, min, max, largeur = '5.5rem') {
  const e = document.createElement('input');
  e.type = 'number';
  e.min = String(min);
  e.max = String(max);
  e.value = String(valeur);
  e.required = true;
  e.style.maxWidth = largeur;
  return e;
}

function caseActif(coche) {
  const bloc = document.createElement('label');
  bloc.className = 'admin-dispo';
  const e = document.createElement('input');
  e.type = 'checkbox';
  e.checked = !!coche;
  bloc.append(e, document.createTextNode(' Actif'));
  bloc.entree = e;
  return bloc;
}

function selectRayon(slugChoisi) {
  const e = document.createElement('select');
  for (const r of derniersRayons) {
    const option = document.createElement('option');
    option.value = r.slug;
    option.textContent = r.nom;
    if (r.slug === slugChoisi) option.selected = true;
    e.append(option);
  }
  return e;
}

function carteReglage(titre, aide, contenu, enregistrerCb) {
  const forme = document.createElement('form');
  forme.className = 'admin-article';
  const t = document.createElement('p');
  t.style.fontWeight = '600';
  t.textContent = titre;
  const a = document.createElement('p');
  a.className = 'champ__aide';
  a.textContent = aide;
  const rangee = document.createElement('div');
  rangee.className = 'admin-article__colonnes';
  rangee.append(...contenu);
  const bouton = document.createElement('button');
  bouton.type = 'submit';
  bouton.className = 'bouton admin-bouton';
  bouton.textContent = 'Enregistrer';
  rangee.append(bouton);
  forme.append(t, a, rangee);
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await enregistrerCb();
      dire(`« ${titre} » enregistré.`);
    } catch (err) {
      console.error(err);
      dire(err.message);
    }
  });
  return forme;
}

async function chargerReglages() {
  const reglages = await rpc('admin_reglages');
  const hoteReglages = document.getElementById('reglages');
  hoteReglages.textContent = '';
  document.getElementById('bloc-reglages').hidden = false;

  // 1. Remise quantité.
  const rq = reglages.remise_quantite || {};
  const rqActif = caseActif(rq.actif);
  const rqDes = entreeNombre(rq.des ?? 2, 2, 10);
  const rqPct = entreeNombre(rq.pourcentage ?? 20, 1, 100);
  hoteReglages.append(carteReglage(
    'Remise quantité',
    'À partir de n exemplaires du même article, les suivants sont remisés.',
    [rqActif, champ('À partir de', rqDes), champ('Remise (%)', rqPct)],
    () => rpc('admin_sauver_reglage', {
      p_cle: 'remise_quantite',
      p_valeur: { actif: rqActif.entree.checked, des: +rqDes.value, pourcentage: +rqPct.value },
    }),
  ));

  // 2. Happy hour — heure mystère (tirée au sort) ou plage fixe.
  const hh = reglages.happy_hour || {};
  const hhActif = caseActif(hh.actif);
  const hhMode = document.createElement('select');
  for (const [valeur, libelle] of [
    ['aleatoire', 'Heure mystère (1 h sur 6)'],
    ['fixe', 'Plage fixe'],
  ]) {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = libelle;
    if ((hh.mode || 'fixe') === valeur) option.selected = true;
    hhMode.append(option);
  }
  const hhRayon = selectRayon(hh.rayon_slug);
  const hhDebut = document.createElement('input');
  hhDebut.type = 'time';
  hhDebut.value = hh.debut || '15:00';
  hhDebut.required = true;
  const hhFin = document.createElement('input');
  hhFin.type = 'time';
  hhFin.value = hh.fin || '17:00';
  hhFin.required = true;
  const hhPct = entreeNombre(hh.pourcentage ?? 20, 1, 100);
  const blocDebut = champ('De', hhDebut);
  const blocFin = champ('À', hhFin);
  // Les heures ne servent qu'au mode fixe : l'heure mystère se tire seule.
  const majMode = () => {
    const fixe = hhMode.value === 'fixe';
    blocDebut.hidden = !fixe;
    blocFin.hidden = !fixe;
  };
  hhMode.addEventListener('change', majMode);
  majMode();
  hoteReglages.append(carteReglage(
    'Heure mystère / happy hour',
    "En mode mystère, une heure est tirée au sort dans chaque tranche de 6 h d'ouverture : ni vous ni le client ne savez laquelle à l'avance, et la carte l'annonce quand elle tombe.",
    [hhActif, champ('Mode', hhMode), champ('Rayon', hhRayon), blocDebut, blocFin, champ('Remise (%)', hhPct)],
    () => rpc('admin_sauver_reglage', {
      p_cle: 'happy_hour',
      p_valeur: {
        actif: hhActif.entree.checked,
        mode: hhMode.value,
        rayon_slug: hhRayon.value,
        debut: hhDebut.value,
        fin: hhFin.value,
        pourcentage: +hhPct.value,
      },
    }),
  ));

  // 2 bis. Les horaires du service.
  const sv = reglages.service || {};
  const svMode = document.createElement('select');
  for (const [valeur, libelle] of [
    ['auto', 'Suivre les horaires'],
    ['ouvert', 'Ouvert (forcé)'],
    ['ferme', 'Fermé (forcé)'],
  ]) {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = libelle;
    if ((sv.mode || 'auto') === valeur) option.selected = true;
    svMode.append(option);
  }
  const svDebut = document.createElement('input');
  svDebut.type = 'time';
  svDebut.value = sv.debut || '11:00';
  svDebut.required = true;
  const svFin = document.createElement('input');
  svFin.type = 'time';
  svFin.value = sv.fin || '22:00';
  svFin.required = true;
  const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const svJours = document.createElement('div');
  svJours.style.display = 'flex';
  svJours.style.gap = '0.5rem';
  svJours.style.flexWrap = 'wrap';
  const ouverts = new Set(sv.jours || [0, 1, 2, 3, 4, 5, 6]);
  JOURS.forEach((nom, i) => {
    const bloc = document.createElement('label');
    bloc.className = 'admin-dispo';
    const e = document.createElement('input');
    e.type = 'checkbox';
    e.checked = ouverts.has(i);
    e.dataset.jour = i;
    bloc.append(e, document.createTextNode(` ${nom}`));
    svJours.append(bloc);
  });
  const svMessage = entreeTexte(sv.message || '');
  svMessage.placeholder = 'La paillote est fermée pour le moment…';
  const blocMessage = champ('Message affiché quand c’est fermé', svMessage);
  blocMessage.style.flex = '1';
  blocMessage.style.minWidth = '18rem';
  hoteReglages.append(carteReglage(
    'Le service',
    "Hors service, la carte reste consultable mais la commande est fermée — et le serveur refuse toute commande qui arriverait quand même.",
    [champ('Mode', svMode), champ('Ouvre à', svDebut), champ('Ferme à', svFin),
     champ('Jours', svJours), blocMessage],
    () => rpc('admin_sauver_service', {
      p_valeur: {
        mode: svMode.value,
        debut: svDebut.value,
        fin: svFin.value,
        jours: [...svJours.querySelectorAll('input:checked')].map((e) => +e.dataset.jour),
        message: svMessage.value,
      },
    }),
  ));

  // 3. Points de fidélité (et seuil de la roue).
  const fd = reglages.fidelite || {};
  const fdActif = caseActif(fd.actif);
  const fdPoints = entreeNombre(fd.points_par_euro ?? 1, 1, 10);
  const fdSeuil = entreeNombre(fd.seuil ?? 50, 10, 10000);
  hoteReglages.append(carteReglage(
    'Points de fidélité',
    'Des points par euro payé (téléphone requis). Au seuil, un tour de roue.',
    [fdActif, champ('Points par euro', fdPoints), champ('Seuil de la roue', fdSeuil)],
    () => rpc('admin_sauver_reglage', {
      p_cle: 'fidelite',
      p_valeur: {
        actif: fdActif.entree.checked,
        points_par_euro: +fdPoints.value,
        seuil: +fdSeuil.value,
        remise_cents: fd.remise_cents ?? 1000,
      },
    }),
  ));

  // 4. Carte à tampons.
  const tp = reglages.tampons || {};
  const tpActif = caseActif(tp.actif);
  const tpRayon = selectRayon(tp.rayon_slug);
  const tpNieme = entreeNombre(tp.nieme ?? 10, 2, 30);
  hoteReglages.append(carteReglage(
    'Carte à tampons',
    'La n-ième du rayon offerte (la moins chère de la commande), par téléphone.',
    [tpActif, champ('Rayon', tpRayon), champ('La n-ième offerte', tpNieme)],
    () => rpc('admin_sauver_reglage', {
      p_cle: 'tampons',
      p_valeur: { actif: tpActif.entree.checked, rayon_slug: tpRayon.value, nieme: +tpNieme.value },
    }),
  ));

  // 5. La roue et ses lots.
  const roue = reglages.roue || {};
  const roueActif = caseActif(roue.actif);
  const lots = document.createElement('div');
  lots.style.display = 'grid';
  lots.style.gap = '0.5rem';
  lots.style.width = '100%';
  const ligneLot = (lot = {}) => {
    const rangee = document.createElement('div');
    rangee.className = 'admin-article__colonnes';
    const titre = entreeTexte(lot.titre || '');
    titre.placeholder = 'Une boisson offerte';
    titre.required = true;
    const blocTitre = champ('Lot', titre);
    blocTitre.style.flex = '1';
    const montant = entreePrix(lot.remise_cents ?? 400);
    montant.required = true;
    const poids = entreeNombre(lot.poids ?? 1, 1, 100, '4.5rem');
    const retirer = document.createElement('button');
    retirer.type = 'button';
    retirer.className = 'service__bouton';
    retirer.textContent = 'Retirer';
    retirer.addEventListener('click', () => rangee.remove());
    rangee.append(blocTitre, champ('Vaut (€)', montant), champ('Poids', poids), retirer);
    rangee.recolter = () => ({
      titre: titre.value.trim(),
      remise_cents: Math.round(parseFloat(montant.value.replace(',', '.')) * 100),
      poids: +poids.value,
    });
    return rangee;
  };
  for (const lot of roue.lots || []) lots.append(ligneLot(lot));
  const ajouterLot = document.createElement('button');
  ajouterLot.type = 'button';
  ajouterLot.className = 'bouton bouton--creux admin-bouton';
  ajouterLot.textContent = '+ Ajouter un lot';
  ajouterLot.addEventListener('click', () => lots.append(ligneLot()));
  const carteRoue = carteReglage(
    'La roue',
    'Au seuil de points, le client tourne la roue et gagne un des lots (tirage au poids, côté serveur). Le lot se déduit de sa commande suivante.',
    [roueActif],
    () => rpc('admin_sauver_roue', {
      p_valeur: {
        actif: roueActif.entree.checked,
        lots: [...lots.children].map((l) => l.recolter()),
      },
    }),
  );
  carteRoue.insertBefore(lots, carteRoue.lastElementChild);
  carteRoue.insertBefore(ajouterLot, carteRoue.lastElementChild);
  hoteReglages.append(carteRoue);
}

// --- Les avis ----------------------------------------------------------------
// Lecture et retrait. Rien d'autre : on ne réécrit pas la parole d'un client.

async function chargerAvis() {
  const avis = (await rpc('admin_avis')) || [];
  const hoteAvis = document.getElementById('avis-admin');
  document.getElementById('bloc-avis').hidden = false;
  hoteAvis.textContent = '';
  if (!avis.length) {
    const rien = document.createElement('p');
    rien.className = 'champ__aide';
    rien.textContent = 'Aucun avis pour le moment.';
    hoteAvis.append(rien);
    return;
  }
  for (const a of avis) {
    const ligne = document.createElement('div');
    ligne.className = 'admin-article';
    const rangee = document.createElement('div');
    rangee.className = 'admin-article__colonnes';

    const texte = document.createElement('div');
    texte.style.flex = '1';
    texte.style.minWidth = '14rem';
    const etoiles = document.createElement('p');
    etoiles.style.color = 'var(--abricot)';
    etoiles.style.letterSpacing = '0.15em';
    etoiles.textContent = '★★★★★'.slice(0, a.note) + '☆☆☆☆☆'.slice(0, 5 - a.note);
    texte.append(etoiles);
    if (a.commentaire) {
      const mot = document.createElement('p');
      mot.textContent = a.commentaire;
      texte.append(mot);
    }
    const signature = document.createElement('p');
    signature.className = 'champ__aide';
    signature.textContent = `${a.prenom || 'Un client'} — ${new Date(a.quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${
      a.articles?.length ? ` · ${a.articles.join(', ')}` : ''
    }`;
    texte.append(signature);

    const retirer = document.createElement('button');
    retirer.type = 'button';
    retirer.className = 'service__bouton';
    retirer.textContent = 'Retirer';
    retirer.addEventListener('click', async () => {
      if (!confirm('Retirer cet avis ? C’est définitif.')) return;
      try {
        await rpc('admin_supprimer_avis', { p_id: a.id });
        dire('Avis retiré.');
        await chargerAvis();
      } catch (err) {
        console.error(err);
        dire(err.message);
      }
    });

    rangee.append(texte, retirer);
    ligne.append(rangee);
    hoteAvis.append(ligne);
  }
}

// --- Chargement -------------------------------------------------------------

async function charger() {
  try {
    const rayons = (await rpc('admin_carte')) || [];
    derniersRayons = rayons;
    hote.textContent = '';
    for (const rayon of rayons) hote.append(blocRayon(rayon));
    dire(
      rayons.length
        ? `${rayons.length} rayon${rayons.length > 1 ? 's' : ''} — à jour.`
        : 'Aucun rayon : créez le premier ci-dessous.',
    );
    await chargerReglages();
    await chargerAvis();
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
