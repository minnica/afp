# AFP Android · diagnóstico, vinculación y sincronización

La Fase 1 añade una APK Kotlin/Compose en `android/`. Abre la interfaz financiera actual mediante Trusted Web Activity (TWA) y permite comprobar qué notificaciones entregan BBVA México, Google Wallet, HSBC, Banamex, Santander, Nu, DiDi Finanzas y Mercado Pago. La pantalla nativa incluye activación, selección de fuentes, estado del permiso y del lector, muestras locales e instrucciones para Samsung.

El diagnóstico está **pausado por defecto**. La Fase 2 añade vinculación independiente, cifrada y revocable, y recepción segura de eventos. El inicio de sesión web permanece en el navegador de la TWA; el componente nativo no lo lee. La Fase 3 añade la cola Room cifrada y el envío automático mediante WorkManager para los avisos recibidos con una identidad autorizada. La Fase 4 incorpora el motor de interpretación/registro y la revisión básica; los formatos reales siguen bloqueados por falta de muestras verificadas.

El plan se ajustó el 21 de octubre de 2026 para preparar el diagnóstico de todas las tarjetas desde la Fase 1 y conservar la activación automática gradual por tarjeta/formato, empezando por BBVA. La APK **0.1.2 / versionCode 3** amplió el diagnóstico a ocho paquetes verificados; posteriormente se actualizó a **0.2.0 / versionCode 4**, vinculada en el S24 Ultra; la Fase 3 actualiza la APK a **0.3.0 / versionCode 5**. El inventario actual, leído mediante una transacción de solo lectura, contiene nueve tarjetas de siete emisores. La [matriz de fuentes](../android/diagnostics/format-matrix.md) relaciona esos nombres existentes con las aplicaciones y mantiene separados los paquetes verificados de los formatos aún sin muestras reales.

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

Ambas usan firma propia y pueden instalarse simultáneamente. Sus permisos, configuración y muestras son independientes. La variante de producción también permanece sin creación automática de gastos; el nombre de variante no activa registros automáticos. Sus APK y archivos de compilación no se versionan.

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

El lector examina publicaciones nuevas y, al conectarse, las notificaciones todavía activas de los paquetes seleccionados. Descarta resúmenes agrupados y categoría promocional antes de extraer el texto; aplica después filtros explícitos de promociones y códigos de acceso. Un formato desconocido se conserva para revisión posterior. No consulta un historial completo ni recupera avisos desaparecidos. Una publicación idéntica conserva su identidad en la cola; una actualización diferente no se interpreta por sí sola como una compra nueva.

## Muestras y privacidad

El búfer conserva como máximo las **100 muestras más recientes** en `noBackupFilesDir`. Se cifra con AES-GCM y una clave no exportable de Android Keystore, con escrituras atómicas. La cola de operaciones del proceso serializa cargas, capturas y limpieza. Un fallo de lectura, cifrado o persistencia se muestra en pantalla y no reemplaza silenciosamente un archivo ilegible. Este búfer es independiente de la cola Room de Fase 3. Su límite y su borrado no afectan a pendientes ni a recibos de entrega. Un fallo anterior al commit de Room no garantiza captura, y se indica en pantalla.

Las muestras incluyen paquete, UUID, hash de clave de notificación, publicación, recepción, `Notification.when`, bloqueo y campos de texto estándar disponibles: título, texto, texto ampliado, subtítulo, resumen y líneas. `Notification.when` es un valor de presentación de Android: **no se asume que sea la fecha de operación bancaria**. Cada campo se limita a 4096 caracteres y las líneas a doce. Las fechas visibles usan `America/Mexico_City`.

El texto original solo se revela expresamente dentro de la pantalla nativa, protegida contra capturas de pantalla. El diagnóstico no se escribe en Logcat ni Git. Desde la Fase 3, un aviso nuevo admitido y asociado a una identidad autorizada se guarda también en la cola Room y se entrega al servidor mediante HTTPS. La exportación del diagnóstico sigue siendo local y anonimizada. La app excluye copias de seguridad y transferencia de datos; pausar conserva las muestras y borrarlas requiere confirmación. Eliminar datos o desinstalar la app elimina el diagnóstico local.

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

