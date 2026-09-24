import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { escaparParaOr, POR_PAGINA_MAX } from "@/lib/admin/entidades-server"
import { esFormaJuridica, esOrigen } from "@/lib/admin/entidades"
import { normalizarCuit } from "@/lib/admin/cuit"
import {
  TABLA_DE_TIPO,
  completarCuit,
  obtenerOCrearEntidad,
  recordarCuentaEnFicha,
} from "@/lib/admin/entidad-de-comprobante"
import type { Comprobante, RenglonIva, TipoComprobante } from "@/lib/admin/comprobantes"
import {
  SELECT_COMPROBANTE,
  aComprobante,
  conSaldos,
  errorDeComprobante,
  validarComprobante,
} from "@/lib/admin/comprobantes-server"
import { cotizacionHasta } from "@/lib/admin/cotizaciones-server"
import { impactoDeComprobantes } from "@/lib/admin/impacto-server"

/**
 * Los handlers de facturas de venta y de compra, parametrizados por tipo.
 *
 * Las dos pantallas hacen exactamente lo mismo contra la misma tabla: cambian el
 * discriminador, contra qué maestro se filtra y cómo se llaman las cosas. Toda
 * la parte cara —validación de importes, unicidad, saldos, vencimientos— es una
 * sola implementación, que es el punto de haber unificado `comprobantes` en una
 * tabla desde el principio.
 */

const CAMPO_ENTIDAD: Record<TipoComprobante, string> = {
  venta: "cliente_id",
  compra: "proveedor_id",
}

const NOMBRE: Record<TipoComprobante, { singular: string; plural: string }> = {
  venta: { singular: "la factura", plural: "las facturas" },
  compra: { singular: "el comprobante", plural: "los comprobantes" },
}

/* ── Listado ──────────────────────────────────────────────────────────────── */

export async function listarComprobantes(tipo: TipoComprobante, req: Request) {
  const url = new URL(req.url)
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1)
  const porPagina = Math.min(
    POR_PAGINA_MAX,
    Math.max(1, Number(url.searchParams.get("porPagina")) || 25)
  )
  const q = url.searchParams.get("q")?.trim() ?? ""
  const entidadId = url.searchParams.get("entidadId") ?? ""
  const moneda = url.searchParams.get("moneda") ?? ""
  const desdeFecha = url.searchParams.get("desde") ?? ""
  const hastaFecha = url.searchParams.get("hasta") ?? ""
  const vencimiento = url.searchParams.get("vencimiento") ?? ""
  const estado = url.searchParams.get("estado") ?? ""

  let query = supabase
    .from("comprobantes")
    .select(SELECT_COMPROBANTE, { count: "exact" })
    .eq("tipo", tipo)

  if (entidadId) query = query.eq(CAMPO_ENTIDAD[tipo], entidadId)
  // Sin filtro se ven todos, borradores incluidos: el listado es el lugar de
  // trabajo y esconder lo que está a medio cargar es la forma más rápida de que
  // se olvide para siempre.
  if (estado) query = query.eq("estado", estado)
  if (moneda === "ARS" || moneda === "USD") query = query.eq("moneda", moneda)
  if (desdeFecha) query = query.gte("fecha", desdeFecha)
  if (hastaFecha) query = query.lte("fecha", hastaFecha)

  // Contra la fecha del servidor y no la del navegador: si el reloj de una
  // máquina está corrido, el listado de vencidas no puede cambiar según quién
  // lo abra.
  if (vencimiento === "vencidas") {
    query = query.lt("fecha_vencimiento", hoyISO())
  } else if (vencimiento === "por_vencer") {
    query = query.gte("fecha_vencimiento", hoyISO()).lte("fecha_vencimiento", enDias(7))
  }

  if (q) {
    const texto = escaparParaOr(q)
    const soloDigitos = q.replace(/\D/g, "")
    const terminos = [`detalle.ilike.%${texto}%`, `observaciones.ilike.%${texto}%`]
    if (soloDigitos) terminos.push(`numero.eq.${Number(soloDigitos)}`)
    query = query.or(terminos.join(","))
  }

  const desde = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error(`[${tipo} GET]`, error)
    return NextResponse.json(
      { error: `No se pudieron cargar ${NOMBRE[tipo].plural}` },
      { status: 500 }
    )
  }

  const comprobantes = await conSaldos((data ?? []).map(aComprobante))

  return NextResponse.json({ comprobantes, total: count ?? 0, pagina, porPagina })
}

