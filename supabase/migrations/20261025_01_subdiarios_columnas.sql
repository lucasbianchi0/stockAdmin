/*
 * Subdiarios con las columnas del libro del estudio — ADITIVO.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El contador mandó el Libro IVA Compras de septiembre como lo arma su sistema,
 * y tiene columnas que la carga de facturas todavía no sabía guardar:
 *
 *  · **LEY 25413** — el impuesto a los débitos y créditos bancarios que el banco
 *    cobra en el extracto. En el resumen mensual del estudio va a la cuenta 59
 *    «Ley 25413 (Cred)»: es la parte computable como pago a cuenta de
 *    Ganancias, un crédito y no un gasto. Ojo: `impuesto_cheque` (587) ya
 *    existía para los movimientos de banco y NO es esta cuenta.
 *  · **PER Gcias.** — percepción de Ganancias (la tarjeta de crédito la cobra
 *    en su resumen). Va a 55 «Retenc. Ganancias (Cred)», la misma cuenta que la
 *    retención sufrida en un cobro.
 *  · **PERC IIBB MENDOZA** — no tiene columna en el libro, pero el resumen del
 *    estudio la manda a la 52.
 *  · **IMP INTERNOS** — columna del libro de ventas. En una compra es costo, como
 *    los otros impuestos, y queda en el concepto. En una venta es deuda con el
 *    fisco; el plan no tiene una cuenta evidente, así que se siembra la clave
 *    `impuestos_internos_venta` SIN cuenta y, mientras siga vacía, el importe
 *    queda en la cuenta de ventas como hasta ahora. Cuando el contador diga cuál
 *    es, se completa la clave y listo.
 *
 * Todo con default 0: ninguna factura existente cambia ni se le regenera el
 * asiento. El asiento nuevo solo difiere del anterior cuando alguno de estos
 * importes es distinto de cero.
 *
 * El «EX» (extracto bancario) es una clase de comprobante nueva, pero las clases
 * se validan en la app —ver 20260808_02—, así que acá no hay constraint que tocar.
 *
 * Revertir: volver a correr la función de 20260916_01_cuenta_por_importe.sql y,
 * si no hay importes cargados, `alter table comprobantes drop column ...` de las
 * cuatro columnas y borrar las cuatro claves de config_contable.
 */

/* ── Las columnas ─────────────────────────────────────────────────────────── */

alter table comprobantes
  add column if not exists ley_25413               numeric(16, 2) not null default 0,
  add column if not exists percepcion_ganancias    numeric(16, 2) not null default 0,
  add column if not exists percepcion_iibb_mendoza numeric(16, 2) not null default 0,
  add column if not exists impuestos_internos      numeric(16, 2) not null default 0;

/* ── Las cuentas ──────────────────────────────────────────────────────────── */

-- `left join` y no `join`: si la cuenta no existe en el plan, la clave queda
-- igual sembrada con la cuenta en null en vez de desaparecer en silencio. Un
-- importe cargado contra una clave sin cuenta deja la factura sin asiento y la
-- muestra en «Sin asentar», que es donde alguien la va a ver.
insert into config_contable (clave, cuenta_id, descripcion)
select v.clave, p.id, v.descripcion
  from (values
  ('ley_25413', '59',
   'Impuesto a los debitos y creditos bancarios cobrado en el extracto (credito computable)'),
  ('percepcion_ganancias', '55', 'Percepcion de Ganancias sufrida en una compra'),
  ('percepcion_iibb_mendoza', '52', 'Percepcion de IIBB Mendoza sufrida'),
  ('impuestos_internos_venta', null,
   'Impuestos internos facturados en una venta. Sin cuenta: quedan en la cuenta de ventas')
  ) as v (clave, codigo, descripcion)
  left join plan_cuentas p on p.codigo = v.codigo
on conflict (clave) do nothing;

/* ── El asiento ───────────────────────────────────────────────────────────── */

/*
 * La misma función de 20260916_01 con cuatro importes más:
 *
 * Compra                               Venta
 *   D  Concepto(s)                       D  Deudores por ventas
 *   D  IVA crédito por alícuota            H  Concepto(s)
 *   D  Percepción IVA (47)                 H  IVA débito fiscal
 *   D  Percep. IIBB BS AS / CAP / MZA      H  Percepciones practicadas
 *   D  Ley 25413 (59)                      H  Impuestos internos (si la clave
 *   D  Percepción Ganancias (55)               tiene cuenta; si no, en el concepto)
 *     H  Proveedores
 *
 * Lo que va a su propia cuenta se descuenta del concepto; lo demás —otros
 * impuestos, impuestos internos de una compra— sigue siendo costo y queda ahí.
 * El concepto sigue absorbiendo el redondeo, así que el asiento cuadra por
 * construcción igual que antes.
 */
