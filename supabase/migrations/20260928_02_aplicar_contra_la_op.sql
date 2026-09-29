/*
 * Cada factura se imputa contra SU orden de pago
 * -----------------------------------------------------------------------------
 *
 * Pedido de Administracion, con el motivo que lo justifica:
 *
 *   «Cuando uno carga el pago a cuenta, que luego figure esa OP como se
 *    visualiza con las facturas. En DISTECNA o en Solution Box siempre se saca
 *    el pago y luego que se retira te emiten la factura. Para poder imputar cada
 *    factura en el pago correspondiente: si bien el saldo es el mismo, si queda
 *    una diferencia en algun pago de esta forma se identifica mejor.»
 *
 * POR QUE EL SALDO UNICO NO ALCANZABA
 *
 * Hasta acá el saldo a favor de una ficha era una bolsa: la suma de `a_cuenta`
 * de todos sus recibos. Contesta "cuanto credito queda" y nada mas.
 *
 * Con estos dos proveedores el anticipo no es una rareza contable, es la forma
 * normal de operar, y cada pago se corresponde con un retiro concreto de
 * mercaderia. La pregunta que hay que poder contestar no es cuanto queda sino
 * "¿esta entrega quedo facturada entera?", y esa la bolsa no la contesta. Si un
 * pago queda con una punta sin usar, con saldo unico no hay forma de saber si es
 * porque esa operacion se facturo por menos o porque un pago posterior se paso.
 *
 * Esta tabla es el vinculo que faltaba: que recibo consume que anticipo y por
 * cuanto. El asiento no cambia —sigue siendo Proveedores contra Anticipos— y la
 * ecuacion del recibo tampoco. Lo unico que se agrega es la trazabilidad.
 */

create table if not exists pago_aplicaciones (
  id uuid primary key default gen_random_uuid(),

  /* La OP a cuenta de la que sale el credito. Borrarla se lleva sus
     aplicaciones: si el anticipo no existe, lo que se aplico contra el tampoco. */
  pago_origen_id uuid not null references pagos (id) on delete cascade,

  /* El recibo que lo consume para cancelar facturas. */
  pago_destino_id uuid not null references pagos (id) on delete cascade,

  importe numeric(18, 2) not null check (importe > 0),

  created_at timestamptz not null default now(),

  /* Un recibo no puede tomar dos veces del mismo anticipo: serian dos renglones
     que hay que sumar a mano para saber cuanto salio de ahi. */
  unique (pago_origen_id, pago_destino_id),

  /* Un anticipo no se aplica a si mismo. */
  check (pago_origen_id <> pago_destino_id)
);

create index if not exists pago_aplicaciones_origen_idx
  on pago_aplicaciones (pago_origen_id);
create index if not exists pago_aplicaciones_destino_idx
  on pago_aplicaciones (pago_destino_id);

/* ── El saldo de cada orden de pago ───────────────────────────────────────── */

/*
 * Lo que le queda a CADA anticipo, no a la ficha entera. Es la vista que le da
 * de comer a la pantalla: los renglones que aparecen junto a las facturas para
 * elegir contra cual imputar.
 *
 * Solo las que todavia tienen algo: una OP agotada ya no es una opcion, y
 * mostrarla obligaria a leer "0,00" en una lista donde lo unico que importa es
 * contra que se puede imputar.
 */
create or replace view ordenes_a_cuenta as
  select
    p.id                                                     as pago_id,
    p.tipo,
    case when p.tipo = 'cobro' then 'cliente' else 'proveedor' end as entidad_tipo,
    coalesce(p.cliente_id, p.proveedor_id)                   as entidad_id,
    p.fecha,
    p.moneda,
    p.a_cuenta                                               as importe,
    coalesce(a.aplicado, 0)                                  as aplicado,
    round(p.a_cuenta - coalesce(a.aplicado, 0), 2)           as saldo
    from pagos p
    left join (
      select pago_origen_id, sum(importe) as aplicado
        from pago_aplicaciones
       group by pago_origen_id
    ) a on a.pago_origen_id = p.id
   where p.a_cuenta > 0
     and round(p.a_cuenta - coalesce(a.aplicado, 0), 2) > 0;

/* ── El saldo a favor de la ficha, ahora derivado de sus ordenes ──────────── */

/*
 * Se mantiene la vista que ya existia porque la usan el formulario y el
 * reporte, pero pasa a sumar los saldos de las ordenes en vez de sumar
 * `a_cuenta` con signo. Da lo mismo cuando todo esta aplicado prolijamente, y
 * deja de dar lo mismo —correctamente— el dia que una aplicacion se borre: el
 * credito vuelve a su orden y reaparece en las dos vistas a la vez.
 */
create or replace view saldos_a_cuenta as
  select
    o.entidad_tipo,
    o.entidad_id,
    o.moneda,
    round(sum(o.saldo), 2) as saldo
    from ordenes_a_cuenta o
   where o.entidad_id is not null
   group by 1, 2, 3
  having round(sum(o.saldo), 2) <> 0;

alter table pago_aplicaciones enable row level security;
