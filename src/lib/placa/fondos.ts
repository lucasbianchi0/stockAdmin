/**
 * Los fondos del feed: lo ÚNICO que se le sigue pidiendo al generador.
 *
 * El sistema viejo le pedía la pieza entera —foto, titular, grilla, rótulo,
 * lista y prohibiciones— en 13.350 caracteres, y el texto salía distinto cada
 * vez: dos piezas del prompt idéntico dieron brillo 61,5 y 28,4, una salió con
 * las letras de las zonas impresas al costado y otra con la lista encima del
 * titular.
 *
 * Acá el reparto es otro y es el que la referencia de marca ya insinuaba: el
 * modelo hace la fotografía o el gráfico, que es dirección de arte y es donde su
 * varianza suma; el texto y el logotipo los compone el código encima, en la
 * coordenada exacta. Por eso estos prompts no mencionan una sola palabra de
 * contenido: si el generador escribe algo, es un defecto.
 *
 * LA ESCENA YA NO VIVE ACÁ. Hasta el 18/8 este archivo tenía quince escenas
 * escritas a mano —un pasillo de datacenter, un técnico de espaldas en el rack—
 * y cada pieza del plan caía en una de ellas por `secuencia.ts`. El resultado es
 * el que se ve en el feed: quince publicaciones distintas ilustradas con la misma
 * media docena de fotos, sin relación con lo que dice cada una.
 *
 * Ahora la escena sale del posteo. El plan ya venía generando `opcion.imagen`
 * —"qué se va a VER en la pieza"— para cada publicación, y este camino la
 * ignoraba por completo. Es el brief de arte de esa pieza y de ninguna otra.
 *
 * Lo que SÍ se queda acá es todo lo demás: las zonas reservadas, el grade, y la
 * dirección de arte que evita que salga con cara de IA. Eso no es sobre la
 * escena —vale para cualquiera— y perderlo era el riesgo real de esta migración.
 */

import { PALETAS, zonaDeTexto, type Tema } from "@/lib/placa/sistema"

/** Los colores del ambiente claro, tomados de la paleta y no escritos a mano. */
const HUESO_FONDO = PALETAS.claro.fondo
const AZUL_MARCA = PALETAS.claro.azul
import type { FamiliaFeed } from "@/lib/templates-feed"

/**
 * Lo que vale para los quince, y que antes estaba desparramado en cada prompt.
 *
 * Las dos zonas reservadas son la parte crítica. Sin ellas el generador llena el
 * cuadro entero de detalle y el texto que se compone después cae sobre una foto
 * clara: ilegible. Con ellas, la foto vive a la derecha y abajo, y la esquina de
 * arriba a la izquierda queda tranquila para el titular.
 */
const sistemaFondo = (familia: FamiliaFeed, layout: string | undefined, tema: Tema) =>
  tema === "claro" ? sistemaFondoClaro() : sistemaFondoOscuro(familia, layout)

const sistemaFondoOscuro = (familia: FamiliaFeed, layout?: string) => `This is a BACKGROUND PLATE for a social post, not the finished post.

ABSOLUTELY NO TEXT. Not one letter, word, number, caption, label, watermark, logo, wordmark, monogram, brand name, domain, UI element, button, sign, screen text or fake code — nowhere in the image, at any size, on any surface, on any screen, on any garment, on any piece of equipment. Every word of the finished piece and the official logo are composited on top of this plate afterwards, by the design system. If you draw text, the plate is unusable.

${
  layout === "centrado"
    ? `THE TYPE ZONE — a BAND ACROSS THE TOP of the frame, the full width and the top ${Math.round(zonaDeTexto(familia, layout).alto * 100)}% of the height, is CALM AND DARK. The subject lives in the LOWER half and rises into the frame from below; the top band is where it fades out into darkness`
    : `THE TYPE ZONE — the upper-left of the frame, the left ${Math.round(zonaDeTexto(familia, layout).ancho * 100)}% of the width and the top ${Math.round(zonaDeTexto(familia, layout).alto * 100)}% of the height, is CALM AND DARK`
}: no bright highlight, no busy detail, no subject's face, no hard edge crossing it. White type gets laid over it, so it has to stay quiet enough to read on. Achieve it with a soft dark veil falling over that region of the photograph — a scrim, not a black rectangle and not a second panel: no visible seam, no dividing line, no two-tone split.

THE LOGO CORNER — the bottom-left region, the left 35% of the width and the bottom 20% of the height, is dark and empty for the same reason.

THE IMAGE IS LIT. ${layout === "centrado" ? "The lower half of the frame carries the subject" : "The right side and the lower half of the frame carry the subject"}, and they are VISIBLE: the equipment, the surfaces, the cables, the depth and the texture all read clearly, as if properly exposed and then graded down. Dark in MOOD — cold, restrained, night-lit — never dark in EXPOSURE. A flat murky near-black smear is the single worst outcome, worse than slightly too bright.

FULL BLEED: the artwork fills the entire square canvas, edge to edge. This is not a presentation of a post: no mockup, no card floating on a backdrop, no drop shadow, no framing margin, no device screen, no phone, no browser window, no perspective, no border of any kind.

PALETTE: near-black navy #0A1424 through #111827, with restrained electric blue as the only accent. No other color outside what the photograph naturally contains. No cyberpunk, no neon, no purple, no teal wash.`

