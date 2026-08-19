import { supabase } from "@/lib/supabase"
import { esCuitValido, normalizarCuit } from "@/lib/admin/cuit"
import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { esFormaJuridica, esOrigen, type FormaJuridica, type Origen } from "@/lib/admin/entidades"
import type { TablaEntidad } from "@/lib/admin/entidades-server"

/**
 * Encontrar —o dar de alta— el proveedor o el cliente de un comprobante.
 *
 * Es la bisagra entre la carga de facturas y el resto del sistema. Una factura
 * de compra no es solo un asiento: es un proveedor que empieza a existir, una
 * cuenta corriente que arranca y una deuda que va a aparecer en pagos
 * pendientes. Si al cargarla hay que ir primero al maestro a dar de alta la
 * ficha a mano, esa cadena se corta en el primer eslabón — y lo que termina
 * pasando es que las facturas se cargan todas contra dos o tres proveedores
 * "varios".
 *
 * EL CUIT ES LA IDENTIDAD. TODO LO DEMÁS ES DESCRIPCIÓN.
 *
 * Es la regla de la que cuelga el resto de este archivo. Una empresa tiene un
 * solo CUIT y un CUIT pertenece a una sola empresa; la razón social, en cambio,
 * se escribe de cinco maneras ("RELET SRL", "Relet S.R.L.", "RELET"), se repite
 * entre empresas distintas y la lee un OCR que puede equivocarse. Tratar al
 * nombre como identidad es lo que termina con la misma empresa en cuatro fichas
 * y un estado de cuenta que no cierra.
 *
 * De ahí las tres reglas:
 *
 *  1. **Se busca por CUIT.** Si matchea, es esa empresa. No hay segunda opinión.
 *  2. **Por razón social sólo se rescatan fichas sin CUIT** —las cargadas a mano
 *     antes de tenerlo—, y al engancharlas se les completa con el del
 *     comprobante. Es el único uso legítimo del nombre: no identificar, sino
 *     encontrar la ficha huérfana para darle su identidad.
 *  3. **Sin CUIT válido no se da de alta nada.** Una ficha nueva sin CUIT nace
 *     condenada a duplicarse: la próxima factura del mismo proveedor no la va a
 *     poder encontrar. La única excepción es el proveedor del exterior, que no
 *     tiene CUIT argentino porque no existe tal cosa.
 *
 * Lo que no hace, nunca, es adivinar por parecido. "TECNO SA" y "TECNO SRL" son
 * dos empresas con dos CUIT distintos, y colgar una factura de la ficha
 * equivocada ensucia dos cuentas corrientes de una — el error más caro, porque
 * no se ve hasta que alguien reclama un pago.
 */

export const TABLA_DE_TIPO: Record<TipoComprobante, TablaEntidad> = {
  compra: "proveedores",
  venta: "clientes",
}

/** Los campos de la ficha que la carga de comprobantes necesita conocer. */
const SELECT_FICHA = "id, razon_social, cuit, cuenta_contable_id, condicion_pago_dias, activo"

export type FichaEncontrada = {
  id: string
  razonSocial: string
  cuit: string | null
  cuentaContableId: string | null
  condicionPagoDias: number | null
  activo: boolean
  por: "cuit" | "razon_social"
}

type FilaFicha = {
  id: string
  razon_social: string
  cuit: string | null
  cuenta_contable_id: string | null
  condicion_pago_dias: number | null
  activo: boolean
}

function aFicha(fila: FilaFicha, por: FichaEncontrada["por"]): FichaEncontrada {
  return {
    id: fila.id,
    razonSocial: fila.razon_social,
    cuit: fila.cuit,
    cuentaContableId: fila.cuenta_contable_id,
    condicionPagoDias: fila.condicion_pago_dias,
    activo: fila.activo,
    por,
  }
}

/* ── Búsqueda ─────────────────────────────────────────────────────────────── */

/**
 * La ficha que corresponde a estos datos, o null.
 *
 * `cuits` viene como lista porque de un comprobante se leen dos —emisor y
 * receptor— y cuál es la contraparte depende del circuito. Se prueban los dos y
 * gana el preferido: quien escanea puede haber cargado un remito al revés, y es
 * mejor encontrar la ficha del lado equivocado y avisarlo que no encontrar nada.
 */
