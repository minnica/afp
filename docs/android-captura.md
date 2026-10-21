# AFP Android · diagnóstico de notificaciones

La Fase 1 añade una APK Kotlin/Compose en `android/`. Abre la interfaz financiera actual mediante Trusted Web Activity (TWA) y permite comprobar qué notificaciones entregan BBVA México, Google Wallet, HSBC, Banamex, Santander, Nu, DiDi Finanzas y Mercado Pago. La pantalla nativa incluye activación, selección de fuentes, estado del permiso y del lector, muestras locales e instrucciones para Samsung.

La captura está **pausada por defecto**. No hay vinculación con la cuenta ni peticiones de eventos al servidor en esta fase. El inicio de sesión de la web permanece en el navegador que proporciona la TWA.

El plan se ajustó el 21 de octubre de 2026 para preparar el diagnóstico de todas las tarjetas desde la Fase 1 y conservar la activación automática gradual por tarjeta/formato, empezando por BBVA. La APK **0.1.2 / versionCode 3** amplía el diagnóstico a ocho paquetes verificados y está instalada en el S24 Ultra. El inventario actual, leído mediante una transacción de solo lectura, contiene nueve tarjetas de siete emisores. La [matriz de fuentes](../android/diagnostics/format-matrix.md) relaciona esos nombres existentes con las aplicaciones y mantiene separados los paquetes verificados de los formatos aún sin muestras reales.

## Compilación y firma

Requisitos: un **JDK completo** 17 o superior compatible con Gradle 9.3.1 (compilador local: Temurin 21.0.12.1), Android SDK Platform 37 y Build Tools 36.0.0. Un JRE sin `javac` no basta. El `targetSdk` es 36 (Android 16) y el mínimo es 28. AGP 9.1.1 incorpora Kotlin 2.2.10; el plugin de Compose usa esa misma versión. Las dependencias tienen versiones fijadas.

1. Abre `android/` en Android Studio o configura `ANDROID_HOME`/`android/local.properties` con la ruta del SDK. Este último archivo es privado.
2. Ejecuta desde la raíz del repositorio:

   ```bash
   python3 android/scripts/init-signing.py
   cd android
   ./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lint
   ```

El generador necesita `keytool`. Crea dos identidades con contraseñas aleatorias en `android/.private/` y `android/signing.properties`, excluidas de Git y con permisos locales restringidos. Se niega a reemplazar firmas o configuración existentes. Si falla durante la generación, conserva lo creado para su recuperación; no vuelvas a generar ni reemplaces una identidad ya distribuida.

**Respalda ambos archivos de claves y `signing.properties` en almacenamiento privado antes de distribuir la APK.** Las actualizaciones deben usar la misma identidad y aumentar `versionCode`. Las huellas públicas pueden compartirse; las claves y contraseñas no.

| Variante | ID | Archivo generado |
|---|---|---|
| Desarrollo (`debug`) | `com.garatachia.afp.dev` | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Producción (`release`) | `com.garatachia.afp` | `android/app/build/outputs/apk/release/app-release.apk` |

Ambas usan firma propia y pueden instalarse simultáneamente. Sus permisos, configuración y muestras son independientes. La variante de producción también permanece en modo diagnóstico; el nombre de variante no activa registros automáticos. Sus APK y archivos de compilación no se versionan.

El wrapper oficial se incluye con el SHA-256 de la distribución. `GRADLE_USER_HOME` puede apuntar a un directorio temporal para aislar las descargas. No es necesario instalar Gradle globalmente.

## Digital Asset Links y TWA

La APK declara `https://finanzas.garatachia.com` como origen confiable y abre `/dashboard`. El navegador comprueba también la relación inversa mediante `https://finanzas.garatachia.com/.well-known/assetlinks.json`.