La Fase 2 habilitó la recepción; la Fase 3 conecta el lector a la cola y sincronización. Todavía no crea gastos. El diagnóstico y su selección de fuentes siguen siendo independientes. La configuración inicial del servidor es `OBSERVATION`, `automaticExpenses: false`; disponer de un paquete conocido nunca habilita una tarjeta ni un formato bancario.

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

`BindingStore` usa AES-GCM, una clave no exportable de Android Keystore, archivos atómicos en `noBackupFilesDir` y exclusión de backups/transferencia declarada en el manifest. Reabrir conserva identidad y propietario; una alteración del cifrado produce un error visible y no sobrescribe el archivo. Una nueva vinculación archiva la identidad anterior. La BD protege además el propietario autorizado con trigger y una relación compuesta dispositivo/usuario para los eventos. La cola Room de Fase 3 guarda el dispositivo y propietario originales por pendiente y nunca reutiliza la credencial de otra cuenta para enviarlos. Las muestras antiguas del diagnóstico no se convierten automáticamente en eventos de ninguna cuenta.

### Migración y activación

`20261021000000_add_android_capture_linking` añade cuatro tablas e índices, claves foráneas, RLS explícito sin políticas públicas y el trigger de propietario inmutable. Conserva tablas y registros financieros. Se verificaron las 18 migraciones desde cero y desde el historial anterior, checksums, diff vacío, datos históricos y RLS en 21 tablas incluyendo el historial.

**Migración aplicada a Supabase con autorización explícita el 21 de octubre de 2026, 07:10 UTC.** Antes se guardó un respaldo de todas las filas de `public` como texto JSON exacto de PostgreSQL, metadatos, permisos, funciones y triggers en `estados_cuenta/android_fase2_2026-10-21-lfHFCZ/`, excluido de Git y con permisos privados. La revisión confirmó que era la única migración pendiente y que el esquema coincidía con la versión anterior. Se ejecutó `prisma migrate deploy`, se regeneró Prisma y se verificaron 18 migraciones, checksums correctos, cero pendientes y diff vacío. Se conservaron los datos financieros e historial anterior, estructura, permisos, RLS y automatización existentes; las cuatro tablas nuevas quedaron vacías y con RLS sin políticas públicas. El respaldo se limita a AFP en `public`; no es un respaldo de Supabase Auth. [Evidencia de aplicación](../artifacts/android-fase2/produccion.json).

El MCP de Supabase estaba configurado pero requería renovar su autorización OAuth; se utilizó la conexión Prisma existente y se comprobó que correspondiera al mismo proyecto de AFP. La operación de migración no hizo commit, push ni despliegue; el usuario gestiona Git. La TWA y su firma conservan Digital Asset Links; no hace falta modificar ese archivo. Para repetir el procedimiento en otras instalaciones, revisar respaldo e historial y aplicar migraciones antes de publicar servidor/interfaz compatibles.

**Actualización y vinculación real concluidas posteriormente el 21 de octubre:** se instaló la APK firmada con `adb install -r android/app/build/outputs/apk/release/app-release.apk`, actualizando 0.1.2 a 0.2.0 sin desinstalar. Se conservaron la fecha inicial de instalación, el permiso de notificaciones y las cero muestras locales anteriores. Desde la sesión web existente en el teléfono se autorizó el código en Configuración; después la APK consultó el servidor y mostró «Teléfono autorizado para enviar eventos», también al reabrir la pantalla. La consulta de solo lectura a Supabase confirmó código consumido, autorización activa y fecha de consulta nativa, sin pausa ni revocación. El flujo autenticado en producción funciona; no se verificó el SHA exacto del despliegue. Esta activación creó la vinculación real del teléfono, sin enviar avisos bancarios ni crear gastos. [Evidencia sin credenciales](../artifacts/android-fase2/phone-activation.json). Ese cierre de Fase 2 precedió a la sincronización de Fase 3; el registro financiero sigue pendiente de Fase 4; el usuario hará commit y push de esta documentación.

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

## Cola local y sincronización — Fase 3

Implementación del **21 de octubre de 2026**, APK **0.3.0 / versionCode 5**, con las firmas existentes. Room **2.8.5**, KSP **2.3.12** y WorkManager **2.12.0**, fijados en Gradle. El esquema local está en `android/app/schemas/com.garatachia.afp.CaptureQueueDatabase/1.json`. No requiere migraciones de Supabase, nuevos endpoints ni publicar la web.

