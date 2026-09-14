"use client"

import * as React from "react"

import type { Acceso } from "@/lib/permisos"
import {
  HISTORIAL_TRAS_RECORTE,
  MAX_HISTORIAL,
  MAX_LARGO,
  MAX_LARGO_RESPUESTA,
  MAX_MENSAJES,
  MENSAJES_TRAS_RECORTE,
} from "@/lib/chatbot/limites"
import {
  borrarHilosHuerfanos,
  borrarHistoriales,
  claveAgente,
  claveHilo,
  claveHistorial,
} from "@/lib/chatbot/historial"
import {
  AGENTE_IDS,
  agentePorId,
  agentesPara,
  esAgenteId,
  type Agente,
  type AgenteId,
} from "@/lib/chatbot/agentes"
import { Launcher } from "./launcher"
import { Panel } from "./panel"

/**
 * El estado del asistente.
 *
 * Envuelve el shell de la app, que no se remonta al cambiar de ruta: la
 * conversación sobrevive a navegar, que es justamente para lo que más se usa
 * —preguntar, ir a la pantalla que indicó, volver—. Las páginas no saben que el
 * chat existe; la barra lateral sí, para abrirlo en pantalla completa desde
 * "Agentes".
 *
 * Cada agente tiene su propio hilo. Cambiar de agente no borra nada: se vuelve
 * y la conversación sigue ahí.
 *
 * Los hilos se espejan en `sessionStorage`: sobreviven a una recarga y mueren al
 * cerrar la pestaña. No hay tabla: nadie —ni la empresa— lee después lo que
 * alguien le preguntó. La clave lleva el id del usuario para que, si en la
 * misma pestaña entra otra persona, no herede la conversación.
 */

export type Mensaje = {
  id: string
  rol: "user" | "assistant"
  texto: string
  error?: boolean
}

type Hilos = Partial<Record<AgenteId, Mensaje[]>>

type Valor = {
  acceso: Acceso
  agentes: Agente[]
  agente: Agente
  elegirAgente: (id: AgenteId) => void
  mensajes: Mensaje[]
  escribiendo: boolean
  /** Lo que está haciendo ahora mismo, si usó una herramienta: "Anotando el
   *  ticket". `null` = está escribiendo y nada más. */
  paso: string | null
  abierto: boolean
  ampliado: boolean
  abrir: () => void
  /** Lo que hace "Agentes" en la barra lateral: el chat entero, a pantalla completa. */
  abrirAgentes: () => void
  cerrar: () => void
  setAmpliado: (v: boolean) => void
  enviar: (texto: string) => void
  detener: () => void
  reiniciar: () => void
}

const Contexto = React.createContext<Valor | null>(null)

export function useChatbot(): Valor {
  const v = React.useContext(Contexto)
  if (!v) throw new Error("useChatbot fuera de ChatbotProvider")
  return v
}

/** Para lo que existe con o sin asistente, como la barra lateral. */
export function useChatbotOpcional(): Valor | null {
  return React.useContext(Contexto)
}

const nuevoId = () => Math.random().toString(36).slice(2, 10)

const largoEnviado = (m: Mensaje) =>
  m.rol === "user" ? m.texto.length : Math.min(m.texto.length, MAX_LARGO_RESPUESTA)

/**
 * Qué parte del hilo viaja. Arranca donde arrancó el pedido anterior y sólo
 * corre el principio cuando se pasa un techo, y entonces lo corre de a mucho:
 * así el prefijo que la API tiene en caché sigue siendo el mismo durante
 * varios mensajes (ver limites.ts). Siempre empieza en un mensaje de la persona.
 */
function recortarHistorial(todos: Mensaje[], desdeId: string | undefined) {
  const suma = (i: number) => todos.slice(i).reduce((n, m) => n + largoEnviado(m), 0)
  const ultimo = todos.length - 1

  let inicio = desdeId ? Math.max(0, todos.findIndex((m) => m.id === desdeId)) : 0
  if (todos.length - inicio > MAX_MENSAJES || suma(inicio) > MAX_HISTORIAL) {
    while (
      inicio < ultimo &&
      (todos.length - inicio > MENSAJES_TRAS_RECORTE || suma(inicio) > HISTORIAL_TRAS_RECORTE)
    ) {
      inicio++
    }
  }
  while (inicio < ultimo && todos[inicio].rol !== "user") inicio++

  return todos.slice(inicio)
}

