/**
 * Todas las filas de una consulta, en páginas.
 *
 * Supabase devuelve como mucho mil filas por pedido —aunque la consulta diga
 * `.limit(20000)`— y no avisa: el resultado parece completo. Sumas y saldos
 * del ejercicio leía 1000 de 1137 líneas y mostraba $ 708 millones de débitos
 * donde había $ 880.
 *
 * `armar` tiene que devolver la consulta **con un orden total** (que termine
 * en una columna única, como `linea_id`): sin eso las páginas se pisan o dejan
 * huecos. Se vuelve a armar en cada página porque el builder de PostgREST no
 * se puede reusar.
 */

const PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>

export async function traerTodo<T>(
  armar: () => { range: (desde: number, hasta: number) => Pagina<T> },
  tope = 100_000
): Promise<{ filas: T[]; truncado: boolean; error: unknown }> {
  const filas: T[] = []
  for (let inicio = 0; inicio < tope; inicio += PAGINA) {
    const fin = Math.min(inicio + PAGINA, tope)
    const { data, error } = await armar().range(inicio, fin - 1)
    if (error) return { filas, truncado: false, error }
    filas.push(...(data ?? []))
    if (!data || data.length < fin - inicio) return { filas, truncado: false, error: null }
  }
  return { filas, truncado: true, error: null }
}
