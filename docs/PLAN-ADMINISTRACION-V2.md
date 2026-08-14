# Administración v2 — plan de construcción

Segunda etapa del módulo. La v1 (`PLAN-ADMINISTRACION.md`) dejó el circuito
funcionando de punta a punta: clientes, proveedores, facturas, cobros, pagos,
caja y reportes. Esta etapa toma tres insumos nuevos —los seis puntos del
documento *Temas para ver*, el plan de cuentas real del contador (225 cuentas) y
el extracto del Galicia del `EJEMPLO.xlsx`— y los convierte en un sistema que un
contador puede usar sin traducir nada.

**La diferencia de fondo entre v1 y v2:** la v1 registra plata, la v2 registra
**contabilidad**. Hoy cada documento apunta a una sola cuenta contable y no tiene
contrapartida; a partir de acá cada documento genera su asiento y todo se puede
leer desde el libro diario, el mayor y el estado de cuenta sin que nadie arme un
Excel intermedio.

---

## 0 · Diagnóstico — cada punto validado contra el código

Antes de proponer nada, revisé qué de lo pedido ya funciona, qué está a medias y
qué tiene una causa raíz concreta. Tres de los seis puntos son **bugs con
ubicación exacta**, no funcionalidad faltante.

| # | Pedido | Estado real | Causa raíz |
|---|---|---|---|
| 1 | Asiento interno automático (MERCADERÍA / IVA / PERCEP a PROVEEDORES) | **No existe** | `comprobantes` tiene una sola `cuenta_contable_id` y ninguna contrapartida. No hay tabla de asientos. |
| 2 | Con el TC, que refleje el valor en USD (hoy muestra el mismo número en pesos y en dólares) | **Bug confirmado** | `comprobantes-server.ts:80` fuerza `tc = 1` cuando la moneda es ARS. La columna generada `total_usd = total / tc` devuelve entonces el mismo importe. |
| 3 | Caja y Bancos: registrar movimientos por cuenta, asociados a cuentas contables (rescates, impuestos, gastos bancarios, sueldos) | **A medias** | Existen `movimientos` con `categoria` (6 valores fijos) y `cuenta_contable_id` **opcional**. Falta la vista por cuenta, las plantillas por tipo de operación y que la imputación contable sea obligatoria. |
| 4 | Retenciones IIBB abiertas en CABA y Bs As | **No existe** | `pagos` tiene cuatro columnas fijas (`ret_ganancias`, `ret_iva`, `ret_iibb`, `ret_suss`). No hay dónde poner la jurisdicción. |
| 5 | Cobrar en pesos una factura en USD al TC que uno ponga | **Bug confirmado** | `pagos-handlers.ts:113-123` fuerza `tc = 1` si el recibo es en ARS. Después `convertir(importe, "USD", "ARS", 1)` deja la imputación en dólares y el recibo no cuadra — es exactamente el error del screenshot: *“no cuadra por 4.679.859,00. Imputado 3.263,50, cobrado 4.097.373,69”*. |
| 6 | En reportes, que el saldo del banco se vea en pesos (hoy una parte en USD y otra en pesos) | **Consecuencia del 5** | El movimiento hereda la moneda **del recibo** (`pagos-handlers.ts:224-234`), no la de la cuenta. Nada impide insertar un movimiento en USD sobre el Galicia en pesos. |

Y del mensaje del pedido, aparte de los seis puntos:

| Pedido | Estado real |
|---|---|
| Caja y Bancos con el listado tipo reportes (Caja, Mercado Libre, cada banco) y poder entrar a cada uno | Las tarjetas de saldo existen (`cuentas-client.tsx:150-179`) pero solo filtran una tabla común. No hay pantalla por cuenta. |
| Que adentro se vea como el archivo enviado, cargándose con lo que uno ingresa | El `EJEMPLO.xlsx` **no es un ejemplo de facturas**: es un extracto del Banco Galicia (`FECHA · CONCEPTO · DÉBITOS · CRÉDITOS · SALDO · DETALLE`, 11/08/2026, saldo corrido de $18,9 M). Es el formato exacto de la pantalla que falta — y además la base de un importador de extractos. |
| Editar antes de confirmar al cargar una factura | **Ya existe** en la carga inteligente (`importar-facturas-dialog.tsx`: adjuntar → revisar campo por campo → guardar). Lo que falta es el estado **borrador** y poder editar después de guardado. |
| Ver por cliente toda su información | Parcial: `detalle-server.ts` devuelve últimos 8 comprobantes y 6 pagos en un panel lateral. No hay ficha propia con historia completa. |
| Facturas de venta → cobros, facturas de compra → pagos | **Ya funciona**: `comprobantes_saldo` alimenta pendientes de cobro y de pago. Falta que sea evidente en la UI (cobrar desde la fila de la factura). |
| Tipos de proveedor para filtrar | No existe clasificación de entidades. |

