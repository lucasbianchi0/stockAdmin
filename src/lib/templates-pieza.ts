import { PALETA } from "@/lib/brand-kit"

/**
 * Los templates de pieza — la receta fija de composición de cada formato.
 *
 * Es la diferencia entre quince publicaciones de la misma marca y quince
 * imágenes sueltas. Hoy cada pieza recibía un prompt escrito libre, distinto
 * cada vez: nada fijaba dónde va el texto, cuánto ocupa la foto ni qué
 * proporción tiene el conjunto, así que la coherencia dependía del azar.
 *
 * Lo fijo es la receta. Lo variable son dos cosas y nada más: el titular y el
 * sujeto de la foto. Esa restricción es justamente la que produce la variedad
 * sin perder la familia — si además cambiara la composición, no habría marca.
 */

const hex = (nombre: string) => PALETA.find((c) => c.nombre === nombre)!.hex

const NAVY = hex("Navy Accedra")
const AZUL = hex("Azul Accedra")

/**
 * Lo que NO puede aparecer, en ninguna pieza.
 *
 * Va en cada template y no una sola vez al final por una razón práctica: en un
 * prompt largo, lo que está al final pesa menos. Las prohibiciones son la mitad
 * del resultado — el problema de una imagen generada nunca es lo que le falta,
 * es lo que le sobra.
 */
const ANTI_IA = `PROHIBIDO, sin excepción: resplandores, glow, estelas de luz, destellos, partículas, bokeh de brillos, interfaces flotantes, pantallas transparentes, HUD, hologramas, circuitos o placas madre, neón, globos de wireframe, cerebros digitales, candados, código binario, figuras encapuchadas, grading teal-naranja, viñeteado fuerte, simetría de ciencia ficción, piel plástica, y detalle recargado llenando todo el cuadro.
Nada de logos, sellos ni badges. Ninguna marca ajena. La única cadena de texto permitida además del titular es "accedra.com.ar" al pie.
Nada de tipografías de sistema (Helvetica, Arial, Times), texto duplicado en dos tamaños, ni más de un titular.
Nada de fondos planos sin material, ni recortes pegados con sombra dura.
Si aparece una pantalla o cartelería dentro de la escena, va apagada, en blanco o desenfocada.`

/**
 * La identidad de Accedra dentro de la pieza.
 *
 * La versión anterior decía "sans-serif geométrica" y "estética premium", y con
 * eso el modelo devolvía Helvetica sobre un azul plano: correcto y de nadie. Lo
 * que da personalidad no son los adjetivos, son las decisiones concretas — qué
 * material tiene el fondo, cuánto tracking lleva el titular, dónde aparece el
 * acento y cuántas veces.
 *
 * El motivo geométrico sale del isotipo de Accedra: el vértice que forma la "A".
 * Es lo único de acá que no se puede copiar de otra marca, y por eso es lo que
 * hace que la pieza se reconozca sin leer el logo.
 */
/**
 * La identidad de Accedra dentro de la pieza.
 *
 * Corta y sin adornos, a propósito. La versión anterior pedía un degradado, un
 * grano y un motivo geométrico sutil derivado del isotipo: el modelo respondió
 * pintando una letra A gigante en el centro. Cada instrucción decorativa que se
 * suma vuelve como un artefacto — un generador no sabe hacer algo "apenas
 * perceptible".
 *
 * Lo que queda es lo que no se puede malinterpretar: color plano, foto a sangre,
 * dos pesos de tipografía y un acento.
 */
/**
 * La identidad de Accedra dentro de la pieza.
 *
 * El fondo NO se define acá sino en cada template, porque tiene que variar: diez
 * piezas con el mismo fondo son una plantilla, no un sistema.
 *
 * Lo que sí es fijo acá es la regla que costó cuatro intentos aprender: el fondo
 * se describe con LUZ y MATERIA —de dónde entra la luz, qué sombra proyecta, qué
 * planos hay—, nunca con símbolos. Cuando se pidió "un motivo geométrico sutil
 * derivado del isotipo", el modelo pintó una letra A gigante en el medio. No sabe
 * hacer algo "apenas sugerido": si nombrás una forma, la dibuja.
 */
