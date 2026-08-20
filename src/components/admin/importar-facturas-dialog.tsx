"use client"

import { useCallback, useRef, useState } from "react"
import {
  AlertTriangle,
  Building2,
  Check,
  FileInput,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  UserPlus,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { SelectorEntidad } from "@/components/admin/selector-entidad"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorDeCuit, esCuitValido, formatearCuit } from "@/lib/admin/cuit"
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
  type AltaSugerida,
  type Borrador,
} from "@/lib/admin/extraccion"
import { sumarDias } from "@/lib/admin/fecha"
import { FILAS_MAX, esCsv } from "@/lib/admin/importar-csv"
import { IMPACTO_VACIO, type Impacto } from "@/lib/admin/impacto"
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
 *
 * QUE ARRASTRA CADA FACTURA
 *
 * Esta pantalla es la puerta de entrada del sistema, así que lo que se decide
 * acá no termina en la tabla de comprobantes:
 *
 *  · **La ficha.** El proveedor que no está se da de alta con lo que dice el
 *    papel; el que está se engancha por CUIT. De ahí en más la factura suma a
 *    su cuenta corriente.
 *  · **La imputación.** La cuenta contable que tiene guardada la ficha es lo que
 *    hace que al confirmar el asiento se genere solo. Un proveedor nuevo todavía
 *    no tiene ninguna: su primera factura entra sin imputar y el módulo la
 *    muestra para corregirla, y esa corrección queda anotada en la ficha.
 *  · **El vencimiento.** Del papel, o de los días de plazo de la ficha. Es lo
 *    que la ordena en pagos pendientes y lo que la pinta de rojo cuando vence.
 *
 * Las tres se muestran y se pueden corregir antes de guardar. Un alta que ocurre
 * en silencio es la que llena el maestro de proveedores duplicados.
 */

type Fila = {
  id: string
  borrador: Borrador
  /** Los valores editables, ya normalizados a texto de formulario. */
  campos: Campos
  incluida: boolean
  /** La ficha del maestro, si ya está resuelta. */
  entidadId: string | null
  entidadNombre: string
  /** Los datos con los que se va a dar de alta, cuando no hay ficha. */
  alta: AltaSugerida | null
  /** El buscador de ficha existente, abierto a pedido. */
  buscando: boolean
  estado: "pendiente" | "guardando" | "guardada" | "error"
  mensaje?: string
}

