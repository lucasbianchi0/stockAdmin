"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Loader2, Search, Upload } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { descargarCsv } from "@/lib/admin/csv"
import {
  TIPO_CUENTA_LABEL,
  filtrarCuentas,
  olvidarPlanCuentas,
  type CuentaContable,
} from "@/lib/admin/plan-cuentas"
import type { ResultadoImportacion } from "@/lib/admin/plan-cuentas-importar"
import { cn } from "@/lib/utils"

/**
 * Datos maestros: el plan de cuentas del estudio contable.
 *
 * Es la pantalla del punto 1 del pliego. Hasta acá el plan existía —224 cuentas,
 * cargadas por una migración— pero no había dónde verlo: se lo conocía solamente
 * a través del selector que aparece al imputar una factura, que muestra de a
 * ocho cuentas y solo las activas. Cuando alguien preguntaba «¿contra qué cuenta
 * va esto?» no había una respuesta que se pudiera leer entera.
 *
 * Lo que se puede hacer acá es deliberadamente poco: **mirar, buscar, exportar y
 * volver a subir el Excel**. El nombre, el rubro y las banderas de cada cuenta
 * los mantiene el estudio en su archivo, así que editarlos por acá sería
 * escribir algo que la próxima importación pisa sin avisar. Lo único que sí es
 * decisión de este lado —y por eso es lo único editable— es si una cuenta se
 * ofrece o no al imputar.
 */

/** El plan entero, no solo lo imputable y activo que piden los selectores. */
const ENDPOINT = "/api/admin/plan-cuentas?todas=1"

type Filtro = "todas" | "activas" | "inactivas"

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "activas", etiqueta: "En uso" },
  { valor: "inactivas", etiqueta: "Dadas de baja" },
]

