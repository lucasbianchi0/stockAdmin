import {
  getDeliveryAddresses,
  getPaymentTerm,
  isDistecnaConfigured,
  DistecnaError,
} from "@/lib/distecna-v2"

// Contexto necesario para armar un pedido: condicion de pago y direcciones de la
// cuenta. Los dos son opcionales en POST /v2/Order, asi que un fallo parcial no
// bloquea nada — el pedido se puede mandar con los defaults de la cuenta.
export async function GET() {
  if (!isDistecnaConfigured()) {
    return Response.json({
      configured: false,
      environment: null,
      paymentTerm: null,
      addresses: [],
      warning:
        "Faltan las variables de entorno de Distecna V2. Los pedidos están deshabilitados.",
    })
  }

  try {
    const [paymentTerm, addresses] = await Promise.all([
      // 404 = la cuenta no tiene condicion de pago configurada. No es fatal.
      getPaymentTerm().catch((err: unknown) => {
        if (err instanceof DistecnaError && err.status === 404) return null
        throw err
      }),
      getDeliveryAddresses().catch(() => []),
    ])

    return Response.json({
      configured: true,
      environment: process.env.DISTECNA_ENV ?? "qa",
      paymentTerm,
      addresses,
    })
  } catch (err) {
    console.error("[/api/distecna/checkout GET]", err)
    const message =
      err instanceof DistecnaError ? err.message : "No se pudo contactar a Distecna"
    return Response.json({ error: message }, { status: 502 })
  }
}
