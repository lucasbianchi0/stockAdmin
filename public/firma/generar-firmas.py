# -*- coding: utf-8 -*-
"""Genera las variantes de firma de Accedra y el indice para verlas en localhost.
   Editar los datos o los bloques de aca y correr:  python3 generar-firmas.py"""
import base64, pathlib
from PIL import Image
from tira_partners import PARTNERS, ESCALA as ESCALA_PARTNERS, escribir as escribir_tira

AQUI = pathlib.Path(__file__).parent
LOGO_PNG = pathlib.Path('/Users/lucasbianchi/Desktop/projects/accedra/public/logos/accedra-firma-email.png')
CDN = 'https://www.accedra.com.ar/logos/'

def icono_url(nombre, tono):
    return CDN + 'firma-icono-%s-%s.png' % (nombre, tono)

# --- datos -------------------------------------------------------------
NOMBRE   = 'Carlos Bianchi'
CARGO    = 'Director Comercial'
MAIL     = 'carlosbianchi@accedra.com.ar'
TEL      = '+54 9 11 6620-2809'
TEL_HREF = '+5491166202809'
TEL_FIJO = '+54 11 5272-8753'
TEL_FIJO_HREF = '+541152728753'
DIR      = 'Irala 1950, 2° piso · C1276 CABA · Buenos Aires, Argentina'
WEB      = 'https://www.accedra.com.ar'
LINKEDIN = 'https://www.linkedin.com/company/accedra-s.a.'

# --- paleta ------------------------------------------------------------
NAVY, TEXTO, SUAVE, AZUL, AZUL_BG = '#0D1F3A', '#3A4A63', '#6B7A91', '#2B56D4', '#EEF2FD'
AIRE_PARTNERS = 34   # aire entre la fila de logo+botones y la tira de marcas
F = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"


def wordmark(w=140):
    h = round(w * 0.15)   # el SVG es 1068x160
    return ('<img src="__LOGO__" alt="ACCEDRA" width="%d" height="%d" '
            'style="display:block;width:%dpx;height:%dpx;border:0;outline:none;">' % (w, h, w, h))

def boton(href, texto, relleno, color, icono=None, tono=None):
    cuerpo = '<a href="%s" style="color:%s;text-decoration:none;">%s</a>' % (href, color, texto)
    if icono:
        tono = tono or ('blanco' if color == '#ffffff' else 'azul')
        cuerpo = ('<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>'
                  '<td valign="middle" style="padding:0 7px 0 0;"><a href="%s">'
                  '<img src="%s" alt="" width="14" height="14" style="display:block;width:14px;height:14px;border:0;"></a></td>'
                  '<td valign="middle" style="padding:0;%sfont-size:11.5px;line-height:14px;font-weight:600;">%s</td>'
                  '</tr></table>' % (href, icono_url(icono, tono), F, cuerpo))
    return ('<td style="padding:0 6px 0 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" '
            'style="border-collapse:collapse;"><tr><td style="border-radius:999px;padding:8px 16px;%s'
            'font-size:11.5px;line-height:14px;font-weight:600;background-color:%s;">%s</td></tr></table></td>'
            % (F, relleno, cuerpo))

def enlaces(iconos=False):
    ic = (lambda n: n if iconos else None)
    return ('<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>'
            + boton(WEB, 'Sitio web', AZUL, '#ffffff', ic('web'))
            + boton(LINKEDIN, 'LinkedIn', AZUL_BG, AZUL, ic('linkedin'), tono='marca')
            + '</tr></table>')

def identidad(dir_incluida=True):
    f = ['<tr><td style="padding:0;%sfont-size:15px;line-height:20px;font-weight:700;color:%s;">%s</td></tr>' % (F, NAVY, NOMBRE),
         '<tr><td style="padding:3px 0 0 0;%sfont-size:11px;line-height:15px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:%s;">%s</td></tr>' % (F, SUAVE, CARGO),
         '<tr><td style="padding:11px 0 0 0;%sfont-size:13px;line-height:19px;color:%s;">'
         '<a href="mailto:%s" style="color:%s;text-decoration:none;">%s</a></td></tr>' % (F, TEXTO, MAIL, AZUL, MAIL),
         '<tr><td style="padding:1px 0 0 0;%sfont-size:13px;line-height:19px;color:%s;">'
         '<a href="tel:%s" style="color:%s;text-decoration:none;">%s</a></td></tr>' % (F, TEXTO, TEL_HREF, TEXTO, TEL)]
    if dir_incluida:
        f.append('<tr><td style="padding:6px 0 0 0;%sfont-size:12px;line-height:17px;color:%s;">%s</td></tr>' % (F, SUAVE, DIR))
    return '\n '.join(f)

