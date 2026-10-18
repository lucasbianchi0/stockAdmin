"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/ui/avatar"
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
import { DialogoNuevo } from "@/components/comercial/presupuestos-client"
import { OportunidadPanel } from "@/components/comercial/oportunidad-panel"
import { ImportarProyectosDialog } from "@/components/comercial/importar-proyectos-dialog"
import { ProyectoDialog, type BaseProyecto } from "@/components/comercial/proyecto-dialog"
import { RegistrarDialog, type Registro } from "@/components/comercial/registrar-dialog"
import { EmpresaPanel } from "@/components/contactos/empresa-panel"
import { CampanaDialog, type DestinoCampana } from "@/components/contactos/campana-dialog"
import { EscribirDialog } from "@/components/contactos/escribir-dialog"
import { EscribirVariosDialog } from "@/components/contactos/escribir-varios-dialog"
import { ContactoPanel } from "@/components/marketing/contacto-panel"
import { claveDe, mensajeError, pedirJson } from "@/lib/admin/query"
import {
  DIAS_ESTANCADA,
  EQUIPO,
  ESTADOS_CRM,
  ESTADO_CRM_ESTILO,
  ESTADO_CRM_LABEL,
  ESTA_ABIERTA,
  PORCENTAJES,
  URL_PENDIENTES_CRM,
  calcularKpis,
  diasDesde,
  diasHasta,
  esEstancada,
  fechaCorta,
  reglaDeCierre,
  type CambiosOportunidad,
  type EstadoCrm,
  type OpcionesContacto,
  type Oportunidad,
  type RespuestaCrm,
  type TipoActividad,
} from "@/lib/comercial/crm"
import type { FichaEmpresa } from "@/lib/contactos-compartido"
import { coincide, palabrasDeBusqueda } from "@/lib/busqueda"
import { cn } from "@/lib/utils"

/**
 * Comercial → CRM: el seguimiento de una persona del equipo por vez, o de todo
 * el equipo junto.
 *
 * Cada fila es un proyecto. Cuando una empresa tiene más de uno, van juntos
 * bajo un encabezado con la empresa, que se pliega; desde ahí se suma otro.
 *
 * Arriba a la derecha se elige de quién es el CRM que se mira (el tuyo al
 * entrar, o "Todos") y queda en la URL. Las etapas son las pestañas, más
 * "Sin movimiento" para lo que lleva dos semanas quieto. Los encabezados
 * ordenan; desde cada fila se registra una llamada, se le escribe a la persona
 * con una plantilla, se ve su empresa o se arma el presupuesto.
 *
 * Se filtra y se ordena en el navegador: un CRM son decenas o pocos cientos de
 * filas, y así cambiar de pestaña, de filtro o de orden es instantáneo.
 */

type Vista = "todas" | EstadoCrm | "estancadas"
type Filtros = { proyecto: string; fecha: string; empresa: string; vertical: string; am: string }
const SIN_FILTROS: Filtros = { proyecto: "", fecha: "", empresa: "", vertical: "", am: "" }
const SIN_OPCIONES: OpcionesContacto = { empresas: [], verticales: [], departamentos: [] }
type Campo =
  | "empresa"
  | "contacto"
  | "cargo"
  | "proyecto"
  | "estado"
  | "probabilidad"
  | "proximaAccion"
  | "fechaProxima"
  | "ultimoContacto"

/** Un renglón de la tabla: un proyecto suelto o el encabezado de una empresa. */
type Renglon =
  | { tipo: "fila"; o: Oportunidad; grupo: string | null }
  | { tipo: "plegado"; empresa: string }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const nombreDe = (o: Oportunidad) =>
  [o.contacto.nombre, o.contacto.apellido].filter(Boolean).join(" ") || o.contacto.email || "Sin nombre"

/** Cómo se compara cada columna al ordenar. Lo vacío va siempre al final. */
const VALOR: Record<Campo, (o: Oportunidad) => string | number | null> = {
  empresa: (o) => o.contacto.empresa.toLowerCase(),
  contacto: (o) => nombreDe(o).toLowerCase(),
  cargo: (o) => o.contacto.cargo?.toLowerCase() ?? null,
  proyecto: (o) => o.proyecto?.toLowerCase() ?? null,
  estado: (o) => ESTADOS_CRM.indexOf(o.estado),
  probabilidad: (o) => o.probabilidad,
  proximaAccion: (o) => o.proximaAccion?.toLowerCase() ?? null,
  fechaProxima: (o) => o.fechaProxima,
  ultimoContacto: (o) => o.ultimoContacto,
}

