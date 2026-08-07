# Plan — Panel de Google Ads en el backoffice

> Sección nueva, independiente de `/contenido` y del tracking del sitio.
> Objetivo doble: que **el dueño entienda en 30 segundos cómo venimos**, y que vos puedas
> **auditar el histórico y decidir el mes que viene** con datos.

---

## 1. La pregunta directa: ¿se puede exportar automático?

**Sí, y ya tenés la infraestructura montada.** `.github/workflows/sync-products.yml` corre
todos los días a las 3 AM y escribe en Supabase con `SUPABASE_SERVICE_ROLE_KEY`. Un
`sync-ads.yml` idéntico al lado resuelve la ingestión — mismo patrón, mismos secrets, misma
base.

Lo único que falta es de dónde salen los datos. Tres vías, de menor a mayor esfuerzo:

| Vía | Setup | Automático | Cuándo conviene |
|---|---|---|---|
| **A. Carga manual de CSV** | 0 | ❌ (5 min/mes) | **Ahora.** Ya sabés exportarlos |
| **B. Complemento de Ads para Sheets** | ~1 h | ✅ semanal | Si el token de la API se demora |
| **C. Google Ads API** | trámite + ~2 días | ✅ diario | **El destino.** Ya lo necesitás igual |

### Por qué la C es el destino, aunque no sea lo primero

El **developer token de la Google Ads API ya lo necesitás** para subir las conversiones
offline (que es lo que le enseña a Google a optimizar por contratos y no por formularios).
O sea: el trámite hay que hacerlo igual. Una vez aprobado, la misma credencial sirve para
**bajar** costos y métricas y para **subir** conversiones. Se pide una vez, sirve para las dos
puntas del circuito.

Pero el token tarde en aprobarse, así que:

- **Pedí el token hoy** (es un formulario, la demora es de ellos).
- **Mientras tanto, carga manual.** Ya exportaste los 5 informes en cinco minutos; ese
  proceso funciona y no bloquea nada.
- **La B es el plan de contingencia** si el token se demora mucho o lo rechazan: el
  complemento oficial de Google Ads para Sheets programa una actualización semanal a una
  planilla, y el cron lee la planilla. Sin OAuth complicado, sin aprobaciones.

**El orden importa:** automatizar la ingestión de un informe que todavía nadie lee es
trabajo tirado. Primero que el informe exista y se use; después se automatiza el riego.

---

## 2. Mi opinión profesional sobre la cadencia: semanal no es análisis

Preguntaste si traer los datos todas las semanas. Se puede, y los datos sí conviene
traerlos seguido. Pero **no analices ni tomes decisiones semanalmente en esta cuenta.**

El motivo es aritmético. La cuenta hizo **190 clics en un mes**. Una semana son ~45 clics
repartidos entre dos campañas. Con 45 clics no se puede concluir nada: la diferencia entre
una buena y una mala semana es ruido estadístico. Y decidir sobre ruido tiene un costo
concreto — cada cambio de puja o presupuesto reinicia el aprendizaje del algoritmo, y los
cambios semanales terminan pisándose entre sí. Es la forma más común de arruinar una cuenta
chica trabajando mucho.

La cadencia que recomiendo:

| Frecuencia | Qué se mira | Quién | Objetivo |
|---|---|---|---|
| **Semanal** | Alarmas: gasto disparado, anuncios rechazados, términos basura nuevos, campañas caídas a cero | automático | **Control de daños**, no análisis |
| **Mensual** | Rendimiento, costo por consulta, qué funcionó, qué cambiar | vos + el dueño | **Decisiones** |
| **Trimestral** | Estructura de campañas, presupuesto, estrategia | vos | **Rumbo** |

O sea: los datos entran todos los días o todas las semanas, pero **la lectura semanal es una
alerta automática, no un informe**. "Se rechazó un anuncio", "el término X gastó $8.000 sin
convertir", "la campaña Y se quedó sin presupuesto". Eso sí es accionable en una semana.

---

## 3. El panel del dueño: cuatro números y un semáforo

El dueño no necesita CTR, CPC ni cuota de impresiones. Necesita responder una pregunta:
**¿estamos mejor o peor que el mes pasado?**

La portada, en castellano y sin jerga:

```
┌─────────────────────────────────────────────────────────┐
│  AGOSTO 2026                                    🟡      │
│                                                         │
│  Invertimos          $ 70.800      ↑ 12% vs julio      │
│  Consultas           0             ↓ —                  │
│  Costo por consulta  —             (sin datos)          │
│  Clientes nuevos     0                                  │
│                                                         │
│  ⚠ La medición de conversiones está apagada.           │
│    Estamos gastando sin poder saber qué funciona.      │
└─────────────────────────────────────────────────────────┘
```

Debajo, un gráfico de líneas de 12 meses con inversión y consultas. Y abajo de todo, el
detalle técnico plegado, para vos.

**Regla de oro de esta pantalla:** si una métrica no cambia una decisión, no va en la
portada. Impresiones, CTR y nivel de calidad son diagnóstico — viven en el detalle.

---

## 4. Modelo de datos

Tres tablas en Supabase (la misma base que ya usa el backoffice).

