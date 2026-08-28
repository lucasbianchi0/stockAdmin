/**
 * Portadas de LinkedIn del equipo — los tres modelos y su prompt.
 *
 * Una portada de perfil no es una pieza de feed y no se puede resolver con los
 * templates de `templates-feed.ts`: aquéllos son cuadrados, llevan titular y se
 * miran una vez; ésta es una banda de 4:1 que queda colgada arriba del perfil de
 * una persona durante años, se ve a tres centímetros de alto en un teléfono y
 * tiene una foto redonda encima. Por eso vive en su propio módulo.
 *
 * Tres modelos y no uno: si las quince personas del equipo suben exactamente la
 * misma imagen, el perfil de cada una se lee como una plantilla de RR.HH. Tres
 * variantes del MISMO sistema —mismo negro, mismo azul, mismo encuadre— se leen
 * como una empresa. La diferencia entre los tres es la familia visual, la misma
 * distinción que ya hace el feed: editorial, foto real y técnico.
 *
 * El color y la mezcla de estilo salen de `brand-kit.ts`, no escritos a mano.
 * Ya pasó una vez en este proyecto que un prompt con el hex copiado a mano
 * siguiera pidiendo el azul viejo #2B6AC8 meses después de que la marca cambiara
 * (ver el comentario de `IMAGE_STYLE_SUFFIX` en `api/contenido/image`). Las
 * prohibiciones sí están escritas acá: son propias del formato banner y no
 * existen en ningún token.
 *
 * Lo lee la página del Brand Kit y también `scripts/portadas-linkedin.mjs`, que
 * corre en Node pelado: el script trae su propio resolvedor del alias `@/` para
 * poder leer este archivo sin compilarlo.
 */

import { COMPOSICION, PALETA } from "@/lib/brand-kit"

/** Un color de la paleta por nombre, para no escribir hexadecimales a mano. */
const hex = (nombre: string) => PALETA.find((c) => c.nombre === nombre)!.hex

/**
 * La medida oficial de una portada de PERFIL de LinkedIn.
 *
 * 1584 × 396 es lo que pide LinkedIn para el perfil de una persona. NO sirve
 * para la página de empresa, que es 1128 × 191: subir ésta allá la recorta al
 * medio. Estas portadas son para los colaboradores.
 */
export const MEDIDA_PORTADA = { ancho: 1584, alto: 396, ratio: 4 }

/**
 * Las tres zonas que no se pueden ocupar, en fracción del ancho.
 *
 * No son una guía de diseño: son dónde LinkedIn le pone cosas encima a la
 * imagen. La foto de perfil es un círculo que cae sobre el borde inferior
 * izquierdo y tapa lo que haya debajo; el logotipo lo componemos nosotros
 * después, en la esquina opuesta.
 */
export const ZONAS_PORTADA = [
  {
    zona: "Izquierda, 26% del ancho",
    porque: "Ahí cae la foto de perfil, redonda y montada sobre el borde inferior. Lo que quede debajo desaparece.",
  },
  {
    zona: "Abajo a la derecha",
    porque: "Es donde se compone el logotipo oficial, en blanco. Si esa esquina sale clara o llena de detalle, la marca desaparece encima.",
  },
  {
    zona: "10% de arriba y 10% de abajo",
    porque: "La banda se recorta distinto en el teléfono y en el escritorio. Nada importante puede vivir en esos bordes.",
  },
]

/**
 * El bloque común: marca, formato y prohibiciones. Va adelante de las tres
 * escenas.
 *
 * La mitad son prohibiciones, igual que en el prompt base del kit y por el mismo
 * motivo: el problema de una imagen generada nunca es lo que le falta, es lo que
 * le sobra. En un banner tan bajo el defecto del modelo es todavía peor —llena
 * los 1584 px de ancho con detalle hasta que no queda un solo lugar tranquilo
 * donde apoyar la foto de perfil.
 */
