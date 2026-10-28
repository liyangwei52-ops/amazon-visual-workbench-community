"use client"
import { useSyncExternalStore } from "react"
import { API_SETTINGS_CHANGED_EVENT, readApiSettings } from "./api-settings"

export function subscribeApiSettings(notify: () => void) {
  // Include legacy keys and clear(), without exposing keys in the snapshot or event.
  const storage = () => notify()
  window.addEventListener("storage", storage)
  window.addEventListener(API_SETTINGS_CHANGED_EVENT, notify)
  window.addEventListener("focus", notify)
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(API_SETTINGS_CHANGED_EVENT, notify); window.removeEventListener("focus", notify) }
}
const snapshot = () => {
  const saved = readApiSettings()
  const ready = (group: typeof saved.image) => Boolean(group.apiKey.trim() && group.endpoint.trim() && group.model.trim())
  return `${ready(saved.analysis) ? "1" : "0"}${ready(saved.image) ? "1" : "0"}`
}
export function useApiStatus() {
  const status = useSyncExternalStore(subscribeApiSettings, snapshot, () => "loading")
  return { loaded: status !== "loading", analysisReady: status[0] === "1", imageReady: status[1] === "1" }
}
