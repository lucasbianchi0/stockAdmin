/**
 * Inventario de SEO y GEO de accedra.com.ar.
 *
 * Todo lo de acá está relevado del sitio en producción, no escrito a mano: los
 * títulos, descripciones y H1 son los que devuelve el HTML hoy. Si el sitio
 * cambia, esto queda viejo — por eso `RELEVADO` está a la vista en la página.
 *
 * SEO y GEO no son lo mismo y conviene no mezclarlos:
 *   · SEO — que Google encuentre la página y la muestre en una lista de links.
 *   · GEO — que un modelo (ChatGPT, Gemini, Perplexity) pueda leer el sitio,
 *     entender qué hace Accedra y citarla dentro de una respuesta. Ahí no hay
 *     lista de resultados: o entrás en la respuesta o no existís.
 */

export const RELEVADO = "2026-08-23"
export const DOMINIO = "https://www.accedra.com.ar"

/* ── 1. Arquitectura ──────────────────────────────────────────────────────── */

export const SOLUCIONES = [
  // "Networking" hasta agosto 2026. Se renombró porque la categoría genérica la
  // podía firmar cualquier competidor, y en castellano colisiona con networking
  // de contactos. El slug de la URL sigue siendo /soluciones/networking.
  "Conectividad Crítica",
  "Firma Biométrica",
  "Consultoría Microsoft",
  "Seguridad IT",
  "Software & AI",
] as const

export const INDUSTRIAS = [
  "Bancos",
  "Aseguradoras",
  "Estudios jurídicos",
  "Laboratorios y salud",
  "Logística",
  "Retail",
  // Minería entra en agosto 2026: es el vertical de mayor crecimiento del país
  // y donde Accedra tiene su antecedente más fuerte (Finning, 15+ sitios en
  // cuatro provincias).
  "Minería",
] as const

/**
 * El 1:1:1 que sostiene todo el sistema de medición: una campaña de Ads por
 * solución, un grupo de anuncios por industria, y una landing propia por cruce.
 * Si los nombres de campaña no respetan la convención, el informe mensual se
 * rompe — es el único requisito operativo.
 */
export const CADENA = [
  { nivel: "Campaña", equivale: "Solución", ejemplo: "Firma Biométrica" },
  { nivel: "Grupo de anuncios", equivale: "Industria", ejemplo: "Estudios jurídicos" },
  {
    nivel: "Landing",
    equivale: "El cruce",
    ejemplo: "/soluciones/firma-biometrica/juridicos",
  },
]

export const MAPA_URLS = [
  { grupo: "Home", cantidad: 1, patron: "/", nota: "Entrada de marca" },
  {
    grupo: "Soluciones",
    cantidad: 5,
    patron: "/soluciones/{solución}",
    nota: "Una por servicio",
  },
  {
    grupo: "Solución × industria",
    cantidad: 35,
    patron: "/soluciones/{solución}/{industria}",
    nota: "El destino de los anuncios",
  },
  {
    grupo: "Casos de éxito",
    cantidad: 7,
    patron: "/casos/{tema}/{n}",
    nota: "Prueba social · incluye el alias /casos/finning",
  },
  { grupo: "Legales", cantidad: 1, patron: "/privacidad", nota: "—" },
]

export const TOTAL_URLS = MAPA_URLS.reduce((a, m) => a + m.cantidad, 0)

/* ── 2. Anatomía SEO de una landing ───────────────────────────────────────── */

export type Pieza = {
  campo: string
  que: string
  ejemplo: string
  estado: "ok" | "parcial"
  detalle: string
}

/**
 * Qué lleva cada una de las 35 landings. El ejemplo es real y sale siempre de
 * la misma página (/soluciones/networking/bancos) para que se lea como una
 * pieza entera y no como seis fragmentos sueltos.
 */
export const ANATOMIA: Pieza[] = [
  {
    campo: "Title",
    que: "El link azul en Google. Se corta a ~60 caracteres.",
    ejemplo: "Redes para bancos y entidades financieras · Accedra",
    estado: "ok",
    detalle: "40 de 40 escritos, entre 42 y 68 caracteres. 2 superan los 60 y Google los va a cortar",
  },
  {
    campo: "Meta description",
    que: "El texto gris debajo del link. No posiciona, pero decide el clic.",
    ejemplo:
      "Infraestructura de red para bancos: sucursales con enlaces redundantes, segmentación de cajeros y POS, y wireless corporativo sobre Cisco.",
    estado: "ok",
    detalle: "40 de 40 escritas · 37 dentro de 120–160 · 3 pasan los 160",
  },
  {
    campo: "H1",
    que: "El titular visible. Uno solo por página.",
    ejemplo: "Conectamos operaciones que no pueden parar. para Bancos",
    estado: "ok",
    detalle: "40 de 40 con H1 único",
  },
  {
    campo: "Canonical",
    que: "Cuál es la URL buena, para que no compitan duplicados entre sí.",
    ejemplo: "https://www.accedra.com.ar/soluciones/networking/bancos",
    estado: "ok",
    detalle: "40 de 40 autorreferenciales",
  },
  {
    campo: "Breadcrumb",
    que: "La miga de pan que Google muestra en vez de la URL cruda.",
    ejemplo: "Inicio › Conectividad Crítica › Bancos",
    estado: "ok",
    detalle: "40 de 40 con BreadcrumbList",
  },
  {
    campo: "FAQ",
    que: "Preguntas de esa industria. Alimentan tanto el snippet como la IA.",
    ejemplo: "¿Por qué hay que separar la red de cajeros de la red administrativa?",
    estado: "parcial",
    detalle: "4 por landing en las 35 · las 5 páginas de solución no tienen",
  },
  {
    campo: "Open Graph",
    que: "Cómo se ve el link al pegarlo en LinkedIn o WhatsApp.",
    ejemplo: "og:image 1200×630 generada por página",
    estado: "ok",
    detalle: "Título, descripción e imagen en las 35",
  },
]

