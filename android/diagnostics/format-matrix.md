# Matriz de fuentes y formatos · Fase 1

Actualización: **21 de octubre de 2026**. Inventario vigente contrastado mediante una transacción PostgreSQL **READ ONLY**, limitada a los nombres de tarjetas del único propietario de AFP. Resultado: **9 tarjetas, 7 emisores y 8 aplicaciones de diagnóstico incluyendo Wallet**. No se consultaron movimientos ni se modificaron registros. Los nombres siguientes son los existentes; no se renombraron tarjetas ni se dedujo su producto comercial.

## Inventario y aplicaciones verificadas

Todas las aplicaciones de esta tabla están instaladas en el perfil actual del S24 Ultra. Sus identificadores se contrastaron con sus fichas oficiales y sus versiones mediante ADB. La APK **0.1.2 / versionCode 3** admite las ocho fuentes. Que una aplicación esté instalada y admitida no acredita que emita avisos de compra accesibles.

| Fuente / ficha oficial | Paquete | Versión instalada | Tarjetas actuales de AFP / alcance | Formato real |
|---|---|---|---|---|
| [BBVA México](https://play.google.com/store/apps/details?id=com.bancomer.mbanking) | `com.bancomer.mbanking` | `26.90.14` | BBVA | Pendiente de muestra |
| [Google Wallet](https://play.google.com/store/apps/details?id=com.google.android.apps.walletnfcrel) | `com.google.android.apps.walletnfcrel` | `26.41.996630916` (reconsulta Fase 7) | Alias de seis tarjetas configurados; falta observar sus compras | Pendiente de muestra |
| [HSBC México](https://play.google.com/store/apps/details?id=mx.hsbc.hsbcmexico) | `mx.hsbc.hsbcmexico` | `3.75.14` | HSBC 1 y HSBC 2 | Pendiente; distinguir ambas |
| [Banamex](https://play.google.com/store/apps/details?id=com.citibanamex.banamexmobile) | `com.citibanamex.banamexmobile` | `136.0.0` | BANAMEX 1 y BANAMEX 2 | Pendiente; distinguir ambas |
| [Santander México](https://play.google.com/store/apps/details?id=mx.bancosantander.supermovil) | `mx.bancosantander.supermovil` | `12.2` | SANTANDER | Pendiente de muestra |
| [Nu](https://play.google.com/store/apps/details?id=com.nu.production) | `com.nu.production` | `10.8.43-minApi28` | NU | Pendiente de muestra |
| [DiDi Finanzas](https://play.google.com/store/apps/details?id=com.didiglobal.cashloan) | `com.didiglobal.cashloan` | `3.2.2` | DIDI | Pendiente de muestra |
| [Mercado Pago](https://play.google.com/store/apps/details?id=com.mercadopago.wallet) | `com.mercadopago.wallet` | `2.458.2` (reconsulta Fase 7) | MERCADOPAGO | Pendiente de muestra |

No faltan aplicaciones de los siete emisores inventariados. La app DiDi de viajes (`com.didiglobal.passenger`, también instalada) queda fuera de la lista de captura: se verificó DiDi Finanzas como aplicación dedicada que incluye DiDi Card. Si se observa un aviso de tarjeta emitido por otra app de DiDi, deberá verificarse e incorporarse explícitamente; no se afirma que sea imposible. Mercado Pago también puede emitir avisos ajenos a su tarjeta: su identidad no bastará para registrar una compra.

Las fuentes añadidas no se activan al actualizar la APK. Se conserva la selección anterior, incluida una selección vacía; se ignoran paquetes desconocidos almacenados. Cada fuente tiene su interruptor y contador. «Seleccionar todas las instaladas» aplica una selección explícita; no añade paquetes al catálogo ni habilita escrituras financieras. Las consultas de visibilidad del manifest y el lector tienen exactamente la misma lista, comprobada por una regresión.

## Campos y resolución por tarjeta

Los campos siguientes se refieren a **compras de crédito**. El aviso BBVA de cargo a cuenta recibido durante la preparación de Fase 6 fue confirmado por el propietario como transferencia de débito; no completa estos campos ni acredita cobertura de crédito.

| Fuente | Importe | Moneda | Comercio | Fecha de operación | Identidad de tarjeta | Referencia |
|---|---|---|---|---|---|---|
| BBVA | Sin observar | Sin observar | Sin observar | Sin observar | Alias de crédito configurados; sin aviso de compra | Sin observar |
| Wallet | Sin observar | Sin observar | Sin observar | Sin observar | Alias de Wallet configurados para seis tarjetas; sin aviso de compra | Sin observar |
| HSBC | Sin observar | Sin observar | Sin observar | Sin observar | Alias de ambas configurados; falta muestra de compra | Sin observar |
| Banamex | Sin observar | Sin observar | Sin observar | Sin observar | Alias de ambas configurados; falta muestra de compra | Sin observar |
| Santander | Sin observar | Sin observar | Sin observar | Sin observar | Alias configurado; campo del aviso sin observar | Sin observar |
| Nu | Sin observar | Sin observar | Sin observar | Sin observar | Alias configurado; campo del aviso sin observar | Sin observar |
| DiDi Finanzas | Sin observar | Sin observar | Sin observar | Sin observar | Alias configurado; campo del aviso sin observar | Sin observar |
| Mercado Pago | Sin observar | Sin observar | Sin observar | Sin observar | Tarjeta frente a cuenta/saldo pendiente | Sin observar |

«Sin observar» significa que falta una notificación real revisada; no significa que el campo esté ausente. Para cada muestra, registrar **presente, ausente o ambiguo** solo después de revisar el contenido en el teléfono. Las fechas de publicación, recepción y `Notification.when` no sustituyen la fecha de la operación. Conocer el emisor no permite elegir entre dos tarjetas del mismo banco. La Fase 4 configuró 24 alias verificados por declaración del propietario en las nueve tarjetas existentes. Eso no demuestra qué campos entrega un aviso ni habilita formatos; este inventario no crea vinculaciones financieras.

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

La exportación `anonymous-shape-only` oculta letras y cifras y sirve para inspeccionar estructura. **No constituye una muestra de lenguaje bancario para desarrollar un analizador.** Todavía no existen fixtures bancarios reales revisados en el repositorio. La fase permanece abierta hasta validar la captura real del piloto; otras fuentes pueden continuar identificadas como pendientes.

## Observación del piloto de crédito · Fase 6

El 21 de octubre se publicó la web y se actualizó la APK personal a **0.5.0 / 7**, conservando autorización, permiso, batería y las ocho fuentes seleccionadas. Se conservaron los seis eventos/recibos recibidos de cuatro fuentes; no constituyen seis compras verificadas. El único aviso BBVA disponible fue identificado explícitamente como una transferencia de débito y quedó descartado, con su evidencia conservada. Su prefijo se reconoce como ajeno al piloto de crédito y no aparece entre los formatos automatizables. No se incorporó una muestra ni un analizador activable de compra de crédito.

Presencial, en línea, Wallet, Amazon, Mercado Libre y suscripciones de crédito siguen pendientes de avisos revisados. El diagnóstico de las otras fuentes se mantiene y la automatización sigue desactivada en todas las tarjetas. La verificación técnica actual comprende 298 pruebas web, 18 JVM, 29 instrumentadas y dos comprobaciones de actualización, sin omisiones; los casos de compras son ficticios. El seguimiento por tarjeta/período está en Conciliar y no atribuye compras a avisos ausentes o ambiguos. [Plan Fase 6](../../PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-6-piloto-completo-con-bbva-platinum), [evidencia](../../artifacts/android-fase6/verification.json).

## Activación gradual · Fase 7

Reconsulta ADB del **21 de octubre de 2026**: ocho fuentes instaladas, permiso de notificaciones y batería exenta conservados en AFP personal **0.5.0 / 7**. Wallet pasó a `26.41.996630916` y Mercado Pago a `2.458.2`; las otras seis versiones siguen iguales. [Consulta técnica sin avisos ni identificadores del teléfono](../../artifacts/android-fase7/device.json).

El propietario confirmó que todavía no tiene avisos nuevos de compras de crédito. BBVA, HSBC 1/2, BANAMEX 1/2, SANTANDER, NU, DIDI y MERCADOPAGO siguen **sin muestras de compra verificadas ni analizadores activables**. Se reutilizan los 24 alias verificados de Fase 4, sin publicar cifras. Física/digital están configuradas en las nueve tarjetas; Wallet en BBVA, BANAMEX 1/2, SANTANDER, NU y DIDI. HSBC 1/2 y MERCADOPAGO conservan Wallet vacío por incompatibilidad declarada por el propietario.

Los canales presencial, en línea, parciales y suscripciones reales están pendientes **en cada tarjeta**; Wallet real sigue pendiente en las seis aplicables. La nueva vista de cobertura y los requisitos de activación están implementados en local: un analizador verificado y un alias no bastan, también se exige una propuesta propia del mismo formato en observación, revisada, registrada/vinculada y cotejada sin corregir sus datos interpretados. No se atribuye el canal ni la compra a partir de la aplicación instalada.

Hay 329 regresiones web correctas sin omisiones, con pruebas propias de las nueve tarjetas y seis Wallet mediante contratos ficticios del cargador aislado. No son fixtures reales de los emisores ni permiten habilitar los analizadores del producto. La pausa por fuente y vuelta a observación conservan datos; también se puede desactivar una configuración de formato retirado. [Guía, matriz por tarjeta y recuperación](../../docs/android-captura.md#activación-gradual-por-tarjeta--fase-7), [evidencia Fase 7](../../artifacts/android-fase7/verification.json). La fase permanece abierta; no se publicó esta implementación ni se modificó Supabase.
