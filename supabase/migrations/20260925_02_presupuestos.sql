/*
 * Modulo Comercial: presupuestos
 * -----------------------------------------------------------------------------
 *
 * Lo que hoy es una planilla de Excel por presupuesto, con su copia de las
 * formulas y su numeracion a mano.
 *
 * LA DECISION DE FONDO: UN DOCUMENTO, DOS CARAS
 *
 * El pedido separa "informacion interna" —costos, proveedor, margen— de
 * "informacion externa" —lo que recibe el cliente—. Podrian ser dos documentos:
 * la planilla de costos y la propuesta. No lo son. Es uno solo, y lo que cambia
 * es que columnas se muestran.
 *
 * Que sea uno es lo que garantiza lo que el pedido pide de verdad: que la
 * propuesta del cliente salga "automaticamente" del mismo PRES. Con dos
 * documentos habria que copiar los renglones de uno al otro, y el dia que
 * alguien corrige un precio en la planilla y no en la propuesta, se manda un
 * precio que no existe.
 *
 * LOS IMPORTES SE GUARDAN, NO SE DERIVAN
 *
 * El renglon guarda costo unitario y venta unitaria. La venta NACE de multiplicar
 * el costo por el margen, pero se guarda como numero propio porque el pedido
 * pide poder "editar y modificar importes": el dia que alguien redondea una
 * venta a mano, ese numero es el que vale, y una columna calculada lo pisaria en
 * el siguiente render.
 *
 * Lo que si se deriva —impuesto, rentabilidad, porcentajes, totales— se deriva
 * siempre, en la vista de abajo. Son consecuencias aritmeticas de los importes,
 * y guardarlas seria abrir la puerta a que un dia no coincidan.
 *
 * La aritmetica, leida de la planilla que esto reemplaza:
 *
 *     venta unitaria =  costo unitario x margen        (1,7 por defecto)
 *     impuesto       =  venta total    x break         (10 % por defecto)
 *     rentabilidad   =  venta total - costo total - impuesto
 *     renta %        =  rentabilidad  / venta total
 */

/* -- 1 - El numero de presupuesto ----------------------------------------- */

/*
 * Una secuencia y no un `max(numero) + 1`: dos personas presupuestando al mismo
 * tiempo sacarian el mismo numero, y el numero es lo que despues se usa para
 * buscarlo y para hablar de el por telefono.
 */
create sequence if not exists presupuesto_numero_seq start with 1 increment by 1;

/* -- 2 - La cabecera ------------------------------------------------------ */

create table if not exists presupuestos (
  id uuid primary key default gen_random_uuid(),

  numero integer not null unique default nextval('presupuesto_numero_seq'),

  -- La misma tabla que usa Administracion. No hay copia ni sincronizacion: el
  -- pedido dice "una unica base de clientes para todo el sistema" y esta es la
  -- forma de que eso no dependa de que nadie se olvide.
  cliente_id uuid not null references clientes (id) on delete restrict,

  -- "Cambio de AP - Sucursal Rio Gallegos". Es como se reconoce un presupuesto
  -- en una lista de doscientos, mas que por su numero.
  referencia text not null,

  fecha date not null default current_date,
  fecha_validez date,

  moneda text not null default 'USD' check (moneda in ('ARS', 'USD')),

  -- El dolar con el que se armo. Se congela en el presupuesto: si se recalculara
  -- con el de hoy, un presupuesto enviado la semana pasada mostraria otros
  -- numeros que los que el cliente tiene en la mano.
  tc numeric(18, 4),

  vendedor_id uuid references vendedores (id) on delete set null,

  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviado', 'aceptado', 'facturado')),

  /* Los tres parametros de la planilla, por presupuesto y no globales: en el
     ejemplo el flete va sin margen y la mano de obra a 1,7, y el dia que un
     cliente grande pida otro margen se cambia en su presupuesto sin tocar los
     anteriores. Los valores por defecto son los que la empresa usa hoy. */
  break_pct numeric(6, 4) not null default 0.10,
  margen_materiales numeric(6, 4) not null default 1.70,
  margen_mano_obra numeric(6, 4) not null default 1.70,

  /* Los bloques de texto de la propuesta. Arrancan de una plantilla y quedan
     editables por presupuesto, que es lo que pide el documento: "parte del texto
     puede estar predefinido, pero algunos puntos los tenemos que poder
     modificar segun el presupuesto o el cliente". */
  alcance text,
  condiciones text,
  confidencialidad text,
  observaciones text,
  no_contempla text,
  nota_importante text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists presupuestos_cliente_idx on presupuestos (cliente_id);
create index if not exists presupuestos_fecha_idx on presupuestos (fecha desc);
create index if not exists presupuestos_estado_idx on presupuestos (estado);

/* -- 3 - Los renglones ---------------------------------------------------- */

create table if not exists presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos (id) on delete cascade,

  -- El orden en que se cargaron: la planilla se lee de arriba abajo y el orden
  -- es informacion (primero mano de obra, despues materiales, al final el flete).
  orden smallint not null default 0,

  /* El proveedor va como texto y no como FK al maestro. En la planilla real
     dice "CESAR", "RELET", "ENVIO": nombres de quien cotiza, que muchas veces
     todavia no son un proveedor cargado con CUIT. Obligar a crear la ficha para
     poder escribir un renglon convertiria el presupuesto en un tramite. */
  proveedor text,
  parte text,

  cantidad numeric(18, 4) not null default 1 check (cantidad > 0),
  descripcion text not null,

  /* Que es el renglon. Decide que margen le toca por defecto y, en la propuesta
     del cliente, bajo que titulo se lista: el modelo separa MANO DE OBRA de
     MATERIALES. */
  tipo text not null default 'material'
    check (tipo in ('material', 'mano_obra', 'otro')),

  costo_unitario numeric(18, 4) not null default 0,
  /* Nace de costo x margen y despues manda lo que diga acá: ver la cabecera. */
  venta_unitaria numeric(18, 4) not null default 0,

  /* Por renglon y no por presupuesto: en la planilla el flete va con 0 % y el
     resto con el break general. */
  imp_pct numeric(6, 4) not null default 0.10,
  iva numeric(6, 4) not null default 0.21,

  -- Si hay stock. Sale impreso en la propuesta del cliente que lleva tabla.
  stock boolean not null default true,

  created_at timestamptz not null default now()
);

