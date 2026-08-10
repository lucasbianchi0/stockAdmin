"use client"

import { ArrowRight } from "lucide-react"

import { Avisos, CampoLeido, LecturaDialog } from "@/components/admin/lectura-dialog"
import { Button } from "@/components/ui/button"
import type { BorradorMovimiento } from "@/components/admin/movimiento-dialog"
import { formatearFechaLarga } from "@/lib/admin/fecha"
import type { BorradorGasto } from "@/lib/admin/lectura-gasto"
import { formatearImporte } from "@/lib/admin/moneda"
import { CATEGORIA_LABEL, type CategoriaGasto } from "@/lib/admin/movimientos"

/**
 * Alta de un gasto a partir de su comprobante.
 *
 * Un gasto son cuatro campos, así que el ahorro de tipeo es lo de menos: lo que
 * este lector aporta es el control de que el papel adjunto **sea** un gasto. Si
 * discrimina IVA es una factura de compra, va por el otro circuito y su crédito
 * fiscal se computa; cargarla acá no descuadra nada visible y por eso el error
 * sobrevive meses. El aviso aparece antes de completar el formulario.
 */
export function LecturaGastoDialog({
  abierto,
  onCerrar,
  onUsar,
}: {
  abierto: boolean
  onCerrar: () => void
  onUsar: (borrador: BorradorMovimiento) => void
}) {
  return (
    <LecturaDialog<BorradorGasto>
      abierto={abierto}
      titulo="Carga inteligente de gasto"
      descripcion="Adjuntá el comprobante, revisá lo que se leyó y completá el movimiento"
      endpoint="/api/admin/movimientos/leer"
      ayuda="Ticket, boleta de un servicio, comprobante de transferencia o resumen"
      onCerrar={onCerrar}
    >
      {(datos, reiniciar) => {
        const g = datos.gasto
        const dudoso = (campo: string) => datos.gasto.camposDudosos.includes(campo)

        return (
          <div className="space-y-4">
            <Avisos avisos={datos.avisos} />

            {g.tipoDocumento && (
              <p className="text-[12px] text-ink-muted">
                Leído de: <span className="text-ink-secondary">{g.tipoDocumento}</span>
              </p>
            )}

            <div className="rounded-lg border border-line px-3.5 py-2">
              <CampoLeido
                rotulo="Fecha"
                valor={g.fecha ? formatearFechaLarga(g.fecha) : null}
                dudoso={dudoso("fecha")}
              />
              <CampoLeido
                rotulo="Importe"
                valor={
                  g.importe !== null ? formatearImporte(g.importe, g.moneda ?? "ARS") : null
                }
                dudoso={dudoso("importe")}
              />
              <CampoLeido
                rotulo="Categoría"
                valor={
                  g.categoria ? (CATEGORIA_LABEL[g.categoria as CategoriaGasto] ?? null) : null
                }
                dudoso={dudoso("categoria")}
              />
              <CampoLeido rotulo="Detalle" valor={g.detalle} dudoso={dudoso("detalle")} />
              <CampoLeido rotulo="Referencia" valor={g.referencia} dudoso={dudoso("referencia")} />
              <CampoLeido rotulo="A nombre de" valor={g.beneficiario} />
            </div>

            <p className="text-[11.5px] text-ink-muted">
              Falta elegir de qué cuenta salió: eso no está en el papel.
            </p>

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="outline" onClick={reiniciar}>
                Adjuntar otro
              </Button>
              <Button onClick={() => onUsar(aBorrador(datos))}>
                Completar el gasto
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      }}
    </LecturaDialog>
  )
}

/** Lo leído con la forma que espera el formulario de movimientos. Los importes
 *  van como texto porque el campo los parsea igual que si se hubieran tipeado. */
function aBorrador({ gasto: g }: BorradorGasto): BorradorMovimiento {
  return {
    fecha: g.fecha ?? undefined,
    importe: g.importe !== null ? String(g.importe) : undefined,
    moneda: g.moneda ?? undefined,
    tc: g.tc !== null ? String(g.tc) : undefined,
    categoria: g.categoria ?? undefined,
    referencia: g.referencia ?? undefined,
    detalle: [g.detalle, g.beneficiario].filter(Boolean).join(" — ") || undefined,
  }
}
