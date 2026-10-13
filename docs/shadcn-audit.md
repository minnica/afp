# Revisión de componentes shadcn

Fecha: 12 de octubre de 2026.

## Alcance y referencias

Se revisaron los componentes de `src/components/`, las diez pantallas, el layout raíz, los estilos y la configuración del registro. Los componentes de dominio y los esqueletos de página se revisaron como composiciones de controles; el registro del service worker no tiene interfaz visual.

Se consultó el MCP de shadcn para obtener el registro, los componentes y los ejemplos de uso. El código completo se comprobó mediante la CLI instalada contra `https://ui.shadcn.com/r/styles/radix-mira/<componente>.json`, respetando el estilo de `components.json`. Los ejemplos de gráficas y tablas del MCP aportan el patrón de composición; los componentes base proceden de `radix-mira`.

La incorporación conserva JavaScript, los alias `@/components/ui` y `@/lib/utils`, y Hugeicons cuando corresponde. Los textos accesibles pueden localizarse al español. Las clases de layout y los colores que expresan estados del producto se aplican mediante las propiedades admitidas por los componentes.

## Componentes base

De los 23 componentes base existentes, 18 coincidían en estructura y comportamiento con la referencia consultada. Se corrigieron o actualizaron los otros cinco. Se incorporaron cuatro componentes del registro; al finalizar esta revisión había 27 componentes base y dos composiciones compartidas: `DatePicker` y `DataTable`. Los ajustes posteriores se documentan al final.

| Componente | Resultado |
| --- | --- |
| Button | Actualizado el estado hover de la variante secundaria según el registro. |
| Card | Actualizados los espacios compartidos mediante `--card-spacing`. |
| Chart | Sustituido el wrapper anterior por el código actual: `data-slot`, dimensiones iniciales, indicadores y manejo del payload. |
| Calendar | Comprobada la implementación completa y retiradas clases de marcador antiguas. El DatePicker de escritorio conserva encabezado sin selectores y navegación por flechas. |
| Spinner | Añadido `data-slot="spinner"` y localizado el nombre accesible. |
| Input, Label, Textarea, Select | Coinciden con los controles del registro. |
| Badge, Tabs, Table, Separator | Coinciden con el registro. |
| Dialog, AlertDialog, Sheet, Popover | Coinciden con el registro. |
| DropdownMenu, Tooltip, Skeleton, Sidebar, Alert | Coinciden con el registro. |
| Sonner | Conservada la implementación oficial y añadido el reexport local de `toast` para cumplir la convención del proyecto. |
| Collapsible, Progress, Empty, Item | Incorporados desde el registro oficial y convertidos a JSX. |

En `Progress`, `value` también se pasa a la raíz de Radix para que el valor visual y `aria-valuenow` coincidan. La referencia consultada utilizaba ese valor en el indicador y no lo pasaba a la raíz.

Por preferencia del usuario, `Input` oculta las flechas nativas cuando `type="number"`, mediante estilos para Firefox y navegadores basados en WebKit/Blink. Conserva el tipo numérico, sus restricciones y el manejo con teclado.

## Refactorización de las pantallas

| Superficie | Cambios |
| --- | --- |
| Gastos | “Más opciones” usa Collapsible con Button; avisos de error y conexión usan Alert; la sincronización usa Spinner. |
| Dashboard | Las tres gráficas usan ChartContainer, ChartTooltipContent y ChartLegendContent; las series usan claves estables y tokens; consumo mínimo usa Progress; el desglose usa Card, Item y Empty. |
| Ingresos, cuentas por cobrar | Sustituidas las confirmaciones nativas por AlertDialog; pagos vinculados usan Item. |
| Cuentas por pagar | Listas y pagos usan Item; el despliegue de pagos usa Collapsible. |
| Configuración | Confirmación con AlertDialog y catálogos con Item; cada instancia de formulario de catálogo tiene un identificador propio. |
| Tarjetas y ciclos | Confirmación de borrado y de deshacer pago con AlertDialog; tarjetas con Item; carga del desglose con Skeleton y errores con Alert. |
| Login | Acciones de cambio de modo con Button; mensajes con Alert; espera con Spinner. |
| Compras a meses y suscripciones | Revisados los controles existentes, los avisos y las confirmaciones. |
| DataTable compartido | Ordenamiento con Button accesible por teclado y `aria-sort`; nombres accesibles en filtros y paginación; estado sin resultados con Empty. |