export const BLOQUE_PORTADA = `BRAND — ACCEDRA
Argentine enterprise IT integrator: networking, cybersecurity, biometric signature, Microsoft, software. Its clients are banks, insurers, logistics, mining and industry. The brand is serious, technical and understated — never playful, never futuristic, never "startup".

Visual system: a near-black navy canvas (${hex("Navy fondo")}), deep navy structure (${hex("Navy Accedra")}), cold neutral greys (${hex("Gris muted")}, ${hex("Gris texto")}) and ONE single accent colour: Accedra blue ${hex("Azul Accedra")}. Never a second accent. Never two colour temperatures in the same image.
Mood: ${COMPOSICION.estilo}. Reference brands: ${COMPOSICION.referencias}.

FORMAT — LINKEDIN PROFILE COVER, ${MEDIDA_PORTADA.ancho} × ${MEDIDA_PORTADA.alto} px, a ${MEDIDA_PORTADA.ratio}:1 band
Extremely wide and shallow. Compose FOR that band: it is read at a glance, about 3 cm tall on a phone. One idea only.
- The LEFT 26% of the frame must stay dark, flat and visually empty — a round profile photo is placed there and destroys whatever is underneath.
- The BOTTOM-RIGHT corner must stay DARK, flat and uncluttered — no bright surface, no light source, no detail, nothing lighter than the rest of the frame. A white logotype is composited on top of that corner afterwards from the official file, and it disappears over anything pale.
- Nothing essential in the top 10% or the bottom 10%: the band is cropped differently across devices.
- At least half of the total surface is quiet, empty, flat dark field.

FORBIDDEN — no exceptions
No text, letters, numbers, words, logos, wordmarks, badges, signage, labels or watermarks of any kind. Every word and the logo are composited afterwards in layout; anything the model writes has to be thrown away with the whole image.
No glow, light trails, lens flare, particles, sparkles, bokeh dots, neon.
No holographic or floating user interfaces, transparent screens, HUD overlays, data dashboards.
No circuit-board or motherboard motifs, wireframe globes, digital brains, padlock icons, binary code, hooded figures.
No teal-and-orange grading, no heavy vignetting, no gradient wallpaper, no decorative blur, no symmetrical sci-fi composition.
No people looking at the camera, no stock-photo meeting, no crossed arms, no handshake.
No busy detail filling the frame edge to edge.`

export type FamiliaPortada = "editorial" | "foto-real" | "tecnologia"

export type PortadaLinkedIn = {
  id: string
  nombre: string
  familia: FamiliaPortada
  /** Para quién es este modelo y no otro. Es lo que se lee al elegir. */
  cuando: string
  /** El JPG ya generado y con el logotipo compuesto, en `public/`. */
  archivo: string
  /** Lo propio del modelo. Va detrás de `BLOQUE_PORTADA`. */
  escena: string
}

