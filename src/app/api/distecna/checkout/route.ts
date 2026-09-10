import { exigirModulo } from "@/lib/guard-api"
import {
  DIRECCION_ENTREGA_ESPERADA,
  formatearDireccion,
  getDefaultDeliveryAddress,
  getPaymentTerm,
  isDistecnaConfigured,
  DistecnaError,
} from "@/lib/distecna-v2"

// Las lecturas de Distecna en produccion pueden tardar bastante (16s+); le damos
// margen para que el checkout no corte por el default de 10s de Vercel.
export const maxDuration = 60

// Contexto necesario para armar un pedido: condicion de pago y direccion de
// entrega de la cuenta. Los dos son opcionales en POST /v2/Order, asi que un
// fallo parcial no bloquea nada — el pedido se puede mandar con los defaults de
// la cuenta. La direccion no se elige: es siempre la misma (ver
// getDefaultDeliveryAddress).
export async function GET() {
  const sinPermiso = await exigirModulo("productos")
  if (sinPermiso) return sinPermiso

  if (!isDistecnaConfigured()) {
    return Response.json({
      configured: false,
      environment: null,
      paymentTerm: null,
      deliveryAddress: null,
      warning:
        "Faltan las variables de entorno de Distecna V2. Los pedidos están deshabilitados.",
    })
  }

  try {
    const [paymentTerm, direccion] = await Promise.all([
      // 404 = la cuenta no tiene condicion de pago configurada. No es fatal.
      getPaymentTerm().catch((err: unknown) => {
        if (err instanceof DistecnaError && err.status === 404) return null
        throw err
      }),
      getDefaultDeliveryAddress().catch(() => null),
    ])

    return Response.json({
      configured: true,
      environment: process.env.DISTECNA_ENV ?? "qa",
      paymentTerm,
      deliveryAddress: direccion
        ? { id: direccion.id, label: formatearDireccion(direccion) }
        : null,
      // Sin la direccion fija en la lista de la cuenta el pedido igual sale, pero
      // Distecna lo despacha a su direccion default — alguna de las viejas, que ya
      // no usamos. Es lo bastante grave como para decirlo en la pantalla.
      addressWarning: direccion
        ? null
        : `Distecna no tiene ${DIRECCION_ENTREGA_ESPERADA} entre las direcciones de entrega de la cuenta. ` +
          `El pedido va a salir con la dirección default de Distecna: pedile a tu contacto que dé de alta la de Irala.`,
    })
  } catch (err) {
    console.error("[/api/distecna/checkout GET]", err)
    const message =
      err instanceof DistecnaError ? err.message : "No se pudo contactar a Distecna"

    // Distecna esta configurado; lo que fallo fue la lectura del contexto. Son
    // dos cosas distintas y hay que decirlas distinto: condicion de pago y
    // direccion son opcionales en POST /v2/Order, asi que el pedido se puede
    // mandar igual con los defaults de la cuenta. Devolver un 502 pelado tiraba
    // ese dato a la basura y el front terminaba mostrando "no esta configurado"
    // ante cualquier timeout del servidor de Distecna, que es lento y corta
    // seguido.
    return Response.json({
      configured: true,
      environment: process.env.DISTECNA_ENV ?? "qa",
      paymentTerm: null,
      deliveryAddress: null,
      warning: message,
    })
  }
}
