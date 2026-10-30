# AFP

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El propietario utiliza AFP para controlar sus finanzas personales, con acceso desde escritorio y celular.

## Product Purpose

Registrar gastos, ingresos y deudas y anticipar si el dinero disponible alcanza para los pagos futuros.

## Operating Context

La app utiliza saldos capturados por el usuario y movimientos registrados en AFP. El usuario eligió este mecanismo para Mi dinero; la sincronización directa con bancos queda fuera de este alcance.

## Capabilities and Constraints

Mi dinero incorpora cuentas, conciliaciones, transferencias, asignación de movimientos, calendario de ingresos y gastos, proyección diaria resumida por mes y escenarios. Los pagos de crédito no duplican el consumo; los cobros pendientes no forman parte del saldo actual. Los rendimientos diarios pueden incorporarse automáticamente como cálculos de AFP, con tramos y calendario de abonos; los abonos reales y las conciliaciones los sustituyen sin duplicarlos. La nómina puede adelantarse al día hábil bancario anterior. La proyección depende de las condiciones configuradas. La interfaz está en español. El proyecto utiliza Next.js, Prisma y los componentes shadcn locales. El código activo de la web utiliza TypeScript/TSX: API, servicios, cálculos, formularios, componentes compartidos, hooks y páginas están tipados. La transición está cerrada: comprobación estricta con `allowJs: false`, sin adaptadores de JavaScript ni archivos vacíos en `src/`. La migración independiente de pruebas y helpers está completada en sus fases 0–6: todas las pruebas, cargadores, servidores de navegador y seeds usan TypeScript estricto con `allowJs: false`. El ejecutor descubre solo `.test.ts`; la auditoría final conserva los escenarios originales y documenta las fronteras con herramientas JS externas al alcance. Los scripts operativos, el service worker y Android mantienen sus lenguajes.

## Evidence on Hand

La captura Android incorpora recibos de Uber desde notificaciones de Gmail como fuente optativa, publicada e instalada en la APK 0.9.0. Usa fecha e importe explícitos del recibo y terminaciones bancarias verificadas; los avisos recortados requieren revisión. La asociación con cargos bancarios y las propinas conservan evidencia, controles de duplicidad y decisiones personales. No consulta el buzón ni recupera correos históricos. Gmail está seleccionado en el teléfono personal; falta observar una notificación real completa y cotejarla antes de habilitar el formato por tarjeta.

README.md, prisma/schema.prisma y los módulos financieros existentes. Los datos financieros reales no se sustituyen por ejemplos; las pruebas usan datos ficticios aislados.

## Product Principles

- Explicar el origen y la fecha de cada importe.
- Conservar la diferencia entre confirmado, previsto y pendiente de completar.
- Evitar contabilizar dos veces una misma operación.
- Mantener el acceso y la interacción utilizables desde el celular.