---

## 1 · Las cuatro decisiones nuevas

Lo que condiciona todo lo demás. Las cinco decisiones de la v1 siguen vigentes
(bimonetario con TC congelado, una tabla de comprobantes, el movimiento como
libro mayor de caja, saldo calculado y no guardado, paginación del servidor).

### 1.1 · El TC se guarda siempre, también en pesos

Hoy un comprobante en pesos se guarda con `tc = 1` a propósito, con este
comentario: *“un comprobante en pesos con TC 1.500 haría que `total_usd` diera
cualquier cosa”*. Es al revés: es lo único que hace que `total_usd` dé bien.

`tc` deja de ser “el TC de la operación en dólares” y pasa a ser **el TC de
valuación del documento**: cuántos pesos valía un dólar el día que se emitió.
Con eso:

- `total_ars` no cambia (para ARS ya usa `total` directo).
- `total_usd` pasa a dar el contravalor real en vez de repetir el número.
- El estado de cuenta puede sumar en dólares históricos sin inventar nada.

Requiere una tabla `cotizaciones (fecha, compra, venta, fuente)` alimentada por
`/api/dolar` —que ya existe— más un backfill de los documentos ya cargados con
el dólar de su fecha. El TC sigue siendo editable: la operación real puede
haberse cerrado a otro valor.

### 1.2 · La moneda del movimiento es la de la cuenta, no la del documento

Un Banco Galicia en pesos no puede recibir un movimiento en dólares. Hoy nada lo
impide y por eso el saldo del Galicia muestra una parte en cada moneda.

Regla nueva: el movimiento se guarda **siempre en la moneda de su cuenta**, y
lleva además `importe_origen` + `moneda_origen` + `tc_aplicado` para no perder de
dónde salió. Un cobro en pesos de una factura en dólares queda así:

```
factura     USD 3.263,50   (TC 1.435 del día de emisión)
imputación  USD 3.263,50   ← cancela en la moneda de la factura
retenciones ARS   585.748,81
movimiento  ARS 4.097.373,69 en Banco Galicia (ARS)   origen: USD 2.855,31 @ 1.435
```

Esto arregla los puntos 5 y 6 de raíz y hace que el extracto del banco cierre
contra el resumen real.

### 1.3 · Las retenciones son filas, no columnas

Agregar `ret_iibb_caba` y `ret_iibb_bsas` resuelve el pedido de hoy y repite el
problema mañana: el plan del contador ya tiene retenciones de IIBB de **siete
jurisdicciones** (Cap. Fed., Bs As, Santa Fe, Córdoba, Mendoza, Neuquén, Entre
Ríos) más las percepciones de tres.

Va una tabla `pago_retenciones` con tipo, jurisdicción, cuenta contable, base,
alícuota, importe y número de certificado. Las cuatro columnas actuales se
migran a filas y quedan como vista de compatibilidad hasta terminar el corte. El
beneficio extra: cada retención sabe contra qué cuenta contable imputa, que es
justo lo que necesita el motor de asientos, y se puede emitir el certificado.

### 1.4 · El asiento se genera al confirmar, y el documento pasa a ser inmutable

El punto 1 del documento pide el asiento interno. Un asiento que se puede editar
por separado del documento que lo originó se desincroniza el primer día. La
regla: el asiento **no se edita nunca a mano**; se borra y se rehace desde el
documento. Y para que eso sea posible sin sorpresas, el comprobante gana un
estado:

```
borrador  →  confirmado  →  anulado
   ↑              ↓
   └── editable   └── genera asiento · entra en saldos, IVA y reportes
```

