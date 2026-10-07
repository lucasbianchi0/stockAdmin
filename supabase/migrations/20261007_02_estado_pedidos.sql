/*
 * Pedidos a Distecna: el estado lo llevamos nosotros
 * -----------------------------------------------------------------------------
 *
 * La API de Distecna no expone el estado de un pedido. Hasta ahora todo pedido
 * quedaba "enviado" para siempre, aunque despues se cancelara por telefono con
 * el proveedor: la lista decia una cosa y la realidad otra.
 *
 * Ahora se cambia a mano: enviado -> confirmado -> entregado, o cancelado.
 * "error" lo sigue poniendo solo el sistema, cuando Distecna rechaza el alta.
 *
 * Quien lo cambio se guarda con su nombre al momento, igual que el autor de un
 * ticket: si la persona despues cambia su nombre o deja la empresa, el registro
 * sigue diciendo quien fue. La nota es el motivo ("el proveedor cancelo por
 * falta de stock"), que es lo primero que se pregunta meses despues.
 */

alter table orders add column if not exists status_note text;
alter table orders add column if not exists status_updated_at timestamptz;
alter table orders add column if not exists status_updated_by uuid references auth.users (id) on delete set null;
alter table orders add column if not exists status_updated_by_nombre text;

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('enviado', 'confirmado', 'entregado', 'cancelado', 'error'));
