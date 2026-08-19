import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { esCuitValido, normalizarCuit } from "@/lib/admin/cuit"
import { buscarClase, totalDe, type TipoComprobante } from "@/lib/admin/comprobantes"
import { TABLA_DE_TIPO, buscarFicha } from "@/lib/admin/entidad-de-comprobante"
import { sumarDias } from "@/lib/admin/fecha"
import { leerDocumento } from "@/lib/admin/lectura-server"
import { redondear } from "@/lib/admin/moneda"
import {
  ARCHIVOS_MAX,
  PROMPT_EXTRACCION,
  SCHEMA_EXTRACCION,
  type AltaSugerida,
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
 * la contraparte, si su ficha existe, contra qué cuenta se imputa, si esa
 * factura ya está cargada y si los importes cierran.
 *
 * De acá sale todo el impacto que la factura va a tener en el resto del sistema.
 * Es a propósito que se resuelva antes de guardar y no después: lo que se
 * propone —la ficha, la imputación, el vencimiento— se muestra en pantalla y se
 * puede corregir. Un alta automática que ocurre en silencio al apretar guardar
 * es la que llena el maestro de proveedores duplicados.
 */
async function enriquecer(
  tipo: TipoComprobante,
  nombre: string,
  e: Extraccion
): Promise<Borrador> {
  const esCompra = tipo === "compra"
  const tabla = TABLA_DE_TIPO[tipo]
  const rotulo = esCompra ? "proveedor" : "cliente"
  const avisos: string[] = []

  /* Quién es la contraparte. El modelo devuelve emisor y receptor sin decidir;
     acá se cruzan los dos contra el maestro y gana el que exista. Es más robusto
     que configurar "nuestro CUIT" en algún lado y que quede desactualizado. */
  const cuitEmisor = normalizarCuit(e.emisorCuit)
  const cuitReceptor = normalizarCuit(e.receptorCuit)

  // En una venta el cliente es el receptor; en una compra el proveedor es el
  // emisor. Se prueban los dos igual —quien cargó puede haber escaneado algo al
  // revés— pero el orden de preferencia cambia con el tipo.
  const preferido = esCompra ? cuitEmisor : cuitReceptor
  const otroCuit = esCompra ? cuitReceptor : cuitEmisor
  const razonPreferida = esCompra ? e.emisorRazonSocial : e.receptorRazonSocial

  const ficha = await buscarFicha(tabla, {
    cuits: [preferido, otroCuit],
    razonSocial: razonPreferida,
  })

  const cuitEntidad = preferido ?? otroCuit

  /* La ficha a dar de alta si no hay ninguna. Se arma siempre que haya razón
     social: es el dato mínimo con el que la ficha tiene sentido, y el CUIT
     puede completarse después desde la pantalla del maestro. */
  let alta: AltaSugerida | null = null
  if (!ficha) {
    const razonSocial = (razonPreferida ?? "").trim()
    if (razonSocial) {
      alta = {
        razonSocial,
        cuit: cuitEntidad,
        // Una factura E es de exportación: la contraparte está afuera y no
        // tiene CUIT ni condición de IVA argentina. Fuera de ese caso se asume
        // nacional — un CUIT ilegible no convierte a un proveedor de Avellaneda
        // en uno del exterior.
        origen: e.clase?.endsWith("EA") ? "exterior" : "nacional",
        formaJuridica: esCompra ? e.emisorCondicionIva : e.receptorCondicionIva,
        direccion: esCompra ? e.emisorDomicilio : e.receptorDomicilio,
      }
    }
  }

  if (!ficha && !alta) {
    avisos.push(
      `No se pudo leer quién es el ${rotulo}. Elegilo a mano antes de guardar.`
    )
  } else if (!ficha && alta) {
    /* El CUIT manda: es lo que identifica al proveedor y lo que va a permitir
       encontrarlo la próxima vez. Sin uno válido no hay alta posible, así que el
       aviso no es una sugerencia — dice qué falta para poder guardar. */
    if (alta.origen === "exterior") {
      avisos.push(
        `${rotulo === "proveedor" ? "Proveedor" : "Cliente"} del exterior: se da de alta sin CUIT, que es lo correcto en un comprobante E.`
      )
    } else if (!alta.cuit) {
      avisos.push(
        `No se pudo leer el CUIT del ${rotulo}. Es el dato que lo identifica: cargalo a mano o elegí una ficha existente — sin él no se puede dar de alta.`
      )
    } else if (!esCuitValido(alta.cuit)) {
      avisos.push(
        `El CUIT ${alta.cuit} no pasa el dígito verificador, así que está mal leído o mal impreso. Corregilo contra el papel antes de guardar.`
      )
    } else {
      avisos.push(
        `El ${rotulo} no está en el sistema: se va a dar de alta con CUIT ${alta.cuit}.`
      )
    }
  } else if (ficha) {
    if (ficha.por === "razon_social") {
      avisos.push(
        `«${ficha.razonSocial}» estaba cargado sin CUIT y se enganchó por el nombre. Verificá que sea el mismo ${rotulo}: al guardar se le completa el CUIT del comprobante.`
      )
    }
    if (!ficha.activo) {
      avisos.push(`La ficha de ${ficha.razonSocial} está dada de baja en el maestro.`)
    }
    if (ficha.cuit && ficha.cuit === otroCuit && otroCuit !== preferido) {
      // La ficha apareció del lado equivocado del comprobante: casi siempre
      // significa que se está cargando en el circuito que no es.
      avisos.push(
        esCompra
          ? `Ojo: ${ficha.razonSocial} figura como receptor, no como emisor. ¿No es una factura de venta?`
          : `Ojo: ${ficha.razonSocial} figura como emisor, no como receptor. ¿No es una factura de compra?`
      )
    }
  }

  /**
   * La imputación contable: la que tiene guardada la ficha, y nada más.
   *
   * Hubo un default por tipo acá y se sacó. La idea era que ninguna factura
   * quedara sin asiento, pero contra los datos reales acertaba la mitad de las
   * veces —el mismo maestro tenía proveedores de reventa y de fletes— y el
   * resultado era peor que el problema: una factura **sin** asiento aparece en
   * `documentos_sin_asiento` y alguien la arregla, mientras que una con el
   * asiento **mal** imputado cuadra el balance igual y no la ve nadie.
   *
   * Entre un error ruidoso y uno silencioso, en contabilidad se elige el
   * ruidoso. Sin cuenta en la ficha se deja en null a propósito, el aviso lo
   * dice, y el módulo muestra el cartel para corregirlo en dos clicks. Como al
   * confirmar la cuenta elegida queda guardada en la ficha, esto pasa una sola
   * vez por proveedor.
   */
  const cuentaContableId = ficha?.cuentaContableId ?? null
  if (!cuentaContableId) {
    avisos.push(
      ficha
        ? `${ficha.razonSocial} no tiene cuenta contable en su ficha. Elegí contra cuál se imputa: queda guardada y las próximas facturas ya vienen con ella.`
        : "Elegí la cuenta contable: sin ella la factura entra pero no llega al mayor."
    )
  }

  /* El vencimiento. El papel manda; si no lo trae, lo propone el plazo pactado
     en la ficha. De este dato dependen el semáforo de vencidas y el orden con
     que las facturas aparecen para pagar. */
  const plazo = ficha?.condicionPagoDias ?? null
  const fechaVencimiento =
    e.fechaVencimiento ?? (e.fecha && plazo !== null ? sumarDias(e.fecha, plazo) : null)

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
     evita que alguien complete la revisión de una factura que ya existe.

     En compras el proveedor entra en la clave, igual que en el índice: el
     0001-00000123 de un proveedor no tiene nada que ver con el de otro, y sin
     ese filtro el aviso saltaba en facturas perfectamente nuevas. Un proveedor
     que se está por dar de alta no tiene comprobantes, así que ahí no hay nada
     que chequear. */
  const puedeSerRepetida =
    e.clase !== null &&
    e.puntoVenta !== null &&
    e.numero !== null &&
    (!esCompra || ficha !== null)

  if (puedeSerRepetida) {
    let consulta = supabase
      .from("comprobantes")
      .select("id")
      .eq("tipo", tipo)
      .eq("clase", e.clase as string)
      .eq("punto_venta", e.puntoVenta as number)
      .eq("numero", e.numero as number)

    if (esCompra) consulta = consulta.eq("proveedor_id", (ficha as { id: string }).id)

    const { data: repetida } = await consulta.limit(1).maybeSingle()

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

  return {
    archivo: nombre,
    extraccion: e,
    entidad: ficha,
    alta,
    cuitEntidad,
    cuentaContableId,
    fechaVencimiento,
    avisos,
  }
}