export async function buscarFicha(
  tabla: TablaEntidad,
  { cuits, razonSocial }: { cuits: (string | null)[]; razonSocial?: string | null }
): Promise<FichaEncontrada | null> {
  const candidatos = cuits.filter((c): c is string => Boolean(c))

  if (candidatos.length > 0) {
    const { data } = await supabase
      .from(tabla)
      .select(SELECT_FICHA)
      .in("cuit", candidatos)
      .limit(2)

    const filas = (data ?? []) as FilaFicha[]
    // El orden de `cuits` es la preferencia: el primero es el lado del
    // mostrador que corresponde al circuito que se está cargando.
    for (const cuit of candidatos) {
      const fila = filas.find((f) => f.cuit === cuit)
      if (fila) return aFicha(fila, "cuit")
    }
  }

  /**
   * El rescate de la ficha huérfana.
   *
   * `cuit is null` no es un detalle del filtro: es toda la regla. Si la ficha
   * tiene CUIT y no matcheó arriba, entonces su CUIT es **otro** y por lo tanto
   * es otra empresa, por más que el nombre coincida al carácter. Buscar por
   * nombre sin esta condición es lo que engancha la factura de "DISTRIBUIDORA
   * DEL SUR SA" de Rosario a la homónima de Córdoba.
   *
   * Queda entonces un solo caso: la ficha cargada a mano antes de tener el CUIT.
   * A esa se la busca por nombre, se la engancha, y `obtenerOCrearEntidad` le
   * escribe el CUIT del comprobante — con lo cual deja de ser huérfana y la
   * próxima factura la va a encontrar por el camino bueno.
   */
  const nombre = (razonSocial ?? "").trim()
  if (nombre.length >= 3 && !tieneComodines(nombre)) {
    // `ilike` sin comodines es igualdad sin distinguir mayúsculas: no es un
    // parecido, es el mismo nombre escrito con otra caja. El `limit(2)` está
    // para poder descartar el caso ambiguo.
    const { data } = await supabase
      .from(tabla)
      .select(SELECT_FICHA)
      .ilike("razon_social", nombre.replace(/[_\\]/g, "\\$&"))
      .is("cuit", null)
      .limit(2)

    const filas = (data ?? []) as FilaFicha[]
    if (filas.length === 1) return aFicha(filas[0], "razon_social")
  }

  return null
}

/** PostgREST traduce `*` a `%` en los patrones de `ilike`, así que una razón
 *  social que lo contenga buscaría de más — y en un maestro chico "de más"
 *  significa colgar la factura de la ficha equivocada. Con comodines adentro no
 *  se busca por nombre; queda el CUIT, que es el camino confiable igual. */
