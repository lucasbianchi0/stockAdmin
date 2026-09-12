"use client"

import * as React from "react"

import type { Acceso } from "@/lib/permisos"
import { MAX_LARGO, MAX_LARGO_RESPUESTA, MAX_MENSAJES } from "@/lib/chatbot/limites"
import { Launcher } from "./launcher"
import { Panel } from "./panel"

/**
 * El estado del asistente.
 *
 * Se monta en el shell de la app, que no se remonta al cambiar de ruta: la
 * conversación sobrevive a navegar, que es justamente para lo que más se usa
 * —preguntar, ir a la pantalla que indicó, volver—. Las páginas no saben que el
 * chat existe.
 *
 * El hilo se espeja en `sessionStorage`: sobrevive a una recarga y muere al
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

type Valor = {
  acceso: Acceso
  mensajes: Mensaje[]
  escribiendo: boolean
  abierto: boolean
  ampliado: boolean
  abrir: () => void
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

const nuevoId = () => Math.random().toString(36).slice(2, 10)

export function ChatbotProvider({ usuarioId, acceso }: { usuarioId: string; acceso: Acceso }) {
  const clave = `accedra-asistente:${usuarioId}`

  // En el inicializador y no en un efecto con setState: un efecto que setea
  // estado al montar dispara un render de más. El panel arranca cerrado, así
  // que lo que dibuja el servidor es igual con o sin historial guardado.
  const [mensajes, setMensajes] = React.useState<Mensaje[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const guardado = JSON.parse(sessionStorage.getItem(clave) ?? "[]")
      return Array.isArray(guardado) ? guardado : []
    } catch {
      return []
    }
  })
  const [escribiendo, setEscribiendo] = React.useState(false)
  // Después de una recarga vuelve cerrado a propósito: la persona estaba
  // mirando la página, no el chat.
  const [abierto, setAbierto] = React.useState(false)
  const [ampliado, setAmpliado] = React.useState(false)

  const abortRef = React.useRef<AbortController | null>(null)
  const mensajesRef = React.useRef(mensajes)
  mensajesRef.current = mensajes

  React.useEffect(() => {
    try {
      // Sin la respuesta a medio escribir: si se recarga en el medio, lo que
      // quedó es un mensaje cortado que parece completo.
      sessionStorage.setItem(clave, JSON.stringify(mensajes.filter((m) => m.texto)))
    } catch {}
  }, [clave, mensajes])

  const actualizar = React.useCallback((id: string, cambio: (m: Mensaje) => Mensaje) => {
    setMensajes((prev) => prev.map((m) => (m.id === id ? cambio(m) : m)))
  }, [])

  const enviar = React.useCallback(
    async (crudo: string) => {
      const texto = crudo.trim().slice(0, MAX_LARGO)
      if (!texto) return

      // Sin esto, dos respuestas superpuestas escriben sobre el mismo mensaje.
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const pregunta: Mensaje = { id: nuevoId(), rol: "user", texto }
      const respuesta: Mensaje = { id: nuevoId(), rol: "assistant", texto: "" }

      // Los errores y las respuestas vacías no viajan: no son conversación.
      const previos = mensajesRef.current.filter((m) => m.texto && !m.error)
      let historial = [...previos, pregunta].slice(-MAX_MENSAJES)
      while (historial.length > 0 && historial[0].rol !== "user") historial = historial.slice(1)

      setMensajes((prev) => [...prev.filter((m) => m.texto), pregunta, respuesta])
      setEscribiendo(true)

      const fallar = (mensaje: string) =>
        actualizar(respuesta.id, (m) => ({ ...m, texto: m.texto || mensaje, error: !m.texto }))

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
              actualizar(respuesta.id, (m) => ({ ...m, texto: m.texto + valor }))
            } else if (evento === "error") {
              const mensaje = (valor as { mensaje?: string }).mensaje ?? "Se me cortó la respuesta."
              actualizar(respuesta.id, (m) =>
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
          // Una respuesta que no llegó a escribir nada no queda como burbuja vacía.
          setMensajes((prev) => prev.filter((m) => m.id !== respuesta.id || m.texto))
        }
      }
    },
    [actualizar]
  )

  const detener = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setEscribiendo(false)
    setMensajes((prev) => prev.filter((m) => m.texto))
  }, [])

  const reiniciar = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setEscribiendo(false)
    setMensajes([])
  }, [])

  const valor: Valor = {
    acceso,
    mensajes,
    escribiendo,
    abierto,
    ampliado,
    abrir: () => setAbierto(true),
    cerrar: () => setAbierto(false),
    setAmpliado,
    enviar,
    detener,
    reiniciar,
  }

  return (
    <Contexto.Provider value={valor}>
      <Launcher />
      {abierto && <Panel />}
    </Contexto.Provider>
  )
}
