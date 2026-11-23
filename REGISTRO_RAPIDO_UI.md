# Registro rápido con Flowbite Svelte

Rama: `feature/registro-rapido-ui`, creada desde `feature/control-formulaciones` en `77b4135`. Esta entrega se prueba en una vista previa independiente; no cambia producción ni la rama de formulaciones.

El acceso, panadería, depósito y administración comparten controles de Flowbite Svelte 1.33.1 y la paleta verde de Picui. El encabezado y el contenido usan los mismos márgenes. En el catálogo móvil, cada fila agrupa el producto, la unidad y sus acciones. Tailwind CSS 4 genera los estilos de los componentes enumerados en `src/lib/ui/flowbite.css` y Svelte gestiona la interacción.

## Entrada más rápida

- Elegí una marca habitual con un toque. **Otra marca** permite escribir una nueva para esa elaboración. **Combinar marcas** registra cantidades, lotes y vencimientos por marca, incluso en ingredientes sin alternativas predefinidas.
- **Usar sugerido y seguir** acepta expresamente el peso de un ingrediente y avanza en un solo toque, en lugar de aceptar y avanzar por separado. No completa otros ingredientes ni guarda automáticamente.
- **Enter** después de escribir el peso avanza. La siguiente tarjeta enfoca la alternativa si falta elegirla, o el campo de peso. Tab permite completar lote y vencimiento, opcionales para una marca y obligatorios para cada fila al combinar marcas.
- Si falta un dato al avanzar o guardar, un aviso indica cuál completar. **Ir al campo** abre la tarjeta correspondiente y enfoca el dato pendiente. Los valores ingresados se conservan.
- Los nombres del resumen permiten volver directamente al peso correspondiente para corregirlo.
- Al terminar, el foco queda en **Guardar elaboración**. Se abre un diálogo para revisar los pesos. **Volver a editar** conserva el formulario y **Sí, guardar elaboración** confirma y guarda.

Se mantienen cantidades provisorias, trazabilidad, reintentos seguros y cierre con diferencias. Los registros cerrados no vuelven a aparecer en la página de entrada. El registro por marca requiere la migración `20261122195839_ingredient_brands.sql`.

## Prueba

1. Entrar a Elaboraciones con una receta aprobada; completar fecha, responsable y Cantidad.
2. Elegir las alternativas e ingresar los pesos, o aceptar cada sugerencia expresamente.
3. Comprobar el avance y el foco; cargar lote/vencimiento en un ingrediente y volver a él desde el diálogo de confirmación.
4. Cambiar un peso en el resumen, comprobar la diferencia, guardar una vez y verificar el mensaje de confirmación.
5. Probar con teclado y en móvil. Un peso vacío o una alternativa faltante debe impedir avanzar; un envío fallido conserva el formulario y permite reintentar.

Las pruebas del navegador comprueban el ahorro de una acción por peso sugerido, la navegación por teclado, edición desde el resumen, conservación de metadatos y un único guardado final. El ahorro de tiempo real deberá comprobarse con el personal; esta entrega no afirma un tiempo de registro medido.
