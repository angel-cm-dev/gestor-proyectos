# Guía de la API

Base: `http://localhost:3000/api` (o `http://localhost:8080/api` vía nginx). Documentación interactiva: `/api/docs` · Contrato: `/api/openapi.json`.

Los ejemplos usan bash. En PowerShell reemplaza `\` final de línea por `` ` `` y usa `curl.exe`.

## 1. Autenticación

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lider@demo.pe","password":"Demo123!"}'
# {"token":"eyJhbGciOi...","user":{"id":2,"name":"Lucía Ramos","role":"lider",...}}

TOKEN="eyJhbGciOi..."   # copia el token de la respuesta
AUTH="Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/auth/me -H "$AUTH"
```

## 2. Proyectos

```bash
# Paginación, búsqueda, filtro y orden
curl -s "http://localhost:3000/api/projects?page=1&pageSize=10&search=portal&status=activo&sort=name&order=asc" -H "$AUTH"

# Crear (admin o lider; el creador queda como gestor)
curl -s -X POST http://localhost:3000/api/projects -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Intranet RR.HH.","description":"Portal interno","startDate":"2026-12-01","endDate":"2027-03-31"}'

# Detalle con avance %, miembros y etiquetas
curl -s http://localhost:3000/api/projects/1 -H "$AUTH"

# Agregar miembro con rol por proyecto
curl -s -X POST http://localhost:3000/api/projects/3/members -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"userId":3,"role":"colaborador"}'
```

## 3. Tareas, subtareas y dependencias

```bash
# Listar con filtros (topLevel=true por defecto)
curl -s "http://localhost:3000/api/projects/1/tasks?status=pendiente&priority=alta&overdue=true&sort=priority&order=desc" -H "$AUTH"

# Crear tarea
curl -s -X POST http://localhost:3000/api/projects/1/tasks -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"title":"Documentar API","priority":"media","assigneeId":3,"estimatedHours":4,"dueDate":"2026-12-15","labelIds":[2]}'

# Crear subtarea
curl -s -X POST http://localhost:3000/api/projects/1/tasks -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"title":"Ejemplos curl","parentId":3}'

# Dependencia: la tarea 10 depende de la 3
curl -s -X POST http://localhost:3000/api/tasks/10/dependencies -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"dependsOnId":3}'

# Intentar cerrar una tarea bloqueada → 422 dependencies_pending
curl -s -X PATCH http://localhost:3000/api/tasks/10 -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"hecha"}'

# Mover en el kanban (estado + posición dentro de la columna)
curl -s -X POST http://localhost:3000/api/tasks/9/move -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"en_revision","position":0}'

# Tablero completo
curl -s http://localhost:3000/api/projects/1/board -H "$AUTH"
```

## 4. Comentarios y menciones

```bash
curl -s -X POST http://localhost:3000/api/tasks/7/comments -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"body":"@mario @carla revisen la configuración SMTP"}'
# {"id":5,...,"mentions":["carla","mario"],"ignoredMentions":[]}

# Notificaciones del usuario autenticado
curl -s "http://localhost:3000/api/notifications?unread=true" -H "$AUTH"
curl -s -X POST http://localhost:3000/api/notifications/1/read -H "$AUTH"
```

## 5. Horas y reportes

```bash
# Registrar horas (minutes u hours)
curl -s -X POST http://localhost:3000/api/tasks/9/time-entries -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"workDate":"2026-11-01","hours":1.5,"note":"Corrección y prueba"}'

# Mi timesheet de la semana
curl -s "http://localhost:3000/api/time-entries?from=2026-10-26&to=2026-11-01" -H "$AUTH"

# Reporte de horas del proyecto (gestor) en JSON y en CSV
curl -s "http://localhost:3000/api/projects/1/reports/hours?from=2026-10-01&to=2026-11-30" -H "$AUTH"
curl -s -OJ "http://localhost:3000/api/projects/1/reports/hours?format=csv&from=2026-10-01&to=2026-11-30" -H "$AUTH"

# Carga de trabajo (admin, lider) y dashboard
curl -s "http://localhost:3000/api/reports/workload" -H "$AUTH"
curl -s http://localhost:3000/api/dashboard -H "$AUTH"
```

## 6. Paginación

Los listados devuelven:

```json
{ "items": [], "total": 23, "page": 2, "pageSize": 10, "totalPages": 3 }
```

`pageSize` máximo: 100. Las columnas de orden aceptadas están en una lista blanca (ver OpenAPI).

## 7. Catálogo de errores

Formato RFC 9457 (`application/problem+json`). El campo `type` es `urn:gestor-proyectos:error:<code>`.

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `validation_error` | Datos con formato inválido; `errors` = `[{field, message}]` |
| 400 | `invalid_json` | Cuerpo no es JSON válido |
| 401 | `unauthorized` | Falta token, token inválido/expirado, usuario inactivo o credenciales incorrectas |
| 403 | `forbidden` | El rol global o el rol en el proyecto no permite la acción |
| 404 | `not_found` / `route_not_found` | Recurso o ruta inexistente |
| 409 | `email_taken`, `username_taken` | Usuario duplicado |
| 409 | `already_member`, `label_exists`, `dependency_exists` | Duplicados de negocio |
| 409 | `self_lockout` | Un admin intenta quitarse su rol o desactivarse |
| 422 | `dependencies_pending` | Cerrar una tarea con dependencias abiertas (`errors` lista cuáles) |
| 422 | `subtasks_pending` | Cerrar una tarea con subtareas abiertas |
| 422 | `dependency_cycle` | La dependencia crearía un ciclo |
| 422 | `cross_project` | Dependencia entre proyectos distintos |
| 422 | `task_already_done` | Agregar dependencia pendiente a una tarea terminada |
| 422 | `subtask_depth` | Subtarea de una subtarea |
| 422 | `parent_closed` | Subtarea abierta bajo un padre terminado |
| 422 | `assignee_not_member` | El responsable no es miembro del proyecto |
| 422 | `invalid_labels` | Etiquetas de otro proyecto |
| 422 | `last_manager` | Dejar el proyecto sin gestor |
| 422 | `future_date` / `daily_limit` | Horas a futuro o más de 24 h en un día |
| 500 | `internal_error` | Error inesperado (buscar `traceId` en los logs) |
