/**
 * GUÍA DE CONTENIDO — qué vas a obtener con cada combinación.
 *
 * La pantalla anterior pedía plataforma, formato, audiencia y objetivo sin
 * decir en ningún momento qué salía de eso. Elegir "carrusel" a ciegas y
 * enterarse después de que son ocho slides verticales con una idea cada una es
 * el momento equivocado para descubrirlo.
 *
 * Cada formato se describe en dos planos, porque son dos trabajos distintos y
 * casi siempre los hacen personas distintas:
 *   · `imagen` — la pieza gráfica: medida, composición, qué entra y qué no.
 *   · `posteo` — el texto: de qué trata, qué estructura tiene, para qué sirve.
 *
 * El criterio de canal es el de un negocio B2B de infraestructura IT, no el
 * genérico de redes sociales. LinkedIn vende, Instagram muestra que atrás hay
 * gente, y TikTok no tiene a quién hablarle acá — decirlo es más útil que
 * fingir que las cuatro plataformas valen lo mismo.
 */

export type Guia = { imagen: string; posteo: string }

export const PLATAFORMA_GUIA: Record<
  string,
  { rol: string; quien: string; prioridad: "alta" | "media" | "baja" }
> = {
  linkedin: {
    rol: "El canal de venta. Es donde están los decisores de IT y donde un post puede terminar en una reunión.",
    quien: "Gerentes de IT, CIOs, dueños y directores de empresas medianas y grandes.",
    prioridad: "alta",
  },
  instagram: {
    rol: "La prueba de que atrás hay gente. No vende: sostiene la credibilidad y sirve para marca empleadora.",
    quien: "Equipo propio, candidatos, contactos del sector y clientes que van a chusmear.",
    prioridad: "media",
  },
  facebook: {
    rol: "Está dormido. Publicar acá solo tiene sentido como espejo de LinkedIn, para que el perfil no se vea abandonado.",
    quien: "Casi nadie del público objetivo. Es mantenimiento de presencia, no distribución.",
    prioridad: "baja",
  },
  tiktok: {
    rol: "No tiene audiencia B2B de infraestructura IT en Argentina. Lo único defendible es marca empleadora: mostrar cómo se trabaja.",
    quien: "Perfiles técnicos jóvenes. Sirve para reclutar, no para vender.",
    prioridad: "baja",
  },
}

