"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Lock, LockOpen } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { Input } from "@/components/ui/input"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Textarea } from "@/components/ui/textarea"
import {
  finDeMes,
  mesAnterior,
  mesDe,
  nombreMes,
  type EstadoCierre,
} from "@/lib/admin/cierre"
import { formatearFechaLarga, hoyArgentina } from "@/lib/admin/fecha"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"

/**
 * Cierre de períodos.
 *
 * Una sola fecha: «cerrado hasta». Se cierra por mes completo y siempre hacia
 * adelante; volver atrás es reabrir, que es de administradores y pide motivo.
 * Lo que de verdad frena la carga son los triggers de la base: esta pantalla
 * solo mueve la fecha y muestra quién la movió.
 */

const URL = "/api/admin/contabilidad/cierre"

export function CierrePeriodosClient() {
  const query = useQuery({
    queryKey: claves.url(URL),
    queryFn: ({ signal }) => pedirJson<EstadoCierre>(URL, { signal }),
  })

  if (query.isPending) return <LoadingState label="Cargando el cierre…" />
  if (query.isError) {
    return <ErrorState message={mensajeError(query.error)} onRetry={() => query.refetch()} />
  }

  const estado = query.data
  return (
    <div className="space-y-6">
      <EstadoActual estado={estado} />
      <Historial estado={estado} />
    </div>
  )
}

function EstadoActual({ estado }: { estado: EstadoCierre }) {
  const invalidar = useInvalidarAdmin()
  const hoy = hoyArgentina()
  // El último mes que ya terminó es lo que se cierra casi siempre.
  const ultimoTerminado = mesAnterior(mesDe(hoy))
  const [mes, setMes] = useState(ultimoTerminado)
  const [confirmando, setConfirmando] = useState(false)
  const [reabriendo, setReabriendo] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const yaCerrado = estado.hasta !== null && finDeMes(mes) <= estado.hasta

  const cerrar = async () => {
    setTrabajando(true)
    try {
      await pedirJson(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes }),
      })
      await invalidar()
      toast.success(`Cerrado hasta ${nombreMes(mes)}`)
      setConfirmando(false)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo cerrar el período"))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="panel overflow-clip">
      <div className="flex flex-wrap items-center gap-5 px-5 py-5">
        <div
          className={
            estado.hasta
              ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text ring-1 ring-inset ring-warning-line"
              : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted ring-1 ring-inset ring-line"
          }
        >
          {estado.hasta ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-muted">
            {estado.hasta ? "Cerrado hasta el" : "Sin períodos cerrados"}
          </p>
          <p className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {estado.hasta ? formatearFechaLarga(estado.hasta) : "Todo abierto"}
          </p>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-secondary">
            Cerrar un mes bloquea todo lo que tenga fecha hasta su último día —facturas confirmadas
            (por su fecha de registro), cobros, pagos, movimientos y asientos—: nadie lo puede
            cargar, editar ni borrar.
          </p>
        </div>
        {estado.hasta && estado.puedeReabrir && (
          <Button variant="outline" onClick={() => setReabriendo(true)}>
            <LockOpen className="h-3.5 w-3.5" />
            Reabrir
          </Button>
        )}
      </div>

      <div className="panel-footer flex flex-wrap items-center gap-3">
        <label htmlFor="mes-cierre" className="text-[13px] font-medium text-ink">
          Cerrar hasta
        </label>
        <Input
          id="mes-cierre"
          type="month"
          value={mes}
          max={ultimoTerminado}
          onChange={(e) => setMes(e.target.value)}
          className="w-[170px]"
        />
        <Button onClick={() => setConfirmando(true)} disabled={!mes || yaCerrado || mes > ultimoTerminado}>
          <Lock className="h-3.5 w-3.5" />
          {mes ? `Cerrar hasta ${nombreMes(mes)}` : "Cerrar"}
        </Button>
        {yaCerrado && (
          <p className="text-[12px] text-ink-muted">Ese mes ya está cerrado.</p>
        )}
      </div>

      <ConfirmarDialog
        abierto={confirmando}
        titulo={`¿Cerrar hasta ${mes ? nombreMes(mes) : ""}?`}
        descripcion={
          <>
            Desde ahora no se va a poder cargar, editar ni borrar nada con fecha hasta el{" "}
            {mes ? formatearFechaLarga(finDeMes(mes)) : ""}. Para corregir algo después, un
            administrador tiene que reabrir el período.
          </>
        }
        confirmar="Cerrar el período"
        tono="warning"
        trabajando={trabajando}
        onCerrar={() => setConfirmando(false)}
        onConfirmar={cerrar}
      />

      {reabriendo && estado.hasta && (
        <Reabrir hasta={estado.hasta} onCerrar={() => setReabriendo(false)} />
      )}
    </div>
  )
}

