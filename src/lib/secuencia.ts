/**
 * Qué template le toca a cada pieza del plan.
 *
 * El problema que resuelve: un feed de Instagram donde las once piezas son foto
 * con texto encima se ve horrible, aunque cada una por separado esté bien. Una
 * publicación se juzga sola; un feed se juzga junto.
 *
 * No alcanza con "variá los templates", porque la armonía no se calcula igual en
 * los dos canales:
 *
 * · INSTAGRAM se lee como grilla de tres columnas. La restricción es en dos
 *   dimensiones —lo que está al lado y lo que está arriba— y la fila de tres es
 *   la unidad que el ojo agarra de una.
 *
 * · LINKEDIN se lee como una columna, de a una publicación y con días de por
 *   medio. Nadie compara la pieza 3 con la 6, así que la restricción es mucho
 *   más floja: alcanza con que dos seguidas no se repitan.
 *
 * Es una función pura a propósito: sin base, sin modelo y sin reloj. Las reglas
 * de estética son lo más discutible de todo el calendario, y discutirlas exige
 * poder correrlas con veinte entradas distintas en un test.
 */

import { CANALES, type Canal } from "@/lib/calendario-context"

/**
 * Cuánto pesa la foto de una pieza vista de lejos. Es lo que el algoritmo mira
 * para alternar formatos en la grilla. Vivía en `templates-pieza.ts` (el camino
 * 1, retirado); ahora es del algoritmo, que es su único dueño real.
 */
export type Densidad = "foto" | "mixta" | "texto"

/**
 * Lo mínimo que el repartidor necesita de un template para ubicarlo: su id, su
 * densidad y si su foto es a color (para alternar claro y oscuro en Instagram).
 * Cualquier template más gordo —los del feed— entra igual por su forma.
 */
export type TemplatePieza = {
  id: string
  densidad: Densidad
  fotoColor?: boolean
}

/**
 * Cuántos templates distintos entran en un plan.
 *
 * Con 19 disponibles y 11 piezas, usar 11 distintos da variedad pero no da
 * identidad: una marca se reconoce porque repite. Seis es la banda donde todavía
 * se nota la familia y ya no se nota el molde.
 */
export const MAX_TEMPLATES_POR_PLAN = 6

/** Las columnas de la grilla de Instagram. No es configurable: es Instagram. */
export const COLUMNAS_IG = 3

export type SlotSecuencia = {
  id: string
  fecha: string
  canal: Canal
  /**
   * El template que esta pieza ya tiene y no se puede tocar.
   *
   * Es el caso de las piezas con la imagen ya generada: reasignarles el template
   * dejaría el preview mintiendo —la miniatura diría una composición y el
   * archivo tendría otra— y la única forma de arreglarlo sería volver a gastar
   * la generación. Reordenar acomoda lo que falta alrededor de lo que ya existe.
   */
  fijo?: string | null
}

export type OpcionesSecuencia = {
  /**
   * Cambia el sorteo sin cambiar las reglas. Es lo que hace el botón de
   * reordenar: misma semilla, misma propuesta; otra semilla, otra propuesta
   * igual de válida.
   */
  semilla?: number
  maxDistintos?: number
}

/**
 * El orden en que se VAN A VER las piezas de un canal, que no siempre es el
 * orden de publicación.
 *
 * Instagram muestra lo último arriba a la izquierda, así que el perfil se lee al
 * revés del calendario. Y no es un detalle cosmético: con 11 piezas, agrupar de
 * a tres desde la más vieja da filas distintas que agrupar desde la más nueva
 * —[0,1,2] contra [10,9,8]—, así que calcular la armonía en orden de fecha
 * produciría filas que en el perfil nunca existen.
 */
export function ordenDeLectura<T extends { fecha: string | null }>(piezas: T[], canal: Canal): T[] {
  // `fecha` puede ser null: las piezas del banco no tienen fecha hasta que se
  // programan, y el banco también quiere verse como feed. El sort de JS es
  // estable, así que un lote entero sin fecha conserva el orden en que vino —el
  // de generación— y el reverse de Instagram lo deja con la más nueva arriba,
  // que es exactamente lo que muestra el perfil.
  const porFecha = [...piezas].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))
  return canal === "meta" ? porFecha.reverse() : porFecha
}