def grilla_partners(items, por_fila=6, ancho=558, gap=16, alto_fila=None):
    """Una sola imagen en vez de doce.

    Cada logo suelto es un pedido HTTP que Gmail ademas proxea la primera vez: doce logos
    son doce viajes, y por eso la firma aparecia de a pedazos. Compuestos en una tira, es uno.

    La tira completa la arma tira_partners.py, que es la que sirve el brand kit: aca
    se delega para que correr este script no la vuelva a la grilla de columnas fijas.
    """
    if len(items) == len(PARTNERS):
        ancho, alto = escribir_tira()
        return ('<img src="%saccedra-firma-partners-%d.png" alt="Partners de Accedra" width="%d" height="%d" '
                'style="display:block;width:%dpx;height:%dpx;border:0;">'
                % (CDN, len(items), ancho, alto, ancho, alto))
    e = ESCALA_PARTNERS
    items = [(a, alt, max(1, round(w * e)), max(1, round(h * e))) for a, alt, w, h in items]
    alto_fila = alto_fila or max(h for _, _, _, h in items)
    filas = (len(items) + por_fila - 1) // por_fila
    col = ancho // por_fila
    alto = filas * alto_fila + (filas - 1) * gap
    lienzo = Image.new('RGBA', (ancho * 2, alto * 2), (0, 0, 0, 0))
    for i, (archivo, alt, w, h) in enumerate(items):
        origen = Image.open(LOGO_PNG.parent / archivo).convert('RGBA')
        escalado = origen.resize((w * 2, h * 2), Image.LANCZOS)
        x = (i % por_fila) * col
        y = (i // por_fila) * (alto_fila + gap) + (alto_fila - h) // 2
        lienzo.paste(escalado, (x * 2, y * 2), escalado)
    nombre = 'accedra-firma-partners-%d.png' % len(items)
    # PNG8 con alfa: son logos planos, no fotos. Baja el peso a un tercio sin diferencia visible.
    lienzo.quantize(colors=200, method=Image.FASTOCTREE).save(LOGO_PNG.parent / nombre, optimize=True)
    return ('<img src="%s%s" alt="Partners de Accedra" width="%d" height="%d" '
            'style="display:block;width:%dpx;height:%dpx;border:0;">'
            % (CDN, nombre, ancho, alto, ancho, alto))

def envolver(interno, ancho=600, pad='18px 20px'):
    """Bloque blanco propio: el piso que mantiene los logos legibles en clientes oscuros."""
    return ('<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="%d" '
            'style="border-collapse:collapse;width:%dpx;background-color:#ffffff;">'
            '<tr><td style="padding:%s;background-color:#ffffff;">%s</td></tr></table>'
            % (ancho, ancho, pad, interno))

TABLA = '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;%s">' % F

# --- variantes ---------------------------------------------------------
def v_esencial():
    return TABLA + identidad() + '''
 <tr><td style="padding:14px 0 0 0;">%s</td></tr>
</table>''' % envolver(wordmark(120), 600, '14px 20px 14px 0')

def v_enlaces():
    return TABLA + identidad() + '''
 <tr><td style="padding:14px 0 0 0;">%s</td></tr>
 <tr><td style="padding:14px 0 0 0;">%s</td></tr>
</table>''' % (enlaces(), envolver(wordmark(120), 600, '14px 20px 14px 0'))

def v_completa(iconos=False):
    cabecera = ('<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="558" '
                'style="border-collapse:collapse;width:558px;"><tr>'
                '<td valign="middle" style="padding:0;">%s</td>'
                '<td valign="middle" align="right" style="padding:0;">%s</td>'
                '</tr></table>' % (wordmark(140), enlaces(iconos)))
    bloque = cabecera + '<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>' \
             '<td height="%d" style="height:%dpx;line-height:%dpx;font-size:0;">&nbsp;</td></tr></table>' % (AIRE_PARTNERS, AIRE_PARTNERS, AIRE_PARTNERS) + '' \
             + grilla_partners(PARTNERS)
    return TABLA + identidad() + '''
 <tr><td style="padding:16px 0 0 0;">%s</td></tr>
</table>''' % envolver(bloque)

def v_horizontal():
    izq = ('<td valign="top" width="160" style="width:160px;padding:0 24px 0 0;">%s</td>' % wordmark(140))
    der = ('<td valign="top" style="padding:0;">'
           '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;%s">'
           '%s<tr><td style="padding:13px 0 0 0;">%s</td></tr></table></td>' % (F, identidad(), enlaces()))
    fila = ('<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="600" '
            'style="border-collapse:collapse;width:600px;"><tr>%s%s</tr></table>' % (izq, der))
    interno = (fila.replace('width="600" style="border-collapse:collapse;width:600px;"',
                            'width="560" style="border-collapse:collapse;width:560px;")')
               .replace('width="560" style="border-collapse:collapse;width:560px;")',
                        'width="560" style="border-collapse:collapse;width:560px;"')
               + '<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>'
                 '<td height="%d" style="height:%dpx;line-height:%dpx;font-size:0;">&nbsp;</td></tr></table>' % (AIRE_PARTNERS, AIRE_PARTNERS, AIRE_PARTNERS) + ''
               + grilla_partners(PARTNERS[:6], ancho=560))
    return TABLA + '<tr><td style="padding:0;">' + envolver(interno, 600) + '</td></tr></table>' 

def v_clasica():
    """La organizacion de la firma vieja: logo grande a la izquierda, regla, datos a la derecha."""
    datos = '\n '.join([
        '<tr><td style="padding:0;%sfont-size:15px;line-height:20px;font-weight:700;color:%s;">%s</td></tr>' % (F, NAVY, NOMBRE),
        '<tr><td style="padding:3px 0 0 0;%sfont-size:11px;line-height:15px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:%s;">%s</td></tr>' % (F, SUAVE, CARGO),
        '<tr><td style="padding:11px 0 0 0;%sfont-size:13px;line-height:19px;color:%s;"><a href="mailto:%s" style="color:%s;text-decoration:none;">%s</a></td></tr>' % (F, TEXTO, MAIL, AZUL, MAIL),
        '<tr><td style="padding:1px 0 0 0;%sfont-size:13px;line-height:19px;color:%s;"><span style="color:%s;">Cel.</span> <a href="tel:%s" style="color:%s;text-decoration:none;">%s</a></td></tr>' % (F, TEXTO, SUAVE, TEL_HREF, TEXTO, TEL),
        '<tr><td style="padding:1px 0 0 0;%sfont-size:13px;line-height:19px;color:%s;"><span style="color:%s;">Tel.</span> <a href="tel:%s" style="color:%s;text-decoration:none;">%s</a></td></tr>' % (F, TEXTO, SUAVE, TEL_FIJO_HREF, TEXTO, TEL_FIJO),
        '<tr><td style="padding:8px 0 0 0;%sfont-size:12px;line-height:17px;color:%s;">Irala 1950, 2° piso · C1276 CABA</td></tr>' % (F, SUAVE),
        '<tr><td style="padding:1px 0 0 0;%sfont-size:12px;line-height:17px;color:%s;">Buenos Aires — Argentina</td></tr>' % (F, SUAVE),
    ])
    alto_datos = 149   # lo que miden las siete lineas de arriba: fija el largo de la regla
    cabecera = (
        '<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="560" '
        'style="border-collapse:collapse;width:560px;"><tr>'
        '<td valign="middle" align="left" width="216" style="width:216px;padding:0 26px 0 0;">%s</td>'
        '<td width="1" valign="middle" style="width:1px;padding:0;background-color:#DCE3EE;font-size:0;line-height:0;">'
        '<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>'
        '<td width="1" height="%d" style="width:1px;height:%dpx;font-size:0;line-height:0;">&nbsp;</td></tr></table></td>'
        '<td valign="middle" style="padding:0 0 0 26px;">'
        '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">%s</table>'
        '</td></tr></table>' % (wordmark(190), alto_datos, alto_datos, datos))
    espaciador = ('<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>'
                  '<td height="%d" style="height:%dpx;line-height:%dpx;font-size:0;">&nbsp;</td></tr></table>')
    interno = (cabecera + espaciador % (22, 22, 22) + enlaces(iconos=True)
               + espaciador % (AIRE_PARTNERS, AIRE_PARTNERS, AIRE_PARTNERS)
               + grilla_partners(PARTNERS, ancho=560))
    return TABLA + '<tr><td style="padding:0;">' + envolver(interno, 600) + '</td></tr></table>'

VARIANTES = [
    ('firma-1-esencial.html',  '1 · Esencial',
     'Datos y wordmark, nada más. La de todos los días y la de respuestas: no le agrega peso a un hilo largo.',
     v_esencial()),
    ('firma-2-enlaces.html',   '2 · Con enlaces',
     'Suma los tres botones. Buen punto medio cuando querés que el destinatario entre al sitio o al LinkedIn.',
     v_enlaces()),
    ('firma-3-completa.html',  '3 · Completa  ·  recomendada para mails nuevos',
     'Enlaces más los doce partners sobre bloque blanco propio. Es la que hace el trabajo comercial en un primer contacto.',
     v_completa()),
    ('firma-3b-iconos.html', '3b · Completa con íconos  ·  tu elección',
     'La misma 3 con ícono adentro de cada pastilla: globo blanco en el CTA y el mark oficial de LinkedIn en su azul. Son dos imágenes más para desplegar.',
     v_completa(iconos=True)),
    ('firma-5-clasica.html', '5 · Clásica  ·  la organización de tu firma vieja',
     'Logo grande, regla vertical y datos al lado; debajo los botones y abajo las marcas. Suma el teléfono fijo, que en las otras no estaba.',
     v_clasica()),
    ('firma-4-horizontal.html','4 · Horizontal',
     'Todo dentro de un mismo bloque blanco: es la única que se ve igual pase lo que pase con el modo oscuro del cliente.',
     v_horizontal()),
]

# --- salida ------------------------------------------------------------
CSS = '''
 *{box-sizing:border-box}
 body{margin:0;padding:32px 24px 64px;background:#eef0f4;font:14px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;color:#16233a}
 .wrap{max-width:760px;margin:0 auto}
 h1{font-size:20px;margin:0 0 4px}
 .sub{color:#5f6c80;margin:0 0 24px}
 .top{display:flex;gap:10px;align-items:center;margin:0 0 24px;flex-wrap:wrap}
 button{font:600 13px/1 inherit;padding:10px 16px;border:0;border-radius:999px;background:#2B56D4;color:#fff;cursor:pointer}
 button.gris{background:#dfe3ea;color:#33405a}
 button:active{transform:translateY(1px)}
 .op{margin:0 0 28px}
 .cab{display:flex;gap:12px;align-items:baseline;justify-content:space-between;margin:0 0 6px}
 .tit{font-weight:700;font-size:15px}
 .desc{color:#5f6c80;font-size:13px;margin:0 0 10px;max-width:62ch}
 .lienzo{background:#fff;padding:26px;border-radius:12px;box-shadow:0 1px 3px rgba(16,32,64,.13);overflow-x:auto}
 body.oscuro .lienzo{background:#1c1c1e}
 body.oscuro .lienzo td:not([style*="background-color"]){color:#e6eaf1 !important}
 body.oscuro .lienzo td:not([style*="background-color"]) a{color:#9db8ff !important}
 body.oscuro .lienzo td[style*="background-color:#EEF2FD"] a{color:#2B56D4 !important}
 body.oscuro .lienzo td[style*="background-color:#2B56D4"] a{color:#ffffff !important}
 .ok{color:#137333;font-weight:600;font-size:13px}
 .pie{color:#7a8697;font-size:12.5px;margin-top:40px}
 .pie a{color:#2B56D4}
'''

JS = '''
function copiar(id, boton){
  var r=document.createRange(); r.selectNode(document.getElementById(id));
  var s=getSelection(); s.removeAllRanges(); s.addRange(r);
  document.execCommand('copy'); s.removeAllRanges();
  var t=boton.textContent; boton.textContent='Copiada ✓';
  setTimeout(function(){boton.textContent=t},1800);
}
function oscuro(b){
  document.body.classList.toggle('oscuro');
  b.textContent = document.body.classList.contains('oscuro') ? 'Fondo claro' : 'Fondo oscuro';
}
'''

def pagina_suelta(titulo, firma):
    return ('<!doctype html>\n<meta charset="utf-8">\n<title>%s — Accedra</title>\n'
            '<style>body{margin:0;padding:28px;background:#fff;}</style>\n%s\n' % (titulo, firma))

def indice():
    ops = []
    for i, (archivo, titulo, desc, firma) in enumerate(VARIANTES):
        ops.append('''
  <div class="op">
   <div class="cab"><span class="tit">%s</span>
    <span><button onclick="copiar('f%d',this)">Copiar</button>
    <a href="%s" style="margin-left:8px;font-size:12.5px;color:#5f6c80;">abrir sola</a></span></div>
   <p class="desc">%s</p>
   <div class="lienzo"><div id="f%d">%s</div></div>
  </div>''' % (titulo, i, archivo, desc, i, firma))
    return '''<!doctype html>
<meta charset="utf-8">
<title>Firmas de correo · Accedra</title>
<style>%s</style>
<div class="wrap">
 <h1>Firmas de correo · Accedra</h1>
 <p class="sub">Cuatro opciones sobre la misma base tipográfica. Sin bordes ni divisores; los botones son pastillas con relleno.</p>
 <div class="top">
  <button class="gris" onclick="oscuro(this)">Fondo oscuro</button>
  <span style="color:#5f6c80;font-size:12.5px;">simula un cliente en modo oscuro: el bloque blanco tiene que sostenerse solo</span>
 </div>
 %s
 <p class="pie">Copiar → Gmail → Configuración → Firma → Cmd+V. Las cinco imágenes ya están desplegadas y responden 200,
 así que esto es literalmente lo que va a ver el destinatario.<br>
 Iteraciones viejas: <a href="firma-email-v3.html">v3</a> ·
 <a href="firma-email-horizontal.html">horizontal</a> ·
 <a href="firma-email-barra.html">barra</a> ·
 <a href="firma-email.html">primera</a></p>
</div>
<script>%s</script>
''' % (CSS, ''.join(ops), JS)

def previa(html):
    """Todo por URL de produccion: lo que ves aca es exactamente lo que se instala."""
    return html.replace('__LOGO__', CDN + LOGO_PNG.name)

ELEGIDA = 'firma-5-clasica.html'   # la que se sirve en la pagina de prueba con el boton Copiar

def pagina_prueba(titulo, firma):
    """La misma pagina de siempre para copiar y mandarse el mail, con la variante elegida."""
    return '''<!doctype html>
<meta charset="utf-8">
<title>%s — para copiar</title>
<style>
 body{margin:0;padding:24px;background:#f3f4f6;font:14px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;color:#111}
 .barra{max-width:700px;margin:0 auto 16px;display:flex;gap:12px;align-items:center}
 button{font:600 14px/1 inherit;padding:11px 18px;border:0;border-radius:999px;background:#2B56D4;color:#fff;cursor:pointer}
 button:active{transform:translateY(1px)}
 .ok{color:#137333;font-weight:600;display:none}
 .caja{max-width:700px;margin:0 auto;background:#fff;padding:26px;border-radius:12px;box-shadow:0 1px 4px rgba(16,32,64,.13)}
 .nota{max-width:700px;margin:16px auto 0;color:#5f6c80;font-size:12.5px}
</style>
<div class="barra">
 <button id="b">Copiar firma</button>
 <span class="ok" id="ok">Copiada — pegala en Gmail con Cmd+V</span>
</div>
<div class="caja"><div id="firma">%s</div></div>
<p class="nota">Todas las imágenes van por URL de producción, así que esto sirve tanto para mandarte
un mail de prueba (Redactar → Cmd+V) como para dejarla instalada en Configuración → Firma.</p>
<script>
document.getElementById('b').onclick=function(){
 var r=document.createRange(); r.selectNode(document.getElementById('firma'));
 var s=getSelection(); s.removeAllRanges(); s.addRange(r);
 document.execCommand('copy'); s.removeAllRanges();
 document.getElementById('ok').style.display='inline';
};
</script>
''' % (titulo, firma)

for archivo, titulo, desc, firma in VARIANTES:
    (AQUI / archivo).write_text(previa(pagina_suelta(titulo, firma)), encoding='utf-8')
(AQUI / 'index.html').write_text(previa(indice()), encoding='utf-8')

_elegida = next(v for v in VARIANTES if v[0] == ELEGIDA)
for destino in ('prueba.html', 'firma-email-v3-prueba.html'):
    (AQUI / destino).write_text(previa(pagina_prueba(_elegida[1], _elegida[3])), encoding='utf-8')
print('generadas:', ', '.join(a for a, _, _, _ in VARIANTES), '+ index.html')