/** Clave: `plataforma:formato`. */
export const FORMATO_GUIA: Record<string, Guia> = {
  // ── LinkedIn ──────────────────────────────────────────────────────────────
  "linkedin:imagen": {
    imagen:
      "Una placa cuadrada 1080×1080 o apaisada 1200×628. Fondo gris claro o navy, un solo dato o frase como protagonista, mucho aire alrededor y el azul de marca usado una única vez. El texto largo NO va dentro de la imagen: va en el copy.",
    posteo:
      "Una idea sola, bien dicha. Gancho en el primer renglón —LinkedIn corta el resto y solo eso decide si te leen—, tres a cinco párrafos cortos separados por línea en blanco, y cierre con pregunta. Es el formato para un dato, un aprendizaje o un anuncio.",
  },
  "linkedin:carrusel": {
    imagen:
      "PDF de 5 a 8 slides en 1080×1350 vertical. Portada con el título grande, una idea por slide con titular y dos líneas, última slide con el CTA. La grilla y el pie se repiten idénticos en todas: el carrusel se lee deslizando y cualquier salto de layout se nota.",
    posteo:
      "El formato con más alcance orgánico de LinkedIn. Sirve para desarmar algo en pasos: cómo funciona la firma biométrica, qué mirar antes de renovar una red, los errores típicos de un despliegue. El copy solo presenta el carrusel; el contenido está en los slides.",
  },
  "linkedin:video": {
    imagen:
      "30 a 90 segundos, vertical o cuadrado, con subtítulos quemados —se mira sin sonido—. Los primeros 3 segundos llevan la conclusión, no la presentación. Sin intro con logo animado: es tiempo regalado.",
    posteo:
      "Para lo que no se entiende en una foto: un rack armado, una obra, una demo de firma en pantalla, alguien del equipo explicando algo en 40 segundos. El copy resume lo que se ve para quien no reproduce el video.",
  },
  "linkedin:articulo": {
    imagen:
      "Portada 1200×628 con el título. El cuerpo va en texto: sin imágenes decorativas intermedias, salvo un diagrama o una captura que aporte de verdad.",
    posteo:
      "800 a 1500 palabras, para un caso completo o un tema técnico con profundidad. Se indexa en Google, así que suma SEO — pero dentro de LinkedIn tiene poco alcance orgánico: el artículo se comparte, no se descubre. Sirve como material para mandar, no para llegar.",
  },

  // ── Instagram ─────────────────────────────────────────────────────────────
  "instagram:imagen": {
    imagen:
      "Cuadrada 1080×1080. Foto propia del equipo, de una obra o de una capacitación; si no hay foto, placa con una frase corta. Stock corporativo no: si la misma imagen está en la web de un competidor, la prueba se vuelve en contra.",
    posteo:
      "Copy corto y humano, dos o tres líneas. Acá no se vende infraestructura: se muestra quiénes son. Equipo, obra, cultura, un logro puntual.",
  },
  "instagram:carrusel": {
    imagen:
      "Hasta 10 slides en 1080×1350. Funciona mejor con foto real que con placas de texto: una secuencia de una obra, un antes y después, el paso a paso de un despliegue.",
    posteo:
      "Para contar algo que tiene secuencia. El primer slide se juega todo: si no frena el scroll, los otros nueve no existen.",
  },
  "instagram:reel": {
    imagen:
      "Vertical 9:16, entre 15 y 45 segundos, subtítulos quemados y foco en los primeros 2 segundos. Sin música de moda que no tenga nada que ver: en una marca B2B se lee como impostado.",
    posteo:
      "Es lo que más alcance tiene en Instagram. Detrás de escena, un timelapse de instalación, el equipo trabajando. El texto acompaña; el peso está en el video.",
  },
  "instagram:story": {
    imagen:
      "9:16, dura 24 horas. Se permite lo crudo: foto de celular, sin producción. Es el único lugar donde la imperfección suma.",
    posteo:
      "Para lo efímero: una jornada, una capacitación, un evento, un saludo. Sin CTA fuerte — la story es presencia, no conversión.",
  },

  // ── Facebook ──────────────────────────────────────────────────────────────
  "facebook:imagen": {
    imagen: "Cuadrada o apaisada. Suele reutilizarse la misma pieza de LinkedIn sin rehacerla.",
    posteo:
      "Espejo de LinkedIn, con el copy un poco más suelto. No inviertas tiempo propio acá: el objetivo es que el perfil no se vea muerto.",
  },
  "facebook:video": {
    imagen: "Cuadrado o apaisado, con subtítulos. La misma pieza que va a LinkedIn.",
    posteo: "Reutilización directa. No amerita producción propia.",
  },
  "facebook:carrusel": {
    imagen: "El mismo carrusel de LinkedIn, exportado como imágenes sueltas.",
    posteo: "Reutilización. Facebook no premia el carrusel como LinkedIn.",
  },
  "facebook:story": {
    imagen: "9:16, 24 horas. Copia de la story de Instagram.",
    posteo: "Reutilización directa desde Instagram.",
  },

  // ── TikTok ────────────────────────────────────────────────────────────────
  "tiktok:video": {
    imagen:
      "Vertical 9:16, de 15 a 60 segundos, cortes rápidos y subtítulos. Estética de celular, no de productora.",
    posteo:
      "Solo tiene sentido para marca empleadora: cómo se trabaja, qué hace un técnico en un día, un despliegue en timelapse. Nadie va a contratar infraestructura desde TikTok.",
  },
  "tiktok:duet": {
    imagen: "Pantalla dividida con el video original. Formato nativo, se ve casero y está bien.",
    posteo:
      "Responderle a alguien del rubro. Difícil de justificar para Accedra: exige presencia constante para que tenga sentido.",
  },
  "tiktok:tendencia": {
    imagen: "Lo que dicte la tendencia del momento.",
    posteo:
      "Alto riesgo de marca: una tendencia mal elegida en una empresa que le vende a bancos hace más daño que el alcance que gana.",
  },
}