Se asociaron 80 etiquetas adicionales a sus campos, se nombraron 15 botones de icono y siete filtros que carecían de nombre, y se añadieron descripciones a 12 diálogos. `useDialogFocus` devuelve el foco al botón que abre un diálogo controlado desde una tabla o lista mediante `onCloseAutoFocus`.

La hoja global respeta la preferencia de movimiento reducido. Las barras de las gráficas se renderizan sin animación de entrada.

## Verificación

- Revisión de código: no quedan `window.confirm`, controles de fecha independientes del DatePicker compartido, botones HTML propios de las pantallas ni barras de progreso manuales. Los elementos HTML dentro de los componentes oficiales forman parte de su implementación.
- Navegador: las diez pantallas renderizaron con datos de prueba a 390 px, sin errores de JavaScript ni desbordamiento horizontal del documento. Los campos de texto, numéricos y selectores visibles tenían nombres accesibles. Las tablas conservan su desplazamiento horizontal interno.
- Calendario: encabezado con mes y año como texto, flechas de navegación y selección; sin selectores de mes o año.
- Tablas: ordenamiento con Enter y actualización de `aria-sort`; el orden ascendente por monto situó $50 antes de $200.
- Diálogos: cancelar y Escape devolvieron el foco al botón de origen sin enviar una mutación. Deshacer un pago generó una única solicitud simulada PATCH con `action: "UNMARK_AS_PAID"` e identificador del ciclo correcto.
- Paneles: el historial de pagos cambió `aria-expanded` y mostró sus registros mediante Collapsible.
- Gráficas: tres contenedores oficiales; tooltip accesible por teclado con los importes correctos; Progress expuso el mismo valor porcentual del indicador mediante `aria-valuenow`.
- Revisión visual: calendario en móvil y dashboard en escritorio.
- Lint y compilación de producción comprobados. ESLint conserva la advertencia `react-hooks/incompatible-library` de TanStack Table 8; no se desactivó la regla.

La comprobación de navegador usó una ruta temporal con los componentes reales y respuestas de API simuladas. Esa ruta se retiró del proyecto. Esta revisión verifica la interfaz y la forma de las solicitudes; no valida persistencia con credenciales reales ni constituye una certificación completa de accesibilidad.

## Ajuste posterior: selector nativo en dispositivos táctiles

Por petición del usuario, el DatePicker compartido utiliza el `Input` de shadcn con `type="date"` cuando el dispositivo tiene un puntero principal táctil (`pointer: coarse`). El navegador o sistema proporciona el selector. En escritorio conserva la composición `Popover` + `Calendar`, con encabezado de texto y flechas. Este comportamiento se aplica a los 18 campos de fecha existentes, incluida la PWA instalada.

La detección usa `useSyncExternalStore` con una instantánea de servidor estable para respetar la hidratación. Ambos controles mantienen el contrato `YYYY-MM-DD`, las etiquetas y el estado deshabilitado; las fechas opcionales conservan la acción de limpiar.

- Escritorio: seleccionar el 15 de octubre actualizó el estado a `2026-10-15` y cerró el calendario. Limpiar la fecha opcional dejó el valor vacío y cerró el calendario. No hay selectores de mes o año.
- Emulación táctil real mediante CDP: a 412 px y 915 px de ancho se renderizaron inputs de fecha nativos en tema oscuro, sin calendario de shadcn ni desbordamiento horizontal. A 390 px con puntero de escritorio se conservó el calendario de shadcn.
- Campo nativo: eventos de entrada simulados actualizaron el estado y otro campo vinculado a `2026-10-20`. La acción Limpiar dejó el valor vacío; el input y su acción de limpieza respetaron `disabled`.
- Recarga en emulación táctil y comprobación de ambas versiones: sin errores de JavaScript o hidratación. La ruta temporal de comprobación se retiró.

Estas comprobaciones validan el control web y su estado en emulación; el diálogo del sistema Android o iOS requiere comprobarse en un teléfono físico.