function ordenar(lista: Oportunidad[], orden: Orden<Campo>): Oportunidad[] {
  if (!orden) return lista
  const f = VALOR[orden.campo]
  const signo = orden.dir === "asc" ? 1 : -1
  return [...lista].sort((a, b) => {
    const x = f(a)
    const y = f(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return (x < y ? -1 : x > y ? 1 : 0) * signo
  })
}

export function CrmClient() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const qc = useQueryClient()

  const ownerUrl = params.get("owner")
  const urlDe = (owner: string | null) => `/api/comercial/crm${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`
  const consulta = (owner: string | null) => ({
    queryKey: claveDe("comercial", urlDe(owner)),
    queryFn: ({ signal }: { signal: AbortSignal }) => pedirJson<RespuestaCrm>(urlDe(owner), { signal }),
    // Volver a un CRM ya visto es instantáneo; pasado un minuto se refresca
    // por detrás sin vaciar nada.
    staleTime: 60_000,
  })
  const clave = consulta(ownerUrl).queryKey

  const q = useQuery(consulta(ownerUrl))
  const d = q.data

  const [vista, setVista] = useState<Vista>("todas")
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "")
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [orden, setOrden] = useState<Orden<Campo>>(null)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [abiertaId, setAbiertaId] = useState<string | null>(null)
  const [aQuitar, setAQuitar] = useState<string[] | null>(null)
  /** El alta de una persona: vacía, o con la empresa y el proyecto ya puestos. */
  const [creando, setCreando] = useState<{ empresa?: string; proyecto?: string } | null>(null)
  const [nuevoProyecto, setNuevoProyecto] = useState<BaseProyecto | null>(null)
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [registrando, setRegistrando] = useState<{ o: Oportunidad; tipo: TipoActividad } | null>(null)
  const [escribiendo, setEscribiendo] = useState<Oportunidad | null>(null)
  const [escribiendoVarios, setEscribiendoVarios] = useState<Oportunidad[] | null>(null)
  const [campana, setCampana] = useState<DestinoCampana | null>(null)
  const [empresa, setEmpresa] = useState<string | null>(null)
  const [presupuestando, setPresupuestando] = useState<{
    o: Oportunidad
    cliente: { id: string; razonSocial: string } | null
  } | null>(null)

  // Las sugerencias del formulario se piden recién al abrirlo.
  const opcionesQ = useQuery({
    queryKey: claveDe("comercial", "/api/comercial/crm/opciones"),
    queryFn: ({ signal }) => pedirJson<OpcionesContacto>("/api/comercial/crm/opciones", { signal }),
    enabled: creando !== null,
    staleTime: 5 * 60_000,
  })

  // Cambiar de persona limpia la selección y cierra el panel: lo elegido era
  // de otro CRM.
  const [ownerPrevio, setOwnerPrevio] = useState(ownerUrl)
  if (ownerUrl !== ownerPrevio) {
    setOwnerPrevio(ownerUrl)
    setSeleccion(new Set())
    setAbiertaId(null)
    setPagina(1)
  }
  const criterio = JSON.stringify([vista, busqueda, filtros, orden, porPagina])
  const [criterioPrevio, setCriterioPrevio] = useState(criterio)
  if (criterio !== criterioPrevio) {
    setCriterioPrevio(criterio)
    setPagina(1)
  }

  function verCrmDe(id: string) {
    const p = new URLSearchParams(params)
    if (d && id === d.yo.id) p.delete("owner")
    else p.set("owner", id)
    p.delete("q")
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false })
  }

  /* ── Filtrado y orden ──────────────────────────────────────────────────── */

  const todas = useMemo(() => d?.oportunidades ?? [], [d])

  // Filtros y búsqueda, sin la pestaña: así cada pestaña cuenta lo que
  // mostraría con los filtros puestos.
  const base = useMemo(() => {
    // Sin acentos y por palabra: "rocio navarro" encuentra a Rocío Navarro.
    const palabras = palabrasDeBusqueda(busqueda)
    return todas.filter((o) => {
      if (filtros.proyecto && o.proyecto !== filtros.proyecto) return false
      if (filtros.empresa && o.contacto.empresa !== filtros.empresa) return false
      if (filtros.vertical && o.contacto.vertical !== filtros.vertical) return false
      if (filtros.am && (filtros.am === "sin" ? o.contacto.amId : o.contacto.amId !== filtros.am)) return false
      if (filtros.fecha) {
        const dias = diasHasta(o.fechaProxima)
        if (filtros.fecha === "vencidas" && !(dias !== null && dias < 0 && ESTA_ABIERTA(o.estado))) return false
        if (filtros.fecha === "semana" && !(dias !== null && dias >= 0 && dias <= 7)) return false
        if (filtros.fecha === "sin" && o.fechaProxima) return false
      }
      const c = o.contacto
      return coincide(palabras, [
        c.empresa,
        c.nombre,
        c.apellido,
        c.cargo,
        c.departamento,
        c.vertical,
        c.email,
        c.telefono,
        o.proyecto,
        o.proximaAccion,
        o.motivoPerdida,
        o.ownerNombre,
      ])
    })
  }, [todas, filtros, busqueda])

  const filtradas = ordenar(
    vista === "todas" ? base : vista === "estancadas" ? base.filter(esEstancada) : base.filter((o) => o.estado === vista),
    orden
  )

  // Los proyectos de una misma empresa, juntos: en el lugar donde cae el
  // primero según el orden de la tabla. Una empresa plegada es un solo renglón.
  const porEmpresa = new Map<string, Oportunidad[]>()
  for (const o of filtradas) {
    const lista = porEmpresa.get(o.contacto.empresa)
    if (lista) lista.push(o)
    else porEmpresa.set(o.contacto.empresa, [o])
  }
  const renglones: Renglon[] = []
  for (const [nombre, filas] of porEmpresa) {
    if (filas.length === 1) renglones.push({ tipo: "fila", o: filas[0], grupo: null })
    else if (plegadas.has(nombre)) renglones.push({ tipo: "plegado", empresa: nombre })
    else for (const o of filas) renglones.push({ tipo: "fila", o, grupo: nombre })
  }

  const totalPaginas = Math.max(1, Math.ceil(renglones.length / porPagina))
  // Si un cambio de etapa vacía la última página, se vuelve a la que queda.
  const paginaReal = Math.min(pagina, totalPaginas)
  const renglonesPagina = renglones.slice((paginaReal - 1) * porPagina, paginaReal * porPagina)
  const visibles = renglonesPagina.flatMap((r) => (r.tipo === "fila" ? [r.o] : []))
  /** El encabezado de la empresa va antes de su primer proyecto en la página. */
  const abreGrupo = (i: number) => {
    const r = renglonesPagina[i]
    if (r.tipo !== "fila" || !r.grupo) return false
    const previo = renglonesPagina[i - 1]
    return !previo || previo.tipo !== "fila" || previo.grupo !== r.grupo
  }
  /** El último proyecto de su empresa en la página: el grupo cierra con un borde. */
  const cierraGrupo = (i: number) => {
    const r = renglonesPagina[i]
    if (r.tipo !== "fila" || !r.grupo) return false
    const siguiente = renglonesPagina[i + 1]
    return !siguiente || siguiente.tipo !== "fila" || siguiente.grupo !== r.grupo
  }
  const plegar = (empresa: string) =>
    setPlegadas((p) => {
      const n = new Set(p)
      if (n.has(empresa)) n.delete(empresa)
      else n.add(empresa)
      return n
    })
  const hayFiltros = busqueda.trim() !== "" || Object.values(filtros).some(Boolean)
  const abierta = todas.find((o) => o.id === abiertaId) ?? null
  const esEquipo = d?.owner.id === EQUIPO
  const esMio = d ? d.owner.id === d.yo.id : true
  /** En la vista de un CRM decide el servidor; en la del equipo, cada fila. */
  const puedeEditarFila = (o: Oportunidad) =>
    !!d && (esEquipo ? d.yo.admin || o.ownerId === d.yo.id : d.puedeEditar)
  const editable = d?.puedeEditar ?? false

  /* ── Selección ─────────────────────────────────────────────────────────── */

  const idsPagina = visibles.filter(puedeEditarFila).map((o) => o.id)
  const todosPagina = idsPagina.length > 0 && idsPagina.every((id) => seleccion.has(id))
  const algunosPagina = idsPagina.some((id) => seleccion.has(id))
  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const alternarPagina = () =>
    setSeleccion((s) => {
      const n = new Set(s)
      idsPagina.forEach((id) => (todosPagina ? n.delete(id) : n.add(id)))
      return n
    })
  /** Todas las que pasan los filtros y la pestaña, no solo las de esta página. */
  const idsFiltradas = filtradas.filter(puedeEditarFila).map((o) => o.id)
  const todasLasQueCoinciden = idsFiltradas.length > 0 && idsFiltradas.every((id) => seleccion.has(id))
  const elegidas = () => todas.filter((o) => seleccion.has(o.id))

  /* ── Escrituras ────────────────────────────────────────────────────────── */

  /*
   * Todas optimistas: el cambio se ve en el acto y el servidor confirma por
   * detrás, sin volver a pedir el CRM entero (eso era el parpadeo). Los
   * números de las pestañas salen de las filas, así que alcanza con tocarlas.
   */

  /** Cambia filas en la caché. Devuelve cómo estaba, para deshacer. */
  function tocar(cambio: (o: Oportunidad) => Oportunidad | null): RespuestaCrm | undefined {
    const antes = qc.getQueryData<RespuestaCrm>(clave)
    if (!antes) return antes
    const oportunidades = antes.oportunidades.flatMap((o) => {
      const n = cambio(o)
      return n ? [n] : []
    })
    qc.setQueryData<RespuestaCrm>(clave, { ...antes, oportunidades })
    return antes
  }

  /** Lo que confirmó el servidor, encima de lo optimista. Los otros CRM (y la
   *  vista del equipo) quedan marcados para pedirse cuando se abran. */
  function confirmar(nuevas: Oportunidad[]) {
    const porId = new Map(nuevas.map((o) => [o.id, o]))
    tocar((o) => porId.get(o.id) ?? o)
    void qc.invalidateQueries({
      predicate: (qq) => qq.queryKey[0] === "comercial" && qq.queryKey[2] !== clave[2],
      refetchType: "none",
    })
    void qc.invalidateQueries({ queryKey: ["marketing"], refetchType: "none" })
    // El número del menú sí se pide ya: es lo que se mira al terminar.
    void qc.invalidateQueries({ queryKey: claveDe("comercial", URL_PENDIENTES_CRM) })
  }

  // El estado y el % se mueven juntos, igual que en el servidor.
  const conCambios = (o: Oportunidad, c: CambiosOportunidad): Oportunidad => {
    const cierre =
      "estado" in c || "probabilidad" in c
        ? reglaDeCierre(o, { estado: c.estado, probabilidad: c.probabilidad })
        : { estado: o.estado, probabilidad: o.probabilidad }
    return {
      ...o,
      ...c,
      ...cierre,
      ultimoMovimiento: new Date().toISOString(),
      motivoPerdida:
        "motivoPerdida" in c ? (c.motivoPerdida ?? null) : cierre.estado !== "perdida" ? null : o.motivoPerdida,
    }
  }

  async function guardar(id: string, cambios: CambiosOportunidad): Promise<Oportunidad | null> {
    const antes = tocar((o) => (o.id === id ? conCambios(o, cambios) : o))
    try {
      const r = await pedirJson<{ oportunidad: Oportunidad }>(`/api/comercial/crm/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cambios),
      })
      confirmar([r.oportunidad])
      return r.oportunidad
    } catch (e) {
      if (antes) qc.setQueryData(clave, antes)
      toast.error(mensajeError(e, "No se pudo guardar"))
      return null
    }
  }

  async function cambiarEstado(ids: string[], estado: EstadoCrm) {
    const cambios = { estado }
    const enLote = ids.length > 1
    const antes = tocar((o) => (ids.includes(o.id) ? conCambios(o, cambios) : o))
    setSeleccion(new Set())
    try {
      const r = await pedirJson<{ oportunidades: Oportunidad[] }>("/api/comercial/crm", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, ...cambios }),
      })
      confirmar(r.oportunidades)
      if (enLote) toast.success(`${ids.length} proyectos pasaron a ${ESTADO_CRM_LABEL[estado]}`)
    } catch (e) {
      if (antes) qc.setQueryData(clave, antes)
      toast.error(mensajeError(e, "No se pudo actualizar"))
    }
  }

  async function quitar() {
    if (!aQuitar) return
    const ids = aQuitar
    const antes = tocar((o) => (ids.includes(o.id) ? null : o))
    setSeleccion(new Set())
    setAbiertaId((id) => (id && ids.includes(id) ? null : id))
    setAQuitar(null)
    try {
      await pedirJson("/api/comercial/crm", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      toast.success(ids.length === 1 ? "Quitado del CRM" : `${ids.length} quitados del CRM`)
      void qc.invalidateQueries({ queryKey: ["marketing"], refetchType: "none" })
    } catch (e) {
      if (antes) qc.setQueryData(clave, antes)
      toast.error(mensajeError(e, "No se pudo quitar"))
    }
  }

  /** Una llamada, reunión o mail con su próximo paso: la actividad va al
   *  historial y la fila se actualiza en el acto. */
  async function registrar(o: Oportunidad, r: Registro) {
    const hoy = new Date().toLocaleDateString("en-CA")
    const esContacto = r.tipo !== "nota"
    try {
      await pedirJson(`/api/comercial/crm/${o.id}/actividades`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: r.tipo, texto: r.texto }),
      })
      if (esContacto) tocar((x) => (x.id === o.id ? { ...x, ultimoContacto: hoy } : x))
      const cambios: CambiosOportunidad = {}
      if (r.proximaAccion !== (o.proximaAccion ?? "")) cambios.proximaAccion = r.proximaAccion || null
      if (r.fechaProxima !== (o.fechaProxima ?? "")) cambios.fechaProxima = r.fechaProxima || null
      if (Object.keys(cambios).length) await guardar(o.id, cambios)
      else tocar((x) => (x.id === o.id ? { ...x, ultimoMovimiento: new Date().toISOString() } : x))
      void qc.invalidateQueries({ queryKey: claveDe("comercial", `/api/comercial/crm/${o.id}/actividades`) })
      toast.success(r.tipo === "nota" ? "Nota anotada" : `${r.tipo === "llamada" ? "Llamada" : r.tipo === "reunion" ? "Reunión" : "Mail"} registrada`)
      setRegistrando(null)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo registrar"))
    }
  }

  /** "Escribir": si se mandó, queda en el historial (si se puede editar). */
  async function alEscribir(o: Oportunidad, canal: string, titulo: string) {
    if (!puedeEditarFila(o)) return
    const tipo = canal === "email" ? "email" : "nota"
    const texto = `${canal === "email" ? "Mail" : canal === "whatsapp" ? "WhatsApp" : "LinkedIn"} con la plantilla “${titulo}”`
    try {
      await pedirJson(`/api/comercial/crm/${o.id}/actividades`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, texto }),
      })
      if (tipo === "email") tocar((x) => (x.id === o.id ? { ...x, ultimoContacto: new Date().toLocaleDateString("en-CA") } : x))
      void qc.invalidateQueries({ queryKey: claveDe("comercial", `/api/comercial/crm/${o.id}/actividades`) })
    } catch {
      // Anotarlo acompaña; si falla, el mensaje igual se mandó.
    }
  }

  /** Presupuesto: busca si la empresa ya es cliente para dejarlo elegido. */
  async function abrirPresupuesto(o: Oportunidad) {
    if (o.presupuesto) {
      router.push(`/comercial/presupuestos/${o.presupuesto.id}`)
      return
    }
    let cliente: { id: string; razonSocial: string } | null = null
    try {
      const f = await pedirJson<FichaEmpresa>(`/api/contactos/empresa?nombre=${encodeURIComponent(o.contacto.empresa)}`)
      cliente = f.cliente
    } catch {
      // Sin cliente sugerido: se elige en el diálogo.
    }
    setPresupuestando({ o, cliente })
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (q.isPending || q.isError || !d) {
    return (
      <>
        <PageHeader title="CRM" />
        <PageBody>
          {q.isPending ? (
            <LoadingState label="Cargando el CRM…" />
          ) : (
            <ErrorState message={mensajeError(q.error)} onRetry={() => void q.refetch()} />
          )}
        </PageBody>
      </>
    )
  }

  const primerNombre = d.owner.nombre.split(" ")[0]
  const kpis = calcularKpis(todas)
  const estancadas = base.filter(esEstancada).length
  // El contador del dueño sale de las filas, así se mueve en el acto; el de
  // los demás viene del servidor.
  const equipo = d.equipo.map((u) => (u.id === d.owner.id ? { ...u, activas: kpis.activas } : u))
  const proyectos = [...new Set(todas.map((o) => o.proyecto).filter((p): p is string => !!p))].sort((a, b) =>
    a.localeCompare(b, "es")
  )
  /** Lo nuevo entra al CRM que se mira; en la vista del equipo, al propio. */
  const ownerNuevo = esEquipo ? d.yo.id : d.owner.id
  const puedeCrear = editable || esEquipo
  const destino = esMio || esEquipo ? "tu CRM" : `el CRM de ${primerNombre}`
  /** Para nombrar uno nuevo: los de esa empresa primero. */
  const sugerencias = (empresa: string) => [
    ...new Set([
      ...todas.filter((o) => o.contacto.empresa === empresa && o.proyecto).map((o) => o.proyecto!),
      ...d.proyectos,
    ]),
  ]
  const th = (campo: Campo, rotulo: string) => (
    <ThOrden campo={campo} orden={orden} onOrdenar={setOrden}>
      {rotulo}
    </ThOrden>
  )

  return (
    <>
      <PageHeader
        title={esEquipo ? "CRM del equipo" : esMio ? "Mi CRM" : `CRM de ${d.owner.nombre}`}
        actions={
          <>
            <Equipo
              equipo={equipo}
              ownerId={d.owner.id}
              yoId={d.yo.id}
              onElegir={verCrmDe}
              // Al pasar el mouse por alguien su CRM se pide por detrás: el
              // click lo muestra al instante.
              onPrecargar={(id) => void qc.prefetchQuery(consulta(id === d.yo.id ? null : id))}
            />
            {/* En la vista del equipo lo nuevo entra al CRM propio. */}
            {(editable || esEquipo) && (
              <>
                <Button variant="outline" onClick={() => setImportando(true)}>
                  <Upload />
                  <span className="hidden sm:inline">Importar</span>
                </Button>
                <Button variant="outline" onClick={() => setCreando({})}>
                  <UserPlus />
                  <span className="hidden sm:inline">Nuevo contacto</span>
                </Button>
                <Button onClick={() => setNuevoProyecto({ empresa: "" })}>
                  <Plus />
                  <span className="hidden sm:inline">Nuevo proyecto</span>
                </Button>
              </>
            )}
          </>
        }
      />
      <PageBody className="pb-28">
        <Vistas
          activa={vista}
          onCambio={setVista}
          vistas={[
            { id: "todas", rotulo: "Todas", cantidad: base.length },
            ...ESTADOS_CRM.map((e) => ({
              id: e,
              rotulo: e === "ganada" ? "Ganados" : e === "perdida" ? "Perdidos" : ESTADO_CRM_LABEL[e],
              cantidad: base.filter((o) => o.estado === e).length,
              punto: ESTADO_CRM_ESTILO[e].punto,
            })),
            { id: "estancadas", rotulo: "Sin movimiento", cantidad: estancadas, punto: estancadas > 0 ? "bg-warning" : undefined },
          ]}
          extra={
            <span className="flex items-center gap-3">
              {!editable && !esEquipo && (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Solo lectura
                </span>
              )}
              {kpis.vencidas > 0 && (
                <button
                  onClick={() => {
                    setVista("todas")
                    setFiltros({ ...SIN_FILTROS, fecha: "vencidas" })
                  }}
                  className="font-medium text-danger-text hover:underline"
                >
                  {plural(kpis.vencidas, "acción vencida", "acciones vencidas")}
                </button>
              )}
            </span>
          }
        />

        {vista === "estancadas" && (
          <p className="mt-3 text-[12.5px] text-ink-muted">
            Proyectos abiertos sin ningún cambio, nota ni contacto en los últimos {DIAS_ESTANCADA} días.
          </p>
        )}

        {esEquipo && <ResumenEquipo oportunidades={todas} equipo={d.equipo} onElegir={verCrmDe} />}

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
          <BarraTabla
            seleccionados={seleccion.size}
            rotuloSeleccion={(n) => plural(n, "proyecto elegido", "proyectos elegidos")}
            onLimpiar={() => setSeleccion(new Set())}
            acciones={
              <>
                <Button size="sm" onClick={() => setEscribiendoVarios(elegidas())}>
                  <MessageSquare />
                  Escribir…
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const os = elegidas()
                    const contactos = [...new Map(os.map((o) => [o.contacto.id, o.contacto])).values()]
                    setCampana({
                      ids: contactos.map((c) => c.id),
                      cantidad: contactos.length,
                      conMail: contactos.filter((c) => c.email).length,
                      conTelefono: contactos.filter((c) => c.telefono).length,
                    })
                  }}
                >
                  <Megaphone />
                  <span className="hidden sm:inline">Crear campaña…</span>
                </Button>
                <Menu
                  alinear="inicio"
                  disparador={(abrir) => (
                    <Button size="sm" variant="ghost" onClick={abrir}>
                      Mover a
                      <ChevronDown />
                    </Button>
                  )}
                >
                  {(cerrar) => (
                    <>
                      <MenuRotulo>Etapa</MenuRotulo>
                      {ESTADOS_CRM.map((e) => (
                        <MenuItem
                          key={e}
                          onClick={() => {
                            cerrar()
                            void cambiarEstado([...seleccion], e)
                          }}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", ESTADO_CRM_ESTILO[e].punto)} />
                          {ESTADO_CRM_LABEL[e]}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Menu>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-ink-muted hover:text-danger-text"
                  onClick={() => setAQuitar([...seleccion])}
                >
                  <Trash2 />
                  <span className="hidden sm:inline">Quitar del CRM</span>
                </Button>
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
              <FiltroPill
                rotulo="Empresa"
                valor={filtros.empresa}
                onCambio={(v) => setFiltros((f) => ({ ...f, empresa: v }))}
                opciones={[...new Set(todas.map((o) => o.contacto.empresa))].sort((a, b) => a.localeCompare(b, "es")).map((v) => ({ valor: v, etiqueta: v }))}
              />
              <FiltroPill
                rotulo="Vertical"
                valor={filtros.vertical}
                onCambio={(v) => setFiltros((f) => ({ ...f, vertical: v }))}
                opciones={[...new Set(todas.map((o) => o.contacto.vertical).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "es")).map((v) => ({ valor: v, etiqueta: v }))}
              />
              <FiltroPill
                rotulo="AM"
                valor={filtros.am}
                onCambio={(v) => setFiltros((f) => ({ ...f, am: v }))}
                opciones={[...d.equipo.map((u) => ({ valor: u.id, etiqueta: u.nombre })), { valor: "sin", etiqueta: "Sin AM" }]}
              />
              <FiltroPill
                rotulo="Proyecto"
                valor={filtros.proyecto}
                onCambio={(v) => setFiltros((f) => ({ ...f, proyecto: v }))}
                opciones={proyectos.map((p) => ({ valor: p, etiqueta: p }))}
              />
              <FiltroPill
                rotulo="Próxima acción"
                valor={filtros.fecha}
                onCambio={(v) => setFiltros((f) => ({ ...f, fecha: v }))}
                opciones={[
                  { valor: "vencidas", etiqueta: "Vencidas" },
                  { valor: "semana", etiqueta: "Próximos 7 días" },
                  { valor: "sin", etiqueta: "Sin fecha" },
                ]}
              />
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

            <span className="num ml-auto hidden shrink-0 text-[12.5px] text-ink-muted sm:inline">
              {plural(filtradas.length, "proyecto", "proyectos")}
            </span>
          </BarraTabla>

          {todosPagina && idsFiltradas.length > idsPagina.length && (
            <div className="border-b border-line bg-brand-50/40 px-4 py-2 text-center text-[12.5px] text-ink-secondary animate-in fade-in-0 duration-150">
              {todasLasQueCoinciden ? (
                <>
                  Están elegidos los <strong className="font-semibold text-ink">{idsFiltradas.length}</strong> que
                  coinciden.{" "}
                  <button onClick={() => setSeleccion(new Set())} className="font-medium text-brand-700 hover:underline">
                    Limpiar la selección
                  </button>
                </>
              ) : (
                <>
                  Elegiste los {idsPagina.length} de esta página.{" "}
                  <button onClick={() => setSeleccion(new Set(idsFiltradas))} className="font-medium text-brand-700 hover:underline">
                    Elegir los {idsFiltradas.length} que coinciden
                  </button>
                </>
              )}
            </div>
          )}

          {todas.length === 0 ? (
            <EmptyState
              icon={Search}
              title={
                esEquipo
                  ? "Nadie tiene proyectos todavía"
                  : esMio
                    ? "Tu CRM está vacío"
                    : `${primerNombre} todavía no tiene proyectos`
              }
              description={
                esMio
                  ? "Abrí un proyecto acá, o elegí en Contactos las personas que vas a trabajar y mandalas a tu CRM."
                  : "Cuando le manden contactos van a aparecer acá."
              }
              action={
                editable ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/marketing/contactos">Elegir de Contactos</Link>
                    </Button>
                    <Button variant="outline" onClick={() => setImportando(true)}>
                      <Upload />
                      Importar planilla
                    </Button>
                    <Button variant="outline" onClick={() => setCreando({})}>
                      <UserPlus />
                      Nuevo contacto
                    </Button>
                    <Button onClick={() => setNuevoProyecto({ empresa: "" })}>
                      <Plus />
                      Nuevo proyecto
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : filtradas.length === 0 ? (
            <EmptyState
              icon={Search}
              title={vista === "estancadas" ? "Nada quieto" : "No hay proyectos acá"}
              description={
                vista === "estancadas"
                  ? `Todos los abiertos tuvieron movimiento en los últimos ${DIAS_ESTANCADA} días.`
                  : "Probá con otra pestaña o limpiá los filtros."
              }
            />
          ) : (
            <>
              {/* Las columnas del boceto, en su orden. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1160px] table-fixed border-separate border-spacing-0 text-[13px]">
                  <colgroup>
                    <col className="w-[44px]" />
                    <col className="w-[48px]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[7%]" />
                    <col className="w-[12%]" />
                    <col className="w-[160px]" />
                    <col className="w-[112px]" />
                    <col />
                    <col className="w-[80px]" />
                    <col className="w-[80px]" />
                    <col className="w-[8%]" />
                    <col className="w-[44px]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left [&_th]:h-9 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface-subtle [&_th]:px-2 [&_th]:text-[12px] [&_th]:font-medium [&_th]:leading-tight [&_th]:text-ink-muted">
                      <th className="!pl-4">
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={todosPagina}
                          ref={(el) => {
                            if (el) el.indeterminate = algunosPagina && !todosPagina
                          }}
                          onChange={alternarPagina}
                          disabled={idsPagina.length === 0}
                          aria-label="Seleccionar página"
                        />
                      </th>
                      <th>{esEquipo ? "Dueño" : "AM"}</th>
                      {th("empresa", "Empresa")}
                      {th("contacto", "Contacto")}
                      {th("cargo", "Cargo")}
                      {th("proyecto", "Proyecto")}
                      {th("estado", "Estado")}
                      {th("probabilidad", "% cierre")}
                      {th("proximaAccion", "Próxima acción")}
                      {th("fechaProxima", "Fecha próxima")}
                      {th("ultimoContacto", "Último contacto")}
                      <th>Motivo de pérdida</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {renglonesPagina.map((r, i) => {
                      const grupo = r.tipo === "plegado" ? r.empresa : abreGrupo(i) ? r.grupo : null
                      const fila =
                        r.tipo === "fila" ? (
                          <FilaOportunidad
                            key={r.o.id}
                            o={r.o}
                            enGrupo={!!r.grupo}
                            cierraGrupo={cierraGrupo(i)}
                            esEquipo={esEquipo}
                            editable={puedeEditarFila(r.o)}
                            seleccionado={seleccion.has(r.o.id)}
                            activa={r.o.id === abiertaId}
                            onAlternar={() => alternar(r.o.id)}
                            onAbrir={() => setAbiertaId(r.o.id)}
                            onEstado={(e) => void cambiarEstado([r.o.id], e)}
                            onCierre={(n) => void guardar(r.o.id, { probabilidad: n })}
                            onRegistrar={(tipo) => setRegistrando({ o: r.o, tipo })}
                            onEscribir={() => setEscribiendo(r.o)}
                            onEmpresa={() => setEmpresa(r.o.contacto.empresa)}
                            onPresupuesto={() => void abrirPresupuesto(r.o)}
                            onNuevoProyecto={puedeCrear ? () => setNuevoProyecto({ empresa: r.o.contacto.empresa, contactoId: r.o.contacto.id }) : undefined}
                            onQuitar={() => setAQuitar([r.o.id])}
                          />
                        ) : null
                      if (!grupo) return fila
                      const filas = porEmpresa.get(grupo) ?? []
                      const ids = filas.filter(puedeEditarFila).map((o) => o.id)
                      return [
                        <EncabezadoEmpresa
                          key={`g-${grupo}-${i}`}
                          empresa={grupo}
                          filas={filas}
                          plegada={plegadas.has(grupo)}
                          seleccion={ids.length === 0 ? null : ids.every((id) => seleccion.has(id)) ? "todas" : ids.some((id) => seleccion.has(id)) ? "algunas" : "ninguna"}
                          onSeleccionar={() =>
                            setSeleccion((s) => {
                              const n = new Set(s)
                              const todasYa = ids.every((id) => n.has(id))
                              ids.forEach((id) => (todasYa ? n.delete(id) : n.add(id)))
                              return n
                            })
                          }
                          onPlegar={() => plegar(grupo)}
                          onEmpresa={() => setEmpresa(grupo)}
                          onNuevoProyecto={puedeCrear ? () => setNuevoProyecto({ empresa: grupo }) : undefined}
                        />,
                        fila,
                      ]
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line-soft md:hidden">
                {renglonesPagina.map((r, i) => {
                  const grupo = r.tipo === "plegado" ? r.empresa : abreGrupo(i) ? r.grupo : null
                  return [
                    grupo && (
                      <li key={`g-${grupo}-${i}`}>
                        <button
                          type="button"
                          onClick={() => plegar(grupo)}
                          className="flex w-full items-center gap-2 bg-surface-subtle px-4 py-2 text-left text-[12.5px]"
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 text-ink-muted transition-transform", !plegadas.has(grupo) && "rotate-90")} />
                          <span className="font-medium text-ink">{grupo}</span>
                          <span className="text-ink-muted">· {plural(porEmpresa.get(grupo)?.length ?? 0, "proyecto", "proyectos")}</span>
                        </button>
                      </li>
                    ),
                    r.tipo === "fila" && (
                      <TarjetaOportunidad
                        key={r.o.id}
                        o={r.o}
                        editable={puedeEditarFila(r.o)}
                        seleccionado={seleccion.has(r.o.id)}
                        onAlternar={() => alternar(r.o.id)}
                        onAbrir={() => setAbiertaId(r.o.id)}
                      />
                    ),
                  ]
                })}
              </ul>

              <PaginacionTabla
                pagina={paginaReal}
                porPagina={porPagina}
                total={renglones.length}
                unidad={plegadas.size > 0 ? "renglones" : renglones.length === 1 ? "proyecto" : "proyectos"}
                onIr={(p) => setPagina(Math.min(Math.max(1, p), totalPaginas))}
                onPorPagina={setPorPagina}
              />
            </>
          )}
        </div>

        <OportunidadPanel
          oportunidad={abierta}
          puedeEditar={abierta ? puedeEditarFila(abierta) : false}
          proyectos={abierta ? sugerencias(abierta.contacto.empresa) : d.proyectos}
          hermanas={abierta ? todas.filter((o) => o.contacto.empresa === abierta.contacto.empresa && o.id !== abierta.id) : []}
          onAbrir={setAbiertaId}
          onNuevoProyecto={puedeCrear ? (o) => setNuevoProyecto({ empresa: o.contacto.empresa, contactoId: o.contacto.id }) : undefined}
          onCerrar={() => setAbiertaId(null)}
          onGuardar={guardar}
          onContacto={(id) => {
            const hoy = new Date().toLocaleDateString("en-CA")
            tocar((o) => (o.id === id ? { ...o, ultimoContacto: hoy, ultimoMovimiento: new Date().toISOString() } : o))
          }}
          onPresupuesto={(o) => void abrirPresupuesto(o)}
          onEscribir={(o) => setEscribiendo(o)}
          onEmpresa={(o) => setEmpresa(o.contacto.empresa)}
        />

        <RegistrarDialog
          oportunidad={registrando?.o ?? null}
          tipoInicial={registrando?.tipo ?? "llamada"}
          onCerrar={() => setRegistrando(null)}
          onGuardar={registrar}
        />

        <EscribirDialog
          persona={escribiendo?.contacto ?? null}
          yoNombre={d.yo.nombre}
          onCerrar={() => setEscribiendo(null)}
          onEnviado={(canal, p) => escribiendo && void alEscribir(escribiendo, canal, p.titulo)}
        />

        <EmpresaPanel empresa={empresa} onCerrar={() => setEmpresa(null)} />

        <EscribirVariosDialog
          personas={escribiendoVarios?.map((o) => ({ ...o.contacto, id: o.id })) ?? null}
          yoNombre={d.yo.nombre}
          onCerrar={() => setEscribiendoVarios(null)}
          onEnviado={(p, canal, plantilla) => {
            const o = todas.find((x) => x.id === p.id)
            if (o) void alEscribir(o, canal, plantilla.titulo)
          }}
        />

        <CampanaDialog
          destino={campana}
          origen="crm"
          onCerrar={() => setCampana(null)}
          onCreada={(r) => {
            setCampana(null)
            setSeleccion(new Set())
            toast.success(`Campaña “${r.nombre}” guardada en borrador`, {
              description: `${r.destinatarios} ${r.destinatarios === 1 ? "destinatario" : "destinatarios"}. El envío desde la app llega pronto.`,
            })
          }}
        />

        {presupuestando && (
          <DialogoNuevo
            clienteInicial={presupuestando.cliente}
            referenciaInicial={[presupuestando.o.proyecto, presupuestando.o.contacto.empresa].filter(Boolean).join(" — ")}
            onCerrar={() => setPresupuestando(null)}
            onCreado={(id) => {
              const o = presupuestando.o
              setPresupuestando(null)
              // Queda enlazado a la oportunidad, y la oportunidad pasa a Propuesta
              // si todavía no había llegado.
              const avanza = ESTADOS_CRM.indexOf(o.estado) < ESTADOS_CRM.indexOf("propuesta")
              void guardar(o.id, {
                presupuestoId: id,
                ...(avanza ? { estado: "propuesta" as const } : {}),
              })
              router.push(`/comercial/presupuestos/${id}`)
            }}
          />
        )}

        <ImportarProyectosDialog
          abierto={importando}
          ownerId={ownerNuevo}
          destino={destino}
          onCerrar={() => setImportando(false)}
          onImportado={() => {
            setImportando(false)
            // Muchas filas nuevas, quizás en varios CRM: se piden de nuevo.
            void qc.invalidateQueries({ queryKey: ["comercial"] })
            void qc.invalidateQueries({ queryKey: ["marketing"], refetchType: "none" })
          }}
        />

        <ProyectoDialog
          base={nuevoProyecto}
          ownerId={ownerNuevo}
          destino={destino}
          sugerencias={nuevoProyecto ? sugerencias(nuevoProyecto.empresa) : []}
          onCerrar={() => setNuevoProyecto(null)}
          onCreado={(o) => {
            setNuevoProyecto(null)
            // Entra a la caché del CRM que se mira (o al propio, si es el del
            // equipo): sin volver a pedir todo.
            const antes = qc.getQueryData<RespuestaCrm>(clave)
            if (antes) qc.setQueryData<RespuestaCrm>(clave, { ...antes, oportunidades: [o, ...antes.oportunidades] })
            confirmar([])
            setPlegadas((p) => {
              const n = new Set(p)
              n.delete(o.contacto.empresa)
              return n
            })
            setAbiertaId(o.id)
            toast.success(`Proyecto “${o.proyecto}” creado en ${o.contacto.empresa}`)
          }}
          onPersonaNueva={(empresa, proyecto) => {
            setNuevoProyecto(null)
            setCreando({ empresa, proyecto })
          }}
        />

        <ContactoPanel
          abierto={creando !== null}
          contacto={null}
          equipo={d.equipo}
          yoId={d.yo.id}
          opciones={opcionesQ.data ?? SIN_OPCIONES}
          alta={{
            url: "/api/comercial/crm/contactos",
            cuerpo: { ownerId: ownerNuevo },
            boton: esMio || esEquipo ? "Crear y sumar a mi CRM" : `Crear y sumar al CRM de ${primerNombre}`,
            subtitulo: `Se guarda en la base de Contactos y entra a ${destino}`,
            inicial: creando?.empresa ? { empresa: creando.empresa } : undefined,
            proyecto: { inicial: creando?.proyecto, sugerencias: sugerencias(creando?.empresa ?? "") },
          }}
          onCerrar={() => setCreando(null)}
          onGuardado={(c, r) => {
            setCreando(null)
            const nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || c.empresa
            toast.success(
              r.yaEnCrm
                ? `${nombre} ya tenía proyectos en este CRM`
                : r.yaExistia
                  ? `${nombre} ya estaba en Contactos: se sumó al CRM`
                  : `${nombre} se cargó en Contactos y en el CRM`
            )
            // Una fila nueva sí hay que pedirla: es la única recarga del CRM.
            void qc.invalidateQueries({ queryKey: clave })
            void qc.invalidateQueries({ queryKey: ["marketing"], refetchType: "none" })
            if (typeof r.oportunidadId === "string") setAbiertaId(r.oportunidadId)
          }}
        />

        <ConfirmarDialog
          abierto={aQuitar !== null}
          titulo={aQuitar && aQuitar.length > 1 ? `¿Quitar ${aQuitar.length} del CRM?` : "¿Quitar del CRM?"}
          descripcion="Sale del seguimiento con su historial. La persona sigue en Contactos y se puede volver a mandar."
          confirmar="Quitar"
          tono="warning"
          onCerrar={() => setAQuitar(null)}
          onConfirmar={quitar}
        />
      </PageBody>
    </>
  )
}

/* ── El equipo ────────────────────────────────────────────────────────────── */

/**
 * De quién es el CRM que se mira: "Todos" y los avatares del equipo, juntos,
 * en la cabecera. El elegido lleva un anillo.
 */
function Equipo({
  equipo,
  ownerId,
  yoId,
  onElegir,
  onPrecargar,
}: {
  equipo: { id: string; nombre: string; activas: number }[]
  ownerId: string
  yoId: string
  onElegir: (id: string) => void
  onPrecargar: (id: string) => void
}) {
  const todos = ownerId === EQUIPO
  return (
    <div className="mr-1 flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      <button
        type="button"
        onClick={() => onElegir(EQUIPO)}
        onMouseEnter={() => onPrecargar(EQUIPO)}
        aria-pressed={todos}
        title="Los CRM de todo el equipo"
        className={cn(
          "flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium transition-[box-shadow,background-color] duration-150",
          todos ? "bg-ink text-n-25" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
        )}
      >
        <Users className="h-3 w-3" />
        Todos
      </button>
      {equipo.map((u) => {
        const on = u.id === ownerId
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => onElegir(u.id)}
            onMouseEnter={() => onPrecargar(u.id)}
            onFocus={() => onPrecargar(u.id)}
            aria-pressed={on}
            title={`${u.id === yoId ? "Mi CRM" : `CRM de ${u.nombre}`} · ${plural(u.activas, "proyecto abierto", "proyectos abiertos")}`}
            className={cn(
              "relative rounded-full transition-[box-shadow,opacity] duration-150",
              on ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : "hover:ring-1 hover:ring-line-strong"
            )}
          >
            <Avatar id={u.id} nombre={u.nombre} size="sm" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * La vista de quien lidera ventas: cómo viene cada uno. Abiertas, en
 * negociación, vencidas y sin movimiento hoy; ganadas y perdidas en el mes.
 * Un click en una persona abre su CRM.
 */
function ResumenEquipo({
  oportunidades,
  equipo,
  onElegir,
}: {
  oportunidades: Oportunidad[]
  equipo: { id: string; nombre: string }[]
  onElegir: (id: string) => void
}) {
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const delMes = (o: Oportunidad) => new Date(o.updatedAt) >= inicioMes

  const filas = equipo.map((u) => {
    const suyas = oportunidades.filter((o) => o.ownerId === u.id)
    const k = calcularKpis(suyas)
    return {
      ...u,
      activas: k.activas,
      negociacion: k.negociacion,
      vencidas: k.vencidas,
      quietas: suyas.filter(esEstancada).length,
      ganadas: suyas.filter((o) => o.estado === "ganada" && delMes(o)).length,
      perdidas: suyas.filter((o) => o.estado === "perdida" && delMes(o)).length,
    }
  })

  const celda = (n: number, tono?: string) => (
    <td className={cn("num text-right", n === 0 ? "text-ink-faint" : (tono ?? "text-ink"))}>{n}</td>
  )

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr className="[&_th]:h-9 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface-subtle [&_th]:px-3 [&_th]:text-right [&_th]:text-[12px] [&_th]:font-medium [&_th]:text-ink-muted">
            <th className="!text-left">Persona</th>
            <th>Abiertos</th>
            <th>En negociación</th>
            <th>Vencidas</th>
            <th>Sin movimiento</th>
            <th>Ganados este mes</th>
            <th>Perdidos este mes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.id}
              onClick={() => onElegir(f.id)}
              className="cursor-pointer transition-colors hover:bg-surface-subtle [&_td]:h-11 [&_td]:border-b [&_td]:border-line-soft [&_td]:px-3 last:[&_td]:border-b-0"
            >
              <td>
                <span className="flex items-center gap-2.5">
                  <Avatar id={f.id} nombre={f.nombre} size="sm" />
                  <span className="font-medium text-ink">{f.nombre}</span>
                </span>
              </td>
              {celda(f.activas)}
              {celda(f.negociacion)}
              {celda(f.vencidas, "font-medium text-danger-text")}
              {celda(f.quietas, "text-warning-text")}
              {celda(f.ganadas, "font-medium text-success-text")}
              {celda(f.perdidas, "text-ink-secondary")}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Piezas de la fila ───────────────────────────────────────────────────── */

const Vacio = () => <span className="text-ink-faint">—</span>

function Texto({ valor, className }: { valor: string | null; className?: string }) {
  if (!valor) return <Vacio />
  return (
    <p className={cn("truncate text-ink-secondary", className)} title={valor}>
      {valor}
    </p>
  )
}

/**
 * La etapa, editable: un select nativo con forma de campo. El borde y la
 * flecha están siempre, así se ve que se puede cambiar; y al ser nativo abre la
 * lista del sistema, sin animaciones propias que parpadeen.
 */
function SelectorEtapa({ estado, onCambio }: { estado: EstadoCrm; onCambio: (e: EstadoCrm) => void }) {
  return (
    <label className="relative flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface py-[3px] pl-2 pr-1.5 transition-colors hover:border-line-strong focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ESTADO_CRM_ESTILO[estado].punto)} />
      <span className="flex-1 truncate text-[12.5px] text-ink">{ESTADO_CRM_LABEL[estado]}</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-ink-muted" />
      <select
        value={estado}
        onChange={(e) => onCambio(e.target.value as EstadoCrm)}
        aria-label="Etapa"
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {ESTADOS_CRM.map((e) => (
          <option key={e} value={e}>
            {ESTADO_CRM_LABEL[e]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** El % de cierre como una barrita corta: se compara de un vistazo entre filas. */
function BarraCierre({ valor }: { valor: number }) {
  return (
    <span className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-surface-muted">
      <span
        className={cn("block h-full rounded-full transition-[width] duration-300", valor === 100 ? "bg-success" : "bg-brand-500")}
        style={{ width: `${valor}%` }}
      />
    </span>
  )
}

/** El % de cierre, editable: un select nativo, igual que la etapa. */
function SelectorCierre({ valor, onCambio }: { valor: number; onCambio: (n: number) => void }) {
  return (
    <label className="relative flex w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-line bg-surface py-[3px] pl-2 pr-1.5 transition-colors hover:border-line-strong focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
      <BarraCierre valor={valor} />
      <span className="num min-w-0 flex-1 text-right text-[12.5px] text-ink">{valor}%</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-ink-muted" />
      <select
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        aria-label="Porcentaje de cierre"
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {PORCENTAJES.map((p) => (
          <option key={p} value={p}>
            {p}%{p === 100 ? " · Cerrado/Ganado" : ""}
          </option>
        ))}
      </select>
    </label>
  )
}

function Cierre({ valor }: { valor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <BarraCierre valor={valor} />
      <span className="num text-ink-secondary">{valor}%</span>
    </span>
  )
}

/**
 * El encabezado de una empresa con varios proyectos: cuántos son y cuántos
 * siguen abiertos. Se pliega, elige todos los suyos y suma otro.
 */
function EncabezadoEmpresa({
  empresa,
  filas,
  plegada,
  seleccion,
  onSeleccionar,
  onPlegar,
  onEmpresa,
  onNuevoProyecto,
}: {
  empresa: string
  filas: Oportunidad[]
  plegada: boolean
  /** `null`: no hay ninguno que se pueda elegir. */
  seleccion: "todas" | "algunas" | "ninguna" | null
  onSeleccionar: () => void
  onPlegar: () => void
  onEmpresa: () => void
  onNuevoProyecto?: () => void
}) {
  const abiertos = filas.filter((o) => ESTA_ABIERTA(o.estado)).length
  const personas = new Set(filas.map((o) => o.contacto.id)).size
  return (
    <tr
      className={cn(
        "bg-surface-subtle [&_td]:h-10 [&_td]:border-b [&_td]:border-t [&_td]:border-line [&_td]:border-b-line-soft",
        !plegada && FILETE_GRUPO
      )}
    >
      <td className="!pl-4">
        <input
          type="checkbox"
          className="checkbox"
          checked={seleccion === "todas"}
          ref={(el) => {
            if (el) el.indeterminate = seleccion === "algunas"
          }}
          onChange={onSeleccionar}
          disabled={seleccion === null}
          aria-label={`Seleccionar los proyectos de ${empresa}`}
        />
      </td>
      <td colSpan={12} className="pr-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPlegar}
            aria-expanded={!plegada}
            aria-label={plegada ? `Mostrar los proyectos de ${empresa}` : `Plegar ${empresa}`}
            className="rounded p-0.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-150", !plegada && "rotate-90")} />
          </button>
          <button
            type="button"
            onClick={onEmpresa}
            className="truncate text-[13px] font-semibold text-ink underline-offset-2 hover:underline"
          >
            {empresa}
          </button>
          <span className="truncate text-[12.5px] text-ink-muted">
            {plural(filas.length, "proyecto", "proyectos")}
            {` · ${plural(abiertos, "abierto", "abiertos")}`}
            {personas > 1 && ` · ${personas} personas`}
          </span>
          {onNuevoProyecto && (
            <Button size="xs" variant="ghost" className="ml-auto text-ink-muted hover:text-ink" onClick={onNuevoProyecto}>
              <Plus />
              Proyecto
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

/** La etapa como punto y texto: se lee como dato, no como botón. */
function Etapa({ estado }: { estado: EstadoCrm }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink">
      <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", ESTADO_CRM_ESTILO[estado].punto)} />
      {ESTADO_CRM_LABEL[estado]}
    </span>
  )
}

function FechaProxima({ o }: { o: Oportunidad }) {
  if (!o.fechaProxima) return <Vacio />
  const dias = diasHasta(o.fechaProxima)
  const abierta = ESTA_ABIERTA(o.estado)
  const vencida = abierta && dias !== null && dias < 0
  return (
    <span
      className={cn("num whitespace-nowrap", vencida ? "font-medium text-danger-text" : "text-ink-secondary")}
      title={vencida ? `Vencida hace ${-dias!} día${dias === -1 ? "" : "s"}` : undefined}
    >
      {abierta && dias === 0 ? "Hoy" : fechaCorta(o.fechaProxima)}
    </span>
  )
}

/** El filete de la izquierda que une el encabezado de una empresa con sus proyectos. */
const FILETE_GRUPO = "[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-brand-300)]"

function FilaOportunidad({
  o,
  enGrupo,
  cierraGrupo,
  esEquipo,
  editable,
  seleccionado,
  activa,
  onAlternar,
  onAbrir,
  onEstado,
  onCierre,
  onRegistrar,
  onEscribir,
  onEmpresa,
  onPresupuesto,
  onNuevoProyecto,
  onQuitar,
}: {
  o: Oportunidad
  /** Va bajo el encabezado de su empresa: la empresa ya se lee arriba. */
  enGrupo: boolean
  cierraGrupo: boolean
  esEquipo: boolean
  editable: boolean
  seleccionado: boolean
  activa: boolean
  onAlternar: () => void
  onAbrir: () => void
  onEstado: (e: EstadoCrm) => void
  onCierre: (n: number) => void
  onRegistrar: (t: TipoActividad) => void
  onEscribir: () => void
  onEmpresa: () => void
  onPresupuesto: () => void
  onNuevoProyecto?: () => void
  onQuitar: () => void
}) {
  const c = o.contacto
  const persona = nombreDe(o)
  const quieta = esEstancada(o)
  return (
    <tr
      onClick={onAbrir}
      className={cn(
        "group cursor-pointer [&_td]:h-11 [&_td]:border-b [&_td]:border-line-soft [&_td]:px-2 [&_td]:align-middle",
        enGrupo && FILETE_GRUPO,
        cierraGrupo && "[&_td]:border-line",
        seleccionado || activa ? "bg-brand-50/50" : enGrupo ? "bg-surface-subtle/40 hover:bg-surface-subtle" : "hover:bg-surface-subtle",
        o.estado === "perdida" && "text-ink-muted"
      )}
    >
      <td className="!pl-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="checkbox"
          checked={seleccionado}
          onChange={onAlternar}
          disabled={!editable}
          aria-label={`Seleccionar a ${persona}`}
        />
      </td>
      <td>
        {esEquipo ? (
          <Avatar id={o.ownerId} nombre={o.ownerNombre} size="sm" />
        ) : (
          <Avatar id={c.amId} nombre={c.amNombre} size="sm" />
        )}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {/* Dentro de un grupo la empresa ya está en el encabezado. */}
        {!enGrupo && (
          <button
            type="button"
            onClick={onEmpresa}
            title={`Ver ${c.empresa}`}
            className="block max-w-full truncate font-medium text-ink underline-offset-2 hover:underline"
          >
            {c.empresa}
          </button>
        )}
      </td>
      <td>
        <p className="flex min-w-0 items-center gap-1.5" title={persona}>
          <span className="truncate text-ink">{persona}</span>
          {o.presupuesto && (
            <span title={`Presupuesto #${o.presupuesto.numero}`}>
              <FileText className="h-3 w-3 shrink-0 text-ink-faint" />
            </span>
          )}
        </p>
      </td>
      <td>
        <Texto valor={c.cargo} />
      </td>
      <td>
        {o.proyecto ? (
          <Texto valor={o.proyecto} className={cn("text-ink", enGrupo && "font-medium")} />
        ) : (
          <span className="text-[12px] italic text-ink-faint">Sin nombre</span>
        )}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {editable ? <SelectorEtapa estado={o.estado} onCambio={onEstado} /> : <Etapa estado={o.estado} />}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {editable ? <SelectorCierre valor={o.probabilidad} onCambio={onCierre} /> : <Cierre valor={o.probabilidad} />}
      </td>
      <td>
        <p className="flex min-w-0 items-center gap-1.5">
          {quieta && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
              title={`Sin movimiento hace ${diasDesde(o.ultimoMovimiento)} días`}
            />
          )}
          {o.proximaAccion ? (
            <span className="truncate text-ink-secondary" title={o.proximaAccion}>
              {o.proximaAccion}
            </span>
          ) : (
            <Vacio />
          )}
        </p>
      </td>
      <td>
        <FechaProxima o={o} />
      </td>
      <td className="num whitespace-nowrap text-ink-secondary">{o.ultimoContacto ? fechaCorta(o.ultimoContacto) : <Vacio />}</td>
      <td>
        <Texto valor={o.motivoPerdida} />
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
          {(cerrar) => {
            const y = (f: () => void) => () => {
              cerrar()
              f()
            }
            return (
              <>
                {editable && (
                  <>
                    <MenuRotulo>Registrar</MenuRotulo>
                    <MenuItem onClick={y(() => onRegistrar("llamada"))}>
                      <PhoneCall />
                      Llamada…
                    </MenuItem>
                    <MenuItem onClick={y(() => onRegistrar("reunion"))}>
                      <Users />
                      Reunión…
                    </MenuItem>
                    <MenuItem onClick={y(() => onRegistrar("email"))}>
                      <Mail />
                      Mail…
                    </MenuItem>
                    <MenuSeparador />
                  </>
                )}
                <MenuItem onClick={y(onEscribir)} disabled={!c.email && !c.telefono}>
                  <MessageSquare />
                  Escribir con plantilla…
                </MenuItem>
                <MenuItem onClick={y(onEmpresa)}>
                  <Building2 />
                  Ver {c.empresa}
                </MenuItem>
                {onNuevoProyecto && (
                  <MenuItem onClick={y(onNuevoProyecto)}>
                    <Plus />
                    Otro proyecto en {c.empresa}…
                  </MenuItem>
                )}
                {(o.presupuesto || editable) && (
                  <MenuItem onClick={y(onPresupuesto)}>
                    <FileText />
                    {o.presupuesto ? `Ver presupuesto #${o.presupuesto.numero}` : "Crear presupuesto…"}
                  </MenuItem>
                )}
                <MenuItem onClick={y(onAbrir)}>
                  <Eye />
                  Ver detalle
                </MenuItem>
                {editable && (
                  <>
                    <MenuSeparador />
                    <MenuItem tono="danger" onClick={y(onQuitar)}>
                      <Trash2 />
                      Quitar del CRM
                    </MenuItem>
                  </>
                )}
              </>
            )
          }}
        </Menu>
      </td>
    </tr>
  )
}

