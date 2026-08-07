# Rutina mensual de Google Ads

> El día 1 de cada mes, 40 minutos. Este documento es la checklist operativa.
> Para el plan de construcción del panel, ver `plan-panel-analisis.md`.

---

## Paso 1 — Exportar (5 min)

Tres informes. **El rango y el segmento cambian según cuál** — esto importa, no es lo mismo
en todos.

| # | Informe | Dónde | Rango | Segmento |
|---|---|---|---|---|
| 1 | **Campañas** | `Campañas → Campañas` | **Máximo** | `Segmento → Tiempo → Mes` |
| 2 | **Términos de búsqueda** | `Estadísticas e informes → Términos de búsqueda` | **Últimos 30 días** | ninguno |
| 3 | **Palabras clave** | `Audiencias, palabras clave y contenido` | **Últimos 30 días** | ninguno |

En cada uno: **⬇ Descargar → .csv**.

**Por qué los rangos son distintos:**

- **Campañas va en "Máximo" + segmento por mes.** Devuelve una fila por campaña *por mes* —
  o sea, toda la serie histórica en un archivo. El importador hace `upsert`, así que
  reimportar el mismo mes actualiza en vez de duplicar. Nunca se pierde historia aunque te
  saltees un mes.
- **Términos y keywords van a 30 días.** Acá no buscás historia: buscás **lo nuevo**. Qué
  término apareció este mes que no habías visto y ya está gastando. El histórico completo ya
  se minó una vez.

**Una vez por trimestre**, sumar el informe de **Anuncios** para revisar rechazos y estados.

---

## Paso 2 — Subir (2 min)

Arrastrar los tres CSV al panel. Ahí ocurre la limpieza y transformación:

| Qué hace | Por qué |
|---|---|
| Descarta el preámbulo y las filas de subtotal | Google intercala filas "Total:" que corrompen las sumas |
| Convierte el formato numérico español | `"876.592"` son 876 mil, no 876. Con `parseFloat` directo da absurdos |
| Normaliza el período al día 1 del mes | Para que el `upsert` funcione |
| `upsert` por `(periodo, campaña)` | Reimportar no duplica |
| Calcula métricas derivadas | CPC, costo por consulta, deltas vs mes anterior y vs mismo mes del año pasado |
| Marca candidatos a negativa | Términos sobre el umbral de gasto, con 0 conversiones, que **no** estén ya excluidos |

**El modelo de IA no calcula nada de esto.** Todo sale de SQL: determinista, auditable, igual
en cada corrida.

---

## Paso 3 — Revisar candidatos a negativa (5 min)

El panel muestra los términos nuevos que gastaron sin convertir. Aprobás o rechazás uno por
uno.

**Es el único paso que requiere criterio humano y no se puede automatizar.** Un término puede
parecer basura y ser una vertical nueva; otro puede parecer legítimo y ser un competidor.

⚠️ **Ojo con dos casos**: tu propia marca (`accedra`) nunca se excluye, y un término que
convirtió en otra variante de concordancia tampoco.

---

## Paso 4 — Leer el informe (10 min)

Ya viene escrito. Seis secciones fijas, siempre las mismas:

1. Semáforo y titular
2. Los cuatro números con su variación
3. Dónde se fue la plata
4. Qué funcionó
5. Qué hicimos el mes pasado, evaluado contra su hipótesis
6. Qué proponemos (máximo 3)

---

## Paso 5 — Decidir y registrar (10 min)

**Máximo 3 acciones por mes.** Cada una se carga con su hipótesis *antes* de ejecutarla:

> *"Pauso las keywords genéricas de cableado porque creo que el costo por consulta va a bajar
> de $108.000 a menos de $30.000."*

El informe del mes que viene la evalúa contra eso. Sin hipótesis previa, nunca sabés si
mejoró por lo que hiciste o por casualidad.

---

## Paso 6 — Ejecutar y compartir (8 min)

Aplicar en Google Ads lo que se decidió. Mandar el informe al dueño — la portada sola
alcanza.

---

## Reglas de lectura (las que evitan conclusiones falsas)

1. **Volumen mes a mes; calidad a 3 meses.** Gasto y clics se comparan mensualmente. El costo
   por consulta y la tasa de conversión se leen en promedio móvil de 3 meses — con ~190 clics
   al mes, un mes solo es ruido.
2. **Comparaciones en pesos: máximo 3 meses.** Con la inflación argentina, decir "el clic
   pasó de $75 a $373 en dos años" no significa nada. Más allá de 3 meses, comparar ratios y
   proporciones, no montos.
3. **Un cambio por vez, y esperá.** Si tocás pujas, negativas y anuncios el mismo día, no vas
   a saber qué causó qué. Los cambios necesitan 2-4 semanas para leerse.
4. **Nunca cambies pujas semanalmente.** Reinicia el aprendizaje del algoritmo.

---

## Lo semanal: cero trabajo manual

Se configura **una vez** en `Herramientas → Reglas automáticas`, 15 minutos, y manda mail
solo cuando algo se rompe:

- gasto diario sobre el umbral
- campaña limitada por presupuesto
- anuncio rechazado
- campaña caída a cero impresiones

Eso es control de daños. **No es análisis** — no se toca nada por lo que diga una semana.