`public/.well-known/assetlinks.json` contiene únicamente el paquete de **producción** y el SHA-256 público de su certificado. Se generó a partir de la identidad local, sin claves de ejemplo ni huellas de desarrollo. Antes de distribuir o cambiar la firma, contrasta la APK real:

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs android/app/build/outputs/apk/release/app-release.apk
node scripts/android-assetlinks.cjs generate <SHA256-publico>
node scripts/android-assetlinks.cjs check <SHA256-publico>
```

`generate` rechaza reemplazar un archivo que declare otra identidad. `check` consulta el dominio por HTTPS, sin seguir redirecciones, y exige JSON público con paquete, relación y certificado correctos. Un resultado correcto valida el archivo publicado; el cierre de TWA requiere además abrir AFP en el teléfono y comprobar que desaparece la barra del navegador.

El archivo se publicó con autorización el 20 de octubre de 2026: responde HTTP 200 como JSON público por HTTPS, sin redirecciones, y declara el certificado esperado. `pm verify-app-links --re-verify com.garatachia.afp` seguido de `pm get-app-links com.garatachia.afp` confirmó el dominio como `verified` en el S24 Ultra. La APK 0.1.1 abre AFP con Chrome `141.0.7390.43` sin barra de direcciones, comprobado en el teléfono y confirmado por el usuario. La variante de desarrollo no tiene confianza declarada en producción y puede abrir como Custom Tab. No se deshabilita la comprobación de origen para simular una TWA verificada. Futuras publicaciones en Vercel requieren la autorización de producción indicada en el README.

El manifest declara también `ManageDataLauncherActivity` y `FocusActivity` como actividades internas, siguiendo el [ejemplo oficial de Browser Helper](https://github.com/GoogleChrome/android-browser-helper/blob/main/demos/twa-basic/src/main/AndroidManifest.xml). La omisión de la primera cerraba la APK 0.1.0 al pulsar «Abrir AFP»; se corrigió en 0.1.1, aumentando `versionCode` a 2 y conservando la firma. Una regresión instrumentada comprueba la gestión del componente por la biblioteca. Tras actualizar se verificaron el permiso de lectura y la presencia del servicio de captura. En 0.1.2 se añadió `NEW_TASK | CLEAR_TOP` al botón «Abrir AFP»: evita que el relanzamiento interno de Browser Helper o la reutilización de una tarea deje el diagnóstico al frente. La regresión de navegación reprodujo el fallo anterior y valida dos aperturas sucesivas mediante el botón, incluyendo el regreso al diagnóstico con una TWA existente. Además se repitió ese flujo en la APK final de producción instalada y Chrome mostró AFP sin barra del navegador en ambas aperturas.

## Activación en el S24 Ultra

1. Conecta el teléfono con un cable de datos. Selecciona **Transferir archivos/Android Auto**, activa **Depuración USB** y autoriza la computadora. `adb devices -l` debe mostrar un dispositivo autorizado.
2. Instala la variante elegida con `adb install -r <ruta-APK>`. Abre AFP desde el teléfono.
3. Pulsa **Configurar acceso a notificaciones** y concede acceso a AFP. Este es un permiso especial para leer notificaciones, distinto de `POST_NOTIFICATIONS`; esta fase no solicita ni publica notificaciones propias.
4. Si Android restringe una APK instalada externamente, revisa **Ajustes → Aplicaciones → AFP → ⋮ → Permitir ajustes restringidos**, cuando esté disponible, y confirma con PIN/huella. Vuelve después al acceso a notificaciones. Es el procedimiento de la [ayuda de Android](https://support.google.com/android/answer/12623953?hl=es-419). El permiso se concede manualmente; la APK no lo elude. Si usas desarrollo, el nombre de la aplicación es **AFP Diagnóstico dev**.
5. Revisa las fuentes instaladas, selecciona cada una o pulsa **Seleccionar todas las instaladas** y activa **Guardar muestras de diagnóstico**. Una actualización conserva la selección anterior, incluso vacía; las nuevas fuentes permanecen desactivadas hasta seleccionarlas. Las aplicaciones ausentes no pueden activarse y las seleccionadas que se desinstalen pueden desactivarse. La pantalla distingue diagnóstico pausado, permiso ausente, lector desconectado y lector conectado. Al volver de Ajustes vuelve a comprobar el permiso; ofrece reconexión cuando corresponde.
6. Pulsa **Abrir AFP** e inicia sesión en la web si hace falta. Salir de esa pantalla no pausa un diagnóstico que hayas activado; la pausa es explícita desde la pantalla nativa.

Paquetes consultados en las fichas oficiales de Google Play:

- BBVA México: [`com.bancomer.mbanking`](https://play.google.com/store/apps/details?id=com.bancomer.mbanking).
- Google Wallet: [`com.google.android.apps.walletnfcrel`](https://play.google.com/store/apps/details?id=com.google.android.apps.walletnfcrel).
- HSBC México: [`mx.hsbc.hsbcmexico`](https://play.google.com/store/apps/details?id=mx.hsbc.hsbcmexico).
- Banamex: [`com.citibanamex.banamexmobile`](https://play.google.com/store/apps/details?id=com.citibanamex.banamexmobile).
- Santander México: [`mx.bancosantander.supermovil`](https://play.google.com/store/apps/details?id=mx.bancosantander.supermovil).
- Nu: [`com.nu.production`](https://play.google.com/store/apps/details?id=com.nu.production).
- DiDi Finanzas, que incluye DiDi Card: [`com.didiglobal.cashloan`](https://play.google.com/store/apps/details?id=com.didiglobal.cashloan).
- Mercado Pago: [`com.mercadopago.wallet`](https://play.google.com/store/apps/details?id=com.mercadopago.wallet).

La pantalla comprueba su instalación y muestra la versión en el perfil actual. La identificación por ficha oficial no acredita su instalación ni sus formatos en el teléfono. Tampoco garantiza que una aplicación emita un aviso por cada compra.

`python3 android/scripts/check-device.py --adb "$ANDROID_HOME/platform-tools/adb"` comprueba modelo, versión de Android/One UI y versiones instaladas de los paquetes declarados en el manifest, permiso especial y estado de batería de AFP, sin leer notificaciones ni incluir el número de serie en el informe. `--application-id com.garatachia.afp.dev` permite comprobar la variante de desarrollo. El script no certifica las listas de suspensión de Samsung: se revisan por separado en Ajustes. Acepta `--serial` si hay varios dispositivos.

## Samsung, bloqueo y límites de captura

Las instrucciones están incluidas en la pantalla nativa de AFP:

- **Ajustes → Aplicaciones → AFP → Batería → No restringido**, nombre comprobado en el S24 Ultra con One UI 8.5; otras versiones lo llaman Sin restricciones.
- **Batería → Límites de uso en segundo plano**: retirar AFP de aplicaciones suspendidas/en suspensión profunda y revisar **Aplicaciones sin autosuspensión** cuando One UI lo permita. Una aplicación ya exenta de optimización puede no aparecer como candidata para añadirla.
- Activar el diagnóstico, bloquear el teléfono, esperar un aviso real admitido y comprobar después la muestra marcada **Recibido con pantalla bloqueada**.
- Repetir tras revocar/restaurar el permiso y, posteriormente, tras reiniciar. Un cierre forzado o una restricción del sistema puede impedir capturas; el estado al reabrir no demuestra que se hayan recibido avisos durante ese intervalo.

Las rutas varían entre versiones de One UI; las instrucciones se basan en la [gestión de aplicaciones documentada por Samsung](https://developer.samsung.com/mobile/app-management.html). La ruta de Batería y sus opciones se contrastaron con el S24 Ultra el 21 de octubre: se aplicó **No restringido** y Android confirmó la exención de optimización, standby bucket `5` (exento) y permiso de ejecución en segundo plano `allow`. En **Ajustes → Batería → Límites de uso en segundo plano**, la lista de aplicaciones suspendidas estaba vacía, AFP no apareció al recorrer toda la lista de suspensión profunda y la lista sin autosuspensión estaba vacía. No se modificaron ajustes de otras apps ni el ahorro global. La pantalla nativa consulta exención, restricción en segundo plano y ahorro de energía al volver del sistema; esos estados no acreditan entrega real de avisos ni reemplazan la revisión de las listas Samsung. Android puede ocultar [contenido sensible](https://developer.android.com/about/versions/15/behavior-changes-all#otp-redaction). AFP conserva los campos accesibles sin inventar los ausentes y presenta las muestras sin texto como tales.

El lector solo examina publicaciones nuevas de los paquetes seleccionados del catálogo verificado; descarta resúmenes agrupados antes de leer el texto. No consulta el historial ni recorre notificaciones activas al conectarse. Las actualizaciones de una notificación son muestras separadas, identificables por el hash de su clave, y no se interpretan como nuevas compras. La exclusión semántica de promociones y códigos corresponde a fases posteriores; en esta fase una muestra nunca produce un movimiento financiero.

## Muestras y privacidad

El búfer conserva como máximo las **100 muestras más recientes** en `noBackupFilesDir`. Se cifra con AES-GCM y una clave no exportable de Android Keystore, con escrituras atómicas. La cola de operaciones del proceso serializa cargas, capturas y limpieza. Un fallo de lectura, cifrado o persistencia se muestra en pantalla y no reemplaza silenciosamente un archivo ilegible. Este búfer no constituye todavía una cola de sincronización ni garantiza recuperación de eventos durante un fallo.

Las muestras incluyen paquete, UUID, hash de clave de notificación, publicación, recepción, `Notification.when`, bloqueo y campos de texto estándar disponibles: título, texto, texto ampliado, subtítulo, resumen y líneas. `Notification.when` es un valor de presentación de Android: **no se asume que sea la fecha de operación bancaria**. Cada campo se limita a 4096 caracteres y las líneas a doce. Las fechas visibles usan `America/Mexico_City`.

El texto original solo se revela expresamente dentro de la pantalla nativa, protegida contra capturas de pantalla. No se escribe en Logcat, Git ni el servidor. La app excluye copias de seguridad y transferencia de datos; pausar conserva las muestras y borrarlas requiere confirmación. Eliminar datos o desinstalar la app elimina el diagnóstico local.

**Exportar estructura anonimizada** usa el selector de documentos de Android. Sustituye letras por `x`, cifras por `0` y símbolos no admitidos por `·`; omite fechas, UUID y claves. Conserva paquete, nombres de campos, disponibilidad de texto y bloqueo. La exportación se identifica como `anonymous-shape-only` y `realFormatVerified: false`: permite inspeccionar estructura, pero no sustituye una muestra de lenguaje bancario revisada para desarrollar analizadores. No existe exportación del texto original en esta fase.

La [matriz de formatos](../android/diagnostics/format-matrix.md) separa evidencia documental, pruebas sintéticas y observaciones reales. Antes de cerrar la fase deben anotarse los campos disponibles en cada fuente y preparar ejemplos anonimizados revisados que preserven el lenguaje necesario, sin copiar datos bancarios personales al repositorio.

## Verificación

```bash
cd android
./gradlew :app:testDebugUnitTest :app:lint :app:assembleDebug :app:assembleRelease
./gradlew :app:connectedDebugAndroidTest
```

Las **nueve pruebas unitarias** verifican los ocho paquetes, selección individual, migración sin activar fuentes nuevas, selección vacía, pausa, resúmenes agrupados y ocultación Unicode. Las **diez pruebas instrumentadas**, correctas en el S24 Ultra el 21 de octubre, comprueban la persistencia real de preferencias y la extracción/persistencia separada de las ocho identidades, además de los metadatos y actividades auxiliares TWA, el permiso del servicio en el manifest instalado, extracción de notificaciones sintéticas, persistencia cifrada/reapertura/borrado, límite de 100 muestras, rechazo de alteraciones y exportación sin identidad. La regresión de navegación usa accesibilidad para pulsar realmente «Abrir AFP» dos veces, volviendo al diagnóstico y conservando la TWA existente. Requiere el proveedor Chrome instalado y predeterminado, como en el S24 Ultra; debug puede mostrar una Custom Tab con barra porque su firma no está autorizada en producción. Las pruebas no generan compras reales ni conceden permisos automáticamente.

Las pruebas instrumentadas de Gradle instalan y retiran sus paquetes al terminar. Para continuar el diagnóstico manual, instala después la APK deseada y concede su permiso especial. Las variantes usan identidades distintas: autorizar desarrollo no autoriza producción. El 20 de octubre se verificaron seis pruebas unitarias y siete instrumentadas en el S24 Ultra, y se preparó la APK `release` para continuar las pruebas manuales como **AFP**.

Desde la raíz, `node --test tests/android-assetlinks.test.cjs tests/android-sources.test.cjs` verifica Digital Asset Links y la coincidencia exacta entre fuentes del lector y paquetes visibles del manifest; prohíbe `QUERY_ALL_PACKAGES`. Tres casos correctos el 21 de octubre. `pnpm test` incluye estas regresiones. Lint y build web deben seguir pasando. Los resultados y las comprobaciones físicas pendientes se registran en [el plan](../PLAN_CAPTURA_AUTOMATICA_ANDROID.md) y la [evidencia de ocho fuentes](../artifacts/android-fase1/multi-source-verification.json). La evidencia inicial y el despliegue web de 0.1.1 se conservan como historial; esta actualización no requiere desplegar de nuevo la web.

Fuentes técnicas: [TWA](https://developer.chrome.com/docs/android/trusted-web-activity/), [Android Browser Helper](https://github.com/GoogleChrome/android-browser-helper), [NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService), [compatibilidad de AGP 9.1.1](https://developer.android.com/build/releases/agp-9-1-0-release-notes) y [Kotlin incorporado](https://developer.android.com/build/migrate-to-built-in-kotlin).