type Campos = {
  clase: string
  numeroCompleto: string
  fecha: string
  fechaVencimiento: string
  cuentaContableId: string
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

/**
 * Si la fila tiene resuelta la identidad de la contraparte.
 *
 * El CUIT es lo único que identifica: la razón social se escribe de cinco
 * maneras y se repite entre empresas. Por eso un alta sin CUIT válido no está
 * lista para guardar aunque tenga todos los demás campos perfectos — el servidor
 * la va a rechazar, y es mejor que se vea acá que como un error por fila después
 * de apretar el botón.
 *
 * La excepción es el proveedor del exterior, que no tiene CUIT porque el CUIT no
 * existe fuera de Argentina.
 */
function identidadResuelta(f: Fila): boolean {
  if (f.entidadId) return true
  if (!f.alta || !f.alta.razonSocial.trim()) return false
  if (f.alta.origen === "exterior") return true
  return esCuitValido(f.alta.cuit)
}

function aCampos(b: Borrador): Campos {
  const e = b.extraccion
  return {
    clase: e?.clase ?? "FCA",
    numeroCompleto:
      e?.puntoVenta !== null && e?.puntoVenta !== undefined && e?.numero !== null && e?.numero !== undefined
        ? formatearNumero(e.puntoVenta, e.numero)
        : "",
    fecha: e?.fecha ?? "",
    // El servidor ya lo completó con el plazo de la ficha cuando el papel no lo
    // traía; acá solo se muestra lo que propuso.
    fechaVencimiento: b.fechaVencimiento ?? e?.fechaVencimiento ?? "",
    cuentaContableId: b.cuentaContableId ?? "",
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
  /** Se llama con el resumen de lo que entró. La pantalla de atrás es la que lo
   *  muestra: acá adentro sería un modal arriba de otro. */
  onImportadas: (impacto: Impacto) => void
}) {
  const esCompra = tipo === "compra"
  const recurso = esCompra ? "compras" : "ventas"

  const [filas, setFilas] = useState<Fila[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  /**
   * Las dos puertas terminan acá, y a partir de acá son la misma cosa.
   *
   * Un PDF o una foto los lee el modelo; un CSV lo parte el importador de
   * planillas sin gastar un token. Los dos devuelven `Borrador[]` con la misma
   * forma, así que de esta función para abajo —la revisión, la edición, el alta
   * de la ficha, el guardado— no hay ninguna rama que distinga de dónde vino.
   */
  const aFilas = (borradores: Borrador[], desde: number): Fila[] =>
    borradores.map((b, i) => {
      const fila: Fila = {
        id: `${desde}-${i}`,
        borrador: b,
        campos: aCampos(b),
        incluida: false,
        entidadId: b.entidad?.id ?? null,
        entidadNombre: b.entidad?.razonSocial ?? "",
        alta: b.entidad ? null : (b.alta ?? null),
        buscando: false,
        estado: "pendiente",
      }
      // Nace tildada sólo si se pudo leer y se sabe con certeza de quién es.
      // Un CUIT que no se leyó deja la fila desmarcada hasta que alguien lo
      // complete: guardar sin identidad es lo que duplica el maestro.
      return { ...fila, incluida: !b.error && identidadResuelta(fila) }
    })

  const subir = useCallback(async (archivos: FileList | File[]) => {
    const todos = Array.from(archivos)
    if (todos.length === 0) return

    /* Una planilla trae adentro sus propias filas, así que no compite por el
       cupo de archivos: el tope de 8 es por cuántos documentos lee el modelo de
       una tanda, y el de la planilla es su cantidad de filas. */
    const planillas = todos.filter((a) => esCsv(a.name))
    const documentos = todos.filter((a) => !esCsv(a.name)).slice(0, ARCHIVOS_MAX)

    setLeyendo(true)
    try {
      const lotes: Borrador[][] = []

      if (documentos.length > 0) {
        const body = new FormData()
        documentos.forEach((a) => body.append("archivos", a))

        const res = await fetch(`/api/admin/${recurso}/importar`, { method: "POST", body })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "No se pudieron leer los archivos")
        lotes.push(data.borradores as Borrador[])
      }

      // De a una: cada planilla tiene su propio mapeo de columnas y su propio
      // error si le falta alguna, y mezclarlas escondería cuál falló.
      for (const planilla of planillas) {
        const body = new FormData()
        body.append("archivo", planilla)

        const res = await fetch(`/api/admin/${recurso}/importar-csv`, { method: "POST", body })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `No se pudo leer ${planilla.name}`)

        lotes.push(data.borradores as Borrador[])
        if (data.aviso) toast.warning(data.aviso)
      }

      const nuevas = lotes.flatMap((lote, i) => aFilas(lote, Date.now() + i))
      setFilas((prev) => [...prev, ...nuevas])

      const conError = nuevas.filter((f) => f.borrador.error).length
      if (conError > 0) toast.warning(`${conError} comprobante(s) no se pudieron leer`)
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

  const setFila = (id: string, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambio } : f)))

  const guardarTodas = async () => {
    const aGuardar = filas.filter((f) => f.incluida && f.estado !== "guardada")
    if (aGuardar.length === 0) return

    setGuardando(true)
    let ok = 0
    /** Las fichas que el guardado dio de alta, sin repetir: seis facturas del
     *  mismo proveedor nuevo crean una sola y el resumen tiene que decir una. */
    const nuevas = new Set<string>()
    /** Todas las fichas tocadas, nuevas o no. Se acumulan en el bucle y no se
     *  leen de `filas` al final: dentro de esta función `filas` es el estado
     *  congelado de antes de guardar, sin ninguno de los ids que resolvió el
     *  servidor. */
    const tocadas = new Set<string>()

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
            entidadId: fila.entidadId,
            /* Lo que dice el papel sobre la contraparte, se haya resuelto la
               ficha o no. Sin ficha, el servidor la busca por CUIT y la da de
               alta —allá y no acá, para que seis archivos del mismo proveedor
               nuevo terminen en una ficha sola—. Con ficha ya elegida, sirve
               para completarle el CUIT si estaba cargada sin él. */
            entidadNueva:
              fila.alta ?? (fila.borrador.cuitEntidad ? { cuit: fila.borrador.cuitEntidad } : null),
            clase: c.clase,
            fecha: c.fecha,
            fechaVencimiento: c.fechaVencimiento || null,
            cuentaContableId: c.cuentaContableId || null,
            puntoVenta,
            numero,
            detalle: c.detalle,
            moneda: c.moneda,
            tc: parsearImporte(c.tc) ?? null,
            // Lo leído de un PDF entra como borrador, siempre. El modelo puede
            // haber leído mal un dígito, y una factura confirmada ya suma al
            // saldo del cliente y genera su asiento. Se revisan las seis en el
            // listado y se confirman en lote cuando están.
            estado: "borrador",
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
        if (data.entidadCreada) nuevas.add(data.entidadCreada as string)

        // El id que resolvió el servidor vuelve a la fila. Importa para las
        // siguientes del mismo proveedor: ya no hay nada que dar de alta.
        const entidadId =
          (data.comprobante?.proveedorId as string | null) ??
          (data.comprobante?.clienteId as string | null) ??
          fila.entidadId
        const entidadNombre =
          (data.comprobante?.proveedorNombre as string | null) ??
          (data.comprobante?.clienteNombre as string | null) ??
          fila.entidadNombre

        if (entidadId) tocadas.add(entidadId)

        setFilas((prev) =>
          prev.map((f) =>
            f.id === fila.id
              ? { ...f, estado: "guardada", entidadId, entidadNombre, alta: null }
              : f
          )
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

    if (ok === 0) return

    /**
     * El resumen se arma acá y no se le pide al servidor.
     *
     * Todo lo que entró quedó en borrador, así que el impacto contable y el de
     * cobranza son cero por definición: no hay nada que consultar. Lo único que
     * el navegador no podría saber solo —qué fichas se dieron de alta— vino en
     * la respuesta de cada guardado. Preguntarle al servidor sería una consulta
     * por factura para que conteste que todavía no pasó nada.
     */
    onImportadas({
      ...IMPACTO_VACIO(tipo),
      estado: "borrador",
      comprobantes: ok,
      entidadesNuevas: [...nuevas],
      entidades: tocadas.size,
    })
  }

  if (!abierto) return null

  const listas = filas.filter((f) => f.incluida && f.estado !== "guardada").length
  /** Las que no se pueden guardar porque no se sabe de quién son. Se cuentan
   *  aparte para que el pie diga por qué faltan, y no sólo cuántas hay. */
  const sinIdentidad = filas.filter(
    (f) => !f.borrador.error && f.estado !== "guardada" && !identidadResuelta(f)
  ).length
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
              accept="application/pdf,image/jpeg,image/png,image/webp,.csv,text/csv"
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
                  Arrastrá los PDF, las fotos o un CSV acá, o
                </p>
                <Button variant="outline" size="sm" onClick={() => inputArchivo.current?.click()}>
                  Elegir archivos
                </Button>
                <p className="text-[11px] text-ink-faint">
                  PDF, JPG, PNG o WEBP · hasta {ARCHIVOS_MAX} por vez · máx {TAMANO_MAX_MB} MB c/u
                </p>
                <p className="text-[11px] text-ink-faint">
                  O un CSV con una fila por comprobante — hasta {FILAS_MAX} filas
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
              onFila={(cambio) => setFila(fila.id, cambio)}
              onIncluir={(v) => setFila(fila.id, { incluida: v })}
              onQuitar={() => setFilas((prev) => prev.filter((f) => f.id !== fila.id))}
            />
          ))}
        </div>

        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-[12px] text-ink-muted">
              {filas.length === 0 ? (
                "Todavía no adjuntaste nada"
              ) : (
                <>
                  {listas} de {filas.length} lista{listas !== 1 ? "s" : ""} para registrar
                  {sinIdentidad > 0 && (
                    <span className="text-warning-text">
                      {" · "}
                      {sinIdentidad} sin CUIT
                    </span>
                  )}
                </>
              )}
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
  onFila,
  onIncluir,
  onQuitar,
}: {
  tipo: TipoComprobante
  fila: Fila
  onCampo: (k: keyof Campos, v: string) => void
  onFila: (cambio: Partial<Fila>) => void
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
  const listaParaGuardar = identidadResuelta(fila)

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
          // Sin identidad resuelta el servidor la rechaza igual. Bloquear el
          // tilde lo dice antes, en vez de después de apretar Registrar.
          disabled={guardada || fila.estado === "guardando" || !listaParaGuardar}
          onChange={(e) => onIncluir(e.target.checked)}
          aria-label={`Incluir ${b.archivo}`}
          title={listaParaGuardar ? undefined : "Falta identificar con qué CUIT se carga"}
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
        </div>

        {!guardada && (
          <Button variant="ghost" size="icon-sm" onClick={onQuitar} aria-label="Quitar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <BloqueEntidad tipo={tipo} fila={fila} onFila={onFila} onCampo={onCampo} />

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

        {/* La imputación. Es el campo que decide si esta factura llega o no al
            mayor, así que va acá arriba y no escondido detrás de un "avanzado":
            sin cuenta, el comprobante se confirma y no genera asiento. */}
        <Campo rotulo="Cuenta contable">
          <div className="[&_input]:h-8 [&_input]:text-[12px]">
            <SelectorCuenta
              id={`cuenta-${fila.id}`}
              valor={c.cuentaContableId}
              onElegir={(v) => onCampo("cuentaContableId", v)}
              disabled={guardada}
              tipoSugerido={tipo === "compra" ? "egreso" : "ingreso"}
            />
          </div>
          {!c.cuentaContableId && (
            <p className="mt-1 text-[11px] text-warning-text">
              Sin cuenta no va a generar asiento al confirmarla.
            </p>
          )}
        </Campo>

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

/* ── A quién pertenece la factura ─────────────────────────────────────────── */

/**
 * La ficha del comprobante, con sus tres estados posibles.
 *
 *   enganchada  ·  se da de alta  ·  no se sabe
 *
 * Está arriba de todo y ocupa lugar por una razón: es el único campo de la
 * pantalla cuyo error no se arregla editando la factura después. Una imputación
 * equivocada se corrige; una factura colgada del proveedor que no es ensucia dos
 * cuentas corrientes y no se nota hasta que alguien reclama un pago.
 *
 * El alta viene tildada por defecto. La alternativa —obligar a ir al maestro,
 * cargar la ficha y volver— es la que hace que todo termine imputado a dos o
 * tres proveedores "varios" con tal de no interrumpir la carga.
 */
function BloqueEntidad({
  tipo,
  fila,
  onFila,
  onCampo,
}: {
  tipo: TipoComprobante
  fila: Fila
  onFila: (cambio: Partial<Fila>) => void
  onCampo: (k: keyof Campos, v: string) => void
}) {
  const esCompra = tipo === "compra"
  const rotulo = esCompra ? "Proveedor" : "Cliente"
  const bloqueado = fila.estado === "guardada" || fila.estado === "guardando"

  const elegirFicha = (c: {
    id: string
    razonSocial: string
    condicionPagoDias: number | null
    cuentaContableId: string | null
  }) => {
    onFila({ entidadId: c.id, entidadNombre: c.razonSocial, alta: null, buscando: false })

    // Lo que la ficha ya sabe entra en la factura, igual que en la carga
    // manual: el plazo propone el vencimiento y la cuenta guardada manda sobre
    // el default del tipo. Ninguno pisa algo que ya se haya corregido a mano.
    if (c.cuentaContableId) onCampo("cuentaContableId", c.cuentaContableId)
    if (c.condicionPagoDias !== null && fila.campos.fecha && !fila.campos.fechaVencimiento) {
      onCampo("fechaVencimiento", sumarDias(fila.campos.fecha, c.condicionPagoDias))
    }
  }

  if (fila.buscando && !bloqueado) {
    return (
      <div className="border-b border-line-soft bg-surface-subtle px-4 py-3">
        <SelectorEntidad
          id={`entidad-${fila.id}`}
          tipo={esCompra ? "proveedor" : "cliente"}
          valor={fila.entidadId ?? ""}
          nombre={fila.entidadNombre}
          etiqueta={`${rotulo} del sistema`}
          permitirAlta
          onElegir={elegirFicha}
        />
        <button
          type="button"
          onClick={() => onFila({ buscando: false })}
          className="mt-2 text-[11.5px] font-medium text-brand-600 hover:underline"
        >
          Cancelar
        </button>
      </div>
    )
  }

  /* Enganchada con una ficha que ya existe. */
  if (fila.entidadId) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-soft px-4 py-2.5">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-subtle">{rotulo}</span>
        <span className="truncate text-[13px] font-medium text-ink">{fila.entidadNombre}</span>
        {fila.borrador.entidad?.cuit && (
          <span className="num text-[11.5px] text-ink-muted">
            {formatearCuit(fila.borrador.entidad.cuit)}
          </span>
        )}
        {!bloqueado && (
          <button
            type="button"
            onClick={() => onFila({ buscando: true })}
            className="ml-auto text-[11.5px] font-medium text-brand-600 hover:underline"
          >
            Cambiar
          </button>
        )}
      </div>
    )
  }

  /* Sin ficha, pero con datos para darla de alta. */
  if (fila.alta) {
    const alta = fila.alta
    const delExterior = alta.origen === "exterior"
    // `errorDeCuit` no se queja del campo vacío —el CUIT es opcional en el
    // maestro—, pero acá vacío sí es un problema: sin él no hay alta.
    const problemaCuit = delExterior
      ? null
      : !alta.cuit
        ? "Sin CUIT no se puede dar de alta: es lo que identifica al proveedor."
        : errorDeCuit(alta.cuit)
    const cuitOk = !delExterior && !problemaCuit

    return (
      <div
        className={cn(
          "border-b border-line-soft px-4 py-3",
          problemaCuit ? "bg-warning-soft/40" : "bg-brand-50/60"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <UserPlus
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              problemaCuit ? "text-warning-text" : "text-brand-600"
            )}
          />
          <span className="text-[12px] font-semibold text-ink">
            {rotulo} nuevo: se da de alta al guardar
          </span>
          {!bloqueado && (
            <button
              type="button"
              onClick={() => onFila({ buscando: true })}
              className="ml-auto text-[11.5px] font-medium text-brand-600 hover:underline"
            >
              Elegir uno existente
            </button>
          )}
        </div>

        {/* El CUIT va primero y ocupa más lugar que el nombre a propósito: es
            el dato que decide de quién es la factura. La razón social es cómo
            se llama, que es otra cosa y se corrige cuando haga falta. */}
        <div className="mt-2 grid gap-3 sm:grid-cols-5">
          <Campo rotulo="CUIT" className="sm:col-span-2">
            <div className="relative">
              <MiniInput
                value={alta.cuit ?? ""}
                onChange={(v) => onFila({ alta: { ...alta, cuit: v || null } })}
                disabled={bloqueado || delExterior}
                placeholder={delExterior ? "No aplica" : "30-50054729-0"}
              />
              {cuitOk && (
                <Check className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success" />
              )}
            </div>
            {problemaCuit && (
              <p className="mt-1 text-[11px] leading-snug text-warning-text">{problemaCuit}</p>
            )}
            {delExterior && (
              <p className="mt-1 text-[11px] text-ink-muted">
                Del exterior: el CUIT no aplica.
              </p>
            )}
          </Campo>

          <Campo rotulo="Razón social" className="sm:col-span-3">
            <MiniInput
              value={alta.razonSocial}
              onChange={(v) => onFila({ alta: { ...alta, razonSocial: v } })}
              disabled={bloqueado}
            />
          </Campo>
        </div>
      </div>
    )
  }

  /* Ni ficha ni datos: no hay forma de guardar sin elegirlo a mano. */
  return (
    <div className="border-b border-line-soft bg-warning-soft/40 px-4 py-3">
      <p className="mb-2 text-[12px] font-medium text-warning-text">
        No se pudo identificar el {rotulo.toLowerCase()}. Elegilo para poder guardar.
      </p>
      <SelectorEntidad
        id={`entidad-${fila.id}`}
        tipo={esCompra ? "proveedor" : "cliente"}
        valor=""
        nombre=""
        etiqueta={null}
        permitirAlta
        onElegir={elegirFicha}
      />
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
