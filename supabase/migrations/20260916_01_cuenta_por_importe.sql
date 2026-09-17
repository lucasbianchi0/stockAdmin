/*
 * Una factura, varias cuentas contables
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Una misma factura trae productos y servicios: el neto de la mercadería va a
 * una cuenta y el del servicio a otra, aunque los dos estén al 21 %. Con una sola
 * cuenta por comprobante había que elegir cuál mentir, o partir la factura en
 * dos cargas que no existen en AFIP.
 *
 * Cada renglón de neto gravado lleva su cuenta, y el no gravado y el exento la
 * suya. Todas son opcionales: el renglón sin cuenta usa la de la cabecera, que
 * sigue siendo la de siempre. Una factura cargada antes de esto no cambia en
 * nada.
 *
 * `comprobantes.cuenta_contable_id` sigue siendo obligatoria para el asiento. La
 * API la completa con la primera cuenta de los renglones cuando la cabecera
 * llega vacía, así `documentos_sin_asiento` y los listados siguen leyendo lo
 * mismo.
 */

alter table comprobante_ivas
  add column if not exists cuenta_contable_id uuid references plan_cuentas (id) on delete restrict;

alter table comprobantes
  add column if not exists cuenta_no_gravado_id uuid references plan_cuentas (id) on delete restrict,
  add column if not exists cuenta_exento_id     uuid references plan_cuentas (id) on delete restrict;

-- Dos renglones al 21 % ya no son el mismo tramo escrito dos veces si van a
-- cuentas distintas. Lo que sigue siendo un duplicado es misma alícuota y misma
-- cuenta.
drop index if exists comprobante_ivas_una_por_alicuota;
create unique index if not exists comprobante_ivas_una_por_alicuota_y_cuenta
  on comprobante_ivas (
    comprobante_id, alicuota,
    coalesce(cuenta_contable_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

/* ── El asiento, con el concepto abierto por cuenta ───────────────────────── */

/*
 * Compra                               Venta
 *   D  Mercadería (neto 21 %)            D  Deudores por ventas   (aux: cliente)
 *   D  Servicios  (neto 21 %, exento)      H  Ventas de productos
 *   D  IVA crédito 21 %                    H  Ventas de servicios
 *   D  Percepciones sufridas               H  IVA débito fiscal
 *     H  Proveedores (aux)                 H  Percepciones practicadas
 *
 * Cada cuenta distinta de la cabecera recibe la suma de sus importes. La de la
 * cabecera recibe el resto —lo que no tiene cuenta propia, los otros impuestos y
 * el redondeo—, igual que antes absorbía el redondeo del concepto entero. Si la
 * cabecera se queda sin nada, el redondeo en pesos va a la cuenta más grande:
 * una línea con cero en la moneda original y centavos en pesos no se escribiría,
 * y el asiento no cuadraría.
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

  -- El concepto absorbe el redondeo. De acá sale el cuadre exacto.
  v_concepto     := c.total     - c.iva     - c.percepcion_iva - v_perc_iibb;
  v_concepto_ars := v_total_ars - v_iva_ars - v_perc_iva_ars   - v_perc_iibb_ars;

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
  end if;

  return v_asiento;
end $$;
