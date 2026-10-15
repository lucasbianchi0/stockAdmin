"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  FolderPlus,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Download,
  Layers,
  Loader2,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/ui/avatar"
import { BarraCarga } from "@/components/ui/barra-carga"
import { BarraTabla } from "@/components/ui/barra-tabla"
import { Button } from "@/components/ui/button"
import { ConfirmarDialog } from "@/components/ui/confirmar-dialog"
import { FiltroPill } from "@/components/ui/filtro-pill"
import { Menu, MenuItem, MenuRotulo, MenuSeparador } from "@/components/ui/menu"
import { PageBody, PageHeader } from "@/components/ui/page-header"
import { PaginacionTabla } from "@/components/ui/paginacion-tabla"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { ThOrden, type Orden } from "@/components/ui/th-orden"
import { Vistas } from "@/components/ui/vistas"
import { EmpresaPanel } from "@/components/contactos/empresa-panel"
import { CampanaDialog, type DestinoCampana } from "@/components/contactos/campana-dialog"
import { EscribirDialog, type PersonaParaEscribir } from "@/components/contactos/escribir-dialog"
import { EscribirVariosDialog, type Destinatario } from "@/components/contactos/escribir-varios-dialog"
import { ProyectoDialog, type BaseProyecto } from "@/components/comercial/proyecto-dialog"
import { ContactoPanel } from "@/components/marketing/contacto-panel"
import { EnviarCrmDialog, type EnvioCrm } from "@/components/marketing/enviar-crm-dialog"
import { FranjaGrupo, LoteDialog, type ModoLote } from "@/components/marketing/contactos-lote"
import { ImportarContactosDialog } from "@/components/marketing/importar-contactos-dialog"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import { descargarCsv } from "@/lib/admin/csv"
import { ESTADO_CRM_ESTILO, ESTADO_CRM_LABEL, esEstadoCrm } from "@/lib/comercial/crm"
import {
  nombreCompleto,
  type Contacto,
  type Grupo,
  type RespuestaContactos,
  type ResumenContactos,
} from "@/lib/marketing/contactos"
import type { Usuario, Yo } from "@/lib/tickets"
import { useRetardado } from "@/lib/use-presencia"
import { cn } from "@/lib/utils"

/**
 * Marketing → Contactos: la base de personas de las empresas con las que
 * hablamos.
 *
 * Se carga a mano o con una planilla. Las pestañas la cortan (todos, los que
 * no tienen AM, los que nadie sigue todavía), los filtros la afinan, los
 * encabezados la ordenan. Lo
 * elegido —unas filas o todos los que coinciden con el filtro— se manda a un
 * CRM, se le cambia el AM o la vertical, se exporta o se junta en un grupo.
 *
 * Los grupos son la base de las campañas: una campaña va a tomar un grupo como
 * destinatarios.
 */

const DEBOUNCE_MS = 300

type Vista = "todos" | "sin_am" | "libre"
type Filtros = { am: string; empresa: string; vertical: string; departamento: string; grupo: string }
const SIN_FILTROS: Filtros = { am: "", empresa: "", vertical: "", departamento: "", grupo: "" }
type Campo = "empresa" | "nombre" | "apellido" | "cargo" | "departamento" | "vertical" | "email"

const num = (n: number) => n.toLocaleString("es-AR")
const plural = (n: number, uno: string, varios: string) => `${num(n)} ${n === 1 ? uno : varios}`

/** Las consultas de esta pantalla, para la caché de TanStack. */
const URL_LISTA = "/api/marketing/contactos?"
const URL_RESUMEN = "/api/marketing/contactos/resumen"
const URL_GRUPOS = "/api/marketing/contactos/grupos"
const esLista = (k: readonly unknown[]) =>
  k[0] === "marketing" && typeof k[2] === "string" && k[2].startsWith(URL_LISTA)

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

