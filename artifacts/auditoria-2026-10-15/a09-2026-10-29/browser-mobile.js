(() => {
  const original = window.fetch.bind(window);
  window.__a09Mobile = { pending: [], results: [], events: [] };
  window.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.pathname === '/api/expenses') {
      const tag = url.searchParams.get('startDate') || 'all';
      const response = await original(input, { ...options, signal: undefined });
      return new Promise((resolve, reject) => {
        window.__a09Mobile.pending.push({ tag, signal: options.signal, release(error = false) {
          window.__a09Mobile.events.push({ tag, aborted: options.signal.aborted, error });
          if (error) reject(new Error('Error antiguo móvil A09'));
          else resolve(response);
        } });
      });
    }
    return original(input, options);
  };
  return 'Gates por período instalados.';
})()
