# lapaillotedemael

LE GIT HUB DE LA PAILLOTTE DE MAËL 🍻!!

---

## Charte de marque

Charte de marque de **La Paillote de Maël**, en 7 pages A4 imprimables.
Implémentation HTML/CSS de la maquette réalisée sur Claude Design.

### Voir le document

Ouvrir `index.html` dans un navigateur — un double-clic suffit, il n'y a
ni serveur, ni build, ni dépendance réseau. Les polices sont embarquées
dans `fonts.css`, le document s'affiche donc à l'identique hors ligne.

### Exporter en PDF

Imprimer depuis le navigateur (`Ctrl/Cmd + P`) → **Enregistrer au format PDF**.

- Papier : **A4**, portrait
- Marges : **aucune**
- Cocher **Graphiques d'arrière-plan** (sinon les aplats de couleur
  disparaissent à l'impression)

Chaque page occupe exactement une feuille de 210 × 297 mm, à fond perdu.

### Contenu des pages

| Page | Section |
|-----:|---------|
| 01 | Couverture |
| 02 | La marque — positionnement, principes, voix & ton |
| 03 | Logo & déclinaisons — version principale, fond bassin, signature horizontale, zone de protection |
| 04 | Palette — couleurs principales, accents, répartition, règles |
| 05 | Typographies — Instrument Serif, Jost, hiérarchie |
| 06 | Motifs & textures — rayures parasol, carreaux, écailles, pépins |
| 07 | Applications — ardoise, Instagram, flyer, synthèse |

### Fichiers

```
index.html            Le document : les 7 pages + le dessin du badge
styles.css            Jetons de la charte, gabarit de page, styles des pages
fonts.css             Polices embarquées (data: URI)
assets/fonts/         Les .woff2 d'origine, pour les autres supports
assets/fonts/OFL.txt  Licences (SIL Open Font License 1.1)
```

### Le badge

Le badge est un `<symbol>` SVG défini **une seule fois** en tête de
`index.html`, puis instancié par `<use>`. Chaque instance ne porte que sa
taille et, le cas échéant, sa variante de couleur :

```html
<div class="cadre-badge cadre-badge--32">
  <svg class="badge" viewBox="0 0 200 200"><use href="#badge" width="200" height="200"/></svg>
</div>
```

- `.badge` — version couleur
- `.badge--mono` — version monochrome, à poser sur un aplat Bleu Bassin

Les couleurs passent par des variables CSS (`--badge-toit`, `--badge-eau`,
`--badge-sable`…, voir la section 4 de `styles.css`) : une nouvelle
déclinaison se crée en redéfinissant ces variables, sans toucher au dessin.

Tailles utilisées dans le document : 50, 32, 26, 24 et 20 mm. La charte
fixe la **taille minimale à 18 mm** en imprimé et **64 px** à l'écran.

### Palette

| Couleur | Hex | Pantone | Emploi |
|---|---|---|---|
| Bleu Bassin | `#17565C` | 3155 C | Couleur d'appui, textes forts |
| Abricot | `#E8894A` | 157 C | Accent chaud, appels à l'action |
| Crème | `#F7F0E4` | 7527 C | Fond dominant, respiration |
| Pastèque | `#C8425A` | — | Accent |
| Eau Claire | `#A8D5D0` | — | Accent |
| Olive | `#7C8F4E` | — | Accent |
| Encre | `#1C2A26` | — | Texte, ardoises |

Répartition visée : 60 % Crème, 22 % Bassin, 10 % Abricot, 8 % accents.

### Modifier le document

Toutes les mesures sont en **millimètres et en points** : ce qui s'affiche
à l'écran est exactement ce qui sort à l'impression. Le rythme vertical de
chaque page est porté par `gap` (variable `--rythme`), jamais par des
marges par défaut.

Une page ne se répand **pas** sur la suivante : ce qui déborde des
210 × 297 mm est coupé. Après modification, vérifier que chaque
`section.page` tient toujours dans sa feuille.

### À compléter

- **Photo Instagram** (page 07) — l'emplacement en pointillés attend le
  visuel définitif. Remplacer le `<figure class="emplacement-photo">` par
  `<img src="…" alt="…" class="emplacement-photo">`.
