# Matriz de fuentes y formatos · Fase 1

Actualización: **21 de octubre de 2026**. Inventario vigente contrastado mediante una transacción PostgreSQL **READ ONLY**, limitada a los nombres de tarjetas del único propietario de AFP. Resultado: **9 tarjetas, 7 emisores y 8 aplicaciones de diagnóstico incluyendo Wallet**. No se consultaron movimientos ni se modificaron registros. Los nombres siguientes son los existentes; no se renombraron tarjetas ni se dedujo su producto comercial.

## Inventario y aplicaciones verificadas

Todas las aplicaciones de esta tabla están instaladas en el perfil actual del S24 Ultra. Sus identificadores se contrastaron con sus fichas oficiales y sus versiones mediante ADB. La APK **0.1.2 / versionCode 3** admite las ocho fuentes. Que una aplicación esté instalada y admitida no acredita que emita avisos de compra accesibles.

| Fuente / ficha oficial | Paquete | Versión instalada | Tarjetas actuales de AFP / alcance | Formato real |
|---|---|---|---|---|
| [BBVA México](https://play.google.com/store/apps/details?id=com.bancomer.mbanking) | `com.bancomer.mbanking` | `26.90.14` | BBVA | Pendiente de muestra |
| [Google Wallet](https://play.google.com/store/apps/details?id=com.google.android.apps.walletnfcrel) | `com.google.android.apps.walletnfcrel` | `26.40.996156910` | Tarjetas inscritas en Wallet por identificar; no se presupone que sean las nueve | Pendiente de muestra |
| [HSBC México](https://play.google.com/store/apps/details?id=mx.hsbc.hsbcmexico) | `mx.hsbc.hsbcmexico` | `3.75.14` | HSBC 1 y HSBC 2 | Pendiente; distinguir ambas |
| [Banamex](https://play.google.com/store/apps/details?id=com.citibanamex.banamexmobile) | `com.citibanamex.banamexmobile` | `136.0.0` | BANAMEX 1 y BANAMEX 2 | Pendiente; distinguir ambas |
| [Santander México](https://play.google.com/store/apps/details?id=mx.bancosantander.supermovil) | `mx.bancosantander.supermovil` | `12.2` | SANTANDER | Pendiente de muestra |
| [Nu](https://play.google.com/store/apps/details?id=com.nu.production) | `com.nu.production` | `10.8.43-minApi28` | NU | Pendiente de muestra |
| [DiDi Finanzas](https://play.google.com/store/apps/details?id=com.didiglobal.cashloan) | `com.didiglobal.cashloan` | `3.2.2` | DIDI | Pendiente de muestra |
| [Mercado Pago](https://play.google.com/store/apps/details?id=com.mercadopago.wallet) | `com.mercadopago.wallet` | `2.457.2` | MERCADOPAGO | Pendiente de muestra |

No faltan aplicaciones de los siete emisores inventariados. La app DiDi de viajes (`com.didiglobal.passenger`, también instalada) queda fuera de la lista de captura: se verificó DiDi Finanzas como aplicación dedicada que incluye DiDi Card. Si se observa un aviso de tarjeta emitido por otra app de DiDi, deberá verificarse e incorporarse explícitamente; no se afirma que sea imposible. Mercado Pago también puede emitir avisos ajenos a su tarjeta: su identidad no bastará para registrar una compra.

Las fuentes añadidas no se activan al actualizar la APK. Se conserva la selección anterior, incluida una selección vacía; se ignoran paquetes desconocidos almacenados. Cada fuente tiene su interruptor y contador. «Seleccionar todas las instaladas» aplica una selección explícita; no añade paquetes al catálogo ni habilita escrituras financieras. Las consultas de visibilidad del manifest y el lector tienen exactamente la misma lista, comprobada por una regresión.

## Campos y resolución por tarjeta

| Fuente | Importe | Moneda | Comercio | Fecha de operación | Identidad de tarjeta | Referencia |
|---|---|---|---|---|---|---|
| BBVA | Sin observar | Sin observar | Sin observar | Sin observar | Alias físico/digital pendientes | Sin observar |
| Wallet | Sin observar | Sin observar | Sin observar | Sin observar | Token y banco pendientes; no equivale a terminación física | Sin observar |
| HSBC | Sin observar | Sin observar | Sin observar | Sin observar | HSBC 1 / HSBC 2 sin resolver | Sin observar |
| Banamex | Sin observar | Sin observar | Sin observar | Sin observar | BANAMEX 1 / BANAMEX 2 sin resolver | Sin observar |
| Santander | Sin observar | Sin observar | Sin observar | Sin observar | Alias pendiente | Sin observar |
| Nu | Sin observar | Sin observar | Sin observar | Sin observar | Alias pendiente | Sin observar |
| DiDi Finanzas | Sin observar | Sin observar | Sin observar | Sin observar | Alias pendiente | Sin observar |
| Mercado Pago | Sin observar | Sin observar | Sin observar | Sin observar | Tarjeta frente a cuenta/saldo pendiente | Sin observar |

«Sin observar» significa que falta una notificación real revisada; no significa que el campo esté ausente. Para cada muestra, registrar **presente, ausente o ambiguo** solo después de revisar el contenido en el teléfono. Las fechas de publicación, recepción y `Notification.when` no sustituyen la fecha de la operación. Conocer el emisor no permite elegir entre dos tarjetas del mismo banco. Las identidades y alias se vincularán en la Fase 4 con los registros existentes; este inventario no crea vinculaciones financieras.

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
