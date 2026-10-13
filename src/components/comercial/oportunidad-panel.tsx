"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  Check,
  FileText,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  PhoneCall,
  Plus,
  Send,
  Target,
  UserRound,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { DetalleDialog, Bloque, Dato, ListaDatos } from "@/components/admin/detalle-dialog"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  ESTADOS_CRM,
  ESTADO_CRM_ESTILO,
  ESTADO_CRM_LABEL,
  MOTIVOS_PERDIDA,
  PROBABILIDAD_SUGERIDA,
  diasHasta,
  type Actividad,
  type CambiosOportunidad,
  type Oportunidad,
  type TipoActividad,
} from "@/lib/comercial/crm"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * El detalle de una oportunidad: quién es el contacto, en qué está y qué pasó.
 *
 * Seguimiento se guarda solo, campo por campo, al salir de cada uno: el CRM se
 * actualiza entre llamadas, y un botón "Guardar" que alguien se olvida de tocar
 * es una próxima acción que no quedó anotada. Si el CRM es de otra persona, se
 * ve todo y no se edita nada.
 */

type Pestana = "info" | "seguimiento" | "historial"

export function OportunidadPanel({
  oportunidad,
  puedeEditar,
  productos,
  onCerrar,
  onGuardar,
  onContacto,
  onPresupuesto,
  onEscribir,
  onEmpresa,
}: {
  oportunidad: Oportunidad | null
  puedeEditar: boolean
  productos: string[]
  onCerrar: () => void
  onGuardar: (id: string, cambios: CambiosOportunidad) => Promise<Oportunidad | null>
  /** Una llamada, reunión o mail anotados: el server ya movió el "último
   *  contacto" y la fila lo refleja sin volver a pedir el CRM. */
  onContacto: (id: string) => void
  onPresupuesto: (o: Oportunidad) => void
  onEscribir: (o: Oportunidad) => void
  onEmpresa: (o: Oportunidad) => void
}) {
  const [pestana, setPestana] = useState<Pestana>("seguimiento")
  const { montado, saliendo } = usePresencia(oportunidad !== null)
  // La última que se mostró, para que el panel salga con su contenido.
  const [mostrada, setMostrada] = useState(oportunidad)
  if (oportunidad && oportunidad !== mostrada) setMostrada(oportunidad)

  if (!montado || !mostrada) return null

  const o = mostrada
  const c = o.contacto
  const persona = [c.nombre, c.apellido].filter(Boolean).join(" ")
  const estilo = ESTADO_CRM_ESTILO[o.estado]

  return (
    <DetalleDialog
      abierto
      saliendo={saliendo}
      onCerrar={onCerrar}
      titulo={persona || c.email || "Sin nombre"}
      subtitulo={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {[c.cargo, c.empresa].filter(Boolean).join(" · ")}
          <span className="text-ink-faint">·</span>
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className={cn("h-1.5 w-1.5 rounded-full", estilo.punto)} />
            {ESTADO_CRM_LABEL[o.estado]}
          </span>
        </span>
      }
    >
      {!puedeEditar && (
        <p className="-mt-1 flex items-center gap-1.5 text-[12px] text-ink-muted">
          <Lock className="h-3 w-3 shrink-0" />
          Es del CRM de {o.ownerNombre.split(" ")[0]}: lo ves, pero lo edita solo {o.ownerNombre.split(" ")[0]}.
        </p>
      )}

      {/* Pestañas: subrayado y no píldoras, para que se lean como secciones
          del mismo documento y no como botones. */}
      <div className="-mx-5 -mt-2 flex border-b border-line px-5">
        {(
          [
            ["info", "Información"],
            ["seguimiento", "Seguimiento"],
            ["historial", "Historial"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={cn(
              "relative px-3 py-2.5 text-[12.5px] font-medium transition-colors",
              pestana === id ? "text-brand-700" : "text-ink-muted hover:text-ink"
            )}
          >
            {rotulo}
            {pestana === id && (
              <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-brand-600" />
            )}
          </button>
        ))}
      </div>

      {/* Cambiar de pestaña funde el contenido en vez de reemplazarlo de golpe. */}
      <div key={pestana} className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
      {pestana === "info" && (
        <>
          <Bloque
            titulo="Información del contacto"
            accion={
              <Link
                href={`/marketing/contactos?q=${encodeURIComponent(c.email ?? c.empresa)}`}
                className="text-[11.5px] font-medium text-brand-700 hover:underline"
              >
                Ver en Contactos
              </Link>
            }
          >
            <ListaDatos>
              <Dato rotulo="AM" mostrarVacio>
                {c.amNombre ? (
                  <span className="flex items-center gap-2">
                    <Avatar id={c.amId} nombre={c.amNombre} size="xs" />
                    {c.amNombre}
                  </span>
                ) : undefined}
              </Dato>
              <Dato rotulo="Nombre" valor={persona} className="font-medium text-ink" />
              <Dato rotulo="Empresa" valor={c.empresa} />
              <Dato rotulo="Cargo" valor={c.cargo} />
              <Dato rotulo="Departamento" valor={c.departamento} />
              <Dato rotulo="Vertical" valor={c.vertical} />
              {c.email && (
                <Dato rotulo="Email">
                  <a href={`mailto:${c.email}`} className="text-brand-700 hover:underline">
                    {c.email}
                  </a>
                </Dato>
              )}
              {c.telefono && (
                <Dato rotulo="Teléfono">
                  <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} className="num hover:text-ink">
                    {c.telefono}
                  </a>
                </Dato>
              )}
            </ListaDatos>
          </Bloque>
          {c.observaciones && (
            <Bloque titulo="Observaciones">
              <p className="whitespace-pre-line rounded-xl border border-line bg-surface-subtle px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
                {c.observaciones}
              </p>
            </Bloque>
          )}
          <div className="flex flex-wrap gap-2">
            {(c.email || c.telefono) && (
              <Button variant="outline" size="sm" onClick={() => onEscribir(o)}>
                <MessageSquare />
                Escribir con plantilla
              </Button>
            )}
            {c.telefono && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}>
                  <Phone />
                  Llamar
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onEmpresa(o)}>
              <Building2 />
              Ver {c.empresa}
            </Button>
          </div>
        </>
      )}

      {pestana === "seguimiento" && (
        <Seguimiento
          key={o.id}
          o={o}
          editable={puedeEditar}
          productos={productos}
          onGuardar={(cambios) => onGuardar(o.id, cambios)}
          onPresupuesto={() => onPresupuesto(o)}
        />
      )}

      {pestana === "historial" && <Historial id={o.id} editable={puedeEditar} onContacto={() => onContacto(o.id)} />}
      </div>
    </DetalleDialog>
  )
}