export const OBJETIVO_GUIA: Record<
  string,
  { que: string; comoSeNota: string; ejemplo: string }
> = {
  awareness: {
    que: "Que la empresa exista en la cabeza del decisor antes de que necesite comprar.",
    comoSeNota:
      "No pide nada. No hay formulario, no hay 'contactanos'. Se mide en alcance y seguidores nuevos, no en consultas.",
    ejemplo: "«Renovamos la red de 122 sucursales sin cortar la operación. Así se hace.»",
  },
  educacion: {
    que: "Explicar cómo funciona algo, para que el decisor entienda el problema que tiene.",
    comoSeNota:
      "Enseña sin vender. Si al terminar de leerlo el otro aprendió algo aunque nunca contrate, está bien hecho. Es el que más autoridad construye y el que mejor rinde en carrusel.",
    ejemplo: "«Qué hace que una firma biométrica tenga validez legal: presión, velocidad, trazo y tiempo.»",
  },
  prueba_social: {
    que: "Mostrar quién ya confía, para que el que duda se sienta acompañado.",
    comoSeNota:
      "Nombres propios y números. Cliente, problema, qué se hizo, qué cambió. Sin adjetivos: el número hace el trabajo.",
    ejemplo: "«Andreani: las caídas de red pasaron de 5 por semana a menos de 1 por mes.»",
  },
  conversion: {
    que: "Que el que ya está caliente levante la mano ahora.",
    comoSeNota:
      "Es el único con CTA explícito y un solo link. Funciona si antes hubo awareness y educación: un feed que solo convierte deja de leerse. Regla sana: uno de cada cuatro o cinco posts, no más.",
    ejemplo: "«¿Tu red no acompaña el crecimiento? Diagnóstico sin cargo, respuesta en 24 h hábiles.»",
  },
}

export const AUDIENCIA_GUIA: Record<string, { que: string; comoLeHablo: string }> = {
  decisores: {
    que: "Gerentes de IT, CIOs y responsables de infraestructura. Tienen equipo propio pero no les alcanza para proyectos grandes.",
    comoLeHablo:
      "Nombrá la tecnología concreta —Catalyst, SD-WAN, Zero Trust—: para ellos es señal de que sabés. Y cerrá en la consecuencia operativa.",
  },
  negocio: {
    que: "Dueños, directores y gerentes generales. Firman el cheque y no les interesa la marca del switch.",
    comoLeHablo:
      "Nada de siglas. Hablales de riesgo, de costo y de continuidad: cuánto cuesta que la operación se frene, no cuántos gigabits tiene el enlace.",
  },
  ambos: {
    que: "Mezcla de perfil técnico y de negocio en un mismo post.",
    comoLeHablo:
      "El dato técnico va, pero cada bloque cierra en una consecuencia que entiende cualquiera. Es lo más difícil de escribir bien: si no se cuida, no le habla a ninguno de los dos.",
  },
}

/** Fallback para una combinación sin ficha propia. */
export const GUIA_GENERICA: Guia = {
  imagen: "Pieza con el sistema visual de Accedra: fondo limpio, mucho aire y un solo acento azul.",
  posteo: "Texto con la voz de la marca: concreto, en español argentino y sin promesas que no se puedan sostener.",
}

export function guiaDe(plataforma: string, formato: string | null): Guia | null {
  if (!formato) return null
  return FORMATO_GUIA[`${plataforma}:${formato}`] ?? GUIA_GENERICA
}
