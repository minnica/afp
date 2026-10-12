# Revisión de componentes shadcn

Fecha: 12 de octubre de 2026.

## Alcance y referencias

Se revisaron los componentes de `src/components/`, las diez pantallas, el layout raíz, los estilos y la configuración del registro. Los componentes de dominio y los esqueletos de página se revisaron como composiciones de controles; el registro del service worker no tiene interfaz visual.

Se consultó el MCP de shadcn para obtener el registro, los componentes y los ejemplos de uso. El código completo se comprobó mediante la CLI instalada contra `https://ui.shadcn.com/r/styles/radix-mira/<componente>.json`, respetando el estilo de `components.json`. Los ejemplos de gráficas y tablas del MCP aportan el patrón de composición; los componentes base proceden de `radix-mira`.

La incorporación conserva JavaScript, los alias `@/components/ui` y `@/lib/utils`, y Hugeicons cuando corresponde. Los textos accesibles pueden localizarse al español. Las clases de layout y los colores que expresan estados del producto se aplican mediante las propiedades admitidas por los componentes.

## Componentes base

De los 23 componentes base existentes, 18 coincidían en estructura y comportamiento con la referencia consultada. Se corrigieron o actualizaron los otros cinco. Se incorporaron cuatro componentes del registro; actualmente hay 27 componentes base y dos composiciones compartidas: `DatePicker` y `DataTable`.

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
