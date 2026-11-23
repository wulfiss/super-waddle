# Control de formulaciones — entrega por etapas

Rama: `feature/control-formulaciones`. Pedidos y elaboraciones son procesos separados.

## Parte 1: Recetas (lista para prueba)

Ingresar con una cuenta de administración y abrir **Recetas** en el menú lateral.

- Listar y buscar recetas; crear fórmulas con código, nombre, familia y vínculo opcional al catálogo.
- Las cantidades de referencia son editables y admiten coma o punto decimal (hasta tres decimales).
- Cada ingrediente admite marcas habituales, cantidad/unidad, marca de opcional y tolerancias porcentuales opcionales. No hay tolerancia global implícita.
- Pan mignón se carga como **borrador provisorio**. Harina 000 Cañuelas y Lealtad comparten un único objetivo de 25 kg al combinar marcas. El extracto de malta es opcional.
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
- Cantidad admite entre 0,001 y 1000 unidades, con hasta tres decimales.
- Elegir la marca habitual, escribir otra o combinar varias para una misma materia prima. Los ingredientes opcionales comienzan excluidos y pueden incluirse expresamente.
- Cantidades sugeridas de solo lectura, calculadas por ingrediente. Se conservan hasta seis decimales en el resultado de escalar las cantidades base por la cantidad de elaboración.
- El backend vuelve a calcular todo a partir de la versión vigente y conserva la fórmula completa, alternativas elegidas, cantidades, unidades y tolerancias de ese momento.
- La elaboración queda **En curso** y permite continuar con el registro de pesajes de la parte 3.
- Panadería consulta sus propias elaboraciones; Administración consulta todas; Depósito no tiene acceso. Los registros se conservan aunque la receta se archive o se apruebe una nueva versión; los cerrados se consultan en Panadería → Historial → Elaboraciones.
- Los reintentos con el mismo identificador devuelven la elaboración existente. Un formulario con una receta sustituida o archivada no puede iniciar otra elaboración.
- Elaboraciones y pedidos se guardan por separado; iniciar una elaboración no crea ni modifica pedidos.

### Recorrido de prueba de parte 2

1. En Administración → Recetas, aprobar una versión de Pan mignón si todavía está en borrador. La advertencia de cantidades provisorias se mantiene.
2. En Panadería → Elaboraciones, elegir esa receta, una fecha de producción, responsable y una cantidad de **2**.
3. Elegir Harina 000 Lealtad y una alternativa del mejorador. Dejar malta sin incluir.
4. Revisar **50 kg** de una sola harina, **60 L** de agua y el resto de cantidades duplicadas; iniciar la elaboración.
5. Recargar y abrir sus cantidades: deben conservar fecha, responsable, versión, alternativas y cantidades.
6. Probar otra elaboración con una cantidad de **0,5** e incluir malta: debe sugerir **12,5 kg** de harina, **15 L** de agua y **125 g** de malta.
7. En Administración, comprobar ambas elaboraciones. Editar/aprobar otra versión de la receta y verificar que las elaboraciones anteriores mantienen los valores con los que se iniciaron.

Las tablas nuevas `formulation_batches` y `formulation_batch_events` usan RLS y no admiten escrituras directas desde el cliente. El RPC de inicio valida el rol actual y serializa el inicio con aprobación/archivo de recetas. Las pruebas cubren acceso propio y administrativo, roles revocados, errores de datos, reintentos y conservación de instantáneas.

## Entrada rápida para Panadería (flujo principal)

Seleccionar el producto/receta abre inmediatamente la primera materia prima para ingresar el peso real junto al sugerido. Ingresar fecha, responsable, cantidad, alternativas y cantidades reales; cada marca necesita lote y vencimiento al combinar varias. **Guardar elaboración** abre la revisión. **Sí, guardar elaboración** confirma la incorporación y registra las cantidades en un solo envío.

`complete_formulation_batch` ejecuta el inicio, los pesos y las incorporaciones en una única transacción, reutilizando los RPC con sus permisos y auditoría. Un peso faltante o inválido revierte el envío completo. Los reintentos con el mismo ID no duplican elaboraciones ni eventos. Las diferencias se conservan para Calidad.

El formulario agrupa producto y cantidad en el primer paso y peso real, lote y vencimiento en el segundo. La revisión final se abre en un diálogo. Se abre una materia prima por vez, con lote y vencimiento opcionales para una sola marca. **Usar sugerido** completa el peso únicamente al pulsarlo; **Siguiente** abre la próxima materia prima incluida sin guardar todavía. Una barra cuenta los pesos ingresados. El resumen compara real / sugerido y muestra las diferencias porcentuales antes de guardar. Cambiar de tarjeta conserva todos los datos ingresados. Solo la opción de borrador permanece en **Más opciones**.

**Continuar más tarde** es una opción contraída, no un paso obligatorio: permite guardar un inicio para pesar luego. Los formularios individuales se mantienen para esos borradores y para correcciones administrativas; no son necesarios en el flujo normal.

Prueba rápida: elegir Pan mignón, completar cinco pesos (o seis si se incluye malta) y guardar una sola vez. Debe confirmarse el guardado y conservarse una elaboración cerrada con todos los pesos y su historial en los datos, sin añadir una lista de registros a la página de entrada. No se requiere hacer clic en registrar/confirmar por cada ingrediente.

