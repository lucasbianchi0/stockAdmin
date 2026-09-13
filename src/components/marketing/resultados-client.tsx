"use client"

import { useCallback, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { ResultadosCampanas } from "@/components/marketing/resultados-campanas"
import { ResultadosLeads } from "@/components/marketing/resultados-leads"
import { ResultadosPaginas } from "@/components/marketing/resultados-paginas"
import { ResultadosResumen } from "@/components/marketing/resultados-resumen"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  PERIODOS,
  PERIODO_LABEL,
  type Lead,
  type Periodo,
  type Resultados,
} from "@/lib/marketing/resultados"
import { cn } from "@/lib/utils"

const URL = "/api/marketing/resultados"

/**
 * El panel entero: un período, cuatro vistas del mismo período.
 *
 * ── POR QUE UN SOLO PEDIDO PARA LAS CUATRO PESTAÑAS ──
 *
 * Porque tienen que hablar del mismo instante. Con un pedido por pestaña, un
 * lead que entra entre uno y otro hace que el total del embudo no coincida con
 * la lista de la bandeja, y nadie va a sospechar de una carrera: van a sospechar
 * de la aritmética. Encima, cambiar de pestaña sería una espera cada vez por
 * datos que ya estaban.
 *
 * El costo es una primera carga un poco más larga. Vale: se abre una vez y se
 * mira un rato.
 */
export function ResultadosClient() {
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState<Periodo>("30d")

  const url = `${URL}?periodo=${periodo}`
  const query = useQuery({
    queryKey: claveDe("marketing", url),
    queryFn: ({ signal }) => pedirJson<Resultados>(url, { signal }),
    // Los datos se mueven despacio —Google reescribe las cifras por días— y el
    // embudo de un mes no cambia porque uno vuelva a la pestaña.
    staleTime: 60_000,
  })

  /** Retoca un lead en la caché para que el cambio se vea sin esperar al refetch. */
  const alCambiar = useCallback(
    (id: string, cambio: Partial<Lead>) => {
      qc.setQueryData<Resultados>(claveDe("marketing", url), (prev) =>
        prev
          ? { ...prev, leads: prev.leads.map((l) => (l.id === id ? { ...l, ...cambio } : l)) }
          : prev
      )
    },
    [qc, url]
  )

  const datos = query.data

  return (
    <div className="flex flex-col gap-4">
      {/* ── Período ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-[3px]"
          role="group"
          aria-label="Período"
        >
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              aria-pressed={periodo === p}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                periodo === p
                  ? "bg-surface font-semibold text-ink shadow-e1"
                  : "text-ink-muted hover:text-ink-secondary"
              )}
            >
              {PERIODO_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {datos && (
            <span className="num text-[11.5px] text-ink-subtle">
              {datos.sitio.desde} → {datos.sitio.hasta}
            </span>
          )}
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] font-medium text-ink-secondary shadow-e1 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </div>

      {query.isPending && <LoadingState label="Juntando campañas, visitas y consultas…" />}

      {query.isError && (
        <ErrorState
          message={mensajeError(query.error, "No se pudieron cargar los resultados")}
          onRetry={() => void query.refetch()}
        />
      )}

      {datos && (
        <Tabs defaultValue="resumen" className="flex flex-col gap-4">
          <TabsList className="self-start">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="campanas">
              Campañas
              <span className="num text-ink-faint">{datos.ads.campanas.length}</span>
            </TabsTrigger>
            <TabsTrigger value="paginas">
              Páginas
              <span className="num text-ink-faint">{datos.sitio.paginas.length}</span>
            </TabsTrigger>
            <TabsTrigger value="leads">
              Leads
              <span className="num text-ink-faint">{datos.leads.filter((l) => !l.equipo).length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-0">
            <ResultadosResumen datos={datos} />
          </TabsContent>
          <TabsContent value="campanas" className="mt-0">
            <ResultadosCampanas datos={datos} />
          </TabsContent>
          <TabsContent value="paginas" className="mt-0">
            <ResultadosPaginas datos={datos} />
          </TabsContent>
          <TabsContent value="leads" className="mt-0">
            <ResultadosLeads datos={datos} alCambiar={alCambiar} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