function Reabrir({ hasta, onCerrar }: { hasta: string; onCerrar: () => void }) {
  const invalidar = useInvalidarAdmin()
  // Los meses que se pueden reabrir, del último cerrado para atrás: un año
  // alcanza; más atrás está «Todo».
  const meses = useMemo(() => {
    const lista: string[] = []
    let m = mesDe(hasta)
    for (let i = 0; i < 12; i++) {
      lista.push(m)
      m = mesAnterior(m)
    }
    return lista
  }, [hasta])
  const [desde, setDesde] = useState<string>(meses[0])
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const reabrir = async () => {
    if (!motivo.trim()) {
      setError("Contá por qué se reabre: queda en el historial.")
      return
    }
    setTrabajando(true)
    setError(null)
    try {
      await pedirJson(`${URL}/reabrir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desde: desde === "todo" ? null : desde, motivo }),
      })
      await invalidar()
      toast.success(desde === "todo" ? "Se reabrieron todos los períodos" : `Reabierto desde ${nombreMes(desde)}`)
      onCerrar()
    } catch (e) {
      setError(mensajeError(e, "No se pudo reabrir el período"))
      setTrabajando(false)
    }
  }

  return (
    <ConfirmarDialog
      abierto
      titulo="Reabrir un período cerrado"
      descripcion={
        <div className="space-y-3">
          <p>
            Lo que se reabra se va a poder volver a cargar y modificar. Si el estudio ya presentó
            ese período, avisale antes de tocar nada.
          </p>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Reabrir desde</span>
            <select
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9 w-full rounded-md border border-line bg-surface px-2 text-[12.5px] font-medium text-ink"
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)} en adelante
                </option>
              ))}
              <option value="todo">Todo (no queda nada cerrado)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink">Motivo</span>
            <Textarea
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                setError(null)
              }}
              placeholder="Ej.: falta cargar una nota de crédito de septiembre"
              maxLength={500}
            />
          </label>
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">
              {error}
            </p>
          )}
        </div>
      }
      confirmar="Reabrir"
      tono="danger"
      trabajando={trabajando}
      onCerrar={onCerrar}
      onConfirmar={reabrir}
    />
  )
}

function Historial({ estado }: { estado: EstadoCierre }) {
  return (
    <div className="panel overflow-clip">
      <div className="panel-header">
        <p className="text-[13.5px] font-semibold text-ink">Historial</p>
      </div>
      {estado.historial.length === 0 ? (
        <p className="px-5 py-6 text-[12.5px] text-ink-muted">Todavía no se cerró ningún período.</p>
      ) : (
        <ul className="divide-y divide-line">
          {estado.historial.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-5 py-3">
              <div className="w-[110px]">
                <Badge tone={h.accion === "cierre" ? "warning" : "danger"} size="sm">
                  {h.accion === "cierre" ? "Cierre" : "Reapertura"}
                </Badge>
              </div>
              <p className="num min-w-[200px] text-[13px] font-medium text-ink">
                {h.hasta ? `Cerrado hasta el ${formatearFechaLarga(h.hasta)}` : "Todo abierto"}
              </p>
              <p className="num text-[12px] text-ink-muted">
                {new Date(h.fecha).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "America/Argentina/Buenos_Aires",
                })}{" "}
                · {h.usuario}
              </p>
              {h.motivo && (
                <p className="w-full text-[12px] text-ink-secondary">{h.motivo}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