## Ajuste posterior: búsqueda en catálogos largos

Se incorporaron `Command` e `InputGroup` desde el registro `radix-mira`, manteniendo JSX, Hugeicons y el helper local `cn`. `cmdk` es la única dependencia nueva. No se sobrescribieron los componentes existentes. `CommandDialog` mantiene su título y descripción dentro del contenido del diálogo y los textos predeterminados se localizaron al español. `CommandInput` admite clases para el grupo de entrada, utilizadas por la composición para darle una altura táctil de 48 px.

`src/components/ui/searchable-select.jsx` compone `Command` con `Sheet` en pantallas menores de 768 px o con puntero principal táctil, y con `Popover` en escritorio. Se aplica a 21 campos de categorías, personas, suscripciones y cuentas en Gastos, Compras a meses, Suscripciones, Cuentas por cobrar, Cuentas por pagar, Ingresos y Dashboard. Los selectores de opciones cortas y tarjetas conservan `Select`.

- La búsqueda opera sobre etiquetas, ignora acentos y mayúsculas y conserva los IDs originales. Ordena alfabéticamente; opciones como «Sin persona» y «Todas las categorías» quedan al principio.
- En móvil, el panel ocupa como máximo el 70 % de la altura. El encabezado y buscador permanecen visibles; la lista tiene desplazamiento independiente. Las filas, buscador y botón de cerrar tienen una altura de 48 px. La tipografía del buscador permanece en 16 px, también en orientación horizontal.
- El panel enfoca el título al abrir, para que el teclado aparezca cuando se toca el buscador. `visualViewport` ajusta la altura y posición cuando el teclado reduce o desplaza el área visible. Respeta el área segura inferior y el movimiento reducido.
- Elegir una opción cierra el panel y devuelve el foco al campo. Cancelar conserva el valor. Los catálogos vacíos, las búsquedas sin coincidencias y los campos deshabilitados tienen estados explícitos.

Comprobaciones de navegador realizadas con los componentes reales y respuestas de API simuladas:

- Android Pixel 7: interacción táctil activada mediante CDP y verificada con `pointer: coarse`, en vertical y horizontal. Buscador y filas de 48 px; fecha nativa conservada. A 320 px y 390 px, sin desbordamiento horizontal.
- Escritorio a 1280 px: popover con búsqueda enfocada, selección con flechas/Enter y retorno del foco. Los controles permanecen dentro de la pantalla en una ventana de 844 × 390 px.
- «ESTETICA», «prestamos» y «jose» encuentran etiquetas con acentos. El filtro de gastos envía el ID correcto; el comparativo del dashboard muestra la categoría elegida.
- Crear y editar un gasto conserva los IDs de categoría, persona, cuenta y suscripción en las solicitudes simuladas POST/PATCH. El selector dentro del diálogo de edición devuelve el foco al campo sin cerrar el diálogo padre.
- Catálogo de 103 opciones: desplazar la lista conserva la posición del encabezado. Verificados catálogo vacío, campo deshabilitado, cancelación y preferencia de movimiento reducido.
- Reducción simulada de `visualViewport` a 500 px con desplazamiento superior de 20 px: el panel permanece dentro del área visible. Esta comprobación valida la reacción al cambio de viewport; el teclado del sistema requiere comprobarse en un Android físico.
- Las siete pantallas revisadas no produjeron errores de JavaScript. La ruta temporal de pruebas se retiró.
- Lint y compilación de producción completados correctamente. ESLint conserva únicamente la advertencia existente `react-hooks/incompatible-library` de TanStack Table. La compilación no incluye la ruta temporal de pruebas.

Con este ajuste hay 29 componentes base y tres composiciones compartidas: `DatePicker`, `DataTable` y `SearchableSelect`.

## Corrección posterior: hidratación del menú lateral en Android

Una recarga completa de `/gastos` en Chrome del emulador mostró un error de hidratación en `SidebarInset`. La causa estaba en `useIsMobile`: el inicializador de estado devolvía escritorio en el servidor, pero móvil en el primer render del cliente. Esto cambiaba la estructura de `AppSidebar` antes de completar la hidratación.

