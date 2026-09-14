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
 *  para la respuesta más larga que permite `max_tokens` —los especialistas
 *  escriben auditorías y planes de unos 16.000 caracteres—: con el tope de la
 *  persona, la primera respuesta larga hacía rebotar el mensaje siguiente. */
export const MAX_LARGO_RESPUESTA = 20000

/**
 * El techo de lo que pesa el historial entero, en caracteres (~15.000 tokens).
 * Es un tope de gasto: sin él, una conversación larga con un especialista
 * manda cien mil tokens por mensaje.
 */
export const MAX_HISTORIAL = 60000

/**
 * Hasta dónde se recorta al pasar un techo. Se recorta de a mucho y no de a un
 * mensaje: la caché guarda el prefijo exacto, y un historial que pierde su
 * primer mensaje en cada turno cambia el prefijo en cada turno y no se lee
 * nunca. Cortando de más, el principio queda fijo durante varios mensajes.
 */
export const HISTORIAL_TRAS_RECORTE = 36000
export const MENSAJES_TRAS_RECORTE = 20
