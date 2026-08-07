/**
 * Contexto curado del informe mensual de campañas.
 *
 * Este archivo es el que garantiza que todos los informes salgan iguales. Si el
 * prompt cambiara mes a mes, un informe de julio y uno de agosto no se podrían
 * comparar: no sabrías si cambió el negocio o cambió el analista.
 *
 * Tres piezas:
 *   1. CONTEXTO_NEGOCIO  — lo que el modelo tiene que saber de Accedra. Fijo.
 *   2. INFORME_SCHEMA    — la rúbrica, forzada por esquema (structured outputs).
 *                          Las secciones no pueden faltar ni cambiar de orden.
 *   3. SYSTEM_PROMPT     — cómo analiza: criterio, tono y reglas de lectura.
 *
 * REGLA DE ORO: el modelo NO calcula. Recibe las métricas ya calculadas y sólo
 * las interpreta. Si calculara, los números no serían auditables y cambiarían
 * entre corridas.
 *
 * Al modificar la rúbrica o el prompt hay que subir PROMPT_VERSION. Cada informe
 * guarda con qué versión se generó, para saber si una diferencia entre meses
 * viene del negocio o del analista.
 */

/** Subir a mano al cambiar el schema o el system prompt. */
export const PROMPT_VERSION = "1.1.0"

/** Análisis de negocio con razonamiento: Opus, no un modelo de generación de copy. */
export const MODEL = "claude-opus-5"

// ─────────────────────────────────────────────────────────────────────────────
//  1. Contexto de negocio — estable, va primero para que la caché lo aproveche
// ─────────────────────────────────────────────────────────────────────────────

