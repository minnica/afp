const setupCache = new Set();

export async function ensureUserSetup(user) {
  if (!user?.id || !user?.email) return;

  const cacheKey = `afp:user-setup:${user.id}`;

  if (setupCache.has(cacheKey)) return;

  if (typeof window !== "undefined") {
    const isSetupCached = window.sessionStorage.getItem(cacheKey) === "done";

    if (isSetupCached) {
      setupCache.add(cacheKey);
      return;
    }
  }

  const response = await fetch("/api/setup-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: user.id,
      email: user.email,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo preparar el usuario.");
  }

  setupCache.add(cacheKey);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(cacheKey, "done");
  }
}
