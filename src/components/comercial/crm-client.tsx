"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  ChevronDown,
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
  PROBABILIDAD_SUGERIDA,
  URL_PENDIENTES_CRM,
  calcularKpis,
  diasDesde,
  diasHasta,
  esEstancada,
  fechaCorta,
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
type Filtros = { producto: string; fecha: string; empresa: string; vertical: string; am: string }
const SIN_FILTROS: Filtros = { producto: "", fecha: "", empresa: "", vertical: "", am: "" }
const SIN_OPCIONES: OpcionesContacto = { empresas: [], verticales: [], departamentos: [] }
type Campo = "empresa" | "contacto" | "cargo" | "producto" | "estado" | "proximaAccion" | "fechaProxima" | "ultimoContacto"

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const nombreDe = (o: Oportunidad) =>
  [o.contacto.nombre, o.contacto.apellido].filter(Boolean).join(" ") || o.contacto.email || "Sin nombre"

/** Cómo se compara cada columna al ordenar. Lo vacío va siempre al final. */
const VALOR: Record<Campo, (o: Oportunidad) => string | number | null> = {
  empresa: (o) => o.contacto.empresa.toLowerCase(),
  contacto: (o) => nombreDe(o).toLowerCase(),
  cargo: (o) => o.contacto.cargo?.toLowerCase() ?? null,
  producto: (o) => o.producto?.toLowerCase() ?? null,
  estado: (o) => ESTADOS_CRM.indexOf(o.estado),
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
  const [creando, setCreando] = useState(false)
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
    enabled: creando,
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
      if (filtros.producto && o.producto !== filtros.producto) return false
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
        o.producto,
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
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina))
  // Si un cambio de etapa vacía la última página, se vuelve a la que queda.
  const paginaReal = Math.min(pagina, totalPaginas)
  const visibles = filtradas.slice((paginaReal - 1) * porPagina, paginaReal * porPagina)
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

  const conCambios = (o: Oportunidad, c: CambiosOportunidad): Oportunidad => ({
    ...o,
    ...c,
    ultimoMovimiento: new Date().toISOString(),
    motivoPerdida:
      c.estado && c.estado !== "perdida" && !("motivoPerdida" in c) ? null : (c.motivoPerdida ?? o.motivoPerdida),
  })

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
    const cambios = { estado, probabilidad: PROBABILIDAD_SUGERIDA[estado] }
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
      if (enLote) toast.success(`${ids.length} pasaron a ${ESTADO_CRM_LABEL[estado]}`)
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
  const productos = [...new Set(todas.map((o) => o.producto).filter((p): p is string => !!p))].sort()
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
              <Button onClick={() => setCreando(true)}>
                <Plus />
                <span className="hidden sm:inline">Nuevo contacto</span>
              </Button>
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
              rotulo: e === "ganada" ? "Ganadas" : e === "perdida" ? "Perdidas" : ESTADO_CRM_LABEL[e],
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
            Oportunidades abiertas sin ningún cambio, nota ni contacto en los últimos {DIAS_ESTANCADA} días.
          </p>
        )}

        {esEquipo && <ResumenEquipo oportunidades={todas} equipo={d.equipo} onElegir={verCrmDe} />}

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
          <BarraTabla
            seleccionados={seleccion.size}
            rotuloSeleccion={(n) => plural(n, "seleccionada", "seleccionadas")}
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
                rotulo="Producto"
                valor={filtros.producto}
                onCambio={(v) => setFiltros((f) => ({ ...f, producto: v }))}
                opciones={productos.map((p) => ({ valor: p, etiqueta: p }))}
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
              {plural(filtradas.length, "oportunidad", "oportunidades")}
            </span>
          </BarraTabla>

          {todosPagina && idsFiltradas.length > idsPagina.length && (
            <div className="border-b border-line bg-brand-50/40 px-4 py-2 text-center text-[12.5px] text-ink-secondary animate-in fade-in-0 duration-150">
              {todasLasQueCoinciden ? (
                <>
                  Están elegidas las <strong className="font-semibold text-ink">{idsFiltradas.length}</strong> que
                  coinciden.{" "}
                  <button onClick={() => setSeleccion(new Set())} className="font-medium text-brand-700 hover:underline">
                    Limpiar la selección
                  </button>
                </>
              ) : (
                <>
                  Elegiste las {idsPagina.length} de esta página.{" "}
                  <button onClick={() => setSeleccion(new Set(idsFiltradas))} className="font-medium text-brand-700 hover:underline">
                    Elegir las {idsFiltradas.length} que coinciden
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
                  ? "Nadie tiene oportunidades todavía"
                  : esMio
                    ? "Tu CRM está vacío"
                    : `${primerNombre} todavía no tiene oportunidades`
              }
              description={
                esMio
                  ? "Cargá una persona acá, o elegí las que vas a trabajar en Contactos y mandalas a tu CRM."
                  : "Cuando le manden contactos van a aparecer acá."
              }
              action={
                editable ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/marketing/contactos">Elegir de Contactos</Link>
                    </Button>
                    <Button onClick={() => setCreando(true)}>
                      <Plus />
                      Nuevo contacto
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : filtradas.length === 0 ? (
            <EmptyState
              icon={Search}
              title={vista === "estancadas" ? "Nada quieto" : "No hay oportunidades acá"}
              description={
                vista === "estancadas"
                  ? `Todas las abiertas tuvieron movimiento en los últimos ${DIAS_ESTANCADA} días.`
                  : "Probá con otra pestaña o limpiá los filtros."
              }
            />
          ) : (
            <>
              {/* Las columnas del boceto, en su orden. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0 text-[13px]">
                  <colgroup>
                    <col className="w-[44px]" />
                    <col className="w-[48px]" />
                    <col className="w-[11%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[9%]" />
                    <col className="w-[158px]" />
                    <col />
                    <col className="w-[84px]" />
                    <col className="w-[84px]" />
                    <col className="w-[9%]" />
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
                      {th("producto", "Producto")}
                      {th("estado", "Estado")}
                      {th("proximaAccion", "Próxima acción")}
                      {th("fechaProxima", "Fecha próxima")}
                      {th("ultimoContacto", "Último contacto")}
                      <th>Motivo de pérdida</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((o) => (
                      <FilaOportunidad
                        key={o.id}
                        o={o}
                        esEquipo={esEquipo}
                        editable={puedeEditarFila(o)}
                        seleccionado={seleccion.has(o.id)}
                        activa={o.id === abiertaId}
                        onAlternar={() => alternar(o.id)}
                        onAbrir={() => setAbiertaId(o.id)}
                        onEstado={(e) => void cambiarEstado([o.id], e)}
                        onRegistrar={(tipo) => setRegistrando({ o, tipo })}
                        onEscribir={() => setEscribiendo(o)}
                        onEmpresa={() => setEmpresa(o.contacto.empresa)}
                        onPresupuesto={() => void abrirPresupuesto(o)}
                        onQuitar={() => setAQuitar([o.id])}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line-soft md:hidden">
                {visibles.map((o) => (
                  <TarjetaOportunidad
                    key={o.id}
                    o={o}
                    editable={puedeEditarFila(o)}
                    seleccionado={seleccion.has(o.id)}
                    onAlternar={() => alternar(o.id)}
                    onAbrir={() => setAbiertaId(o.id)}
                  />
                ))}
              </ul>

              <PaginacionTabla
                pagina={paginaReal}
                porPagina={porPagina}
                total={filtradas.length}
                unidad={filtradas.length === 1 ? "oportunidad" : "oportunidades"}
                onIr={(p) => setPagina(Math.min(Math.max(1, p), totalPaginas))}
                onPorPagina={setPorPagina}
              />
            </>
          )}
        </div>

        <OportunidadPanel
          oportunidad={abierta}
          puedeEditar={abierta ? puedeEditarFila(abierta) : false}
          productos={d.productos}
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
            referenciaInicial={[presupuestando.o.producto, presupuestando.o.contacto.empresa].filter(Boolean).join(" — ")}
            onCerrar={() => setPresupuestando(null)}
            onCreado={(id) => {
              const o = presupuestando.o
              setPresupuestando(null)
              // Queda enlazado a la oportunidad, y la oportunidad pasa a Propuesta
              // si todavía no había llegado.
              const avanza = ESTADOS_CRM.indexOf(o.estado) < ESTADOS_CRM.indexOf("propuesta")
              void guardar(o.id, {
                presupuestoId: id,
                ...(avanza ? { estado: "propuesta", probabilidad: PROBABILIDAD_SUGERIDA.propuesta } : {}),
              })
              router.push(`/comercial/presupuestos/${id}`)
            }}
          />
        )}

        <ContactoPanel
          abierto={creando}
          contacto={null}
          equipo={d.equipo}
          yoId={d.yo.id}
          opciones={opcionesQ.data ?? SIN_OPCIONES}
          alta={{
            url: "/api/comercial/crm/contactos",
            cuerpo: { ownerId: esEquipo ? d.yo.id : d.owner.id },
            boton: esMio || esEquipo ? "Crear y sumar a mi CRM" : `Crear y sumar al CRM de ${primerNombre}`,
            subtitulo:
              esMio || esEquipo
                ? "Se guarda en Contactos y entra a tu CRM"
                : `Se guarda en Contactos y entra al CRM de ${primerNombre}`,
          }}
          onCerrar={() => setCreando(false)}
          onGuardado={(c, r) => {
            setCreando(false)
            const nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || c.empresa
            toast.success(
              r.yaEnCrm
                ? `${nombre} ya estaba en este CRM`
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
            title={`${u.id === yoId ? "Mi CRM" : `CRM de ${u.nombre}`} · ${plural(u.activas, "abierta", "abiertas")}`}
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
            <th>Abiertas</th>
            <th>En negociación</th>
            <th>Vencidas</th>
            <th>Sin movimiento</th>
            <th>Ganadas este mes</th>
            <th>Perdidas este mes</th>
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

function FilaOportunidad({
  o,
  esEquipo,
  editable,
  seleccionado,
  activa,
  onAlternar,
  onAbrir,
  onEstado,
  onRegistrar,
  onEscribir,
  onEmpresa,
  onPresupuesto,
  onQuitar,
}: {
  o: Oportunidad
  esEquipo: boolean
  editable: boolean
  seleccionado: boolean
  activa: boolean
  onAlternar: () => void
  onAbrir: () => void
  onEstado: (e: EstadoCrm) => void
  onRegistrar: (t: TipoActividad) => void
  onEscribir: () => void
  onEmpresa: () => void
  onPresupuesto: () => void
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
        seleccionado || activa ? "bg-brand-50/50" : "hover:bg-surface-subtle",
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
        <button
          type="button"
          onClick={onEmpresa}
          title={`Ver ${c.empresa}`}
          className="block max-w-full truncate font-medium text-ink underline-offset-2 hover:underline"
        >
          {c.empresa}
        </button>
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
        <Texto valor={o.producto} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {editable ? (
          <SelectorEtapa estado={o.estado} onCambio={onEstado} />        ) : (
          <Etapa estado={o.estado} />
        )}
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