/* ── 3. GEO: qué ve un modelo ─────────────────────────────────────────────── */

export type SenalGeo = {
  nombre: string
  ruta?: string
  que: string
  estado: "ok" | "falta"
  detalle: string
}

export const SENALES_GEO: SenalGeo[] = [
  {
    nombre: "llms.txt",
    ruta: "/llms.txt",
    que: "Un resumen del sitio en texto plano, escrito para que lo lea un modelo y no una persona. Evita que la IA tenga que adivinar entre el HTML.",
    estado: "ok",
    detalle:
      "11,9 KB · las 40 páginas listadas con su descripción, agrupadas por industria, más los tres casos de éxito con sus métricas",
  },
  {
    nombre: "Ficha de entidad",
    que: "Quién es Accedra en datos que una máquina puede citar: razón social, dirección, teléfono, año de fundación, coordenadas y perfiles sociales.",
    estado: "ok",
    detalle: "JSON-LD ProfessionalService en todas las páginas",
  },
  {
    nombre: "Temas declarados",
    que: "`knowsAbout` le dice al modelo de qué puede hablar Accedra con autoridad.",
    estado: "ok",
    detalle: "Las 5 soluciones declaradas explícitamente",
  },
  {
    nombre: "Preguntas y respuestas",
    que: "El formato que un modelo cita casi textual. 140 pares pregunta/respuesta con el marco normativo argentino de cada industria.",
    estado: "ok",
    detalle: "35 landings × 4 FAQ = 140 respuestas indexables",
  },
  {
    nombre: "Casos con métricas",
    que: "El antecedente concreto es lo que un modelo cita cuando alguien pregunta quién hace esto en Argentina — pesa más que la descripción del servicio.",
    estado: "ok",
    detalle:
      "Los 3 casos en llms.txt con cliente, industria, desafío y cifras. Salen de la misma fuente que las páginas de caso",
  },
  {
    nombre: "Perfiles verificables",
    que: "`sameAs` conecta el sitio con perfiles externos. Es cómo un modelo confirma que la empresa existe fuera de su propia web.",
    estado: "ok",
    detalle: "LinkedIn e Instagram",
  },
  {
    nombre: "Permiso a crawlers de IA",
    que: "GPTBot, ClaudeBot, PerplexityBot y Google-Extended pueden entrar. No están nombrados, pero el `Allow: /` general los cubre.",
    estado: "ok",
    detalle: "robots.txt sin bloqueos por agente",
  },
  {
    nombre: "Medición de citas en IA",
    que: "Saber si ChatGPT o Perplexity efectivamente nombran a Accedra cuando alguien pregunta por proveedores de IT en Argentina.",
    estado: "falta",
    detalle: "No hay forma de saberlo hoy. Es el único hueco real del bloque GEO",
  },
]

export const SCHEMAS = [
  { tipo: "ProfessionalService", donde: "Todas", que: "La empresa como entidad" },
  { tipo: "WebSite", donde: "Todas", que: "El sitio como publicación" },
  { tipo: "BreadcrumbList", donde: "35 páginas", que: "La jerarquía de navegación" },
  { tipo: "Service", donde: "35 páginas", que: "El servicio que ofrece la página" },
  { tipo: "FAQPage", donde: "35 landings", que: "Las preguntas de la industria" },
]

/* ── 4. Infraestructura técnica ───────────────────────────────────────────── */

export const TECNICO = [
  { item: "robots.txt", valor: "Allow: / · bloquea sólo /preview-mapa", estado: "ok" as const },
  {
    item: "sitemap.xml",
    valor: `${TOTAL_URLS} URLs, dinámico y declarado en robots.txt`,
    estado: "ok" as const,
  },
  { item: "Canonical", valor: "Autorreferencial en las 35", estado: "ok" as const },
  { item: "Indexación", valor: "index, follow · max-snippet:-1", estado: "ok" as const },
  {
    item: "Redirects 301",
    valor: "URLs del sitio viejo (/networking, /cisco, /powerbi…) redirigidas",
    estado: "ok" as const,
  },
  {
    item: "Fuente única",
    valor: "lib/seo/site.ts alimenta title, schema, sitemap y llms.txt",
    estado: "ok" as const,
  },
  {
    item: "Search Console",
    valor: "El meta de verificación no aparece en el HTML. Puede estar por DNS — sin confirmar",
    estado: "duda" as const,
  },
  {
    item: "hreflang",
    valor: "Ausente. El sitio tiene ES/EN/PT completos, pero el idioma cambia por localStorage sin cambiar la URL",
    estado: "duda" as const,
  },
]

