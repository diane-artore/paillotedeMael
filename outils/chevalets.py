#!/usr/bin/env python3
"""Génère les chevalets de table : un QR par table, prêt à imprimer.

Le QR ouvre la carte avec la table déjà connue — le client n'a plus à la
taper, et la cuisine ne reçoit plus de « table 7 » écrit à la place de 1.

    python3 outils/chevalets.py               # tables 1 à 12
    python3 outils/chevalets.py 20            # tables 1 à 20
    python3 outils/chevalets.py 8 --terrasse  # 8 tables, préfixe « T »

Produit :
    site/chevalets.html   la planche à imprimer (A4, deux chevalets par page)

Les QR sont des SVG écrits directement dans la page : pas de fichier à
côté, pas de réseau à l'impression — la planche s'imprime telle quelle,
même depuis une tablette au fond du jardin.

Dépendance : segno (pip install segno).
"""

from __future__ import annotations

import html
import io
import pathlib
import re
import sys

try:
    import segno
except ModuleNotFoundError:
    sys.exit("Il manque segno : pip install segno")

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / "site" / "chevalets.html"
SITE = "https://paillotedemael.vercel.app"

GABARIT = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chevalets de table — La Paillote de Maël</title>
<meta name="robots" content="noindex">
<link rel="icon" href="assets/badge.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
<script src="js/badge.js" defer></script>
<style>
  /* Deux chevalets par feuille A4, à plier en deux dans la hauteur. */
  body {{ background: var(--papier); }}

  .mode-emploi {{
    max-width: 40rem;
    margin: 2rem auto;
    padding-inline: 1.5rem;
  }}

  .chevalet {{
    width: 210mm;
    height: 148.5mm;
    margin: 0 auto;
    padding: 14mm 16mm;
    display: flex;
    align-items: center;
    gap: 12mm;
    background: var(--creme);
    border-bottom: 1px dashed var(--pointille);
    box-sizing: border-box;
  }}

  .chevalet__texte {{ flex: 1; }}

  .chevalet__surtitre {{
    font-size: 10pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--bassin);
  }}

  .chevalet__titre {{
    font-family: var(--serif);
    font-size: 30pt;
    line-height: 1.05;
    margin-block: 2mm 4mm;
  }}

  .chevalet__table {{
    font-family: var(--serif);
    font-size: 54pt;
    line-height: 1;
    color: var(--abricot-texte);
  }}

  .chevalet__mode {{
    font-size: 11pt;
    color: var(--texte);
    margin-top: 4mm;
  }}

  .chevalet__qr {{ width: 62mm; flex: none; }}
  .chevalet__qr svg {{ width: 100%; height: auto; display: block; }}
  .chevalet__badge {{ width: 18mm; margin-bottom: 4mm; }}

  @media print {{
    @page {{ size: A4 portrait; margin: 0; }}
    .mode-emploi {{ display: none; }}
    .chevalet {{ border-bottom: none; }}
    .chevalet:nth-child(2n) {{ page-break-after: always; }}
  }}
</style>
</head>
<body>

<div class="mode-emploi">
  <h1 class="titre-section">Les chevalets de table</h1>
  <p class="section__intro">
    Imprimez cette page en A4, sans marges, avec les graphiques
    d'arrière-plan. Chaque feuille porte deux chevalets : pliez dans la
    largeur, posez sur la table. Le QR ouvre la carte avec le bon numéro
    de table déjà rempli.
  </p>
  <p style="margin-top: 1.5rem;">
    <button type="button" class="bouton" onclick="window.print()">Imprimer</button>
  </p>
</div>

{chevalets}

</body>
</html>
"""

CHEVALET = """<section class="chevalet">
  <div class="chevalet__texte">
    <div class="cadre-badge chevalet__badge">
      <svg class="badge" viewBox="0 0 200 200" aria-hidden="true"><use href="#badge" width="200" height="200"/></svg>
    </div>
    <p class="chevalet__surtitre">Commandez d'ici</p>
    <p class="chevalet__titre">La Paillote<br><span class="italique">de Maël</span></p>
    <p class="chevalet__table">Table {etiquette}</p>
    <p class="chevalet__mode">
      Scannez le QR avec l'appareil photo — la carte s'ouvre, votre table
      est déjà reconnue. On vous apporte tout à table.
    </p>
  </div>
  <div class="chevalet__qr">{qr}</div>
</section>
"""


def qr_svg(url: str) -> str:
    """Le QR en SVG, aux couleurs de la charte, sans fichier à côté.

    segno écrit une taille fixe et pas de viewBox : la SVG ne saurait donc
    pas s'agrandir à la taille du chevalet. On échange l'une contre l'autre.
    """
    tampon = io.BytesIO()   # segno écrit du SVG en octets
    segno.make(url, error="h").save(
        tampon,
        kind="svg",
        scale=1,
        border=2,
        dark="#17565C",
        light=None,          # fond transparent : le crème du chevalet passe
        svgclass=None,
        lineclass=None,
        xmldecl=False,
        svgns=True,
    )
    svg = tampon.getvalue().decode("utf-8")
    return re.sub(
        r'<svg([^>]*?)width="(\d+)" height="(\d+)"',
        lambda m: f'<svg{m.group(1)}viewBox="0 0 {m.group(2)} {m.group(3)}"',
        svg,
        count=1,
    )


def main() -> None:
    arguments = [a for a in sys.argv[1:] if not a.startswith("-")]
    combien = int(arguments[0]) if arguments else 12
    prefixe = "T" if "--terrasse" in sys.argv else ""

    if not 1 <= combien <= 99:
        sys.exit("Un nombre de tables entre 1 et 99, plutôt.")

    chevalets = []
    for numero in range(1, combien + 1):
        etiquette = f"{prefixe}{numero}"
        url = f"{SITE}/carte?table={etiquette}"
        chevalets.append(
            CHEVALET.format(etiquette=html.escape(etiquette), qr=qr_svg(url))
        )

    SORTIE.write_text(
        GABARIT.format(chevalets="\n".join(chevalets)), encoding="utf-8"
    )
    print(
        f"écrit  {SORTIE.relative_to(RACINE)}  "
        f"({combien} chevalet{'s' if combien > 1 else ''}, "
        f"{len(SORTIE.read_text(encoding='utf-8')):,} octets)"
    )
    print(f"       ouvrez {SITE}/chevalets pour imprimer")


if __name__ == "__main__":
    main()
