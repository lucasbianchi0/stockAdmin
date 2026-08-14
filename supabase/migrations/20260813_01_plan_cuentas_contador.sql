-- Plan de cuentas real de Accedra — reemplaza al plan semilla de la fase 1.
--
-- La fase 1 sembro 50 cuentas genericas con un comentario que decia lo que eran:
-- "el piso para poder imputar desde el primer dia". Esto es el plan definitivo,
-- el que el estudio contable usa para armar los balances: 224 cuentas con los
-- codigos que el contador reconoce (201 Proveedores, 505 Compras de Materiales).
--
-- Lo que el Excel del contador aporta y la semilla no tenia — y que es lo que
-- habilita el asiento automatico y el libro IVA:
--
--   Tipo_SubCta  CL / PR   que cuentas llevan submayor por cliente o proveedor
--   L_Iva        CO / VE   que cuentas van al libro IVA compras o ventas
--   Banco        SI        que cuentas son bancarias
--   Valores      SI        que cuentas manejan cheques
--   Medio_Pago   SI        que cuentas pueden usarse como medio en un recibo
--
-- ORDEN DE LA MIGRACION. Importa, porque los codigos colisionan: la semilla usa
-- '1' para el rubro Activo y el contador usa '1' para Caja.
--
--   1. Columnas nuevas.
--   2. Las cuentas viejas se renombran a 'OLD-*' para liberar los codigos.
--   3. Entran las 224 nuevas.
--   4. Se repuntan las referencias (comprobantes, movimientos, cuentas
--      financieras) de la cuenta vieja a su equivalente.
--   5. Se borran las viejas. Recien aca, y no antes: las FK son
--      `on delete set null`, asi que borrar primero perderia la imputacion en
--      silencio en vez de fallar.
--   6. Se siembra `config_contable`.

/* ── 0 · Guardia ──────────────────────────────────────────────────────────── */

-- Esta migracion NO es idempotente y no puede serlo: el paso 2 aparta el plan
-- vigente para liberar los codigos, y en una segunda corrida el plan vigente ya
-- es el del contador. Sin este guardia, correrla dos veces apartaria las 224
-- cuentas buenas, no encontraria equivalencias para nada, y las borraria dejando
-- cada factura sin imputar.
--
-- Falla fuerte en vez de no hacer nada: si alguien la corre de nuevo es porque
-- algo se entendio mal, y un silencio ahi es peor que un error. La transaccion
-- se deshace entera, asi que no toca un solo dato.
do $$
begin
  if exists (select 1 from plan_cuentas where codigo = '201' and nombre = 'Proveedores') then
    raise exception
      'El plan de cuentas del contador ya esta migrado. Esta migracion corre una sola vez.';
  end if;
end $$;

/* ── 1 · Columnas nuevas ──────────────────────────────────────────────────── */

alter table plan_cuentas
  -- Orden de presentacion. El codigo es texto y '10' ordena antes que '9';
  -- guardar el numero aparte es lo unico que hace que el arbol salga como en el
  -- papel del contador.
  add column if not exists orden integer not null default 0,

  -- La cuenta lleva submayor: no alcanza con el saldo total, hace falta saber
  -- cuanto de ese saldo es de cada cliente o de cada proveedor.
  add column if not exists lleva_subcuenta boolean not null default false,
  add column if not exists tipo_subcuenta text
    check (tipo_subcuenta in ('cliente', 'proveedor')),

  -- Es una cuenta bancaria; enlaza con `cuentas_financieras`.
  add column if not exists es_banco boolean not null default false,
  -- Maneja cheques (cartera, diferidos, rechazados).
  add column if not exists es_valores boolean not null default false,

  -- A que libro IVA va lo imputado contra esta cuenta. Es lo que permite armar
  -- el libro sin configurar nada mas.
  add column if not exists libro_iva text check (libro_iva in ('compras', 'ventas')),

  add column if not exists moneda_extranjera boolean not null default false,
  -- Se puede elegir como medio de pago al cargar un recibo.
  add column if not exists es_medio_pago boolean not null default false;

create index if not exists plan_cuentas_orden_idx on plan_cuentas (orden, codigo);
create index if not exists plan_cuentas_libro_iva_idx on plan_cuentas (libro_iva)
  where libro_iva is not null;

/* ── 2 · Liberar los codigos viejos ───────────────────────────────────────── */

-- `padre_id` es `on delete restrict`: sin cortar el arbol primero, el borrado
-- del paso 5 falla contra sus propios hijos.
update plan_cuentas set padre_id = null;

update plan_cuentas
   set codigo = 'OLD-' || codigo
 where codigo not like 'OLD-%';

/* ── 3 · Las 224 cuentas del contador ─────────────────────────────────── */

