# AFP Android · diagnóstico, vinculación y recepción segura

La Fase 1 añade una APK Kotlin/Compose en `android/`. Abre la interfaz financiera actual mediante Trusted Web Activity (TWA) y permite comprobar qué notificaciones entregan BBVA México, Google Wallet, HSBC, Banamex, Santander, Nu, DiDi Finanzas y Mercado Pago. La pantalla nativa incluye activación, selección de fuentes, estado del permiso y del lector, muestras locales e instrucciones para Samsung.

El diagnóstico está **pausado por defecto**. La Fase 2 añade vinculación independiente, cifrada y revocable, y recepción segura de eventos. El inicio de sesión web permanece en el navegador de la TWA; el componente nativo no lo lee. El lector continúa guardando únicamente muestras locales: su envío automático mediante Room/WorkManager corresponde a la Fase 3.

El plan se ajustó el 21 de octubre de 2026 para preparar el diagnóstico de todas las tarjetas desde la Fase 1 y conservar la activación automática gradual por tarjeta/formato, empezando por BBVA. La APK **0.1.2 / versionCode 3** amplió el diagnóstico a ocho paquetes verificados; posteriormente se actualizó a **0.2.0 / versionCode 4**, ya instalada y vinculada en el S24 Ultra. El inventario actual, leído mediante una transacción de solo lectura, contiene nueve tarjetas de siete emisores. La [matriz de fuentes](../android/diagnostics/format-matrix.md) relaciona esos nombres existentes con las aplicaciones y mantiene separados los paquetes verificados de los formatos aún sin muestras reales.

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

El texto original solo se revela expresamente dentro de la pantalla nativa, protegida contra capturas de pantalla. El diagnóstico no se escribe en Logcat, Git ni el servidor. Los eventos que un cliente autorizado entrega expresamente al endpoint de Fase 2 sí se persisten en el servidor; el lector de diagnóstico no los envía. La app excluye copias de seguridad y transferencia de datos; pausar conserva las muestras y borrarlas requiere confirmación. Eliminar datos o desinstalar la app elimina el diagnóstico local.

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

## Vinculación y recepción segura — Fase 2

Implementada y activada el **21 de octubre de 2026**, APK **0.2.0 / versionCode 4**. Ambas variantes compilan con las mismas firmas existentes. Las cuatro pruebas nuevas se ejecutaron en desarrollo, contra HTTPS y PostgreSQL locales, con cuenta y eventos ficticios; esas pruebas no modificaron Supabase. Posteriormente se aplicó la migración con autorización explícita, se actualizó la APK de producción del S24 Ultra conservando su permiso y muestras locales, y se completó la vinculación real desde la web y la confirmación nativa.

### Uso después de publicar la Fase 2

1. En la pantalla nativa, pulsa **Generar código de vinculación**. El teléfono genera y persiste 32 bytes aleatorios antes de contactar al servidor. Si pierde la respuesta, **Recuperar código** utiliza el mismo secreto.
2. Pulsa **Autorizar desde AFP**, o abre **Configuración → Captura automática** en otro navegador con tu sesión. Escribe los doce caracteres del código y confirma que corresponden a tu teléfono. El código vence a los cinco minutos; reintentarlo no prolonga su vigencia. Si la respuesta de autorización se pierde, actualiza la lista antes de intentar otro código.
3. Vuelve a la APK y pulsa **Consultar estado**. Mostrará autorizado, pendiente, vencido, pausado o revocado. Un código vencido o una identidad revocada permite generar otra identidad; se conserva el historial cifrado anterior con su propietario.
4. **Pausar recepción/Reanudar recepción** y **Desvincular teléfono** son acciones explícitas con conexión. La web permite las mismas acciones sobre tus dispositivos; revocar es irreversible para esa identidad. Cerrar la pantalla o salir de la sesión web conserva la autorización del teléfono.

La recepción permite conservar avisos, pero todavía no activa la captura sincronizada ni crea gastos. El diagnóstico y su selección de fuentes siguen siendo independientes. La configuración inicial del servidor es `OBSERVATION`, `automaticExpenses: false`; disponer de un paquete conocido nunca habilita una tarjeta ni un formato bancario.

