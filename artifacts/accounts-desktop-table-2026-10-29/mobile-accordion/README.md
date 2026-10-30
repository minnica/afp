# Cuentas · acordeones móviles

Cambio local del 29 de octubre de 2026 con UI/UX Pro Max y shadcn. No se modifica producción.

## Comportamiento

- Las cuentas móviles usan Accordion local, single y collapsible. Comienzan cerradas y se abre una a la vez.
- Cerrado: nombre, saldo actual y rendimientos diario, semanal y mensual.
- Abierto: referencia, tipo de cuenta, saldo de referencia, estado A la vista, acciones de edición/conciliación y hasta cinco conciliaciones.
- El resumen permanece visible al abrir y los totales siguen al pie. Escritorio conserva tabla e historial desplegable.
- `AccountYieldSummary` comparte valores y etiquetas entre vistas y admite spans para el encabezado del acordeón. Los disparadores contienen solo marcado permitido dentro del botón y su nombre accesible incluye las cifras.

Se reutilizan los handlers existentes, el cálculo de rendimientos y el helper de totales. No cambia API, persistencia ni reglas financieras. La búsqueda UX específica no dio un resultado útil; se aplicó la guía general de detalle progresivo y la recomendación verificada del stack shadcn para Accordion y su tipo single/collapsible.

## Verificación en navegador

Chrome con agent-browser, fixture Next, Auth ficticia y PostgreSQL local desechable. Cuatro cuentas ficticias, un nombre largo y seis conciliaciones; sin datos personales.

| Captura | Resultado |
| --- | --- |
| [390 px cerrado](mobile-390-closed.png) | Cuatro cuentas cerradas, resumen completo y totales |
| [390 px abierto](mobile-390-open.png) | Una cuenta abierta, acciones y cinco conciliaciones |
| [320 px cerrado](mobile-320-closed.png) | Nombres y cifras legibles, sin desbordamiento |
| [320 px abierto](mobile-320-open.png) | Textos largos ajustados y controles de 44 px |
| [1280 px](desktop-1280.png) | Tabla de cuatro cuentas y totales; acordeones ocultos |

Enter abre y cierra; ArrowDown permite pasar al siguiente encabezado. Abrir otra cuenta cierra la anterior. Las acciones aparecen únicamente en el detalle. Editar abre el formulario correcto y Cancelar devuelve el foco a su botón con la cuenta abierta.

[Validación](browser-validation.json): dieciséis importes del resumen y cuatro totales coinciden con HTTP 200 de `/api/money`. Los disparadores no contienen div, dl, p, a, button ni input anidados. El árbol de accesibilidad expone nombre, saldo y las tres etiquetas con sus cifras.

[Conciliación real del fixture](reconciliation.json): desde móvil se cambia Efectivo ficticio de $5,000 a $5,100; el total pasa a $47,220.10, la cuenta permanece abierta y el foco vuelve a Conciliar saldo. Registro de errores JavaScript vacío. Las capturas preceden a esta operación y pueden incluir el indicador de Next; no acreditan producción ni Android.

## Controles

`pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` y `pnpm build` correctos. Suite completa con PostgreSQL local: **1032 correctas, cero fallos y cero omisiones**. Lint general sin errores, con las dos advertencias previas de GastosContent y ui/data-table; lint del alcance sin avisos. Detector Impeccable `[]` y `git diff --check` correcto. Tras ajustar el nombre accesible del disparador se repitieron typecheck, lint del alcance y build. Logs en esta carpeta.

Pendiente de publicación.
