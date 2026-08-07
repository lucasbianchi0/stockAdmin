# Mail a Distecna — credenciales de producción V2

> Redactado el 5 de agosto de 2026, en respuesta al mail de Distecna del 4 de agosto.
> Copiar el bloque del medio y pegarlo tal cual. El anexo del final es solo por si
> lo piden; no hace falta mandarlo de entrada.

**Para:** `api@distecna.com`
**Asunto:** `Credenciales de producción API V2 - Accedra SA`

---

Buenos días,

Gracias por la respuesta y por destrabar el acceso. Confirmo que el dominio de
producción ya resuelve correctamente y que los dos puertos responden: hicimos las
pruebas hoy, 5 de agosto, y de nuestro lado ese punto quedó resuelto.

También tomamos nota de las otras dos respuestas: que no hace falta habilitar una IP
de origen (lo cual nos simplifica bastante, porque nuestra aplicación corre en un
entorno de IP dinámica), y que por ahora no existe un método para consultar pedidos
ya creados. Ajustamos la aplicación para no depender de eso.

Nos quedan dos temas para poder salir a producción.

## 1. Nos faltan las credenciales de producción

Al intentar autenticarnos contra el entorno de producción con el usuario de
homologación que venimos usando, la API nos rechaza.

**Lo que probamos:**

- **Dónde:** `https://dsaapi.distecna.com:8087/Auth/API/login`
- **Con qué usuario:** `distecna_api@distecna.com`
- **Qué nos devolvió:** `401 - "Credenciales invalidas."`
- **Identificador del intento (traceId):** `40004457-0000-ee00-b63f-84710c7967bb`
- **Cuándo:** 5 de agosto de 2026

El servidor funciona bien: nos contesta correctamente y con un mensaje claro. El
problema es simplemente que ese usuario no está habilitado en producción. Con las
mismas credenciales, contra el entorno de homologación, todo sigue funcionando sin
inconvenientes.

**Un dato que puede ayudar a resolverlo rápido:** Accedra ya opera con ustedes en
producción a través de la API V1 (`api.distecna.com:8096`), con la API key asignada
a nuestra cuenta, y funciona perfectamente. Hoy mismo la consultamos y nos devolvió
el catálogo completo de 3.435 productos.

Así que no estaríamos pidiendo un acceso nuevo, sino la versión equivalente de un
acceso que ya tenemos. Lo que pasa es que las dos APIs usan sistemas de
identificación distintos y no son intercambiables: la V1 usa una clave fija que viaja
en la cabecera del pedido, mientras que la V2 pide usuario y contraseña para
devolver un token temporal. Probamos usar la clave de la V1 en la V2 de todas las
formas posibles y ninguna es aceptada, cosa que es esperable.

**Lo que necesitamos:** el usuario y la contraseña de producción para la API V2 de la
cuenta de Accedra SA. O, si es más simple para ustedes, que habiliten en producción
el usuario que ya venimos usando.

**Y una consulta relacionada:** ¿queda algo pendiente de nuestro lado del checklist de
homologación? En el mail anterior les detallamos todo lo que ya validamos en el
entorno de pruebas, incluidos tres pedidos generados con éxito. Si hace falta que
enviemos algo en un formato específico para que lo aprueben, avisennos y lo
preparamos enseguida.

## 2. Un detalle de configuración del certificado en producción

Encontramos algo que les conviene revisar, porque afecta la conexión al servidor de
producción antes incluso de que entren en juego las credenciales.

El certificado de seguridad del servidor de producción es válido y está vigente, pero
el servidor lo está entregando **incompleto**. Un certificado viene acompañado de una
cadena de respaldo que permite comprobar que es auténtico, y el servidor de
producción está enviando solo la primera parte de esa cadena, sin el eslabón
intermedio.

**El contraste con el entorno de pruebas es claro:**

| Entorno | Qué envía el servidor |
|---|---|
| Homologación (`qa-apipublica.distecna.com`) | El certificado **y** su respaldo intermedio ✅ |
| Producción (`dsaapi.distecna.com`) | Solo el certificado, sin el intermedio ⚠️ |

Detectado en los dos puertos de producción, 8087 y 8088.

**Por qué importa:** algunos programas salen a buscar por su cuenta la parte que
falta y la conexión funciona igual. Otros no, y directamente rechazan la conexión.
Nuestra aplicación está en el segundo grupo, así que hoy no puede conectarse a
producción aunque tuviéramos las credenciales. Y no es un caso raro: es el
comportamiento por defecto de una de las plataformas más usadas para este tipo de
integraciones.

**Cómo se soluciona:** en la configuración del servidor, el certificado tiene que
entregarse junto con el intermedio, igual que ya lo hace el entorno de homologación.
Es un cambio de configuración, no hay que emitir ni comprar nada nuevo. El
certificado intermedio que falta es el de la autoridad certificante Sectigo que
firmó el de ustedes, y está disponible públicamente en el sitio de Sectigo.