### Captura y propiedad

Con **Guardar avisos y diagnóstico** activo y una fuente seleccionada, el lector descarta resúmenes agrupados y notificaciones clasificadas como promociones por Android. Después excluye patrones explícitos de códigos de acceso, verificación, OTP y promociones. Las reglas se prueban con ejemplos sintéticos; todavía no acreditan cobertura de formatos bancarios reales. Los textos desconocidos, ocultos o vacíos se conservan para revisión posterior, sin inventar campos ni crear gastos.

Si existe una identidad con propietario autorizado, el aviso se guarda en Room antes de programar su entrega, incluso si la recepción del dispositivo o los envíos locales están pausados. Se fija la identidad al recibir el aviso, antes de esperar otras escrituras. Cada fila conserva dispositivo, propietario, UUID, huella de publicación/contenido, fechas y cuerpo cifrado. Nunca se sustituye el propietario al revincular. Sin propietario autorizado, solo se conserva diagnóstico local; las muestras anteriores no se convierten automáticamente en eventos de una cuenta nueva.

Al conectar/reconectar el lector se revisan exclusivamente las notificaciones todavía activas que pasan los mismos filtros. La huella combina paquete, hash de clave Android, publicación y campos ordenados. Volver a encontrar la misma publicación/contenido devuelve la fila y UUID originales, también después de su entrega. Si cambia el contenido o la publicación, se conserva otro evento: la interpretación de revisiones y la vinculación entre canales corresponden a la Fase 4. No se utiliza importe/comercio/fecha como clave única de una compra.

### Cifrado y conservación

Room guarda `capture-queue.db` y sus archivos WAL/SHM en `noBackupFilesDir`. El cuerpo usa AES-GCM con clave no exportable de Android Keystore y datos autenticados que incluyen UUID, dispositivo, propietario y huella. Alterar el cifrado o trasladarlo a otra identidad impide descifrarlo. El aviso permanece **Por revisar**; no se sobrescribe ni se reintenta automáticamente. `BindingStore` comparte un bloqueo entre instancias para que UI, lector y worker no compitan por el archivo de credenciales.

El manifest mantiene `allowBackup=false`, `fullBackupContent=false` y exclusiones explícitas de backup y transferencia, incluidas bases y preferencias. WorkManager no recibe textos ni credenciales en su `Data`; únicamente persiste la programación. No se escriben contenidos ni credenciales en Logcat.

Los pendientes no tienen el límite de 100 del diagnóstico ni una caducidad automática. Después de recibir un recibo válido se borra el cuerpo cifrado de esa fila y se conserva su identidad/huella como comprobante local para impedir reencolar avisos activos ya entregados. El diagnóstico conserva independientemente sus 100 muestras recientes. **Borrar muestras locales** no elimina pendientes ni recibos de la cola. Borrar datos o desinstalar sí elimina la cola; conservar la instalación al actualizar con `adb install -r`.

### Entrega y recuperación

`CaptureSyncWorker` usa `NetworkType.CONNECTED`, reintentos exponenciales desde 30 segundos y trabajo único. `APPEND_OR_REPLACE` evita perder una captura que llega justo al finalizar un lote. El reintento manual reemplaza la programación pendiente; un mutex impide dos drenajes simultáneos en el proceso. Los lotes están acotados a 100 filas elegibles; las identidades bloqueadas no impiden entregar avisos de otra identidad.

La app vuelve a programar al iniciar y mantiene un trabajo periódico de recuperación cada 15 minutos para cubrir una muerte entre el commit de Room y `enqueue`. WorkManager restaura sus trabajos tras reinicios, después del desbloqueo cuando Android lo requiere. Los tiempos son mínimos sujetos a conectividad, batería y restricciones del sistema; no se promete entrega inmediata.

| Resultado | Comportamiento |
|---|---|
| Recibo con el UUID original, `RECEIVED`, ID y fecha válidos | Marca entregado y retira el cuerpo de la cola. |
| Respuesta perdida, timeout, red interrumpida, JSON/recibo incompleto, 408, 425 o 5xx | Conserva cuerpo y UUID; reintento progresivo. |
| 429 | Conserva el aviso, respeta `Retry-After` en segundos o fecha HTTP y detiene ese lote. |
| 401/403 | Bloquea los envíos de esa identidad, conservando todos sus pendientes. |
| Otros 4xx, incluido conflicto 409 | Deja el aviso por revisar y muestra un error sin texto interno del servidor. |
| Cifrado alterado | Conserva los bytes y muestra revisión; reintentar no sobrescribe ni envía el aviso. |

