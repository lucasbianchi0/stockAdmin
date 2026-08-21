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

import type { Densidad } from "@/lib/secuencia"
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

/**
 * Qué variable pide cada template. Lo lee el derivador para no pedir de más.
 *
 * "category" ya no aparece en ningún `pide`: el rótulo lo lleva TODA pieza, así
 * que el derivador lo pide siempre —igual que la bajada— y el `rubro` del
 * template lo completa si el modelo no contesta. Sigue en esta lista porque
 * `INSTRUCCION` se indexa por acá.
 */
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
  /**
   * El rótulo de la pieza cuando el derivador no propone uno.
   *
   * No es un adorno ni un default perezoso: es LA garantía de que ninguna pieza
   * sale sin eyebrow. Seis de estos quince templates ni siquiera pedían
   * `category`, así que el 40% del feed salía sin rótulo por construcción; y
   * hasta los que lo pedían tenían permitido devolverlo vacío. El template ya
   * sabe de qué habla —para eso existe—, así que puede contestar solo.
   *
   * En VERSALITA, como se imprime, y del mismo vocabulario que el derivador
   * elige: dos rubros para la misma clase de pieza es lo que hace que el feed
   * parezca de dos marcas.
   */
  rubro: string
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

/**
 * El rótulo de arriba, en la única redacción que se usa.
 *
 * No lleva `si(...)`: el rótulo dejó de ser opcional. Antes seis de los quince
 * templates ni siquiera lo nombraban, así que esas piezas salían sin nada arriba
 * del titular por construcción; y `v.category` ya viene garantizado —lo completa
 * el `rubro` del template cuando el derivador no propone ninguno—.
 */
