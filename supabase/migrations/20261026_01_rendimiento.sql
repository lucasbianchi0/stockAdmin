/*
 * Rendimiento de Administración: índices para las consultas que más se repiten
 * y una suma en la base para el saldo inicial del mayor.
 *
 * Todo es aditivo —índices con `if not exists` y una función nueva— y nada del
 * código depende todavía de la función: se puede aplicar en cualquier momento.
 */

/* ── 1 · Índices ──────────────────────────────────────────────────────────── */

/*
 * El mayor y el subdiario filtran las líneas por cuenta y después las cruzan
 * con su asiento para quedarse con las vigentes. El índice que había era sólo
 * por `cuenta_contable_id`; con el `asiento_id` adentro, Postgres resuelve el
 * cruce desde el índice sin ir a buscar cada línea a la tabla.
 */
create index if not exists asiento_lineas_cuenta_asiento_idx
  on asiento_lineas (cuenta_contable_id, asiento_id);

/*
 * La conciliación y el extracto con «sin conciliar» preguntan por los
 * movimientos de una cuenta que todavía no se conciliaron. El índice por
 * (cuenta_id, fecha) no ayuda a ese filtro.
 */
create index if not exists movimientos_cuenta_conciliado_idx
  on movimientos (cuenta_id, conciliado);

/*
 * El subdiario arma el período por fecha de registro: sin índice, cada pedido
 * recorre la tabla entera para encontrar las del mes.
 */
create index if not exists comprobante_registro_fecha_idx
  on comprobante_registro (fecha_registro);

/* ── 2 · Saldo de una cuenta hasta una fecha ──────────────────────────────── */

/*
 * Lo que el mayor necesita para arrancar el saldo corrido: debe menos haber de
 * todas las líneas vigentes anteriores al período.
 *
 * Hoy la ruta trae esas líneas en páginas de mil y las suma en memoria; en
 * Caja o en Créditos por ventas, un mayor de diciembre baja miles de filas
 * sólo para quedarse con un número. Esto devuelve el número.
 *
 * Mismo criterio que `libro_diario`: sólo asientos vigentes, y `p_hasta`
 * excluida (es el `desde` del período, que ya cuenta como período). Con
 * `p_auxiliar` es el submayor de un cliente o proveedor.
 *
 * `security invoker` (lo de siempre): corre con los permisos de quien llama,
 * así que las políticas RLS de las tablas siguen valiendo. Igual se le saca el
 * permiso a anon y authenticated: el servidor la llama con la service role.
 */
create or replace function saldo_cuenta_hasta(
  p_cuenta uuid,
  p_hasta date,
  p_auxiliar uuid default null
) returns numeric
language sql stable as $$
  select coalesce(sum(l.debe_ars - l.haber_ars), 0)
    from asiento_lineas l
    join asientos a on a.id = l.asiento_id
   where l.cuenta_contable_id = p_cuenta
     and a.estado = 'vigente'
     and a.fecha < p_hasta
     and (p_auxiliar is null or l.auxiliar_id = p_auxiliar);
$$;

revoke execute on function saldo_cuenta_hasta(uuid, date, uuid) from public, anon, authenticated;
grant execute on function saldo_cuenta_hasta(uuid, date, uuid) to service_role;
