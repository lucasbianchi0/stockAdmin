"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarDays, ImageIcon, Images, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PiezaBancoDialog } from "@/components/contenido/pieza-banco-dialog"
import {
  BANCO_LABEL,
  BANCO_NOTA,
  CANALES_BANCO,
  PIEZAS_POR_LOTE,
  piezaCompleta,
  type PiezaBanco,
} from "@/lib/banco-context"
import { producirPieza, type PasoPieza } from "@/lib/banco-cliente"
import { OBJETIVO_LABEL, type Canal } from "@/lib/calendario-context"
import { cn } from "@/lib/utils"

/**
 * El banco de imágenes: se genera un lote, se revisa y se programa.
 *
 * Una pestaña por canal, y son bancos INDEPENDIENTES: el copy de LinkedIn son
 * doscientas palabras argumentadas y el de Instagram son sesenta que frenan el
 * scroll. Mezclarlos en una sola lista obligaría a mirar la etiqueta del canal
 * en cada tarjeta para saber si lo que se está leyendo aplica.
 *
 * El lote se produce EN SERIE, de a una pieza, y cada tarjeta se actualiza
 * cuando termina la suya. En paralelo sería más rápido y sería peor por dos
 * motivos: ocho generaciones de fondo simultáneas se comen el rate limit del
 * generador, y en pantalla no pasaría nada durante tres minutos hasta que
 * aparezcan las ocho de golpe.
 */
export function BancoClient() {
  const [canal, setCanal] = useState<Canal>("linkedin")

  return (
    <Tabs value={canal} onValueChange={(v) => setCanal(v as Canal)}>
      <TabsList>
        {CANALES_BANCO.map((c) => (
          <TabsTrigger key={c} value={c}>
            {BANCO_LABEL[c]}
          </TabsTrigger>
        ))}
      </TabsList>

      {CANALES_BANCO.map((c) => (
        <TabsContent key={c} value={c} className="mt-4">
          {/* Montado sólo cuando está activo: cada banco pide sus piezas al
              abrirse, y precargar los dos serían dos consultas para una que se
              va a mirar. */}
          {canal === c && <BancoDeCanal canal={c} />}
        </TabsContent>
      ))}
    </Tabs>
  )
}

/** En qué anda el lote. Null cuando no está corriendo. */
type Progreso = { hechos: number; total: number; piezaId: string | null; paso: PasoPieza }

