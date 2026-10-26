"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { DetalleDialog, Bloque } from "@/components/admin/detalle-dialog"
import { CIERRE_INICIAL, CampoProyecto, EtapaYCierre, type Cierre } from "@/components/comercial/proyecto-dialog"
import { BotonOrganigrama } from "@/components/contactos/empresa-panel"
import { OrganigramaEmpresa, urlFichaEmpresa } from "@/components/contactos/organigrama-empresa"
import { ChatDeContacto } from "@/components/whatsapp/chat-de-contacto"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { claveDe, pedirJson } from "@/lib/admin/query"
import { ESTADO_CRM_LABEL, esEstadoCrm } from "@/lib/comercial/crm"
import type { FichaEmpresa, Similar } from "@/lib/contactos-compartido"
import {
  BORRADOR_VACIO,
  type BorradorContacto,
  type Contacto,
  type OpcionesContactos,
} from "@/lib/marketing/contactos"
import type { Usuario } from "@/lib/tickets"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Alta y edición de un contacto, en el panel lateral.
 *
 * Empresa, vertical y departamento sugieren lo que ya está cargado (un
 * `datalist`): "Banco Provincia" y "Bco. Provincia" son la misma cuenta, y la
 * única forma de que no se escriban de dos maneras es ofrecer la que ya existe.
 */
export function ContactoPanel({
  abierto,
  contacto,
  equipo,
  yoId,
  opciones,
  onCerrar,
  onGuardado,
  onBorrar,
  onNuevoProyecto,
  alta,
}: {
  abierto: boolean
  /** `null` es un contacto nuevo. */
  contacto: Contacto | null
  equipo: Usuario[]
  yoId: string | null
  opciones: OpcionesContactos
  onCerrar: () => void
  onGuardado: (c: Contacto, respuesta: Record<string, unknown>) => void
  onBorrar?: (c: Contacto) => void
  /** "+ Proyecto" en la ficha: le abre un proyecto en el CRM propio. */
  onNuevoProyecto?: (c: Contacto) => void
  /** Para dar de alta por otra puerta: el CRM crea y suma al seguimiento en
   *  un paso. `cuerpo` se agrega a lo que manda el formulario. */
  alta?: {
    url: string
    cuerpo?: Record<string, unknown>
    boton: string
    subtitulo: string
    /** Lo que ya se sabe del nuevo, por ejemplo la empresa. */
    inicial?: Partial<BorradorContacto>
    /** Si está, el alta trae su primer proyecto (opcional) con etapa y %. */
    proyecto?: { inicial?: string; sugerencias: string[] }
  }
}) {
  const { montado, saliendo } = usePresencia(abierto)
  // Mientras se va, sigue mostrando el contacto que tenía: quien lo cierra
  // suele limpiar `contacto` en el mismo click, y sin esto el panel saldría
  // convertido en "Nuevo contacto".
  const [mostrado, setMostrado] = useState(contacto)
  if (abierto && contacto !== mostrado) setMostrado(contacto)

  if (!montado) return null
  return (
    <Formulario
      // Una key por contacto: abrir otro arranca el formulario de cero.
      key={mostrado?.id ?? "nuevo"}
      saliendo={saliendo}
      contacto={mostrado}
      equipo={equipo}
      yoId={yoId}
      opciones={opciones}
      onCerrar={onCerrar}
      onGuardado={onGuardado}
      onBorrar={onBorrar}
      onNuevoProyecto={onNuevoProyecto}
      alta={alta}
    />
  )
}

