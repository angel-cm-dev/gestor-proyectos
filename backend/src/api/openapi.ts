/**
 * Especificación OpenAPI 3.1 de la API (servida en /api/docs y /api/openapi.json).
 * Se mantiene a mano y concisa: documenta contratos, códigos de error y seguridad.
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: ref('Problem') } } });
const idPath = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const errors = {
  400: problem('Datos inválidos'),
  401: problem('No autenticado'),
  403: problem('Sin permisos'),
  404: problem('No encontrado'),
};
const page = (item: string) => ({
  type: 'object',
  properties: {
    items: { type: 'array', items: ref(item) },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
});

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Gestor de Proyectos API',
    version: '1.0.0',
    description:
      'API REST para gestionar proyectos, tareas (kanban, subtareas, dependencias), horas y reportes. ' +
      'Errores en formato RFC 9457 (application/problem+json). Usuario demo: admin@demo.pe / Demo123!',
    license: { name: 'MIT' },
    contact: { name: 'Angel Castañeda Meza', url: 'https://github.com/angel-cm-dev' },
  },
  servers: [{ url: '/api' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth' },
    { name: 'Usuarios' },
    { name: 'Proyectos' },
    { name: 'Tareas' },
    { name: 'Horas' },
    { name: 'Reportes' },
    { name: 'Notificaciones' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Problem: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
          instance: { type: 'string' },
          code: { type: 'string', examples: ['dependencies_pending'] },
          traceId: { type: 'string' },
          errors: {},
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          username: { type: 'string' },
          role: { enum: ['admin', 'lider', 'miembro'] },
          active: { type: 'boolean' },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string' },
          status: { enum: ['planificado', 'activo', 'pausado', 'cerrado'] },
          startDate: { type: ['string', 'null'], format: 'date' },
          endDate: { type: ['string', 'null'], format: 'date' },
          progress: { type: 'number', description: 'Avance 0-100 (ver docs/arquitectura.md)' },
          myRole: { enum: ['gestor', 'colaborador', 'observador', null] },
        },
      },
      ProjectInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          status: { enum: ['planificado', 'activo', 'pausado', 'cerrado'] },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          projectId: { type: 'integer' },
          parentId: { type: ['integer', 'null'] },
          title: { type: 'string' },
          status: { enum: ['pendiente', 'en_progreso', 'en_revision', 'hecha'] },
          priority: { enum: ['baja', 'media', 'alta', 'critica'] },
          assigneeId: { type: ['integer', 'null'] },
          estimatedHours: { type: 'number' },
          dueDate: { type: ['string', 'null'], format: 'date' },
          labels: { type: 'array', items: { type: 'object' } },
          dependsOn: { type: 'array', items: { type: 'integer' } },
        },
      },
      TaskInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          status: { enum: ['pendiente', 'en_progreso', 'en_revision', 'hecha'] },
          priority: { enum: ['baja', 'media', 'alta', 'critica'] },
          assigneeId: { type: ['integer', 'null'] },
          estimatedHours: { type: 'number' },
          startDate: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
          parentId: { type: 'integer' },
          labelIds: { type: 'array', items: { type: 'integer' } },
        },
      },
      TimeEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          taskId: { type: 'integer' },
          userId: { type: 'integer' },
          workDate: { type: 'string', format: 'date' },
          minutes: { type: 'integer' },
          note: { type: 'string' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          body: { type: 'string' },
          authorName: { type: 'string' },
          mentions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión (devuelve JWT)',
        security: [],
        requestBody: json({
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string', example: 'admin@demo.pe' }, password: { type: 'string', example: 'Demo123!' } },
        }),
        responses: { 200: { description: 'Token y usuario' }, 400: errors[400], 401: errors[401] },
      },
    },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Usuario actual', responses: { 200: json(ref('User')), 401: errors[401] } } },
    '/users': {
      get: {
        tags: ['Usuarios'],
        summary: 'Directorio de usuarios (paginado)',
        parameters: [...pageParams, { name: 'search', in: 'query' }, { name: 'role', in: 'query' }],
        responses: { 200: json(page('User')) },
      },
      post: { tags: ['Usuarios'], summary: 'Crear usuario (admin)', responses: { 201: json(ref('User')), ...errors, 409: problem('Correo o usuario en uso') } },
    },
    '/users/{id}': { patch: { tags: ['Usuarios'], summary: 'Editar usuario (admin)', parameters: [idPath], responses: { 200: json(ref('User')), ...errors } } },
    '/dashboard': { get: { tags: ['Reportes'], summary: 'KPIs del usuario actual', responses: { 200: { description: 'KPIs' } } } },
    '/reports/workload': {
      get: {
        tags: ['Reportes'],
        summary: 'Carga de trabajo por persona (admin, lider)',
        parameters: [{ name: 'from', in: 'query' }, { name: 'to', in: 'query' }],
        responses: { 200: { description: 'Filas por persona con % de carga' }, 403: errors[403] },
      },
    },
    '/projects': {
      get: {
        tags: ['Proyectos'],
        summary: 'Listar proyectos visibles (paginado, filtros, orden)',
        parameters: [
          ...pageParams,
          { name: 'search', in: 'query' },
          { name: 'status', in: 'query' },
          { name: 'sort', in: 'query', schema: { enum: ['name', 'createdAt', 'endDate', 'status'] } },
          { name: 'order', in: 'query', schema: { enum: ['asc', 'desc'] } },
        ],
        responses: { 200: json(page('Project')) },
      },
      post: { tags: ['Proyectos'], summary: 'Crear proyecto (admin, lider)', requestBody: json(ref('ProjectInput')), responses: { 201: json(ref('Project')), ...errors } },
    },
    '/projects/{id}': {
      get: { tags: ['Proyectos'], summary: 'Detalle con avance, miembros y etiquetas', parameters: [idPath], responses: { 200: json(ref('Project')), ...errors } },
      patch: { tags: ['Proyectos'], summary: 'Editar (gestor)', parameters: [idPath], requestBody: json(ref('ProjectInput')), responses: { 200: json(ref('Project')), ...errors } },
      delete: { tags: ['Proyectos'], summary: 'Eliminar (admin)', parameters: [idPath], responses: { 204: { description: 'Eliminado' }, ...errors } },
    },
    '/projects/{id}/members': {
      get: { tags: ['Proyectos'], summary: 'Miembros', parameters: [idPath], responses: { 200: { description: 'Lista' } } },
      post: { tags: ['Proyectos'], summary: 'Agregar miembro (gestor)', parameters: [idPath], responses: { 201: { description: 'Miembros' }, ...errors, 409: problem('Ya es miembro') } },
    },
    '/projects/{id}/members/{userId}': {
      patch: { tags: ['Proyectos'], summary: 'Cambiar rol en el proyecto', parameters: [idPath], responses: { 200: { description: 'Miembros' }, 422: problem('Último gestor') } },
      delete: { tags: ['Proyectos'], summary: 'Quitar miembro', parameters: [idPath], responses: { 204: { description: 'Quitado' }, 422: problem('Último gestor') } },
    },
    '/projects/{id}/labels': {
      get: { tags: ['Proyectos'], summary: 'Etiquetas', parameters: [idPath], responses: { 200: { description: 'Lista' } } },
      post: { tags: ['Proyectos'], summary: 'Crear etiqueta', parameters: [idPath], responses: { 201: { description: 'Etiqueta' } } },
    },
    '/projects/{id}/tasks': {
      get: {
        tags: ['Tareas'],
        summary: 'Listar tareas (paginado, filtros, orden)',
        parameters: [
          idPath,
          ...pageParams,
          { name: 'status', in: 'query' },
          { name: 'priority', in: 'query' },
          { name: 'assigneeId', in: 'query' },
          { name: 'labelId', in: 'query' },
          { name: 'search', in: 'query' },
          { name: 'overdue', in: 'query' },
          { name: 'topLevel', in: 'query', schema: { type: 'boolean', default: true } },
          { name: 'sort', in: 'query', schema: { enum: ['position', 'dueDate', 'priority', 'createdAt', 'title'] } },
        ],
        responses: { 200: json(page('Task')) },
      },
      post: { tags: ['Tareas'], summary: 'Crear tarea o subtarea', parameters: [idPath], requestBody: json(ref('TaskInput')), responses: { 201: json(ref('Task')), ...errors, 422: problem('Regla de negocio') } },
    },
    '/projects/{id}/board': { get: { tags: ['Tareas'], summary: 'Tablero kanban', parameters: [idPath], responses: { 200: { description: 'Columnas por estado' } } } },
    '/projects/{id}/reports/hours': {
      get: {
        tags: ['Reportes'],
        summary: 'Reporte de horas del proyecto (JSON o CSV)',
        parameters: [idPath, { name: 'from', in: 'query' }, { name: 'to', in: 'query' }, { name: 'format', in: 'query', schema: { enum: ['json', 'csv'] } }],
        responses: { 200: { description: 'Reporte', content: { 'application/json': {}, 'text/csv': {} } }, 403: errors[403] },
      },
    },
    '/tasks/{id}': {
      get: { tags: ['Tareas'], summary: 'Detalle (subtareas, dependencias, avance, horas)', parameters: [idPath], responses: { 200: json(ref('Task')), ...errors } },
      patch: { tags: ['Tareas'], summary: 'Editar tarea', parameters: [idPath], requestBody: json(ref('TaskInput')), responses: { 200: json(ref('Task')), 422: problem('dependencies_pending / subtasks_pending') } },
      delete: { tags: ['Tareas'], summary: 'Eliminar tarea (gestor)', parameters: [idPath], responses: { 204: { description: 'Eliminada' } } },
    },
    '/tasks/{id}/move': {
      post: {
        tags: ['Tareas'],
        summary: 'Mover en el kanban (estado + posición)',
        parameters: [idPath],
        requestBody: json({ type: 'object', properties: { status: { type: 'string' }, position: { type: 'integer' } } }),
        responses: { 200: json(ref('Task')), 422: problem('Dependencias pendientes') },
      },
    },
    '/tasks/{id}/dependencies': {
      post: {
        tags: ['Tareas'],
        summary: 'Agregar dependencia (rechaza ciclos)',
        parameters: [idPath],
        requestBody: json({ type: 'object', properties: { dependsOnId: { type: 'integer' } } }),
        responses: { 201: { description: 'Dependencias' }, 409: problem('Ya existe'), 422: problem('dependency_cycle') },
      },
    },
    '/tasks/{id}/comments': {
      get: { tags: ['Tareas'], summary: 'Comentarios', parameters: [idPath], responses: { 200: { description: 'Lista' } } },
      post: { tags: ['Tareas'], summary: 'Comentar (detecta @menciones y notifica)', parameters: [idPath], responses: { 201: json(ref('Comment')) } },
    },
    '/tasks/{id}/time-entries': {
      get: { tags: ['Horas'], summary: 'Horas de la tarea', parameters: [idPath], responses: { 200: { description: 'Lista' } } },
      post: {
        tags: ['Horas'],
        summary: 'Registrar horas',
        parameters: [idPath],
        requestBody: json({ type: 'object', properties: { workDate: { type: 'string' }, minutes: { type: 'integer' }, hours: { type: 'number' }, note: { type: 'string' } } }),
        responses: { 201: json(ref('TimeEntry')), 422: problem('future_date / daily_limit') },
      },
    },
    '/time-entries': {
      get: { tags: ['Horas'], summary: 'Mi timesheet (paginado)', parameters: [...pageParams, { name: 'from', in: 'query' }, { name: 'to', in: 'query' }], responses: { 200: json(page('TimeEntry')) } },
    },
    '/time-entries/{id}': { delete: { tags: ['Horas'], summary: 'Eliminar registro', parameters: [idPath], responses: { 204: { description: 'Eliminado' } } } },
    '/notifications': { get: { tags: ['Notificaciones'], summary: 'Mis notificaciones', parameters: [...pageParams, { name: 'unread', in: 'query' }], responses: { 200: { description: 'Página + no leídas' } } } },
    '/notifications/{id}/read': { post: { tags: ['Notificaciones'], summary: 'Marcar como leída', parameters: [idPath], responses: { 204: { description: 'OK' } } } },
    '/notifications/read-all': { post: { tags: ['Notificaciones'], summary: 'Marcar todas como leídas', responses: { 200: { description: 'OK' } } } },
  },
} as const;
