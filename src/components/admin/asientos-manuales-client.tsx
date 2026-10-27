"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Check, ClipboardPaste, FilePlus2, Loader2, Lock, Plus, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatoRevision, DialogoPasos } from "@/components/ui/dialogo-pasos"
import { Input } from "@/components/ui/input"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { Textarea } from "@/components/ui/textarea"
import {
  TIPO_BORRADOR_LABEL,
  cuadre,
  problemaDeLinea,
  type AsientoBorrador,
  type LineaBorrador,
  type TipoBorrador,
} from "@/lib/admin/asientos-borradores"
import { fechaLarga, type Ejercicio } from "@/lib/admin/ejercicios"
import { formatearImporte, parsearImporte } from "@/lib/admin/moneda"
import { usePlanCuentas, type CuentaContable } from "@/lib/admin/plan-cuentas"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { cn } from "@/lib/utils"

/**
 * Asientos automáticos: los que no salen de una factura.
 *
 *  · **Apertura** y **ajuste por inflación**: los pasa el estudio. Se cargan
 *    renglón por renglón o pegándolos desde su Excel.
 *  · **Cierre**: lo propone el sistema con lo asentado en el ejercicio —cada
 *    cuenta de resultado a cero, la diferencia a 410—, y se revisa.
 *
 * En prueba quedan como borradores: se arman, se controla que cuadren, y
 * registrarlos en el libro diario se habilita cuando se apruebe.
 */

const URL_EJERCICIOS = "/api/admin/ejercicios"

function useEjercicios() {
  return useQuery({
    queryKey: claves.url(URL_EJERCICIOS),
    queryFn: ({ signal }) => pedirJson<{ ejercicios: Ejercicio[] }>(URL_EJERCICIOS, { signal }),
  }).data?.ejercicios ?? []
}

const AYUDA: Record<TipoBorrador, string> = {
  apertura:
    "El primer asiento del ejercicio: reabre las cuentas patrimoniales con los saldos del cierre anterior. Lo pasa el estudio.",
  ajuste_inflacion:
    "El ajuste por inflación del ejercicio, calculado por el estudio con los índices FACPCE. Se carga como lo mandan.",
  cierre:
    "Lleva a cero las cuentas de resultado y pasa la diferencia a 410 Resultados del Ejercicio. Lo arma el sistema con lo asentado.",
}

export function AsientosManualesClient({ tipos }: { tipos: TipoBorrador[] }) {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning-text">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        En prueba: estos asientos se guardan como borrador y no entran al libro diario hasta que se apruebe.
      </p>
      {tipos.map((t) => (
        <Seccion key={t} tipo={t} />
      ))}
    </div>
  )
}