insert into plan_cuentas (
  codigo, nombre, tipo, orden,
  lleva_subcuenta, tipo_subcuenta, es_banco, es_valores,
  libro_iva, moneda_extranjera, es_medio_pago, activo, imputable
)
select
  v.codigo, v.nombre, v.tipo, v.orden,
  v.lleva_subcuenta, v.tipo_subcuenta, v.es_banco, v.es_valores,
  v.libro_iva, v.moneda_extranjera, v.es_medio_pago, v.activo,
  -- En el plan del contador todas son imputables: no hay cuentas de
  -- agrupacion, el agrupador es el rubro.
  true
from (values
  ('1', 'Caja', 'activo', 1, false, 'cliente', false, false, null, false, true, true),
  ('5', 'Dolares Efectivo', 'activo', 5, false, null, false, false, null, false, true, true),
  ('9', 'Banco Galicia Cta Dolares', 'activo', 9, true, null, true, false, null, false, true, true),
  ('10', 'Banco Galicia Cta. Cte,', 'activo', 10, true, null, true, false, null, false, true, true),
  ('11', 'Banco Nacion cta.cte.', 'activo', 11, true, null, true, false, null, false, true, true),
  ('12', 'Bco.Galicia - plazo fijo', 'activo', 12, false, null, false, false, null, false, false, true),
  ('13', 'Banco Macro cta.cte.', 'activo', 13, true, null, true, false, null, false, true, true),
  ('14', 'Fimma - Bco.Galicia', 'activo', 14, false, null, false, false, null, false, false, true),
  ('15', 'Cheques en Cartera', 'activo', 15, true, null, false, true, null, false, true, true),
  ('16', 'Fimma Dolares - Galicia', 'activo', 16, true, null, true, false, null, false, true, true),
  ('17', 'Cta. Cte Mercado Libre', 'activo', 17, true, null, true, false, null, false, true, true),
  ('18', 'FIMA Renta $ Clase B', 'activo', 18, false, null, false, false, null, false, false, true),
  ('19', 'FIMA Renta en $ Clase C', 'activo', 19, false, null, false, false, null, false, false, true),
  ('20', 'FIMA Ahorro Pus Clase A', 'activo', 20, false, null, false, false, null, false, false, true),
  ('25', 'Creditos por Ventas', 'activo', 25, true, 'cliente', false, false, null, false, true, true),
  ('40', 'IVA Credito 21 %', 'activo', 40, false, null, false, false, null, false, false, true),
  ('41', 'IVA Credito 10.5%', 'activo', 41, false, null, false, false, null, false, false, true),
  ('42', 'IVA Credito 27%', 'activo', 42, false, null, false, false, null, false, false, true),
  ('45', 'IVA Retenciones/Percepc', 'activo', 45, false, null, false, false, null, false, true, true),
  ('46', 'Retenciones IVA', 'activo', 46, false, null, false, false, null, false, false, true),
  ('47', 'Percepciones IVA', 'activo', 47, false, null, false, false, null, false, false, true),
  ('50', 'PERCEP IIBB BS AS', 'activo', 50, false, null, false, false, null, false, false, true),
  ('51', 'PERCEP IIBB CAP', 'activo', 51, false, null, false, false, null, false, false, true),
  ('52', 'PERC IIBB MENDOZA', 'activo', 52, false, null, false, false, null, false, false, true),
  ('55', 'Retenc. Ganancias (Cred)', 'activo', 55, false, null, false, false, null, false, true, true),
  ('56', 'RET SUSS', 'activo', 56, false, null, false, false, null, false, true, true),
  ('57', 'RET IIBB CAP FED', 'activo', 57, false, null, false, false, null, false, true, true),
  ('58', 'RET IIBB BS AS', 'activo', 58, false, null, false, false, null, false, true, true),
  ('59', 'Ley 25413 (Cred)', 'activo', 59, false, null, false, false, null, false, false, true),
  ('60', 'Ret IIBB Santa Fe', 'activo', 60, false, null, false, false, null, false, true, true),
  ('61', 'Ret SUSS Saldo a Favor', 'activo', 61, false, null, false, false, null, false, false, true),
  ('62', 'Antici Gcias Compensados', 'activo', 62, false, null, false, false, null, false, false, true),
  ('63', 'Ret IIBB Cordoba', 'activo', 63, false, null, false, false, null, false, false, true),
  ('64', 'Ret IIBB Neuquen', 'activo', 64, false, null, false, false, null, false, false, true),
  ('65', 'Ret IIBB Enter Rios', 'activo', 65, false, null, false, false, null, false, false, true),
  ('66', 'Ret. IIBB Mendoza', 'activo', 66, false, null, false, false, null, false, true, true),
  ('75', 'Bonos CF', 'activo', 75, false, null, false, false, null, false, false, true),
  ('102', 'Ret. SUSS Saldo a Favor', 'activo', 102, false, null, false, false, null, false, false, true),
  ('103', 'Imp.Gcias.Saldo a favor', 'activo', 103, false, null, false, false, null, false, false, true),
  ('104', 'Pago AFIP a reimputar', 'activo', 104, false, null, false, false, null, false, false, true),
  ('105', 'IVA Saldo a favor 1o Parf', 'activo', 105, false, null, false, false, null, false, false, true),
  ('106', 'IVA Saldo a Favor 2o Parr', 'activo', 106, false, null, false, false, null, false, false, true),
  ('110', 'IIBB Cap Fed a Favor', 'activo', 110, false, null, false, false, null, false, false, true),
  ('111', 'IIBB Bs As a Favor', 'activo', 111, false, null, false, false, null, false, false, true),
  ('112', 'IIBB Cordoba a Favor', 'activo', 112, false, null, false, false, null, false, false, true),
  ('113', 'IIBB Mendoza a favor', 'activo', 113, false, null, false, false, null, false, false, true),
  ('115', 'Anticipos a proveedores', 'activo', 115, false, null, false, false, null, false, false, true),
  ('118', 'Anticipo Honorarios Direc', 'activo', 118, false, null, false, false, null, false, false, true),
  ('120', 'Cta. Particular Bianchi.', 'activo', 120, false, null, false, false, null, false, true, true),
  ('121', 'Cta.Par.Sebastian Cendoya', 'activo', 121, false, null, false, false, null, false, true, true),
  ('122', 'Cta.Part.Ismael Espeche', 'activo', 122, false, null, false, false, null, false, false, true),
  ('123', 'Cta. Part. Martín Arjona', 'activo', 123, false, null, false, false, null, false, true, true),
  ('148', 'Inventario Mercaderias', 'activo', 148, false, null, false, false, null, false, false, true),
  ('150', 'Productos, Mat. e Insumos', 'activo', 150, false, null, false, false, null, false, false, true),
  ('160', 'Muebles y utiles', 'activo', 160, false, null, false, false, 'compras', false, false, true),
  ('165', 'Inmuebles', 'activo', 165, false, null, false, false, null, false, false, true),
  ('168', 'Rodados', 'activo', 168, false, null, false, false, 'compras', false, false, true),
  ('170', 'Máquinas y herramientas', 'activo', 170, false, null, false, false, 'compras', false, false, true),
  ('171', 'Amortizacion Ac Máq y Her', 'activo', 171, false, null, false, false, null, false, false, true),
  ('180', 'Intereses a devengar', 'activo', 180, false, null, false, false, null, false, false, true),
  ('201', 'Proveedores', 'pasivo', 201, true, 'proveedor', false, false, null, false, true, true),
  ('205', 'Ch/ pago diferido', 'pasivo', 205, true, null, false, true, null, false, true, true),
  ('210', 'Anticipos de clientes', 'pasivo', 210, false, null, false, false, null, false, false, true),
  ('211', 'Anticipo financiero', 'pasivo', 211, false, null, false, false, null, false, false, true),
  ('215', 'Obligaciones a Pagar', 'pasivo', 215, true, null, false, true, null, false, true, true),
  ('216', 'Anticipo Gcias a pagar', 'pasivo', 216, false, null, false, false, null, false, false, true),
  ('218', 'Cheques diferidos', 'pasivo', 218, false, null, false, false, null, false, false, true),
  ('219', 'Cheques rechazados', 'pasivo', 219, false, null, false, false, null, false, true, true),
  ('220', 'Tarjeta VISA Galicia', 'pasivo', 220, true, null, true, false, null, false, true, true),
  ('225', 'IVA Debito Fiscal', 'pasivo', 225, false, null, false, false, null, false, false, true),
  ('230', 'I. Brutos - Percep (Deb)', 'pasivo', 230, false, 'cliente', false, false, null, false, false, true),
  ('231', 'RNSS a Pagar', 'pasivo', 231, false, null, false, false, null, false, false, true),
  ('232', 'RNOS a Pagar', 'pasivo', 232, false, null, false, false, null, false, false, true),
  ('237', 'Indemnizaciones a pagar', 'pasivo', 237, false, null, false, false, null, false, false, true),
  ('238', 'Liq.Final Alvarenga a pag', 'pasivo', 238, false, null, false, false, null, false, false, true),
  ('239', 'Sueldo Bianchi a pagar', 'pasivo', 239, false, null, false, false, null, false, false, true),
  ('240', 'Sueldos a Pagar', 'pasivo', 240, false, 'cliente', false, false, null, false, false, true),
  ('241', 'IVA a Pagar', 'pasivo', 241, false, null, false, false, null, false, false, true),
  ('242', 'Cargas Sociales a Pagar', 'pasivo', 242, false, null, false, false, null, false, false, true),
  ('243', 'IIBB Cap Fed a Pagar', 'pasivo', 243, false, null, false, false, null, false, false, true),
  ('244', 'Bs Pers Sociedad a pagar', 'pasivo', 244, false, null, false, false, null, false, false, true),
  ('245', 'IIBB Bs As a Pagar', 'pasivo', 245, false, null, false, false, null, false, false, true),
  ('246', 'IIBB Cordoba a Pagar', 'pasivo', 246, false, null, false, false, null, false, false, true),
  ('247', 'IIBB Mendoza a Pagar', 'pasivo', 247, false, null, false, false, null, false, false, true),
  ('250', 'No USARRet. Gcias a Pagar', 'pasivo', 250, false, null, false, false, null, false, false, false),
  ('254', 'Sindicato a Pagar', 'pasivo', 254, false, null, false, false, null, false, false, true),
  ('260', 'A.R.T. a Pagar', 'pasivo', 260, false, null, false, false, null, false, false, true),
  ('261', 'SCVO a Pagar', 'pasivo', 261, false, null, false, false, null, false, false, true),
  ('272', 'Ret Imp Gananc a Personal', 'pasivo', 272, false, 'cliente', false, false, null, false, false, true),
  ('273', 'Honorarios Director a pag', 'pasivo', 273, false, null, false, false, null, false, false, true),
  ('274', 'Div. a pagar C. Bianchi', 'pasivo', 274, false, null, false, false, null, false, false, true),
  ('275', 'Div. a pagar M. Arjona', 'pasivo', 275, false, null, false, false, null, false, false, true),
  ('280', 'Imp.Ganancias a pagar', 'pasivo', 280, false, null, false, false, null, false, false, true),
  ('281', 'Plan de Pagos AFIP', 'pasivo', 281, false, null, false, false, null, false, false, true),
  ('290', 'Préstamo Galicia 47766234', 'pasivo', 290, false, null, false, false, null, false, false, true),
  ('291', 'Préstamo Galicia 47767919', 'pasivo', 291, false, null, false, false, null, false, false, true),
  ('292', 'Préstamo Galicia 47767931', 'pasivo', 292, false, null, false, false, null, false, false, true),
  ('350', 'Retencion Ganancias (Deb)', 'pasivo', 350, false, null, false, false, null, false, true, true),
  ('360', 'Am.Acum.Muebles y Utiles', 'pasivo', 360, false, null, false, false, null, false, false, true),
  ('368', 'Am.Acum.Rodados', 'pasivo', 368, false, null, false, false, null, false, false, true),
  ('400', 'Capital Social', 'patrimonio', 400, false, null, false, false, null, false, false, true),
  ('402', 'Ajuste de Capital', 'patrimonio', 402, false, null, false, false, null, false, false, true),
  ('405', 'Reserva Legal', 'patrimonio', 405, false, null, false, false, null, false, false, true),
  ('408', 'Reserva facultativa', 'patrimonio', 408, false, null, false, false, null, false, false, true),
  ('410', 'Resultados del Ejercicio', 'patrimonio', 410, false, null, false, false, null, false, false, true),
  ('420', 'Resultados Acumulados', 'patrimonio', 420, false, null, false, false, null, false, false, true),
  ('500', 'Costo de ventas y serv.', 'egreso', 500, false, null, false, false, null, false, false, true),
  ('501', 'Mantenimiento', 'egreso', 501, false, null, false, false, 'compras', false, false, true),
  ('502', 'Publicidad', 'egreso', 502, false, null, false, false, 'compras', false, false, true),
  ('503', 'Suscripciones', 'egreso', 503, false, null, false, false, 'compras', false, false, true),
  ('504', 'Desarrollo WEB', 'egreso', 504, false, null, false, false, 'compras', false, false, true),
  ('505', 'Compras de Materiales', 'egreso', 505, false, 'cliente', false, false, 'compras', false, false, true),
  ('506', 'PATENTE', 'egreso', 506, false, null, false, false, 'compras', false, false, true),
  ('507', 'Compra de Monitor', 'egreso', 507, false, null, false, false, 'compras', false, false, true),
  ('508', 'Compras Prod. de Reventa', 'egreso', 508, false, 'cliente', false, false, 'compras', false, false, true),
  ('509', 'Arreglo automotor', 'egreso', 509, false, null, false, false, 'compras', false, false, true),
  ('510', 'Compras Bienes de Uso', 'egreso', 510, false, 'cliente', false, false, 'compras', false, false, true),
  ('511', 'Estacionamiento', 'egreso', 511, false, null, false, false, 'compras', false, false, true),
  ('512', 'Servicio de mensajeria', 'egreso', 512, false, null, false, false, 'compras', false, false, true),
  ('513', 'Internet', 'egreso', 513, false, null, false, false, 'compras', false, false, true),
  ('514', 'Fletes', 'egreso', 514, false, null, false, false, 'compras', false, false, true),
  ('515', 'Luz Electrica', 'egreso', 515, false, 'cliente', false, false, 'compras', false, false, true),
  ('516', 'LIBROS SOCIETARIOS', 'egreso', 516, false, null, false, false, 'compras', false, false, true),
  ('517', 'Certificaciones', 'egreso', 517, false, null, false, false, null, false, false, true),
  ('518', 'Telefonos', 'egreso', 518, false, 'cliente', false, false, 'compras', false, false, true),
  ('519', 'Licencia IBM', 'egreso', 519, false, null, false, false, 'compras', false, false, true),
  ('520', 'Viaticos', 'egreso', 520, false, null, false, false, 'compras', false, false, true),
  ('521', 'Seguros', 'egreso', 521, false, null, false, false, 'compras', false, false, true),
  ('522', 'Adword Campaign', 'egreso', 522, false, null, false, false, 'compras', false, false, true),
  ('523', 'Intereses', 'egreso', 523, false, null, false, false, null, false, false, true),
  ('524', 'Viajes y Estadias', 'egreso', 524, false, null, false, false, 'compras', false, false, true),
  ('525', 'Gastos Generales', 'egreso', 525, false, null, false, false, 'compras', false, false, true),
  ('526', 'Gastos Bancarios', 'egreso', 526, false, null, false, false, 'compras', false, false, true),
  ('527', 'Examen Preocupacional', 'egreso', 527, false, null, false, false, 'compras', false, false, true),
  ('528', 'Regalos Empresariales', 'egreso', 528, false, null, false, false, 'compras', false, false, true),
  ('529', 'LICENCIA WINPRO 8.1', 'egreso', 529, false, null, false, false, 'compras', false, false, true),
  ('530', 'Alquileres y Expensas', 'egreso', 530, false, null, false, false, 'compras', false, false, true),
  ('531', 'Comida', 'egreso', 531, false, null, false, false, 'compras', false, false, true),
  ('532', 'Libreria', 'egreso', 532, false, null, false, false, 'compras', false, false, true),
  ('533', 'Combustible', 'egreso', 533, false, null, false, false, 'compras', false, false, true),
  ('534', 'Compra Dispenser Frio/Cal', 'egreso', 534, false, null, false, false, 'compras', false, false, true),
  ('535', 'Tasas e Impuestos Varios', 'egreso', 535, false, null, false, false, 'compras', false, false, true),
  ('536', 'Insumos de Computacion', 'egreso', 536, false, null, false, false, 'compras', false, false, true),
  ('537', 'Compra Software', 'egreso', 537, false, null, false, false, 'compras', false, false, true),
  ('538', 'Servicios de Asesoramient', 'egreso', 538, false, null, false, false, 'compras', false, false, true),
  ('539', 'Imprenta', 'egreso', 539, false, null, false, false, 'compras', false, false, true),
  ('540', 'Impuesto a las Ganancias', 'egreso', 540, false, 'cliente', false, false, null, false, false, true),
  ('541', 'PEAJE', 'egreso', 541, false, null, false, false, 'compras', false, false, true),
  ('542', 'Ingresos Brutos', 'egreso', 542, false, null, false, false, null, false, false, true),
  ('543', 'Servicios de Desarrollo', 'egreso', 543, false, null, false, false, 'compras', false, false, true),
  ('544', 'Supermercado', 'egreso', 544, false, null, false, false, 'compras', false, false, true),
  ('545', 'Honorarios Profesionales', 'egreso', 545, false, null, false, false, 'compras', false, false, true),
  ('546', 'Servicio de Redes', 'egreso', 546, false, null, false, false, 'compras', false, false, true),
  ('547', 'Compra de Notebook', 'egreso', 547, false, null, false, false, 'compras', false, false, true),
  ('548', 'Compra Impresora', 'egreso', 548, false, null, false, false, 'compras', false, false, true),
  ('549', 'Dif de Cambio', 'egreso', 549, false, null, false, false, 'compras', false, false, true),
  ('550', 'Compra IPAD', 'egreso', 550, false, null, false, false, 'compras', false, false, true),
  ('551', 'Trabajos nueva Oficina', 'egreso', 551, false, null, false, false, 'compras', false, false, true),
  ('552', 'Compra de Apple', 'egreso', 552, false, null, false, false, 'compras', false, false, true),
  ('553', 'Cableado', 'egreso', 553, false, null, false, false, 'compras', false, false, true),
  ('554', 'Instalaciones electricas', 'egreso', 554, false, null, false, false, 'compras', false, false, true),
  ('555', 'Cerrajeria', 'egreso', 555, false, null, false, false, 'compras', false, false, true),
  ('556', 'Correo', 'egreso', 556, false, null, false, false, 'compras', false, false, true),
  ('557', 'Gs Liquidacion Importacio', 'egreso', 557, false, null, false, false, 'compras', false, false, true),
  ('558', 'Gs de Ferreteria - NO USA', 'egreso', 558, false, null, false, false, 'compras', false, false, false),
  ('559', 'Servicios de transporte', 'egreso', 559, false, null, false, false, 'compras', false, false, true),
  ('560', 'Expensas', 'egreso', 560, false, null, false, false, null, false, false, true),
  ('561', 'Instalacion Agua', 'egreso', 561, false, null, false, false, 'compras', false, false, true),
  ('562', 'ANTICIPO OBRA', 'egreso', 562, false, null, false, false, 'compras', false, false, true),
  ('563', 'Licencias', 'egreso', 563, false, null, false, false, 'compras', false, false, true),
  ('564', 'Servicios recibidos de 3r', 'egreso', 564, false, null, false, false, 'compras', false, false, true),
  ('565', 'Nro de cuenta SIN USO', 'egreso', 565, false, null, false, false, 'compras', false, false, false),
  ('566', 'cuenta SIN USO', 'egreso', 566, false, null, false, false, 'compras', false, false, false),
  ('570', 'Comisiones', 'egreso', 570, false, null, false, false, 'compras', false, false, true),
  ('571', 'Busqueda Laboral', 'egreso', 571, false, null, false, false, 'compras', false, false, true),
  ('572', 'Alquiler de Máq. y Herram', 'egreso', 572, false, null, false, false, 'compras', false, false, true),
  ('575', 'Sueldos y Jornales', 'egreso', 575, false, 'cliente', false, false, null, false, false, true),
  ('576', 'Cargas Sociales', 'egreso', 576, false, 'cliente', false, false, null, false, false, true),
  ('577', 'Curso Sharepoint', 'egreso', 577, false, null, false, false, 'compras', false, false, true),
  ('578', 'Sueldo Bianchi', 'egreso', 578, false, null, false, false, null, false, false, true),
  ('579', 'Compra LCD', 'egreso', 579, false, null, false, false, 'compras', false, false, true),
  ('580', 'Dif de cambio  - NO USAR', 'egreso', 580, false, null, false, false, 'ventas', false, false, false),
  ('581', 'Medicina Prepaga', 'egreso', 581, false, null, false, false, 'compras', false, false, true),
  ('582', 'COMPRA AUTO', 'egreso', 582, false, null, false, false, 'compras', false, false, true),
  ('583', 'Computadora Coradir', 'egreso', 583, false, null, false, false, 'compras', false, false, true),
  ('584', 'Compra Monitor LED', 'egreso', 584, false, null, false, false, 'compras', false, false, true),
  ('585', 'Reparac equipos informat', 'egreso', 585, false, null, false, false, 'compras', false, false, true),
  ('586', 'I.G.J. Anual', 'egreso', 586, false, null, false, false, 'compras', false, false, true),
  ('587', 'Impuesto al cheque', 'egreso', 587, false, null, false, false, null, false, false, true),
  ('588', 'Retenciones No computable', 'egreso', 588, false, null, false, false, null, false, true, true),
  ('589', 'Impuesto País', 'egreso', 589, false, null, false, false, 'compras', false, false, true),
  ('590', 'Amortizaciones', 'egreso', 590, false, null, false, false, null, false, false, true),
  ('591', 'ABL', 'egreso', 591, false, null, false, false, null, false, false, true),
  ('592', 'Legalizaciones', 'egreso', 592, false, null, false, false, null, false, false, true),
  ('593', 'SERVICIO GARANTIA ALQ', 'egreso', 593, false, null, false, false, 'compras', false, false, true),
  ('594', 'COMPRA TELEFONO', 'egreso', 594, false, null, false, false, 'compras', false, false, true),
  ('595', 'Dif. por Redondeo', 'egreso', 595, false, null, false, false, 'compras', false, false, true),
  ('596', 'Compra mochila', 'egreso', 596, false, null, false, false, 'compras', false, false, true),
  ('597', 'Prestamo Bancario', 'egreso', 597, false, null, false, false, 'compras', false, false, true),
  ('598', 'Denuncia por estafa', 'egreso', 598, false, null, false, false, null, false, false, true),
  ('599', 'Prestamos Empleados', 'egreso', 599, false, null, false, false, null, false, false, true),
  ('600', 'R.E.C.P.A.M.', 'egreso', 600, false, null, false, false, null, false, false, true),
  ('601', 'Reintegro de Gastos', 'egreso', 601, false, null, false, false, 'compras', false, false, true),
  ('602', 'BONO 438/23', 'egreso', 602, false, null, false, false, null, false, false, true),
  ('605', 'Honorarios Director', 'egreso', 605, false, null, false, false, null, false, false, true),
  ('801', 'Ventas de Materiales', 'ingreso', 801, false, null, false, false, 'ventas', false, false, true),
  ('802', 'Retenciones de iva', 'ingreso', 802, false, null, false, false, 'ventas', false, false, true),
  ('803', 'Retenciones de Suss', 'ingreso', 803, false, null, false, false, 'ventas', false, false, true),
  ('804', 'Retenciones IIBB Cap Fed', 'ingreso', 804, false, null, false, false, 'ventas', false, false, true),
  ('805', 'Retenciones Gcias', 'ingreso', 805, false, null, false, false, 'ventas', false, false, true),
  ('806', 'Retenciones IIBB Bs As', 'ingreso', 806, false, null, false, false, 'ventas', false, false, true),
  ('807', 'Diferencia de cambio.', 'ingreso', 807, false, null, false, false, 'ventas', false, false, true),
  ('808', 'Retencion IIBB Santa Fe', 'ingreso', 808, false, null, false, false, 'ventas', false, false, true),
  ('809', 'Ventas de Servicios', 'ingreso', 809, false, null, false, false, 'ventas', false, false, true),
  ('810', 'Vtas Servicios a Exentos', 'ingreso', 810, false, null, false, false, 'ventas', false, false, true),
  ('811', 'Venta Productos de revent', 'ingreso', 811, false, null, false, false, 'ventas', false, false, true),
  ('812', 'Ret IIBB Mendoza', 'ingreso', 812, false, null, false, false, 'ventas', false, false, true),
  ('820', 'Exportacion de servicios', 'ingreso', 820, false, null, false, false, 'ventas', false, false, true),
  ('850', 'Subsidio FONSOFT', 'ingreso', 850, false, null, false, false, null, false, false, true),
  ('860', 'Bonos credito fiscal', 'ingreso', 860, false, null, false, false, null, false, false, true),
  ('870', 'Resultado Inversiones', 'ingreso', 870, false, null, false, false, null, false, false, true),
  ('871', 'Intereses Plazo Fijo', 'ingreso', 871, false, null, false, false, null, false, false, true),
  ('872', 'Resultados por Tenencia', 'ingreso', 872, false, null, false, false, null, false, false, true),
  ('890', 'Recupero siniestro', 'ingreso', 890, false, null, false, false, null, false, false, true)
) as v (
  codigo, nombre, tipo, orden,
  lleva_subcuenta, tipo_subcuenta, es_banco, es_valores,
  libro_iva, moneda_extranjera, es_medio_pago, activo
)
on conflict (codigo) do nothing;

