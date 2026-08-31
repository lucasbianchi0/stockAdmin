import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { esMoneda } from "@/lib/admin/moneda"
import {
  CATEGORIAS_GASTO,
  esEditable,
  type CategoriaGasto,
  type OrigenMovimiento,
} from "@/lib/admin/movimientos"
import {
  SELECT_MOVIMIENTO,
  aMovimiento,
  esFechaISO,
  monedasDeCuentas,
  numeroPositivo,
  resolverImporte,
  textoCorto,
} from "@/lib/admin/movimientos-server"

type Ctx = { params: Promise<{ id: string }> }

/* ── GET · el movimiento entero ───────────────────────────────────────────── */

/**
 * El extracto trae de cada fila lo que la tabla dibuja, que no alcanza para
 * volver a abrirla en el formulario: ahí no viajan el tipo de cambio, la
 * categoría ni la cuenta contable. Pedir la fila completa al abrir la edición es
 * preferible a engordar el extracto con tres columnas que solo usa el diálogo.
 */
export const GET = ruta("movimientos GET id", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("movimientos")
    .select(SELECT_MOVIMIENTO)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[movimientos GET id]", error)
    return NextResponse.json({ error: "No se pudo cargar el movimiento" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  return NextResponse.json({ movimiento: aMovimiento(data) })
})

/* ── PATCH · corregir un movimiento ya cargado ────────────────────────────── */

/**
 * Corregir un movimiento sin borrarlo y volver a cargarlo.
 *
 * Antes acá solo se marcaba la conciliación: cualquier otro error —la fecha, el
 * importe, contra qué cuenta se imputó— obligaba a borrar el renglón y cargarlo
 * de nuevo, y eso le cambia el id. Un movimiento con id nuevo pierde la
 * conciliación, sale y vuelve a entrar en el libro diario con otro número de
 * asiento, y deja los enlaces viejos apuntando a nada.
 *
 * **Lo que se corrige acá se corrige solo en todo lo demás**, y por eso esta
 * ruta puede ser un UPDATE a secas: el saldo de la cuenta no está guardado —sale
 * de la vista `cuentas_saldo`— y el asiento contable lo rearma el trigger
 * `movimientos_asiento` en cada update. No hay nada que recalcular a mano; lo
 * que hay que hacer es escribir bien la fila.
 *
 * Las dos fronteras:
 *
 *  · **El que cuelga de un recibo** (`pago_id`) solo deja tocar referencia,
 *    detalle y conciliación. Cambiarle el importe dejaría la factura cancelada
 *    con una plata que no coincide, que es el descuadre que el módulo entero
 *    trata de hacer imposible. El recibo se edita desde su pantalla, que sí sabe
 *    recalcular imputaciones.
 *  · **La pata de una transferencia** arrastra a su hermana en lo que las dos
 *    tienen que decir igual. Media transferencia corregida hace aparecer o
 *    desaparecer plata.
 */
export const PATCH = ruta("movimientos PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { data: actual } = await supabase
    .from("movimientos")
    .select("id, cuenta_id, fecha, tipo, importe, moneda, tc, origen, pago_id, referencia")
    .eq("id", id)
    .maybeSingle()

  if (!actual) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  const origen = actual.origen as OrigenMovimiento
  const parche: Record<string, unknown> = {}

  /* ── Lo que se puede corregir siempre ───────────────────────────────────
     Referencia, detalle y conciliación son el renglón del banco, no la plata:
     no mueven un saldo ni un asiento, así que valen incluso para el movimiento
     que nació de un recibo. Es lo que permite ponerle el número de transferencia
     a un pago sin tener que anularlo. */

  if (typeof body.conciliado === "boolean") parche.conciliado = body.conciliado
  if ("referencia" in body) parche.referencia = textoCorto(body.referencia)
  if ("detalle" in body) parche.detalle = textoCorto(body.detalle, 500)

  const CAMPOS_DE_PLATA = [
    "fecha",
    "tipo",
    "cuentaId",
    "importe",
    "moneda",
    "tc",
    "categoria",
    "cuentaContableId",
  ]
  const tocaLaPlata = CAMPOS_DE_PLATA.some((campo) => campo in body)

  if (tocaLaPlata && actual.pago_id) {
    return NextResponse.json(
      {
        error:
          "Este movimiento es la plata de un recibo. El importe, la fecha y la imputación se corrigen editando el recibo — cambiarlos acá dejaría la factura cancelada con un importe que no coincide.",
      },
      { status: 409 }
    )
  }

  /* ── Lo que solo se corrige en los movimientos sueltos ─────────────────── */

  if (tocaLaPlata) {
    if (!esEditable(origen)) {
      return NextResponse.json(
        { error: "Este movimiento no se edita desde el extracto" },
        { status: 409 }
      )
    }

    const fecha = "fecha" in body ? body.fecha : actual.fecha
    if (!esFechaISO(fecha)) {
      return NextResponse.json({ error: "La fecha es obligatoria" }, { status: 400 })
    }
    if ("fecha" in body) parche.fecha = fecha

    /* La cuenta: corregir en cuál se cargó es la mitad de las correcciones
       reales —el gasto que fue del Galicia y quedó anotado en la caja—. En una
       transferencia no, porque cuál es cada cuenta es lo que la transferencia
       ES: se anulan las dos patas y se vuelve a cargar. */
    let cuentaId = actual.cuenta_id as string
    const cuentaPedida = typeof body.cuentaId === "string" ? body.cuentaId : ""

    if (cuentaPedida && cuentaPedida !== cuentaId) {
      if (origen === "transferencia") {
        return NextResponse.json(
          {
            error:
              "Una pata de transferencia no cambia de cuenta: borrá las dos y volvé a cargarla entre las cuentas correctas.",
          },
          { status: 409 }
        )
      }
      cuentaId = cuentaPedida
      parche.cuenta_id = cuentaId
    }

    if ("tipo" in body) {
      const tipo = body.tipo === "ingreso" ? "ingreso" : "egreso"
      if (origen === "transferencia" && tipo !== actual.tipo) {
        return NextResponse.json(
          {
            error:
              "Una pata de transferencia no cambia de dirección: de una cuenta sale y en la otra entra.",
          },
          { status: 409 }
        )
      }
      parche.tipo = tipo
    }

    /* El importe se rehace entero cuando se toca cualquiera de sus tres
       ingredientes —cuánto, en qué moneda, a qué cambio— o cuando cambia la
       cuenta, porque la moneda de la cuenta es la que manda. */
    const cambiaLaPlata =
      "importe" in body || "moneda" in body || "tc" in body || "cuenta_id" in parche

    if (cambiaLaPlata) {
      const importe = "importe" in body ? numeroPositivo(body.importe) : Number(actual.importe)
      if (importe === null || !Number.isFinite(importe) || importe <= 0) {
        return NextResponse.json(
          { error: "El importe tiene que ser mayor a cero" },
          { status: 400 }
        )
      }

      const monedaCuenta = (await monedasDeCuentas([cuentaId])).get(cuentaId)
      if (!monedaCuenta) {
        return NextResponse.json({ error: "La cuenta elegida ya no existe" }, { status: 409 })
      }

      /* El TC que ya tenía es el piso, y eso es deliberado: corregir un importe
         no puede revaluar el movimiento contra la cotización de hoy. Para
         cambiar la valuación hay que escribir el TC. */
      const plata = await resolverImporte({
        importe,
        monedaCargada: esMoneda(body.moneda) ? body.moneda : monedaCuenta,
        monedaCuenta,
        tc: numeroPositivo(body.tc) ?? (Number(actual.tc) || null),
        fecha,
      })
      if ("error" in plata) return NextResponse.json({ error: plata.error }, { status: 400 })

      parche.importe = plata.importe
      parche.moneda = plata.moneda
      if (plata.tc !== null) parche.tc = plata.tc
      parche.importe_origen = plata.importeOrigen
      parche.moneda_origen = plata.monedaOrigen
    }

    if ("categoria" in body) {
      // La categoría es del gasto: un ajuste o una transferencia no tienen una,
      // y dejársela puesta le cambiaría el concepto en el extracto.
      parche.categoria =
        origen === "gasto" &&
        typeof body.categoria === "string" &&
        (CATEGORIAS_GASTO as readonly string[]).includes(body.categoria)
          ? (body.categoria as CategoriaGasto)
          : null
    }

    if ("cuentaContableId" in body) {
      parche.cuenta_contable_id =
        typeof body.cuentaContableId === "string" && body.cuentaContableId
          ? body.cuentaContableId
          : null
    }
  }

  if (Object.keys(parche).length === 0) {
    return NextResponse.json({ error: "No mandaste nada para cambiar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("movimientos")
    .update(parche)
    .eq("id", id)
    .select(SELECT_MOVIMIENTO)
    .single()

  if (error || !data) {
    console.error("[movimientos PATCH]", error)
    return NextResponse.json({ error: "No se pudo actualizar el movimiento" }, { status: 500 })
  }

  const pareja = origen === "transferencia" ? await espejarLaOtraPata(actual, parche) : false

  return NextResponse.json({ movimiento: aMovimiento(data), pareja })
})

/**
 * Le aplica a la otra pata lo que las dos tienen que decir igual.
 *
 * Las patas se emparejan por referencia y fecha porque es lo único que las une:
 * el alta las escribe con la misma referencia y no hay columna que las apunte.
 * Si el emparejamiento no es exacto —dos transferencias del mismo día con la
 * misma referencia— no se toca ninguna: corregir la pata equivocada es peor que
 * no corregir nada, y la que se editó ya quedó bien.
 *
 * El importe se copia solo cuando las dos patas decían lo mismo en la misma
 * moneda. Cuando difieren es una compra de dólares —salen pesos, entran
 * dólares— y ahí los dos importes son distintos a propósito.
 */
async function espejarLaOtraPata(
  actual: Record<string, unknown>,
  parche: Record<string, unknown>
): Promise<boolean> {
  let consulta = supabase
    .from("movimientos")
    .select("id, importe, moneda")
    .eq("origen", "transferencia")
    .eq("fecha", actual.fecha as string)
    .neq("id", actual.id as string)

  consulta = actual.referencia
    ? consulta.eq("referencia", actual.referencia as string)
    : consulta.is("referencia", null)

  const { data: candidatas } = await consulta.limit(2)
  if (!candidatas || candidatas.length !== 1) return false

  const hermana = candidatas[0]
  const espejo: Record<string, unknown> = {}

  for (const campo of ["fecha", "referencia", "detalle"] as const) {
    if (campo in parche) espejo[campo] = parche[campo]
  }

  const mismoImporte =
    hermana.moneda === actual.moneda && Number(hermana.importe) === Number(actual.importe)
  if ("importe" in parche && mismoImporte) espejo.importe = parche.importe

  if (Object.keys(espejo).length === 0) return false

  const { error } = await supabase.from("movimientos").update(espejo).eq("id", hermana.id)
  if (error) {
    console.error("[movimientos PATCH otra pata]", error)
    return false
  }

  return true
}

/* ── DELETE · borrar ──────────────────────────────────────────────────────── */

/**
 * Borrar un movimiento cargado a mano.
 *
 * Los que cuelgan de un cobro o un pago no se tocan desde acá: borrarlos dejaría
 * el comprobante cancelado sin la plata que lo respalda, que es precisamente el
 * descuadre que todo el módulo trata de hacer imposible. Se anula el recibo y el
 * cascade se los lleva.
 */
export const DELETE = ruta("movimientos DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: mov } = await supabase
    .from("movimientos")
    .select("id, origen")
    .eq("id", id)
    .maybeSingle()

  if (!mov) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  if (!esEditable(mov.origen as OrigenMovimiento)) {
    return NextResponse.json(
      {
        error:
          "Este movimiento viene de un cobro o un pago. Anulá el recibo desde su pantalla y el movimiento se va con él.",
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from("movimientos").delete().eq("id", id)

  if (error) {
    console.error("[movimientos DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el movimiento" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
