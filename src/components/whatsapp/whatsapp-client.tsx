"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Download, MessageCircle, Search, Smartphone, X } from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { ChatHilo } from "@/components/whatsapp/chat-hilo"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import { normalizarTexto, palabrasDeBusqueda } from "@/lib/busqueda"
import { telefonoLegible, type ConversacionWhatsapp, type MensajeWhatsapp } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

/**
 * La bandeja de WhatsApp: todo lo que le escriben al número de Accedra, con lo
 * que el equipo contestó desde el celular. A la izquierda los chats, el más
 * reciente arriba; a la derecha el elegido.
 *
 * Es para leer y buscar, no para contestar: eso se sigue haciendo desde el
 * teléfono, y lo contestado aparece acá solo.
 */

const URL_LISTA = "/api/marketing/whatsapp"
const ZONA = "America/Argentina/Buenos_Aires"

function cuando(iso: string | null) {
  if (!iso) return ""
  const f = new Date(iso)
  const hoy = new Date()
  const mismoDia = f.toLocaleDateString("es-AR", { timeZone: ZONA }) === hoy.toLocaleDateString("es-AR", { timeZone: ZONA })
  return mismoDia
    ? f.toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" })
    : f.toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "short" })
}

const nombreDe = (c: ConversacionWhatsapp) =>
  c.contacto?.nombre || c.nombrePerfil || telefonoLegible(c.telefono)

