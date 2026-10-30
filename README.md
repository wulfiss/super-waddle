# Obrador

MVP de registro de pedidos, en español argentino, adaptable a celulares y PC.

Al pulsar «Guardar pedido», se abre una ventana de revisión con fecha, responsable, productos y cantidades. «Volver a editar» conserva el formulario sin guardar; «Sí, guardar pedido» confirma el registro.

## Desarrollo

Requiere Node.js 24 y npm. Desde este directorio:

```sh
npm ci
npm run dev
```

`npm run check` verifica tipos y Svelte. `npm run build` genera la salida para Vercel.

Sin variables de Supabase funciona en **modo demo**, con catálogo de ejemplo e historial en localStorage. Los datos quedan en este navegador y no se sincronizan. El historial local no se migra automáticamente a Supabase.

## Supabase

1. Revisá que el proyecto destino sea el correcto y que no existan las tablas `products`, `productions` o `production_items`. La migración inicial está pensada para un proyecto nuevo y no modifica tablas existentes.
2. Con Supabase CLI autenticado, ejecutá:

   ```sh
   supabase link --project-ref gyyocqskfyyqylvkicak
   supabase db push --dry-run
   supabase db push
   ```

   La migración `supabase/migrations/20261030112836_initial_production.sql` crea catálogo, pedidos, detalles, políticas RLS y una función transaccional para guardar un pedido completo. Ya se aplicó al proyecto Bakery (`gyyocqskfyyqylvkicak`); el nombre local coincide con el historial remoto. No la vuelvas a ejecutar manualmente allí. También se puede ejecutar su contenido una sola vez desde el SQL Editor en otro proyecto nuevo, reconciliando luego el historial de migraciones.
3. Cargá el catálogo real desde Supabase. Para una prueba con productos de ejemplo, ejecutá opcionalmente `supabase/seed.sql`; no se carga con la migración de producción.
4. Copiá `.env.example` a `.env` e ingresá la URL del proyecto y su clave pública/publishable (o anon heredada). No uses una clave service-role ni una clave `sb_secret_`.
5. En Supabase Auth, configurá la URL final de la app como Site URL y agregá esa URL y `http://localhost:5173` a las redirecciones permitidas para el acceso por correo. Para un equipo cerrado, desactivá el registro público e invitá a sus integrantes. Configurá SMTP para enviar correos reales fuera de las restricciones del proveedor de prueba.
6. Ingresá con el enlace recibido por correo y cargá un pedido. Recargá para verificar la persistencia y comprobá con otro usuario que no pueda leer los pedidos del primero.

El personal de panadería puede consultar sus propios pedidos; depósito y administración pueden consultar los pedidos de todo el equipo. El catálogo se comparte entre los perfiles asignados. La administración del catálogo se hace desde Supabase en esta etapa. Las escrituras directas de usuarios están deshabilitadas; el guardado pasa por la función transaccional.

## Pantallas y permisos

Las pestañas disponibles dependen del perfil asignado al usuario:

| Perfil | Pantallas | Permisos |
| --- | --- | --- |
| `bakery` | Panadería | Crear pedidos y consultar su propio historial. |
| `warehouse` | Depósito | Consultar todos los pedidos recibidos, con búsqueda por responsable/producto y filtro de fecha. No puede crear pedidos. |
| `admin` | Panadería, Depósito y Administración | Crear pedidos, consultar todo el historial y abrir cualquier pantalla. |

La migración `supabase/migrations/20261030125651_role_based_screens.sql` agrega `user_roles`, conserva a los usuarios existentes como personal de panadería y restringe las lecturas y la función de guardado en PostgreSQL. **Aplicala antes de desplegar esta versión** (`supabase db push --dry-run`, luego `supabase db push` sobre el proyecto correcto). La migración de esta rama se verificó en PostgreSQL embebido; no se aplicó al proyecto remoto durante este cambio.

Los usuarios nuevos quedan sin acceso hasta que se les asigne un perfil. Desde el SQL Editor de Supabase, una persona con permisos de administración de la base puede asignarlo por correo:

```sql
-- Reemplazá el correo y elegí bakery, warehouse o admin.
insert into public.user_roles(user_id, role)
select id, 'warehouse' from auth.users where lower(email) = lower('persona@ejemplo.com')
on conflict (user_id) do update set role = excluded.role;
```

