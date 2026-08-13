# La Paillote de Maël — à lire avant de toucher au code

Un site de commande pour une paillote au bord d'un bassin, à Solliès-Toucas.
Les clients commandent depuis leur table, la cuisine voit les tickets
arriver, le règlement se fait au comptoir en espèces.

**Pousser sur `main` met le site en production** (Vercel suit
`diane-artore/paillotedeMael`). Il n'y a pas d'étape de recette : ce qui
part sur `main` est servi aux clients dans la minute. En cas de doute,
travailler sur une branche et laisser Diane décider.

---

## Les règles qui ne se discutent pas

**1. Le navigateur ne décide de rien.**
Prix, remises, fidélité, total : tout est recalculé par la fonction
`commander` (Edge Function, clé `service_role`). Le panier n'envoie que des
couples `(article_id, quantité)`. Ne jamais faire confiance à un montant
venu du client — un panier trafiqué ne doit rien changer à l'addition.

**2. Les tables sont fermées, on passe par des fonctions.**
Le RLS interdit tout accès direct aux tables sensibles (`commandes`,
`lignes_commande`, `fidelite`, `avis`, `reglages`…). Chaque geste possible
est une fonction `SECURITY DEFINER` qui expose exactement ce qu'il faut :
`cuisine_*`, `admin_*`, `avis_*`, `suivi_commande`, `service_etat`…
Pour un nouveau besoin : **ajouter une fonction**, jamais ouvrir une table.

**3. Le code d'équipe est vérifié par la base, pas par le JavaScript.**
`verifier_pin()` garde les écrans cuisine et admin. Un PIN comparé dans le
navigateur ne protégerait rien : le code source est public.

**4. Le jour de service commence à 1 h du matin. Ne pas y toucher.**
`debut_du_service()` fait repartir l'écran de cuisine à 1 h. C'est
volontaire : caler la bascule sur l'heure de fermeture (22 h) fait
disparaître de l'écran, à 22 h pile, les commandes encore à préparer ou à
servir. Cette erreur a déjà été commise et annulée — ne pas la refaire.

**5. On ne perd pas la parole d'un client.**
Un avis survit à la suppression de sa commande (il photographie les
articles au dépôt, et `avis.commande_id` passe à `NULL`). Aucun ménage
automatique sur les avis : seule la modération manuelle, dans l'admin,
peut en retirer un.

**6. Pas de dépendance, pas d'étape de compilation.**
HTML, CSS et JavaScript à la main, chargés tels quels. Pas de framework,
pas de CDN, pas de `npm run build`. Les polices sont embarquées ; le site
doit fonctionner avec un wifi capricieux au bord d'un bassin.

**7. Tout est en français** — l'interface, les noms de variables, les
commentaires, les messages de commit. Les commentaires expliquent *pourquoi*,
pas *quoi*.

---

## Les fichiers générés — ne pas éditer à la main

| Fichier | Généré par |
|---|---|
| `site/js/badge.js`, `site/assets/badge*.svg` | `python3 outils/badge.py` (source : le `<symbol>` de `charte/index.html`) |
| `site/chevalets.html` | `python3 outils/chevalets.py 12` |

Pour changer le badge : modifier `charte/index.html`, puis relancer l'outil.

---

## La carte du site

```
site/index.html      l'accueil (horaires, adresse, paiement)
site/carte.html      la carte + le panier + l'envoi de commande
site/suivi.html      le suivi d'une commande, la facture, l'avis, la roue
site/avis.html       les avis publics
site/cuisine.html    l'écran de service (PIN)
site/admin.html      la carte, les réductions, les avis (PIN)
site/chevalets.html  les QR de table à imprimer (généré)
charte/index.html    la charte de marque, 7 pages A4
outils/              les générateurs (badge, chevalets)
vercel.json          les routes /carte, /cuisine, /avis…
```

Le client n'est jamais identifié : son **jeton** de commande (dans l'URL de
suivi) lui donne accès à sa commande et à rien d'autre, pendant 24 h. Son
**téléphone**, facultatif, porte les points de fidélité.

---

## Essayer avant de pousser

Il n'y a pas de suite de tests. En revanche, tout se vérifie à la main en
deux minutes, et **c'est attendu** avant de pousser quoi que ce soit de
visible :

```bash
cd site && python3 -m http.server 8099
```

Pour un vrai passage en revue, piloter Chromium (déjà installé) :

```bash
npm install playwright-core     # dans un dossier de travail, pas le dépôt
# executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
```

Intercepter les appels Supabase (`page.route('**/rest/v1/rpc/…')`) permet de
jouer les cas rares — service fermé, heure mystère, commande prête — sans
écrire dans la vraie base.

**Ne jamais tester en créant des commandes dans la base de production** sans
les effacer ensuite : elles apparaissent sur l'écran de la cuisine.

---

## La base

Migrations via Supabase (`apply_migration`), une par intention, nommée en
`snake_case`. Réglages métier (horaires, remises, fidélité, roue) dans la
table `reglages`, modifiables depuis l'admin — **pas en dur dans le code**.

Deux mécaniques valent la peine d'être comprises avant d'y toucher :

- **L'heure mystère** (`happy_hour_etat`) tire une heure au sort par tranche
  de 6 h d'ouverture. Le tirage est déterministe (semé par la date et la
  tranche) : il ne bouge pas si le client recharge, et personne ne peut le
  provoquer. La carte l'annonce et `commander` la remise **à partir de la
  même fonction** — l'addition ne peut pas contredire l'affiche.
- **La roue** (`roue_tourner`) tire le lot **côté base**, retire les points,
  et range un avoir. La roue à l'écran ne fait qu'atterrir sur le résultat.

---

## En cas de doute

Demander plutôt que deviner. Ce site tourne pour une vraie paillote : une
commande perdue, c'est un client qui attend au bord du bassin.
