"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Loader2, UserPlus, X } from "lucide-react"

import { SelectorCuenta } from "@/components/admin/selector-cuenta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorDeCuit, formatearCuit, normalizarCuit } from "@/lib/admin/cuit"
import {
  FORMAS_CLIENTE,
  FORMAS_PROVEEDOR,
  FORMA_JURIDICA_LABEL,
  ORIGENES,
  ORIGEN_LABEL,
  PROVINCIAS,
  type Cliente,
  type FormaJuridica,
  type Origen,
  type TipoEntidad,
  type Vendedor,
} from "@/lib/admin/entidades"
import { cn } from "@/lib/utils"

/**
 * Alta y edición de la ficha de cliente.
 *
 * Tres cosas gobiernan el diseño de este formulario:
 *
 *  1. **Un solo campo obligatorio.** La razón social. Todo lo demás es opcional
 *     y se marca al revés que de costumbre: en vez de un asterisco en lo
 *     requerido, un "opcional" gris en lo que no lo es. Con quince campos y uno
 *     solo obligatorio, el asterisco solitario no se ve.
 *
 *  2. **El duplicado se avisa mientras se escribe, no al guardar.** Cargar una
 *     ficha entera para que el botón la rechace es la peor forma de enterarse.
 *     El CUIT se verifica contra el servidor apenas está completo y válido.
 *
 *  3. **El origen es lo primero.** Cambia qué campos tienen sentido: a un
 *     cliente del exterior no se le pide CUIT ni forma jurídica ni provincia, y
 *     dejarlos ahí en gris es más honesto que esconderlos —muestra que el
 *     sistema los conoce y decidió que no aplican.
 */

export type BorradorCliente = {
  razonSocial: string
  origen: Origen
  cuit: string
  formaJuridica: FormaJuridica | ""
  contacto: string
  direccion: string
  provincia: string
  telefono: string
  email: string
  vendedor: string
  condicionPagoDias: string
  cuentaContableId: string
  notas: string
}

const VACIO: BorradorCliente = {
  razonSocial: "",
  origen: "nacional",
  cuit: "",
  formaJuridica: "",
  contacto: "",
  direccion: "",
  provincia: "",
  telefono: "",
  email: "",
  vendedor: "",
  condicionPagoDias: "",
  cuentaContableId: "",
  notas: "",
}

function aBorrador(c: Cliente): BorradorCliente {
  return {
    razonSocial: c.razonSocial,
    origen: c.origen,
    cuit: c.cuit ? formatearCuit(c.cuit) : "",
    formaJuridica: c.formaJuridica ?? "",
    contacto: c.contacto ?? "",
    direccion: c.direccion ?? "",
    provincia: c.provincia ?? "",
    telefono: c.telefono ?? "",
    email: c.email ?? "",
    vendedor: c.vendedorNombre ?? "",
    condicionPagoDias: c.condicionPagoDias?.toString() ?? "",
    cuentaContableId: c.cuentaContableId ?? "",
    notas: c.notas ?? "",
  }
}

