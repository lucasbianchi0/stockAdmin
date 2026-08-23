/**
 * La doctrina de copy de las piezas: qué tiene que decir el titular impreso.
 *
 * Vive aparte porque lo necesitan tres prompts que hasta ahora no se hablaban
 * —el que arma el plan, el que regenera una idea suelta y el que traduce la
 * pieza a las variables del template— y tener tres criterios distintos de qué es
 * un buen titular es exactamente lo que producía tres calidades distintas.
 *
 * POR QUÉ EXISTE. El sistema visual del feed pide un titular en bold que es "the
 * loudest element of the piece by a wide margin": la foto, el rótulo y la lista
 * lateral son soporte, y lo único que alguien lee scrolleando es esa frase. Pero
 * el titular se derivaba comprimiendo el caption ya escrito a nueve palabras, y
 * comprimir siempre abstrae: de doscientas cincuenta palabras sobre Zero Trust
 * salía "Nunca confiar. Siempre verificar. Mínimo privilegio", que es la
 * definición del manual —sin sujeto, sin consecuencia, y que puede firmar
 * cualquier competidor de IT—. No era una falla del modelo: era lo que se le
 * había pedido.
 *
 * Por eso el titular ahora se ESCRIBE en el plan, con todo el contexto de marca
 * delante, y el caption lo desarrolla. El derivador dejó de inventarlo.
 */

import type { Objetivo } from "@/lib/calendario-context"

/**
 * El techo de palabras del titular.
 *
 * Estaba en 9, cortado en líneas de 2 a 4 palabras, y esa cuenta es la que
 * fabricaba las palabras sueltas: con ese molde no entra ninguno de los
 * titulares que el propio Brand Kit da como ejemplo de lo que sí funciona.
 * "El papel es opcional. La validez legal, no." son 8 y entra justo; "Las caídas
 * pasaron de 5 por semana a menos de 1 por mes" son 12 y quedaba afuera.
 */
export const HEADLINE_MAX_PALABRAS = 14

/**
 * El presupuesto REAL del titular: caracteres, no palabras.
 *
 * Las palabras no dicen nada del espacio. "¿Cuántos proveedores tienen acceso a
 * tu red hoy? ¿Podés saberlo?" son diez palabras y sesenta y cuatro caracteres,
 * y a cuerpo fijo eso no entra en cuatro líneas: esa pieza salió con la letra a
 * dos tercios del resto del feed.
 *
 * 50 es lo que entra en cuatro líneas al cuerpo fijo de `CUERPO_TITULAR`, medido
 * con el mismo repartidor de líneas que usa la placa. El corte es nítido: los
 * titulares de 42 a 49 caracteres entran todos, los de 54 en adelante ninguno.
 * "El papel es opcional. La validez legal, no." son 42 y entra; "Las caídas
 * pasaron de 5 por semana a menos de 1 por mes" son 55 y hay que acortarlo.
 */
export const HEADLINE_MAX_CARACTERES = 50

/**
 * Las fórmulas con las que trabaja un community manager.
 *
 * No es una lista de inspiración: es el catálogo del que cada pieza tiene que
 * elegir UNA. Un modelo al que se le pide "un titular atrapante" devuelve un
 * adjetivo; al que se le pide "la cifra que incomoda" devuelve una cifra.
 *
 * Tres de los siete ejemplos salen del Brand Kit y no de acá —`TONO.ejemplos` y
 * `POSICIONAMIENTO.contraste`—, que ya tenían escrito qué suena a Accedra y qué
 * suena a folleto. Nunca habían llegado al prompt del titular.
 */