function Seccion({ tipo }: { tipo: TipoBorrador }) {
  const url = `/api/admin/asientos-borradores?tipos=${tipo}`
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<{ borradores: AsientoBorrador[] }>(url, { signal }),
  })
  const ejercicios = useEjercicios()
  const invalidar = useInvalidarAdmin()
  const [editando, setEditando] = useState<AsientoBorrador | "nuevo" | null>(null)
  const [proponiendo, setProponiendo] = useState(false)
  const borradores = query.data?.borradores ?? []

  // Para el cierre se propone el último ejercicio que ya terminó.
  const hoy = new Date().toISOString().slice(0, 10)
  const terminado = [...ejercicios].reverse().find((e) => e.fin < hoy)

  const proponer = async () => {
    if (!terminado) return
    setProponiendo(true)
    try {
      const b = await pedirJson<AsientoBorrador>("/api/admin/asientos-borradores/proponer-cierre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ejercicioId: terminado.id }),
      })
      void invalidar()
      toast.success(`Cierre de ${terminado.nombre} armado: revisalo`)
      setEditando(b)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo armar el cierre"))
    } finally {
      setProponiendo(false)
    }
  }

  const descartar = async (b: AsientoBorrador) => {
    try {
      await pedirJson(`/api/admin/asientos-borradores/${b.id}`, { method: "DELETE" })
      void invalidar()
      toast.success("Borrador descartado")
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo descartar"))
    }
  }

  return (
    <section className="panel overflow-clip">
      <div className="panel-header flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">{TIPO_BORRADOR_LABEL[tipo]}</p>
          <p className="max-w-[620px] text-[12px] text-ink-muted">{AYUDA[tipo]}</p>
        </div>
        {tipo === "cierre" ? (
          <Button onClick={proponer} disabled={!terminado || proponiendo}>
            {proponiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {terminado ? `Proponer el cierre de ${terminado.nombre}` : "Ningún ejercicio terminado"}
          </Button>
        ) : (
          <Button onClick={() => setEditando("nuevo")}>
            <FilePlus2 className="h-4 w-4" />
            Cargar el asiento del estudio
          </Button>
        )}
      </div>

      {query.isPending ? (
        <LoadingState label="Cargando…" />
      ) : borradores.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="Todavía no hay ninguno"
          description={
            tipo === "cierre"
              ? "El sistema lo arma con lo asentado. Después lo revisás antes de guardarlo."
              : "Cuando el estudio lo pase, cargalo acá: a mano o pegándolo desde su Excel."
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {borradores.map((b) => {
            const c = cuadre(b.lineas)
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
                <div className="min-w-[240px] flex-1">
                  <p className="text-[13px] font-medium text-ink">{b.descripcion}</p>
                  <p className="text-[11.5px] text-ink-muted">
                    {fechaLarga(b.fecha)} · {b.lineas.length} renglones · {formatearImporte(c.debe)}
                  </p>
                </div>
                {c.cuadra ? (
                  <Badge tone="success" size="sm">
                    Cuadra
                  </Badge>
                ) : (
                  <Badge tone="danger" size="sm">
                    Diferencia {formatearImporte(Math.abs(c.diferencia))}
                  </Badge>
                )}
                <Badge tone="warning" size="sm">
                  Borrador
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setEditando(b)}>
                    Abrir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title="Se habilita cuando se apruebe la prueba"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Registrar en el libro
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => descartar(b)}>
                    Descartar
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editando && (
        <EditorAsiento
          tipo={tipo}
          borrador={editando === "nuevo" ? null : editando}
          ejercicios={ejercicios}
          onCerrar={() => setEditando(null)}
        />
      )}
    </section>
  )
}

/* ── El editor guiado ─────────────────────────────────────────────────────── */

type Renglon = { clave: number; cuentaId: string; debe: string; haber: string; detalle: string }

let siguienteClave = 1
const renglon = (l?: Partial<LineaBorrador>): Renglon => ({
  clave: siguienteClave++,
  cuentaId: l?.cuentaId ?? "",
  debe: l?.debe ? formatearImporte(l.debe, "ARS", { simbolo: false }) : "",
  haber: l?.haber ? formatearImporte(l.haber, "ARS", { simbolo: false }) : "",
  detalle: l?.detalle ?? "",
})

/**
 * Lo que se pega desde el Excel del estudio: un renglón por cuenta, con el
 * código, y el debe y el haber. Acepta tabulaciones (copiar celdas) o punto y
 * coma, y la columna del nombre de la cuenta en el medio si viene.
 */
function parsearPegado(texto: string, cuentas: CuentaContable[]) {
  const porCodigo = new Map(cuentas.map((c) => [c.codigo.trim(), c]))
  const renglones: Renglon[] = []
  const desconocidos: string[] = []
  for (const linea of texto.split(/\r?\n/)) {
    const celdas = linea.split(/\t|;/).map((c) => c.trim())
    if (!celdas[0]) continue
    const cuenta = porCodigo.get(celdas[0])
    if (!cuenta) {
      if (/\d/.test(celdas[0])) desconocidos.push(celdas[0])
      continue
    }
    // Las dos últimas columnas son debe y haber: así una celda vacía no corre
    // los importes de lugar, y el nombre de la cuenta en el medio no estorba.
    // Con un solo importe, negativo es haber.
    let debe = 0
    let haber = 0
    if (celdas.length >= 3) {
      debe = parsearImporte(celdas[celdas.length - 2]) ?? 0
      haber = parsearImporte(celdas[celdas.length - 1]) ?? 0
    } else {
      const unico = parsearImporte(celdas[1] ?? "") ?? 0
      if (unico < 0) haber = -unico
      else debe = unico
    }
    renglones.push(renglon({ cuentaId: cuenta.id, debe, haber }))
  }
  return { renglones, desconocidos }
}

function EditorAsiento({
  tipo,
  borrador,
  ejercicios,
  onCerrar,
}: {
  tipo: TipoBorrador
  borrador: AsientoBorrador | null
  ejercicios: Ejercicio[]
  onCerrar: () => void
}) {
  const invalidar = useInvalidarAdmin()
  const { cuentas } = usePlanCuentas()
  const cuentaDe = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])

  const hoy = new Date().toISOString().slice(0, 10)
  const enCurso = ejercicios.find((e) => e.enCurso)
  const terminado = [...ejercicios].reverse().find((e) => e.fin < hoy)
  const fechaPropuesta = tipo === "apertura" ? enCurso?.inicio : terminado?.fin

  const [paso, setPaso] = useState(0)
  const [fecha, setFecha] = useState(borrador?.fecha ?? fechaPropuesta ?? hoy)
  const [descripcion, setDescripcion] = useState(
    borrador?.descripcion ??
      (tipo === "apertura"
        ? `Apertura del ejercicio ${enCurso?.nombre ?? ""}`.trim()
        : `Ajuste por inflación ${terminado?.nombre ?? ""}`.trim())
  )
  const [renglones, setRenglones] = useState<Renglon[]>(
    borrador?.lineas.length ? borrador.lineas.map((l) => renglon(l)) : [renglon(), renglon()]
  )
  const [pegando, setPegando] = useState(false)
  const [textoPegado, setTextoPegado] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const lineas: LineaBorrador[] = renglones
    .filter((r) => r.cuentaId || r.debe || r.haber)
    .map((r) => {
      const c = cuentaDe.get(r.cuentaId)
      return {
        cuentaId: r.cuentaId,
        codigo: c?.codigo ?? "",
        nombre: c?.nombre ?? "",
        debe: parsearImporte(r.debe) ?? 0,
        haber: parsearImporte(r.haber) ?? 0,
        detalle: r.detalle.trim() || null,
      }
    })
  const c = cuadre(lineas)
  const problema = lineas.map((l, i) => [i, problemaDeLinea(l)] as const).find(([, p]) => p)

  const falta =
    paso === 0
      ? !fecha
        ? "Poné la fecha"
        : !descripcion.trim()
          ? "Poné una descripción"
          : null
      : paso === 1
        ? lineas.length < 2
          ? "Un asiento tiene al menos dos renglones"
          : problema
            ? `Renglón ${problema[0] + 1}: ${problema[1]}`
            : null
        : null

  const cambiar = (clave: number, campo: keyof Renglon, valor: string) =>
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, [campo]: valor } : r)))

  const pegar = () => {
    const { renglones: nuevos, desconocidos } = parsearPegado(textoPegado, cuentas)
    if (!nuevos.length) {
      setAviso("No reconocí ninguna cuenta. La primera columna tiene que ser el código del plan (por ejemplo 410).")
      return
    }
    setRenglones((rs) => [...rs.filter((r) => r.cuentaId || r.debe || r.haber), ...nuevos])
    setAviso(
      desconocidos.length
        ? `Se agregaron ${nuevos.length} renglones. No están en el plan: ${desconocidos.slice(0, 6).join(", ")}${desconocidos.length > 6 ? "…" : ""}.`
        : `Se agregaron ${nuevos.length} renglones.`
    )
    setTextoPegado("")
    setPegando(false)
  }

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await pedirJson(borrador ? `/api/admin/asientos-borradores/${borrador.id}` : "/api/admin/asientos-borradores", {
        method: borrador ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, fecha, descripcion, lineas }),
      })
      void invalidar()
      toast.success("Borrador guardado")
      onCerrar()
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"))
      setGuardando(false)
    }
  }

  return (
    <DialogoPasos
      abierto
      ancho="xl"
      titulo={borrador ? `${TIPO_BORRADOR_LABEL[tipo]} · borrador` : `Nuevo ${TIPO_BORRADOR_LABEL[tipo].toLowerCase()}`}
      pasos={["Fecha y descripción", "Renglones", "Revisar"]}
      paso={paso}
      onCerrar={onCerrar}
      bloqueado={guardando}
      pie={
        <>
          <span className="mr-auto text-[12px] text-ink-muted">{paso < 2 ? falta : null}</span>
          {paso === 0 ? (
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setPaso(paso - 1)} disabled={guardando}>
              Atrás
            </Button>
          )}
          {paso < 2 ? (
            <Button onClick={() => setPaso(paso + 1)} disabled={Boolean(falta)}>
              Siguiente
            </Button>
          ) : (
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar borrador
            </Button>
          )}
        </>
      }
    >
      {paso === 0 && (
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            <label htmlFor="fecha-asiento" className="mb-1 block text-[13px] font-medium text-ink">
              Fecha
            </label>
            <Input id="fecha-asiento" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {fechaPropuesta && (
              <p className="mt-1 text-[11.5px] text-ink-muted">
                {tipo === "apertura" ? "El inicio del ejercicio en curso" : "El cierre del último ejercicio"}:{" "}
                {fechaLarga(fechaPropuesta)}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="desc-asiento" className="mb-1 block text-[13px] font-medium text-ink">
              Descripción
            </label>
            <Input id="desc-asiento" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus />
            <p className="mt-1 text-[11.5px] text-ink-muted">Es lo que va a decir el asiento en el libro diario.</p>
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-ink-secondary">
              Cada renglón va al debe o al haber. Abajo se ve si cuadra mientras cargás.
            </p>
            <Button variant="outline" size="sm" onClick={() => setPegando((v) => !v)}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              Pegar desde Excel
            </Button>
          </div>

          {pegando && (
            <div className="rounded-xl border border-line bg-surface-subtle p-3">
              <p className="mb-1.5 text-[12px] text-ink-secondary">
                Copiá del Excel del estudio las columnas <b>código · debe · haber</b> (el nombre de la cuenta en el medio
                también sirve) y pegalas acá.
              </p>
              <Textarea
                rows={5}
                value={textoPegado}
                onChange={(e) => setTextoPegado(e.target.value)}
                className="font-mono text-[12px]"
                placeholder={"10\t1.250.000,00\t\n201\t\t980.000,00\n410\t\t270.000,00"}
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={pegar} disabled={!textoPegado.trim()}>
                  Agregar renglones
                </Button>
              </div>
            </div>
          )}
          {aviso && <p className="text-[12px] text-ink-secondary">{aviso}</p>}

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[minmax(0,1.6fr)_140px_140px_minmax(0,1fr)_32px] gap-2 bg-surface-subtle px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              <span>Cuenta</span>
              <span className="text-right">Debe</span>
              <span className="text-right">Haber</span>
              <span>Detalle</span>
              <span />
            </div>
            <div className="divide-y divide-line">
              {renglones.map((r) => (
                <div key={r.clave} className="grid grid-cols-[minmax(0,1.6fr)_140px_140px_minmax(0,1fr)_32px] items-center gap-2 px-3 py-2">
                  <SelectorCuenta id={`cuenta-${r.clave}`} valor={r.cuentaId} onElegir={(v) => cambiar(r.clave, "cuentaId", v)} />
                  <Input inputMode="decimal" aria-label="Debe" value={r.debe} onChange={(e) => cambiar(r.clave, "debe", e.target.value)} className="num text-right" />
                  <Input inputMode="decimal" aria-label="Haber" value={r.haber} onChange={(e) => cambiar(r.clave, "haber", e.target.value)} className="num text-right" />
                  <Input aria-label="Detalle" value={r.detalle} onChange={(e) => cambiar(r.clave, "detalle", e.target.value)} placeholder="opcional" />
                  <button
                    onClick={() => setRenglones((rs) => (rs.length > 1 ? rs.filter((x) => x.clave !== r.clave) : rs))}
                    aria-label="Quitar renglón"
                    className="rounded-md p-1 text-ink-faint hover:bg-surface-muted hover:text-ink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1.6fr)_140px_140px_minmax(0,1fr)_32px] items-center gap-2 border-t border-line bg-surface-subtle px-3 py-2.5">
              <button
                onClick={() => setRenglones((rs) => [...rs, renglon()])}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar renglón
              </button>
              <span className="num text-right text-[12.5px] font-semibold text-ink">{formatearImporte(c.debe, "ARS", { simbolo: false })}</span>
              <span className="num text-right text-[12.5px] font-semibold text-ink">{formatearImporte(c.haber, "ARS", { simbolo: false })}</span>
              <span className={cn("text-[12px] font-semibold", c.cuadra ? "text-success-text" : "text-danger-text")}>
                {c.cuadra ? "Cuadra" : c.debe || c.haber ? `Diferencia ${formatearImporte(Math.abs(c.diferencia))}` : ""}
              </span>
              <span />
            </div>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
            <DatoRevision rotulo="Asiento">{descripcion}</DatoRevision>
            <DatoRevision rotulo="Fecha">{fechaLarga(fecha)}</DatoRevision>
            <DatoRevision rotulo="Partida doble">
              {c.cuadra ? (
                <span className="flex items-center gap-1.5 font-semibold text-success-text">
                  <Check className="h-4 w-4" /> Cuadra en {formatearImporte(c.debe)}
                </span>
              ) : (
                <span className="font-semibold text-danger-text">
                  No cuadra: diferencia de {formatearImporte(Math.abs(c.diferencia))}
                </span>
              )}
            </DatoRevision>
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[12.5px]">
              <tbody>
                {[...lineas]
                  .sort((a, b) => (a.debe > 0 ? 0 : 1) - (b.debe > 0 ? 0 : 1))
                  .map((l, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className={cn("px-3 py-2", l.haber > 0 && "pl-9")}>
                        <span className="font-mono text-[11px] text-ink-faint">{l.codigo}</span> {l.nombre}
                        {l.detalle && <span className="block text-[11px] text-ink-muted">{l.detalle}</span>}
                      </td>
                      <td className="num w-[150px] px-3 py-2 text-right">
                        {l.debe ? formatearImporte(l.debe, "ARS", { simbolo: false }) : ""}
                      </td>
                      <td className="num w-[150px] px-3 py-2 text-right">
                        {l.haber ? formatearImporte(l.haber, "ARS", { simbolo: false }) : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!c.cuadra && (
            <p className="text-[12px] text-ink-muted">
              Se puede guardar como borrador igual, para terminarlo después. Para registrarlo en el libro tiene que cuadrar.
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">{error}</p>
          )}
        </div>
      )}
    </DialogoPasos>
  )
}