/**
 * El fondo del tema claro. Otra composición, no el mismo con otra luz.
 *
 * En el tema oscuro el sujeto vive a la DERECHA para dejar libre la columna
 * izquierda donde va el texto. Acá el texto está ARRIBA y centrado, así que el
 * sujeto va CENTRADO y la banda que hay que reservar es la de arriba.
 *
 * Y hay algo que este brief pide y el oscuro no: un AMBIENTE DE COLOR. Se probó
 * pidiendo "sujeto centrado sobre barrido hueso" y salía correcto y muerto —
 * noventa por ciento de superficie vacía con un objeto gris en el medio—. Lo que
 * le faltaba no era composición sino color y profundidad: un degradado que
 * arranca en luz arriba y se satura hacia abajo, con el sujeto como héroe y una
 * luz propia detrás.
 *
 * La banda reservada es del 46% y no del 40%: la franja de texto de la placa
 * ocupa el 48% del alto, y el margen de más es lo que evita tener que correr la
 * foto pieza por pieza cuando el generador deja el sujeto alto.
 */
const sistemaFondoClaro = () => `THIS IS THE ENTIRE CANVAS, not a photo to be placed inside a layout. It fills the square edge to edge, one continuous surface with no seam, no panel, no border and no visible edge anywhere.

ABSOLUTELY NO TEXT of any kind: no letters, numbers, labels, logos, wordmarks, watermarks, brand names, markings, screen text or fake UI anywhere in the frame, on any surface or screen. Every word of the finished piece and the official logo are composited on top afterwards. If you draw text, the plate is unusable.

THE COLOUR ENVIRONMENT — the most important instruction. The frame is a gradient that BUILDS: warm bone white ${HUESO_FONDO} at the very top, cooling through pale blue in the middle, and deepening into a rich, luminous but still light brand blue (${AZUL_MARCA} at roughly 25% strength) across the bottom quarter and into the bottom corners. It must read as an atmosphere the subject is standing in, not as a white studio with a tint added.

THE TOP BAND IS EMPTY. The top 46% of the frame is nothing but the calm bone-white part of the gradient — no subject, no object, no detail, no texture, no horizon line, no shadow. Large dark type is laid over it, so it must stay completely quiet and even. The subject NEVER rises into it.

THE SUBJECT is the HERO: large, centred horizontally, complete and unclipped, occupying most of the lower half and commanding the frame. It has real presence — strong form, crisp edges, visible material. A soft contact shadow anchors it so it does not float. A luminous glow radiates from BEHIND it, brightest immediately around it and falling off outward, so it separates from the environment.

LIGHT — bright and soft, with real modelling: gentle highlights along the top edges of the subject and open, coloured shadows underneath. High-key but NEVER washed out; the texture survives everywhere. A blown-out frame with no material in it is the single worst outcome.

Real photography, real camera grain. Never a 3D render, never an illustration, never CGI, never a mockup, never a device frame. No defocused-room background — the environment is a clean gradient. Square 1:1, full bleed.`

/**
 * La dirección de arte que vale para CUALQUIER escena.
 *
 * Estaba escondida dentro de la regla de la familia "foto-real", así que las
 * otras dos no la recibían. No habla de qué se fotografía: habla de que no
 * parezca generado, y eso hace falta siempre. Es la parte de los quince prompts
 * viejos que costó iteraciones y que no había que perder al sacar las escenas.
 */
const DIRECCION_OSCURO = `NOT AI-LOOKING — the single most important rule. No perfectly symmetric corridor with the vanishing point dead centre, no infinite rows of identical glowing lights, no mirror-polished floor, no impossibly clean scene, no uniform blue glow over everything, no floating holograms, no fake UI. Shoot it like a real photographer did: off-centre framing, a specific object closer to the lens, shallow depth of field with a genuine focal plane, uneven motivated light, visible grain, a little mess.

THE GRADE, NOT THE DARKNESS. Keep natural skin tones, fabric, wood and window light in the scene, then pull the whole frame down and cool it toward navy: shadows crushed to near-black, highlights held back. The piece ends up almost black, but it got there in the grade — never by removing the light from the scene itself. A person you cannot see is a failed plate, and so is a flat murky smear.

REAL PHOTOGRAPHY unless the scene explicitly asks for a graphic: the grain of a real camera, never a CGI render, never an illustration, never a 3D object. If the scene does ask for a graphic, it is flat luminous line-work on black — thin single-weight outlines, fine curves, dotted particle fields — occupying no more than 40% of the frame, never a rendered or glassy object.

Blue is an accent only, NEVER a global color grade.`

