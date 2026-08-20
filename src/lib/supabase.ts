import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * El cliente con service role, que ignora RLS. Lo usan los handlers de API.
 *
 * Se crea la primera vez que alguien lo toca, no al importar el módulo. La
 * diferencia se ve en un solo momento y es el que rompe: durante `next build`,
 * en el paso de *Collecting page data*, Next evalúa cada módulo de ruta. Con el
 * cliente creado arriba de todo, esa evaluación llama a `createClient` con las
 * variables vacías y tira `supabaseUrl is required` — y lo que se cae no es la
 * ruta que las necesita, es el build entero, con un stack que apunta a una ruta
 * cualquiera de las 57 que importan este archivo.
 *
 * Pasó de verdad en el primer deploy de una rama: en Vercel las variables se
 * cargan por entorno, Production las tenía y Preview no, y el build murió en
 * `/api/contenido/calendario/[id]/duplicar`, que no tiene nada que ver.
 *
 * Un build no debería necesitar credenciales de runtime. Así, sin ellas el
 * build pasa y lo que falla es el primer pedido que las use, con un mensaje que
 * dice cuál falta.
 *
 * El `Proxy` es para no tocar 57 archivos: `supabase.from(...)` se sigue
 * escribiendo igual en todos lados y la creación queda acá adentro.
 */

let cliente: SupabaseClient | null = null

function conectar(): SupabaseClient {
  if (cliente) return cliente

  const url = process.env.SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !clave) {
    throw new Error(
      `Falta configurar ${!url ? "SUPABASE_URL" : "SUPABASE_SERVICE_ROLE_KEY"} en el entorno`
    )
  }

  cliente = createClient(url, clave)
  return cliente
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, propiedad) {
    const real = conectar()
    const valor = Reflect.get(real, propiedad, real)
    // Los métodos del cliente usan `this` adentro: sin el bind llegarían con el
    // proxy como `this` y romperían en la primera consulta.
    return typeof valor === "function" ? valor.bind(real) : valor
  },
})
