"use client"
import { useCallback, useEffect, useState } from "react"
import { ASSETS_EVENT, listAssets, type ImageAsset } from "./asset-store"
export function useAssets(enabled = true) {
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    try { setAssets(await listAssets()); setError("") }
    catch (e) { setError(e instanceof Error ? e.message : "读取资产失败") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    if (!enabled) return
    // IndexedDB is an external store; load its initial snapshot after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const changed = () => { void refresh() }
    const storage = (e: StorageEvent) => { if (e.key === ASSETS_EVENT) changed() }
    window.addEventListener(ASSETS_EVENT, changed); window.addEventListener("storage", storage)
    return () => { window.removeEventListener(ASSETS_EVENT, changed); window.removeEventListener("storage", storage) }
  }, [refresh, enabled])
  return { assets, loading, error, refresh }
}
