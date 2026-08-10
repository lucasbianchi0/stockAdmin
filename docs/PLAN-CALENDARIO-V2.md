# Calendario de contenido V2 — plan de trabajo

Rediseño del calendario para que sea multi-plan, con template asignado por
pieza y previsualización del feed **antes** de gastar generaciones.

Escrito al cierre de la sesión del 9/8/2026 para retomarlo en frío.

---

## 0. Antes de tocar nada

Hay deuda acumulada que va a estorbar. En este orden:

**Commitear todo.** Hay ~20 archivos nuevos y seis migraciones sin versionar:
Gemini como único generador, sistema de permisos, plantillas, templates,
piezas generadas, lotes. Arrancar un rediseño encima de eso es pedir problemas.

**Correr las migraciones pendientes.** Todas son idempotentes:

```
20260809_plantillas.sql
20260809_02_plantillas_composicion.sql
20260809_03_piezas.sql
20260809_04_templates.sql
20260809_05_lotes.sql
20260809_06_lotes_backfill.sql
```

La de `content_plans.analisis` ya está aplicada.

**Enganchar los templates a la base.** Quedó a medias: existen las tablas
`templates` y `template_versiones` y el endpoint `GET /api/contenido/templates`
que las siembra desde el código, pero **nadie lo llama**. El probador sigue
leyendo el array de `src/lib/templates-pieza.ts`. Hasta que eso se enganche, las
versiones de receta no existen en la práctica.

---

## 1. Lo que hay hoy

| | Estado |
|---|---|
| Un plan activo por vez | `content_plans.archivado`; crear uno archiva el anterior |
| Slots con 3 opciones y una elegida | ✅ `content_slots` |
| Contenido generado por slot | ✅ caption, hashtags, CTA, promptImagen |
| Template de la pieza | ❌ no se guarda: se elige al generar la imagen |
| Imagen persistida | ❌ vive en memoria del navegador |
| Preview del feed | Parcial: `FeedPrevia` muestra lo generado, no lo planificado |
| 19 templates | ✅ en código, con receta, `llevaFoto` y `fotoColor` |

---

## 2. Las cuatro decisiones de fondo

### 2.1 Varios planes conviviendo

`archivado` deja de ser el mecanismo. Un plan tiene **estado**: `borrador`,
`activo`, `terminado`, `archivado`. Puede haber varios activos —un plan de
agosto y uno de septiembre solapados es normal— y el home los lista por fecha.

### 2.2 El template se decide al armar el plan, no al generar

Es el cambio que habilita todo lo demás. Sin el template guardado en el slot no
se puede previsualizar el feed, porque no se sabe qué forma va a tener cada
pieza.

Cada slot guarda `template_slug`. Lo propone el sistema al generar el plan y se
puede cambiar a mano desde el detalle.

### 2.3 La armonía se calcula distinto en cada canal

Esto es lo que no hay que resolver con un "variá los templates" genérico.

**Instagram — grilla de 3 columnas.** El feed se lee en filas, así que la
restricción es en dos dimensiones:

- Ningún template se repite en piezas consecutivas.
- Ningún template se repite dentro de la misma fila de tres.
- Como máximo dos piezas de foto plena por fila: tres seguidas pesan.
- Como máximo una pieza de solo texto por fila: dos se ven vacías.
- Alternar claro y oscuro: las piezas a color real levantan la grilla.

**LinkedIn — lectura lineal.** Se ve una debajo de otra y con días de por
medio, así que la restricción es mucho más floja:

- Dos piezas consecutivas no comparten template.
- Dentro de una ventana de tres, como mucho un formato de solo texto.
- Nadie compara la pieza 3 con la 6: no hace falta más.

El algoritmo vive en `src/lib/secuencia.ts` y es una función pura:

```ts
secuenciaRecomendada(
  slots: { fecha: string; canal: Canal; objetivo?: string }[],
  templates: TemplatePieza[]
): Map<slotId, templateSlug>
```

Pura a propósito: se testea sin base y sin modelo.

### 2.4 Preview con miniaturas antes de generar

Con el plan armado y los templates asignados, se puede dibujar el feed
**sin una sola llamada al generador**: cada celda muestra la miniatura del
template —la última pieza generada con él, que ya se guarda en
`piezas_generadas`— más el titular.

Sirve para juzgar si el conjunto respira antes de gastar veinte generaciones de
doce segundos cada una. Recién si convence, se genera de verdad.

---

## 3. Migración

```sql
-- Varios planes conviviendo
alter table content_plans add column if not exists estado text not null default 'activo'
  check (estado in ('borrador','activo','terminado','archivado'));
alter table content_plans add column if not exists nombre text;

update content_plans set estado = case when archivado then 'archivado' else 'activo' end;

-- El template de cada pieza, decidido al planificar
alter table content_slots add column if not exists template_slug text;

-- La imagen generada, para que sobreviva al refresh
alter table content_slots add column if not exists imagen_path text;

create index if not exists content_plans_estado_idx
  on content_plans (estado, fecha_inicio desc);
```

`template_slug` va como texto y no como FK: los templates se borran y se
renombran, y un plan viejo tiene que sobrevivir a eso. Mismo criterio que
`piezas_generadas.template_id`.