## Parte 3: Pesaje y finalización (lista para prueba)

El registro de elaboración sigue la referencia visual: resumen de receta y fórmula base, cantidad fijada al iniciar, esperado por ingrediente y entrada grande de peso real con unidad de solo lectura. Se conservan las cantidades provisorias existentes; la tolerancia ilustrativa del 2 % de la imagen no se convierte en una regla de producción.

- Peso real positivo, hasta seis decimales, con coma o punto. Se muestran diferencia absoluta y porcentual al ingresar el valor.
- Sin tolerancias aprobadas, se muestra la diferencia sin clasificar el producto como conforme o no conforme. Si la receta tiene límites, se muestra si el peso está dentro o fuera de esos límites específicos.
- **Registrar peso** guarda la cantidad real y sus datos. El formulario no se marca como guardado hasta recibir una confirmación válida; ante respuesta perdida, el reintento usa el mismo ID de operación.
- Lote y vencimiento son obligatorios al combinar marcas. Un vencimiento anterior a la fecha de producción genera una advertencia, sin impedir registrar el dato.
- **Confirmar incorporación** es una acción explícita sobre el peso ya persistido. Cambios sin guardar deben registrarse antes de confirmar.
- Panadería puede corregir sus pesos antes de incorporar. Después de incorporar, Administración dispone de **Corregir registro**, incluso si la elaboración ya está cerrada. La incorporación y el cierre se conservan; cada corrección guarda antes/después, usuario y fecha, con observación opcional.
- Cada ingrediente tiene un historial de registros, incorporaciones y correcciones, incluidos cambios de lote y vencimiento. El sistema diferencia una corrección previa a incorporar de un registro que tenía diferencias al confirmar la incorporación.
- Todos los ingredientes incluidos al iniciar, también los opcionales seleccionados, deben tener un peso válido e incorporación confirmada. La última confirmación cierra la elaboración automáticamente, aunque existan diferencias o pesos fuera de tolerancia. No se requiere motivo ni autorización previa por el desvío.
- El evento de cierre conserva una instantánea de todos los pesos. Una corrección administrativa posterior no modifica esa evidencia ni la fecha del cierre original.
- Los cambios concurrentes no sobrescriben borradores sin avisar: se conserva el valor local, se detecta la revisión desactualizada y se permite recargar expresamente el registro guardado.

### Recorrido de prueba de parte 3

1. Abrir las cantidades de una elaboración en curso. Revisar receta, responsable, fecha, cantidad y esperados.
2. Ingresar un peso diferente del esperado; comprobar diferencia absoluta/porcentual. Dejar lote y vencimiento vacíos y registrar el peso.
3. Cambiar el peso antes de incorporar: la confirmación debe quedar deshabilitada hasta guardar los cambios. Revisar ambos valores en el historial.
4. Confirmar la incorporación de cada ingrediente incluido. La última confirmación debe cerrar automáticamente, conservando las diferencias para Calidad.
5. Confirmar el mensaje de guardado al cerrar. Recargar: los registros cerrados no aparecen en la página de entrada. Los pesos, el cierre y la auditoría siguen guardados; Panadería no puede modificar incorporaciones confirmadas.
6. La consulta y corrección de registros cerrados desde Administración queda pendiente de la vista de historial separada. Las pruebas de datos siguen verificando antes/después, actor y fecha, y que la incorporación, el evento original de cierre y su fecha se mantienen.
7. Opcional: ingresar lote/vencimiento en otra elaboración y verificar su persistencia e historial. Un vencimiento anterior a la fecha de producción se advierte, pero no se bloquea.

`formulation_weighings` usa RLS explícita para Administración o el propietario de la elaboración; no permite escrituras directas del cliente. `record_formulation_weight` verifica identidad y rol actual, bloquea la elaboración durante la operación, valida revisiones, registra eventos y retorna una única instantánea consistente con pesos e historial.

## Historial separado (pendiente)

La página de entrada no muestra **Todas las elaboraciones**, **Mis elaboraciones** ni registros cerrados. Los datos guardados, sus cantidades reales/sugeridas, metadatos y auditoría se conservan. Solo las elaboraciones en curso pueden retomarse desde una sección contraída, que se abre al iniciar un borrador y desaparece al cerrarse el último.

En Panadería → Historial, **Pedidos** permite buscar por número o responsable. En **Elaboraciones** se busca por receta o responsable y se consultan la fecha, la versión de la receta, la cantidad elaborada y los pesos sugeridos y reales de cada ingrediente incorporado. La cantidad elaborada corresponde al factor de la receta. La corrección administrativa de registros cerrados desde el historial queda pendiente.

## Parte 4: Calidad

Comparación completa de cantidades sugeridas y reales, diferencias absolutas y porcentuales, historial, filtros y exportación. Mientras no se definan tolerancias aprobadas, mostrar diferencias sin clasificarlas como aceptables o inaceptables. El flujo de cierre acordado con el usuario prevalece sobre la exigencia de revisión previa del documento inicial.
