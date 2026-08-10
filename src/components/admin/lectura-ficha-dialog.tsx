"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"

import { Avisos, CampoLeido, LecturaDialog } from "@/components/admin/lectura-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BorradorCliente } from "@/components/admin/entidad-dialog"
import { formatearCuit } from "@/lib/admin/cuit"
import {
  FORMA_JURIDICA_LABEL,
  esFormaJuridica,
  type TipoEntidad,
} from "@/lib/admin/entidades"
import type { BorradorFicha, CandidatoFicha } from "@/lib/admin/lectura-ficha"
import { cn } from "@/lib/utils"

/**
 * Alta de un cliente o un proveedor a partir de un papel.
 *
 * Lo típico es la constancia de inscripción de AFIP, que trae todo lo que la
 * ficha pide: razón social, CUIT, condición frente al IVA y domicilio fiscal.
 * También sirve una factura del proveedor, y ahí el documento tiene dos empresas
 * —quien la emitió y quien la recibió—, así que se muestran las dos y se elige.
 * El sistema no puede deducir cuál de las dos somos nosotros.
 */
export function LecturaFichaDialog({
  abierto,
  tipo,
  onCerrar,
  onUsar,
}: {
  abierto: boolean
  tipo: TipoEntidad
  onCerrar: () => void
  onUsar: (borrador: Partial<BorradorCliente>) => void
}) {
  const esProveedor = tipo === "proveedor"
  const recurso = esProveedor ? "proveedores" : "clientes"
  const rotulo = esProveedor ? "proveedor" : "cliente"

  const [elegido, setElegido] = useState(0)

  return (
    <LecturaDialog<BorradorFicha>
      abierto={abierto}
      titulo={`Carga inteligente de ${rotulo}`}
      descripcion="Adjuntá el documento, revisá lo que se leyó y completá la ficha"
      endpoint={`/api/admin/${recurso}/leer`}
      ayuda="Constancia de inscripción de AFIP, una factura o cualquier papel con los datos fiscales"
      onCerrar={onCerrar}
    >
      {(datos, reiniciar) => {
        const candidatos = datos.candidatos
        const c = candidatos[Math.min(elegido, candidatos.length - 1)]

        return (
          <div className="space-y-4">
            <Avisos avisos={datos.avisos} />

            {datos.tipoDocumento && (
              <p className="text-[12px] text-ink-muted">
                Leído de: <span className="text-ink-secondary">{datos.tipoDocumento}</span>
              </p>
            )}

            {/* Con dos empresas en el papel, cuál es la ficha se elige acá. El
                orden ya viene resuelto del servidor por el rol, así que la
                primera suele ser la correcta. */}
            {candidatos.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {candidatos.map((cand, i) => (
                  <button
                    key={i}
                    onClick={() => setElegido(i)}
                    aria-pressed={i === elegido}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-left text-[12px] transition-colors",
                      i === elegido
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-line text-ink-muted hover:bg-surface-muted"
                    )}
                  >
                    <span className="block font-medium">
                      {cand.razonSocial ?? "Sin razón social"}
                    </span>
                    <span className="text-[10.5px] uppercase tracking-[0.06em]">
                      {cand.rol ?? "sin rol"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {c ? (
              <>
                <div className="rounded-lg border border-line px-3.5 py-2">
                  <Campos candidato={c} dudosos={datos.camposDudosos} />
                </div>

                {c.existente && (
                  <p className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <Badge tone="warning" size="sm">
                      Ya existe
                    </Badge>
                    {c.existente.razonSocial} está cargado con ese CUIT.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-ink-muted">
                No se leyó ninguna empresa en el documento.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="outline" onClick={reiniciar}>
                Adjuntar otro
              </Button>
              <Button disabled={!c} onClick={() => c && onUsar(aBorrador(c))}>
                Completar la ficha
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      }}
    </LecturaDialog>
  )
}

function Campos({
  candidato: c,
  dudosos,
}: {
  candidato: CandidatoFicha
  dudosos: string[]
}) {
  const dudoso = (campo: string) => dudosos.includes(campo)

  return (
    <>
      <CampoLeido rotulo="Razón social" valor={c.razonSocial} dudoso={dudoso("razonSocial")} />
      <CampoLeido
        rotulo="CUIT"
        valor={
          c.cuitNormalizado
            ? formatearCuit(c.cuitNormalizado)
            : c.cuit
              ? `${c.cuit} (no válido)`
              : null
        }
        dudoso={dudoso("cuit") || c.cuitInvalido}
      />
      <CampoLeido
        rotulo="Condición IVA"
        valor={
          esFormaJuridica(c.formaJuridica) ? FORMA_JURIDICA_LABEL[c.formaJuridica] : null
        }
        dudoso={dudoso("formaJuridica")}
      />
      <CampoLeido rotulo="Domicilio" valor={c.direccion} dudoso={dudoso("direccion")} />
      <CampoLeido rotulo="Provincia" valor={c.provincia} dudoso={dudoso("provincia")} />
      <CampoLeido rotulo="Teléfono" valor={c.telefono} dudoso={dudoso("telefono")} />
      <CampoLeido rotulo="Email" valor={c.email} dudoso={dudoso("email")} />
      <CampoLeido rotulo="Contacto" valor={c.contacto} dudoso={dudoso("contacto")} />
    </>
  )
}

/** Lo leído, con la forma que espera el formulario de la ficha. El CUIT viaja
 *  formateado porque el campo lo muestra así mientras se escribe. */
function aBorrador(c: CandidatoFicha): Partial<BorradorCliente> {
  return {
    razonSocial: c.razonSocial ?? "",
    cuit: c.cuitNormalizado ? formatearCuit(c.cuitNormalizado) : (c.cuit ?? ""),
    formaJuridica: esFormaJuridica(c.formaJuridica) ? c.formaJuridica : "",
    direccion: c.direccion ?? "",
    provincia: c.provincia ?? "",
    telefono: c.telefono ?? "",
    email: c.email ?? "",
    contacto: c.contacto ?? "",
  }
}
