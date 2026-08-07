# Cómo demostrarle crecimiento a los socios

> Este documento define **para quién es el panel y qué tiene que probar**.
> Es lo que decide qué se construye — leer antes que `plan-panel-analisis.md`.

---

## 1. Esto resuelve la pregunta "¿panel propio o Google Ads?"

Son dos públicos distintos y no compiten:

| | **Google Ads + Looker Studio** | **Panel en el backoffice** |
|---|---|---|
| Para quién | **Vos**, operando campañas | **Los socios**, evaluando la inversión |
| Responde | ¿qué keyword, qué puja, qué anuncio? | ¿esto nos está dando plata? |
| Métricas | CTR, CPC, nivel de calidad, impresiones | inversión, oportunidades, CAC, retorno |
| Costo de construir | **cero** (ya existe, es gratis) | lo que haya que hacer |

**Google no puede producir el reporte de los socios, por diseño.** Su información termina en
el formulario enviado: no sabe si ese lead se volvió cliente ni por cuánta plata. El único
lugar donde conviven la inversión y el contrato firmado es tu base.

Esa es la razón de existir del panel — **no** replicar métricas de campaña. Para eso,
Looker Studio se conecta nativo a Ads, se actualiza solo, es gratis y no requiere construir
nada.

---

## 2. La verdad incómoda: hoy no podés demostrar crecimiento. Y está bien.

Con los datos actuales, cualquier intento de mostrar crecimiento se cae solo:

- La etiqueta de conversión está apagada → el último mes marca **0 conversiones**.
- El CTR se derrumbó a la mitad (2,18% → 1,14%).
- De las 139 conversiones históricas, **ninguna sabe si se volvió cliente**.

Si les mostrás métricas de vanidad —impresiones, clics, alcance— estás armando una trampa: los
entrenás a mirar números que no significan nada, y el día que alguien pregunte *"¿y cuántos
clientes trajo?"* se cae todo de golpe, con tu credibilidad adentro.

**No inventes una historia de crecimiento que los datos no sostienen.**

---

## 3. Lo que sí podés demostrar hoy, y es fuerte

La historia que tenés no es *"estamos creciendo"*. Es:

> **"Encontramos dónde se estaba yendo la plata, y lo estamos arreglando."**

Y esa historia es demoledora, porque tiene números:

- **El 90,13% de la inversión histórica fue a búsquedas que nunca convirtieron** —
  $1.175.166 de $1.303.906.
- Un solo término, `gde` (el sistema de expedientes del Estado), se llevó **$171.079** en 640
  clics, sin una sola conversión.
- Le pagamos a Google **$54.090 por la marca de un competidor**.
- **Cableado Estructurado cuesta $108.330 por conversión.** Diez veces más que la otra campaña.
- **Todos los anuncios apuntaban al sitio viejo**, y uno a una página que no existe.
- Nadie lo sabía, porque **la medición estaba rota**.

Ese es el primer resultado demostrable, y no es menor: **pasar de no poder ver a poder ver**.
Es también lo que fija la línea de base contra la cual se va a medir todo lo que venga —
y fijar la línea de base *antes* de reclamar crecimiento es lo que hace que el crecimiento
sea creíble después.

---

## 4. La escalera: qué se puede probar y cuándo

En B2B con ciclo de venta largo **no se puede mostrar crecimiento de contratos en 30 días**.
Prometerlo es la forma más rápida de que el programa se cancele en el mes 2.

La jugada profesional es presentarles esta escalera **antes** de empezar, para que cada mes
se juzgue con la métrica que ya puede haberse movido:

| Cuándo | Qué se puede demostrar | Métrica |
|---|---|---|
| **Semana 1-4** | La medición existe y funciona | Conversiones registrándose (hoy: 0) |
| **Mes 1-3** | Dejamos de tirar plata | % del gasto en términos sin conversión (hoy: **90%**) |
| **Mes 2-4** | Las consultas cuestan menos | Costo por consulta |
| **Mes 3-6** | Las consultas son mejores | % de consultas que se califican |
| **Mes 6-12** | El negocio crece | **Contratos firmados y CAC** |

**Decir esto en voz alta al principio es la mitad del trabajo.** Si no fijás la expectativa,
en el mes 2 te van a pedir contratos, no vas a tener, y el programa muere justo antes de
empezar a funcionar.

---

## 5. Los cuatro números del reporte a socios

Nada de CTR, impresiones ni nivel de calidad. Eso es diagnóstico, no resultado.

```
TRIMESTRE                                        vs. anterior

Invertimos                    $ XXX.XXX              ↑ / ↓
Oportunidades reales          XX consultas           ↑ / ↓
Costo por oportunidad         $ X.XXX                ↑ / ↓
Clientes nuevos / CAC         X  ·  $ XX.XXX         ↑ / ↓
```

Debajo: la evolución de esos cuatro en 12 meses. Nada más en la portada.

**Los cuatro salen de cruzar la inversión (Ads) con el pipeline (`leads` en Supabase).**
Ninguna herramienta de Google puede producirlos. Por eso el panel importa **sólo el costo
mensual por campaña** — el resto de las métricas de Ads se quedan en Google, donde se ven
mejor.

---

## 6. Lo que más convence no es un dashboard

Es esto:

> **"Dijimos que íbamos a hacer X, esperábamos Y, y esto fue lo que pasó."**

Por eso el registro de acciones con hipótesis no es burocracia: es el activo de credibilidad.
Convierte la conversación de *"confiá en mí"* a *"acá están mis predicciones, fechadas antes
del hecho, y su resultado"*.

Un socio que ve tres trimestres seguidos de predicciones registradas y verificadas deja de
discutir el presupuesto. Uno que sólo ve gráficos lindos, no.

Ejemplo del formato:

| Fecha | Acción | Esperábamos | Pasó |
|---|---|---|---|
| 06/08 | Pausar Cableado Estructurado | Liberar ~$21.000/mes sin perder consultas | ✅ 0 consultas perdidas |
| 06/08 | Cargar 52 negativas | Bajar el gasto sin conversión del 90% al 60% | 🕐 se mide en septiembre |
| 12/08 | Instalar tag de conversión | Volver a registrar conversiones | ✅ 14 registradas |

---

## 7. Qué construir, entonces

Recortado a lo mínimo que sostiene el reporte a socios:

| | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| **1** | Tabla de **costo mensual por campaña** + import de 1 CSV | Es el único dato de Ads que hace falta en la base | ~medio día |
| **2** | **Registro de acciones** con hipótesis y resultado | El activo de credibilidad | ~medio día |
| **3** | **Vista de los 4 números** cruzando costo × `leads` | El reporte a socios | ~1 día |
| **4** | **Informe trimestral** generado, rúbrica fija, guardado | La narrativa escrita | ~1-2 días |
| — | ~~Panel de términos, keywords, CTR~~ | **Se descarta.** Va en Looker Studio, gratis | 0 |

Eso es **~3 días**, no dos semanas. Y para operar campañas, Looker Studio conectado a Ads
resuelve el resto sin construir nada.

---

## 8. El requisito que sostiene todo

**Alguien tiene que marcar los leads como ganado o perdido, y cargar el monto.**

Sin eso no hay CAC, no hay retorno, y el reporte a socios vuelve a ser métricas de vanidad.
Es un minuto por lead, y es el único punto del plan que no se puede resolver con código.

Si eso no va a pasar, conviene saberlo ahora: cambia el plan entero.