/**
 * El hallazgo menos obvio del relevamiento: hay tres idiomas escritos y sólo uno
 * indexable. No es un bug — es una decisión pendiente, y conviene que esté a la
 * vista para que nadie asuma que el contenido en inglés está trayendo tráfico.
 */
export const IDIOMAS = {
  escritos: ["Español", "Inglés", "Portugués"],
  indexables: ["Español"],
  porque:
    "El selector guarda el idioma en localStorage y no cambia la URL, así que para Google sólo existe la versión en español. El `<html lang>` arranca siempre en `es`.",
  decision:
    "Dejarlo así mientras el mercado sea Argentina: el EN/PT sirve para el ejecutivo regional que entra al sitio. Migrar a /en y /pt con hreflang recién si hay expansión.",
}

/* ── 5. Performance ───────────────────────────────────────────────────────── */

export type Auditoria = {
  etiqueta: string
  url: string
  dispositivo: "Mobile" | "Desktop"
  performance: number
  accesibilidad: number
  buenasPracticas: number
  seo: number
  lcp: string
  cls: string
  tbt: string
  si: string
}

/**
 * Lighthouse 13 sobre producción, headless, red móvil simulada.
 *
 * Esta medición es la de después de aligerar el home. El 60 de mobile pasó a 87:
 * el video del hero ahora se sirve en una versión mobile de 308 KB en vez de los
 * 2,71 MB de antes, y el bloqueo de hilo bajó de 570 ms a 0. Lo que queda es un
 * LCP de 3,6 s — mejorable, pero ya no es el agujero que era.
 *
 * Ojo al comparar contra la corrida anterior: aquella fue con Lighthouse 12 y
 * ésta con 13, así que parte del movimiento de los puntajes es de versión. Lo
 * que no depende de la versión son los bytes y el TBT, y ahí la mejora es real.
 */
export const PERF_MEDIDO = "2026-08-10"
export const PERF_HERRAMIENTA = "Lighthouse 13 · headless · 4G simulado"

export const AUDITORIAS: Auditoria[] = [
  {
    etiqueta: "Home",
    url: "/",
    dispositivo: "Mobile",
    performance: 87,
    accesibilidad: 95,
    buenasPracticas: 96,
    seo: 100,
    lcp: "3,6 s",
    cls: "0",
    tbt: "0 ms",
    si: "4,7 s",
  },
  {
    etiqueta: "Home",
    url: "/",
    dispositivo: "Desktop",
    performance: 100,
    accesibilidad: 95,
    buenasPracticas: 96,
    seo: 100,
    lcp: "0,7 s",
    cls: "0",
    tbt: "0 ms",
    si: "0,6 s",
  },
  {
    etiqueta: "Landing tipo",
    url: "/soluciones/firma-biometrica/juridicos",
    dispositivo: "Mobile",
    performance: 91,
    accesibilidad: 91,
    buenasPracticas: 96,
    seo: 100,
    lcp: "3,2 s",
    cls: "0",
    tbt: "10 ms",
    si: "4,3 s",
  },
]

/** El reparto del peso del home en mobile, después de aligerarlo. */
export const PESO_HOME = {
  total: "727 KB en 42 pedidos",
  reparto: [
    { tipo: "Video", peso: 0.3, req: 1 },
    { tipo: "JavaScript", peso: 0.2, req: 13 },
    { tipo: "Tipografías", peso: 0.1, req: 3 },
    { tipo: "Imágenes", peso: 0.08, req: 18 },
  ],
}

export type Hallazgo = {
  titulo: string
  detalle: string
  impacto: "alto" | "medio" | "bajo"
}

export const HALLAZGOS_PERF: Hallazgo[] = [
  {
    titulo: "El LCP del home queda en 3,6 s",
    detalle:
      "Es lo único que separa al home mobile de los 90. El umbral bueno de Google es 2,5 s: falta poco más de un segundo.",
    impacto: "medio" as const,
  },
  {
    titulo: "2,2 s de trabajo en el hilo principal",
    detalle:
      "No bloquea (el TBT es 0 ms), pero son 0,9 s de tareas varias y 0,7 s de estilo y layout que empujan el Speed Index a 4,7 s.",
    impacto: "medio" as const,
  },
  {
    titulo: "Contraste insuficiente en las landings",
    detalle:
      "Es lo que deja la accesibilidad de la landing en 91 contra 95 del home. Son pares de colores concretos, no un problema de sistema.",
    impacto: "medio" as const,
  },
  {
    titulo: "48 KB de JavaScript sin usar",
    detalle: "Más 14 KB de sintaxis vieja transpilada de más. Se recuperan sin tocar el diseño.",
    impacto: "bajo" as const,
  },
  {
    titulo: "Logos sin width ni height",
    detalle:
      "Los `<img>` de las marcas no declaran tamaño. Hoy no cuesta CLS —está en 0—, pero obliga al navegador a recalcular layout.",
    impacto: "bajo" as const,
  },
  {
    titulo: "16 KB de CSS que bloquean el render",
    detalle: "Una sola hoja de estilos frena la primera pintura. Es el techo del FCP de 1,0 s.",
    impacto: "bajo" as const,
  },
]

