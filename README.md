# Obrador

MVP de registro de producción, en español argentino, adaptable a celulares y PC.

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

   La migración `supabase/migrations/20261030112836_initial_production.sql` crea catálogo, producciones, detalles, políticas RLS y una función transaccional para guardar una producción completa. Ya se aplicó al proyecto Bakery (`gyyocqskfyyqylvkicak`); el nombre local coincide con el historial remoto. No la vuelvas a ejecutar manualmente allí. También se puede ejecutar su contenido una sola vez desde el SQL Editor en otro proyecto nuevo, reconciliando luego el historial de migraciones.
3. Cargá el catálogo real desde Supabase. Para una prueba con productos de ejemplo, ejecutá opcionalmente `supabase/seed.sql`; no se carga con la migración de producción.
4. Copiá `.env.example` a `.env` e ingresá la URL del proyecto y su clave pública/publishable (o anon heredada). No uses una clave service-role ni una clave `sb_secret_`.
5. En Supabase Auth, configurá la URL final de la app como Site URL y agregá esa URL y `http://localhost:5173` a las redirecciones permitidas para el acceso por correo. Para un equipo cerrado, desactivá el registro público e invitá a sus integrantes. Configurá SMTP para enviar correos reales fuera de las restricciones del proveedor de prueba.
6. Ingresá con el enlace recibido por correo y cargá una producción. Recargá para verificar la persistencia y comprobá con otro usuario que no pueda leer las producciones del primero.

Cada usuario puede consultar solo sus propias producciones. El catálogo es compartido entre usuarios autenticados. La administración del catálogo se hace desde Supabase en esta etapa. Las escrituras directas de usuarios están deshabilitadas; el guardado pasa por la función transaccional.

`supabase/config.toml` configura desarrollo local con registro público desactivado y catálogo de ejemplo. Estos ajustes de Auth no cambian automáticamente los del proyecto remoto. Además de las pruebas con PostgreSQL embebido (PGlite), el 30/10/2026 se verificó en Bakery el guardado, cantidades fraccionarias, aislamiento entre usuarios, rechazo de escrituras directas y anónimas, y rollback ante cantidades inválidas. Los usuarios y registros de prueba se revirtieron al terminar. El catálogo real sigue pendiente de carga.

El advisor de seguridad informa que los usuarios autenticados pueden ejecutar `save_production` con `SECURITY DEFINER`. Es intencional: esta es la única vía de escritura, verifica `auth.uid()`, fija `search_path` vacío y no permite ejecución anónima. Se comprobaron permisos y aislamiento en la base remota. La entrega del enlace de acceso y sus redirecciones requieren una prueba desde el dominio desplegado.

## Vercel

Importá este repositorio con preset SvelteKit y Node.js 24. Configurá las dos variables de `.env.example` en los entornos de Vercel que vayas a usar. `vercel.json` ejecuta verificación de tipos y `npm run build:production`; el despliegue falla si faltan las variables o se proporciona una clave privada. `npm run build` sigue disponible para compilar la demo local.

Después del primer despliegue, agregá el dominio final a las redirecciones de Supabase Auth y probá el acceso por correo, guardado e historial desde esa URL. Usá una URL de preview estable y autorizada si necesitás probar Auth antes de producción. Aún no se realizó un despliegue desde este entorno.

## Alcance

Fecha editable (hoy por defecto en Argentina), responsable, catálogo buscable, múltiples productos, cantidades positivas por unidad, confirmación e historial. No incluye edición/eliminación, roles administrativos ni stock.

## Validación

```sh
npm test
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` prueba la validación del formulario y aplica la migración a PostgreSQL embebido para comprobar guardado, cantidades fraccionarias, aislamiento entre usuarios, permisos y rollback ante datos inválidos. No necesita credenciales remotas.

`npm run test:e2e` inicia automáticamente la app en modo demo y prueba búsqueda, guardado, historial y persistencia a 390 y 1440 px. Puede usar Chromium del sistema con `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. Playwright es una dependencia de desarrollo. El flujo de GitHub Actions ejecuta estas verificaciones en cada PR y push a `main`.
