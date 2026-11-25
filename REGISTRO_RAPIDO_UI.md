# Registro rápido con Flowbite Svelte

Rama: `feature/registro-rapido-ui`, creada desde `feature/control-formulaciones` en `77b4135`. Esta entrega se prueba en una vista previa independiente; no cambia producción ni la rama de formulaciones.

El acceso, panadería, depósito y administración comparten controles de Flowbite Svelte 1.33.1 y la paleta verde de Picui. El encabezado y el contenido usan los mismos márgenes. En el catálogo móvil, cada fila agrupa el producto, la unidad y sus acciones. Tailwind CSS 4 genera los estilos de los componentes enumerados en `src/lib/ui/flowbite.css` y Svelte gestiona la interacción.

## Entrada más rápida

- Elegí una marca habitual con un toque. **Otra marca** permite escribir una nueva para esa elaboración. **Combinar marcas** registra cantidades, lotes y vencimientos por marca, incluso en ingredientes sin alternativas predefinidas.
- Ingresá el peso real y pulsá **Siguiente**. El peso sugerido se muestra como referencia.
- **Enter** después de escribir el peso avanza. La siguiente tarjeta enfoca la alternativa si falta elegirla, o el campo de peso. Tab permite completar lote y vencimiento, obligatorios en cada fila.
- Si falta un dato al avanzar o guardar, un aviso indica cuál completar. **Ir al campo** abre la tarjeta correspondiente y enfoca el dato pendiente. Los valores ingresados se conservan.
- Los nombres del resumen permiten volver directamente al peso correspondiente para corregirlo.
- Al terminar, el foco queda en **Guardar elaboración**. Se abre un diálogo para revisar los pesos. **Volver a editar** conserva el formulario y **Sí, guardar elaboración** confirma y guarda.

Se mantienen cantidades provisorias, trazabilidad, reintentos seguros y cierre con diferencias. Los registros cerrados no vuelven a aparecer en la página de entrada. La validación de lote y vencimiento y la asignación del responsable en la base requieren la migración `20261125113227_required_formulation_traceability.sql`. El registro por marca requiere la migración `20261122195839_ingredient_brands.sql`.

## Prueba

1. Entrar a Elaboraciones con una receta aprobada; completar fecha y cantidad. La cuenta de la sesión figura como responsable.
2. Elegir las alternativas e ingresar la cantidad real utilizada de cada marca.
3. Comprobar el avance y el foco; cargar lote y vencimiento en cada ingrediente y volver a él desde el diálogo de confirmación.
4. Cambiar un peso en el resumen, comprobar la diferencia, guardar una vez y verificar el mensaje de confirmación.
5. Probar con teclado y en móvil. Un peso vacío o una alternativa faltante debe impedir avanzar; un envío fallido conserva el formulario y permite reintentar.

Las pruebas del navegador comprueban el ingreso manual de los pesos, la navegación por teclado, la edición desde el resumen, la conservación de los datos ingresados y el guardado final.
