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
export const DESTACADO_GUIA = `"destacado": el tramo del titular que va en azul. Es el REMATE: la parte que da vuelta el sentido, no un adjetivo suelto ni la palabra técnica.
En "El problema no es el que entra. Es el que ya tiene la llave" el remate es "Es el que ya tiene la llave", no "llave".
De 2 a 5 palabras, consecutivas, copiadas LETRA POR LETRA del titular tal como lo escribiste. Si no hay un remate claro, devolvelo vacío: el titular entero en blanco es mejor que un azul puesto en cualquier lado.`

/**
 * El titular cortado en líneas, sin llamar a un modelo.
 *
 * El corte bueno es semántico —se parte donde respira la frase— y eso lo hace
 * mejor el modelo. Esto es la red: un titular que llega sin cortar se reparte en
 * líneas parejas antes que entrar como una sola línea de catorce palabras, que
 * el generador de imágenes escribe en cuerpo 12 y queda ilegible.
 */
export function cortarHeadline(texto: string): string[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).slice(0, HEADLINE_MAX_PALABRAS)
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