function TarjetaOportunidad({
  o,
  editable,
  seleccionado,
  onAlternar,
  onAbrir,
}: {
  o: Oportunidad
  editable: boolean
  seleccionado: boolean
  onAlternar: () => void
  onAbrir: () => void
}) {
  const c = o.contacto
  const persona = nombreDe(o)
  return (
    <li onClick={onAbrir} className={cn("flex cursor-pointer items-start gap-3 px-4 py-3", seleccionado && "bg-brand-50/50")}>
      {editable && (
        <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="checkbox" checked={seleccionado} onChange={onAlternar} aria-label={`Seleccionar a ${persona}`} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[14px] font-medium text-ink">{persona}</p>
          <span className="shrink-0 text-[12.5px]">
            <Etapa estado={o.estado} />
          </span>
        </div>
        <p className="truncate text-[12.5px] text-ink-muted">{[c.cargo, c.empresa].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 flex items-center justify-between gap-3 text-[12.5px]">
          <span className="truncate text-ink">{o.proyecto ?? <span className="text-ink-faint">Sin proyecto</span>}</span>
          <Cierre valor={o.probabilidad} />
        </p>
        {(o.proximaAccion || o.fechaProxima) && (
          <p className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-secondary">
            {esEstancada(o) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
            <span className="truncate">{o.proximaAccion ?? "Próxima acción"}</span>
            {o.fechaProxima && (
              <>
                <span className="text-ink-faint">·</span>
                <FechaProxima o={o} />
              </>
            )}
          </p>
        )}
      </div>
    </li>
  )
}
