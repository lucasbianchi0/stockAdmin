"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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

/** En qué anda el lote de un canal. Null cuando ese banco no está trabajando. */
type Progreso = { hechos: number; total: number; piezaId: string | null; paso: PasoPieza }

type EstadoCanal = {
  piezas: PiezaBanco[]
  /** Si ya se pidió el banco de este canal. Se pide una vez y queda. */
  cargado: boolean
  progreso: Progreso | null
}

const VACIO: EstadoCanal = { piezas: [], cargado: false, progreso: null }

/**
 * El banco de imágenes: se genera un lote, se revisa y se programa.
 *
 * Una pestaña por canal, y son bancos INDEPENDIENTES: el copy de LinkedIn son
 * doscientas palabras argumentadas y el de Instagram son sesenta que frenan el
 * scroll. Mezclarlos en una sola lista obligaría a mirar la etiqueta del canal
 * en cada tarjeta para saber si lo que se está leyendo aplica.
 *
 * EL ESTADO DE LOS DOS CANALES VIVE ACÁ, arriba de las pestañas, y es la
 * corrección de un defecto que hacía inutilizable la pantalla. Antes cada
 * pestaña montaba su propio componente con su propio estado, y Radix DESMONTA la
 * pestaña que no está activa: cambiar de pestaña mataba el componente, el bucle
 * de producción seguía corriendo huérfano escribiendo en un estado que ya no
 * existía, y al volver la grilla mostraba las ocho piezas "sin imagen todavía"
 * como si nunca hubiera pasado nada. Un lote son doce piezas por unos cuarenta y
 * cinco segundos cada una: nueve minutos mirando la misma pantalla sin tocar
 * nada es un requisito que ningún usuario puede cumplir.
 *
 * Ahora el trabajo es de la página y no de la pestaña. Se puede cambiar de tab,
 * abrir una pieza y editarla mientras el resto se genera, y el progreso sigue
 * ahí al volver.
 */