create or replace function asiento_de_comprobante(p_id uuid) returns uuid
language plpgsql as $$
declare
  c            record;
  v_asiento    uuid;
  v_orden      smallint := 0;
  v_concepto   numeric(18, 2);
  v_concepto_ars numeric(18, 2);
  v_total_ars  numeric(18, 2);
  v_iva_ars    numeric(18, 2);
  v_perc_iva_ars numeric(18, 2);
  v_iibb_bsas_ars numeric(18, 2);
  v_iibb_caba_ars numeric(18, 2);
  v_perc_iibb  numeric(18, 2);
  v_perc_iibb_ars numeric(18, 2);
  -- Los importes con cuenta propia que se agregaron en 20261025_01.
  v_ley        numeric(18, 2) := 0;
  v_ley_ars    numeric(18, 2) := 0;
  v_gcias      numeric(18, 2) := 0;
  v_gcias_ars  numeric(18, 2) := 0;
  v_iibb_mza   numeric(18, 2) := 0;
  v_iibb_mza_ars numeric(18, 2) := 0;
  v_internos   numeric(18, 2) := 0;
  v_internos_ars numeric(18, 2) := 0;
  v_cuenta_internos uuid;
  v_cuenta_contra uuid;
  v_etiqueta   text;
  r            record;
  v_iva_desglosado numeric(18, 2);
  v_cuentas    uuid[] := '{}';
  v_montos     numeric[] := '{}';
  v_montos_ars numeric[] := '{}';
  v_resto      numeric(18, 2);
  v_resto_ars  numeric(18, 2);
  v_al_debe    boolean;
  i            integer;
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

  /*
   * Ley 25413, Ganancias y Mendoza son créditos de una COMPRA. En una venta la
   * API no los acepta; si igual llegaran, quedan en el concepto como cualquier
   * otro impuesto y el asiento sigue cuadrando.
   */
  if c.tipo = 'compra' then
    v_ley        := c.ley_25413;
    v_gcias      := c.percepcion_ganancias;
    v_iibb_mza   := c.percepcion_iibb_mendoza;
    v_ley_ars      := case when c.moneda = 'ARS' then v_ley      else round(v_ley      * c.tc, 2) end;
    v_gcias_ars    := case when c.moneda = 'ARS' then v_gcias    else round(v_gcias    * c.tc, 2) end;
    v_iibb_mza_ars := case when c.moneda = 'ARS' then v_iibb_mza else round(v_iibb_mza * c.tc, 2) end;
  else
    -- Los internos de una venta salen del concepto solo si la clave tiene
    -- cuenta. Sin cuenta se quedan en ventas, que es lo que pasaba antes.
    v_cuenta_internos := cuenta_config('impuestos_internos_venta');
    if v_cuenta_internos is not null then
      v_internos     := c.impuestos_internos;
      v_internos_ars := case when c.moneda = 'ARS' then v_internos
                             else round(v_internos * c.tc, 2) end;
    end if;
  end if;

  -- El concepto absorbe el redondeo. De acá sale el cuadre exacto.
  v_concepto     := c.total     - c.iva     - c.percepcion_iva - v_perc_iibb
                    - v_ley - v_gcias - v_iibb_mza - v_internos;
  v_concepto_ars := v_total_ars - v_iva_ars - v_perc_iva_ars   - v_perc_iibb_ars
                    - v_ley_ars - v_gcias_ars - v_iibb_mza_ars - v_internos_ars;

  -- El concepto abierto: lo que va a cuentas distintas de la cabecera.
  for r in
    with partes as (
      select coalesce(iv.cuenta_contable_id, c.cuenta_contable_id) as cuenta, iv.neto as monto
        from comprobante_ivas iv
       where iv.comprobante_id = p_id
      union all
      select coalesce(c.cuenta_no_gravado_id, c.cuenta_contable_id), c.no_gravado
      union all
      select coalesce(c.cuenta_exento_id, c.cuenta_contable_id), c.exento
    )
    select cuenta, sum(monto) as monto
      from partes
     where cuenta <> c.cuenta_contable_id
     group by cuenta
    having sum(monto) <> 0
     order by sum(monto) desc, cuenta
  loop
    v_cuentas    := v_cuentas || r.cuenta;
    v_montos     := v_montos || r.monto;
    v_montos_ars := v_montos_ars ||
      (case when c.moneda = 'ARS' then r.monto else round(r.monto * c.tc, 2) end);
  end loop;

  v_resto     := v_concepto     - coalesce((select sum(x) from unnest(v_montos) x), 0);
  v_resto_ars := v_concepto_ars - coalesce((select sum(x) from unnest(v_montos_ars) x), 0);

  if round(v_resto, 2) <= 0 and coalesce(array_length(v_cuentas, 1), 0) > 0 then
    v_montos[1]     := v_montos[1] + v_resto;
    v_montos_ars[1] := v_montos_ars[1] + v_resto_ars;
    v_resto := 0;
    v_resto_ars := 0;
  end if;

  v_etiqueta := c.clase || ' ' ||
    coalesce(lpad(c.punto_venta::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0'), 's/n');

  v_asiento := asiento_crear(
    c.fecha, 'comprobante', p_id,
    case when c.tipo = 'venta' then 'Factura de venta ' else 'Factura de compra ' end || v_etiqueta
  );

  -- En la compra el concepto va al debe; en la venta, al haber.
  v_al_debe := c.tipo = 'compra';

  if c.tipo = 'venta' then
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, v_cuenta_contra,
      c.total, v_total_ars, c.moneda, c.tc, c.signo,
      'cliente', c.cliente_id, 'Deudores por ventas', true);
  end if;

  v_orden := v_orden + 1;
  perform asiento_linea(v_asiento, v_orden, c.cuenta_contable_id,
    v_resto, v_resto_ars, c.moneda, c.tc, c.signo, null, null, 'Concepto', v_al_debe);

  for i in 1 .. coalesce(array_length(v_cuentas, 1), 0) loop
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, v_cuentas[i],
      v_montos[i], v_montos_ars[i], c.moneda, c.tc, c.signo, null, null, 'Concepto', v_al_debe);
  end loop;

  if c.tipo = 'compra' then
    /*
     * El IVA, abierto por alícuota —no por cuenta: dos renglones al 21 % que van
     * a cuentas distintas comparten la cuenta de IVA crédito 21 %—.
     *
     * El último renglón absorbe la diferencia entre la suma del desglose y el
     * `iva` de la cabecera, que es contra lo que cuadra el asiento.
     */
    v_iva_desglosado := 0;
    for r in
      select iv.alicuota, sum(iv.iva) as iva,
             row_number() over (order by iv.alicuota) = count(*) over () as ultima
        from comprobante_ivas iv
       where iv.comprobante_id = p_id
       group by iv.alicuota
      having sum(iv.iva) <> 0
       order by iv.alicuota
    loop
      declare
        v_monto numeric(18, 2) := case when r.ultima then c.iva - v_iva_desglosado else r.iva end;
      begin
        v_iva_desglosado := v_iva_desglosado + v_monto;
        v_orden := v_orden + 1;
        perform asiento_linea(v_asiento, v_orden, cuenta_iva_credito(r.alicuota),
          v_monto,
          case when c.moneda = 'ARS' then v_monto else round(v_monto * c.tc, 2) end,
          c.moneda, c.tc, c.signo, null, null,
          'IVA crédito fiscal ' || trim(to_char(r.alicuota * 100, 'FM999D99')) || ' %', true);
      end;
    end loop;

    -- Sin desglose cargado —una factura vieja, o una importada sin alícuota— el
    -- IVA va entero a la cuenta que corresponde a `alicuota_iva`.
    if v_iva_desglosado = 0 and c.iva <> 0 then
      v_orden := v_orden + 1;
      perform asiento_linea(v_asiento, v_orden, cuenta_iva_credito(c.alicuota_iva),
        c.iva, v_iva_ars, c.moneda, c.tc, c.signo, null, null, 'IVA crédito fiscal', true);
    end if;

    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_iva'),
      c.percepcion_iva, v_perc_iva_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IVA', true);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_iibb_bsas'),
      c.percepcion_iibb_bsas, v_iibb_bsas_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB Buenos Aires', true);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_iibb_caba'),
      c.percepcion_iibb_caba, v_iibb_caba_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB Capital', true);
    -- `asiento_linea` no escribe importes en cero: una factura sin estos
    -- conceptos no arrastra líneas vacías ni necesita las claves configuradas.
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_iibb_mendoza'),
      v_iibb_mza, v_iibb_mza_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB Mendoza', true);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('ley_25413'),
      v_ley, v_ley_ars, c.moneda, c.tc, c.signo, null, null,
      'Ley 25413 (impuesto a los débitos y créditos)', true);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_ganancias'),
      v_gcias, v_gcias_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de Ganancias', true);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, v_cuenta_contra,
      c.total, v_total_ars, c.moneda, c.tc, c.signo,
      'proveedor', c.proveedor_id, 'Proveedores', false);
  else
    -- El débito fiscal es una sola cuenta cualquiera sea la alícuota.
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('iva_debito_fiscal'),
      c.iva, v_iva_ars, c.moneda, c.tc, c.signo, null, null, 'IVA débito fiscal', false);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_iva'),
      c.percepcion_iva, v_perc_iva_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IVA practicada', false);
    -- Practicada, no sufrida: se le cobró al cliente para el fisco, así que es
    -- deuda (230) y no el crédito fiscal de las cuentas 50/51.
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, cuenta_config('percepcion_iibb_practicada'),
      v_perc_iibb, v_perc_iibb_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB practicada', false);
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, v_cuenta_internos,
      v_internos, v_internos_ars, c.moneda, c.tc, c.signo, null, null,
      'Impuestos internos', false);
  end if;

  return v_asiento;
end $$;