const MARCA = `MARCA ACCEDRA — obligatorio.

COLOR
· Base navy ${NAVY}. Todo el fondo se construye con tonos de ese navy: más claro donde pega la luz, casi negro en las sombras.
· Texto en blanco #FFFFFF.
· Azul ${AZUL}: aparece UNA sola vez en la pieza. Una palabra del titular, o una línea fina, o el borde de un contenedor. Nunca dos.
· Ningún otro color fuera de la fotografía.

TIPOGRAFÍA
· Grotesca geométrica ancha, caja baja, tracking apretado, interlineado ajustado. NUNCA Helvetica ni Arial.
· Dos pesos en toda la pieza y ni uno más.
· El titular es grande y manda. Nada de texto chico decorativo.

REGLA DEL FONDO
· Nunca plano. Siempre luz, sombra y profundidad — pero descritos como fotografía, no como gráfico.
· PROHIBIDO dibujar formas reconocibles en el fondo: letras, logos, íconos, siluetas, patrones geométricos repetidos, hexágonos, circuitos, mallas, marcas de agua. Si hay una forma, es una SOMBRA PROYECTADA o un PLANO, nunca un símbolo.

FOTOGRAFÍA
· Escenas reales con luz dura y sombras marcadas. Nada de stock sonriente.
· El tratamiento —monocromo o color— lo indica cada template más abajo.

MOBILIARIO FIJO — idéntico en las diez piezas
· Arriba a la izquierda, la ETIQUETA que se indica más abajo, en versalitas de cuerpo mínimo y en gris. Si no se indica ninguna, ese espacio queda vacío: NO inventes un texto ahí ni escribas una descripción del elemento.
· Abajo a la izquierda, "accedra.com.ar" en gris, del mismo cuerpo mínimo.
· Abajo a la derecha, una flecha fina hacia la derecha, en azul acento.
· Estos tres elementos van SIEMPRE, en la misma posición y el mismo tamaño, sin importar el template. Son lo que hace que el perfil se lea como un sistema y no como piezas sueltas.

COMPOSICIÓN
· La pieza se llena de borde a borde. Nunca una franja vacía abajo o al costado.
· Márgenes de 7% del ancho para el texto.
· Un solo titular, sin repetirlo en otro tamaño.
· El titular es una tesis, no un anuncio: afirma algo discutible o abre una pregunta. Tono de consultora que asesora, nunca de proveedor que ofrece.

Resultado: consultora tecnológica premium. Sobrio, con profundidad, caro. Nunca infantil, nunca futurista, nunca recargado.`

/**
 * Cuánto pesa la fotografía en la pieza, mirada de lejos.
 *
 * No es lo mismo que `llevaFoto`: "Cita con retrato" lleva foto y aun así se lee
 * como una placa de texto, porque el retrato es un círculo del 20%. Lo que
 * decide si dos piezas se pelean en una grilla es el peso visual, no si hay una
 * foto adentro.
 *
 * Es el eje sobre el que se calcula la armonía del feed: tres "foto" seguidas
 * pesan, dos "texto" juntas se ven vacías.
 */
export type Densidad =
  /** La foto manda: ocupa el 70% o más de la pieza. */
  | "foto"
  /** Foto y texto se reparten el cuadro. */
  | "mixta"
  /** Placa: no hay foto, o es tan chica que no cuenta. */
  | "texto"

export type TemplatePieza = {
  id: string
  nombre: string
  /** Cuándo conviene este y no otro. Lo lee el recomendador. */
  cuandoUsar: string
  /** Cuánto pesa la foto de lejos. Lo lee el algoritmo de secuencia. */
  densidad: Densidad
  /** Si la pieza necesita foto. Los de solo texto no piden sujeto. */
  llevaFoto: boolean
  /**
   * Foto a color pleno en vez de monocroma.
   *
   * El monocromo es el default porque unifica el feed y deja respirar al acento.
   * Pero un retrato de equipo o una certificación en blanco y negro pierden
   * justo lo que los hace valer. En esos casos va color, y entonces el acento
   * NO se apoya sobre la foto: se reserva para la zona navy.
   */
  fotoColor?: boolean
  /** La receta: fondo, texto y foto. Fija — es lo único que sostiene la familia. */
  composicion: string
}