`src/hooks/use-mobile.js` ahora usa `useSyncExternalStore` con una instantánea de servidor estable (`false`). El render inicial coincide con el servidor y después se aplica el tamaño real de pantalla. La consulta `(width < 768px)` coincide con el breakpoint de CSS, incluidos los anchos fraccionarios que puede producir el emulador.

- Recarga completa en el emulador a 412 px: formulario de Gastos cargado, sin skeleton, error de hidratación ni indicador de issues. Esta comprobación usó la sesión y datos de la app, sin respuestas simuladas.
- Menú móvil: apertura y cierre comprobados. Cambios de viewport a 767, 768 y 1280 px: modo móvil o escritorio correcto. Al finalizar se restauró el tamaño original del emulador.
- Selector de categoría: apertura y cierre del panel inferior sin modificar el valor.
- ESLint del hook y `git diff --check` completados correctamente.

## Ajuste posterior: selección directa y paneles compactos

Se incorporó `RadioGroup` desde el registro oficial `radix-mira`, adaptando únicamente JSX y el helper local `cn`, sin añadir dependencias. `PaymentMethodSelector` lo compone para mostrar Efectivo y Tarjeta como dos opciones visibles en los cuatro formularios de captura y edición de Gastos y Suscripciones. La presentación actual usa una fila sin fondo envolvente ni expansión al ancho del formulario: texto de 12 px como las etiquetas, círculos de 14 px y punto interior de 6 px. La fila mide 28 px en escritorio y las áreas de selección tienen al menos 48 px en pantallas menores de 768 px o con puntero principal táctil. Los valores siguen siendo `CASH` y `CARD`, y elegir Efectivo limpia la tarjeta asociada.

`ResponsiveSelect` reúne la selección adaptable. Se aplicó a los 19 selectores restantes de tarjetas, tipos de ingreso, meses, estados, frecuencias y tamaño de página. `SearchableSelect` ahora reutiliza esta composición, conservando sus 21 campos de catálogos.

- En móvil, las listas sin búsqueda abren un `Sheet` cuya altura se ajusta al contenido, con máximo del 70 % de la pantalla. Las filas y el cierre tienen 48 px como mínimo; el encabezado permanece visible y la lista se desplaza dentro del panel.
- En escritorio, las listas sin búsqueda conservan `Select`; las listas con búsqueda usan `Popover` y `Command`.
- `searchable="auto"` añade búsqueda con más de ocho opciones no fijadas. Se aplica a los catálogos, tarjetas y tipos de ingreso. El modo se conserva mientras el panel está abierto, aunque cambie el catálogo.
- Categorías, personas, suscripciones y cuentas conservan el orden alfabético y las opciones fijadas al principio. Meses, estados, frecuencias y tamaños de página conservan su orden recibido y no muestran buscador.
- Se mantienen la búsqueda sin acentos ni distinción de mayúsculas, el ajuste por `visualViewport`, los IDs y manejadores originales, los nombres accesibles, los estados vacíos y deshabilitados, la cancelación y el retorno del foco.
- Las listas compactas admiten flechas, Inicio/Fin y búsqueda por letras con teclado físico. Las flechas recorren opciones habilitadas; Enter o Espacio confirma la selección.

Comprobaciones con los componentes reales y respuestas de API simuladas:

- Gastos: captura y edición envían los IDs originales en POST/PATCH. Cambiar a Efectivo limpia la tarjeta; volver a Tarjeta requiere seleccionarla de nuevo. No se escribieron registros reales.
- Suscripciones: método de pago visible, frecuencias en orden lógico y meses en orden cronológico. La selección de Anual y Diciembre actualiza los valores correctos.
- Listas de tres opciones: panel compacto sin buscador, selección, cancelación, teclado, opciones deshabilitadas y estado vacío. Catálogo de 103 opciones: búsqueda y desplazamiento interno sin mover el encabezado.
- Escritorio a 1280 px: `Select` para listas cortas y popover para catálogos extensos; búsqueda por «Salud», selección con Enter y retorno del foco.
- Pantallas revisadas de Gastos, Suscripciones, Compras a meses, Cuentas por cobrar, Cuentas por pagar, Ingresos y Dashboard: sin errores de JavaScript ni desbordamiento horizontal. Revisados anchos de 320 y 412 px y ventana de 844 × 390 px.
- Chrome del emulador Android: recarga de `/gastos` con sesión real, formulario visible y sin skeleton ni errores de hidratación.
- Lint sin errores; conserva únicamente la advertencia existente de TanStack Table (`react-hooks/incompatible-library`). Compilación de producción y `git diff --check` completados correctamente, sin la ruta temporal de pruebas.

