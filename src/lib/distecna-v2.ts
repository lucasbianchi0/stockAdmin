// Cliente de la API V2 de Distecna. Solo servidor — usa credenciales de entorno.
//
// La V1 (api.distecna.com:8096, x-apikey) sigue siendo la fuente del catalogo.
// V2 se usa unicamente para lo que la V1 no expone: condicion de pago,
// direcciones de entrega y creacion de pedidos.
//
// Migrar de QA a produccion es solo cambiar las variables de entorno; las rutas
// y los payloads son identicos en ambos entornos.

const AUTH_URL = process.env.DISTECNA_AUTH_URL
const API_URL = process.env.DISTECNA_API_URL
const USER = process.env.DISTECNA_USER
const PASS = process.env.DISTECNA_PASS
const APP = process.env.DISTECNA_APP ?? "API"

// El token vive 1 hora. Lo renovamos con 5 minutos de margen para no quedarnos
// sin token en medio de una secuencia de peticiones.
const TOKEN_TTL_MS = 55 * 60 * 1000

let cachedToken: { token: string; expiresAt: number } | null = null

export class DistecnaError extends Error {
  status: number
  traceId: string | null

  constructor(message: string, status: number, traceId: string | null = null) {
    super(message)
    this.name = "DistecnaError"
    this.status = status
    this.traceId = traceId
  }
}

export interface DistecnaPaymentTerm {
  id: string
  code: string
  name: string
}

export interface DistecnaDeliveryAddress {
  id: string
  name: string
  street: string
  number: string
  floor: string | null
  department: string | null
  postalCode: string
  jurisdiction: string
  country: string
}

export interface DistecnaOrderLine {
  productCode: string
  productType: string
  quantity: number
}

export interface DistecnaOrderResult {
  success: boolean
  salesOrderId: string
  message: string
}

export function isDistecnaConfigured(): boolean {
  return Boolean(AUTH_URL && API_URL && USER && PASS)
}

function assertConfigured() {
  if (!isDistecnaConfigured()) {
    throw new DistecnaError(
      "Faltan las variables de entorno de Distecna V2 (DISTECNA_AUTH_URL, DISTECNA_API_URL, DISTECNA_USER, DISTECNA_PASS)",
      500
    )
  }
}

// El body de error de V2 es {statusCode, error, detail, traceId}. Lo desarmamos
// para poder mostrarle al usuario el mensaje de Distecna, que ya viene en
// castellano y es especifico ("La cantidad del producto 'X' debe ser mayor a 0.").
async function toDistecnaError(res: Response): Promise<DistecnaError> {
  let message = `HTTP ${res.status}`
  let traceId: string | null = null
  try {
    const body = await res.json()
    if (body?.error) message = String(body.error)
    else if (body?.message) message = String(body.message)
    if (body?.traceId) traceId = String(body.traceId)
  } catch {
    // respuesta sin JSON — nos quedamos con el status
  }
  return new DistecnaError(message, res.status, traceId)
}

async function login(): Promise<string> {
  assertConfigured()
  const res = await fetch(`${AUTH_URL}/Auth/${APP}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: USER, password: PASS }),
  })
  if (!res.ok) throw await toDistecnaError(res)

  // La respuesta es el JWT crudo, no un objeto. Segun el entorno viene con o sin
  // comillas de JSON, asi que normalizamos.
  const raw = (await res.text()).trim()
  const token = raw.startsWith('"') ? raw.slice(1, -1) : raw
  if (!token) throw new DistecnaError("El login no devolvio un token", 502)
  return token
}

async function getToken(forceRenew = false): Promise<string> {
  if (!forceRenew && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }
  const token = await login()
  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS }
  return token
}

// Un 401 significa token vencido o invalido. Reintentamos una sola vez con un
// token nuevo; si vuelve a fallar, es un problema de credenciales y propagamos.
async function v2Fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertConfigured()

  const call = async (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

  let res = await call(await getToken())
  if (res.status === 401) {
    res = await call(await getToken(true))
  }
  if (!res.ok) throw await toDistecnaError(res)

  return (await res.json()) as T
}

export function getPaymentTerm(): Promise<DistecnaPaymentTerm> {
  return v2Fetch<DistecnaPaymentTerm>("/v2/PaymentTerms")
}

export function getDeliveryAddresses(): Promise<DistecnaDeliveryAddress[]> {
  return v2Fetch<DistecnaDeliveryAddress[]>("/v2/DeliveryAddresses")
}

export function getProduct(code: string, type: string) {
  return v2Fetch<Record<string, unknown>>(
    `/v2/Product/${encodeURIComponent(code)}/${encodeURIComponent(type)}`
  )
}

export function searchProducts(search: string, limit = 50, offset = 0) {
  const qs = new URLSearchParams({
    search,
    limit: String(limit),
    offset: String(offset),
  })
  return v2Fetch<{ total: number; offset: number; products: Record<string, unknown>[] }>(
    `/v2/Product?${qs}`
  )
}

export function createOrder(payload: {
  products: DistecnaOrderLine[]
  paymentTermId?: string | null
  deliveryAddressId?: string | null
}): Promise<DistecnaOrderResult> {
  const body: Record<string, unknown> = { products: payload.products }
  // Los dos son opcionales: omitidos, Distecna usa la condicion default de la
  // cuenta y deja el pedido sin direccion asignada.
  if (payload.paymentTermId) body.paymentTermId = payload.paymentTermId
  if (payload.deliveryAddressId) body.deliveryAddressId = payload.deliveryAddressId

  return v2Fetch<DistecnaOrderResult>("/v2/Order", {
    method: "POST",
    body: JSON.stringify(body),
  })
}
