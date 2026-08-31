"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Landmark, Loader2, X } from "lucide-react"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { CuentaFinancieraDetalle } from "@/lib/admin/cobros"
import { parsearImporte, type Moneda } from "@/lib/admin/moneda"
import { cn } from "@/lib/utils"

/**
 * La ficha de una caja, un banco o una billetera.
 *
 * Hasta acá las cuentas se creaban y se corregían por SQL. Eso dejaba trabadas
 * tres cosas que no son de configuración sino de todos los días:
 *
 *  · **El saldo inicial**, que es el renglón "SALDO ANTERIOR" del extracto. Si
 *    está mal, están mal todos los saldos de la cuenta, y no hay ningún
 *    movimiento que corregir para arreglarlo — el error no está en ninguno.
 *  · **La cuenta contable**, sin la cual los movimientos de esta cuenta no
 *    llegan al libro diario y quedan para siempre en la lista de pendientes.
 *  · **El CBU, el alias y el número**, que es contra lo que se compara el
 *    resumen del banco.
 *
 * La moneda es lo único que se congela: los importes ya cargados están en la
 * moneda de su cuenta, así que cambiarla dejaría un banco en dólares lleno de
 * importes que son pesos.
 */

const TIPOS = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "caja", etiqueta: "Caja" },
  { valor: "billetera", etiqueta: "Billetera" },
] as const

type Estado = {
  nombre: string
  tipo: string
  moneda: Moneda
  banco: string
  numeroCuenta: string
  cbu: string
  alias: string
  cuentaContableId: string
  saldoInicial: string
  fechaSaldoInicial: string
  activo: boolean
  orden: string
}

const VACIA: Estado = {
  nombre: "",
  tipo: "banco",
  moneda: "ARS",
  banco: "",
  numeroCuenta: "",
  cbu: "",
  alias: "",
  cuentaContableId: "",
  saldoInicial: "",
  fechaSaldoInicial: "",
  activo: true,
  orden: "",
}

function deCuenta(c: CuentaFinancieraDetalle): Estado {
  return {
    nombre: c.nombre,
    tipo: c.tipo,
    moneda: c.moneda,
    banco: c.banco ?? "",
    numeroCuenta: c.numeroCuenta ?? "",
    cbu: c.cbu ?? "",
    alias: c.alias ?? "",
    cuentaContableId: c.cuentaContableId ?? "",
    saldoInicial: String(c.saldoInicial ?? 0),
    fechaSaldoInicial: c.fechaSaldoInicial ?? "",
    activo: c.activo,
    orden: String(c.orden ?? 0),
  }
}

