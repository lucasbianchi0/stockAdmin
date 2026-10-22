"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Mail, Network, Phone } from "lucide-react"

import { Bloque, DetalleDialog } from "@/components/admin/detalle-dialog"
import { OrganigramaEmpresa, urlFichaEmpresa } from "@/components/contactos/organigrama-empresa"
import { Avatar } from "@/components/ui/avatar"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import { ESTADO_CRM_ESTILO, ESTADO_CRM_LABEL, ESTA_ABIERTA, fechaCorta } from "@/lib/comercial/crm"
import type { FichaEmpresa } from "@/lib/contactos-compartido"
import { usePresencia } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * La empresa entera: quiénes trabajan ahí, los proyectos de cada uno (quién
 * lo sigue, en qué etapa y con qué %), y —si ya es cliente— sus presupuestos.
 *
 * Se abre al hacer click en el nombre de una empresa, en Contactos o en el CRM.
 * Responde a lo que la tabla de personas no puede: "¿con quién hablamos en
 * Banco Provincia, y en qué quedamos con cada uno?".
 */
export function EmpresaPanel({
  empresa,
  onCerrar,
}: {
  /** El nombre de la empresa; `null` cierra el panel. */
  empresa: string | null
  onCerrar: () => void
}) {
  const { montado, saliendo } = usePresencia(empresa !== null)
  const [mostrada, setMostrada] = useState(empresa)
  if (empresa && empresa !== mostrada) setMostrada(empresa)
  const [organigrama, setOrganigrama] = useState(false)

  const url = urlFichaEmpresa(mostrada ?? "")
  const q = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<FichaEmpresa>(url, { signal }),
    enabled: !!mostrada,
    staleTime: 60_000,
  })

  if (!montado || !mostrada) return null
  const f = q.data
  const enSeguimiento = f?.personas.filter((p) => p.crm.length > 0).length ?? 0
  const abiertas = f?.personas.flatMap((p) => p.crm).filter((o) => ESTA_ABIERTA(o.estado)).length ?? 0

  return (
    <>
    <DetalleDialog
      abierto
      saliendo={saliendo}
      onCerrar={onCerrar}
      titulo={f?.nombre ?? mostrada}
      subtitulo={
        f
          ? [
              f.vertical,
              `${f.personas.length} ${f.personas.length === 1 ? "persona" : "personas"}`,
              enSeguimiento > 0 && `${enSeguimiento} en seguimiento`,
              abiertas > 0 && `${abiertas} ${abiertas === 1 ? "proyecto abierto" : "proyectos abiertos"}`,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      cargando={q.isPending}
      error={q.isError ? mensajeError(q.error) : null}
    >
      {f && (
        <>
          <Bloque
            titulo="Personas"
            accion={
              f.personas.length > 1 ? (
                <BotonOrganigrama onClick={() => setOrganigrama(true)} />
              ) : undefined
            }
          >
            <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
              {f.personas.map((p) => (
                <li key={p.id} className="px-3.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-ink">{p.nombre}</p>
                      <p className="truncate text-[12px] text-ink-muted">
                        {[p.cargo, p.departamento].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Avatar id={p.amId} nombre={p.amNombre} size="xs" className="mt-0.5" />
                  </div>
                  {(p.email || p.telefono) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-secondary">
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                          <Mail className="h-3 w-3 text-ink-faint" />
                          {p.email}
                        </a>
                      )}
                      {p.telefono && (
                        <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className="num inline-flex items-center gap-1 hover:text-ink">
                          <Phone className="h-3 w-3 text-ink-faint" />
                          {p.telefono}
                        </a>
                      )}
                    </div>
                  )}
                  {p.crm.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {p.crm.map((o) => (
                        <li key={o.id} className="flex items-center gap-2 text-[12px] text-ink-secondary">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ESTADO_CRM_ESTILO[o.estado].punto)} />
                          {o.proyecto && (
                            <>
                              <span className="truncate text-ink">{o.proyecto}</span>
                              <span className="text-ink-faint">·</span>
                            </>
                          )}
                          <span className={cn("shrink-0", !o.proyecto && "text-ink")}>
                            {ESTADO_CRM_LABEL[o.estado]} <span className="num text-ink-muted">{o.probabilidad}%</span>
                          </span>
                          <span className="text-ink-faint">·</span>
                          <span className="truncate">
                            {o.ownerNombre}
                            {o.proximaAccion && ESTA_ABIERTA(o.estado) && (
                              <span className="text-ink-muted">
                                {" "}
                                — {o.proximaAccion}
                                {o.fechaProxima && ` (${fechaCorta(o.fechaProxima)})`}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Bloque>

          <Bloque
            titulo="Presupuestos"
            accion={
              f.cliente ? (
                <span className="text-[11.5px] text-ink-muted">Cliente: {f.cliente.razonSocial}</span>
              ) : undefined
            }
          >
            {!f.cliente ? (
              <p className="text-[12.5px] text-ink-muted">
                Todavía no es cliente: no hay una ficha en Clientes con este nombre.
              </p>
            ) : f.presupuestos.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">Es cliente, pero todavía no tiene presupuestos.</p>
            ) : (
              <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
                {f.presupuestos.map((pr) => (
                  <li key={pr.id}>
                    <Link
                      href={`/comercial/presupuestos/${pr.id}`}
                      className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-subtle"
                    >
                      <span className="num w-12 shrink-0 text-[12.5px] text-ink-muted">#{pr.numero}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{pr.referencia}</span>
                      <span className="shrink-0 text-[12px] capitalize text-ink-muted">{pr.estado}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-ink" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
        </>
      )}
    </DetalleDialog>
    <OrganigramaEmpresa empresa={organigrama ? mostrada : null} onCerrar={() => setOrganigrama(false)} />
    </>
  )
}

/** El acceso al organigrama: sólo tiene sentido con más de una persona. */
export function BotonOrganigrama({ onClick, personas }: { onClick: () => void; personas?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
    >
      <Network className="h-3.5 w-3.5" />
      Ver organigrama
      {personas !== undefined && <span className="num font-medium text-brand-700/70">· {personas}</span>}
    </button>
  )
}
