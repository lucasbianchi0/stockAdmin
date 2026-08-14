import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { esCuitValido, normalizarCuit } from "@/lib/admin/cuit"
import {
  LARGO_MAX,
  emailPlausible,
  esFormaJuridica,
  esOrigen,
  textoONull,
  type Cliente,
  type Entidad,
} from "@/lib/admin/entidades"

/**
 * La lógica de servidor de clientes y proveedores.
 *
 * Vive acá y no dentro de `route.ts` por dos razones. La de fondo: proveedores
 * (fase 7) valida exactamente igual, y una segunda copia de la validación de
 * CUIT es una copia que se va a desincronizar. La inmediata: Next.js solo acepta
 * los handlers HTTP como exports de un `route.ts` —cualquier otro export rompe
 * el build—, así que compartir código entre rutas obliga a sacarlo afuera.
 */

/** Techo por pedido. Sin él, `?porPagina=100000` convierte la paginación en
 *  decoración y baja la tabla entera igual. */
export const POR_PAGINA_MAX = 100

export type TablaEntidad = "clientes" | "proveedores"

type Fila = Record<string, unknown>

export type Validacion = { fila: Fila } | { error: string; status: number }

/**
 * Todo lo que la base no puede garantizar sola, más lo que sí puede pero
 * conviene explicar mejor.
 *
 * El chequeo de CUIT duplicado de acá es una cortesía —da un mensaje con el
 * nombre de la empresa que ya lo tiene— y no la barrera: entre este SELECT y el
 * INSERT alguien más puede cargar el mismo CUIT. La barrera es el índice único,
 * y por eso el handler igual traduce el 23505.
 */
export async function validarEntidad(
  raw: Record<string, unknown>,
  opciones: { excluirId?: string; tabla?: TablaEntidad } = {}
): Promise<Validacion> {
  const { excluirId, tabla = "clientes" } = opciones

  const razonSocial = textoONull(raw.razonSocial, LARGO_MAX.razonSocial)
  if (!razonSocial) {
    return { error: "La razón social es obligatoria", status: 400 }
  }

  const origen = esOrigen(raw.origen) ? raw.origen : "nacional"

  const cuit = normalizarCuit(typeof raw.cuit === "string" ? raw.cuit : null)
  if (cuit) {
    if (!esCuitValido(cuit)) {
      return { error: "El CUIT no es válido — revisá los dígitos", status: 400 }
    }

    let dup = supabase.from(tabla).select("razon_social").eq("cuit", cuit).limit(1)
    if (excluirId) dup = dup.neq("id", excluirId)
    const { data: existente } = await dup.maybeSingle()

    if (existente) {
      return { error: `Ese CUIT ya está cargado en «${existente.razon_social}»`, status: 409 }
    }
  }

  const email = textoONull(raw.email)
  if (email && !emailPlausible(email)) {
    return { error: "El email no parece válido", status: 400 }
  }

  const dias = raw.condicionPagoDias
  let condicionPagoDias: number | null = null
  if (dias !== null && dias !== undefined && dias !== "") {
    const n = Number(dias)
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      return { error: "Los días de plazo tienen que ser un número entre 0 y 3650", status: 400 }
    }
    condicionPagoDias = n
  }

  const fila: Fila = {
    razon_social: razonSocial,
    origen,
    cuit,
    forma_juridica: esFormaJuridica(raw.formaJuridica) ? raw.formaJuridica : null,
    contacto: textoONull(raw.contacto),
    direccion: textoONull(raw.direccion),
    provincia: textoONull(raw.provincia),
    telefono: textoONull(raw.telefono),
    email,
    condicion_pago_dias: condicionPagoDias,
    // La FK contra `plan_cuentas` valida que exista; acá solo se distingue "no
    // eligieron ninguna" de "eligieron esta". Un string vacío entraría como
    // cadena vacía y rompería la FK con un error críptico.
    cuenta_contable_id: typeof raw.cuentaContableId === "string" && raw.cuentaContableId
      ? raw.cuentaContableId
      : null,
    notas: textoONull(raw.notas, LARGO_MAX.notas),
  }

  if (typeof raw.activo === "boolean") fila.activo = raw.activo

  // El vendedor llega como nombre y no como id: no hay pantalla de ABM de
  // vendedores todavía, y obligar a crear uno en otro lado antes de poder dar de
  // alta un cliente es fricción sin contrapartida. Se busca por nombre y, si no
  // existe, se crea.
  if (tabla === "clientes") {
    const vendedor = textoONull(raw.vendedor)
    fila.vendedor_id = vendedor ? await idDeVendedor(vendedor) : null
  }

  return { fila }
}

