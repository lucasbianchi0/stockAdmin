# Sistema de diseño — Accedra Backoffice

Todo vive en `src/app/globals.css`. Si algo se puede resolver con un token de ahí,
no debería resolverse con un valor suelto en un componente.

## Las tres reglas

1. **El fondo no es blanco.** La app corre sobre `--n-100` y las superficies son
   blanco puro. La separación se lee sin bordes gruesos ni sombras pesadas.
   Regla derivada: todo lo que "flota" es más claro que su fondo.
2. **Un solo acento.** El azul de marca marca acción y estado activo. Verde,
   ámbar y rojo son datos (stock, semáforo, errores), nunca decoración.
3. **La jerarquía la hace el peso y el color del texto, no el tamaño.** Cuatro
   pesos (400 · 500 · 600 · 700) y cinco niveles de tinta alcanzan para todo.

## Tipografía

**Geist** (texto) + **Geist Mono** (datos literales), cargadas en `layout.tsx`.

| Uso | Clase / peso |
|---|---|
| Título de página | `text-[19px] font-semibold tracking-[-0.025em]` |
| Título de card / diálogo | `text-[15px] font-semibold tracking-[-0.015em]` |
| Texto base | `text-[13px]` peso 400 |
| Etiqueta, nav, botón | `text-[12.5px] font-medium` |
| Micro-rótulo | `.eyebrow` — 10px, 600, versalita, tracking `.11em` |
| Cifra / KPI | `.num` + `font-bold` |

Mono no es decorativo: **códigos, SKU e importes van en mono** para que las
columnas alineen carácter a carácter. `.num` fuerza cifras tabulares.

## Color

Escala neutra de 14 pasos en un solo tono (`--n-0` … `--n-950`, hue 255). Grises
y marca comparten tono, así no aparece el gris sucio de mezclar neutros cálidos
con azul.

**Tinta** — usar siempre estos, no `text-gray-*`:

| Token | Para qué |
|---|---|
| `text-ink` | Texto principal, cifras |
| `text-ink-secondary` | Texto de apoyo, párrafos largos |
| `text-ink-muted` | Descripciones, metadatos |
| `text-ink-subtle` | Rótulos de columna, eyebrows |
| `text-ink-faint` | Placeholders, guiones, deshabilitado |

**Superficies** — `bg-surface` (blanco) · `bg-surface-subtle` (cabeceras de panel,
pies) · `bg-surface-muted` · `bg-surface-sunken`.

**Líneas** — `border-line` (default) · `border-line-soft` (filas de tabla) ·
`border-line-strong` (bordes de input, que tienen que verse).

**Marca** — `brand-50` … `brand-900`. `brand-600` es `#2b6ac8` (el azul
corporativo). `brand-50` es el hover de fila y de celda editable.

**Estado** — cada color tiene cuatro piezas: `-soft` (relleno), `-line` (borde),
`-text` (tinta) y el sólido. Ej.: `bg-danger-soft border-danger-line
text-danger-text`. Nunca volver a escribir `bg-red-50 … ring-red-600/20` a mano:
usar `<Badge tone="danger">`.

**Navy** — `navy-950` … `navy-700`, sólo para sidebar, login, tooltips y capas
flotantes.

## Elevación

Dos capas siempre: una corta de contacto y una larga de difusión, teñidas de
navy. Una sola capa es lo que hace que una sombra se lea barata.

`shadow-e1` cards y controles en reposo · `shadow-e2` hover · `shadow-e3`
tooltips y popovers · `shadow-e4` diálogos y barras flotantes.

Los botones sólidos suman una línea de luz interior arriba
(`inset 0 1px 0 oklch(1 0 0/.16)`): sugiere una superficie iluminada desde
arriba, igual que las cards.

## Radios

6 · 8 · **10** · 14 · 18 · 24 px → `rounded-sm md lg xl 2xl 3xl`.
Cards y paneles van en `rounded-xl`; controles en `rounded-lg`.

## Clases de composición

| Clase | Qué es |
|---|---|
| `.panel` | La superficie estándar: borde + blanco + `shadow-e1` + `rounded-xl` |
| `.panel-header` / `.panel-footer` | Barras de un panel |
| `.eyebrow` | Micro-rótulo en versalita |
| `.num` | Cifras tabulares con tracking apretado |
| `.checkbox` | Checkbox nativo presentable |
| `.toolbar-divider` | Separador vertical de toolbar |

## Componentes

`ui/page-header.tsx` — `PageHeader` (título, descripción, back, acciones) +
`PageBody` (ancho y aire de página). **Toda página usa estos dos**: antes cada
`page.tsx` repetía el bloque sticky con variantes mínimas que no coincidían.

`ui/badge.tsx` — `Badge` (tonos `neutral brand success warning danger solid`) y
`Dot` (punto de semáforo con halo).

`ui/stat-card.tsx` — tarjeta de métrica. El acento es un riel de 3px absoluto,
no un `border-l-4`, que empujaría el contenido y desalinearía las cifras entre
tarjetas.

`ui/states.tsx` — `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`. El
ícono va dentro de un contenedor redondo con anillo: un ícono suelto al 20% de
opacidad se lee como un bug de render, no como un estado de diseño.

## Qué queda afuera

`components/admin/content-studio-client.tsx` conserva su lenguaje propio
(`zinc-*`, `brand-green`) por pedido explícito. Hereda tipografía y primitivas
(`Button`, `Input`, `Textarea`) pero no se rediseñó.

## Notas

- `src/tailwind.config.ts` es un config de Tailwind v3 muerto: el proyecto usa
  v4 con `@import "tailwindcss"` y no hay `@config` que lo cargue. Sus colores
  están en `hsl(var(--x))`, formato que ya no se usa. Se puede borrar.
- Foco: hay un único tratamiento global en `globals.css` (`:focus-visible`), halo
  de marca con offset. No agregar `focus:ring-*` por componente.
