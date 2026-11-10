# Captura Android: diagnóstico del 9 de noviembre de 2026

Correcciones publicadas y recuperación histórica aplicada con autorización expresa. El diagnóstico y la verificación independiente se ejecutaron con `SET TRANSACTION READ ONLY` y aislamiento `RepeatableRead`; la recuperación se ejecutó en una sola transacción con bloqueo financiero por propietario. Las muestras, identificadores personales, textos y recibos detallados están en almacenamiento privado excluido de Git.

## Diagnóstico y correcciones

- Santander publicó un aviso con un solo símbolo de pesos. El analizador exigía dos. Ahora acepta ambas variantes, manteniendo moneda, terminación, fecha bancaria y detección de contradicciones. No se encontró un evento Wallet para esa compra; esto no demuestra si Wallet publicó una notificación en el teléfono.
- El viaje y su propina ya estaban registrados como dos cargos bancarios. Gmail entregó el recibo actualizado con «Total» pegado al saludo, lo que impedía interpretarlo. Se reconoce esa concatenación concreta sin sumar de nuevo total y pagos. La regla Gmail por tarjeta sigue sin habilitarse; reconocer el recibo no activa la automatización ni consolida gastos históricos.
- Banamex entregó una cancelación con doble espacio y sin el nombre de tarjeta. Se mantiene la resolución de las tres cifras mediante alias propios y la moneda mediante la regla aceptada. La propuesta admite que la cancelación omita exclusivamente el sufijo terminal «CIU» del comercio; otros cambios de nombre siguen sin coincidir. Aplicar la devolución requiere confirmar el gasto y su versión.
- El gasto cancelado fue editado y conservaba una fracción de centavo. Esa diferencia bloqueaba la propuesta de reembolso. Tras la confirmación expresa se normalizó al importe bancario exacto y se aplicó el reembolso total; la precisión anterior quedó en el historial y respaldo privados. El gasto conserva identidad, concepto, notas e importe original, con neto cero.

## Verificación

Las pruebas usan datos ficticios. Cubren ambas variantes de Santander, importes y alias inválidos, cuerpos contradictorios, recibos concatenados, espacios no separables, totales contradictorios, concurrencia, reintentos, pagos desglosados, cancelaciones sin nombre, abreviación limitada del comercio, colisiones de alias y protección de importes editados.

- Suite completa con PostgreSQL local desechable: **1134 correctas, sin fallos ni omisiones**, [registro](tests.log).
- Tipos de aplicación, pruebas y contratos: [typecheck](typecheck.log), [typecheck:tests](typecheck-tests.log) y [test:types](test-types.log).
- [ESLint](lint.log): cero errores y tres advertencias en componentes sin cambios (`CaptureIncomeSettings`, `GastosContent` y `data-table`). [Build de producción](build.log) correcto.
- Teléfono físico por ADB: APK 0.9.0 / 13 y permiso de notificaciones conservados. El reporte reciente del servidor muestra captura activa, lector conectado, doce fuentes seleccionadas y envíos sin pausa. No se modificaron ajustes ni se instaló otra APK. El estado actual no acredita continuidad del lector durante los días investigados.

No hay migraciones, dependencias nuevas ni cambios nativos. La corrección no reprocesa históricos ni activa reglas al publicarse. La recuperación puntual autorizada registró únicamente la compra faltante, conservó los dos cargos del viaje y aplicó la cancelación confirmada al gasto existente. No se habilitaron reglas Gmail por tarjeta.

## Publicación y recuperación autorizada

Vercel `dpl_3FTRETzhZJGRdG2wgZb9bHYuuDvW`, proyecto `afp`, entorno producción, está `READY` y asociado a `finanzas.garatachia.com`. Se publicaron 412 archivos de código, recursos y configuración; los 412 coinciden por SHA-1 con el manifiesto local, incluidos los cuatro módulos corregidos. La base del workspace es `98bfe4aa6b457963fd6e306a8a74abdef5a5139a`, con cambios locales incluidos. No se creó un commit ni se hizo push. [Despliegue](production-deployment.json) · [Cotejo completo de fuentes](source-verification.json).

Antes de escribir se guardó un respaldo privado PostgreSQL custom del esquema `public`, legible y con 46 entradas de datos de tablas. El ensayo de las acciones de servicio terminó correctamente y se revirtió íntegramente. Después de publicar y comprobar el dominio, se aplicaron las mismas acciones atómicamente. La lectura posterior mediante una conexión independiente confirmó compra única, devolución única, neto cero del gasto cancelado, notas y concepto conservados, viaje y propina intactos, recibo reinterpretado sin otro gasto, eventos originales inmutables y reglas sin cambios. [Verificación de recuperación](recovery-verification.json).

El login responde 200; las API de Gastos y Captura comprobadas rechazan solicitudes anónimas con 401, `private, no-store` y `Vary: Authorization`. [Comprobaciones HTTP](http-production.json). El primer barrido del nuevo despliegue no encontró errores ni fallos fatales; la ventana inicial es breve y no sustituye la observación de uso continuado. La comprobación financiera utilizó los servicios reales y una lectura independiente de PostgreSQL; no se inició otra sesión autenticada de navegador.

La [auditoría de producción](audit-prod.log) no encontró vulnerabilidades conocidas. La [auditoría completa](audit-all.log) conserva dos avisos de desarrollo: uno moderado de `minimatch` y uno bajo de `deepmerge`. No se cambiaron dependencias para esta publicación.

## Reproducción

Con una base local desechable migrada conforme al README:

```bash
AFP_TEST_DATABASE_URL='<conexión local afp_test…>' pnpm test
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
pnpm build
```
