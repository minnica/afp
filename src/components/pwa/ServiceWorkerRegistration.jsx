"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          return Promise.all(
            registrations.map((registration) => registration.unregister()),
          );
        })
        .catch((error) => {
          console.error("Error unregistering service worker:", error);
        });

      if ("caches" in window) {
        window.caches
          .keys()
          .then((cacheNames) => {
            return Promise.all(
              cacheNames
                .filter((cacheName) => cacheName.startsWith("afp-shell-"))
                .map((cacheName) => window.caches.delete(cacheName)),
            );
          })
          .catch((error) => {
            console.error("Error clearing service worker caches:", error);
          });
      }

      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Error registering service worker:", error);
    });
  }, []);

  return null;
}
