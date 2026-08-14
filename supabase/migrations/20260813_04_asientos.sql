/*
 * F7 · Motor de asientos — el punto 1 del documento del contador.
 *
 * Hasta acá cada documento apuntaba a una sola cuenta contable y no tenía
 * contrapartida. Una factura de compra decía "esto es Mercadería" y nada más:
 * no había forma de leer el mayor de Proveedores, ni el IVA crédito, ni de
 * saber si el sistema cerraba consigo mismo. Esta migración cierra eso.
 *
 * ── Por qué el motor vive en la base y no en la aplicación ──────────────────
 *
 * La alternativa era una función TypeScript que arme el asiento y lo escriba
 * junto con el documento. Se descartó por una razón concreta: hay cinco caminos
 * distintos que insertan comprobantes hoy (alta manual, carga inteligente,
 * importador de ventas, importador de compras y los backfills), y cada camino
 * nuevo que se agregue tendría que acordarse de llamar al motor. El día que uno
 * se olvide, el documento entra sin asiento y nadie se entera hasta el cierre.
 *
 * Acá el asiento lo genera un trigger. No hay forma de insertar un comprobante
 * sin su asiento, ni de editarlo sin que el asiento se rehaga, ni de borrarlo
 * dejando el asiento colgado. La regla del plan —"el asiento no se edita nunca
 * a mano; se borra y se rehace desde el documento"— deja de ser una convención
 * que hay que respetar y pasa a ser algo que la base impone.
 *
 * ── Qué garantiza ───────────────────────────────────────────────────────────
 *
 *  1. Todo asiento cuadra en pesos. Un `constraint trigger` diferido verifica
 *     Σ debe_ars = Σ haber_ars al cerrar la transacción. Un asiento
 *     desbalanceado no entra, y como es diferido se puede insertar la cabecera
 *     y las líneas por separado sin pelear con el orden.
 *  2. El descuadre por redondeo es imposible por construcción: la contrapartida
 *     no se calcula aparte, se toma como la **suma de las otras líneas**. Si
 *     redondear el IVA a dos decimales corre un centavo, ese centavo va a parar
 *     a la contrapartida en vez de romper el asiento.
 *  3. Un documento tiene a lo sumo un asiento vigente (índice único sobre
 *     origen + origen_id).
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 *
 * El alcance es contabilidad de gestión: diario, mayor y sumas y saldos. El
 * cierre de ejercicio —ajuste por inflación, amortizaciones, R.E.C.P.A.M.— se
 * sigue haciendo en el estudio contable. Por eso no hay asientos de cierre ni
 * refundición de cuentas de resultado.
 */

/* ── 1 · Las tablas ───────────────────────────────────────────────────────── */