function leerHilo(clave: string): Mensaje[] {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(clave) ?? "[]")
    return Array.isArray(guardado) ? guardado : []
  } catch {
    return []
  }
}

export function ChatbotProvider({
  usuarioId,
  acceso,
  children,
}: {
  usuarioId: string
  acceso: Acceso
  children: React.ReactNode
}) {
  const clave = claveHistorial(usuarioId)
  const agentes = React.useMemo(() => agentesPara(acceso), [acceso])

  // Si en esta pestaña quedó el historial de otra persona —entró sin que la
  // anterior cerrara sesión—, se borra: no es suyo y puede tener datos de otro
  // acceso.
  React.useEffect(() => {
    borrarHistoriales(clave)
    borrarHilosHuerfanos(clave, AGENTE_IDS)
  }, [clave])

  // En el inicializador y no en un efecto con setState: un efecto que setea
  // estado al montar dispara un render de más. El panel arranca cerrado, así
  // que lo que dibuja el servidor es igual con o sin historial guardado.
  const [hilos, setHilos] = React.useState<Hilos>(() => {
    if (typeof window === "undefined") return {}
    const leidos: Hilos = {}
    for (const a of agentesPara(acceso)) {
      const hilo = leerHilo(claveHilo(clave, a.id))
      // El hilo de antes de que hubiera agentes vivía en la clave del usuario.
      leidos[a.id] = hilo.length || a.id !== "asistente" ? hilo : leerHilo(clave)
    }
    return leidos
  })
  const [agenteId, setAgenteId] = React.useState<AgenteId>(() => {
    if (typeof window === "undefined") return "asistente"
    try {
      const guardado = sessionStorage.getItem(claveAgente(clave))
      if (esAgenteId(guardado) && agentesPara(acceso).some((a) => a.id === guardado)) return guardado
    } catch {}
    return "asistente"
  })
  const [escribiendo, setEscribiendo] = React.useState(false)
  const [paso, setPaso] = React.useState<string | null>(null)
  // Después de una recarga vuelve cerrado a propósito: la persona estaba
  // mirando la página, no el chat.
  const [abierto, setAbierto] = React.useState(false)
  const [ampliado, setAmpliado] = React.useState(false)

  const abortRef = React.useRef<AbortController | null>(null)
  const hilosRef = React.useRef(hilos)
  hilosRef.current = hilos
  const agenteRef = React.useRef(agenteId)
  agenteRef.current = agenteId
  /** Por agente, el mensaje con el que arrancó el último historial enviado. */
  const iniciosRef = React.useRef<Partial<Record<AgenteId, string>>>({})

  React.useEffect(() => {
    try {
      // Sin la respuesta a medio escribir: si se recarga en el medio, lo que
      // quedó es un mensaje cortado que parece completo.
      for (const [id, mensajes] of Object.entries(hilos)) {
        sessionStorage.setItem(claveHilo(clave, id), JSON.stringify((mensajes ?? []).filter((m) => m.texto)))
      }
      sessionStorage.removeItem(clave)
    } catch {}
  }, [clave, hilos])

  React.useEffect(() => {
    try {
      sessionStorage.setItem(claveAgente(clave), agenteId)
    } catch {}
  }, [clave, agenteId])

  const cambiarHilo = React.useCallback((agente: AgenteId, cambio: (prev: Mensaje[]) => Mensaje[]) => {
    setHilos((prev) => ({ ...prev, [agente]: cambio(prev[agente] ?? []) }))
  }, [])

  const enviar = React.useCallback(
    async (crudo: string) => {
      const texto = crudo.trim().slice(0, MAX_LARGO)
      if (!texto) return

      // La respuesta va al hilo del agente con el que se preguntó, aunque la
      // persona cambie de agente mientras llega.
      const agente = agenteRef.current

      // Sin esto, dos respuestas superpuestas escriben sobre el mismo mensaje.
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const pregunta: Mensaje = { id: nuevoId(), rol: "user", texto }
      const respuesta: Mensaje = { id: nuevoId(), rol: "assistant", texto: "" }

      // Los errores y las respuestas vacías no viajan: no son conversación.
      const previos = (hilosRef.current[agente] ?? []).filter((m) => m.texto && !m.error)
      const historial = recortarHistorial([...previos, pregunta], iniciosRef.current[agente])
      iniciosRef.current[agente] = historial[0].id

      cambiarHilo(agente, (prev) => [...prev.filter((m) => m.texto), pregunta, respuesta])
      setEscribiendo(true)

      const actualizar = (cambio: (m: Mensaje) => Mensaje) =>
        cambiarHilo(agente, (prev) => prev.map((m) => (m.id === respuesta.id ? cambio(m) : m)))
      const fallar = (mensaje: string) =>
        actualizar((m) => ({ ...m, texto: m.texto || mensaje, error: !m.texto }))

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agente,
            messages: historial.map((m) => ({
              role: m.rol,
              content: m.rol === "user" ? m.texto : m.texto.slice(0, MAX_LARGO_RESPUESTA),
            })),
          }),
          signal: ctrl.signal,
        })

        if (!res.ok || !res.body) {
          const cuerpo = await res.json().catch(() => null)
          fallar(cuerpo?.error ?? "No pude responder. Probá de nuevo.")
          return
        }

        // EventSource no sirve: es GET y no lleva el historial en el cuerpo.
        // Se lee a mano y se bufferea, porque un evento puede llegar partido
        // entre dos pedazos.
        const lector = res.body.getReader()
        const dec = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await lector.read()
          if (done) break
          buffer += dec.decode(value, { stream: true })

          const bloques = buffer.split("\n\n")
          buffer = bloques.pop() ?? ""

          for (const bloque of bloques) {
            const evento = /^event: (.+)$/m.exec(bloque)?.[1]
            const dato = /^data: (.+)$/m.exec(bloque)?.[1]
            if (!evento || !dato) continue

            let valor: unknown
            try {
              valor = JSON.parse(dato)
            } catch {
              continue
            }

            if (evento === "texto" && typeof valor === "string") {
              actualizar((m) => ({ ...m, texto: m.texto + valor }))
            } else if (evento === "paso") {
              const t = (valor as { texto?: string | null }).texto
              setPaso(typeof t === "string" && t ? t : null)
            } else if (evento === "error") {
              const mensaje = (valor as { mensaje?: string }).mensaje ?? "Se me cortó la respuesta."
              actualizar((m) =>
                m.texto
                  ? { ...m, texto: `${m.texto}\n\n${mensaje}` }
                  : { ...m, texto: mensaje, error: true }
              )
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") fallar("Se cortó la conexión. Probá de nuevo.")
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null
          setEscribiendo(false)
          // Pase lo que pase —corte, error, cancelación—: el rótulo no puede
          // quedar diciendo que está anotando algo que ya terminó.
          setPaso(null)
          // Una respuesta que no llegó a escribir nada no queda como burbuja vacía.
          cambiarHilo(agente, (prev) => prev.filter((m) => m.id !== respuesta.id || m.texto))
        }
      }
    },
    [cambiarHilo]
  )

  const detener = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setEscribiendo(false)
    setPaso(null)
    setHilos((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, m]) => [id, (m ?? []).filter((x) => x.texto)]))
    )
  }, [])

  const elegirAgente = React.useCallback(
    (id: AgenteId) => {
      if (id === agenteRef.current || !agentes.some((a) => a.id === id)) return
      // Una respuesta a medio escribir no sigue llegando por detrás del otro agente.
      if (abortRef.current) detener()
      setAgenteId(id)
    },
    [agentes, detener]
  )

  const reiniciar = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setEscribiendo(false)
    setPaso(null)
    cambiarHilo(agenteRef.current, () => [])
  }, [cambiarHilo])

  const valor: Valor = {
    acceso,
    agentes,
    agente: agentePorId(agenteId),
    elegirAgente,
    mensajes: hilos[agenteId] ?? [],
    escribiendo,
    paso,
    abierto,
    ampliado,
    abrir: () => setAbierto(true),
    abrirAgentes: () => {
      setAbierto(true)
      setAmpliado(true)
    },
    cerrar: () => setAbierto(false),
    setAmpliado,
    enviar,
    detener,
    reiniciar,
  }

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Launcher />
      {abierto && <Panel />}
    </Contexto.Provider>
  )
}