export const PATRONES_HEADLINE = [
  {
    id: "cifra-que-incomoda",
    nombre: "La cifra que incomoda",
    cuando: "Hay un dato del catálogo que contradice lo que el lector supone.",
    ejemplo: "El 80% de los ataques entra con un usuario válido",
  },
  {
    id: "antes-despues",
    nombre: "El antes y el después real",
    cuando: "Hay un caso con métrica publicada. Se muestra el salto, no se declara la mejora.",
    ejemplo: "De 5 caídas por semana a menos de 1 por mes",
  },
  {
    id: "objecion-dada-vuelta",
    nombre: "La objeción dada vuelta",
    cuando: "El lector tiene un motivo para no avanzar y se lo desarma en dos tiempos.",
    ejemplo: "El papel es opcional. La validez legal, no.",
  },
  {
    id: "costo-oculto",
    nombre: "El costo oculto",
    cuando: "El problema real no es el que el lector está mirando.",
    ejemplo: "Tu red no se cayó. Se puso lenta. Es peor.",
  },
  {
    id: "pregunta-que-duele",
    nombre: "La pregunta que duele",
    cuando:
      "Una sola pregunta cuya respuesta el lector no tiene a mano. Nunca retórica, nunca de las que se contestan solas.",
    ejemplo: "¿Cuántos proveedores tienen acceso a tu red hoy?",
  },
  {
    id: "escala-como-prueba",
    nombre: "La escala como prueba",
    cuando: "El tamaño de lo hecho es el argumento. Números del catálogo, nunca inventados.",
    ejemplo: "4.400 pantallas de firma en 400 sucursales",
  },
  {
    id: "distincion-experta",
    nombre: "La distinción experta",
    cuando:
      "Dos cosas que el mercado confunde y que solo alguien del rubro separa. Es el patrón que más autoridad da.",
    ejemplo: "Backup no es continuidad.",
  },
] as const

export type PatronHeadline = (typeof PATRONES_HEADLINE)[number]["id"]

const PATRONES_IDS = PATRONES_HEADLINE.map((p) => p.id) as readonly string[]

export function esPatron(v: unknown): v is PatronHeadline {
  return typeof v === "string" && PATRONES_IDS.includes(v)
}

/**
 * Qué forma toma el titular según para qué sirve la pieza.
 *
 * El objetivo de marketing hasta ahora cambiaba una línea del prompt del caption
 * y nada más. Pero es lo que decide la FORMA del titular: una pieza de awareness
 * abre una tensión, una de educación separa dos conceptos, y una de conversión
 * nombra el costo de seguir como se está. Sin esto, las once piezas del plan
 * terminan con el mismo tono aunque persigan cosas distintas.
 */
export const FORMA_POR_OBJETIVO: Record<Objetivo, string> = {
  awareness:
    'Abrí una tensión: una cifra que incomoda, un costo oculto o una pregunta que el lector no se hizo. NO nombres el servicio ni cierres con un llamado a la acción — todavía no se ganó el derecho. Patrones que van bien: "cifra-que-incomoda", "costo-oculto", "pregunta-que-duele".',
  educacion:
    'Separá dos cosas que el mercado confunde, o mostrá el salto real de un caso. El titular tiene que dejar al lector sabiendo algo que antes no sabía, no anunciándole que hay un tema. Patrones que van bien: "distincion-experta", "antes-despues", "cifra-que-incomoda".',
  conversion:
    'Nombrá el costo de quedarse como está, o la escala de lo que ya se hizo. El titular sostiene el llamado a la acción; no ES el llamado a la acción. Patrones que van bien: "costo-oculto", "escala-como-prueba", "objecion-dada-vuelta".',
}

/**
 * El bloque que se inyecta en todo prompt que escriba un titular.
 *
 * Largo a propósito. La versión corta —"que sea atrapante, sin humo"— es la que
 * venía produciendo los slogans: un modelo no puede cumplir un adjetivo, pero sí
 * puede cumplir "tiene sujeto y verbo" y "elegí uno de estos siete patrones".
 */