/**
 * La dirección de arte del tema claro.
 *
 * Comparte con la oscura lo que no depende de la luz —que no parezca generado,
 * que sea fotografía y no un render, que el azul sea acento y no baño— y cambia
 * lo único que sí: de qué lado está el riesgo. Allá el peor resultado es una
 * mancha negra sin nada adentro; acá es una foto quemada, blanca y sin materia.
 *
 * Va repetida palabra por palabra en vez de "adaptada" porque es la parte que
 * costó iteraciones: reescribirla para acortarla es la forma segura de perderla.
 */
const DIRECCION_CLARO = `NOT AI-LOOKING — the single most important rule. No impossibly clean scene, no uniform wash over everything, no floating holograms, no fake UI, no perfectly symmetric arrangement. Shoot it like a real photographer did: a genuine focal plane, uneven motivated light, visible grain, real material.

THE GRADE, NOT THE BLOWOUT. Keep natural material in the scene — brushed metal, moulded plastic, cable, fabric — then lift the whole frame and warm it a touch toward bone: shadows opened to soft grey and colour, highlights held just under white, contrast gentle. The piece ends up bright, but it got there in the grade — never by erasing the content. A washed-out frame with no material in it is a failed plate, and so is a grey flat mush. You can still see the weave, the brushed finish, the edge.

REAL PHOTOGRAPHY unless the scene explicitly asks for a graphic: the grain of a real camera, never a CGI render, never an illustration, never a 3D object. If the scene does ask for a graphic, it is flat line-work in deep blue on the bone background — thin single-weight outlines, fine curves — occupying no more than 40% of the frame.

Blue is the ENVIRONMENT here, but never a global colour grade laid over the subject: the subject keeps its own material colour.`

const DIRECCION: Record<Tema, string> = {
  oscuro: DIRECCION_OSCURO,
  claro: DIRECCION_CLARO,
}

/** El matiz que aporta la familia. Se conserva para el velo de la composición. */
const REGLA_FAMILIA: Record<FamiliaFeed, string> = {
  "foto-real": `The subject is a PERSON at work. Real posture, realistic clothing, believable equipment, an ordinary workday — an Argentine/Latin American professional, not a model. Never a silhouette.`,
  tecnologia: `The subject is INFRASTRUCTURE or a real place. Precise composition, real hardware, no props that do not exist.`,
  editorial: `Typography carries this piece, so the plate stays quiet: generous empty dark background and at most one restrained graphic element.`,
}

/** La misma regla, para las piezas claras. Solo cambia de qué color es el vacío. */
const REGLA_FAMILIA_CLARO: Record<FamiliaFeed, string> = {
  ...REGLA_FAMILIA,
  editorial: `Typography carries this piece, so the plate stays quiet: generous empty pale background and at most one restrained graphic element.`,
}

/**
 * Las quince escenas viejas, ahora SOLO como respaldo.
 *
 * Un plan generado antes del 18/8 no tiene `opcion.imagen` guardado, y sin brief
 * de escena no hay con qué pedir el fondo. En vez de romperlos o inventarles una
 * escena genérica, siguen usando la que les tocaba. Los planes nuevos no pasan
 * por acá nunca.
 */
