# Distecna API V2 — Plan de integración y pedidos

> Documento de trabajo. Última actualización: 29 de julio de 2026.
> Referencia técnica: `docs/distecna-api-v2.1.pdf` (no versionado — confidencial).

---

## 1. Resumen en una pantalla

**Los pedidos ya funcionan**, pero solo con los productos que existen en el entorno de
homologación (QA) de Distecna. Para que funcionen con todo el catálogo hace falta acceso a
V2 en producción, y ese acceso **hoy no existe**: el dominio de producción no resuelve por DNS.

| Qué | Estado |
|---|---|
| Crear pedidos contra QA desde la app | ✅ Funcionando y deployado |
| Pedidos con todo el catálogo (3.433 productos) | ⛔ Bloqueado — falta host de producción |
| Pedidos reales (que lleguen al depósito) | ⛔ Bloqueado — falta aprobar homologación |
| Seguimiento de estado del pedido | ⛔ No existe en la API |

**El primer paso es el mail de la sección 3.** Todo lo demás depende de esa respuesta.

---

## 2. Por qué hace falta V2 (y no alcanza la API actual)

La app usa hoy la **API V1**: `api.distecna.com:8096`, autenticada con header `x-apikey`.
De ahí sale el catálogo de 3.433 productos.

El problema es un campo: para crear un pedido, `POST /v2/Order` exige **`productType`**
(valores como `NWOTRO`, `PCACCS`, `MMDM`, `NWROUT`, `NWSWIT`).

Verificado empíricamente:

- La V1 **no devuelve `type`** en ningún endpoint. El detalle de producto trae 17 campos y
  ninguno es el tipo.
- La ruta `/Product/{code}/{type}` **no existe** en V1 (da 404).
- **No se puede deducir** del código ni de la categoría. El listado de V2 no devuelve
  `category`, así que ni siquiera se puede construir una tabla de equivalencias sin hacer
  3.078 llamadas de detalle — y aun así sería una inferencia, no el dato real.

**Conclusión: el `type` solo existe en V2.** Mientras el catálogo venga de V1, cada pedido
tiene que resolver el `type` consultando V2 en el momento, y eso solo funciona para los
productos que estén en ese entorno.

### El problema de cobertura hoy

| Catálogo | Productos |
|---|---|
| V1 producción (lo que usa la app) | 3.433 |
| V2 QA (donde podemos resolver el `type`) | 3.078 |

No son el mismo conjunto: QA es un snapshot de prueba. De los 3 productos actuales en
Nuestros Productos, **solo 1 se puede pedir**:

| Código | En QA | `type` |
|---|---|---|
| `TARTSB968GL` | ✅ | `PCACCS` (ya guardado) |
| `LOG981-001411-1` | ❌ | — |
| `TPLHX520-1-PACK` | ❌ | — |

Ese es el error que aparece en pantalla: *"No se pudo determinar el tipo de producto"*.
No es un bug, es esta limitación.

---

## 3. EL MAIL A ENVIAR

**Para:** `api@distecna.com`
**Asunto:** `Consulta técnica - Integración API V2 - Host de producción no resuelve - Accedra IT Solutions`

> Copiar desde acá. Los campos entre `[corchetes]` hay que completarlos.

---

Buenos días,

Somos **Accedra IT Solutions** y estamos integrando nuestra plataforma con la API V2,
siguiendo la *Guía de Homologación e Integración API V2* (versión 2.1, abril 2026).

Ya completamos la mayor parte del checklist de validación en el entorno QA y tenemos tres
consultas que nos impiden avanzar a producción.

**Datos de contacto técnico**

- Empresa: Accedra IT Solutions
- Responsable técnico: [TU NOMBRE]
- Email: [TU EMAIL]
- Teléfono: [TU TELÉFONO]
- Usuario de homologación utilizado: `distecna_api@distecna.com`

---

**Consulta 1 — El host de producción no resuelve por DNS**

La sección 5.1 de la guía indica estas URLs para producción:

