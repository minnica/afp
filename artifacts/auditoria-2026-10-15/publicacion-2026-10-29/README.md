# Publicación cotejada · 29 de octubre de 2026

Verificación de solo lectura posterior al push de A10. Actualiza los estados vigentes del [informe](../informe.md#estado-actual), sin alterar los artefactos históricos de implementación. No realiza despliegues, migraciones ni registros financieros.

## Evidencia remota

El MCP de Vercel consulta el proyecto AFP y después el despliegue por su dominio `finanzas.garatachia.com`. Ambos identifican la misma publicación:

| Dato | Resultado |
| --- | --- |
| Proyecto | `afp`, `prj_FUBRDkPPFpOgJG9zuLLhTwm3JHKV` |
| Despliegue | `dpl_DMUG88ufc6cqJheyt8khaRwVUvxM` |
| URL de despliegue | `https://afp-4f9tp8p54-minnicas-projects.vercel.app` |
| Entorno / estado | **production / READY** |
| Repositorio / rama | Git, `minnica/afp`, `master` |
| Commit | **`08aee7c1de08533fc19124e3842c454f59cf743f`** |
| Dominio de producción | `finanzas.garatachia.com`, asignado sin error de alias |
| Listo desde | **2026-10-29 09:33:52.215 UTC**, **03:33:52.215 America/Mexico_City** |

[Metadatos seleccionados del cotejo remoto](vercel.json). Se guardan identidad, fechas y alcance; no se guardan credenciales, enlaces temporales de acceso ni información financiera.

## Correspondencia con Git y estados

HEAD y `origin/master` coinciden con el SHA remoto al consultar. `git merge-base --is-ancestor` confirma estos commits dentro de la publicación:

| Hallazgo | Commit de implementación | Estado vigente |
| --- | --- | --- |
| A04 | `eead77a1f345b4e75463a7ff207035fb43e31c6a` | **CUBIERTA; publicación confirmada**. Aceptación con sesión real pendiente. |
| A07 | `5d4683cf39c5daca21107a6db3f0cdacef471e1e` | **CUBIERTA; publicación confirmada**. Aceptación con sesión real pendiente. |
| A08 | `be596435d41e4c20c774819367b1dd1f61f616f7` | **CUBIERTA; publicación confirmada**. Aceptación con sesión real pendiente. |
| A09 | `ca53e80979df18e94bd989904134347ad0c34cfa` | **CUBIERTA; publicación confirmada**. Aceptación de concurrencia con sesión real pendiente. |
| A10 | `08aee7c1de08533fc19124e3842c454f59cf743f` | **PARCIAL; actualización publicada**. Sigue el aviso bajo de desarrollo de la última auditoría. |

Las versiones de Next y eslint-config-next del commit publicado son **16.4.3**. Los SHA-256 de `package.json` y `pnpm-lock.yaml` coinciden exactamente con los conservados en la [verificación local A10](../a10-2026-10-29/verification.json). Esto relaciona la publicación con el lockfile auditado; no inspecciona las dependencias instaladas en el servidor ni consulta otra vez el registro de seguridad.

También son ancestros los cierres de TypeScript web (`6aad1ab`) y pruebas (`673daab`). Entre el padre del commit A04 y el publicado no hay cambios en `prisma/` ni `android/`: esta serie no introduce migraciones de BD ni una APK nueva. El estado remoto del esquema y del teléfono no se audita aquí. [Correspondencia, versiones y huellas](git.json).

El informe queda en **10 hallazgos cubiertos, 1 parcial y 3 pendientes**. A12, A13 y A14 conservan sus pendientes de implementación. La publicación deja de ser una tarea pendiente de A04/A07/A08/A09 o de la actualización A10. Los cierres y bitácoras anteriores conservan su contexto: se implementaron y verificaron localmente antes de este cotejo de publicación.

## Disponibilidad HTTP sin sesión

| Ruta | Respuesta |
| --- | --- |
| `/login` | **200**, HTML de la aplicación |
| `/api/incomes` | **401**, `Inicia sesión para continuar.` |
| `/api/expenses` | **401**, `Inicia sesión para continuar.` |
| `/api/card-cycles` | **401**, `Inicia sesión para continuar.` |

Las tres API devuelven `Cache-Control: private, no-store` y `Vary: Authorization`. Solo se hicieron lecturas sin credenciales; no se consultaron movimientos privados ni se enviaron escrituras. [Resultados HTTP y momento de la consulta](http.json).

El conector `web_fetch_vercel_url` confirmó el login, pero trató el 401 de Ingresos como `deployment_authentication_required` y no entregó el cuerpo. Se utilizó HTTP directo sin credenciales para observar el rechazo JSON de AFP. No se interpreta ese error del conector como un fallo del despliegue ni se activa un bypass para acceder a la aplicación.

## Límites y reproducción

**READY**, dominio asignado y SHA coincidente acreditan la publicación de ese commit. No acreditan aceptación financiera con Supabase Auth real, aislamiento con dos usuarios reales, comportamiento completo del service worker, sincronización Google, recepción Android, estado del esquema remoto ni ausencia de errores de ejecución en todos los módulos. No se consultan logs de ejecución privados ni se repiten las 934 pruebas locales o las auditorías de dependencias como parte de esta revisión documental.

Para reproducir el cotejo, consultar en Vercel `get_project` con el ID anterior y `get_deployment` con `idOrUrl: finanzas.garatachia.com`, `withGitRepoInfo: true` y el equipo registrado en `vercel.json`. Comparar el SHA observado con Git y verificar los ancestros:

```bash
git rev-parse HEAD origin/master
git merge-base --is-ancestor eead77a 08aee7c
git merge-base --is-ancestor 5d4683c 08aee7c
git merge-base --is-ancestor be59643 08aee7c
git merge-base --is-ancestor ca53e80 08aee7c
git show 08aee7c:package.json
```

El destino de producción puede cambiar después de esta consulta; usar siempre el SHA devuelto por el dominio al repetirla. Los cambios actuales son de documentación y evidencia, y no se han hecho commit ni push desde esta revisión.