export function EntidadDialog({
  abierto,
  tipo,
  cliente,
  borrador,
  vendedores,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** Qué ficha es. Cambia el endpoint, las formas jurídicas ofrecidas y si hay
   *  campo de vendedor. Todo lo demás es idéntico. */
  tipo: TipoEntidad
  /** `null` = alta. Con ficha = edición. */
  cliente: Cliente | null
  /** Campos precargados para un alta: lo que leyó la carga inteligente. Se
   *  ignora al editar, donde manda la ficha guardada. */
  borrador?: Partial<BorradorCliente> | null
  vendedores: Vendedor[]
  onCerrar: () => void
  onGuardado: (c: Cliente, esNuevo: boolean) => void
}) {
  const [f, setF] = useState<BorradorCliente>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicado, setDuplicado] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  const editando = cliente !== null
  const esProveedor = tipo === "proveedor"
  const recurso = esProveedor ? "proveedores" : "clientes"
  const rotulo = esProveedor ? "proveedor" : "cliente"

  // Al abrir se resetea desde la prop. Sin esto, abrir "nuevo" después de haber
  // editado a alguien muestra los datos del anterior.
  useEffect(() => {
    if (abierto) {
      setF(cliente ? aBorrador(cliente) : { ...VACIO, ...(borrador ?? {}) })
      setError(null)
      setDuplicado(null)
    }
  }, [abierto, cliente, borrador])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCerrar, guardando])

  const set = <K extends keyof BorradorCliente>(k: K, v: BorradorCliente[K]) =>
    setF((prev) => ({ ...prev, [k]: v }))

  const errorCuit = useMemo(() => errorDeCuit(f.cuit), [f.cuit])
  const cuitCompleto = (normalizarCuit(f.cuit)?.length ?? 0) === 11 && !errorCuit

  /**
   * Verificación de duplicado contra el servidor. Solo corre cuando el CUIT ya
   * es válido: consultar en cada tecleo dispararía once pedidos por CUIT, y diez
   * de ellos son de un número incompleto que nunca va a coincidir con nada.
   */
  useEffect(() => {
    if (!abierto || !cuitCompleto) {
      setDuplicado(null)
      return
    }
    const digitos = normalizarCuit(f.cuit)!
    let vigente = true
    setVerificando(true)

    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: digitos, estado: "todos", porPagina: "5" })
        const res = await fetch(`/api/admin/${recurso}?${params}`)
        const data = await res.json()
        if (!vigente) return
        const otro = (data[recurso] as Cliente[] | undefined)?.find(
          (c) => c.cuit === digitos && c.id !== cliente?.id
        )
        setDuplicado(otro ? otro.razonSocial : null)
      } catch {
        // Silencio a propósito: es una comodidad, y el índice único de la base
        // sigue estando. Un cartel de "no se pudo verificar" al lado de un campo
        // opcional sería ruido sobre algo que igual se va a chequear al guardar.
      } finally {
        if (vigente) setVerificando(false)
      }
    }, 400)

    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [abierto, cuitCompleto, f.cuit, cliente?.id, recurso])

  if (!abierto) return null

  const puedeGuardar = f.razonSocial.trim().length > 0 && !errorCuit && !guardando

  const guardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)

    try {
      const res = await fetch(
        editando ? `/api/admin/${recurso}/${cliente.id}` : `/api/admin/${recurso}`,
        {
          method: editando ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...f, cuit: normalizarCuit(f.cuit) ?? "" }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      onGuardado(data[tipo] as Cliente, !editando)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  const delExterior = f.origen === "exterior"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? `Editar ${rotulo}` : `Nuevo ${rotulo}`}
    >
      <div
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px] animate-in fade-in-0 duration-200"
        onClick={() => !guardando && onCerrar()}
      />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-e4 animate-in slide-in-from-bottom-6 fade-in-0 duration-250 sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl">
        {/* Cabecera */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {editando ? `Editar ${rotulo}` : `Nuevo ${rotulo}`}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Solo la razón social es obligatoria
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

        {/* Cuerpo */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Origen — primero porque cambia qué aplica abajo */}
          <div>
            <Rotulo>Origen</Rotulo>
            <div className="mt-2 flex gap-2">
              {ORIGENES.map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={guardando}
                  onClick={() => set("origen", o)}
                  aria-pressed={f.origen === o}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-60",
                    f.origen === o
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-subtle"
                  )}
                >
                  {ORIGEN_LABEL[o]}
                </button>
              ))}
            </div>
          </div>

          <Campo id="razonSocial" rotulo="Razón social">
            <Input
              id="razonSocial"
              value={f.razonSocial}
              onChange={(e) => set("razonSocial", e.target.value)}
              placeholder="Laboratorios Bernabó SA"
              disabled={guardando}
              autoFocus
            />
          </Campo>

          {/* CUIT — con la verificación de duplicado en vivo */}
          <Campo
            id="cuit"
            rotulo="CUIT"
            opcional
            ayuda={delExterior ? `Un ${rotulo} del exterior no tiene CUIT` : undefined}
          >
            <div className="relative">
              <Input
                id="cuit"
                value={f.cuit}
                onChange={(e) => set("cuit", e.target.value)}
                onBlur={() => f.cuit && set("cuit", formatearCuit(f.cuit) || f.cuit)}
                placeholder="30-50054729-0"
                inputMode="numeric"
                className={cn(
                  "num pr-9",
                  errorCuit && "border-danger-line focus-visible:border-danger",
                  duplicado && "border-warning-line"
                )}
                disabled={guardando}
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                {verificando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />
                ) : cuitCompleto && !duplicado ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : null}
              </div>
            </div>

            {errorCuit && <Aviso tono="danger">{errorCuit}</Aviso>}

            {duplicado && !errorCuit && (
              <Aviso tono="warning">
                Ya existe {esProveedor ? "un proveedor" : "un cliente"} con este CUIT: <strong>{duplicado}</strong>. Si es la
                misma empresa, editá esa ficha en vez de crear una nueva.
              </Aviso>
            )}
          </Campo>

          <div className="grid gap-5 sm:grid-cols-2">
            <Campo id="formaJuridica" rotulo="Condición frente al IVA" opcional>
              <Select
                id="formaJuridica"
                value={f.formaJuridica}
                onChange={(v) => set("formaJuridica", v as FormaJuridica | "")}
                disabled={guardando}
                opciones={[
                  { valor: "", etiqueta: "Sin especificar" },
                  ...(esProveedor ? FORMAS_PROVEEDOR : FORMAS_CLIENTE).map((v) => ({
                    valor: v,
                    etiqueta: FORMA_JURIDICA_LABEL[v],
                  })),
                ]}
              />
            </Campo>

            <Campo
              id="condicionPagoDias"
              rotulo="Condición de pago"
              opcional
              ayuda="Días de plazo. Se usa para estimar la fecha de cobro."
            >
              <div className="relative">
                <Input
                  id="condicionPagoDias"
                  value={f.condicionPagoDias}
                  onChange={(e) =>
                    set("condicionPagoDias", e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="30"
                  inputMode="numeric"
                  className="num pr-12"
                  disabled={guardando}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-faint">
                  días
                </span>
              </div>
            </Campo>
          </div>

          {/* La imputación habitual de esta ficha. Se guarda una vez acá y el
              formulario de comprobantes la completa solo: es lo que hace que las
              224 cuentas del plan no se sientan al cargar factura por factura. */}
          <Campo
            id="cuentaContableId"
            rotulo="Cuenta contable habitual"
            opcional
            ayuda={
              esProveedor
                ? "Contra qué cuenta se imputan sus facturas. Se propone al cargar una compra."
                : "Contra qué cuenta se imputan sus ventas. Se propone al cargar una factura."
            }
          >
            <SelectorCuenta
              id="cuentaContableId"
              valor={f.cuentaContableId}
              onElegir={(v) => set("cuentaContableId", v)}
              disabled={guardando}
              tipoSugerido={esProveedor ? "egreso" : "ingreso"}
            />
          </Campo>

          <div className="grid gap-5 sm:grid-cols-2">
            <Campo id="contacto" rotulo="Contacto" opcional>
              <Input
                id="contacto"
                value={f.contacto}
                onChange={(e) => set("contacto", e.target.value)}
                placeholder="Nombre de la persona"
                disabled={guardando}
              />
            </Campo>

            <Campo id="telefono" rotulo="Teléfono" opcional>
              <Input
                id="telefono"
                value={f.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="11 4444-5555"
                disabled={guardando}
              />
            </Campo>
          </div>

          <Campo id="email" rotulo="Email" opcional>
            <Input
              id="email"
              type="email"
              value={f.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="administracion@empresa.com"
              disabled={guardando}
            />
          </Campo>

          <div className="grid gap-5 sm:grid-cols-2">
            <Campo id="direccion" rotulo="Dirección" opcional>
              <Input
                id="direccion"
                value={f.direccion}
                onChange={(e) => set("direccion", e.target.value)}
                placeholder="Av. Corrientes 1234, Piso 5"
                disabled={guardando}
              />
            </Campo>

            <Campo id="provincia" rotulo="Provincia" opcional>
              <Select
                id="provincia"
                value={f.provincia}
                onChange={(v) => set("provincia", v)}
                disabled={guardando || delExterior}
                opciones={[
                  { valor: "", etiqueta: delExterior ? "No aplica" : "Sin especificar" },
                  ...PROVINCIAS.map((p) => ({ valor: p, etiqueta: p })),
                ]}
              />
            </Campo>
          </div>

          {/* Vendedor: texto con autocompletado. Si el nombre no existe, el
              servidor lo crea — no hace falta darlo de alta en otra pantalla.
              Solo en clientes: un proveedor no tiene vendedor asignado. */}
          {!esProveedor && (
          <Campo
            id="vendedor"
            rotulo="Vendedor / AM"
            opcional
            ayuda="Si el nombre es nuevo, se agrega solo a la lista"
          >
            <Input
              id="vendedor"
              value={f.vendedor}
              onChange={(e) => set("vendedor", e.target.value)}
              placeholder="Nombre del vendedor"
              list="lista-vendedores"
              disabled={guardando}
            />
            <datalist id="lista-vendedores">
              {vendedores.map((v) => (
                <option key={v.id} value={v.nombre} />
              ))}
            </datalist>
          </Campo>
          )}

          <Campo id="notas" rotulo="Notas" opcional>
            <Textarea
              id="notas"
              value={f.notas}
              onChange={(e) => set("notas", e.target.value.slice(0, 2000))}
              placeholder="Cualquier cosa que convenga recordar de este cliente…"
              className="min-h-[72px]"
              disabled={guardando}
            />
          </Campo>
        </div>

        {/* Pie */}
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
            <Button onClick={guardar} disabled={!puedeGuardar}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editando ? "Guardar cambios" : `Crear ${rotulo}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Piezas del formulario ────────────────────────────────────────────────── */

function Rotulo({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-ink">
      {children}
    </label>
  )
}

/**
 * Un campo. `opcional` marca lo que no hace falta en vez de marcar lo requerido:
 * con un solo campo obligatorio de quince, el asterisco solitario pasa
 * desapercibido y el resultado es gente completando todo por las dudas.
 */
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
        <Rotulo htmlFor={id}>{rotulo}</Rotulo>
        {opcional && <span className="text-[10.5px] text-ink-faint">opcional</span>}
      </div>
      {ayuda && <p className="mt-0.5 text-[11.5px] text-ink-muted">{ayuda}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/** Select nativo con la métrica del Input: no hay primitiva de select en el
 *  sistema de diseño y una lista de 24 provincias no justifica traer una. */
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

function Aviso({
  tono,
  children,
}: {
  tono: "danger" | "warning"
  children: React.ReactNode
}) {
  return (
    <p
      className={cn(
        "mt-1.5 text-[11.5px] leading-relaxed",
        tono === "danger" ? "text-danger-text" : "text-warning-text"
      )}
    >
      {children}
    </p>
  )
}
