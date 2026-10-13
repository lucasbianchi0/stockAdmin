/*
 * La búsqueda de Contactos, sin acentos y por nombre completo.
 *
 * Antes se buscaba con un `ilike` por columna: "martin" no encontraba a
 * "Martín", y "rocio navarro" no encontraba a nadie, porque nombre y apellido
 * son columnas distintas y ninguna de las dos contiene las dos palabras.
 *
 * Esta columna junta todo lo buscable en un solo texto, en minúscula y sin
 * acentos, y la búsqueda exige que esté cada palabra (en cualquier orden).
 * Se calcula sola en cada alta o edición: no hay que mantenerla. El AM no
 * entra: tiene su filtro, y buscar "martin" tiene que traer a las personas
 * que se llaman así, no todas las cuentas de Martín.
 *
 * `translate` y no la extensión `unaccent`: alcanza para el castellano, no
 * hay que instalar nada, y es inmutable, que es lo que pide una columna
 * generada.
 */

alter table contactos drop column if exists busqueda;

alter table contactos
  add column busqueda text generated always as (
    translate(
      lower(
        coalesce(empresa, '') || ' ' ||
        coalesce(nombre, '') || ' ' ||
        coalesce(apellido, '') || ' ' ||
        coalesce(cargo, '') || ' ' ||
        coalesce(departamento, '') || ' ' ||
        coalesce(vertical, '') || ' ' ||
        coalesce(email, '') || ' ' ||
        coalesce(telefono, '') || ' ' ||
        coalesce(observaciones, '')
      ),
      'áéíóúüñàèìòùâêîôûç',
      'aeiouunaeiouaeiouc'
    )
  ) stored;
