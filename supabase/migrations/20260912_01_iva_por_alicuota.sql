/*
 * Una factura, varias alícuotas de IVA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hasta acá un comprobante tenía un neto y una alícuota. Alcanza para la mayoría,
 * pero no es como son las facturas: una misma factura de un proveedor de servicios
 * trae parte al 21 % y parte al 27 %, y una de venta parte al 21 % y parte al
 * 10,5 %. Con un solo par había que elegir cuál mentir, y el IVA quedaba imputado
 * entero a una cuenta que no era — el crédito fiscal del 27 % cayendo en la del
 * 21 % es un error que aparece recién en la declaración jurada.
 *
 * El desglose va en una tabla hija y no en más columnas: la cantidad de alícuotas
 * de una factura no la decide el esquema, y el motor de asientos necesita poder
 * recorrerlas para emitir un renglón de IVA por cada una.
 *
 * COMPATIBILIDAD
 *
 * `comprobantes.neto_gravado` y `comprobantes.iva` siguen siendo la suma, y
 * `alicuota_iva` sigue siendo la alícuota cuando hay una sola. Todo lo que ya los
 * lee —el detalle, la importación, los reportes, el control de cuadratura— sigue
 * funcionando sin enterarse. Lo único que aprende del desglose es el asiento.
 *
 * Con `alicuota_iva` en null y renglones cargados, «no hay una sola alícuota» es
 * la respuesta correcta y no un dato faltante.
 */

create table if not exists comprobante_ivas (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references comprobantes (id) on delete cascade,

  -- Como fracción, igual que `comprobantes.alicuota_iva`: 0.2100, no 21.
  alicuota numeric(5, 4) not null check (alicuota >= 0 and alicuota <= 1),
  neto     numeric(16, 2) not null check (neto >= 0),
  -- Se guarda y no se calcula: la factura del proveedor manda, y su IVA puede
  -- diferir del producto por un centavo de redondeo propio.
  iva      numeric(16, 2) not null default 0 check (iva >= 0),

  created_at timestamptz not null default now()
);

-- Dos renglones a la misma alícuota son un solo renglón con el neto sumado. Sin
-- esto, el asiento emitiría dos líneas contra la misma cuenta de IVA.
create unique index if not exists comprobante_ivas_una_por_alicuota
  on comprobante_ivas (comprobante_id, alicuota);

create index if not exists comprobante_ivas_comprobante
  on comprobante_ivas (comprobante_id);

alter table comprobante_ivas enable row level security;

/* ── El desglose de lo ya cargado ─────────────────────────────────────────── */

-- Cada comprobante existente es, por definición, un desglose de un solo renglón.
-- Escribirlo hace que el motor tenga un único camino en vez de dos.
insert into comprobante_ivas (comprobante_id, alicuota, neto, iva)
select c.id, c.alicuota_iva, c.neto_gravado, c.iva
  from comprobantes c
 where c.alicuota_iva is not null
   and (c.neto_gravado > 0 or c.iva > 0)
on conflict (comprobante_id, alicuota) do nothing;

/* ── El asiento, con un renglón de IVA por alícuota ───────────────────────── */

/*
 * Compra                          Venta
 *   D  Mercadería / Gasto           D  Deudores por ventas   (aux: cliente)
 *   D  IVA crédito 21 %               H  Ventas / Servicios
 *   D  IVA crédito 27 %               H  IVA débito fiscal
 *   D  Percepciones sufridas          H  Percepciones practicadas
 *     H  Proveedores (aux)
 *
 * En compras cada alícuota tiene cuenta propia —40, 41, 42— y por eso el desglose
 * cambia el asiento. En ventas el débito fiscal es una sola cuenta, así que el
 * asiento sale igual; el desglose igual se guarda, porque el libro de IVA ventas
 * lo necesita abierto por alícuota para la declaración jurada.
 *
 * El orden de los renglones se lleva en un contador y no en números escritos a
 * mano: la cantidad de líneas de IVA ya no se sabe de antemano.
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
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, c.cuenta_contable_id,
      v_concepto, v_concepto_ars, c.moneda, c.tc, c.signo, null, null, 'Concepto', true);

    /*
     * El IVA, abierto por alícuota.
     *
     * El último renglón absorbe la diferencia entre la suma del desglose y el
     * `iva` de la cabecera. Los dos números salen de la misma carga y deberían
     * coincidir, pero si alguna vez no lo hacen, el que manda es el total del
     * comprobante: es contra él que cuadra el asiento, y una línea de IVA de más
     * o de menos descuadraría el mayor por un centavo sin que nadie sepa por qué.
     */
    v_iva_desglosado := 0;
    for r in
      select iv.alicuota, iv.iva,
             row_number() over (order by iv.alicuota) = count(*) over () as ultima
        from comprobante_ivas iv
       where iv.comprobante_id = p_id and iv.iva <> 0
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
    -- IVA va entero a la cuenta que corresponde a `alicuota_iva`, que es lo que
    -- hacía el motor antes de esta migración.
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
    perform asiento_linea(v_asiento, 1, v_cuenta_contra,
      c.total, v_total_ars, c.moneda, c.tc, c.signo,
      'cliente', c.cliente_id, 'Deudores por ventas', true);
    perform asiento_linea(v_asiento, 2, c.cuenta_contable_id,
      v_concepto, v_concepto_ars, c.moneda, c.tc, c.signo, null, null, 'Concepto', false);
    -- El débito fiscal es una sola cuenta cualquiera sea la alícuota, así que acá
    -- el desglose no cambia el asiento. Vive igual, para el libro de IVA ventas.
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

/* ── El asiento sigue al desglose ─────────────────────────────────────────── */

-- Igual que las imputaciones de un recibo: los renglones se escriben después de
-- la cabecera, así que sin este trigger el asiento se armaría con el desglose
-- todavía vacío. Es exactamente el bug que dejó recibos sin banco.
create or replace function tg_asiento_comprobante_iva() returns trigger
language plpgsql as $$
declare
  v_comprobante uuid := coalesce(new.comprobante_id, old.comprobante_id);
  v_error text;
begin
  if v_comprobante is not null
     and exists (select 1 from comprobantes where id = v_comprobante and estado = 'confirmado') then
    begin
      perform asiento_de_comprobante(v_comprobante);
      v_error := null;
    exception when others then
      v_error := sqlerrm;
      raise warning 'Comprobante % sin asiento: %', v_comprobante, sqlerrm;
    end;
    perform asiento_falla('comprobante', v_comprobante, v_error);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists comprobante_ivas_asiento on comprobante_ivas;
create trigger comprobante_ivas_asiento
  after insert or update or delete on comprobante_ivas
  for each row execute function tg_asiento_comprobante_iva();

/* ── Regenerar, para que el desglose recién cargado llegue al mayor ───────── */

do $$
declare
  d record;
  n integer := 0;
begin
  for d in
    select id from comprobantes where estado = 'confirmado' order by fecha, created_at
  loop
    begin
      perform asiento_de_comprobante(d.id);
      n := n + 1;
    exception when others then
      raise warning 'Comprobante % sin asiento: %', d.id, sqlerrm;
    end;
  end loop;

  raise notice 'Asientos de comprobantes regenerados: %', n;
end $$;