function BancoDeCanal({ canal }: { canal: Canal }) {
  const [piezas, setPiezas] = useState<PiezaBanco[]>([])
  const [cargando, setCargando] = useState(true)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setCargando(true)

    fetch(`/api/contenido/banco?canal=${canal}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar el banco")
        return d
      })
      .then((d) => vigente && setPiezas((d.piezas ?? []) as PiezaBanco[]))
      .catch((e: Error) => vigente && toast.error(e.message))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [canal])

  const aplicar = useCallback((p: PiezaBanco) => {
    setPiezas((prev) => prev.map((x) => (x.id === p.id ? p : x)))
  }, [])

  const sacar = useCallback((id: string) => {
    setPiezas((prev) => prev.filter((x) => x.id !== id))
  }, [])

  /**
   * Produce las piezas que les falte algo, de a una.
   *
   * Se usa igual para un lote recién generado y para reintentar lo que quedó a
   * medias: la condición es "le falta copy o imagen", no "es nueva". Sin eso,
   * una pieza que falló por un timeout no tendría cómo terminarse salvo
   * generando otro lote entero.
   */
  const producir = useCallback(
    async (pendientes: PiezaBanco[]) => {
      if (pendientes.length === 0) return
      let fallaron = 0

      for (const [i, pieza] of pendientes.entries()) {
        setProgreso({ hechos: i, total: pendientes.length, piezaId: pieza.id, paso: "texto" })
        try {
          const lista = await producirPieza(pieza, (paso) =>
            setProgreso({ hechos: i, total: pendientes.length, piezaId: pieza.id, paso })
          )
          aplicar(lista)
        } catch {
          fallaron++
        }
      }

      setProgreso(null)
      if (fallaron > 0) {
        toast.warning(
          `${fallaron} de ${pendientes.length} quedaron a medias. "Completar las que faltan" las reintenta.`
        )
      }
    },
    [aplicar]
  )

  const generarLote = useCallback(async () => {
    setProgreso({ hechos: 0, total: PIEZAS_POR_LOTE, piezaId: null, paso: "texto" })
    try {
      const res = await fetch("/api/contenido/banco/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const nuevas = (data.piezas ?? []) as PiezaBanco[]
      // Las ideas se muestran ANTES de tener copy e imagen: el lote tarda varios
      // minutos y ver los ocho títulos aparecer es lo que dice que arrancó.
      setPiezas((prev) => [...prev, ...nuevas])
      await producir(nuevas)
    } catch (e) {
      setProgreso(null)
      toast.error(e instanceof Error ? e.message : "No se pudo generar el lote")
    }
  }, [canal, producir])

  const incompletas = piezas.filter((p) => !piezaCompleta(p))
  const pieza = piezas.find((p) => p.id === abierta) ?? null
  const trabajando = progreso !== null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-e1">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">Banco de {BANCO_LABEL[canal]}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">{BANCO_NOTA[canal]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {incompletas.length > 0 && !trabajando && (
            <Button variant="outline" size="sm" onClick={() => producir(incompletas)}>
              <ImageIcon />
              Completar las {incompletas.length} que faltan
            </Button>
          )}

          <Button onClick={generarLote} disabled={trabajando}>
            {trabajando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {trabajando
              ? `${progreso.paso === "imagen" ? "Imagen" : "Texto"} ${Math.min(progreso.hechos + 1, progreso.total)}/${progreso.total}…`
              : `Generar lote de ${PIEZAS_POR_LOTE}`}
          </Button>
        </div>
      </div>

      {cargando ? (
        <LoadingState label="Cargando el banco…" />
      ) : piezas.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Images}
            title="El banco está vacío"
            description={`Generá un lote de ${PIEZAS_POR_LOTE} piezas: cada una sale con su imagen y su copy listos para revisar.`}
            action={
              <Button onClick={generarLote} disabled={trabajando}>
                <Sparkles />
                Generar lote de {PIEZAS_POR_LOTE}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {piezas.map((p) => (
            <TarjetaPieza
              key={p.id}
              pieza={p}
              paso={progreso?.piezaId === p.id ? progreso.paso : null}
              onAbrir={() => setAbierta(p.id)}
            />
          ))}
        </div>
      )}

      <PiezaBancoDialog
        pieza={pieza}
        onCerrar={() => setAbierta(null)}
        onGuardada={aplicar}
        onDescartada={sacar}
        onProgramada={(p) => {
          // Programada = se fue del banco. Desaparece de acá y aparece en la
          // agenda: es la misma fila, no una copia.
          sacar(p.id)
          toast.message("La pieza está en el calendario", {
            action: { label: "Ver", onClick: () => window.location.assign("/contenido/agenda") },
          })
        }}
      />
    </div>
  )
}

function TarjetaPieza({
  pieza,
  paso,
  onAbrir,
}: {
  pieza: PiezaBanco
  /** El paso en curso, si es la que se está produciendo ahora. */
  paso: PasoPieza | null
  onAbrir: () => void
}) {
  const completa = piezaCompleta(pieza)

  return (
    <button
      onClick={onAbrir}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left shadow-e1",
        "transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-e2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      )}
    >
      <div className="relative aspect-square w-full bg-surface-muted">
        {pieza.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- firma temporal de Supabase
          <img
            src={pieza.imagenUrl}
            alt={pieza.idea.titulo}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            {paso ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                <p className="text-[11.5px] font-medium text-ink-muted">
                  {paso === "imagen" ? "Componiendo la imagen…" : "Escribiendo el copy…"}
                </p>
              </>
            ) : (
              <>
                <ImageIcon className="h-5 w-5 text-ink-faint" strokeWidth={1.8} />
                <p className="text-[11.5px] text-ink-faint">Sin imagen todavía</p>
              </>
            )}
          </div>
        )}

        {!completa && pieza.imagenUrl && (
          <span className="absolute right-2 top-2">
            <Badge tone="warning" size="sm">
              Falta el copy
            </Badge>
          </span>
        )}
      </div>

      <div className="flex-1 space-y-1.5 p-3.5">
        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink">
          {pieza.idea.titulo}
        </p>
        <p className="line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">
          {pieza.idea.headline}
        </p>
        <div className="pt-0.5">
          <Badge size="sm">{OBJETIVO_LABEL[pieza.idea.objetivo]}</Badge>
        </div>
      </div>
    </button>
  )
}

/** El atajo a la agenda. Vive acá para poder usarse desde la cabecera de la página. */
export function EnlaceAgenda() {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href="/contenido/agenda">
        <CalendarDays />
        Calendario de contenido
      </Link>
    </Button>
  )
}
