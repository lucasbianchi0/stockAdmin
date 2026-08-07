# El informe mensual — template y prompt

> Este apartado es el contrato que hace que todos los informes salgan iguales.
> Si esto se respeta, agosto y septiembre se pueden comparar. Si se toca sin
> versionar, no.

---

## Las tres piezas y cómo se relacionan

| Pieza | Dónde | Qué define |
|---|---|---|
| **Los datos** | exportación mensual de Google Ads | Los números. Calculados fuera del modelo. |
| **El prompt** | `src/lib/marketing-context.ts` | Cómo se interpretan. Versionado. |
| **El template** | `public/informes/plantilla-mensual.html` | Cómo se ven. Estructura fija. |

Las tres tienen que moverse juntas. Cambiar una sin las otras rompe la comparabilidad.

> El template vive en `public/` y no en `docs/` porque no es documentación: es el
> archivo que el botón "Copiar prompt maestro" descarga y pega en el prompt. Hay
> una sola copia a propósito — si estuviera duplicado en `docs/`, tarde o temprano
> las dos versiones se separan y el informe deja de coincidir con la plantilla.

---

## La regla que sostiene todo

**El modelo no calcula. Interpreta.**

Los números salen del CSV de Google Ads y de las cuentas del importador. Al modelo
se le pasa el resultado ya calculado y sólo escribe la lectura.

Dos motivos:

1. **Auditabilidad.** Un número calculado por SQL se puede verificar. Uno calculado
   por un modelo, no — y puede cambiar entre corridas con los mismos datos.
2. **Privacidad.** Se manda el agregado, no las filas. Ningún nombre, email o
   empresa de un lead sale hacia la API.

---

## La rúbrica: siete secciones, siempre las mismas

Forzadas por `INFORME_SCHEMA` usando structured outputs. No es una sugerencia del
prompt — es un esquema JSON que la respuesta tiene que validar. No pueden faltar,
cambiar de nombre ni aparecer en otro orden.

| Sección | Qué es |
|---|---|
| `semaforo` | verde / amarillo / rojo |
| `titular` | Una frase, máx. 140 caracteres, para alguien no técnico |
| `lectura_del_mes` | 2-3 párrafos interpretando los indicadores |
| `por_iniciativa` | Un veredicto por solución: sostener / aumentar / reducir / apagar / sin datos |
| `evaluacion_acciones` | Cada acción del mes anterior contra la hipótesis que se anotó **antes** |
| `propuestas` | **Máximo 3.** Un informe con quince recomendaciones no se ejecuta |
| `advertencias` | Trampas de lectura de *este* informe (pocos datos, cambio de estructura…) |

---

## Las reglas de lectura que lleva el prompt

Son obligatorias y están escritas en el system prompt. Existen porque cada una
corresponde a un error real que se comete con cuentas de este tamaño:

1. **Con ~200 clics/mes, el costo por consulta de un solo mes es ruido.** Con menos
   de tres meses de datos, apoyarse en los indicadores de calidad — que se
   estabilizan más rápido.
2. **Comparaciones en pesos: hasta 3 meses.** Más allá, proporciones. La inflación
   argentina vuelve absurdo comparar montos de 2019 con 2026.
3. **Si cambió la cantidad de grupos activos, la inversión total no es comparable.**
   Más superficie cubierta no es más presupuesto.
4. **Un período sin medición no tiene datos de consultas.** No se estiman.
5. **La marca va siempre separada del total.** Convierte barato por definición;
   mezclarla infla los resultados y tapa cómo rinde la captación real.
6. **El costo por consulta no se compara entre soluciones** sin el valor promedio
   de contrato de cada una.

## El veredicto por iniciativa

Se decide con el **índice de eficiencia** = % de consultas que aporta ÷ % de
inversión que consume:

| Índice | Veredicto |
|---|---|
| ≥ 1,2 con volumen suficiente | aumentar |
| 0,8 – 1,2 | sostener |
| < 0,8 con ≥ 2 meses de datos | reducir |
| < 0,5 con ≥ 2 meses de datos | apagar |
| < 15 clics en el período | sin datos |

Y una distinción que el prompt exige hacer: **mucho tráfico con pocas consultas no
es un problema de campaña, es un problema de landing.** La acción es revisar la
página, no apagar la pauta. Se ven iguales en Google Ads y se arreglan distinto.

---

## Versionado

`PROMPT_VERSION` en `src/lib/marketing-context.ts`. Se sube a mano al cambiar el
schema o el system prompt, y cada informe guarda con qué versión se generó.

Sin eso, al ver una diferencia entre dos meses no se puede saber si cambió el
negocio o cambió el analista — que es exactamente lo que el informe existe para
responder.

**Cuándo subirla:**

| Cambio | Versión |
|---|---|
| Agregar o sacar una sección de la rúbrica | mayor (2.0.0) |
| Cambiar una regla de lectura o los umbrales del índice | menor (1.1.0) |
| Corregir una redacción sin cambiar el criterio | parche (1.0.1) |

---

## Parámetros de la llamada

Centralizados en `PARAMETROS_LLAMADA` para que ningún mes se genere distinto:

- **Modelo:** `claude-opus-5` — análisis de negocio con razonamiento, no generación
  de copy. Las rutas de `/contenido` usan Sonnet y ahí está bien.
- **Thinking:** adaptativo, esfuerzo alto.
- **Salida:** `output_config.format` con el schema de la rúbrica.
- **Caché:** el contexto de negocio es estable y va primero; el snapshot del
  período, que cambia siempre, va al final.
