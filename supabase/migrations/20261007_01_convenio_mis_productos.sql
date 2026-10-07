/*
 * Nuestros Productos: el convenio
 * -----------------------------------------------------------------------------
 *
 * Con algunas marcas hay convenio: Distecna lista un producto a USD 10, pero con
 * un 20 % de convenio el costo real es USD 8, y es ese 8 el que tiene que entrar
 * en la cuenta del precio minimo. Sin esto, el minimo sale mas alto de lo que es
 * y el semaforo marca en rojo publicaciones que tienen margen de sobra.
 *
 * Es por producto y no por marca, porque asi lo pidieron: el convenio se pacta
 * sobre lineas puntuales, no sobre todo el catalogo de la marca.
 *
 * Se guarda como porcentaje (20 = 20 %), igual que se escribe en pantalla. Nulo
 * quiere decir "sin convenio", que no es lo mismo que un convenio de 0 %: por eso
 * el cero no se acepta. Tampoco el 100 %, que daria costo cero.
 *
 * No toca el pedido a Distecna: ellos facturan su precio de lista, y el convenio
 * se recupera por otro lado.
 */

alter table my_products
  add column if not exists convenio_pct numeric(5, 2)
    check (convenio_pct > 0 and convenio_pct < 100);
