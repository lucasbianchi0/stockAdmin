#!/usr/bin/env python3
"""Icono de pestaña de la app (Accedra Backoffice).

El isotipo del kit (`accedra-isotipo-navy.svg`) tiene la A con un trazo de ~5%
del ancho: a 16 px, el tamaño real de un favicon, ese trazo queda en medio pixel
y desaparece. Así que acá no escalamos el SVG del kit: redibujamos la misma
figura —A de trazo con vértice en punta y pies a escuadra, cuña azul— con el
trazo engrosado y sobre una placa navy, que es lo que la hace legible cuando el
navegador la achica.

La A se arma como polígono (no como línea con grosor) y de ahí salen tanto el SVG
como los PNG: una sola geometría, sin diferencias entre el vectorial y el raster.

Genera todo lo que consume Next (app router):
  src/app/icon.svg        · Chrome/Firefox, nítido en cualquier densidad
  src/app/favicon.ico     · 16/32/48/64/128/256, para el resto
  src/app/apple-icon.png  · 180x180, para "agregar a pantalla de inicio" en iOS

Uso: python3 public/brand/generar-favicon.py
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parents[2]
APP = RAIZ / "src" / "app"

NAVY = "#0A1424"   # --navy-900, el mismo fondo del kit y del themeColor
BLANCO = "#FFFFFF"
AZUL = "#2B56D4"   # brand-600, el hex del logo

# Geometría en una caja de 100x100, sobre el eje del centro. Los valores están
# elegidos para que la figura terminada —ya con el grosor del trazo y la punta de
# inglete, que se comen bastante más que la línea de centro— caiga entre 10 y 84
# de alto y entre 12 y 88 de ancho: la A ocupa casi toda la placa, porque en un
# favicon cada pixel de aire es un pixel menos de marca.
APEX_Y = 22.8           # línea de centro del vértice; la punta real queda en 10
PIE_Y = 80.95           # línea de centro de los pies; el borde más bajo, en 84
MEDIO_ANCHO = 32.55     # separación de cada pie respecto del eje
TRAZO = 12.5            # ~2.5x el trazo del isotipo original
CUNA = (22.0, 18.0)     # ancho y alto de la cuña azul
CUNA_TOP = 64.0
RADIO_PLACA = 0.225     # esquinas redondeadas, en proporción del lado


def _a_mayuscula() -> list[tuple[float, float]]:
    """Los 6 vértices de la A, en el mismo orden que el path del kit: apex
    interno, pie derecho (borde interno y externo), apex externo, y los dos del
    pie izquierdo."""
    h = TRAZO / 2
    # Ángulo de cada pata respecto del eje vertical. El vértice en punta se corre
    # sobre el eje h/sin(θ): es la distancia de inglete de dos patas que se cortan.
    theta = math.atan2(MEDIO_ANCHO, PIE_Y - APEX_Y)
    corrimiento = h / math.sin(theta)

    # Normal de la pata derecha, apuntando hacia afuera del eje.
    largo = math.hypot(MEDIO_ANCHO, PIE_Y - APEX_Y)
    nx, ny = (PIE_Y - APEX_Y) / largo, -MEDIO_ANCHO / largo

    pie_der = (50 + MEDIO_ANCHO, PIE_Y)
    return [
        (50.0, APEX_Y + corrimiento),                        # apex interno
        (pie_der[0] - nx * h, pie_der[1] - ny * h),          # pie derecho interno
        (pie_der[0] + nx * h, pie_der[1] + ny * h),          # pie derecho externo
        (50.0, APEX_Y - corrimiento),                        # apex externo (la punta)
        (100 - (pie_der[0] + nx * h), pie_der[1] + ny * h),  # pie izquierdo externo
        (100 - (pie_der[0] - nx * h), pie_der[1] - ny * h),  # pie izquierdo interno
    ]


def _cuna() -> list[tuple[float, float]]:
    ancho, alto = CUNA
    return [
        (50 - ancho / 2, CUNA_TOP),
        (50 + ancho / 2, CUNA_TOP),
        (50.0, CUNA_TOP + alto),
    ]


def dibujar(lado: int, escala: int = 8) -> Image.Image:
    """Dibuja el icono a `lado` px. Rasteriza a `escala`x y reduce: PIL no
    antialiasea polígonos, el suavizado sale del downsample."""
    px = lado * escala
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = px / 100.0  # de las unidades de la caja de 100 a pixeles

    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=RADIO_PLACA * px, fill=NAVY)
    d.polygon([(x * u, y * u) for x, y in _a_mayuscula()], fill=BLANCO)
    d.polygon([(x * u, y * u) for x, y in _cuna()], fill=AZUL)

    return img.resize((lado, lado), Image.LANCZOS)


def svg() -> str:
    def path(puntos):
        cabeza, *resto = puntos
        return f"M {cabeza[0]:.3f} {cabeza[1]:.3f} " + " ".join(
            f"L {x:.3f} {y:.3f}" for x, y in resto
        ) + " Z"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="{RADIO_PLACA * 100:g}" fill="{NAVY}"/>
  <path d="{path(_a_mayuscula())}" fill="{BLANCO}"/>
  <path d="{path(_cuna())}" fill="{AZUL}"/>
</svg>
"""


if __name__ == "__main__":
    (APP / "icon.svg").write_text(svg())

    # El .ico lleva todas las medidas que pide el navegador: 16 en la pestaña, 32
    # en la barra de tareas, 48+ como acceso directo o en pantallas retina.
    medidas = [16, 32, 48, 64, 128, 256]
    capas = [dibujar(m) for m in medidas]
    capas[-1].save(APP / "favicon.ico", format="ICO", sizes=[(m, m) for m in medidas])

    dibujar(180).save(APP / "apple-icon.png")

    print(f"OK · icon.svg, favicon.ico ({'/'.join(map(str, medidas))}), apple-icon.png en {APP}")