/**
 * Le asigna un template a cada slot.
 *
 * Devuelve un Map de slotId a template id. Los slots de canales sin templates
 * disponibles quedan afuera del Map: el que llama tiene que tolerar el faltante,
 * que es lo mismo que tiene que tolerar para el plan viejo que no tiene ninguno
 * asignado.
 */
export function secuenciaRecomendada(
  slots: SlotSecuencia[],
  templates: TemplatePieza[],
  { semilla = 0, maxDistintos = MAX_TEMPLATES_POR_PLAN }: OpcionesSecuencia = {}
): Map<string, string> {
  const asignacion = new Map<string, string>()
  if (templates.length === 0) return asignacion

  for (const canal of CANALES) {
    const delCanal = slots.filter((s) => s.canal === canal)
    if (delCanal.length === 0) continue

    // Se asigna en orden de lectura y no de fecha: las reglas de la grilla
    // hablan de "la misma fila", y la fila la define cómo se ve el perfil.
    const enOrden = ordenDeLectura(delCanal, canal)
    const paleta = paletaPara(canal, templates, maxDistintos, semilla)

    // Los fijos entran a la paleta aunque no los hubiera elegido: están en la
    // grilla igual, así que las reglas tienen que verlos. Lo contrario sería
    // calcular la armonía sobre una grilla que no es la que se ve.
    const porId = new Map(templates.map((t) => [t.id, t]))
    const fijos = enOrden.map((s) => (s.fijo ? (porId.get(s.fijo) ?? null) : null))

    const elegidos = asignarEnOrden(paleta, fijos, canal, semilla)

    elegidos.forEach((templateId, i) => asignacion.set(enOrden[i].id, templateId))
  }

  return asignacion
}

/* ── La paleta del plan ───────────────────────────────────────────────────── */

/**
 * Qué proporción de cada densidad conviene en cada canal.
 *
 * En Instagram lo visual es el canal: una grilla mayormente de placas de texto
 * se ve como un blog, no como una marca. En LinkedIn es al revés — el texto es
 * lo que se lee y la placa argumentativa rinde más que la foto linda.
 */
const MEZCLA: Record<Canal, Densidad[]> = {
  // Se recorre en ciclo al armar la paleta, así que el orden es la prioridad y
  // la repetición es el peso: en meta entran dos "foto" por cada "texto".
  meta: ["foto", "mixta", "foto", "texto", "mixta", "foto"],
  linkedin: ["texto", "mixta", "texto", "foto", "mixta", "texto"],
}

/**
 * Elige los N templates con los que se arma todo el plan de ese canal.
 *
 * Toma de a uno siguiendo la mezcla del canal y, dentro de cada densidad, en un
 * orden barajado por la semilla. Si una densidad se queda sin candidatos se
 * saltea en vez de fallar: con seis templates cargados y una mezcla que pide
 * tres "foto", igual tiene que devolver algo usable.
 */
function paletaPara(
  canal: Canal,
  templates: TemplatePieza[],
  maxDistintos: number,
  semilla: number
): TemplatePieza[] {
  const azar = generador(semilla + canal.length)

  const porDensidad: Record<Densidad, TemplatePieza[]> = {
    foto: barajar(templates.filter((t) => t.densidad === "foto"), azar),
    mixta: barajar(templates.filter((t) => t.densidad === "mixta"), azar),
    texto: barajar(templates.filter((t) => t.densidad === "texto"), azar),
  }

  const mezcla = MEZCLA[canal]
  const paleta: TemplatePieza[] = []
  const tope = Math.min(maxDistintos, templates.length)

  // Dos vueltas: la primera respeta la mezcla, la segunda rellena con lo que
  // haya quedado. Sin la segunda, un set de templates desbalanceado devolvería
  // una paleta más chica que el tope aunque sobraran candidatos.
  for (let i = 0; paleta.length < tope && i < mezcla.length * tope; i++) {
    const siguiente = porDensidad[mezcla[i % mezcla.length]].shift()
    if (siguiente) paleta.push(siguiente)
  }

  if (paleta.length < tope) {
    const yaEstan = new Set(paleta.map((t) => t.id))
    for (const t of barajar(templates, azar)) {
      if (paleta.length >= tope) break
      if (!yaEstan.has(t.id)) paleta.push(t)
    }
  }

  return paleta
}