Un borrador es 100% editable, no genera asiento y no cuenta para ningún saldo.
Confirmar valida y escribe el asiento. Editar un confirmado **sin imputaciones**
lo devuelve a borrador dejando rastro en auditoría; con imputaciones se bloquea y
se ofrece emitir una nota de crédito, que es lo correcto. Anular contraasienta y
conserva el número.

Esto es también la respuesta completa al pedido de *“editar antes de
confirmar”*: hoy eso solo existe en la carga inteligente y solo antes del primer
guardado.

---

## 2 · Fases

Cada fase es un commit y deja algo usable en pantalla.

### Bloque A — Lo que ya duele (arreglos)

#### F1 · TC de valuación · arregla el punto 2 ✅
- Tabla `cotizaciones` + carga diaria desde `/api/dolar` + carga manual de histórico.
- Sacar el `tc = 1` forzado de `comprobantes-server.ts:80`, `pagos-handlers.ts:114` y el equivalente de movimientos.
- Backfill de los documentos ya cargados con el dólar de su fecha.
- En la fila del listado, el contravalor deja de repetir el importe.

#### F2 · Cobros y pagos en moneda cruzada · arregla los puntos 5 y 6 ✅
- El TC del recibo se exige (y se sugiere) cuando la moneda del recibo difiere de la de alguna factura imputada, no cuando el recibo es en dólares.
- El movimiento se guarda en la moneda de su cuenta, con `importe_origen` / `moneda_origen` / `tc_aplicado`.
- El diálogo de cobro muestra en vivo, arriba del botón, las dos monedas: *“Cancela USD 3.263,50 · $ 4.683.122,50 al TC 1.435”*.
- Migración de los movimientos ya cargados en moneda distinta a la de su cuenta.
- **Editar un cobro**: hoy solo se puede borrar (`cobros/[id]/route.ts` tiene `GET` y `DELETE`, sin `PATCH`).

#### F3 · Retenciones por jurisdicción · arregla el punto 4 ✅
- Tabla `pago_retenciones` + catálogo de jurisdicciones + migración de las cuatro columnas.
- Bloque de retenciones del recibo como lista: tipo, jurisdicción, base, alícuota, importe, certificado.
- Cálculo sugerido según el régimen del cliente/proveedor, siempre corregible.
- Certificado de retención imprimible (lo pide cualquier proveedor al que se le retiene).

#### F4 · Caja y Bancos, dos niveles · arregla el punto 3 y el pedido principal ✅
**Índice `/admin/cuentas`** — la grilla de cuentas como en reportes: Caja, Dólares
efectivo, Banco Galicia $, Banco Galicia USD, Banco Nación, Banco Macro, Mercado
Libre, Cheques en cartera, VISA Galicia. Cada tarjeta: saldo actual, movimiento
del mes, cantidad sin conciliar, y clic para entrar.

**Extracto `/admin/cuentas/[id]`** — con el formato exacto del `EJEMPLO.xlsx`:

| FECHA | CONCEPTO | DÉBITOS | CRÉDITOS | SALDO | DETALLE |
|---|---|---|---|---|---|
| 11/08/26 | TRF INMED PROVEEDORES | 21.706.943,40 | | 18.928.894,93 | Pago INFOBYTE SA FcA 00001-00000193 y 204 |
| 11/08/26 | COM GESTIÓN TRANSFERENCIA | 1.000,00 | | 18.927.894,93 | |
| 11/08/26 | IVA | 210,00 | | 18.927.684,93 | |

- Saldo corrido resuelto en la query con `sum() over (order by fecha, created_at)`, arrancando del saldo inicial de la cuenta.
- Cabecera del período: saldo inicial, total débitos, total créditos, saldo final — en la moneda de la cuenta, sin mezclar.
- Filtros: rango de fechas, origen, conciliado, cuenta contable, texto libre.
- El detalle enlaza al documento que lo originó (el recibo, la orden de pago, la factura).
- Exportación a Excel con el mismo layout, para mandárselo al contador tal cual.

#### F5 · Carga de movimientos con plantillas · completa el punto 3 ⏸️ pendiente
Botón “Registrar movimiento” **dentro** de la cuenta, con la cuenta ya elegida, y
una plantilla por cada operación que pidieron:

