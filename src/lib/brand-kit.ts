/**
 * BRAND KIT DE ACCEDRA — fuente única de verdad de la marca.
 *
 * Todo lo que hay acá está sacado de material real: el sitio en producción
 * (proyecto `accedra`: lib/seo/site.ts, los diccionarios i18n, solutionsData,
 * partnersData, homeCases), el perfil de LinkedIn y los SVG oficiales del logo.
 * Lo que NO estaba escrito en ningún lado — personas, tono, claims, boilerplate —
 * está redactado a partir de ese mismo material, nunca inventado desde cero.
 *
 * Las contradicciones que aparecieron entre fuentes no se resolvieron en
 * silencio: están marcadas con `conflicto` para que se decidan una vez y se
 * corrijan en el origen.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Ficha de la empresa
// ─────────────────────────────────────────────────────────────────────────────

export const EMPRESA = {
  razonSocial: "ACCEDRA S.A.",
  nombreComercial: "Accedra",
  nombreLargo: "Accedra IT Solutions",
  cuit: "30-71158886-4",
  fundacion: 2008,
  antiguedad: "17+ años",
  tamano: "11–50 empleados",
  rubro: "Information Technology & Services",
  actividadAfip: "Servicios de consultores en informática y suministro de programas",
  email: "info@accedra.com.ar",
  telefono: "(+54 11) 5365-9887",
  telefonoE164: "+541153659887",
  whatsapp: "54 11 3300-1233",
  whatsappE164: "541133001233",
  dominio: "accedra.com.ar",
  sitio: "https://www.accedra.com.ar",
  horario: "Lunes a viernes, 9:00 a 18:00",
  areaServida: "Argentina",
  domicilio: "Irala 1950, 2° piso · C1276 · CABA",
  direccion: [
    { rol: "Director / Presidente", nombre: "Carlos Omar Bianchi" },
    { rol: "Director suplente · Services Professional", nombre: "Martín Alejandro Arjona" },
  ],
}

/** Los números que se pueden decir en cualquier pieza sin pedir permiso. */
export const CIFRAS = [
  { valor: "17+", label: "Años de experiencia" },
  { valor: "400+", label: "Proyectos entregados" },
  { valor: "26+", label: "Partners tecnológicos" },
  { valor: "100+", label: "Clientes activos" },
]

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Posicionamiento
// ─────────────────────────────────────────────────────────────────────────────