/**
 * Completa el TC de valuación cuando el formulario no lo mandó.
 *
 * Un comprobante en pesos no necesita tipo de cambio para existir, pero sin él
 * no se puede ver en dólares — y verlo en las dos monedas es lo que pidió
 * administración. En vez de obligar a tipearlo factura por factura, se toma el
 * dólar archivado de esa fecha (o el último anterior, para los sábados y
 * feriados, que es lo que hace cualquier contador).
 *
 * Si no hay ninguno guardado queda en null, que significa "no se conoce" y la
 * pantalla muestra un guion. Nunca se inventa un 1.
 */
async function conTcDelDia(fila: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (fila.tc !== null && fila.tc !== undefined) return fila
  const tc = await cotizacionHasta(fila.fecha as string)
  return tc === null ? fila : { ...fila, tc }
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

export async function crearComprobante(tipo: TipoComprobante, req: Request) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  /**
   * El alta de la ficha va acá, en el mismo pedido que la factura.
   *
   * Podría hacerla el navegador con dos llamadas —crear el proveedor, después
   * la factura— y sería más simple de leer. Pero entre las dos llamadas se
   * puede cerrar la pestaña, y ahí queda un proveedor dado de alta sin ninguna
   * factura, que es basura silenciosa en el maestro. Peor: seis archivos del
   * mismo proveedor nuevo se guardan en secuencia y cada uno vería el maestro
   * como estaba antes de empezar.
   *
   * Del lado del servidor eso no pasa: cada guardado resuelve la ficha contra
   * la base tal como está en ese instante, y el índice único del CUIT hace de
   * árbitro final.
   */
  const resuelta = await resolverEntidad(tipo, body.raw)
  if ("error" in resuelta) {
    return NextResponse.json({ error: resuelta.error }, { status: resuelta.status })
  }
  if (resuelta.id) body.raw.entidadId = resuelta.id

  const validado = validarComprobante(body.raw, tipo)
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("comprobantes")
    .insert({ ...(await conTcDelDia(validado.fila)), created_by: user?.id ?? null })
    .select(SELECT_COMPROBANTE)
    .single()

  if (error) return errorDeComprobante(error, "crear")

  // El desglose por alícuota va después, como los hijos de un recibo. Su trigger
  // rehace el asiento con los renglones ya adentro.
  const errIvas = await guardarIvas((data as { id: string }).id, validado.ivas)
  if (errIvas) return errIvas

  const { data: completo } = await supabase
    .from("comprobantes")
    .select(SELECT_COMPROBANTE)
    .eq("id", (data as { id: string }).id)
    .single()

  const comprobante = aComprobante(completo ?? data)

  // La cuenta elegida queda anotada en la ficha, si no tenía. Es lo que hace que
  // elegirla sea trabajo de una sola vez por proveedor y no de cada factura.
  await aprenderCuenta(tipo, comprobante)

  /**
   * El resumen se calcula sólo si el alta ya quedó confirmada.
   *
   * Es lo que separa la carga manual de la masiva sin tener dos endpoints: una
   * factura tipeada y confirmada de una impacta en todo y merece el resumen; los
   * seis PDF entran como borrador, y ahí consultar el impacto de cada uno serían
   * doce consultas para informar seis veces que todavía no pasó nada. La pantalla
   * de carga arma ese resumen sola con lo que ya sabe.
   */
  const impacto =
    comprobante.estado === "confirmado"
      ? await impactoDeComprobantes(
          tipo,
          [comprobante.id],
          resuelta.creada && resuelta.razonSocial ? [resuelta.razonSocial] : []
        )
      : null

  return NextResponse.json(
    {
      comprobante,
      // Para que la pantalla pueda decir "2 proveedores nuevos" en vez de dejar
      // que el maestro crezca sin que nadie se entere.
      entidadCreada: resuelta.creada ? resuelta.razonSocial : null,
      impacto,
    },
    { status: 201 }
  )
}