- Autenticación: `https://dsaapi.distecna.com:8087`
- API V2: `https://dsaapi.distecna.com:8088`

El dominio `dsaapi.distecna.com` **no resuelve por DNS**. No es un problema de firewall ni
de puerto cerrado: la resolución de nombre falla directamente.

Comprobación realizada el 29/07/2026:

```
dsaapi.distecna.com          -> FALLA DNS (nodename nor servname provided)
qa-apipublica.distecna.com   -> 190.12.102.20   (resuelve, puertos 8086 y 8088 abiertos)
api.distecna.com             -> 64.190.27.41    (resuelve, API V1 responde 200)
```

¿Nos confirman cuál es el host correcto de producción, o si el dominio se publica
únicamente después de aprobar la homologación?

---

**Consulta 2 — Habilitación del acceso a producción**

Relacionado con lo anterior: ¿el acceso a producción requiere que nos habiliten una IP de
origen (allowlist)?

Lo preguntamos porque nuestra aplicación corre en **Vercel**, cuyas direcciones IP de salida
son **dinámicas** y cambian entre ejecuciones. Si hace falta allowlist, necesitaríamos saberlo
para resolverlo por otra vía (por ejemplo, un proxy con IP fija), y nos gustaría contemplarlo
antes de dar por cerrada la integración.

---

**Consulta 3 — Consulta de estado de un pedido**

El catálogo de endpoints de la sección 6 incluye `POST /v2/Order` para crear pedidos, pero no
encontramos ningún endpoint para **consultar un pedido ya creado** (estado, listado o
cancelación).

¿Existe algún endpoint de consulta de estado, aunque no esté documentado en esta versión de la
guía, o está previsto en el roadmap? Hoy, una vez creado el pedido, el `salesOrderId` es el
único dato que conservamos y no tenemos forma de saber por API si se despachó o facturó.

---

**Consulta 4 — Cobertura del catálogo en producción**

Observamos que el catálogo de QA tiene 3.078 productos, mientras que la API V1
(`api.distecna.com:8096`) nos devuelve 3.433. Varios códigos que sí están en V1 no aparecen en
QA (por ejemplo `TPLHX520-1-PACK` y `LOG981-001411-1`).

¿Nos confirman que el catálogo de **V2 en producción** incluye la totalidad de los productos
que hoy expone la V1? Lo necesitamos porque el campo `type` —obligatorio para crear pedidos—
solo lo devuelve la V2, y sin él no podemos generar pedidos de esos productos.

---

**Estado de nuestra homologación**

Para su referencia, ya validamos exitosamente en QA:

- Obtención de token JWT vía `POST /Auth/API/login`
- Autorización con header `Authorization: Bearer <token>`
- `GET /v2/Product?search=&limit=&offset=` (catálogo paginado)
- `GET /v2/Product/{code}/{type}` (detalle)
- `GET /v2/PaymentTerms` y `GET /v2/DeliveryAddresses`
- `POST /v2/Order` completo (con `paymentTermId` y `deliveryAddressId`)
- `POST /v2/Order` mínimo (solo `products`, validando los defaults de la cuenta)
- Manejo de error 400 (validación de cantidad)

Pedidos de prueba generados en QA: `PED-158154-L6J7C3`, `PED-158155-G9P5B5`,
`PED-158157-K4R7F6`.

Quedamos a disposición para cualquier dato adicional que necesiten.

Saludos cordiales,
[TU NOMBRE]
Accedra IT Solutions

---

> Fin del mail.

---

## 4. Checklist de homologación

Los 8 puntos que Distecna exige (sección 4.9 de la guía) antes de dar credenciales de
producción.