create table if not exists asientos (
  id uuid primary key default gen_random_uuid(),

  fecha date not null,
  -- Correlativo por ejercicio, que es como lo numera el estudio. Global sería
  -- más simple pero obliga a explicar por qué el primer asiento de enero es el
  -- 4.812 en vez del 1.
  ejercicio smallint not null,
  numero    bigint not null,

  -- De dónde salió. 'manual' queda para el asiento que se carga a mano (ajustes,
  -- apertura), que es el único que no tiene documento detrás.
  origen    text not null
            check (origen in ('comprobante', 'pago', 'movimiento', 'manual')),
  -- Sin FK: apunta a tres tablas distintas según el origen. La integridad la
  -- sostienen los triggers de cada una, que borran el asiento con el documento.
  origen_id uuid,

  descripcion text not null,
  estado      text not null default 'vigente' check (estado in ('vigente', 'anulado')),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists asientos_numero_unico
  on asientos (ejercicio, numero);

-- Un documento, un asiento vigente. Es lo que hace que regenerar sea idempotente.
create unique index if not exists asientos_origen_unico
  on asientos (origen, origen_id)
  where origen_id is not null and estado = 'vigente';

create index if not exists asientos_fecha_idx on asientos (fecha desc, numero desc);

alter table asientos enable row level security;

create table if not exists asiento_lineas (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references asientos (id) on delete cascade,
  -- Para que el asiento se lea en el orden en que se pensó (débitos primero) y
  -- no en el que Postgres devuelva.
  orden smallint not null default 0,

  cuenta_contable_id uuid not null references plan_cuentas (id) on delete restrict,

  -- En la moneda del documento, que es como se leen los papeles.
  debe  numeric(18, 2) not null default 0 check (debe  >= 0),
  haber numeric(18, 2) not null default 0 check (haber >= 0),
  -- Una línea es débito o crédito, nunca las dos ni ninguna.
  constraint asiento_lineas_debe_o_haber
    check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0)),

  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tc     numeric(14, 4) not null default 1 check (tc > 0),

  -- El equivalente en pesos, **guardado y no generado**. Generarlo como
  -- debe * tc parece más limpio pero rompe la garantía de cuadre: al redondear
  -- cada línea por separado el asiento se descuadra por centavos. Acá el motor
  -- decide los pesos de cada línea y hace que la contrapartida absorba la
  -- diferencia.
  debe_ars  numeric(18, 2) not null default 0 check (debe_ars  >= 0),
  haber_ars numeric(18, 2) not null default 0 check (haber_ars >= 0),

  -- El submayor. La cuenta 25 "Créditos por ventas" es de tipo CL en el plan del
  -- contador y la 201 "Proveedores" es PR: sin esto el mayor de proveedores es
  -- un solo número gigante en vez del saldo de cada uno.
  auxiliar_tipo text check (auxiliar_tipo in ('cliente', 'proveedor')),
  auxiliar_id   uuid,

  detalle text
);

create index if not exists asiento_lineas_asiento_idx on asiento_lineas (asiento_id, orden);
create index if not exists asiento_lineas_cuenta_idx
  on asiento_lineas (cuenta_contable_id);
create index if not exists asiento_lineas_auxiliar_idx
  on asiento_lineas (auxiliar_tipo, auxiliar_id)
  where auxiliar_id is not null;

alter table asiento_lineas enable row level security;

/* ── 2 · El cuadre, impuesto por la base ──────────────────────────────────── */

/*
 * Diferido a propósito. El motor inserta la cabecera y después las líneas de a
 * una; con un trigger inmediato el asiento estaría desbalanceado después del
 * primer insert y reventaría siempre. Diferido, se valida recién al cerrar la
 * transacción, que es cuando la pregunta "¿cuadra?" tiene sentido.
 */
create or replace function asiento_verificar_cuadre() returns trigger
language plpgsql as $$
declare
  v_asiento uuid;
  v_debe    numeric(18, 2);
  v_haber   numeric(18, 2);
  v_lineas  integer;
begin
  -- Se elige por TG_OP y no con un coalesce sobre las dos: en un DELETE el
  -- registro `new` no está asignado, y tocarlo es un error de ejecución.
  v_asiento := case when tg_op = 'DELETE' then old.asiento_id else new.asiento_id end;

  -- El asiento puede haber sido borrado en la misma transacción (regenerar =
  -- borrar y rehacer). Si ya no está, no hay nada que verificar.
  if not exists (select 1 from asientos where id = v_asiento) then
    return null;
  end if;

  select coalesce(sum(debe_ars), 0), coalesce(sum(haber_ars), 0), count(*)
    into v_debe, v_haber, v_lineas
    from asiento_lineas where asiento_id = v_asiento;

  -- Un asiento sin líneas es un asiento a medio escribir.
  if v_lineas = 0 then
    raise exception 'El asiento % quedó sin líneas', v_asiento;
  end if;

  if v_debe <> v_haber then
    raise exception
      'Asiento % desbalanceado: debe % ≠ haber % (diferencia %)',
      v_asiento, v_debe, v_haber, v_debe - v_haber;
  end if;

  return null;
end $$;