/** La cuenta imputada, guardada en la ficha de la contraparte para la próxima
 *  vez. No hace nada si la ficha ya tenía una: la excepción es la factura, no el
 *  proveedor. */
async function aprenderCuenta(tipo: TipoComprobante, c: Comprobante): Promise<void> {
  const entidadId = tipo === "compra" ? c.proveedorId : c.clienteId
  if (!entidadId || !c.cuentaContableId) return
  await recordarCuentaEnFicha(TABLA_DE_TIPO[tipo], entidadId, c.cuentaContableId)
}

/**
 * La ficha del comprobante: la que se eligió, o la que hay que dar de alta.
 *
 * Sin `entidadNueva` no hace nada y el alta manual sigue funcionando igual que
 * siempre — es la carga inteligente la que manda los datos leídos del papel.
 */
async function resolverEntidad(
  tipo: TipoComprobante,
  raw: Record<string, unknown>
): Promise<
  | { id: string | null; creada: boolean; razonSocial: string | null }
  | { error: string; status: number }
> {
  const yaElegida = typeof raw.entidadId === "string" ? raw.entidadId : ""
  const nueva = raw.entidadNueva

  if (!nueva || typeof nueva !== "object" || Array.isArray(nueva)) {
    return { id: null, creada: false, razonSocial: null }
  }

  const d = nueva as Record<string, unknown>

  /**
   * Con la ficha ya elegida, lo leído del papel todavía sirve para una cosa:
   * completarle el CUIT si no lo tenía.
   *
   * Es el caso de la ficha vieja cargada a mano sin CUIT, que la importación
   * encontró por nombre. Sin esto se engancha bien esta vez y sigue huérfana
   * para la próxima —el nombre tendría que volver a coincidir al carácter—.
   * Con esto, la primera factura que llega le da su identidad y de ahí en más
   * se encuentra por CUIT, que es el camino que no falla.
   */
  if (yaElegida) {
    const cuit = typeof d.cuit === "string" ? normalizarCuit(d.cuit) : null
    if (cuit) await completarCuit(TABLA_DE_TIPO[tipo], yaElegida, cuit)
    return { id: null, creada: false, razonSocial: null }
  }
  const resultado = await obtenerOCrearEntidad(TABLA_DE_TIPO[tipo], {
    razonSocial: typeof d.razonSocial === "string" ? d.razonSocial : "",
    cuit: typeof d.cuit === "string" ? d.cuit : null,
    origen: esOrigen(d.origen) ? d.origen : "nacional",
    formaJuridica: esFormaJuridica(d.formaJuridica) ? d.formaJuridica : null,
    direccion: typeof d.direccion === "string" ? d.direccion : null,
  })

  if ("error" in resultado) return resultado

  return { id: resultado.id, creada: resultado.creada, razonSocial: resultado.razonSocial }
}

/* ── Confirmar, volver a borrador, anular ─────────────────────────────────── */

/**
 * El cambio de estado, que es lo único que puede pasarle a un comprobante que ya
 * está bien cargado.
 *
 * Cada transición hace algo distinto por debajo, y todo lo caro lo resuelve la
 * base: confirmar dispara el asiento, volver a borrador lo borra, y anular lo
 * borra conservando el número. Acá solo se valida que la transición pedida tenga
 * sentido y se traduce el error del trigger a algo legible.
 */
