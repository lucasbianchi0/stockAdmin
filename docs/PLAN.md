# El plan, en una página

**Objetivo final:** campañas de Google que traigan clientes reales.

**Pero antes:** que la empresa vea, en un solo lugar, qué estuvo pasando mal.
Ese lugar es un tablero dentro del backoffice, y arranca siendo el diagnóstico.

---

## Fase 1 — El diagnóstico, donde lo puedan ver

**Estado: el análisis ya está hecho. Falta ponerlo donde entren.**

Ya analicé los 9 años de la cuenta y armé la página que lo explica caso por caso
(hoy corre en `localhost:4321`). Lo que falta es moverla adentro del backoffice, como
una sección más, detrás del login.

Qué muestra:

- El 90% de la plata se fue en búsquedas que nunca convirtieron
- `gde` se llevó $171.079 sin una sola conversión
- Le pagamos $54.090 a un competidor
- Cableado Estructurado cuesta $108.330 por conversión
- Los anuncios apuntan al sitio viejo, y uno a una página que no existe
- La medición está apagada: hoy gastamos a ciegas

**Esfuerzo:** ~1 día (portar la página al backoffice).
**Resultado:** el dueño y los socios abren el backoffice y entienden la situación.

---

### ¿Cómo lo ven?

Dos formas, para dos personas distintas. No es lo mismo y conviene no mezclarlo:

**1. Una sección dentro del backoffice** — la fuente de verdad.
Entrás con el login que ya existe, clic en el menú, y ahí está. Siempre actualizado.
Para vos y para quien trabaje con esto seguido.

**2. Un botón "Descargar PDF"** — lo que realmente se lee.
Genera el PDF de la pantalla tal como está, con la fecha. Para la reunión, para mandar
por mail, para el socio que no va a entrar nunca a un backoffice de inventario a buscar
un informe de marketing.

> **Los PDF se generan, no se suben.** Si alguien los arma a mano, quedan viejos, se
> contradicen entre sí y no hay una versión que valga. Los datos viven en un solo lugar
> y el PDF es una foto de ese lugar en un momento.

Técnicamente el PDF sale con una hoja de estilos de impresión + Cmd+P. Son 30 minutos,
no hace falta generarlo en el servidor (eso recién si algún día se manda solo por mail).

### ¿Y la base de datos?

**Para la Fase 1, no hace falta.** El diagnóstico es un análisis de un período cerrado —
los 9 años que ya pasaron. Los números no cambian más. Es una página con el contenido
adentro, y listo.

**La base de datos aparece en la Fase 4**, cuando el tablero pasa a acumular mes a mes.
Ahí sí hacen falta dos tablas chicas:

```
ads_costos_mes    → periodo, campaña, coste, clics, conversiones
acciones          → fecha, qué hicimos, qué esperábamos, qué pasó
```

Y el circuito mensual queda así:

```
exportás 1 CSV de Google Ads
        ↓
lo arrastrás al panel  →  limpia, transforma y guarda en la DB
        ↓
el panel se actualiza solo (los 4 números + la evolución)
        ↓
botón PDF  →  a la reunión
```

Los `leads` ya están en esa misma base — de ahí salen las consultas y los clientes nuevos.

---

## Fase 2 — Arreglar lo que está roto

Sin esto, ninguna campaña puede funcionar. Es la parte más barata y la que más cambia.

1. **Instalar el tag de conversión.** Hoy Google no registra nada. Sin esto todo lo demás
   es a ciegas. *(~1 día)*
2. **Pausar Cableado Estructurado.** $108.330 por conversión. *(5 min)*
3. **Cargar las 52 negativas** que ya generé. *(10 min)*
4. **Apuntar los anuncios al sitio nuevo, en https.** Y arreglar el que da 404. *(30 min)*
5. **Revisar el anuncio rechazado.** *(15 min)*

**Esfuerzo:** ~1 día y medio en total.

---

## Fase 3 — Campañas que vendan

Recién acá se construye lo nuevo, con la medición ya funcionando.

- **El CSV de campañas ya está generado** (`accedra/scripts/ads/out/`): campaña de marca +
  Firma Biométrica con sus 6 industrias, cada grupo apuntando a su landing propia.
- Sin concordancia amplia — el dato dice que cuesta 7 veces más por conversión.
- Faltan las otras 4 soluciones: se completan llenando el copy y volviendo a correr el
  generador.

**Esfuerzo:** ~1 día para completar + importar.

---

## Fase 4 — El tablero se vuelve seguimiento

Acá el mismo tablero cambia de función: deja de ser "esto estaba mal" y pasa a ser
"esto mejoró".

Cada mes se le suman los números nuevos y muestra la evolución:

```
Invertimos                $ XXX.XXX      ↑ / ↓ vs mes anterior
Consultas                 XX             ↑ / ↓
Costo por consulta        $ X.XXX        ↑ / ↓
Clientes nuevos           X              ↑ / ↓
```

Más un registro de qué hicimos cada mes y qué esperábamos que pasara — que es lo que
después demuestra que las mejoras no fueron casualidad.

**Esfuerzo:** ~3 días.
**Cuándo:** después de la Fase 2, cuando ya haya conversiones que mostrar.

---

## Resumen

| Fase | Qué | Esfuerzo | Para quién |
|---|---|---|---|
| 1 | Diagnóstico en el backoffice | ~1 día | Dueño y socios |
| 2 | Arreglar lo roto | ~1,5 días | — |
| 3 | Campañas nuevas | ~1 día | — |
| 4 | Tablero de seguimiento mensual | ~3 días | Dueño y socios |

**Total: ~6 días de trabajo.**

Las fases 1 y 2 se pueden hacer en paralelo — una es desarrollo, la otra es configuración
en Google Ads.

---

## Lo que necesito de la empresa

- **Quién marca los leads como ganado o perdido**, y carga el monto del contrato.
  Es un minuto por lead. Sin eso, la Fase 4 no puede mostrar clientes ni retorno.
- **Presupuesto mensual y zona** (¿CABA, AMBA, todo el país?) para configurar las campañas.
- **Confirmar el código postal** de Irala 1950 — el sitio dice C1276 y el geocodificador
  dice C1168. Tiene que coincidir exacto con Google Business.

---

### Documentos de detalle

- `docs/rutina-mensual-ads.md` — el paso a paso mensual, una vez que esté andando
- `docs/como-demostrar-resultados.md` — qué mostrarle a los socios y cuándo
- `accedra/docs/ads/diagnostico.md` — el análisis completo con todos los números
- `accedra/docs/plan-ads-analitica.md` — el detalle técnico de la medición
