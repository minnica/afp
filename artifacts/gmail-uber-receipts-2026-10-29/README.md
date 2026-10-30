# Recibos Uber desde notificaciones de Gmail

Implementación y publicación autorizada del 29 de octubre de 2026. El propietario eligió capturar notificaciones de Gmail en Android. La web y la migración están publicadas; la APK **0.9.0 / versionCode 13** está instalada en el teléfono personal y Gmail quedó seleccionado expresamente. Los gastos personales anteriores se conservaron. La automatización por tarjeta requiere todavía una notificación real completa y cotejada. [Comprobaciones de producción](production.json).

## Comportamiento

- Gmail es una fuente optativa, desactivada al actualizar. El filtro admite solo el remitente visible «Recibos de Uber» y el asunto del viaje antes de guardar en Room o diagnóstico. Retira la identidad del buzón, resúmenes y listas de mensajes; la API vuelve a validar el alcance.
- El formato español interpreta fecha/hora del viaje, total MXN y terminación de tarjeta si son visibles. Reutiliza alias físicos/digitales bancarios verificados, incluidos los de HSBC. El nombre editable del medio de pago en Uber no identifica la tarjeta. Los recibos recortados conservan los datos disponibles para revisión.
- La activación por tarjeta exige una muestra propia revisada, registrada/vinculada y cotejada sin corregir datos interpretados, y aceptar `RECEIPT_OPERATION`. La recepción de Gmail no activa automáticamente ninguna regla.
- Con la regla activa, una única coincidencia con igual tarjeta, cargo Uber e importe dentro de 48 horas puede vincular banco y recibo. El recibo aporta el día del viaje; puede ajustar la fecha de un gasto automático pendiente si conserva su versión original. Si el banco llega después, se vincula al gasto ya creado. Es una inferencia aceptada por coincidencia de datos, sin referencia bancaria común.
- Una propina explícita con igual hora del recibo, tarjeta y tarifa base actualiza el total una sola vez. Un recibo anterior no lo reduce. Los pagos bancarios desglosados pueden vincularse sin crear otros gastos; cargos que excederían el total conocido quedan por revisar.
- Ambigüedades, alias en colisión, gastos editados/conciliados/borrados y reducciones de importe conservan revisión. El original de cada evento permanece intacto. Los snapshots de versión se limitan a recibos y gastos automáticos Uber; no alteran propuestas de otros servicios.

La migración aditiva `20261029010000_capture_receipt_date_policy` solo amplía la restricción de políticas de fecha. No añade acceso al correo, reglas activas ni reinterpretación histórica. Se aplicó tras el respaldo privado; después se publicó la API compatible, se instaló la APK y se seleccionó Gmail.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Suite Node con PostgreSQL local desechable | 1025 correctas, cero fallos y omisiones; [log](node-tests.log) |
| Pruebas específicas de recibos | 18 escenarios: fecha, total/propina, fuente, cola incompleta, ambas órdenes banco/correo, concurrencia, pausas, alias, ediciones, borrados y ambigüedad; [log](receipt-tests.log) |
| Reconstrucción y actualización de BD | 43 migraciones, checksums conservados, diff vacío, datos conservados y 45 tablas con RLS; [log](database-verification.log) |
| Pruebas JVM Android | 28 correctas, cero fallos; una integración HTTPS local opcional omitida; [log](android-build.log) |
| Teléfono físico, APK dev aislada | Dos pruebas instrumentadas correctas: filtro antes del almacenamiento cifrado, exclusión de datos del buzón y selección independiente/persistente de Gmail; [log](android-instrumented.log) |
| APK release | Compilada y firmada; certificado coincide con Digital Asset Links local; [metadatos y huellas](verification.json) |
| Tipos, contratos, lint y build web | `typecheck`, `typecheck:tests`, `test:types`, `lint` y `build` correctos; dos advertencias previas de lint |
| Navegador y API locales | Revisión y alta de un recibo ficticio con fecha del viaje y HSBC 1; activación HTTP 200 tras cotejo con `RECEIPT_OPERATION`; móvil de 390 px y escritorio sin desbordamiento ni errores; [resultado](browser-verification.json), [escritorio](review-desktop.png), [móvil](review-mobile.png) |

La prueba instrumentada utiliza datos ficticios, no vincula la APK dev y no entrega avisos a producción. Las aplicaciones dev y de pruebas se retiraron al terminar. El runner conserva su aviso previo sobre `androidx.test.services`; las dos pruebas finalizaron correctamente.

La auditoría de dependencias conserva cero avisos de producción y un aviso bajo previo de desarrollo en `deepmerge`, sin cambios de dependencias. La firma también se contrastó contra el Digital Asset Links publicado. Los logs de esta comprobación y las auditorías se conservan junto al informe.

## Límites y pendientes

La captura de pantalla y la lectura de los correos completos confirmaron la gramática, las tarjetas y el recibo actualizado con propina; no acreditan que Gmail entregue ese contenido completo mediante `NotificationListenerService`. Si el aviso no incluye la tarjeta, no habrá registro autónomo desde ese recibo. Los correos y las capturas reales se conservan fuera de Git; los fixtures contienen valores ficticios.

No se conecta la API de Gmail ni se leen correos históricos. Esta implementación no desarrolla un analizador de notificaciones bancarias HSBC: permite reconocer su tarjeta desde un recibo Uber completo. Los avisos directos de Uber, DiDi y Uber Eats siguen como evidencia para revisión.

Pendientes: observar una notificación real completa y activar el formato por tarjeta tras revisar, registrar/vincular y cotejar su muestra. No hay reglas Gmail por tarjeta habilitadas. Los viajes anteriores no se reconstruyen a partir de las capturas ni se importan silenciosamente.

## Publicación e instalación

Vercel `dpl_G4R1V1GR2uYK2pa9rMXgKBihWeaG` está `READY` y asociado a `finanzas.garatachia.com`. Se cargaron por API 408 archivos del workspace probado, sin secretos, archivos privados ni evidencias. La base Git es `1157e942868901eefa262f3c1a081f597b21966c` con cambios locales incluidos en el despliegue; no se creó un commit ni se hizo push. El árbol remoto expone 156 archivos, todos coincidentes por SHA-1, incluidos los 29 módulos de captura y el lockfile/configuración de pnpm. Los límites de profundidad y longitud de la API impiden presentar esa lectura como una comprobación independiente de todos los archivos cargados.

Tras el respaldo privado, la BD conserva 43 migraciones completas, cero pendientes, los checksums históricos y 45 tablas con RLS. Las 37 tablas financieras y de configuración comparadas no cambiaron. HTTP anónimo devuelve login 200 y las tres API de captura comprobadas 401 con `private, no-store`. La consulta inicial de errores no encontró incidencias en las rutas de captura desde la publicación; su ventana es breve y no sustituye la observación de uso real.

La instalación por USB conservó la fecha inicial, credencial, propietario, autorización, permiso y cola cifrada: 0 pendientes, 0 por revisar y 992 entregados. El APK instalado coincide por SHA-256 con el probado. Gmail estaba desactivado al actualizar y se seleccionó expresamente; el reporte autenticado confirmó las once fuentes anteriores más Gmail: doce en total, lector conectado, captura activa, envíos sin pausa y cero fuentes pausadas. No se habilitó ningún formato Gmail por tarjeta. Las firmas, la APK anterior y el respaldo financiero permanecen en almacenamiento privado excluido de Git.