export async function cambiarEstadoComprobante(
  tipo: TipoComprobante,
  req: Request,
  id: string
) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const estado = body.raw.estado
  if (estado !== "borrador" && estado !== "confirmado" && estado !== "anulado") {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
  }

  const { data: actual, error: errLectura } = await supabase
    .from("comprobantes")
    .select("id, estado, cuenta_contable_id, total")
    .eq("id", id)
    .eq("tipo", tipo)
    .maybeSingle()

  if (errLectura) {
    console.error(`[${tipo} estado]`, errLectura)
    return NextResponse.json({ error: "No se pudo leer el comprobante" }, { status: 500 })
  }
  if (!actual) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })
  if (actual.estado === estado) {
    return NextResponse.json({ error: `El comprobante ya está ${estado}` }, { status: 409 })
  }

  // Confirmar sin cuenta contable deja el comprobante en los saldos pero fuera
  // del mayor. Se avisa en vez de bloquear: hay casos —una nota de crédito de
  // ajuste— en que se quiere confirmar igual y completar la imputación después.
  const aviso =
    estado === "confirmado" && !actual.cuenta_contable_id
      ? "Se confirmó sin cuenta contable imputada: no va a generar asiento hasta que se le asigne una."
      : null

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("comprobantes")
    .update({
      estado,
      confirmado_at: estado === "confirmado" ? new Date().toISOString() : null,
      confirmado_por: estado === "confirmado" ? (user?.id ?? null) : null,
    })
    .eq("id", id)
    .eq("tipo", tipo)
    .select(SELECT_COMPROBANTE)
    .maybeSingle()

  if (error) {
    // El trigger `comprobantes_estado_valido` frena sacar de confirmado algo que
    // ya tiene un recibo imputado. Su mensaje ya explica qué hacer.
    if (error.code === "23514" || error.message?.includes("imputado")) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error(`[${tipo} estado]`, error)
    return NextResponse.json({ error: "No se pudo cambiar el estado" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

  const [comprobante] = await conSaldos([aComprobante(data as unknown as Record<string, unknown>)])

  // Solo al confirmar: es la única transición que mueve algo afuera. Volver a
  // borrador o anular borra el asiento, y para eso el aviso de siempre alcanza.
  const impacto =
    estado === "confirmado" ? await impactoDeComprobantes(tipo, [id]) : null

  return NextResponse.json({ comprobante, aviso, impacto })
}

/**
 * Confirmar varios de una vez.
 *
 * Es lo que hace que la carga inteligente sirva de verdad: se adjuntan seis PDF,
 * quedan seis borradores, se revisan con calma y se confirman los seis juntos.
 * Uno que falle no frena a los demás — se devuelve el detalle de cada uno.
 */
/**
 * La fecha estimada de pago, sola.
 *
 * Es el único campo de un comprobante que se edita desde afuera de su
 * formulario, y a propósito: decidir cuándo se va a cobrar cada factura es algo
 * que se hace mirando la lista entera de pendientes —cuál vence antes, cuál ya
 * está vencida, cuánto suma cada semana—, no abriendo una factura por vez y
 * perdiendo la lista de vista en cada una.
 *
 * No toca la deuda —ni el importe, ni la fecha, ni el número, ni la entidad—,
 * así que se puede cambiar en un comprobante confirmado y hasta ya imputado,
 * igual que el vencimiento o las observaciones. Por eso no pasa por
 * `editarComprobante`, que valida el comprobante entero y bloquea lo que mueve
 * saldos: acá no hay nada que bloquear.
 */
export async function fecharPagoEstimado(
  tipo: TipoComprobante,
  req: Request,
  id: string
) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const crudo = body.raw.fechaEstimadaPago
  // Vaciar la fecha es una respuesta válida —"todavía no sé cuándo"— y tiene que
  // poder deshacerse desde la misma celda donde se puso.
  const vacia = crudo === null || crudo === "" || crudo === undefined
  const fecha =
    typeof crudo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(crudo) ? crudo : null

  if (!vacia && fecha === null) {
    return NextResponse.json({ error: "La fecha estimada de pago es inválida" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("comprobantes")
    .update({ fecha_estimada_pago: vacia ? null : fecha })
    .eq("id", id)
    .eq("tipo", tipo)
    .select("id, fecha_estimada_pago")
    .maybeSingle()

  if (error) {
    console.error(`[${tipo} pago estimado]`, error)
    return NextResponse.json({ error: "No se pudo guardar la fecha" }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })
  }

  return NextResponse.json({
    fechaEstimadaPago: (data.fecha_estimada_pago as string | null) ?? null,
  })
}

export async function confirmarLote(tipo: TipoComprobante, req: Request) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const ids = Array.isArray(body.raw.ids)
    ? body.raw.ids.filter((v): v is string => typeof v === "string")
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: "Elegí al menos un comprobante" }, { status: 400 })
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "Se pueden confirmar hasta 200 por vez" }, { status: 400 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  // Uno por uno y no un update masivo: el trigger del motor de asientos corre
  // por fila, y si uno falla hay que saber cuál fue y seguir con el resto.
  const confirmados: string[] = []
  const fallidos: { id: string; error: string }[] = []

  for (const id of ids) {
    const { error } = await supabase
      .from("comprobantes")
      .update({
        estado: "confirmado",
        confirmado_at: new Date().toISOString(),
        confirmado_por: user?.id ?? null,
      })
      .eq("id", id)
      .eq("tipo", tipo)
      .eq("estado", "borrador")

    if (error) fallidos.push({ id, error: error.message })
    else confirmados.push(id)
  }

  return NextResponse.json({
    confirmados: confirmados.length,
    fallidos,
    // El resumen se arma con lo que quedó en la base, no con `confirmados`:
    // confirmar y generar el asiento son dos cosas distintas y el trigger puede
    // haber hecho una sin la otra.
    impacto: await impactoDeComprobantes(tipo, confirmados),
  })
}