/* ── Seguimiento ──────────────────────────────────────────────────────────── */

function Seguimiento({
  o,
  editable,
  productos,
  onGuardar,
  onPresupuesto,
}: {
  o: Oportunidad
  editable: boolean
  productos: string[]
  onGuardar: (cambios: CambiosOportunidad) => Promise<Oportunidad | null>
  onPresupuesto: () => void
}) {
  // Borrador local de los campos de texto: se manda al salir del campo, no en
  // cada tecla.
  const [b, setB] = useState({
    producto: o.producto ?? "",
    proximaAccion: o.proximaAccion ?? "",
    fechaProxima: o.fechaProxima ?? "",
    ultimoContacto: o.ultimoContacto ?? "",
    probabilidad: String(o.probabilidad),
    notas: o.notas ?? "",
  })
  const [guardado, setGuardado] = useState<string | null>(null)

  // El cambio ya se ve (es optimista): el tilde solo confirma que llegó.
  async function guardar(campo: string, cambios: CambiosOportunidad) {
    const r = await onGuardar(cambios)
    if (r) {
      setGuardado(campo)
      setTimeout(() => setGuardado((g) => (g === campo ? null : g)), 1400)
    }
  }

  const alSalir = (campo: keyof typeof b, valor: CambiosOportunidad) => {
    const original = {
      producto: o.producto ?? "",
      proximaAccion: o.proximaAccion ?? "",
      fechaProxima: o.fechaProxima ?? "",
      ultimoContacto: o.ultimoContacto ?? "",
      probabilidad: String(o.probabilidad),
        notas: o.notas ?? "",
    }[campo]
    if (b[campo] === original) return
    void guardar(campo, valor)
  }

  const indicador = (campo: string) =>
    guardado === campo ? (
      <Check className="h-3 w-3 text-success-text animate-in fade-in-0 zoom-in-50" />
    ) : null

  const dias = diasHasta(o.fechaProxima)

  return (
    <fieldset disabled={!editable} className="space-y-6 disabled:opacity-90">
      {/* Las etapas en una fila: un click mueve la oportunidad y de paso se ve
          en qué punto del recorrido está. */}
      <Bloque titulo="Etapa" accion={indicador("estado")}>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-line sm:grid-cols-6">
          {ESTADOS_CRM.map((e, i) => {
            const activo = o.estado === e
            return (
              <button
                key={e}
                type="button"
                onClick={() => {
                  if (activo) return
                  const prob = PROBABILIDAD_SUGERIDA[e]
                  setB((x) => ({ ...x, probabilidad: String(prob) }))
                  void guardar("estado", { estado: e, probabilidad: prob })
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 border-line px-2 py-2 text-center text-[12px] leading-tight transition-colors disabled:cursor-default",
                  i > 0 && "sm:border-l",
                  i % 3 !== 0 && "border-l",
                  i >= 3 && "border-t sm:border-t-0",
                  activo ? "bg-surface-muted font-medium text-ink" : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                )}
              >
                {activo && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ESTADO_CRM_ESTILO[e].punto)} />}
                {ESTADO_CRM_LABEL[e]}
              </button>
            )
          })}
        </div>
      </Bloque>

      {o.estado === "perdida" && (
        <Bloque titulo="Motivo de pérdida" accion={indicador("motivo")}>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_PERDIDA.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void guardar("motivo", { motivoPerdida: o.motivoPerdida === m ? null : m })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  o.motivoPerdida === m
                    ? "border-ink bg-ink text-n-25"
                    : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </Bloque>
      )}

      {(o.presupuesto || editable) && (
        <Bloque titulo="Presupuesto">
          {o.presupuesto ? (
            <Link
              href={`/comercial/presupuestos/${o.presupuesto.id}`}
              className="group flex items-center gap-3 rounded-lg border border-line px-3.5 py-2.5 transition-colors hover:bg-surface-subtle"
            >
              <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="num text-[12.5px] text-ink-muted">#{o.presupuesto.numero}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{o.presupuesto.referencia}</span>
              <span className="text-[12px] capitalize text-ink-muted">{o.presupuesto.estado}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-ink-faint group-hover:text-ink" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onPresupuesto}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3.5 py-2.5 text-left text-[13px] text-ink-secondary transition-colors hover:border-ink hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5" />
              Crear presupuesto para {o.contacto.empresa}
            </button>
          )}
        </Bloque>
      )}

      <Bloque titulo="Próximo paso">
        <div className="space-y-3">
          <Campo rotulo="Próxima acción" estado={indicador("proximaAccion")}>
            <Input
              value={b.proximaAccion}
              onChange={(e) => setB((x) => ({ ...x, proximaAccion: e.target.value }))}
              onBlur={() => alSalir("proximaAccion", { proximaAccion: b.proximaAccion })}
              placeholder="Enviar propuesta comercial"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              rotulo="Fecha"
              estado={
                indicador("fechaProxima") ??
                (dias !== null && o.estado !== "ganada" && o.estado !== "perdida" ? (
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold",
                      dias < 0 ? "text-danger-text" : dias <= 2 ? "text-warning-text" : "text-ink-faint"
                    )}
                  >
                    {dias < 0 ? `Vencida hace ${-dias}d` : dias === 0 ? "Hoy" : `En ${dias}d`}
                  </span>
                ) : null)
              }
            >
              <Input
                type="date"
                value={b.fechaProxima}
                onChange={(e) => {
                  setB((x) => ({ ...x, fechaProxima: e.target.value }))
                  void guardar("fechaProxima", { fechaProxima: e.target.value || null })
                }}
              />
            </Campo>
            <Campo rotulo="Último contacto" estado={indicador("ultimoContacto")}>
              <Input
                type="date"
                value={b.ultimoContacto}
                onChange={(e) => {
                  setB((x) => ({ ...x, ultimoContacto: e.target.value }))
                  void guardar("ultimoContacto", { ultimoContacto: e.target.value || null })
                }}
              />
            </Campo>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="La oportunidad">
        <div className="space-y-3">
          <Campo rotulo="Producto o servicio de interés" estado={indicador("producto")}>
            <Input
              value={b.producto}
              onChange={(e) => setB((x) => ({ ...x, producto: e.target.value }))}
              onBlur={() => alSalir("producto", { producto: b.producto })}
              list="crm-productos"
              placeholder="Firma biométrica"
            />
            <datalist id="crm-productos">
              {productos.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Campo>


          <Campo rotulo="Notas internas" estado={indicador("notas")}>
            <Textarea
              rows={3}
              value={b.notas}
              onChange={(e) => setB((x) => ({ ...x, notas: e.target.value }))}
              onBlur={() => alSalir("notas", { notas: b.notas })}
              placeholder="Quién decide, qué presupuesto maneja, contra quién competimos…"
            />
          </Campo>
        </div>
      </Bloque>
    </fieldset>
  )
}