Con este ajuste hay 30 componentes base y cinco composiciones compartidas: `DatePicker`, `DataTable`, `SearchableSelect`, `ResponsiveSelect` y `PaymentMethodSelector`. La ruta temporal con fixtures se retiró del proyecto.

El primer ajuste visual de `PaymentMethodSelector` se comprobó en navegador web: grupo de 48 px de alto, fondo transparente, etiquetas de 14 px y radios de 16 px; sin desbordamiento a 390 px. Seleccionar mediante la etiqueta actualizó `CARD`; se comprobó el movimiento del foco con flechas y la activación con Espacio. Se verificó el estado deshabilitado y se retiró la vista temporal.

La revisión posterior corrigió la diferencia con las etiquetas de 12 px y los inputs de 28 px del formulario. La evaluación tipográfica y el detector mecánico se realizaron en paralelo y sin compartir resultados entre evaluadores. Las opciones usan `text-xs/relaxed` y peso normal en ambos estados; el radio comunica la selección. Se mantienen los tokens de texto y fondo, con contraste aproximado de 17:1, y se conserva la base de RadioGroup sin modificarla. La tipografía compacta corresponde a etiquetas de controles breves, siguiendo la escala existente de la aplicación.

Comprobación sobre `GastosContent` real con sesión y respuestas de API simuladas: a 1280 px, etiquetas y opciones de 12 px, fila e inputs de 28 px, radios de 14 px y punto de 6 px; a 390 px, ambas áreas táctiles de 48 px, sin desbordamiento horizontal. Seleccionar Tarjeta mostró su campo y volver a Efectivo lo ocultó. Revisión visual, detector tipográfico, ESLint del componente y `git diff --check` sin hallazgos. La vista temporal se retiró y el navegador de prueba se cerró; esta revisión no usó el emulador ni escribió datos reales.

## Ajuste posterior: escala del selector cerrado en móvil

La revisión en un teléfono real mostró que los selectores de tarjeta y categoría resaltaban sobre los inputs: `ResponsiveSelect` imponía 48 px de altura y texto de 16 px al campo cerrado cuando usaba `Sheet`. Esa regla se sustituyó por la escala existente de `Input`: altura predeterminada de 28 px, texto de 14 px en pantallas pequeñas y 12 px desde 768 px. El icono mide 14 px como el `Select` base. Se conservan las clases de tamaño que indique cada consumidor.

En la variante con panel inferior, un pseudoelemento transparente extiende el área de interacción 8 px por arriba y por abajo, hasta 44 px, sin agrandar el borde visible ni desplazar los otros campos. El panel conserva filas y buscador de 48 px, texto de 16 px, búsqueda, desplazamiento interno y retorno del foco.

Comprobación en navegador web sobre `GastosContent` con datos simulados: a 390 px, categoría y concepto midieron 28 px de alto y texto de 14 px; el área ampliada midió 44 px y una pulsación fuera del borde visible abrió el panel. A 1280 px, tarjeta, categoría y concepto midieron 28 px y texto de 12 px. Sin desbordamiento a 320, 390 y 1280 px. Elegir BANAMEX 1 y buscar Propina conservó los valores y devolvió el foco al selector. Filas y buscador mantuvieron 48 px y el buscador, 16 px de texto. Sin errores de JavaScript; ESLint del componente y `git diff --check` correctos. Se retiró la vista temporal y se cerró el navegador; no se usó el emulador ni se guardaron gastos reales.

## Captura rápida de gastos en móvil

`ExpenseCreateSurface` compone los componentes locales `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` y `DialogClose`. El MCP de shadcn confirmó la estructura y el ejemplo oficial; la CLI confirmó el registro `radix-mira`. No se modificó el componente base Dialog ni se añadieron dependencias. Conserva la presentación canónica centrada, el cierre estándar y la gestión de foco de Radix.

