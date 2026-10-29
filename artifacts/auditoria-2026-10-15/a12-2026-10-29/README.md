# A12 · Datos locales y cierre de sesión · 29 de octubre de 2026

Implementación local sobre `7c958bf54d806f5eb32243cee7fc0408df45aa94`. [Hallazgo](../informe.md#A12). Datos ficticios, PostgreSQL 16 desechable y Supabase Auth simulada. Sin publicación, migraciones nuevas, cambios de dependencias ni escrituras en servicios remotos.

## Comportamiento

[LogoutProvider](../../../src/components/layout/LogoutProvider.tsx) unifica la salida de escritorio y móvil desde el layout raíz. El diálogo explica la limpieza y la independencia de la credencial nativa Android. Cada salida exige una decisión nueva si hay pendientes; la opción de dispositivo confiable inicia desmarcada.

- Elimina el bootstrap financiero y los borradores del propietario en localStorage, sessionStorage y memoria. Retira respuestas API heredadas de cachés AFP; conserva el shell público, preferencias y la cola de otras cuentas.
- Permite sincronizar, exportar y verificar una descarga antes de borrar, o conservar pendientes declarando un dispositivo de confianza. El archivo contiene datos financieros sin cifrado propio de AFP. No hay un botón para eliminar pendientes sin copia o sincronización.
- Exporta propietarios, cuerpos, UUID y marcadores de migración sin normalizarlos. Gastos restaura el JSON con la misma cuenta y rechaza propietarios mezclados, versión desconocida, operación alterada o un UUID local con otro cuerpo. Importar de nuevo una operación confirmada reutiliza su recibo de servidor.
- Una copia legada válida se migra transaccionalmente antes de exportar. Al conservar pendientes, su copia redundante se retira una vez migrada. Una copia ilegible se puede rescatar literalmente; las entradas inválidas requieren revisión manual antes de restaurar o sincronizar.
- Una generación por usuario invalida escrituras tardías del bootstrap. El marcador de cierre bloquea nuevas capturas y escrituras de borradores; Web Locks coordina los envíos y la limpieza entre pestañas. El borrado compara el snapshot dentro de una transacción IndexedDB y se limita al propietario. Sin Web Locks, un cambio concurrente puede exigir repetir la limpieza; los datos se conservan.
- Si Auth falla, la cola no se elimina. Si Auth ya terminó y falla la limpieza, el diálogo conserva el error y permite reintentar; no reactiva la sesión ni declara una salida completa. Los listeners de Dashboard, Mi dinero y Registro automático dejan terminar al coordinador antes de redirigir.
- Una salida externa o cambio de cuenta limpia datos sincronizados y conserva los pendientes sin decidir su borrado. Las otras pestañas retiran sus borradores y recargan el login. La navegación final vacía el estado React; una restauración desde bfcache fuerza recarga. Escape devuelve el foco al control que abrió el diálogo o al menú móvil.

La credencial nativa Android no se revoca: el diálogo, README y Privacidad indican revocar el teléfono desde Registro automático → Ajustes para detener su captura. La exportación cubre pendientes, no el historial financiero completo.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **951 escenarios correctos, cero fallos y cero omisiones**, PostgreSQL real local: 934 anteriores y 17 A12. [Log](tests-local.log). |
| Regresiones dirigidas | **33 correctas**, A12 más offline y apiFetch. [Pruebas A12](../../../tests/local-data-logout.test.ts) · [Log](targeted.log). |
| Casos A12 | Limpieza por propietario y cachés API antiguas; conservación de shell/preferencias/otra cola; bloqueo sin respaldo; exportar/borrar/restaurar sin cambiar UUID/cuerpo; repetición; confianza explícita; fallos antes/después de Auth; snapshots cambiados; escrituras tardías tras salir/entrar; legado migrado e ilegible; dueño/versión/operación inválidos; conflicto atómico; envío en curso y alta bloqueada; rescate de IndexedDB dañado. |
| Tipos | Web, pruebas/helpers y contratos negativos correctos. [Web](typecheck.log) · [Pruebas](typecheck-tests.log) · [Contratos](test-types.log). |
| ESLint | Cero errores y dos advertencias previas: `loadSubscriptions` sin uso y compatibilidad TanStack/React Compiler. [Log](lint.log). |
| Build | **`pnpm build` predeterminado con Turbopack correcto**, Next.js 16.4.3, incluida comprobación TypeScript. Variables de Auth ficticias y conexiones locales explícitas. [Log](build.log). |
| BD | Las **42 migraciones existentes** aplicadas a `afp_test_a12`. No hay cambio de esquema; no se repite `db:verify`. [Deploy](migrate.log). |
| Escritorio | A 1280×633, salida bloqueada con un pendiente; descarga JSON real, UUID/cuerpo comprobados, confirmación explícita y salida. Login sin sesión, bootstrap, borradores ni entradas de cola. [Estado](browser-after-export-logout.json) · [Captura](desktop-pending.png). |
| Restauración y recibos | Subir el archivo en Gastos restaura y sincroniza; importarlo otra vez deja **un gasto y un recibo** en PostgreSQL. [Cola después de enviar](browser-restored-sync.json) · [Conteo PostgreSQL](browser-postgres.json) · [Captura](restored.png). |
| Móvil y dos pestañas | A 390×844, menú → salida → confianza explícita. Ambas pestañas llegan al login sin cache ni borradores y conservan el mismo UUID. Volver a entrar y sincronizar desde el diálogo envía ese pendiente. [Pestaña 1](browser-trusted-tab1.json) · [Pestaña 2](browser-trusted-tab2.json) · [Recuperación](browser-trusted-recovered.json) · [BD final](browser-postgres-final.json) · [Captura](mobile-pending.png). |
| Accesibilidad acotada | Diálogo sin desbordamiento horizontal a 390 px. Axe: **cero violaciones**, con una comprobación de contraste incompleta por solapamiento; no certifica accesibilidad general. [Resultado](browser-dialog-a11y.json) · [Geometría](browser-mobile-layout.json). |
| Revisión | `git diff --check` correcto, revisión de React y detector de diseño sin hallazgos en los componentes nuevos. [Detector](design-detector.json). README, bitácora, Privacidad e informe actualizados. |

[Resumen y huellas](verification.json). Los logs del navegador de desarrollo se descartaron al cambiar al fixture de producción: las recargas HMR y los reinicios del servidor no se presentan como errores de la aplicación publicada. El recorrido final y el foco se comprueban de nuevo en una sesión de navegador independiente; véase `browser-final.json`.

## Reproducción

Crear PostgreSQL local desechable con el procedimiento del README, usando `afp_test_a12` y el puerto `55442`. Fijar la conexión de prueba explícitamente en cada invocación:

```bash
DIRECT_URL=postgresql://postgres:afp_test_only@127.0.0.1:55442/afp_test_a12 \
  pnpm exec prisma migrate deploy
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55442/afp_test_a12 \
  pnpm test
pnpm test local-data-logout.test.ts offline-expenses.test.ts api-fetch.test.ts
pnpm typecheck
pnpm typecheck:tests
pnpm test:types
pnpm lint
pnpm build
```

Para el recorrido visual con API/PostgreSQL reales y Auth ficticia:

```bash
AFP_TEST_DATABASE_URL=postgresql://postgres:afp_test_only@127.0.0.1:55442/afp_test_a12 \
AFP_UI_TEST_REAL_SETTINGS=1 AFP_CAPTURE_TEST_REAL_DASHBOARD=1 \
AFP_CAPTURE_TEST_PRODUCTION=1 AFP_UI_TEST_PORT=4217 \
  node --import tsx tests/helpers/money-browser-server.ts
```

Entrar como `money-qa@example.test` con una contraseña inventada de al menos seis caracteres. Crear una categoría ficticia. Para mantener un pendiente mientras se prueba la salida, desconectar la red después de cargar Gastos o sembrar una entrada IndexedDB del propietario ficticio; volver a Dashboard evita su envío automático desde Gastos. Abrir Cerrar sesión: sin sincronización ni respaldo verificado, la acción final debe permanecer deshabilitada.

Exportar a un archivo temporal privado, comprobar su `clientId`/`payload.operationId`, confirmar la descarga y salir. [browser-state.js](browser-state.js) permite inspeccionar únicamente presencia de sesión/caché/borradores y UUID; nunca expone el token. Volver a entrar, subir ese JSON desde Gastos y cotejar una sola fila/recibo en PostgreSQL, también tras repetir la importación. En móvil, abrir el menú y comprobar la conservación explícita y la limpieza de ambas pestañas. Al terminar, cerrar el fixture con SIGTERM y eliminar el archivo exportado y la BD desechable. Los identificadores de esta evidencia son sintéticos y cambiarán al reproducirla.

## Límites

Supabase Auth está simulado: no se acredita revocación real de tokens, dos cuentas reales ni el comportamiento del proveedor bajo todos los fallos de red. No se usaron datos personales ni se probó un teléfono físico. La identidad y cola Room nativas conservan su ciclo independiente. La preservación de otra cuenta se comprueba en las regresiones; el navegador usa un propietario ficticio en dos pestañas. No se publica la implementación y no se repiten las auditorías de dependencias al conservar el lockfile. Los datos locales y exportados siguen siendo legibles para quien acceda al perfil o al archivo; la protección implementada depende de aplicar la política de salida y de la elección expresa al conservar pendientes.
