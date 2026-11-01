# ADR 001 — Arquitectura en capas con inyección de dependencias manual

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

El sistema tiene reglas de negocio no triviales (avance ponderado, dependencias sin ciclos, permisos en dos niveles, menciones). Si estas reglas viven dentro de los handlers HTTP o mezcladas con SQL, son difíciles de probar y de cambiar.

## Decisión

- Separar el backend en `domain/`, `application/`, `infrastructure/` y `api/`.
- El dominio contiene **funciones puras** sin dependencias externas.
- Los servicios dependen de **interfaces** (`application/ports.ts`), no de clases concretas.
- La composición se hace a mano en `container.ts`, sin frameworks de DI (InversifyJS, tsyringe).

## Consecuencias

- ✔ Las reglas se prueban con pruebas unitarias instantáneas.
- ✔ La infraestructura es reemplazable (pg / pg-mem / dobles de prueba).
- ✔ Sin decoradores ni "magia": el grafo de dependencias se lee en un archivo.
- ✖ Algo más de código (interfaces y constructor explícito) que un enfoque "todo en el controlador".
- ✖ Si el proyecto crece mucho, el contenedor manual puede volverse largo; en ese punto se evaluaría un contenedor ligero.
