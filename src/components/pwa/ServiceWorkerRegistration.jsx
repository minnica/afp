"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Error registering service worker:", error);
    });
  }, []);

  return null;
}
