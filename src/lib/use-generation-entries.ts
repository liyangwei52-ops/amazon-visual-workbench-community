"use client"

import { useSyncExternalStore } from "react"
import { DRAFT_UPDATED_EVENT, loadDraft } from "./draft-store"
import type { GenerateOrigin } from "./generate-queue-store"

const draftKeys: Record<GenerateOrigin, string> = {
  "/": "amazon-workbench.draft.workbench", "/remix": "amazon-workbench.remixDraft",
  "/planner": "amazon-workbench.draft.planner", "/simple": "amazon-workbench.draft.simple",
}
function subscribe(onChange: () => void) {
  window.addEventListener(DRAFT_UPDATED_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => { window.removeEventListener(DRAFT_UPDATED_EVENT, onChange); window.removeEventListener("storage", onChange) }
}

/** Read only the IDs: no image hydration, credentials, queue writes or model requests. */
export function useGenerationEntries(origin: GenerateOrigin): string[] | null {
  const snapshot = useSyncExternalStore(subscribe, () => {
    const draft = loadDraft<{ cards?: { id?: unknown }[]; entries?: { id?: unknown }[] }>(draftKeys[origin])
    const entries = origin === "/" ? draft?.cards : draft?.entries
    if (!Array.isArray(entries) || entries.some(entry => typeof entry?.id !== "string")) return ""
    return JSON.stringify([...new Set(entries.map(entry => entry.id))])
  }, () => "")
  return snapshot ? JSON.parse(snapshot) as string[] : null
}
