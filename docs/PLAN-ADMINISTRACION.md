# Módulo Administración — plan de construcción

Sistema de gestión administrativo de Accedra SA. Fuente: `SISTEMA ADMINISTRATIVO
ACCEDRA.pdf`. Este documento es el plan maestro: se construye una fase por vez y
cada fase deja algo usable en pantalla, no un andamio.

---

## Las cinco decisiones de fondo

Antes de las fases, lo que condiciona todo lo demás.

### 1. Bimonetario = importe original + tipo de cambio congelado

Cada documento guarda **el importe en su moneda** (`moneda` + `importe`) y **el
TC del día en que se cargó** (`tc`). Los valores en la otra moneda son columnas
generadas por Postgres, no cálculos de la UI:

```sql
total_ars numeric generated always as (case when moneda = 'ARS' then total else total * tc end) stored
total_usd numeric generated always as (case when moneda = 'USD' then total else total / tc end) stored
```

Dos consecuencias que importan:

- **El TC no se recalcula nunca.** Una factura de agosto sigue valuada al dólar
  de agosto aunque hoy esté a otro precio. Así lo muestra el estado de cuenta del
  PDF (TC 1.330, 1.420, 1.435 en filas distintas del mismo cliente).
- Los reportes pueden sumar en cualquiera de las dos monedas sin hacer cuentas en
  JavaScript, y las sumas son consistentes entre pantallas.

**Fuente del TC:** dólar oficial venta (Banco Nación), el mismo que ya consume
`/api/dolar` para productos. Se sugiere automáticamente al cargar y **siempre es
editable** — la operación real puede haberse cerrado a otro tipo de cambio.

### 2. Un solo `comprobantes` con discriminador, no dos tablas

Compras y ventas comparten estructura (fecha, punto de venta, número, neto, IVA,
total, moneda, TC, saldo pendiente) y toda la lógica cara: imputación de pagos,
saldo, antigüedad, vencimientos. Duplicarlas significa duplicar esa lógica y que
se desincronice. Una tabla con `tipo in ('compra','venta')` y dos FK excluyentes
(`cliente_id` / `proveedor_id`) resuelve lo mismo con la mitad del código.

El CUIT único es **por módulo** (lo pide el PDF explícitamente): una empresa puede
ser cliente y proveedor a la vez, por eso `clientes` y `proveedores` **sí** son
tablas separadas.

### 3. El movimiento financiero es el libro mayor, y todo desemboca ahí

`movimientos` es la única tabla que toca el saldo de una caja o un banco. Un pago
a proveedor, un cobro, un gasto, una transferencia y un ajuste manual son todos
movimientos con distinto `origen`. No hay tabla `gastos` aparte: un gasto es un
movimiento de egreso con categoría e imputación contable.

Saldo de cuenta = `saldo_inicial + Σ(movimientos con signo)`. Nunca un campo
`saldo` denormalizado que se puede desfasar.

### 4. El saldo pendiente se calcula, no se guarda

Una vista `comprobantes_saldo` hace `total − Σ imputaciones`. Un campo `estado`
guardado se corrompe el día que alguien borra un pago desde la base. La vista es
lo que alimentan "pendientes de pago", "pendientes de cobro" y el semáforo de
vencimientos.

Las notas de crédito no se guardan en negativo: se guardan positivas con un
`signo = -1` derivado de la clase de comprobante. Así el mismo formulario carga
una factura y una NC, y el estado de cuenta las suma solo.

### 5. Paginación del lado del servidor

El catálogo de productos pagina en el cliente porque está entero en caché. Acá
no: las facturas crecen sin techo. Todas las tablas del módulo usan `range()` de
Supabase con filtros y orden en la query, y comparten un componente `<Paginacion>`
y un hook `useTablaAdmin` para que el comportamiento (URL con `?page=`, tamaño de
página, conservar filtros) sea idéntico en las nueve pantallas.

---

## Reglas transversales

**Campos obligatorios (los mínimos indispensables):**

| Entidad | Obligatorio | Todo lo demás |
|---|---|---|
| Cliente / Proveedor | Razón social, tipo (nacional/exterior) | Opcional |
| Comprobante | Fecha, entidad, clase, total, moneda | Opcional |
| Pago / Cobro | Fecha, entidad, importe, cuenta de origen | Opcional |
| Movimiento | Fecha, cuenta, importe, tipo | Opcional |

El CUIT es opcional (un proveedor del exterior no tiene), pero **si se carga, se
valida**: 11 dígitos y dígito verificador módulo 11, normalizado a solo números
para que `30-50054729-0` y `30500547290` no entren como dos empresas distintas.

**Validaciones anti-duplicado:**

- CUIT único entre clientes, y CUIT único entre proveedores (índice parcial, solo
  donde no es nulo). Al escribirlo, la UI avisa **antes** de guardar con un fetch
  de verificación, y la base lo garantiza igual por si dos personas cargan a la vez.
- Comprobante único por `(tipo, entidad, clase, punto de venta, número)`. Cargar
  dos veces la misma factura es el error más caro y más común.