export function CuentaDialog({
  abierto,
  cuenta,
  onCerrar,
  onGuardada,
}: {
  abierto: boolean
  /** La cuenta que se edita, o `null` para dar de alta una nueva. */
  cuenta: CuentaFinancieraDetalle | null
  onCerrar: () => void
  onGuardada: () => void
}) {
  const [f, setF] = useState<Estado>(VACIA)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setF(cuenta ? deCuenta(cuenta) : VACIA)
    setError(null)
  }, [abierto, cuenta])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  if (!abierto) return null

  const editando = cuenta !== null
  const monedaCongelada = Boolean(cuenta?.tieneMovimientos)
  const conDatosBancarios = f.tipo !== "caja"
  const saldoCambio = editando && parsearImporte(f.saldoInicial) !== cuenta?.saldoInicial

  const set = <K extends keyof Estado>(clave: K, valor: Estado[K]) =>
    setF((prev) => ({ ...prev, [clave]: valor }))

  const guardar = async () => {
    if (!f.nombre.trim() || guardando) return
    setGuardando(true)
    setError(null)

    try {
      const cuerpo = {
        nombre: f.nombre,
        tipo: f.tipo,
        moneda: f.moneda,
        banco: conDatosBancarios ? f.banco : null,
        numeroCuenta: conDatosBancarios ? f.numeroCuenta : null,
        cbu: conDatosBancarios ? f.cbu : null,
        alias: conDatosBancarios ? f.alias : null,
        cuentaContableId: f.cuentaContableId || null,
        saldoInicial: parsearImporte(f.saldoInicial) ?? 0,
        fechaSaldoInicial: f.fechaSaldoInicial || null,
        activo: f.activo,
        orden: Number(f.orden) || 0,
      }

      const res = await fetch(
        editando ? `/api/admin/cuentas/${cuenta.id}` : "/api/admin/cuentas",
        {
          method: editando ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cuerpo),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      onGuardada()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar la cuenta" : "Nueva cuenta"}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Landmark className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {editando ? "Editar la cuenta" : "Nueva cuenta"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {editando
                  ? "Los datos con los que se concilia contra el resumen del banco"
                  : "Una caja, un banco o una billetera donde registrar movimientos"}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="nombre" rotulo="Nombre">
              <Input
                id="nombre"
                value={f.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Galicia cuenta corriente"
                disabled={guardando}
              />
            </Campo>

            <Campo id="tipo" rotulo="Tipo">
              <Select
                id="tipo"
                value={f.tipo}
                onChange={(v) => set("tipo", v)}
                disabled={guardando}
                opciones={TIPOS.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))}
              />
            </Campo>
          </div>

          <Campo
            id="moneda"
            rotulo="Moneda"
            ayuda={
              monedaCongelada
                ? "No se puede cambiar: la cuenta ya tiene movimientos cargados en esta moneda"
                : "Una cuenta en dólares se da de alta aparte, como en el banco"
            }
          >
            <div className="flex gap-2">
              {(["ARS", "USD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("moneda", m)}
                  aria-pressed={f.moneda === m}
                  disabled={guardando || monedaCongelada}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-60",
                    f.moneda === m
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                  )}
                >
                  {m === "ARS" ? "Pesos" : "Dólares"}
                </button>
              ))}
            </div>
          </Campo>

          {conDatosBancarios && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="banco" rotulo="Banco" opcional>
                <Input
                  id="banco"
                  value={f.banco}
                  onChange={(e) => set("banco", e.target.value)}
                  placeholder="Galicia"
                  disabled={guardando}
                />
              </Campo>
              <Campo id="numero" rotulo="Número de cuenta" opcional>
                <Input
                  id="numero"
                  value={f.numeroCuenta}
                  onChange={(e) => set("numeroCuenta", e.target.value)}
                  className="num"
                  disabled={guardando}
                />
              </Campo>
              <Campo id="cbu" rotulo="CBU" opcional>
                <Input
                  id="cbu"
                  value={f.cbu}
                  onChange={(e) => set("cbu", e.target.value)}
                  className="num"
                  inputMode="numeric"
                  disabled={guardando}
                />
              </Campo>
              <Campo id="alias" rotulo="Alias" opcional>
                <Input
                  id="alias"
                  value={f.alias}
                  onChange={(e) => set("alias", e.target.value)}
                  disabled={guardando}
                />
              </Campo>
            </div>
          )}

          {/* Sin esto, ningún movimiento de la cuenta genera asiento. Es la
              causa más común de que la lista de documentos sin asiento no se
              vacíe nunca, y hasta ahora no había dónde arreglarlo. */}
          <Campo
            id="contable"
            rotulo="Cuenta contable"
            opcional
            ayuda="Contra qué cuenta del plan se asientan sus movimientos. Sin esto no llegan al libro diario."
          >
            <SelectorCuenta
              id="contable"
              valor={f.cuentaContableId}
              onElegir={(v) => set("cuentaContableId", v)}
              disabled={guardando}
              tipoSugerido="activo"
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="saldoInicial"
              rotulo="Saldo inicial"
              ayuda="Lo que había el día que arrancó el sistema"
            >
              <Input
                id="saldoInicial"
                value={f.saldoInicial}
                onChange={(e) => set("saldoInicial", e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="num text-right"
                disabled={guardando}
              />
            </Campo>

            <Campo id="fechaSaldo" rotulo="Fecha del saldo inicial" opcional>
              <Input
                id="fechaSaldo"
                type="date"
                value={f.fechaSaldoInicial}
                onChange={(e) => set("fechaSaldoInicial", e.target.value)}
                className="num"
                disabled={guardando}
              />
            </Campo>
          </div>

          {/* El saldo inicial es el punto de partida de todo lo demás: no es un
              dato de la ficha sino el primer renglón del extracto. Cambiarlo con
              movimientos cargados corre la columna entera. */}
          {saldoCambio && monedaCongelada && (
            <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[12px] text-warning-text">
              Estás cambiando el saldo inicial de una cuenta que ya tiene movimientos: todos los
              saldos del extracto se corren por la diferencia. Es lo correcto si el saldo de
              arranque estaba mal cargado, y un desastre si lo que querías era registrar plata
              que entró — eso es un movimiento.
            </p>
          )}

          {editando && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-subtle px-3 py-2.5">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Cuenta activa</p>
                <p className="text-[11.5px] text-ink-muted">
                  Una cuenta inactiva no aparece en los selectores ni en el tablero, pero
                  conserva todos sus movimientos
                </p>
              </div>
              <Switch
                checked={f.activo}
                onCheckedChange={(v) => set("activo", v)}
                disabled={guardando}
                aria-label="Cuenta activa"
              />
            </div>
          )}

          <Campo
            id="orden"
            rotulo="Orden en la lista"
            opcional
            ayuda="El menor va primero. Sirve para que la caja no quede en el medio de los bancos."
          >
            <Input
              id="orden"
              value={f.orden}
              onChange={(e) => set("orden", e.target.value)}
              inputMode="numeric"
              className="num w-24 text-right"
              disabled={guardando}
            />
          </Campo>
        </div>

        <div className="shrink-0 border-t border-line bg-surface-subtle px-5 py-4 sm:px-6">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-danger-text" />
              <p className="text-[12px] text-danger-text">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!f.nombre.trim() || guardando}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editando ? "Guardar cambios" : "Crear la cuenta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

function Campo({
  id,
  rotulo,
  opcional,
  ayuda,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink">
          {rotulo}
        </label>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </div>
      {ayuda && <p className="mt-0.5 text-[11.5px] text-ink-muted">{ayuda}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Select({
  id,
  value,
  onChange,
  opciones,
  disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  opciones: { valor: string; etiqueta: string }[]
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full appearance-none rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink",
        "shadow-[inset_0_1px_2px_0_oklch(0.215_0.032_257/0.04)] transition-[border-color,box-shadow] duration-150",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        "hover:border-n-400",
        "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_oklch(0.578_0.170_258/0.14)]",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60"
      )}
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  )
}
