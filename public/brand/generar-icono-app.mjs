#!/usr/bin/env node
/**
 * El ícono de "anclar al inicio": la A de Accedra en 3D, sobre una placa con luz.
 *
 * QUÉ GENERA
 *   src/app/apple-icon.png      180×180 · iOS, "Agregar a pantalla de inicio"
 *   public/icons/icon-192.png   Android / Chrome (manifest)
 *   public/icons/icon-512.png   Android / Chrome, splash
 *   public/icons/maskable-512.png  Android con máscara (círculo, gota, etc.)
 *
 * POR QUÉ SIN ESQUINAS REDONDEADAS
 * iOS y Android recortan el ícono con su propia forma. Una placa redondeada
 * de nuestro lado queda con una esquina negra adentro de la del sistema.
 * El favicon de la pestaña (app/icon.svg) sigue plano a propósito: a 16 px
 * la luz y el volumen se vuelven una mancha.
 *
 * LA A
 * Es la geometría de trazo grueso del favicon del backoffice, no la del
 * isotipo del kit: con el trazo fino, la extrusión se lee como un alambre.
 *
 * Uso: node public/brand/generar-icono-app.mjs
 *
 * Gemelo de accedra/scripts/generar-icono-app.mjs: el sitio y el backoffice
 * llevan el mismo ícono al anclarse. El favicon de la pestaña lo sigue
 * generando generar-favicon.py, que ya NO escribe apple-icon.png.
 */

import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

const A = "M 50 35.596 L 77.096 84.003 L 88.004 77.897 L 50 10.004 L 11.996 77.897 L 22.904 84.003 Z"
const CUNA = "M 39 64 L 61 64 L 50 82 Z"

/** La extrusión: copias de la figura corridas hacia abajo, cada vez más
 *  oscuras. Hacia abajo y apenas a la derecha, porque la luz viene de arriba
 *  a la izquierda. */
function extrusion(path, capas, desde, hasta) {
  const mezclar = (a, b, t) =>
    "#" +
    [0, 2, 4]
      .map((i) => {
        const x = parseInt(a.slice(1 + i, 3 + i), 16)
        const y = parseInt(b.slice(1 + i, 3 + i), 16)
        return Math.round(x + (y - x) * t).toString(16).padStart(2, "0")
      })
      .join("")
  let s = ""
  for (let k = capas; k >= 1; k--) {
    s += `<path d="${path}" fill="${mezclar(desde, hasta, k / capas)}" transform="translate(${(k * 0.12).toFixed(2)} ${(k * 0.32).toFixed(2)})"/>`
  }
  return s
}

/** `escala`: cuánto del lado ocupa la A. 0.62 en el ícono común; 0.5 en el
 *  maskable, que tiene que entrar en el círculo del 80% del centro. */
function svg(escala) {
  const lado = 100 * escala
  const off = (100 - lado) / 2
  const t = `translate(${off} ${off + 2}) scale(${escala})`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">
  <defs>
    <radialGradient id="fondo" cx="0.5" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#1E4C93"/>
      <stop offset="0.45" stop-color="#0E2547"/>
      <stop offset="1" stop-color="#040A15"/>
    </radialGradient>
    <radialGradient id="foco" cx="0.22" cy="0.1" r="0.55">
      <stop offset="0" stop-color="#9CC4FF" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#9CC4FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="contraluz" cx="0.85" cy="0.95" r="0.5">
      <stop offset="0" stop-color="#2B6FD4" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#2B6FD4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="metal" x1="0.15" y1="0" x2="0.75" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.45" stop-color="#EEF3FA"/>
      <stop offset="0.7" stop-color="#BFCDE2"/>
      <stop offset="1" stop-color="#8FA3C2"/>
    </linearGradient>
    <linearGradient id="azul" x1="0.2" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#7DB6FF"/>
      <stop offset="0.5" stop-color="#3A7DEB"/>
      <stop offset="1" stop-color="#1A4FB8"/>
    </linearGradient>
    <linearGradient id="brillo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="difuso" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0.6" dy="2.2" stdDeviation="1.6" flood-color="#000814" flood-opacity="0.65"/>
    </filter>
    <radialGradient id="vineta" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
  </defs>

  <rect width="100" height="100" fill="url(#fondo)"/>
  <rect width="100" height="100" fill="url(#foco)"/>
  <rect width="100" height="100" fill="url(#contraluz)"/>
  <!-- Una línea de horizonte apenas visible: da piso a la sombra. -->
  <ellipse cx="50" cy="${off + lado * 0.9 + 2}" rx="${lado * 0.55}" ry="${lado * 0.07}" fill="#000610" opacity="0.7" filter="url(#difuso)"/>

  <g transform="${t}">
    <!-- Halo azul detrás de la figura -->
    <path d="${A}" fill="#3B82F6" opacity="0.85" filter="url(#difuso)"/>
    <g filter="url(#sombra)">
      ${extrusion(A, 14, "#7F93B3", "#1B2A44")}
      <path d="${A}" fill="url(#metal)"/>
      <!-- Filo de luz sobre las aristas de arriba -->
      <path d="${A}" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="0.6" stroke-linejoin="miter" transform="translate(-0.15 -0.25)" clip-path="none" opacity="0.55"/>
    </g>
    <path d="${CUNA}" fill="#5B9BFF" opacity="1" filter="url(#halo)"/>
    <g filter="url(#sombra)">
      ${extrusion(CUNA, 10, "#1F4FA8", "#0B2149")}
      <path d="${CUNA}" fill="url(#azul)"/>
      <path d="M 39 64 L 61 64" stroke="#CFE3FF" stroke-width="0.7" stroke-linecap="round" opacity="0.9"/>
    </g>
  </g>

  <rect width="100" height="50" fill="url(#brillo)"/>
  <rect width="100" height="100" fill="url(#vineta)"/>
</svg>`
}

async function exportar(escala, salida, px) {
  mkdirSync(dirname(salida), { recursive: true })
  await sharp(Buffer.from(svg(escala)), { density: 300 })
    .resize(px, px)
    .flatten({ background: "#040A15" })
    .png({ compressionLevel: 9 })
    .toFile(salida)
  console.log("→", salida.replace(RAIZ + "/", ""), `${px}×${px}`)
}

await exportar(0.62, join(RAIZ, "src/app/apple-icon.png"), 180)
await exportar(0.62, join(RAIZ, "public/icons/icon-192.png"), 192)
await exportar(0.62, join(RAIZ, "public/icons/icon-512.png"), 512)
await exportar(0.5, join(RAIZ, "public/icons/maskable-512.png"), 512)
