"use client"

import { useEffect, useState } from "react"

/**
 * Qué formatos están archivados, compartido por toda la pantalla.
 *
 * El selector de template se monta una vez por pieza del calendario: sin una
 * caché común, abrir un plan de veintidós piezas dispara veintidós veces la
 * misma llamada. La promesa vive en el módulo, así que la primera la resuelve y
 * el resto se cuelga de ella.
 *
 * Los que escuchan se avisan entre sí porque archivar desde el probador tiene
 * que sacar la tarjeta de la grilla en el momento, sin recargar.
 */
const RUTA = "/api/contenido/templates/archivados"

let cache: Promise<Set<string>> | null = null
const oyentes = new Set<(archivados: Set<string>) => void>()

function cargar(): Promise<Set<string>> {
  cache ??= fetch(RUTA)
    .then((r) => (r.ok ? r.json() : { archivados: [] }))
    .then((d) => new Set<string>(d.archivados ?? []))
    // Sin la lista se muestran todos: es el mismo criterio que en el servidor,
    // de más antes que de menos.
    .catch(() => new Set<string>())
  return cache
}

function publicar(archivados: Set<string>) {
  cache = Promise.resolve(archivados)
  for (const oyente of oyentes) oyente(archivados)
}

/** `null` mientras no se sabe todavía: evita el parpadeo de mostrar los archivados. */
export function useTemplatesArchivados(): Set<string> | null {
  const [archivados, setArchivados] = useState<Set<string> | null>(null)

  useEffect(() => {
    let vivo = true
    cargar().then((s) => vivo && setArchivados(s))

    const oyente = (s: Set<string>) => vivo && setArchivados(s)
    oyentes.add(oyente)
    return () => {
      vivo = false
      oyentes.delete(oyente)
    }
  }, [])

  return archivados
}

/** Devuelve el mensaje de error, o `null` si salió bien. */
export async function cambiarArchivado(slug: string, activo: boolean): Promise<string | null> {
  let r: Response
  try {
    r = await fetch(`/api/contenido/templates/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activo }),
    })
  } catch {
    return "Error de conexión"
  }

  if (!r.ok) {
    const d = await r.json().catch(() => null)
    return d?.error ?? "No se pudo guardar"
  }

  const proximos = new Set(await cargar())
  if (activo) proximos.delete(slug)
  else proximos.add(slug)
  publicar(proximos)

  return null
}
