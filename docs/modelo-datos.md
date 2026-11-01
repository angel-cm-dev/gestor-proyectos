# Modelo de datos

Esquema definido en [`backend/migrations/001_esquema_inicial.sql`](../backend/migrations/001_esquema_inicial.sql). Compatible con PostgreSQL 16 y con pg-mem (pruebas).

```mermaid
erDiagram
    users ||--o{ projects : "es dueño de"
    users ||--o{ project_members : "participa en"
    projects ||--o{ project_members : "tiene"
    projects ||--o{ labels : "define"
    projects ||--o{ tasks : "contiene"
    tasks ||--o{ tasks : "subtareas (parent_id)"
    users ||--o{ tasks : "responsable"
    tasks ||--o{ task_labels : ""
    labels ||--o{ task_labels : ""
    tasks ||--o{ task_dependencies : "depende de"
    tasks ||--o{ time_entries : "registra"
    users ||--o{ time_entries : "trabaja"
    tasks ||--o{ comments : "tiene"
    users ||--o{ comments : "escribe"
    comments ||--o{ comment_mentions : "menciona"
    users ||--o{ comment_mentions : "es mencionado"
    users ||--o{ notifications : "recibe"

    users {
        serial id PK
        varchar name
        varchar email UK
        varchar username UK "para @menciones"
        varchar password_hash "bcrypt"
        varchar role "admin | lider | miembro"
        boolean active
        timestamptz created_at
    }
    projects {
        serial id PK
        varchar name
        text description
        varchar status "planificado | activo | pausado | cerrado"
        date start_date
        date end_date
        int owner_id FK
    }
    project_members {
        int project_id PK,FK
        int user_id PK,FK
        varchar role "gestor | colaborador | observador"
        timestamptz joined_at
    }
    labels {
        serial id PK
        int project_id FK
        varchar name "único por proyecto"
        varchar color "#rrggbb"
    }
    tasks {
        serial id PK
        int project_id FK
        int parent_id FK "null = primer nivel"
        varchar title
        varchar status "pendiente | en_progreso | en_revision | hecha"
        varchar priority "baja | media | alta | critica"
        int assignee_id FK
        numeric estimated_hours
        date start_date
        date due_date
        int position "orden en la columna"
        int created_by FK
        timestamptz completed_at
    }
    task_labels {
        int task_id PK,FK
        int label_id PK,FK
    }
    task_dependencies {
        int task_id PK,FK "esta tarea..."
        int depends_on_id PK,FK "...depende de esta"
    }
    time_entries {
        serial id PK
        int task_id FK
        int user_id FK
        date work_date
        int minutes "1..1440"
        varchar note
    }
    comments {
        serial id PK
        int task_id FK
        int author_id FK
        text body
    }
    comment_mentions {
        int comment_id PK,FK
        int user_id PK,FK
    }
    notifications {
        serial id PK
        int user_id FK
        varchar type "mencion | asignacion"
        varchar message
        int task_id FK
        int project_id FK
        int comment_id FK
        timestamptz read_at "null = no leída"
    }
```

## Tablas

| Tabla | Propósito | Notas de diseño |
| --- | --- | --- |
| `users` | Cuentas del sistema | `email` y `username` únicos (normalizados a minúsculas). `active=false` revoca el acceso sin borrar historial |
| `projects` | Proyectos | `owner_id` = creador. `updated_at` se actualiza en cada edición |
| `project_members` | Rol **por proyecto** | PK compuesta evita membresías duplicadas. Índice por `user_id` para "mis proyectos" |
| `labels` | Etiquetas propias de cada proyecto | `UNIQUE(project_id, name)`; se borran en cascada con el proyecto |
| `tasks` | Tareas y subtareas | `parent_id` autorreferencia (un nivel, regla en el servicio). `position` ordena la columna del kanban. `completed_at` alimenta "terminadas en 7 días" |
| `task_labels` | N:M tareas ↔ etiquetas | |
| `task_dependencies` | Grafo dirigido de dependencias | `CHECK (task_id <> depends_on_id)` evita autodependencia; los ciclos más largos se validan en el dominio |
| `time_entries` | Timesheet | Minutos enteros (evita errores de redondeo con decimales). `CHECK 1..1440`. Índice `(user_id, work_date)` para el límite diario y la vista semanal |
| `comments` | Comentarios de tareas | |
| `comment_mentions` | Registro de menciones | Permite saber a quién se mencionó aunque el texto se edite en el futuro |
| `notifications` | Bandeja de cada usuario | `read_at` nulo = no leída. Índice `(user_id, read_at)` para contar no leídas rápido |
| `schema_migrations` | Control de migraciones aplicadas | La crea el ejecutor de migraciones |

## Integridad referencial

- Borrar un **proyecto** elimina en cascada miembros, etiquetas, tareas y, por ende, horas, comentarios y notificaciones asociadas.
- Borrar una **tarea** elimina sus subtareas, dependencias, horas y comentarios.
- Si se borra un usuario responsable, `assignee_id` pasa a `NULL` (`ON DELETE SET NULL`); en la práctica los usuarios se **desactivan**, no se borran.

## ¿Por qué `VARCHAR + CHECK` y no `ENUM`?

Los `CHECK` son igual de seguros, más fáciles de modificar en una migración (agregar un estado no requiere `ALTER TYPE`) y funcionan en pg-mem, lo que permite que las pruebas ejecuten exactamente el mismo esquema que producción.