-- Desactivadas de entrada, porque el contador las marco muertas en el archivo
-- (5 cuentas). Siguen existiendo por si algo historico las referencia;
-- no aparecen en ningun selector.
--   250 · No USARRet. Gcias a Pagar
--   558 · Gs de Ferreteria - NO USA
--   565 · Nro de cuenta SIN USO
--   566 · cuenta SIN USO
--   580 · Dif de cambio  - NO USAR

/* ── 4 · Repuntar lo ya cargado ───────────────────────────────────────────── */

-- La tabla de equivalencias. Donde la semilla agrupaba y el plan real
-- discrimina no hay equivalente exacto: se elige el destino de mayor uso y
-- queda anotado como "aprox" para que se pueda revisar despues contra el
-- listado de imputaciones.
create temporary table equivalencias_plan (viejo text, nuevo text) on commit drop;

insert into equivalencias_plan (viejo, nuevo) values
  ('1.1.01', '1'),  -- Caja
  ('1.1.02', '10'),  -- Banco Galicia Cta. Cte,
  ('1.1.03', '13'),  -- Banco Macro cta.cte.
  ('1.1.04', '17'),  -- Cta. Cte Mercado Libre
  ('1.2.01', '25'),  -- Creditos por Ventas
  ('1.2.02', '40'),  -- IVA Credito 21 %  · aprox: la semilla no abria por alicuota
  ('1.2.03', '55'),  -- Retenc. Ganancias (Cred) · aprox: la semilla no abria por impuesto
  ('1.2.04', '115'),  -- Anticipos a proveedores
  ('2.1.01', '201'),  -- Proveedores
  ('2.2.01', '225'),  -- IVA Debito Fiscal
  ('2.2.02', '241'),  -- IVA a Pagar · aprox: la semilla no abria por impuesto
  ('2.2.03', '350'),  -- Retencion Ganancias (Deb)
  ('2.3.01', '240'),  -- Sueldos a Pagar
  ('2.3.02', '242'),  -- Cargas Sociales a Pagar
  ('3.1', '400'),  -- Capital Social
  ('3.2', '420'),  -- Resultados Acumulados
  ('4.1.01', '801'),  -- Ventas de Materiales · aprox
  ('4.1.02', '809'),  -- Ventas de Servicios
  ('4.2.01', '807'),  -- Diferencia de cambio.
  ('4.2.02', '871'),  -- Intereses Plazo Fijo · aprox
  ('5.1.01', '508'),  -- Compras Prod. de Reventa · aprox
  ('5.2.01', '545'),  -- Honorarios Profesionales
  ('5.2.02', '564'),  -- Servicios recibidos de 3r · aprox
  ('5.2.03', '526'),  -- Gastos Bancarios
  ('5.2.04', '530'),  -- Alquileres y Expensas
  ('5.3.01', '502'),  -- Publicidad
  ('5.3.02', '514'),  -- Fletes
  ('5.4.01', '575'),  -- Sueldos y Jornales
  ('5.4.02', '576'),  -- Cargas Sociales
  ('5.5.01', '535'),  -- Tasas e Impuestos Varios
  ('5.6.01', '549'),  -- Dif de Cambio
  ('5.6.02', '523')  -- Intereses
