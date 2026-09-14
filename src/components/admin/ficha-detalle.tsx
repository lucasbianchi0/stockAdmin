"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { FileSpreadsheet, Pencil } from "lucide-react"

import {
  Bloque,
  Cifra,
  Dato,
  DetalleDialog,
  Lista,
  ListaDatos,
  Renglon,
  Vacio,
} from "@/components/admin/detalle-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatearCuit } from "@/lib/admin/cuit"
import { estadoDeSaldo, textoVencimiento } from "@/lib/admin/comprobantes"
import type { EntidadDetalle } from "@/lib/admin/detalle"
import { FORMA_JURIDICA_LABEL, type TipoEntidad } from "@/lib/admin/entidades"
import { formatearFecha, formatearFechaLarga } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson } from "@/lib/admin/query"

/**
 * La ficha de un cliente o un proveedor, abierta desde la tabla.
 *
 * Arriba va la plata y abajo los datos de contacto, y no al revés a propósito.
 * Quien abre una ficha desde una lista de cuentas por cobrar está por decidir si
 * llama o si espera, y eso lo contesta el saldo vencido — la dirección fiscal no
 * cambia ninguna decisión, pero hace falta tenerla a mano cuando sí.
 */
export function FichaDetalle({
  abierto,
  tipo,
  entidadId,
  onCerrar,
  onEditar,
}: {
  abierto: boolean
  tipo: TipoEntidad
  entidadId: string | null
  onCerrar: () => void
  onEditar: () => void
}) {
  const router = useRouter()
  const recurso = tipo === "cliente" ? "clientes" : "proveedores"

  // Mismo url que la pantalla de la ficha: comparten la entrada de caché. Cada
  // ficha tiene su clave, así que abrir la segunda nunca muestra por un instante
  // los datos de la primera —parecería que el saldo cambió solo—.
  const url = `/api/admin/${recurso}/${entidadId}/detalle`
  const consulta = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) => pedirJson<EntidadDetalle>(url, { signal }),
    enabled: abierto && entidadId !== null,
  })

  const datos = abierto ? (consulta.data ?? null) : null
  const cargando = consulta.isLoading
  const error = consulta.isError ? mensajeError(consulta.error, "No se pudo cargar la ficha") : null

  const e = datos?.entidad
  const r = datos?.resumen
  const esCliente = tipo === "cliente"

  return (
    <DetalleDialog
      abierto={abierto}
      onCerrar={onCerrar}
      cargando={cargando}
      error={error}
      titulo={e?.razonSocial ?? "Ficha"}
      subtitulo={e?.cuit ? formatearCuit(e.cuit) : "Sin CUIT cargado"}
      badges={
        <>
          {e && !e.activo && (
            <Badge tone="danger" size="sm">
              De baja
            </Badge>
          )}
          {e?.origen === "exterior" && (
            <Badge tone="neutral" size="sm">
              Exterior
            </Badge>
          )}
        </>
      }
      acciones={
        <>
          <Button
            variant="outline"
            onClick={() =>
              router.push(
                `/admin/${esCliente ? "clientes" : "proveedores"}/cuenta-corriente?entidadId=${entidadId ?? ""}`
              )
            }
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Cuenta corriente
          </Button>
          <Button onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5" />
            Editar ficha
          </Button>
        </>
      }
    >
      {datos && e && r && (
        <>
          <Bloque titulo={esCliente ? "Nos debe" : "Le debemos"}>
            {r.cantidad === 0 && r.pendienteArs === 0 && r.pendienteUsd === 0 ? (
              <p className="rounded-lg border border-line bg-surface-subtle px-3.5 py-3 text-[12.5px] text-ink-muted">
                Sin comprobantes pendientes.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  {r.pendienteArs !== 0 && (
                    <Cifra
                      rotulo="Pendiente en pesos"
                      valor={formatearImporte(r.pendienteArs, "ARS")}
                    />
                  )}
                  {r.pendienteUsd !== 0 && (
                    <Cifra
                      rotulo="Pendiente en dólares"
                      valor={formatearImporte(r.pendienteUsd, "USD")}
                    />
                  )}
                  {r.vencidoArs !== 0 && (
                    <Cifra
                      rotulo="Vencido en pesos"
                      valor={formatearImporte(r.vencidoArs, "ARS")}
                      tono="danger"
                    />
                  )}
                  {r.vencidoUsd !== 0 && (
                    <Cifra
                      rotulo="Vencido en dólares"
                      valor={formatearImporte(r.vencidoUsd, "USD")}
                      tono="danger"
                    />
                  )}
                </div>

                <p className="mt-2 text-[11.5px] text-ink-muted">
                  {r.cantidad} comprobante{r.cantidad !== 1 ? "s" : ""} sin saldar
                  {r.vencidas > 0 && ` · ${r.vencidas} vencido${r.vencidas !== 1 ? "s" : ""}`}
                  {r.proximoVencimiento &&
                    ` · el más urgente ${textoVencimiento(r.proximoVencimiento).toLowerCase()}`}
                </p>
              </>
            )}
          </Bloque>

          <Bloque titulo="Ficha">
            <ListaDatos>
              <Dato
                rotulo="Condición IVA"
                valor={e.formaJuridica ? FORMA_JURIDICA_LABEL[e.formaJuridica] : null}
              />
              <Dato rotulo="Contacto" valor={e.contacto} />
              <Dato rotulo="Email" valor={e.email}>
                {e.email ? (
                  <a
                    href={`mailto:${e.email}`}
                    className="truncate text-brand-700 hover:underline"
                  >
                    {e.email}
                  </a>
                ) : undefined}
              </Dato>
              <Dato rotulo="Teléfono" valor={e.telefono} />
              <Dato rotulo="Domicilio" valor={e.direccion} />
              <Dato rotulo="Provincia" valor={e.provincia} />
              {esCliente && <Dato rotulo="Vendedor" valor={e.vendedorNombre} />}
              <Dato
                rotulo="Plazo de pago"
                valor={e.condicionPagoDias !== null ? `${e.condicionPagoDias} días` : null}
              />
              <Dato rotulo="Notas" valor={e.notas} className="whitespace-pre-wrap" />
              <Dato rotulo="Alta" valor={formatearFechaLarga(e.createdAt.slice(0, 10))} />
            </ListaDatos>
          </Bloque>

          <Bloque titulo="Últimos comprobantes">
            <Lista>
              {datos.comprobantes.length === 0 ? (
                <Vacio texto="Todavía no tiene comprobantes cargados." />
              ) : (
                datos.comprobantes.map((c) => {
                  const estado = estadoDeSaldo(c.total, c.saldo)
                  return (
                    <Renglon
                      key={c.id}
                      izquierda={
                        <div className="flex items-center gap-2">
                          <Badge tone={c.signo === -1 ? "warning" : "neutral"} size="sm">
                            {c.clase}
                          </Badge>
                          <span className="num text-[12px] text-ink-secondary">{c.numero}</span>
                          <span className="num text-[11.5px] text-ink-muted">
                            {formatearFecha(c.fecha)}
                          </span>
                        </div>
                      }
                      derecha={
                        <>
                          <span className="num block text-[12.5px] font-semibold text-ink">
                            {c.signo === -1 ? "−" : ""}
                            {formatearImporte(c.total, c.moneda)}
                          </span>
                          <span
                            className={
                              estado === "saldado"
                                ? "text-[11px] text-success-text"
                                : "num text-[11px] text-ink-muted"
                            }
                          >
                            {estado === "saldado"
                              ? esCliente
                                ? "Cobrada"
                                : "Pagada"
                              : `Falta ${formatearImporte(c.saldo, c.moneda)}`}
                          </span>
                        </>
                      }
                    />
                  )
                })
              )}
            </Lista>
          </Bloque>

          <Bloque titulo={esCliente ? "Últimos cobros" : "Últimos pagos"}>
            <Lista>
              {datos.pagos.length === 0 ? (
                <Vacio texto={esCliente ? "Todavía no cobró nada." : "Todavía no se le pagó nada."} />
              ) : (
                datos.pagos.map((p) => (
                  <Renglon
                    key={p.id}
                    izquierda={
                      <>
                        <span className="num text-[12.5px] text-ink">
                          {formatearFecha(p.fecha)}
                        </span>
                        <span className="ml-2 text-[11.5px] text-ink-muted">
                          {p.comprobantes} comprobante{p.comprobantes !== 1 ? "s" : ""}
                        </span>
                      </>
                    }
                    derecha={
                      <span className="num text-[12.5px] font-semibold text-ink">
                        {formatearImporte(p.total, p.moneda)}
                      </span>
                    }
                  />
                ))
              )}
            </Lista>
          </Bloque>
        </>
      )}
    </DetalleDialog>
  )
}