El envío usa exclusivamente la credencial de la identidad original si sigue activa. **Consultar estado** o **Reanudar recepción**, tras confirmar `ACTIVE`, levanta el bloqueo de esa misma identidad. **Reintentar pendientes y errores** reprograma temporales y permite otro intento de los rechazos permanentes recuperables; no cambia cuentas, no restablece autorizaciones y no adelanta `Retry-After`. Un evento de una identidad revocada permanece separado aunque se vincule otra cuenta.

### Pantalla nativa

**Envío de avisos** muestra pendientes, por revisar, entregados, último envío confirmado, errores y referencias/fechas de avisos rechazados. Las fechas usan `America/Mexico_City`. Ofrece **Pausar envíos/Reanudar envíos** sin conexión, con preferencia persistente, y **Reintentar pendientes y errores**. La pausa de envíos conserva nuevas capturas; desactivar **Guardar avisos y diagnóstico** detiene la captura. Pausar/reanudar recepción desde la sección de vinculación sigue siendo una acción del servidor que requiere conexión. Consultar una autorización no reanuda una pausa local.

Las acciones nuevas usan controles Material 3 de al menos 48 dp, contenido desplazable, estado anunciado y errores de lectura que no cierran la pantalla. Se conserva `FLAG_SECURE`, la TWA y los controles de permisos, fuentes y batería. Se indica expresamente que revisar avisos activos no recupera un historial completo y que **todavía no se crean gastos**.

### Verificación reproducible de Fase 3

Preparar PostgreSQL/HTTPS locales como en la Fase 2. Con el fixture listo y las rutas compiladas:

```bash
adb reverse tcp:4209 tcp:4209
adb push <certificado TLS local> /data/local/tmp/afp-capture-test.crt
cd android
AFP_CAPTURE_TEST_ORIGIN=https://localhost:4209 \
AFP_CAPTURE_TEST_CERTIFICATE=<certificado TLS local> \
./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleRelease :app:lint \
  -Pandroid.testInstrumentationRunnerArguments.class=com.garatachia.afp.CaptureQueueTest,com.garatachia.afp.CaptureQueueDeliveryTest,com.garatachia.afp.BindingStoreTest,com.garatachia.afp.CaptureDeliveryTest,com.garatachia.afp.DiagnosticStoreTest,com.garatachia.afp.TwaNavigationTest \
  -Pandroid.testInstrumentationRunnerArguments.captureTestOrigin=https://localhost:4209 \
  -Pandroid.testInstrumentationRunnerArguments.captureTestCertificate=/data/local/tmp/afp-capture-test.crt
```

**18 pruebas JVM y 25 instrumentadas correctas, sin omisiones**, en el S24 Ultra (Android 16/API 36). Las diez pruebas nuevas de Room verifican reapertura/UUID, cifrado de archivo/WAL, recibo perdido, revisiones, callbacks concurrentes, más de 100 pendientes, credenciales, pausa, aislamiento de propietarios, ausencia de bloqueo entre identidades, `Retry-After`, errores permanentes y cifrado alterado. Una prueba adicional conecta Room con cliente HTTPS, API y PostgreSQL reales: pierde la confirmación después del commit, reabre la BD y obtiene el mismo recibo en el reintento. Auth y avisos son ficticios, sin escrituras financieras. Se repiten las catorce instrumentadas históricas de vinculación, diagnóstico y TWA.

`QueueRecoveryProbeTest` ofrece una comprobación física en dos ejecuciones sobre **desarrollo**, nunca sobre el paquete personal. Instalar las APK debug y androidTest; registrar Wi-Fi/datos antes de desconectarlos. Ejecutar `seedOfflineQueue` con argumento `recoveryProbe=seed`: persiste un aviso sintético con envíos pausados, sin credencial utilizable, y comprueba la restricción de red del trabajo. Reiniciar Android conservando la instalación, desbloquear si hace falta, restaurar la conectividad original y ejecutar `verifyQueueAfterPhysicalReboot` con `recoveryProbe=verify`: verifica el mismo UUID/cuerpo, cero intentos, pausa persistente y programación periódica conservada. No ejecutar estos métodos como parte de la suite normal: se omiten salvo que reciban su argumento explícito. Retirar después los paquetes de pruebas.