function Campo({
  rotulo,
  icono: Icono,
  estado,
  children,
}: {
  rotulo: string
  icono?: typeof Target
  estado?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary">
          {Icono && <Icono className="h-3 w-3 text-ink-faint" />}
          {rotulo}
        </span>
        {estado}
      </span>
      {children}
    </label>
  )
}

/* ── Historial ────────────────────────────────────────────────────────────── */

const TIPOS: { id: TipoActividad; rotulo: string; icono: typeof MessageSquare }[] = [
  { id: "nota", rotulo: "Nota", icono: MessageSquare },
  { id: "llamada", rotulo: "Llamada", icono: PhoneCall },
  { id: "reunion", rotulo: "Reunión", icono: Users },
  { id: "email", rotulo: "Email", icono: Mail },
]

const ICONO_ACTIVIDAD: Record<TipoActividad, typeof MessageSquare> = {
  nota: MessageSquare,
  llamada: PhoneCall,
  reunion: Users,
  email: Mail,
  cambio_estado: ArrowRightLeft,
  alta: Plus,
}

function Historial({
  id,
  editable,
  onContacto,
}: {
  id: string
  editable: boolean
  onContacto: () => void
}) {
  const qc = useQueryClient()
  const url = `/api/comercial/crm/${id}/actividades`
  const q = useQuery({
    queryKey: claveDe("comercial", url),
    queryFn: ({ signal }) => pedirJson<{ actividades: Actividad[] }>(url, { signal }),
  })
  const [tipo, setTipo] = useState<TipoActividad>("nota")
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function agregar() {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await pedirJson(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, texto }),
      })
      setTexto("")
      // Solo el historial se vuelve a pedir; la fila se toca en el lugar.
      await qc.invalidateQueries({ queryKey: claveDe("comercial", url) })
      if (tipo !== "nota") onContacto()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo anotar"))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5">
      {editable && (
        <div className="rounded-lg border border-line bg-surface transition-colors focus-within:border-brand-300">
          <div className="flex gap-1 border-b border-line-soft px-2 pt-2">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  tipo === t.id ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:text-ink"
                )}
              >
                <t.icono className="h-3 w-3" />
                {t.rotulo}
              </button>
            ))}
          </div>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void agregar()
            }}
            rows={2}
            placeholder={
              tipo === "nota" ? "Anotá algo sobre esta oportunidad…" : "¿Qué se habló? ¿Quedó algo pendiente?"
            }
            className="resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="text-[11px] text-ink-faint">⌘ + Enter para anotar</span>
            <Button size="xs" onClick={agregar} disabled={enviando || !texto.trim()}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              Anotar
            </Button>
          </div>
        </div>
      )}

      {q.isPending ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
        </div>
      ) : (q.data?.actividades ?? []).length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-ink-faint">Todavía no hay nada anotado.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line">
          {(q.data?.actividades ?? []).map((a) => {
            const Icono = ICONO_ACTIVIDAD[a.tipo] ?? MessageSquare
            const sistema = a.tipo === "cambio_estado" || a.tipo === "alta"
            return (
              <li key={a.id} className="relative flex gap-3">
                <span
                  className={cn(
                    "relative z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border",
                    sistema
                      ? "border-line bg-surface-muted text-ink-muted"
                      : "border-brand-200 bg-brand-50 text-brand-600"
                  )}
                >
                  <Icono className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={cn("text-[12.5px] leading-relaxed", sistema ? "text-ink-muted" : "text-ink")}>
                    {a.texto}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                    {a.autorNombre && (
                      <>
                        <UserRound className="h-2.5 w-2.5" />
                        {a.autorNombre}
                        <span>·</span>
                      </>
                    )}
                    {new Date(a.createdAt).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

