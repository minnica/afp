# Cuentas por pagar desde cargos BBVA — 31/10/2026

Implementación funcional local. Sin publicación, cambios de reglas ni escrituras financieras en producción. Por instrucción del propietario no se usó agent-browser, no se hicieron validaciones visuales ni se tomaron capturas. No hay componentes nuevos, migraciones, dependencias ni cambios de APK.

## Resultado

La captura BBVA de débito aceptada y automática busca una única cuenta por pagar simple activa con el mismo día previsto y el mismo saldo pendiente, a centavos. Respeta rutas y exclusiones por deuda, y usa la cuenta bancaria observada frente al valor genérico de efectivo. La suma de abonos anteriores reduce el saldo candidato. Un pago crea el gasto vinculado, su recibo y la liquidación dentro de la transacción financiera del propietario. Crear deudas también utiliza ese bloqueo.

Cuando el aviso imprime una fecha/hora bancaria válida se conserva como día de operación en México; la publicación permanece como evidencia independiente. La misma gramática de cargos BBVA recibe esa extracción adicional, sin sustituir eventos ni interpretaciones iniciales guardados. La publicación es el respaldo de avisos sin fecha bancaria. Fechas imposibles o futuras no se usan silenciosamente como si fueran válidas.

Dos operaciones con el mismo importe pueden distinguirse por horas bancarias diferentes. La comparación revisa todas las versiones de una notificación y protege relojes ausentes, relojes iguales, gastos manuales, importes/fechas editados y recibos de gastos borrados. Una actualización repetida no crea otro pago. Las posibles coincidencias siguen requiriendo decisión personal; no se presentan como referencias bancarias únicas.

Varias deudas con fecha/importe iguales o una coincidencia entre deuda y corte de tarjeta conservan revisión sin escoger el destino. Los pagos de tarjeta mantienen su tolerancia existente. Los préstamos con capital/intereses no se amortizan desde un cargo genérico. No se divide un cargo entre deudas ni se infiere una deuda de otro importe.

## Registros anteriores y API

La acción autenticada `PATCH /api/captures/movements` con `{id, action: "matchPayable"}` permite vincular un gasto genérico anterior intacto a una única deuda compatible. Reutiliza el gasto y su cuenta, conserva la evidencia y guarda historial. Puede corregir una fecha antigua de publicación a su fecha bancaria cuando el movimiento no está incluido en un saldo de referencia cerrado. No crea otra salida ni procesa históricos durante una consulta o despliegue.

La selección explícita de una deuda en revisión se admite en `registerDebitExpense.money.payableAccountId`; se comprueban propietario, cuenta, fecha e importe pendiente otra vez. No se añadió una interfaz de selección. Se permite conservar pagos de deudas simples con débito al editar Gastos; editar o borrar recalcula la deuda y la cuenta. Los préstamos y otros vínculos conservan sus restricciones.

## Verificación

- Suite completa: **1087 pruebas correctas, cero fallos y cero omisiones**, con PostgreSQL local desechable.
- Se añadieron **22 escenarios** de fecha bancaria, automatización, API y persistencia; incluye concurrentes, reintentos, abonos previos, rutas, propietarios, ambigüedades, avisos repetidos, correcciones, borrados y rollback.
- `typecheck`, `typecheck:tests`, `test:types`, `lint` y `build` correctos. Los resultados completos están en los logs adjuntos; los avisos de herramientas que aparezcan en ellos permanecen visibles.
- La comprobación final de API y persistencia ejecutó por separado sus quince escenarios y pasó todos.
- Esquema y migraciones sin modificaciones. La BD de pruebas se reconstruyó con las 44 migraciones existentes.
- La revisión de datos reales se ejecutó con `SET TRANSACTION READ ONLY`. El plan privado identifica cinco coincidencias únicas, una ambigua y dos sin coincidencia entre ocho gastos registrados; no se aplicó ninguna. El informe detallado queda fuera de Git en `estados_cuenta/_soporte/respaldos-y-revisiones/capture-payables-2026-10-31/`.

La evidencia acredita lógica, API, persistencia y compilación. No acredita publicación ni comprobación visual.