`imagen_path` apunta al bucket `piezas`, que ya existe. Con eso se cierra el
agujero de perder las imágenes al recargar.

---

## 3 bis. No romper el plan que ya existe

La migración es aditiva —tres columnas nullables o con default— así que el plan
que hoy está cargado, con sus 15 slots y su contenido generado, sigue andando
sin tocarlo. Pero hay tres puntos donde sí se rompe si se hace de apuro.

**`archivado` y `estado` conviviendo.** Las queries de hoy filtran
`archivado = false`. Si se cambian a `estado` de a una, cualquier consulta que
quede sin migrar deja de encontrar el plan y la pantalla aparece vacía — sin
error, que es lo peor. Hay que dejar las dos columnas sincronizadas hasta que la
fase 2 esté cerrada, y recién ahí borrar `archivado`.

**Slots sin `template_slug`.** El plan actual no tiene template asignado en
ninguna pieza. El preview del feed y el selector tienen que tolerar `null`: o
caen a un template por defecto, o muestran la celda vacía con un botón de
"asignar". Nunca reventar.

**La URL del detalle.** Al mover el detalle a `/contenido/calendario/[id]`, la
ruta `/contenido/calendario` pasa a ser el home. El plan no se pierde: queda a
un click. Pero si alguien tenía el link guardado, conviene que la ruta vieja
redirija al plan activo más reciente en vez de dar 404.

Con esas tres, la transición es invisible para el plan que ya está cargado.

## 4. Pantallas

### 4.1 `/contenido/calendario` — home

Reemplaza la pantalla actual, que salta directo al único plan.

- Grilla de cards, una por plan: nombre, rango de fechas, canales, y una barra
  de avance con tres tramos (elegidas / con contenido / con imagen).
- Estado visible: borrador, activo, terminado.
- Acciones por card: abrir, duplicar, archivar, borrar.
- Botón principal: **Planear 15 días**.
- Acceso a **Plantillas visuales** desde acá, que hoy solo se llega por URL.

### 4.2 `/contenido/calendario/[id]` — detalle del plan

Lo que hoy es la pantalla única. Se le suma:

- Selector de template por slot, con el recomendado marcado.
- Botón **Ver el feed** que abre el preview con miniaturas.
- Editar el plan: nombre, fechas, archivar.

### 4.3 Preview del feed

Dos vistas, según el canal de la pestaña activa:

- **Instagram**: grilla de 3 columnas con las miniaturas de los templates
  asignados, en orden de fecha. Es la vista que importa para juzgar armonía.
- **LinkedIn**: columna lineal, una pieza debajo de otra con su fecha.

Cada celda muestra la miniatura del template y el titular encima. Un badge
distingue lo que ya tiene imagen real de lo que todavía es miniatura.

Y un botón para **reordenar**: recalcula la secuencia con otra semilla, por si
la propuesta no convence.

---

## 5. Orden de trabajo

Cada fase deja algo usable.

**Fase 1 — Modelo.** La migración de arriba, más `estado` reemplazando a
`archivado` en las queries. Sin UI nueva: al terminar, el calendario sigue
andando igual.

**Fase 2 — Home.** La lista de planes y el detalle en `[id]`. Acá aparece poder
tener más de un plan.

**Fase 3 — Templates por slot.** La generación del plan propone
`template_slug` para cada pieza, y el detalle deja cambiarlo.

**Fase 4 — Secuencia.** `src/lib/secuencia.ts` con las reglas por canal, y el
botón de reordenar. Es la fase con más criterio y la que conviene testear
aparte.

**Fase 5 — Preview del feed.** La grilla de Instagram y la columna de LinkedIn
con miniaturas.

**Fase 6 — Persistir imágenes.** `imagen_path` en el slot: la generación sube
al bucket en vez de devolver solo el data URL. Cierra el agujero de perder
cuatro minutos de generación al recargar.

---

## 6. Decisiones abiertas

**¿El contenido se adapta al template o al revés?** Hoy el titular se escribe
primero y el template se elige después. Pero un template de solo texto pide un
titular más largo que uno de foto plena con pastilla, que pide cuatro palabras.
Lo natural sería decidir el template primero y pedirle al modelo un titular con
el largo que ese formato necesita. Cambia el orden del prompt del calendario.

**¿Cuántos templates entran en un plan de 15 días?** Con 19 disponibles y 11
piezas, usar 11 distintos da variedad pero no da identidad. Una marca se
reconoce por repetir. Probablemente el plan deba usar entre 5 y 7 templates,
repitiendo los mejores, y no uno distinto por pieza.

**Los titulares.** Hoy el calendario genera anuncios, no tesis. El mejor
template con un titular de folleto da una pieza de folleto. Es el próximo cuello
de botella y se arregla en el prompt de `/api/contenido/calendario`, no en los
templates.

**Podar los 19.** Están sin probar en tanda completa. Los sospechosos son los
que tienen elementos pareados o repetidos: "Dos columnas comparativas" ya salió
con texto ilegible. Conviene generar una tanda, descartar los que no dan y
quedarse con 6 u 8 antes de construir la secuencia sobre ellos.