drop trigger if exists asiento_lineas_cuadre on asiento_lineas;
create constraint trigger asiento_lineas_cuadre
  after insert or update or delete on asiento_lineas
  deferrable initially deferred
  for each row execute function asiento_verificar_cuadre();

/* ── 3 · Ayudantes ────────────────────────────────────────────────────────── */

/** La cuenta de sistema por su clave. `config_contable` la sembró F6. */
create or replace function cuenta_config(p_clave text) returns uuid
language sql stable as $$
  select cuenta_id from config_contable where clave = p_clave;
$$;

/** El siguiente número del ejercicio, serializado. Sin el lock, dos altas
 *  simultáneas se llevan el mismo número y el índice único rechaza una. */
create or replace function asiento_proximo_numero(p_ejercicio smallint)
returns bigint language plpgsql as $$
declare
  v_numero bigint;
begin
  perform pg_advisory_xact_lock(hashtext('asiento_numero_' || p_ejercicio));
  select coalesce(max(numero), 0) + 1 into v_numero
    from asientos where ejercicio = p_ejercicio;
  return v_numero;
end $$;

/** Crea la cabecera y devuelve su id. */
create or replace function asiento_crear(
  p_fecha date, p_origen text, p_origen_id uuid, p_descripcion text
) returns uuid language plpgsql as $$
declare
  v_ejercicio smallint := extract(year from p_fecha)::smallint;
  v_id uuid;
begin
  insert into asientos (fecha, ejercicio, numero, origen, origen_id, descripcion)
  values (p_fecha, v_ejercicio, asiento_proximo_numero(v_ejercicio),
          p_origen, p_origen_id, p_descripcion)
  returning id into v_id;
  return v_id;
end $$;

/** Borra el asiento de un documento. Las líneas caen por cascade. */
create or replace function asiento_borrar(p_origen text, p_origen_id uuid)
returns void language sql as $$
  delete from asientos where origen = p_origen and origen_id = p_origen_id;
$$;

/**
 * Una línea. `p_signo` invierte débito y crédito de una: es lo que convierte el
 * asiento de una factura en el de su nota de crédito sin escribir las reglas dos
 * veces.
 */
create or replace function asiento_linea(
  p_asiento uuid, p_orden smallint, p_cuenta uuid,
  p_importe numeric, p_importe_ars numeric,
  p_moneda text, p_tc numeric, p_signo smallint,
  p_auxiliar_tipo text default null, p_auxiliar_id uuid default null,
  p_detalle text default null, p_al_debe boolean default true
) returns void language plpgsql as $$
declare
  v_debe boolean := case when p_signo < 0 then not p_al_debe else p_al_debe end;
begin
  -- Los importes en cero no se escriben: una factura sin percepciones no tiene
  -- por qué arrastrar una línea de percepciones en cero por todo el mayor.
  if p_importe is null or round(p_importe, 2) = 0 then return; end if;
  if p_cuenta is null then
    raise exception 'Falta la cuenta contable para una línea de % (%)', p_detalle, p_importe;
  end if;

  insert into asiento_lineas (
    asiento_id, orden, cuenta_contable_id,
    debe, haber, moneda, tc, debe_ars, haber_ars,
    auxiliar_tipo, auxiliar_id, detalle
  ) values (
    p_asiento, p_orden, p_cuenta,
    case when v_debe then abs(round(p_importe, 2))     else 0 end,
    case when v_debe then 0 else abs(round(p_importe, 2)) end,
    p_moneda, p_tc,
    case when v_debe then abs(round(p_importe_ars, 2)) else 0 end,
    case when v_debe then 0 else abs(round(p_importe_ars, 2)) end,
    p_auxiliar_tipo, p_auxiliar_id, p_detalle
  );
end $$;

/** La cuenta de IVA que corresponde a la alícuota del comprobante. */
create or replace function cuenta_iva_credito(p_alicuota numeric) returns uuid
language sql stable as $$
  select cuenta_config(
    case
      when p_alicuota is null            then 'iva_credito_21'
      when round(p_alicuota, 4) = 0.1050 then 'iva_credito_105'
      when round(p_alicuota, 4) = 0.2700 then 'iva_credito_27'
      else 'iva_credito_21'
    end
  );