export const DOCTRINA_HEADLINE = `EL TITULAR DE LA PIEZA — lo más importante que escribís.

Va impreso ENORME y en negrita dentro de la imagen. Es lo único que alguien lee scrolleando: la foto y el resto del texto son soporte. Si el titular no para el scroll, la pieza no existe.

Las cuatro condiciones, todas obligatorias:
1. TIENE SUJETO Y VERBO. Es una frase que afirma algo, no tres conceptos apilados. "Nunca confiar. Siempre verificar. Mínimo privilegio" está MAL: no hay nadie ahí, no pasa nada, es la definición de un manual.
2. LE HABLA AL LECTOR, NO AL TEMA. "Tu red", "tus proveedores", "tu operación" — nunca "las redes", "la seguridad", "las empresas".
3. HAY ALGO EN JUEGO. Una consecuencia, un costo, un dato que contradice lo que el lector supone. Un titular donde no pasa nada no se lee.
4. SOLO LO PUEDE FIRMAR ACCEDRA. Con un nombre propio, una cifra del catálogo o una distinción que solo sabe alguien que hace esto.

Elegí UNO de estos siete patrones y declaralo:
${PATRONES_HEADLINE.map((p) => `· "${p.id}" — ${p.nombre}. ${p.cuando}\n  Ejemplo: "${p.ejemplo}"`).join("\n")}

Forma: hasta ${HEADLINE_MAX_PALABRAS} palabras Y hasta ${HEADLINE_MAX_CARACTERES} CARACTERES contando espacios — las dos cosas, y el límite que se toca primero manda. Contá los caracteres antes de entregar: el titular se imprime a un cuerpo fijo y uno más largo sale con la letra más chica que el resto del feed. Una o dos oraciones, nunca dos preguntas seguidas. Español argentino. Sin emojis, sin hashtags, sin signos de exclamación, sin comillas adentro. Sin punto final si es una sola oración.

PROHIBIDO, por nombre:
· El slogan tripartito de imperativos sin sujeto ("Nunca confiar. Siempre verificar. Mínimo privilegio"). Es la forma exacta que venía saliendo mal.
· Definir un concepto técnico. El titular afirma algo sobre el negocio de quien lee; no explica una metodología ni traduce el manual del fabricante.
· El sustantivo abstracto solo: "Seguridad que protege", "Conectividad sin límites", "Transformación digital". No dicen nada y sirven para cualquiera.
· Inventar cifras. Si el número no está en el catálogo de arriba, no va.
· Agregarle una segunda pregunta de refuerzo a la primera ("…¿Podés saberlo?"). No suma tensión: gasta el presupuesto de caracteres y deja el titular chico.`

/**
 * El chequeo final. Ya estaba escrito en el Brand Kit —"si la frase se puede
 * copiar y pegar en la web de cualquier competidor, no sirve"— pero como
 * principio de tono, nunca como un paso que el modelo tuviera que ejecutar.
 * Enunciado como test explícito, se cumple; enunciado como valor, se ignora.
 */
export const TEST_RECHAZO = `TEST DE RECHAZO — hacelo antes de entregar, sobre el titular:
¿Lo puede postear Cisco, Telecom o cualquier integrador de IT del país, tal cual está, sin cambiarle una palabra?
Si la respuesta es sí, está mal. Reescribilo con un dato, un nombre propio o una consecuencia que solo Accedra pueda firmar.`

/**
 * Qué tramo del titular va en azul.
 *
 * El template parte el titular en tramos de color (ver `destacado()` en
 * `templates-feed.ts`), y hasta ahora el tramo se elegía con "1 a 3 palabras que
 * merezcan ir en azul": el modelo pintaba un adjetivo cualquiera. El azul es el
 * único acento de la pieza, así que tiene que caer sobre el remate — la parte
 * que da vuelta el sentido de la frase.
 */
export const DESTACADO_GUIA = `"destacado": el tramo del titular que va en azul. NO ES OPCIONAL — toda pieza del feed lleva azul en el titular, y devolverlo vacío no es una respuesta válida.

Es el REMATE: la parte que da vuelta el sentido, no un adjetivo suelto ni la palabra técnica.
En "El problema no es el que entra. Es el que ya tiene la llave" el remate es "Es el que ya tiene la llave", no "llave".
Si el titular tiene dos oraciones, el remate es la segunda.

De 2 a 6 palabras, consecutivas, copiadas LETRA POR LETRA del titular tal como lo escribiste —con sus tildes y su puntuación— y NUNCA el titular entero: algo tiene que quedar en blanco para que el azul se lea como acento.`

/**
 * El titular cortado en líneas, sin llamar a un modelo.
 *
 * El corte bueno es semántico —se parte donde respira la frase— y eso lo hace
 * mejor el modelo. Esto es la red: un titular que llega sin cortar se reparte en
 * líneas parejas antes que entrar como una sola línea de catorce palabras, que
 * el generador de imágenes escribe en cuerpo 12 y queda ilegible.
 */
