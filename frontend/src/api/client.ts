import type { ProblemDetails } from './types';

/**
 * Cliente HTTP mínimo sobre fetch:
 * - Adjunta el JWT guardado.
 * - Convierte cualquier error en ApiError a partir del Problem Details del backend.
 * - Ante un 401 limpia la sesión y avisa a la app (que redirige al login).
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'gp-token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    return this.problem.code;
  }

  /** Errores por campo de una respuesta 400 (validación zod). */
  get fieldErrors(): Record<string, string> {
    const errors = this.problem.errors;
    if (!Array.isArray(errors)) return {};
    const result: Record<string, string> = {};
    for (const e of errors as Array<{ field?: string; message?: string }>) {
      if (e?.field && e.message && !result[e.field]) result[e.field] = e.message;
    }
    return result;
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/** Convierte una respuesta fallida en ProblemDetails aunque el cuerpo no sea JSON. */
export async function toProblem(res: Response): Promise<ProblemDetails> {
  try {
    const body = await res.json();
    if (body && typeof body === 'object' && 'title' in body) return body as ProblemDetails;
  } catch {
    /* cuerpo vacío o no JSON */
  }
  return { title: res.statusText || 'Error', status: res.status, detail: `Error HTTP ${res.status}` };
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(params?: Query): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { title: 'Sin conexión', status: 0, detail: 'No se pudo contactar con el servidor' });
  }

  if (res.status === 401 && path !== '/auth/login') {
    tokenStore.clear();
    onUnauthorized?.();
  }
  if (!res.ok) throw new ApiError(res.status, await toProblem(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Descarga un archivo autenticado (p. ej. CSV) respetando el nombre que envía el servidor. */
export async function download(path: string, query: Query, fallbackName: string): Promise<void> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE_URL}${path}${buildQuery(query)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, await toProblem(res));
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
};