function rotulo(v: VariablesFeed): string {
  return `Eyebrow at the upper left, above the headline: “${v.category.toUpperCase()}” — small, uppercase, letter-spaced, in the accent blue.`
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
Quotation marks in this prompt are delimiters, not content: never draw a quotation mark in the image. The only punctuation that gets rendered is the punctuation inside the strings themselves.
NOTHING ELSE IS WRITTEN. The piece contains the strings given above and not one word more. If no eyebrow label is given, the piece has NO eyebrow — do not invent a category, a section name or a heading to fill that slot, never copy one from the reference image, and never promote one of the list items into an eyebrow: a string belongs to the slot it was given for and to no other. The same goes for captions, taglines, dates, URLs, hashtags and made-up figures: if it was not given, it does not appear.`

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

RESERVED CORNER: the bottom-left region of the artwork — the leftmost 35% of the width, the bottom 20% of the height — carries no text, no icon, no graphic element and no bright or busy part of the photograph. It is dark and quiet. Measured: the real logo lands between 90% and 93% of the height, so a label sitting at 85% still collides with it. Keep everything above 76%.

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
 * El peso del titular se dio vuelta el 17/8. Estaba en regular/light porque la
 * placa de referencia salió así y el sistema se escribió para defenderla; leído
 * en el feed, sobre fondo casi negro y en la miniatura de un teléfono, un
 * titular fino se lee tímido antes que calmo. Ahora va en bold: la misma
 * grotesca, con tracking apretado —la regla del Brand Kit para pesos altos, que
 * en el default se desarman— y el contraste lo hace el resto de la pieza, que
 * se queda en regular. Si algún día vuelve a salir fino, el sospechoso no es
 * este párrafo sino el bloque COPIA_LA_MARCA de `api/contenido/image`: ahí se
 * le pide copiar la referencia, y la referencia todavía es de la etapa fina.
 *
 * Las zonas se llamaban "Zone A/B/C/D" y el 17/8 una pieza salió con las cuatro
 * letras impresas al costado, como el rótulo de un plano. La instrucción de
 * texto literal ya prohibía escribir cualquier cosa que no viniera en el brief,
 * pero una letra suelta no se lee como texto de la pieza: se lee como parte del
 * diagrama que le estamos describiendo. Ahora las bandas se nombran solo por su
 * porcentaje —no hay nada que copiar— y se dice explícito que son medidas para
 * componer y no marcas para dibujar.
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
const SISTEMA_GUIA = `TYPE SYSTEM — the headline is set in a NEO-GROTESQUE with a tall x-height and a double-storey lowercase 'a' (Inter Display, Helvetica Now Display, SF Pro Display), at BOLD or SEMIBOLD weight: thick, solid, even strokes, tight letter spacing (about -0.02em), tight line spacing between the headline lines, sentence case. NOT geometric, NOT Futura-like, NOT Montserrat, NOT condensed, NOT a slab, NOT a display or novelty face, NOT rounded. It reads corporate and confident — a serious enterprise brand, not a fashion label and not a startup.
The weight is REAL, drawn into the typeface: a heavy grotesque cut. Never a thin face artificially thickened, never outlined, never with a stroke added around the letters, never a faux-bold smear. The letterforms stay clean and the counters stay open at that weight.
The headline is BOTH large AND heavy: size and weight carry the hierarchy together, and it is the loudest element of the piece by a wide margin.
EVERYTHING ELSE STAYS LIGHT: the eyebrow label, the secondary block, the list items, the pill text and the captions are the SAME family at REGULAR weight and clearly smaller, so the headline is the only heavy thing in the square. That contrast IS the system — a piece where every string is bold has no hierarchy and reads as a flyer. A standalone figure (a percentage, a year count) may match the headline's weight.

VERTICAL LAYOUT — the square is divided top to bottom into four bands and EVERY band has a job. These are measurements for you to compose against, never anything drawn: no band is labelled, numbered, lettered, outlined, tinted or marked in any way inside the artwork. A large empty region is a failed composition, not restraint:
  · From 6% to 13% of the height: the eyebrow label, on the left margin.
  · From 13% to 45%: the headline. Large, heavy, left-aligned. Its LAST line ends at 45% at the latest — if the headline runs to three lines it is set smaller so that it still does, rather than pushing past it.
  · From 51% to 76%: the secondary block — ONLY IF the brief below gives one. Most pieces have none, and that is normal.
      — The gap between 45% and 51% is EMPTY, always. Nothing is written, drawn or stacked in it. It exists because the headline and the block below it collide otherwise, and a list item touching the last line of the headline is the ugliest defect this layout produces: the first item of the block starts at 51% and not one pixel higher, no matter how short the headline came out.
      — If the brief gives a list of items (services, features, capabilities), it is a VERTICAL STACK, one item per line, left-aligned to the same margin as the headline, spanning that band: the items are spaced generously apart so the stack reaches down to about 76%, filling the left column. Never a single horizontal row squeezed under the headline — that leaves the whole left side dead and is the most common failure of this layout. Set them clearly larger than a caption, comfortably readable at a glance on a phone, each with a thin outline icon to its left, the icon sized to the text.
      — If the brief gives NO secondary block, that band belongs to the image and to silence. Do NOT invent list items, bullets, pills, icons, captions or a call to action to fill it: an invented bullet is a worse defect than an empty band. In that case the headline may be set larger and breathe further down, and the photograph carries the rest.
  · The bottom 20%: a clear band carrying ONLY the photograph or the background.

THE BOTTOM BAND IS SACRED: everything written — eyebrow, headline, every label and every pill — lives entirely ABOVE 76% of the height. Below that line there is no text, no icon and no graphic, not even partially. The left portion of that band is where the real logo gets composited afterwards, and anything there collides with it.

NO DEAD ZONE: no continuous region larger than about a quarter of the square may read as flat empty background. If a large void appears in the lower half, the composition failed — the fix is that the PHOTOGRAPH reaches into it with legible detail, or that the headline is set larger and lower. Never fill a void by inventing content: on a piece with no secondary block, calm background carrying a legible image is right, and made-up bullets are wrong.

SCRIM, NOT ERASURE: where a photograph carries the piece, the black gradient falls ONLY behind the text, just enough to keep the type crisp. It protects the text; it does not erase the image. Where no text sits, the photograph keeps its brightness and its detail — a visible, atmospheric image reads far more premium than a black rectangle. And it is ONE photograph, selectively darkened: never a two-panel layout, never a vertical dividing line, never a seam.
THE PHOTOGRAPH IS LIT — non-negotiable, and the most common way this system fails. The half of the square that carries the image is a real scene with real light in it: the equipment, the surfaces, the cables, the depth and the texture are all clearly visible, as if shot with a proper exposure and then graded down. It is dark in MOOD — cold, restrained, night-lit — never dark in EXPOSURE. If someone squinting at the piece on a phone cannot tell what is in the photograph, the piece failed. A flat murky near-black smear on that side is a defect, not atmosphere; when in doubt, expose the image UP.
PALETTE, strictly: background flat #0B0D12 to #111827, surfaces and cards #1E293B, accent #3B82F6 used sparingly. No other color outside the photograph.
TEXT COLOR: every word in the piece is WHITE #FFFFFF — the headline, the service labels, the list items, the pill text, the captions, the CTA. Grey text is a defect: it disappears against the black. The only exceptions are the small uppercase eyebrow label and the highlighted span of the headline, which are the accent blue.
KEEP IT PLAIN: say things the simplest way they can be said. No decorative icons where a word does the job, no arrows or symbols standing in for words, no notation the reader has to decode, no ornament. If an element does not carry meaning on its own, it does not go in the piece.
NEGATIVE SPACE: the headline is BIG — its block runs to about 80% of the width and fills its band without crowding it. A small timid headline is the most common way to get this system wrong. The text keeps a wide clear distance from all four edges — that is padding INSIDE the artwork, never a border around it: the background itself still runs edge to edge, behind and past the text.

MARGIN: one single left margin, about 7% of the width, shared by the eyebrow, the headline and the secondary block — they all start on the same vertical line.
GRAPHICS: flat, thin, luminous line-work on black — outlines, dotted particle fields, fine curves. Never a rendered 3D object, never volumetric glow, never a chrome or glass surface, never small illegible characters or fake code inside a graphic.
PHOTOGRAPHY: real photographs only, with the grain and imperfection of a real camera. Never a CGI render, never an illustration.
NOT AI-LOOKING — this is what separates a real photograph from a generated one, and it is the difference people notice first. Refuse the clichés: no perfectly symmetric endless corridor with the vanishing point dead centre, no infinite receding rows of identical glowing lights, no mirror-polished reflective floor, no impossibly clean scene, no uniform blue glow bathing everything. Shoot it instead like a real photographer did: an off-centre frame, a specific piece of equipment closer to the lens, shallow depth of field with a genuine focal plane so parts of the frame fall out of focus, uneven and motivated light, visible grain, a little mess. A real place someone walked into with a camera — not a rendering of the idea of that place.
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
    rubro: "INFRAESTRUCTURA",
    pide: ["headline", "servicios"],
    cuerpo: (v) => `Create a premium square Instagram post template for Accedra, 1080x1080.

Composition: ONE single full-bleed photograph of a modern enterprise data center corridor — tall server racks receding in strong depth perspective, shot low and close so the racks fill the right side AND the lower half of the frame with real texture: cabling, vents, the fine grid of drive bays.

It is night-lit and moody, but NOT blown out and NOT erased: the racks read dark and you can still SEE them, lit by their own rows of small blue status LEDs and one restrained cold strip along the ceiling. No grey walls, no bright floor, no evenly-lit room.

A soft black gradient falls over the upper left, and only there, so the typography sits on calm ground. It is one photograph selectively darkened — never two panels, never a vertical border, never a seam. Where no text sits, the image keeps its detail.

Realistic architectural photography, not futuristic or sci-fi.

${rotulo(v)}
Typography area: large headline set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      v.servicios.length > 0,
      `Below the headline, a VERTICAL STACK of ${v.servicios.length} service items — one per line, never a horizontal row — left-aligned to the headline margin and spaced generously apart so the stack spans from just under the headline down to about 76% of the height, filling the left column. Each item is a thin outline icon followed by its label, set clearly larger than a caption and comfortably readable on a phone: ${etiquetas(v.servicios)}`
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
    rubro: "CONECTIVIDAD",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra, 1080x1080.

Background: deep black fading into very dark navy.

${rotulo(v)}
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
    rubro: "SOPORTE TÉCNICO",
    pide: ["servicios", "headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra using REALISTIC HUMAN PHOTOGRAPHY.
${rotulo(v)}

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
      `Under it, a VERTICAL STACK of ${v.servicios.length} service items — one per line, never a horizontal row — left-aligned to the headline margin and spaced generously apart so the stack runs down the left column to about 76% of the height. Each is a thin outline icon followed by its label, set clearly larger than a caption: ${etiquetas(v.servicios)}`
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
    rubro: "DATA CENTER",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram post template for Accedra.

Full-bleed cinematic photograph of a modern enterprise data center: shot low and close so one rack stands near the lens with real texture and the rest falls away in depth. Very dark environment, lit by its own restrained cold-blue LEDs. Not a symmetric corridor with the vanishing point dead centre.

A soft black gradient falls over the typography area, and only there, so the type sits on calm ground. It protects the text; it does not erase the image — the photograph stays visible and powerful on the right AND across the lower half.${rotulo(v)}

Below it, a large editorial headline set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}

Style: enterprise infrastructure campaign, architectural photography, premium, minimal, serious, expensive, clean. No futuristic holograms, no excessive glowing effects.`,
  },
  {
    id: "feed-05-reunion",
    numero: 5,
    nombre: "Reunión real / caso de éxito",
    familia: "foto-real",
    cuandoUsar: "Caso de cliente con un número. Gente conversando, no posando.",
    densidad: "foto",
    rubro: "CASO DE ÉXITO",
    pide: ["headline", "metrica"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra based on AUTHENTIC CORPORATE PHOTOGRAPHY.

Full-bleed candid photograph of 2–3 professionals having a real technical/business conversation in a modern but believable office or meeting room.

LIGHT: real daylight from a window falls on the people — their faces, their hands, the laptop. You can see who they are and what they are doing. Do NOT put them in the dark or shoot them as silhouettes.
The darkness comes from the GRADE, not from the room: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, and a dark navy veil laid over the side where the text sits. Skin stays natural inside that grade — cool, not blue-tinted. The scene stays readable and real; the piece stays almost black.

People should be captured naturally, mid-conversation, not looking at camera. One person may be an Accedra technical consultant explaining something to a client. Casual-professional Argentine business environment.

Use REAL NATURAL COLORS: warm skin tones, neutral grey/black clothing, natural daylight coming through windows, slightly warm indoor lighting. Accedra blue should appear only as a subtle visual accent, never as a full blue color grade.

Add a dark translucent gradient behind the typography.

${rotulo(v)}
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
    rubro: "CIBERSEGURIDAD",
    pide: ["headline", "features"],
    cuerpo: (v) => `Create a premium dark Instagram template for Accedra, 1080x1080.

Background: near-black #080B12 with subtle dark navy gradients.
${rotulo(v)}
Large headline positioned upper-left, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}
${destacado(v)}${si(
      v.features.length > 0,
      `Below the headline, a VERTICAL STACK of ${v.features.length} rounded feature pills — one per line, never a horizontal row — left-aligned to the headline margin and spaced generously apart so the stack runs down to about 76% of the height. Each pill carries a thin outline icon and its label, set clearly larger than a caption: ${etiquetas(v.features)}`
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
    rubro: "CLOUD",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra.

Near-black background with subtle depth.${rotulo(v)}

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
    rubro: "CLIENTES",
    pide: ["headline", "metrica"],
    cuerpo: (v) => `Create a premium minimalist social-proof Instagram template for Accedra.

Solid near-black background #080B12 with extremely subtle texture.${rotulo(v)}

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
    rubro: "EN CAMPO",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra using authentic field photography.

Full-bleed REALISTIC photograph of an infrastructure technician working on-site. Show the technician from behind or from the side, actively inspecting, installing or configuring enterprise infrastructure equipment.

LIGHT: the technician and the equipment are genuinely lit — you can read the work being done, the posture, the gear. Do NOT stage this in darkness or reduce him to a silhouette.
The darkness comes from the GRADE, not from the site: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, the sky or background held dark, and a dark navy veil laid over the area where the text sits. The scene stays readable and real; the piece stays almost black.

Depending on the context, the technician may wear appropriate safety equipment such as a white helmet or work clothing. Everything must look operational and believable.

Use mostly NATURAL photographic colors with neutral blacks, whites, greys and realistic skin tones. Allow subtle Accedra blue coming from equipment LEDs or a small branding detail.

Do NOT apply a heavy blue filter.

${rotulo(v)}
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
    rubro: "COBERTURA",
    pide: ["headline", "metrica"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra focused on geographic coverage.

Background: elegant near-black to dark navy gradient.

${rotulo(v)}
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
    rubro: "INSIGHT",
    pide: ["headline", "cta"],
    cuerpo: (v) => `Create a premium editorial Instagram template for Accedra.

Dark near-black background with generous negative space.

${rotulo(v)}

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
    rubro: "CASO DE ÉXITO",
    pide: ["headline", "metrica", "cta"],
    cuerpo: (v) => `Create a premium typography-first Instagram template for Accedra.

Near-black background with an extremely subtle blue data-wave texture concentrated in the lower-right corner.

${rotulo(v)}

Large white headline, set in ${v.headline.length} lines exactly as broken here:
${titular(v)}${si(
      Boolean(v.metrica),
      `Render the figure “${v.metrica}” as the dominant element of the composition, in Accedra electric blue #3B82F6${
        v.metricaLabel ? `, with the small white caption “${v.metricaLabel}” below it` : ""
      }.`
    )}
${destacado(v)}${si(
      Boolean(v.cta),
      `Below, a short line: “${v.cta}” followed by “→”. It is the LAST element of the piece and it still ends above 76% of the height — the arrow included. Below it there is nothing: that band belongs to the logo.`
    )}

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
    rubro: "EVENTO",
    pide: ["headline", "evento"],
    cuerpo: (v) => `Create a premium event announcement Instagram template for Accedra.

Near-black background with a subtle dark navy gradient.

Small uppercase blue label: “EVENTO”

${rotulo(v)}
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
    rubro: "PARTNERSHIP",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium partnership announcement Instagram template for Accedra.

Near-black background with a subtle technological dot texture and restrained electric-blue accents.${rotulo(v)}

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
    rubro: "EQUIPO ACCEDRA",
    pide: ["headline"],
    cuerpo: (v) => `Create a premium square Instagram template for Accedra using highly realistic lifestyle corporate photography.

Full-bleed candid photograph of a technology professional working naturally at a laptop in a real office environment. Person shown from the side or in three-quarter back view, focused on work and unaware of the camera.

LIGHT: real light from the window and the laptop screen falls on the person — you can see their face in profile, their hands, what they are working on. Do NOT put them in the dark or shoot them as a silhouette.
The darkness comes from the GRADE, not from the office: the whole frame is pulled down and cooled toward navy, the shadows crushed to near-black, and a dark navy veil laid over the area where the text sits. Skin stays natural inside that grade — cool, not blue-tinted. The scene stays readable and real; the piece stays almost black.

Environment should feel genuinely lived-in: desk, laptop, subtle cables, office furniture, soft background activity, daylight coming through a window.

Use NATURAL COLORS: warm-neutral skin tones, realistic black and grey surfaces, slightly warm daylight. Accedra blue should appear only in tiny details such as a subtle screen element, a clothing accent or the typography.

Do NOT turn the entire photograph blue.

Place a dark translucent gradient over the left or upper-left area.

${rotulo(v)}
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