| Plantilla | Qué hace | Imputación por defecto |
|---|---|---|
| Rescate / suscripción de fondos | Mueve entre la cuenta financiera y el fondo (FIMA Renta, FIMA Ahorro) | Fondo ↔ banco + Resultado por tenencia |
| Carga de impuestos | Egreso con período y vencimiento | IVA a pagar / IIBB a pagar / Plan de pagos AFIP |
| Gastos bancarios | Permite los tres renglones juntos (comisión, IVA, ley 25413) | Gastos bancarios · IVA CF · Impuesto al cheque |
| Pago de sueldos | Egreso con período y empleado | Sueldos a pagar / Cargas sociales a pagar |
| Transferencia entre cuentas propias | Incluye compra/venta de dólares | Diferencia de cambio automática |

La cuenta contable pasa a ser **obligatoria** en todos: es lo que hace que el
asiento salga solo y que el mayor cierre.

### Bloque B — El cimiento contable

#### F6 · Plan de cuentas real ✅ *(migración hecha · falta la pantalla de mantenimiento)*
El Excel del contador trae 225 cuentas y, más importante, **los flags que el
motor de asientos necesita**:

| Columna del Excel | Qué significa | Para qué sirve |
|---|---|---|
| `Codigo` / `Nombre` | 1 Caja, 201 Proveedores, 505 Compras de Materiales… | Reemplaza el plan semilla actual |
| `Rubro` | ACT · PAS · PAT · PER · GAN | Mapea 1:1 con el `tipo` actual (activo/pasivo/patrimonio/egreso/ingreso) |
| `Subcuent` | La cuenta lleva auxiliar | Habilita el submayor |
| `Tipo_SubCta` | CL (cliente) · PR (proveedor) | **Esto es el punto 1**: la cuenta 25 “Créditos por ventas” es CL y la 201 “Proveedores” es PR |
| `Banco` | Es una cuenta bancaria | Enlaza con `cuentas_financieras` |
| `Valores` | Maneja cheques | Cartera de valores y cheques diferidos |
| `L_Iva` | CO (compras) · VE (ventas) | Habilita el libro IVA sin configurar nada más |
| `Mon_Extr` | Opera en moneda extranjera | Valuación y diferencia de cambio |
| `Medio_Pago` | Se puede usar como medio en un recibo | Llena los selectores de cobros y pagos |

- Ampliar `plan_cuentas` con esas columnas + importar las 225.
**Lo que ya está construido** — migración `20260813_01_plan_cuentas_contador.sql`:

- Las 224 cuentas importadas con sus nueve atributos, y las 5 que el contador marcó *"NO USAR"* / *"SIN USO"* entran desactivadas.
- Tabla de equivalencias del plan semilla al nuevo (32 cuentas imputables, todas mapeadas) que repunta comprobantes, movimientos y cuentas financieras **antes** de borrar las viejas. Las FK son `on delete set null`: borrar primero perdería la imputación en silencio.
- Guardia de una sola corrida. La migración no puede ser idempotente —el paso 2 aparta el plan vigente para liberar los códigos— así que una segunda corrida aborta con un mensaje claro y sin tocar un dato.
- **`config_contable`**: 20 cuentas de sistema (`deudores_por_ventas` → 25, `proveedores` → 201, `iva_debito_fiscal` → 225, `ret_iibb_caba_sufrida` → 57…) para que el motor de asientos de F7 no tenga códigos escritos a mano.
- **Cuenta contable habitual** en la ficha de cada cliente y proveedor, que el formulario de comprobantes completa solo al elegir la entidad. Es lo que hace que 224 cuentas no se sientan al cargar.
- `<SelectorCuenta>`: buscador sin acentos, ordenado por relevancia, con las últimas usadas arriba y navegación por teclado. Reemplaza al `<select>` en facturas, gastos y fichas — con 224 opciones una lista desplegable empuja a dejar todo "sin imputar".

**Lo que falta de esta fase:**

- Pantalla `/admin/plan-cuentas`: árbol por rubro, buscador, ABM, activar/desactivar, marcar imputable. Es la fase 3 de la v1, que quedó pendiente. Hoy el plan se edita desde Supabase.
- ABM de vendedores, que hoy se crean solos al tipear un nombre nuevo.
- Revisar con el contador las 9 equivalencias marcadas *aprox* en la migración: son las cuentas donde la semilla agrupaba y el plan real discrimina (`IVA crédito fiscal` → `40 IVA Crédito 21 %`, `Retenciones sufridas` → `55 Retenc. Ganancias`, `Servicios` → `564 Servicios recibidos de 3ros`…).