export const POSICIONAMIENTO = {
  frase: "Infraestructura IT para empresas que lideran.",
  unaLinea:
    "Accedra integra y sostiene la infraestructura crítica —redes, ciberseguridad, firma biométrica, Microsoft y software a medida— de las empresas líderes de Argentina.",
  parrafo:
    "Accedra es un integrador tecnológico argentino con 17 años de trayectoria y más de 400 proyectos entregados. Representa e integra a los fabricantes líderes del mundo —Cisco, Microsoft, Palo Alto, Nutanix, Wacom— para resolver cada capa de la infraestructura de una empresa: networking, ciberseguridad, firma digital y biométrica, ecosistema Microsoft y desarrollo de software con IA. Trabaja con bancos, aseguradoras, logística, minería e industria, donde una caída no es un inconveniente sino una pérdida.",
  diferenciales: [
    {
      titulo: "Un único responsable de punta a punta",
      detalle:
        "Relevamiento, hardware, integración, despliegue, capacitación y soporte. No entregamos una caja y nos vamos: el caso de Banco Provincia se integró 100% con equipo propio.",
    },
    {
      titulo: "Firma digital y biométrica",
      detalle:
        "Es el vertical más difícil de comoditizar y donde Accedra tiene el caso más grande del país: 4.400 pantallas en 400 sucursales. Ningún competidor de su tamaño puede mostrar eso.",
    },
    {
      titulo: "Cartera enterprise con estructura de PyME",
      detalle:
        "Andreani, Banco Provincia, Mapfre, Volkswagen, Techint y Accenture confían su infraestructura a un equipo de 11–50 personas. La cercanía es la ventaja, no la limitación.",
    },
  ],
  /** Lo que hay que dejar de decir, y con qué reemplazarlo. */
  contraste: [
    {
      generico: "Soluciones integrales de tecnología",
      afilado: "Un solo responsable de toda tu infraestructura, del cableado a la nube",
    },
    {
      generico: "Aplicaciones de misión crítica",
      afilado: "Las caídas de red pasaron de 5 por semana a menos de 1 por mes",
    },
    {
      generico: "Alto valor agregado y calidad de servicio",
      afilado: "4.400 dispositivos de firma en 400 sucursales, integrados por nuestro equipo",
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Boilerplate y bios
// ─────────────────────────────────────────────────────────────────────────────

export const BOILERPLATE = [
  {
    id: "corto",
    nombre: "Corto · ~40 palabras",
    uso: "Bio de redes, pie de mail, firma de propuesta, ficha de proveedor.",
    texto:
      "Accedra es un integrador tecnológico argentino con más de 17 años de trayectoria. Diseñamos, implementamos y sostenemos la infraestructura crítica de empresas líderes: networking, ciberseguridad, firma biométrica, ecosistema Microsoft y software con IA.",
  },
  {
    id: "medio",
    nombre: "Medio · ~90 palabras",
    uso: "\"Acerca de\" de LinkedIn, about del sitio, presentación comercial.",
    texto:
      "Accedra es un integrador tecnológico argentino con más de 17 años de trayectoria, 400 proyectos entregados y más de 100 clientes activos. Representamos e integramos a los fabricantes líderes del mundo para resolver cada capa de la infraestructura de una empresa: networking de alta disponibilidad, ciberseguridad con arquitectura Zero Trust, firma digital y biométrica con validez legal, ecosistema Microsoft y analítica, y desarrollo de software e inteligencia artificial aplicada. Trabajamos con bancos, aseguradoras, logística, minería e industria — organizaciones donde la continuidad operativa y la seguridad no son negociables. Un único interlocutor, de la primera reunión al soporte.",
  },
  {
    id: "largo",
    nombre: "Largo · ~180 palabras",
    uso: "Nota de prensa, licitación, dossier corporativo, perfil de partner.",
    texto:
      "Accedra S.A. es un integrador tecnológico argentino fundado hace más de 17 años, con sede en la Ciudad Autónoma de Buenos Aires. A lo largo de más de 400 proyectos construyó una práctica que cubre todas las capas de la infraestructura corporativa: networking y cableado estructurado, ciberseguridad perimetral y Zero Trust, firma electrónica, digital y biométrica con validez legal, consultoría sobre el ecosistema Microsoft —Azure, Power BI, Dynamics 365, SharePoint— y desarrollo de software a medida con inteligencia artificial aplicada a procesos.\n\nSu modelo es de punta a punta: relevamiento técnico, provisión de tecnología, integración, despliegue, capacitación y soporte con SLA definido por contrato, con un único interlocutor responsable. Trabaja como partner certificado y distribuidor autorizado de más de 26 fabricantes, entre ellos Cisco, Microsoft, Palo Alto Networks, Nutanix, Wacom, Pure Storage, HPE Aruba y CommScope.\n\nEntre sus clientes se cuentan Andreani, Banco Provincia, Mapfre, Finning, Volkswagen, Banco Macro, Techint y Accenture, en sectores donde la continuidad operativa y el cumplimiento normativo son críticos: banca, seguros, logística, minería, salud y retail.",
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Tono de voz
// ─────────────────────────────────────────────────────────────────────────────

export const TONO = {
  principios: [
    {
      titulo: "Concreto antes que grandilocuente",
      detalle:
        "Un número verificable vale más que tres adjetivos. \"Las caídas pasaron de 5 por semana a menos de 1 por mes\" comunica más que \"máxima disponibilidad\".",
    },
    {
      titulo: "Español argentino, voseo, sin acartonar",
      detalle:
        "Se escribe como se habla en una reunión: \"contanos tu desafío\", \"si te reconocés en alguna\". Nunca \"usted\", nunca español neutro de manual.",
    },
    {
      titulo: "El cliente es el protagonista",
      detalle:
        "El texto arranca por el problema de quien lee, no por nuestra trayectoria. Los dolores van en primera persona del prospecto: \"tu red quedó chica frente al crecimiento\".",
    },
    {
      titulo: "Técnico sin ser críptico",
      detalle:
        "Se nombran las tecnologías reales —Catalyst 9200, SD-WAN, Umbrella— porque a un gerente de IT le dan confianza, pero cada bloque cierra en una consecuencia de negocio que entiende cualquiera.",
    },
    {
      titulo: "Sin humo",
      detalle:
        "Nada de \"revolucionario\", \"disruptivo\", \"soluciones 360\", \"partner estratégico de tu transformación\". Si la frase se puede copiar y pegar en la web de cualquier competidor, no sirve.",
    },
  ],
  decimos: [
    "Contanos tu desafío",
    "Un único interlocutor de punta a punta",
    "SLA definido por contrato",
    "Partner certificado y distribuidor autorizado",
    "Te respondemos en menos de 24 horas hábiles",
    "No entregamos una caja y nos vamos",
    "Validez legal y trazabilidad total",
  ],
  noDecimos: [
    "Soluciones integrales 360°",
    "Somos líderes del mercado",
    "Revolucionamos / disrumpimos tu negocio",
    "Sinergia, ecosistema holístico, mindset digital",
    "100% seguro · a prueba de hackers",
    "El mejor servicio del país",
    "Estimado cliente, ¿usted necesita…?",
  ],
  ejemplos: [
    {
      mal: "Brindamos soluciones integrales de networking de alta calidad con el mayor valor agregado del mercado.",
      bien: "Diseñamos, instalamos y mantenemos la red que tu operación necesita — del cableado a la nube, sin puntos ciegos.",
      porque: "El primero habla de nosotros con adjetivos. El segundo habla de la red del cliente con verbos.",
    },
    {
      mal: "Somos partners estratégicos en tu proceso de transformación digital.",
      bien: "El papel es opcional. La validez legal, no.",
      porque: "Frase corta, con tensión, y que solo puede decir alguien que hace firma digital.",
    },
    {
      mal: "Contamos con amplia experiencia en el sector logístico.",
      bien: "Andreani: 122 sucursales, +1.260 vehículos, las caídas de red pasaron de 5 por semana a menos de 1 por mes.",
      porque: "La experiencia no se declara, se muestra con el nombre y el número.",
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Claims y compliance
// ─────────────────────────────────────────────────────────────────────────────

export const CLAIMS = {
  libres: [
    "17+ años de trayectoria",
    "+400 proyectos entregados",
    "26+ partners tecnológicos",
    "+100 clientes activos",
    "Partner certificado y distribuidor autorizado de cada fabricante",
    "Respuesta en menos de 24 horas hábiles",
    "SLA definido por contrato",
    "Soporte local, on-site y remoto",
  ],
  condicionados: [
    {
      claim: "Nombrar un cliente (Andreani, Banco Provincia, Mapfre…)",
      condicion:
        "Solo los que ya figuran públicamente en accedra.com.ar. Cualquier cliente nuevo necesita autorización escrita antes de aparecer en una pieza.",
    },
    {
      claim: "Publicar métricas de un caso",
      condicion:
        "Solo las cifras ya publicadas en la web. Un número nuevo tiene que estar respaldado por el informe del proyecto y validado con el cliente.",
    },
    {
      claim: "Usar la palabra \"líder\"",
      condicion:
        "Se puede aplicar al cliente (\"el líder logístico del país\") o al fabricante (\"líder mundial en redes\"). Nunca a Accedra.",
    },
    {
      claim: "Mostrar el logo de un fabricante",
      condicion:
        "Solo con la relación comercial vigente y respetando el manual de marca del fabricante. El logo de un partner no es un sello de certificación propia.",
    },
  ],
  prohibidos: [
    {
      claim: "\"100% seguro\", \"inhackeable\", \"riesgo cero\"",
      porque: "En ciberseguridad es indefendible y le da munición a cualquier auditoría o incidente.",
    },
    {
      claim: "\"Somos los líderes / los mejores del mercado\"",
      porque: "No es demostrable, y contra integradores más grandes es una comparación que se pierde.",
    },
    {
      claim: "Garantizar plazos o precios antes de la preventa",
      porque: "El hardware se importa y se dolariza: un plazo prometido sin cotización es un problema contractual.",
    },
    {
      claim: "Mostrar el trabajo de un cliente sin autorización",
      porque: "En banca, seguros y salud la confidencialidad es parte del contrato.",
    },
    {
      claim: "Fotos de sala de servidores o de personal que no sean propias",
      porque: "Si la foto de stock aparece en la web de un competidor, la prueba se vuelve en contra.",
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Identidad visual
// ─────────────────────────────────────────────────────────────────────────────

export type LogoAsset = {
  id: string
  nombre: string
  archivo: string
  uso: string
  fondo: "claro" | "oscuro"
  ratio: number
}

export const LOGOS: LogoAsset[] = [
  {
    id: "logo-navy",
    nombre: "Logotipo principal",
    archivo: "/brand/accedra-logo-navy.svg",
    uso: "El uso por defecto. Sobre fondo blanco o gris muy claro.",
    fondo: "claro",
    ratio: 1073 / 160,
  },
  {
    id: "logo-blanco",
    nombre: "Logotipo en blanco",
    archivo: "/brand/accedra-logo-blanco.svg",
    uso: "Sobre navy, sobre foto oscura o sobre el azul de marca.",
    fondo: "oscuro",
    ratio: 1073 / 160,
  },
  {
    id: "logo-mono-navy",
    nombre: "Monocromo navy",
    archivo: "/brand/accedra-logo-mono-navy.svg",
    uso: "Cuando el azul del acento no se puede reproducir: impresión a una tinta, grabado, fax de licitación.",
    fondo: "claro",
    ratio: 1073 / 160,
  },
  {
    id: "logo-mono-blanco",
    nombre: "Monocromo blanco",
    archivo: "/brand/accedra-logo-mono-blanco.svg",
    uso: "Sobre fondos de color saturado o fotos con poco contraste, donde el acento azul se pierde.",
    fondo: "oscuro",
    ratio: 1073 / 160,
  },
  {
    id: "isotipo-navy",
    nombre: "Isotipo navy",
    archivo: "/brand/accedra-isotipo-navy.svg",
    uso: "Favicon, avatar, sello en una pieza, marca de agua. Nunca reemplaza al logotipo en un documento formal.",
    fondo: "claro",
    ratio: 1,
  },
  {
    id: "isotipo-blanco",
    nombre: "Isotipo blanco",
    archivo: "/brand/accedra-isotipo-blanco.svg",
    uso: "Avatar sobre navy, sello sobre foto oscura, watermark de video.",
    fondo: "oscuro",
    ratio: 1,
  },
]

export const REGLAS_LOGO = {
  si: [
    "Zona de seguridad: dejar libre, como mínimo, el alto de la \"A\" del logotipo en los cuatro lados.",
    "Tamaño mínimo: 120 px de ancho en pantalla y 25 mm en impresión para el logotipo; 24 px para el isotipo.",
    "Elegir la variante por contraste del fondo, no por gusto: navy sobre claro, blanco sobre oscuro.",
    "Sobre foto, apoyarlo en una zona de tono uniforme o usar la variante monocroma.",
  ],
  no: [
    "Deformarlo, rotarlo o estirarlo — siempre escala proporcional.",
    "Recolorearlo fuera de las variantes oficiales.",
    "Ponerle sombra, brillo, contorno o degradado.",
    "Encerrarlo en una caja o pastilla que no esté en este kit.",
    "Reescribir \"Accedra\" con otra tipografía y llamarlo logo.",
    "Usar el JPG viejo del sitio anterior: existe el vector.",
  ],
}

export type Color = {
  nombre: string
  hex: string
  textoSobre: string
  uso: string
  rol: "primario" | "neutro" | "solucion"
  nota?: string
}

export const PALETA: Color[] = [
  {
    nombre: "Azul Accedra",
    hex: "#2B56D4",
    textoSobre: "#FFFFFF",
    uso: "El acento de marca. Botones, links, highlights, el triángulo del isotipo. Uno solo por pieza.",
    rol: "primario",
    nota: "Es el azul del logo. Cuando haya duda entre azules, gana este.",
  },
  {
    nombre: "Navy Accedra",
    hex: "#0D1F3A",
    textoSobre: "#FFFFFF",
    uso: "El color del logotipo sobre fondo claro y de los títulos en piezas corporativas.",
    rol: "primario",
  },
  {
    nombre: "Navy fondo",
    hex: "#0A1424",
    textoSobre: "#E5EAF2",
    uso: "El canvas oscuro del sitio y de las piezas dark. Es el fondo, no el texto.",
    rol: "neutro",
  },
  {
    nombre: "Gris texto",
    hex: "#E5EAF2",
    textoSobre: "#0A1424",
    uso: "Cuerpo de texto sobre navy. El blanco puro sobre oscuro vibra y cansa.",
    rol: "neutro",
  },
  {
    nombre: "Gris muted",
    hex: "#7A8699",
    textoSobre: "#FFFFFF",
    uso: "Textos secundarios, epígrafes, labels. Sirve sobre claro y sobre oscuro.",
    rol: "neutro",
  },
  {
    nombre: "Gris superficie",
    hex: "#F4F6F9",
    textoSobre: "#0D1F3A",
    uso: "Fondo claro de piezas y secciones. Nunca blanco puro de punta a punta.",
    rol: "neutro",
  },
  {
    nombre: "Blanco",
    hex: "#FFFFFF",
    textoSobre: "#0D1F3A",
    uso: "Superficies que flotan sobre el gris, y el logotipo sobre navy.",
    rol: "neutro",
  },
]

/** Cada solución tiene su color de identidad en las landings. No es decoración. */
export const COLORES_SOLUCION = [
  { nombre: "Networking", hex: "#3B82F6", nota: "Azul — el ancla, el más cercano a la marca." },
  { nombre: "Firma Biométrica", hex: "#7C6CF6", nota: "Índigo — el diferencial, por eso se despega." },
  { nombre: "Consultoría Microsoft", hex: "#06B6D4", nota: "Cian." },
  { nombre: "Seguridad IT", hex: "#10B981", nota: "Esmeralda." },
  { nombre: "Software & AI", hex: "#B45CF2", nota: "Púrpura." },
]

export const TIPOGRAFIA = {
  display: {
    nombre: "Space Grotesk",
    uso: "Títulos, cifras del hero, headlines de sección.",
    porque: "Geométrica y técnica: da la señal de tecnología sin caer en la fuente futurista de ciencia ficción.",
    pesos: "500 · 700",
  },
  texto: {
    nombre: "Inter",
    uso: "Cuerpo, subtítulos, labels, interfaz.",
    porque: "Diseñada para pantalla, legible en 12 px, con numerales tabulares para las métricas.",
    pesos: "400 · 500 · 600 · 700",
  },
  reglas: [
    "Títulos con tracking apretado (-0.02em): en pesos altos el default los desarma.",
    "Interlineado del cuerpo entre 1.55 y 1.65. Más apretado se lee denso; más suelto, desarmado.",
    "Numerales tabulares en cualquier métrica o tabla, para que las columnas no bailen.",
    "Los eyebrow van en versalita de 10–11 px con tracking amplio (0.11em). Sin ese tracking se leen como un grito.",
    "Como máximo dos pesos por pieza. La jerarquía la hace el color de la tinta, no sumar pesos.",
  ],
  escala: [
    { px: "11px", label: "XS", uso: "Labels, chips, eyebrows" },
    { px: "13px", label: "SM", uso: "Textos secundarios, pies" },
    { px: "15px", label: "BASE", uso: "Cuerpo de texto" },
    { px: "20px", label: "LG", uso: "Subtítulos" },
    { px: "26px", label: "XL", uso: "Títulos de sección" },
    { px: "36px", label: "2XL", uso: "Titulares" },
    { px: "52px", label: "3XL", uso: "Hero" },
  ],
}

export const FOTOGRAFIA = {
  si: [
    "Trabajo real: racks, tendido de cableado, equipo en obra, capacitaciones. Lo propio siempre le gana al stock.",
    "Personas trabajando de verdad, no mirando a cámara con los brazos cruzados.",
    "Luz natural o industrial, encuadre amplio, mucho aire alrededor del sujeto.",
    "Ambientes reales de cliente cuando hay autorización: depósito, sucursal, yacimiento, sala técnica.",
    "Tratamiento sobrio: contraste medio, sin filtros de color, sin viñeteado.",
  ],
  no: [
    "El hacker con capucha frente a código verde.",
    "El cerebro digital azul, los circuitos brillantes y el candado holográfico flotando.",
    "Manos tocando pantallas transparentes con íconos en el aire.",
    "Reuniones de stock con gente riéndose de un gráfico.",
    "Cualquier imagen generada por IA con dedos, texto o logos visibles.",
    "Mezclar más de una temperatura de color en la misma pieza.",
  ],
  iconos: {
    set: "Lucide",
    reglas: [
      "Trazo de 1.7 a 1.9. Nunca íconos rellenos.",
      "Tamaño entre 16 y 24 px; en emblemas, dentro de un cuadrado de 40 px con radio 11.",
      "Un ícono por concepto — no acumular tres para decorar.",
      "Nunca emoji en una pieza corporativa ni en una propuesta.",
    ],
  },
}

export const COMPOSICION = {
  estilo: "70% corporate tech premium · 20% editorial profesional · 10% enterprise B2B",
  referencias: "Cisco · Microsoft · IBM · Linear · Vercel",
  reglas: [
    "Mucho espacio vacío: es lo que transmite orden y solidez.",
    "Un solo elemento protagonista, centrado o levemente desplazado.",
    "Una idea por pieza. Si hay dos, son dos piezas.",
    "El azul de marca como único acento — jamás dos colores vivos compitiendo.",
    "Sombras suaves y líneas limpias. Nada de degradados de fondo ni blur decorativo.",
    "El logo va prolijo y discreto, nunca protagonista.",
  ],
  promptImagen:
    "Premium corporate tech aesthetic, clean light background #F4F6F9, soft even studio light, ultra-clean composition, large negative space, modern sans-serif typography, subtle shadows, matte finish, enterprise B2B feel, single blue accent #2B56D4, photorealistic, much air around the subject, professional and trustworthy. No text overlays, no logos, no holographic UI, no glowing circuits.",
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Mercado
// ─────────────────────────────────────────────────────────────────────────────

export type Persona = {
  id: string
  alias: string
  rol: string
  contexto: string
  duele: string[]
  frena: string[]
  convence: string[]
  donde: string
  mensaje: string
}

export const PERSONAS: Persona[] = [
  {
    id: "it",
    alias: "El que la sufre",
    rol: "Gerente de IT · Infraestructura · Sistemas",
    contexto:
      "Empresa de 200 a 2.000 empleados con sucursales o plantas. Banca, seguros, logística, minería o industria. Tiene equipo propio pero no le alcanza para proyectos grandes, y responde ante la dirección cada vez que algo se cae.",
    duele: [
      "La red quedó chica frente al crecimiento de la operación.",
      "Hay cortes y lentitud que frenan la productividad y nadie los resuelve de fondo.",
      "Sumó sucursales o usuarios remotos sin una arquitectura que los unifique.",
      "Depende de varios proveedores y ninguno se hace responsable de punta a punta.",
    ],
    frena: [
      "\"Ya tengo un proveedor, cambiar es un quilombo.\"",
      "\"¿Después de la venta me van a dejar tirado?\"",
      "\"¿Tienen certificación real de Cisco y Palo Alto o solo revenden?\"",
      "\"Son 40 personas: ¿me pueden sostener una operación de este tamaño?\"",
    ],
    convence: [
      "Un único interlocutor responsable de punta a punta.",
      "SLA definido por contrato y soporte on-site.",
      "Casos de su tamaño y de su industria, con números: Andreani, Finning.",
      "Que se nombre la tecnología concreta — Catalyst 9200, DNA Center, SD-WAN — y no \"soluciones de red\".",
    ],
    donde: "LinkedIn, recomendación del fabricante, boca a boca entre pares de IT.",
    mensaje: "Una sola red. Un solo responsable.",
  },
  {
    id: "negocio",
    alias: "El que firma",
    rol: "Dirección General · Gerencia · CFO",
    contexto:
      "Aprueba la inversión. No le interesa la marca del switch: le interesa el riesgo, el costo y que la operación no se frene. Compara Accedra contra integradores más grandes y contra no hacer nada.",
    duele: [
      "Una caída de sistemas se traduce directo en entregas, ventas o pólizas perdidas.",
      "El circuito de papel cuesta plata todos los meses y nadie lo mide.",
      "Una auditoría o un incidente de seguridad puede costar más que todo el proyecto.",
      "Cada proveedor le echa la culpa a otro y el problema sigue.",
    ],
    frena: [
      "\"¿Cuánto cuesta y en cuánto se paga?\"",
      "\"¿Por qué ellos y no un integrador grande?\"",
      "\"¿Esto me deja atado a un proveedor para siempre?\"",
    ],
    convence: [
      "Números de negocio, no técnicos: caídas por mes, sucursales cubiertas, papel eliminado.",
      "Clientes reconocibles de su liga: Banco Provincia, Mapfre, Volkswagen, Techint.",
      "El respaldo de fabricantes globales detrás de una PyME que atiende el teléfono.",
      "Diagnóstico gratuito y sin compromiso como primer paso de bajo riesgo.",
    ],
    donde: "LinkedIn, referencias de pares directivos, reuniones presenciales.",
    mensaje: "La infraestructura que tu empresa merece, con un responsable que atiende.",
  },
  {
    id: "proceso",
    alias: "El dueño del papel",
    rol: "Operaciones · Legales · RR.HH. · Transformación digital",
    contexto:
      "No es de IT, pero es quien empuja la firma biométrica. Vive el circuito de imprimir, firmar, escanear y archivar. Es la puerta de entrada al vertical de mayor margen de Accedra.",
    duele: [
      "Cada trámite pasa por impresión, firma manuscrita, escaneo y archivo físico.",
      "Las demoras en sucursal se traducen en clientes molestos.",
      "El papel se pierde, se traspapela y no hay trazabilidad de quién firmó qué.",
      "Cumplir la normativa con documentación en papel es caro y frágil.",
    ],
    frena: [
      "\"¿Una firma en pantalla tiene la misma validez legal que la de puño y letra?\"",
      "\"¿Mis clientes mayores lo van a poder usar?\"",
      "\"¿Se integra con mi sistema core o hay que rehacer todo?\"",
      "\"¿Quién capacita a las 400 sucursales?\"",
    ],
    convence: [
      "El caso Banco Provincia completo: 400 sucursales, 4.400 pantallas, 620 formularios.",
      "Explicar el valor probatorio: presión, velocidad, trazo y tiempos ligados al documento.",
      "Que el despliegue incluya relevamiento, integración, capacitación y soporte.",
      "El ahorro concreto en impresión, traslado y archivo.",
    ],
    donde: "LinkedIn, eventos del sector, contenido educativo sobre validez legal.",
    mensaje: "El papel es opcional. La validez legal, no.",
  },
]

export const SERVICIOS = [
  {
    slug: "networking",
    nombre: "Networking",
    desc: "Infraestructura de red robusta y de alta disponibilidad, del cableado a la nube.",
    claim: "Una sola red. Un solo responsable.",
    items: ["Cableado estructurado", "Switching & Routing", "Wireless corporativo", "Telefonía IP · VoIP", "Seguridad de red", "Contingencia"],
    tech: ["Cisco", "Meraki", "HPE Aruba", "Juniper", "Ubiquiti", "APC", "CommScope"],
  },
  {
    slug: "firma-biometrica",
    nombre: "Firma Biométrica",
    desc: "Firma electrónica, biométrica y digital con validez legal y trazabilidad total.",
    claim: "El papel es opcional. La validez legal, no.",
    items: ["Firma biométrica", "eSignAnywhere", "Factoring digital", "Firma mobile", "Multibiometría"],
    tech: ["Wacom", "Namirial", "Gemalto"],
  },
  {
    slug: "consultoria",
    nombre: "Consultoría Microsoft",
    desc: "Ecosistema Microsoft y analítica que convierten tus datos en decisiones.",
    claim: "El conocimiento, al alcance de toda la organización.",
    items: ["Power BI", "Dynamics 365", "SharePoint", "Office 365", "Gestión documental", "Colaboración"],
    tech: ["Microsoft", "Azure", "Power Automate"],
  },
  {
    slug: "seguridad",
    nombre: "Seguridad IT",
    desc: "Ciberseguridad de nivel corporativo en cada capa, con arquitectura Zero Trust.",
    claim: "Detectar y detener amenazas, efectivamente.",
    items: ["Firewall de nueva generación", "Zero Trust", "Cloud Security", "Gestión de vulnerabilidades", "Protección de endpoint"],
    tech: ["Palo Alto Networks", "Cisco Umbrella", "AMP", "Check Point", "Vicarius"],
  },
  {
    slug: "software-ai",
    nombre: "Software & AI",
    desc: "Software a medida e inteligencia artificial aplicada a tus procesos.",
    claim: "Del proceso manual al producto inteligente.",
    items: ["Desarrollo a medida", "Integraciones & APIs", "Modelos de IA / ML", "Chatbots & copilotos", "Data & Analytics", "Automatización"],
    tech: ["Microsoft Copilot", "Python", "React", "n8n", "Docker"],
  },
]

export const INDUSTRIAS = [
  { nombre: "Bancos", contexto: "Disponibilidad, seguridad y cumplimiento normativo no negociables." },
  { nombre: "Aseguradoras", contexto: "Cada póliza, siniestro y trámite exige trazabilidad y respaldo probatorio." },
  { nombre: "Estudios jurídicos", contexto: "Validez legal, confidencialidad y resguardo documental." },
  { nombre: "Laboratorios y salud", contexto: "Continuidad, datos sensibles protegidos y trazabilidad crítica." },
  { nombre: "Logística", contexto: "Operación 24/7 donde un minuto de caída son entregas perdidas." },
  { nombre: "Retail", contexto: "Múltiples sucursales, picos de demanda y datos de clientes en una misma red." },
]

export const CLIENTES = [
  "Andreani",
  "Banco Provincia",
  "Mapfre",
  "Finning",
  "Volkswagen",
  "Banco Macro",
  "CNP Seguros",
  "Techint",
  "Accenture",
  "Hipódromo Argentino",
  "Hausler",
]

export const PARTNERS = [
  { nombre: "Cisco", que: "Redes empresariales: switching, routing y alta disponibilidad." },
  { nombre: "Microsoft", que: "Azure, identidad y productividad corporativa." },
  { nombre: "Palo Alto Networks", que: "Firewalls de nueva generación y Zero Trust." },
  { nombre: "Nutanix", que: "Infraestructura hiperconvergente y nube híbrida." },
  { nombre: "Wacom", que: "Tabletas de firma y digitalización biométrica." },
  { nombre: "Pure Storage", que: "Almacenamiento all-flash de alto rendimiento." },
  { nombre: "HPE Aruba", que: "Wi-Fi empresarial y acceso seguro en el borde." },
  { nombre: "CommScope", que: "Cableado estructurado de misión crítica." },
  { nombre: "APC by Schneider", que: "UPS y protección eléctrica de infraestructura." },
  { nombre: "Check Point", que: "Protección perimetral y prevención de amenazas." },
  { nombre: "Namirial", que: "Firma electrónica con validez legal." },
  { nombre: "Vicarius", que: "Remediación automática de vulnerabilidades." },
  { nombre: "Dahua", que: "Videovigilancia con IA." },
  { nombre: "Hikvision", que: "Cámaras IP y videovigilancia inteligente." },
  { nombre: "TP-Link", que: "Networking y Wi-Fi para sucursales." },
]

export type Caso = {
  cliente: string
  industria: string
  titulo: string
  desafio: string
  solucion: string
  metricas: { valor: string; label: string }[]
}

export const CASOS: Caso[] = [
  {
    cliente: "Andreani",
    industria: "Logística",
    titulo: "Red sin interrupciones para el líder logístico",
    desafio:
      "Crecimiento exponencial —+550 puntos de venta, 122 sucursales, más usuarios móviles y más nube— sobre una red que ya no daba abasto y con mayor exposición a amenazas.",
    solucion:
      "Rediseño integral con Cisco en cuatro frentes: wireless gestionado (WLC + DNA Center), switching y routing (Catalyst 9500/9200/4500/3850/2960 y ASR 1000), seguridad (Umbrella, AMP, ISE) y licenciamiento flexible (Cisco ONE, SMARTnet).",
    metricas: [
      { valor: "5→<1", label: "caídas de red por mes" },
      { valor: "+1.260", label: "vehículos conectados" },
      { valor: "10", label: "plantas de operación" },
    ],
  },
  {
    cliente: "Banco Provincia",
    industria: "Banca",
    titulo: "La firma digitalizada en toda la red de sucursales",
    desafio:
      "Trámites de sucursal sobre papel: impresión, firma manuscrita, escaneo y archivo físico, con demoras, costos crecientes y riesgo operativo.",
    solucion:
      "Firma biométrica digital llave en mano: relevamiento, hardware, integración nativa con el core, despliegue, capacitación y soporte. Integración 100% realizada por Accedra.",
    metricas: [
      { valor: "400", label: "sucursales" },
      { valor: "+4.400", label: "dispositivos de firma" },
      { valor: "+620", label: "formularios digitalizados" },
    ],
  },
  {
    cliente: "Finning",
    industria: "Minería",
    titulo: "Conectividad crítica para minería, en todo el país",
    desafio:
      "Yacimientos y sucursales en zonas remotas de varias provincias, donde la conectividad tradicional no llega.",
    solucion:
      "Relevamiento sitio por sitio con mapas de calor, racks modernizados con Catalyst 9200L PoE, UPS y PDUs, cableado cat 6, Wi-Fi indoor y outdoor, y conectividad satelital Starlink integrada por SD-WAN.",
    metricas: [
      { valor: "+4", label: "provincias desplegadas" },
      { valor: "100%", label: "sitios conectados" },
      { valor: "24/7", label: "operación en mina" },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Canales
// ─────────────────────────────────────────────────────────────────────────────

export const CANALES = [
  {
    nombre: "Sitio web",
    handle: "accedra.com.ar",
    url: "https://www.accedra.com.ar",
    estado: "activo" as const,
    rol: "El destino de todo. Las 30 landings por solución e industria son el motor de captación orgánica.",
  },
  {
    nombre: "LinkedIn",
    handle: "accedra-s.a.",
    url: "https://www.linkedin.com/company/accedra-s.a.",
    estado: "prioritario" as const,
    rol: "El canal de ventas natural de un negocio B2B. 526 seguidores es muy poco para la calidad de la cartera: es la mayor oportunidad abierta.",
  },
  {
    nombre: "Instagram",
    handle: "@accedra_sa",
    url: "https://www.instagram.com/accedra_sa/",
    estado: "secundario" as const,
    rol: "Cultura, equipo y obra. No es canal de venta: es prueba de que atrás hay gente.",
  },
  {
    nombre: "WhatsApp",
    handle: EMPRESA.whatsapp,
    url: `https://wa.me/${EMPRESA.whatsappE164}`,
    estado: "activo" as const,
    rol: "El CTA principal del sitio. Respuesta inmediata en horario laboral.",
  },
  {
    nombre: "Google Business Profile",
    handle: "Pendiente de verificación",
    url: "",
    estado: "pendiente" as const,
    rol: "Sin la ficha verificada no hay paquete de mapas. El domicilio y el horario tienen que coincidir con el JSON-LD del sitio.",
  },
  {
    nombre: "Facebook",
    handle: "/Accedra",
    url: "https://www.facebook.com/Accedra/",
    estado: "dormido" as const,
    rol: "Poco activo. Mantener el perfil coherente aunque no se publique: un perfil abandonado con datos viejos resta.",
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Prompts por disciplina
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un prompt por rol, no por tarea. Al que diseña le sirve tener las reglas de
 * logo, paleta y fotografía en la cabeza y después pedir lo que necesite; darle
 * en cambio una consigna cerrada ("hacé un banner de 1200×628") lo deja atado a
 * esa pieza y a ninguna otra.
 *
 * El texto de cada bloque se DERIVA de los datos de arriba: si cambia un claim,
 * un color o una persona, los prompts cambian solos. Escribirlos a mano
 * garantizaba que en dos meses dijeran algo distinto al resto del kit.
 */

/**
 * Formato telegráfico a propósito. Un prompt no es un documento: cada palabra
 * viaja en cada llamada y compite por atención con la consigna del usuario.
 * Se guarda el hecho y se tira la justificación — el modelo no necesita que le
 * expliquen por qué una regla existe para poder cumplirla. La versión larga y
 * argumentada de todo esto sigue viviendo en las secciones de la página, que es
 * donde sí la lee una persona.
 */

const bul = (items: string[]) => items.map((i) => `· ${i}`).join("\n")

/** Primera oración de un texto: alcanza para el hecho, sobra la explicación. */
const s1 = (t: string) => t.split(/(?<=\.)\s+/)[0]

export type BloqueContexto = { id: string; nombre: string; texto: string }

const BLOQUE: Record<string, () => string> = {
  identidad: () => `# ACCEDRA
Integrador tecnológico argentino. B2B exclusivo: empresas medianas y grandes, nunca consumidor final. Buenos Aires · ${EMPRESA.dominio}
${CIFRAS.map((c) => `${c.valor} ${c.label.toLowerCase()}`).join(" · ")}
Servicios: ${SERVICIOS.map((s) => s.nombre).join(" · ")}`,

  posicionamiento: () => `# POSICIONAMIENTO
"${POSICIONAMIENTO.frase}"
${POSICIONAMIENTO.unaLinea}
Diferenciales, en orden:
${POSICIONAMIENTO.diferenciales.map((d, i) => `${i + 1}. ${d.titulo}. ${s1(d.detalle)}`).join("\n")}
Prohibido el genérico del rubro. Reemplazar por el hecho:
${POSICIONAMIENTO.contraste.map((c) => `· "${c.generico}" → "${c.afilado}"`).join("\n")}`,

  servicios: () => `# SERVICIOS
Nombres canónicos. No inventar otros ni mezclar categorías.
${SERVICIOS.map(
  (s) => `· ${s.nombre} (/soluciones/${s.slug}) — ${s.desc} Claim: "${s.claim}"
  Incluye: ${s.items.join(", ")}. Tecnología: ${s.tech.join(", ")}.`
).join("\n")}
Industrias: ${INDUSTRIAS.map((i) => i.nombre).join(" · ")}
${INDUSTRIAS.map((i) => `· ${i.nombre}: ${i.contexto}`).join("\n")}`,

  audiencia: () => `# A QUIÉN LE HABLA
Tres decisores distintos. El que sufre el problema no firma; el que firma no lo sufre. Identificar cuál es antes de escribir.
${PERSONAS.map(
  (p) => `
## ${p.rol} — "${p.alias}"
${s1(p.contexto)}
Duele: ${p.duele.map(s1).join(" ")}
Frena: ${p.frena.join(" ")}
Convence: ${p.convence.map(s1).join(" ")}
Mensaje: "${p.mensaje}" · Canal: ${s1(p.donde)}`
).join("\n")}`,

  tono: () => `# TONO
${TONO.principios.map((p) => `· ${p.titulo}`).join("\n")}
Español argentino con voseo. Frases cortas. Sin signos de exclamación. Sin emojis.
Usar: ${TONO.decimos.map((d) => `"${d}"`).join(" · ")}
NUNCA: ${TONO.noDecimos.map((d) => `"${d}"`).join(" · ")}
Correcciones de referencia:
${TONO.ejemplos.map((e) => `· MAL "${e.mal}" → BIEN "${e.bien}"`).join("\n")}`,

  prueba: () => `# PRUEBA SOCIAL
Solo esto es público y citable. Fuera de esta lista no existe: no inventar clientes, cifras ni casos.
Clientes: ${CLIENTES.join(", ")}
Partners: ${PARTNERS.map((p) => p.nombre).join(", ")}
Casos:
${CASOS.map(
  (c) =>
    `· ${c.cliente} (${c.industria}) — ${c.titulo}. ${s1(c.solucion)} Métricas: ${c.metricas
      .map((m) => `${m.valor} ${m.label}`)
      .join(" · ")}`
).join("\n")}`,

  reglas: () => `# LÍMITES
Libre: ${CLAIMS.libres.join(" · ")}
Con autorización previa:
${CLAIMS.condicionados.map((c) => `· ${c.claim} — ${s1(c.condicion)}`).join("\n")}
Prohibido: ${CLAIMS.prohibidos.map((c) => c.claim).join(" · ")}
CTA por defecto: "Hablar con un experto" o "Solicitar un diagnóstico". Promesa de respuesta: menos de 24 h hábiles.`,

  visual: () => `# SISTEMA VISUAL
## Logo
${LOGOS.map((l) => `· ${l.nombre} (fondo ${l.fondo}) — ${l.uso}`).join("\n")}
Sí: ${REGLAS_LOGO.si.join(" ")}
Nunca: ${REGLAS_LOGO.no.map((r) => r.replace(/\.$/, "")).join(" · ")}
## Paleta
Un solo color vivo por pieza.
${PALETA.map((c) => `· ${c.nombre} ${c.hex} — ${c.uso}`).join("\n")}
Acento por solución (dentro de esa solución, nunca como color de marca): ${COLORES_SOLUCION.map(
    (c) => `${c.nombre} ${c.hex}`
  ).join(" · ")}
## Tipografía
Display ${TIPOGRAFIA.display.nombre} (${TIPOGRAFIA.display.pesos}) — ${s1(TIPOGRAFIA.display.uso)}
Texto ${TIPOGRAFIA.texto.nombre} (${TIPOGRAFIA.texto.pesos}) — ${s1(TIPOGRAFIA.texto.uso)}
${TIPOGRAFIA.reglas.join(" ")}
Escala: ${TIPOGRAFIA.escala.map((e) => `${e.px} ${e.uso.split(",")[0].toLowerCase()}`).join(" · ")}
## Fotografía
Sí: ${FOTOGRAFIA.si.join(" ")}
Nunca: ${FOTOGRAFIA.no.map((r) => r.replace(/\.$/, "")).join(" · ")}
Iconos ${FOTOGRAFIA.iconos.set}: ${FOTOGRAFIA.iconos.reglas.map(s1).join(" ")}
## Composición
${bul(COMPOSICION.reglas)}
Mezcla: ${COMPOSICION.estilo}. Referencias: ${COMPOSICION.referencias}.
Base para prompts de imagen (inglés): ${COMPOSICION.promptImagen}`,

  boilerplate: () => `# BOILERPLATE OFICIAL
Textos aprobados. No contradecirlos ni reescribirlos con otros datos.
${BOILERPLATE.map((b) => `## ${b.nombre} — ${b.uso}\n${b.texto}`).join("\n")}`,

  ficha: () => `# DATOS
${EMPRESA.razonSocial} · CUIT ${EMPRESA.cuit} · fundada ${EMPRESA.fundacion} (${EMPRESA.antiguedad}) · ${EMPRESA.tamano}
${EMPRESA.domicilio}
${EMPRESA.telefono} · WhatsApp ${EMPRESA.whatsapp} · ${EMPRESA.email} · ${EMPRESA.sitio}
${EMPRESA.horario} · área servida: ${EMPRESA.areaServida}
Conducción: ${EMPRESA.direccion.map((d) => `${d.nombre} (${d.rol})`).join(" · ")}
Idénticos en web, LinkedIn y Google Business: toda variación resta SEO local.`,

  canales: () => `# CANALES
${CANALES.map((c) => `· ${c.nombre} (${c.estado})${c.handle ? ` ${c.handle}` : ""} — ${s1(c.rol)}`).join("\n")}`,
}

const NOMBRE_BLOQUE: Record<string, string> = {
  identidad: "Identidad",
  posicionamiento: "Posicionamiento",
  servicios: "Catálogo de servicios",
  audiencia: "Buyer personas",
  tono: "Tono de voz",
  prueba: "Prueba social",
  reglas: "Claims y límites",
  visual: "Sistema visual",
  boilerplate: "Boilerplate",
  ficha: "Datos de la empresa",
  canales: "Canales",
}

export const BLOQUES_CONTEXTO: BloqueContexto[] = Object.keys(BLOQUE).map((id) => ({
  id,
  nombre: NOMBRE_BLOQUE[id],
  texto: BLOQUE[id](),
}))

export type PromptDisciplina = {
  id: string
  nombre: string
  para: string
  /** Qué sabe este prompt y qué deliberadamente no. */
  incluye: string[]
  color: string
  bloques: string[]
}

/**
 * El color no es decoración: es lo que hace que alguien reconozca su prompt en
 * la lista sin leer el título, y que no copie el equivocado.
 */
export const PROMPTS: PromptDisciplina[] = [
  {
    id: "completo",
    nombre: "Completo",
    para: "Un asistente que va a hacer de todo un poco, o cuando no sabés cuál te sirve. Es todo el kit convertido en contexto.",
    incluye: ["Los once bloques, sin recortar"],
    color: "#2B56D4",
    bloques: Object.keys(BLOQUE),
  },
  {
    id: "marketing",
    nombre: "Marketing",
    para: "Campañas, calendario de contenido, LinkedIn, Google Ads, mensajes y ángulos.",
    incluye: [
      "Posicionamiento y diferenciales",
      "Las tres buyer personas completas",
      "Tono de voz con ejemplos",
      "Prueba social y casos",
      "Claims permitidos y prohibidos",
      "Rol de cada canal",
    ],
    color: "#7C6CF6",
    bloques: ["identidad", "posicionamiento", "servicios", "audiencia", "tono", "prueba", "reglas", "canales"],
  },
  {
    id: "comercial",
    nombre: "Comercial",
    para: "Mails a prospectos, llamadas, propuestas, manejo de objeciones, respuestas a consultas entrantes.",
    incluye: [
      "Catálogo de servicios con su tecnología",
      "Las tres personas, con qué las frena y qué las convence",
      "Casos con métricas para respaldar",
      "Qué se puede prometer y qué no",
      "Datos de contacto y horarios",
    ],
    color: "#10B981",
    bloques: ["identidad", "posicionamiento", "servicios", "audiencia", "tono", "prueba", "reglas", "ficha"],
  },
  {
    id: "diseno",
    nombre: "Diseño",
    para: "Piezas gráficas, presentaciones, prompts de imagen, cualquier decisión visual.",
    incluye: [
      "Variantes de logo y sus reglas de uso",
      "Paleta completa y colores por solución",
      "Tipografía, pesos y escala",
      "Qué fotografía sí y cuál nunca",
      "Reglas de composición y base para prompts de imagen",
    ],
    color: "#B45CF2",
    bloques: ["identidad", "visual"],
  },
  {
    id: "contenido",
    nombre: "Contenido",
    para: "Redacción: posts, artículos, guiones, newsletters, textos de piezas.",
    incluye: [
      "Tono de voz con pares mal/bien",
      "Boilerplate oficial en tres largos",
      "Prueba social citable",
      "Claims y límites",
      "A quién le está hablando el texto",
    ],
    color: "#06B6D4",
    bloques: ["identidad", "servicios", "audiencia", "tono", "boilerplate", "prueba", "reglas"],
  },
  {
    id: "web",
    nombre: "Web y SEO",
    para: "Landings por solución e industria, metadatos, structured data, textos del sitio.",
    incluye: [
      "Catálogo canónico con slugs de URL",
      "Las seis industrias y su contexto",
      "Posicionamiento y tono",
      "Datos NAP exactos para el schema y Google Business",
    ],
    color: "#F59E0B",
    bloques: ["identidad", "posicionamiento", "servicios", "audiencia", "tono", "prueba", "reglas", "ficha"],
  },
  {
    id: "institucional",
    nombre: "Institucional",
    para: "Licitaciones, pliegos, dossiers, prensa, perfiles de partner, documentos formales.",
    incluye: [
      "Boilerplate oficial, que es la base de cualquier documento",
      "Ficha legal completa",
      "Prueba social y casos como respaldo",
      "Qué se puede acreditar y qué no",
    ],
    color: "#64748B",
    bloques: ["identidad", "posicionamiento", "servicios", "boilerplate", "prueba", "ficha", "reglas"],
  },
]

/** Arma el texto final de un prompt: sus bloques, en el orden declarado. */
export function armarPrompt(p: PromptDisciplina): string {
  return p.bloques
    .map((id) => BLOQUE[id]?.())
    .filter(Boolean)
    .join("\n\n———\n\n")
}

/** El prompt completo, para el botón de la cabecera. */
export const PROMPT_COMPLETO = armarPrompt(PROMPTS[0])