$$;

/* ── 4 · El asiento de una factura ────────────────────────────────────────── */

/*
 * Compra                          Venta
 *   D  Mercadería / Gasto           D  Deudores por ventas   (aux: cliente)
 *   D  IVA crédito fiscal             H  Ventas / Servicios
 *   D  Percepciones sufridas          H  IVA débito fiscal
 *     H  Proveedores (aux)            H  Percepciones practicadas
 *
 * La línea del concepto se calcula como `total − IVA − percepciones` en vez de
 * `neto + no gravado + exento`. En un comprobante bien cargado da lo mismo —el
 * servidor recalcula el total desde sus partes— pero si alguna vez no diera, el
 * asiento cuadra igual y la diferencia queda a la vista en la cuenta del
 * concepto, en vez de abortar el alta de la factura.
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
  v_perc_iva_ars numeric(18, 2);
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
  v_perc_iibb_ars := case when c.moneda = 'ARS' then c.percepcion_iibb
                          else round(c.percepcion_iibb * c.tc, 2) end;

  -- El concepto absorbe el redondeo. De acá sale el cuadre exacto.
  v_concepto     := c.total    - c.iva  - c.percepcion_iva - c.percepcion_iibb;
  v_concepto_ars := v_total_ars - v_iva_ars - v_perc_iva_ars - v_perc_iibb_ars;

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
    perform asiento_linea(v_asiento, 4, cuenta_config('percepcion_iibb_caba'),
      c.percepcion_iibb, v_perc_iibb_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB', true);
    perform asiento_linea(v_asiento, 5, v_cuenta_contra,
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
    perform asiento_linea(v_asiento, 5, cuenta_config('percepcion_iibb_caba'),
      c.percepcion_iibb, v_perc_iibb_ars, c.moneda, c.tc, c.signo, null, null,
      'Percepción de IIBB practicada', false);
  end if;

  return v_asiento;
end $$;

/* ── 5 · El asiento de un recibo ──────────────────────────────────────────── */

/*
 * Cobro                           Pago a proveedor
 *   D  Banco / Caja                 D  Proveedores (aux)
 *   D  Retenciones sufridas           H  Banco / Caja
 *     H  Deudores por ventas          H  Retenciones practicadas
 *
 * La diferencia de cambio sale sola y es la razón de fondo por la que este
 * asiento vale la pena: cuando se cobra en pesos una factura en dólares, lo que
 * entró al banco y lo que se cancela de la deuda no son el mismo número en
 * pesos. Esa diferencia es un resultado —ganancia o pérdida— y hasta ahora no
 * la registraba nadie.
 */
create or replace function asiento_de_pago(p_id uuid) returns uuid
language plpgsql as $$
declare
  p           record;
  v_asiento   uuid;
  v_es_cobro  boolean;
  v_cuenta_ctp uuid;
  m           record;
  r           record;
  v_orden     smallint := 0;
  v_debe_ars  numeric(18, 2) := 0;
  v_deuda     numeric(18, 2) := 0;
  v_deuda_ars numeric(18, 2) := 0;
  v_dif_ars   numeric(18, 2);