/* ── 6. Estado general ────────────────────────────────────────────────────── */

export type Semaforo = "verde" | "amarillo" | "rojo"

/** El tablero del roadmap de accedra/plan/seo-geo, verificado contra producción. */
export const ESTADO: { area: string; estado: Semaforo; comentario: string }[] = [
  {
    area: "SEO técnico",
    estado: "verde",
    comentario: "Prácticamente terminado. Es lo mejor que tiene el proyecto",
  },
  {
    area: "GEO / búsqueda generativa",
    estado: "verde",
    comentario: "llms.txt con casos, entidad y 140 FAQ. Falta sólo medir si la IA cita",
  },
  {
    area: "SEO de contenido",
    estado: "amarillo",
    comentario: `Base fuerte, sin crecimiento: ${TOTAL_URLS} URLs es un techo fijo`,
  },
  {
    area: "Performance",
    estado: "verde",
    comentario: "Desktop en 100 y mobile del home de 60 a 87 tras aligerar el video del hero",
  },
  {
    area: "SEO local / Google Business",
    estado: "amarillo",
    comentario: "La ficha existe y fue el único canal que convirtió en 2026. Nadie la trabaja",
  },
  { area: "Reseñas", estado: "rojo", comentario: "Sin trabajar, aunque la ficha ya está creada" },
  { area: "Backlinks", estado: "rojo", comentario: "Nada trabajado" },
]

export const PENDIENTES = [
  {
    titulo: "Trabajar el Google Business Profile, que ya existe",
    porque:
      "La ficha está creada y es el único canal que efectivamente convirtió: las 7 conversiones del último año en Google Ads salieron de su chat, contra cero del formulario del sitio. Nadie la trabaja. Cargar fotos, servicios, publicaciones y atender las reseñas cuesta cero y ya demostró rendir mejor que $712.276 de pauta.",
    prioridad: "ahora" as const,
  },
  {
    titulo: "Corregir las coordenadas del schema",
    porque:
      "El código dice textual que las de Irala 1950 son aproximadas. Si la ficha se crea con la ubicación real y el schema dice otra, se contradicen.",
    prioridad: "ahora" as const,
  },
  {
    titulo: "Confirmar Search Console",
    porque:
      "El meta de verificación no está en el HTML. Puede estar verificado por DNS, pero sin confirmarlo se navega a ciegas: no hay posiciones ni impresiones.",
    prioridad: "ahora" as const,
  },
  {
    titulo: "Bajar el LCP del home de 3,6 s a 2,5 s",
    porque:
      "Aligerar el video ya subió el mobile de 60 a 87. Lo que falta para los 90 es el último segundo de LCP: el CSS que bloquea el render y los 2,2 s de hilo principal. Es afinado, ya no rescate.",
    prioridad: "despues" as const,
  },
  {
    titulo: "Contraste de colores en las landings",
    porque:
      "Es lo único que separa la accesibilidad de la landing (91) de la del home (95). Son pares de colores puntuales, y las landings son el destino real de los anuncios.",
    prioridad: "despues" as const,
  },
  {
    titulo: "Los 3 casos duplicados",
    porque:
      "Seis URLs sirven tres contenidos: /casos/home/2 y /casos/firma-biometrica/0 son la misma nota, y las seis se autocanonizan. Cada par compite consigo mismo. Se arregla apuntando el canonical de la copia a la original.",
    prioridad: "despues" as const,
  },
  {
    titulo: "FAQ en las 5 páginas de solución",
    porque:
      "Las 35 landings de industria tienen 4 preguntas cada una; las páginas madre no tienen ninguna, y son las que compiten por el término genérico.",
    prioridad: "despues" as const,
  },
  {
    titulo: "Contenido informativo",
    porque:
      "Hoy el sitio sólo compite por búsquedas transaccionales. Las informativas son 10× más volumen y son el único camino para romper el techo de las 43 URLs.",
    prioridad: "despues" as const,
  },
  {
    titulo: "Medir citas en respuestas de IA",
    porque:
      "El sitio está preparado para que un modelo lo lea, pero nadie chequeó si efectivamente lo nombra. Es lo que vuelve medible al GEO.",
    prioridad: "despues" as const,
  },
  {
    titulo: "Conversión por landing",
    porque:
      "El sitio ya guarda la landing de origen en `sessions` y `leads`. Falta cruzarlo para saber cuál de las 35 cierra y cuál sólo trae tráfico.",
    prioridad: "despues" as const,
  },
  {
    titulo: "Revisar las referencias normativas de las landings de minería",
    porque:
      "Los cinco bloques nuevos citan el Decreto 249/2007 de Higiene y Seguridad minera, la Ley 25.506, la Ley 24.585 y el Registro Federal de Proveedores Mineros. Son lo que le da credibilidad al texto ante un lector técnico del sector: si una está mal citada, resta en vez de sumar. Tiene que mirarlo alguien del negocio, no marketing.",
    prioridad: "ahora" as const,
  },
  {
    titulo: "Escribir el copy de anuncios de las 3 soluciones restantes",
    porque:
      "El generador de campañas recorre las 5 soluciones pero sólo emite las que tienen copy cargado. Hoy están Firma Biométrica (7 industrias) y Conectividad Crítica (minería); faltan Consultoría, Seguridad IT y Software & AI. Sin eso, esas landings existen pero ninguna campaña las usa.",
    prioridad: "despues" as const,
  },
]

