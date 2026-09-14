"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Award, Check, ClipboardPaste, Loader2, Pencil, Printer, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { CertificadoEscalado } from "@/components/marketing/certificado-escalado"
import { InscriptosPanel } from "@/components/marketing/inscriptos-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  horasTexto,
  nombrePropio,
  parsearAsistentes,
  type Asistente,
  type BorradorEvento,
  type Marca,
} from "@/lib/marketing/eventos"
import { cn } from "@/lib/utils"

/**
 * Los que asistieron, y sus certificados.
 *
 * El caso real es una planilla: la lista de inscriptos de Forms o el Excel que
 * pasó el cliente, con los que vinieron marcados. Por eso la carga principal es
 * pegar, no un formulario de a uno: se pega, se ve cómo quedó interpretado —con
 * los nombres ya capitalizados, que es como van a salir impresos— y recién ahí
 * se confirma.
 *
 * Todo lo de esta pestaña se guarda al instante: son filas, no parte de la
 * ficha. Lo que sí depende de la ficha es la impresión, y por eso se bloquea si
 * el certificado tiene cambios sin guardar.
 */
export function AsistentesPanel({
  eventoId,
  evento,
  marcas,
  asistentes,
  onAsistentes,
  sucio,
  onIrAlCertificado,
}: {
  eventoId: string
  evento: BorradorEvento
  marcas: Marca[]
  asistentes: Asistente[]
  onAsistentes: (a: Asistente[]) => void
  sucio: boolean
  onIrAlCertificado: () => void
}) {
  const [pegado, setPegado] = useState("")
  const [agregando, setAgregando] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<string | null>(null)
  const [viendo, setViendo] = useState<Asistente | null>(null)

  const interpretados = useMemo(() => parsearAsistentes(pegado), [pegado])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return asistentes
    return asistentes.filter((a) => [a.nombre, a.email, a.empresa, a.codigo].some((x) => x.toLowerCase().includes(q)))
  }, [asistentes, busqueda])

  const todosMarcados = visibles.length > 0 && visibles.every((a) => seleccion.has(a.id))

  /* ── Acciones ──────────────────────────────────────────────────────────── */

  async function agregar() {
    if (interpretados.length === 0) return
    setAgregando(true)
    try {
      const r = await fetch(`/api/marketing/eventos/${eventoId}/asistentes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asistentes: interpretados }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "No se pudieron cargar")
      const nuevos = d.asistentes as Asistente[]
      onAsistentes([...asistentes, ...nuevos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")))
      setPegado("")
      const salteados = Number(d.salteados) || 0
      toast.success(
        `${nuevos.length} certificado${nuevos.length === 1 ? "" : "s"} emitido${nuevos.length === 1 ? "" : "s"}` +
          (salteados ? ` · ${salteados} ya estaba${salteados === 1 ? "" : "n"} cargado${salteados === 1 ? "" : "s"}` : "")
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar")
    } finally {
      setAgregando(false)
    }
  }

  async function guardarFila(a: Asistente, cambios: Pick<Asistente, "nombre" | "email" | "empresa" | "horas">) {
    const r = await fetch(`/api/marketing/eventos/${eventoId}/asistentes/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error ?? "No se pudo guardar")
    onAsistentes(asistentes.map((x) => (x.id === a.id ? (d.asistente as Asistente) : x)))
    setEditando(null)
  }

  async function borrar(ids: string[]) {
    const n = ids.length
    if (!confirm(`¿Borrar ${n === 1 ? "este asistente" : `${n} asistentes`}? ${n === 1 ? "Su código deja" : "Sus códigos dejan"} de verificar.`)) return
    const fallidos: string[] = []
    await Promise.all(
      ids.map(async (x) => {
        const r = await fetch(`/api/marketing/eventos/${eventoId}/asistentes/${x}`, { method: "DELETE" })
        if (!r.ok) fallidos.push(x)
      })
    )
    const borrados = new Set(ids.filter((x) => !fallidos.includes(x)))
    onAsistentes(asistentes.filter((a) => !borrados.has(a.id)))
    setSeleccion(new Set())
    if (fallidos.length) toast.error(`No se pudieron borrar ${fallidos.length}`)
    else toast.success(n === 1 ? "Asistente borrado" : `${n} asistentes borrados`)
  }

  function enlaceImpresion(ids?: string[]) {
    return `/marketing/eventos/${eventoId}/certificados${ids && ids.length ? `?a=${ids.join(",")}` : ""}`
  }

  function bloquearSiSucio(e: React.MouseEvent) {
    if (!sucio) return
    e.preventDefault()
    toast.info("Hay cambios sin guardar en el evento o el certificado. Guardalos primero: se imprime lo guardado.")
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* ── Carga ── */}
      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-e1">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4 text-ink-muted" />
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Cargar asistentes</h2>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
            Pegá la lista: un nombre por línea, o las columnas copiadas de Excel o Google Sheets en orden{" "}
            <span className="font-medium text-ink-secondary">nombre, email, empresa</span>. El email y la empresa son opcionales.
          </p>
          <Textarea
            rows={7}
            value={pegado}
            onChange={(e) => setPegado(e.target.value)}
            placeholder={"María Victoria Fernández\tmvfernandez@andreani.com\tAndreani\nJuan Pérez\njperez@mapfre.com.ar, Mapfre"}
            className="font-mono text-[12px]"
          />

          {interpretados.length > 0 && (
            <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-line bg-surface-subtle">
              {interpretados.slice(0, 50).map((a, i) => (
                <div key={i} className="flex items-baseline gap-2 border-b border-line px-3 py-1.5 text-[12px] last:border-0">
                  <span className="truncate font-medium text-ink">{nombrePropio(a.nombre)}</span>
                  <span className="truncate text-ink-faint">{[a.empresa, a.email].filter(Boolean).join(" · ")}</span>
                </div>
              ))}
              {interpretados.length > 50 && (
                <p className="px-3 py-1.5 text-[11.5px] text-ink-muted">y {interpretados.length - 50} más…</p>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-ink-muted">
              {interpretados.length > 0 ? `${interpretados.length} persona${interpretados.length === 1 ? "" : "s"}` : "Los repetidos se saltean solos."}
            </p>
            <Button onClick={agregar} disabled={agregando || interpretados.length === 0}>
              {agregando ? <Loader2 className="animate-spin" /> : <Award />}
              Emitir certificados
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5 shadow-e1">
          <p className="text-[12px] font-medium text-ink-secondary">Todos los certificados</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            {asistentes.length} hoja{asistentes.length === 1 ? "" : "s"} A4, lista{asistentes.length === 1 ? "" : "s"} para imprimir o guardar como un solo PDF.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild disabled={asistentes.length === 0}>
              <Link href={enlaceImpresion()} target="_blank" onClick={bloquearSiSucio}>
                <Printer />
                Imprimir todos
              </Link>
            </Button>
            <Button variant="outline" onClick={onIrAlCertificado}>
              Editar el diseño
            </Button>
          </div>
          {sucio && <p className="mt-3 text-[11.5px] text-warning">Hay cambios sin guardar: se imprime la última versión guardada.</p>}
        </section>

        <InscriptosPanel eventoId={eventoId} />
      </div>

      {/* ── Lista ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full max-w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, empresa o código" className="pl-8" />
          </div>
          {seleccion.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-muted">{seleccion.size} seleccionado{seleccion.size === 1 ? "" : "s"}</span>
              <Button variant="outline" size="sm" asChild>
                <Link href={enlaceImpresion([...seleccion])} target="_blank" onClick={bloquearSiSucio}>
                  <Printer />
                  Imprimir
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => borrar([...seleccion])}>
                <Trash2 />
                Borrar
              </Button>
            </div>
          )}
        </div>

        {asistentes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
            <Award className="mx-auto h-6 w-6 text-ink-faint" />
            <p className="mt-3 text-[13px] font-medium text-ink">Todavía no hay certificados emitidos</p>
            <p className="mt-1 text-[12px] text-ink-muted">Pegá la lista de asistentes a la izquierda.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-e1">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-surface-subtle text-left text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={() => setSeleccion(todosMarcados ? new Set() : new Set(visibles.map((a) => a.id)))}
                      className="accent-primary"
                    />
                  </th>
                  <th className="px-2 py-2">Asistente</th>
                  <th className="hidden px-2 py-2 md:table-cell">Horas</th>
                  <th className="hidden px-2 py-2 lg:table-cell">Código</th>
                  <th className="w-28 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) =>
                  editando === a.id ? (
                    <FilaEdicion key={a.id} asistente={a} horasDefecto={evento.certificado.horas} onCancelar={() => setEditando(null)} onGuardar={(c) => guardarFila(a, c)} />
                  ) : (
                    <tr key={a.id} className={cn("border-b border-line last:border-0", seleccion.has(a.id) && "bg-brand-50/50")}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={seleccion.has(a.id)}
                          onChange={() =>
                            setSeleccion((prev) => {
                              const s = new Set(prev)
                              if (s.has(a.id)) s.delete(a.id)
                              else s.add(a.id)
                              return s
                            })
                          }
                          className="accent-primary"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <button type="button" onClick={() => setViendo(a)} className="text-left">
                          <span className="block font-medium text-ink hover:text-brand-700">{a.nombre}</span>
                          <span className="block text-[11.5px] text-ink-muted">{[a.empresa, a.email].filter(Boolean).join(" · ") || "—"}</span>
                        </button>
                      </td>
                      <td className="hidden px-2 py-2.5 md:table-cell">
                        <span className={cn("font-mono text-[12px]", a.horas !== null ? "font-semibold text-warning-text" : "text-ink-muted")}>
                          {horasTexto(a.horas ?? evento.certificado.horas)}
                        </span>
                      </td>
                      <td className="hidden px-2 py-2.5 font-mono text-[11.5px] text-ink-secondary lg:table-cell">{a.codigo}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="icon-sm" asChild title="Imprimir este">
                            <Link href={enlaceImpresion([a.id])} target="_blank" onClick={bloquearSiSucio}>
                              <Printer />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditando(a.id)} title="Corregir">
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => borrar([a.id])} title="Borrar">
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Ver un certificado ── */}
      {viendo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/70 p-6 backdrop-blur-sm" onClick={() => setViendo(null)}>
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between text-white">
              <p className="text-[13px] font-medium">{viendo.nombre}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" asChild>
                  <Link href={enlaceImpresion([viendo.id])} target="_blank" onClick={bloquearSiSucio}>
                    <Printer />
                    Imprimir
                  </Link>
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setViendo(null)}>
                  <X />
                </Button>
              </div>
            </div>
            <CertificadoEscalado
              evento={{ titulo: evento.titulo, tipo: evento.tipo, modalidad: evento.modalidad, inicio: evento.inicio, lugar: evento.lugar }}
              config={evento.certificado}
              marcas={marcas}
              asistente={{ nombre: viendo.nombre, codigo: viendo.codigo, horas: viendo.horas }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function FilaEdicion({
  asistente,
  horasDefecto,
  onCancelar,
  onGuardar,
}: {
  asistente: Asistente
  horasDefecto: number
  onCancelar: () => void
  onGuardar: (c: Pick<Asistente, "nombre" | "email" | "empresa" | "horas">) => Promise<void>
}) {
  const [nombre, setNombre] = useState(asistente.nombre)
  const [email, setEmail] = useState(asistente.email)
  const [empresa, setEmpresa] = useState(asistente.empresa)
  const [horas, setHoras] = useState(asistente.horas === null ? "" : String(asistente.horas))
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      await onGuardar({ nombre, email, empresa, horas: horas ? Number(horas) : null })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <tr className="border-b border-line bg-surface-subtle last:border-0">
      <td />
      <td className="px-2 py-2" colSpan={3}>
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_90px]">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" autoFocus onKeyDown={(e) => e.key === "Enter" && guardar()} />
          <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Empresa" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <Input
            type="number"
            step={0.5}
            min={0.5}
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            placeholder={String(horasDefecto)}
            title="Vacío: las del certificado"
            className="font-mono"
          />
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex justify-end gap-0.5">
          <Button size="icon-sm" onClick={guardar} disabled={guardando || !nombre.trim()} title="Guardar">
            {guardando ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onCancelar} title="Cancelar">
            <X />
          </Button>
        </div>
      </td>
    </tr>
  )
}