También pasaron **234 regresiones web sin omisiones**, lint y build web; se verificaron las 18 migraciones desde cero y actualización histórica, checksums, datos conservados y 21 tablas con RLS. Android compila debug/release y lint sin errores; conserva siete avisos (objetivo/versiones y la sugerencia `UseKtx`; se usa `commit()` directamente para comprobar si persistió la pausa), y un aviso de herramientas SDK XML. El runner emitió un aviso auxiliar por `androidx.test.services` ausente; las 25 pruebas terminaron correctamente. Estos resultados no acreditan muestras bancarias reales ni entrega real de un banco con pantalla bloqueada: la Fase 1 conserva esas tareas pendientes.

**Instalación y comprobación en producción:** se actualizó la APK mediante `adb install -r` con el certificado existente, conservando la fecha original de instalación, el acceso a notificaciones, la vinculación autorizada, la captura activa y las ocho fuentes seleccionadas. Desde la pantalla real se pausaron los envíos, se reinició el proceso para comprobar que la pausa persistía, se reanudaron y se ejecutó el reintento. Se consultó de nuevo la autorización del servidor. La cola personal mostró **0 pendientes, 0 por revisar y 0 entregados**. Las pruebas sintéticas de Room/HTTPS y reinicio usaron exclusivamente desarrollo; no se crearon gastos ni se modificó el servidor de producción. [Evidencia agregada sin datos personales](../artifacts/android-fase3/verification.json).


## Interpretación y registro financiero — Fase 4

Implementación del **21 de octubre de 2026**. El motor reside en el servidor: no cambia el contrato v1, las credenciales ni la cola Room de la APK 0.3.0. La autorización del teléfono y la habilitación financiera por tarjeta/formato son controles separados.

### Cobertura comprobada y condición de activación

`src/lib/captureParsers.js` registra `bbva.purchase.es.v1` y `wallet.purchase.es.v1`. **Son contratos sintéticos para verificar la arquitectura, no formatos observados de esas aplicaciones.** Ambos conservan `verified: false`; la API impide habilitarlos automáticamente, aunque se configuren alias. No hay variables de entorno ni propiedades del evento que permitan saltar ese control. Las pruebas transaccionales simulan formatos verificados únicamente mediante su cargador de módulos aislado.

Un formato real se incorpora cuando exista una muestra revisada y anonimizada que conserve el lenguaje/estructura bancaria, con sus regresiones de compra aprobada y variantes negativas. Se versiona el analizador; una versión nueva empieza en observación por tarjeta. HSBC, Banamex, Santander, Nu, DiDi y Mercado Pago conservan sus paquetes de captura y sus avisos desconocidos quedan en revisión. No se ha atribuido cobertura bancaria real a ejemplos ficticios.

Los contratos sintéticos requieren título exacto «Compra aprobada» (BBVA) o «Pago realizado» (Wallet), importe explícito con moneda y dos decimales, comercio, alias de cuatro cifras y fecha completa de operación. El texto ampliado contradictorio, la fecha ausente, horas de verano inexistentes/repetidas, moneda distinta de MXN y movimientos especiales bloquean el registro. Esta gramática no es una instrucción para modificar avisos reales ni una descripción verificada de los textos de los bancos.

### Archivo privado para todas las tarjetas

Se preparó `captura-tarjetas.local.json` **en la raíz**, excluido de Git. `captura-tarjetas.example.json` es su plantilla pública vacía. Incluye BBVA, HSBC 1/2, BANAMEX 1/2, SANTANDER, NU, DIDI y MERCADOPAGO. No se inventan terminaciones ni IDs.

Ejemplo **ficticio** de una entrada dentro de `cards`:

```json
{
  "name": "BBVA",
  "bankPackage": "com.bancomer.mbanking",
  "physical": ["0123"],
  "digital": ["0456"],
  "wallet": ["0789"],
  "verified": true,
  "evidence": "Terminaciones revisadas en la app bancaria y en Wallet"
}
```

