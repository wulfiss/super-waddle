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

Sin variables de Supabase, o con `PUBLIC_PREVIEW_MODE=true`, funciona con **cuentas de prueba**, sin acceso por correo ni contraseña. La cuenta de panadería se abre directamente. «Cuenta de prueba» permite cambiar entre Equipo de panadería, Equipo de depósito y Administrador de prueba. Se recuerda la cuenta seleccionada al recargar.

El catálogo de ejemplo y los pedidos son locales: quedan en este navegador y no se sincronizan con Supabase. Panadería consulta los pedidos de su cuenta; depósito y administración pueden ver todos los pedidos de prueba del navegador. Los pedidos locales anteriores se conservan como pedidos de la cuenta de panadería. El historial local no se migra automáticamente a Supabase.

Para desplegar estas cuentas, configurá `PUBLIC_PREVIEW_MODE=true` únicamente en el entorno Preview de Vercel, con alcance a la rama que quieras probar. La variable desactiva el cliente de Supabase incluso si hay claves configuradas. El build de producción rechaza esta opción para evitar publicar las cuentas de prueba como acceso real. No hace falta aplicar la migración de roles para probar la preview local.

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
| `bakery` | Panadería | Crear, editar y eliminar sus propios pedidos desde el historial. |
| `warehouse` | Depósito | Consultar todos los pedidos recibidos, con búsqueda por responsable/producto y filtro de fecha. No puede crear pedidos. |
| `admin` | Panadería, Depósito y Administración | Crear, editar y eliminar pedidos de cualquier cuenta, abrir cualquier pantalla y consultar el registro de cambios. |

La migración `supabase/migrations/20261030125651_role_based_screens.sql` agrega `user_roles`, conserva a los usuarios existentes como personal de panadería y restringe las lecturas y la función de guardado en PostgreSQL. **Aplicala antes de desplegar la versión conectada a Supabase** (`supabase db push --dry-run`, luego `supabase db push` sobre el proyecto correcto). La migración de esta rama se verificó en PostgreSQL embebido; no se aplicó al proyecto remoto durante este cambio.

Los usuarios nuevos quedan sin acceso hasta que se les asigne un perfil. Desde el SQL Editor de Supabase, una persona con permisos de administración de la base puede asignarlo por correo:

```sql
-- Reemplazá el correo y elegí bakery, warehouse o admin.
insert into public.user_roles(user_id, role)
select id, 'warehouse' from auth.users where lower(email) = lower('persona@ejemplo.com')
on conflict (user_id) do update set role = excluded.role;
```

El usuario debe existir primero en Supabase Auth. Nadie se convierte en administrador automáticamente. La app permite leer el perfil propio, pero no modificarlo: tampoco desde las herramientas del navegador. No se toman permisos de `user_metadata`, cookies ni localStorage. Para revocar acceso, eliminá su fila de `user_roles`; las políticas consultan la asignación vigente en cada petición. Recargar la app o pulsar «Actualizar acceso» vuelve a verificar las pestañas disponibles. El panel de Administración permite abrir las pantallas; la asignación de perfiles sigue a cargo de la administración de la base.

«Cuenta de prueba» aparece únicamente en el modo local de prueba. Ese selector no concede permisos sobre la base de datos. Cuando las cuentas de prueba están desactivadas y Supabase está configurado, se conserva el acceso por correo y los permisos asignados en PostgreSQL.

### Editar, eliminar y consultar cambios

En **Panadería → Historial**, «Editar pedido» abre los datos y productos existentes. «Guardar cambios» muestra una revisión antes de confirmar; «Cancelar edición» descarta el borrador. La edición conserva el mismo identificador de pedido y actualiza lo que consulta depósito. «Eliminar pedido» pide confirmación y retira el pedido de las listas activas de panadería y depósito.