### Contrato de API

| Endpoint | Autenticación | Función |
|---|---|---|
| `POST /api/captures/pairings` | Sin sesión; límites persistentes | `{secret, name}` → `{deviceId, code, expiresAt}`. Solo conserva los hashes. |
| `PATCH /api/captures/pairings` | Supabase Bearer | `{code}` autoriza una vez la identidad que inició el proceso. El usuario procede de la sesión. |
| `GET /api/captures/devices` | Supabase Bearer | Lista propia sin hashes ni credenciales. |
| `PATCH /api/captures/devices` | Supabase Bearer | `{deviceId, action: pause/resume/revoke}`; exige propietario. |
| `GET /api/captures/device` | `Capture <deviceId>.<secret>` | Estado propio, propietario original y configuración de captura; nunca datos financieros. Una identidad pendiente o revocada puede comprobar únicamente su propio estado/configuración. |
| `POST /api/captures/device` | La misma credencial | `{action: pause/resume}`, solo para la propia identidad autorizada. |
| `DELETE /api/captures/device` | La misma credencial | Revoca la propia identidad; repetir conserva la revocación. |
| `POST /api/captures/events` | Credencial autorizada y activa | Persiste el evento antes de devolver su recibo. |

El secreto tiene 256 bits, codificado en base64url sin relleno. El código temporal son doce caracteres hexadecimales derivados con un dominio distinto; el servidor guarda su hash y el hash del secreto, nunca la credencial en claro. La autorización consume el código y fija el propietario dentro de una transacción con bloqueo. Una segunda cuenta o una autorización tardía no puede apropiarse de la identidad. La credencial `Capture` no funciona como sesión Supabase y se rechaza en las API financieras.

Los límites son ventanas persistentes de cinco minutos: 120 inicios globales, 10 por origen de red, 10 autorizaciones por cuenta y 600 consultas/envíos por dispositivo autenticado. Un exceso devuelve 429 y `Retry-After`; la ventana no se amplía al reintentar. El límite global y los 48 bits del código mantienen protección aunque el origen de red no esté disponible. El cliente nativo ofrece reintento manual y no sigue redirecciones ni deshabilita TLS. Las respuestas usan `private, no-store` y `Vary: Authorization`.

El contrato de evento v1 admite estos campos, sin propietario o datos financieros añadidos por el cliente:

```json
{
  "contractVersion": 1,
  "eventId": "00000000-0000-4000-8000-000000000001",
  "sourcePackage": "com.bancomer.mbanking",
  "notificationKeyHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "postedAt": "2026-10-21T12:00:00Z",
  "receivedAt": "2026-10-21T12:00:01Z",
  "fields": { "android.title": "Ejemplo sintético", "android.text": "Aviso ficticio" }
}
```

Solo se admiten los ocho paquetes verificados; las fechas tienen zona explícita. `fields` usa los nombres estándar del diagnóstico: `android.title`, `android.text`, `android.bigText`, `android.subText`, `android.title.big`, `android.summaryText` y `android.textLines.0` a `.11`. Cada valor tiene un máximo de 4096 caracteres, con un límite total de petición de 128 KiB. El resto de operaciones recibe hasta 4096 bytes. Estos límites también se aplican cuando falta `Content-Length`.

La respuesta tiene `{event: {id, eventId, status: "RECEIVED", receivedAt}}`. `receivedAt` del recibo es la fecha de persistencia del servidor; se conservan aparte publicación y recepción del teléfono. El mismo dispositivo/UUID y contenido normalizado devuelve el recibo original; cambiar el contenido da 409. El orden de claves y las representaciones equivalentes de fecha no crean otro evento. No se deduplican compras diferentes por importe o comercio. Se autentica antes de leer texto y se vuelve a comprobar la autorización bajo el mismo bloqueo transaccional que pausa/revocación: pendiente, vencido y pausado reciben 403; revocado recibe 401 al enviar. No se confirma un evento si falla el commit.

