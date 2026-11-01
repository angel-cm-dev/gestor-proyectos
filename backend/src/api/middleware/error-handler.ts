import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../../domain/errors';

/**
 * Respuesta de error RFC 9457 "Problem Details for HTTP APIs".
 * Todas las respuestas de error de la API tienen esta misma forma, así el
 * frontend las maneja con un único parser.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId?: string;
  errors?: unknown;
}

function send(res: Response, req: Request, problem: Omit<ProblemDetails, 'instance' | 'type' | 'traceId'>) {
  const body: ProblemDetails = {
    // URN estable por tipo de error; el catálogo está en docs/guia-api.md.
    type: `urn:gestor-proyectos:error:${problem.code}`,
    instance: req.originalUrl,
    traceId: String(req.id ?? ''),
    ...problem,
  };
  res.status(problem.status).type('application/problem+json').json(body);
}

export function notFoundHandler(req: Request, res: Response) {
  send(res, req, { status: 404, title: 'Ruta no encontrada', detail: `${req.method} ${req.path} no existe`, code: 'route_not_found' });
}

export function errorHandler(logger: Logger) {
  // Express reconoce el manejador de errores por sus 4 parámetros.
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err }, err.message);
      return send(res, req, { status: err.status, title: err.title, detail: err.message, code: err.code, errors: err.details });
    }

    const e = err as { type?: string; status?: number; code?: string; message?: string };
    if (e?.type === 'entity.parse.failed') {
      return send(res, req, { status: 400, title: 'JSON inválido', detail: 'El cuerpo no es JSON válido', code: 'invalid_json' });
    }
    if (e?.type === 'entity.too.large') {
      return send(res, req, { status: 413, title: 'Cuerpo demasiado grande', detail: 'Máximo 1 MB', code: 'payload_too_large' });
    }
    // Violaciones de restricciones de PostgreSQL que escaparon a las validaciones previas.
    if (e?.code === '23505') {
      return send(res, req, { status: 409, title: 'Conflicto', detail: 'El registro ya existe', code: 'duplicate' });
    }
    if (e?.code === '23503') {
      return send(res, req, { status: 409, title: 'Conflicto', detail: 'El registro está referenciado o no existe', code: 'foreign_key' });
    }

    // Error inesperado: se registra completo pero NO se filtran detalles internos al cliente.
    logger.error({ err, traceId: req.id }, 'Error no controlado');
    return send(res, req, {
      status: 500,
      title: 'Error interno',
      detail: 'Ocurrió un error inesperado. Usa el traceId para rastrearlo en los logs.',
      code: 'internal_error',
    });
  };
}
