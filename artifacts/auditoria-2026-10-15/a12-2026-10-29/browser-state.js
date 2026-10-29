// Ejecutar en el origen del fixture, con agent-browser eval --stdin.
(async () => {
  const userId = '00000000-0000-4000-8000-000000000094';
  const expenses = await new Promise((resolve, reject) => {
    const request = indexedDB.open('afp-offline-expenses', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('expenses', 'readonly');
      const read = tx.objectStore('expenses').index('userId').getAll(userId);
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => reject(tx.error);
    };
  });
  return { url: location.pathname, authPresent: !!localStorage.getItem('sb-127-auth-token'),
    bootstrapPresent: !!localStorage.getItem(`afp:gastos-bootstrap:${userId}`),
    drafts: Object.keys(sessionStorage).filter(key => key.startsWith(`afp:create-draft:v1:${userId}:`) || key.startsWith(`afp:capture-missing:${userId}:`)),
    operationIds: expenses.map(entry => entry.clientId), closed: localStorage.getItem(`afp:local-data-closed:${userId}`) };
})();