export function BancoClient() {
  const [canal, setCanal] = useState<Canal>("linkedin")
  const [estado, setEstado] = useState<Record<Canal, EstadoCanal>>({
    linkedin: VACIO,
    meta: VACIO,
  })

  /**
   * Los canales con un lote corriendo AHORA.
   *
   * En un ref y no en el estado porque se lee dentro del bucle para decidir si
   * arrancar: leerlo del estado daría el valor del render en el que se creó la
   * función, y dos clicks seguidos lanzarían dos bucles sobre las mismas piezas
   * —el doble de generaciones pagadas para el mismo resultado—.
   */
  const enCurso = useRef<Set<Canal>>(new Set())

  const parche = useCallback((c: Canal, cambio: Partial<EstadoCanal>) => {
    setEstado((prev) => ({ ...prev, [c]: { ...prev[c], ...cambio } }))
  }, [])

  const aplicar = useCallback((c: Canal, p: PiezaBanco) => {
    setEstado((prev) => ({
      ...prev,
      [c]: { ...prev[c], piezas: prev[c].piezas.map((x) => (x.id === p.id ? p : x)) },
    }))
  }, [])

  const sacar = useCallback((c: Canal, id: string) => {
    setEstado((prev) => ({
      ...prev,
      [c]: { ...prev[c], piezas: prev[c].piezas.filter((x) => x.id !== id) },
    }))
  }, [])

  /**
   * El banco de la pestaña que se abre, una sola vez.
   *
   * El "ya lo pedí" va en un ref y no se mira en el estado, aunque el estado
   * tenga el dato. El efecto depende de `estado` —lo necesita para saber si
   * cargar— y `estado` cambia en cada avance del lote: mirando `cargado` desde
   * ahí, cada paso de una pieza volvería a entrar acá y, mientras la primera
   * respuesta no hubiera llegado, dispararía otro fetch. Un bucle de pedidos
   * durante los nueve minutos que dura el lote.
   *
   * Los dos bancos no se precargan: son dos consultas para una que se va a mirar.
   */
  const pedidos = useRef<Set<Canal>>(new Set())

  useEffect(() => {
    if (pedidos.current.has(canal)) return
    pedidos.current.add(canal)
    let vigente = true

    fetch(`/api/contenido/banco?canal=${canal}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar el banco")
        return d
      })
      .then((d) => {
        if (vigente) parche(canal, { piezas: (d.piezas ?? []) as PiezaBanco[], cargado: true })
      })
      .catch((e: Error) => {
        if (vigente) {
          // Se saca del ref para que volver a la pestaña reintente: un banco que
          // falló una vez y queda vacío para siempre no tiene cómo recuperarse.
          pedidos.current.delete(canal)
          toast.error(e.message)
          parche(canal, { cargado: true })
        }
      })

    return () => {
      vigente = false
    }
  }, [canal, parche])

  /**
   * Avisa antes de cerrar la pestaña con un lote a medias.
   *
   * El trabajo vive en el navegador: recargar o cerrar lo corta donde esté. Lo
   * ya generado no se pierde —cada pieza se guarda en cuanto termina— pero la
   * que estaba en curso se cae, y sin este aviso eso pasa sin que nadie lo note.
   */
  useEffect(() => {
    const trabajando = CANALES_BANCO.some((c) => estado[c].progreso !== null)
    if (!trabajando) return

    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [estado])

  /**
   * Produce las piezas a las que les falte algo, de a una y en serie.
   *
   * En serie y no en paralelo: cada imagen es una generación pesada, y lanzar
   * ocho juntas es la forma más rápida de comerse el rate limit del generador y
   * perder las ocho.
   *
   * Sirve igual para un lote recién generado y para reintentar lo que quedó a
   * medias: la condición es "le falta copy o imagen", no "es nueva".
   */
  const producir = useCallback(
    async (c: Canal, pendientes: PiezaBanco[]) => {
      if (pendientes.length === 0 || enCurso.current.has(c)) return
      enCurso.current.add(c)

      const fallas: string[] = []

      try {
        for (const [i, pieza] of pendientes.entries()) {
          const avance = (paso: PasoPieza) =>
            parche(c, { progreso: { hechos: i, total: pendientes.length, piezaId: pieza.id, paso } })

          avance("texto")
          try {
            aplicar(c, await producirPieza(pieza, avance))
          } catch (e) {
            // El motivo se guarda y se muestra. Antes se contaban los fallos y
            // se tiraba el error, así que "3 quedaron a medias" no venía con
            // ninguna pista de por qué — ni en pantalla ni en la consola.
            const motivo = e instanceof Error ? e.message : "error desconocido"
            console.error(`[banco] "${pieza.idea.titulo}":`, e)
            fallas.push(motivo)
          }
        }
      } finally {
        enCurso.current.delete(c)
        parche(c, { progreso: null })
      }

      if (fallas.length > 0) {
        toast.warning(
          `${fallas.length} de ${pendientes.length} quedaron a medias: ${fallas[0]}. ` +
            `"Completar las que faltan" las reintenta.`
        )
      }
    },
    [aplicar, parche]
  )

  const generarLote = useCallback(
    async (c: Canal) => {
      if (enCurso.current.has(c)) return
      parche(c, { progreso: { hechos: 0, total: PIEZAS_POR_LOTE, piezaId: null, paso: "texto" } })

      let nuevas: PiezaBanco[]
      try {
        const res = await fetch("/api/contenido/banco/lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canal: c }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        nuevas = (data.piezas ?? []) as PiezaBanco[]
      } catch (e) {
        parche(c, { progreso: null })
        toast.error(e instanceof Error ? e.message : "No se pudo generar el lote")
        return
      }

      // Las ideas se muestran ANTES de tener copy e imagen: el lote tarda varios
      // minutos y ver los ocho títulos aparecer es lo que dice que arrancó.
      setEstado((prev) => ({ ...prev, [c]: { ...prev[c], piezas: [...prev[c].piezas, ...nuevas] } }))
      await producir(c, nuevas)
    },
    [parche, producir]
  )

  return (
    <Tabs value={canal} onValueChange={(v) => setCanal(v as Canal)}>
      <TabsList>
        {CANALES_BANCO.map((c) => (
          <TabsTrigger key={c} value={c}>
            {BANCO_LABEL[c]}
            {/* El spinner en la pestaña que NO se está mirando: es lo que dice
                que el otro banco sigue trabajando. Sin esto, cambiar de tab se
                lee como que la generación se canceló. */}
            {estado[c].progreso && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
          </TabsTrigger>
        ))}
      </TabsList>

      {CANALES_BANCO.map((c) => (
        <TabsContent key={c} value={c} className="mt-4">
          <BancoDeCanal
            canal={c}
            estado={estado[c]}
            onGenerarLote={() => generarLote(c)}
            onCompletar={(pendientes) => producir(c, pendientes)}
            onAplicar={(p) => aplicar(c, p)}
            onSacar={(id) => sacar(c, id)}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

/**
 * Un banco, dibujado. No tiene estado propio salvo qué pieza está abierta.
 *
 * Que sea así es el punto: lo único que se pierde al cambiar de pestaña es qué
 * tarjeta estaba abierta, y eso es exactamente lo que tiene que perderse.
 */
function BancoDeCanal({
  canal,
  estado,
  onGenerarLote,
  onCompletar,
  onAplicar,
  onSacar,
}: {
  canal: Canal
  estado: EstadoCanal
  onGenerarLote: () => void
  onCompletar: (pendientes: PiezaBanco[]) => void
  onAplicar: (p: PiezaBanco) => void
  onSacar: (id: string) => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)

  const { piezas, cargado, progreso } = estado
  const incompletas = piezas.filter((p) => !piezaCompleta(p))
  const pieza = piezas.find((p) => p.id === abierta) ?? null
  const trabajando = progreso !== null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-e1">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">Banco de {BANCO_LABEL[canal]}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {trabajando
              ? "Podés cambiar de pestaña o abrir una pieza: la generación sigue."
              : BANCO_NOTA[canal]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {incompletas.length > 0 && !trabajando && (
            <Button variant="outline" size="sm" onClick={() => onCompletar(incompletas)}>
              <ImageIcon />
              Completar las {incompletas.length} que faltan
            </Button>
          )}

          <Button onClick={onGenerarLote} disabled={trabajando}>
            {trabajando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {trabajando
              ? `${progreso.paso === "imagen" ? "Imagen" : "Texto"} ${Math.min(progreso.hechos + 1, progreso.total)}/${progreso.total}…`
              : `Generar lote de ${PIEZAS_POR_LOTE}`}
          </Button>
        </div>
      </div>

      {!cargado ? (
        <LoadingState label="Cargando el banco…" />
      ) : piezas.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Images}
            title="El banco está vacío"
            description={`Generá un lote de ${PIEZAS_POR_LOTE} piezas: cada una sale con su imagen y su copy listos para revisar.`}
            action={
              <Button onClick={onGenerarLote} disabled={trabajando}>
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
        onGuardada={onAplicar}
        onDescartada={onSacar}
        onProgramada={(p) => {
          // Programada = se fue del banco. Desaparece de acá y aparece en la
          // agenda: es la misma fila, no una copia.
          onSacar(p.id)
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
