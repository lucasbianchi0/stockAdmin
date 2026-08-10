import { NextResponse } from "next/server"

/**
 * Envoltorio de handlers de administración.
 *
 * Existe por un modo de falla concreto: cuando un handler tira una excepción que
 * nadie atrapa, Next responde `Internal Server Error` en **texto plano**. El
 * cliente hace `res.json()`, eso explota con "Unexpected token 'I'", y el
 * mensaje que ve la persona no dice nada del problema real — encima tapa el
 * error verdadero, que quedó solo en la terminal del servidor.
 *
 * Con esto la respuesta siempre es JSON. En desarrollo incluye el mensaje de la
 * excepción, que es exactamente lo que hace falta para arreglarla sin tener que
 * ir a mirar la consola; en producción no, porque un stack de Postgres puede
 * filtrar nombres de columnas y estructura de la base a cualquiera que provoque
 * un error a propósito.
 */
export function ruta<T extends unknown[]>(
  nombre: string,
  handler: (req: Request, ...resto: T) => Promise<Response>
) {
  return async (req: Request, ...resto: T): Promise<Response> => {
    try {
      return await handler(req, ...resto)
    } catch (e) {
      console.error(`[${nombre}]`, e)

      const detalle = e instanceof Error ? e.message : String(e)
      return NextResponse.json(
        {
          error:
            process.env.NODE_ENV === "production"
              ? "Error interno del servidor"
              : `${nombre} — ${detalle}`,
        },
        { status: 500 }
      )
    }
  }
}