export const CONTEXTO_NEGOCIO = `
Accedra IT Solutions es un proveedor de infraestructura y servicios de tecnología
para empresas, con sede en CABA y 17 años en el mercado. Vende a otras empresas
(B2B), no a consumidores.

CINCO SOLUCIONES:
- Firma Biométrica — firma electrónica y digital con validez legal. Es el
  diferencial de la empresa y el motor histórico de resultados.
- Networking — infraestructura de red, cableado estructurado, conectividad.
- Seguridad IT — ciberseguridad corporativa, arquitectura Zero Trust.
- Consultoría — ecosistema Microsoft y analítica de datos.
- Software & AI — desarrollo a medida e inteligencia aplicada.

SEIS INDUSTRIAS OBJETIVO:
bancos, aseguradoras, estudios jurídicos, laboratorios y salud, logística, retail.

ESTRUCTURA DE CAMPAÑAS:
Una campaña por solución. Un grupo de anuncios por industria dentro de cada
solución. Cada grupo apunta a su landing propia en accedra.com.ar.

CÓMO ES EL NEGOCIO — esto condiciona toda la lectura:
- El ciclo de venta es largo: entre la primera consulta y el contrato firmado
  pasan de 3 a 6 meses.
- El valor por cliente es alto y muy desparejo: entre el mejor y el peor lead de
  un mes puede haber dos órdenes de magnitud.
- El volumen es bajo: del orden de 200 clics mensuales en toda la cuenta. Esto
  significa que un solo mes casi nunca alcanza para concluir nada sobre calidad.
- La inflación argentina hace que comparar montos en pesos a más de 3 meses no
  tenga sentido. Para períodos largos se comparan proporciones.

QUIÉN LEE EL INFORME:
Los dueños y socios de la empresa, que no son técnicos ni de marketing. Hay que
escribirles a ellos: sin jerga, sin siglas sin explicar, y diciendo siempre si un
número es bueno o malo y por qué.
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
//  2. La rúbrica — forzada por esquema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Se pasa como `output_config.format`. Es lo que garantiza que todos los meses
 * tengan las mismas secciones: pedírselo al prompt no alcanza, el modelo se
 * desvía. Con el esquema, no puede.
 */
export const INFORME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "semaforo",
    "titular",
    "lectura_del_mes",
    "por_iniciativa",
    "evaluacion_acciones",
    "propuestas",
    "advertencias",
  ],
  properties: {
    semaforo: {
      type: "string",
      enum: ["verde", "amarillo", "rojo"],
      description:
        "verde: la inversión rinde y mejora. amarillo: hay señales mixtas o falta información. rojo: algo está roto o el dinero se está perdiendo.",
    },
    titular: {
      type: "string",
      description:
        "Una sola frase, máximo 140 caracteres, que un dueño no técnico entienda sin leer nada más. Dice qué pasó este mes, no qué se hizo.",
    },
    lectura_del_mes: {
      type: "string",
      description:
        "Dos o tres párrafos interpretando los indicadores. Explica qué significan los números, no los repite. Siempre dice si algo es bueno o malo y contra qué se compara.",
    },
    por_iniciativa: {
      type: "array",
      description: "Una entrada por solución con inversión en el período. Las apagadas no entran.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["solucion", "veredicto", "comentario"],
        properties: {
          solucion: { type: "string" },
          veredicto: {
            type: "string",
            enum: ["sostener", "aumentar", "reducir", "apagar", "sin_datos"],
          },
          comentario: {
            type: "string",
            description:
              "Una o dos frases: por qué ese veredicto, citando el índice de eficiencia o el costo por consulta.",
          },
        },
      },
    },
    evaluacion_acciones: {
      type: "array",
      description:
        "Una entrada por acción registrada en el período anterior, evaluada contra la hipótesis que se anotó ANTES de ejecutarla.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["accion", "hipotesis", "resultado", "evidencia"],
        properties: {
          accion: { type: "string" },
          hipotesis: { type: "string", description: "Lo que se esperaba, tal como se registró." },
          resultado: { type: "string", enum: ["cumplida", "no_cumplida", "pendiente"] },
          evidencia: {
            type: "string",
            description: "El dato concreto que sostiene el veredicto. Nunca una opinión.",
          },
        },
      },
    },
    propuestas: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      description:
        "Máximo 3. Un informe con quince recomendaciones no se ejecuta. Van ordenadas por impacto esperado.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["accion", "hipotesis", "metrica_objetivo"],
        properties: {
          accion: { type: "string", description: "Qué hacer, en imperativo y concreto." },
          hipotesis: { type: "string", description: "Qué esperamos que pase, con un número." },
          metrica_objetivo: {
            type: "string",
            description: "Qué indicador lo va a confirmar o desmentir el mes que viene.",
          },
        },
      },
    },
    advertencias: {
      type: "array",
      maxItems: 3,
      description:
        "Trampas de lectura de ESTE informe: pocos datos, cambio de estructura, medición parcial, estacionalidad. Vacío si no hay ninguna.",
      items: { type: "string" },
    },
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
//  3. El analista
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `
Sos un especialista en marketing de performance que audita las campañas de Google
Ads de Accedra y escribe el informe mensual para los dueños de la empresa.

${CONTEXTO_NEGOCIO}

QUÉ HACÉS Y QUÉ NO
- Interpretás los números que te pasan. NO los calculás ni los estimás. Si un dato
  no está, decilo; nunca lo completes.
- Cada afirmación se apoya en un número del informe. Si no podés citarlo, no lo
  afirmes.
- No adornes: si el mes fue malo, el informe dice que fue malo.

REGLAS DE LECTURA — son obligatorias
1. Con este volumen (~200 clics/mes), el costo por consulta y la tasa de conversión
   de un solo mes son ruido. Si tenés menos de tres meses de datos, decilo
   explícitamente en "advertencias" y apoyate en los indicadores de calidad
   (términos relevantes, gasto sin resultado, CTR), que se estabilizan más rápido.
2. Comparaciones en pesos: hasta 3 meses. Más allá, compará proporciones.
3. Si cambió la cantidad de grupos o campañas activas, la inversión total NO es
   comparable de frente. Avisalo.
4. Un período sin medición activa no tiene datos de consultas. No los estimes.
5. La campaña de marca va siempre separada del total. Convierte barato por
   definición y mezclarla infla los resultados y tapa cómo rinde la captación.
6. El costo por consulta no se compara entre soluciones si no tenés el valor
   promedio de contrato de cada una: defundirías la solución cara pero rentable.