```sql
-- Métricas por campaña y por mes. El grano es el mes: es la unidad de decisión.
ads_campanas_mes (
  id, periodo,                    -- date, primer día del mes
  campana, estado,
  coste, clics, impresiones, conversiones,
  created_at,
  unique (periodo, campana)       -- reimportar el mismo mes actualiza, no duplica
)

-- Términos de búsqueda por mes. Es donde se detecta la fuga de plata.
ads_terminos_mes (
  id, periodo, termino, campana, concordancia,
  coste, clics, conversiones,
  es_negativa boolean,            -- ya excluido
  unique (periodo, termino, campana)
)

-- Qué cambiamos y cuándo. Sin esto, el análisis mensual es "los números se movieron".
ads_acciones (
  id, fecha, area, titulo,
  hipotesis,                      -- qué esperábamos que pasara
  resultado, estado,              -- se completa al mes siguiente
  created_at
)
```

**`ads_acciones` es la pieza que hace auditable el proceso.** Cargás la acción con su
hipótesis *antes* de ejecutarla, y el informe del mes siguiente la evalúa contra lo que
esperabas. Sin eso, nunca vas a saber si mejoró por lo que hiciste o por casualidad.

---

## 5. El informe mensual

Seis secciones fijas, siempre las mismas — es lo que hace que agosto se pueda comparar con
julio. Se genera con Claude a partir de los números ya calculados en SQL (el modelo
interpreta, **nunca calcula**: si calcula, los números no se pueden auditar y cambian entre
corridas).

1. **Semáforo y titular** — una frase que el dueño entienda.
2. **Los cuatro números** con su variación vs el mes anterior.
3. **Dónde se fue la plata** — top 10 de términos por gasto, marcando los que no convirtieron.
4. **Qué funcionó** — máximo 3, con el dato al lado.
5. **Qué hicimos el mes pasado** — de `ads_acciones`, evaluado contra su hipótesis.
6. **Qué proponemos** — máximo 3, priorizadas, que se cargan al roadmap con un clic.

Cada informe se **guarda** con la versión del prompt y el modelo. Un informe de julio tiene
que decir siempre lo mismo, aunque después mejores la rúbrica — si no, no sabés si cambió el
negocio o cambió el analista.

El tope de 3 propuestas es a propósito: un informe con quince recomendaciones no se ejecuta.

---

## 6. Fases

| Fase | Qué | Entrega | Esfuerzo |
|---|---|---|---|
| **0** | Tablas + importador de los 5 CSV que ya sabés exportar | **Los 9 años de historia cargados y visibles** | ~1 día |
| **1** | Panel: portada del dueño + evolución 12 meses + detalle | El dueño ya entiende cómo venimos | ~2 días |
| **2** | `ads_acciones` + registro de cambios | El proceso queda auditable | ~medio día |
| **3** | Informe mensual con Claude, rúbrica fija, guardado | La lectura, sin escribirla a mano | ~2 días |
| **4** | Reglas automáticas **dentro de Google Ads** (no se programa) | Control de daños | ~15 min |
| **5** | `sync-ads.yml` con la Ads API — **condicional, ver abajo** | Se riega solo | ~2 días |

### La Fase 5 tiene una condición de entrada

**No automatizar la ingestión hasta que el informe mensual se esté leyendo y usando para
decidir, durante al menos tres meses seguidos.**

El motivo no es técnico. La carga manual son 5 CSV y cinco minutos, una vez por mes — no es
un problema que valga dos días de desarrollo resolver. Pero tiene un efecto secundario
valioso: **obliga a alguien a entrar a la cuenta**. Ese día del mes ves los términos de
búsqueda, notás el anuncio rechazado, mirás lo que se está gastando. Cuando se automatiza,
el panel se actualiza solo y nadie vuelve a abrir Google Ads.

Automatizar temprano no hace que el proceso se sostenga: lo vuelve invisible. Si a los tres
meses el ritual está vivo, automatizás y te liberás los treinta minutos. Si está muerto,
automatizarlo no lo revive — y te ahorraste dos días.

**La Fase 0 ya entrega valor solo**: con los CSV que exportaste hoy, el panel muestra la
historia completa de la cuenta sin que nadie tenga que abrir Google Ads. Y las fases 0-2 no
usan IA — si esa parte se complica, el panel sigue sirviendo.

---

## 7. Notas técnicas

- **El parser de los CSV ya está escrito.** `accedra/scripts/ads/analizar.mjs` resuelve lo
  difícil: los CSV de Google traen dos líneas de preámbulo, filas de subtotal intercaladas, y
  formato numérico español (coma decimal, punto de miles — `"876.592"` son ochocientos
  setenta y seis mil). Leerlos con `parseFloat` directo da resultados absurdos. Se porta tal
  cual.
- **Cron**: copiar `sync-products.yml` → `sync-ads.yml`. Mismos secrets, mismo patrón.
- **Modelo**: para el informe usaría `claude-opus-5` con `effort: "high"` — es análisis de
  negocio, no generación de copy. Las rutas de `/contenido` están en `claude-sonnet-4-6` y ahí
  están bien; no las tocaría.
- **Rúbrica forzada por esquema**: `output_config.format` con un JSON Schema. Sin eso, la
  comparabilidad entre meses depende de que el modelo se porte bien.
- **Sidebar**: agregar el ítem nuevo. El de "Reportes" que ya está en `available: false` es
  otra cosa (reportes de inventario) — no lo reutilizaría para no confundir.

---

## 8. Lo que necesito de vos

- **Pedí el developer token de la Ads API esta semana.** Es el único item con demora externa,
  y lo necesitás igual para las conversiones offline.
- **Confirmá la cadencia**: mi recomendación es alertas semanales automáticas + reunión
  mensual. Si el dueño quiere ver algo cada semana, que sea el semáforo, no un informe.
- **Definí con quién se lee el informe y qué se decide ahí.** Un informe que nadie usa para
  decidir es un costo, no un activo. Vale la pena acordar la reunión antes que el software.
