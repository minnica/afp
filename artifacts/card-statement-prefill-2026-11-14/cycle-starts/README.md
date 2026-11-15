# Inicio del siguiente ciclo desde el corte real

Extensión local del 14 de noviembre de 2026. Sin publicación, migraciones nuevas ni modificaciones de datos personales. Pruebas con PostgreSQL desechable y operaciones ficticias; el fixture de navegador simula únicamente Auth y conserva API y persistencia reales locales.

## Regla implementada

- Guardar las fechas mediante `UPDATE_DATES` o `UPDATE_STATEMENT` con fechas confirma el ciclo actual y ajusta el inicio del mes inmediato siguiente de la misma tarjeta y propietario a **corte real + un día**.
- Solo cambia el inicio de un ciclo con `datesConfirmedAt = null`. No confirma sus otras fechas ni cambia corte, límite de pago, estado de cuenta, pagos, devoluciones o notas. Un inicio confirmado se respeta y continúa editable.
- Si falta el siguiente ciclo, la generación posterior utiliza el corte confirmado del mes anterior. Incluye diciembre → enero y conserva el día bancario almacenado, incluso con timestamps de medianoche.
- La generación mantiene el día habitual cuando no hay un corte anterior confirmado. También alinea ciclos existentes sin confirmar. Repetirla no vuelve a escribir inicios que ya coinciden.
- Se usa el mes de corte inmediatamente siguiente; no se salta un mes faltante ni se extiende la regla a otra tarjeta. Heredar el inicio no convierte un corte estimado en confirmado ni propaga ese corte a otros meses.
- Cambiar solo el monto o el pago no confirma fechas ni propaga el inicio.
- La confirmación y la actualización del siguiente ciclo comparten una transacción. Un inicio igual o posterior al siguiente corte devuelve `409` con una explicación y revierte todo. Un fallo después de escribir la segunda fila también revierte ambas.
- La generación y la confirmación toman el mismo bloqueo por tarjeta antes de trabajar con sus ciclos. Esto protege también la creación concurrente de un siguiente ciclo todavía inexistente.

Los cortes guardados antes de esta extensión se enlazan al volver a guardar sus fechas o al generar ciclos. No hay una migración de datos ni escrituras desde GET.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| `pnpm typecheck`, `pnpm typecheck:tests`, `pnpm test:types` | Correctos |
| Comprobación final de tipos de pruebas y ESLint de los archivos del lote | Correctos |
| `pnpm lint` | Sin errores; tres advertencias previas en componentes fuera de este lote |
| `pnpm build` | Correcto |
| Pruebas focalizadas con PostgreSQL | 40 correctas, sin fallos ni omisiones |
| Suite completa con PostgreSQL | 1,208 correctas, sin fallos ni omisiones |
| `pnpm db:verify` | Reconstrucción y actualización correctas, 46 migraciones y 46 tablas con RLS; 1,208 regresiones correctas sin omisiones |

Las once nuevas situaciones de integración cubren correcciones hacia delante y atrás, confirmación sin cambio de corte, guardado conjunto con estado de cuenta, inicios confirmados y su edición manual, propiedad y tarjetas, meses faltantes, febrero normal y bisiesto, diciembre → enero, conservación de datos y ausencia de confirmaciones implícitas, períodos imposibles, rollback después de escritura real, generación repetida y operaciones concurrentes. La concurrencia entre generación y confirmación se comprueba con un propietario aislado y una sola tarjeta para que ambas operaciones compitan desde el primer ciclo.

## Recorrido comprobado en navegador

1. Un aviso «Tarjeta cortada: Tarjeta continuidad» abrió el formulario de noviembre con corte previsto `2026-11-12`.
2. Se capturó un estado de cuenta de `1234.56` y se eligió el corte real `2026-11-14` mediante el calendario. Guardar respondió `200` y recargó ciclos, tarjetas y avisos.
3. Una lectura independiente confirmó noviembre con corte `2026-11-14`, inicio `2026-10-13`, límite `2026-12-04`, monto `1234.56` y fechas confirmadas.
4. La misma lectura confirmó diciembre con inicio heredado `2026-11-15`, corte `2026-12-12`, límite `2027-01-04`, monto sin capturar y fechas todavía sin confirmar.
5. Al seleccionar diciembre en Tarjetas y abrir «Cuenta», el formulario mostró el inicio `15/11/2026` y los otros valores de diciembre, con la fecha de inicio editable.

[Captura del formulario del siguiente ciclo](next-cycle-form.png). Navegador de escritorio local; los cambios de interfaz pertenecen al flujo previo y este lote modifica su comportamiento de persistencia. No acredita una prueba autenticada de producción.

Los logs conservan las verificaciones. Al terminar se cierran navegador, fixture y contenedor desechable.