- Escribir solo cuatro cifras **entre comillas** y conservar ceros iniciales. Las listas admiten varios alias de un mismo tipo. Usar `[]` cuando falte información; no equivale a eliminar alias anteriores.
- Mantener los nombres exactos de AFP y los paquetes de la plantilla. La importación busca las tarjetas del propietario autenticado y conserva sus IDs/historiales. No crea tarjetas ni las fusiona por banco.
- Marcar `verified: true` únicamente después de comprobar los valores, y describir esa comprobación en `evidence`. Si solo se conocen algunos, dejar vacías las otras listas; la verificación se aplica únicamente a los alias incluidos.
- El token de Wallet puede diferir de la terminación física/digital. Consultar la tarjeta correspondiente en Wallet; no copiar la física a ese campo por deducción.
- No incluir PAN completo, CVV, claves, códigos de acceso ni credenciales. No subir el archivo privado a Git ni publicarlo como evidencia.

Importar en **Configuración → Captura automática → Importar terminaciones desde JSON**. La operación es transaccional, aditiva y repetible. Un nombre inexistente revierte todo el archivo. Si una misma fuente/tipo/terminación corresponde a varias tarjetas, ambas se conservan y los avisos quedan en revisión. Importar alias no activa automatizaciones. **Importación real concluida el 21 de octubre de 2026:** 24 alias, todos verificados por declaración del propietario: nueve físicos, nueve digitales y seis de Wallet. Se resolvieron contra las nueve tarjetas existentes de Supabase sin ambigüedades; BANAMEX 1 fue confirmada explícitamente por el usuario. HSBC 1/2 y MERCADOPAGO conservan Wallet vacío porque el propietario indicó que no son compatibles. Se respaldó la entrada original y el estado anterior a importar, se ejecutó el servicio real de configuración en una transacción y se verificaron identidades, valores persistidos y conservación de todas las filas financieras y la automatización previa. No hubo gastos, activación de formatos, migraciones ni despliegue. La plantilla pública que inicialmente recibió las terminaciones se restauró vacía; los datos están exclusivamente en el archivo privado y el respaldo excluido de Git. [Evidencia sin terminaciones](../artifacts/android-fase4/personal-alias-import.json).

### Flujo financiero y decisiones

1. La API valida credencial y contrato antes de interpretar. Dispositivo, recepción y revocación conservan el bloqueo de Fase 2. La escritura financiera toma el bloqueo por propietario compartido con altas, ediciones y borrados manuales.
2. El evento nuevo se guarda y se interpreta dentro de la misma transacción. Se conserva el resultado del analizador, la propuesta original y la resolución. Un reintento devuelve el recibo anterior y no vuelve a procesar; cambiar contenido con el mismo UUID devuelve 409. Los eventos antiguos de Fases 2/3 no se reinterpretan automáticamente al desplegar.
3. El resolver exige alias verificado y no ambiguo, formato comprobado y modo `AUTOMATIC` para esa tarjeta/versión. Los otros casos permanecen en observación o revisión y no alteran los importes financieros.
4. Los importes admitidos llegan a Prisma como cadenas decimales canónicas. La hora real de operación se interpreta en `America/Mexico_City` y se conserva en la propuesta; publicación, recepción del teléfono y recepción del servidor permanecen separadas. El gasto guarda a las 12:00 UTC el día bancario utilizado por el resto de AFP.
5. Una regla de comercio normalizado **exacto**, separada por tarjeta, indica categoría y suscripción opcional. Sin regla se crea/reutiliza «Por clasificar». Una regla con referencias ya eliminadas lleva el aviso a revisión. No se infieren personas, efectivo recibido ni cuentas.
6. El gasto nuevo usa `reconciliationStatus: PENDING` (**Por conciliar**). Aparece inmediatamente en Gastos y en los cortes estimados; se conserva en el respaldo local. Consumo mínimo lo muestra como previsto y no lo acredita como confirmado. Los registros históricos/manuales conservan `CONFIRMED`; editar la captura no confirma su conciliación.

