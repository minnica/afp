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

Mi dinero incorpora cuentas, conciliaciones, transferencias, asignación de movimientos, calendario de ingresos y gastos, proyección diaria resumida por mes y escenarios. Los pagos de crédito no duplican el consumo; los cobros pendientes no forman parte del saldo actual. Los rendimientos diarios pueden incorporarse automáticamente como cálculos de AFP, con tramos y calendario de abonos; los abonos reales y las conciliaciones los sustituyen sin duplicarlos. La nómina puede adelantarse al día hábil bancario anterior. La proyección depende de las condiciones configuradas. La interfaz está en español. El proyecto utiliza Next.js, Prisma y los componentes shadcn locales. El código activo de la web utiliza TypeScript/TSX: API, servicios, cálculos, formularios, componentes compartidos, hooks y páginas están tipados. La transición está cerrada: comprobación estricta con `allowJs: false`, sin adaptadores de JavaScript ni archivos vacíos en `src/`. La migración independiente de pruebas y helpers admite temporalmente CJS/TS y comprueba estrictamente los archivos convertidos; el cargador y el piloto de transferencias ya usan contratos tipados. Los scripts operativos, el service worker y Android mantienen sus lenguajes.

## Evidence on Hand

README.md, prisma/schema.prisma y los módulos financieros existentes. Los datos financieros reales no se sustituyen por ejemplos; las pruebas usan datos ficticios aislados.

## Product Principles

- Explicar el origen y la fecha de cada importe.
- Conservar la diferencia entre confirmado, previsto y pendiente de completar.
- Evitar contabilizar dos veces una misma operación.
- Mantener el acceso y la interacción utilizables desde el celular.