CÓMO DECIDÍS EL VEREDICTO POR INICIATIVA
Usá el índice de eficiencia (% de consultas que aporta ÷ % de inversión que
consume):
- índice ≥ 1,2 y con volumen suficiente → aumentar
- índice entre 0,8 y 1,2 → sostener
- índice < 0,8 con al menos 2 meses de datos → reducir
- índice < 0,5 con al menos 2 meses de datos → apagar
- menos de 15 clics en el período → sin_datos (no alcanza para juzgar)

Si el diagnóstico es que la landing no convierte (mucho tráfico, pocas consultas),
decilo: la acción es revisar la página, no apagar la campaña. Son problemas
distintos que se ven iguales en Google Ads.

CÓMO ESCRIBÍS
- Para alguien que no sabe qué es un CTR ni una concordancia. Si usás un término
  técnico, explicalo en la misma frase.
- Frases cortas. Sin adjetivos de relleno ni "es importante destacar que".
- Números siempre con contexto: no "el CTR fue 4,2%", sino "el CTR fue 4,2%, casi
  el doble del promedio del rubro".
- En español rioplatense, tuteo con voseo.
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
//  4. Armado del mensaje
// ─────────────────────────────────────────────────────────────────────────────

export type Snapshot = {
  periodo: string
  periodo_anterior: string
  /** Métricas ya calculadas en SQL o en el importador. El modelo no calcula. */
  metricas: Record<string, unknown>
  metricas_anteriores: Record<string, unknown>
  por_solucion: Array<Record<string, unknown>>
  terminos_top: Array<Record<string, unknown>>
  acciones_del_periodo_anterior: Array<{ accion: string; hipotesis: string }>
  /** Cambios de estructura que rompen la comparación directa. */
  notas_de_estructura?: string[]
}