**Duplicados:** la identidad idempotente sigue siendo dispositivo/UUID, no un importe/comercio/día. Una referencia bancaria inequívoca se limita a la tarjeta resuelta y solo reúne canales si importe, moneda, día y comercio son consistentes. Una referencia contradictoria queda en revisión. Coincidencias de tarjeta/importe en ±3 días, incluso de gastos manuales, borrados o propuestas anteriores, requieren decisión. La amplitud de esa búsqueda puede generar revisiones de compras distintas, pero no elimina su multiplicidad. Reutilizar una clave de notificación también requiere revisión salvo la evidencia inequívoca ya resuelta. No se da por hecho que cada actualización sea una compra.

La pantalla básica de revisión permite **Vincular al existente**, conservando los datos/correcciones, o **Es otra compra**, creando otro gasto por conciliar mediante decisión confirmada e idempotente. Las resoluciones terminales no se repiten ni recrean gastos eliminados. Las altas manuales posteriores que coincidan con una captura pendiente devuelven 409; el contrato acepta `confirmDistinctCapture: true` como decisión explícita. Su control visual dentro del formulario manual se completará en la Fase 5. Las huellas de borrados empiezan con esta versión; no se recuperan borrados históricos sin evidencia.

**Suscripciones:** solo reglas explícitas crean vínculos. Se reutilizan el bloqueo de fila, la unicidad suscripción/mes y el servicio existente. Un cargo ya registrado, omitido o respaldado por un estado de cuenta requiere revisión; no se crea otro gasto. La captura sustituye la previsión y no acredita consumo confirmado hasta conciliarla.

**MSI y especiales:** MSI, preautorizaciones, devoluciones, cancelaciones, abonos, rechazos, pedidos/promociones y monedas distintas de MXN quedan en revisión. `convertToInstallments` sustituye un gasto identificado por una compra a meses dentro de una transacción y conserva los datos editados, notas y condición pendiente. Retira el cargo completo al crear las mensualidades. Rechaza suscripciones, aportaciones o vínculos personales que necesiten revisión adicional. La interfaz completa de conversión pertenece a Fase 5.

### API administrativa

Todas las rutas siguientes exigen **Bearer Supabase** y obtienen el usuario del token; una credencial nativa no las puede usar. Las respuestas son privadas y sin caché.

| Ruta | Operación |
|---|---|
| `GET /api/captures/configuration` | Tarjetas propias, alias, modos, reglas y formatos disponibles. |
| `PATCH /api/captures/configuration` | `importAliases` con `inventory`, `automation` con tarjeta/formato/modo, o `rule` con comercio/categoría/suscripción opcional. |
| `GET /api/captures/movements` | Últimos 50 avisos, `nextCursor`; admite `status` y `cursor` propios. No expone datos de otras cuentas. |
| `PATCH /api/captures/movements` | `id` y `action`: `link` (+`expenseId`), `distinct`, `discard`, `convertToInstallments` (+`months`, entero 2–120). |

Las configuraciones, vínculos y conversiones validan propiedad dentro de la transacción. «Es otra compra» solo resuelve posibles duplicados/revisiones identificados; no permite completar datos desconocidos ni registrar cualquier aviso especial. Descartar conserva la evidencia. La lista básica de Configuración adelanta parte de Fase 5; edición, conciliación, controles completos de reglas/modos y actualizaciones periódicas siguen pendientes de esa fase.

### Persistencia, migraciones e incidencia de producción

`20261021010000_add_capture_processing` añade cinco tablas: alias, automatización, reglas, movimientos y huellas de borrados, además de interpretación/enlace del evento y estado de conciliación del gasto. `20261021020000_capture_installment_reconciliation` incorpora el mismo estado en MSI. Son **aditivas**, con defaults compatibles, restricciones y RLS explícito sin políticas públicas. No reclasifican importes ni modifican registros financieros históricos.

**Incidencia del 21 de octubre:** al escalar un comando de prueba se omitieron las variables locales y Prisma usó `.env`, apuntando a Supabase. Se interrumpió la ejecución cuando ya había empezado la primera migración; faltaban nueve claves foráneas y cuatro restricciones. Se guardó un respaldo privado del estado en `estados_cuenta/android_fase4_recovery_1IBYEM/`, se completaron exclusivamente las partes pendientes en una transacción y se compararon todas las filas antes/después de esa recuperación, sin cambios. RLS ya estaba activo por el automatismo existente y se declaró explícitamente también. Se comprobó el diff vacío y el checksum original, y `migrate resolve --applied` conservó el intento interrumpido como retirado y registró el recibo final aplicado.