El usuario debe existir primero en Supabase Auth. Nadie se convierte en administrador automáticamente. La app permite leer el perfil propio, pero no modificarlo: tampoco desde las herramientas del navegador. No se toman permisos de `user_metadata`, cookies ni localStorage. Para revocar acceso, eliminá su fila de `user_roles`; las políticas consultan la asignación vigente en cada petición. Recargar la app o pulsar «Actualizar acceso» vuelve a verificar las pestañas disponibles. El panel de Administración permite abrir las pantallas; la asignación de perfiles sigue a cargo de la administración de la base.

En modo demo, «Rol de demostración» permite revisar los tres perfiles usando únicamente datos locales. Ese selector no aparece al configurar Supabase y no concede permisos sobre la base de datos.

`supabase/config.toml` configura desarrollo local con registro público desactivado y catálogo de ejemplo. Estos ajustes de Auth no cambian automáticamente los del proyecto remoto. Además de las pruebas con PostgreSQL embebido (PGlite), el 30/10/2026 se verificó en Bakery el guardado, cantidades fraccionarias, aislamiento entre usuarios, rechazo de escrituras directas y anónimas, y rollback ante cantidades inválidas. Los usuarios y registros de prueba se revirtieron al terminar. El catálogo real se cargó con cinco productos, medidos por envase o bolsa.

El advisor de seguridad informa que los usuarios autenticados pueden ejecutar `save_production` con `SECURITY DEFINER`. Es intencional: esta es la única vía de escritura, verifica `auth.uid()`, fija `search_path` vacío y no permite ejecución anónima. Se comprobaron permisos y aislamiento en la base remota. La entrega del enlace de acceso y sus redirecciones requieren una prueba desde el dominio desplegado.

## Vercel

Importá este repositorio con preset SvelteKit y Node.js 24. Configurá las dos variables de `.env.example` en los entornos de Vercel que vayas a usar. `vercel.json` ejecuta verificación de tipos y `npm run build:production`; el despliegue falla si faltan las variables o se proporciona una clave privada. `npm run build` sigue disponible para compilar la demo local.

Despliegue activo: **https://obrador-three.vercel.app**, proyecto `wulfiss-projects/obrador`, conectado a este repositorio. Se configuraron las dos variables públicas en Production, Preview y Development, y Node.js 24. El 30/10/2026 se verificaron HTTP 200 y la pantalla de acceso con Supabase a 390 y 1440 px, sin errores de JavaScript ni desbordamiento horizontal. Chromium recibió las respuestas HTTPS a través de Node con la CA del proxy del entorno y validación TLS activa.

Antes del primer uso, configurá en [Supabase Auth](https://supabase.com/dashboard/project/gyyocqskfyyqylvkicak/auth/url-configuration) Site URL como `https://obrador-three.vercel.app` y agregá esa misma URL a Redirect URLs. Las herramientas MCP disponibles no exponen estos ajustes. Probá luego el acceso por correo, guardado e historial desde el dominio final; la entrega del correo y el recorrido autenticado completo siguen pendientes. El endpoint público de Auth responde y el acceso por correo está habilitado. El registro público remoto estaba habilitado al verificarlo: para un equipo cerrado, desactivalo e invitá a sus integrantes.

## Alcance

Fecha editable (hoy por defecto en Argentina), responsable, catálogo buscable, múltiples productos, cantidades positivas por unidad, confirmación, historial y pantallas según perfil. Depósito consulta los pedidos recibidos; no incluye edición/eliminación, seguimiento de entregas ni stock.

## Validación

```sh
npm test
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` prueba la validación del formulario, los permisos de las pantallas y las dos migraciones en PostgreSQL embebido. Comprueba guardado, cantidades fraccionarias, aislamiento de panadería, lectura compartida de depósito/administración, rechazo de escrituras de depósito, bloqueo de cambios de perfil y revocación de acceso, además del rollback ante datos inválidos. No necesita credenciales remotas.

`npm run test:e2e` inicia automáticamente la app en modo demo y prueba búsqueda, guardado, historial, persistencia, separación de pantallas y navegación por teclado a 390 y 1440 px. Puede usar Chromium del sistema con `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. Playwright es una dependencia de desarrollo. El flujo de GitHub Actions ejecuta estas verificaciones en cada PR y push a `main`.