const ESCENA_LEGADO: Record<string, string> = {
  "feed-01-infraestructura": `A modern enterprise data center corridor: tall server racks receding in strong depth perspective, shot low and close so the racks fill the RIGHT side and the lower half with real texture — cabling, vents, the fine grid of drive bays. Night-lit by the racks' own small blue status LEDs and one restrained cold strip along the ceiling. No grey walls, no bright floor, no evenly-lit room. Realistic architectural photography.`,

  "feed-02-conectividad": `A real city at night shot from above, lights spread across the frame, weighted to the lower right. Over the city and only there, a few long thin luminous arcs connect a handful of bright points, like link routes drawn on a map: no more than eight arcs and twelve points in the whole frame. They sit ON the photograph as a restrained overlay; the city stays the subject.`,

  "feed-03-tecnico": `An IT/network technician working inside a real server room, seen from behind or in three-quarter back view while physically connecting or inspecting equipment inside a rack. He stands in the RIGHT half of the frame. The room is genuinely lit and he is clearly visible — his hands, his face in profile, the cables. Not a silhouette. A real Argentine/Latin American IT professional on an ordinary workday, natural posture, realistic clothing, believable cables and equipment. Neutral skin tones, black and grey gear, subtle warm ambient light mixed with restrained blue LEDs.`,

  "feed-04-datacenter": `A modern enterprise data center shot low and close, one rack standing near the lens in the RIGHT half with real texture while the rest falls away in depth. Very dark environment lit by its own restrained cold-blue LEDs. Not a symmetric corridor with the vanishing point dead centre.`,

  "feed-05-reunion": `Two or three professionals in a real technical conversation in a modern but believable office, placed in the RIGHT half of the frame. Captured naturally mid-conversation, not looking at camera. Real daylight from a window falls on them — faces, hands, the laptop are visible. Warm skin tones, neutral grey and black clothing, slightly warm indoor light. Blue only as a subtle accent, never a full blue grade.`,

  "feed-06-ciberseguridad": `Near-black plate with a partially visible digital shield formed from extremely thin blue lines, small nodes and subtle geometric data patterns, sitting in the LOWER RIGHT. Flat luminous line-work on black — never a solid or illustrated shield, never a 3D render.`,

  "feed-07-cloud": `Near-black plate with a cloud drawn as a single continuous thin luminous blue outline in the LOWER RIGHT, with a fine dotted particle field falling below it. Flat line-work, never a solid or fluffy illustrated cloud.`,

  "feed-08-clientes": `Near-black plate with a very faint blue dot pattern and thin line texture across the lower half, almost invisible. Minimal Swiss-style grid, generous empty background. Nothing else — the plate exists to carry logos and type composited later.`,

  "feed-09-campo": `An infrastructure technician working on-site, seen from behind or from the side, actively inspecting, installing or configuring enterprise equipment, placed in the RIGHT half. He may wear a white helmet or work clothing. The technician and the equipment are genuinely lit — the work being done, the posture, the gear all read. Not a silhouette. Everything operational and believable.`,

  "feed-10-cobertura": `Near-black plate with a refined outline map of ARGENTINA rendered in extremely thin electric-blue lines, occupying the RIGHT side. A few nodes glow softly along it. The silhouette must be geographically accurate and visually clean. Restrained and sophisticated, nothing else in the frame.`,

  "feed-11-insight": `Near-black plate with an elegant flowing data wave in the LOWER RIGHT: a dense fan of thin blue curves, brightest through its middle and fading at the edges, with a fine dotted particle field along it. Generous empty dark background everywhere else. The graphic occupies no more than 30% of the composition.`,

  "feed-12-caso-tipografico": `Near-black plate with an extremely subtle blue data-wave texture concentrated in the LOWER RIGHT corner, quieter and smaller than a feature graphic. Almost all of the frame is calm dark background with a faint navy gradient for depth.`,

  "feed-13-evento": `Near-black plate with a subtle dark navy gradient and a restrained blue line texture in the LOWER RIGHT. Highly structured and spacious, minimal Swiss grid. Nothing that reads as a badge, seal, card or credential.`,

  "feed-14-partnership": `Near-black plate with a faint blue line texture across the lower two thirds and nothing else. Absolutely no badges, no seals, no certification cards, no white or light card floating over the background — those are composited later from real files.`,

  "feed-15-persona": `A technology professional working naturally at a laptop in a real office, shown from the side or in three-quarter back view, focused and unaware of the camera, placed in the RIGHT half. Real light from the window and the laptop screen falls on them — face in profile, hands, the work. Not a silhouette. Warm-neutral skin tones, realistic black and grey surfaces. Blue only in tiny details.`,
}

/**
 * El prompt del fondo de una pieza.
 *
 * `escena` es el brief de arte de ESTA publicación —`opcion.imagen`, generado por
 * el plan— y es lo único que cambia entre una pieza y otra. Cuando no hay (planes
 * anteriores al cambio), cae al respaldo del template que le tocaba.
 *
 * Sigue devolviendo null en vez de inventar: sin escena y sin respaldo, la pieza
 * se resuelve escribiendo el brief a mano, no publicando un fondo cualquiera.
 */
export function promptDeFondo(
  escena: string | null,
  familia: FamiliaFeed,
  templateLegado?: string | null,
  layout?: string,
  tema: Tema = "oscuro"
): string | null {
  const brief = escena?.trim() || (templateLegado ? ESCENA_LEGADO[templateLegado] : null)
  if (!brief) return null

  /*
   * Las ESCENAS no cambian con el tema, y es a propósito.
   *
   * "Un corredor de data center con los racks a la derecha" es la misma escena
   * revelada de dos maneras; lo que decide si la pieza sale oscura o clara es la
   * dirección de arte y el sistema de abajo, no qué se fotografía. Traducir cada
   * escena a una versión clara sería mantener dos catálogos que van a divergir.
   */
  return [
    `SCENE — ${brief}`,
    (tema === "claro" ? REGLA_FAMILIA_CLARO : REGLA_FAMILIA)[familia],
    DIRECCION[tema],
    sistemaFondo(familia, layout, tema),
  ].join("\n\n")
}
