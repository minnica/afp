import * as React from "react"

const MOBILE_BREAKPOINT = 768
// Coincide con el breakpoint de CSS, incluso con anchos fraccionarios.
export const MOBILE_QUERY = `(width < ${MOBILE_BREAKPOINT}px)`

function subscribeToMobileQuery(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  // Conserva la misma instantánea durante SSR y la hidratación inicial.
  return React.useSyncExternalStore(
    subscribeToMobileQuery,
    getMobileSnapshot,
    getServerSnapshot,
  )
}