/* ── Inventario ───────────────────────────────────────────────────────────── */

export type Pagina = {
  ruta: string
  solucion: string
  industria: string | null
  title: string
  description: string
  h1: string
  faqs: number
}

/** Relevado del HTML de producción. No editar a mano: se vuelve a relevar. */
export const PAGINAS: Pagina[] = [
  {
    ruta: "/soluciones/networking",
    solucion: "Conectividad Crítica",
    industria: null,
    title: "Cableado Estructurado, Redes Cisco y WiFi Corporativo | Accedra",
    description: "Infraestructura de red para empresas: cableado estructurado certificado, switching Cisco, WiFi corporativo y enlaces satelitales con SD-WAN para sitios remotos.",
    h1: "Conectamos operaciones que no pueden parar.",
    faqs: 0,
  },
  {
    ruta: "/soluciones/networking/bancos",
    solucion: "Conectividad Crítica",
    industria: "Bancos",
    title: "Redes para bancos y entidades financieras · Accedra",
    description: "Infraestructura de red para bancos: sucursales con enlaces redundantes, segmentación de cajeros y POS, y wireless corporativo sobre Cisco. Partner certificado.",
    h1: "Conectamos operaciones que no pueden parar. para Bancos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/networking/juridicos",
    solucion: "Conectividad Crítica",
    industria: "Estudios jurídicos",
    title: "Redes e infraestructura IT para estudios jurídicos · Accedra",
    description: "Infraestructura de red para estudios jurídicos: WiFi segmentado, cableado estructurado, resguardo documental y contingencia. Confidencialidad por diseño.",
    h1: "Conectamos operaciones que no pueden parar. para Estudios jurídicos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/networking/laboratorios",
    solucion: "Conectividad Crítica",
    industria: "Laboratorios y salud",
    title: "Redes para laboratorios y centros de salud · Accedra",
    description: "Infraestructura de red para laboratorios y salud: segmentación de equipamiento clínico, alta disponibilidad, wireless y contingencia sobre Cisco.",
    h1: "Conectamos operaciones que no pueden parar. para Laboratorios y salud",
    faqs: 4,
  },
  {
    ruta: "/soluciones/networking/logistica",
    solucion: "Conectividad Crítica",
    industria: "Logística",
    title: "Redes para logística, plantas y depósitos · Accedra",
    description: "Conectividad para operaciones logísticas: WiFi industrial en depósitos, SD-WAN multisitio y enlaces satelitales. Caso Andreani: de 5 caídas por semana a menos de 1 por mes.",
    h1: "Conectamos operaciones que no pueden parar. para Logística",
    faqs: 4,
  },
  {
    ruta: "/soluciones/networking/mineria",
    solucion: "Conectividad Crítica",
    industria: "Minería",
    title: "Conectividad para minería y yacimientos remotos · Accedra",
    description: "Redes para yacimientos y sitios remotos: enlaces satelitales por SD-WAN, WiFi de exterior y cableado certificado. Caso Finning: 15+ sitios en cuatro provincias.",
    h1: "Conectamos operaciones que no pueden parar. para Minería",
    faqs: 4,
  },
  {
    ruta: "/soluciones/networking/retail",
    solucion: "Conectividad Crítica",
    industria: "Retail",
    title: "Redes multisucursal para retail y comercios · Accedra",
    description: "Infraestructura de red para retail: SD-WAN entre sucursales, segmentación de POS según PCI DSS y WiFi de clientes separado de la red de cobro.",
    h1: "Conectamos operaciones que no pueden parar. para Retail",
    faqs: 4,
  },
  {
    ruta: "/soluciones/networking/seguros",
    solucion: "Conectividad Crítica",
    industria: "Aseguradoras",
    title: "Redes para aseguradoras y compañías de seguros · Accedra",
    description: "Conectividad para aseguradoras: casa central, sucursales y productores con acceso remoto seguro, wireless corporativo y telefonía IP sobre Cisco.",
    h1: "Conectamos operaciones que no pueden parar. para Aseguradoras",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica",
    solucion: "Firma Biométrica",
    industria: null,
    title: "Firma Digital y Biométrica con Validez Legal | Accedra",
    description: "Firma electrónica, biométrica y digital según la normativa aplicable: eSignAnywhere, tabletas Wacom, factoring digital. Digitalización documental sin papel.",
    h1: "Firma electrónica, biométrica y digital.",
    faqs: 0,
  },
  {
    ruta: "/soluciones/firma-biometrica/bancos",
    solucion: "Firma Biométrica",
    industria: "Bancos",
    title: "Firma digital y biométrica para bancos · Accedra",
    description: "Firma biométrica en sucursales bancarias: onboarding y formularios sin papel, con identidad verificada y valor probatorio. Caso Banco Provincia: 400 sucursales.",
    h1: "Firma electrónica, biométrica y digital. para Bancos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica/juridicos",
    solucion: "Firma Biométrica",
    industria: "Estudios jurídicos",
    title: "Firma digital para estudios jurídicos y abogados · Accedra",
    description: "Firma digital para estudios jurídicos: contratos, poderes y escritos con validez legal según Ley 25.506, trazabilidad y resguardo documental. Sin papel.",
    h1: "Firma electrónica, biométrica y digital. para Estudios jurídicos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica/laboratorios",
    solucion: "Firma Biométrica",
    industria: "Laboratorios y salud",
    title: "Firma digital para laboratorios y salud · Accedra",
    description: "Firma electrónica en salud: consentimientos informados, informes y protocolos firmados digitalmente, con identidad verificada y trazabilidad documental.",
    h1: "Firma electrónica, biométrica y digital. para Laboratorios y salud",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica/logistica",
    solucion: "Firma Biométrica",
    industria: "Logística",
    title: "Firma digital para logística: remitos y entregas · Accedra",
    description: "Firma electrónica en operaciones logísticas: conformidad de entrega y remitos firmados en el punto de destino, sin papel y con trazabilidad inmediata.",
    h1: "Firma electrónica, biométrica y digital. para Logística",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica/mineria",
    solucion: "Firma Biométrica",
    industria: "Minería",
    title: "Firma digital para minería: remitos y proveedores · Accedra",
    description: "Firma electrónica con validez legal para operaciones mineras: remitos de despacho, partes de turno, permisos de trabajo y alta de proveedores, sin papel en el yacimiento.",
    h1: "Firma electrónica, biométrica y digital. para Minería",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica/retail",
    solucion: "Firma Biométrica",
    industria: "Retail",
    title: "Firma digital para retail y comercios · Accedra",
    description: "Firma electrónica en retail: altas de cuenta, contratos de crédito y garantías firmados en el local, sin papel y con respaldo probatorio.",
    h1: "Firma electrónica, biométrica y digital. para Retail",
    faqs: 4,
  },
  {
    ruta: "/soluciones/firma-biometrica/seguros",
    solucion: "Firma Biométrica",
    industria: "Aseguradoras",
    title: "Firma digital para aseguradoras y pólizas · Accedra",
    description: "Firma electrónica para compañías de seguros: pólizas, endosos y siniestros firmados a distancia, con validez legal y trazabilidad de punta a punta.",
    h1: "Firma electrónica, biométrica y digital. para Aseguradoras",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria",
    solucion: "Consultoría Microsoft",
    industria: null,
    title: "Consultoría Microsoft: Power BI, 365 y Azure | Accedra",
    description: "Consultoría Microsoft: Power BI, Microsoft 365, Dynamics, SharePoint y Azure. Convertimos tus datos en decisiones y tu operación en procesos ágiles.",
    h1: "Tus datos, convertidos en decisiones.",
    faqs: 0,
  },
  {
    ruta: "/soluciones/consultoria/bancos",
    solucion: "Consultoría Microsoft",
    industria: "Bancos",
    title: "Power BI y Microsoft 365 para bancos · Accedra",
    description: "Consultoría Microsoft para entidades financieras: tableros de Power BI, reporting regulatorio y gestión documental sobre SharePoint y Microsoft 365.",
    h1: "Tus datos, convertidos en decisiones. para Bancos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria/juridicos",
    solucion: "Consultoría Microsoft",
    industria: "Estudios jurídicos",
    title: "Microsoft 365 y gestión documental para estudios · Accedra",
    description: "Consultoría Microsoft para estudios jurídicos: gestión documental de expedientes en SharePoint, control de versiones, Teams y tableros de horas.",
    h1: "Tus datos, convertidos en decisiones. para Estudios jurídicos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria/laboratorios",
    solucion: "Consultoría Microsoft",
    industria: "Laboratorios y salud",
    title: "Power BI y Microsoft 365 para laboratorios · Accedra",
    description: "Consultoría Microsoft para laboratorios y salud: tableros de producción y tiempos de entrega, gestión documental de protocolos y automatización.",
    h1: "Tus datos, convertidos en decisiones. para Laboratorios y salud",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria/logistica",
    solucion: "Consultoría Microsoft",
    industria: "Logística",
    title: "Power BI para logística: OTIF y flota · Accedra",
    description: "Consultoría Microsoft para logística: tableros de cumplimiento de entregas, costo por envío y disponibilidad de flota. Automatización con Power Platform.",
    h1: "Tus datos, convertidos en decisiones. para Logística",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria/mineria",
    solucion: "Consultoría Microsoft",
    industria: "Minería",
    title: "Power BI y gestión documental para minería · Accedra",
    description: "Datos y documentos para minería: tableros de producción en Power BI, gestión documental de permisos ambientales y portales de contratistas sobre Microsoft 365.",
    h1: "Tus datos, convertidos en decisiones. para Minería",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria/retail",
    solucion: "Consultoría Microsoft",
    industria: "Retail",
    title: "Power BI para retail: ventas, stock y margen · Accedra",
    description: "Consultoría Microsoft para retail: tableros de venta por sucursal, rotación de stock y margen por categoría. Microsoft 365 y automatización de circuitos.",
    h1: "Tus datos, convertidos en decisiones. para Retail",
    faqs: 4,
  },
  {
    ruta: "/soluciones/consultoria/seguros",
    solucion: "Consultoría Microsoft",
    industria: "Aseguradoras",
    title: "Power BI y Microsoft 365 para aseguradoras · Accedra",
    description: "Consultoría Microsoft para seguros: tableros de siniestralidad y producción, gestión documental de expedientes y automatización sobre Power Platform.",
    h1: "Tus datos, convertidos en decisiones. para Aseguradoras",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad",
    solucion: "Seguridad IT",
    industria: null,
    title: "Ciberseguridad Empresarial: Zero Trust y Firewalls | Accedra",
    description: "Ciberseguridad de nivel corporativo: firewalls de nueva generación, Zero Trust, Cisco Umbrella y AMP, protección de endpoints y email.",
    h1: "Ciberseguridad de nivel corporativo.",
    faqs: 0,
  },
  {
    ruta: "/soluciones/seguridad/bancos",
    solucion: "Seguridad IT",
    industria: "Bancos",
    title: "Ciberseguridad para bancos y entidades financieras · Accedra",
    description: "Ciberseguridad bancaria: arquitectura Zero Trust, doble factor, protección de endpoints y seguridad de email con Cisco y Palo Alto. Partner certificado.",
    h1: "Ciberseguridad de nivel corporativo. para Bancos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad/juridicos",
    solucion: "Seguridad IT",
    industria: "Estudios jurídicos",
    title: "Ciberseguridad para estudios jurídicos · Accedra",
    description: "Seguridad IT para estudios jurídicos: protección contra ransomware, resguardo de expedientes y control de acceso. Confidencialidad y secreto profesional.",
    h1: "Ciberseguridad de nivel corporativo. para Estudios jurídicos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad/laboratorios",
    solucion: "Seguridad IT",
    industria: "Laboratorios y salud",
    title: "Ciberseguridad para laboratorios y salud · Accedra",
    description: "Seguridad IT en salud: protección de datos sensibles, aislamiento de equipamiento clínico y defensa contra ransomware. Continuidad de la operación.",
    h1: "Ciberseguridad de nivel corporativo. para Laboratorios y salud",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad/logistica",
    solucion: "Seguridad IT",
    industria: "Logística",
    title: "Ciberseguridad para logística y operaciones 24/7 · Accedra",
    description: "Seguridad IT para logística: continuidad de operaciones críticas, protección de sistemas de gestión y defensa contra ransomware sin ventanas de parada.",
    h1: "Ciberseguridad de nivel corporativo. para Logística",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad/mineria",
    solucion: "Seguridad IT",
    industria: "Minería",
    title: "Ciberseguridad para minería: IT y OT en yacimiento · Accedra",
    description: "Seguridad para operaciones mineras: segmentación IT/OT, acceso remoto controlado a sitios y arquitectura Zero Trust sobre redes distribuidas en varias provincias.",
    h1: "Ciberseguridad de nivel corporativo. para Minería",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad/retail",
    solucion: "Seguridad IT",
    industria: "Retail",
    title: "Ciberseguridad para retail y puntos de venta · Accedra",
    description: "Seguridad IT para retail: protección de terminales de pago, cumplimiento PCI DSS y defensa contra ransomware en operaciones multisucursal.",
    h1: "Ciberseguridad de nivel corporativo. para Retail",
    faqs: 4,
  },
  {
    ruta: "/soluciones/seguridad/seguros",
    solucion: "Seguridad IT",
    industria: "Aseguradoras",
    title: "Ciberseguridad para aseguradoras · Accedra",
    description: "Seguridad IT para compañías de seguros: protección contra ransomware, resguardo de datos de asegurados y acceso seguro de productores. Zero Trust.",
    h1: "Ciberseguridad de nivel corporativo. para Aseguradoras",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai",
    solucion: "Software & AI",
    industria: null,
    title: "Software a Medida e Inteligencia Artificial | Accedra",
    description: "Desarrollo de software a medida e integración de IA: aplicaciones, APIs, modelos de machine learning, chatbots y automatización de procesos.",
    h1: "Software a medida e inteligencia artificial.",
    faqs: 0,
  },
  {
    ruta: "/soluciones/software-ai/bancos",
    solucion: "Software & AI",
    industria: "Bancos",
    title: "Software a medida e IA para bancos · Accedra",
    description: "Desarrollo a medida e inteligencia artificial para entidades financieras: automatización de back office, lectura de documentos e integración con el core.",
    h1: "Software a medida e inteligencia artificial. para Bancos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai/juridicos",
    solucion: "Software & AI",
    industria: "Estudios jurídicos",
    title: "Inteligencia artificial y software para estudios jurídicos · Accedra",
    description: "IA aplicada al trabajo legal: búsqueda semántica sobre documentación propia, análisis de contratos y automatización de tareas repetitivas del estudio.",
    h1: "Software a medida e inteligencia artificial. para Estudios jurídicos",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai/laboratorios",
    solucion: "Software & AI",
    industria: "Laboratorios y salud",
    title: "Software a medida e IA para laboratorios y salud · Accedra",
    description: "Desarrollo e inteligencia artificial para laboratorios: integración con sistemas de gestión, procesamiento de informes y automatización de circuitos.",
    h1: "Software a medida e inteligencia artificial. para Laboratorios y salud",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai/logistica",
    solucion: "Software & AI",
    industria: "Logística",
    title: "Software a medida e IA para logística · Accedra",
    description: "Desarrollo e inteligencia artificial para operaciones logísticas: optimización de rutas, predicción de demanda e integración con TMS y ERP.",
    h1: "Software a medida e inteligencia artificial. para Logística",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai/mineria",
    solucion: "Software & AI",
    industria: "Minería",
    title: "Software a medida e IA para operaciones mineras · Accedra",
    description: "Desarrollo a medida para minería: integración entre sistemas de operación y gestión, tableros de disponibilidad de flota y analítica aplicada al mantenimiento.",
    h1: "Software a medida e inteligencia artificial. para Minería",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai/retail",
    solucion: "Software & AI",
    industria: "Retail",
    title: "Software a medida e IA para retail · Accedra",
    description: "Desarrollo e inteligencia artificial para comercios: previsión de demanda, reposición automática, atención al cliente e integración con el ERP.",
    h1: "Software a medida e inteligencia artificial. para Retail",
    faqs: 4,
  },
  {
    ruta: "/soluciones/software-ai/seguros",
    solucion: "Software & AI",
    industria: "Aseguradoras",
    title: "Software a medida e IA para aseguradoras · Accedra",
    description: "Desarrollo e inteligencia artificial para seguros: automatización del circuito de siniestros, lectura de documentación y asistentes para el canal.",
    h1: "Software a medida e inteligencia artificial. para Aseguradoras",
    faqs: 4,
  },
]

