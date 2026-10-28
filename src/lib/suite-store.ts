/**
 * 提示词套装：本地存储（localStorage）
 * 套装只包含名称、多条提示词与各自比例；id、savedAt 用于本地管理。
 */
import { isCustomOutputValid } from "./output-ratio"
import { normalizeRatio } from "@/lib/visual-shared"

export type SuiteEntry = {
  id: string
  size: string
  customSize: string
  prompt: string
}

export type SavedSuite = {
  id: string
  name: string
  entries: SuiteEntry[]
  savedAt: number
}

const SUITES_KEY = "amazon-workbench.suites"
export const SUITES_CHANGED_EVENT = "amazon-workbench.suites-changed"

export function createSuiteEntry(index: number): SuiteEntry {
  return {
    id: `suite-entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    size: "1:1",
    customSize: "",
    prompt: "",
  }
}

function normalizeSuite(value: unknown): SavedSuite | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || !Array.isArray(raw.entries)) return null
  return {
    id: raw.id,
    name: raw.name,
    entries: raw.entries.flatMap((entry, index) => {
      if (!entry || typeof entry.prompt !== "string") return []
      return [{
        id: typeof entry.id === "string" ? entry.id : `${raw.id}-entry-${index}`,
        size: normalizeRatio(typeof entry.size === "string" ? entry.size : "1:1") || "1:1",
        customSize: typeof entry.customSize === "string" ? entry.customSize : "",
        prompt: entry.prompt,
      }]
    }),
    savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
  }
}

export function listSuites(): SavedSuite[] {
  try {
    const raw = localStorage.getItem(SUITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const suites = parsed.map(normalizeSuite).filter((suite): suite is SavedSuite => suite !== null)
    // Migrate old suites without changing prompt text, order or custom dimensions.
    // Product images and unrelated generation preferences no longer belong to a suite.
    const clean = JSON.stringify(suites)
    if (clean !== raw) {
      try { localStorage.setItem(SUITES_KEY, clean) } catch { /* Reading still works if storage is unavailable. */ }
    }
    return suites
  } catch {
    return []
  }
}

/**
 * 保存套装：按「名称」匹配 —— 名称相同直接覆盖更新（保留原 id，刷新保存时间）；
 * 名称不同则作为新套装新建。避免同名重复条目。
 * 返回 "created"（新建）/ "updated"（覆盖同名）/ "failed"（写入失败）
 */
export type SaveSuiteResult = "created" | "updated" | "failed"

export function saveSuite(suite: SavedSuite): SaveSuiteResult {
  try {
    const clean = normalizeSuite(suite)
    if (!clean || !clean.name.trim() || !clean.entries.some((entry) => entry.prompt.trim())) return "failed"
    if (clean.entries.some(entry => entry.prompt.trim() && entry.size === "custom" && !isCustomOutputValid(entry.customSize))) return "failed"
    clean.name = clean.name.trim()
    clean.entries = clean.entries.filter((entry) => entry.prompt.trim())
    const suites = listSuites()
    const index = suites.findIndex((item) => item.name === clean.name)
    if (index >= 0) {
      suites[index] = { ...clean, id: suites[index].id, savedAt: Date.now() }
      localStorage.setItem(SUITES_KEY, JSON.stringify(suites))
      window.dispatchEvent(new Event(SUITES_CHANGED_EVENT))
      return "updated"
    }
    suites.push(clean)
    localStorage.setItem(SUITES_KEY, JSON.stringify(suites))
    window.dispatchEvent(new Event(SUITES_CHANGED_EVENT))
    return "created"
  } catch {
    return "failed"
  }
}

export function deleteSuite(suiteId: string): boolean {
  try {
    const suites = listSuites().filter((item) => item.id !== suiteId)
    localStorage.setItem(SUITES_KEY, JSON.stringify(suites))
    window.dispatchEvent(new Event(SUITES_CHANGED_EVENT))
    return true
  } catch {
    return false
  }
}
