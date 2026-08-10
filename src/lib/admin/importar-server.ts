import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { normalizarCuit } from "@/lib/admin/cuit"
import { buscarClase, totalDe, type TipoComprobante } from "@/lib/admin/comprobantes"
import { leerDocumento } from "@/lib/admin/lectura-server"
import { redondear } from "@/lib/admin/moneda"
import {
  ARCHIVOS_MAX,
  PROMPT_EXTRACCION,
  SCHEMA_EXTRACCION,
  type Borrador,
  type Extraccion,
} from "@/lib/admin/extraccion"


/**
 * Carga inteligente: adjuntar el PDF o la foto de una factura y obtener un
 * borrador para revisar.
 *
 * **Este endpoint no escribe en la base.** Devuelve borradores; guardarlos es un
 * POST aparte a /api/admin/ventas, después de que una persona los revisó en la
 * pantalla de preview. La separación es el punto: la extracción acierta casi
 * siempre, y "casi siempre" no alcanza cuando el error se descubre en la
 * declaración jurada.
 *
 * Cada archivo se procesa por separado y en paralelo. Uno ilegible no arrastra
 * a los demás: vuelve con su propio error y el resto se carga igual.
 */
export async function importarComprobantes(tipo: TipoComprobante, req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Falta configurar ANTHROPIC_API_KEY en el servidor" },
      { status: 500 }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 })
  }

  const archivos = form.getAll("archivos").filter((f): f is File => f instanceof File)

  if (archivos.length === 0) {
    return NextResponse.json({ error: "No adjuntaste ningún archivo" }, { status: 400 })
  }
  if (archivos.length > ARCHIVOS_MAX) {
    return NextResponse.json(
      { error: `Máximo ${ARCHIVOS_MAX} archivos por vez` },
      { status: 400 }
    )
  }

  const borradores = await Promise.all(archivos.map((a) => procesarArchivo(tipo, a)))

  return NextResponse.json({ borradores })
}

/* ── Un archivo ───────────────────────────────────────────────────────────── */

async function procesarArchivo(tipo: TipoComprobante, archivo: File): Promise<Borrador> {
  const nombre = archivo.name || "archivo"

  // La lectura en sí —validar el formato, mandar el adjunto, validar contra el
  // esquema— es la misma para una factura, una constancia de AFIP o el ticket de
  // un gasto, y vive en `lectura-server`. Acá queda solo lo que es propio de un
  // comprobante: cruzarlo contra el maestro y contra lo ya cargado.
  const lectura = await leerDocumento<Extraccion>(archivo, PROMPT_EXTRACCION, SCHEMA_EXTRACCION)

  if ("error" in lectura) return { archivo: nombre, avisos: [], error: lectura.error }

  return await enriquecer(tipo, nombre, lectura.datos)
}

/* ── Cruce contra la base y avisos ────────────────────────────────────────── */

/**
 * Lo que el modelo no puede saber: quién de las dos empresas del comprobante es
 * el cliente, si esa factura ya está cargada, y si los importes cierran.
 */
