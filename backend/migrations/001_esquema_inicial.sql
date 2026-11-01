-- 001: esquema inicial del Gestor de Proyectos.
-- Compatible con PostgreSQL 16 y con pg-mem (usado en las pruebas sin Docker),
-- por eso se usan SERIAL y CHECK en lugar de tipos ENUM o extensiones.

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  username      VARCHAR(40)  NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'lider', 'miembro')),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT         NOT NULL DEFAULT '',
  status      VARCHAR(20)  NOT NULL DEFAULT 'activo'
              CHECK (status IN ('planificado', 'activo', 'pausado', 'cerrado')),
  start_date  DATE,
  end_date    DATE,
  owner_id    INTEGER      NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Rol por proyecto: un usuario puede ser gestor en un proyecto y observador en otro.
CREATE TABLE project_members (
  project_id INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('gestor', 'colaborador', 'observador')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON project_members(user_id);

CREATE TABLE labels (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       VARCHAR(40) NOT NULL,
  color      VARCHAR(7)  NOT NULL DEFAULT '#6366f1',
  UNIQUE (project_id, name)
);

-- parent_id permite subtareas (un solo nivel, regla aplicada en el servicio).
CREATE TABLE tasks (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id       INTEGER      REFERENCES tasks(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT         NOT NULL DEFAULT '',
  status          VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                  CHECK (status IN ('pendiente', 'en_progreso', 'en_revision', 'hecha')),
  priority        VARCHAR(10)  NOT NULL DEFAULT 'media'
                  CHECK (priority IN ('baja', 'media', 'alta', 'critica')),
  assignee_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  estimated_hours NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (estimated_hours >= 0),
  start_date      DATE,
  due_date        DATE,
  position        INTEGER      NOT NULL DEFAULT 0,
  created_by      INTEGER      NOT NULL REFERENCES users(id),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);

CREATE TABLE task_labels (
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- "task_id depende de depends_on_id". La ausencia de ciclos se valida en el dominio.
CREATE TABLE task_dependencies (
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

CREATE TABLE time_entries (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER      NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date  DATE         NOT NULL,
  minutes    INTEGER      NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  note       VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, work_date);
CREATE INDEX idx_time_entries_task ON time_entries(task_id);

CREATE TABLE comments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER     NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON comments(task_id);

-- Registro de menciones: quién fue mencionado en qué comentario.
CREATE TABLE comment_mentions (
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20)  NOT NULL CHECK (type IN ('mencion', 'asignacion')),
  message    VARCHAR(300) NOT NULL,
  task_id    INTEGER      REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER      REFERENCES projects(id) ON DELETE CASCADE,
  comment_id INTEGER      REFERENCES comments(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