/**
 * Diez formatos, diez fondos distintos.
 *
 * El fondo se describe en cada uno y nunca se repite: si los diez compartieran
 * tratamiento, el perfil se vería como una plantilla rellenada. Cada uno dice de
 * dónde entra la luz, qué sombra proyecta y cuántos planos hay — nunca qué forma
 * dibujar, que es lo que produce artefactos.
 */
export const TEMPLATES: TemplatePieza[] = [
  {
    id: "foto-fondo",
    nombre: "Foto de fondo",
    cuandoUsar: "Prueba de trabajo real: una implementación, una obra, el equipo en cliente. Lo que demuestra que se hace, no que se dice.",
    densidad: "foto",
    llevaFoto: true,
    composicion: `FONDO: la fotografía ocupa la pieza entera, a sangre. Encima cae un velo navy opaco arriba que se vuelve transparente en el tercio inferior, así el texto apoya sobre oscuro y la foto respira abajo.
TEXTO: el TITULAR arriba, alineado a la izquierda, en tres líneas cortas, ocupando el tercio superior.
La foto tiene la zona superior tranquila, sin detalle que compita con el texto.`,
  },
  {
    id: "medios",
    nombre: "Mitad y mitad",
    cuandoUsar: "El formato de todos los días: una tesis de industria con una imagen que la ancle.",
    densidad: "mixta",
    llevaFoto: true,
    composicion: `FONDO: la mitad izquierda es navy con una luz rasante que entra por el borde superior izquierdo y se apaga hacia abajo, dejando la esquina inferior casi negra.
TEXTO: el TITULAR ocupa esa mitad izquierda, alineado a la izquierda, centrado en vertical.
FOTO: la mitad derecha, a sangre, del borde superior al inferior. El corte entre las dos mitades es limpio y vertical.`,
  },
  {
    id: "texto-manda",
    nombre: "Texto manda, foto acompaña",
    cuandoUsar: "Diagnósticos y argumentos: cuando hay que explicar por qué algo falla o por qué conviene cambiarlo.",
    densidad: "mixta",
    llevaFoto: true,
    composicion: `FONDO: dos planos de navy apenas distintos superpuestos en diagonal suave, con una línea de luz muy tenue donde uno monta sobre el otro. Profundidad por capas.
TEXTO: el TITULAR ocupa el 60% izquierdo, de arriba hacia el centro, en cuatro líneas cortas.
FOTO: una franja vertical del 40% a la derecha, a sangre, que se funde en sombra contra el navy sin borde duro.`,
  },
  {
    id: "card",
    nombre: "Card elevada",
    cuandoUsar: "Certificaciones, partnerships y anuncios institucionales. Cuando el contenido tiene peso de documento.",
    densidad: "texto",
    llevaFoto: false,
    composicion: `FONDO: navy con una viñeta suave que oscurece los bordes y deja el centro más iluminado, como fondo de estudio.
CONTENEDOR: una tarjeta rectangular de esquinas redondeadas, centrada, del 70% del ancho y el 55% del alto, en navy un punto más claro que el fondo, con sombra proyectada larga y difusa por debajo y un filo de luz de un píxel en el borde superior.
TEXTO: el TITULAR va dentro de la tarjeta, centrado, con aire generoso a los cuatro lados.`,
  },
  {
    id: "dos-cards",
    nombre: "Dos columnas comparativas",
    cuandoUsar: "Marcos de decisión: reactivo contra proactivo, tercerizar contra hacer, migrar contra sostener.",
    densidad: "texto",
    llevaFoto: false,
    composicion: `FONDO: navy con una luz cenital amplia que baja del borde superior y se difumina hacia abajo.
TEXTO: el TITULAR arriba, centrado, en dos líneas, ocupando el 25% superior.
CONTENEDORES: debajo, DOS tarjetas iguales lado a lado con separación entre ellas, ocupando juntas el 60% del alto. Navy más claro que el fondo, esquinas redondeadas, sombra suave. Cada una con un rótulo corto arriba y dos o tres líneas breves debajo.`,
  },
  {
    id: "cita",
    nombre: "Cita con retrato",
    cuandoUsar: "La voz de un especialista de Accedra o de un cliente. Autoridad con nombre y cargo.",
    densidad: "texto",
    llevaFoto: true,
    composicion: `FONDO: navy atravesado por luz de ventana lateral, que proyecta bandas suaves de claro y oscuro en diagonal, como persiana. Muy tenue.
TEXTO: la cita entre comillas ocupa el 60% superior, alineada a la izquierda, con una comilla de apertura grande en azul acento.
FOTO: un retrato circular abajo a la izquierda, del 20% del alto, con nombre y cargo a su derecha en dos líneas chicas.`,
  },
  {
    id: "lista",
    nombre: "Lista numerada",
    cuandoUsar: "Frameworks: los tres errores, las cuatro condiciones, los cinco pasos. Contenido que enseña un criterio.",
    densidad: "texto",
    llevaFoto: false,
    composicion: `FONDO: navy con una banda vertical de luz sobre el borde derecho que se apaga hacia la izquierda, dejando el resto profundo.
TEXTO: el TITULAR arriba a la izquierda, en dos líneas, ocupando el 22% superior.
LISTA: debajo, tres o cuatro filas, cada una con un número en azul acento a la izquierda y una línea en blanco a su derecha. Entre filas, una divisoria de un píxel muy tenue. Las filas ocupan el resto de la pieza con aire parejo.`,
  },
  {
    id: "editorial",
    nombre: "Titular editorial",
    cuandoUsar: "La tesis pura: una afirmación de industria que se sostiene sola y da que discutir.",
    densidad: "texto",
    llevaFoto: false,
    composicion: `FONDO: tres planos de navy en tonos apenas distintos, montados en bloques rectangulares grandes que salen del cuadro, con la luz entrando desde arriba a la izquierda y sombras largas en los encuentros. Arquitectura de planos.
TEXTO: el TITULAR es lo único de la pieza. Enorme, alineado a la izquierda, de margen a margen y del 20% al 80% del alto, en cuatro o cinco líneas cortas.`,
  },
  {
    id: "diagonal",
    nombre: "Corte diagonal",
    cuandoUsar: "Transformación: de un estado a otro. Migraciones, modernizaciones, cambios de paradigma.",
    densidad: "mixta",
    llevaFoto: true,
    composicion: `FONDO: una diagonal suave de arriba-izquierda a abajo-derecha divide la pieza en dos zonas de navy con distinta profundidad: la superior iluminada, la inferior casi negra, con una línea de luz difusa en el encuentro.
TEXTO: el TITULAR en la zona superior izquierda, en tres líneas cortas.
FOTO: ocupa la zona inferior derecha siguiendo el corte diagonal, a sangre contra los bordes derecho e inferior.`,
  },
  {
    id: "retrato-color",
    nombre: "Retrato a color",
    cuandoUsar: "Personas: el equipo, un especialista, una incorporación. Cultura y marca empleadora.",
    densidad: "foto",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FONDO: la fotografía de la persona ocupa la pieza entera, a sangre, con luz natural real.
BANDA: sobre el borde izquierdo, una franja navy vertical del 35% del ancho, semitransparente sobre la foto, que se vuelve opaca hacia el borde.
TEXTO: el TITULAR va dentro de esa banda, alineado a la izquierda, en tres o cuatro líneas cortas.
La persona queda a la derecha, mirando hacia el texto o de perfil.`,
  },
  {
    id: "mosaico",
    nombre: "Mosaico de equipo",
    cuandoUsar: "Jornadas, capacitaciones, eventos, equipo. Cuando lo que se muestra son muchas personas o muchos momentos.",
    densidad: "foto",
    llevaFoto: true,
    composicion: `FONDO: navy con luz difusa desde el borde superior.
TEXTO: el TITULAR arriba a la izquierda, en dos o tres líneas, ocupando el 30% superior.
MOSAICO: debajo, una grilla de seis fotografías rectangulares de igual tamaño, tres por fila, con separación fina y pareja entre ellas, ocupando el resto de la pieza hasta el borde inferior.
Las fotos son escenas distintas del mismo momento.`,
  },
  {
    id: "objeto",
    nombre: "Objeto en foco",
    cuandoUsar: "Certificaciones, partnerships, sellos, equipamiento. Cuando el protagonista es una cosa y no una escena.",
    densidad: "mixta",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FONDO: navy profundo con un cono de luz cenital que cae sobre el centro, dejando los bordes casi negros. Fondo de estudio fotográfico.
OBJETO: el objeto ocupa el centro de la pieza, del 45% del alto, a color, con su reflejo o su sombra apoyada debajo. Fotografía de producto, nítida.
TEXTO: el TITULAR debajo del objeto, centrado, en dos líneas cortas.`,
  },
  {
    id: "proceso",
    nombre: "Etapas en tarjetas",
    cuandoUsar: "Metodología: cómo se trabaja, en qué orden, qué pasa en cada etapa.",
    densidad: "texto",
    llevaFoto: false,
    composicion: `FONDO: navy con una luz suave que entra desde el borde superior izquierdo y cae en diagonal.
TEXTO: el TITULAR arriba a la izquierda, en dos líneas, ocupando el 22% superior.
TARJETAS: debajo, TRES tarjetas rectangulares apiladas una sobre otra en vertical, del ancho completo menos los márgenes, separadas por un espacio parejo. Navy un punto más claro que el fondo, esquinas redondeadas, sombra suave y un filo de luz en el borde superior de cada una.
Dentro de cada tarjeta: un número grande en azul acento a la izquierda y dos o tres palabras en blanco a su derecha, alineadas en la misma línea de base.
Sin flechas, sin líneas conectoras, sin nada que una las tarjetas: el orden lo dan los números y el apilado.`,
  },
  {
    id: "split",
    nombre: "Split horizontal",
    cuandoUsar: "Cuando la escena y el mensaje pesan parejo y la imagen es apaisada.",
    densidad: "mixta",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FONDO: la mitad superior es la fotografía, a sangre, de borde a borde. La mitad inferior es navy con una luz suave que entra desde el borde inferior derecho.
El corte entre ambas es horizontal y limpio, con una línea de un píxel en azul acento sobre el filo.
TEXTO: el TITULAR en la mitad inferior, alineado a la izquierda, en tres líneas cortas, centrado en vertical dentro de esa mitad.`,
  },
  {
    id: "pie-banda",
    nombre: "Foto plena, pie de banda",
    cuandoUsar: "Cuando la escena habla sola y el texto solo la nombra. Obra, despliegue, equipo en cliente.",
    densidad: "foto",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FOTO: ocupa la pieza entera, a sangre, a COLOR REAL. Sin velo, sin filtro, sin oscurecer. Es una fotografía, no un fondo.
BANDA: sobre el borde inferior, una franja navy sólida y angosta, del 15% del alto, que cruza todo el ancho. Corte recto, sin degradado.
TEXTO: una sola línea dentro de la banda, alineada a la izquierda. Corta. No es un titular: es un pie.
La foto ocupa el 85% de la pieza y manda.`,
  },
  {
    id: "pastilla",
    nombre: "Foto plena con pastilla",
    cuandoUsar: "Lo más visual del set. Momentos, cultura, oficio — cuando el texto casi sobra.",
    densidad: "foto",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FOTO: ocupa la pieza entera, a sangre, a COLOR REAL, sin ningún velo ni oscurecimiento.
PASTILLA: una etiqueta compacta navy sólida, de esquinas bien redondeadas, apoyada sobre la esquina inferior izquierda con margen. Ocupa como mucho el 45% del ancho y el 12% del alto.
TEXTO: de cuatro a seis palabras dentro de la pastilla, en una o dos líneas. Nada más.
El 90% de la pieza es fotografía pura.`,
  },
  {
    id: "dos-fotos",
    nombre: "Dos fotos verticales",
    cuandoUsar: "Dos momentos, dos escenas, dos caras del mismo trabajo. Muy visual, sin comparar con texto.",
    densidad: "foto",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FOTOS: dos fotografías verticales a COLOR REAL, lado a lado, cada una del 50% del ancho, de borde superior a borde inferior. Separadas por una línea fina en azul acento.
Son dos escenas distintas del mismo tema, con la misma luz y el mismo tratamiento para que se lean como un par.
TEXTO: una banda navy angosta sobre el borde inferior cruzando ambas fotos, con una línea corta de texto.`,
  },
  {
    id: "zona-limpia",
    nombre: "Texto sobre zona limpia",
    cuandoUsar: "El más premium del set. Cuando hay una escena con aire real donde el texto puede apoyarse solo.",
    densidad: "foto",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FOTO: ocupa la pieza entera, a sangre, a COLOR REAL, sin velo ni caja de ningún tipo.
La escena se compone DE MODO QUE quede una zona amplia y lisa —una pared, un cielo, un piso, una superficie sin detalle— ocupando el tercio superior o el lateral izquierdo.
TEXTO: el TITULAR se apoya directamente sobre esa zona limpia, en blanco, sin ninguna caja, banda ni sombra detrás. Tres líneas cortas.
Si la zona no es lo bastante lisa, la pieza no funciona: la escena tiene que construirse alrededor de ese vacío.`,
  },
  {
    id: "tres-cuartos",
    nombre: "Foto tres cuartos",
    cuandoUsar: "Cuando la imagen pesa más que el mensaje pero el mensaje necesita más de una línea.",
    densidad: "foto",
    llevaFoto: true,
    fotoColor: true,
    composicion: `FOTO: ocupa el 75% superior de la pieza, a sangre por arriba y por los costados, a COLOR REAL sin velo.
FONDO: el 25% inferior es navy sólido, con el corte recto y horizontal.
TEXTO: el TITULAR en esa franja navy, alineado a la izquierda, en dos líneas cortas, centrado en vertical dentro de la franja.`,
  },
]

export function templatePorId(id: string | null | undefined): TemplatePieza | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Arma el prompt final. El orden importa: primero la composición —que es lo que
 * el modelo tiene que respetar—, después el contenido, y las prohibiciones al
 * final, que es donde más se olvidan y por eso se repiten completas.
 */
export function promptDeTemplate({
  template,
  titular,
  sujeto,
  etiqueta,
}: {
  template: TemplatePieza
  titular: string
  sujeto?: string
  /** La micro-etiqueta de arriba a la izquierda: el tema, en una o dos palabras. */
  etiqueta?: string
}): string {
  const partes = [
    `COMPOSICIÓN — seguila exactamente:\n${template.composicion}`,
    `TEXTO — reproducilo LETRA POR LETRA, respetando tildes, mayúsculas y signos. No agregues ninguna otra palabra:\n"${titular}"`,
  ]

  if (template.llevaFoto && sujeto) {
    partes.push(
      `LA FOTOGRAFÍA muestra: ${sujeto}\n${
        template.fotoColor
          ? "Va a COLOR pleno, con luz real y colores naturales, sin filtros. El azul acento no se apoya nunca sobre la foto: queda reservado para la zona navy."
          : "Va en blanco y negro o casi monocroma, con tinte navy y contraste alto. Nunca a color pleno."
      }`
    )
  }

  // Sin etiqueta explícita el espacio queda vacío. Describir el elemento sin
  // decir qué dice hace que el modelo escriba la descripción: la primera prueba
  // salió con "SMALL ABEL CAPS" impreso arriba a la izquierda.
  partes.push(
    etiqueta
      ? `ETIQUETA de arriba a la izquierda, copiala letra por letra: "${etiqueta.toUpperCase()}"`
      : "No hay etiqueta: el espacio de arriba a la izquierda queda vacío."
  )

  partes.push(MARCA, ANTI_IA)
  return partes.join("\n\n")
}