async function idDeVendedor(nombre: string): Promise<string | null> {
  const { data: existente } = await supabase
    .from("vendedores")
    .select("id")
    .ilike("nombre", nombre)
    .limit(1)
    .maybeSingle()

  if (existente) return existente.id

  const { data, error } = await supabase
    .from("vendedores")
    .insert({ nombre })
    .select("id")
    .single()

  if (error) {
    console.error("[vendedores insert]", error)
    return null
  }
  return data.id
}

/**
 * PostgREST arma el `or` con una lista separada por comas y paréntesis para
 * agrupar, así que esos caracteres dentro del texto buscado rompen el filtro
 * entero — y no con un error, sino con resultados silenciosamente equivocados.
 */
export function escaparParaOr(q: string): string {
  return q.replace(/[,()\\]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Los términos de búsqueda de una ficha. El CUIT va aparte del texto libre
 * porque quien lo copia de una factura lo trae con guiones y en la base está sin
 * ellos: sin este término, buscar `30-50054729-0` no encuentra nada y parece que
 * el cliente no existe.
 */
export function terminosDeBusqueda(q: string): string {
  const texto = escaparParaOr(q)
  const digitos = normalizarCuit(q)

  const terminos = [
    `razon_social.ilike.%${texto}%`,
    `email.ilike.%${texto}%`,
    `contacto.ilike.%${texto}%`,
  ]
  if (digitos) terminos.push(`cuit.ilike.%${digitos}%`)

  return terminos.join(",")
}

/** El 23505 de Postgres es la violación de unicidad: dos personas cargaron el
 *  mismo CUIT a la vez y el SELECT previo no llegó a verlo. */
export function respuestaDeErrorDeBase(
  error: { code?: string; message?: string },
  accion: string,
  entidad = "el cliente"
) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "Ese CUIT ya está cargado en otra ficha" }, { status: 409 })
  }
  console.error(`[${entidad} ${accion}]`, error)
  return NextResponse.json({ error: `No se pudo ${accion} ${entidad}` }, { status: 500 })
}

type FilaConVendedor = Record<string, unknown> & {
  vendedor?: { id: string; nombre: string } | null
}

/** Los campos que clientes y proveedores comparten, que son casi todos. */
function aEntidad(fila: Record<string, unknown>): Entidad {
  return {
    id: fila.id as string,
    razonSocial: fila.razon_social as string,
    origen: fila.origen as Entidad["origen"],
    cuit: (fila.cuit as string | null) ?? null,
    formaJuridica: (fila.forma_juridica as Entidad["formaJuridica"]) ?? null,
    contacto: (fila.contacto as string | null) ?? null,
    direccion: (fila.direccion as string | null) ?? null,
    provincia: (fila.provincia as string | null) ?? null,
    telefono: (fila.telefono as string | null) ?? null,
    email: (fila.email as string | null) ?? null,
    condicionPagoDias: (fila.condicion_pago_dias as number | null) ?? null,
    cuentaContableId: (fila.cuenta_contable_id as string | null) ?? null,
    notas: (fila.notas as string | null) ?? null,
    activo: Boolean(fila.activo),
    createdAt: fila.created_at as string,
  }
}

export function aCliente(fila: FilaConVendedor): Cliente {
  return {
    ...aEntidad(fila),
    vendedorId: fila.vendedor?.id ?? null,
    vendedorNombre: fila.vendedor?.nombre ?? null,
  }
}

/** Un proveedor viaja con la misma forma que un cliente para que la UI sea una
 *  sola: `vendedorNombre` va nulo y el formulario simplemente no lo muestra. */
export function aProveedor(fila: Record<string, unknown>): Cliente {
  return { ...aEntidad(fila), vendedorId: null, vendedorNombre: null }
}
