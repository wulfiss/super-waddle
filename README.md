# Picui

Aplicación de pedidos para panadería, depósito y administración, adaptable a celulares y PC. Los usuarios ingresan con correo y contraseña. El administrador crea cuentas, asigna roles y contraseñas, gestiona el catálogo y mantiene la lista de destinatarios de notificaciones.

## Desarrollo

Requiere Node.js 24 y npm.

```sh
npm ci
npm run dev
```

Copiá `.env.example` a `.env` y configurá la URL de Supabase y una clave pública/publishable. Nunca uses una clave de servidor en variables `PUBLIC_`.

Para pruebas locales sin datos remotos, `PUBLIC_PREVIEW_MODE=true` habilita cuentas de prueba exclusivamente en el servidor de desarrollo. El selector «Vista previa» no aparece en builds desplegados. `build:production` rechaza las cuentas de prueba incluso en Preview; todos los despliegues usan acceso real. Los datos locales anteriores conservan sus claves para evitar perder pedidos de demostración.

## Funcionalidades

- Panadería: pedidos regulares y extra, revisión antes de guardar, historial, edición y eliminación de pedidos pendientes.
- Depósito: pedidos recibidos, búsqueda por fecha/responsable/producto/código, detalle desplegable, descarga Excel y registro con acento verde.
- Administración: acceso a todos los espacios, catálogo, historial de cambios y **Usuarios**.
- Usuarios: alta con contraseña inicial, edición en popup, reemplazo opcional de contraseña, roles y eliminación conservando los pedidos históricos.
- Notificaciones: varios correos independientes de las cuentas de usuarios, con altas, edición, eliminación y control de duplicados. El envío automático todavía no está implementado.
- Móvil: el botón hamburguesa abre toda la barra lateral como un panel vertical. En escritorio la barra lateral permanece visible.

Las contraseñas solo se envían a Supabase Auth; no se incluyen en las listas, metadatos ni tablas de la aplicación. No se muestra la contraseña actual. En el popup de edición, dejar «Nueva contraseña» vacío conserva la anterior. Un administrador no puede modificar ni eliminar su propia cuenta desde Usuarios.

## Supabase

Proyecto activo: Bakery (`gyyocqskfyyqylvkicak`). Las ocho migraciones de `supabase/migrations/` están aplicadas y su historial remoto coincide con los archivos del repositorio. No las vuelvas a ejecutar manualmente en ese proyecto.

La función Edge `admin-users` está desplegada. Valida cada token con Supabase Auth y comprueba el rol actual en la base; solo administración puede listar o modificar usuarios y destinatarios. Usa las claves de servidor del entorno de Edge Functions y nunca las envía al navegador.

Los cambios de roles solo se permiten al backend y se serializan. La eliminación revoca el rol antes de borrar lógicamente la cuenta de Auth para conservar los pedidos históricos. Un trigger revoca también cualquier rol al borrar lógicamente una cuenta, para bloquear tokens anteriores.

Para otro proyecto, revisá las migraciones antes de aplicar cambios y asigná el primer administrador desde una sesión de confianza de la base. Después se gestionan las cuentas desde Usuarios. Para actualizar la función, desde la raíz del repositorio:

```sh
supabase functions deploy admin-users --project-ref gyyocqskfyyqylvkicak
```

La función usa dependencias relativas de `src/lib/`. El catálogo real se administra desde la app. `supabase/seed.sql` contiene productos de ejemplo y no se carga en la base de producción.

Los RPC de escritura usan `SECURITY DEFINER` de forma intencional, con identidad y rol comprobados, `search_path` vacío y acceso anónimo revocado; las escrituras directas están deshabilitadas. El [advisor correspondiente](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) informa este patrón. La [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) sigue desactivada en el proveedor de Auth.

## Producción

URL existente: **https://obrador-three.vercel.app**. El nombre visible es **Picui**; se conserva el dominio existente. Proyecto Vercel: `wulfiss-projects/obrador`, conectado a este repositorio; la rama `main` publica producción.

Vercel requiere `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `vercel.json` ejecuta verificación de tipos y `npm run build:production`. El acceso por contraseña usa las credenciales de Auth existentes; la app no reemplaza contraseñas al asignar roles. El acceso alternativo por enlace no crea cuentas automáticamente.

## Validación

```sh
npm test
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npx playwright test --config playwright.auth.config.ts
```

`npm test` comprueba validación, límites de permisos, operaciones de administración y las migraciones con PostgreSQL embebido (PGlite). Las pruebas de navegador recorren los pedidos, catálogo, usuarios y menú móvil a 390 y 1440 px; la configuración de Auth usa respuestas simuladas sin credenciales reales. Puede usarse Chromium del sistema con `CHROMIUM_PATH=/usr/bin/chromium`. GitHub Actions ejecuta estas comprobaciones en PR y en push a `main`.
