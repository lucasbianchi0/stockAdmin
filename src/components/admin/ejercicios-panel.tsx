"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CalendarRange, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DialogoPasos } from "@/components/ui/dialogo-pasos"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/states"
import { fechaLarga, type Ejercicio, type Proyeccion } from "@/lib/admin/ejercicios"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import { cn } from "@/lib/utils"

/**
 * Los ejercicios contables, arriba del plan de cuentas.
 *
 * Lo único que se edita es dónde empieza o termina uno, y siempre con la misma
 * secuencia: qué cambiar, la fecha nueva, y revisar cuántos asientos se mueven
 * antes de confirmar. Mover un límite renumera asientos; no puede ser un campo
 * de fecha que se guarda al salir.
 */

const URL = "/api/admin/ejercicios"

export function EjerciciosPanel() {
  const query = useQuery({
    queryKey: claves.url(URL),
    queryFn: ({ signal }) => pedirJson<{ ejercicios: Ejercicio[] }>(URL, { signal }),
  })
  const [editando, setEditando] = useState<Ejercicio | null>(null)
  const ejercicios = query.data?.ejercicios ?? []

  return (
    <div className="panel mb-6 overflow-clip">
      <div className="panel-header">
        <div>
          <p className="text-[13.5px] font-semibold text-ink">Ejercicios contables</p>
          <p className="text-[12px] text-ink-muted">
            Cada asiento pertenece al ejercicio de su fecha y se numera desde 1 dentro de él. «Ver detalle» abre todo
            lo de ese ejercicio.
          </p>
        </div>
        <Badge tone="warning" size="sm">
          En prueba
        </Badge>
      </div>

      {query.isPending ? (
        <LoadingState label="Cargando ejercicios…" />
      ) : (
        <ul className="divide-y divide-line">
          {[...ejercicios].reverse().map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
              <Link
                href={`/admin/maestros/ejercicios/${e.id}`}
                className="flex w-[110px] items-center gap-2 text-[15px] font-semibold text-ink hover:text-brand-700"
              >
                {e.nombre}
              </Link>
              <p className="num min-w-[220px] flex-1 text-[12.5px] text-ink-secondary">
                {fechaLarga(e.inicio)} <span className="text-ink-faint">al</span> {fechaLarga(e.fin)}
              </p>
              <p className="num w-[110px] text-[12px] text-ink-muted">
                {e.asientos} asiento{e.asientos === 1 ? "" : "s"}
              </p>
              <div className="flex w-[120px] items-center gap-1.5">
                {e.enCurso && (
                  <Badge tone="brand" size="sm">
                    En curso
                  </Badge>
                )}
                {e.estado === "cerrado" && (
                  <Badge tone="neutral" size="sm">
                    Cerrado
                  </Badge>
                )}
              </div>
              <Button asChild size="sm">
                <Link href={`/admin/maestros/ejercicios/${e.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                  Ver detalle
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={e.estado === "cerrado"}
                onClick={() => setEditando(e)}
                title={e.estado === "cerrado" ? "Un ejercicio cerrado no se modifica" : undefined}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                Cambiar fechas
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editando && <CambiarFechas ejercicio={editando} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

function CambiarFechas({ ejercicio, onCerrar }: { ejercicio: Ejercicio; onCerrar: () => void }) {
  const invalidar = useInvalidarAdmin({ maestros: true })
  const [paso, setPaso] = useState(0)
  const [campo, setCampo] = useState<"inicio" | "fin">("inicio")
  const [fecha, setFecha] = useState("")
  const [proyeccion, setProyeccion] = useState<(Proyeccion & { mueven: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const enviar = (confirmar: boolean) =>
    pedirJson<Proyeccion & { mueven: number }>(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ejercicio.id, campo, fecha, confirmar }),
    })

  const revisar = async () => {
    setTrabajando(true)
    setError(null)
    try {
      setProyeccion(await enviar(false))
      setPaso(2)
    } catch (e) {
      setError(mensajeError(e, "No se pudo calcular el cambio"))
    } finally {
      setTrabajando(false)
    }
  }

  const confirmar = async () => {
    setTrabajando(true)
    try {
      await enviar(true)
      void invalidar()
      toast.success(`Ejercicio ${proyeccion?.despues.find((e) => e.id === ejercicio.id)?.nombre} actualizado`)
      onCerrar()
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el ejercicio"))
      setTrabajando(false)
    }
  }

  const pie =
    paso === 0 ? (
      <>
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button onClick={() => setPaso(1)}>Siguiente</Button>
      </>
    ) : paso === 1 ? (
      <>
        <Button variant="ghost" onClick={() => setPaso(0)} disabled={trabajando}>
          Atrás
        </Button>
        <Button onClick={revisar} disabled={!fecha || trabajando}>
          {trabajando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Revisar el cambio
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setPaso(1)} disabled={trabajando}>
          Atrás
        </Button>
        <Button onClick={confirmar} disabled={trabajando}>
          {trabajando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Confirmar el cambio
        </Button>
      </>
    )

  return (
    <DialogoPasos
      abierto
      titulo={`Cambiar fechas del ejercicio ${ejercicio.nombre}`}
      pasos={["Qué cambiar", "Fecha nueva", "Revisar"]}
      paso={paso}
      onCerrar={onCerrar}
      bloqueado={trabajando}
      pie={pie}
    >
      {paso === 0 && (
        <div className="space-y-2.5">
          {(
            [
              ["inicio", "Cuándo empieza", `Hoy empieza el ${fechaLarga(ejercicio.inicio)}. El ejercicio anterior termina el día antes.`],
              ["fin", "Cuándo cierra", `Hoy cierra el ${fechaLarga(ejercicio.fin)}. El ejercicio siguiente empieza el día después.`],
            ] as const
          ).map(([valor, rotulo, ayuda]) => (
            <label
              key={valor}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors",
                campo === valor ? "border-brand-400 bg-brand-50/60" : "border-line hover:bg-surface-muted"
              )}
            >
              <input
                type="radio"
                name="campo"
                checked={campo === valor}
                onChange={() => {
                  setCampo(valor)
                  setFecha("")
                }}
                className="mt-1 accent-brand-600"
              />
              <span>
                <span className="block text-[13.5px] font-medium text-ink">{rotulo}</span>
                <span className="block text-[12px] text-ink-muted">{ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {paso === 1 && (
        <div className="space-y-3">
          <label htmlFor="fecha-ejercicio" className="block text-[13px] font-medium text-ink">
            {campo === "inicio" ? "¿Desde qué día empieza el ejercicio?" : "¿Qué día cierra el ejercicio?"}
          </label>
          <Input
            id="fecha-ejercicio"
            type="date"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value)
              setError(null)
            }}
            className="w-[200px]"
            autoFocus
          />
          <p className="text-[12px] text-ink-muted">
            En el paso siguiente vas a ver cómo quedan los ejercicios y cuántos asientos cambian de
            ejercicio antes de confirmar nada.
          </p>
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}

      {paso === 2 && proyeccion && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-subtle text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Ejercicio</th>
                  <th className="px-3 py-2 text-left font-semibold">Antes</th>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2 text-left font-semibold">Después</th>
                </tr>
              </thead>
              <tbody>
                {proyeccion.despues.map((d) => {
                  const a = proyeccion.antes.find((x) => x.id === d.id)!
                  const cambia = a.inicio !== d.inicio || a.fin !== d.fin
                  return (
                    <tr key={d.id} className={cn("border-t border-line", !cambia && "text-ink-faint")}>
                      <td className="px-3 py-2 font-medium">{d.nombre}</td>
                      <td className="num px-3 py-2">
                        {fechaLarga(a.inicio)} al {fechaLarga(a.fin)}
                      </td>
                      <td className="px-1 py-2 text-ink-faint">{cambia && <ArrowRight className="h-3.5 w-3.5" />}</td>
                      <td className={cn("num px-3 py-2", cambia && "font-semibold text-ink")}>
                        {fechaLarga(d.inicio)} al {fechaLarga(d.fin)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {proyeccion.tramoQueCambia && (
            <div
              className={cn(
                "rounded-xl border px-4 py-3",
                proyeccion.mueven > 0 ? "border-warning-line bg-warning-soft" : "border-line bg-surface-subtle"
              )}
            >
              <p className={cn("text-[13px] font-semibold", proyeccion.mueven > 0 ? "text-warning-text" : "text-ink")}>
                {proyeccion.mueven === 0
                  ? "Ningún asiento cambia de ejercicio"
                  : `${proyeccion.mueven} asiento${proyeccion.mueven === 1 ? "" : "s"} pasa${proyeccion.mueven === 1 ? "" : "n"} de ${proyeccion.tramoQueCambia.de} a ${proyeccion.tramoQueCambia.a}`}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-secondary">
                Los del {fechaLarga(proyeccion.tramoQueCambia.desde)} al{" "}
                {fechaLarga(proyeccion.tramoQueCambia.hasta)}.{" "}
                {proyeccion.mueven > 0 &&
                  "Los dos ejercicios se vuelven a numerar desde 1 por fecha. Importes, cuentas y fechas no cambian."}
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </DialogoPasos>
  )
}