export function cortarHeadline(texto: string): string[] {
  // Sin `slice`: el titular se reparte entero. Recortarlo acá era la tercera
  // amputación silenciosa del pipeline — la que dejaba "…400 sucursales. Un".
  const palabras = limpiarTitular(texto).split(" ").filter(Boolean)
  if (palabras.length === 0) return []

  // Hasta 4 palabras entran en una línea; de ahí en más, dos o tres, para que
  // ninguna línea quede muy larga al lado de una corta.
  const lineas = palabras.length <= 4 ? 1 : palabras.length <= 9 ? 2 : 3
  const porLinea = Math.ceil(palabras.length / lineas)

  return Array.from({ length: lineas }, (_, i) =>
    palabras.slice(i * porLinea, (i + 1) * porLinea).join(" ")
  ).filter(Boolean)
}

/** Cuenta las palabras de un titular. Se usa para avisar, no para cortar. */
export function palabrasDe(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length
}

/* ── Medir, cortar y ubicar ───────────────────────────────────────────────── */

/**
 * Sin tildes, en minúscula y SIN cambiar el largo.
 *
 * El largo es lo que importa: sobre esta forma se busca el destacado con
 * `indexOf`, y la posición que devuelve tiene que servir para cortar el texto
 * ORIGINAL. Por eso no se usa `normalize("NFD")`, que descompone "á" en dos
 * caracteres y corre todos los índices, ni `toLowerCase()` a secas, que en un
 * puñado de casos (la "İ" turca) devuelve dos caracteres donde había uno.
 *
 * Vive acá y no en la placa porque lo necesitan los dos lados —el derivador que
 * valida el destacado y el renderizador que lo pinta— y tener dos
 * normalizadores distintos es exactamente lo que hacía desaparecer el azul: el
 * derivador comparaba con tildes, el renderizador sin ellas, y el más estricto
 * descartaba tramos que el otro sí sabía ubicar.
 */
const EQUIVALENTES: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  à: "a", è: "e", ì: "i", ò: "o", ù: "u",
  â: "a", ê: "e", î: "i", ô: "o", û: "u",
  "\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'", "\u2013": "-", "\u2014": "-",
}

export function plano(texto: string): string {
  return texto.replace(/./gu, (c) => {
    const equivalente = EQUIVALENTES[c]
    if (equivalente) return equivalente
    const minuscula = c.toLowerCase()
    // El reemplazo tiene que ser de un carácter por uno: si baja de caja y
    // crece, se deja como está antes que correr los índices.
    return minuscula.length === c.length ? minuscula : c
  })
}

/**
 * La huella de un titular, para saber si ya se escribió.
 *
 * Sin puntuación, sin tildes, en minúscula y con los espacios colapsados.
 * "Cinco proveedores. Cero responsables." y "Cinco proveedores, cero
 * responsables" son la misma pieza con una coma de diferencia, y convivieron en
 * el banco: comparando el texto tal cual, nada las veía.
 *
 * Vive acá y no en la ruta que la usa porque tiene que dar EXACTAMENTE lo mismo
 * en tres lugares —el dedupe en memoria, la columna `clave` del historial y el
 * backfill en SQL de esa tabla—. Tres normalizaciones parecidas son tres formas
 * de que un duplicado se cuele por la rendija de una de ellas.
 */
export function claveTitular(texto: string): string {
  return plano(texto).replace(/[^a-z0-9]+/g, " ").trim()
}

/** La forma canónica de un titular: un espacio entre palabras y nada en los bordes. */
export function limpiarTitular(texto: string): string {
  return texto.replace(/\s+/g, " ").trim()
}

/**
 * Dónde termina cada oración del titular.
 *
 * No alcanza con partir por punto: "4.400 pantallas" tiene un punto adentro que
 * es un separador de miles, y partir ahí convertía el titular de la muestra en
 * dos oraciones falsas. Un punto corta solo si no está entre dígitos y si lo
 * que sigue es un espacio o el final.
 */
function cortesDeOracion(texto: string): number[] {
  const cortes: number[] = []

  for (let i = 0; i < texto.length; i++) {
    if (!".?!".includes(texto[i])) continue
    if (texto[i] === "." && /\d/.test(texto[i - 1] ?? "") && /\d/.test(texto[i + 1] ?? "")) continue

    // "…?!" cierra una vez sola. La guarda de largo no es decorativa:
    // `".?!".includes("")` es true, y sin ella el cursor no frena en el final.
    let fin = i + 1
    while (fin < texto.length && ".?!".includes(texto[fin])) fin++

    if (fin >= texto.length) {
      cortes.push(fin)
      break
    }
    // "accedra.com.ar" no son tres oraciones: sin espacio detrás, no corta.
    if (texto[fin] !== " ") continue

    cortes.push(fin)
    i = fin - 1
  }

  return cortes
}

