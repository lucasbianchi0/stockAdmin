/**
 * Camino 2 — "Feed 1080": el otro sistema visual, en paralelo al de siempre.
 *
 * El de siempre (`templates-pieza.ts`) describe la pieza en castellano, empuja
 * el bloque MARCA + ANTI_IA detrás de cada prompt y opcionalmente le pone
 * adelante una imagen de referencia. Este no hace nada de eso: son quince
 * prompts en inglés, escritos a mano, autosuficientes, que ya llevan adentro su
 * paleta y sus prohibiciones. No se mezclan los dos — mezclarlos sería pedirle
 * al generador dos sistemas de identidad a la vez, y de ahí no sale ninguno.
 *
 * Lo variable acá no es "titular + sujeto" como allá, sino un juego de variables
 * por template ([HEADLINE], [SERVICE n], [XX%], [DATE]…). Esas variables se
 * derivan de la publicación ya escrita, pero SIEMPRE contra el catálogo real de
 * accedra.com.ar: un servicio inventado o una métrica inventada en una pieza que
 * se publica es un problema, no un detalle de estilo (ver `feed-variables.ts`).
 */

import type { Densidad } from "@/lib/templates-pieza"
import type { VariablesFeed } from "@/lib/feed-variables"

/**
 * Las tres familias de la regla general del feed.
 *
 * No es una etiqueta descriptiva: es lo que evita que las once piezas terminen
 * siendo once renders azules de servidores. La alternancia la resuelve la
 * secuencia, que lee `densidad`; la familia está acá para poder mirarla en la
 * UI y para entender qué se está alternando.
 */
export type FamiliaFeed =
  /** Piel, ropa, luz de ventana. El azul es acento, nunca filtro. */
  | "foto-real"
  /** Negro + azul: servidores, red, cloud, visualizaciones técnicas. */
  | "tecnologia"
  /** Espacio negativo y tipografía protagonista. */
  | "editorial"

export const FAMILIA_LABEL: Record<FamiliaFeed, string> = {
  "foto-real": "Fotografía real",
  tecnologia: "Tecnología protagonista",
  editorial: "Editorial / corporativo",
}

/** Qué variable pide cada template. Lo lee el derivador para no pedir de más. */
export type CampoFeed =
  | "headline"
  | "category"
  | "servicios"
  | "features"
  | "metrica"
  | "cta"
  | "evento"
  | "partner"
  | "clientes"

export type TemplateFeed = {
  id: string
  numero: number
  nombre: string
  familia: FamiliaFeed
  /** Cuándo conviene este y no otro. Lo lee el derivador y la UI. */
  cuandoUsar: string
  /**
   * Cuánto pesa la foto de lejos. Existe solo para poder reusar
   * `secuenciaRecomendada`, que reparte los formatos del plan mirando esto.
   */
  densidad: Densidad
  pide: CampoFeed[]
  /** El prompt en inglés, con las variables ya resueltas. */
  cuerpo: (v: VariablesFeed) => string
}

/* ── Utilidades de armado ─────────────────────────────────────────────────── */

/**
 * El titular, línea por línea.
 *
 * SIN comillas alrededor, aunque el resto de las cadenas del prompt sí las
 * lleven. Verificado generando: un titular de tres líneas entre comillas sale
 * impreso CON las comillas, porque a esa altura el modelo ya no distingue el
 * delimitador del contenido. Las etiquetas de una línea no tienen el problema.
 */
function titular(v: VariablesFeed): string {
  return v.headline.map((l) => `  ${l}`).join("\n")
}

/**
 * Las palabras que van en azul, como partición explícita del titular.
 *
 * "Resaltá el tramo X" no funciona: de "que impulsa resultados." pintó dos veces
 * seguidas "impulsa resultados." y dejó el "que" en blanco. El modelo decide por
 * su cuenta dónde empieza lo importante. Partido en pedazos con su color al
 * lado no queda nada que decidir.
 */