create index if not exists presupuesto_items_presupuesto_idx
  on presupuesto_items (presupuesto_id, orden);

/* -- 4 - Los archivos del presupuesto ------------------------------------- */

/*
 * "Se debe poder cargar en cada PRES todos los documentos relacionados tales
 * como las facturas de los proveedores, la OC, Remitos, Factura de venta".
 *
 * Misma forma que `comprobante_adjuntos` y mismo bucket: un solo mecanismo de
 * archivos en el sistema, no dos que se parecen.
 */
create table if not exists presupuesto_adjuntos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos (id) on delete cascade,
  nombre text not null,
  ruta text not null,
  tipo_mime text,
  tamano integer,
  /* Para que la lista se pueda leer sin abrir cada archivo: la OC no es lo mismo
     que el remito aunque los dos sean un PDF. */
  clase text not null default 'otro'
    check (clase in ('factura_proveedor', 'orden_compra', 'remito', 'factura_venta', 'foto', 'otro')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists presupuesto_adjuntos_presupuesto_idx
  on presupuesto_adjuntos (presupuesto_id);

/* -- 5 - Los totales, derivados ------------------------------------------- */

/*
 * La misma cuenta que hace la planilla, una sola vez y en un solo lugar.
 *
 * Es una vista y no columnas guardadas por lo mismo que `comprobantes_saldo`:
 * un total guardado es un total que algun dia no coincide con sus renglones, y
 * cuando eso pasa nadie sabe cual de los dos numeros creer.
 */
create or replace view presupuesto_items_calculados as
  select
    i.*,
    round(i.cantidad * i.costo_unitario, 2)                             as costo_total,
    round(i.cantidad * i.venta_unitaria, 2)                             as venta_total,
    round(i.cantidad * i.venta_unitaria * i.imp_pct, 2)                 as impuesto,
    round(i.cantidad * i.venta_unitaria
          - i.cantidad * i.costo_unitario
          - i.cantidad * i.venta_unitaria * i.imp_pct, 2)               as rentabilidad
    from presupuesto_items i;

create or replace view presupuestos_totales as
  select
    p.id                                                as presupuesto_id,
    coalesce(sum(c.costo_total), 0)::numeric(18, 2)     as total_costo,
    coalesce(sum(c.venta_total), 0)::numeric(18, 2)     as total_venta,
    coalesce(sum(c.impuesto), 0)::numeric(18, 2)        as total_impuesto,
    coalesce(sum(c.rentabilidad), 0)::numeric(18, 2)    as total_rentabilidad,
    count(c.id)                                         as items
    from presupuestos p
    left join presupuesto_items_calculados c on c.presupuesto_id = p.id
   group by p.id;

/* -- 6 - `updated_at` ------------------------------------------------------ */

create or replace function presupuesto_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists presupuestos_touch on presupuestos;
create trigger presupuestos_touch before update on presupuestos
  for each row execute function presupuesto_touch();

/* -- 7 - RLS -------------------------------------------------------------- */

/*
 * Cerradas al cliente anonimo, igual que el resto del administrativo: todo el
 * acceso pasa por el servidor, que ya chequeo el modulo del usuario antes de
 * llegar hasta acá.
 */
alter table presupuestos enable row level security;
alter table presupuesto_items enable row level security;
alter table presupuesto_adjuntos enable row level security;
