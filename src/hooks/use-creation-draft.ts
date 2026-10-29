"use client"

import { isLocalDataClosed, LOCAL_DATA_EVENT } from "@/lib/localFinancialData"
import { useEffect, useRef, useState } from "react"

// El respaldo en memoria conserva la captura si sessionStorage no está disponible.
const drafts = new Map<string, unknown>()

function readDraft(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? drafts.get(key)
  } catch {
    return drafts.get(key)
  }
}

function writeDraft(key: string, values: unknown) {
  drafts.set(key, values)
  try {
    sessionStorage.setItem(key, JSON.stringify(values))
  } catch {
    // El borrador sigue disponible durante la navegación en esta pestaña.
  }
}

type DraftValue = string | number | boolean;
type DraftValues = Record<string, DraftValue>;
export function useCreationDraft<T extends DraftValues>({ name, userId, enabled, values, setters }: { name: string; userId?: string | null; enabled: boolean; values: T; setters: { [K in keyof T]: (value: T[K]) => void } }) {
  const key = userId ? `afp:create-draft:v1:${userId}:${name}` : null
  const latest = useRef({ values, setters })
  const initialValues = useRef(values)
  const [restoredKey, setRestoredKey] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const clear = () => {
      if (isLocalDataClosed(userId)) {
        for (const draftKey of drafts.keys()) if (draftKey.startsWith(`afp:create-draft:v1:${userId}:`)) drafts.delete(draftKey)
      }
    }
    window.addEventListener(LOCAL_DATA_EVENT, clear)
    window.addEventListener("storage", clear)
    return () => { window.removeEventListener(LOCAL_DATA_EVENT, clear); window.removeEventListener("storage", clear) }
  }, [userId])

  useEffect(() => {
    latest.current = { values, setters }
  })

  useEffect(() => {
    if (!enabled || !key || (userId && isLocalDataClosed(userId))) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const draft = readDraft(key)
      const untouched = Object.entries(latest.current.values).every(([field, value]) => value === initialValues.current[field])
      if (untouched && draft && typeof draft === "object" && !Array.isArray(draft)) {
        for (const field of Object.keys(latest.current.values) as (keyof T & string)[]) {
          const value = latest.current.values[field]
          if (Object.hasOwn(draft, field) && typeof (draft as Record<string, unknown>)[field] === typeof value) {
            // Same key and primitive kind as the current form; never restore unknown fields.
            latest.current.setters[field]((draft as T)[field])
          }
        }
      }
      setRestoredKey(key)
    })
    return () => { cancelled = true }
  }, [enabled, key, userId])

  useEffect(() => {
    if (enabled && key && userId && !isLocalDataClosed(userId) && restoredKey === key) writeDraft(key, values)
  }, [enabled, key, restoredKey, userId, values])
}