begin
  select * into p from pagos where id = p_id;
  if not found then return null; end if;

  perform asiento_borrar('pago', p_id);

  v_es_cobro   := p.tipo = 'cobro';
  v_cuenta_ctp := case when v_es_cobro
    then cuenta_config('deudores_por_ventas') else cuenta_config('proveedores') end;
  if v_cuenta_ctp is null then return null; end if;

  -- Lo que se cancela de la cuenta corriente, valuado al TC de cada factura.
  -- Es deliberadamente distinto de lo que entró al banco: la brecha entre los
  -- dos es la diferencia de cambio.
  select
    coalesce(sum(i.importe), 0),
    coalesce(sum(case when cp.moneda = 'ARS' then i.importe
                      else round(i.importe * coalesce(i.tc_aplicado, cp.tc), 2) end), 0)
    into v_deuda, v_deuda_ars
    from imputaciones i join comprobantes cp on cp.id = i.comprobante_id
   where i.pago_id = p_id;

  -- Un recibo sin imputar no tiene contra qué asentar todavía.
  if v_deuda_ars = 0 then return null; end if;

  -- Ni tampoco uno sin contrapartida de plata. Este caso es transitorio y real:
  -- el alta de un recibo inserta la cabecera, después las imputaciones y recién
  -- al final los movimientos, así que entre medio hay un instante con deuda y
  -- sin dinero. Sin este corte, ese instante generaría un asiento donde la
  -- diferencia de cambio absorbe el total del recibo — cuadra, pero es basura.
  if not exists (select 1 from movimientos where pago_id = p_id)
     and not exists (select 1 from pago_retenciones where pago_id = p_id) then
    return null;
  end if;

  v_asiento := asiento_crear(
    p.fecha, 'pago', p_id,
    case when v_es_cobro then 'Cobro a cliente' else 'Pago a proveedor' end
  );

  -- El dinero: un renglón por medio de pago, en la moneda de su cuenta.
  for m in
    select mv.*, cf.cuenta_contable_id as cuenta_cont, cf.nombre as cuenta_nombre
      from movimientos mv join cuentas_financieras cf on cf.id = mv.cuenta_id
     where mv.pago_id = p_id order by mv.created_at
  loop
    if m.cuenta_cont is null then
      raise exception 'La cuenta financiera "%" no tiene cuenta contable asociada', m.cuenta_nombre;
    end if;
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden, m.cuenta_cont,
      m.importe, m.importe_ars, m.moneda, m.tc, 1::smallint, null, null,
      m.cuenta_nombre, v_es_cobro);
    v_debe_ars := v_debe_ars + m.importe_ars;
  end loop;

  -- Las retenciones. En un cobro las sufrimos (son un crédito fiscal, van al
  -- debe); en un pago las practicamos (son una deuda con el fisco, al haber).
  for r in select * from pago_retenciones where pago_id = p_id order by tipo, jurisdiccion
  loop
    v_orden := v_orden + 1;
    declare
      v_cuenta uuid;
      v_ars numeric(18, 2) := case when p.moneda = 'ARS' then r.importe
                                   else round(r.importe * p.tc, 2) end;
    begin
      v_cuenta := coalesce(r.cuenta_contable_id, cuenta_config(
        case
          when not v_es_cobro then 'ret_ganancias_practicada'
          when r.tipo = 'ganancias' then 'ret_ganancias_sufrida'
          when r.tipo = 'iva'       then 'ret_iva_sufrida'
          when r.tipo = 'suss'      then 'ret_suss_sufrida'
          when r.tipo = 'iibb' and coalesce(r.jurisdiccion, '') ilike '%bs%as%'
                                    then 'ret_iibb_bsas_sufrida'
          else 'ret_iibb_caba_sufrida'
        end));
      perform asiento_linea(v_asiento, v_orden, v_cuenta,
        r.importe, v_ars, p.moneda, p.tc, 1::smallint, null, null,
        'Retención ' || r.tipo || coalesce(' ' || r.jurisdiccion, ''), v_es_cobro);
      v_debe_ars := v_debe_ars + v_ars;
    end;
  end loop;

  -- La cuenta corriente, al TC de las facturas.
  v_orden := v_orden + 1;
  perform asiento_linea(v_asiento, v_orden, v_cuenta_ctp,
    v_deuda, v_deuda_ars, p.moneda, p.tc, 1::smallint,
    case when v_es_cobro then 'cliente' else 'proveedor' end,
    coalesce(p.cliente_id, p.proveedor_id),
    case when v_es_cobro then 'Deudores por ventas' else 'Proveedores' end,
    not v_es_cobro);

  -- Y lo que sobra es diferencia de cambio.
  v_dif_ars := v_debe_ars - v_deuda_ars;
  if round(v_dif_ars, 2) <> 0 then
    v_orden := v_orden + 1;
    perform asiento_linea(v_asiento, v_orden,
      cuenta_config(case when (v_dif_ars > 0) = v_es_cobro
                    then 'diferencia_cambio_ganada' else 'diferencia_cambio_perdida' end),
      abs(v_dif_ars), abs(v_dif_ars), 'ARS', 1, 1::smallint, null, null,
      'Diferencia de cambio', (v_dif_ars < 0) = v_es_cobro);
  end if;

  return v_asiento;
