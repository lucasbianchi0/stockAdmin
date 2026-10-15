"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Download, Loader2, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { descargarCsv } from "@/lib/admin/csv"
import { ESTADO_CRM_ESTILO, ESTADO_CRM_LABEL } from "@/lib/comercial/crm"
import {
  COLUMNAS_PLANTILLA_PROYECTOS,
  type FilaProyectoImportada,
  type PrevisualizacionProyectos,
} from "@/lib/comercial/crm-import"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Importar proyectos al CRM desde la planilla que cada comercial ya tiene.
 *
 * Dos pasos y nada se guarda en el primero: se sube, se ve fila por fila qué
 * entra, con quién se engancha, qué ya estaba y qué no se entiende, y recién
 * ahí se confirma.
 */

type Filtro = "todas" | "nuevas" | "existentes" | "revisar"

export function ImportarProyectosDialog({
  abierto,
  ownerId,
  destino,
  onCerrar,
  onImportado,
}: {
  abierto: boolean
  /** El CRM que se está mirando: adonde va lo que no dice otro "Dueño". */
  ownerId: string
  /** "tu CRM", "el CRM de Sofía". */
  destino: string
  onCerrar: () => void
  onImportado: () => void
}) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<PrevisualizacionProyectos | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [actualizar, setActualizar] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>("todas")
  const input = useRef<HTMLInputElement>(null)
  const ocupado = leyendo || guardando

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !ocupado && onCerrar()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, ocupado, onCerrar])

  const [abiertoPrevio, setAbiertoPrevio] = useState(abierto)
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto)
    if (abierto) {
      setArchivo(null)
      setPrevia(null)
      setError(null)
      setActualizar(false)
      setFiltro("todas")
    }
  }

  const { montado, saliendo } = usePresencia(abierto)
  if (!montado) return null

  async function leer(f: File) {
    setArchivo(f)
    setPrevia(null)
    setError(null)
    setFiltro("todas")
    setLeyendo(true)
    try {
      const form = new FormData()
      form.append("archivo", f)
      form.append("ownerId", ownerId)
      const res = await fetch("/api/comercial/crm/importar", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el archivo")
      setPrevia(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo")
    } finally {
      setLeyendo(false)
    }
  }

  const filas = previa?.filas ?? []
  const nuevas = filas.filter((f) => f.estado === "nuevo")
  const existentes = filas.filter((f) => f.estado === "existente")
  const conCambios = existentes.filter((f) => f.cambios?.length)
  const repetidas = filas.filter((f) => f.estado === "repetido").length
  const errores = filas.filter((f) => f.estado === "error").length
  const conAvisos = filas.filter((f) => f.avisos?.length && f.estado !== "error").length
  // Las personas que se van a crear, una vez cada una.
  const personasNuevas = new Set(nuevas.filter((f) => !f.persona).map((f) => f.personaNueva ?? `#${f.fila}`)).size
  const duenos = new Set(nuevas.map((f) => f.ownerId))
  const aActualizar = actualizar ? conCambios.length : 0
  const hayAlgo = nuevas.length + aActualizar > 0

  const visibles = filas.filter((f) =>
    filtro === "nuevas"
      ? f.estado === "nuevo"
      : filtro === "existentes"
        ? f.estado === "existente"
        : filtro === "revisar"
          ? f.estado === "error" || f.estado === "repetido" || !!f.avisos?.length
          : true
  )

  async function confirmar() {
    if (!hayAlgo || ocupado) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch("/api/comercial/crm/importar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filas: [...nuevas, ...(actualizar ? conCambios : [])],
          actualizar,
          archivo: archivo?.name,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar")
      const partes = [
        data.proyectos > 0 && `${data.proyectos} ${data.proyectos === 1 ? "proyecto nuevo" : "proyectos nuevos"}`,
        data.actualizados > 0 && `${data.actualizados} ${data.actualizados === 1 ? "actualizado" : "actualizados"}`,
      ].filter(Boolean)
      toast.success(partes.length ? partes.join(" · ") : "No había nada para sumar", {
        description:
          data.personasNuevas > 0
            ? `${data.personasNuevas} ${data.personasNuevas === 1 ? "persona nueva quedó" : "personas nuevas quedaron"} también en Contactos`
            : undefined,
      })
      onImportado()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Importar proyectos">
      <div
        className={cn(
          "absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]",
          saliendo ? "animate-out fade-out-0 fill-mode-forwards duration-150" : "animate-in fade-in-0 duration-200"
        )}
        onClick={() => !ocupado && onCerrar()}
      />

      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-e4 sm:max-w-4xl sm:rounded-2xl",
          saliendo
            ? "pointer-events-none animate-out slide-out-to-bottom-4 fade-out-0 fill-mode-forwards duration-150 ease-in"
            : "animate-in slide-in-from-bottom-4 fade-in-0 duration-200 ease-out"
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">Importar proyectos</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Una fila por proyecto. Entran a {destino}, salvo que la planilla diga otro dueño. Se revisa antes de guardar.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar">
            <X />
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              const f = e.dataTransfer.files[0]
              if (f) void leer(f)
            }}
            onClick={() => !ocupado && input.current?.click()}
            className={cn(
              "group flex cursor-pointer items-center gap-4 rounded-2xl border-[1.5px] border-dashed px-5 transition-all duration-200",
              previa ? "py-3.5" : "flex-col justify-center py-10 text-center",
              arrastrando
                ? "border-brand-400 bg-brand-50/70"
                : "border-line-strong bg-surface-subtle hover:border-brand-300 hover:bg-brand-50/40"
            )}
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-xl bg-surface text-ink-muted ring-1 ring-line",
                previa ? "h-10 w-10" : "h-14 w-14"
              )}
            >
              {leyendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className={previa ? "h-5 w-5" : "h-6 w-6"} />}
            </span>
            <div className={cn("min-w-0", previa && "flex-1 text-left")}>
              <p className="truncate text-[13px] font-semibold text-ink">
                {archivo ? archivo.name : "Arrastrá la planilla o hacé click para elegirla"}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {leyendo ? "Leyendo…" : previa ? "Click para cambiar de archivo" : "Excel (.xlsx) o CSV · hasta 2000 filas"}
              </p>
            </div>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void leer(f)
                e.target.value = ""
              }}
            />
          </div>

          {!previa && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink">Columnas que reconoce</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {COLUMNAS_PLANTILLA_PROYECTOS.map((c) => (
                    <span
                      key={c}
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[11px]",
                        ["Empresa", "Contacto", "Proyecto"].includes(c)
                          ? "border-ink/20 bg-surface font-medium text-ink"
                          : "border-line bg-surface-subtle text-ink-secondary"
                      )}
                    >
                      {c}
                    </span>
                  ))}
                </p>
                <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-ink-muted">
                  <li>
                    <span className="font-medium text-ink-secondary">Empresa, Contacto y Proyecto</span> son obligatorias.
                    Contacto puede ser “Nombre y apellido”, o columnas Nombre y Apellido, o el mail.
                  </li>
                  <li>
                    Una persona con varios proyectos va en varias filas: se reconoce por mail o por nombre + empresa y no se
                    duplica. Si no está en Contactos, se carga ahí también.
                  </li>
                  <li>
                    Etapa y % se entienden como vengan (“Ganado”, “cotizado”, “75%”, 0,75). 100% es Cerrado/Ganado. Las
                    fechas, día/mes.
                  </li>
                  <li>Si un proyecto ya está, no se duplica: se muestra qué cambiaría y elegís si actualizarlo.</li>
                </ul>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  descargarCsv("plantilla-proyectos.csv", COLUMNAS_PLANTILLA_PROYECTOS, [
                    ["Andreani", "Juan Pérez", "jperez@andreani.com", "Gerente de Operaciones", "Firma biométrica en sucursales", "Propuesta", "50%", "Enviar propuesta final", "20/10/2026", "13/10/2026", "", "Decide con Legales", ""],
                    ["Andreani", "Juan Pérez", "jperez@andreani.com", "Gerente de Operaciones", "Onboarding digital de choferes", "Negociación", "75%", "Reunión de cierre", "24/10/2026", "", "", "", ""],
                    ["Andreani", "Laura Gómez", "lgomez@andreani.com", "CIO", "Data Center", "Calificación", "25%", "Relevamiento técnico", "30/10/2026", "", "", "", ""],
                  ])
                }}
              >
                <Download />
                Plantilla
              </Button>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {previa && (
            <>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
                <Resumen valor={nuevas.length} rotulo="Proyectos nuevos" tono="success" />
                <Resumen valor={personasNuevas} rotulo="Personas nuevas" detalle="también en Contactos" />
                <Resumen valor={existentes.length} rotulo="Ya estaban" detalle={conCambios.length ? `${conCambios.length} con cambios` : undefined} />
                <Resumen
                  valor={errores + repetidas}
                  rotulo="No entran"
                  detalle={
                    [errores && `${errores} con problemas`, repetidas && `${repetidas} ${repetidas === 1 ? "repetida" : "repetidas"}`]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  tono={errores > 0 ? "danger" : undefined}
                />
              </dl>

              {conCambios.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3.5 py-3">
                  <input type="checkbox" className="checkbox mt-0.5" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} />
                  <span className="text-[12.5px] leading-relaxed text-ink-secondary">
                    <span className="font-medium text-ink">
                      Actualizar {conCambios.length} {conCambios.length === 1 ? "proyecto que ya estaba" : "proyectos que ya estaban"} con lo
                      de la planilla
                    </span>
                    <br />
                    Etapa, %, próxima acción y fechas. Las celdas vacías no borran nada, y cada cambio queda en el historial.
                  </span>
                </label>
              )}

              <ul className="space-y-1 text-[12px] text-ink-muted">
                {duenos.size > 1 && <li>La planilla reparte proyectos entre {duenos.size} personas del equipo (columna Dueño).</li>}
                {conAvisos > 0 && (
                  <li>
                    {conAvisos} {conAvisos === 1 ? "fila tiene" : "filas tienen"} algo para revisar (una fecha que no se entendió, un
                    proyecto parecido ya cargado). Entran igual: miralas en “Revisar”.
                  </li>
                )}
                {previa.filaCabecera > 1 && <li>Los encabezados no estaban en la primera fila: lo de arriba se ignoró.</li>}
                {previa.recodificado && <li>El archivo venía con la codificación vieja de Excel: los acentos se corrigieron.</li>}
                {previa.columnasIgnoradas.length > 0 && (
                  <li>
                    Columnas que no se usan: <span className="text-ink-secondary">{previa.columnasIgnoradas.join(", ")}</span>
                  </li>
                )}
              </ul>

              <div className="overflow-hidden rounded-xl border border-line">
                <div className="flex gap-1 border-b border-line bg-surface-subtle px-2 py-1.5">
                  {(
                    [
                      ["todas", "Todas", filas.length],
                      ["nuevas", "Nuevas", nuevas.length],
                      ["existentes", "Ya estaban", existentes.length],
                      ["revisar", "Revisar", errores + repetidas + conAvisos],
                    ] as const
                  ).map(([id, rotulo, n]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFiltro(id)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[12px] transition-colors",
                        filtro === id ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-muted hover:text-ink"
                      )}
                    >
                      {rotulo} <span className="num text-ink-faint">{n}</span>
                    </button>
                  ))}
                </div>
                <div className="max-h-[340px] overflow-auto">
                  {/* Ancho fijo por columna: con textos largos, "Qué pasa" no se va de la vista. */}
                  <table className="w-full min-w-[720px] table-fixed text-[12px]">
                    <colgroup>
                      <col className="w-10" />
                      <col className="w-[15%]" />
                      <col className="w-[18%]" />
                      <col className="w-[22%]" />
                      <col className="hidden w-[19%] md:table-column" />
                      {duenos.size > 1 && <col className="hidden w-14 md:table-column" />}
                      <col />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-surface text-left text-[10.5px] uppercase tracking-[0.04em] text-ink-muted">
                      <tr className="[&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
                        <th className="w-10">#</th>
                        <th>Empresa</th>
                        <th>Contacto</th>
                        <th>Proyecto</th>
                        <th className="hidden md:table-cell">Etapa</th>
                        {duenos.size > 1 && <th className="hidden md:table-cell">Dueño</th>}
                        <th>Qué pasa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.slice(0, 300).map((f) => (
                        <FilaPrevia key={f.fila} f={f} conDueno={duenos.size > 1} />
                      ))}
                      {visibles.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                            Nada en esta vista.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {visibles.length > 300 && (
                  <p className="border-t border-line bg-surface-subtle px-3 py-2 text-[11.5px] text-ink-muted">
                    Se muestran 300 de {visibles.length}. Se importan todas las que entran.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <Button variant="outline" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!previa || !hayAlgo || ocupado}>
            {guardando && <Loader2 className="animate-spin" />}
            {!previa
              ? "Importar"
              : nuevas.length > 0 && aActualizar > 0
                ? `Importar ${nuevas.length} y actualizar ${aActualizar}`
                : aActualizar > 0
                  ? `Actualizar ${aActualizar}`
                  : `Importar ${nuevas.length} ${nuevas.length === 1 ? "proyecto" : "proyectos"}`}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Resumen({
  valor,
  rotulo,
  detalle,
  tono,
}: {
  valor: number
  rotulo: string
  detalle?: string
  tono?: "success" | "danger"
}) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <dt className="text-[11.5px] text-ink-muted">{rotulo}</dt>
      <dd
        className={cn(
          "num mt-0.5 text-[18px] font-semibold leading-none",
          tono === "success" && valor > 0 ? "text-success-text" : tono === "danger" && valor > 0 ? "text-danger-text" : "text-ink"
        )}
      >
        {valor}
      </dd>
      {detalle && <p className="mt-1 truncate text-[11px] text-ink-faint">{detalle}</p>}
    </div>
  )
}

