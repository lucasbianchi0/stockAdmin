# Publicación automática en Instagram y LinkedIn

Una pieza programada sale sola: un cron corre cada quince minutos, toma lo que
venció y lo publica. El código ya está. Lo que sigue son los trámites de las
plataformas, que es lo único que no se puede escribir.

Orden sugerido: **Instagram primero**. Es el que se puede terminar en una tarde.
LinkedIn en la página de la empresa depende de una aprobación que puede demorar
semanas, así que conviene arrancar el pedido hoy y seguir en paralelo.

---

## 1. Instagram

### 1.1 Convertir la cuenta a Profesional

Sin esto no hay nada que hacer: **para una cuenta personal no existe API de
publicación**. Ninguna herramienta la tiene, no es una limitación nuestra.

En la app: Configuración → Tipo de cuenta → Cambiar a cuenta profesional →
Business. Es reversible, no perdés seguidores ni publicaciones, y el perfil
queda igual salvo por la categoría.

> Se usa el camino **"Instagram API con Instagram Login"**, que no requiere una
> Página de Facebook vinculada. Si en algún momento leés instrucciones que hablan
> de vincular una Página, son las del camino viejo — no hacen falta.

### 1.2 Crear la app en Meta

1. https://developers.facebook.com/apps → Crear app → tipo **Business**.
2. Agregar el producto **Instagram** → *Configuración de la API con Instagram Login*.
3. Permisos: `instagram_business_basic` e `instagram_business_content_publish`.
4. En *Configuración del negocio*, agregar la cuenta de Instagram como cuenta de prueba.
5. Copiar el **secreto de la app** → `INSTAGRAM_APP_SECRET`.

Mientras la app esté en **modo desarrollo** publicás en tus propias cuentas sin
revisión de Meta. Para sacarla de ahí hace falta verificación del negocio y App
Review; para publicar sólo en la cuenta propia, no es necesario.

### 1.3 Conectar

Desde el panel de la app, generar un token de acceso (dura una hora) y canjearlo:

```bash
node scripts/conectar-social.mjs instagram <token-corto>
```

Queda guardado un token de 60 días que **se renueva solo** mientras el cron corra
al menos una vez cada dos meses.

### Límites que conviene saber

- 50 publicaciones cada 24 horas.
- Caption: 2200 caracteres, 30 hashtags como máximo.
- Sólo imagen simple por ahora. Carrusel y reel son otro flujo (hay que crear los
  hijos por separado y hacer polling del estado); no está implementado.

---

## 2. LinkedIn

Acá hay una bifurcación real, y **ser el dueño de la empresa no la elimina**.
Para LinkedIn, tu perfil (`urn:li:person:…`) y la Página de la empresa
(`urn:li:organization:…`) son dos entidades distintas con permisos distintos.

| | Perfil personal | Página de empresa |
|---|---|---|
| Producto | Share on LinkedIn | Community Management API |
| Acceso | Autoservicio, hoy | **Vetted product**: solicitud con revisión |
| Demora | Minutos | Días o semanas, puede rechazarse |

La Community Management API tiene dos niveles, y esto cambia la expectativa:

- **Development Tier** — aprobación inicial, con volumen de llamadas limitado.
  Es el que hay que pedir. Para una página que publica unas pocas veces por
  semana, el límite no se toca ni de cerca.
- **Standard Tier** — acceso pleno. Se sube desde el Development Tier y exige
  **un video de pantalla** demostrando cada caso de uso del formulario. No hace
  falta para lo que estamos haciendo.

La organización de ACCEDRA es `urn:li:organization:1420716` — sale de la URL del
panel de administración de la página.

**El request de publicación es idéntico en los dos casos**: cambia el URN del
autor y nada más. Por eso conviene hacer las dos cosas en paralelo — pedís el
acceso a Community Management ahora y mientras tanto el conector queda andando
contra el perfil personal. Cuando aprueben, se vuelve a correr el script con el
URN de la organización y listo.

### 2.1 Crear la app

1. https://www.linkedin.com/developers/apps → Create app, asociándola a la Página.
2. Pestaña **Products**: pedir *Share on LinkedIn* (se habilita solo) y
   *Community Management API* (queda en revisión).
