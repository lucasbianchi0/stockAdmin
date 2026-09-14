/**
 * Dónde vive el historial del asistente en el navegador, y cómo se borra.
 *
 * El hilo se espeja en `sessionStorage` para sobrevivir a una recarga. Eso tiene
 * un costo en una computadora compartida: la pestaña sigue viva después de
 * cerrar sesión, y lo que el asistente le contestó a un administrador —totales
 * de cobros, de facturación— queda legible desde las herramientas del navegador
 * para quien entre después, aunque tenga otro acceso.
 *
 * Por eso se borra en dos momentos: al cerrar sesión, y al montar el asistente
 * de otro usuario (por si el anterior cerró la pestaña de sesión sin salir).
 *
 * Cada agente tiene su propio hilo —cambiar de agente no mezcla la auditoría
 * financiera con el calendario de contenido—, colgado de la clave del usuario.
 */

const PREFIJO = "accedra-asistente:"

export const claveHistorial = (usuarioId: string) => `${PREFIJO}${usuarioId}`

/** El hilo de un agente, dentro de la clave del usuario. */
export const claveHilo = (clave: string, agente: string) => `${clave}:${agente}`

/** El agente elegido por última vez, para volver a abrir en el mismo. */
export const claveAgente = (clave: string) => `${clave}:agente`

/**
 * Borra los hilos de agentes que ya no existen. Cuando un agente se da de baja
 * o se fusiona con otro, su clave quedaría en la pestaña para siempre.
 */
export function borrarHilosHuerfanos(clave: string, vigentes: readonly string[]): void {
  try {
    const validas = new Set([claveAgente(clave), ...vigentes.map((id) => claveHilo(clave, id))])
    const sobrantes: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(`${clave}:`) && !validas.has(k)) sobrantes.push(k)
    }
    sobrantes.forEach((k) => sessionStorage.removeItem(k))
  } catch {}
}

/** Borra los historiales guardados. Con `salvo`, deja los de ese usuario. */
export function borrarHistoriales(salvo?: string): void {
  try {
    const claves: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k?.startsWith(PREFIJO)) continue
      if (salvo && (k === salvo || k.startsWith(`${salvo}:`))) continue
      claves.push(k)
    }
    claves.forEach((k) => sessionStorage.removeItem(k))
  } catch {}
}
