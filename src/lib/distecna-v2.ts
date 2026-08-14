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

// El server de produccion de Distecna es lento e irregular: medido, algunas
// lecturas tardan 16s y otras cortan a los 25s. Ponemos timeouts explicitos para
// que una conexion colgada no se coma todo el presupuesto de la funcion (Vercel
// hobby corta a los 60s). Presupuesto pensado para caber en esos 60s aun con un
// reintento de lectura: login 20s, lecturas 25s (x2 si reintenta), pedido 45s.
const LOGIN_TIMEOUT_MS = 20 * 1000
const READ_TIMEOUT_MS = 25 * 1000
const ORDER_TIMEOUT_MS = 45 * 1000

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

// Un timeout de AbortSignal.timeout() llega como TimeoutError; un fallo de red
// (DNS, conexion rechazada, TLS) como TypeError. Los dos se ven feos si los
// dejamos propagar crudos, asi que los envolvemos en un DistecnaError 504 con un
// mensaje que le sirva al usuario. Un DistecnaError ya armado pasa de largo.
function describeFetchError(err: unknown, path: string): DistecnaError {
  if (err instanceof DistecnaError) return err
  const isTimeout = err instanceof Error && err.name === "TimeoutError"
  const message = isTimeout
    ? `Distecna no respondió a tiempo (${path}). El servidor suele estar lento; probá de nuevo en un momento.`
    : `No se pudo contactar a Distecna (${path}).`
  return new DistecnaError(message, 504)
}

async function login(): Promise<string> {
  assertConfigured()
  let res: Response
  try {
    res = await fetch(`${AUTH_URL}/Auth/${APP}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: USER, password: PASS }),
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    })
  } catch (err) {
    throw describeFetchError(err, "/Auth/login")
  }
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

interface V2FetchOptions {
  // Cuanto esperamos por la respuesta antes de abortar.
  timeoutMs?: number
  // Reintentar una vez ante timeout/error de red. Seguro solo en operaciones
  // idempotentes (lecturas): un POST /v2/Order que corta por timeout puede haber
  // creado el pedido igual, asi que ahi NO reintentamos para no duplicarlo.
  retryOnNetworkError?: boolean
}

// Un 401 significa token vencido o invalido. Reintentamos una sola vez con un
// token nuevo; si vuelve a fallar, es un problema de credenciales y propagamos.
// Los timeouts/errores de red se reintentan solo si retryOnNetworkError lo pide.
async function v2Fetch<T>(
  path: string,
  init: RequestInit = {},
  opts: V2FetchOptions = {}
): Promise<T> {
  assertConfigured()
  const timeoutMs = opts.timeoutMs ?? READ_TIMEOUT_MS

  const call = async (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

  let res: Response
  try {
    res = await call(await getToken())
  } catch (err) {
    if (!opts.retryOnNetworkError) throw describeFetchError(err, path)
    // Segundo y ultimo intento; si tambien falla, propagamos el error traducido.
    try {
      res = await call(await getToken())
    } catch (retryErr) {
      throw describeFetchError(retryErr, path)
    }
  }

  if (res.status === 401) {
    // Token vencido: reintento seguro con token nuevo (el request no se proceso).
    try {
      res = await call(await getToken(true))
    } catch (err) {
      throw describeFetchError(err, path)
    }
  }
  if (!res.ok) throw await toDistecnaError(res)

  return (await res.json()) as T
}

// Lecturas: idempotentes, asi que reintentan una vez ante timeout/error de red.
export function getPaymentTerm(): Promise<DistecnaPaymentTerm> {
  return v2Fetch<DistecnaPaymentTerm>("/v2/PaymentTerms", {}, { retryOnNetworkError: true })
}

export function getDeliveryAddresses(): Promise<DistecnaDeliveryAddress[]> {
  return v2Fetch<DistecnaDeliveryAddress[]>(
    "/v2/DeliveryAddresses",
    {},
    { retryOnNetworkError: true }
  )
}

export function getProduct(code: string, type: string) {
  return v2Fetch<Record<string, unknown>>(
    `/v2/Product/${encodeURIComponent(code)}/${encodeURIComponent(type)}`,
    {},
    { retryOnNetworkError: true }
  )
}

export function searchProducts(search: string, limit = 50, offset = 0) {
  const qs = new URLSearchParams({
    search,
    limit: String(limit),
    offset: String(offset),
  })
  return v2Fetch<{ total: number; offset: number; products: Record<string, unknown>[] }>(
    `/v2/Product?${qs}`,
    {},
    { retryOnNetworkError: true }
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

  // Timeout largo (el POST de pedidos es el mas lento) y SIN reintento de red:
  // si corta por timeout, el pedido puede haberse creado igual del lado de
  // Distecna, y reintentar lo duplicaria. La API V2 no tiene endpoint de consulta
  // para chequear antes de reintentar, asi que preferimos fallar a duplicar.
  return v2Fetch<DistecnaOrderResult>(
    "/v2/Order",
    { method: "POST", body: JSON.stringify(body) },
    { timeoutMs: ORDER_TIMEOUT_MS, retryOnNetworkError: false }
  )
}