3. **Verificar la app como admin de la Página**. LinkedIn genera un link que
   tenés que abrir vos mismo; hasta que no lo hacés, los productos no se
   activan. Es el paso que traba a todo el mundo porque no parece un paso.
4. Pestaña **Auth**: copiar Client ID y Client Secret, y declarar la URL de
   redirección. Tiene que coincidir **exactamente**, carácter por carácter, con
   `LINKEDIN_REDIRECT_URI`.

### La versión de la API caduca

El header `LinkedIn-Version` es obligatorio y con formato AAAAMM. LinkedIn retira
cada versión a los doce meses: la 202508 se dio de baja el **17 de agosto de
2026**. El default del código es `202608`; cuando empiece a devolver 426, se sube
`LINKEDIN_API_VERSION` y listo.

Conviene adelantarse: el día que caduca, los posts dejan de salir y no hay ningún
aviso más que el feed vacío.

### 2.2 Conectar

Abrir en el navegador (reemplazando lo que corresponda):

```
https://www.linkedin.com/oauth/v2/authorization
  ?response_type=code
  &client_id=<CLIENT_ID>
  &redirect_uri=<REDIRECT_URI>
  &scope=openid%20profile%20w_member_social
```

Autorizar. LinkedIn redirige con `?code=...` en la URL: ese código dura pocos
minutos.

```bash
# Perfil personal
node scripts/conectar-social.mjs linkedin <code>

# Página de empresa (cuando aprueben el acceso)
node scripts/conectar-social.mjs linkedin <code> urn:li:organization:<ID>
```

### El token de 60 días

LinkedIn sólo entrega refresh token a las apps que tienen habilitada la
renovación programática. Si la tuya no la tiene, **hay que volver a correr el
script cada 60 días**. Vale la pena anotarlo en el calendario: el síntoma es que
las publicaciones empiezan a fallar sin que nadie lo note.

---

## 3. Poner a andar el cron

1. `CRON_SECRET`: generar con `openssl rand -hex 32`.
2. Cargarlo en `.env.local`, en Vercel (Production) y en los secretos del repo.
3. En GitHub → Settings → Secrets → Actions, agregar `APP_URL` (la URL de
   producción, sin barra final) y `CRON_SECRET`.
4. Aplicar la migración `20260823_01_publicacion.sql`.

Para probar sin esperar quince minutos: pestaña Actions → *Publicar contenido* →
Run workflow.

---

## 4. Cómo entra una pieza en la cola

Una pieza sale sola cuando cumple **las cuatro** condiciones:

- tiene `contenido` escrito,
- tiene `imagen_path` (la imagen generada y guardada),
- tiene `publicar_at` en el pasado,
- está en `estado_publicacion = 'pendiente'`.

El default es `'inactiva'`, a propósito: nada entra en la cola por existir. Si
las piezas nacieran pendientes, el primer tick publicaría meses de calendario de
una sentada.

Por ahora se pasa a pendiente a mano:

```sql
update content_slots
   set estado_publicacion = 'pendiente',
       publicar_at = (programada + time '13:00') at time zone 'America/Argentina/Buenos_Aires'
 where id = '<slot-id>';
```

**Esto es lo que falta construir en la UI**: un botón "programar publicación" con
selector de hora en el calendario, y un indicador de estado en cada pieza
(pendiente / publicado / error, con el mensaje de error a la vista).

---

## 5. Lo que protege contra publicar dos veces

Es el único error irreversible del sistema: del otro lado no hay "deshacer".

- El worker **reclama antes de publicar**, con `FOR UPDATE SKIP LOCKED`
  (`reclamar_publicaciones` en la migración). Dos ticks solapados no pueden
  llevarse la misma fila: el segundo saltea lo que el primero ya tomó.
- Un trabajo colgado se reintenta **sólo si `post_externo_id` es null**. Con id,
  la pieza ya salió y no se toca nunca más.
- Tres intentos y para. Un caption que la plataforma rechaza va a fallar siempre,
  y reintentar para siempre gasta cuota que después falta.

Queda **una ventana** que ningún diseño cierra del todo: si la plataforma publica
y la respuesta se pierde antes de que podamos guardar el id, el reintento
duplica. Es improbable y, cuando pasa, el log dice `NO SE PUDO CERRAR el slot` —
si aparece eso, hay que mirar la fila a mano antes del tick siguiente.