/** Google corta el título alrededor de 60 y la descripción alrededor de 160. */
export const LIMITES = { title: 60, description: 160 }

/* ── Árbol de rutas ───────────────────────────────────────────────────────── */

export type Ruta = {
  path: string
  titulo: string
  /** Aclaración que se muestra al lado de la ruta. */
  nota?: string
}

/**
 * Los 6 casos de éxito son en realidad 3 contenidos servidos en dos colecciones
 * distintas. Las seis URLs se autocanonizan y están en `index, follow`, así que
 * cada par compite consigo mismo. Es el único duplicado del sitio.
 */
export const CASOS: Ruta[] = [
  {
    path: "/casos/home/0",
    titulo: "Red sin interrupciones para el líder logístico",
    nota: "mismo contenido que /casos/networking/0",
  },
  {
    path: "/casos/home/1",
    titulo: "Conectividad crítica para minería, en todo el país",
    nota: "mismo contenido que /casos/networking/1",
  },
  {
    path: "/casos/home/2",
    titulo: "Banco Provincia digitaliza la firma en toda su red de sucursales",
    nota: "mismo contenido que /casos/firma-biometrica/0",
  },
  { path: "/casos/networking/0", titulo: "Red sin interrupciones para el líder logístico" },
  { path: "/casos/networking/1", titulo: "Conectividad crítica para minería, en todo el país" },
  {
    path: "/casos/finning",
    titulo: "Conectividad crítica para minería, en todo el país",
    nota: "alias 307 → /casos/networking/1, para pegar en mails de prospección",
  },
  {
    path: "/casos/firma-biometrica/0",
    titulo: "Banco Provincia digitaliza la firma en toda su red de sucursales",
  },
]

/** Las URLs del sitio, en el orden en el que se navegan. */
export const RUTAS: Ruta[] = [
  { path: "/", titulo: "Accedra | Infraestructura IT y Ciberseguridad para Empresas" },
  ...PAGINAS.map((p) => ({ path: p.ruta, titulo: p.title })),
  ...CASOS,
  { path: "/privacidad", titulo: "Política de Privacidad · Accedra" },
]

/** No son páginas: son los archivos que leen Google y los modelos. */
export const UTILIDADES: Ruta[] = [
  { path: "/robots.txt", titulo: "Permisos de rastreo", nota: "declara el sitemap" },
  { path: "/sitemap.xml", titulo: "Las 43 URLs", nota: "generado dinámicamente" },
  { path: "/llms.txt", titulo: "Resumen del sitio para modelos de IA", nota: "9,5 KB" },
]
