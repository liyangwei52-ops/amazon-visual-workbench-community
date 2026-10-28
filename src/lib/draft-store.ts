"use client"
import { readImageRecord, writeImageRecord } from "@/lib/browser-image-store"

/**
 * 页面现场快照（localStorage）：
 * 切换左侧导航/跳转生图页时保存各页已上传与已填写内容，返回页面时自动恢复。
 *
 * 容量约束：localStorage 单域约 5MB，图片 dataUrl 可能很大。
 * 大图片写入 IndexedDB，localStorage 保存文字和恢复指针。
 * 页面跳转保留完整素材；恢复时异步读取图片。
 */

const MAX_DRAFT_BYTES = 3 * 1024 * 1024 // 单页快照预算 3MB（留 2MB 给其他页面与套装）
const IMAGE_PREFIX = "indexeddb-image:"
const imageKeys = new Map<string, string>()
const pendingWrites = new Map<string, Promise<boolean>>()
const cache = new Map<string, unknown>()
export const DRAFT_UPDATED_EVENT = "amazon-workbench.draft-updated"
function notifyDraft(key: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DRAFT_UPDATED_EVENT, { detail: key }))
}

export type SaveDraftResult = "saved" | "dropped-images" | "failed"

function separateImages(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("data:image/")) {
    let key = imageKeys.get(value)
    if (!key) {
      key = `draft-image-${crypto.randomUUID()}`
      imageKeys.set(value, key)
      pendingWrites.set(key, writeImageRecord(key, value).then(() => true).catch(() => false))
    }
    return IMAGE_PREFIX + key
  }
  if (Array.isArray(value)) return value.map(separateImages)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = separateImages(child)
    }
    return out
  }
  return value
}

export function saveDraft(key: string, draft: unknown): SaveDraftResult {
  cache.set(key, draft)
  try {
    const serialized = JSON.stringify(draft)
    if (serialized.length > MAX_DRAFT_BYTES) {
      persistLargeDraft(key, draft)
      notifyDraft(key)
      return "saved"
    }
    localStorage.setItem(key, serialized)
    notifyDraft(key)
    return "saved"
  } catch {
    // 跨页面累计超额时也保留完整图片。
    try {
      persistLargeDraft(key, draft)
      notifyDraft(key)
      return "saved"
    } catch {
      return "failed"
    }
  }
}

function persistLargeDraft(key: string, draft: unknown) {
  // 只写一次图片，后续输入只同步更新文字，避免刷新读到较早的整页快照。
  localStorage.setItem(key, JSON.stringify(separateImages(draft)))
}

export async function flushDraftImages(): Promise<void> {
  const outcomes = await Promise.all(pendingWrites.values())
  if (outcomes.includes(false)) throw new Error("页面图片保存失败，请备份提示词后重试")
}

export async function loadDraftWithImages<T>(key: string): Promise<T | null> {
  if (cache.has(key)) return cache.get(key) as T
  const draft = loadDraft<T & { __imageRecord?: string }>(key)
  if (!draft) return null
  if (draft.__imageRecord) return await readImageRecord<T>(draft.__imageRecord) || draft
  const records = new Map<string, Promise<string | undefined>>()
  const restore = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string" && value.startsWith(IMAGE_PREFIX)) {
      const imageKey = value.slice(IMAGE_PREFIX.length)
      if (!records.has(imageKey)) records.set(imageKey, (async () => {
        await pendingWrites.get(imageKey)
        return readImageRecord<string>(imageKey)
      })())
      const dataUrl = await records.get(imageKey)
      if (!dataUrl) throw new Error("页面图片未能恢复，请重新上传原图")
      imageKeys.set(dataUrl, imageKey)
      return dataUrl
    }
    if (Array.isArray(value)) return Promise.all(value.map(restore))
    if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([name, child]) => [name, await restore(child)])))
    return value
  }
  return await restore(draft) as T
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  cache.delete(key)
  try {
    localStorage.removeItem(key)
    notifyDraft(key)
  } catch {
    // 忽略
  }
}