export function WhatsappClient() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState("")
  const [elegida, setElegida] = useState<string | null>(null)

  const lista = useQuery({
    queryKey: claveDe("marketing", URL_LISTA),
    queryFn: ({ signal }) =>
      pedirJson<{ conversaciones: ConversacionWhatsapp[]; conectado: boolean }>(URL_LISTA, { signal }),
    refetchInterval: 30_000,
  })

  const importar = useMutation({
    mutationFn: () =>
      pedirJson<{ leidos: number; nuevos: number }>("/api/marketing/whatsapp/importar", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.nuevos ? `${r.nuevos} mensajes nuevos` : "Ya estaba todo al día")
      void qc.invalidateQueries({ queryKey: ["marketing", "url"] })
    },
    onError: (e) => toast.error(mensajeError(e, "No se pudo traer el historial")),
  })

  const conversaciones = useMemo(() => lista.data?.conversaciones ?? [], [lista.data])
  const visibles = useMemo(() => {
    const palabras = palabrasDeBusqueda(busqueda)
    if (!palabras.length) return conversaciones
    return conversaciones.filter((c) => {
      const texto = normalizarTexto(
        [nombreDe(c), c.nombrePerfil, c.contacto?.empresa, c.telefono, c.ultimoTexto].filter(Boolean).join(" ")
      )
      return palabras.every((p) => texto.includes(p))
    })
  }, [conversaciones, busqueda])

  const actual = conversaciones.find((c) => c.id === elegida) ?? null

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Todo lo que le escriben al WhatsApp de Accedra y lo que se contesta desde el celular. Cada persona queda en Contactos."
        back={{ href: "/marketing", label: "Marketing" }}
        actions={
          lista.data?.conectado ? (
            <Button variant="outline" size="sm" onClick={() => importar.mutate()} disabled={importar.isPending}>
              <Download className="h-3.5 w-3.5" />
              {importar.isPending ? "Trayendo…" : "Traer historial"}
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        {lista.isPending ? (
          <LoadingState label="Cargando chats…" />
        ) : lista.isError ? (
          <ErrorState message={mensajeError(lista.error)} onRetry={() => lista.refetch()} />
        ) : conversaciones.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={lista.data.conectado ? "Todavía no llegó ningún mensaje" : "WhatsApp todavía no está conectado"}
            description={
              lista.data.conectado
                ? "Cuando alguien le escriba al número de Accedra va a aparecer acá. Para traer los chats anteriores, tocá «Traer historial»."
                : "Falta conectar el número de Accedra en Kapso. Una vez conectado, cada mensaje aparece acá solo y la persona se carga en Contactos."
            }
          />
        ) : (
          <div className="grid h-[calc(100dvh-190px)] min-h-[420px] overflow-hidden rounded-xl border border-line bg-surface shadow-e1 md:grid-cols-[320px_1fr]">
            <aside className={cn("flex min-h-0 flex-col border-line md:border-r", actual && "hidden md:flex")}>
              <div className="border-b border-line p-2.5">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre, empresa o número"
                    className="h-8 w-full rounded-lg border border-line bg-surface-subtle pl-8 pr-7 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-brand-300 focus:outline-none"
                  />
                  {busqueda && (
                    <button
                      type="button"
                      onClick={() => setBusqueda("")}
                      aria-label="Borrar búsqueda"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:text-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </label>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {visibles.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setElegida(c.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-b border-line/70 px-3 py-2.5 text-left transition-colors hover:bg-surface-subtle",
                        c.id === elegida && "bg-brand-50/60 hover:bg-brand-50/60"
                      )}
                    >
                      <Avatar id={c.contacto?.id ?? c.id} nombre={nombreDe(c)} size="md" className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-ink">{nombreDe(c)}</span>
                          <span className="num shrink-0 text-[10.5px] text-ink-faint">{cuando(c.ultimoMensajeAt)}</span>
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-muted">
                          {c.contacto?.empresa ?? telefonoLegible(c.telefono)}
                        </span>
                        {c.ultimoTexto && (
                          <span className="mt-0.5 block truncate text-[12px] text-ink-secondary">
                            {c.ultimaDireccion === "saliente" && <span className="text-ink-faint">Vos: </span>}
                            {c.ultimoTexto}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
                {visibles.length === 0 && (
                  <li className="px-4 py-8 text-center text-[12.5px] text-ink-muted">Ningún chat coincide.</li>
                )}
              </ul>
            </aside>

            <section className={cn("flex min-h-0 flex-col", !actual && "hidden md:flex")}>
              {actual ? (
                <Conversacion conversacion={actual} onVolver={() => setElegida(null)} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-ink-muted">
                  <MessageCircle className="h-6 w-6 text-ink-faint" />
                  <p className="text-[13px]">Elegí un chat para leerlo.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </PageBody>
    </>
  )
}

function Conversacion({ conversacion: c, onVolver }: { conversacion: ConversacionWhatsapp; onVolver: () => void }) {
  const url = `/api/marketing/whatsapp/${c.id}`
  const q = useQuery({
    queryKey: claveDe("marketing", `${url}?n=${c.mensajes}`),
    queryFn: ({ signal }) => pedirJson<{ mensajes: MensajeWhatsapp[] }>(url, { signal }),
  })

  // Como en el celular: se abre en el último mensaje.
  const fondo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (fondo.current) fondo.current.scrollTop = fondo.current.scrollHeight
  }, [q.data])

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a los chats"
          className="-ml-1 rounded-md p-1 text-ink-muted hover:bg-surface-muted hover:text-ink md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar id={c.contacto?.id ?? c.id} nombre={nombreDe(c)} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{nombreDe(c)}</p>
          <p className="num truncate text-[11.5px] text-ink-muted">
            {telefonoLegible(c.telefono)}
            {c.contacto && ` · ${c.contacto.empresa}`}
          </p>
        </div>
        {c.contacto && (
          <Link
            href={`/marketing/contactos?q=${encodeURIComponent(c.contacto.nombre || c.telefono)}`}
            className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
          >
            Ver contacto
          </Link>
        )}
      </header>
      <div ref={fondo} className="min-h-0 flex-1 overflow-y-auto bg-surface-subtle px-4 py-3">
        {q.isPending ? (
          <LoadingState label="Cargando mensajes…" />
        ) : q.isError ? (
          <ErrorState message={mensajeError(q.error)} onRetry={() => q.refetch()} />
        ) : (
          <ChatHilo mensajes={q.data.mensajes} />
        )}
      </div>
      <p className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-[11.5px] text-ink-muted">
        <Smartphone className="h-3 w-3" />
        Se contesta desde el celular; la respuesta aparece acá sola.
      </p>
    </>
  )
}