export const PORTADAS_LINKEDIN: PortadaLinkedIn[] = [
  {
    id: "editorial",
    nombre: "01 · Editorial",
    familia: "editorial",
    cuando:
      "El default del equipo. Es el más neutro de los tres y el que mejor envejece: sirve igual para dirección, administración, ventas o soporte.",
    archivo: "/brand/portada-linkedin-editorial.jpg",
    escena: `THE IMAGE — editorial, architectural, almost empty

A flat matte wall of deep navy ${hex("Navy fondo")}, photographed straight on. Real, hard daylight rakes across it from the right and lays down long, calm, geometric planes of slightly lighter navy — the shadow of a large office window mullion, or of a louvred ceiling. Straight edges, no curves, no texture noise. The lit planes live in the MIDDLE of the frame and nowhere else: the light falls off toward the left, so the left third is an even unbroken dark field, and it falls off again toward the right, so the right edge and the whole bottom-right corner are dark navy with nothing in them. No bright panel, no lit wall, no window opening touching the right edge.

Exactly one element of Accedra blue ${hex("Azul Accedra")}: a single straight hairline of light, one or two pixels thick, sitting along one of those shadow edges on the right half. Nothing else is coloured.

Photographic, not illustrated: real surface, real light, a little grain, restrained contrast, matte finish. It should look like a photograph of an actual wall in an actual building at nine in the morning — quiet, expensive, and slightly severe.`,
  },
  {
    id: "infraestructura",
    nombre: "02 · Infraestructura",
    familia: "foto-real",
    cuando:
      "Para los perfiles técnicos: ingeniería, implementación, soporte, preventa. Es la que muestra el trabajo real, que es lo que el kit prefiere sobre cualquier abstracción.",
    archivo: "/brand/portada-linkedin-infraestructura.jpg",
    escena: `THE IMAGE — a real photograph of real infrastructure

The cold aisle of an enterprise data centre, shot wide from a distance with a 35mm lens on a full-frame camera: two long rows of dark server racks converging toward the right of the frame, patch cabling neatly dressed and combed. It is a real, working room — you can read the metal, the perforated doors, the cable trays, the depth of the corridor. No people.

The whole scene is drowned in shadow and graded cold and blue-neutral, close to ${hex("Navy fondo")}, with mid greys around ${hex("Gris muted")} on the edges of the metal. The ONLY saturated points in the entire image are the small equipment status LEDs on the rack faces, in Accedra blue ${hex("Azul Accedra")} — small, sharp, unglowing, like real LEDs photographed, not like light effects.

The left quarter of the frame is the near end of the corridor falling into flat darkness — no detail there at all. The far end of the corridor is dark too: no lit doorway, no bright floor, no window and no light source anywhere in the right third, which stays as dark as the rest. Moderate depth of field, contrast held back, matte finish. Dark, but legible: the equipment must be readable. A muddy brown-black smear with nothing in it is the worst possible outcome and is worse than a slightly too bright photograph.`,
  },
  {
    id: "trazado",
    nombre: "03 · Trazado",
    familia: "tecnologia",
    cuando:
      "Para marketing, producto y dirección, y para cuando ya hay dos personas con la portada de infraestructura al lado. Es la más gráfica de las tres y la que menos se parece a una foto de stock.",
    archivo: "/brand/portada-linkedin-trazado.jpg",
    escena: `THE IMAGE — a technical drawing on black

A flat, completely even, near-black field of ${hex("Navy fondo")}, edge to edge. Over the right two thirds of it, one single, extremely fine technical line drawing: an isometric network topology — nodes, links and a couple of orthogonal runs, drawn the way an engineer drafts a rack elevation or a floor plan, not the way an illustrator draws technology.

Hairline strokes only, one pixel, perfectly crisp, no glow, no depth blur, no perspective drama. CRITICAL: this is line on black, like a CAD wireframe on a dark screen — the background stays near-black everywhere, including underneath and inside the drawing. There is NO base plane, NO light-coloured sheet, NO grey floor slab, NO solid surface and NO fill of any kind under the topology; every shape is an outline and the black shows through all of it. An image where the drawing sits on a pale panel is a failed image. Most lines are cold grey ${hex("Gris muted")}; a small minority — three or four segments and their nodes, no more — are Accedra blue ${hex("Azul Accedra")}, marking one path across the drawing.

The drawing is sparse: far more black than line. The left third of the frame is pure empty flat field with nothing in it at all, and the drawing stops well before the bottom-right corner, which is pure empty near-black field like the left one — empty means the same flat dark colour as the rest of the image, NOT a white or pale shape. The frame is one single full-bleed rectangle of near-black from edge to edge: no white corner, no diagonal wedge, no light band, no folded-paper effect, no border and no panel of any other colour anywhere in it. Calm, precise, engineered. It should read as a schematic, not as an artwork about data.`,
  },
]

/** El prompt final de un modelo: el bloque común y después su escena. */
export function promptPortada(p: PortadaLinkedIn): string {
  return `${BLOQUE_PORTADA}\n\n${p.escena}`
}

export const REGLAS_PORTADA = {
  si: [
    "Se baja el archivo y se sube tal cual: ya viene en 1584 × 396 y con el logotipo oficial compuesto.",
    "Elegir el modelo por rol, no por gusto — y mirar qué tiene puesto el compañero de al lado antes de elegir.",
    "Foto de perfil sobre fondo liso: la portada ya reserva ese rincón vacío para que la cabeza no compita con nada.",
    "Si hace falta una variante nueva, se regenera con el prompt del modelo — no se edita el JPG en Canva.",
  ],
  no: [
    "Escribirle el cargo, el teléfono o un claim encima. La portada no es una tarjeta personal.",
    "Usarla en la página de empresa: ahí la medida es 1128 × 191 y ésta sale cortada al medio.",
    "Recortarla, estirarla o subirla a otra red con otra proporción.",
    "Sumarle un segundo color, un degradé o un filtro para 'personalizarla'.",
  ],
}
