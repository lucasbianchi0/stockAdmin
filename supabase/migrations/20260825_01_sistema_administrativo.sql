/*
 * Sistema administrativo — el pliego de las páginas 5 a 13.
 *
 * Tres cosas que la base todavía no sabía y que el documento del contador pide
 * por nombre:
 *
 *  1. **La percepción de Ingresos Brutos abre por jurisdicción.** «3-PERCEP
 *     IIBB, (hacer la apertura BS AS o CABA) y que vaya a la cuenta según
 *     corresponda», con las cuentas 50 y 51 del plan al lado. Hasta acá había
 *     una sola columna y todo caía en 51.
 *
 *  2. **La percepción practicada en una venta no es la sufrida en una compra.**
 *     Una percepción que le practicamos a un cliente es plata que le cobramos
 *     para el fisco: es deuda (230), no crédito fiscal (50/51). El motor las
 *     estaba mandando a la misma cuenta, así que Percepciones IIBB sufridas
 *     quedaba neteada contra las practicadas y el saldo no servía para computar
 *     ni para pagar.
 *
 *  3. **FCEA no quiere decir exportación.** El pliego lista las dos familias por
 *     separado —«FCEA: Factura de Crédito Electrónica A» y «FCE: Factura E»— y
 *     son códigos distintos de AFIP: 201/202/203 la MiPyME, 19/20/21 la de
 *     exportación. El sistema usaba FCEA/NCEA/NDEA para la de exportación, así
 *     que lo ya cargado se renombra a FCE/NCE/NDE y los códigos viejos quedan
 *     libres para lo que de verdad significan.
 */

/* ── 1 · Percepción de IIBB por jurisdicción ──────────────────────────────── */

alter table comprobantes
  add column if not exists percepcion_iibb_bsas numeric(16, 2) not null default 0,
  add column if not exists percepcion_iibb_caba numeric(16, 2) not null default 0;

-- Lo ya cargado va entero a CABA y no repartido ni a "sin discriminar". No es
-- una adivinanza sobre la provincia: es la única opción que deja los asientos
-- existentes exactamente como estaban, porque la versión anterior de
-- `asiento_de_comprobante` imputaba `percepcion_iibb` contra
-- `percepcion_iibb_caba` (cuenta 51). Cualquier otro reparto reescribiría
-- silenciosamente mayores ya conciliados.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'comprobantes' and column_name = 'percepcion_iibb'
  ) then
    execute 'update comprobantes
                set percepcion_iibb_caba = percepcion_iibb
              where percepcion_iibb <> 0
                and percepcion_iibb_caba = 0';

    -- Las dos vistas del saldo se apoyan en la columna y hay que soltarlas
    -- primero. Están escritas con `select c.*`, pero Postgres congela la lista
    -- de columnas al crear la vista: es la misma razón por la que
    -- `20260814_02` tuvo que recrearlas para que apareciera `estado`. El
    -- `cascade` se lleva `comprobantes_vigentes`, que cuelga de la otra, y las
    -- dos se rehacen abajo con la misma definición de siempre.
    execute 'drop view if exists comprobantes_saldo cascade';
    execute 'alter table comprobantes drop column percepcion_iibb';
  end if;
end $$;

-- Idénticas a como estaban en `20260814_02`; lo único que cambia es que ahora
-- `c.*` trae las dos columnas de percepción en vez de una.
drop view if exists comprobantes_saldo cascade;
create view comprobantes_saldo as
select
  c.*,
  coalesce(i.imputado, 0) as imputado,
  round(c.total - coalesce(i.imputado, 0), 2) as saldo
from comprobantes c
left join (
  select comprobante_id, sum(importe) as imputado
    from imputaciones
   group by comprobante_id
) i on i.comprobante_id = c.id;

-- Los pendientes y los reportes tienen que ver solo lo confirmado. En vez de
-- repetir `estado = 'confirmado'` en cada consulta —y que alguna se olvide— va
-- una vista con el filtro puesto.
create view comprobantes_vigentes as
  select * from comprobantes_saldo where estado = 'confirmado';

/* ── 2 · La cuenta de la percepción practicada ────────────────────────────── */