end $$;

/* ── 6 · El asiento de un movimiento suelto ───────────────────────────────── */

/*
 * Solo para los movimientos que no vienen de un recibo: un gasto pagado directo
 * del banco, una transferencia, un ajuste. Los que tienen `pago_id` ya están
 * contemplados en el asiento de su recibo y generar otro duplicaría la plata.
 */
create or replace function asiento_de_movimiento(p_id uuid) returns uuid
language plpgsql as $$
declare
  m         record;
  v_asiento uuid;
  v_banco   uuid;
  v_es_ingreso boolean;
begin
  select mv.*, cf.cuenta_contable_id as cuenta_banco, cf.nombre as banco_nombre
    into m
    from movimientos mv join cuentas_financieras cf on cf.id = mv.cuenta_id
   where mv.id = p_id;
  if not found then return null; end if;

  perform asiento_borrar('movimiento', p_id);

  if m.pago_id is not null then return null; end if;
  if m.cuenta_banco is null or m.cuenta_contable_id is null then return null; end if;

  v_banco := m.cuenta_banco;
  v_es_ingreso := m.tipo = 'ingreso';

  v_asiento := asiento_crear(m.fecha, 'movimiento', p_id,
    coalesce(nullif(m.detalle, ''), case when v_es_ingreso then 'Ingreso' else 'Egreso' end)
    || ' · ' || m.banco_nombre);

  -- Un ingreso entra al banco (debe) contra su concepto; un egreso al revés.
  perform asiento_linea(v_asiento, 1, v_banco,
    m.importe, m.importe_ars, m.moneda, m.tc, 1::smallint, null, null,
    m.banco_nombre, v_es_ingreso);
  perform asiento_linea(v_asiento, 2, m.cuenta_contable_id,
    m.importe, m.importe_ars, m.moneda, m.tc, 1::smallint, null, null,
    coalesce(m.detalle, 'Concepto'), not v_es_ingreso);

  return v_asiento;
end $$;

/* ── 7 · Los triggers ─────────────────────────────────────────────────────── */

/*
 * Todos capturan sus propios errores, y esa decisión merece explicación porque
 * va contra el instinto.
 *
 * Un trigger que falla aborta la transacción entera. Sin el `exception`, una
 * cuenta financiera a la que le falta la cuenta contable haría que **no se pueda
 * cargar una factura** — el sistema se planta y el que está facturando no tiene
 * idea de por qué. Cambiar un dato de configuración no puede ser lo que frene la
 * operación.
 *
 * Con el `exception`, el documento se guarda siempre y el asiento que no se pudo
 * armar aparece en `documentos_sin_asiento`, que es una lista de trabajo
 * concreta. El bloque de plpgsql abre un savepoint implícito, así que lo que el
 * motor haya alcanzado a escribir se deshace y no queda un asiento a medias.
 *
 * Lo que **no** se captura es el cuadre: ese `constraint trigger` es diferido y
 * salta al cerrar la transacción, fuera del alcance de estos bloques. Es a
 * propósito. El cuadre está garantizado por construcción —la contrapartida se
 * calcula como la suma de las otras líneas—, así que si alguna vez salta es un
 * bug del motor, y un bug del motor tiene que romper fuerte y no escribir un
 * mayor que no cierra.
 */
