"use client"

import { useEffect, useRef, useState } from "react"

// El respaldo en memoria conserva la captura si sessionStorage no está disponible.
const drafts = new Map()

function readDraft(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? drafts.get(key)
  } catch {
    return drafts.get(key)
  }
}

function writeDraft(key, values) {
  drafts.set(key, values)
  try {
    sessionStorage.setItem(key, JSON.stringify(values))
  } catch {
    // El borrador sigue disponible durante la navegación en esta pestaña.
  }
}

export function useCreationDraft({ name, userId, enabled, values, setters }) {
  const key = userId ? `afp:create-draft:v1:${userId}:${name}` : null
  const latest = useRef({ values, setters })
  const initialValues = useRef(values)
  const [restoredKey, setRestoredKey] = useState(null)

  useEffect(() => {
    latest.current = { values, setters }
  })

  useEffect(() => {
    if (!enabled || !key) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const draft = readDraft(key)
      const untouched = Object.entries(latest.current.values).every(([field, value]) => value === initialValues.current[field])
      if (untouched && draft && typeof draft === "object" && !Array.isArray(draft)) {
        for (const [field, value] of Object.entries(latest.current.values)) {
          if (Object.hasOwn(draft, field) && typeof draft[field] === typeof value) {
            latest.current.setters[field](draft[field])
          }
        }
      }
      setRestoredKey(key)
    })
    return () => { cancelled = true }
  }, [enabled, key])

  useEffect(() => {
    if (enabled && key && restoredKey === key) writeDraft(key, values)
  }, [enabled, key, restoredKey, values])
}