function destacado(v: VariablesFeed): string {
  const completo = v.headline.join(" ")
  const desde = completo.toLowerCase().indexOf(v.destacado.toLowerCase())
  if (!v.destacado || desde === -1) return "The entire headline goes in white."

  const antes = completo.slice(0, desde).trim()
  const azul = completo.slice(desde, desde + v.destacado.length).trim()
  const despues = completo.slice(desde + v.destacado.length).trim()

  return [
    "COLOR SPLIT of the headline — the headline is made of these consecutive pieces, each in its own color, word for word:",
    antes && `· WHITE: ${antes}`,
    `· BLUE #3B82F6: ${azul}`,
    despues && `· WHITE: ${despues}`,
    "Every word listed as BLUE is blue, starting from its very first word. Nothing else in the piece uses the blue.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Una lista de etiquetas cortas, entre comillas, o nada si no hay. */
function etiquetas(items: string[]): string {
  return items.map((s) => `“${s}”`).join(" ")
}

/** Un bloque que solo aparece si hay con qué llenarlo. */
function si(cond: boolean, texto: string): string {
  return cond ? `\n\n${texto}` : ""
}

/* ── Lo que se repite en las quince ───────────────────────────────────────── */

/**
 * El texto es lo primero que se rompe.
 *
 * Un generador de imágenes al que se le da un titular "de referencia" escribe
 * otra cosa parecida, o la misma con una letra de más. En las pruebas del
 * sistema anterior esto costó cuatro tandas hasta que se puso la instrucción
 * literal, así que se hereda acá aunque los prompts originales no la tuvieran.
 */
const TEXTO_LITERAL = `TEXT ACCURACY — critical: reproduce every string given above EXACTLY, letter by letter, including Spanish accents (á é í ó ú ñ) and punctuation. Do not translate, rephrase, shorten or add any word. No lorem ipsum, no placeholder text, no repeated headline in a second size.
Quotation marks in this prompt are delimiters, not content: never draw a quotation mark in the image. The only punctuation that gets rendered is the punctuation inside the strings themselves.`

/**
 * Ningún logo dibujado, y el rincón reservado.
 *
 * Pasó por tres versiones: primero "poné el logo de Accedra" (inventaba un
 * emblema distinto cada vez), después "el logo es la palabra accedra en
 * minúscula" (correcto pero no es la marca), después "copialo de la referencia"
 * (se acercó mucho, pero un logotipo no admite "se acercó"). La cuarta es no
 * pedirlo: el archivo oficial se compone después, en `logo-pieza.ts`.
 */
const MARCA_LITERAL = `THE SINGLE MOST IMPORTANT RULE OF THIS PIECE — NO LOGO. Not Accedra's, not anyone's.

The word "Accedra" does not appear anywhere in this image. No wordmark, no monogram, no triangular mark, no symbol, no brand name, no domain, in any corner, at any size, in any typeface, on any surface, on any garment, on any screen or on any piece of equipment inside the photograph. The official logo is composited onto the finished image afterwards, from the real file, by the design system — not by you.

The reference image shows that logo on every piece. That is exactly what you must NOT reproduce: those pieces are shown to you finished, and you are producing the stage before the logo goes on. Drawing it is the one failure that makes the output unusable, because it collides with the real one.

RESERVED CORNER: the bottom-left region of the artwork — the leftmost 32% of the width, the bottom 14% of the height — carries no text, no icon, no graphic element and no bright or busy part of the photograph. It is dark and quiet.

Read that as a region INSIDE the artwork, not as a margin around it. The artwork still runs to all four edges of the square; the reserved corner is simply the calm part of it. Do NOT shrink, inset, frame or float the artwork to create that space, and do not add any border, backdrop or shadow around it — every pixel of the square, corner included, is the piece itself.

No third-party logos anywhere either, unless explicitly requested above.`

/**
 * Lo que la guía de templates fija y los prompts sueltos no decían.
 *
 * "Modern clean sans-serif" es una instrucción que el generador cumple con
 * Helvetica, que es la tipografía de nadie. La guía nombra Montserrat y una
 * escala de dos pesos; nombrarla no garantiza que salga exacta —ningún generador
 * dibuja una fuente por nombre— pero acerca la forma mucho más que un adjetivo.
 *
 * El color del texto pasó por las dos posiciones. Primero se fijó un gris para
 * lo secundario, para que las etiquetas no compitieran con el titular; pero
 * sobre un fondo casi negro ese gris directamente se pierde y las etiquetas
 * quedan ilegibles. Ahora todo va en blanco y la jerarquía la hace el tamaño,
 * que es lo mismo que ya hace el titular.
 *
 * El párrafo de espacio negativo decía "wide margins on all four sides" y
 * "large uninterrupted areas of pure flat black". Leído literal eso ES un marco,
 * y contradecía al FULL BLEED de cinco líneas más abajo. Una pieza que salió así
 * —banda lisa alrededor, arte texturado adentro— se midió: las cuatro franjas
 * del borde con desvío 0, o sea planas, y la textura solo adentro. El modelo no
 * se desvió, cumplió esta línea y sacrificó la otra. Ahora los márgenes se
 * nombran como distancia DEL TEXTO a los bordes y el negro plano como "el
 * fondo", que es lo que se quería decir desde el principio.
 */
const SISTEMA_GUIA = `TYPE SYSTEM — the headline is set in a geometric grotesque (Montserrat) at REGULAR or LIGHT weight: thin, even strokes, open counters, sentence case, generous line spacing. It is NOT bold, NOT semibold, NOT black, NOT condensed and never faux-bolded. Size carries the hierarchy, weight does not: the headline is large and thin, and it reads calm rather than loud. Only a standalone figure (a percentage, a year count) may be set heavier. Secondary lines and labels are the same face, smaller. Never Helvetica, Arial or a default system font.
PALETTE, strictly: background flat #0B0D12 to #111827, surfaces and cards #1E293B, accent #3B82F6 used sparingly. No other color outside the photograph.
TEXT COLOR: every word in the piece is WHITE #FFFFFF — the headline, the service labels, the list items, the pill text, the captions, the CTA. Grey text is a defect: it disappears against the black. The only exceptions are the small uppercase eyebrow label and the highlighted span of the headline, which are the accent blue.
KEEP IT PLAIN: say things the simplest way they can be said. No decorative icons where a word does the job, no arrows or symbols standing in for words, no notation the reader has to decode, no ornament. If an element does not carry meaning on its own, it does not go in the piece.
NEGATIVE SPACE: the text block occupies at most the upper third of the canvas and never crowds it. The text keeps a wide clear distance from all four edges — that is padding INSIDE the artwork, never a border around it: the background itself still runs edge to edge, behind and past the text. Large uninterrupted calm areas of that background are the point of this system, not empty space to fill — resist adding anything to them.
GRAPHICS: flat, thin, luminous line-work on black — outlines, dotted particle fields, fine curves. Never a rendered 3D object, never volumetric glow, never a chrome or glass surface, never small illegible characters or fake code inside a graphic.
PHOTOGRAPHY: real photographs only, with the grain and imperfection of a real camera. Never a CGI render, never an illustration.
ICONS: thin single-weight outline icons only, small, aligned to the text baseline. Never filled, never colorful, never illustrative.
GRID: clean and hierarchical, everything aligned to a single left edge unless the template says otherwise.
FULL BLEED — the artwork itself fills the entire square canvas, edge to edge to edge to edge. This is the finished post, NOT a presentation of it: no mockup, no card floating on a backdrop, no drop shadow around the piece, no framing margin, no device screen, no phone, no browser window, no perspective. Nothing may surround the artwork, because nothing is outside it.`

/** La regla general del feed, en la versión que le toca a cada familia. */
const REGLA_FAMILIA: Record<FamiliaFeed, string> = {
  "foto-real": `FEED RULE — REAL PHOTOGRAPHY FAMILY: keep natural skin tones, fabric, wood, window light and neutral greys. Accedra blue works as an accent only, NEVER as a global color grade. This piece must not look like an AI render.
Darkness in this family is achieved in the GRADE — a real, properly lit scene pulled down, cooled and veiled — never by removing the light from the scene itself. A person you cannot see is a failed piece, and so is a bright one.`,
  tecnologia: `FEED RULE — TECHNOLOGY FAMILY: black plus restrained electric blue, real infrastructure, precise composition. No cyberpunk, no neon, no excessive glow, no generic AI-looking graphics.`,
  editorial: `FEED RULE — EDITORIAL FAMILY: generous negative space, typography is the hero, graphic elements kept minimal and understated.`,
}

/* ── Los quince templates ─────────────────────────────────────────────────── */

export const TEMPLATES_FEED: TemplateFeed[] = [
  {
    id: "feed-01-infraestructura",
    numero: 1,
    nombre: "Infraestructura / servidores",
    familia: "tecnologia",
    cuandoUsar: "Networking y datacenter con servicios listados al pie. El formato de catálogo técnico.",
    densidad: "mixta",
    pide: ["headline", "servicios"],
    cuerpo: (v) => `Create a premium square Instagram post template for Accedra, 1080x1080.

Composition: the left 48% is a clean near-black area reserved for typography. The right 52% contains a cinematic photograph of a modern enterprise data center corridor with tall server racks and strong depth perspective.

THE PHOTOGRAPH IS VERY DARK — this is the most important instruction of the piece. The room is nearly unlit: the racks read as black silhouettes and the ONLY bright things in frame are the rows of small blue status LEDs and a faint cold glow along the ceiling line. No grey walls, no bright floor, no evenly-lit room. Think a long-exposure photograph taken in a room with the lights off.

The photograph must dissolve into the black text area — no seam, no visible edge, no straight vertical border between the two halves. The darkness of the photo IS the background of the piece.

Realistic architectural photography, not futuristic or sci-fi.

Typography area: large headline in modern clean sans-serif, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      v.servicios.length > 0,
      `Below the headline, include ${v.servicios.length} small service labels with minimal outline icons: ${etiquetas(v.servicios)}`
    )}
Visual identity: premium B2B technology company, elegant, minimal, high-end corporate design. Palette: #080B12, #111827, #1E293B, #3B82F6, white. No excessive glow, no cyberpunk aesthetic, no generic AI-looking graphics, no unnecessary decorative elements.`,
  },
  {
    id: "feed-02-conectividad",
    numero: 2,
    nombre: "Conectividad / red",
    familia: "tecnologia",
    cuandoUsar: "Redes, enlaces, multi-sede. Cuando el tema es la conexión y no el equipo.",
    densidad: "mixta",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra, 1080x1080.

Background: deep black fading into very dark navy.

Upper-left area contains a large clean headline, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}

The lower half of the composition is a real AERIAL PHOTOGRAPH of a city at night, shot from high altitude: streets and buildings reading as fine grids of warm and cold light against near-black ground. A real place, photographed — not an illustration.

Over that photograph, and only over it, lie a few long thin luminous arcs connecting a handful of bright points on the city, like link routes drawn on a map. Count them: no more than eight arcs and twelve points in the whole piece. They sit ON the photograph as a restrained overlay; the photograph stays the subject.

The photograph fades into the black upper half with no seam. Never replace the city with an abstract mesh, a polygon net, a floating globe or a particle field.

Keep generous negative space around the headline.
Premium enterprise technology advertising, restrained lighting, precise composition, sophisticated dark visual identity.`,
  },
  {
    id: "feed-03-tecnico",
    numero: 3,
    nombre: "Técnico trabajando",
    familia: "foto-real",
    cuandoUsar: "Prueba de trabajo real: alguien de Accedra con las manos en el rack. Servicios al costado.",
    densidad: "foto",
    pide: ["servicios", "headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra using REALISTIC HUMAN PHOTOGRAPHY.

Background image: candid documentary-style photograph of an IT/network technician working inside a real server room. Show the person from behind or in three-quarter back view while physically connecting or inspecting network equipment inside a rack.

LIGHT: the room is genuinely lit and the technician is clearly visible — his hands, his face in profile, the cables he is holding. Do NOT stage this in darkness or shoot him as a silhouette; it has to look like a real working scene.
The darkness comes from the GRADE, not from the room: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, the highlights held back, and a dark navy veil laid over the side where the text sits. The scene stays readable and real; the piece stays almost black.

The person should look like a real Argentine/Latin American IT professional during an ordinary workday, not a fashion model. Natural posture, realistic clothing, authentic server room, believable cables and equipment.

Use natural photographic colors: neutral skin tones, black and grey equipment, subtle warm ambient light mixed with restrained blue server LEDs. DO NOT tint the entire photograph blue.

Apply a soft black transparent gradient on the left side for typography.

On the left, a short headline in white, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      v.servicios.length > 0,
      `Under it, a small minimal service list with thin outline icons: ${etiquetas(v.servicios)}`
    )}

Keep text minimal.
Photography style: premium corporate documentary photography, candid moment, 35mm lens, subtle film grain, natural dynamic range, realistic imperfections, believable room lighting.

Avoid: AI-perfect faces, excessive blue grading, cyberpunk, staged stock photography, holograms, fake futuristic interfaces.`,
  },
  {
    id: "feed-04-datacenter",
    numero: 4,
    nombre: "Data center hero",
    familia: "tecnologia",
    cuandoUsar: "La pieza de campaña: una sola afirmación grande sobre infraestructura, a sangre.",
    densidad: "foto",
    pide: ["category", "headline"],
    cuerpo: (v) => `Create a premium square Instagram post template for Accedra.

Full-bleed cinematic photograph of a modern enterprise data center corridor. Server racks create strong architectural perspective from foreground to background. Very dark environment with restrained cold-blue LED illumination.

Add a subtle black gradient over the left 55% of the image to create a clean typography area.${si(
      Boolean(v.category),
      `At upper-left include a tiny uppercase eyebrow: “${v.category.toUpperCase()}”`
    )}

Below it, a large editorial headline set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}

The photograph should remain visible and powerful on the right side.
Style: enterprise infrastructure campaign, architectural photography, premium, minimal, serious, expensive, clean. No futuristic holograms, no excessive glowing effects.`,
  },
  {
    id: "feed-05-reunion",
    numero: 5,
    nombre: "Reunión real / caso de éxito",
    familia: "foto-real",
    cuandoUsar: "Caso de cliente con un número. Gente conversando, no posando.",
    densidad: "foto",
    pide: ["headline", "metrica"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra based on AUTHENTIC CORPORATE PHOTOGRAPHY.

Full-bleed candid photograph of 2–3 professionals having a real technical/business conversation in a modern but believable office or meeting room.

LIGHT: real daylight from a window falls on the people — their faces, their hands, the laptop. You can see who they are and what they are doing. Do NOT put them in the dark or shoot them as silhouettes.
The darkness comes from the GRADE, not from the room: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, and a dark navy veil laid over the side where the text sits. Skin stays natural inside that grade — cool, not blue-tinted. The scene stays readable and real; the piece stays almost black.

People should be captured naturally, mid-conversation, not looking at camera. One person may be an Accedra technical consultant explaining something to a client. Casual-professional Argentine business environment.

Use REAL NATURAL COLORS: warm skin tones, neutral grey/black clothing, natural daylight coming through windows, slightly warm indoor lighting. Accedra blue should appear only as a subtle visual accent, never as a full blue color grade.

Add a dark translucent gradient behind the typography.

Large white headline, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}${si(
      Boolean(v.metrica),
      `Render the figure “${v.metrica}” as the largest element of the headline block, in Accedra blue #3B82F6${
        v.metricaLabel ? `, with the caption “${v.metricaLabel}” in small white type right below it` : ""
      }.`
    )}
${destacado(v)}
Photography: documentary corporate photography, candid, natural daylight, 35mm lens, slight grain, subtle imperfections, realistic skin texture.

Avoid: stock-photo poses, everyone smiling at camera, artificial blue lighting, futuristic office, overly perfect AI-generated people.`,
  },
  {
    id: "feed-06-ciberseguridad",
    numero: 6,
    nombre: "Ciberseguridad",
    familia: "tecnologia",
    cuandoUsar: "Seguridad IT: la tesis arriba y dos o tres capacidades en pastillas.",
    densidad: "texto",
    pide: ["headline", "features"],
    cuerpo: (v) => `Create a premium dark Instagram template for Accedra, 1080x1080.

Background: near-black #080B12 with subtle dark navy gradients.

Large headline positioned upper-left, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      v.features.length > 0,
      `Below the headline include ${v.features.length} compact horizontal feature pills with minimal outline icons: ${etiquetas(v.features)}`
    )}

On the lower-right, add a sophisticated abstract cybersecurity visualization: a partially visible digital shield / secure network structure made from extremely thin blue lines, small nodes and subtle geometric data patterns.

Keep the graphic understated and partially disappearing into darkness.
Premium cybersecurity brand aesthetic. Minimal, technical, credible and enterprise-focused. No padlock cliché dominating the composition, no Matrix code, no neon cyberpunk.`,
  },
  {
    id: "feed-07-cloud",
    numero: 7,
    nombre: "Cloud services",
    familia: "tecnologia",
    cuandoUsar: "Nube, Azure, hiperconvergencia. Objeto único, mucho aire, estética de producto.",
    densidad: "mixta",
    pide: ["category", "headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra.

Near-black background with subtle depth.${si(
      Boolean(v.category),
      `Tiny uppercase category label above the headline: “${v.category.toUpperCase()}”`
    )}

Elegant large headline in the upper-left, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}

In the lower-right quadrant, create a single sophisticated 3D cloud object made from dark translucent glass with a soft blue internal edge light. The cloud should feel physical, elegant and premium rather than cartoonish.

Very subtle blue light should reflect onto the dark surface below.

Lots of negative space. No additional floating objects.
Visual style: Apple-like product photography meets enterprise cloud infrastructure. Dark studio, refined materials, restrained blue illumination, minimal composition.`,
  },
  {
    id: "feed-08-clientes",
    numero: 8,
    nombre: "Prueba social",
    familia: "editorial",
    /**
     * Sin logos de clientes.
     *
     * La versión anterior pedía una grilla de wordmarks de las empresas. Un
     * generador no reproduce un logo ajeno: dibuja una versión parecida y falsa,
     * y el propio kit de Accedra lo prohíbe —mostrar la marca de un tercero exige
     * su manual de marca, no una aproximación. Además contagiaba: era el único
     * template cuyo tema eran los logos, y ahí el modelo también se sentía
     * habilitado a dibujar el de Accedra encima del que componemos nosotros.
     *
     * Si algún día se quieren los logos reales, van compuestos en código desde
     * los archivos oficiales, como el de Accedra. No generados.
     */
    cuandoUsar: "Prueba social y escala: la afirmación de respaldo, sostenida por una cifra. Sin foto y sin logos.",
    densidad: "texto",
    pide: ["category", "headline", "metrica"],
    cuerpo: (v) => `Create a premium minimalist social-proof Instagram template for Accedra.

Solid near-black background #080B12 with extremely subtle texture.${si(
      Boolean(v.category),
      `Upper-left: small uppercase blue label: “${v.category.toUpperCase()}”`
    )}

Large headline below, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}

Use large white editorial typography. ${destacado(v)}

${si(
      Boolean(v.metrica),
      `Lower half: the figure “${v.metrica}” set very large in Accedra electric blue #3B82F6, alone, aligned to the left margin${
        v.metricaLabel ? `, with the caption “${v.metricaLabel}” in white directly under it and much smaller` : ""
      }. Nothing else occupies that half.`
    )}

NO LOGOS OF ANY KIND in this piece: no company marks, no client wordmarks, no badges, no seals, no logo grid — not even blurred, suggested or implied.

A faint blue dot pattern or thin line texture may sit behind the lower half, almost invisible.
Design should communicate credibility, scale and enterprise trust. Minimal Swiss-style grid, premium corporate typography, generous negative space.`,
  },
  {
    id: "feed-09-campo",
    numero: 9,
    nombre: "Equipo técnico / campo",
    familia: "foto-real",
    cuandoUsar: "Obra, despliegue, instalación on-site. Casco y equipamiento real.",
    densidad: "foto",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra using authentic field photography.

Full-bleed REALISTIC photograph of an infrastructure technician working on-site. Show the technician from behind or from the side, actively inspecting, installing or configuring enterprise infrastructure equipment.

LIGHT: the technician and the equipment are genuinely lit — you can read the work being done, the posture, the gear. Do NOT stage this in darkness or reduce him to a silhouette.
The darkness comes from the GRADE, not from the site: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, the sky or background held dark, and a dark navy veil laid over the area where the text sits. The scene stays readable and real; the piece stays almost black.

Depending on the context, the technician may wear appropriate safety equipment such as a white helmet or work clothing. Everything must look operational and believable.

Use mostly NATURAL photographic colors with neutral blacks, whites, greys and realistic skin tones. Allow subtle Accedra blue coming from equipment LEDs or a small branding detail.

Do NOT apply a heavy blue filter.

Place the headline over a naturally darker area, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}
Documentary industrial photography, natural lighting, slight grain, realistic equipment, premium corporate campaign.`,
  },
  {
    id: "feed-10-cobertura",
    numero: 10,
    nombre: "Cobertura / mapa Argentina",
    familia: "tecnologia",
    cuandoUsar: "Alcance federal: sucursales, sitios conectados, presencia en todo el país.",
    densidad: "mixta",
    pide: ["headline", "metrica"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra focused on geographic coverage.

Background: elegant near-black to dark navy gradient.

Left side contains a large headline, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      Boolean(v.metrica),
      `Under the headline, the figure “${v.metrica}”${
        v.metricaLabel ? ` with the small caption “${v.metricaLabel}”` : ""
      } in Accedra blue.`
    )}

Right side contains a refined outline map of Argentina rendered with extremely thin electric-blue lines.

Inside the map, show a network of small illuminated nodes connected by delicate lines, concentrated around major cities and infrastructure hubs.

A few nodes may glow softly, but keep everything restrained and sophisticated. The map silhouette must be geographically accurate and visually clean.
Style: enterprise telecommunications infrastructure visualization, premium, minimal, precise, credible. Avoid sci-fi interfaces, floating UI panels or excessive neon.`,
  },
  {
    id: "feed-11-insight",
    numero: 11,
    nombre: "Insight / blog",
    familia: "editorial",
    cuandoUsar: "Nota, informe o contenido educativo. La tipografía es la pieza.",
    densidad: "texto",
    pide: ["category", "headline", "cta"],
    cuerpo: (v) => `Create a premium editorial Instagram template for Accedra.

Dark near-black background with generous negative space.

Upper-left small uppercase blue label: “${(v.category || "INSIGHT").toUpperCase()}”

Large editorial headline below, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}

Use clean white sans-serif typography. ${destacado(v)}${si(
      Boolean(v.cta),
      `Below the headline include a short call to action: “${v.cta} →”`
    )}

At the lower-right, add an abstract technological texture made from elegant thin blue flowing data lines or a subtle digital wave. The graphic occupies no more than 25–30% of the composition.
Style: premium technology publication, editorial design, minimalist, intelligent, sophisticated. The typography is the hero.`,
  },
  {
    id: "feed-12-caso-tipografico",
    numero: 12,
    nombre: "Caso de éxito tipográfico",
    familia: "editorial",
    cuandoUsar: "Un resultado de cliente sin foto: el número manda y la tapa parece un case study.",
    densidad: "texto",
    pide: ["category", "headline", "metrica", "cta"],
    cuerpo: (v) => `Create a premium typography-first Instagram template for Accedra.

Near-black background with an extremely subtle blue data-wave texture concentrated in the lower-right corner.

Small uppercase blue label at upper-left: “${(v.category || "CASO DE ÉXITO").toUpperCase()}”

Large white headline, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}${si(
      Boolean(v.metrica),
      `Render the figure “${v.metrica}” as the dominant element of the composition, in Accedra electric blue #3B82F6${
        v.metricaLabel ? `, with the small white caption “${v.metricaLabel}” below it` : ""
      }.`
    )}
${destacado(v)}${si(Boolean(v.cta), `Below, a short line: “${v.cta}” followed by “→”`)}

No photography. No unnecessary icons.
Keep the text well clear of the four edges — as padding inside the piece, not as a border drawn around it — and use strong editorial typography. The overall design should feel like a high-end B2B technology case-study cover.`,
  },
  {
    id: "feed-13-evento",
    numero: 13,
    nombre: "Evento",
    familia: "editorial",
    cuandoUsar: "Jornada, feria, webinar: nombre, fecha, lugar y stand en un bloque ordenado.",
    densidad: "texto",
    pide: ["headline", "evento"],
    cuerpo: (v) => `Create a premium event announcement Instagram template for Accedra.

Near-black background with a subtle dark navy gradient.

Small uppercase blue label: “EVENTO”

Large white headline, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      Boolean(v.fecha || v.lugar),
      `Below the headline create a clean information block using tiny minimalist outline icons:${
        v.fecha ? `\ncalendar icon + “${v.fecha}”` : ""
      }${v.lugar ? `\nlocation icon + “${v.lugar}”` : ""}`
    )}${si(Boolean(v.codigo), `Below, a small outlined rounded pill: “${v.codigo}”`)}

Keep everything highly structured and spacious.

Optionally add an extremely subtle architectural line or event-light texture in the background, barely visible.
Style: premium international B2B technology conference announcement, minimal Swiss grid, elegant typography, dark corporate design.`,
  },
  {
    id: "feed-14-partnership",
    numero: 14,
    nombre: "Partnership / certificación",
    familia: "editorial",
    /**
     * Sin la credencial del fabricante.
     *
     * La versión anterior dibujaba una tarjeta de partner con el nombre del
     * fabricante adentro. Aunque se pidiera en tipografía plana, el resultado
     * lee como un sello oficial de esa marca — y un sello de un tercero
     * aproximado por un generador es exactamente lo que el manual de marca de
     * ese tercero prohíbe. El nombre del partner sigue estando: en el titular,
     * que es texto y no una credencial.
     */
    cuandoUsar: "Certificación de fabricante o nivel de partner. Institucional y tipográfico, sin sellos ni credenciales.",
    densidad: "texto",
    pide: ["category", "headline"],
    cuerpo: (v) => `Create a premium partnership announcement Instagram template for Accedra.

Near-black background with a subtle technological dot texture and restrained electric-blue accents.${si(
      Boolean(v.category),
      `Upper-left: small uppercase blue label: “${v.category.toUpperCase()}”`
    )}

Large headline below it, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}

The announcement is entirely typographic. NO LOGOS, NO BADGES, NO SEALS, NO CERTIFICATION CARDS of any kind — no white or light card floating over the background, nothing that reads as an official credential from another company. The lower two thirds stay quiet: flat black with, at most, a faint blue line texture.

Style: premium B2B partnership announcement, minimal, trustworthy, official. Do not overcrowd the composition.`,
  },
  {
    id: "feed-15-persona",
    numero: 15,
    nombre: "Persona trabajando / marca humana",
    familia: "foto-real",
    cuandoUsar: "Marca empleadora y cultura: alguien trabajando de verdad, oficina creíble.",
    densidad: "foto",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra using highly realistic lifestyle corporate photography.

Full-bleed candid photograph of a technology professional working naturally at a laptop in a real office environment. Person shown from the side or in three-quarter back view, focused on work and unaware of the camera.

LIGHT: real light from the window and the laptop screen falls on the person — you can see their face in profile, their hands, what they are working on. Do NOT put them in the dark or shoot them as a silhouette.
The darkness comes from the GRADE, not from the office: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, and a dark navy veil laid over the area where the text sits. Skin stays natural inside that grade — cool, not blue-tinted. The scene stays readable and real; the piece stays almost black.

Environment should feel genuinely lived-in: desk, laptop, subtle cables, office furniture, soft background activity, daylight coming through a window.

Use NATURAL COLORS: warm-neutral skin tones, realistic black and grey surfaces, slightly warm daylight. Accedra blue should appear only in tiny details such as a subtle screen element, a clothing accent or the typography.

Do NOT turn the entire photograph blue.

Place a dark translucent gradient over the left or upper-left area.

Large headline over it, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}
Photography style: authentic corporate documentary photography, 35mm lens, shallow but realistic depth of field, subtle grain, imperfect natural lighting, realistic skin and fabric texture.

Avoid: posed stock photography, futuristic offices, holograms, excessive blue LEDs, plastic AI skin, perfect symmetrical compositions.`,
  },
]

export function templateFeedPorId(id: string | null | undefined): TemplateFeed | null {
  return TEMPLATES_FEED.find((t) => t.id === id) ?? null
}

/**
 * El prompt final del camino 2.
 *
 * El orden es al revés que en el sistema viejo, y a propósito: allá las
 * prohibiciones van al final porque el cuerpo es corto; acá cada template ya
 * termina con las suyas, así que lo que se agrega al final es solo lo que no
 * puede quedar sujeto a interpretación — el texto literal, el logo y la familia.
 */
export function promptDeFeed(template: TemplateFeed, variables: VariablesFeed): string {
  return [
    template.cuerpo(variables),
    SISTEMA_GUIA,
    REGLA_FAMILIA[template.familia],
    TEXTO_LITERAL,
    MARCA_LITERAL,
  ]
    .filter(Boolean)
    .join("\n\n")
}
