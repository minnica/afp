// Comparte una lectura en curso con la misma identidad. Cambiar la consulta o
// cancelar descarta la anterior, sin almacenar respuestas ya terminadas.
export function createLatestRequest() {
  let current = null;
  return {
    run(key, operation) {
      if (current?.key === key && !current.controller.signal.aborted) return current.promise;
      current?.controller.abort();
      const request = { key, controller: new AbortController(), promise: null };
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
