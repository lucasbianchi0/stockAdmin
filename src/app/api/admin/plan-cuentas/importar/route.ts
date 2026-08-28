import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { esCsv, parsearCsv } from "@/lib/admin/importar-csv"
import {
  columnasFaltantesPlan,
  leerPlanDeCuentas,
  mapearColumnasPlan,
  type FilaPlan,
  type ResultadoImportacion,
} from "@/lib/admin/plan-cuentas-importar"
import { ArchivoInvalido, esXlsx, leerXlsx } from "@/lib/admin/xlsx"

/**
 * Cargar el Excel del plan de cuentas — el punto 1 del pliego.
 *
 * DOS REGLAS QUE HACEN QUE ESTO NO DÉ MIEDO
 *
 *  1. **O entra todo o no entra nada.** Si una sola fila no se entiende, no se
 *     escribe ninguna y la respuesta dice cuál y por qué. Media planilla cargada
 *     deja el plan en un estado que nadie puede describir: no se sabe dónde se
 *     cortó, y reintentar duplica el trabajo ya hecho sin decirlo.
 *
 *  2. **Nunca borra ni desactiva.** Una cuenta que desapareció del archivo se
 *     deja intacta y se informa aparte. Borrarla se llevaría puesta la
 *     imputación de todo lo cargado contra ella —la FK es `on delete set null`,
 *     así que las facturas quedarían sin cuenta en silencio— y desactivarla es
 *     una decisión que tiene que tomar una persona mirando el listado.
 *
 * Por lo mismo, `activo` solo se escribe en el alta: si alguien desactivó una
 * cuenta desde la pantalla, volver a subir el mismo Excel no se lo revierte.
 */

const TAMANO_MAX_MB = 4

/** Las columnas que el archivo manda; `activo` no está a propósito. */
const CAMPOS: (keyof FilaPlan)[] = [
  "nombre",
  "tipo",
  "orden",
  "lleva_subcuenta",
  "tipo_subcuenta",
  "es_banco",
  "es_valores",
  "libro_iva",
  "moneda_extranjera",
  "es_medio_pago",
]