`BindingStore` usa AES-GCM, una clave no exportable de Android Keystore, archivos atómicos en `noBackupFilesDir` y exclusión de backups/transferencia declarada en el manifest. Reabrir conserva identidad y propietario; una alteración del cifrado produce un error visible y no sobrescribe el archivo. Una nueva vinculación archiva la identidad anterior. La BD protege además el propietario autorizado con trigger y una relación compuesta dispositivo/usuario para los eventos. La futura cola Room deberá guardar el dispositivo y propietario originales por pendiente y nunca reutilizar la credencial de otra cuenta para enviarlos. Las muestras antiguas del diagnóstico no se convierten automáticamente en eventos de ninguna cuenta.

### Migración y activación

`20261021000000_add_android_capture_linking` añade cuatro tablas e índices, claves foráneas, RLS explícito sin políticas públicas y el trigger de propietario inmutable. Conserva tablas y registros financieros. Se verificaron las 18 migraciones desde cero y desde el historial anterior, checksums, diff vacío, datos históricos y RLS en 21 tablas incluyendo el historial.

**Migración aplicada a Supabase con autorización explícita el 21 de octubre de 2026, 07:10 UTC.** Antes se guardó un respaldo de todas las filas de `public` como texto JSON exacto de PostgreSQL, metadatos, permisos, funciones y triggers en `estados_cuenta/android_fase2_2026-10-21-lfHFCZ/`, excluido de Git y con permisos privados. La revisión confirmó que era la única migración pendiente y que el esquema coincidía con la versión anterior. Se ejecutó `prisma migrate deploy`, se regeneró Prisma y se verificaron 18 migraciones, checksums correctos, cero pendientes y diff vacío. Se conservaron los datos financieros e historial anterior, estructura, permisos, RLS y automatización existentes; las cuatro tablas nuevas quedaron vacías y con RLS sin políticas públicas. El respaldo se limita a AFP en `public`; no es un respaldo de Supabase Auth. [Evidencia de aplicación](../artifacts/android-fase2/produccion.json).

El MCP de Supabase estaba configurado pero requería renovar su autorización OAuth; se utilizó la conexión Prisma existente y se comprobó que correspondiera al mismo proyecto de AFP. La operación de migración no hizo commit, push ni despliegue; el usuario gestiona Git. La TWA y su firma conservan Digital Asset Links; no hace falta modificar ese archivo. Para repetir el procedimiento en otras instalaciones, revisar respaldo e historial y aplicar migraciones antes de publicar servidor/interfaz compatibles.

**Actualización y vinculación real concluidas posteriormente el 21 de octubre:** se instaló la APK firmada con `adb install -r android/app/build/outputs/apk/release/app-release.apk`, actualizando 0.1.2 a 0.2.0 sin desinstalar. Se conservaron la fecha inicial de instalación, el permiso de notificaciones y las cero muestras locales anteriores. Desde la sesión web existente en el teléfono se autorizó el código en Configuración; después la APK consultó el servidor y mostró «Teléfono autorizado para enviar eventos», también al reabrir la pantalla. La consulta de solo lectura a Supabase confirmó código consumido, autorización activa y fecha de consulta nativa, sin pausa ni revocación. El flujo autenticado en producción funciona; no se verificó el SHA exacto del despliegue. Esta activación creó la vinculación real del teléfono, sin enviar avisos bancarios ni crear gastos. [Evidencia sin credenciales](../artifacts/android-fase2/phone-activation.json). La sincronización y el registro financiero siguen pendientes de las Fases 3 y 4; el usuario hará commit y push de esta documentación.

### Verificación reproducible

- `pnpm test`: protocolos, rechazo de ámbitos de autorización y regresiones existentes. Sin `AFP_TEST_DATABASE_URL` omite las integraciones PostgreSQL.
- `AFP_TEST_DATABASE_URL=<PostgreSQL local afp_test…> pnpm test`: **234 pruebas correctas, sin omisiones**. Las pruebas de captura cubren dos cuentas, expiración, límites, vinculación concurrente, recibos concurrentes, rollback, respuesta perdida, pausa, cierre de sesión y revocación. Auth es ficticia, Prisma/PostgreSQL son reales.
- `AFP_MIGRATION_TEST_DATABASE_URL=<PostgreSQL local afp_test…> pnpm db:verify`: reconstrucción/actualización, permisos y todas las regresiones. No usar Supabase ni una base personal.
- `./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lint`: lógica Kotlin, compilaciones y lint. La entrega JVM se omite salvo que se configure el fixture HTTPS local.

