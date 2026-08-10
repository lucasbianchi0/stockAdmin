"use client"

import { useCallback, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  FileInput,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatearCuit } from "@/lib/admin/cuit"
import {
  ALICUOTAS,
  ALICUOTA_LABEL,
  clasesDe,
  formatearNumero,
  totalDe,
  type TipoComprobante,
} from "@/lib/admin/comprobantes"
import {
  ARCHIVOS_MAX,
  TAMANO_MAX_MB,
  type Borrador,
} from "@/lib/admin/extraccion"
import { formatearImporte, parsearImporte, type Moneda } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * Carga inteligente de facturas.
 *
 * El flujo tiene tres pasos y el del medio es el que importa:
 *
 *   adjuntar  →  **revisar**  →  guardar
 *
 * La extracción acierta la enorme mayoría de las veces, y esa mayoría es
 * justamente el problema: cuando algo funciona casi siempre, se deja de mirar.
 * Por eso la pantalla del medio no es un resumen que se confirma con un click —
 * es el formulario completo, con cada campo editable, los que el modelo leyó con
 * dudas marcados en ámbar, y el archivo original a la vista para poder
 * contrastar.
 *
 * Nada se guarda hasta que alguien aprieta el botón, y se guarda una factura por
 * vez contra el mismo endpoint que usa la carga manual — con sus mismas
 * validaciones, incluido el índice único que rechaza duplicados.
 */

type Fila = {
  id: string
  borrador: Borrador
  /** Los valores editables, ya normalizados a texto de formulario. */
  campos: Campos
  incluida: boolean
  clienteId: string | null
  estado: "pendiente" | "guardando" | "guardada" | "error"
  mensaje?: string
}

type Campos = {
  clase: string
  numeroCompleto: string
  fecha: string
  fechaVencimiento: string
  moneda: Moneda
  tc: string
  netoGravado: string
  alicuotaIva: string
  iva: string
  noGravado: string
  exento: string
  percepcionIva: string
  percepcionIibb: string
  otrosImpuestos: string
  detalle: string
  condicionPago: string
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v))

function aCampos(b: Borrador): Campos {
  const e = b.extraccion
  return {
    clase: e?.clase ?? "FCA",
    numeroCompleto:
      e?.puntoVenta !== null && e?.puntoVenta !== undefined && e?.numero !== null && e?.numero !== undefined
        ? formatearNumero(e.puntoVenta, e.numero)
        : "",
    fecha: e?.fecha ?? "",
    fechaVencimiento: e?.fechaVencimiento ?? "",
    moneda: e?.moneda ?? "ARS",
    tc: n(e?.tc),
    netoGravado: n(e?.netoGravado),
    alicuotaIva: e?.alicuotaIva !== null && e?.alicuotaIva !== undefined ? String(e.alicuotaIva) : "0.21",
    iva: n(e?.iva),
    noGravado: n(e?.noGravado),
    exento: n(e?.exento),
    percepcionIva: n(e?.percepcionIva),
    percepcionIibb: n(e?.percepcionIibb),
    otrosImpuestos: n(e?.otrosImpuestos),
    detalle: e?.detalle ?? "",
    condicionPago: e?.condicionPago ?? "",
  }
}