function Formulario({
  contacto,
  equipo,
  yoId,
  opciones,
  onCerrar,
  onGuardado,
  onBorrar,
  onNuevoProyecto,
  alta,
  saliendo,
}: Omit<Parameters<typeof ContactoPanel>[0], "abierto"> & { saliendo: boolean }) {
  const [b, setB] = useState<BorradorContacto>(() =>
    contacto
      ? {
          empresa: contacto.empresa,
          nombre: contacto.nombre ?? "",
          apellido: contacto.apellido ?? "",
          cargo: contacto.cargo ?? "",
          departamento: contacto.departamento ?? "",
          vertical: contacto.vertical ?? "",
          email: contacto.email ?? "",
          telefono: contacto.telefono ?? "",
          observaciones: contacto.observaciones ?? "",
          amId: contacto.amId,
        }
      : { ...BORRADOR_VACIO, amId: yoId, ...alta?.inicial }
  )
  const [proyecto, setProyecto] = useState(alta?.proyecto?.inicial ?? "")
  const [cierre, setCierre] = useState<Cierre>(CIERRE_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const similares = useSimilares(b, contacto?.id ?? null)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof BorradorContacto>(k: K, v: BorradorContacto[K]) =>
    setB((x) => ({ ...x, [k]: v }))

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(
        contacto
          ? `/api/marketing/contactos/${contacto.id}`
          : (alta?.url ?? "/api/marketing/contactos"),
        {
          method: contacto ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...b,
            ...(contacto ? {} : alta?.cuerpo),
            ...(!contacto && alta?.proyecto ? { proyecto: proyecto.trim() || undefined, ...cierre } : {}),
          }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      if (contacto || !alta) toast.success(contacto ? "Contacto actualizado" : "Contacto creado")
      onGuardado(data.contacto, data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  const titulo = contacto
    ? [contacto.nombre, contacto.apellido].filter(Boolean).join(" ") || contacto.empresa
    : "Nuevo contacto"

  return (
    <DetalleDialog
      abierto
      saliendo={saliendo}
      onCerrar={onCerrar}
      titulo={
titulo
      }
      subtitulo={
        contacto
          ? [contacto.cargo, contacto.empresa].filter(Boolean).join(" · ")
          : (alta?.subtitulo ?? "Una persona de una empresa, para la base de marketing")
      }
      acciones={
        <>
          {contacto && onBorrar && (
            <Button
              variant="ghost"
              className="mr-auto text-danger-text hover:bg-danger-soft hover:text-danger-text"
              onClick={() => onBorrar(contacto)}
            >
              <Trash2 />
              Borrar
            </Button>
          )}
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={guardando || !b.empresa.trim() || (!b.nombre.trim() && !b.apellido.trim())}
          >
            {guardando && <Loader2 className="animate-spin" />}
            {contacto ? "Guardar cambios" : (alta?.boton ?? "Crear contacto")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        {contacto && <CompanerosDeEmpresa contacto={contacto} />}

        {contacto && (contacto.crm.length > 0 || onNuevoProyecto) && (
          <Bloque
            titulo="Proyectos"
            accion={
              onNuevoProyecto && (
                <button
                  type="button"
                  onClick={() => onNuevoProyecto(contacto)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Proyecto
                </button>
              )
            }
          >
            {contacto.crm.length === 0 && (
              <p className="text-[12.5px] text-ink-muted">Todavía no está en ningún CRM.</p>
            )}
            <ul className="space-y-1.5">
              {contacto.crm.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
                  <Avatar id={c.ownerId} nombre={c.ownerNombre} size="xs" />
                  <span className="text-ink">{c.ownerNombre}</span>
                  <span className="text-ink-faint">·</span>
                  {c.proyecto && (
                    <>
                      <span className="truncate">{c.proyecto}</span>
                      <span className="text-ink-faint">·</span>
                    </>
                  )}
                  <span className="shrink-0">{esEstadoCrm(c.estado) ? ESTADO_CRM_LABEL[c.estado] : c.estado}</span>
                  <span className="num ml-auto shrink-0 text-ink-muted">{c.probabilidad}%</span>
                </li>
              ))}
            </ul>
          </Bloque>
        )}

        {similares.length > 0 && <AvisoSimilares similares={similares} desdeCrm={!!alta} />}

        <Bloque titulo="La persona">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nombre" requerido>
              <Input
                autoFocus={!contacto}
                value={b.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="María"
              />
            </Campo>
            <Campo rotulo="Apellido">
              <Input
                value={b.apellido}
                onChange={(e) => set("apellido", e.target.value)}
                placeholder="Gómez"
              />
            </Campo>
            <Campo rotulo="Cargo">
              <Input
                value={b.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="Gerente de Tecnología"
              />
            </Campo>
            <Campo rotulo="Departamento">
              <Input
                value={b.departamento}
                onChange={(e) => set("departamento", e.target.value)}
                list="contactos-departamentos"
                placeholder="IT"
              />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="Dónde trabaja">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Empresa" requerido className="sm:col-span-2">
              <Input
                value={b.empresa}
                onChange={(e) => set("empresa", e.target.value)}
                list="contactos-empresas"
                placeholder="Banco Provincia"
              />
            </Campo>
            <Campo rotulo="Vertical">
              <Input
                value={b.vertical}
                onChange={(e) => set("vertical", e.target.value)}
                list="contactos-verticales"
                placeholder="Servicios financieros"
              />
            </Campo>
            <Campo rotulo="AM">
              <select
                value={b.amId ?? ""}
                onChange={(e) => set("amId", e.target.value || null)}
                className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink"
              >
                <option value="">Sin asignar</option>
                {equipo.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                    {u.id === yoId ? " (vos)" : ""}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="Cómo ubicarla">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Email">
              <Input
                type="email"
                value={b.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="nombre@empresa.com"
              />
            </Campo>
            <Campo rotulo="Teléfono">
              <Input
                type="tel"
                value={b.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="+54 11 4321-2200"
              />
            </Campo>
          </div>
        </Bloque>

        {!contacto && alta?.proyecto && (
          <Bloque titulo="En el CRM">
            <div className="space-y-4">
              <CampoProyecto
                valor={proyecto}
                onCambio={setProyecto}
                sugerencias={alta.proyecto.sugerencias}
                opcional
              />
              <EtapaYCierre valor={cierre} onCambio={setCierre} />
            </div>
          </Bloque>
        )}

        <Bloque titulo="Observaciones">
          <Textarea
            value={b.observaciones}
            onChange={(e) => set("observaciones", e.target.value)}
            rows={4}
            placeholder="Qué le interesa, en qué quedamos, quién nos lo presentó…"
          />
        </Bloque>

        {contacto && <ChatDeContacto contactoId={contacto.id} />}

        {error && (
          <p className="rounded-lg border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger-text">
            {error}
          </p>
        )}

        {/* Enter guarda también desde cualquier input. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />

        <datalist id="contactos-empresas">
          {opciones.empresas.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="contactos-verticales">
          {opciones.verticales.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="contactos-departamentos">
          {opciones.departamentos.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </form>
    </DetalleDialog>
  )
}

/**
 * Si de la empresa tenemos a más de una persona, quiénes son y el acceso al
 * organigrama: entrar por un contacto es la forma más común de llegar a "¿y
 * con quién más hablamos ahí?".
 */
function CompanerosDeEmpresa({ contacto }: { contacto: Contacto }) {
  const [abierto, setAbierto] = useState(false)
  const url = urlFichaEmpresa(contacto.empresa)
  const q = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<FichaEmpresa>(url, { signal }),
    staleTime: 60_000,
  })
  const personas = q.data?.personas ?? []
  if (personas.length < 2) return null
  const otros = personas.filter((p) => p.id !== contacto.id)

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-subtle px-3.5 py-3">
        <div className="flex shrink-0 -space-x-1.5">
          {otros.slice(0, 4).map((p) => (
            <Avatar key={p.id} id={p.id} nombre={p.nombre} size="sm" className="ring-2 ring-surface-subtle" />
          ))}
        </div>
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-ink-secondary">
          <span className="font-semibold text-ink">
            {otros.length === 1 ? "1 persona más" : `${otros.length} personas más`}
          </span>{" "}
          de {q.data?.nombre ?? contacto.empresa}:{" "}
          <span className="text-ink-muted">
            {otros
              .slice(0, 2)
              .map((p) => p.nombre.split(" ")[0] + (p.cargo ? ` (${p.cargo})` : ""))
              .join(", ")}
            {otros.length > 2 && "…"}
          </span>
        </p>
        <BotonOrganigrama onClick={() => setAbierto(true)} />
      </div>
      <OrganigramaEmpresa
        empresa={abierto ? contacto.empresa : null}
        destacado={contacto.id}
        onCerrar={() => setAbierto(false)}
      />
    </>
  )
}

function Campo({
  rotulo,
  requerido,
  className,
  children,
}: {
  rotulo: string
  requerido?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[12px] font-medium text-ink-secondary">
        {rotulo}
        {requerido && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  )
}

/* ── ¿Ya existe? ──────────────────────────────────────────────────────────── */

/**
 * Pregunta, mientras se escribe, si ya hay alguien así: mismo mail, o mismo
 * nombre y apellido. Espera a que se deje de tipear (medio segundo) y no
 * pregunta con datos sueltos: "Juan" solo no dice nada.
 */
function useSimilares(b: BorradorContacto, excluir: string | null): Similar[] {
  const [criterio, setCriterio] = useState("")
  useEffect(() => {
    const p = new URLSearchParams()
    if (b.email.includes("@")) p.set("email", b.email.trim())
    if (b.nombre.trim() && b.apellido.trim()) {
      p.set("nombre", b.nombre.trim())
      p.set("apellido", b.apellido.trim())
    }
    if (p.size > 0) {
      if (b.empresa.trim()) p.set("empresa", b.empresa.trim())
      if (excluir) p.set("excluir", excluir)
    }
    const t = setTimeout(() => setCriterio(p.size > 0 ? p.toString() : ""), 500)
    return () => clearTimeout(t)
  }, [b.email, b.nombre, b.apellido, b.empresa, excluir])

  const url = `/api/contactos/similares?${criterio}`
  const q = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<{ similares: Similar[] }>(url, { signal }),
    enabled: criterio !== "",
    staleTime: 30_000,
  })
  return criterio ? (q.data?.similares ?? []) : []
}

function AvisoSimilares({ similares, desdeCrm }: { similares: Similar[]; desdeCrm: boolean }) {
  const porMail = similares.some((x) => x.motivo === "mail")
  return (
    <div className="rounded-lg border border-warning-line bg-warning-soft px-3.5 py-3 animate-in fade-in-0 duration-200">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-warning-text">
        <AlertTriangle className="h-3.5 w-3.5" />
        {porMail ? "Ya hay alguien con este mail" : "Puede que ya esté cargada"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {similares.map((x) => (
          <li key={x.id} className="text-[12.5px] text-ink-secondary">
            <span className="font-medium text-ink">{x.nombre}</span>
            {x.cargo && ` · ${x.cargo}`}
            {x.empresa && ` · ${x.empresa}`}
            <span className="text-ink-muted">
              {" "}
              —{" "}
              {x.motivo === "mail" ? "mismo mail" : x.motivo === "persona" ? "mismo nombre y empresa" : "mismo nombre, otra empresa"}
            </span>
          </li>
        ))}
      </ul>
      {porMail && (
        <p className="mt-1.5 text-[12px] text-ink-muted">
          {desdeCrm
            ? "No se duplica: se suma al CRM la que ya está."
            : "Con el mismo mail no se puede guardar: buscala en la tabla y editala."}
        </p>
      )}
    </div>
  )
}