Para repetir el recorrido HTTPS con el cliente Kotlin real, preparar un certificado de pruebas para `localhost` (SAN `DNS:localhost,IP:127.0.0.1`) y ejecutar desde la raíz:

```bash
AFP_TEST_DATABASE_URL=<PostgreSQL local afp_test…> \
AFP_CAPTURE_TEST_KEY=<clave TLS local> \
AFP_CAPTURE_TEST_CERTIFICATE=<certificado TLS local> \
node tests/helpers/capture-browser-server.cjs
```

El fixture se niega a usar una base remota o cuyo nombre no empiece por `afp_test`. Copia el código a un directorio temporal, no carga `.env`, sirve la interfaz/API reales en `127.0.0.1:4208` y HTTPS en `127.0.0.1:4209`, y simula Supabase Auth. Para entrar en la UI usa el correo ficticio `capture-qa@example.test` y cualquier contraseña de prueba; no usar datos personales. Los demás módulos se simulan para que no se consulten finanzas reales. Su certificado privado queda fuera del repositorio.

Desde `android/`, configurar `AFP_CAPTURE_TEST_ORIGIN=https://localhost:4209` y `AFP_CAPTURE_TEST_CERTIFICATE=<certificado TLS local>` al ejecutar `:app:testDebugUnitTest`. Se verificaron **14 pruebas JVM sin omisiones**, incluida vinculación, envío, recibo repetido, conflicto, pausa/reanudación y revocación contra HTTPS y PostgreSQL reales.

Para la instrumentación, usar un dispositivo de desarrollo sin datos propios en `com.garatachia.afp.dev`: Gradle instala y retira esa variante al terminar. No afecta `com.garatachia.afp`. En el dispositivo autorizado:

```bash
adb reverse tcp:4209 tcp:4209
adb push <certificado TLS local> /data/local/tmp/afp-capture-test.crt
cd android
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.garatachia.afp.BindingStoreTest,com.garatachia.afp.CaptureDeliveryTest \
  -Pandroid.testInstrumentationRunnerArguments.captureTestOrigin=https://localhost:4209 \
  -Pandroid.testInstrumentationRunnerArguments.captureTestCertificate=/data/local/tmp/afp-capture-test.crt
adb reverse --remove tcp:4209
```

**Cuatro instrumentadas nuevas correctas en el S24 Ultra, Android 16/API 36, el 21 de octubre.** Validan Keystore real, reapertura, rechazo de alteraciones, identidad/propietario archivados y el recorrido completo teléfono → HTTPS → API → PostgreSQL. Solo la conexión creada por la prueba confía en el certificado local; no se instala una CA en el teléfono ni se cambia la confianza de la APK. La prueba HTTPS se omite si no recibe origen/certificado locales. Las diez instrumentadas históricas de Fase 1 mantienen su evidencia anterior; no se contabilizan como repetidas aquí.

Durante la primera ejecución física, el servidor de desarrollo respondió 500 por un manifiesto JSON transitorio de Next mientras recompilaba. Se repitieron las cuatro pruebas con la compilación estable y todas pasaron. Los intentos de emulador no completaron el arranque; no se presentan como evidencia de ejecución. La APK de producción y su acceso a notificaciones se verificaron conservados después de las pruebas. [Evidencia agregada de Fase 2](../artifacts/android-fase2/verification.json).

Referencias: [Android Keystore](https://developer.android.com/privacy-and-security/keystore) y [consideraciones de seguridad de autorización por dispositivo](https://www.rfc-editor.org/rfc/rfc8628.html#section-5). AFP implementa su propio protocolo de vinculación; no declara compatibilidad OAuth Device Grant.
