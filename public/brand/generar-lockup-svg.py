# -*- coding: utf-8 -*-
"""Arma el lockup de marca —logotipo + IT SOLUTIONS— como SVG, para el brand kit.

Por que existe este script si ya esta `public/firma/generar-lockup.py`:

Ese hornea un PNG, y para un mail es lo correcto: el cliente de correo no tiene
Inter y el `letter-spacing` de una linea en versalitas se resuelve distinto en
Gmail Android, Outlook Windows y Apple Mail, asi que la bajada terminaba mas
ancha o mas angosta que el wordmark que tiene arriba. Pero un PNG de 280 px no
sirve para una gigantografia, una serigrafia ni un PDF vectorial, que es lo que
pide el brand kit — y el resto de la seccion de logos se baja en SVG.

Aca el texto sale en curvas, no como <text>: un SVG con `font-family:'Inter'`
depende de que la maquina que lo abra tenga Inter instalada, y en Illustrator o
en la imprenta que no la tiene la bajada se dibuja con otra fuente. En curvas se
ve igual en todos lados y ya no depende de nada.

La geometria es la MISMA que la de la firma —las proporciones salen de dividir
por el ancho del logotipo—, asi que el lockup impreso y el del pie de mail son la
misma pieza a distinto tamano.

   python3 generar-lockup-svg.py
"""
import pathlib
import re

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

AQUI = pathlib.Path(__file__).parent
FUENTE = AQUI.parent / "fuentes" / "Inter-SemiBold.ttf"

BAJADA = "IT SOLUTIONS"

# --- geometria ---------------------------------------------------------------
# Los SVG del logotipo miden 1073x160. La firma calcula todo desde su ancho
# (280 px), asi que las mismas proporciones a esta escala son ese factor.
ANCHO = 1073.0
ALTO_LOGO = 160.0
ESCALA = ANCHO / 280.0
FUENTE_PX = (280 // 20) * ESCALA  # 14 px en la firma
INTERLINEA = (14 + 3) * ESCALA
ESPACIADO = FUENTE_PX / 4
AIRE = round(14 * 0.7) * ESCALA
ALTO = ALTO_LOGO + AIRE + INTERLINEA

# Cada variante toma el logotipo que ya existe y le pone la bajada en su color.
# El acento es el azul del sitio (#2B6FD4, el de la paleta) y no el #2B56D4 que
# todavia traen los SVG del logo: la paleta manda, y esa diferencia esta anotada
# como pendiente en `brand-kit.ts`.
VARIANTES = {
    "accedra-lockup-navy.svg": ("accedra-logo-navy.svg", "#2B6FD4"),
    "accedra-lockup-blanco.svg": ("accedra-logo-blanco.svg", "#60A5FA"),
    "accedra-lockup-mono-navy.svg": ("accedra-logo-mono-navy.svg", "#0D1F3A"),
    "accedra-lockup-mono-blanco.svg": ("accedra-logo-mono-blanco.svg", "#FFFFFF"),
}


def texto_en_curvas(texto: str, tamano: float, espaciado: float) -> tuple[str, float]:
    """El texto como un solo `d`, con su baseline en y = 0 y su inicio en x = 0."""
    fuente = TTFont(FUENTE)
    upm = fuente["head"].unitsPerEm
    cmap = fuente.getBestCmap()
    glifos = fuente.getGlyphSet()
    anchos = fuente["hmtx"]
    escala = tamano / upm

    partes: list[str] = []
    x = 0.0
    for caracter in texto:
        nombre = cmap.get(ord(caracter))
        if nombre is None:
            raise SystemExit("La fuente no tiene el caracter %r" % caracter)
        pluma = SVGPathPen(glifos)
        # El eje y del SVG crece hacia abajo y el de la fuente hacia arriba: la
        # transformacion invierte la y y deja la baseline en cero.
        glifos[nombre].draw(TransformPen(pluma, (escala, 0, 0, -escala, x, 0)))
        trazo = pluma.getCommands()
        if trazo:
            partes.append(trazo)
        # El espacio no tiene contorno pero sí avance: sale del hmtx igual.
        x += anchos[nombre][0] * escala + espaciado

    # El espaciado del ultimo caracter no cuenta para el ancho: es aire suelto al
    # final, y contarlo correría el lockup al comparar anchos con el logotipo.
    return " ".join(partes), x - espaciado


def alto_de_mayuscula(tamano: float) -> float:
    fuente = TTFont(FUENTE)
    os2 = fuente["OS/2"]
    cap = getattr(os2, "sCapHeight", None) or fuente["head"].unitsPerEm * 0.72
    return cap * tamano / fuente["head"].unitsPerEm


def cuerpo_del_logo(svg: str) -> str:
    """Lo que hay adentro del <svg> del logotipo, sin su envoltorio."""
    adentro = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    return re.sub(r"</svg>\s*$", "", adentro).strip()


def main() -> None:
    d, ancho_texto = texto_en_curvas(BAJADA, FUENTE_PX, ESPACIADO)
    # La bajada se apoya por su altura de mayuscula, no por su baseline: es lo que
    # hace que el aire entre el logotipo y el texto se vea igual al de la firma.
    baseline = ALTO_LOGO + AIRE + alto_de_mayuscula(FUENTE_PX)

    for salida, (origen, color) in VARIANTES.items():
        logo = (AQUI / origen).read_text()
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.2f %.2f" '
            'width="%d" height="%.0f">\n' % (ANCHO, ALTO, int(ANCHO), round(ALTO))
            + cuerpo_del_logo(logo)
            + '\n<path fill="%s" transform="translate(0 %.2f)" d="%s"/>\n</svg>\n'
            % (color, baseline, d)
        )
        (AQUI / salida).write_text(svg)
        print("%-34s %.0f×%.0f  bajada %.0f de ancho" % (salida, ANCHO, ALTO, ancho_texto))

    print("ratio alto/ancho para LOGOS: %.6f" % (ALTO / ANCHO))


if __name__ == "__main__":
    main()