;

create temporary table mapa_plan on commit drop as
select vieja.id as id_viejo, nueva.id as id_nuevo
  from equivalencias_plan e
  join plan_cuentas vieja on vieja.codigo = 'OLD-' || e.viejo
  join plan_cuentas nueva on nueva.codigo = e.nuevo;

update comprobantes c
   set cuenta_contable_id = m.id_nuevo
  from mapa_plan m
 where c.cuenta_contable_id = m.id_viejo;

update movimientos mv
   set cuenta_contable_id = m.id_nuevo
  from mapa_plan m
 where mv.cuenta_contable_id = m.id_viejo;

update cuentas_financieras cf
   set cuenta_contable_id = m.id_nuevo
  from mapa_plan m
 where cf.cuenta_contable_id = m.id_viejo;

/* ── 5 · Borrar las viejas ────────────────────────────────────────────────── */

-- Si algo quedo apuntando a una cuenta vieja que no estaba en la tabla de
-- equivalencias, esto lo deja en null (la FK es `on delete set null`) y la fila
-- aparece en la pantalla como "sin imputar", que es visible y corregible. Se
-- avisa por consola antes de borrar.
do $$
declare
  huerfanos integer;
begin
  select count(*) into huerfanos
    from (
      select cuenta_contable_id from comprobantes
      union all select cuenta_contable_id from movimientos
      union all select cuenta_contable_id from cuentas_financieras
    ) t
    join plan_cuentas p on p.id = t.cuenta_contable_id
   where p.codigo like 'OLD-%';

  if huerfanos > 0 then
    raise notice 'Quedan % imputaciones sin equivalencia; se dejan sin imputar', huerfanos;
  end if;
