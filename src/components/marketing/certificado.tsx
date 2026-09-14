"use client"

import { useId } from "react"
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google"

import {
  MODALIDAD_LABEL,
  TIPO_LABEL,
  fechaLarga,
  horasTexto,
  tamanoDelCurso,
  tamanoDelNombre,
  type Certificado as ConfigCertificado,
  type Evento,
  type Marca,
} from "@/lib/marketing/eventos"

/**
 * EL CERTIFICADO — la pieza, sin nada alrededor.
 *
 * El mismo componente dibuja la vista previa del editor y cada hoja de la
 * impresión: aprobar el diseño en pantalla es aprobar el papel.
 *
 * UNA COLUMNA A LA IZQUIERDA, TRES BLOQUES, DOS PROTAGONISTAS
 *
 * El destino real es un posteo de LinkedIn, donde la pieza se ve a la mitad de
 * su tamaño y se mira un segundo. En ese segundo tienen que leerse el nombre y
 * el curso. La estructura sirve a eso:
 *
 *  1. Quién    → la volanta y el nombre, enorme, en blanco.
 *  2. Qué      → una etiqueta ("WORKSHOP · PRESENCIAL") y el curso en el celeste
 *                de marca. La etiqueta reemplaza a "por haber asistido al…":
 *                dice lo mismo en dos palabras y ordena el bloque.
 *  3. Cuándo   → fecha y horas en una línea apagada. Son datos, no titulares.
 *
 * Todo el bloque va centrado en la hoja y cada renglón centrado sobre el mismo
 * eje vertical, como un diploma. Los filetes de la volanta y bajo el nombre se
 * desvanecen hacia los dos lados para acompañar ese eje.
 *
 * Los logos de las tecnologías cierran la columna, justo después del texto:
 * grandes y en blanco directo sobre el fondo. En blanco siempre: conviven logos
 * de cualquier color y ninguno desaparece sobre el navy. Las firmas van abajo,
 * centradas sobre el mismo eje, y el sello abajo a la derecha.
 *
 * MEDIDAS FIJAS
 *
 * 1122 × 793 px es un A4 apaisado a 96 dpi. Todo adentro está en px contra esa
 * caja y la pieza se escala entera (ver CertificadoEscalado); nunca se reacomoda.
 *
 * Las fuentes son las del sitio (Space Grotesk en títulos, Inter en el cuerpo).
 * Nada de `backdrop-filter`: Chrome no lo imprime.
 */

const display = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "block" })
const cuerpo = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "block" })
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], display: "block" })

export const CERT_ANCHO = 1122
export const CERT_ALTO = 793

/** Margen lateral del contenido. */
const MARGEN = 80

/* ── Temas ────────────────────────────────────────────────────────────────── */

const FONDOS = {
  azul: [
    "radial-gradient(70% 60% at 88% 4%, rgba(127,179,248,0.45) 0%, rgba(127,179,248,0) 70%)",
    "radial-gradient(80% 90% at -6% 108%, rgba(5,16,46,0.92) 0%, rgba(5,16,46,0) 62%)",
    "linear-gradient(128deg, #0A2160 0%, #143C98 42%, #215EC4 78%, #2C74DA 100%)",
  ].join(", "),
  noche: [
    "radial-gradient(60% 55% at 90% 0%, rgba(43,111,212,0.55) 0%, rgba(43,111,212,0) 70%)",
    "radial-gradient(60% 70% at 0% 100%, rgba(43,111,212,0.18) 0%, rgba(43,111,212,0) 70%)",
    "linear-gradient(140deg, #060D19 0%, #0A1424 45%, #0F2140 100%)",
  ].join(", "),
} as const

/**
 * Los niveles de color de cada tema.
 *   curso   → el segundo protagonista: el celeste de marca.
 *   acento  → la volanta, la etiqueta del curso, los filetes.
 *   apagado → los datos y los textos de apoyo.
 */
const TINTAS = {
  azul: { curso: "#C7DFFF", acento: "#A6CBFF", apagado: "rgba(214,229,252,0.74)" },
  noche: { curso: "#8EC0FF", acento: "#6AA8F7", apagado: "rgba(176,198,230,0.8)" },
} as const