function tieneComodines(v: string): boolean {
  return v.includes("*") || v.includes("%")
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

export type DatosDeAlta = {
  razonSocial: string
  cuit: string | null
  origen: Origen
  formaJuridica: FormaJuridica | null
  direccion: string | null
}

export type ResultadoEntidad =
  | { id: string; razonSocial: string; creada: boolean }
  | { error: string; status: number }

/**
 * La ficha para estos datos, exista o no.
 *
 * Se vuelve a buscar antes de insertar aunque la pantalla ya haya buscado: entre
 * la lectura del PDF y el guardado pasan minutos, y en el medio pueden haberse
 * guardado las otras cinco facturas del mismo proveedor nuevo. Sin este segundo
 * chequeo, seis archivos de un proveedor que no existía terminan en seis fichas
 * —o en un 23505 y cinco facturas sin cargar.
 *
 * El 23505 se contempla igual, porque dos pestañas guardando a la vez pasan
 * entre el SELECT y el INSERT: ahí no se falla, se vuelve a buscar y se usa la
 * que ganó la carrera. El índice único del CUIT es el que garantiza que sea una
 * sola.
 */
export async function obtenerOCrearEntidad(
  tabla: TablaEntidad,
  datos: DatosDeAlta
): Promise<ResultadoEntidad> {
  const razonSocial = datos.razonSocial.trim().slice(0, 200)
  if (!razonSocial) {
    return {
      error:
        tabla === "proveedores"
          ? "No se pudo leer la razón social del proveedor: elegilo a mano"
          : "No se pudo leer la razón social del cliente: elegilo a mano",
      status: 400,
    }
  }

  const cuit = normalizarCuit(datos.cuit)
  const delExterior = datos.origen === "exterior"

  if (cuit && !esCuitValido(cuit)) {
    return {
      error: `El CUIT ${cuit} no pasa el dígito verificador. Corregilo o elegí la ficha a mano.`,
      status: 400,
    }
  }

  const existente = await buscarFicha(tabla, { cuits: [cuit], razonSocial })
  if (existente) {
    // La ficha vieja cargada sin CUIT se completa con el del comprobante. Es la
    // diferencia entre un maestro que mejora con el uso y uno que acumula
    // fichas a medio llenar que nadie vuelve a tocar.
    if (cuit) await completarCuit(tabla, existente.id, cuit)
    return { id: existente.id, razonSocial: existente.razonSocial, creada: false }
  }

  /**
   * Sin CUIT no se crea la ficha. No es una validación de formulario: es la
   * regla que sostiene todo el módulo.
   *
   * Una ficha nueva sin CUIT es una ficha que nadie va a poder volver a
   * encontrar. La próxima factura del mismo proveedor busca por CUIT, no
   * encuentra nada, y crea una segunda — y en seis meses hay cuatro "TECNO SUR"
   * con la deuda repartida entre las cuatro. Es más barato frenar la carga y
   * pedir once dígitos que desarmar eso después.
   *
   * El proveedor del exterior es la única excepción real: no tiene CUIT porque
   * no existe el CUIT fuera de Argentina, y su comprobante es una factura E.
   */
  if (!cuit && !delExterior) {
    return {
      error:
        tabla === "proveedores"
          ? `No se puede dar de alta «${razonSocial}» sin CUIT: es lo que identifica al proveedor. Cargalo o elegí una ficha existente.`
          : `No se puede dar de alta «${razonSocial}» sin CUIT: es lo que identifica al cliente. Cargalo o elegí una ficha existente.`,
      status: 400,
    }
  }

  const fila = {
    razon_social: razonSocial,
    cuit,
    origen: esOrigen(datos.origen) ? datos.origen : "nacional",
    forma_juridica: esFormaJuridica(datos.formaJuridica) ? datos.formaJuridica : null,
    direccion: datos.direccion?.trim().slice(0, 200) || null,
    // Queda anotado de dónde salió. Una ficha creada por la carga automática
    // tiene menos datos que una cargada a mano, y quien la complete después
    // tiene que poder distinguirla.
    notas: "Alta automática desde la carga de comprobantes.",
  }

  const { data, error } = await supabase
    .from(tabla)
    .insert(fila)
    .select("id, razon_social")
    .single()

  if (!error && data) {
    return { id: data.id as string, razonSocial: data.razon_social as string, creada: true }
  }

  if (error?.code === "23505" && cuit) {
    const ganadora = await buscarFicha(tabla, { cuits: [cuit] })
    if (ganadora) {
      return { id: ganadora.id, razonSocial: ganadora.razonSocial, creada: false }
    }
  }

  console.error(`[${tabla} alta automática]`, error)
  return {
    error:
      tabla === "proveedores"
        ? "No se pudo dar de alta el proveedor"
        : "No se pudo dar de alta el cliente",
    status: 500,
  }
}

/**
 * Le escribe a una ficha el CUIT que trae el comprobante, si no tenía.
 *
 * El `is("cuit", null)` del where no es redundante con el chequeo previo: entre
 * que se leyó la ficha y se la actualiza, otra carga pudo habérselo puesto. Así
 * el update no pisa nada — a lo sumo no afecta ninguna fila.
 *
 * Nunca reemplaza un CUIT existente. Si la ficha dice uno y el papel dice otro,
 * no son la misma empresa y el problema es de identificación, no de completar un
 * dato: eso lo resuelve una persona, no un update.
 */
export async function completarCuit(
  tabla: TablaEntidad,
  id: string,
  cuit: string
): Promise<void> {
  if (!esCuitValido(cuit)) return
  const { error } = await supabase
    .from(tabla)
    .update({ cuit })
    .eq("id", id)
    .is("cuit", null)

  // El 23505 acá significa que ese CUIT ya es de otra ficha — o sea que hay dos
  // fichas para la misma empresa. No se puede arreglar solo; se deja pasar para
  // no frenar la carga de la factura, que es correcta igual.
  if (error && error.code !== "23505") console.error(`[${tabla} completar cuit]`, error)
}

/* ── La cuenta de imputación ──────────────────────────────────────────────── */

/**
 * Guarda en la ficha la cuenta contra la que se imputó su comprobante.
 *
 * Es lo que hace que el sistema aprenda en vez de preguntar siempre lo mismo. La
 * primera factura de un proveedor nuevo entra sin cuenta y hay que elegirla a
 * mano; a partir de la segunda ya viene puesta, porque la primera la dejó
 * anotada acá.
 *
 * **Sólo escribe si la ficha no tenía ninguna.** Un proveedor de fletes al que
 * un día se le imputa una factura a otra cuenta no debería cambiar su default
 * por eso: la excepción es la factura, no el proveedor. Ese es también el motivo
 * de que esto no sea un `update` a secas — el `is null` en el where hace que dos
 * cargas simultáneas no se pisen.
 *
 * Es deliberado que aprenda de la primera y no de la más frecuente. Adivinar por
 * frecuencia requiere historia que todavía no existe justo cuando más falta
 * hace, y una regla que se puede explicar en una frase es una regla que alguien
 * puede corregir desde la ficha cuando no le gusta.
 */
export async function recordarCuentaEnFicha(
  tabla: TablaEntidad,
  entidadId: string,
  cuentaContableId: string
): Promise<void> {
  const { error } = await supabase
    .from(tabla)
    .update({ cuenta_contable_id: cuentaContableId })
    .eq("id", entidadId)
    .is("cuenta_contable_id", null)

  if (error) console.error(`[${tabla} recordar cuenta]`, error)
}