insert into config_contable (clave, cuenta_id, descripcion)
select v.clave, p.id, v.descripcion
  from (values
  ('percepcion_iibb_practicada', '230',
   'Percepcion de IIBB que le practicamos a un cliente: se le cobra para el fisco')
  ) as v (clave, codigo, descripcion)
  join plan_cuentas p on p.codigo = v.codigo
on conflict (clave) do nothing;

/* ── 3 · El asiento de una factura, con las dos percepciones ──────────────── */

/*
 * Compra                                Venta
 *   D  Mercadería / Gasto                 D  Deudores por ventas   (aux: cliente)
 *   D  IVA crédito fiscal                   H  Ventas / Servicios
 *   D  Percepción IVA sufrida (47)          H  IVA débito fiscal
 *   D  Percepción IIBB BS AS   (50)         H  Percepciones practicadas (230)
 *   D  Percepción IIBB CABA    (51)
 *     H  Proveedores (aux)
 *
 * La línea del concepto sigue calculándose como `total − IVA − percepciones`
 * para que el redondeo caiga ahí y el asiento cuadre por construcción.
 */
create or replace function asiento_de_comprobante(p_id uuid) returns uuid
language plpgsql as $$
declare
  c            record;
  v_asiento    uuid;
  v_concepto     numeric(18, 2);
  v_concepto_ars numeric(18, 2);
  v_total_ars    numeric(18, 2);
  v_iva_ars      numeric(18, 2);
  v_perc_iva_ars  numeric(18, 2);
  v_iibb_bsas_ars numeric(18, 2);
  v_iibb_caba_ars numeric(18, 2);
  v_perc_iibb     numeric(18, 2);
  v_perc_iibb_ars numeric(18, 2);
  v_cuenta_contra uuid;
  v_etiqueta   text;