#### F7 · Motor de asientos · el punto 1 completo
- `asientos (fecha, numero, origen, origen_id, descripcion, estado)` + `asiento_lineas (cuenta_contable_id, debe, haber, moneda, tc, debe_ars, haber_ars, auxiliar_tipo, auxiliar_id)`.
- Trigger que exige `Σ debe = Σ haber` en pesos: un asiento desbalanceado no entra a la base, punto.
- Una función pura `armarAsiento(documento)` —testeable sin base— con las reglas:

```
Factura de compra              Factura de venta
  D  Mercadería / Gasto          D  Deudores por ventas   (auxiliar: cliente)
  D  IVA crédito fiscal            H  Ventas / Servicios
  D  Percepciones sufridas         H  IVA débito fiscal
    H  Proveedores (auxiliar)      H  Percepciones practicadas

Cobro                          Pago a proveedor
  D  Banco / Caja                D  Proveedores (auxiliar)
  D  Retenciones sufridas          H  Banco / Caja
    H  Deudores por ventas         H  Retenciones practicadas

Gasto                          Transferencia
  D  Cuenta de gasto             D  Cuenta destino
  D  IVA crédito fiscal            H  Cuenta origen
    H  Banco / Caja               ± Diferencia de cambio
```

- Las notas de crédito invierten el asiento; el `signo` derivado de la clase ya existe y se reutiliza.
- Pantallas: **Libro diario** (por fecha, con filtro por origen), **Mayor por cuenta** (con saldo corrido y auxiliar), **Sumas y saldos**, **Balance por rubro**.
- Exportación en el formato que pida el estudio contable.

### Bloque C — El circuito conectado

#### F8 · Borrador → confirmado
- `comprobantes.estado` + su regla de edición (§1.4).
- Los borradores no entran en saldos, ni en pendientes, ni en el libro IVA.
- Alerta en el panel: *“4 facturas en borrador sin confirmar”*.
- La carga inteligente pasa a dejar borradores en vez de guardar directo, así se pueden revisar de a varias y confirmar en lote.

#### F9 · Ficha 360 de cliente y proveedor
Página propia `/admin/clientes/[id]` (hoy es un panel lateral con los últimos 8
comprobantes). Cabecera con razón social, CUIT, condición de IVA, vendedor,
condición de pago y límite de crédito; KPIs de deuda ARS/USD, vencido, días
promedio de cobro y facturado 12 meses. Solapas:

**Resumen** · **Facturas** · **Cobros** · **Estado de cuenta** (saldo corrido, el
endpoint ya existe) · **Documentos** (los PDF adjuntos) · **Contactos** ·
**Actividad** (auditoría).

Acciones desde la ficha: nueva factura, registrar cobro, exportar estado de
cuenta, mandar recordatorio de vencimiento.

La versión proveedor es la misma con facturas de compra, órdenes de pago,
retenciones practicadas y certificados emitidos.

#### F10 · El circuito evidente en la UI
- Botón **Cobrar** en la fila de cada factura pendiente, que abre el recibo con esa factura ya cargada por su saldo.
- **Cobrar todo lo vencido** desde la ficha del cliente.
- Selección múltiple de facturas de compra → una orden de pago.
- Desde el movimiento del banco, enlace al recibo; desde el recibo, a las facturas; desde la factura, al cliente. Cada dato es navegable hacia su origen y hacia su consecuencia.
- Numeración interna de recibos y órdenes de pago, que hoy no tienen número propio.

#### F11 · Agrupaciones y filtros
- `categorias_entidad` por tipo (cliente/proveedor): **rubro** (mayorista, servicios, importador, transporte, profesional, organismo público), zona, condición de IVA, vendedor, estado, y etiquetas libres.
- Barra de filtros unificada en las seis listas, con **filtros guardados** (*“Clientes con vencido a más de 30 días”*).
- Agrupadores en las tablas: por antigüedad (corriente / 1-30 / 31-60 / 61-90 / +90), por moneda, por vendedor, por categoría, por cuenta contable.
- Exportación a Excel respetando los filtros aplicados.

