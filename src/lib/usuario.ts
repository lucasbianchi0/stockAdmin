import type { User } from "@supabase/supabase-js"

/**
 * Cómo se llama la persona detrás de una sesión.
 *
 * No hay tabla de perfiles y no vale la pena crear una para esto: los usuarios
 * se dan de alta a mano desde el panel de Supabase, son menos de diez y lo
 * único que hace falta es una firma legible al pie de lo que escriben.
 *
 * El orden de búsqueda va de lo más deliberado a lo más automático. Si alguien
 * se tomó el trabajo de cargar `nombre` en el metadata, ese gana; si no, se
 * arma uno con la parte local del mail, que es lo que la empresa ya usa como
 * identidad ("lucas.bianchi@" → "Lucas Bianchi").
 *
 * Nunca devuelve vacío: un nombre en blanco rompe la firma de la plantilla y
 * es peor que un "Alguien" honesto.
 */
export function nombreDeUsuario(user: User | null): string {
  if (!user) return "Alguien"

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  for (const clave of ["nombre", "full_name", "name", "display_name"]) {
    const v = meta[clave]
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 80)
  }

  const local = (user.email ?? "").split("@")[0]
  if (!local) return "Alguien"

  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .slice(0, 80)
}

/**
 * Una o dos letras para el avatar.
 *
 * Dos palabras dan iniciales de verdad; una sola da sus dos primeras letras, que
 * distingue mucho mejor que una inicial suelta —con seis personas en el equipo,
 * dos "M" son inevitables—.
 */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