/* ── La asignación posición por posición ──────────────────────────────────── */

/**
 * Recorre las posiciones y en cada una elige el template menos conflictivo.
 *
 * Greedy y no exhaustivo a propósito: con 11 posiciones y 6 candidatos el
 * espacio completo son 6^11 combinaciones, y el resultado que buscamos no es el
 * óptimo global sino uno que no tenga choques visibles. Las penalizaciones son
 * blandas —siempre gana el mínimo, nunca falla— así que una restricción
 * imposible degrada la propuesta en vez de romperla.
 */
function asignarEnOrden(
  paleta: TemplatePieza[],
  fijos: (TemplatePieza | null)[],
  canal: Canal,
  semilla: number
): string[] {
  if (paleta.length === 0) return []

  const azar = generador(semilla * 31 + canal.length)
  const puestos: TemplatePieza[] = []

  for (let i = 0; i < fijos.length; i++) {
    // Una posición fija no se elige: se acepta. Igual entra en `puestos`, para
    // que las siguientes la vean como vecina y no le choquen al lado.
    const fijo = fijos[i]
    if (fijo) {
      puestos.push(fijo)
      continue
    }

    let mejor = paleta[0]
    let mejorPuntaje = Infinity

    for (const candidato of paleta) {
      // El desempate va acá y no después: sin ruido, dos candidatos empatados
      // resuelven siempre a favor del primero de la paleta y el botón de
      // reordenar devolvería lo mismo con cualquier semilla.
      const puntaje = penalizacion(candidato, puestos, fijos, i, canal) + azar() * 9

      if (puntaje < mejorPuntaje) {
        mejorPuntaje = puntaje
        mejor = candidato
      }
    }

    puestos.push(mejor)
  }

  return puestos.map((t) => t.id)
}

/** Choque duro: repetir el template al lado. Domina cualquier otra suma. */
const CHOQUE = 1000
/** Regla de composición rota: tres fotos en una fila, dos placas juntas. */
const REGLA = 500
/** Preferencia: se puede violar si no queda mejor opción. */
const PREFERENCIA = 40

/**
 * Qué hay alrededor de la posición `i`, mirando para los dos lados.
 *
 * Hacia atrás está todo resuelto. Hacia adelante solo se conocen las posiciones
 * fijas —las piezas con la imagen ya generada—, y hay que mirarlas: sin eso, el
 * greedy le pone "pastilla" a la posición 3 sin enterarse de que la 4 ya es
 * "pastilla" y no se puede mover. Lo encontró un test con 25 semillas; a ojo no
 * aparece, porque exige que se den las dos cosas a la vez.
 */
function vecino(
  j: number,
  i: number,
  puestos: TemplatePieza[],
  fijos: (TemplatePieza | null)[]
): TemplatePieza | null {
  if (j < 0 || j >= fijos.length || j === i) return null
  return j < i ? (puestos[j] ?? null) : fijos[j]
}

function penalizacion(
  candidato: TemplatePieza,
  puestos: TemplatePieza[],
  fijos: (TemplatePieza | null)[],
  i: number,
  canal: Canal
): number {
  let total = 0

  // Común a los dos canales: nunca dos iguales pegadas —ni con la de antes ni
  // con la de después— y las repeticiones separadas lo más posible.
  if (vecino(i - 1, i, puestos, fijos)?.id === candidato.id) total += CHOQUE
  if (vecino(i + 1, i, puestos, fijos)?.id === candidato.id) total += CHOQUE

  const ultimoUso = puestos.map((t) => t.id).lastIndexOf(candidato.id)
  if (ultimoUso !== -1) {
    const distancia = i - ultimoUso
    if (distancia < 4) total += (4 - distancia) * PREFERENCIA
  }

  total += canal === "meta"
    ? penalizacionGrilla(candidato, puestos, fijos, i)
    : penalizacionLineal(candidato, puestos, fijos, i)

  return total
}