/** El titular partido en oraciones, cada una con el signo con el que cierra. */
export function oracionesDe(texto: string): string[] {
  const limpio = limpiarTitular(texto)
  const salida: string[] = []
  let desde = 0

  for (const corte of cortesDeOracion(limpio)) {
    const trozo = limpio.slice(desde, corte).trim()
    if (trozo) salida.push(trozo)
    desde = corte
  }

  const resto = limpio.slice(desde).trim()
  if (resto) salida.push(resto)

  return salida
}

/**
 * Las palabras que no pueden quedar últimas en un titular.
 *
 * Es la lista que faltaba. El corte por palabra entera ya evitaba "…acceso a tu
 * re", pero no evitaba "…400 sucursales. Un", que es la muestra que llegó: la
 * palabra está completa y la frase igual quedó colgada. Un titular que termina
 * en artículo, preposición o conjunción no es un titular corto, es uno roto.
 */
const COLGANTES = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "le", "les",
  "de", "del", "al", "a", "en", "con", "por", "para", "sin", "sobre", "tras",
  "desde", "hasta", "entre", "hacia", "segun", "contra", "durante",
  "y", "e", "o", "u", "ni", "que", "pero", "sino", "porque", "si", "como",
  "cuando", "donde", "mientras", "aunque", "su", "sus", "tu", "tus", "mi",
  "mis", "nuestro", "nuestra", "este", "esta", "ese", "esa", "se", "es", "son",
  "no", "ya", "mas", "muy", "todo", "toda", "cada", "otro", "otra",
])

/**
 * ¿El titular quedó colgado?
 *
 * Terminar en artículo, preposición o conjunción es la firma exacta del defecto
 * que se venía publicando: "…400 sucursales. Un". La palabra está entera, la
 * frase no. Se mira acá y no a ojo porque es lo único que distingue un titular
 * corto de uno roto.
 */
export function terminaColgado(texto: string): boolean {
  const limpio = limpiarTitular(texto)

  // Un titular que cierra con punto, interrogación o exclamación NO está
  // colgado, termine en la palabra que termine: "La validez legal, no." es una
  // frase completa y es uno de los titulares que el Brand Kit da como ejemplo.
  // Es la puntuación la que separa un remate de un recorte — "…400 sucursales.
  // Un" no tiene con qué cerrar.
  if (/[.?!]$/.test(limpio)) return false

  const palabras = limpio.split(" ").filter(Boolean)
  if (palabras.length < 2) return false
  return COLGANTES.has(raiz(palabras[palabras.length - 1]))
}

/** La palabra, sin puntuación ni tildes, para poder mirarla en una lista. */
function raiz(palabra: string): string {
  return plano(palabra).replace(/[^a-z0-9]/g, "")
}

/** Saca la puntuación colgada y el punto final cuando quedó una sola oración. */
function cerrarTitular(texto: string): string {
  const sinCola = texto.replace(/[\s,;:·\u2014\u2013-]+$/, "")
  // La doctrina pide sin punto final si es una sola oración; con dos, el punto
  // del medio es parte de la forma y el último acompaña.
  return oracionesDe(sinCola).length <= 1 ? sinCola.replace(/\.+$/, "") : sinCola
}

/**
 * El titular dentro del presupuesto, SIN cambiar lo que dice.
 *
 * Es el último recurso, no el primero: antes de llegar acá el titular ya se le
 * pidió de vuelta al modelo con la medición concreta delante. Existe para que un
 * fallo de esa reparación no publique una frase colgada.
 *
 * Solo suelta ORACIONES ENTERAS. "4.400 pantallas de firma. 400 sucursales."
 * sigue siendo un titular; "…400 sucursales. Un" no es nada. Y si el titular es
 * una sola oración NO se toca: cortarle palabras a una frase siempre le cambia
 * el sentido —"Las caídas pasaron de 5 por semana a menos de 1 por mes" recortado
 * a "…a menos de 1" dice otra cosa— así que vuelve entero y la pieza queda
 * marcada como fuera de sistema. Un titular unos píxeles más chico es un
 * problema de grilla; uno que dice algo distinto es una pieza tirada.
 */
