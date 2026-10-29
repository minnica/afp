(() => {
  const original = window.fetch.bind(window);
  window.__a09 = { pending: [], events: [] };
  window.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    const tag = url.searchParams.get('concept');
    if (url.pathname === '/api/expenses' && ['Alpha', 'Beta', '__a09_error'].includes(tag)) {
      const response = await original(input, { ...options, signal: undefined });
      return new Promise((resolve, reject) => {
        const entry = { tag, signal: options.signal, release(error = false) {
          window.__a09.events.push({ tag, aborted: options.signal.aborted, error });
          if (error) reject(new Error('Error antiguo A09 inyectado'));
          else resolve(response);
        } };
        window.__a09.pending.push(entry);
      });
    }
    return original(input, options);
  };
  return 'Gates instalados; transporte ignora abort para comprobar la generación.';
})()