/* ── Edición ──────────────────────────────────────────────────────────────── */

export async function editarComprobante(tipo: TipoComprobante, req: Request, id: string) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const validado = validarComprobante(body.raw, tipo)
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  /**
   * Un comprobante con un recibo imputado se edita a medias, y a propósito.
   *
   * Lo que no se toca es la deuda: importes, moneda, tipo de cambio, fecha,
   * número, proveedor. Cambiar cualquiera de esos movería el saldo sin que nadie
   * haya cobrado ni facturado nada, y el recibo pasaría a cancelar un número que
   * no existió nunca; la salida correcta ahí sigue siendo una nota de crédito.
   *
   * Lo que sí se toca es todo lo demás —la cuenta contable, el detalle, el
   * vencimiento, las observaciones—, que no mueve un peso de ningún saldo. La
   * cuenta contable en particular es el caso que motivó esto: define contra qué
   * cuenta va el gasto, se equivoca seguido, y no tiene nada que ver con lo que
   * el proveedor cobró. Bloquearla obligaba a una nota de crédito para arreglar
   * un dato que la nota de crédito ni siquiera corrige.
   */
  const { data: imputado } = await supabase
    .from("imputaciones")
    .select("id")
    .eq("comprobante_id", id)
    .limit(1)
    .maybeSingle()

  let fila = validado.fila

  if (imputado) {
    const { data: actual } = await supabase
      .from("comprobantes")
      .select("*")
      .eq("id", id)
      .eq("tipo", tipo)
      .maybeSingle()

    if (!actual) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

    const tocados = camposDeLaDeudaTocados(actual, fila)
    if (tocados.length > 0) {
      return NextResponse.json(
        {
          error:
            `Este comprobante ya tiene un recibo imputado: no se puede cambiarle ${listar(tocados)}. ` +
            "Si el importe está mal, emitile una nota de crédito. " +
            "El resto de los datos —cuenta contable, detalle, vencimiento— sí se pueden editar.",
        },
        { status: 409 }
      )
    }

    // Nada de la deuda cambió, así que se escribe solo lo editable y la fila
    // conserva intacto lo que el recibo está cancelando.
    fila = Object.fromEntries(
      CAMPOS_EDITABLES_CON_RECIBO.filter((c) => c in fila).map((c) => [c, fila[c]])
    )
  }

  const { data, error } = await supabase
    .from("comprobantes")
    .update(imputado ? fila : await conTcDelDia(fila))
    .eq("id", id)
    .eq("tipo", tipo)
    .select(SELECT_COMPROBANTE)
    .maybeSingle()

  if (error) return errorDeComprobante(error, "editar")
  if (!data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

  /*
   * El desglose se reescribe siempre, también con un recibo imputado.
   *
   * No es una excepción al candado: es la misma regla. Lo que el candado protege
   * es cuánto se debe —`neto_gravado`, `iva` y `total` están en la lista de la
   * deuda y ya se compararon arriba—, y repartir ese mismo IVA entre 21 y 27 no
   * mueve un peso de ningún saldo. Cambia contra qué cuenta del plan va cada
   * tramo, que es exactamente lo que pasa con la cuenta contable.
   */
  const errIvas = await guardarIvas(id, validado.ivas)
  if (errIvas) return errIvas

  const { data: completo } = await supabase
    .from("comprobantes")
    .select(SELECT_COMPROBANTE)
    .eq("id", id)
    .maybeSingle()

  return NextResponse.json({ comprobante: aComprobante(completo ?? data) })
}