export function ContactosClient() {
  const qc = useQueryClient()
  const router = useRouter()

  /* ── Vista, búsqueda, filtros, orden y página ─────────────────────────── */

  // `?q=` llega desde el CRM ("Ver en Contactos").
  const qInicial = useSearchParams().get("q") ?? ""
  const [busqueda, setBusqueda] = useState(qInicial)
  const [q, setQ] = useState(qInicial)
  const [vista, setVista] = useState<Vista>("todos")
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [orden, setOrden] = useState<Orden<Campo>>(null)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)

  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [busqueda])

  const equipoQ = useQuery({
    queryKey: claveDe("marketing", "/api/equipo"),
    queryFn: ({ signal }) => pedirJson<{ usuarios: Usuario[]; yo: Yo }>("/api/equipo", { signal }),
    staleTime: 5 * 60_000,
  })
  const equipo = equipoQ.data?.usuarios ?? []
  const yo = equipoQ.data?.yo ?? null

  /** El filtro tal como lo entiende el servidor, sin página ni orden: es lo que
   *  se manda para "todos los que coinciden". */
  const filtroDe = (v: Vista = vista) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    for (const [k, val] of Object.entries(filtros)) if (val) params.set(k, val)
    if (v === "libre") params.set("estado", "libre")
    // "Sin AM" manda sobre el filtro de AM, que en esa pestaña no se muestra.
    if (v === "sin_am") params.set("am", "sin")
    return params
  }
  const filtroActual = filtroDe().toString()

  // Cambiar un criterio vuelve a la página 1 y suelta "todos los que
  // coinciden" (durante el render, para no pedir la página vieja con el
  // filtro nuevo).
  const criterio = JSON.stringify([filtroActual, orden, porPagina])
  const [criterioPrevio, setCriterioPrevio] = useState(criterio)
  const [todosLosQueCoinciden, setTodosLosQueCoinciden] = useState(false)
  if (criterio !== criterioPrevio) {
    setCriterioPrevio(criterio)
    setPagina(1)
    setTodosLosQueCoinciden(false)
  }

  const urlDe = (p: number, v: Vista = vista) => {
    const params = filtroDe(v)
    params.set("pagina", String(p))
    params.set("porPagina", String(porPagina))
    if (orden) {
      params.set("orden", orden.campo)
      params.set("dir", orden.dir)
    }
    return `${URL_LISTA}${params}`
  }
  const url = urlDe(pagina)
  const consulta = (u: string) => ({
    queryKey: claveDe("marketing", u),
    queryFn: ({ signal }: { signal: AbortSignal }) => pedirJson<RespuestaContactos>(u, { signal }),
    // Una página ya vista se muestra al instante al volver; pasado un minuto
    // se refresca por detrás, sin vaciar la tabla.
    staleTime: 60_000,
  })

  const lista = useQuery({ ...consulta(url), placeholderData: keepPreviousData })

  // Lo que no cambia al buscar ni al paginar, en su propia entrada de caché.
  const resumenQ = useQuery({
    queryKey: claveDe("marketing", URL_RESUMEN),
    queryFn: ({ signal }) => pedirJson<ResumenContactos>(URL_RESUMEN, { signal }),
    staleTime: 5 * 60_000,
  })
  const gruposQ = useQuery({
    queryKey: claveDe("marketing", URL_GRUPOS),
    queryFn: ({ signal }) => pedirJson<{ grupos: Grupo[] }>(URL_GRUPOS, { signal }),
    staleTime: 5 * 60_000,
  })
  const grupos = gruposQ.data?.grupos ?? []
  const grupoActivo = grupos.find((g) => g.id === filtros.grupo) ?? null

  const cargandoLento = useRetardado(lista.isFetching && !lista.isPending)
  const datos = lista.data
  const filas = datos?.contactos ?? []
  const total = datos?.total ?? 0
  const kpis = resumenQ.data?.kpis
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const opciones = resumenQ.data?.opciones ?? { empresas: [], verticales: [], departamentos: [] }
  const hayFiltros = q !== "" || Object.values(filtros).some(Boolean)

  // La página siguiente se pide apenas se ve esta, y la otra pestaña también:
  // pasar de página o de vista es al instante.
  const precargar = (p: number) => {
    if (p < 1 || p > totalPaginas) return
    void qc.prefetchQuery(consulta(urlDe(p)))
  }
  useEffect(() => {
    if (!datos) return
    if (pagina < totalPaginas) void qc.prefetchQuery(consulta(urlDe(pagina + 1)))
    for (const otra of ["todos", "sin_am", "libre"] as const) {
      if (otra !== vista) void qc.prefetchQuery(consulta(urlDe(1, otra)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, pagina, totalPaginas])

  /* ── La caché después de escribir ──────────────────────────────────────── */

  /** Algo cambió de forma (alta, baja, CRM, grupos): se vuelve a pedir lo que
   *  está a la vista; lo demás queda marcado y se pide cuando se use. */
  const refrescar = async () => {
    await Promise.all([
      qc.invalidateQueries({ predicate: (qq) => esLista(qq.queryKey) }),
      qc.invalidateQueries({ queryKey: claveDe("marketing", URL_RESUMEN) }),
      qc.invalidateQueries({ queryKey: claveDe("marketing", URL_GRUPOS) }),
    ])
  }

  /** Una edición: la fila se reemplaza en todas las páginas guardadas, sin
   *  pedir nada. Solo el resumen (empresas, opciones) se marca viejo. */
  const reemplazar = (c: Contacto) => {
    qc.setQueriesData<RespuestaContactos>({ predicate: (qq) => esLista(qq.queryKey) }, (viejo) =>
      viejo ? { ...viejo, contactos: viejo.contactos.map((x) => (x.id === c.id ? c : x)) } : viejo
    )
    void qc.invalidateQueries({ queryKey: claveDe("marketing", URL_RESUMEN), refetchType: "none" })
  }

  /* ── Selección ─────────────────────────────────────────────────────────── */

  // Por id y a través de las páginas, como en Inventario. O, con todos los de
  // la página elegidos, "todos los que coinciden" con el filtro: ahí lo que se
  // manda es el filtro, no los ids.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const idsPagina = filas.map((c) => c.id)
  const todosPagina = idsPagina.length > 0 && idsPagina.every((id) => seleccion.has(id))
  const algunosPagina = idsPagina.some((id) => seleccion.has(id))
  const cantidadElegida = todosLosQueCoinciden ? total : seleccion.size

  const limpiarSeleccion = () => {
    setSeleccion(new Set())
    setTodosLosQueCoinciden(false)
  }
  const alternar = (id: string) => {
    setTodosLosQueCoinciden(false)
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const alternarPagina = () => {
    setTodosLosQueCoinciden(false)
    setSeleccion((s) => {
      const n = new Set(s)
      idsPagina.forEach((id) => (todosPagina ? n.delete(id) : n.add(id)))
      return n
    })
  }
  /** A quién apunta una acción: los ids elegidos o el filtro entero. */
  const destino = () => (todosLosQueCoinciden ? { filtro: filtroActual } : { ids: [...seleccion] })

  /* ── Acciones ──────────────────────────────────────────────────────────── */

  /** Las personas elegidas, con sus datos: las de la página o, si se eligió
   *  todo el filtro o hay de otras páginas, pedidas al servidor. */
  async function personasElegidas(): Promise<Contacto[]> {
    const enPagina = filas.filter((c) => seleccion.has(c.id))
    if (!todosLosQueCoinciden && enPagina.length === seleccion.size) return enPagina
    const p = todosLosQueCoinciden ? filtroDe() : new URLSearchParams({ ids: [...seleccion].join(",") })
    p.set("porPagina", "2000")
    return (await pedirJson<RespuestaContactos>(`${URL_LISTA}${p}`)).contactos
  }

  const [panel, setPanel] = useState<{ abierto: boolean; contacto: Contacto | null }>({
    abierto: false,
    contacto: null,
  })
  const [importando, setImportando] = useState(false)
  const [aBorrar, setABorrar] = useState<Contacto[] | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  /** A qué CRM se está por mandar lo elegido: abre el diálogo del proyecto. */
  const [enviarA, setEnviarA] = useState<Usuario | null>(null)
  const [nuevoProyecto, setNuevoProyecto] = useState<BaseProyecto | null>(null)
  const [exportando, setExportando] = useState(false)
  const [lote, setLote] = useState<ModoLote | null>(null)
  const [escribirA, setEscribirA] = useState<PersonaParaEscribir | null>(null)
  const [empresa, setEmpresa] = useState<string | null>(null)
  const [grupoABorrar, setGrupoABorrar] = useState<Grupo | null>(null)
  const [escribirVarios, setEscribirVarios] = useState<Destinatario[] | null>(null)
  const [campana, setCampana] = useState<DestinoCampana | null>(null)

  /** "Enviar a mi CRM" (o al de otra persona): primero, el diálogo del proyecto. */
  function elegirCrm(owner: Usuario | null) {
    if (cantidadElegida === 0) return
    setEnviarA(owner ?? (yo?.id ? { id: yo.id, nombre: yo.nombre } : null))
  }

  async function enviarAlCrm(owner: Usuario, envio: EnvioCrm) {
    setEnviando(true)
    try {
      const d = destino()
      const r = await pedirJson<{ agregados: number; yaEstaban: number; conOtros: number; owner: Usuario }>(
        "/api/marketing/contactos/enviar-crm",
        json("POST", {
          contactoIds: d.ids,
          filtro: d.filtro,
          ownerId: owner.id,
          proyecto: envio.proyecto || null,
          estado: envio.estado,
          probabilidad: envio.probabilidad,
        })
      )
      const deQuien = r.owner.id === yo?.id ? "tu CRM" : `el CRM de ${r.owner.nombre.split(" ")[0]}`
      const que = envio.proyecto
        ? `“${envio.proyecto}” en ${deQuien}: ${plural(r.agregados, "proyecto nuevo", "proyectos nuevos")}`
        : r.agregados > 0
          ? `${plural(r.agregados, "persona enviada", "personas enviadas")} a ${deQuien}`
          : `Ya estaban todos en ${deQuien}`
      toast.success(que, {
        description: envio.proyecto
          ? r.conOtros > 0
            ? `${plural(r.conOtros, "ya tenía otros proyectos", "ya tenían otros proyectos")}: se sumó este aparte`
            : undefined
          : r.yaEstaban > 0 && r.agregados > 0
            ? `${r.yaEstaban} ya estaban y no se duplicaron. Para abrirles otro proyecto, ponele nombre.`
            : r.agregados === 0
              ? "Para abrirles otro proyecto, ponele nombre al enviar."
              : undefined,
        action: { label: "Ver CRM", onClick: () => router.push(`/comercial/crm?owner=${r.owner.id}`) },
      })
      setEnviarA(null)
      limpiarSeleccion()
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudieron enviar"))
    } finally {
      setEnviando(false)
    }
  }

  async function aplicarLote(valor: string | null | { grupoId?: string; nuevoNombre?: string }) {
    try {
      if (lote === "grupo") {
        const r = await pedirJson<{ agregados: number; total: number; creado: boolean; grupoId: string }>(
          URL_GRUPOS,
          json("POST", { ...destino(), ...(valor as object) })
        )
        const g = grupos.find((x) => x.id === r.grupoId)
        toast.success(
          r.creado
            ? `Grupo creado con ${plural(r.total, "persona", "personas")}`
            : `${plural(r.agregados, "persona agregada", "personas agregadas")} a ${g?.nombre ?? "el grupo"}`,
          { action: { label: "Ver grupo", onClick: () => setFiltros({ ...SIN_FILTROS, grupo: r.grupoId }) } }
        )
      } else {
        const r = await pedirJson<{ cambiados: number }>(
          "/api/marketing/contactos/lote",
          json("PATCH", { ...destino(), ...(lote === "am" ? { amId: valor } : { vertical: valor }) })
        )
        toast.success(`${plural(r.cambiados, "persona actualizada", "personas actualizadas")}`)
      }
      setLote(null)
      limpiarSeleccion()
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo aplicar"))
    }
  }

  async function quitarDelGrupo() {
    if (!grupoActivo) return
    try {
      const r = await pedirJson<{ quitados: number }>(
        `${URL_GRUPOS}/${grupoActivo.id}/miembros`,
        json("DELETE", destino())
      )
      toast.success(`${plural(r.quitados, "persona quitada", "personas quitadas")} de ${grupoActivo.nombre}`)
      limpiarSeleccion()
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo quitar"))
    }
  }

  async function borrar() {
    if (!aBorrar) return
    setBorrando(true)
    try {
      await pedirJson("/api/marketing/contactos", json("DELETE", { ids: aBorrar.map((c) => c.id) }))
      toast.success(aBorrar.length === 1 ? "Contacto borrado" : `${aBorrar.length} contactos borrados`)
      setSeleccion((s) => {
        const n = new Set(s)
        aBorrar.forEach((c) => n.delete(c.id))
        return n
      })
      setABorrar(null)
      setPanel({ abierto: false, contacto: null })
      await refrescar()
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar"))
    } finally {
      setBorrando(false)
    }
  }

  /** CSV de lo filtrado o, si hay algo elegido, de lo elegido. */
  async function exportar(soloSeleccion: boolean) {
    setExportando(true)
    try {
      const p = soloSeleccion && !todosLosQueCoinciden ? new URLSearchParams({ ids: [...seleccion].join(",") }) : filtroDe()
      p.set("porPagina", "5000")
      if (orden) {
        p.set("orden", orden.campo)
        p.set("dir", orden.dir)
      }
      const r = await pedirJson<RespuestaContactos>(`${URL_LISTA}${p}`)
      descargarCsv(
        `contactos${grupoActivo ? `-${grupoActivo.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`,
        ["AM", "Empresa", "Nombre", "Apellido", "Cargo", "Departamento", "Vertical", "Email", "Teléfono", "Observaciones", "En CRM de"],
        r.contactos.map((c) => [
          c.amNombre ?? "",
          c.empresa,
          c.nombre ?? "",
          c.apellido ?? "",
          c.cargo ?? "",
          c.departamento ?? "",
          c.vertical ?? "",
          c.email ?? "",
          c.telefono ?? "",
          c.observaciones ?? "",
          [...new Set(c.crm.map((x) => x.ownerNombre))].join(", "),
        ])
      )
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo exportar"))
    } finally {
      setExportando(false)
    }
  }

  async function renombrarGrupo(g: Grupo, nombre: string) {
    try {
      await pedirJson(`${URL_GRUPOS}/${g.id}`, json("PATCH", { nombre }))
      await qc.invalidateQueries({ queryKey: claveDe("marketing", URL_GRUPOS) })
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo renombrar"))
      throw e
    }
  }

  async function borrarGrupo() {
    if (!grupoABorrar) return
    try {
      await pedirJson(`${URL_GRUPOS}/${grupoABorrar.id}`, { method: "DELETE" })
      toast.success(`Grupo ${grupoABorrar.nombre} borrado`)
      setFiltros((f) => ({ ...f, grupo: "" }))
      setGrupoABorrar(null)
      await qc.invalidateQueries({ queryKey: claveDe("marketing", URL_GRUPOS) })
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo borrar el grupo"))
    }
  }

  const aOpciones = (vs: string[]) => vs.map((v) => ({ valor: v, etiqueta: v }))
  const opcionesAm = [
    ...equipo.map((u) => ({ valor: u.id, etiqueta: u.id === yo?.id ? `${u.nombre} (vos)` : u.nombre })),
    { valor: "sin", etiqueta: "Sin AM" },
  ]
  const th = (campo: Campo, rotulo: string) => (
    <ThOrden campo={campo} orden={orden} onOrdenar={setOrden}>
      {rotulo}
    </ThOrden>
  )

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>
      <PageHeader
        title="Contactos"
        actions={
          <>
            <Button variant="outline" onClick={() => setImportando(true)}>
              <Upload />
              <span className="hidden sm:inline">Importar</span>
            </Button>
            <Button onClick={() => setPanel({ abierto: true, contacto: null })}>
              <Plus />
              Nuevo contacto
            </Button>
          </>
        }
      />
      <PageBody className="pb-28">
        <Vistas
          activa={vista}
          onCambio={setVista}
          vistas={[
            { id: "todos", rotulo: "Todos", cantidad: datos?.conteos.todos },
            { id: "sin_am", rotulo: "Sin AM", cantidad: datos?.conteos.sinAm },
            { id: "libre", rotulo: "Sin seguimiento", cantidad: datos?.conteos.libres },
          ]}
          extra={
            kpis && (
              <>
                {plural(kpis.empresas, "empresa", "empresas")} · {plural(kpis.verticales, "vertical", "verticales")}
                {grupos.length > 0 && ` · ${plural(grupos.length, "grupo", "grupos")}`}
              </>
            )
          }
        />

        <div className="relative mt-4 overflow-hidden rounded-xl border border-line bg-surface">
          <BarraCarga activa={cargandoLento} />

          <BarraTabla
            seleccionados={cantidadElegida}
            rotuloSeleccion={(n) => plural(n, "seleccionado", "seleccionados")}
            onLimpiar={limpiarSeleccion}
            acciones={
              <>
                <div className="flex items-center">
                  <Button size="sm" className="rounded-r-none" onClick={() => elegirCrm(null)} disabled={enviando}>
                    {enviando && <Loader2 className="animate-spin" />}
                    Enviar a mi CRM
                  </Button>
                  <Menu
                    alinear="inicio"
                    disparador={(abrir) => (
                      <Button
                        size="sm"
                        className="rounded-l-none border-l border-white/20 px-2"
                        onClick={abrir}
                        disabled={enviando}
                        aria-label="Enviar al CRM de otra persona"
                      >
                        <ChevronDown />
                      </Button>
                    )}
                  >
                    {(cerrar) => (
                      <>
                        <MenuRotulo>Enviar al CRM de</MenuRotulo>
                        {equipo.map((u) => (
                          <MenuItem
                            key={u.id}
                            onClick={() => {
                              cerrar()
                              elegirCrm(u)
                            }}
                          >
                            <Avatar id={u.id} nombre={u.nombre} size="xs" />
                            <span className="flex-1 truncate">{u.nombre}</span>
                            {u.id === yo?.id && <span className="text-[11px] text-ink-faint">vos</span>}
                          </MenuItem>
                        ))}
                        <MenuSeparador />
                        <Link
                          href="/comercial/crm"
                          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Abrir el CRM
                        </Link>
                      </>
                    )}
                  </Menu>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      setEscribirVarios(await personasElegidas())
                    } catch (e) {
                      toast.error(mensajeError(e))
                    }
                  }}
                >
                  <MessageSquare />
                  <span className="hidden sm:inline">Escribir…</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const ps = await personasElegidas()
                      setCampana({
                        ...(todosLosQueCoinciden ? { filtro: filtroActual } : { ids: ps.map((c) => c.id) }),
                        cantidad: ps.length,
                        conMail: ps.filter((c) => c.email).length,
                        conTelefono: ps.filter((c) => c.telefono).length,
                      })
                    } catch (e) {
                      toast.error(mensajeError(e))
                    }
                  }}
                >
                  <Megaphone />
                  <span className="hidden sm:inline">Crear campaña…</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLote("grupo")}>
                  <Users />
                  <span className="hidden sm:inline">Agregar a grupo</span>
                </Button>
                <Menu
                  alinear="inicio"
                  disparador={(abrir) => (
                    <Button size="sm" variant="ghost" onClick={abrir}>
                      Más
                      <ChevronDown />
                    </Button>
                  )}
                >
                  {(cerrar) => (
                    <>
                      <MenuItem
                        onClick={() => {
                          cerrar()
                          setLote("am")
                        }}
                      >
                        <UserRound />
                        Asignar AM…
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          cerrar()
                          setLote("vertical")
                        }}
                      >
                        <Layers />
                        Cambiar vertical…
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          cerrar()
                          void exportar(true)
                        }}
                      >
                        <Download />
                        Exportar a CSV
                      </MenuItem>
                      {grupoActivo && (
                        <MenuItem
                          onClick={() => {
                            cerrar()
                            void quitarDelGrupo()
                          }}
                        >
                          <X />
                          Quitar de {grupoActivo.nombre}
                        </MenuItem>
                      )}
                      {!todosLosQueCoinciden && (
                        <>
                          <MenuSeparador />
                          <MenuItem
                            tono="danger"
                            onClick={() => {
                              cerrar()
                              setABorrar(filasSeleccionadas([...seleccion], filas))
                            }}
                          >
                            <Trash2 />
                            Borrar
                          </MenuItem>
                        </>
                      )}
                    </>
                  )}
                </Menu>
              </>
            }
          >
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                type="search"
                className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-7 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {vista !== "sin_am" && (
                <FiltroPill rotulo="AM" valor={filtros.am} onCambio={(v) => setFiltros((f) => ({ ...f, am: v }))} opciones={opcionesAm} />
              )}
              <FiltroPill
                rotulo="Empresa"
                valor={filtros.empresa}
                onCambio={(v) => setFiltros((f) => ({ ...f, empresa: v }))}
                opciones={aOpciones(opciones.empresas)}
              />
              <FiltroPill
                rotulo="Vertical"
                valor={filtros.vertical}
                onCambio={(v) => setFiltros((f) => ({ ...f, vertical: v }))}
                opciones={aOpciones(opciones.verticales)}
              />
              <FiltroPill
                rotulo="Departamento"
                valor={filtros.departamento}
                onCambio={(v) => setFiltros((f) => ({ ...f, departamento: v }))}
                opciones={aOpciones(opciones.departamentos)}
              />
              {grupos.length > 0 && (
                <FiltroPill
                  rotulo="Grupo"
                  valor={filtros.grupo}
                  onCambio={(v) => setFiltros((f) => ({ ...f, grupo: v }))}
                  opciones={grupos.map((g) => ({ valor: g.id, etiqueta: `${g.nombre} (${g.miembros})` }))}
                />
              )}
              {hayFiltros && (
                <button
                  onClick={() => {
                    setFiltros(SIN_FILTROS)
                    setBusqueda("")
                  }}
                  className="shrink-0 px-2 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <span className="num hidden pr-1 text-[12.5px] text-ink-muted sm:inline">
                {plural(total, "persona", "personas")}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void exportar(false)}
                disabled={exportando || total === 0}
                aria-label="Exportar a CSV"
                title="Exportar lo filtrado a CSV"
              >
                {exportando ? <Loader2 className="animate-spin" /> : <Download />}
              </Button>
            </div>
          </BarraTabla>

          {grupoActivo && (
            <FranjaGrupo
              key={grupoActivo.id}
              grupo={grupoActivo}
              onRenombrar={(n) => renombrarGrupo(grupoActivo, n)}
              onBorrar={() => setGrupoABorrar(grupoActivo)}
              onCrearCampana={() => setCampana({ grupoId: grupoActivo.id, cantidad: grupoActivo.miembros })}
            />
          )}

          {/* Con la página entera elegida, la opción de llevarla a todo el filtro. */}
          {todosPagina && total > filas.length && (
            <div className="border-b border-line bg-brand-50/40 px-4 py-2 text-center text-[12.5px] text-ink-secondary animate-in fade-in-0 duration-150">
              {todosLosQueCoinciden ? (
                <>
                  Están elegidas las <strong className="font-semibold text-ink">{num(total)}</strong> personas que
                  coinciden.{" "}
                  <button onClick={limpiarSeleccion} className="font-medium text-brand-700 hover:underline">
                    Limpiar la selección
                  </button>
                </>
              ) : (
                <>
                  Elegiste las {filas.length} de esta página.{" "}
                  <button onClick={() => setTodosLosQueCoinciden(true)} className="font-medium text-brand-700 hover:underline">
                    Elegir las {num(total)} que coinciden
                  </button>
                </>
              )}
            </div>
          )}

          {lista.isPending ? (
            <LoadingState label="Cargando contactos…" />
          ) : lista.isError ? (
            <ErrorState message={mensajeError(lista.error)} onRetry={() => void lista.refetch()} />
          ) : filas.length === 0 ? (
            <EmptyState
              icon={Search}
              title={hayFiltros || vista !== "todos" ? "No hay contactos acá" : "Todavía no hay contactos"}
              description={
                hayFiltros || vista !== "todos"
                  ? "Probá con otra búsqueda, otra vista o limpiá los filtros."
                  : "Cargá el primero a mano o importá la planilla que ya tienen."
              }
              action={
                hayFiltros || vista !== "todos" ? undefined : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setImportando(true)}>
                      <Upload />
                      Importar
                    </Button>
                    <Button onClick={() => setPanel({ abierto: true, contacto: null })}>
                      <Plus />
                      Nuevo contacto
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            <>
              {/* Las columnas del boceto, en su orden. Anchos fijos: en una
                  pantalla angosta la tabla se desplaza de costado en vez de
                  apretar las columnas hasta que no se lean. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-[13px]">
                  <colgroup>
                    <col className="w-[44px]" />
                    <col className="w-[48px]" />
                    <col className="w-[13%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[12%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[13%]" />
                    <col className="w-[128px]" />
                    <col />
                    <col className="w-[44px]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left [&_th]:h-9 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-line [&_th]:bg-surface-subtle [&_th]:px-2 [&_th]:text-[12px] [&_th]:font-medium [&_th]:text-ink-muted">
                      <th className="!pl-4">
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={todosPagina}
                          ref={(el) => {
                            if (el) el.indeterminate = algunosPagina && !todosPagina
                          }}
                          onChange={alternarPagina}
                          // Mientras llega otra página u otro orden se ven las
                          // filas viejas: elegir "la página" ahí elegiría la
                          // equivocada.
                          disabled={lista.isPlaceholderData}
                          aria-label="Seleccionar página"
                        />
                      </th>
                      <th>AM</th>
                      {th("empresa", "Empresa")}
                      {th("nombre", "Nombre")}
                      {th("apellido", "Apellido")}
                      {th("cargo", "Cargo")}
                      {th("departamento", "Departamento")}
                      {th("vertical", "Vertical")}
                      {th("email", "Email")}
                      <th>Teléfono</th>
                      <th>Observaciones</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((c) => (
                      <FilaContacto
                        key={c.id}
                        c={c}
                        yoId={yo?.id ?? null}
                        seleccionado={todosLosQueCoinciden || seleccion.has(c.id)}
                        onAlternar={() => alternar(c.id)}
                        onAbrir={() => setPanel({ abierto: true, contacto: c })}
                        onEmpresa={() => setEmpresa(c.empresa)}
                        onEscribir={() => setEscribirA(c)}
                        onProyecto={yo?.id ? () => setNuevoProyecto({ empresa: c.empresa, contactoId: c.id }) : undefined}
                        onBorrar={() => setABorrar([c])}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Celular: una línea por persona, como una agenda. */}
              <ul className="divide-y divide-line-soft md:hidden">
                {filas.map((c) => (
                  <TarjetaContacto
                    key={c.id}
                    c={c}
                    seleccionado={todosLosQueCoinciden || seleccion.has(c.id)}
                    onAlternar={() => alternar(c.id)}
                    onAbrir={() => setPanel({ abierto: true, contacto: c })}
                  />
                ))}
              </ul>

              <PaginacionTabla
                pagina={pagina}
                porPagina={porPagina}
                total={total}
                unidad={total === 1 ? "persona" : "personas"}
                onIr={(p) => setPagina(Math.min(Math.max(1, p), totalPaginas))}
                onPorPagina={setPorPagina}
                onPrecargar={precargar}
              />
            </>
          )}
        </div>

        <ContactoPanel
          abierto={panel.abierto}
          contacto={panel.contacto}
          equipo={equipo}
          yoId={yo?.id ?? null}
          opciones={opciones}
          onCerrar={() => setPanel({ abierto: false, contacto: null })}
          onGuardado={(c) => {
            const eraEdicion = panel.contacto !== null
            setPanel({ abierto: false, contacto: null })
            if (eraEdicion) reemplazar(c)
            else void refrescar()
          }}
          onBorrar={(c) => setABorrar([c])}
          onNuevoProyecto={yo?.id ? (c) => setNuevoProyecto({ empresa: c.empresa, contactoId: c.id }) : undefined}
        />

        <EnviarCrmDialog
          owner={enviarA}
          esYo={enviarA?.id === yo?.id}
          cantidad={cantidadElegida}
          onCerrar={() => setEnviarA(null)}
          onEnviar={(e) => (enviarA ? enviarAlCrm(enviarA, e) : Promise.resolve())}
        />

        <ProyectoDialog
          base={nuevoProyecto}
          ownerId={yo?.id ?? ""}
          destino="tu CRM"
          url="/api/marketing/contactos/proyectos"
          onCerrar={() => setNuevoProyecto(null)}
          onCreado={(o) => {
            setNuevoProyecto(null)
            // La ficha abierta suma el proyecto en el acto; la lista, al refrescar.
            const c = panel.contacto
            if (c && c.id === o.contacto.id) {
              const conProyecto: Contacto = {
                ...c,
                crm: [
                  ...c.crm,
                  {
                    id: o.id,
                    proyecto: o.proyecto,
                    ownerId: o.ownerId,
                    ownerNombre: o.ownerNombre,
                    estado: o.estado,
                    probabilidad: o.probabilidad,
                  },
                ],
              }
              setPanel({ abierto: true, contacto: conProyecto })
              reemplazar(conProyecto)
            }
            void qc.invalidateQueries({ queryKey: ["comercial"], refetchType: "none" })
            toast.success(`Proyecto “${o.proyecto}” en tu CRM`, {
              action: { label: "Ver CRM", onClick: () => router.push("/comercial/crm") },
            })
          }}
        />

        <ImportarContactosDialog
          abierto={importando}
          equipo={equipo}
          onCerrar={() => setImportando(false)}
          onImportado={() => {
            setImportando(false)
            void refrescar()
          }}
        />

        <LoteDialog
          modo={lote}
          cantidad={cantidadElegida}
          equipo={equipo}
          yoId={yo?.id ?? null}
          verticales={opciones.verticales}
          grupos={grupos}
          onCerrar={() => setLote(null)}
          onConfirmar={aplicarLote}
        />

        <EscribirDialog persona={escribirA} yoNombre={yo?.nombre ?? null} onCerrar={() => setEscribirA(null)} />

        <EmpresaPanel empresa={empresa} onCerrar={() => setEmpresa(null)} />

        <EscribirVariosDialog personas={escribirVarios} yoNombre={yo?.nombre ?? null} onCerrar={() => setEscribirVarios(null)} />

        <CampanaDialog
          destino={campana}
          origen="contactos"
          onCerrar={() => setCampana(null)}
          onCreada={(r) => {
            setCampana(null)
            limpiarSeleccion()
            void refrescar()
            void qc.invalidateQueries({ queryKey: ["marketing"], predicate: (qq) => String(qq.queryKey[2]).startsWith("/api/contactos/campanas") })
            toast.success(`Campaña “${r.nombre}” guardada en borrador`, {
              description: `${r.destinatarios} ${r.destinatarios === 1 ? "destinatario" : "destinatarios"}. El envío desde la app llega pronto.`,
              action: { label: "Ver grupo", onClick: () => setFiltros({ ...SIN_FILTROS, grupo: r.grupoId }) },
            })
          }}
        />

        <ConfirmarDialog
          abierto={aBorrar !== null}
          titulo={aBorrar && aBorrar.length > 1 ? `¿Borrar ${aBorrar.length} contactos?` : "¿Borrar el contacto?"}
          descripcion={
            <>
              {aBorrar?.length === 1 && (
                <strong className="font-semibold text-ink">
                  {nombreCompleto(aBorrar[0]) || aBorrar[0].email || "Sin nombre"} · {aBorrar[0].empresa}.{" "}
                </strong>
              )}
              Se borra de la base, de sus grupos y de cualquier CRM donde esté, con su historial. No se
              puede deshacer.
            </>
          }
          confirmar="Borrar"
          trabajando={borrando}
          onCerrar={() => setABorrar(null)}
          onConfirmar={borrar}
        />

        <ConfirmarDialog
          abierto={grupoABorrar !== null}
          titulo={`¿Borrar el grupo ${grupoABorrar?.nombre ?? ""}?`}
          descripcion="Se borra la lista. Las personas siguen en Contactos, en sus otros grupos y en sus CRM."
          confirmar="Borrar grupo"
          onCerrar={() => setGrupoABorrar(null)}
          onConfirmar={borrarGrupo}
        />
      </PageBody>
    </>
  )
}

/** Para el diálogo de borrado: los seleccionados como contactos. Los que no
 *  están en la página actual van solo con el id. */
function filasSeleccionadas(ids: string[], pagina: Contacto[]): Contacto[] {
  const porId = new Map(pagina.map((c) => [c.id, c]))
  return ids.map(
    (id) =>
      porId.get(id) ?? {
        id,
        empresa: "",
        nombre: null,
        apellido: null,
        cargo: null,
        departamento: null,
        vertical: null,
        email: null,
        telefono: null,
        observaciones: null,
        amId: null,
        amNombre: null,
        createdAt: "",
        crm: [],
      }
  )
}

/* ── Fila (desktop) ─────────────────────────────────────────────────────── */

function FilaContacto({
  c,
  yoId,
  seleccionado,
  onAlternar,
  onAbrir,
  onEmpresa,
  onEscribir,
  onProyecto,
  onBorrar,
}: {
  c: Contacto
  yoId: string | null
  seleccionado: boolean
  onAlternar: () => void
  onAbrir: () => void
  onEmpresa: () => void
  onEscribir: () => void
  /** Abrirle un proyecto en el CRM propio. */
  onProyecto?: () => void
  onBorrar: () => void
}) {
  return (
    <tr
      onClick={onAbrir}
      className={cn(
        "group cursor-pointer [&_td]:h-11 [&_td]:border-b [&_td]:border-line-soft [&_td]:px-2 [&_td]:align-middle",
        seleccionado ? "bg-brand-50/50" : "hover:bg-surface-subtle"
      )}
    >
      <td className="!pl-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="checkbox"
          checked={seleccionado}
          onChange={onAlternar}
          aria-label={`Seleccionar a ${nombreCompleto(c) || c.email || c.empresa}`}
        />
      </td>
      <td>
        <Avatar id={c.amId} nombre={c.amNombre} size="sm" />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onEmpresa}
            title={`Ver ${c.empresa}`}
            className="truncate font-medium text-ink underline-offset-2 hover:underline"
          >
            {c.empresa}
          </button>
          <Seguimiento c={c} yoId={yoId} />
        </div>
      </td>
      <td>
        <Celda valor={c.nombre} className="text-ink" />
      </td>
      <td>
        <Celda valor={c.apellido} className="text-ink" />
      </td>
      <td>
        <Celda valor={c.cargo} />
      </td>
      <td>
        <Celda valor={c.departamento} />
      </td>
      <td>
        <Celda valor={c.vertical} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {c.email ? (
          <a
            href={`mailto:${c.email}`}
            title={c.email}
            className="block truncate text-ink-secondary underline-offset-2 hover:text-brand-700 hover:underline"
          >
            {c.email}
          </a>
        ) : (
          <Vacio />
        )}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {c.telefono ? (
          <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} className="num block truncate text-ink-secondary hover:text-ink">
            {c.telefono}
          </a>
        ) : (
          <Vacio />
        )}
      </td>
      <td>
        <Celda valor={c.observaciones} className="text-ink-muted" />
      </td>
      <td className="!pr-3 text-right" onClick={(e) => e.stopPropagation()}>
        <Menu
          disparador={(abrir) => (
            <button
              type="button"
              onClick={abrir}
              aria-label="Acciones"
              className="rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-surface-muted hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {(cerrar) => (
            <>
              {onProyecto && (
                <>
                  <MenuItem
                    onClick={() => {
                      cerrar()
                      onProyecto()
                    }}
                  >
                    <FolderPlus />
                    Nuevo proyecto en mi CRM…
                  </MenuItem>
                  <MenuSeparador />
                </>
              )}
              <MenuItem
                onClick={() => {
                  cerrar()
                  onEscribir()
                }}
                disabled={!c.email && !c.telefono}
              >
                <MessageSquare />
                Escribir…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  cerrar()
                  onEmpresa()
                }}
              >
                <Building2 />
                Ver {c.empresa}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  cerrar()
                  onAbrir()
                }}
              >
                <Pencil />
                Editar
              </MenuItem>
              <MenuSeparador />
              <MenuItem
                tono="danger"
                onClick={() => {
                  cerrar()
                  onBorrar()
                }}
              >
                <Trash2 />
                Borrar
              </MenuItem>
            </>
          )}
        </Menu>
      </td>
    </tr>
  )
}

const Vacio = () => <span className="text-ink-faint">—</span>

/** Una línea: lo que no entra se corta y se lee entero al pasar el mouse. */
function Celda({ valor, className }: { valor: string | null; className?: string }) {
  if (!valor) return <Vacio />
  return (
    <p className={cn("truncate text-ink-secondary", className)} title={valor}>
      {valor}
    </p>
  )
}

/**
 * Si está en algún CRM: un punto del color de su etapa al lado de la empresa
 * (la del tuyo si está en el tuyo). Es la estrella de Nuestros Productos; el
 * detalle, al pasar el mouse.
 */
function Seguimiento({ c, yoId }: { c: Contacto; yoId: string | null }) {
  if (c.crm.length === 0) return null
  const mio = c.crm.find((x) => x.ownerId === yoId)
  const ref = mio ?? c.crm[0]
  const estado = esEstadoCrm(ref.estado) ? ref.estado : "nuevo"
  const detalle = c.crm
    .map(
      (x) =>
        `${x.ownerId === yoId ? "Vos" : x.ownerNombre}${x.proyecto ? ` (${x.proyecto})` : ""}: ${esEstadoCrm(x.estado) ? ESTADO_CRM_LABEL[x.estado] : x.estado}`
    )
    .join(" · ")
  return (
    <span title={`En seguimiento — ${detalle}`} className="inline-flex shrink-0 items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", ESTADO_CRM_ESTILO[estado].punto)} />
      {/* Con varios proyectos, cuántos: se ve sin abrir la ficha. */}
      {c.crm.length > 1 && <span className="num text-[11px] text-ink-faint">{c.crm.length}</span>}
    </span>
  )
}

/* ── Fila (celular) ─────────────────────────────────────────────────────── */

function TarjetaContacto({
  c,
  seleccionado,
  onAlternar,
  onAbrir,
}: {
  c: Contacto
  seleccionado: boolean
  onAlternar: () => void
  onAbrir: () => void
}) {
  const nombre = nombreCompleto(c) || c.email || "Sin nombre"
  return (
    <li onClick={onAbrir} className={cn("flex cursor-pointer items-start gap-3 px-4 py-3", seleccionado && "bg-brand-50/50")}>
      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="checkbox" checked={seleccionado} onChange={onAlternar} aria-label={`Seleccionar a ${nombre}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{nombre}</p>
        <p className="truncate text-[12.5px] text-ink-muted">{[c.cargo, c.empresa].filter(Boolean).join(" · ")}</p>
        {(c.email || c.telefono) && (
          <p className="mt-1 truncate text-[12.5px] text-ink-secondary">{[c.email, c.telefono].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <Avatar id={c.amId} nombre={c.amNombre} size="xs" className="mt-0.5" />
    </li>
  )
}
