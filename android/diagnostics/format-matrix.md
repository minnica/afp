# Matriz de fuentes y formatos · Fase 1

Actualización de cobertura: **22 de octubre de 2026**. Inventario contrastado el día 21 mediante una transacción PostgreSQL **READ ONLY**, limitada a los nombres de tarjetas del único propietario de AFP. Resultado: **9 tarjetas, 7 emisores y 8 aplicaciones de diagnóstico incluyendo Wallet**. Esa consulta inicial no leyó movimientos; el seguimiento de avisos reales posterior se documenta al final. No se renombraron tarjetas ni se dedujo su producto comercial.

## Inventario y aplicaciones verificadas

Todas las aplicaciones de esta tabla están instaladas en el perfil actual del S24 Ultra. Sus identificadores se contrastaron con sus fichas oficiales y sus versiones mediante ADB. La APK **0.1.2 / versionCode 3** admite las ocho fuentes. Que una aplicación esté instalada y admitida no acredita que emita avisos de compra accesibles.

| Fuente / ficha oficial | Paquete | Versión instalada | Tarjetas actuales de AFP / alcance | Formato real |
|---|---|---|---|---|
| [BBVA México](https://play.google.com/store/apps/details?id=com.bancomer.mbanking) | `com.bancomer.mbanking` | `26.90.14` | BBVA | Sin aviso de crédito; aviso de cuenta de débito excluido |
| [Google Wallet](https://play.google.com/store/apps/details?id=com.google.android.apps.walletnfcrel) | `com.google.android.apps.walletnfcrel` | `26.41.996630916` (reconsulta Fase 7) | Seis alias virtuales configurados; compras BANAMEX 1, Santander y DiDi observadas | Banamex verificado; Santander parcial no activable; `wallet.didi-purchase.es.v1` publicado y habilitado, con fecha aceptada |
| [HSBC México](https://play.google.com/store/apps/details?id=mx.hsbc.hsbcmexico) | `mx.hsbc.hsbcmexico` | `3.75.14` | HSBC 1 y HSBC 2 | Pendiente; distinguir ambas |
| [Banamex](https://play.google.com/store/apps/details?id=com.citibanamex.banamexmobile) | `com.citibanamex.banamexmobile` | `136.0.0` | BANAMEX 1 y BANAMEX 2 | `banamex.card-charge.es.v1` parcial, solo evidencia; BANAMEX 2 pendiente |
| [Santander México](https://play.google.com/store/apps/details?id=mx.bancosantander.supermovil) | `mx.bancosantander.supermovil` | `12.2` | SANTANDER | `santander.card-purchase.es.v1` publicado y habilitado; muestra resuelta; primera compra automática futura pendiente |
| [Nu](https://play.google.com/store/apps/details?id=com.nu.production) | `com.nu.production` | `10.8.43-minApi28` | NU | CFE v2 con regla expresa y suscripción; modo preparado, publicación pendiente. V1 parcial conservado |
| [DiDi Finanzas](https://play.google.com/store/apps/details?id=com.didiglobal.cashloan) | `com.didiglobal.cashloan` | `3.2.2` | DIDI | Sin muestra de compra propia; Wallet DiDi se documenta por separado |
| [Mercado Pago](https://play.google.com/store/apps/details?id=com.mercadopago.wallet) | `com.mercadopago.wallet` | `2.458.2` (reconsulta Fase 7) | MERCADOPAGO | Pendiente de muestra |

No faltan aplicaciones de los siete emisores inventariados. La app DiDi de viajes (`com.didiglobal.passenger`, también instalada) queda fuera de la lista de captura: se verificó DiDi Finanzas como aplicación dedicada que incluye DiDi Card. Si se observa un aviso de tarjeta emitido por otra app de DiDi, deberá verificarse e incorporarse explícitamente; no se afirma que sea imposible. Mercado Pago también puede emitir avisos ajenos a su tarjeta: su identidad no bastará para registrar una compra.

Las fuentes añadidas no se activan al actualizar la APK. Se conserva la selección anterior, incluida una selección vacía; se ignoran paquetes desconocidos almacenados. Cada fuente tiene su interruptor y contador. «Seleccionar todas las instaladas» aplica una selección explícita; no añade paquetes al catálogo ni habilita escrituras financieras. Las consultas de visibilidad del manifest y el lector tienen exactamente la misma lista, comprobada por una regresión.

## Campos y resolución por tarjeta

Los campos siguientes se refieren a **compras o pagos con crédito**. El aviso BBVA de cargo a cuenta recibido durante la preparación de Fase 6 fue confirmado por el propietario como transferencia de débito; no completa estos campos ni acredita cobertura de crédito. En Nu se observó un pago CFE que el propietario confirmó como financiado con crédito; esa confirmación no forma parte del contenido del aviso.

| Fuente | Importe | Moneda | Comercio | Fecha de operación | Identidad de tarjeta | Referencia |
|---|---|---|---|---|---|---|
| BBVA | Sin observar | Sin observar | Sin observar | Sin observar | Alias de crédito configurados; sin aviso de compra | Sin observar |
| Wallet (BANAMEX 1) | Presente | MXN explícito | Presente en título | Ausente; fecha de publicación México aceptada expresamente | Título/terminación digital BANAMEX 1; distinto del token NFC | Sin referencia explícita observada |
| HSBC | Sin observar | Sin observar | Sin observar | Sin observar | Alias de ambas configurados; falta muestra de compra | Sin observar |
| Banamex (compra cotejada con Wallet) | Presente | Solo símbolo `$` | Presente | Fecha/hora impresas | Tres cifras, resueltas por alias bancario sin colisiones; BANAMEX 1 contrastada con Wallet | Autorización abreviada conservada como evidencia, sin unicidad supuesta |
| Santander | Presente | MXN explícito | Presente | Fecha/hora bancarias impresas, México | Cuatro cifras; alias físicos/digitales Santander comprobados | Ausente |
| Wallet (Santander LikeU) | Presente | MXN explícito | Presente en título | Ausente; publicación conservada solo como evidencia | Terminación bancaria física/digital, distinta del número virtual NFC | Ausente |
| Nu (pago CFE) | Presente | Ausente; MXN por regla expresa | Presente: CFE | Ausente; publicación México aceptada | Ausente; NU por regla expresa de este formato | Ausente |
| DiDi Finanzas | Sin observar | Sin observar | Sin observar | Sin observar | Alias configurado; campo del aviso sin observar | Sin observar |
| Wallet (DiDi) | Presente | MXN explícito | Presente en título | Ausente; publicación México aceptada expresamente | DIDI Credit Card y cuatro cifras del alias digital bancario verificado; distinto del token NFC | Ausente |
| Mercado Pago | Sin observar | Sin observar | Sin observar | Sin observar | Tarjeta frente a cuenta/saldo pendiente | Sin observar |

«Sin observar» significa que falta una notificación real revisada; no significa que el campo esté ausente. Para cada muestra, registrar **presente, ausente o ambiguo** solo después de revisar el contenido en el teléfono. Las fechas Android no se presentan como fecha bancaria. Políticas aceptadas expresamente: Wallet/BANAMEX 1 y Nu/CFE usan el día de publicación en México como fecha del gasto, conservando ese origen y sin inventar `operationAt`. Conocer el emisor no permite elegir entre dos tarjetas del mismo banco. La Fase 4 configuró 24 alias verificados por declaración del propietario en las nueve tarjetas existentes. Eso no demuestra qué campos entrega un aviso ni habilita formatos; este inventario no crea vinculaciones financieras.

## Validación del teléfono y escenarios físicos

Samsung `SM-S928B` (S24 Ultra), Android `16`, API `36`, One UI `80500` (8.5). El script `android/scripts/check-device.py` consulta únicamente identidad técnica, versiones, permiso y estado de batería de AFP, sin leer notificaciones ni publicar el número de serie.

| Escenario físico | Estado | Evidencia / pendiente |
|---|---|---|
| Apertura de AFP como TWA | Verificada en 0.1.1 por el usuario y en 0.1.2 mediante el botón | Chrome 141.0.7390.43, dos aperturas sucesivas de la APK final sin barra del navegador después de volver al diagnóstico. Regresión de navegación y de actividades auxiliares correctas. |
| Dominio declara el certificado | Verificado por HTTPS y Android | HTTP 200, `application/json`, dominio `verified`; misma identidad de firma en 0.1.2. |
| Acceso a notificaciones | Concedido manualmente y conservado tras actualizar | APK final 0.1.2: lector conectado y activo, ocho fuentes seleccionadas; batería exenta y segundo plano permitido. |
| Ocho paquetes instalados | Verificado | Versiones indicadas arriba; sin consulta de avisos. |
| Captura real con pantalla bloqueada | Pendiente | El usuario avisará al recibir un cargo nuevo con el diagnóstico activo. No se solicita realizar una compra de prueba. |
| Estado de batería antes de actualizar | Consultado | AFP no exenta de optimización; standby bucket `10` (activo); `RUN_ANY_IN_BACKGROUND` en modo predeterminado `allow`. No demuestra las listas de suspensión de Samsung. |
| Rutas y listas de batería de Samsung | Verificadas en One UI 8.5 | Aplicado «No restringido»; exención Android confirmada, bucket `5`, segundo plano `allow`. Aplicaciones suspendidas vacía; AFP ausente de la lista completa de suspensión profunda; Aplicaciones sin autosuspensión vacía. No acredita entrega con bloqueo. |
| Contenido vacío/protegido | Tratamiento probado con datos sintéticos | Falta observar qué entrega Android en un aviso real. |
| Actualizaciones de un aviso | Muestras separadas implementadas | Falta una observación; no se supone que sea otra compra. |

**Verificación final:** 9 pruebas unitarias, 10 instrumentadas y 3 regresiones Node correctas; debug/release y lint correctos (0 errores, 5 avisos previos). [Evidencia de la APK final](../../artifacts/android-fase1/multi-source-verification.json).

Las pruebas instrumentadas de captura usan exclusivamente **notificaciones sintéticas**. Verifican extracción, identidad de las ocho fuentes, campos vacíos, cifrado, límite del búfer y migración de selección. La marca `screenLocked` suministrada por una prueba no demuestra captura del servicio con el dispositivo bloqueado ni compatibilidad bancaria.

## Recopilación y ejemplos para pruebas

1. Seleccionar las fuentes, permitir acceso y activar el diagnóstico. Cada fuente sin muestra conserva el estado pendiente.
2. Esperar un aviso normal de compra; para el piloto, dejar el teléfono bloqueado. No realizar compras solo para probar.
3. Revisar el texto exclusivamente en el teléfono. Anotar fuente/versión, tipo de compra, condición de bloqueo y disponibilidad de cada campo, sin copiar valores personales a Git.
4. Preparar una copia revisada que conserve las palabras y estructura bancarias y sustituya comercio, importe, fechas, nombres, terminaciones y referencias por valores ficticios coherentes. Marcar la muestra como derivada de un aviso real y la revisión realizada, sin convertir esos valores ficticios en hechos financieros.
5. Verificar si la evidencia distingue cada tarjeta. Un campo ausente o ambiguo permanece así; no completar por deducción.

La exportación `anonymous-shape-only` oculta letras y cifras y sirve para inspeccionar estructura. **No constituye una muestra de lenguaje bancario para desarrollar un analizador.** El repositorio incluye ahora una [muestra real revisada y anonimizada de Nu/CFE](../../tests/fixtures/captures/nu-cfe-service-payment.es.v1.json): conserva el lenguaje y sustituye importe y fechas por valores ficticios. Sus campos ausentes se mantienen ausentes y su analizador sigue sin habilitar automatización. Otros avisos de Nu continúan sin validar. La fase permanece abierta hasta validar la captura real del piloto; otras fuentes pueden continuar identificadas como pendientes.

## Observación del piloto de crédito · Fase 6

El 21 de octubre se publicó la web y se actualizó la APK personal a **0.5.0 / 7**, conservando autorización, permiso, batería y las ocho fuentes seleccionadas. Se conservaron los seis eventos/recibos recibidos de cuatro fuentes; no constituyen seis compras verificadas. El único aviso BBVA disponible fue identificado explícitamente como una transferencia de débito y quedó descartado, con su evidencia conservada. Su prefijo se reconoce como ajeno al piloto de crédito y no aparece entre los formatos automatizables. No se incorporó una muestra ni un analizador activable de compra de crédito.

Presencial, en línea, Wallet, Amazon, Mercado Libre y suscripciones de crédito siguen pendientes de avisos revisados. El diagnóstico de las otras fuentes se mantiene y la automatización sigue desactivada en todas las tarjetas. La verificación técnica actual comprende 298 pruebas web, 18 JVM, 29 instrumentadas y dos comprobaciones de actualización, sin omisiones; los casos de compras son ficticios. El seguimiento por tarjeta/período está en Conciliar y no atribuye compras a avisos ausentes o ambiguos. [Plan Fase 6](../../PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-6-piloto-completo-con-bbva-platinum), [evidencia](../../artifacts/android-fase6/verification.json).

## Activación gradual · Fase 7

Reconsulta ADB del **21 de octubre de 2026**: ocho fuentes instaladas, permiso de notificaciones y batería exenta conservados en AFP personal **0.5.0 / 7**. Wallet pasó a `26.41.996630916` y Mercado Pago a `2.458.2`; las otras seis versiones siguen iguales. [Consulta técnica sin avisos ni identificadores del teléfono](../../artifacts/android-fase7/device.json).

Al iniciar la fase no había avisos nuevos de compras de crédito. El seguimiento posterior añade una muestra parcial Nu/CFE; al cerrar la aceptación inicial ninguna tarjeta tenía un formato de crédito activable. El seguimiento del día 22 valida Wallet/BANAMEX 1, detallado abajo. Se conservan 24 alias, sin publicar cifras: física/digital en las nueve tarjetas y Wallet en BBVA, BANAMEX 1/2, SANTANDER, NU y DIDI. Los seis Wallet inicialmente declarados correspondían al título de la tarjeta y se corrigieron contrastando el campo **Número de cuenta virtual** en cada tarjeta del teléfono. HSBC 1/2 y MERCADOPAGO conservan Wallet vacío por incompatibilidad declarada por el propietario.

Los canales presencial, en línea, parciales y suscripciones reales están pendientes **en cada tarjeta**; Wallet tiene una compra real BANAMEX 1 validada en el seguimiento del día 22; las otras cinco aplicables siguen pendientes. La nueva vista de cobertura y los requisitos de activación están implementados en local: un analizador verificado y un alias no bastan, también se exige una propuesta propia del mismo formato en observación, revisada, registrada/vinculada y cotejada sin corregir sus datos interpretados. No se atribuye el canal ni la compra a partir de la aplicación instalada.

La aceptación inicial tuvo 329 regresiones web correctas sin omisiones, con pruebas propias de las nueve tarjetas y seis Wallet mediante contratos ficticios del cargador aislado. No son fixtures reales de los emisores ni permiten habilitar los analizadores del producto. La pausa por fuente y vuelta a observación conservan datos; también se puede desactivar una configuración de formato retirado. [Guía, matriz por tarjeta y recuperación](../../docs/android-captura.md#activación-gradual-por-tarjeta--fase-7), [evidencia Fase 7](../../artifacts/android-fase7/verification.json). Esa aceptación inicial no publicó esta implementación ni modificó Supabase; la corrección posterior de alias se detalla a continuación. La fase permanece abierta.

## Primeros movimientos reales revisados · 21 de octubre de 2026

**Nu/CFE:** se revisaron `android.title`, `android.text` y `android.bigText`. La entrega al servidor tardó aproximadamente cinco segundos desde la captura; el teléfono estaba desbloqueado. La propuesta parcial local conserva importe y CFE, sin inferir moneda, tarjeta ni fecha de operación a partir de la fuente o de las fechas Android. `nu.cfe-service-payment.es.v1` tiene evidencia `REAL_REVIEWED_PARTIAL` y `verified: false`. El evento ya recibido mantiene su recibo y estado original `REVIEW / UNKNOWN_FORMAT`; no se reinterpreta ni se registró un gasto. La nueva interpretación aún no se publicó.

**Compra BBVA/Wallet:** el comprobante facilitado acredita un pago aprobado NFC en una terminal Mercado Pago y su terminación coincide con el número virtual de la BBVA consultada. Se corrigió un dígito mal leído inicialmente del comprobante. El propietario solo vio la terminal y la palomita de Wallet, sin notificación. No se encontró un aviso asociado en AFP; Wallet tenía cero muestras de diagnóstico y cero eventos en el servidor. El historial Wallet consultado mostraba operaciones anteriores, sin identificar el cargo comunicado. Una terminal Mercado Pago no convierte la operación en un cargo de la tarjeta MERCADOPAGO.

**Corrección de alias Wallet:** el propietario aclaró que las seis entradas originales copiaban la terminación del título. Se leyeron los seis números de cuenta virtual en los detalles de BBVA, NU, DIDI, SANTANDER y BANAMEX 1/2, vinculando cada título con su tarjeta existente sin inferir por marca. Se sustituyeron las seis entradas incorrectas en AFP mediante el servicio de configuración en una transacción y se actualizó el archivo privado. La lectura posterior confirmó los 24 alias y cero ambigüedades; los otros 18 alias y las huellas de 20 modelos permanecieron idénticos. Los números y respaldos quedan fuera de Git. Esta corrección no aporta una notificación de compra ni activa formatos.

En la consulta actual, BBVA, Wallet y Nu tenían permiso para publicar notificaciones y los canales consultados de BBVA/Wallet no estaban bloqueados. El reporte AFP mostraba lector/acceso/captura activos, envíos habilitados, ocho fuentes y ninguna pausa remota. Estos estados actuales no permiten concluir si se publicó una notificación en el momento del pago. Un comprobante y una confirmación dentro de Wallet son evidencias distintas de una notificación accesible al lector.

Google documenta que los pagos en tienda pueden usar un número virtual consultable en los detalles de la tarjeta; debe verificarse allí, sin asumir que coincide con la terminación física o con un comprobante concreto. [Ayuda oficial de Google Wallet](https://support.google.com/wallet/answer/7643925?hl=es).

La regresión completa pasó a **337 pruebas web correctas sin omisiones** en PostgreSQL desechable; lint y build correctos, con el aviso previo de TanStack. No hubo cambios nativos, activaciones, gastos creados ni despliegue. Los originales y las terminaciones permanecen fuera de Git. [Evidencia del seguimiento](../../artifacts/android-muestras-2026-10-21/verification.json).

## Revisión adicional · 22 de octubre de 2026

El propietario comunicó una compra BANAMEX 1 por Wallet y confirmó ver ambos avisos. Banco y Wallet llegaron al servidor, coinciden con el importe comunicado, comercio y horario, y tienen dos movimientos de captura separados en `REVIEW / UNKNOWN_FORMAT`, sin gasto vinculado ni gasto coincidente para esa tarjeta/importe. La correlación es una comprobación manual; no acredita una combinación automática ni permite crear dos gastos. El aviso Wallet muestra el título de la tarjeta y la terminación que corresponde al alias digital bancario, sin mostrar su número virtual NFC. No se cambian los seis alias virtuales correctos por esa diferencia de formato.

El teléfono tiene una muestra Banamex y una Wallet, ambas recibidas con pantalla desbloqueada. Su cola confirma **0 pendientes, 0 por revisar en envíos y 19 entregados**; el servidor conserva 19 eventos. La muestra Wallet corresponde a la compra nueva. Sigue sin encontrarse un aviso asociado al comprobante BBVA anterior; existe un gasto de igual tarjeta, fecha e importe sin capturas vinculadas, cuya identidad no se confirma solo por esos tres campos. No se crearon gastos, resolvieron evidencias ni cambiaron ajustes. No hubo cambios de código ni despliegue. Las versiones del inventario anterior no se volvieron a verificar en esta revisión. [Evidencia y límites](../../artifacts/android-muestras-2026-10-22/verification.json).

## Primer formato real implementado · 22 de octubre de 2026

`wallet.banamex-purchase.es.v1` reconoce el formato observado Joy Banamex, con MXN, importe y comercio explícitos. La terminación se resuelve contra los alias bancarios físicos/digitales, sin reemplazar el token virtual NFC. La fecha del gasto procede de la publicación Wallet en `America/Mexico_City`, **aceptada expresamente por el propietario y guardada por tarjeta/formato**, con su origen visible. No se inventa una fecha bancaria.

`banamex.card-charge.es.v1` conserva importe, comercio, fecha/hora AM/PM, tres cifras de tarjeta y autorización abreviada. Es parcial y no activable: «Retiro/Compra» no distingue el tipo y `$` no fija moneda. No se considera la autorización una referencia global única. La [muestra Wallet](../../tests/fixtures/captures/wallet-banamex-purchase.es.v1.json) y la [muestra Banamex](../../tests/fixtures/captures/banamex-card-charge.es.v1.json) conservan la gramática real con valores ficticios.

La compra real BANAMEX 1 se registró una sola vez y se vincularon ambas evidencias por revisión expresa, con cotejo puntual documentado, sin estado de cuenta ni corte completo. Los eventos, recibos, alias y filas financieras anteriores se conservaron. Solo está preparado el modo automático BANAMEX 1 / ese formato Wallet; **publicación web pendiente**. La captura Android usa la misma APK personal 0.5.0 / 7. Las compras nuevas podrán crear un gasto por conciliar con ese aviso Wallet; el aviso bancario parcial quedará por revisar, sin un segundo gasto automático. Dos compras iguales o coincidencias con registros existentes exigen revisión; no se fusionan por aproximación.

Un análisis nuevo de un aviso pendiente requiere la acción explícita de la bandeja, conserva historial y no registra gastos. La migración aditiva de política de fecha/historial quedó aplicada: 25 migraciones, diff vacío y 30 tablas con RLS. Verificación final: 429 pruebas correctas sin omisiones, lint/build y reproducción de migraciones correctos; navegador y API locales con datos ficticios. Falta publicar, observar creación automática real, validar las demás tarjetas/canales y conciliar un corte. El comprobante BBVA sigue sin aviso asociado y no se duplicó el gasto coincidente. [Evidencia de implementación](../../artifacts/android-wallet-banamex/verification.json).

## Nu/CFE y suscripción · 22 de octubre de 2026

`nu.cfe-service-payment.es.v2` valida el texto real observado y solo completa la propuesta mediante una regla expresa del propietario: tarjeta NU, MXN, fecha de publicación en `America/Mexico_City` y suscripción CFE existente. Los campos ausentes del aviso permanecen documentados como ausentes; la propuesta indica cuáles proceden de la regla. La [muestra original anonimizada](../../tests/fixtures/captures/nu-cfe-service-payment.es.v1.json) conserva esa limitación; v1 sigue parcial y no activable.

Se resolvió el pago real una vez mediante análisis/revisión explícitos y se confirmó su cobro de suscripción de octubre. Se conservó la suscripción bimestral en efectivo: solo esa ocurrencia usa Nu y el importe real. El cobro dejó de estar pendiente y su aviso importante ya no se genera, sin ocultar recordatorios. Eventos/recibos originales, alias, gastos anteriores y automatización Wallet/BANAMEX 1 se preservaron. La regla y el modo automático Nu/CFE quedaron preparados; **falta publicar el código** para avisos futuros. Otros avisos Nu siguen por revisar.

Solo se registra un cobro del mes del aviso cuando está programado y pendiente. Los meses sin cobro, omisiones, evidencia previa y registros existentes conservan revisión; nunca se crea un gasto genérico adicional al fallar el vínculo. Cambiar el destino de la regla vuelve a observación y exige evidencia propia. La política no identifica por sí sola pagos hechos desde otra fuente de fondos que emita el mismo texto; su asignación a crédito Nu procede de la decisión expresa del propietario.

26 migraciones completas, diff vacío, RLS en 30 tablas; 440 pruebas correctas sin omisiones, lint/build y reconstrucción/actualización de migraciones correctos. Navegador y HTTP con datos ficticios verifican resolución de ambos avisos y recibo original conservado. Sin cambio de APK personal 0.5.0 / 7. Falta publicar, observar otro pago normal y conciliar un corte completo. [Evidencia Nu/CFE](../../artifacts/android-nu-cfe/verification.json).

## Santander y Wallet LikeU · 22 de octubre de 2026

El propietario confirmó una compra con Santander mediante Wallet. Los dos avisos llegaron al servidor en pocos segundos; la revisión inicial del teléfono mostró 23 entregados y cero pendientes o errores de envío. La terminación visible en ambos corresponde a los alias Santander físicos/digitales configurados, sin cambiar el número virtual NFC. Tras autorización expresa y publicación, se resolvieron una sola vez y se vincularon a un mismo gasto, conservando eventos, recibos e interpretaciones iniciales.

`santander.card-purchase.es.v1` interpreta el aviso **Compra con tarjeta** con comercio, importe, MXN explícito, cuatro cifras y fecha/hora bancarias en México. El cuerpo conserva el doble símbolo de pesos observado. El formato está verificado y puede habilitarse por tarjeta después de revisar, registrar/vincular y cotejar una propuesta propia. La fecha de recepción no modifica el día bancario; campos contradictorios, monedas ajenas, alias ambiguos y otra estructura quedan por revisar.

`wallet.santander-purchase.es.v1` conserva **Santander LikeU** como evidencia parcial no activable: importe, MXN, comercio, terminación bancaria y publicación. No incluye fecha bancaria ni referencia común; no se utiliza la publicación como día del gasto ni se agrupan avisos automáticamente por coincidencia. El banco registra la compra cuando esté habilitado, y Wallet puede vincularse expresamente al mismo gasto. Compras iguales y correcciones personales conservan revisión.

Las [muestras Santander](../../tests/fixtures/captures/santander-card-purchase.es.v1.json) y [Wallet](../../tests/fixtures/captures/wallet-santander-purchase.es.v1.json) sustituyen todos los valores personales por datos ficticios. Pasaron 484 pruebas sin fallos ni omisiones, build y lint; la interfaz móvil con API/PostgreSQL locales comprobó cero gastos al interpretar y uno al registrar/vincular ambas evidencias. **Publicado READY y formato bancario habilitado**, con cotejo puntual de la compra inicial en **Por clasificar**, visible en Gastos del teléfono. La comparación del respaldo privado de 32 tablas conservó registros anteriores, alias y RLS. Sin migración ni cambio de APK 0.6.0 / 8. La muestra inicial se resolvió expresamente: aún falta observar una compra futura automática y un corte completo; otros canales Santander siguen pendientes. [Producción](../../artifacts/android-santander/production.json) y [aceptación técnica](../../artifacts/android-santander/verification.json).

## DiDi por Google Wallet · 22 de octubre de 2026

Un aviso Wallet de la compra nueva llegó correctamente y corresponde al alias digital bancario DiDi verificado. No se encontró aviso bancario asociado entre los eventos consultados; esto no demuestra que DiDi nunca lo emita. La lectura inicial del teléfono mostró **30 entregados, cero pendientes y cero errores de envío**, coincidentes con el servidor. Tras la autorización de publicación y fecha se resolvió una sola vez, conservando evento, recibo e interpretación inicial.

`wallet.didi-purchase.es.v1` interpreta el texto observado **DIDI Credit Card**, importe, moneda explícita y comercio. La [muestra anonimizada](../../tests/fixtures/captures/wallet-didi-purchase.es.v1.json) conserva la gramática con valores ficticios. No incluye fecha bancaria ni referencia única; se propone la publicación en México con origen visible. Habilitar exige aceptación expresa de `NOTIFICATION_POSTED_AT` para esa tarjeta/formato, además de revisión y cotejo propios. Los alias físicos/digitales se resuelven en DiDi; no se reemplaza el número virtual NFC ni se valida por ello la app bancaria.

**Publicado READY y Wallet DiDi habilitado con autorización.** Pasaron 519 pruebas sin fallos ni omisiones, incluidas 21 nuevas de DiDi, lint y build Webpack. El navegador móvil con Auth ficticia y API/PostgreSQL reales comprobó reinterpretación sin gasto, revisión/registro, aceptación de fecha al habilitar y creación automática de una compra futura por conciliar. Nueve entregas del mismo evento crean un gasto y un recibo. El original privado también se verificó sin conexión. En producción, la comparación del respaldo de 32 tablas confirmó un gasto nuevo, cotejo puntual y habilitación solo DiDi; gastos anteriores, alias, eventos/recibos, otras reglas y RLS conservados. Sin migración ni APK nueva; personal 0.6.0 / 8 comprobada por USB. La muestra inicial se resolvió expresamente: falta observar una compra futura normal registrada automáticamente y conciliar un corte completo. [Producción](../../artifacts/android-didi-wallet/production.json) y [evidencia técnica y pantallas](../../artifacts/android-didi-wallet/verification.json).