/* ── La pieza ─────────────────────────────────────────────────────────────── */

export type DatosCertificado = {
  evento: Pick<Evento, "titulo" | "tipo" | "modalidad" | "inicio" | "lugar">
  config: ConfigCertificado
  /** Ya resueltas y en orden. */
  marcas: Marca[]
  asistente: { nombre: string; codigo: string; horas: number | null }
}

export function Certificado({ evento, config, marcas, asistente }: DatosCertificado) {
  const uid = useId().replace(/:/g, "")
  const tinta = TINTAS[config.tema]

  const curso = config.tituloCurso.trim() || evento.titulo || "Título del evento"
  const fecha = config.fechaTexto.trim() || fechaLarga(evento.inicio) || "Fecha del evento"
  const horas = asistente.horas ?? config.horas
  const nombre = asistente.nombre.trim() || "Nombre de la persona"
  const tamano = tamanoDelNombre(nombre)
  const tamanoCurso = tamanoDelCurso(curso)

  const contenidos = config.mostrarContenidos ? config.contenidos.filter(Boolean) : []
  const logos = config.mostrarTecnologias ? marcas : []
  const conFirmas = config.firmantes.some((f) => f.firmaUrl)

  // Los logos crecen cuanto menos son: tres entran grandes, seis se achican lo
  // justo para seguir en una fila sin llegar a la columna de la firma.
  const logoAlto = logos.length <= 3 ? 50 : logos.length === 4 ? 44 : 36
  const logoAncho = logos.length <= 3 ? 160 : logos.length === 4 ? 128 : 100
  const logoGap = logos.length <= 3 ? 48 : 40

  return (
    <div
      className={cuerpo.className}
      style={{
        position: "relative",
        width: CERT_ANCHO,
        height: CERT_ALTO,
        overflow: "hidden",
        background: FONDOS[config.tema],
        color: "#FFFFFF",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <Trama uid={uid} tema={config.tema} />

      {/* ── Marco ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 22,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.15)",
          pointerEvents: "none",
        }}
      />
      <Esquinas />

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div style={{ position: "absolute", top: 60, left: MARGEN }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/accedra-logo-blanco.svg" alt="Accedra" style={{ height: 34, width: "auto", display: "block" }} />
      </div>
      {config.mostrarCodigo && (
        <div style={{ position: "absolute", top: 56, right: MARGEN, textAlign: "right" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.22em", color: tinta.acento }}>CERTIFICADO N.º</div>
          <div className={mono.className} style={{ marginTop: 4, fontSize: 14, letterSpacing: "0.05em", color: "rgba(255,255,255,0.85)" }}>
            {asistente.codigo || "ACC-00-XXXXXX"}
          </div>
        </div>
      )}

      {/* ── La columna ────────────────────────────────────────────────────── */}
      {/* Centrado en la hoja —horizontal y verticalmente, entre la cabecera y el
          pie— y cada renglón centrado sobre el mismo eje. */}
      <div
        style={{
          position: "absolute",
          top: 112,
          // Termina arriba del pie aun con imágenes de firma: el bloque se centra
          // en este espacio y no puede llegar a pisar la firma más alta.
          bottom: conFirmas ? 196 : 150,
          left: MARGEN,
          right: MARGEN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 900,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
        {/* 1 · Quién */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ width: 44, height: 2, borderRadius: 2, background: `linear-gradient(90deg, rgba(255,255,255,0), ${tinta.acento})` }} />
          <span
            className={display.className}
            style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: tinta.acento }}
          >
            {config.titulo || "Certificado"}
          </span>
          <span style={{ width: 44, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${tinta.acento}, rgba(255,255,255,0))` }} />
        </div>

        <h1
          className={display.className}
          style={{
            marginTop: 30,
            fontSize: tamano,
            lineHeight: 1.03,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            color: "#FFFFFF",
            textWrap: "balance",
            maxHeight: tamano * 1.03 * 2 + 4,
            overflow: "hidden",
          }}
        >
          {nombre}
        </h1>

        <div
          style={{
            marginTop: 22,
            width: 220,
            height: 2,
            borderRadius: 2,
            background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${tinta.acento} 50%, rgba(255,255,255,0) 100%)`,
          }}
        />

        {/* 2 · Qué */}
        <div
          style={{
            marginTop: 30,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: tinta.acento,
          }}
        >
          {TIPO_LABEL[evento.tipo]} · {MODALIDAD_LABEL[evento.modalidad]}
        </div>
        <p
          className={display.className}
          style={{
            marginTop: 8,
            maxWidth: 820,
            fontSize: tamanoCurso,
            lineHeight: 1.15,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: tinta.curso,
            textWrap: "balance",
            maxHeight: tamanoCurso * 1.15 * 2 + 4,
            overflow: "hidden",
          }}
        >
          {curso}
        </p>

        {/* 3 · Cuándo */}
        <p style={{ marginTop: 16, fontSize: 17, lineHeight: 1.4, color: tinta.apagado }}>
          {fecha}
          <span style={{ margin: "0 12px", color: tinta.acento }}>·</span>
          {horasTexto(horas)} de duración
        </p>

        {contenidos.length > 0 && (
          <p style={{ marginTop: 10, maxWidth: 760, fontSize: 14, lineHeight: 1.45, color: tinta.apagado }}>
            {contenidos.join("  ·  ")}
          </p>
        )}

        {/* 4 · Con qué: los logos siguen al texto, como cierre de la columna. */}
        {logos.length > 0 && (
          <div style={{ marginTop: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: logoGap }}>
            {logos.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.logoUrl}
                alt={m.nombre}
                style={{
                  maxHeight: logoAlto,
                  maxWidth: logoAncho,
                  objectFit: "contain",
                  display: "block",
                  filter: "brightness(0) invert(1)",
                }}
              />
            ))}
          </div>
        )}
        </div>
      </div>

      {/* ── Pie: firmas centradas · sello a la derecha ───────────────────── */}
      {/* Tres columnas con los costados iguales: las firmas quedan sobre el
          mismo eje que el bloque del medio aunque el sello ocupe la derecha. */}
      <div
        style={{
          position: "absolute",
          left: MARGEN,
          right: MARGEN,
          bottom: 82,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "end",
        }}
      >
        <div />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 40 }}>
          {config.firmantes.map((f, i) => (
            <div key={i} style={{ width: config.firmantes.length > 1 ? 190 : 220, textAlign: "center" }}>
              {/* La firma va sobre la línea. El alto se reserva si CUALQUIER
                  firmante tiene imagen, así las dos líneas quedan a la misma
                  altura aunque sólo una persona haya subido su firma. */}
              {conFirmas && (
                <div style={{ height: 62, marginBottom: 2, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  {f.firmaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.firmaUrl} alt="" style={{ maxHeight: 62, maxWidth: "100%", objectFit: "contain", display: "block" }} />
                  )}
                </div>
              )}
              <div style={{ height: 1, background: "rgba(255,255,255,0.45)" }} />
              <div className={display.className} style={{ marginTop: 9, fontSize: 15, fontWeight: 600, color: "#FFFFFF" }}>
                {f.nombre}
              </div>
              <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.3, color: tinta.apagado }}>{f.cargo}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Sello uid={uid} acento={tinta.acento} />
        </div>
      </div>

      {/* ── Verificación ──────────────────────────────────────────────────── */}
      {config.mostrarCodigo && (
        <div style={{ position: "absolute", left: MARGEN, bottom: 36, fontSize: 11.5, color: tinta.apagado }}>
          Verificá su autenticidad en{" "}
          <span className={mono.className} style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
            accedra.com.ar/certificados/{asistente.codigo || "ACC-00-XXXXXX"}
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Partes ───────────────────────────────────────────────────────────────── */

/**
 * La trama del fondo: arcos concéntricos desde abajo a la derecha, una grilla de
 * puntos que se disuelve y el isotipo de Accedra enorme y casi invisible.
 */
function Trama({ uid, tema }: { uid: string; tema: "azul" | "noche" }) {
  const alfa = tema === "azul" ? 0.85 : 0.75
  return (
    <svg
      width={CERT_ANCHO}
      height={CERT_ALTO}
      viewBox={`0 0 ${CERT_ANCHO} ${CERT_ALTO}`}
      style={{ position: "absolute", inset: 0, opacity: alfa }}
      aria-hidden
    >
      <defs>
        <pattern id={`puntos-${uid}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.1" fill="rgba(255,255,255,0.22)" />
        </pattern>
        <radialGradient id={`mascara-g-${uid}`} cx="0.82" cy="0.12" r="0.45">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`mascara-${uid}`}>
          <rect width={CERT_ANCHO} height={CERT_ALTO} fill={`url(#mascara-g-${uid})`} />
        </mask>
        <linearGradient id={`iso-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <rect width={CERT_ANCHO} height={CERT_ALTO} fill={`url(#puntos-${uid})`} mask={`url(#mascara-${uid})`} />

      <g fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1">
        {Array.from({ length: 11 }, (_, i) => (
          <circle key={i} cx={CERT_ANCHO + 40} cy={CERT_ALTO + 60} r={180 + i * 62} />
        ))}
      </g>

      <g transform={`translate(${CERT_ANCHO - 470} ${CERT_ALTO - 520}) scale(3.4)`}>
        <path
          d="M 92.762 49.150 L 142.431 159.524 L 151.094 155.626 L 92.762 26.000 L 34.431 155.626 L 43.094 159.524 L 92.762 49.150 Z"
          fill={`url(#iso-${uid})`}
        />
        <path d="M 75.762 123.575 L 109.762 123.575 L 92.762 155.575 Z" fill="rgba(255,255,255,0.04)" />
      </g>
    </svg>
  )
}

/** Marcas de registro en las cuatro esquinas del marco. */
function Esquinas() {
  const largo = 18
  const estilo = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: largo,
    height: largo,
    borderColor: "rgba(255,255,255,0.55)",
    borderStyle: "solid",
    borderWidth: 0,
    ...pos,
  })
  return (
    <>
      <span style={estilo({ top: 14, left: 14, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 6 })} />
      <span style={estilo({ top: 14, right: 14, borderTopWidth: 1.5, borderRightWidth: 1.5, borderTopRightRadius: 6 })} />
      <span style={estilo({ bottom: 14, left: 14, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderBottomLeftRadius: 6 })} />
      <span style={estilo({ bottom: 14, right: 14, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 6 })} />
    </>
  )
}

/** El sello: el isotipo dentro de dos anillos con la leyenda alrededor. */
function Sello({ uid, acento }: { uid: string; acento: string }) {
  const leyenda = "ACCEDRA IT SOLUTIONS · CERTIFICADO OFICIAL · "
  return (
    <svg width="96" height="96" viewBox="0 0 104 104" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <path id={`anillo-${uid}`} d="M 52 52 m -39 0 a 39 39 0 1 1 78 0 a 39 39 0 1 1 -78 0" />
        <radialGradient id={`sello-${uid}`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="rgba(255,255,255,0.2)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.04)" />
        </radialGradient>
      </defs>
      <circle cx="52" cy="52" r="50" fill={`url(#sello-${uid})`} stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <circle cx="52" cy="52" r="29" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
      <text fill="rgba(255,255,255,0.85)" fontSize="7.2" fontWeight="700" letterSpacing="1.7" fontFamily="inherit">
        <textPath href={`#anillo-${uid}`}>{leyenda}</textPath>
      </text>
      <g transform="translate(34.5 33) scale(0.19)">
        <path
          d="M 92.762 49.150 L 142.431 159.524 L 151.094 155.626 L 92.762 26.000 L 34.431 155.626 L 43.094 159.524 L 92.762 49.150 Z"
          fill="#FFFFFF"
        />
        <path d="M 75.762 123.575 L 109.762 123.575 L 92.762 155.575 Z" fill={acento} />
      </g>
    </svg>
  )
}
