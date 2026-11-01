# ADR 002 — Pruebas de integración con pg-mem (sin Docker)

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

Producción usa PostgreSQL vía docker-compose, pero las pruebas deben correr en cualquier máquina (incluido Windows con Node 24) **sin Docker**. Opciones evaluadas:

| Opción | Problema |
| --- | --- |
| SQLite | Dialecto distinto: habría que mantener dos versiones del SQL |
| Repositorios en memoria | No prueban el SQL real; dos implementaciones que pueden divergir |
| Testcontainers | Requiere Docker en ejecución |
| **pg-mem** | Emula PostgreSQL en memoria y ofrece un adaptador compatible con `pg.Pool` |

## Decisión

Usar **pg-mem** a través de la misma interfaz `Db` que `pg.Pool`. Las pruebas ejecutan **las mismas migraciones** y **los mismos repositorios SQL** que producción. El mismo mecanismo habilita un modo demo `DB_DRIVER=memory`.

## Consecuencias

- ✔ `npm test` funciona sin instalar nada más; la CI no necesita servicios.
- ✔ Se prueba el SQL real (joins, agregaciones, cascadas, CHECK, UNIQUE).
- ✖ pg-mem no soporta todo PostgreSQL (p. ej. subconsultas correlacionadas o CTE recursivas). Se escribió SQL portable: tablas derivadas en lugar de subconsultas correlacionadas y detección de ciclos en el dominio.
- ✖ Algunos tipos difieren (DATE/NUMERIC llegan como `Date`/`number` en pg-mem y como `string` en pg); se normalizan en `infrastructure/db/db.ts` (`asDate`, `asNumber`).
- Mitigación futura: un job opcional de CI con un servicio PostgreSQL real para pruebas de humo.
