# Transferencias Nu en días distintos — 14 de noviembre de 2026

Diagnóstico del desfase entre dos cuentas propias y corrección del filtro de duplicados. La evidencia bancaria, capturas, identidades, saldos, respaldo y recibos se conservan en `estados_cuenta/_soporte/respaldos-y-revisiones/account-transfer-gap-2026-11-14/`, excluido de Git.

## Causa y alcance

El aviso Nu se recibió y quedó como `MONEY_POSSIBLE_DUPLICATE`: existía otra transferencia del mismo importe y dirección dentro de la ventana de tres días. Las capturas de ambos bancos acreditan dos operaciones en días distintos. ADB confirmó APK 0.9.0, permiso del lector, batería exenta y ejecución en segundo plano permitida. El reporte del dispositivo mostró las dos fuentes seleccionadas, lector conectado y envíos activos. La sesión real del teléfono confirmó el estado pendiente y los saldos anteriores por API autenticada.

`captureMoney.ts` distingue transferencias Nu en días diferentes de México cuando sus avisos tienen claves diferentes, pertenecen al mismo dispositivo y distan más de quince minutos. Comprueba los textos originales con el analizador y que la transferencia previa conserva cuenta, destino, importe, fecha y concepto del recibo automático, sin corrección y con una sola evidencia. Misma fecha, proximidad a medianoche, clave reutilizada, registro manual, reversión o evidencia ambigua conservan revisión. Los reintentos exactos continúan usando el recibo existente. No se reprocesan históricos al publicar ni se activan reglas.

El saldo Nu agrupaba Cajita y saldo disponible. Según la aclaración del propietario, una transferencia recibida quedó fuera de la Cajita durante una noche: el cálculo sobre toda la cuenta sobreestimaba el rendimiento. Las capturas también documentan cinco compensaciones SPEI independientes de un centavo, incluidas dos del mismo día, sin notificaciones correspondientes en el período inspeccionado. No se confunden con intereses. Queda una diferencia menor de origen no identificado en la otra cuenta; una conciliación documenta esa diferencia sin crear un ingreso ficticio.

## Verificación local

- [44 pruebas dirigidas](focused-tests.log): transferencias Nu, asociación BBVA → Nu, concurrencia, reintentos y regresiones existentes.
- [Suite completa](tests.log): 1,222 correctas, cero fallos y cero omisiones con PostgreSQL local desechable.
- [Tipos de aplicación](typecheck.log), [tipos de pruebas](typecheck-tests.log), [contratos](test-types.log), [lint](lint.log) y [build](build.log) correctos. Lint conserva las tres advertencias previas en otros archivos.
- [Dependencias de producción](audit-prod.log): cero avisos. [Árbol completo](audit-all.log): nueve avisos de desarrollo, dos bajos y siete moderados. Sin cambios de dependencias.

Los casos nuevos usan importes ficticios. Dos avisos de días distintos de México, aunque compartan día UTC, producen dos transferencias, conservan el total conjunto y no crean gastos ni ingresos. Se verifican recepción fuera de orden, pausa, destino diferente, conservación del original y rollback ante fallo al guardar evidencia.

## Recuperación

El respaldo privado de `public` es legible y contiene 46 entradas de datos de tablas. El ensayo transaccional recuperó una transferencia, agregó las cinco compensaciones con identificadores deterministas y probó las conciliaciones con los saldos comunicados por el propietario. La repetición no duplicó operaciones. Se revirtió el ensayo y se comprobó por una lectura independiente que no dejó cambios.

Las conciliaciones conservan la referencia anterior, documentan las diferencias residuales y mantienen las reglas de rendimiento existentes. No se inventa un abono de rendimiento bancario ni una notificación ausente. La configuración actual sigue considerando que todo el saldo de NU CUENTA genera rendimiento: dejar dinero fuera de Cajita en el futuro puede producir otra diferencia; separar disponible y ahorro requiere registrar esa distribución.

## Publicación y recuperación aplicadas

Publicado en el dominio habitual con `dpl_CyuLMDLjiRH3ePRWhXuK51W2GWXE`, producción/READY. Los [421 archivos remotos](production-source-verification.json) coinciden por SHA-1 con las fuentes validadas; el único módulo de ejecución modificado respecto a la base es `captureMoney.ts`. La base es `791006b9cdbe87f17e22777e53b9d5d15a16dfe2`; no se creó un commit ni se hizo push. [Despliegue](production-deployment.json) · [Build remoto](production-build.log).

Dentro de una transacción con bloqueo por propietario se recuperó la transferencia pendiente, se añadieron cinco ingresos de compensación con su ruta a Nu y se conciliaron ambas cuentas con los saldos confirmados. Se conservaron las capturas originales, la transferencia anterior y todas las reglas. Una segunda ejecución dentro de la transacción no creó duplicados; la lectura independiente posterior confirmó los cambios y el resto de las tablas vigiladas. [Resultado sin datos personales](production-verification.json).

La sesión real del teléfono obtuvo HTTP 200 en Mi dinero y en el detalle del aviso: transferencia registrada y ambos saldos coincidentes con lo comunicado por el propietario. Los encabezados visibles de Cuentas también muestran ambos saldos; se dejó esa pestaña abierta. Calendar quedó sincronizado. Las páginas públicas responden 200 y las API privadas sin sesión responden 401 con `private, no-store` y `Vary: Authorization`. [HTTP](production-http.json). La ventana de logs revisada mostró advertencias de obsolescencia de pg por consultas concurrentes, sin un fallo funcional observado; las lecturas autenticadas terminaron correctamente. No se cambió la APK ni se activaron reglas nuevas.
