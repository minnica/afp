# Nota de diseño: Registro automático

La entrega amplía el mundo existente de AFP: Radix Mira neutral, interfaz oscura y componentes shadcn locales. No hay aprobación para sustituir identidad, preset, tipografía o tokens. Se documentó la superficie en `.impeccable/surfaces/automatic-recording.md`; la ausencia previa de `DESIGN.md` y `.impeccable/design.json` se conserva sin crear documentación global por inferencia.

## Resultado observado

`/registro-automatico` reúne Pendientes, Gastos, Pagos, Devoluciones, Otros avisos y Ajustes; mantiene tarjeta y vista en la URL. Gastos y Tarjetas aportan accesos contextuales. Configuración conserva un enlace de traslado. Ajustes separa tarjetas/reglas del teléfono y sus aplicaciones.

La revisión de gastos distingue registrar, guardar sin registrar y vincular un registro previo. Los pagos distinguen **Sumar este pago** de **Ya lo había registrado**, con confirmación explícita de si cambia el total. Las devoluciones muestran antes/después y siempre piden elegir y confirmar el gasto. Notificaciones originales y formatos técnicos se consultan por despliegue. La explicación conserva Wallet principal, respaldo bancario de 15 minutos y comprobación contra estado de cuenta.

## Comparación con el incumbente

| Evidencia fuente | Uso observado en la entrega |
| --- | --- |
| `components.json` | `radix-mira`, neutral, CSS variables y Hugeicons; sin preset nuevo. |
| `src/app/globals.css`, `.dark` | Consume background `oklch(0.145 0 0)`, foreground `oklch(0.985 0 0)`, popover/card `oklch(0.205 0 0)`, muted `oklch(0.269 0 0)`, muted-foreground `oklch(0.708 0 0)` y border `oklch(1 0 0 / 10%)`. Son referencias heredadas, no tokens añadidos por la superficie. |
| `src/app/layout.js` y escala de la superficie | Geist Sans; título de 24 px, subtítulos/importes de lista de 16 px, cuerpo de 14 px, contexto de 12 px y números tabulares. |
| Button, Tabs, Input, Badge, Dialog y patrones Item/Field/Collapsible locales | Primario neutral, bordes y radios existentes, estados semánticos y foco visible. Las capturas corresponden a esas piezas y no muestran una voz visual alternativa. |
| `AutomaticRecordingContent` y editores | Contenedor de 64 rem, 16 px laterales, espaciado principal de 24 px; controles principales de 44 px. Pestañas móviles en dos filas; editores desplazables de hasta `90dvh`. |

## Evidencia de adaptación y revisión

Inspección visual de `.impeccable/review/{desktop,mobile,user-320}.png` y de `artifacts/automatic-recording-ux/{payment-link-confirmation-mobile,refund-mobile,settings-mobile}.png`. Se observaron jerarquía, lectura de importes, ajuste de las pestañas, envoltura de contenido, separación de ajustes, vista previa de devolución y confirmación del vínculo de pago.

Se cotejó el código de la ruta, `AutomaticRecordingContent`, `CaptureReview`, `CaptureMovementEditor`, `CapturePaymentEditor`, `CaptureRefundEditor`, `CaptureNotificationDetails`, `CaptureConfigurationPanel`, `CaptureRolloutStatus`, `CaptureDevices`, `AutomaticRecordingLink`, navegación y el enlace de Configuración con `PRODUCT.md` y el contrato suministrado. No se abrió navegador ni se ejecutaron pruebas adicionales en esta pasada documental.

`browser-checks.json` aporta la verificación local a 320×740, 390×844 y 1280×900: sin desbordamiento horizontal en los casos registrados; diálogos contenidos; pestañas por teclado con actualización de URL; guardado y recuperación tras desconexión. Los análisis axe aportados tienen cero violaciones y una comprobación incompleta en algunos diálogos. `verification.json` registra suite completa de 706 pruebas, 37 dirigidas, build válido y lint sin errores con dos avisos previos. Se reportan como evidencia existente, sin ampliar su alcance.

`review.md` concluye **ship** y **material_fixes: ninguno**. No se canonizan ni reparan la falta previa de documentación global, el tratamiento de marca de la barra lateral u otras diferencias de superficies ajenas al encargo. Tampoco se convierten la cuadrícula de pestañas o el flujo de esta sección en reglas del sistema entero.