En **Administración → Registro de cambios**, cada alta, edición o eliminación nueva guarda fecha y hora de Argentina, cuenta que actuó, identificador del pedido y una copia completa de los valores anteriores y posteriores. Las ediciones también muestran un resumen de fechas, responsables y productos/cantidades modificados. La eliminación es una cancelación interna: se conservan el pedido, sus productos y el registro para el administrador. El registro no ofrece acciones para modificar o borrar entradas.

En las cuentas de prueba, pedidos y registro se guardan juntos en `obrador-preview-workspace-v1`, con una única escritura para evitar guardados parciales. La primera carga recupera los pedidos del formato local anterior; los cambios posteriores utilizan el nuevo formato. Las otras pestañas del mismo navegador y origen se actualizan con eventos de almacenamiento. Los bloqueos del navegador coordinan las escrituras entre pestañas cuando están disponibles. El registro local sirve para pruebas; la protección de auditoría de cuentas reales está en PostgreSQL.

La migración `supabase/migrations/20261030135745_order_changes_and_audit.sql` agrega cancelaciones, revisiones, `production_audit` y las funciones transaccionales `edit_production` y `cancel_production`. Aplicala después de la migración de roles antes de desplegar la versión conectada. Solo el dueño de un pedido de panadería o un administrador puede modificarlo. Depósito no tiene permisos de escritura. Solo administradores pueden leer la auditoría; ningún perfil de la app puede alterarla ni llamar a los helpers internos. La autoría real sale de `auth.uid()` y de la cuenta de Auth, no del responsable editable del pedido. Las actualizaciones bloquean la fila y requieren la revisión que se abrió para editar: un borrador viejo se rechaza para no sobrescribir cambios posteriores. Una validación fallida revierte juntos pedido, productos y auditoría.

El registro comienza con las operaciones nuevas; no inventa eventos anteriores para pedidos históricos. En Supabase, las vistas de depósito y administración se vuelven a consultar al abrir la pestaña; depósito también dispone de «Actualizar». Esta migración está incluida y probada localmente, sin aplicarse al proyecto remoto. La preview con cuentas de prueba funciona sin aplicar migraciones.

`supabase/config.toml` configura desarrollo local con registro público desactivado y catálogo de ejemplo. Estos ajustes de Auth no cambian automáticamente los del proyecto remoto. Además de las pruebas con PostgreSQL embebido (PGlite), el 30/10/2026 se verificó en Bakery el guardado, cantidades fraccionarias, aislamiento entre usuarios, rechazo de escrituras directas y anónimas, y rollback ante cantidades inválidas. Los usuarios y registros de prueba se revirtieron al terminar. El catálogo real se cargó con cinco productos, medidos por envase o bolsa.

El advisor de seguridad informa que los usuarios autenticados pueden ejecutar `save_production` con `SECURITY DEFINER`. Es intencional: esta es la única vía de escritura, verifica `auth.uid()`, fija `search_path` vacío y no permite ejecución anónima. Se comprobaron permisos y aislamiento en la base remota. La entrega del enlace de acceso y sus redirecciones requieren una prueba desde el dominio desplegado.

## Vercel

Importá este repositorio con preset SvelteKit y Node.js 24. Configurá las dos variables de `.env.example` en los entornos de Vercel que vayas a usar. `vercel.json` ejecuta verificación de tipos y `npm run build:production`; el despliegue falla si faltan las variables o se proporciona una clave privada. `npm run build` sigue disponible para compilar la demo local.

Despliegue activo: **https://obrador-three.vercel.app**, proyecto `wulfiss-projects/obrador`, conectado a este repositorio. Se configuraron las dos variables públicas en Production, Preview y Development, y Node.js 24. El 30/10/2026 se verificaron HTTP 200 y la pantalla de acceso con Supabase a 390 y 1440 px, sin errores de JavaScript ni desbordamiento horizontal. Chromium recibió las respuestas HTTPS a través de Node con la CA del proxy del entorno y validación TLS activa.