| # | Punto | Estado |
|---|---|---|
| 1 | Autenticación: obtener token JWT | ✅ Validado |
| 2 | Autorización: header `Bearer` | ✅ Validado |
| 3 | Consulta de catálogo paginado | ✅ Validado |
| 4 | Consulta por código + tipo | ✅ Validado |
| 5 | Condición de pago (guardar el `id`) | ✅ Validado — `a3561bdf-02d4-e511-9bc9-e006e6d53770` |
| 6 | Direcciones de entrega (guardar el `id`) | ✅ Validado — `8f7bf874-c51b-f111-b938-005056010173` |
| 7 | Pedido completo y pedido mínimo | ✅ Validado — 3 pedidos creados |
| 8 | Renovación de token + manejo de errores | ⚠️ **Parcial — ver abajo** |

### Lo que falta del punto 8

**a) Demostrar la renovación de token** — *implementado, no demostrado.*

El código ya cachea el token por 55 minutos y reintenta una vez ante un 401
(`src/lib/distecna-v2.ts`). Falta probarlo de forma verificable sin esperar una hora: bajar
`TOKEN_TTL_MS` a 1 minuto, hacer dos llamadas espaciadas y confirmar que la segunda obtiene un
token nuevo sin fallar.

*Esfuerzo: ~15 minutos.*

**b) Implementar backoff exponencial para 429 y 503** — *no implementado.*

Hoy el cliente reintenta solo ante 401. Si Distecna responde 429 (demasiadas peticiones) o 503
(servicio no disponible), la llamada falla y no se reintenta.

Esto importa sobre todo para el sync del catálogo, que hace miles de llamadas seguidas y es
justo el patrón que dispara un 429: **hoy, un 429 a mitad del sync corta la sincronización
completa.** Con backoff, espera y continúa.

Hay que reintentar esperando cada vez más (1s → 2s → 4s → 8s), con un máximo de 4 intentos.

*Esfuerzo: ~1 hora.*

### Después del checklist

Se envían los resultados a `api@distecna.com` y se pide la revisión. Según la guía, la
aprobación toma **entre 1 y 5 días hábiles**, y con ella llegan las credenciales de producción.

---

## 5. Pasar a producción (cuando Distecna habilite el acceso)

**No requiere cambios de código.** Las URLs y credenciales están externalizadas
justamente para que este paso sea solo configuración.

En Vercel → Settings → Environment Variables, actualizar en **Production**:

| Variable | Valor actual (QA) | Valor de producción |
|---|---|---|
| `DISTECNA_AUTH_URL` | `https://qa-apipublica.distecna.com:8086` | `<host prod>:8087` |
| `DISTECNA_API_URL` | `https://qa-apipublica.distecna.com:8088` | `<host prod>:8088` |
| `DISTECNA_USER` | `distecna_api@distecna.com` | *lo entrega Distecna* |
| `DISTECNA_PASS` | *(ver `.env.local`)* | *lo entrega Distecna* |
| `DISTECNA_ENV` | `qa` | `prod` |
| `DISTECNA_APP` | `API` | `API` (no cambia) |

Después: **redeploy** (las variables se aplican en el build, no en caliente).

`DISTECNA_ENV=prod` apaga el cartel amarillo de "entorno de homologación" en la UI y quita la
etiqueta QA de los pedidos nuevos.

**Verificación:** generar un pedido real de 1 unidad de algo de bajo costo y confirmar que
aparece en el portal de Distecna.

*Esfuerzo: ~15 minutos.*

⚠️ **Importante:** nunca usar las credenciales de QA en producción, y no borrar los pedidos QA
existentes de la tabla `orders` — quedan marcados con `environment = 'qa'` justamente para no
confundirlos con compras reales.

---

## 6. Migrar el catálogo de V1 a V2

Esta es la migración de fondo, y es **lo que hace que los pedidos funcionen con todo el
catálogo** en lugar de solo con los productos presentes en QA.

**Archivos a reescribir — hay DOS implementaciones del sync, casi idénticas:**

| Archivo | Cuándo corre |
|---|---|
| `scripts/sync-products.mjs` | **El que realmente sincroniza.** Cron diario de GitHub Actions (`.github/workflows/sync-products.yml`, 3am UTC) |
| `supabase/functions/sync-products/index.ts` | Edge function, on-demand: solo si la tabla está vacía o al tocar "Actualizar" |

