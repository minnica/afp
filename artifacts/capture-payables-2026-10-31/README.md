# Cuentas por pagar desde cargos BBVA — 31/10/2026

La implementación inicial se verificó localmente sin publicar ni modificar producción. El seguimiento de publicación y la vinculación histórica autorizada se documentan al final. Por instrucción del propietario no se usó agent-browser, no se hicieron validaciones visuales ni se tomaron capturas. No hay componentes nuevos, migraciones, dependencias ni cambios de APK.

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
- La revisión inicial de datos reales se ejecutó con `SET TRANSACTION READ ONLY`. El plan privado identificó cinco coincidencias únicas, una ambigua y dos sin coincidencia entre ocho gastos registrados; en esa revisión no se aplicó ninguna. El informe detallado queda fuera de Git en `estados_cuenta/_soporte/respaldos-y-revisiones/capture-payables-2026-10-31/`.

La verificación inicial acredita lógica, API, persistencia y compilación. No incluyó publicación ni comprobación visual.

## Publicación y vinculación histórica autorizada

En el seguimiento se comprobó que el commit `c30e5c9ddd13412108d0c5dd698247c48a307a7c` ya estaba publicado en Vercel, deployment `dpl_21u4QnCwmR1uceJ33WZZ5LoAcF4j`, production/READY. La vinculación histórica posterior no requirió otra publicación, migración ni activación de reglas.

El propietario aclaró el importe definitivo de una deuda estimada y confirmó que dos operaciones de igual importe pagaron dos deudas con conceptos iguales. Después autorizó expresamente el plan concreto. Se guardó un respaldo privado de las 46 tablas del esquema público y se verificó que el archivo pudiera leerse y contuviera las tablas financieras y de captura necesarias.

La operación se ensayó completa dentro de una transacción y se revirtió antes de su aplicación definitiva. La aplicación tomó el bloqueo financiero del propietario, comprobó versiones y evidencias contra el plan revisado y utilizó los servicios existentes. Para el par de deudas iguales se registró el cargo faltante con el destino confirmado; el gasto existente quedó con una única deuda pendiente compatible. La revisión del importe estimado conserva la explicación del propietario en notas y trazabilidad privada.

Resultado comprobado: ocho cuentas liquidadas, siete gastos reutilizados y un único gasto nuevo. Los dos cargos recibidos después de medianoche quedaron con el día bancario anterior. Las cuentas conservaron sus referencias; el cambio de saldo corresponde exclusivamente al cargo que faltaba. Se conservaron los eventos y sus interpretaciones originales, los recibos existentes y los demás registros financieros.

Una conexión nueva verificó el commit con `SET TRANSACTION READ ONLY`. Se repitieron las rutas de vinculación y registro del cargo recuperado bajo esa restricción: conservaron las identidades existentes sin crear gastos adicionales. La ejecución no modificó código funcional ni requirió repetir la suite de la implementación inicial. Ver [resultado técnico sin datos personales](historical-linking-verification.json).

Los respaldos, las versiones previas, el plan aplicado, las correspondencias, los importes, el script operativo y los resultados completos permanecen fuera de Git en el directorio privado indicado arriba. No se usó navegador ni se hicieron validaciones visuales o capturas.
