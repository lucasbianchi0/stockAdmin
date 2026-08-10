import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { esCuitValido, normalizarCuit } from "@/lib/admin/cuit"
import type { TipoEntidad } from "@/lib/admin/entidades"
import {
  PROMPT_FICHA,
  SCHEMA_FICHA,
  type BorradorFicha,
  type CandidatoFicha,
  type LecturaFicha,
} from "@/lib/admin/lectura-ficha"
import {
  PROMPT_GASTO,
  SCHEMA_GASTO,
  type BorradorGasto,
  type LecturaGasto,
} from "@/lib/admin/lectura-gasto"
import { archivoDelForm, leerDocumento } from "@/lib/admin/lectura-server"

/**
 * Los endpoints de carga inteligente que no son facturas.
 *
 * Los tres lectores del módulo comparten la misma forma —adjuntar, leer,
 * devolver un borrador con avisos— y se diferencian en qué cruzan contra la
 * base. Acá está ese cruce: lo que el modelo no puede saber mirando el papel.
 */

function faltaClave() {
  return NextResponse.json(
    { error: "Falta configurar ANTHROPIC_API_KEY en el servidor" },
    { status: 500 }
  )
}

/* ── Ficha de cliente o proveedor ─────────────────────────────────────────── */

export async function leerFicha(tipo: TipoEntidad, req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return faltaClave()

  const entrada = await archivoDelForm(req)
  if ("error" in entrada) return NextResponse.json({ error: entrada.error }, { status: 400 })

  const lectura = await leerDocumento<LecturaFicha>(entrada.archivo, PROMPT_FICHA, SCHEMA_FICHA)
  if ("error" in lectura) return NextResponse.json({ error: lectura.error }, { status: 422 })

  return NextResponse.json(await enriquecerFicha(tipo, lectura.datos))
}

async function enriquecerFicha(tipo: TipoEntidad, l: LecturaFicha): Promise<BorradorFicha> {
  const esProveedor = tipo === "proveedor"
  const tabla = esProveedor ? "proveedores" : "clientes"
  const avisos: string[] = []

  const candidatos: CandidatoFicha[] = l.empresas.map((e) => {
    const normalizado = normalizarCuit(e.cuit)
    const valido = normalizado !== null && esCuitValido(normalizado)
    return {
      ...e,
      cuitNormalizado: valido ? normalizado : null,
      // Un CUIT que no pasa el dígito verificador casi siempre es un dígito mal
      // leído. Se avisa en vez de descartarlo: quien tiene el papel delante lo
      // corrige de un vistazo, y borrarlo obligaría a tipear los once.
      cuitInvalido: normalizado !== null && !valido,
      existente: null,
    }
  })

  /* Cuáles ya están cargados. Se pregunta por todos los CUIT de una: son dos
     como mucho, pero una consulta por empresa no aporta nada. */
  const cuits = candidatos.map((c) => c.cuitNormalizado).filter((c): c is string => c !== null)

  if (cuits.length > 0) {
    const { data } = await supabase
      .from(tabla)
      .select("id, razon_social, cuit")
      .in("cuit", cuits)

    for (const c of candidatos) {
      const fila = (data ?? []).find((f) => f.cuit === c.cuitNormalizado)
      if (fila) c.existente = { id: fila.id, razonSocial: fila.razon_social }
    }
  }

  /* El orden: primero el que corresponde al circuito. Un proveedor es quien
     emite la factura que recibimos; un cliente es a quién se la emitimos. Con el
     rol bien leído, el primero de la lista es el que se quiere cargar en nueve
     de cada diez casos. */
  const preferido = esProveedor ? "emisor" : "receptor"
  candidatos.sort((a, b) => peso(b.rol, preferido) - peso(a.rol, preferido))

  if (candidatos.length === 0) {
    avisos.push("No se encontraron datos de ninguna empresa en el documento.")
  }
  if (candidatos[0]?.existente) {
    avisos.push(
      `${candidatos[0].existente.razonSocial} ya está cargado con ese CUIT: revisá antes de duplicarlo.`
    )
  }
  if (candidatos.some((c) => c.cuitInvalido)) {
    avisos.push("El CUIT leído no pasa el dígito verificador. Revisalo contra el papel.")
  }
  if (candidatos[0] && !candidatos[0].razonSocial) {
    avisos.push("No se pudo leer la razón social, que es el único dato obligatorio.")
  }
  if (l.confianza === "baja") {
    avisos.push("La lectura fue difícil. Revisá todos los campos con atención.")
  }
  if (l.observacionLectura) avisos.push(l.observacionLectura)

  return {
    candidatos,
    tipoDocumento: l.tipoDocumento,
    confianza: l.confianza,
    camposDudosos: l.camposDudosos,
    avisos,
  }
}

/** Cuánto vale un rol para el circuito que se está cargando. El titular de una
 *  constancia de AFIP sirve para los dos lados. */
function peso(rol: string | null, preferido: string): number {
  if (rol === preferido) return 2
  if (rol === "titular") return 1
  return 0
}

/* ── Gasto de caja ────────────────────────────────────────────────────────── */

export async function leerGasto(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return faltaClave()

  const entrada = await archivoDelForm(req)
  if ("error" in entrada) return NextResponse.json({ error: entrada.error }, { status: 400 })

  const lectura = await leerDocumento<LecturaGasto>(entrada.archivo, PROMPT_GASTO, SCHEMA_GASTO)
  if ("error" in lectura) return NextResponse.json({ error: lectura.error }, { status: 422 })

  return NextResponse.json(enriquecerGasto(lectura.datos))
}

function enriquecerGasto(g: LecturaGasto): BorradorGasto {
  const avisos: string[] = []

  /* El aviso que justifica el lector. Un gasto y una factura de compra salen la
     misma plata de la misma cuenta, así que cargar una factura como gasto no
     descuadra nada visible — solo deja el IVA afuera del libro de compras, y eso
     se descubre recién cuando el crédito fiscal no cierra. */
  if (g.discriminaIva) {
    avisos.push(
      "Este documento discrimina IVA: probablemente vaya en Facturas de compra y no como gasto. Cargado acá, ese IVA no se computa como crédito fiscal."
    )
  }

  if (g.importe === null) avisos.push("No se pudo leer el importe.")
  if (g.fecha === null) avisos.push("No se pudo leer la fecha.")
  if (g.moneda === "USD" && !g.tc) {
    avisos.push("Es en dólares y el documento no trae tipo de cambio. Cargalo a mano.")
  }
  if (g.confianza === "baja") {
    avisos.push("La lectura fue difícil. Revisá todos los campos con atención.")
  }
  if (g.observacionLectura) avisos.push(g.observacionLectura)

  return { gasto: g, avisos }
}