Las dos usan el mismo `BATCH_SIZE = 35` y `UPSERT_CHUNK = 500`. **Hay que migrar las dos, o
mejor, unificarlas en una sola** para no mantener lógica duplicada.

Hoy hacen 3.434 llamadas a V1 (una de listado + una de detalle por producto) con
`unsafeIgnoreTls` porque el certificado de V1 es autofirmado.

**Duración medida:** ~29 a 39 minutos por corrida completa.

### Pasos

1. **Login JWT, con renovación cada 55 minutos.** El sync tarda ~30 min, así que el token de
   1 hora normalmente **no** alcanza a vencer — pero conviene igual, porque las corridas más
   largas que vi llegaron a 39 minutos y cualquier degradación de la API acerca el margen.

2. **Listado paginado:** `GET /v2/Product?search=&limit=500&offset=N`. Son 7 páginas en lugar
   de una sola llamada. Ya probado contra QA: devuelve los 3.078 correctamente.

3. **Detalle:** `GET /v2/Product/{code}/{type}`. **El orden importa** — este endpoint necesita
   el `type`, que sale del listado del paso 2. Primero listado, después detalle.

4. **Guardar `type`** en la columna `products.type` (ya creada).

5. **Quitar `unsafeIgnoreTls`.** Verificado: V2 tiene certificado válido y el `fetch` nativo
   funciona sin bypass. Un problema de seguridad menos.

### Beneficios más allá del `type`

- Búsqueda y paginación del lado del servidor. Hoy traemos los 3.433 productos al cliente y
  filtramos ahí.
- Certificado TLS válido.
- Una sola API en lugar de dos.

### ⚠️ Riesgo a validar antes de cortar V1

**Los precios de V1 y V2 podrían no coincidir.** En QA vi el mismo producto a `U$S 0,61` en V1
y `U$S 1,82` en V2 — pero QA tiene datos ficticios, así que no prueba nada.

En producción hay que comparar **antes** de reemplazar. Si difieren, cambia el precio mínimo de
todo el catálogo y por lo tanto el semáforo de todas las publicaciones.

**Recomendación: sincronizar primero a una tabla paralela** (`products_v2`) y comparar precio,
stock e IVA producto por producto. Recién con eso a la vista, decidir el corte.

*Esfuerzo: ~1 día el sync + medio día de validación comparativa.*

---

## 7. Limitación que no se resuelve con nada de lo anterior

**La API no permite consultar pedidos.** El catálogo completo son 5 endpoints y
`POST /v2/Order` es el único de pedidos: no hay GET de estado, ni listado, ni cancelación.

Consecuencias, para tenerlas claras:

- La pantalla de Pedidos muestra **nuestro** registro, no el estado real en el ERP de Distecna.
- Un pedido creado no se puede cancelar por API.
- Si el pedido se crea en Distecna pero falla al guardarse en nuestra base, **el número no se
  puede recuperar**. Por eso la app lo muestra en pantalla con una advertencia explícita en ese
  caso: hay que anotarlo.
- El seguimiento (despacho, facturación) sale del portal de Distecna.

Está preguntado en la Consulta 3 del mail. Si responden que existe un endpoint no documentado,
conviene rediseñar la pantalla de Pedidos para reflejar estado real.

---

## 8. Referencia técnica

### Entornos

| | QA (homologación) | Producción |
|---|---|---|
| Auth | `https://qa-apipublica.distecna.com:8086` | `dsaapi.distecna.com:8087` ⛔ no resuelve |
| API | `https://qa-apipublica.distecna.com:8088` | `dsaapi.distecna.com:8088` ⛔ no resuelve |
| Certificado TLS | Válido | — |

La API V1 que sigue usando el catálogo: `https://api.distecna.com:8096` con header `x-apikey`,
certificado autofirmado.

### Endpoints de V2

