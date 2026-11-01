/**
 * Errores de dominio/aplicación. El manejador global los traduce a respuestas
 * RFC 9457 (Problem Details), así ninguna capa interna necesita conocer HTTP.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'Datos inválidos', message, 'validation_error', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Debes iniciar sesión') {
    super(401, 'No autenticado', message, 'unauthorized');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permisos para esta acción') {
    super(403, 'Acceso denegado', message, 'forbidden');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: number | string) {
    super(
      404,
      'Recurso no encontrado',
      id === undefined ? `${resource} no encontrado` : `${resource} ${id} no encontrado`,
      'not_found',
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'conflict') {
    super(409, 'Conflicto', message, code);
  }
}

/** Regla de negocio violada: la petición es válida en forma pero no puede ejecutarse. */
export class BusinessRuleError extends AppError {
  constructor(message: string, code: string, details?: unknown) {
    super(422, 'Regla de negocio incumplida', message, code, details);
  }
}