export const POST = ruta("plan-cuentas importar", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 })
  }

  const archivo = form.get("archivo")
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No adjuntaste ningún archivo" }, { status: 400 })
  }
  if (!esXlsx(archivo.name) && !esCsv(archivo.name)) {
    return NextResponse.json(
      {
        error:
          "El plan tiene que venir en .xlsx o .csv. El .xls viejo de Excel 97 no se puede leer: abrilo y guardalo como .xlsx.",
      },
      { status: 400 }
    )
  }
  if (archivo.size > TAMANO_MAX_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `El archivo pesa más de ${TAMANO_MAX_MB} MB` },
      { status: 400 }
    )
  }

  /* ── El archivo a grilla ──────────────────────────────────────────────── */

  let grilla
  try {
    grilla = esXlsx(archivo.name)
      ? leerXlsx(await archivo.arrayBuffer())
      : parsearCsv(new TextDecoder("utf-8").decode(await archivo.arrayBuffer()))
  } catch (e) {
    if (e instanceof ArchivoInvalido) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
    throw e
  }

  if (grilla.filas.length === 0) {
    return NextResponse.json(
      { error: "La planilla no tiene filas debajo del encabezado" },
      { status: 422 }
    )
  }

  const faltantes = columnasFaltantesPlan(mapearColumnasPlan(grilla.cabeceras))
  if (faltantes.length > 0) {
    return NextResponse.json(
      {
        error: `No encontré ${faltantes.length === 1 ? "la columna" : "las columnas"} ${faltantes.join(", ")}. El archivo tiene: ${grilla.cabeceras.join(" · ")}`,
      },
      { status: 422 }
    )
  }

  const { cuentas, errores } = leerPlanDeCuentas(grilla)

  if (errores.length > 0) {
    return NextResponse.json(
      {
        error: `El archivo tiene ${errores.length} ${errores.length === 1 ? "fila" : "filas"} con problemas. No se cargó nada.`,
        errores: errores.slice(0, 20),
      },
      { status: 422 }
    )
  }
  if (cuentas.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene ninguna cuenta" }, { status: 422 })
  }

  /* ── Contra lo que ya está ────────────────────────────────────────────── */

  const { data: existentes, error: errLeer } = await supabase
    .from("plan_cuentas")
    .select(
      `id, codigo, nombre, tipo, orden, lleva_subcuenta, tipo_subcuenta,
       es_banco, es_valores, libro_iva, moneda_extranjera, es_medio_pago`
    )

  if (errLeer) {
    console.error("[plan-cuentas importar · leer]", errLeer)
    return NextResponse.json({ error: "No se pudo leer el plan actual" }, { status: 500 })
  }

  const porCodigo = new Map(
    (existentes ?? []).map((c) => [c.codigo as string, c as Record<string, unknown>])
  )

  const altas: Record<string, unknown>[] = []
  const cambios: { id: string; fila: Record<string, unknown> }[] = []
  let sinCambios = 0

  for (const cuenta of cuentas) {
    const actual = porCodigo.get(cuenta.codigo)

    if (!actual) {
      // En el plan del contador no hay cuentas de agrupación: el agrupador es el
      // rubro, así que todas son imputables. Es el mismo criterio con el que se
      // sembró el plan en `20260813_01`.
      altas.push({ ...cuenta, imputable: true })
      continue
    }

    // Se comparan los valores ya normalizados, no las celdas: así una cuenta que
    // no cambió no genera un UPDATE, y el número de "modificadas" que ve la
    // persona es el de las que de verdad cambiaron.
    const distinto = CAMPOS.some((campo) => {
      const nuevo = cuenta[campo]
      const viejo = actual[campo]
      if (typeof nuevo === "number") return Number(viejo ?? 0) !== nuevo
      return (viejo ?? null) !== (nuevo ?? null)
    })

    if (!distinto) {
      sinCambios++
      continue
    }

    const fila: Record<string, unknown> = {}
    for (const campo of CAMPOS) fila[campo] = cuenta[campo]
    cambios.push({ id: actual.id as string, fila })
  }

  /* ── Escritura ────────────────────────────────────────────────────────── */

  if (altas.length > 0) {
    const { error } = await supabase.from("plan_cuentas").insert(altas)
    if (error) {
      console.error("[plan-cuentas importar · altas]", error)
      return NextResponse.json(
        { error: "No se pudieron dar de alta las cuentas nuevas" },
        { status: 500 }
      )
    }
  }

  /* Las modificaciones van de a una y no en un `upsert` masivo a propósito: el
     upsert por `codigo` necesitaría mandar la fila entera, y la fila entera
     incluye `activo` e `imputable`, que son justo los dos campos que el archivo
     no manda y que no hay que pisar. Son doscientas cuentas de las que cambian
     un puñado por vez. */
  for (const { id, fila } of cambios) {
    const { error } = await supabase.from("plan_cuentas").update(fila).eq("id", id)
    if (error) {
      console.error("[plan-cuentas importar · cambio]", error)
      return NextResponse.json(
        {
          error: `Se cargaron ${altas.length} cuentas nuevas pero falló la actualización de una existente. Volvé a subir el archivo: lo ya cargado no se duplica.`,
        },
        { status: 500 }
      )
    }
  }

  const codigosDelArchivo = new Set(cuentas.map((c) => c.codigo))
  const resultado: ResultadoImportacion = {
    altas: altas.length,
    cambios: cambios.length,
    sinCambios,
    ausentes: (existentes ?? [])
      .filter((c) => !codigosDelArchivo.has(c.codigo as string))
      .map((c) => ({ codigo: c.codigo as string, nombre: c.nombre as string })),
  }

  return NextResponse.json(resultado)
})