/* ── Borrado ──────────────────────────────────────────────────────────────── */

/**
 * Borrado definitivo, sin baja lógica.
 *
 * A diferencia de una ficha —que se da de baja porque su historia importa— un
 * comprobante mal cargado no tiene historia que preservar: es un error de
 * tipeo. Lo que sí la tiene es uno ya cobrado o pagado, y de eso se encarga la
 * FK de las imputaciones: el intento vuelve como 23503.
 */
export async function borrarComprobante(tipo: TipoComprobante, id: string) {
  const { data, error } = await supabase
    .from("comprobantes")
    .delete()
    .eq("id", id)
    .eq("tipo", tipo)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            tipo === "venta"
              ? "No se puede eliminar: la factura tiene cobros imputados. Anulá el cobro primero."
              : "No se puede eliminar: el comprobante tiene pagos imputados. Anulá el pago primero.",
        },
        { status: 409 }
      )
    }
    console.error(`[${tipo} DELETE]`, error)
    return NextResponse.json(
      { error: `No se pudo eliminar ${NOMBRE[tipo].singular}` },
      { status: 500 }
    )
  }
  if (!data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true })
}

/* ── Utilidades ───────────────────────────────────────────────────────────── */

async function leerBody(
  req: Request
): Promise<{ raw: Record<string, unknown> } | { error: NextResponse }> {
  try {
    const body = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
    }
    return { raw: body as Record<string, unknown> }
  } catch {
    return { error: NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
  }
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function enDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Deja el desglose por alícuota igual a lo que llegó del formulario.
 *
 * Borrar y reinsertar y no un diff: son dos o tres renglones, la tabla cuelga del
 * comprobante con `on delete cascade`, y un diff acá sería más código para
 * ahorrar una consulta que nadie va a notar. Lo que sí importa es el orden —
 * primero el borrado, después la inserción— porque el índice único por alícuota y
 * cuenta rechazaría la fila nueva mientras la vieja siga viva.
 */
async function guardarIvas(
  comprobanteId: string,
  ivas: RenglonIva[]
): Promise<NextResponse | null> {
  const { error: errBorrado } = await supabase
    .from("comprobante_ivas")
    .delete()
    .eq("comprobante_id", comprobanteId)

  if (errBorrado) {
    console.error("[comprobante_ivas borrado]", errBorrado)
    return NextResponse.json(
      { error: "No se pudo guardar el desglose de IVA" },
      { status: 500 }
    )
  }

  if (ivas.length === 0) return null

  const { error } = await supabase.from("comprobante_ivas").insert(
    ivas.map((r) => ({
      comprobante_id: comprobanteId,
      alicuota: r.alicuota,
      neto: r.neto,
      iva: r.iva,
      cuenta_contable_id: r.cuentaContableId,
    }))
  )

  if (error) {
    console.error("[comprobante_ivas]", error)
    return NextResponse.json(
      { error: "No se pudo guardar el desglose de IVA" },
      { status: 500 }
    )
  }

  return null
}

/* ── Qué se puede editar con un recibo ya imputado ────────────────────────── */

/**
 * Los campos que definen la deuda: lo que el recibo está cancelando.
 *
 * El rótulo que va al costado es el que ve el usuario en el mensaje de error,
 * así que dice lo mismo que la etiqueta del formulario y no el nombre de la
 * columna. `estado` entra en la lista porque volver a borrador borraría el
 * asiento de un comprobante que alguien ya pagó.
 */
const DEUDA: ReadonlyArray<readonly [string, string]> = [
  // `alicuota_iva` NO está acá a propósito. Repartir el mismo IVA entre dos
  // alícuotas no cambia cuánto se debe —`neto_gravado`, `iva` y `total` sí están
  // en la lista y siguen bloqueados—, sólo contra qué cuenta del plan imputa cada
  // tramo. Es la misma categoría que la cuenta contable.
  ["clase", "el tipo de comprobante"],
  ["fecha", "la fecha"],
  ["punto_venta", "el punto de venta"],
  ["numero", "el número"],
  ["cliente_id", "el cliente"],
  ["proveedor_id", "el proveedor"],
  ["moneda", "la moneda"],
  ["tc", "el tipo de cambio"],
  ["neto_gravado", "el neto gravado"],
  ["iva", "el IVA"],
  ["no_gravado", "el no gravado"],
  ["exento", "el exento"],
  ["percepcion_iva", "la percepción de IVA"],
  ["percepcion_iibb_bsas", "la percepción de IIBB Buenos Aires"],
  ["percepcion_iibb_caba", "la percepción de IIBB Capital"],
  ["otros_impuestos", "los otros impuestos"],
  ["total", "el total"],
  ["estado", "el estado"],
]

/** Todo lo que no es la deuda. Ninguno de estos mueve un saldo ni toca lo que
 *  el recibo canceló. */
export const CAMPOS_EDITABLES_CON_RECIBO = [
  "cuenta_contable_id",
  "cuenta_no_gravado_id",
  "cuenta_exento_id",
  "detalle",
  "observaciones",
  "condicion_pago",
  "fecha_vencimiento",
  "fecha_estimada_pago",
  "vendedor_id",
]

/**
 * Comparación campo a campo entre lo guardado y lo que llega del formulario.
 *
 * Los numéricos de Postgres vuelven como string —`"506550.00"`— así que comparar
 * con `!==` daría distinto siempre y bloquearía hasta un cambio de detalle. Se
 * comparan como número cuando los dos lados lo son, y `null` y `undefined` se
 * tratan igual: la fila validada omite lo que el formulario no mandó.
 */
function camposDeLaDeudaTocados(
  actual: Record<string, unknown>,
  fila: Record<string, unknown>
): string[] {
  return DEUDA.filter(([campo]) => {
    if (!(campo in fila)) return false

    // El formulario solo muestra el tipo de cambio en dólares: en pesos manda
    // `null` aunque la fila tenga el TC del día que le puso el alta. Eso no es
    // alguien cambiando el TC, es un campo que la pantalla no ofrece — y como
    // acá se escriben solo los campos editables, tampoco se va a pisar.
    if (campo === "tc" && fila.tc === null) return false

    return !mismoValor(actual[campo], fila[campo])
  }).map(([, rotulo]) => rotulo)
}

function mismoValor(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false

  // A cuatro decimales, que es lo que guardan las columnas más finas —`tc` y
  // `alicuota_iva`—. Redondear evita que `0.21` y `0.2100` difieran por el ruido
  // del punto flotante sin abrir una ventana donde entren dos alícuotas.
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && a !== "" && b !== "") {
    return Math.round(na * 1e4) === Math.round(nb * 1e4)
  }

  return String(a) === String(b)
}

/** "el total", "el total y la fecha", "el total, la fecha y el IVA". */
function listar(items: string[]): string {
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`
}
