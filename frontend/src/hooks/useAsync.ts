import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

/**
 * Carga datos asíncronos con estados loading / error / data.
 * Ignora respuestas "viejas": si las dependencias cambian antes de que termine
 * una petición, su resultado se descarta (evita condiciones de carrera al filtrar).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (id === requestId.current) setDataState(result);
      })
      .catch((err) => {
        if (id === requestId.current) setError(err);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater));
  }, []);

  return { data, error, loading, reload, setData };
}

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