export function construirPrompt(s: Snapshot): string {
  return [
    `PERÍODO: ${s.periodo} (se compara contra ${s.periodo_anterior})`,
    "",
    "INDICADORES DEL PERÍODO",
    JSON.stringify(s.metricas, null, 2),
    "",
    "INDICADORES DEL PERÍODO ANTERIOR",
    JSON.stringify(s.metricas_anteriores, null, 2),
    "",
    "POR SOLUCIÓN",
    JSON.stringify(s.por_solucion, null, 2),
    "",
    "TÉRMINOS DE BÚSQUEDA CON MÁS GASTO",
    JSON.stringify(s.terminos_top, null, 2),
    "",
    "ACCIONES REGISTRADAS EL PERÍODO ANTERIOR (evaluá cada una contra su hipótesis)",
    JSON.stringify(s.acciones_del_periodo_anterior, null, 2),
    ...(s.notas_de_estructura?.length
      ? ["", "CAMBIOS DE ESTRUCTURA EN EL PERÍODO", s.notas_de_estructura.map((n) => `- ${n}`).join("\n")]
      : []),
  ].join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Prompt maestro para uso manual
// ─────────────────────────────────────────────────────────────────────────────

/** Dónde vive la plantilla HTML que el informe tiene que respetar. */
export const RUTA_PLANTILLA = "/informes/plantilla-mensual.html"

/**
 * Arma el prompt completo y autosuficiente para generar un informe a mano,
 * pegándolo en cualquier chat de Claude junto con los CSV del mes.
 *
 * Es el puente hasta que exista la integración por API: mismo criterio, mismo
 * formato y misma rúbrica que usaría la ruta automática, sin depender de ella.
 * Lo único que cambia mes a mes es el período y los datos.
 */
export function construirPromptMaestro(plantillaHtml: string, periodo: string): string {
  return `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════════════════════════
TAREA
═══════════════════════════════════════════════════════════════════════

Generá el informe de campañas de Google Ads correspondiente a: ${periodo}

Te voy a pasar siete CSV exportados de Google Ads al final de este mensaje. Cada
uno cumple una función distinta:

1. CAMPAÑAS (del período, segmentado por mes) — el nivel SOLUCIÓN. De acá salen
   los indicadores principales y la fila por solución.
   Incluye las columnas de cuota de impresiones perdida por presupuesto y por
   clasificación: sirven para distinguir "falta plata" de "falta calidad".
2. GRUPOS DE ANUNCIOS (del período) — el nivel INDUSTRIA. Cada grupo es una
   industria dentro de su solución. Sin esto no se puede armar el desglose por
   vertical, que es donde se decide el reparto del presupuesto.
3. TÉRMINOS DE BÚSQUEDA (del período) — el % de gasto sin resultado, el top de
   términos caros y los candidatos a excluir.
4. PALABRAS CLAVE (del período) — el detalle de qué se está comprando.
5. PALABRAS CLAVE NEGATIVAS (listado actual, sin rango) — sirve para NO proponer
   excluir algo que ya está excluido. Cruzá siempre los candidatos contra esta
   lista antes de sugerirlos.
6. ANUNCIOS (listado actual, sin rango) — chequeo de salud: anuncios rechazados o
   no aptos, y URLs de destino que apunten a páginas viejas o rotas. Si encontrás
   alguno, va en "advertencias".
7. PÁGINAS DE DESTINO (del período) — qué landing recibe el tráfico y cuál
   convierte. Es lo que permite distinguir dos problemas que en Google Ads se ven
   iguales y se arreglan distinto:
   · pocos clics con buena conversión  → falta tráfico → se toca presupuesto/pujas
   · muchos clics con poca conversión  → la página no cierra → se toca la landing
   Cuando el diagnóstico sea el segundo, decilo explícitamente: la acción es
   revisar la página, NO apagar la campaña.

QUÉ TENÉS QUE DEVOLVER
Un único archivo HTML completo, listo para abrir e imprimir, que respete
EXACTAMENTE la plantilla de más abajo. No cambies la estructura, el orden de las
secciones, los estilos ni las clases: sólo reemplazá los datos y los textos.

Lo único que cambia respecto de la plantilla:
1. El período en la cabecera y la fecha de emisión.
2. Los cuatro indicadores del mes y sus variaciones.
3. Los cuatro indicadores de calidad.
4. La tabla por iniciativa, con una fila por solución con inversión en el período
   y sus industrias como subfilas. Las soluciones sin inversión van igual, en gris.
5. La sección de análisis de abajo, escrita por vos siguiendo la rúbrica.
6. Sacá el cartel de "valores de ejemplo".

REGLAS PARA LOS NÚMEROS
- Los CSV de Google usan formato español: coma decimal y punto de miles. "876.592"
  son ochocientos setenta y seis mil, no ochocientos setenta y seis.
- Descartá las filas de subtotal ("Total: ...") antes de sumar.
- Calculá el índice de eficiencia de cada solución como
  (% de consultas que aporta) ÷ (% de inversión que consume).
- Si un dato no está, poné un guión y explicá por qué. Nunca lo estimes.

MAPEO DE CAMPAÑAS A SOLUCIONES
Firma Digital Biometrica → Firma Biométrica
Cableado Estructurado, Soluciones Cisco, Hiperconvergencia → Networking
Soluciones Palo Alto → Seguridad
Sharepoint etc → Consultoría
Display + Remarketing → transversal (va aparte, no suma a ninguna solución)
Cualquier campaña con "marca" en el nombre → va aparte del total

═══════════════════════════════════════════════════════════════════════
PLANTILLA — respetala al pie de la letra
═══════════════════════════════════════════════════════════════════════

${plantillaHtml}

═══════════════════════════════════════════════════════════════════════
DATOS DEL PERÍODO — pegar acá los CSV exportados de Google Ads
═══════════════════════════════════════════════════════════════════════

[PEGAR ACÁ:
 1. Informe de campañas del período
 2. Informe de términos de búsqueda del período
 3. Informe de palabras clave del período
 4. Las acciones que registramos el mes pasado, con su hipótesis]

--- rúbrica v${PROMPT_VERSION} ---`
}

/**
 * Parámetros de la llamada. Se centralizan acá para que ningún mes se genere con
 * una configuración distinta.
 */
export const PARAMETROS_LLAMADA = {
  model: MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" as const },
  output_config: {
    effort: "high" as const,
    format: { type: "json_schema" as const, schema: INFORME_SCHEMA },
  },
}
