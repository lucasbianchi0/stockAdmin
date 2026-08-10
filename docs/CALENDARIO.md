# Calendario de contenido

Plan de 15 días para LinkedIn y Meta (Instagram + Facebook como una sola pieza).

## ⚠️ Migración pendiente

El plan ahora incluye un análisis de marketer que explica el reparto. Necesita
una columna nueva; sin ella, **el botón de planear falla al guardar**.

```sql
alter table content_plans add column if not exists analisis text;
```

Se puede correr antes de desplegar: la versión vieja del código ignora la
columna.

## Decisiones que sostienen el flujo

**Todas las piezas son imagen.** Antes el plan proponía carruseles, reels,
videos y artículos. Cada uno exige una producción distinta —guion, filmación,
ocho slides diseñados— y el calendario se trababa en la primera pieza que nadie
podía producir. Quince imágenes son quince piezas que salen.

**Una opción recomendada por día, con su motivo.** Tres opciones equivalentes
trasladan la decisión entera al usuario y el plan tarda el triple en cerrarse.
La normalización fuerza que haya exactamente una: el modelo a veces marca dos o
ninguna, y las dos fallas rompen lo mismo.

**Dos pestañas, no un filtro.** Lo que se publica en LinkedIn y lo que va a Meta
no se decide con el mismo criterio, así que se revisan por separado.

**Solo se listan los días con publicación.** Mostrar los quince con nueve vacíos
era hacer scrollear por casilleros donde no pasa nada.

**La generación en lote va en serie.** Son llamadas caras a un modelo; once en
paralelo terminan en rate limit, con la mitad hecha y sin saber cuál falló.

## Lo que no se guarda

Las imágenes generadas viven en la sesión, no en la base: son ~600 KB de base64
cada una y las tablas guardan texto. Hay que descargarlas. Si se quieren
persistir, el lugar es Supabase Storage.
