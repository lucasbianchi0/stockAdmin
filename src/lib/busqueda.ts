/**
 * Lo que alguien escribe en un buscador, partido en palabras comparables: en
 * minúscula y sin acentos. "Rocío  Navarro" → ["rocio", "navarro"].
 *
 * Una búsqueda encuentra algo si están TODAS las palabras, en cualquier orden
 * y en cualquier campo: así "rocio navarro" encuentra a la persona aunque
 * nombre y apellido vivan en columnas distintas, y "martin" a "Martín".
 */
export function palabrasDeBusqueda(texto: string): string[] {
  return normalizarTexto(texto).split(/\s+/).filter(Boolean)
}

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/** ¿Están todas las palabras en alguno de estos textos? Para filtrar en el navegador. */
export function coincide(palabras: string[], campos: (string | null | undefined)[]): boolean {
  if (palabras.length === 0) return true
  const pajar = normalizarTexto(campos.filter(Boolean).join(" "))
  return palabras.every((p) => pajar.includes(p))
}
