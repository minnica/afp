# Captura BBVA: nómina y retiro hacia efectivo — 14 de noviembre de 2026

Diagnóstico, publicación y corrección puntual de datos con autorización expresa del propietario. **Publicado el 14 de noviembre de 2026, hora de México; sin actualización de APK ni activación de reglas.** Las muestras, identidades, importes reales, respaldo y recibos de recuperación permanecen en `estados_cuenta/_soporte/respaldos-y-revisiones/capture-payroll-withdrawal-2026-11-14/`, excluido de Git. Los ejemplos y capturas de este informe son ficticios.

## Diagnóstico

- La nómina tenía evidencia recibida, regla automática válida, recibo idempotente e ingreso estimado vinculados a la cuenta bancaria. El aviso observado no contiene importe; el valor registrado procede de la estimación aceptada por quincena. Confirmar el importe real debe ajustar el ingreso existente y retirar su marca de estimación, conservando el recibo original.
- La otra notificación indica únicamente un cargo de cuenta. No menciona retiro, cajero ni efectivo. La regla genérica aceptada registró un gasto con débito. La regla específica de retiros estaba en observación y sin muestra verificada. No hay información en ese aviso que permita automatizar una clasificación como retiro.
- ADB confirmó la APK 0.9.0 / 13, permiso del lector y exención de batería. El reporte del dispositivo mostró captura activa, lector conectado, BBVA seleccionado y envíos sin pausa. El estado presente del teléfono no acredita su disponibilidad histórica; la evidencia persistida sí confirma que ambos avisos se recibieron y procesaron.

## Corrección publicada

La corrección de un gasto de débito a retiro aún no incorporaba el destino de efectivo agregado previamente en Mi dinero. Ahora el formulario exige elegir una cuenta propia de tipo Efectivo e indicar el efectivo recibido. Muestra la comisión y conserva el total bancario observado.

`correctDebitCapture` valida propietario, tipo de cuenta, referencia de saldo e importe. Sustituye el gasto por un retiro con `cashAccountId` y `cashAmount`, en la transacción y bloqueo financiero existentes. Conserva aviso, recibo, identificador del gasto original y evidencia de su sustitución. Los reintentos concurrentes abonan una sola vez; cambiar después el importe o destino se rechaza. La reversión de Mi dinero afecta ambas cuentas y protege las referencias posteriores. Las solicitudes antiguas sin destino mantienen su contrato.

El alcance es **corregir un gasto ya registrado**. El registro inicial de un aviso pendiente y las reglas de retiro no se amplían en esta tarea. Los cargos genéricos siguen sujetos a la política aceptada y no prueban por sí solos que se recibió efectivo. No se alteran reglas, estimaciones de nómina ni nombres de cuentas al consultar o publicar.

## Verificación

- [Pruebas de los flujos afectados](focused-tests.log): **44 correctas, sin omisiones**. Incluyen nómina e ingresos existentes, retiro con y sin comisión, aislamiento, precisión, referencias, concurrencia, reintentos numéricamente equivalentes, cambio posterior rechazado, posible duplicado, reversión y rollback de retiro/abono/borrado/recibo.
- [Suite completa](full-suite.log): **1,211 correctas, cero fallos y cero omisiones**, con PostgreSQL local desechable migrado.
- [Tipos de aplicación](typecheck.log), [tipos de pruebas](test-types.log), [contratos](contract-types.log), [lint](lint.log) y [build](build.log) correctos. Lint conserva tres advertencias en archivos ajenos al ajuste. El componente modificado no tiene advertencias. No se añade migración ni dependencia.
- [Auditoría de producción](audit-prod.log): cero avisos conocidos. La [auditoría del árbol completo](audit-all.log) informa nueve avisos en desarrollo, dos bajos y siete moderados; no se modificaron dependencias.
- [Detector de interfaz](design-detect.json): sin hallazgos. [Escritorio](correction-desktop.png), [móvil](correction-mobile.png) y [acciones móviles tras desplazar](correction-mobile-actions.png) revisados. Sin desbordamiento horizontal a 320 y 390 px; selector limitado a cuentas de efectivo y cantidad superior al total rechazada.

Historia verificada: **Gastos detectados → Ver detalle → Cambiar tipo de movimiento → Retiro de efectivo → elegir destino e importe → PATCH de Captura → retiro en PostgreSQL → detalle actualizado**. Auth ficticia; interfaz, API y persistencia locales reales. El navegador envió la corrección con HTTP 200 y volvió a consultar el detalle. No se observaron errores de consola.

El ejemplo ficticio parte de dos cuentas con $1,000 cada una y un gasto de $150.47 ya descontado. Corregirlo a retiro con $150 de efectivo deja el banco en $849.53 y el efectivo en $1,150: una sola salida, un solo abono y $0.47 de comisión. Se comprobó además la eliminación del gasto, un único retiro y la evidencia conservada mediante una consulta independiente en solo lectura. [Resultados](browser-verification.json) · [Detalle posterior](corrected-mobile.png).

## Publicación y recuperación autorizadas

Tras «Autorizo» se volvieron a comprobar importes, versiones, referencias y reglas. El historial de migraciones no tenía pendientes ni discrepancias de checksum. Se guardó un respaldo privado de `public` en formato custom y se comprobó su índice, con 46 entradas de datos de tablas y todas las tablas afectadas presentes. La recuperación se ensayó y revirtió; una lectura independiente confirmó que el ensayo no dejó cambios.

Se publicó [`dpl_Extz7mxbhbr6YA997XKifarbUzDw`](production-deployment.json), producción/READY, en el dominio habitual. Los [421 archivos publicados](production-source-verification.json) coinciden por SHA-1 con el manifiesto del código validado. La base es `7a1b0d948f96a65e3a3a5b3ab0324066af5a4107` más los cuatro archivos de aplicación modificados; no se creó un commit ni se hizo push. El [build remoto](production-build.log) terminó correctamente.

La operación posterior, dentro de una sola transacción con bloqueo financiero por propietario, confirmó el ingreso existente, sustituyó el gasto revisado por un retiro hacia efectivo y renombró la cuenta como «Efectivo en mano». No creó otro ingreso ni descontó otra vez la salida bancaria. Conservó las notificaciones y el identificador del gasto anterior, junto con su evidencia de sustitución. Se comprobaron los efectos exactos en ambas cuentas, la ausencia de duplicados al repetir la corrección y la conservación de todos los demás registros financieros vigilados, las reglas y las estimaciones de nómina. La lectura independiente posterior volvió a coincidir con el recibo de aplicación. Calendar quedó sincronizado.

La [verificación desde la sesión real del teléfono](production-phone-verification.json) obtuvo HTTP 200 al consultar ambos avisos y Mi dinero: ingreso confirmado, retiro enlazado al efectivo y saldos coincidentes. La pestaña Cuentas muestra el nombre nuevo, sin el anterior ni desbordamiento horizontal. El acceso público devuelve 200 y las API privadas sin sesión devuelven 401 con `private, no-store` y `Vary: Authorization`.

Los logs contienen un aviso de obsolescencia de `pg` por consultas en una conexión ocupada, clasificado por Vercel como stderr/error. El mismo aviso apareció en las comprobaciones operativas; no se observó un fallo funcional y las tres lecturas autenticadas terminaron con 200. No se cambiaron dependencias para atender ese aviso. [Resultado de producción](production-verification.json). No requiere otra APK; los avisos genéricos futuros siguen necesitando la identificación personal del retiro.