async function enriquecer(
  tipo: TipoComprobante,
  nombre: string,
  e: Extraccion
): Promise<Borrador> {
  const esCompra = tipo === "compra"
  const tabla = esCompra ? "proveedores" : "clientes"
  const avisos: string[] = []

  /* Quién es el cliente. El modelo devuelve emisor y receptor sin decidir; acá
     se cruzan los dos contra el maestro y gana el que exista. Es más robusto que
     configurar "nuestro CUIT" en algún lado y que quede desactualizado. */
  const cuitEmisor = normalizarCuit(e.emisorCuit)
  const cuitReceptor = normalizarCuit(e.receptorCuit)

  // En una venta el cliente es el receptor; en una compra el proveedor es el
  // emisor. Se prueban los dos igual —quien cargó puede haber escaneado algo al
  // revés— pero el orden de preferencia cambia con el tipo.
  const preferido = esCompra ? cuitEmisor : cuitReceptor
  const otroCuit = esCompra ? cuitReceptor : cuitEmisor
  const candidatos = [preferido, otroCuit].filter((c): c is string => c !== null)

  let cliente: Borrador["cliente"] = null
  if (candidatos.length > 0) {
    const { data } = await supabase
      .from(tabla)
      .select("id, razon_social, cuit")
      .in("cuit", candidatos)
      .limit(2)

    // Si matchean los dos, gana el receptor: en una factura de venta el cliente
    // es a quién se le emitió.
    const fila = data?.find((c) => c.cuit === preferido) ?? data?.[0] ?? null

    if (fila) {
      cliente = { id: fila.id, razonSocial: fila.razon_social, cuit: fila.cuit }
    }
  }

  const cuitCliente = preferido ?? otroCuit

  if (!cliente) {
    avisos.push(
      cuitCliente
        ? `El ${esCompra ? "proveedor" : "cliente"} no está en el sistema (CUIT ${cuitCliente}).`
        : `No se pudo leer el CUIT del ${esCompra ? "proveedor" : "cliente"}. Elegilo a mano.`
    )
  } else if (cliente.cuit === otroCuit && otroCuit !== preferido) {
    // La ficha apareció del lado equivocado del comprobante: casi siempre
    // significa que se está cargando en el circuito que no es.
    avisos.push(
      esCompra
        ? `Ojo: ${cliente.razonSocial} figura como receptor, no como emisor. ¿No es una factura de venta?`
        : `Ojo: ${cliente.razonSocial} figura como emisor, no como receptor. ¿No es una factura de compra?`
    )
  }

  /* Los importes cierran. Es el chequeo que más vale: un OCR que lee 1.500 donde
     dice 7.500 pasa desapercibido en el campo, pero rompe la suma. */
  const partes = {
    netoGravado: e.netoGravado ?? 0,
    alicuotaIva: e.alicuotaIva ?? 0,
    iva: e.iva ?? 0,
    noGravado: e.noGravado ?? 0,
    exento: e.exento ?? 0,
    percepcionIva: e.percepcionIva ?? 0,
    percepcionIibb: e.percepcionIibb ?? 0,
    otrosImpuestos: e.otrosImpuestos ?? 0,
  }
  const calculado = totalDe(partes)
  const leido = e.total !== null ? redondear(e.total) : null

  if (leido !== null && Math.abs(calculado - leido) > 0.05) {
    avisos.push(
      `Los importes no cierran: las partes suman ${calculado.toLocaleString("es-AR")} y el total dice ${leido.toLocaleString("es-AR")}. Revisá antes de guardar.`
    )
  }

  /* Ya cargada. El índice único lo rechazaría igual al guardar, pero avisar acá
     evita que alguien complete la revisión de una factura que ya existe. */
  if (e.clase && e.puntoVenta !== null && e.numero !== null) {
    const { data: repetida } = await supabase
      .from("comprobantes")
      .select("id, fecha")
      .eq("tipo", tipo)
      .eq("clase", e.clase)
      .eq("punto_venta", e.puntoVenta)
      .eq("numero", e.numero)
      .limit(1)
      .maybeSingle()

    if (repetida) {
      avisos.push("Este comprobante ya está cargado en el sistema.")
    }
  }

  if (!e.clase) avisos.push("No se pudo determinar el tipo de comprobante.")
  if (e.clase && !buscarClase(tipo, e.clase)) {
    avisos.push(`El tipo «${e.clase}» no es un comprobante de ${tipo}.`)
  }
  if (e.moneda === "USD" && !e.tc) {
    avisos.push("Es en dólares y el documento no trae tipo de cambio. Cargalo a mano.")
  }
  if (e.confianza === "baja") {
    avisos.push("La lectura fue difícil. Revisá todos los campos con atención.")
  }
  if (e.observacionLectura) avisos.push(e.observacionLectura)

  return { archivo: nombre, extraccion: e, cliente, cuitCliente, avisos }
}