En pantallas menores de 768 px o con puntero principal táctil, la página muestra la lista y los filtros junto con una acción fija «Nuevo gasto» de 48 px. El diálogo recibe el foco en su contenedor y ordena primero Concepto, Monto y Categoría, sin enfocar automáticamente los campos. El cuerpo se desplaza dentro del espacio disponible; las acciones permanecen visibles y `visualViewport` ajusta la altura máxima y el centro cuando se reduce o desplaza el viewport. El borrador vive en GastosContent y se conserva al cancelar. Una captura exitosa cierra el diálogo y reutiliza fecha, método, tarjeta y categoría, como el formulario original. Escritorio conserva la tarjeta de captura integrada y su orden de campos.

Los errores de creación se muestran y anuncian dentro del formulario, separados de los errores de la lista; los campos inválidos reciben foco y una descripción asociada. Mientras se guarda se bloquean cierre y nuevos envíos. Un fallo al refrescar después de un POST exitoso informa que el gasto ya se guardó y evita encolarlo otra vez. La cola offline y el contrato del POST se conservan. Una regla de CSS limitada a la presencia de la acción fija coloca las notificaciones por encima de ella.

Verificación de la primera versión (apertura mediante botón) en web con componentes reales y respuestas simuladas:

- A 390 px: no hay formulario de creación visible antes de abrir el diálogo; título y descripción accesibles, foco en Concepto, IDs únicos y validación sin POST cuando faltan datos.
- Cerrar y reabrir conserva Concepto, Monto, Categoría y Notas. El selector anidado se cierra con Escape sin cerrar el diálogo de captura.
- Fallo simulado de POST: error visible y valores conservados. Reintento exitoso: lista actualizada, campos reiniciados y foco devuelto a la acción principal; se puede registrar otro gasto inmediatamente sin que la notificación cubra el botón.
- Guardado pendiente: Escape no cierra y un segundo submit no genera otro POST. Fallo de actualización posterior al POST: sin duplicado en la cola offline.
- Sin conexión: registro en la cola local y cierre sin POST; al recuperar conexión se sincroniza. Escritorio a 1280 px conserva la captura integrada y los IDs y valores del POST.
- A 320 px y en ventana horizontal de 640 × 390 px: diálogo dentro de la pantalla, cuerpo desplazable y acciones visibles. Cambio simulado de visualViewport a 320 px con offset superior de 20 px: el diálogo permanece dentro del espacio visible.
- Sin errores de JavaScript. La ruta temporal de comprobación se retiró y el navegador de pruebas se cerró. No se ejecutó el emulador ni se escribieron registros reales.
- Lint sin errores y compilación de producción completada, sin la ruta temporal. Se conserva únicamente la advertencia existente de TanStack Table (`react-hooks/incompatible-library`). `git diff --check` correcto.

### Apertura automática al entrar

Por petición del usuario, el estado inicial de `ExpenseCreateSurface` toma el modo compacto: al entrar en Gastos desde móvil o con puntero principal táctil, el diálogo se abre automáticamente después de cargar la sesión y los datos. La ruta `/` ya redirige a `/gastos`. La apertura se aplica al montar la captura; cancelar o guardar conserva el cierre hasta pulsar «Nuevo gasto» o volver a entrar. Escritorio mantiene el formulario integrado.

Comprobación inicial en navegador web sobre GastosContent real con datos simulados: a 390 px el diálogo aparece y enfoca Concepto sin pulsar el botón; cancelar y cambiar los filtros no lo reabre; la reapertura manual conserva el borrador. Una nueva carga a 1280 px mantiene la captura integrada. Sin errores de JavaScript; ESLint del componente y `git diff --check` correctos. La ruta temporal se retiró y el navegador se cerró, sin pruebas del emulador ni escrituras reales.

Después, por preferencia del usuario, `onOpenAutoFocus` se ajustó para enfocar `DialogContent` en lugar de Concepto. El diálogo sigue abierto al entrar, pero el usuario elige el campo inicial. Se mantiene la gestión accesible de foco de Radix y la navegación por teclado. ESLint del componente y `git diff --check` correctos.
