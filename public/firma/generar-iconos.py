# -*- coding: utf-8 -*-
"""Iconos de la fila de enlaces del pie de firma.

No se dibujan aca: se reciclan del sitio. Los glifos de LinkedIn e Instagram son
los mismos que estan en components/Footer.tsx y el globo es el de
components/LangSwitcher.tsx, asi que la firma y el pie del sitio muestran
exactamente la misma marca. Dibujarlos a mano con elipses y un 'in' en Helvetica
se notaba: quedaban parecidos a los de verdad, que es lo peor que puede pasarle a
un logo ajeno.

Tambien se recicla el tratamiento del footer —el glifo adentro de una ficha
redondeada—, que es lo que empareja un cuadrado macizo como el de LinkedIn con
una camara de contorno como la de Instagram. Ahi la ficha es clara sobre fondo
oscuro; aca va al reves, gris muy suave sobre el blanco del bloque de marca.

Se arman en SVG, se rasterizan con Chrome a 4x y se bajan a 48px: se ven a 24 y
tienen que aguantar retina. Salen a public/logos/ del repo de accedra porque
viajan por URL en el mail, que descarta las imagenes incrustadas.
   python3 generar-iconos.py
"""
import pathlib
import subprocess
import tempfile
from PIL import Image

SALIDA = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

LADO = 24          # lado de la ficha, en px de pantalla
FINAL = LADO * 2   # @2x
DIBUJO = LADO * 8  # se rasteriza a 8x y se baja: los bordes redondeados lo agradecen

FICHA = '#EFF2F7'  # el gris mas claro de la paleta, apenas despegado del blanco
TINTA = '#64738C'  # el gris de los datos secundarios de la firma

# LinkedIn e Instagram: components/Footer.tsx del sitio. Del de LinkedIn se saca
# el ultimo subtrazo, que es el cuadrado contenedor: la ficha ya es el contenedor,
# y un cuadrado adentro de otro se ve como un error de recorte.
LINKEDIN = ('M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05'
            'c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13z'
            'M7.12 20.45H3.55V9h3.57v11.45z')
INSTAGRAM = ('M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23'
             '.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9'
             '-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9'
             '3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23'
             '.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07zM12 0'
             'C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.9 5.9 0 0 0-2.12 1.38A5.9 5.9 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05'
             '.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.12.66.66 1.33 1.07 2.12 1.38'
             '.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.31 1.46-.72 2.12-1.38'
             '.66-.66 1.07-1.33 1.38-2.12.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91'
             'a5.9 5.9 0 0 0-1.38-2.12A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84'
             'a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.85'
             'a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z')
# El globo del selector de idioma es de trazo. Adentro de la ficha se usa macizo
# —el mismo circulo, con los meridianos calados— para que pese como el cuadrado
# de LinkedIn y la fila no quede coja.
GLOBO_MERIDIANOS = 'M2.5 12h19M12 2.5c2.6 2.5 4 6 4 9.5s-1.4 7-4 9.5c-2.6-2.5-4-6-4-9.5s1.4-7 4-9.5z'

# Cada marca ocupa distinto de su grilla de 24 —la camara la llena, las letras de
# LinkedIn no—, asi que el tamano se ajusta uno por uno hasta que las tres pesan
# igual. Es lo que hace la diferencia entre tres iconos y tres iconos alineados.
GLIFO = {'web': 14.5, 'linkedin': 16.5, 'instagram': 12.2}

GLIFOS = {
    'web': ('<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
            '<circle cx="12" cy="12" r="9.5" fill="#fff"/>'
            '<path d="%s" fill="none" stroke="#000" stroke-width="1.7"/></mask>'
            '<circle cx="12" cy="12" r="9.5" fill="%%s" mask="url(#m)"/>' % GLOBO_MERIDIANOS),
    'linkedin': '<path d="%s" fill="%%s"/>' % LINKEDIN,
    'instagram': '<path d="%s" fill="%%s"/>' % INSTAGRAM,
}


def svg(glifo, lado_glifo):
    """La ficha con el glifo centrado, en la grilla de 24 que usan los tres."""
    escala = lado_glifo / LADO
    borde = (LADO - lado_glifo) / 2
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
        '<rect width="%d" height="%d" rx="6.5" fill="%s"/>'
        '<g transform="translate(%s %s) scale(%s)">%s</g></svg>'
        % (DIBUJO, DIBUJO, LADO, LADO, LADO, LADO, FICHA, borde, borde, escala, glifo % TINTA)
    )


def rasterizar(marcado, destino):
    """Chrome es el unico rasterizador de SVG que hay a mano, y respeta el alfa."""
    with tempfile.TemporaryDirectory() as tmp:
        pagina = pathlib.Path(tmp) / 'icono.html'
        pagina.write_text('<body style="margin:0">%s</body>' % marcado)
        tiro = pathlib.Path(tmp) / 'icono.png'
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--default-background-color=00000000',
                        '--force-device-scale-factor=1', '--window-size=%d,%d' % (DIBUJO, DIBUJO),
                        '--screenshot=%s' % tiro, pagina.as_uri()],
                       check=True, capture_output=True)
        Image.open(tiro).convert('RGBA').resize((FINAL, FINAL), Image.LANCZOS).save(destino)


for nombre, glifo in GLIFOS.items():
    archivo = 'firma-icono-%s-gris.png' % nombre
    rasterizar(svg(glifo, GLIFO[nombre]), SALIDA / archivo)
    print(archivo)
