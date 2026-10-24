# AFP Android · diagnóstico, vinculación y sincronización

**Versión personal instalada: 0.6.0 / versionCode 8**, verificada por USB el 22 de octubre de 2026; incorpora comprobantes compartidos y conserva captura, vinculación y ocho fuentes. Los seguimientos de publicación están en el README. El formato bancario Santander ya está publicado y habilitado; su compra inicial se resolvió expresamente como un gasto con dos evidencias. La primera compra futura automática y la conciliación de un corte completo siguen pendientes.

La Fase 1 añade una APK Kotlin/Compose en `android/`. Abre la interfaz financiera actual mediante Trusted Web Activity (TWA) y permite comprobar qué notificaciones entregan BBVA México, Google Wallet, HSBC, Banamex, Santander, Nu, DiDi Finanzas y Mercado Pago. La pantalla nativa incluye activación, selección de fuentes, estado del permiso y del lector, muestras locales e instrucciones para Samsung.

El diagnóstico está **pausado por defecto**. La Fase 2 añade vinculación independiente, cifrada y revocable, y recepción segura de eventos. El inicio de sesión web permanece en el navegador de la TWA; el componente nativo no lo lee. La Fase 3 añade la cola Room cifrada y el envío automático mediante WorkManager para los avisos recibidos con una identidad autorizada. La Fase 4 incorpora el motor de interpretación/registro; la Fase 5 completa revisión y conciliación desde AFP, con APK 0.4.0 preparada y aceptación nativa concluida mediante 29 pruebas instrumentadas en el S24 Ultra. Los formatos reales siguen bloqueados por falta de muestras verificadas.

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
- Para `wallet`, abrir **Wallet → tarjeta correspondiente → Más opciones → Número de cuenta virtual** y copiar las cuatro cifras de ese campo. El título de la tarjeta puede mostrar la terminación física o digital; no es el número virtual. Por ejemplo, si el título termina en `0123` y el número de cuenta virtual en `0789`, escribir `"wallet": ["0789"]`. Verificar cada tarjeta y dispositivo por separado. [Referencia oficial de Google](https://support.google.com/wallet/answer/7643925?hl=es).
- Para corregir un alias equivocado, eliminar esa entrada desde **Tarjetas y reglas** y añadir el número correcto. Cambiar el archivo y volver a importarlo solo añade entradas: no retira las anteriores. Conservar los alias físicos/digitales válidos.
- No incluir PAN completo, CVV, claves, códigos de acceso ni credenciales. No subir el archivo privado a Git ni publicarlo como evidencia.

Importar en **Configuración → Captura automática → Importar terminaciones desde JSON**. La operación es transaccional, aditiva y repetible. Un nombre inexistente revierte todo el archivo. Si una misma fuente/tipo/terminación corresponde a varias tarjetas, ambas se conservan y los avisos quedan en revisión. Importar alias no activa automatizaciones. **Importación real concluida el 21 de octubre de 2026:** 24 alias, todos verificados por declaración del propietario: nueve físicos, nueve digitales y seis de Wallet. Se resolvieron contra las nueve tarjetas existentes de Supabase sin ambigüedades; BANAMEX 1 fue confirmada explícitamente por el usuario. HSBC 1/2 y MERCADOPAGO conservan Wallet vacío porque el propietario indicó que no son compatibles. Se respaldó la entrada original y el estado anterior a importar, se ejecutó el servicio real de configuración en una transacción y se verificaron identidades, valores persistidos y conservación de todas las filas financieras y la automatización previa. No hubo gastos, activación de formatos, migraciones ni despliegue. La plantilla pública que inicialmente recibió las terminaciones se restauró vacía; los datos están exclusivamente en el archivo privado y el respaldo excluido de Git. [Evidencia sin terminaciones](../artifacts/android-fase4/personal-alias-import.json).

**Corrección posterior durante el seguimiento de Fase 7:** el propietario aclaró que las seis entradas Wallet eran las terminaciones de los títulos. Se sustituyeron por los números de cuenta virtual contrastados directamente en el teléfono para BBVA, NU, DIDI, SANTANDER y BANAMEX 1/2, tanto en AFP como en el archivo privado. La importación histórica describe lo recibido entonces; la [evidencia posterior](../artifacts/android-muestras-2026-10-21/verification.json) documenta la corrección, sin publicar cifras.

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

Las configuraciones, vínculos y conversiones validan propiedad dentro de la transacción. «Es otra compra» solo resuelve posibles duplicados/revisiones identificados; no permite completar datos desconocidos ni registrar cualquier aviso especial. Descartar conserva la evidencia. La lista básica de Configuración de Fase 4 se amplía con edición, conciliación, controles completos de reglas/modos y actualizaciones periódicas en la Fase 5 documentada abajo.

### Persistencia, migraciones e incidencia de producción

`20261021010000_add_capture_processing` añade cinco tablas: alias, automatización, reglas, movimientos y huellas de borrados, además de interpretación/enlace del evento y estado de conciliación del gasto. `20261021020000_capture_installment_reconciliation` incorpora el mismo estado en MSI. Son **aditivas**, con defaults compatibles, restricciones y RLS explícito sin políticas públicas. No reclasifican importes ni modifican registros financieros históricos.

**Incidencia del 21 de octubre:** al escalar un comando de prueba se omitieron las variables locales y Prisma usó `.env`, apuntando a Supabase. Se interrumpió la ejecución cuando ya había empezado la primera migración; faltaban nueve claves foráneas y cuatro restricciones. Se guardó un respaldo privado del estado en `estados_cuenta/android_fase4_recovery_1IBYEM/`, se completaron exclusivamente las partes pendientes en una transacción y se compararon todas las filas antes/después de esa recuperación, sin cambios. RLS ya estaba activo por el automatismo existente y se declaró explícitamente también. Se comprobó el diff vacío y el checksum original, y `migrate resolve --applied` conservó el intento interrumpido como retirado y registró el recibo final aplicado.

La auditoría al cerrar la recuperación encontró **19 migraciones efectivas, checksums coincidentes, 26 tablas con RLS y cero políticas públicas**. Las cinco tablas nuevas quedaron vacías en ese momento: todavía no se habían importado terminaciones personales, no se activó automatización y no se crearon gastos de prueba. No existe un snapshot inmediatamente anterior a la invocación equivocada; la comparación de conservación empieza antes de la recuperación. El SQL inicial es aditivo. La web publicada y la APK personal no se actualizaron en esa operación.

**Publicación completada posteriormente el 21 de octubre:** el push del usuario publicó web/backend en Vercel, commit `3af06ed`, estado `READY` en `finanzas.garatachia.com`. Con autorización explícita se guardó un respaldo privado de todas las filas exactas de AFP en `public`, metadatos, permisos y automatización, y se aplicó `20261021020000_capture_installment_reconciliation` mediante `prisma migrate deploy`. Se comprobaron **20 migraciones efectivas, checksums coincidentes, cero pendientes, diff de esquema vacío y Prisma regenerado**. La comparación con el respaldo conservó todos los valores anteriores; las MSI existentes recibieron únicamente `reconciliationStatus = CONFIRMED`. Se conservaron RLS en 26 tablas, cero políticas públicas, permisos, triggers y funciones. La lectura Prisma del campo nuevo pasó. El respaldo no incluye Supabase Auth. No se activaron formatos bancarios reales ni se modificó la APK. [Evidencia de publicación](../artifacts/android-fase4/production-deployment.json).

En otras instalaciones, respaldar y aplicar las migraciones antes de publicar servidor/interfaz compatibles y regenerar Prisma. Una instalación nueva aplica las 20 migraciones en orden. No volver a ejecutar manualmente el SQL de la primera ni editar su checksum. Las pruebas deben especificar siempre conexiones **localhost / afp_test…**, también al solicitar ejecución fuera del sandbox. [Evidencia de recuperación](../artifacts/android-fase4/production-recovery.json).

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

`db:verify` reconstruye las **20 migraciones** desde vacío y desde el historial de 13 migraciones, conserva los registros históricos, comprueba defaults y restricciones de conciliación, checksums, diff vacío, segundo deploy sin cambios y **26 tablas con RLS**. Build web correcto; lint conserva únicamente la advertencia previa de TanStack Table. Los 24 alias personales ya están importados; la validación bancaria real sigue pendiente y no se confunde con la verificación sintética. Evidencia agregada: [Fase 4](../artifacts/android-fase4/verification.json).

**Android y navegador:** 18 pruebas JVM y 25 instrumentadas correctas, cero fallos/omisiones, repetidas sin caché en el S24 Ultra contra HTTPS/API/PostgreSQL locales. La prueba inicial fallida por un manifiesto JSON del servidor de desarrollo pasó después de la reconexión USB; la ejecución completa final usa una compilación local estable. Ambas APK firmadas y lint correctos; se conservan los avisos previos, incluido el auxiliar del runner sobre `androidx.test.services`. La APK personal no se actualizó ni perdió su configuración. Chromium comprueba importación de nueve tarjetas, vínculo sin sobrescribir datos, compra distinta por conciliar y descarte confirmado, con persistencia en PostgreSQL. A 320 y 390 px no hay desbordamiento, las nueve filas son visibles y los botones/campo de importación tienen 44 px; las confirmaciones enfocan Cancelar.

Para repetir el recorrido de navegador/teléfono con una compilación estable, añadir `AFP_CAPTURE_TEST_PRODUCTION=1` al fixture `tests/helpers/capture-browser-server.cjs`, junto a `AFP_TEST_DATABASE_URL`, `AFP_CAPTURE_TEST_KEY` y `AFP_CAPTURE_TEST_CERTIFICATE` locales. El helper copia la app a un directorio temporal sin `.env`, compila allí con `next build --webpack`, mantiene Auth ficticia y no cambia el registro de analizadores. Este modo estabiliza la prueba; no activa automatización ni publica la web. Usar después los comandos Android de Fase 3, con `--rerun-tasks` si se necesita repetir la entrega JVM contra el servidor actual, y no dar por ejecutada una tarea marcada `UP-TO-DATE`.

## Revisión y conciliación en AFP — Fase 5

Fase concluida el **21 de octubre de 2026**, con APK preparada **0.4.0 / versionCode 6**. La web ofrece los flujos completos de revisión y la aceptación nativa se comprobó en el S24 Ultra con Android 16 mediante 29 pruebas instrumentadas correctas, sin omisiones. La APK personal instalada continúa en 0.3.0. La falta de muestras bancarias reales conserva los bloqueos de Fases 1/4, independientemente de la disponibilidad de estos controles.

### Configurar teléfono, fuentes y tarjetas

Abre **Configuración → Captura automática**. Además de autorizar/pausar/revocar el dispositivo, «Aplicaciones de…» permite pausar cada fuente. AFP muestra la preferencia solicitada, si fue reportada como aplicada y la fecha del último reporte de permisos, lector, captura, envíos y batería. Un reporte es una fotografía, no una comprobación en tiempo real. Una APK sin esta capacidad aparece como «Sin estado nativo reportado».

La APK 0.4.0 obtiene la configuración al consultar estado y antes de sincronizar. Los trabajos periódicos de recuperación siguen teniendo un mínimo de 15 minutos sujeto a las restricciones de Android; no hay control remoto inmediato sin comunicación. Las pausas se guardan por identidad y se comprueban en el lector y antes de persistir el aviso. Una respuesta de una identidad anterior se ignora. **Reanudar** respeta las fuentes que seleccionaste localmente: no habilita aplicaciones nuevas ni deseleccionadas. Los avisos guardados antes de la pausa conservan su entrega y UUID. La pantalla nativa indica cuáles están pausadas desde AFP.

En **Tarjetas y reglas**, selecciona la tarjeta existente. Puedes añadir/verificar una terminación con su tipo, fuente y evidencia, editar su verificación o eliminarla con confirmación. Para cambiar las cifras, guarda la terminación correcta y elimina la anterior. Se conservan los ceros iniciales; las colisiones entre tarjetas requieren revisión. La importación JSON anterior continúa siendo aditiva. Ninguna de estas acciones renombra tarjetas ni habilita automatización.

Los formatos se habilitan individualmente por tarjeta. Los analizadores sintéticos BBVA/Wallet muestran Diagnóstico y el servidor rechaza su activación; las fuentes sin analizador comprobado siguen pendientes. Un formato verificado con alias verificado puede pasar a Automático y volver a Observación. Las reglas usan comercio exacto, categoría y suscripción opcional de esa misma tarjeta; se pueden editar/eliminar desde la aplicación. Eliminar configuración conserva los movimientos anteriores.

### Resolver avisos

**Bandeja** filtra Por revisar, Registrado, Conciliado y Descartado. Observación queda dentro de Por revisar; los vínculos y MSI quedan en Registrado hasta tener un cotejo explícito. La consulta se renueva al recuperar foco/conexión y cada 30 segundos mientras la región y la pestaña del navegador están visibles. Las peticiones anteriores se cancelan y los borradores del detalle permanecen.

«Revisar aviso» muestra todas las evidencias originales y sus fechas. Si falta información o hay un error, corrige tarjeta, fecha, importe final en MXN, concepto y categoría, y guarda la corrección. La propuesta original no se sobrescribe. Una edición concurrente obliga a actualizar antes de guardar otra.

- **Registrar compra** usa los datos revisados y crea un gasto Por conciliar. Detecta coincidencias actuales con gastos, MSI, avisos y huellas de eliminados antes de crear otro registro.
- **Vincular evidencia** asocia el aviso a un gasto existente con la misma tarjeta e importe. Se puede buscar por concepto. También se ofrecen MSI existentes con la misma tarjeta e importe total en fechas próximas. El vínculo no cambia categoría, notas, personas, cuentas ni aportaciones del registro.
- **Es otra compra** conserva la multiplicidad tras una confirmación explícita. Dos importes iguales no son una clave de deduplicación.
- **Descartar aviso** pide confirmación y lo conserva en Descartado, sin gasto.
- Un gasto registrado se puede editar en **Gastos** o **Convertir a MSI** desde el detalle. La conversión pide plazo y confirmación; crea la compra, mueve las evidencias y retira el gasto completo en una transacción. Los vínculos personales o aportaciones bloquean la conversión hasta revisarlos. Si ya se había cotejado el cargo, la cuota nueva vuelve a Por conciliar. Una MSI existente puede consultarse en **Compras a meses**.

Un aviso de moneda extranjera requiere capturar el cargo final MXN comprobado antes de registrarlo. Un aviso no financiero se descarta; una devolución, pago o abono se registra en su flujo financiero correspondiente después de revisar el estado. No se infieren personas ni aportaciones de efectivo a partir del texto.

Si una captura manual de Gastos queda en cola por coincidir con otra captura Por conciliar, aparece una decisión local: **Es otra compra** conserva todos los datos y el mismo UUID al reenviar; **Conservar gasto existente** pide confirmar que revisaste ese gasto y retira únicamente el pendiente local. Advierte que las notas/aportaciones locales no se copian al registro existente, que se puede editar previamente.

### Cotejar un estado de cuenta

En **Conciliar**, selecciona tarjeta, inicio y fin inclusivos y pulsa **Consultar período**. Se admiten períodos de hasta 63 días; usa las fechas de tu corte. La lista compara cargos de compras completos y cuotas MSI del mes de la fecha final, calculadas con las reglas y referencias bancarias existentes.

Captura opcionalmente el **total de cargos de compras del estado**, incluido cero, y la **explicación de diferencias**. El subtotal no representa el saldo a pagar: pagos, abonos, saldo anterior, intereses y comisiones requieren su explicación y los flujos de Tarjetas/Ingresos correspondientes. El cotejo no sustituye el importe del estado de cuenta registrado en Tarjetas.

**Confirmar en estado** coteja solo ese ID y conserva su huella financiera. **Deshacer cotejo** lo devuelve a Por conciliar. Cada cargo igual ocupa una fila independiente. La ausencia de un cargo no lo borra, cancela ni modifica automáticamente. Las diferencias se guardan como explicación editable.

**Registrar cargo faltante** exige comprobar que no es uno de los cargos existentes. Se crea Por conciliar y se confirma después en su propia fila. Antes de enviar, UUID y datos quedan guardados en sessionStorage por cuenta y período. Un reintento conserva el recibo transaccional; una respuesta perdida o un gasto posteriormente eliminado no generan otro cargo con ese intento. Para un faltante MSI, regístralo en Compras a meses y vuelve a consultar el período.

Cambiar tarjeta, importe, fecha o condiciones financieras de una MSI retira su cotejo; la huella anterior permite detectar el cambio. Editar concepto, categoría, notas o aportación conserva la decisión. Los borradores del total/explicación no se reemplazan durante la actualización periódica y no pueden sobrescribir metadatos cambiados en otra pantalla. **Recargar total y explicación** vuelve a cargar los guardados cuando quieras reemplazar tu borrador.

Gastos móvil/escritorio, su respaldo offline, Compras a meses y el desglose de Tarjetas muestran el origen del aviso y Por conciliar/Conciliado. Sin conexión se ve la última información guardada en Gastos; corregir, vincular, convertir y cotejar requieren conexión. Las capturas pendientes siguen incluidas en estimaciones y fuera del consumo confirmado para exentar comisión; el cotejo explícito confirma el cargo.

### Persistencia, verificación y publicación

La migración **aditiva** `20261021030000_capture_review_and_reconciliation` añade `CaptureStatement` (`capture_statements`), `CaptureMovement.correction`, `reconciledAt` en gastos/MSI y pausas/reportes en dispositivos. La tabla nueva tiene RLS explícito sin políticas públicas. El cotejo y los faltantes comparten el bloqueo financiero por propietario; sus recibos conservan el resultado incluso si se elimina el registro. Las API administrativas exigen Bearer Supabase e ignoran propietarios enviados por el cliente; el reporte nativo usa exclusivamente su credencial Capture.

Pruebas locales reproducibles, sin `.env` como conexión de pruebas:

```bash
podman run --rm -d --name afp-phase5-postgres \
  -e POSTGRES_PASSWORD=afp_test_only -e POSTGRES_DB=afp_test_phase5 \
  -p 127.0.0.1:55445:5432 docker.io/library/postgres:16-alpine
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55445/afp_test_phase5 \
DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55445/afp_test_phase5 \
pnpm exec prisma migrate deploy
pnpm exec prisma generate
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55445/afp_test_phase5 pnpm test
AFP_MIGRATION_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55445/afp_test_phase5 pnpm db:verify
pnpm lint
pnpm exec next build --webpack
```

Para la interfaz, preparar los datos ficticios con `AFP_TEST_DATABASE_URL=<base local anterior> node tests/helpers/seed-capture-review.cjs` e iniciar el fixture estable descrito en Fase 4. Iniciar sesión local con `capture-qa@example.test` y una contraseña ficticia; el helper solo admite una BD localhost `afp_test…`. Incluye nueve tarjetas y avisos inventados, no activa los formatos reales y no copia `.env`. La revisión con Agent Browser comprueba los componentes y API reales contra PostgreSQL, con autenticación ficticia.

**288 pruebas web correctas sin omisiones**, incluidos 19 escenarios nuevos de revisión/cotejo y dos de conflictos offline; **18 JVM correctas sin omisiones**, incluida entrega Kotlin → HTTPS/API/PostgreSQL locales con pausa por fuente y reporte. Se verificaron las 21 migraciones desde cero y desde el historial, diff vacío, checksums, conservación de datos y 27 tablas con RLS. Ambas APK, firma release, lint Android y APK instrumentada compilan; lint web mantiene la advertencia previa de TanStack Table.

**Aceptación nativa concluida:** al conectar el S24 Ultra por USB pasaron **29 pruebas instrumentadas, cero fallos y cero omisiones**: las 25 históricas, tres de `CaptureRemoteSettingsTest` y una de `CaptureRemoteScreenTest`. Las tres primeras verifican persistencia, pausa aislada por fuente, respuesta tardía de otra identidad, reanudación y selección local. La cuarta usa Compose Test para desplazarse por la pantalla real y comprobar la pausa de BBVA, su desaparición al reanudar y el selector todavía activado, con Wallet conservado. Los reportes de pausa y reanudación proceden de `CaptureApplication.reportState()` en el teléfono y se cotejan campo por campo con la API/PostgreSQL locales, incluida la fecha de reporte.

La prueba de pantalla requiere la variante `.dev` sin vinculación previa. Invoca explícitamente el cliente HTTPS local con el certificado de prueba; no cambia el origen de la APK ni su confianza TLS global. Detiene los trabajos de esa variante y mantiene el mutex durante la identidad ficticia, revoca esa identidad y restaura las preferencias al terminar. No mide la programación automática de WorkManager ni la captura bancaria real. Gradle retiró los paquetes dev/pruebas y se comprobó que AFP personal conserva **0.3.0 / versionCode 5** y su fecha de actualización anterior. El fallo inicial del emulador no se cuenta como ejecución; la aceptación corresponde al teléfono físico. [Resultados nativos sin identificadores personales](../artifacts/android-fase5/native-acceptance.json).

Para repetir, inicia primero el fixture HTTPS de Fase 3/4 con esta base local y espera ambos mensajes de disponibilidad (`Capture QA HTTPS ready on 4209` y `Capture API ready on 4208`). Usa un certificado de prueba localhost vigente y un JDK completo. Después ejecuta:

```bash
adb reverse tcp:4209 tcp:4209
adb push /tmp/afp-phase5-test.crt /data/local/tmp/afp-capture-test.crt
cd android
JAVA_HOME=/ruta/al/jdk \
AFP_CAPTURE_TEST_ORIGIN=https://localhost:4209 \
AFP_CAPTURE_TEST_CERTIFICATE=/tmp/afp-phase5-test.crt \
./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest \
  -Djava.net.preferIPv4Stack=true \
  -Pandroid.testInstrumentationRunnerArguments.class=com.garatachia.afp.CaptureRemoteSettingsTest,com.garatachia.afp.CaptureRemoteScreenTest,com.garatachia.afp.CaptureQueueTest,com.garatachia.afp.CaptureQueueDeliveryTest,com.garatachia.afp.BindingStoreTest,com.garatachia.afp.CaptureDeliveryTest,com.garatachia.afp.DiagnosticStoreTest,com.garatachia.afp.TwaNavigationTest \
  -Pandroid.testInstrumentationRunnerArguments.captureTestOrigin=https://localhost:4209 \
  -Pandroid.testInstrumentationRunnerArguments.captureTestCertificate=/data/local/tmp/afp-capture-test.crt
```

La dependencia `ui-test-junit4` usa el mismo BOM de Compose que la aplicación y solo se añade a las pruebas. Tras descargar las dependencias se puede repetir con `--offline`; IPv4 evitó la espera de conexión de Gradle en este entorno. La comprobación de pantalla usa sincronización de Compose para evitar las carreras observadas al desplazar la lista mediante accesibilidad.

El recorrido final de Chromium comprueba corrección y registro, compra distinta, conversión a MSI, vínculo a una MSI existente, descarte, alias/reglas, pausa solicitada y cotejo/faltantes persistidos. Una recarga offline real de Gastos conserva **Captura: BBVA** y **Por conciliar**. La bandeja visible realizó dos consultas separadas por **29 999 ms**. No hay desbordamiento horizontal a 320/390 px; se corrigieron las filas estrechas del panel de fuentes y del cotejo. Las imágenes de [bandeja](../artifacts/android-fase5/inbox-320.png), [cotejo móvil](../artifacts/android-fase5/reconciliation-390.png) y [Gastos offline](../artifacts/android-fase5/offline-390.png) solo contienen datos ficticios.

**Estado histórico al cerrar Fase 5:** esta migración solo se había aplicado a PostgreSQL local. Con autorización explícita, respaldar AFP, verificar historial, aplicar `prisma migrate deploy`, generar Prisma, publicar web/backend y actualizar la APK a 0.4.0 conservando firma, permisos, vinculación y cola. No instalar la APK nueva contra un backend antiguo para validar estos contratos. Esta implementación no modificó Supabase, no publicó la web y no actualizó la instalación personal. La Fase 5 queda cerrada en implementación y aceptación; la publicación, las muestras reales y el piloto conservan sus actividades y condiciones independientes. [Evidencia agregada de Fase 5](../artifacts/android-fase5/verification.json).

## Piloto de crédito BBVA — Fase 6

**21 de octubre de 2026: preparación técnica en observación; fase abierta hasta validar compras reales y conciliar un corte completo.** El registro existente `BBVA` conserva su ID, nombre, producto e historial. El título Platinum del plan no verifica un cambio de producto respecto de la referencia histórica a Oro.

### Alcance y observación

El usuario confirmó que AFP contempla **tarjetas de crédito**. El aviso BBVA disponible de «cargo a tu cuenta» fue una transferencia de débito. El reconocimiento `bbva.account-charge.es.v1` conserva ese prefijo con valores ficticios en las regresiones y excluye ese formato de las propuestas y del registro de crédito (`NON_CREDIT_ACCOUNT`, Descartado). No asigna el número de cuenta a una tarjeta. No se muestra como opción para automatizar; un cuerpo contradictorio sigue en revisión. No es una muestra de compra de crédito ni completa la aceptación de las Fases 1/4/6.

Las ocho fuentes se conservan para diagnóstico. La vinculación, cola y recepción funcionan con el modo por defecto Observación; los formatos de compra sintéticos BBVA/Wallet continúan bloqueados, y una fuente sin analizador no crea gastos. No se habilita automáticamente otra tarjeta por compartir banco o Wallet.

Esperar compras normales, sin generar cargos de prueba. Al llegar un aviso de crédito, comprobar fuente/versión, tipo de compra y bloqueo del teléfono, importe, moneda, comercio, fecha de operación, alias físico/digital/Wallet y referencia disponibles. Conservar como ausente o ambiguo lo que no permita identificar. Preparar una copia anonimizada revisada que conserve el lenguaje bancario y sustituya todos los datos personales por valores ficticios. Cambiar `verified` exige esa evidencia y regresiones; editar configuración o reenviar un aviso antiguo no elimina el bloqueo ni vuelve a interpretar recibos previos.

Presencial, en línea, Wallet, Amazon/cargos parciales, Mercado Libre/Mercado Pago y suscripciones continúan **sin cobertura real de crédito acreditada**. Conservar el descriptor bancario; un pedido, promoción o envío no es un cargo. Cada formato/tarjeta se activa por separado desde Tarjetas y reglas cuando cumpla sus requisitos, y puede volver a Observación.

### Medir y cotejar el corte

En **Conciliar**, elegir el período bancario exacto y la tarjeta. **Seguimiento de captura** empieza cerrado, permite teclado y conserva un control de 44 px en móvil. Actualiza los indicadores junto con la consulta existente, sin modificar registros.

| Indicador | Definición y límite |
|---|---|
| Cargos con/sin aviso vinculado | IDs de gasto/cuota del cotejo con al menos un evento original asociado, o sin ninguno. Varias evidencias cuentan un cargo. Una cuota puede tener evidencia de la compra original, no un aviso nuevo del mes. |
| Cotejados sin aviso vinculado | Cargos confirmados explícitamente en este estado, sin evento vinculado. Revisar Bandeja antes de clasificarlos como compras sin aviso. |
| Avisos por revisar | Propuestas asignadas a la tarjeta y fecha de operación del período, aún en revisión/observación. Las coincidencias señaladas siguen siendo sospechas, no duplicados confirmados. |
| Propuestas corregidas | Cambió algún dato interpretado de tarjeta, fecha, importe, moneda o comercio. Añadir campos ausentes, categoría o diferencias de acentos/mayúsculas no cuenta. No es una tasa de errores. |
| Evidencias adicionales | Eventos adicionales asociados al mismo cargo. Reenviar el mismo UUID no añade eventos ni evidencia. No equivale a duplicar gastos. |
| Faltantes añadidos al cotejar | Cargos creados desde ese cotejo que todavía existen en la tarjeta y período. Los recibos de eliminados se conservan, sin contarlos como cargos presentes. |
| Avisos sin tarjeta o sin fecha bancaria | Se presentan aparte, por recepción en `America/Mexico_City`, con su horario histórico. Las fuentes compartidas incluyen otras tarjetas; no se atribuyen a compras del período. También se cuentan avisos antiguos sin propuesta. |

Confirmar cada movimiento y registrar faltantes con el flujo existente. Dos compras iguales mantienen sus IDs y el cotejo de una no confirma la otra. Revisar vínculos a gastos eliminados; el resumen no los recrea. Guardar el total y explicar diferencias sin convertir pagos, abonos o saldo anterior en compras. La falta de un vínculo no prueba ausencia de señal y la consulta no demuestra que ya transcurrió un corte completo.

Al cerrar el período, documentar compras cotejadas, compras capturadas, cargos del estado sin aviso tras revisar todas las evidencias, duplicados financieros realmente confirmados, revisiones y errores reales del analizador. Conservar las limitaciones de permisos, contenido protegido, captura desactivada y fuentes sin señal; nunca atribuir esos cargos a una captura que no ocurrió.

### Pruebas y actualización

`tests/capture-pilot-integration.test.cjs` usa exclusivamente localhost y una base `afp_test…`. Verifica multiplicidad, dos canales/un cargo, correcciones frente a campos completados, recepción local e histórica, aislamiento, falta de propuesta antigua, recibos repetidos y exclusión de débito incluso ante configuración administrativa forzada. Las regresiones de parser usan un prefijo derivado del aviso de débito y un resto ficticio; no son un fixture validado de crédito.

Resultado: 298 pruebas web, 18 JVM y 29 instrumentadas correctas sin omisiones, más dos comprobaciones de actualización de APK. Para repetir las regresiones, usar los comandos de Fase 5 con una base local Fase 6, por ejemplo `127.0.0.1:55446/afp_test_phase6`. Reconstrucción desde cero e historial: 21 migraciones, diff vacío, checksums, filas conservadas y 27 tablas con RLS. Las APK debug/release y web compilan; lint mantiene los avisos previos.

La aceptación de actualización usa **solo AFP dev**: compilar/instalar versión **0.4.0 / 6** con `QueueUpgradeProbeTest`, invocar `#seedBeforeApkUpdate` con `-e upgradeProbe seed`, actualizar mediante `adb install -r` a **0.5.0 / 7** con la misma firma e invocar `#verifyAfterApkUpdate` con `-e upgradeProbe verify`. No reinstalar ni borrar datos entre las dos invocaciones. El fixture guarda un pendiente cifrado, identidad ficticia, ocho fuentes, pausa remota y envíos pausados. Verifica cuerpo, UUID, propietario, secreto, identidad, configuración y permiso aplicable; conserva `PENDING` con cero intentos. Retirar después los paquetes dev/pruebas creados para esta aceptación. La regresión habitual enumera explícitamente las ocho clases de Fase 5 y no ejecuta accidentalmente estas pruebas en dos pasos.

### Producción

Con la autorización de esta tarea se respaldaron AFP en `public`, metadatos, permisos, automatización y claves de firma en `estados_cuenta/android_fase6_2026-10-21-5ixrrk/`, con directorio privado y archivos 0600, excluidos de Git. No incluye Supabase Auth. Se aplicó únicamente la migración aditiva pendiente de Fase 5; quedaron 21 migraciones completas, ninguna pendiente, checksums correctos, diff vacío, RLS en 27 tablas y cero políticas públicas. La comparación exacta de todas las columnas anteriores conservó las filas; también se conservaron automatización y privilegios. Fase 6 no añade migraciones.

**Publicación y actualización verificadas:** Vercel `dpl_4vn4oDLnajjHffjUVAi7mKyKrCaC`, estado `READY`, producción en `https://finanzas.garatachia.com`. Se publicaron 230 archivos web/Prisma públicos desde el árbol de trabajo, sobre la base `3ef6ae2`, sin commit ni push. El manifiesto SHA-256 `0c4ed9b037f209574632fbcac0601d1ea9f44b302b6756560639e187490d4bcb` identifica esas fuentes; claves, APK, `.env`, alias y datos privados quedaron excluidos. El bundle contiene el nuevo seguimiento; páginas, manifest y certificado responden 200 y las API consultadas sin sesión responden 401. La consulta inmediata de errores de runtime desde la publicación no devolvió grupos; no acredita todos los flujos autenticados.

**APK personal 0.5.0 / versionCode 7 instalada** mediante `adb install -r` con la firma existente. Se conservaron fecha inicial de instalación, acceso a notificaciones, autorización, batería exenta, ocho fuentes seleccionadas y seis recibos, con cero pendientes y cero errores de cola. Las muestras de diagnóstico pasaron de seis a nueve al reconectar; no aumentaron los eventos ni recibos del servidor. Android conserva el dominio como `verified`. El reporte real recibido confirma lector/acceso/captura activos, envíos habilitados, ocho fuentes y ninguna pausa remota. Las identidades y hashes de credencial, los seis eventos previos y las filas de 17 tablas financieras/de aplicación permanecen intactos. El aviso de débito existente quedó descartado por la confirmación del usuario, conservando su evento y recibo. Solo quedó la APK personal en el perfil Android actual. Mantener observación hasta disponer de formatos de crédito comprobados; no modificar `verified` para iniciar artificialmente el piloto. [Plan y pendientes](../PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-6-piloto-completo-con-bbva-platinum), [evidencia](../artifacts/android-fase6/verification.json).

## Activación gradual por tarjeta — Fase 7

**Cobertura al 22 de octubre de 2026.** Se conservan nueve tarjetas, sus IDs, 24 alias y ocho aplicaciones. Wallet/BANAMEX 1 tiene un formato real verificado, la compra inicial registrada una vez y ambas evidencias vinculadas por revisión explícita. Solo esa tarjeta/formato tiene modo automático preparado con la fecha Wallet aceptada; **falta publicar el código web**. Nu/CFE también tiene una regla expresa y su cobro de octubre confirmado, como se detalla abajo. BBVA y los demás formatos/canales siguen pendientes. Los seis alias virtuales Wallet permanecen corregidos y contrastados en el teléfono. Las ampliaciones Wallet/Banamex y Nu/CFE añaden migraciones aditivas ya aplicadas en Supabase (26 completas); no cambia el contrato nativo v1 ni requiere actualizar la APK personal 0.5.0 / 7.

### Cobertura comprobada y pendiente — actualización del 23 de octubre

| Tarjeta | Alias configurados y verificados por el propietario | Muestras reales de crédito / formato activable |
|---|---|---|
| BBVA | Física, digital, número virtual Wallet | Wallet TDC Platinum publicado/habilitado con fecha del aviso en México aceptada. Muestra inicial registrada una vez y cotejada puntualmente; alias bancario verificado. Débito/cuenta y pagos siguen separados |
| HSBC 1 | Física, digital | Compra física comprobada, sin aviso recibido; permiso de notificaciones Android bloqueado en la revisión del 23 de octubre |
| HSBC 2 | Física, digital | Compra física comprobada, sin aviso recibido; comparte la aplicación HSBC con permiso bloqueado |
| BANAMEX 1 | Física, digital, Wallet | Wallet publicado/habilitado con fecha del aviso aceptada; banco parcial de evidencia, con ambas fuentes vinculadas al mismo gasto |
| BANAMEX 2 | Física, digital, Wallet | Wallet publicado/habilitado con el analizador compartido y fecha aceptada; muestra registrada una vez con ambas evidencias y cotejo puntual. Banco JOY parcial no activable |
| SANTANDER | Física, digital, Wallet | Banco completo y respaldo Wallet V2 publicados/habilitados. Banco usa fecha de operación; Wallet usa fecha del aviso aceptada. Evidencia anterior validada sobre el mismo gasto cotejado, sin crear otro |
| NU | Física, digital, Wallet | Nu/CFE habilitado independientemente. Compras Wallet publicadas/habilitadas con fecha aceptada; muestra inicial registrada/cotejada una vez y banco vinculado como evidencia parcial no activable |
| DIDI | Física, digital, Wallet | Wallet publicado/habilitado con fecha aceptada; muestra inicial registrada/cotejada una vez; compra futura automática y corte completo pendientes; sin muestra bancaria de compra propia |
| MERCADOPAGO | Física, digital | Compra aprobada en su propia wallet publicada/habilitada. Regla expresa de tarjeta de crédito única, MXN y fecha del aviso aceptada; muestra inicial registrada/cotejada una vez |

**Siete de nueve tarjetas tienen algún formato de compras automático habilitado. Para cada tarjeta**, los canales presencial, en línea, cargos parciales y suscripciones continúan pendientes de aceptación real completa. BANAMEX 1/2, BBVA, Santander, DiDi y Nu tienen una compra Wallet revisada, registrada y cotejada puntualmente; Mercado Pago tiene una compra de su propia wallet resuelta mediante regla expresa. HSBC 1/2 siguen pendientes de avisos accesibles. Falta observar compras futuras automáticas y conciliar un corte completo. Los alias por sí solos no demuestran una compra. Amazon y Mercado Libre/Mercado Pago se revisan por los cargos efectivos a la tarjeta identificada, conservando los parciales; avisos de pedido/envío no crean gastos. Validar una aplicación no valida todas las tarjetas de su banco ni todas las de Wallet.

El S24 Ultra mantiene Android 16/API 36, One UI 8.5, acceso a notificaciones y batería exenta. ADB comprobó las ocho fuentes instaladas: Wallet actualizó a `26.41.996630916` y Mercado Pago a `2.458.2`; las demás versiones coinciden con la matriz anterior. La consulta no leyó avisos ni acredita recepción con pantalla bloqueada.

### Primeros movimientos reales y límites de captura

El **21 de octubre de 2026** se revisó el aviso de pago CFE de Nu y el propietario confirmó que usó crédito Nu. AFP lo capturó con pantalla desbloqueada y el servidor confirmó su recepción aproximadamente cinco segundos después. El contenido disponible identifica importe y destinatario, pero no moneda explícita, tarjeta ni fecha bancaria. No debe completarse usando el paquete Nu, el símbolo `$` o las fechas de publicación/recepción.

`nu.cfe-service-payment.es.v1` reconoce exclusivamente ese texto observado y propone importe/CFE para revisión. La [muestra anonimizada](../tests/fixtures/captures/nu-cfe-service-payment.es.v1.json) usa importe y fechas ficticios; conserva campos ausentes. El formato tiene `verified: false` y **no puede habilitar automatización**, aunque exista un alias Nu verificado. No valida compras presenciales, otros destinatarios ni pagos de saldo de Nu. Tras publicar el cambio solo se aplicará a avisos nuevos: el movimiento recibido sigue en `REVIEW / UNKNOWN_FORMAT` y conserva su evidencia. Para resolverlo se utiliza **Bandeja → Corregir**, se completan explícitamente los datos bancarios y se registra o vincula el gasto correcto; después se coteja en **Conciliar**. No se hizo esa resolución durante el diagnóstico.

La compra BBVA/Wallet tiene un comprobante aprobado NFC de terminal Mercado Pago, coincidente con el número virtual de esa BBVA. Se corrigió un dígito mal leído inicialmente del comprobante. No se encontró una notificación asociada en AFP ni el movimiento en el historial Wallet consultado; el propietario solo observó la terminal y la palomita. El comprobante permite cotejar una compra sin señal, pero no aporta una muestra de formato Wallet. La aclaración del propietario permitió corregir los seis alias Wallet: se verificaron los números virtuales de cada tarjeta, se sustituyeron las entradas incorrectas en una transacción del servicio de configuración y se actualizó el archivo privado. La lectura posterior confirmó 24 alias, cero ambigüedades y conservación de los otros 18 alias; las huellas de 20 modelos permanecieron idénticas. No se cambió ninguna identidad de tarjeta ni se creó un gasto. La entidad de la terminal no identifica la tarjeta que pagó.

Los permisos actuales de BBVA, Wallet y Nu, y los canales consultados de BBVA/Wallet, estaban habilitados. AFP reportó lector/acceso/captura activos, ocho fuentes y envíos sin pausas. Esto acredita el estado consultado, sin demostrar que se publicara un aviso durante ese pago. Los originales, referencias y terminaciones permanecen en el directorio privado excluido de Git.

Las regresiones de este seguimiento elevan la suite a **337 pruebas correctas sin omisiones**, incluidas recepción concurrente, bloqueo de automatización, resolución manual idempotente y conservación de recibos anteriores. Lint sin errores (un aviso previo de TanStack) y build correctos. Sin despliegue, migración, cambios nativos ni sustitución de la APK personal. [Evidencia del seguimiento](../artifacts/android-muestras-2026-10-21/verification.json).

**Revisión adicional del 22 de octubre:** una compra comunicada con BANAMEX 1 por Wallet tiene dos avisos persistidos, coincidentes con el importe, comercio y horario; ambos siguen en `REVIEW / UNKNOWN_FORMAT`, sin un gasto de esa compra. El título y terminación del aviso Wallet corresponden al alias digital bancario de BANAMEX 1, sin mostrar el número de cuenta virtual NFC; son datos diferentes y no se deben sustituir los alias correctos por deducción. El banco aporta fecha/hora pero no moneda explícita ni una terminación completa cotejable; Wallet aporta MXN, importe y comercio pero no fecha bancaria. Falta validar sus analizadores y resolver las dos evidencias como una sola compra. La cola del teléfono confirma 19 entregas y cero pendientes o errores de entrega; las revisiones financieras de la bandeja siguen abiertas. El comprobante BBVA anterior no tiene aviso asociado; hay un gasto coincidente en tarjeta, fecha e importe, sin evidencia vinculada, cuya identidad requiere confirmación antes de duplicar o vincular. La inspección fue de solo lectura, sin cambios de código, gastos, alias o automatización. [Evidencia de la revisión](../artifacts/android-muestras-2026-10-22/verification.json).

### Wallet/BANAMEX 1: fecha aceptada y registro

El propietario aceptó expresamente usar el día de **publicación del aviso Wallet en `America/Mexico_City`**. El analizador `wallet.banamex-purchase.es.v1` conserva `notificationAt`, `dateSource: NOTIFICATION_POSTED_AT` y zona horaria; no presenta esa hora como operación bancaria. La propuesta y la confirmación de habilitación muestran ese origen. `CaptureAutomation.datePolicy` guarda la decisión por tarjeta/formato; sin la política aceptada no se permite el registro automático, aunque se fuerce el modo en BD.

La terminación del título **Joy Banamex** corresponde a los alias bancarios físicos/digitales de este formato. Se buscan en el paquete Banamex, comprobando colisiones entre tipos y tarjetas, sin sustituir el número virtual NFC configurado en Wallet. BANAMEX 2 no hereda la habilitación de BANAMEX 1. Otra estructura, moneda, tarjeta ambigua o campo contradictorio permanece en revisión.

`banamex.card-charge.es.v1` interpreta el aviso observado con «Retiro/Compra», tres cifras de tarjeta, fecha/hora AM/PM y autorización abreviada. Solo aporta evidencia: el texto no demuestra por sí solo MXN ni distingue retiro de compra. No usa la autorización como referencia global única ni es activable. Un aviso bancario pendiente, sin corrección personal, no impide crear el gasto del Wallet completo; después queda por revisar y puede vincularse expresamente. Gastos existentes, movimientos resueltos y correcciones personales conservan los controles de duplicados. No se combinan avisos automáticamente por importe/comercio/horario.

La preparación real registró una única compra confirmada por el propietario y vinculó ambos avisos originales, con cotejo puntual de importe/tarjeta/fecha. La nota del período aclara que **no representa un estado de cuenta ni un corte completo**. No se alteraron los gastos anteriores, incluido el BBVA coincidente con el comprobante sin aviso. Solo se preparó `AUTOMATIC` para BANAMEX 1 y este formato Wallet. Para que opere sobre avisos futuros falta publicar el árbol de trabajo y comprobar el despliegue `READY`.

**Avisos ya recibidos:** abrir **Bandeja → Revisar aviso → Interpretar con el formato actual**. Está disponible únicamente para un aviso pendiente con una evidencia, sin correcciones personales ni vínculos financieros. La confirmación ejecuta solo observación: conserva el evento, la interpretación inicial y el recibo nativo, y agrega historial de análisis idempotente. No registra un gasto. Después revisar, guardar datos, registrar o vincular y cotejar según corresponda. Un reenvío desde Android conserva el recibo anterior y no reinterpreta; los avisos resueltos y correcciones personales quedan protegidos.

La migración `20261023010000_capture_wallet_date_policy` añade `datePolicy` e `analysisHistory`. Se aplicó después de respaldo privado y auditoría: **25 migraciones, ninguna pendiente, diff vacío, 30 tablas con RLS, cero políticas públicas**, privilegios y filas previas conservados al migrar. La aceptación final tiene **429 pruebas correctas sin omisiones**, lint/build correctos, reproducción desde vacío y actualización histórica de las 25 migraciones; navegador móvil de 320/390 píxeles sin desbordamiento, reinterpretación sin gasto y activación con política explícita. Las API locales recibieron dos avisos ficticios y crearon un solo gasto por conciliar; el reintento devolvió el mismo recibo. La APK personal sigue en **0.5.0 / 7**. [Evidencia de implementación](../artifacts/android-wallet-banamex/verification.json).

### Nu/CFE: regla expresa y cobro de suscripción

El aviso real identifica importe y CFE, pero no tarjeta, moneda ni fecha bancaria. El propietario aceptó expresamente usar su **tarjeta NU, MXN y la fecha de publicación del aviso en México**, y pidió resolver el cobro de su suscripción CFE existente. `nu.cfe-service-payment.es.v2` conserva esos orígenes en la propuesta (`cardSource`, `currencySource`, `dateSource`), la aceptación y el vínculo explícito de suscripción. V1 permanece parcial; el texto no adquiere campos nuevos por cambiar el analizador.

En **Tarjetas y reglas → NU → Configurar regla Nu/CFE**, elegir la suscripción existente y confirmar. No se busca por nombre o importe aproximado. La regla se guarda en observación; exige una tarjeta propia con fuente Nu verificada, una suscripción propia y la aceptación de fecha. Solo hay un destinatario por propietario/formato. Guardar lo mismo es idempotente; cambiar tarjeta o suscripción detiene la automatización anterior y exige un piloto/cotejo nuevo. **Volver a observación** detiene futuras altas y conserva la regla, cobros y evidencias.

Para el aviso pendiente, solicitar **Interpretar con el formato actual**, revisar los datos, guardar y registrar. La interpretación por sí sola no registra gastos. El registro usa el servicio transaccional de cobros: crea **un gasto vinculado a la suscripción** y una decisión mensual `CONFIRMED`. El importe real del aviso sustituye solo el de esa ocurrencia; su tarjeta Nu puede ser distinta del método habitual de la suscripción. La categoría procede de la suscripción salvo corrección personal. Se conservan frecuencia, importe estimado y pago habitual; no se crea un gasto independiente adicional.

El mes del aviso debe tener un cobro programado pendiente. Un mes sin cobro bimestral, cobro omitido, evidencia bancaria previa o pago ya registrado produce revisión, sin una segunda alta ni un gasto genérico. Los pagos de períodos anteriores requieren revisar el mes correcto. Como el aviso no distingue la fuente de fondos, esta automatización depende de la asignación expresa a crédito Nu para ese texto CFE; otros destinatarios, pagos de saldo y formatos siguen por revisar.

La preparación real confirmó el cobro CFE de octubre con Nu y su importe real, conservando la suscripción bimestral configurada en efectivo. Se verificó que **Cobros de suscripciones** ya lo muestra confirmado y el **Aviso importante** deja de generarse; no se descartó ni ocultó un recordatorio. Actualizar AFP permite ver el cambio. El evento, interpretación inicial, recibo nativo, alias, gastos anteriores y configuración Wallet/BANAMEX 1 permanecieron intactos. Solo este pago tuvo revisión y cotejo puntual; no representa un estado de cuenta ni un corte completo.

La política Nu/CFE y su modo automático quedaron preparados en BD. **Falta publicar este código y comprobar `READY` para procesar automáticamente futuros avisos**. La migración `20261023020000_capture_nu_cfe_policy` añade política, aceptación, vínculo de suscripción y unicidad de destino: 26 migraciones completas, diff vacío, 30 tablas con RLS y privilegios/filas previas conservados al migrar. Aceptación final: **440 pruebas sin fallos ni omisiones**, lint y build correctos, reconstrucción desde vacío/actualización histórica y navegador/HTTP con datos ficticios. Sin cambios Android ni nueva APK personal **0.5.0 / 7**. [Evidencia Nu/CFE](../artifacts/android-nu-cfe/verification.json).

### Santander: aviso bancario completo y evidencia Wallet

**Publicado y habilitado con autorización el 22 de octubre de 2026.** La compra comunicada por el propietario produjo dos avisos recibidos correctamente; se reinterpretaron y resolvieron expresamente como un único gasto con ambas evidencias. `santander.card-purchase.es.v1` reconoce exclusivamente la estructura observada **Compra con tarjeta**, con importe, MXN, comercio, cuatro cifras y fecha/hora bancarias en México. La fecha de recepción no reemplaza la operación. `wallet.santander-purchase.es.v1` conserva la evidencia **Santander LikeU**, con importe, moneda, comercio y terminación, pero sin día de operación. No permite automatización ni asigna el día de publicación al gasto.

Ambos resuelven las cuatro cifras contra los alias bancarios físicos/digitales Santander. Una tarjeta puede tener los dos tipos con el mismo valor; una coincidencia entre tarjetas bloquea el registro. Los números virtuales NFC de Wallet permanecen intactos. El banco puede registrar un gasto cuando se habilite su formato; Wallet queda por revisar hasta vincularlo expresamente. Los avisos no tienen una referencia única común: no se fusionan por importe, comercio u horario. Un gasto existente, una revisión de notificación o una corrección personal conserva revisión.

Para otros avisos pendientes elegibles, abrir el aviso **Santander** en **Bandeja**, solicitar **Interpretar con el formato actual**, comprobar los datos, elegir categoría, guardar y registrar una sola compra. Interpretar Wallet por separado y buscar/vincular ese mismo gasto; su fecha bancaria queda vacía. Cotejar el cargo explícitamente en **Conciliar**, distinguiendo una comprobación puntual de un estado de cuenta completo. Los requisitos se vuelven a comprobar al habilitar o reactivar `santander.card-purchase.es.v1` en **Tarjetas y reglas → SANTANDER**. Wallet parcial no es activable. Reintentar la entrega Android no reinterpreta avisos ya recibidos.

No se necesitó migración ni APK nueva. Se mantienen los permisos, la vinculación y las ocho fuentes de la APK personal **0.6.0 / 8**. Las **484 pruebas** pasaron sin fallos ni omisiones; lint y build correctos. Navegador móvil con Auth ficticia y API/PostgreSQL locales: cero gastos al interpretar, un gasto al registrar y los dos movimientos vinculados a ese mismo gasto. En producción, `dpl_3wDJjzHKzoFpJWn243Ez3CfAsJ4Y` está `READY`; el respaldo privado de 32 tablas y la lectura posterior confirmaron la conservación de gastos anteriores, alias, otras reglas, eventos/recibos y RLS. La pantalla Gastos del teléfono muestra un gasto en **Por clasificar**, con ambas fuentes y cotejo puntual. [Producción](../artifacts/android-santander/production.json) y [aceptación técnica](../artifacts/android-santander/verification.json). La compra inicial se resolvió expresamente; otros canales, una compra futura automática y el corte completo siguen pendientes.

**Respaldo Wallet publicado y habilitado con autorización · 23 de octubre:** `wallet.santander-purchase.es.v2` usa el día del aviso en México, aceptado por el propietario, y puede registrar sin esperar al banco. El formato bancario conserva su fecha de operación y su modo independiente. Publicar por sí solo no habilita Wallet: se validó la muestra ya cotejada y se aceptó `NOTIFICATION_POSTED_AT`. V1 sigue como evidencia histórica no activable.

El segundo aviso coincidente queda por revisar, sin crear otro gasto ni fusionarse automáticamente con el primero. Se conserva la fecha de la fuente que registró; si difiere la fecha bancaria, debe revisarse. Wallet V2 en observación, sin corrección ni resolución, no impide el registro bancario. Las coincidencias con gastos manuales, compras iguales, revisiones, correcciones y borrados mantienen revisión.

Para el Wallet V1 ya vinculado/cotejado: abrirlo desde **Bandeja → Conciliados → Validar Wallet como respaldo**. `validateWalletBackup` exige un gasto bancario cotejado, evidencia Santander completa y coincidencia de tarjeta, MXN, importe y día del aviso; rechaza correcciones personales y conserva todos los datos financieros. Añade historial explícito e idempotente a la propuesta V2, con originales intactos. Después se habilita solo Wallet V2 aceptando su fecha. El aviso real existente resultó elegible en una consulta de solo lectura; no requiere otra compra para preparar la activación.

Verificación local: 581 pruebas sin omisiones, reconstrucción de las 31 migraciones y RLS, lint, compilación Webpack y navegador móvil con datos ficticios/API/PostgreSQL reales. [Evidencia local](../artifacts/android-santander-wallet-backup/verification.json).

**Producción:** `dpl_FSUf1kGToCZSAXujgR7bB6tTePWU`, `READY`, dominio AFP y 16 módulos de captura coincidentes por huella. Tras respaldo privado de 32 tablas se validó el Wallet histórico y se habilitó únicamente V2; cero gastos nuevos. El registro bancario, su fecha y cotejo, eventos/recibos, interpretación inicial, historial previo y otras reglas se conservaron. Solo se añadió un análisis Wallet y la automatización V2, con fecha del aviso aceptada; el banco continúa activo con `BANK_OPERATION`. Sin migración ni APK nueva; 31 migraciones completas, cero pendientes y diff vacío. Falta observar una compra futura automática y conciliar el corte completo. [Verificación de producción](../artifacts/android-santander-wallet-backup/production.json).

### DiDi por Wallet: fecha aceptada y formato habilitado

**Publicado y habilitado con autorización el 22 de octubre de 2026.** `wallet.didi-purchase.es.v1` reconoce **DIDI Credit Card** en el aviso Google Wallet observado: comercio en título, importe, MXN y cuatro cifras. Resuelve esa terminación contra los alias físicos/digitales DiDi verificados del propietario. La muestra corresponde al alias digital; el número virtual NFC permanece separado. No se observó aviso bancario asociado entre los eventos consultados, ni se validó un formato de compra de la app DiDi Finanzas.

El aviso no incluye fecha bancaria. Se propone el día de su publicación en `America/Mexico_City`, con `NOTIFICATION_POSTED_AT` indicado en pantalla. **La activación exige aceptar expresamente esa fecha para esta tarjeta/formato**, además de revisar una interpretación propia y cotejarla. Publicar el analizador no activa el modo automático y las aprobaciones de otras tarjetas no se trasladan a DiDi.

Para otros avisos pendientes elegibles, abrir **Bandeja → Interpretar con el formato actual**. La acción conserva el original, su interpretación inicial, el recibo y un historial idempotente; no crea dinero. Comprobar importe, fecha propuesta y tarjeta, elegir categoría, guardar y registrar una sola compra, o vincular el gasto correcto si ya existe. Cotejar explícitamente el cargo en **Conciliar**, sin presentar esa comprobación puntual como un corte completo. En **Tarjetas y reglas → DIDI**, habilitar o reactivar solo este formato y confirmar la política de fecha. Reintentos, avisos tardíos, compras iguales y coincidencias manuales conservan revisión ante posibles duplicados.

Pasaron **519 pruebas sin fallos ni omisiones**, incluidas 21 nuevas de DiDi, lint y build Webpack. Navegador a 390 px con Auth ficticia y API/PostgreSQL locales: cero gastos al interpretar, uno tras revisión, confirmación de fecha al habilitar y una compra futura automática por conciliar; nueve entregas de ese evento produjeron un gasto y un recibo. Sin errores JavaScript ni desbordamiento. El analizador se contrastó sin conexión contra el original privado. No necesita migración ni APK nueva; las 29 migraciones existentes y la personal **0.6.0 / 8** son compatibles. [Evidencia y pantallas](../artifacts/android-didi-wallet/verification.json).

Vercel `dpl_2qUBTHbQSE4J7otGKDeDNdxW58sf` está `READY` en el dominio AFP, con el analizador publicado idéntico al probado. Tras aceptar expresamente la fecha Wallet y guardar respaldo privado de 32 tablas, se registró un único gasto en **Por clasificar**, se documentó el cotejo puntual y se habilitó solo DIDI / este formato. Gastos anteriores, alias, eventos/recibos, interpretación inicial, otras reglas y RLS se conservaron. No se aplicó migración ni se actualizó la APK. La muestra inicial se resolvió expresamente; falta observar una compra futura normal registrada automáticamente y conciliar un corte completo. [Verificación de producción](../artifacts/android-didi-wallet/production.json).

### BANAMEX 2: mismo Wallet y evidencia bancaria JOY

**Publicado y habilitado con autorización el 23 de octubre de 2026.** Su aviso real Wallet usa `wallet.banamex-purchase.es.v1`, compartido con BANAMEX 1. Las cuatro cifras resuelven la tarjeta mediante alias bancarios verificados, conservando el token NFC. La observación, revisión/cotejo y aceptación de la fecha Wallet en México son propias de cada tarjeta; la configuración de BANAMEX 1 no se hereda.

El banco emitió la variante **Retiro/Compra … JOY BANAMEX…**, distinta de `ADICIONAL`. `banamex.joy-card-charge.es.v1` conserva comercio completo, importe, tres cifras, fecha/hora bancaria y autorización como evidencia. No inventa MXN ni distingue retiro de compra; permanece parcial y no activable. Los formatos de pagos recibidos de Banamex se mantienen separados.

Para otros avisos pendientes elegibles, revisar Wallet, guardar categoría y registrar una sola compra o vincular el gasto existente. Interpretar explícitamente el banco y vincularlo a ese mismo gasto; no se fusionan por importe u horario. El análisis conserva el aviso, recibo, interpretación inicial e historial, sin crear dinero. Habilitar o reactivar **BANAMEX 2 / Wallet** requiere su propia muestra cotejada y confirmar `NOTIFICATION_POSTED_AT`. Este cotejo no acredita un corte completo.

Pasaron **553 pruebas sin omisiones**, incluidas 14 nuevas, lint y build. Navegador de 390 px con Auth ficticia y API/PostgreSQL locales: un gasto con ambas evidencias y fecha aceptada al habilitar; nuevas compras iguales por importe en dos tarjetas crean un gasto por tarjeta y BANAMEX 1 conserva su configuración. Reintentos, ambigüedades, datos personales y límites de la evidencia bancaria comprobados. Sin errores JavaScript ni desbordamiento. Sin migración ni APK nueva; 30 migraciones existentes y personal **0.6.0 / 8** compatibles. [Evidencia y pantallas](../artifacts/android-banamex2/verification.json).

En producción, `dpl_2Yp4BwCjZbGTxQUfkBtvHjrQ3z76` está `READY` en el dominio AFP con la huella del analizador probado. Tras respaldo privado de 32 tablas se resolvió la muestra como un gasto en **Por clasificar**, con ambas evidencias y cotejo puntual; solo BANAMEX 2 / Wallet quedó habilitado con su fecha aceptada. Gastos del celular muestra una compra, ambas fuentes y cotejo. Registros anteriores, eventos/recibos e interpretaciones iniciales, alias, otras reglas y RLS conservados. Solo cambiaron metadatos operativos de conexión/límites del teléfono y la revisión de Calendar activada por el trigger. BBVA quedó sin cambios. Falta observar una compra futura normal registrada automáticamente y conciliar un corte completo. [Verificación de producción](../artifacts/android-banamex2/production.json).

### Nu por Wallet y compras Mercado Pago — publicados y habilitados

El 23 de octubre se recibieron tres avisos de las cinco compras de prueba: Nu, Wallet/Nu y Mercado Pago. Sus comprobantes se contrastaron privadamente. No hubo aviso BBVA; HSBC tiene bloqueado el permiso Android. No se modificaron esos permisos ni las tarjetas de Wallet. La APK personal 0.6.0 / 8 y el contrato v1 siguen siendo suficientes.

`wallet.nu-purchase.es.v1` reconoce **Nu Mastercard Gold** y resuelve las cifras impresas contra alias bancarios Nu físicos/digitales verificados, conservando el número NFC separado. Propone importe, MXN, comercio y día del aviso en México. `nu.card-purchase.es.v1` queda como evidencia parcial sin fecha/moneda supuestas; ambos avisos requieren vinculación expresa para compartir el gasto. El banco por sí solo no habilita compras automáticas ni interfiere con Nu/CFE.

Para `mercadopago.card-purchase.es.v1`, **Tarjetas y reglas → Configurar regla Mercado Pago** permite aceptar una tarjeta de crédito única, MXN y fecha de publicación en México. Importe/comercio proceden del aviso; tarjeta/MXN de la declaración del propietario. La regla `MERCADOPAGO_CREDIT_MXN` no necesita suscripción y solo permite un destinatario por propietario/formato. No se identifica una tarjeta a partir de un ticket borroso. Sin regla vigente se mantiene `FORMAT_POLICY_REQUIRED`; cambiar el destinatario detiene la automatización anterior y exige otra muestra propia revisada/cotejada. Si cambia la moneda o la fuente de fondos, volver a observación y revisar la regla.

Guardar la regla no crea gastos ni habilita el formato. Para avisos antiguos: **Interpretar con el formato actual**, revisar/guardar, registrar una compra o vincular una existente, cotejar puntualmente y habilitar el formato aceptando su fecha. Se conservan evento, recibo e interpretación original, con historial explícito. Un cotejo puntual no equivale a un corte completo.

La migración `20261024010000_capture_mercadopago_purchase_policy` amplía la restricción de reglas sin borrar filas ni activar formatos; Nu/CFE conserva la suscripción obligatoria y su configuración. Pasaron 569 pruebas sin fallos ni omisiones, 31 migraciones desde vacío/actualización histórica, RLS y flujo móvil con datos ficticios. [Verificación local](../artifacts/android-nu-mercadopago/verification.json).

**Producción autorizada y verificada:** `dpl_8PsycW1qZLMD7EQu1y6pVHJuZWJq`, `READY`, sirve AFP con los 16 módulos de captura coincidentes por huella. Tras respaldo privado de 32 tablas se aplicó la migración, con 31 completas, diff vacío y RLS intacto; se resolvieron dos compras en Por clasificar, una por tarjeta, y se vinculó el banco Nu al gasto Wallet. Ambos cotejos son puntuales; el propietario aceptó la fecha del aviso en México y se habilitaron únicamente esos dos formatos de compra. Los originales, gastos anteriores, alias, Nu/CFE y demás reglas se conservaron. Calendar terminó sincronizado sin error. Sin APK nueva. Falta observar compras futuras automáticas, conciliar corte completo y resolver recepción BBVA/HSBC. [Verificación de producción y auditoría de dependencias pendiente](../artifacts/android-nu-mercadopago/production.json).

### BBVA Platinum por Wallet — publicada y habilitada

El aviso **TDC Platinum** comunicado el 23 de octubre llegó horas después de pagar; AFP lo guardó unos 14 segundos después de publicarse. Teléfono y servidor coincidían en 48 entregados, cero pendientes y cero errores. El estado inicial era `REVIEW / UNKNOWN_FORMAT`, sin gasto; la terminación coincide con un alias bancario BBVA verificado. Las otras notificaciones BBVA consultadas corresponden a débito/cuenta, no acreditan esta compra de crédito. Se conservaron privadamente las evidencias y la captura del propietario.

`wallet.bbva-purchase.es.v1` reconoce solo esa estructura y exige alias físico/digital BBVA verificado. **TDC Platinum** no identifica por sí solo el banco: si la terminación coincide con otra tarjeta bancaria del mismo propietario, incluso con alias sin verificar, se mantiene `AMBIGUOUS_CARD` y la activación muestra `AMBIGUOUS_ALIAS`. Una coincidencia con el número virtual NFC o con otro propietario no elige tarjeta ni produce esa colisión bancaria. El nombre editable de AFP no determina la identidad.

La propuesta usa el día de publicación en México, nunca la recepción o una hora de compra calculada a partir de la demora. Si Wallet publica al día siguiente, ese será el día propuesto. Habilitar requiere aceptar expresamente `NOTIFICATION_POSTED_AT`, después de revisar, registrar/vincular y cotejar una muestra propia sin corregir los datos interpretados. La corrección de una fecha personal sigue disponible, pero no acredita ese analizador para habilitarlo. Los avisos antiguos se reinterpretan expresamente y conservan el recibo, el evento y la interpretación inicial.

Pasaron 603 pruebas sin omisiones, con 22 nuevas de formato e integración BBVA; se verificaron envíos tardíos, colisiones entre bancos, concurrencia, duplicados, aislamiento, correcciones y borrados. Las 31 migraciones existentes se reprodujeron desde vacío/actualización histórica, con diff vacío y RLS. Compilación, lint y flujo móvil con datos ficticios/API/BD reales correctos; el análisis local del original coincidió con la BBVA configurada sin escribir en producción. [Verificación local](../artifacts/android-bbva-wallet/verification.json).

**Producción autorizada y verificada:** `dpl_CjPPEJKxH431AEBLph8LvUDy88GB`, `READY`, sirve el dominio AFP con los 16 módulos de captura coincidentes por huella. Tras respaldar las 32 tablas y comprobar que no había un gasto coincidente, se reinterpretó el aviso, se registró una sola compra en **Por clasificar** y se cotejó puntualmente. Solo BBVA / `wallet.bbva-purchase.es.v1` se añadió en `AUTOMATIC`, con fecha del aviso México aceptada expresamente. Los eventos/recibos e interpretaciones iniciales, los gastos anteriores, alias y otras reglas se conservaron. Calendar quedó sincronizado sin error; la pantalla real del celular muestra el gasto BBVA con Google Wallet y Conciliado. Sin migración ni APK nueva; permanecen 31 migraciones completas, cero pendientes, diff vacío y RLS. Falta observar la siguiente compra normal automática y conciliar un corte completo; HSBC 1/2 continúan pendientes de recepción. [Verificación de producción](../artifacts/android-bbva-wallet/production.json).

### Validar y habilitar una tarjeta y formato

1. Observar las fuentes autorizadas. BBVA fue el piloto previsto; la primera configuración preparada es BANAMEX 1 por Wallet, con evidencia propia. Esperar avisos del uso normal; no realizar compras exclusivamente para probar. Revisar la fuente, versión, tarjeta, canal y disponibilidad real de los campos en el teléfono o la bandeja. No publicar texto bancario, credenciales ni terminaciones personales.
2. Para incorporar un formato, preparar una muestra anonimizada y revisada que preserve su lenguaje y estructura, y sus regresiones positivas y negativas. Añadir un analizador determinista con una clave versionada y la fuente exacta en `captureParsers.js`, y marcarlo comprobado solo después de validar esa evidencia real. Un cambio de formato usa otra versión. No copiar los contratos sintéticos de los tests como formatos del banco.
3. Tras publicar el analizador comprobado, dejar la tarjeta en observación y esperar un aviso nuevo que lo use, o solicitar explícitamente **Interpretar con el formato actual** sobre un aviso pendiente elegible. Los eventos antiguos no se reinterpretan automáticamente; completar manualmente un formato desconocido no lo convierte en una muestra de acierto. El análisis explícito conserva su versión y la interpretación original en el historial. En **Bandeja**, revisar la propuesta original, registrar o vincular la compra correcta y cotejarla explícitamente en **Conciliar**.
4. Abrir **Tarjetas y reglas → Cobertura y activación**. La fuente bancaria procede de los alias configurados, no del nombre editable de la tarjeta. La pantalla muestra versiones, terminaciones verificadas, propuestas de observación cotejadas y bloqueos. Las aplicaciones sin analizador siguen en diagnóstico; Wallet sin alias muestra esa limitación, sin inferir compatibilidad.
5. Para habilitar se exige un analizador real verificado, terminaciones verificadas sin colisiones y al menos una propuesta de observación cotejada de esa misma tarjeta, fuente y versión. Debe conservar importe, moneda MXN, día, tarjeta y comercio interpretados; elegir categoría, cambiar notas, concepto del gasto o aportaciones personales no invalida la evidencia. Corregir los datos interpretados exige comprobar el analizador y una muestra nueva. Un histórico `CONFIRMED` sin cotejo explícito no sirve.
6. Pulsar **Habilitar** y confirmar la tarjeta y formato. En Wallet/Banamex, Wallet/DiDi y Nu/CFE la confirmación acepta usar la fecha de publicación en hora de México; Nu/CFE exige además su regla expresa de tarjeta, MXN y suscripción. La API consulta nuevamente la evidencia bajo el bloqueo financiero; no confía en el resultado mostrado por la pantalla ni admite `verified` del cliente. La acción no habilita otra tarjeta, otra fuente ni una versión nueva. Los avisos anteriores conservan su resolución y no se registran retroactivamente.
7. Comprobar las nuevas compras de cada canal disponible con el seguimiento de Fase 6 y conciliar el período. Documentar por tarjeta/fuente/versión las muestras revisadas y los canales comprobados o pendientes. Una activación técnica no acredita por sí sola todos los canales ni un corte completo. No ampliar las otras tarjetas antes de validar el piloto común y su propia evidencia.

La comprobación se hace al **habilitar o reactivar**. Editar o eliminar después un gasto o evidencia conserva las decisiones financieras y la configuración ya guardada; no deshace la automatización. Para reactivar tras volver a observación se exige evidencia vigente. Los alias ambiguos, campos incompletos y posibles duplicados siguen bloqueando el registro de cada nuevo aviso mediante el motor de Fase 4.

### Pausa, recuperación y cambio de versión

- **Volver a observación**, junto al formato, detiene la creación automática para avisos nuevos de esa tarjeta/versión. Conserva eventos, recibos, gastos, reglas, correcciones y cotejos. Volver a pulsar Habilitar comprueba de nuevo sus requisitos. Un formato retirado aparece separado y permite regresar a observación, aunque ya no exista su analizador; no permite reactivarlo ni crear claves arbitrarias.
- **Pausar una fuente** en Dispositivos y fuentes detiene nuevas capturas de esa aplicación cuando Android recibe la preferencia. Afecta a las tarjetas que comparten esa aplicación, conservando las demás fuentes; no elimina los avisos ya guardados. Reanudar respeta la selección local. El reporte distingue lo solicitado y lo aplicado; sin conexión no se promete un cambio inmediato.
- **Pausar envíos** en Android conserva nuevas capturas en la cola. Al recuperar permisos o conexión, consultar autorización y reintentar: se conservan UUID y propietario. No borrar datos ni reinstalar para solucionar una demora de sincronización.
- **Cambió el texto del banco:** mantener la fuente en diagnóstico/observación hasta revisar la muestra y preparar una versión nueva. Esa versión no hereda la habilitación ni la observación de la anterior. Resolver los avisos desconocidos desde la bandeja y conciliar faltantes; no modificar ni eliminar evidencias antiguas para forzar una activación.
- **Importe o tarjeta incorrectos:** volver a observación, revisar la propuesta y el gasto conservando las correcciones personales, comprobar alias y cotejar cada ID. Varios avisos no equivalen a varios cargos; dos cargos legítimos iguales conservan su multiplicidad.

### Verificación reproducible y límites

`captureRollout.js` deriva la preparación desde las tablas existentes; no guarda textos nuevos ni publica terminaciones en el resumen. `GET /api/captures/configuration` incluye `rollout` y mantiene los campos anteriores; `PATCH` aplica los requisitos adicionales y admite `datePolicy`. La implementación inicial de cobertura no añadió migraciones; Wallet/Banamex añade la política de fecha y el historial; Nu/CFE añade la regla expresa y su suscripción, sin modificar RLS ni el contrato Android.

Pruebas nuevas: `tests/capture-rollout.test.cjs` y `tests/capture-rollout-integration.test.cjs`. Ejecutar con `AFP_TEST_DATABASE_URL` apuntando exclusivamente a localhost y una base `afp_test…` que tenga las 26 migraciones, por ejemplo el puerto 55450 usado en la aceptación Nu/CFE:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55450/afp_test_nu_cfe \
  node --test --experimental-test-isolation=none tests/*.test.cjs
pnpm lint
pnpm exec next build --webpack
```

Resultado web de la aceptación inicial: **329 pruebas correctas sin omisiones**, incluidos 25 escenarios nuevos de integración y cinco unitarios. En aquella aceptación los analizadores reales seguían bloqueados; un cargador de pruebas aislado inyecta contratos ficticios para siete emisores y Wallet, con nueve tarjetas separadas y seis Wallet. Repite presencial, digital/en línea, parciales, suscripción explícita, reintentos, colisiones, aislamiento, versiones nuevas y recuperación. Esas pruebas no acreditan formatos ni canales reales. La preparación de navegador `tests/helpers/seed-capture-review.cjs` crea nueve tarjetas y 24 alias exclusivamente ficticios en la base local y se niega a usar una conexión remota.

La regresión nativa también pasó con **18 pruebas JVM y 29 instrumentadas correctas, sin omisiones**, contra HTTPS/API/PostgreSQL locales y Auth ficticia. La prueba Compose comprobó nuevamente pausa/reanudación por fuente y reporte real del teléfono. Las APK de desarrollo y pruebas se retiraron al terminar; la personal se conserva en 0.5.0 / 7. La evidencia de compilación, navegador y regresión nativa está en [artifacts/android-fase7/verification.json](../artifacts/android-fase7/verification.json). El [plan](../PLAN_CAPTURA_AUTOMATICA_ANDROID.md#fase-7-activación-gradual-de-las-demás-tarjetas) marca solo lo concluido: documentación, controles, pruebas técnicas y recuperación. Recopilar avisos, validar formatos y canales, completar el piloto y habilitar tarjetas con evidencia propia continúan pendientes. La aceptación técnica inicial no escribió en Supabase; los seguimientos posteriores corrigieron los seis alias Wallet y prepararon Wallet/BANAMEX 1 y Nu/CFE como se detalla arriba. La publicación del nuevo código web sigue pendiente.
