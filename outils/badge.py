#!/usr/bin/env python3
"""Génère les déclinaisons du badge à partir de la charte.

Le dessin du badge n'existe qu'à un seul endroit : le <symbol id="badge"> de
`charte/index.html`. Tout le reste en découle, pour qu'une retouche du dessin
ne laisse jamais une déclinaison en arrière.

    python3 outils/badge.py

Produit :
    site/assets/badge.svg        version couleur, fichier autonome
    site/assets/badge-mono.svg   version monochrome (à poser sur Bleu Bassin)
    site/js/badge.js             le <symbol> injecté dans les pages du site

Pourquoi une version JS en plus des SVG : le lettrage circulaire est composé
en Jost, et une SVG chargée par <img> n'a pas accès aux polices de la page —
l'arc retomberait sur une sans-serif générique. Les pages du site injectent
donc le symbole dans le document, où il hérite de la typographie du site. Les
fichiers .svg autonomes restent utiles pour un favicon, un partage, un
autocollant : leur lettrage tombe sur la sans-serif système, ce qui est sans
conséquence à ces usages.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
SOURCE = RACINE / "charte" / "index.html"

# Les couleurs de la charte, dans le même ordre que les variables du dessin.
COULEUR = {
    "anneau": "#17565C",
    "lettrage": "#F7F0E4",
    "etoile": "#C8425A",
    "ciel": "#BFE0E2",
    "eau": "#6FAEB4",
    "sable": "#EBDCBE",
    "toit": "#C99A5E",
    "poteau": "#A87F4E",
    "ombre": "#5E4526",
    "fruit": "#C8425A",
}

MONOCHROME = {
    "anneau": "#F7F0E4",
    "lettrage": "#17565C",
    "etoile": "#17565C",
    "ciel": "#F7F0E4",
    "eau": "#F7F0E4",
    "sable": "#F7F0E4",
    "toit": "#17565C",
    "poteau": "#17565C",
    "ombre": "#F7F0E4",
    "fruit": "#17565C",
}

TITRE = "La Paillote de Maël"
ENTETE = "<!-- Généré par outils/badge.py depuis charte/index.html. " \
         "Ne pas éditer à la main. -->"


def extraire() -> tuple[str, str]:
    """Renvoie (défs, corps du symbole) tels qu'écrits dans la charte."""
    html = SOURCE.read_text(encoding="utf-8")
    symbole = re.search(
        r'<symbol id="badge" viewBox="0 0 200 200">(.*?)</symbol>', html, re.S
    )
    defs = re.search(r"<defs>(.*?)<symbol", html, re.S)
    if not symbole or not defs:
        sys.exit(f"Badge introuvable dans {SOURCE}.")
    return defs.group(1).strip(), symbole.group(1).strip()


def colorer(fragment: str, palette: dict[str, str]) -> str:
    """Remplace les var(--badge-*) par les couleurs demandées."""
    manquantes: list[str] = []

    def substituer(m: re.Match[str]) -> str:
        nom = m.group(1)
        if nom not in palette:
            manquantes.append(nom)
            return m.group(0)
        return palette[nom]

    sortie = re.sub(r"var\(--badge-(\w+)\)", substituer, fragment)
    if manquantes:
        sys.exit(
            "Couleurs absentes des palettes de outils/badge.py : "
            + ", ".join(sorted(set(manquantes)))
        )
    return sortie


def fichier_svg(defs: str, corps: str, palette: dict[str, str]) -> str:
    return (
        f"{ENTETE}\n"
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"'
        f' width="200" height="200" role="img" aria-label="{TITRE}">\n'
        f"  <title>{TITRE}</title>\n"
        f"  <defs>\n    {colorer(defs, palette)}\n  </defs>\n"
        f"{colorer(corps, palette)}\n"
        "</svg>\n"
    )


def fichier_js(defs: str, corps: str) -> str:
    # Les couleurs restent en variables CSS : c'est ce qui permet à une page
    # de basculer une instance en monochrome avec la seule classe .badge--mono.
    sprite = (
        '<svg xmlns="http://www.w3.org/2000/svg" focusable="false">'
        f"<defs>{defs}"
        '<symbol id="badge" viewBox="0 0 200 200">'
        f"{corps}"
        "</symbol></defs></svg>"
    )
    return f"""// {ENTETE.strip('<!- >')}
//
// Injecte le dessin du badge dans la page. Les instances s'écrivent ensuite :
//
//   <svg class="badge"><use href="#badge" width="200" height="200"/></svg>
//   <svg class="badge badge--mono"><use href="#badge" width="200" height="200"/></svg>
//
// Le symbole est inséré dans le document plutôt que chargé via <img> : son
// lettrage circulaire est composé en Jost, et une SVG référencée par <img>
// ne charge pas les polices de la page.

const DESSIN = {json.dumps(sprite, ensure_ascii=False)};

function poser() {{
  if (document.getElementById('badge')) return;
  // Le conteneur est masqué : seules les instances <use> sont visibles.
  // Un <symbol> dans un sous-arbre masqué reste référençable, c'est le
  // fonctionnement normal d'un sprite SVG.
  const hote = document.createElement('div');
  hote.hidden = true;
  hote.setAttribute('aria-hidden', 'true');
  hote.innerHTML = DESSIN;
  document.body.prepend(hote);
}}

if (document.readyState === 'loading') {{
  document.addEventListener('DOMContentLoaded', poser, {{ once: true }});
}} else {{
  poser();
}}
"""


def main() -> None:
    defs, corps = extraire()
    sorties = {
        RACINE / "site/assets/badge.svg": fichier_svg(defs, corps, COULEUR),
        RACINE / "site/assets/badge-mono.svg": fichier_svg(defs, corps, MONOCHROME),
        RACINE / "site/js/badge.js": fichier_js(defs, corps),
    }
    for chemin, contenu in sorties.items():
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_text(contenu, encoding="utf-8")
        print(f"écrit  {chemin.relative_to(RACINE)}  ({len(contenu):,} octets)")


if __name__ == "__main__":
    main()