### Bloque D — Nivel consultora

#### F12 · Conciliación bancaria
Con el formato del `EJEMPLO.xlsx` ya resuelto en F4, el paso natural:

- Subir el Excel o CSV del banco.
- Matcheo automático contra lo cargado: fecha ±3 días + importe exacto → conciliado; importe exacto solo → sugerencia.
- Pantalla en dos columnas (extracto | sistema) con *conciliar*, *crear el movimiento desde el extracto* e *ignorar*.
- Cierre: saldo del banco vs saldo del sistema, con la diferencia explicada renglón por renglón.

#### F13 · Reportes ejecutivos
- **Antigüedad de saldos** de clientes y proveedores.
- **Flujo de fondos proyectado**: pendientes de cobro por fecha estimada contra pendientes de pago, semana a semana, arrancando del saldo real de los bancos. Es el reporte que convierte el módulo en una herramienta de decisión.
- **Libro IVA compras y ventas** (habilitado por el flag `L_Iva` del plan del contador), en formato AFIP.
- Ventas por cliente / vendedor / mes · Gastos por cuenta contable · Sumas y saldos · Balance.
- Todos con rango de fechas y exportación a Excel.

#### F14 · Panel `/admin`
El semáforo del día: a cobrar hoy y vencido, a pagar hoy y vencido, saldo
consolidado de bancos, últimos movimientos, y alertas accionables (borradores sin
confirmar, movimientos sin conciliar hace más de 30 días, retenciones sin
certificado, facturas sin cuenta contable imputada).

#### F15 · Confiabilidad
- **Auditoría** (`quién · cuándo · qué tabla · qué cambió`) sobre todo lo que toca plata.
- **RPC transaccional** para el alta de recibos: hoy son tres inserts con deshacer a mano (`pagos-handlers.ts:288`), y un fallo de red en el medio deja el recibo a medias.
- Permisos por rol dentro del módulo: ver / cargar / confirmar / anular.
- Adjuntos en Storage: el PDF original de la factura, visible desde la ficha.

---

## 3 · Orden sugerido

| Sprint | Fases | Por qué en ese orden |
|---|---|---|
| **1** | F1 · F2 · F3 · F4 · F5 | Los tres bugs confirmados y la pantalla que pidieron explícitamente. Todo esto se nota el primer día. |
| **2** | F6 · F7 | El plan del contador y el motor de asientos. F7 depende de F6: sin las cuentas reales el asiento no tiene contra qué imputar. |
| **3** | F8 · F9 · F10 · F11 | El circuito conectado y navegable. Depende de F7 para que confirmar signifique algo. |
| **4** | F12 · F13 · F14 · F15 | Lo que apoya sobre todo lo anterior. |

Dependencias duras:

```
F1 (TC) ──→ F2 (moneda cruzada) ──→ F4 (extracto) ──→ F12 (conciliación)
F6 (plan de cuentas) ──→ F7 (asientos) ──→ F8 (confirmar) ──→ F13 (libro IVA, balance)
F3 (retenciones) ──→ F7 (asiento del cobro)
```

---

## 4 · Decisiones a confirmar

1. **El `EJEMPLO.xlsx` es un extracto del Galicia**, no un ejemplo de facturas. El plan lo toma como formato de la pantalla de extracto (F4) y como base del importador de conciliación (F12).
2. **Plan de cuentas del contador**: ¿reemplaza al actual con tabla de equivalencias, o conviven? El plan asume reemplazo, que es lo único que hace que el contador reconozca lo que ve.
3. **Alcance contable**: ¿contabilidad completa acá (diario, mayor, sumas y saldos, balance) o el asiento solo como dato para exportar al estudio? Cambia el tamaño de F7 y F13.
4. **Cuentas financieras a dar de alta**: el plan del contador marca como banco a Galicia $, Galicia USD, Nación, Macro, Fimma Galicia, Fimma Dólares, Mercado Libre y VISA Galicia; y como valores a Cheques en cartera. ¿Se abren todas?
5. **Jurisdicciones de IIBB activas**: el plan tiene siete. ¿Se cargan todas o solo CABA y Bs As por ahora? (La tabla las soporta igual; es cuestión de qué aparece en el selector.)