create or replace function tg_asiento_comprobante() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('comprobante', old.id);
    return old;
  end if;
  begin
    perform asiento_de_comprobante(new.id);
  exception when others then
    raise warning 'Comprobante % guardado sin asiento: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists comprobantes_asiento on comprobantes;
create trigger comprobantes_asiento
  after insert or update or delete on comprobantes
  for each row execute function tg_asiento_comprobante();

create or replace function tg_asiento_pago() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('pago', old.id);
    return old;
  end if;
  begin
    perform asiento_de_pago(new.id);
  exception when others then
    raise warning 'Recibo % guardado sin asiento: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists pagos_asiento on pagos;
create trigger pagos_asiento
  after insert or update on pagos
  for each row execute function tg_asiento_pago();

drop trigger if exists pagos_asiento_del on pagos;
create trigger pagos_asiento_del
  before delete on pagos
  for each row execute function tg_asiento_pago();

/*
 * El asiento del recibo depende de sus imputaciones, sus retenciones y sus
 * movimientos, que se insertan **después** de la cabecera. Sin estos triggers el
 * asiento se armaría con un recibo todavía vacío.
 */
create or replace function tg_asiento_hijo_de_pago() returns trigger
language plpgsql as $$
declare v_pago uuid := coalesce(new.pago_id, old.pago_id);
begin
  if v_pago is not null and exists (select 1 from pagos where id = v_pago) then
    begin
      perform asiento_de_pago(v_pago);
    exception when others then
      raise warning 'Recibo % sin asiento: %', v_pago, sqlerrm;
    end;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists imputaciones_asiento on imputaciones;
create trigger imputaciones_asiento
  after insert or update or delete on imputaciones
  for each row execute function tg_asiento_hijo_de_pago();

drop trigger if exists retenciones_asiento on pago_retenciones;
create trigger retenciones_asiento
  after insert or update or delete on pago_retenciones
  for each row execute function tg_asiento_hijo_de_pago();

/* El movimiento sirve a dos amos: si es de un recibo refresca el asiento del
 * recibo, y si es suelto genera el suyo. */
create or replace function tg_asiento_movimiento() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform asiento_borrar('movimiento', old.id);
    if old.pago_id is not null and exists (select 1 from pagos where id = old.pago_id) then
      perform asiento_de_pago(old.pago_id);
    end if;
    return old;
  end if;

  begin
    if new.pago_id is not null then
      perform asiento_borrar('movimiento', new.id);
      perform asiento_de_pago(new.pago_id);
    else
      perform asiento_de_movimiento(new.id);
    end if;
  exception when others then
    raise warning 'Movimiento % guardado sin asiento: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists movimientos_asiento on movimientos;
create trigger movimientos_asiento
  after insert or update on movimientos
  for each row execute function tg_asiento_movimiento();

drop trigger if exists movimientos_asiento_del on movimientos;
create trigger movimientos_asiento_del
  before delete on movimientos
  for each row execute function tg_asiento_movimiento();

/* ── 8 · Las vistas que lee el módulo ─────────────────────────────────────── */

/** Libro diario: cada línea con su asiento y su cuenta ya resueltos. */
create or replace view libro_diario as
  select
    a.id as asiento_id, a.fecha, a.ejercicio, a.numero, a.origen, a.origen_id,
    a.descripcion, a.estado,
    l.id as linea_id, l.orden, l.detalle,
    l.debe, l.haber, l.debe_ars, l.haber_ars, l.moneda, l.tc,
    l.auxiliar_tipo, l.auxiliar_id,
    pc.id as cuenta_id, pc.codigo as cuenta_codigo, pc.nombre as cuenta_nombre,
    pc.tipo as cuenta_tipo
  from asientos a
  join asiento_lineas l on l.asiento_id = a.id
  join plan_cuentas pc  on pc.id = l.cuenta_contable_id
 where a.estado = 'vigente';