- Razón social parecida → alerta blanda ("ya existe *Finning Argentina SA*, ¿es la
  misma?"), nunca un bloqueo: hay empresas con nombres casi iguales.

**Vencimientos — cómo se visibilizan:** la vista calcula `dias_para_vencer` y cada
fila lleva un semáforo consistente en toda la app:

| Estado | Tono | Regla |
|---|---|---|
| Vencido | `danger` | vencimiento < hoy |
| Vence hoy o mañana | `danger` suave | ≤ 1 día |
| Próximo | `warning` | ≤ 7 días |
| En plazo | `neutral` | ≤ 30 días |
| Lejano | sin marca | > 30 días |

Además: fila con fondo teñido para lo vencido, orden por vencimiento ascendente
por defecto, y un KPI arriba de cada tabla ("3 vencidas · USD 12.400 · $ 17,8 M").

---

## Decisiones tomadas con el usuario (8/8/2026)

- **Sin importador.** Hay datos históricos en Excel pero se cargan desde cero. No
  se construye migración de datos; sí queda la posibilidad de cargar facturas con
  fecha anterior, que es lo que permite arrancar con los pendientes reales.
- **El sistema no numera.** Las facturas de venta se emiten en AFIP y acá se
  registran. Punto de venta y número se cargan a mano — dos sistemas peleándose
  por el correlativo es un problema que no vale la pena tener.
- **Carga inteligente de comprobantes.** Además de la carga manual, se puede
  adjuntar el PDF o la foto de la factura de AFIP: Claude extrae los datos y
  aparece una pantalla de preview donde se valida campo por campo antes de
  guardar. Nada se guarda sin que una persona lo confirme.
- **Ventas y cobros primero.** Es lo que más urge, así que el orden de las fases
  arranca por ahí y compras/pagos vienen después reutilizando el mismo motor.

## Fases

Cada fase es un commit y una entrega revisable.

### Fase 1 — Cimientos ✅
Lo que sostiene el resto. Visible: la sección Administración en la sidebar y el
panel `/admin` con la cotización del día.

- Migración `admin_maestros`: `vendedores`, `clientes`, `proveedores`,
  `plan_cuentas`, `cuentas_financieras` + índices únicos + semillas (plan de
  cuentas argentino mínimo; Caja, Banco Galicia, Banco Macro, MercadoLibre).
- `lib/admin/cuit.ts` — normalización y validación de dígito verificador.
- `lib/admin/moneda.ts` — formateo y conversión ARS/USD.
- `lib/admin/use-cotizacion.ts` — el dólar oficial venta, compartido por los formularios.
- `/api/dolar` accesible también desde administración (rutas multi-módulo).
- Ruta `/admin` con panel + permisos + sidebar.

### Fase 2 — Clientes ✅
ABM completo con paginación del servidor, buscador, validación de CUIT duplicado
y ficha con el estado de cuenta embebido (vacío hasta la fase 4). Acá nacen
`<Paginacion>` y el hook `useTablaAdmin` que reutilizan todas las pantallas.

### Fase 3 — Plan de cuentas y cuentas financieras ⏸️ pendiente
Árbol de cuentas contables y ABM de cajas/bancos.

**Lo único que quedó sin construir.** La migración de la fase 1 sembró 50 cuentas
contables y las 4 cuentas financieras del pliego, y todos los formularios las
consumen por API, así que el sistema funciona entero sin esta pantalla. Falta
para: agregar una cuenta bancaria nueva, abrir una caja en dólares, o cambiar el
plan de cuentas sin entrar a Supabase. También falta el ABM de vendedores, que
hoy se crean solos al tipear un nombre nuevo en la ficha de un cliente.

### Fase 4 — Facturas de venta ✅
Migración de `comprobantes` + vista `comprobantes_saldo`. Carga manual de
FCA/FCB/FCEA/NCA/NDA/NCB/NDB/NCEA/NDEA con moneda, TC, neto, IVA, condición de
pago y vendedor. Listado paginado + **pendientes de cobro con semáforo de
vencimiento** + `<CampoMoneda>` y `<SemaforoVencimiento>`.

### Fase 5 — Carga inteligente de comprobantes ✅
Adjuntar PDF o foto → Claude extrae razón social, CUIT, tipo, punto de venta,
número, fechas, neto, IVA, percepciones, moneda y total → pantalla de preview con
cada campo editable, el nivel de confianza de la extracción marcado y el cliente
matcheado por CUIT (o la opción de crearlo ahí mismo). Soporta varios archivos de
una vez.

### Fase 6 — Cobros de clientes ✅
Recibo con imputación a varias facturas, retenciones (IVA, IIBB, SUSS, Ganancias)
y acreditación en la cuenta que corresponda. Genera movimientos.

### Fase 7 — Proveedores ✅
Mismo alcance que clientes, con la ficha adaptada.

### Fase 8 — Facturas de compra ✅
FcA / FcC / NcA / NdA / NcC con percepciones IIBB/IVA e importes no gravados,
sobre el mismo motor de la fase 4 e incluida la carga inteligente. Pendientes de
pago con semáforo.

### Fase 9 — Pagos a proveedores y gastos ✅
Orden de pago con imputación, retención de ganancias, medio de pago y número de
transferencia o cheque. Gastos sin factura (impuestos, bancarios, sueldos).

### Fase 10 — Caja y bancos ✅
Movimientos manuales, transferencias entre cuentas propias —incluida la
compra/venta de dólares con su TC—, saldos por cuenta y marcado de conciliación.

### Fase 11 — Reportes y estados de cuenta ✅
Los cuatro reportes operativos del PDF, el estado de cuenta por cliente, proveedor
y cuenta contable con saldo corrido en las dos monedas, y exportación a CSV/Excel.

---

## Modelo de datos (referencia)

```
clientes ──┐                        ┌── vendedores
           ├─< comprobantes >───────┤
proveedores┘        │               └── plan_cuentas
                    │
                    └─< imputaciones >─── pagos ──< movimientos >── cuentas_financieras
                                                        │
                                                        └── (gastos, transferencias, ajustes)
```

- `comprobantes` — facturas y notas de compra y de venta.
- `imputaciones` — qué parte de qué pago cancela qué comprobante.
- `pagos` — órdenes de pago y recibos de cobro, con sus retenciones.
- `movimientos` — el libro mayor de caja, bancos y MercadoLibre.
- Vistas: `comprobantes_saldo`, `cuentas_saldo`, `estado_cuenta`.