La auditoría posterior encontró **19 migraciones efectivas, checksums coincidentes, 26 tablas con RLS y cero políticas públicas**. Las cinco tablas nuevas están vacías: no se importaron terminaciones personales, no se activó automatización y no se crearon gastos de prueba. No existe un snapshot inmediatamente anterior a la invocación equivocada; la comparación de conservación empieza antes de la recuperación. El SQL inicial es aditivo. La web publicada y la APK personal no se actualizaron en esta operación.

**Antes de publicar esta versión:** respaldar y aplicar la segunda migración pendiente con `prisma migrate deploy`, regenerar Prisma y verificar historial/RLS. En una instalación nueva se aplican las 20 migraciones en orden. No volver a ejecutar manualmente el SQL de la primera ni editar su checksum. Las pruebas deben especificar siempre conexiones **localhost / afp_test…**, también al solicitar ejecución fuera del sandbox. [Evidencia de recuperación](../artifacts/android-fase4/production-recovery.json).

### Verificación reproducible y resultados

Con PostgreSQL 16 local desechable, sin reutilizar datos personales:

```bash
DIRECT_URL=<PostgreSQL localhost afp_test…> pnpm exec prisma migrate deploy
AFP_TEST_DATABASE_URL=<la misma base local> node --test --experimental-test-isolation=none tests/*.test.cjs
AFP_MIGRATION_TEST_DATABASE_URL=<la misma base local> pnpm db:verify
pnpm lint
pnpm exec next build --webpack
```

**266 pruebas web correctas, cero fallos y cero omisiones**. Incluyen seis pruebas de analizador y 25 escenarios transaccionales nuevos: concurrencia de diez entregas, respuesta perdida, dos compras iguales, referencias entre canales, alias ausentes/ambiguos, pausa por formato, reglas desactualizadas, manuales y eliminados, correcciones conservadas, suscripciones registradas/omitidas/documentadas, fallos tras escrituras reales y conversión a MSI con rollback. Se verifica numéricamente que las capturas/MSI pendientes entran en el corte y no completan la meta de consumo confirmado. Auth y eventos son ficticios.

`db:verify` reconstruye las **20 migraciones** desde vacío y desde el historial de 13 migraciones, conserva los registros históricos, comprueba defaults y restricciones de conciliación, checksums, diff vacío, segundo deploy sin cambios y **26 tablas con RLS**. Build web correcto; lint conserva únicamente la advertencia previa de TanStack Table. La validación bancaria real y las terminaciones personales permanecen pendientes; no se confunden con la verificación sintética. Evidencia agregada: [Fase 4](../artifacts/android-fase4/verification.json).

**Android y navegador:** 18 pruebas JVM y 25 instrumentadas correctas, cero fallos/omisiones, repetidas sin caché en el S24 Ultra contra HTTPS/API/PostgreSQL locales. La prueba inicial fallida por un manifiesto JSON del servidor de desarrollo pasó después de la reconexión USB; la ejecución completa final usa una compilación local estable. Ambas APK firmadas y lint correctos; se conservan los avisos previos, incluido el auxiliar del runner sobre `androidx.test.services`. La APK personal no se actualizó ni perdió su configuración. Chromium comprueba importación de nueve tarjetas, vínculo sin sobrescribir datos, compra distinta por conciliar y descarte confirmado, con persistencia en PostgreSQL. A 320 y 390 px no hay desbordamiento, las nueve filas son visibles y los botones/campo de importación tienen 44 px; las confirmaciones enfocan Cancelar.

Para repetir el recorrido de navegador/teléfono con una compilación estable, añadir `AFP_CAPTURE_TEST_PRODUCTION=1` al fixture `tests/helpers/capture-browser-server.cjs`, junto a `AFP_TEST_DATABASE_URL`, `AFP_CAPTURE_TEST_KEY` y `AFP_CAPTURE_TEST_CERTIFICATE` locales. El helper copia la app a un directorio temporal sin `.env`, compila allí con `next build --webpack`, mantiene Auth ficticia y no cambia el registro de analizadores. Este modo estabiliza la prueba; no activa automatización ni publica la web. Usar después los comandos Android de Fase 3, con `--rerun-tasks` si se necesita repetir la entrega JVM contra el servidor actual, y no dar por ejecutada una tarea marcada `UP-TO-DATE`.
