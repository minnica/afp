# Compras a meses: destinatario y pagos recibidos

Implementación local del 29 de octubre de 2026. El propietario solicitó distinguir sus compras de las que realiza para otras personas y consultar los pagos desde el mismo listado. Seleccionó un panel de detalle y reservó para sí la validación visual.

## Comportamiento

- Etiqueta «Para mí» o «Para [persona]» junto al concepto en escritorio y debajo del título en móvil. Cuando existe información de la persona en la cuenta vinculada, esta prevalece sobre la asociación original de la compra.
- Filtro por compras propias, otras personas o una persona concreta, combinado con las pestañas de estado. La búsqueda incluye el nombre; los totales corresponden a las compras filtradas.
- «Ver pagos» abre un Sheet a la derecha en escritorio y desde abajo en móvil. Incluye resumen de recibido, pendiente, monto original y mensualidad acordada, además de cada abono con fecha, concepto, fuente, importe y notas.
- Los ajustes no monetarios se presentan aparte de los ingresos recibidos. Se conservan el principal, las referencias bancarias y las cuotas de la tarjeta. Las etiquetas bancarias se distinguen del saldo por cobrar.
- Estados de carga, reintento, cuenta no vinculada y cuenta sin pagos. Cierre con Escape o botón, devolución del foco, región desplazable por teclado y zona segura inferior. Las consultas se cancelan al cerrar o sustituir el panel y validan el propietario esperado.

## Consulta de datos

`GET /api/installment-purchases/payments?purchaseId=…` exige sesión y comprueba la propiedad de la compra y de la cuenta vinculada. Consulta únicamente esa cuenta y sus ingresos, en una lectura `RepeatableRead`, con fecha descendente y desempate por ID. Reutiliza el selector y el cálculo de Cuentas por cobrar y valida la respuesta en el cliente tipado. No escribe datos.

La lista incorpora solo el nombre de la persona de la cuenta vinculada; el historial completo se obtiene al abrir el panel. Los movimientos conservan su identidad incluso cuando coinciden en fecha e importe. Las fechas bancarias se presentan en UTC para conservar el día almacenado.

## Verificaciones técnicas

| Control | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm typecheck:tests` | Correcto |
| `pnpm test:types` | Correcto, incluido el contrato del nuevo recurso |
| `pnpm lint` | Sin errores; dos advertencias previas en Gastos y TanStack Table |
| `pnpm test` con PostgreSQL local desechable | **1,007 escenarios correctos, cero fallos y cero omisiones** |
| `pnpm build` | Correcto con Turbopack; incluye el nuevo endpoint |
| Detector mecánico Impeccable sobre los tres componentes | Sin hallazgos |

Las regresiones nuevas prueban sesión, cabeceras privadas, selección inválida, bonificaciones separadas, abonos idénticos legítimos, orden y fechas, aislamiento por cuenta y propietario, cuenta vacía y compra sin vínculo. El caso global de contratos envía el identificador requerido al nuevo endpoint. Se verificó con datos ficticios; la autenticación de las integraciones está simulada y PostgreSQL es real.

Los logs adjuntos contienen el último resultado de cada control. La base desechable se creó en `127.0.0.1:55442`, se migró con el historial existente y se eliminó al terminar.

## Alcance y revisión manual

No se abrió un navegador, no se hizo validación visual y no se tomaron capturas, por instrucción del propietario. Los puntos pendientes de revisión manual son la identificación y el filtro de destinatarios, la apertura y cierre del panel en ambos tamaños, y el recorrido del historial y sus estados vacíos. El resultado técnico no acredita una revisión visual.

Sin dependencias nuevas, migraciones nuevas, escrituras en datos reales, commit ni publicación.