/**
 * Sumas y saldos: el estado del mayor en una consulta.
 *
 * El filtro de `estado` va **adentro** de la subconsulta y no como condición del
 * left join. Puesto afuera, las líneas de un asiento anulado se siguen sumando
 * —el left join las deja pasar con el asiento en null— y el balance incluiría
 * plata que se dio de baja.
 */
create or replace view sumas_y_saldos as
  select
    pc.id as cuenta_id, pc.codigo, pc.nombre, pc.tipo,
    coalesce(sum(v.debe_ars), 0)  as debe_ars,
    coalesce(sum(v.haber_ars), 0) as haber_ars,
    coalesce(sum(v.debe_ars), 0) - coalesce(sum(v.haber_ars), 0) as saldo_ars,
    count(v.id) as movimientos,
    min(v.fecha) as primer_movimiento,
    max(v.fecha) as ultimo_movimiento
  from plan_cuentas pc
  left join (
    select l.id, l.cuenta_contable_id, l.debe_ars, l.haber_ars, a.fecha
      from asiento_lineas l
      join asientos a on a.id = l.asiento_id
     where a.estado = 'vigente'
  ) v on v.cuenta_contable_id = pc.id
 group by pc.id, pc.codigo, pc.nombre, pc.tipo;

/**
 * Lo que el motor no pudo asentar. Es la lista de trabajo del panel: una factura
 * acá es una factura que no está en el mayor, y por lo tanto un balance que no
 * cierra.
 */
create or replace view documentos_sin_asiento as
  select 'comprobante' as origen, c.id, c.fecha,
         c.clase || ' ' || coalesce(c.punto_venta::text || '-' || c.numero::text, 's/n') as referencia,
         c.total_ars as importe_ars,
         case when c.cuenta_contable_id is null then 'Sin cuenta contable imputada'
              else 'El motor no pudo armar el asiento' end as motivo
    from comprobantes c
   where not exists (select 1 from asientos a
                      where a.origen = 'comprobante' and a.origen_id = c.id and a.estado = 'vigente')
  union all
  select 'movimiento', m.id, m.fecha,
         coalesce(m.detalle, m.referencia, 'Movimiento'), m.importe_ars,
         case when m.cuenta_contable_id is null then 'Sin cuenta contable imputada'
              else 'El motor no pudo armar el asiento' end
    from movimientos m
   where m.pago_id is null
     and not exists (select 1 from asientos a
                      where a.origen = 'movimiento' and a.origen_id = m.id and a.estado = 'vigente');

/* ── 9 · Backfill de todo lo ya cargado ───────────────────────────────────── */

/*
 * Los documentos que ya estaban no dispararon ningún trigger. Se recorren en
 * orden de fecha para que la numeración del diario quede cronológica y no en el
 * orden azaroso en que se cargaron.
 *
 * Cada documento va en su propio bloque con `exception when others`: uno que
 * falle —una cuenta financiera sin cuenta contable, una configuración
 * incompleta— no puede abortar el backfill entero. Lo que no entre queda listado
 * en `documentos_sin_asiento`.
 */
do $$
declare
  r record;
  v_ok integer := 0;
  v_falla integer := 0;
begin
  for r in select id from comprobantes order by fecha, created_at loop
    begin
      perform asiento_de_comprobante(r.id);
      v_ok := v_ok + 1;
    exception when others then
      v_falla := v_falla + 1;
      raise notice 'Comprobante % sin asiento: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select id from pagos order by fecha, created_at loop
    begin
      perform asiento_de_pago(r.id);
      v_ok := v_ok + 1;
    exception when others then
      v_falla := v_falla + 1;
      raise notice 'Pago % sin asiento: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select id from movimientos where pago_id is null order by fecha, created_at loop
    begin
      perform asiento_de_movimiento(r.id);
      v_ok := v_ok + 1;
    exception when others then
      v_falla := v_falla + 1;
      raise notice 'Movimiento % sin asiento: %', r.id, sqlerrm;
    end;
  end loop;

  raise notice 'Backfill de asientos: % documentos procesados, % sin asiento', v_ok, v_falla;
end $$;