export function PlanCuentasClient() {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todas")
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [tocando, setTocando] = useState<string | null>(null)

  const archivo = useRef<HTMLInputElement>(null)

  const cargar = async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(ENDPOINT)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el plan")
      setCuentas((data.cuentas ?? []) as CuentaContable[])
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el plan")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  const visibles = useMemo(() => {
    const porEstado = cuentas.filter((c) =>
      filtro === "todas" ? true : filtro === "activas" ? c.activo : !c.activo
    )
    return filtrarCuentas(porEstado, q)
  }, [cuentas, q, filtro])

  /* ── Subir el Excel ───────────────────────────────────────────────────── */

  const importar = async (f: File) => {
    setImportando(true)
    setResultado(null)
    try {
      const form = new FormData()
      form.append("archivo", f)
      const res = await fetch("/api/admin/plan-cuentas/importar", { method: "POST", body: form })
      const data = await res.json()

      if (!res.ok) {
        // Las filas con problemas vienen listadas: mostrarlas es la diferencia
        // entre "no se pudo" y saber qué línea de la planilla hay que arreglar.
        const detalle = (data.errores as { linea: number; motivo: string }[] | undefined)
          ?.map((e) => `Fila ${e.linea}: ${e.motivo}`)
          .join(" · ")
        throw new Error(detalle ? `${data.error} ${detalle}` : (data.error ?? "No se pudo importar"))
      }

      const r = data as ResultadoImportacion
      setResultado(r)
      // La caché del plan la comparten todos los selectores abiertos.
      olvidarPlanCuentas()
      toast.success(
        r.altas === 0 && r.cambios === 0
          ? "El plan ya estaba al día"
          : `${r.altas} cuentas nuevas y ${r.cambios} actualizadas`
      )
      await cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo importar")
    } finally {
      setImportando(false)
      if (archivo.current) archivo.current.value = ""
    }
  }

  const alternar = async (c: CuentaContable) => {
    setTocando(c.id)
    try {
      const res = await fetch(`/api/admin/plan-cuentas/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activo: !c.activo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar")
      setCuentas((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, activo: !c.activo } : x))
      )
      olvidarPlanCuentas()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar")
    } finally {
      setTocando(null)
    }
  }

  const exportar = () =>
    descargarCsv(
      "plan-de-cuentas.csv",
      [
        "Codigo",
        "Nombre",
        "Rubro",
        "Subcuent",
        "Tipo_SubCta",
        "Banco",
        "Valores",
        "L_Iva",
        "Mon_Extr",
        "Medio_Pago",
        "Estado",
      ],
      // Las mismas columnas y los mismos códigos del archivo del estudio: lo
      // exportado se puede volver a subir tal cual, o mandárselo al contador
      // para que compare contra el suyo.
      visibles.map((c) => [
        c.codigo,
        c.nombre,
        RUBRO_A_SIGLA[c.tipo],
        c.llevaSubcuenta ? "SI" : "",
        c.tipoSubcuenta === "cliente" ? "CL" : c.tipoSubcuenta === "proveedor" ? "PR" : "",
        c.esBanco ? "SI" : "",
        c.esValores ? "SI" : "",
        c.libroIva === "compras" ? "CO" : c.libroIva === "ventas" ? "VE" : "",
        c.monedaExtranjera ? "SI" : "",
        c.esMedioPago ? "SI" : "",
        c.activo ? "En uso" : "Dada de baja",
      ])
    )

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-subtle px-4 py-3">
          <p className="text-[12.5px] text-ink-muted">
            El plan del estudio contable. Contra estas cuentas se imputan las facturas, los
            recibos y los movimientos.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportar} disabled={!visibles.length}>
              Exportar
            </Button>
            <input
              ref={archivo}
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importar(f)
              }}
            />
            <Button onClick={() => archivo.current?.click()} disabled={importando}>
              {importando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Cargar Excel
            </Button>
          </div>
        </div>

        {resultado && <ResumenImportacion r={resultado} onCerrar={() => setResultado(null)} />}

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código o nombre…"
              className="pl-9"
              aria-label="Buscar una cuenta"
            />
          </div>
          <div className="flex gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                onClick={() => setFiltro(f.valor)}
                aria-pressed={filtro === f.valor}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  filtro === f.valor
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                )}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          <p className="num text-[12px] text-ink-muted">
            {visibles.length} de {cuentas.length}
          </p>
        </div>

        {cargando ? (
          <LoadingState label="Cargando el plan de cuentas…" />
        ) : error ? (
          <ErrorState message={error} onRetry={cargar} />
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Ninguna cuenta coincide"
            description="Probá con el código o con una palabra del nombre."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Rubro</TableHead>
                <TableHead>Características</TableHead>
                <TableHead className="w-[140px] text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((c) => (
                <TableRow key={c.id} className={cn(!c.activo && "opacity-60")}>
                  <TableCell className="num font-mono text-[12px] font-semibold text-brand-600">
                    {c.codigo}
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink">{c.nombre}</TableCell>
                  <TableCell>
                    <Badge tone="neutral" size="sm">
                      {TIPO_CUENTA_LABEL[c.tipo]}
                    </Badge>
                  </TableCell>
                  {/* Las banderas del Excel, dichas en castellano. Son lo que
                      hace que el motor de asientos sepa qué hacer con la cuenta:
                      cuál lleva submayor, cuál va al libro de IVA, cuál se puede
                      elegir como medio de pago en un recibo. */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.llevaSubcuenta && (
                        <Badge tone="neutral" size="sm">
                          {c.tipoSubcuenta === "cliente"
                            ? "Submayor por cliente"
                            : c.tipoSubcuenta === "proveedor"
                              ? "Submayor por proveedor"
                              : "Con submayor"}
                        </Badge>
                      )}
                      {c.esBanco && (
                        <Badge tone="brand" size="sm">
                          Bancaria
                        </Badge>
                      )}
                      {c.esValores && (
                        <Badge tone="neutral" size="sm">
                          Cheques
                        </Badge>
                      )}
                      {c.libroIva && (
                        <Badge tone="warning" size="sm">
                          Libro IVA {c.libroIva}
                        </Badge>
                      )}
                      {c.esMedioPago && (
                        <Badge tone="success" size="sm">
                          Medio de pago
                        </Badge>
                      )}
                      {c.monedaExtranjera && (
                        <Badge tone="neutral" size="sm">
                          Moneda extranjera
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={tocando === c.id}
                      onClick={() => alternar(c)}
                      title={
                        c.activo
                          ? "Dejar de ofrecerla al imputar. Lo ya imputado no se toca."
                          : "Volver a ofrecerla al imputar"
                      }
                    >
                      {c.activo ? "En uso" : "Dada de baja"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

const RUBRO_A_SIGLA: Record<CuentaContable["tipo"], string> = {
  activo: "ACT",
  pasivo: "PAS",
  patrimonio: "PAT",
  ingreso: "GAN",
  egreso: "PER",
}

/**
 * Qué pasó al subir el archivo.
 *
 * Las **ausentes** son la parte que importa y la razón por la que esto es un
 * panel y no un toast: son cuentas que están en el sistema y ya no están en el
 * Excel del contador. El importador no las tocó a propósito —borrarlas dejaría
 * sin imputación todo lo cargado contra ellas—, así que alguien tiene que mirar
 * la lista y decidir. Casi siempre la respuesta es "darlas de baja", y el botón
 * de la fila lo hace.
 */
function ResumenImportacion({
  r,
  onCerrar,
}: {
  r: ResultadoImportacion
  onCerrar: () => void
}) {
  return (
    <div className="border-b border-line bg-brand-50/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[12.5px] font-semibold text-ink">
            {r.altas} nuevas · {r.cambios} actualizadas · {r.sinCambios} sin cambios
          </p>
          {r.ausentes.length > 0 && (
            <p className="text-[11.5px] text-ink-secondary">
              {r.ausentes.length}{" "}
              {r.ausentes.length === 1
                ? "cuenta está en el sistema y no en el archivo"
                : "cuentas están en el sistema y no en el archivo"}
              . No se tocaron, porque borrarlas dejaría sin imputar lo que ya está cargado contra
              ellas. Si ya no se usan, dales de baja acá:{" "}
              <span className="num">
                {r.ausentes
                  .slice(0, 12)
                  .map((c) => c.codigo)
                  .join(", ")}
                {r.ausentes.length > 12 && ` y ${r.ausentes.length - 12} más`}
              </span>
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