Antes del primer uso, configurá en [Supabase Auth](https://supabase.com/dashboard/project/gyyocqskfyyqylvkicak/auth/url-configuration) Site URL como `https://obrador-three.vercel.app` y agregá esa misma URL a Redirect URLs. Las herramientas MCP disponibles no exponen estos ajustes. Probá luego el acceso por correo, guardado e historial desde el dominio final; la entrega del correo y el recorrido autenticado completo siguen pendientes. El endpoint público de Auth responde y el acceso por correo está habilitado. El registro público remoto estaba habilitado al verificarlo: para un equipo cerrado, desactivalo e invitá a sus integrantes.

## Alcance

Fecha editable (hoy por defecto en Argentina), responsable, catálogo buscable, múltiples productos, cantidades positivas por unidad, confirmación, historial editable, eliminación con confirmación, registro de cambios para administración y pantallas según perfil. Depósito consulta los pedidos vigentes; no incluye seguimiento de entregas ni stock.

## Validación

```sh
npm test
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` prueba la validación del formulario, los permisos de las pantallas, el historial local y las tres migraciones en PostgreSQL embebido. Comprueba guardado, edición, cancelación, capturas de auditoría, rechazo de revisiones antiguas, rollback sin cambios parciales, aislamiento de panadería, lectura compartida de depósito/administración y permisos de escritura/lectura de la auditoría. No necesita credenciales remotas.

`npm run test:e2e` inicia automáticamente la app con cuentas de prueba y prueba búsqueda, guardado, historial, persistencia de la cuenta, separación de pedidos y pantallas, y navegación por teclado a 390 y 1440 px. Comprueba edición y eliminación con confirmación, actualización de una pestaña abierta de depósito, persistencia de la auditoría de administración y rechazo de un borrador viejo. También comprueba que no se hagan peticiones a Supabase aunque haya claves configuradas. Puede usar Chromium del sistema con `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. Playwright es una dependencia de desarrollo. El flujo de GitHub Actions ejecuta estas verificaciones en cada PR y push a `main`.

## Depósito: códigos, registro y Excel

Depósito muestra código, producto, cantidad y unidad junto a los datos del pedido. «Registrado» marca la revisión actual; una edición de panadería lo deja pendiente de registrar nuevamente. La marca queda en el registro de administración y no se puede desmarcar, ni por depósito ni por administración. Si panadería edita el pedido, la nueva revisión queda pendiente de registrar. «Descargar Excel» genera un archivo .xlsx por pedido, con identificador, fecha, responsable, estado, revisión y líneas de productos; conserva códigos como texto y cantidades numéricas. La descarga no cambia la marca.

La preview usa códigos DEMO-001 a DEMO-006. Los pedidos locales anteriores recuperan esos códigos del catálogo de ejemplo. Los códigos reales se cargan en products.code; los faltantes aparecen como «Sin código», sin inventar códigos reales. Bakery mantiene su selección habitual de producto y cantidad.

La migración 20261030142129_warehouse_registration_and_product_codes.sql agrega códigos al catálogo y a las copias de los productos, registro por revisión y el RPC protegido set_production_registered. Solo depósito y administración pueden marcar pedidos. Está probada localmente; las migraciones remotas siguen pendientes.

La migración lock_registered_orders impide desmarcar pedidos también desde la API. La preview aplica la misma regla a sus datos locales.

## Administración del catálogo

En Administración, la barra lateral «Agregar productos» permite crear, editar y eliminar productos con código, nombre y unidad. Los códigos y nombres deben ser únicos. La eliminación requiere confirmación y retira el producto de nuevos pedidos; conserva sus datos en los pedidos existentes, la auditoría y las exportaciones. Las ediciones del catálogo tampoco reescriben esos detalles históricos. Una línea ya incluida en un pedido puede conservarse al editarlo aunque el producto haya sido retirado.

La preview guarda el catálogo en obrador-preview-catalog-v1 y actualiza las otras pestañas del mismo navegador. La migración 20261030150134_admin_product_catalog.sql agrega productos activos y revisiones, índices de unicidad y el RPC manage_product, accesible solo por administradores. Panadería y depósito no pueden modificar el catálogo por la API. Las migraciones remotas siguen pendientes.
