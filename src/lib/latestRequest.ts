// Comparte una lectura en curso con la misma identidad. Cambiar la consulta o
// cancelar descarta la anterior, sin almacenar respuestas ya terminadas.
export function createLatestRequest<T = void>() {
  type Request = { key: string; controller: AbortController; promise: Promise<T> | null };
  let current: Request | null = null;
  return {
    run(key: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (current?.key === key && !current.controller.signal.aborted) return current.promise!;
      current?.controller.abort();
      const request: Request = { key, controller: new AbortController(), promise: null };
      current = request;
      request.promise = Promise.resolve().then(() => {
        if (request.controller.signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
        return operation(request.controller.signal);
      }).finally(() => { if (current === request) current = null; });
      return request.promise;
    },
    cancel() {
      current?.controller.abort();
      current = null;
    },
  };
}