end $$;

delete from plan_cuentas where codigo like 'OLD-%';

/* ── 6 · Cuentas de sistema ───────────────────────────────────────────────── */

-- El motor de asientos necesita saber cual es "la cuenta de proveedores" sin
-- tener el 201 escrito en el codigo. Si manana el contador renumera, se cambia
-- aca y nada mas.
create table if not exists config_contable (
  clave       text primary key,
  cuenta_id   uuid references plan_cuentas (id) on delete restrict,
  descripcion text,
  updated_at  timestamptz not null default now()
);

alter table config_contable enable row level security;

insert into config_contable (clave, cuenta_id, descripcion)
select v.clave, p.id, v.descripcion
  from (values
  ('deudores_por_ventas', '25', 'Contrapartida de toda factura de venta'),
  ('proveedores', '201', 'Contrapartida de toda factura de compra'),
  ('iva_debito_fiscal', '225', 'IVA de las ventas'),
  ('iva_credito_21', '40', 'IVA de las compras al 21%'),
  ('iva_credito_105', '41', 'IVA de las compras al 10,5%'),
  ('iva_credito_27', '42', 'IVA de las compras al 27%'),
  ('percepcion_iva', '47', 'Percepciones de IVA sufridas'),
  ('percepcion_iibb_bsas', '50', 'Percepcion de IIBB Buenos Aires sufrida'),
  ('percepcion_iibb_caba', '51', 'Percepcion de IIBB Capital sufrida'),
  ('ret_ganancias_sufrida', '55', 'Retencion de Ganancias sufrida en un cobro'),
  ('ret_iva_sufrida', '46', 'Retencion de IVA sufrida en un cobro'),
  ('ret_suss_sufrida', '56', 'Retencion de SUSS sufrida en un cobro'),
  ('ret_iibb_caba_sufrida', '57', 'Retencion de IIBB Capital sufrida en un cobro'),
  ('ret_iibb_bsas_sufrida', '58', 'Retencion de IIBB Buenos Aires sufrida en un cobro'),
  ('ret_ganancias_practicada', '350', 'Retencion de Ganancias practicada en un pago'),
  ('diferencia_cambio_ganada', '807', 'Diferencia de cambio a favor'),
  ('diferencia_cambio_perdida', '549', 'Diferencia de cambio en contra'),
  ('gastos_bancarios', '526', 'Comisiones y gastos de banco'),
  ('impuesto_cheque', '587', 'Ley 25413'),
  ('sueldos_a_pagar', '240', 'Contrapartida del pago de sueldos')
  ) as v (clave, codigo, descripcion)
  join plan_cuentas p on p.codigo = v.codigo
on conflict (clave) do update
  set cuenta_id   = excluded.cuenta_id,
      descripcion = excluded.descripcion,
      updated_at  = now();

/* ── 7 · Cuenta contable por defecto en clientes y proveedores ────────────── */

-- Lo que hace que 224 cuentas no se sientan al cargar: la ficha del
-- proveedor recuerda contra que cuenta se imputan sus facturas, y el formulario
-- la completa sola al elegirlo. Solo se toca cuando la factura es la excepcion.
alter table clientes
  add column if not exists cuenta_contable_id uuid references plan_cuentas (id) on delete set null;

alter table proveedores
  add column if not exists cuenta_contable_id uuid references plan_cuentas (id) on delete set null;