Mientras tanto podemos resolverlo de nuestro lado, así que esto no nos frena. Se lo
comentamos igual porque le va a pasar a cualquier otro integrador con la misma
plataforma, y a ustedes les ahorra el soporte.

## Resumen

| Tema | Estado |
|---|---|
| Acceso al dominio de producción | ✅ Resuelto, gracias |
| Habilitación de IP de origen | ✅ No hace falta, confirmado |
| Consulta de pedidos por API | ✅ Entendido, no existe por ahora |
| **Credenciales de producción V2** | ⏳ **Es lo que necesitamos** |
| Certificado incompleto en producción | ⚠️ Para que lo revisen |

Quedamos atentos. Cualquier dato adicional que necesiten de nuestro lado, lo mandamos
en el momento.

Saludos cordiales,

**Lucas Bianchi**
Responsable técnico de la integración — Accedra SA
lucmbianchi2000@gmail.com — 11 2457 1928

---
---

# Anexo — detalle técnico

> **No mandar de entrada.** Guardar por si el área técnica de Distecna pide precisiones.
> Todas las pruebas son del 5 de agosto de 2026.

## Resolución de nombres

El dominio de producción, que el 29 de julio no resolvía, ahora sí:

```
dsaapi.distecna.com          -> 64.190.27.41    (antes: fallo de DNS)
qa-apipublica.distecna.com   -> 190.12.102.20
api.distecna.com             -> 64.190.27.41
```

Producción comparte dirección IP con la API V1, lo cual es consistente.

## Estado de los puertos de producción

Los dos responden, con handshake completo:

```
https://dsaapi.distecna.com:8087/   -> HTTP 301
https://dsaapi.distecna.com:8088/   -> HTTP 301
```

Sin token, la API responde como corresponde:

```
GET https://dsaapi.distecna.com:8088/v2/Product?search=&limit=1&offset=0
-> HTTP 401
```

## Rechazo de credenciales

```
POST https://dsaapi.distecna.com:8087/Auth/API/login
body: { "userName": "distecna_api@distecna.com", "password": "<la de homologación>" }

-> HTTP 401
{
  "statusCode": 401,
  "error": "Credenciales invalidas.",
  "traceId": "40004457-0000-ee00-b63f-84710c7967bb"
}
```

La respuesta está bien formada, o sea que la ruta existe y el cuerpo del pedido se
interpretó correctamente. El rechazo es de la cuenta, no del formato.

### Intentos con la clave de V1 (todos rechazados, como era de esperar)

| Intento | Resultado |
|---|---|
| Clave de V1 en la cabecera `x-apikey` sobre `/v2/Product` | 401 |
| Clave de V1 como `Authorization: Bearer` | 401 |
| Clave de V1 usada como contraseña en el login de V2 | 401, traceId `4000381b-0003-ea00-b63f-84710c7967bb` |

## Control: V1 producción funciona

```
GET https://api.distecna.com:8096/Product   (cabecera x-apikey)
-> HTTP 200, 3.435 productos
```

Es la prueba de que la cuenta de Accedra está activa en producción.

## Control: homologación V2 sigue funcionando

Con las mismas credenciales, contra `qa-apipublica.distecna.com`:

| Llamada | Resultado |
|---|---|
| `POST /Auth/API/login` | 200, token válido por 1 hora |
| `GET /v2/PaymentTerms` | 200 |
| `GET /v2/DeliveryAddresses` | 200 |
| `GET /v2/Product?search=&limit=1&offset=0` | 200, 3.078 productos |

Confirma que el problema es específico del entorno de producción.

## Cadena de certificados

Lo que entrega cada servidor:

```
PRODUCCIÓN — dsaapi.distecna.com:8087 y :8088
  0  CN=*.distecna.com
     emitido por: Sectigo Public Server Authentication CA DV R36
  (la cadena termina acá — falta el intermedio)

HOMOLOGACIÓN — qa-apipublica.distecna.com:8086
  0  CN=*.distecna.com
     emitido por: Sectigo Public Server Authentication CA DV R36
  1  Sectigo Public Server Authentication CA DV R36
     emitido por: Sectigo Public Server Authentication Root R46
  (cadena completa)
```

El certificado en sí está bien: vigente del 20/02/2026 al 31/01/2027.

**Certificado intermedio faltante:**
`http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt`
(la propia dirección figura dentro del certificado de ustedes, en el campo de
Acceso a Información de la Autoridad)

**Efecto práctico:** herramientas como `curl` en macOS descargan el intermedio por su
cuenta y la conexión funciona. Node.js no lo hace y aborta con
`unable to verify the first certificate`. Lo comprobamos suministrando el intermedio
manualmente: con él, la conexión se establece y llega hasta el 401 de credenciales.
Sin él, ni siquiera conecta.

**Solución del lado del servidor:** concatenar el certificado intermedio al del
servidor en la configuración de TLS, tal como ya está hecho en homologación.