begin
  select * into c from comprobantes where id = p_id;
  if not found then return null; end if;

  perform asiento_borrar('comprobante', p_id);

  -- Sin cuenta imputada no hay asiento posible. No es un error: es una factura a
  -- medio cargar, y la vista `documentos_sin_asiento` la muestra para que
  -- alguien la termine.
  if c.cuenta_contable_id is null then return null; end if;

  v_cuenta_contra := case when c.tipo = 'venta'
    then cuenta_config('deudores_por_ventas') else cuenta_config('proveedores') end;
  if v_cuenta_contra is null then return null; end if;

  -- Los pesos de cada componente. Para un comprobante en pesos el tc es 1 y
  -- esto es la identidad; para uno en dólares es la valuación del día.
  v_total_ars     := case when c.moneda = 'ARS' then c.total else round(c.total * c.tc, 2) end;
  v_iva_ars       := case when c.moneda = 'ARS' then c.iva   else round(c.iva   * c.tc, 2) end;
  v_perc_iva_ars  := case when c.moneda = 'ARS' then c.percepcion_iva
                          else round(c.percepcion_iva * c.tc, 2) end;
  v_iibb_bsas_ars := case when c.moneda = 'ARS' then c.percepcion_iibb_bsas
                          else round(c.percepcion_iibb_bsas * c.tc, 2) end;
  v_iibb_caba_ars := case when c.moneda = 'ARS' then c.percepcion_iibb_caba
                          else round(c.percepcion_iibb_caba * c.tc, 2) end;

  v_perc_iibb     := c.percepcion_iibb_bsas + c.percepcion_iibb_caba;
  v_perc_iibb_ars := v_iibb_bsas_ars + v_iibb_caba_ars;

  -- El concepto absorbe el redondeo. De acá sale el cuadre exacto.
  v_concepto     := c.total     - c.iva     - c.percepcion_iva - v_perc_iibb;
  v_concepto_ars := v_total_ars - v_iva_ars - v_perc_iva_ars   - v_perc_iibb_ars;

  v_etiqueta := c.clase || ' ' ||
    coalesce(lpad(c.punto_venta::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0'), 's/n');

  v_asiento := asiento_crear(
    c.fecha, 'comprobante', p_id,
    case when c.tipo = 'venta' then 'Factura de venta ' else 'Factura de compra ' end || v_etiqueta
  );

  if c.tipo = 'compra' then
    perform asiento_linea(v_asiento, 1, c.cuenta_contable_id,
      v_concepto, v_concepto_ars, c.moneda, c.tc, c.signo, null, null, 'Concepto', true);
    perform asiento_linea(v_asiento, 2, cuenta_iva_credito(c.alicuota_iva),
      c.iva, v_iva_ars, c.moneda, c.tc, c.signo, null, null, 'IVA crédito fiscal', true);
    perform asiento_linea(v_asiento, 3, cuenta_config('percepcion_iva'),
      c.percepcion_iva, v_perc_iva_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IVA', true);
    perform asiento_linea(v_asiento, 4, cuenta_config('percepcion_iibb_bsas'),
      c.percepcion_iibb_bsas, v_iibb_bsas_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB Buenos Aires', true);
    perform asiento_linea(v_asiento, 5, cuenta_config('percepcion_iibb_caba'),
      c.percepcion_iibb_caba, v_iibb_caba_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB Capital', true);
    perform asiento_linea(v_asiento, 6, v_cuenta_contra,
      c.total, v_total_ars, c.moneda, c.tc, c.signo,
      'proveedor', c.proveedor_id, 'Proveedores', false);
  else
    perform asiento_linea(v_asiento, 1, v_cuenta_contra,
      c.total, v_total_ars, c.moneda, c.tc, c.signo,
      'cliente', c.cliente_id, 'Deudores por ventas', true);
    perform asiento_linea(v_asiento, 2, c.cuenta_contable_id,
      v_concepto, v_concepto_ars, c.moneda, c.tc, c.signo, null, null, 'Concepto', false);
    perform asiento_linea(v_asiento, 3, cuenta_config('iva_debito_fiscal'),
      c.iva, v_iva_ars, c.moneda, c.tc, c.signo, null, null, 'IVA débito fiscal', false);
    perform asiento_linea(v_asiento, 4, cuenta_config('percepcion_iva'),
      c.percepcion_iva, v_perc_iva_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IVA practicada', false);
    -- Practicada, no sufrida: se le cobró al cliente para el fisco, así que es
    -- deuda (230) y no el crédito fiscal de las cuentas 50/51.
    perform asiento_linea(v_asiento, 5, cuenta_config('percepcion_iibb_practicada'),
      v_perc_iibb, v_perc_iibb_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB practicada', false);
  end if;

  return v_asiento;
end $$;

/* ── 4 · Las clases electrónicas ──────────────────────────────────────────── */

-- Los índices únicos incluyen la clase —(clase, punto_venta, numero) en ventas—
-- y aun así no hace falta soltarlos: FCE, NCE y NDE son códigos que hasta hoy
-- no existían en el sistema, así que ninguna fila renombrada puede chocar con
-- una que ya estuviera usando ese código.
update comprobantes set clase = 'FCE' where clase = 'FCEA';
update comprobantes set clase = 'NCE' where clase = 'NCEA';
update comprobantes set clase = 'NDE' where clase = 'NDEA';

-- `comprobante_signo` sale de las dos primeras letras, así que NCE sigue
-- restando y NDE sigue sumando: la columna generada se recalcula sola y ningún
-- signo cambia. Los asientos se rehacen igual porque su descripción lleva la
-- clase impresa.

/* ── 5 · Rehacer lo que cambió de asiento ─────────────────────────────────── */

/*
 * Solo dos grupos cambian de resultado y se rehacen los dos:
 *
 *   · las ventas con percepción de IIBB, que pasan de 51 a 230;
 *   · los comprobantes cuya clase se renombró, porque la descripción del asiento
 *     lleva la clase impresa.
 *
 * Cada uno en su propio bloque: uno que falle —una cuenta de configuración que
 * no está— no puede abortar la migración entera y dejar la mitad rehecha. Lo que
 * no entre queda listado en `documentos_sin_asiento`.
 */
do $$
declare
  r record;
  fallidos integer := 0;
begin
  for r in
    select id from comprobantes
     where (tipo = 'venta' and (percepcion_iibb_bsas + percepcion_iibb_caba) <> 0)
        or clase in ('FCE', 'NCE', 'NDE')
     order by fecha, created_at
  loop
    begin
      perform asiento_de_comprobante(r.id);
    exception when others then
      fallidos := fallidos + 1;
    end;
  end loop;

  if fallidos > 0 then
    raise notice 'Quedaron % comprobantes sin rehacer su asiento; están en documentos_sin_asiento', fallidos;
  end if;
end $$;