function FilaPrevia({ f, conDueno }: { f: FilaProyectoImportada; conDueno: boolean }) {
  const d = f.datos
  const persona = [d.nombre, d.apellido].filter(Boolean).join(" ") || d.email || "—"
  const queMuestra =
    f.estado === "nuevo"
      ? { texto: "Nuevo", clase: "text-success-text" }
      : f.estado === "existente"
        ? { texto: f.cambios?.length ? `Ya está · ${f.cambios.join(", ")}` : "Ya está, igual", clase: f.cambios?.length ? "text-brand-700" : "text-ink-muted" }
        : f.estado === "error"
          ? { texto: f.motivo ?? "Con problemas", clase: "text-danger-text" }
          : { texto: f.motivo ?? "Repetida", clase: "text-ink-muted" }
  const notas = [...(f.arreglos ?? []).map((a) => `Corregido: ${a}`), ...(f.avisos ?? []).map((a) => `Revisar: ${a}`)]
  return (
    <tr
      title={notas.length ? notas.join("\n") : undefined}
      className={cn(
        "[&_td]:border-b [&_td]:border-line-soft [&_td]:px-3 [&_td]:py-2",
        (f.estado === "error" || f.estado === "repetido") && "text-ink-muted"
      )}
    >
      <td className="num text-ink-faint">
        {f.fila}
        {f.avisos?.length ? (
          <span className="ml-1 text-warning-text">•</span>
        ) : f.arreglos?.length ? (
          <span className="ml-1 text-brand-500">•</span>
        ) : null}
      </td>
      <td className="truncate">{d.empresa || "—"}</td>
      <td>
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-ink">{persona}</span>
          {f.estado === "nuevo" && !f.persona && (
            <span className="shrink-0 rounded border border-line px-1 text-[10px] text-ink-muted">nueva</span>
          )}
        </span>
      </td>
      <td className="truncate text-ink" title={d.proyecto}>
        {d.proyecto || "—"}
      </td>
      <td className="hidden truncate md:table-cell">
        {f.estado !== "error" && (
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className={cn("h-1.5 w-1.5 rounded-full", ESTADO_CRM_ESTILO[d.estado].punto)} />
            {ESTADO_CRM_LABEL[d.estado]}
            <span className="num text-ink-muted">· {d.probabilidad}%</span>
          </span>
        )}
      </td>
      {conDueno && (
        <td className="hidden md:table-cell">
          {f.ownerId ? <Avatar id={f.ownerId} nombre={f.ownerNombre} size="xs" /> : <span className="text-ink-faint">—</span>}
        </td>
      )}
      <td className={cn("text-[11.5px] font-medium leading-snug", queMuestra.clase)} title={queMuestra.texto}>
        <span className="line-clamp-2">{queMuestra.texto}</span>
      </td>
    </tr>
  )
}
