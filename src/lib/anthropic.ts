import Anthropic from "@anthropic-ai/sdk"

/**
 * El cliente de Claude para todo el backoffice.
 *
 * 9/10/2026: la cuenta de Anthropic quedó sin saldo y se pasó a OpenRouter,
 * que habla el mismo formato de mensajes (herramientas, streaming, caché,
 * pensamiento). Con OPENROUTER_API_KEY cargada todo va por ahí; sin ella,
 * vuelve a Anthropic directo con ANTHROPIC_API_KEY.
 *
 * OpenRouter nombra los modelos distinto ("anthropic/claude-sonnet-4.6" en vez
 * de "claude-sonnet-4-6"), así que el nombre se traduce acá y cada ruta sigue
 * pidiendo el modelo como siempre.
 */
const OPENROUTER_URL = "https://openrouter.ai/api"

/** "claude-sonnet-4-6" → "anthropic/claude-sonnet-4.6"; "claude-opus-5" queda igual de versión. */
export function modeloOpenRouter(modelo: string): string {
  if (modelo.includes("/")) return modelo
  return `anthropic/${modelo.replace(/-(\d+)-(\d+)$/, "-$1.$2")}`
}

/** Reescribe el modelo (y los fallbacks) del cuerpo antes de mandarlo. */
const fetchOpenRouter: typeof fetch = async (url, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const cuerpo = JSON.parse(init.body)
      if (typeof cuerpo.model === "string") cuerpo.model = modeloOpenRouter(cuerpo.model)
      if (Array.isArray(cuerpo.fallbacks)) {
        cuerpo.fallbacks = cuerpo.fallbacks.map((f: { model?: string }) =>
          typeof f?.model === "string" ? { ...f, model: modeloOpenRouter(f.model) } : f
        )
      }
      init = { ...init, body: JSON.stringify(cuerpo) }
    } catch {
      // No es JSON: va tal cual.
    }
  }
  return fetch(url, init)
}

export function crearClienteClaude(): Anthropic {
  const claveOpenRouter = process.env.OPENROUTER_API_KEY
  if (claveOpenRouter) {
    return new Anthropic({ apiKey: claveOpenRouter, baseURL: OPENROUTER_URL, fetch: fetchOpenRouter })
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

/** Para los chequeos de "falta la clave" de cada ruta. */
export const hayClaveClaude = () => Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY)