/**
 * Instagram: la fila de tres es la unidad.
 *
 * Tres fotos plenas seguidas pesan y la grilla se vuelve una pared; dos placas
 * de solo texto en la misma fila se ven como un hueco. Y la columna importa
 * también —la pieza de arriba está pegada a la de abajo—, por eso se mira
 * i - COLUMNAS_IG.
 */
function penalizacionGrilla(
  candidato: TemplatePieza,
  puestos: TemplatePieza[],
  fijos: (TemplatePieza | null)[],
  i: number
): number {
  let total = 0

  // La fila entera, no solo lo que ya se puso: las posiciones de más adelante
  // cuentan si están fijas.
  const inicioFila = i - (i % COLUMNAS_IG)
  const fila: TemplatePieza[] = []
  for (let j = inicioFila; j < inicioFila + COLUMNAS_IG; j++) {
    const t = vecino(j, i, puestos, fijos)
    if (t) fila.push(t)
  }

  if (fila.some((t) => t.id === candidato.id)) total += CHOQUE

  const conCandidato = [...fila, candidato]
  if (conCandidato.filter((t) => t.densidad === "foto").length > 2) total += REGLA
  if (conCandidato.filter((t) => t.densidad === "texto").length > 1) total += REGLA

  // Alternar claro y oscuro. Las piezas a color real levantan la grilla; tres
  // navy seguidas la apagan. Es preferencia y no regla: forzarla produciría un
  // damero, que es su propio tipo de monotonía.
  const claro = Boolean(candidato.fotoColor)
  const anterior = vecino(i - 1, i, puestos, fijos)
  if (anterior && Boolean(anterior.fotoColor) === claro) total += PREFERENCIA * 0.75
  const arriba = vecino(i - COLUMNAS_IG, i, puestos, fijos)
  if (arriba && Boolean(arriba.fotoColor) === claro) total += PREFERENCIA * 0.5

  return total
}

/**
 * LinkedIn: lectura lineal, con días de por medio.
 *
 * Lo único que se compara es lo que está cerca, así que la ventana es de tres.
 * Dos placas de solo texto seguidas aburren; más allá de eso, nadie se acuerda
 * de qué formato tenía la pieza de la semana pasada.
 */
function penalizacionLineal(
  candidato: TemplatePieza,
  puestos: TemplatePieza[],
  fijos: (TemplatePieza | null)[],
  i: number
): number {
  let total = 0

  // Las tres ventanas de tres que contienen a `i`. Mirar solo hacia atrás
  // dejaría pasar dos placas seguidas cuando la segunda es una pieza fija.
  for (const desde of [i - 2, i - 1, i]) {
    let placas = candidato.densidad === "texto" ? 1 : 0
    for (let j = desde; j < desde + 3; j++) {
      if (vecino(j, i, puestos, fijos)?.densidad === "texto") placas++
    }
    if (placas > 1) {
      total += REGLA
      break
    }
  }

  const previas = [vecino(i - 2, i, puestos, fijos), vecino(i - 1, i, puestos, fijos)]
  // Tres densidades iguales al hilo: no rompe nada, pero se nota.
  if (previas.every((t) => t?.densidad === candidato.densidad)) total += PREFERENCIA * 2

  return total
}

/* ── Azar reproducible ────────────────────────────────────────────────────── */

/**
 * Math.random no sirve acá: la propuesta tiene que ser la misma cada vez que se
 * dibuja el mismo plan, o el preview del feed mostraría un orden distinto en
 * cada render. Con semilla, reordenar es pedir otro número y nada más.
 *
 * mulberry32: treinta y dos bits, sin dependencias y de sobra para elegir entre
 * seis candidatos.
 */
function generador(semilla: number): () => number {
  let a = Math.trunc(semilla) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function barajar<T>(items: T[], azar: () => number): T[] {
  const copia = [...items]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}