export function ImportarFacturasDialog({
  tipo,
  abierto,
  onCerrar,
  onImportadas,
}: {
  tipo: TipoComprobante
  abierto: boolean
  onCerrar: () => void
  onImportadas: (cantidad: number) => void
}) {
  const esCompra = tipo === "compra"
  const recurso = esCompra ? "compras" : "ventas"

  const [filas, setFilas] = useState<Fila[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const subir = useCallback(async (archivos: FileList | File[]) => {
    const lista = Array.from(archivos).slice(0, ARCHIVOS_MAX)
    if (lista.length === 0) return

    setLeyendo(true)
    try {
      const body = new FormData()
      lista.forEach((a) => body.append("archivos", a))

      const res = await fetch(`/api/admin/${recurso}/importar`, { method: "POST", body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudieron leer los archivos")

      const nuevas: Fila[] = (data.borradores as Borrador[]).map((b, i) => ({
        id: `${Date.now()}-${i}`,
        borrador: b,
        campos: aCampos(b),
        // Lo que no se pudo leer o no tiene cliente nace desmarcado: guardar por
        // accidente algo que ni siquiera se pudo revisar es el peor resultado.
        incluida: !b.error && Boolean(b.cliente),
        clienteId: b.cliente?.id ?? null,
        estado: "pendiente",
      }))

      setFilas((prev) => [...prev, ...nuevas])

      const conError = nuevas.filter((f) => f.borrador.error).length
      if (conError > 0) toast.warning(`${conError} archivo(s) no se pudieron leer`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron leer los archivos")
    } finally {
      setLeyendo(false)
    }
  }, [recurso])

  const setCampo = (id: string, k: keyof Campos, v: string) =>
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, campos: { ...f.campos, [k]: v } } : f))
    )

  const guardarTodas = async () => {
    const aGuardar = filas.filter((f) => f.incluida && f.estado !== "guardada")
    if (aGuardar.length === 0) return

    setGuardando(true)
    let ok = 0

    for (const fila of aGuardar) {
      setFilas((prev) =>
        prev.map((f) => (f.id === fila.id ? { ...f, estado: "guardando" } : f))
      )

      try {
        const c = fila.campos
        const { puntoVenta, numero } = partirNumero(c.numeroCompleto)

        const res = await fetch(`/api/admin/${recurso}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entidadId: fila.clienteId,
            clase: c.clase,
            fecha: c.fecha,
            fechaVencimiento: c.fechaVencimiento || null,
            puntoVenta,
            numero,
            detalle: c.detalle,
            moneda: c.moneda,
            tc: c.moneda === "USD" ? (parsearImporte(c.tc) ?? 0) : 1,
            netoGravado: parsearImporte(c.netoGravado) ?? 0,
            alicuotaIva: Number(c.alicuotaIva) || 0,
            iva: parsearImporte(c.iva) ?? 0,
            noGravado: parsearImporte(c.noGravado) ?? 0,
            exento: parsearImporte(c.exento) ?? 0,
            percepcionIva: parsearImporte(c.percepcionIva) ?? 0,
            percepcionIibb: parsearImporte(c.percepcionIibb) ?? 0,
            otrosImpuestos: parsearImporte(c.otrosImpuestos) ?? 0,
            condicionPago: c.condicionPago,
            observaciones: `Importada de ${fila.borrador.archivo}`,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")

        ok++
        setFilas((prev) =>
          prev.map((f) => (f.id === fila.id ? { ...f, estado: "guardada" } : f))
        )
      } catch (e) {
        setFilas((prev) =>
          prev.map((f) =>
            f.id === fila.id
              ? {
                  ...f,
                  estado: "error",
                  mensaje: e instanceof Error ? e.message : "No se pudo guardar",
                }
              : f
          )
        )
      }
    }

    setGuardando(false)
    if (ok > 0) {
      toast.success(`${ok} factura${ok !== 1 ? "s" : ""} registrada${ok !== 1 ? "s" : ""}`)
      onImportadas(ok)
    }
  }

  if (!abierto) return null

  const listas = filas.filter((f) => f.incluida && f.estado !== "guardada").length
  const trabajando = leyendo || guardando

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Carga inteligente de facturas"
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !trabajando && onCerrar()}
      />

      <div className="relative flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[92vh] sm:max-w-4xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileInput className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                Carga inteligente
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Adjuntá las facturas, revisá lo que se leyó y recién ahí se guardan
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={trabajando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Zona de carga */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              if (!trabajando) subir(e.dataTransfer.files)
            }}
            className={cn(
              "rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              arrastrando ? "border-brand-400 bg-brand-50" : "border-line bg-surface-subtle"
            )}
          >
            <input
              ref={inputArchivo}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) subir(e.target.files)
                e.target.value = ""
              }}
            />

            {leyendo ? (
              <div className="flex flex-col items-center gap-2.5">
                <Sparkles className="h-6 w-6 animate-pulse text-brand-500" />
                <p className="text-[13px] font-medium text-ink">Leyendo los comprobantes…</p>
                <p className="text-[11.5px] text-ink-muted">
                  Puede tardar unos segundos por archivo
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <Upload className="h-6 w-6 text-ink-faint" strokeWidth={1.7} />
                <p className="text-[13px] text-ink-secondary">
                  Arrastrá los PDF o fotos acá, o
                </p>
                <Button variant="outline" size="sm" onClick={() => inputArchivo.current?.click()}>
                  Elegir archivos
                </Button>
                <p className="text-[11px] text-ink-faint">
                  PDF, JPG, PNG o WEBP · hasta {ARCHIVOS_MAX} por vez · máx {TAMANO_MAX_MB} MB c/u
                </p>
              </div>
            )}
          </div>

          {filas.map((fila) => (
            <TarjetaBorrador
              key={fila.id}
              tipo={tipo}
              fila={fila}
              onCampo={(k, v) => setCampo(fila.id, k, v)}
              onIncluir={(v) =>
                setFilas((prev) =>
                  prev.map((f) => (f.id === fila.id ? { ...f, incluida: v } : f))
                )
              }
              onQuitar={() => setFilas((prev) => prev.filter((f) => f.id !== fila.id))}
            />
          ))}
        </div>

        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-[12px] text-ink-muted">
              {filas.length === 0
                ? "Todavía no adjuntaste nada"
                : `${listas} de ${filas.length} lista${listas !== 1 ? "s" : ""} para registrar`}
            </p>
            <Button variant="outline" onClick={onCerrar} disabled={trabajando}>
              Cerrar
            </Button>
            <Button onClick={guardarTodas} disabled={listas === 0 || trabajando}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Registrar {listas > 0 ? listas : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Una factura leída ────────────────────────────────────────────────────── */

function TarjetaBorrador({
  tipo,
  fila,
  onCampo,
  onIncluir,
  onQuitar,
}: {
  tipo: TipoComprobante
  fila: Fila
  onCampo: (k: keyof Campos, v: string) => void
  onIncluir: (v: boolean) => void
  onQuitar: () => void
}) {
  const { borrador: b, campos: c } = fila
  const clases = clasesDe(tipo)
  const dudosos = new Set(b.extraccion?.camposDudosos ?? [])

  const total = totalDe({
    netoGravado: parsearImporte(c.netoGravado) ?? 0,
    alicuotaIva: Number(c.alicuotaIva) || 0,
    iva: parsearImporte(c.iva) ?? 0,
    noGravado: parsearImporte(c.noGravado) ?? 0,
    exento: parsearImporte(c.exento) ?? 0,
    percepcionIva: parsearImporte(c.percepcionIva) ?? 0,
    percepcionIibb: parsearImporte(c.percepcionIibb) ?? 0,
    otrosImpuestos: parsearImporte(c.otrosImpuestos) ?? 0,
  })

  if (b.error) {
    return (
      <div className="rounded-xl border border-danger-line bg-danger-soft/40 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{b.archivo}</p>
            <p className="mt-0.5 text-[12px] text-danger-text">{b.error}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onQuitar} aria-label="Quitar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  const guardada = fila.estado === "guardada"

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface transition-colors",
        guardada ? "border-success-line bg-success-soft/30" : "border-line"
      )}
    >
      {/* Cabecera */}
      <div className="flex items-start gap-3 border-b border-line-soft px-4 py-3">
        <input
          type="checkbox"
          className="checkbox mt-0.5"
          checked={fila.incluida}
          disabled={guardada || fila.estado === "guardando"}
          onChange={(e) => onIncluir(e.target.checked)}
          aria-label={`Incluir ${b.archivo}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className="truncate text-[13px] font-medium text-ink">{b.archivo}</span>
            {b.extraccion && (
              <Badge
                tone={
                  b.extraccion.confianza === "alta"
                    ? "success"
                    : b.extraccion.confianza === "media"
                      ? "warning"
                      : "danger"
                }
                size="sm"
              >
                Lectura {b.extraccion.confianza}
              </Badge>
            )}
            {guardada && (
              <Badge tone="success" size="sm">
                <Check className="h-3 w-3" /> Registrada
              </Badge>
            )}
          </div>

          {/* Cliente */}
          <p className="mt-1 text-[12px] text-ink-secondary">
            {b.cliente ? (
              <>
                {tipo === "compra" ? "Proveedor" : "Cliente"}:{" "}
                <strong className="font-medium text-ink">{b.cliente.razonSocial}</strong>
                {b.cliente.cuit && (
                  <span className="num text-ink-muted"> · {formatearCuit(b.cliente.cuit)}</span>
                )}
              </>
            ) : (
              <span className="text-warning-text">
                Sin {tipo === "compra" ? "proveedor" : "cliente"} asignado
                {b.cuitCliente && (
                  <span className="num"> — CUIT {formatearCuit(b.cuitCliente)}</span>
                )}
              </span>
            )}
          </p>
        </div>

        {!guardada && (
          <Button variant="ghost" size="icon-sm" onClick={onQuitar} aria-label="Quitar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Avisos */}
      {b.avisos.length > 0 && (
        <div className="space-y-1.5 border-b border-line-soft bg-warning-soft/40 px-4 py-2.5">
          {b.avisos.map((a, i) => (
            <p key={i} className="flex items-start gap-2 text-[11.5px] text-warning-text">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              {a}
            </p>
          ))}
        </div>
      )}

      {fila.estado === "error" && fila.mensaje && (
        <div className="border-b border-line-soft bg-danger-soft/50 px-4 py-2.5">
          <p className="text-[11.5px] text-danger-text">{fila.mensaje}</p>
        </div>
      )}

      {/* Campos */}
      <div className="space-y-3 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Tipo" dudoso={dudosos.has("clase")}>
            <select
              value={c.clase}
              onChange={(e) => onCampo("clase", e.target.value)}
              disabled={guardada}
              className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
            >
              {clases.map((cl) => (
                <option key={cl.codigo} value={cl.codigo}>
                  {cl.codigo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            rotulo="Número"
            dudoso={dudosos.has("numero") || dudosos.has("puntoVenta")}
            className="sm:col-span-2"
          >
            <MiniInput
              value={c.numeroCompleto}
              onChange={(v) => onCampo("numeroCompleto", v)}
              disabled={guardada}
              placeholder="00002-00002708"
            />
          </Campo>

          <Campo rotulo="Moneda">
            <select
              value={c.moneda}
              onChange={(e) => onCampo("moneda", e.target.value)}
              disabled={guardada}
              className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
            >
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Fecha" dudoso={dudosos.has("fecha")}>
            <MiniInput
              type="date"
              value={c.fecha}
              onChange={(v) => onCampo("fecha", v)}
              disabled={guardada}
            />
          </Campo>
          <Campo rotulo="Vencimiento" dudoso={dudosos.has("fechaVencimiento")}>
            <MiniInput
              type="date"
              value={c.fechaVencimiento}
              onChange={(v) => onCampo("fechaVencimiento", v)}
              disabled={guardada}
            />
          </Campo>
          {c.moneda === "USD" && (
            <Campo rotulo="Tipo de cambio" dudoso={dudosos.has("tc")}>
              <MiniInput
                value={c.tc}
                onChange={(v) => onCampo("tc", v)}
                disabled={guardada}
                placeholder="1435,00"
              />
            </Campo>
          )}
          <Campo
            rotulo="Detalle"
            dudoso={dudosos.has("detalle")}
            className={c.moneda === "USD" ? "" : "sm:col-span-2"}
          >
            <MiniInput
              value={c.detalle}
              onChange={(v) => onCampo("detalle", v)}
              disabled={guardada}
            />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Neto gravado" dudoso={dudosos.has("netoGravado")}>
            <MiniInput
              value={c.netoGravado}
              onChange={(v) => onCampo("netoGravado", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
          <Campo rotulo="Alícuota" dudoso={dudosos.has("alicuotaIva")}>
            <select
              value={c.alicuotaIva}
              onChange={(e) => onCampo("alicuotaIva", e.target.value)}
              disabled={guardada}
              className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
            >
              {ALICUOTAS.map((a) => (
                <option key={a} value={String(a)}>
                  {ALICUOTA_LABEL[String(a)]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="IVA" dudoso={dudosos.has("iva")}>
            <MiniInput
              value={c.iva}
              onChange={(v) => onCampo("iva", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
          <Campo rotulo="Perc. IIBB" dudoso={dudosos.has("percepcionIibb")}>
            <MiniInput
              value={c.percepcionIibb}
              onChange={(v) => onCampo("percepcionIibb", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="No gravado" dudoso={dudosos.has("noGravado")}>
            <MiniInput
              value={c.noGravado}
              onChange={(v) => onCampo("noGravado", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
          <Campo rotulo="Exento" dudoso={dudosos.has("exento")}>
            <MiniInput
              value={c.exento}
              onChange={(v) => onCampo("exento", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
          <Campo rotulo="Perc. IVA" dudoso={dudosos.has("percepcionIva")}>
            <MiniInput
              value={c.percepcionIva}
              onChange={(v) => onCampo("percepcionIva", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
          <Campo rotulo="Otros impuestos" dudoso={dudosos.has("otrosImpuestos")}>
            <MiniInput
              value={c.otrosImpuestos}
              onChange={(v) => onCampo("otrosImpuestos", v)}
              disabled={guardada}
              alineadoDerecha
            />
          </Campo>
        </div>

        {/* El total no se edita: es la suma. Al lado va el que leyó el modelo,
            para poder contrastar contra el papel de un vistazo. */}
        <div className="flex items-center justify-between rounded-lg bg-surface-subtle px-3 py-2">
          <div className="text-[11.5px] text-ink-muted">
            Total calculado
            {b.extraccion?.total !== null && b.extraccion?.total !== undefined && (
              <span className="num">
                {" "}
                · en el documento dice{" "}
                {formatearImporte(b.extraccion.total, c.moneda)}
              </span>
            )}
          </div>
          <span className="num text-[15px] font-bold text-ink">
            {formatearImporte(total, c.moneda)}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

/** Un campo del preview. El ámbar marca lo que el modelo leyó con dudas: es lo
 *  que dirige la mirada de quien revisa, que es todo el punto de esta pantalla. */
function Campo({
  rotulo,
  dudoso,
  className,
  children,
}: {
  rotulo: string
  dudoso?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-subtle">
          {rotulo}
        </span>
        {dudoso && (
          <span
            title="El modelo leyó este campo con dudas"
            className="h-1.5 w-1.5 rounded-full bg-warning"
            aria-label="Campo con dudas"
          />
        )}
      </div>
      <div className={cn(dudoso && "rounded-md ring-2 ring-warning-line")}>{children}</div>
    </div>
  )
}

function MiniInput({
  value,
  onChange,
  disabled,
  placeholder,
  type,
  alineadoDerecha,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  type?: string
  alineadoDerecha?: boolean
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={cn("num h-8 text-[12px]", alineadoDerecha && "text-right")}
    />
  )
}

/** `00002-00002708` → punto de venta y número. Duplica lo que hace
 *  `parsearNumero`, pero acá el valor viene de la extracción y ya está en el
 *  formato canónico, así que alcanza con partir por el guion. */
function partirNumero(v: string): { puntoVenta: number | null; numero: number | null } {
  const m = v.trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) {
    const digitos = v.replace(/\D/g, "")
    return { puntoVenta: null, numero: digitos ? Number(digitos) : null }
  }
  return { puntoVenta: Number(m[1]), numero: Number(m[2]) }
}