export function ajustarTitular(texto: string, max: number = HEADLINE_MAX_CARACTERES): string {
  const limpio = limpiarTitular(texto)
  if (!limpio || limpio.length <= max) return limpio

  const oraciones = oracionesDe(limpio)
  if (oraciones.length <= 1) return limpio

  let acumulado = ""
  for (const oracion of oraciones) {
    const tentativa = acumulado ? `${acumulado} ${oracion}` : oracion
    if (tentativa.length > max) break
    acumulado = tentativa
  }

  return acumulado ? cerrarTitular(acumulado) : limpio
}

/**
 * El remate del titular, calculado sin modelo.
 *
 * Es el fallback del azul, y por eso no puede devolver cualquier cosa: tiene
 * que ser un tramo consecutivo del titular, de más de una palabra, que no
 * arranque con un artículo suelto y que NUNCA sea el titular entero —si todo va
 * en azul no hay acento, hay otro color de titular—.
 */
export function remateDe(texto: string): string {
  const limpio = limpiarTitular(texto)
  if (!limpio) return ""

  const palabras = limpio.split(" ")
  // Un titular de una palabra no tiene remate: va entero en azul, que es la
  // única lectura posible.
  if (palabras.length === 1) return limpio

  const oraciones = oracionesDe(limpio)
  if (oraciones.length > 1) {
    const ultima = oraciones[oraciones.length - 1]
    const cuantas = ultima.split(" ").length
    if (cuantas >= 2 && cuantas <= 6) return ultima
  }

  let inicio = Math.max(1, palabras.length - (palabras.length <= 4 ? 2 : 3))
  while (inicio < palabras.length - 1 && COLGANTES.has(raiz(palabras[inicio]))) inicio++

  return palabras.slice(inicio).join(" ")
}

/**
 * Dónde cae el destacado dentro del titular, tal como está escrito ahí.
 *
 * Devuelve el tramo COPIADO DEL TITULAR, no el que mandó el modelo: así lo que
 * se pinta y lo que se imprime son literalmente el mismo texto y el color no
 * puede deformar una palabra.
 *
 * Y si no coincide letra por letra, no se tira: se busca el tramo consecutivo
 * más largo del destacado que sí esté. Casi todos los fallos son de ese tipo
 * —una tilde que el modelo perdió, una coma de más, el recorte de un tope— y
 * hasta ahora cada uno costaba el azul de la pieza entera.
 */
export function ubicarDestacado(titular: string, destacado: string): string {
  const base = limpiarTitular(titular)
  const buscado = limpiarTitular(destacado ?? "")
  if (!base || !buscado) return ""

  const aguja = plano(base)

  const exacto = aguja.indexOf(plano(buscado))
  if (exacto !== -1) return base.slice(exacto, exacto + buscado.length)

  const palabras = buscado.split(" ")
  for (let largo = palabras.length - 1; largo >= 2; largo--) {
    for (let i = 0; i + largo <= palabras.length; i++) {
      const trozo = palabras.slice(i, i + largo).join(" ")
      const donde = aguja.indexOf(plano(trozo))
      if (donde !== -1) return base.slice(donde, donde + trozo.length)
    }
  }

  return ""
}

/**
 * EL tramo azul de la pieza. Nunca vacío salvo que no haya titular.
 *
 * Es la garantía, y por eso es una sola función que usan el derivador y el
 * renderizador: el que propuso el modelo si se puede ubicar, el remate
 * calculado si no. Antes había tres lugares distintos donde el azul podía
 * desaparecer en silencio, y el resultado de cualquiera de los tres era el
 * mismo — el titular entero en blanco.
 */
export function tramoAzul(titular: string, propuesto?: string): string {
  const base = limpiarTitular(titular)
  if (!base) return ""

  const ubicado = ubicarDestacado(base, propuesto ?? "")
  // Un destacado que se comió el titular entero deja la pieza sin blanco: no es
  // un acento, es otro color de titular.
  if (ubicado && (ubicado !== base || base.split(" ").length === 1)) return ubicado

  return remateDe(base)
}
