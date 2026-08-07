# Permisos por módulo

Quién ve qué en el backoffice. Tres módulos —`productos`, `marketing`,
`administracion`— y un acceso total aparte.

Acceso total **no** es "tiene los tres módulos listados", es una marca propia
(`admin: true`). La diferencia importa en dos casos: cuando agreguemos un cuarto
módulo, los administradores lo heredan sin que nadie reedite su metadata; y una
ruta que todavía no está declarada la puede abrir un administrador, que es justo
quien tiene que poder diagnosticarla.

## Dónde vive el permiso

En el `app_metadata` del usuario, dentro de Supabase Auth: `admin: true` para
acceso total, o `modulos: [...]` para acceso parcial. **No** en una tabla, por
dos razones:

- `app_metadata` no lo puede modificar el propio usuario. `user_metadata`, en
  cambio, se edita desde el cliente con la sesión — usarlo para permisos sería
  dejar que cada uno se asigne los suyos.
- Viaja dentro del JWT, así que el middleware lo lee sin consultar la base en
  cada navegación.

Por eso no hay migración de tablas. Lo único que hay que hacer es escribir el
metadata de cada usuario.

## ⚠️ Antes de desplegar

El sistema **cierra por defecto**: un usuario sin `modulos` en su metadata no ve
nada y cae en `/sin-acceso`. Si desplegás el código antes de sembrar el
metadata, todos quedan afuera, vos incluido.

El orden correcto es al revés, y no tiene riesgo: el SQL de abajo escribe un
campo que el código actual todavía ignora, así que se puede correr **hoy**, con
la versión vieja en producción, y recién después desplegar.

```sql
-- 1. Todos los usuarios existentes quedan como administradores.
--    Es a propósito: primero nadie pierde acceso, después se recorta.
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"admin":true}'::jsonb;

-- 2. Sofía, sólo marketing. Se le quita la marca de admin y se le da el módulo.
update auth.users
set raw_app_meta_data =
  (coalesce(raw_app_meta_data, '{}'::jsonb) - 'admin')
  || '{"modulos":["marketing"]}'::jsonb
where email = 'sofiavega@accedra.com.ar';

-- 3. Verificar antes de desplegar.
select
  email,
  raw_app_meta_data -> 'admin'   as admin,
  raw_app_meta_data -> 'modulos' as modulos
from auth.users
order by email;
```

Para dar acceso total a alguien más adelante, alcanza con el paso 1 filtrando
por su email. Para un acceso parcial, el paso 2 con la lista de módulos que
corresponda.

El cambio impacta cuando el usuario renueva su token. Si querés que sea
inmediato, cerrale la sesión: `select auth.uid()` no alcanza — hay que revocar
desde el panel de Supabase (Authentication → Users → el usuario → Sign out).

## Las tres barreras

Están en este orden a propósito, de la más lejana al dato a la más cercana.

1. **`src/middleware.ts`** — corre en el edge antes de renderizar. Una página
   prohibida no se esconde: no se sirve. Las rutas de `/api` reciben 401/403 en
   JSON, no una redirección al login, porque un `fetch` que recibe el HTML de una
   pantalla de ingreso falla de una forma imposible de diagnosticar.

2. **`exigirModulo()` en cada handler de API** (`src/lib/guard-api.ts`) — una
   línea al inicio de cada handler. El middleware es una sola pieza con un
   `matcher` lleno de exclusiones; alcanza con que alguien lo edite para dejar
   pasar un asset para abrir un agujero silencioso.

   Acá importa más que en otras apps: **todos los handlers consultan Supabase
   con la service role key, que ignora las políticas RLS.** No hay red debajo —
   este chequeo es la red.

3. **El filtro de la sidebar** — cosmético. Que no le mostremos a Sofía puertas
   que no puede abrir es cortesía, no seguridad.

## Agregar una ruta

`src/lib/permisos.ts` es la fuente única. Una ruta que no esté declarada ahí
queda **prohibida** para todos menos para los administradores: nace cerrada, no
abierta. Si agregás una página o un endpoint, sumalo a `RUTAS`.

Si el módulo es nuevo, además: sumarlo a `MODULOS`, a `NOMBRE_MODULO`, a
`HOME_DE_MODULO`, y darle al grupo correspondiente de la sidebar ese mismo `id`.
Los administradores lo heredan solos; a los usuarios con acceso parcial hay que
agregárselo a mano si corresponde.
