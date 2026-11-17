# Control de formulaciones — entrega por etapas

Rama: `feature/control-formulaciones`. Pedidos y elaboraciones son procesos separados.

## Parte 1: Recetas (lista para prueba)

Ingresar con una cuenta de administración y abrir **Recetas** en el menú lateral.

- Listar y buscar recetas; crear fórmulas con código, nombre, familia y vínculo opcional al catálogo.
- Una unidad equivale a una amasada. Las cantidades de referencia son editables y admiten coma o punto decimal (hasta tres decimales).
- Cada ingrediente admite alternativas excluyentes, cantidad/unidad, marca de opcional y tolerancias porcentuales opcionales. No hay tolerancia global implícita.
- Pan mignón se carga como **borrador provisorio**. Harina 000 Cañuelas y Lealtad son alternativas de 25 kg, nunca dos líneas que se suman. El extracto de malta es opcional.
- Guardar una edición crea otra versión en borrador. La versión vigente se mantiene hasta la aprobación expresa de administración.
- Eliminar archiva la receta; conserva versiones y auditoría. Usar **Incluir archivadas** para consultarla.
- El backend verifica el rol actual, impide escrituras directas, conserva instantáneas y deduplica reintentos por identificador de operación.

### Recorrido de prueba

1. Revisar Pan mignón y su advertencia de cantidades provisorias.
2. Crear una receta de prueba y agregar dos ingredientes; cambiar su orden.
3. Aprobar la primera versión de la receta de prueba.
4. Editar una cantidad y guardar: debe aparecer v2 en borrador mientras v1 sigue vigente.
5. Abrir el historial y comprobar que v1 conserva sus cantidades.
6. Aprobar v2 y eliminar la receta de prueba. Buscarla con **Incluir archivadas**.
7. Recargar: las recetas y versiones deben conservarse. Panadería y Depósito no deben disponer del menú de administración de recetas.

La vista previa usa las cuentas existentes y tablas nuevas `formulation_*` en el proyecto Supabase actual. Los cambios hechos en esta vista previa se guardan realmente en esas tablas, pero no alteran pedidos, usuarios ni el catálogo de productos. La aplicación publicada en producción no incluye este módulo hasta que se decida su publicación.

Las migraciones de esta entrega ya aplicadas se conservan en `supabase/migrations/` con las versiones remotas. El RPC sigue el patrón existente de `SECURITY DEFINER` con rol e identidad comprobados y `search_path` vacío. El [advisor de funciones ejecutables](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) señala este uso intencional; las pruebas comprueban la denegación efectiva para perfiles no autorizados.

## Parte 2: Inicio de elaboración (lista para prueba)

Abrir **Elaboraciones** en Panadería o Administración. Solo aparecen recetas activas con una versión aprobada. El borrador provisorio inicial no se aprueba automáticamente.

- Fecha de producción y responsable obligatorios; se registra además el usuario de la sesión y el momento de creación.
- Una unidad equivale a una amasada; admite fracciones con hasta tres decimales, entre 0,001 y 1000 amasadas.
- Elegir una sola alternativa para cada materia prima con opciones. Los ingredientes opcionales comienzan excluidos y pueden incluirse expresamente.
- Cantidades sugeridas de solo lectura, calculadas por ingrediente. Se conservan hasta seis decimales en el resultado de escalar cantidades base y amasadas.
- El backend vuelve a calcular todo a partir de la versión vigente y conserva la fórmula completa, alternativas elegidas, cantidades, unidades y tolerancias de ese momento.
- La elaboración queda **En curso**. Los pesajes, lote, vencimiento y cierre se incorporarán en la parte 3.
- Panadería consulta sus propias elaboraciones; Administración consulta todas; Depósito no tiene acceso. El historial permanece disponible aunque la receta se archive o se apruebe una nueva versión.
- Los reintentos con el mismo identificador devuelven la elaboración existente. Un formulario con una receta sustituida o archivada no puede iniciar otra elaboración.
- Elaboraciones y pedidos se guardan por separado; iniciar una elaboración no crea ni modifica pedidos.

### Recorrido de prueba de parte 2

1. En Administración → Recetas, aprobar una versión de Pan mignón si todavía está en borrador. La advertencia de cantidades provisorias se mantiene.
2. En Panadería → Elaboraciones, elegir esa receta, una fecha de producción, responsable y **2** amasadas.
3. Elegir Harina 000 Lealtad y una alternativa del mejorador. Dejar malta sin incluir.
4. Revisar **50 kg** de una sola harina, **60 L** de agua y el resto de cantidades duplicadas; iniciar la elaboración.
5. Recargar y abrir sus cantidades: deben conservar fecha, responsable, versión, alternativas y cantidades.
6. Probar otra elaboración con **0,5** amasadas e incluir malta: debe sugerir **12,5 kg** de harina, **15 L** de agua y **125 g** de malta.
7. En Administración, comprobar ambas elaboraciones. Editar/aprobar otra versión de la receta y verificar que las elaboraciones anteriores mantienen los valores con los que se iniciaron.

Las tablas nuevas `formulation_batches` y `formulation_batch_events` usan RLS y no admiten escrituras directas desde el cliente. El RPC de inicio valida el rol actual y serializa el inicio con aprobación/archivo de recetas. Las pruebas cubren acceso propio y administrativo, roles revocados, errores de datos, reintentos y conservación de instantáneas.

## Parte 3: Pesaje y finalización

Cantidades reales, confirmación de incorporación y correcciones auditables. Lote y fecha de vencimiento opcionales por materia prima. Sin motivo obligatorio ni autorización previa por discrepancias. Cierre automático al completar los ingredientes requeridos y confirmaciones, conservando las discrepancias para Calidad.

## Parte 4: Calidad

Comparación completa de cantidades sugeridas y reales, diferencias absolutas y porcentuales, historial, filtros y exportación. Mientras no se definan tolerancias aprobadas, mostrar diferencias sin clasificarlas como aceptables o inaceptables. El flujo de cierre acordado con el usuario prevalece sobre la exigencia de revisión previa del documento inicial.
