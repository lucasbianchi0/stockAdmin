/*
 * Los presupuestos quedan correlativos
 * -----------------------------------------------------------------------------
 *
 * Reportado desde Administracion: «¿Por que salta del 1 al 5? ¿Sera que cargue
 * varios de prueba? ¿Se puede hacer que queden correlativos?»
 *
 * Los numeros 2, 3 y 4 los consumieron presupuestos de prueba que despues se
 * borraron. Una secuencia de Postgres no devuelve el numero al borrar la fila
 * —es lo correcto para una factura, donde un hueco significa "este comprobante
 * se anulo"— pero en un presupuesto significa otra cosa: que alguien empezo a
 * armar uno y lo descarto. Ese hueco no tiene nada que contar, y en una lista
 * numerada se lee como si faltaran documentos.
 *
 * LA REGLA NUEVA, Y LO QUE LA HACE SEGURA
 *
 * Un presupuesto nuevo toma el numero libre mas bajo. Asi un borrador que se
 * descarta devuelve su numero y la serie se cierra sola.
 *
 * Reutilizar numeros seria peligroso si el numero devuelto ya hubiera salido
 * hacia afuera: dos propuestas distintas con el mismo "PRES 5" en la historia de
 * un cliente. Por eso va junto con la otra mitad de la regla, que vive en la
 * API: SOLO SE PUEDE BORRAR UN BORRADOR. Una vez que el presupuesto se envio,
 * se acepto o se facturo, su numero ya es de alguien mas y no vuelve nunca.
 *
 * El `lock` no es decorativo: sin el, dos personas creando al mismo tiempo
 * calcularian el mismo "numero libre mas bajo" y una de las dos chocaria contra
 * el indice unico.
 */

create or replace function siguiente_numero_presupuesto() returns integer
language plpgsql as $$
declare
  v_numero integer;
begin
  -- Serializa el calculo entre sesiones. Se libera solo al terminar la
  -- transaccion, asi que el INSERT que sigue entra adentro del mismo candado.
  perform pg_advisory_xact_lock(hashtext('presupuesto_numero'));

  select coalesce(min(n), 1) into v_numero
    from generate_series(1, coalesce((select max(numero) from presupuestos), 0) + 1) as n
   where not exists (select 1 from presupuestos p where p.numero = n);

  return v_numero;
end $$;

/* La secuencia deja de ser la fuente del numero. Se deja creada porque la
   columna todavia la nombra como default de respaldo, pero el alta pasa por la
   funcion de arriba. */
alter table presupuestos
  alter column numero set default siguiente_numero_presupuesto();

/* ── El arreglo de lo que ya existe ───────────────────────────────────────── */

/*
 * Hoy es el unico momento en que esto se puede hacer sin costo: ninguno de los
 * dos presupuestos cargados salio todavia hacia un cliente con su numero
 * puesto —la propuesta en PDF ni siquiera existe— y los dos estan en borrador.
 * Dentro de un mes, renumerar seria cambiarle el nombre a un documento que ya
 * esta en el mail de alguien.
 */
update presupuestos p
   set numero = nuevo.fila
  from (
    select id, row_number() over (order by numero) as fila
      from presupuestos
  ) as nuevo
 where p.id = nuevo.id
   and p.numero <> nuevo.fila;

/* La secuencia queda donde corresponde por si alguna vez se vuelve a usar. */
select setval(
  'presupuesto_numero_seq',
  greatest(coalesce((select max(numero) from presupuestos), 0), 1),
  true
);