| Método | Endpoint | Auth |
|---|---|---|
| POST | `/Auth/API/login` | — (es el único sin token) |
| GET | `/v2/Product?search=&limit=&offset=` | Bearer |
| GET | `/v2/Product/{code}/{type}` | Bearer |
| GET | `/v2/PaymentTerms` | Bearer |
| GET | `/v2/DeliveryAddresses` | Bearer |
| POST | `/v2/Order` | Bearer |

El token JWT dura **1 hora**. Todos los endpoints devuelven JSON UTF-8, salvo el login, que
devuelve el token como **texto plano** (no JSON).

### Formato del pedido

```json
{
  "products": [
    { "productCode": "COM760249702", "productType": "NWOTRO", "quantity": 10 }
  ],
  "paymentTermId": "a3561bdf-02d4-e511-9bc9-e006e6d53770",
  "deliveryAddressId": "8f7bf874-c51b-f111-b938-005056010173"
}
```

`paymentTermId` y `deliveryAddressId` son **opcionales**. Sin ellos, Distecna usa la condición
de pago default de la cuenta y el pedido queda sin dirección asignada.

Respuesta: `{ "success": true, "salesOrderId": "PED-158157-K4R7F6", "message": "..." }`

### Códigos de error relevantes

| Código | Significado | Qué hace la app |
|---|---|---|
| 400 | Datos inválidos, o **sin stock** | Muestra el mensaje de Distecna. Ante el genérico *"Error al crear el pedido"* explica que suele ser falta de stock |
| 401 | Token vencido | Renueva y reintenta una vez |
| 404 | Recurso inexistente | Propaga |
| 429 / 503 | Sobrecarga / servicio caído | ⚠️ **Falta backoff** — ver sección 4 |

Ojo con el 400: ante falta de stock Distecna responde el genérico *"Error al crear el pedido"*,
sin decir cuál es el problema.

### Archivos del proyecto

| Archivo | Qué hace |
|---|---|
| `src/lib/distecna-v2.ts` | Cliente V2: login, cache de token, reintento 401, todos los endpoints |
| `src/app/api/orders/route.ts` | Crea el pedido y lo persiste. Resuelve el `type` faltante contra V2 |
| `src/app/api/distecna/checkout/route.ts` | Condición de pago y direcciones para el modal |
| `src/components/order-dialog.tsx` | Modal de confirmación |
| `src/components/orders-table.tsx` | Historial en `/orders` |
| `src/components/mis-productos-table.tsx` | Selección, cantidad y barra de pedido |
| `supabase/migrations/20260729_orders.sql` | Tablas `orders`, `order_items`, columna `products.type` |
| `scripts/sync-products.mjs` | Sync del catálogo que corre por cron — **todavía en V1** |
| `.github/workflows/sync-products.yml` | Cron diario, 3am UTC, que ejecuta el script de arriba |
| `supabase/functions/sync-products/index.ts` | Segunda copia del sync, on-demand — **todavía en V1** |

### Producto de prueba de QA

`COM760249702`, tipo `NWOTRO`, con stock alto (~104.450) y constante. Es el único con el que se
puede probar el flujo completo de punta a punta hoy.

---

## 9. Orden de ejecución

| # | Tarea | Esfuerzo | Depende de |
|---|---|---|---|
| 1 | **Mandar el mail de la sección 3** | 10 min | — |
| 2 | Implementar backoff 429/503 | ~1 h | — |
| 3 | Demostrar renovación de token | ~15 min | — |
| 4 | Enviar homologación a revisión | 15 min | 2 y 3 |
| 5 | Recibir credenciales de producción | 1-5 días hábiles | 1 y 4 |
| 6 | Cambiar variables en Vercel + redeploy | 15 min | 5 |
| 7 | Sync del catálogo a V2 (trae el `type`) | ~1,5 días | 5 |

Las tareas **1, 2 y 3 se pueden hacer hoy** y no dependen de nadie. La 1 es la más urgente
porque destraba la 5, que es el camino crítico.
