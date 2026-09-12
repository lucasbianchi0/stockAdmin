/**
 * Los topes del asistente que tienen que coincidir en el navegador y en el
 * servidor. El servidor es el que manda —valida y rechaza—; el cliente los usa
 * para no mandar algo que va a volver con un 400.
 *
 * Son también el primer techo de gasto: el historial viaja entero en cada
 * pedido, así que 30 mensajes de 2.000 caracteres es lo más que puede pesar
 * una conversación.
 */
export const MAX_MENSAJES = 30
/** Lo que escribe la persona. */
export const MAX_LARGO = 2000
/** Lo que respondió el asistente y vuelve en el historial. Tiene que alcanzar
 *  para la respuesta más larga que permite `max_tokens` —unos 8.000
 *  caracteres—: con el tope de la persona, la primera respuesta larga hacía
 *  rebotar el mensaje siguiente. */
export const MAX_LARGO_RESPUESTA = 12000
