import { DEFAULT_ANALYZE_MODEL, DEFAULT_ENDPOINT, DEFAULT_IMAGE_MODEL, STORAGE_KEYS } from "@/lib/visual-shared"

export type ApiConnection = { endpoint: string; apiKey: string; model: string }
export type ApiSettings = { analysis: ApiConnection; image: ApiConnection }
export const API_SETTINGS_KEY = "amazon-workbench.api-settings.v1"
export const API_SETTINGS_CHANGED_EVENT = "amazon-workbench.api-settings-changed"

export function defaultApiSettings(): ApiSettings {
  return {
    analysis: { endpoint: DEFAULT_ENDPOINT, apiKey: "", model: DEFAULT_ANALYZE_MODEL },
    image: { endpoint: DEFAULT_ENDPOINT, apiKey: "", model: DEFAULT_IMAGE_MODEL },
  }
}

function isConnection(value: unknown): value is ApiConnection {
  if (!value || typeof value !== "object") return false
  const config = value as Record<string, unknown>
  return [config.endpoint, config.apiKey, config.model].every((item) => typeof item === "string")
}

/** Only the settings page writes configuration. Every request reads the latest saved value. */
export function readApiSettings(): ApiSettings {
  const defaults = defaultApiSettings()
  if (typeof window === "undefined") return defaults
  try {
    const saved = localStorage.getItem(API_SETTINGS_KEY)
    if (saved !== null) {
      const parsed = JSON.parse(saved)
      return isConnection(parsed.analysis) && isConnection(parsed.image) ? parsed : defaults
    }
    // Preserve existing users' configuration until their first explicit save.
    return {
      analysis: {
        endpoint: localStorage.getItem(STORAGE_KEYS.analyzeEndpoint) || defaults.analysis.endpoint,
        apiKey: localStorage.getItem(STORAGE_KEYS.analyzeApiKey) || "",
        model: localStorage.getItem(STORAGE_KEYS.analyzeModel) || defaults.analysis.model,
      },
      image: {
        endpoint: localStorage.getItem(STORAGE_KEYS.imageEndpoint) || defaults.image.endpoint,
        apiKey: localStorage.getItem(STORAGE_KEYS.imageApiKey) || "",
        model: localStorage.getItem(STORAGE_KEYS.imageModel) || defaults.image.model,
      },
    }
  } catch {
    return defaults
  }
}

export function saveApiSettings(settings: ApiSettings): ApiSettings {
  const normalized = {} as ApiSettings
  for (const group of ["analysis", "image"] as const) {
    const config = settings[group]
    const label = group === "analysis" ? "分析" : "生图"
    let url: URL
    try { url = new URL(config.endpoint.trim()) } catch { throw new Error(`${label} API 地址格式不正确`) }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error(`${label} API 地址须为 HTTPS，且不能包含账号、查询参数或锚点`)
    }
    if (!config.model.trim()) throw new Error(`请填写${label}模型`)
    normalized[group] = {
      endpoint: config.endpoint.trim().replace(/\/+$/, ""),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
    }
  }
  // One write commits both connections together; edits remain local to the form until then.
  localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(API_SETTINGS_CHANGED_EVENT))
  return normalized
}
