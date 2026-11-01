# ADR 003 — Errores con Problem Details (RFC 9457) y 422 para reglas de negocio

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

El frontend necesita distinguir "dato mal escrito" de "operación no permitida por el negocio" (p. ej. cerrar una tarea con dependencias abiertas) y mostrar mensajes útiles sin parsear textos libres.

## Decisión

- Todas las respuestas de error usan `application/problem+json` con `type`, `title`, `status`, `detail`, `instance`, más extensiones `code` (estable, legible por máquina), `traceId` y `errors`.
- **400** = la forma de la petición es inválida (zod), con `errors: [{ field, message }]`.
- **422** = la petición es válida pero viola una regla de negocio (`dependencies_pending`, `dependency_cycle`, `last_manager`, `daily_limit`...), con `errors` describiendo la causa (p. ej. las tareas bloqueantes).
- **409** = conflicto de unicidad (`email_taken`, `already_member`, `dependency_exists`).

## Consecuencias

- ✔ Un único parser en el frontend (`ApiError`) que muestra `detail` y mapea `errors` a campos del formulario.
- ✔ `code` permite reaccionar sin depender del texto en español.
- ✔ `traceId` conecta un error visto por el usuario con la línea exacta del log (pino).
- ✖ Requiere disciplina: toda regla nueva debe lanzar `BusinessRuleError` con un `code` documentado en `docs/guia-api.md`.
