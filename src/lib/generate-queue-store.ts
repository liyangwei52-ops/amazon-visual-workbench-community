import {
  GENERATE_ORIGIN_KEY,
  GENERATE_QUEUE_KEY,
  QUEUE_HOLD_KEY,
  QUEUE_LOCK_KEY,
  type GenerateTask,
} from "@/lib/visual-shared"
import { deleteImageRecord, readImageRecord, writeImageRecord } from "@/lib/browser-image-store"
import { countTaskResults, createRedrawTasks, type OutputSelection } from "@/lib/generation-selection"
import { planGenerationSubmission } from "./generation-submission"

type QueueInputs = {
  images: string[]
  tasks: { id: string; product: number; products?: { image: number; name?: string }[]; references: { image: number; name?: string }[] }[]
}

/** 同一标签页提交新批次时，通知保留在根布局中的生图面板。 */
export const GENERATE_QUEUE_SUBMITTED_EVENT = "amazon-workbench.queue-submitted"
/** 同一页面保存、完成或清空队列后刷新导航，不触发任务调度。 */
export const GENERATE_QUEUE_UPDATED_EVENT = "amazon-workbench.queue-updated"

// Page-lifetime intent only. Reloading must not recreate permission to send old work.
const currentPageSubmissions = new Map<GenerateOrigin, Set<string>>()
export function hasCurrentPageSubmission(tasks: GenerateTask[]): boolean {
  return tasks.some(task => task.status === "queued" && [...currentPageSubmissions.values()].some(intent => intent.has(`${task.inputBatchId || ""}:${task.id}`)))
}

export function releaseQueueInputs(removed: GenerateTask[], retained: GenerateTask[] = []): void {
  const keep = new Set([...readGenerateQueue(), ...retained].map(task => task.inputBatchId))
  for (const id of new Set(removed.flatMap(task => task.inputBatchId ? [task.inputBatchId] : []))) {
    if (!keep.has(id)) void deleteImageRecord(id).catch(() => {})
  }
}

export async function hydrateTaskInputs(tasks: GenerateTask[]): Promise<GenerateTask[]> {
  const batches = new Map<string, QueueInputs>()
  for (const id of new Set(tasks.flatMap(task => task.inputBatchId ? [task.inputBatchId] : []))) {
    const record = await readImageRecord<QueueInputs>(id)
    if (!record) throw new Error("生图输入图片未能恢复，请返回发起页面重新提交")
    batches.set(id, record)
  }
  return tasks.map(task => {
    if (!task.inputBatchId) return task
    const batch = batches.get(task.inputBatchId)!
    const input = batch.tasks.find(input => input.id === task.id)
    if (!input) throw new Error("生图输入记录不完整，请返回发起页面重新提交")
    const productImages = input.products?.map(item => ({ dataUrl: batch.images[item.image], name: item.name }))
    if (productImages?.some(image => !image.dataUrl)) throw new Error("产品图记录不完整，请返回发起页面重新提交")
    return { ...task, productImageDataUrl: productImages?.[0]?.dataUrl || (input.product < 0 ? "" : batch.images[input.product]), productImages, references: input.references.map(ref => ({ dataUrl: batch.images[ref.image], name: ref.name })) }
  })
}

export const GENERATE_ORIGINS = {
  "/": "视觉工作台",
  "/planner": "一键策划",
  "/remix": "提示词迁移",
  "/simple": "极简图文生图",
} as const

export type GenerateOrigin = keyof typeof GENERATE_ORIGINS

const LEGACY_ORIGIN_KEY = `${GENERATE_ORIGIN_KEY}.legacy-v2`
export const generateScopeName = (origin: GenerateOrigin) => origin === "/" ? "workbench" : origin.slice(1)
export const generateHref = (origin: GenerateOrigin) => `/generate?source=${generateScopeName(origin)}`
export const generateQueueKey = (origin: GenerateOrigin) => `${GENERATE_QUEUE_KEY}.v2.${generateScopeName(origin)}`
export const generateHoldKey = (origin: GenerateOrigin) => `${QUEUE_HOLD_KEY}.v2.${generateScopeName(origin)}`
export const generateLockKey = (origin: GenerateOrigin) => `${QUEUE_LOCK_KEY}.v2.${generateScopeName(origin)}`
const LEGACY_WEB_LOCK = "amazon-workbench.generate-queue"

export function generateOriginFromParam(value: string | null, fallback: GenerateOrigin): GenerateOrigin {
  return (Object.keys(GENERATE_ORIGINS) as GenerateOrigin[]).find(origin => value === origin || value === generateScopeName(origin)) || fallback
}

function legacyOrigin(): GenerateOrigin {
  const value = localStorage.getItem(LEGACY_ORIGIN_KEY)
  return value && Object.hasOwn(GENERATE_ORIGINS, value) ? value as GenerateOrigin : readGenerateOrigin()
}

function preserveLegacyOrigin(): void {
  if (localStorage.getItem(GENERATE_QUEUE_KEY) !== null && localStorage.getItem(LEGACY_ORIGIN_KEY) === null) {
    localStorage.setItem(LEGACY_ORIGIN_KEY, readGenerateOrigin())
  }
}

export function usesLegacyQueue(origin: GenerateOrigin): boolean {
  return localStorage.getItem(generateQueueKey(origin)) === null
}

export function taskGenerateOrigin(task: GenerateTask, fallback = readGenerateOrigin()): GenerateOrigin {
  return task.origin && Object.hasOwn(GENERATE_ORIGINS, task.origin) ? task.origin : fallback
}

function parseQueue(value: string | null): GenerateTask[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]")
    return Array.isArray(parsed)
      ? parsed.filter((task): task is GenerateTask =>
          Boolean(task && typeof task === "object" && typeof task.id === "string" && typeof task.status === "string")
        )
      : []
  } catch {
    return []
  }
}

/** 无参数仅供资产汇总；执行和写入必须传栏目，旧记录按来源只读回退。 */
export function readGenerateQueue(origin?: GenerateOrigin): GenerateTask[] {
  try {
    if (!origin) return (Object.keys(GENERATE_ORIGINS) as GenerateOrigin[]).flatMap(source => readGenerateQueue(source))
    const scoped = localStorage.getItem(generateQueueKey(origin))
    if (scoped !== null) return parseQueue(scoped).map(task => ({ ...task, origin }))
    const fallback = legacyOrigin()
    return parseQueue(localStorage.getItem(GENERATE_QUEUE_KEY)).filter(task => taskGenerateOrigin(task, fallback) === origin).map(task => ({ ...task, origin }))
  } catch { return [] }
}

export const generateQueueSnapshot = (origin: GenerateOrigin) => JSON.stringify(readGenerateQueue(origin))

export function readGeneratePaused(origin: GenerateOrigin): boolean {
  const key = generateHoldKey(origin)
  const local = localStorage.getItem(key), session = sessionStorage.getItem(key)
  if (local !== null || session !== null) return local === "true" || session === "true"
  return usesLegacyQueue(origin) && (localStorage.getItem(QUEUE_HOLD_KEY) === "true" || sessionStorage.getItem(QUEUE_HOLD_KEY) === "true")
}

function hasLegacyPending(origin: GenerateOrigin): boolean {
  const ids = new Set(parseQueue(localStorage.getItem(GENERATE_QUEUE_KEY)).map(task => task.id))
  return readGenerateQueue(origin).some(task => ids.has(task.id) && (task.status === "queued" || task.status === "running"))
}

export function readGenerateLease(origin: GenerateOrigin): string | null {
  return localStorage.getItem(generateLockKey(origin)) || (hasLegacyPending(origin) ? localStorage.getItem(QUEUE_LOCK_KEY) : null)
}

/** 新栏目使用独立锁；旧未完成任务同时尊重旧版标签页的全局执行锁。 */
export async function withGenerateQueueLock(origin: GenerateOrigin, action: () => Promise<void>): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) { await action(); return true }
  const scoped = () => navigator.locks.request(`${LEGACY_WEB_LOCK}.v2.${generateScopeName(origin)}`, { ifAvailable: true }, async lock => {
    if (!lock) return false
    await action()
    return true
  })
  return hasLegacyPending(origin)
    ? navigator.locks.request(LEGACY_WEB_LOCK, { ifAvailable: true }, lock => lock ? scoped() : false)
    : scoped()
}

export function hasUnfinishedQueue(tasks: GenerateTask[]): boolean {
  return tasks.some((task) => task.status === "queued" || task.status === "running" || task.status === "interrupted"
    || Boolean(task.redraw?.pending.length) || (task.status === "success" && countTaskResults(task) < task.count))
}

const submissionPending = new Set<GenerateOrigin>()

/** 仅提交启用条目；同一清单按原位合并，全新清单另建批次。 */
export async function submitGenerateQueue(tasks: GenerateTask[], origin: GenerateOrigin, entryIds = tasks.map(task => task.sourceEntryId || task.id)): Promise<"saved" | "blocked" | "failed" | "cancelled"> {
  if (submissionPending.has(origin)) return "blocked"
  submissionPending.add(origin)
  const batchId = `queue-inputs-${crypto.randomUUID()}`
  let saved = false
  try {
    const originalSnapshot = generateQueueSnapshot(origin)
    const previous = await hydrateTaskResults(readGenerateQueue(origin))
    const blocked = (queue: GenerateTask[]) => queue.some(task => task.status === "queued" || task.status === "running")
    if (!tasks.length) return "failed"
    if (blocked(previous) || originalSnapshot !== generateQueueSnapshot(origin)) return "blocked"
    const plan = planGenerationSubmission(previous, tasks.map(task => ({ ...task, origin })), entryIds, batchId)
    const updates = new Set(plan.incoming.map(task => task.id))
    if (previous.some(task => updates.has(task.id) && task.status === "interrupted")
      && !window.confirm("所选条目有已提交但结果未确认的请求，服务商可能仍在处理或已经计费。请核查服务商记录；继续会按本次编辑重新生成所选条目，可能再次计费。确认提交？")) return "cancelled"
    const append = hasUnfinishedQueue(previous)
    const incoming = plan.incoming
    const next = plan.related ? plan.merged : [...(append ? previous : []), ...incoming]
    const images: string[] = []
    const imageIndexes = new Map<string, number>()
    const indexFor = (dataUrl: string) => {
      if (!dataUrl) return -1
      const existing = imageIndexes.get(dataUrl)
      if (existing !== undefined) return existing
      const index = images.push(dataUrl) - 1
      imageIndexes.set(dataUrl, index)
      return index
    }
    const inputs: QueueInputs = { images, tasks: incoming.map(task => ({
      id: task.id,
      product: indexFor(task.productImageDataUrl),
      products: task.productImages?.map(image => ({ image: indexFor(image.dataUrl), name: image.name })),
      references: (task.references || []).map(ref => ({ image: indexFor(ref.dataUrl), name: ref.name })),
    })) }
    await writeImageRecord(batchId, inputs)
    // 图片写入期间可能有另一标签页提交；不覆盖其未完成任务。
    if (generateQueueSnapshot(origin) !== originalSnapshot) {
      await deleteImageRecord(batchId)
      return "blocked"
    }
    persistGenerateQueue(next, origin)
    saved = true
    try { localStorage.setItem(GENERATE_ORIGIN_KEY, origin) } catch { /* 队列已保存，返回入口退回首页 */ }
    try { localStorage.setItem(generateHoldKey(origin), "false"); sessionStorage.removeItem(generateHoldKey(origin)) } catch { /* 仍可手动继续，不能删除已保存的输入。 */ }
    currentPageSubmissions.set(origin, new Set(incoming.map(task => `${batchId}:${task.id}`)))
    window.dispatchEvent(new CustomEvent(GENERATE_QUEUE_SUBMITTED_EVENT, { detail: origin }))
    const nextIds = new Set(next.map((task) => task.id))
    previous.filter((task) => !nextIds.has(task.id)).forEach((task) => {
      void deleteTaskResults(task.id).catch(() => {})
    })
    releaseQueueInputs(previous, next)
    return "saved"
  } catch {
    if (!saved) void deleteImageRecord(batchId).catch(() => {})
    return saved ? "saved" : "failed"
  } finally {
    submissionPending.delete(origin)
  }
}

/** 调用者持有栏目执行锁；先保存原位重绘计划，再授予仅本页面有效的发送意图。 */
export async function submitRedrawQueue(selected: OutputSelection, origin: GenerateOrigin): Promise<"saved" | "blocked" | "failed"> {
  if (submissionPending.has(origin)) return "blocked"
  submissionPending.add(origin)
  let saved = false
  try {
    const snapshot = generateQueueSnapshot(origin)
    const current = await hydrateTaskInputs(readGenerateQueue(origin)).then(hydrateTaskResults)
    if (current.some(task => task.status === "queued" || task.status === "running")) return "blocked"
    const redraws = createRedrawTasks(current, selected)
    if (!redraws.length) return "blocked"
    if (snapshot !== generateQueueSnapshot(origin)) return "blocked"
    const byId = new Map(redraws.map(task => [task.id, task]))
    persistGenerateQueue(current.map(task => byId.get(task.id) || task), origin)
    saved = true
    try { localStorage.setItem(generateHoldKey(origin), "false"); sessionStorage.removeItem(generateHoldKey(origin)) } catch { /* 保存计划仍有效，可手动继续。 */ }
    currentPageSubmissions.set(origin, new Set(redraws.map(task => `${task.inputBatchId || ""}:${task.id}`)))
    window.dispatchEvent(new CustomEvent(GENERATE_QUEUE_SUBMITTED_EVENT, { detail: origin }))
    return "saved"
  } catch { return saved ? "saved" : "failed" }
  finally { submissionPending.delete(origin) }
}

export function readGenerateOrigin(): GenerateOrigin {
  if (typeof window === "undefined") return "/"
  try {
    const value = localStorage.getItem(GENERATE_ORIGIN_KEY)
    return value && Object.hasOwn(GENERATE_ORIGINS, value) ? (value as GenerateOrigin) : "/"
  } catch {
    return "/"
  }
}

const DATABASE_NAME = "amazon-workbench-results"
const STORE_NAME = "task-results"

function openResultsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("此浏览器不支持本地结果存储"))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("无法打开本地结果存储"))
  })
}

export async function saveTaskResults(id: string, urls: string[]): Promise<void> {
  const db = await openResultsDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).put(urls, id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error("结果保存失败"))
      transaction.onabort = () => reject(transaction.error || new Error("结果保存失败"))
    })
  } finally {
    db.close()
  }
}

export async function readTaskResults(id: string): Promise<string[]> {
  const db = await openResultsDb()
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id)
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
      request.onerror = () => reject(request.error || new Error("读取结果失败"))
    })
  } finally {
    db.close()
  }
}

export async function deleteTaskResults(id: string): Promise<void> {
  const db = await openResultsDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error("删除结果失败"))
      transaction.onabort = () => reject(transaction.error || new Error("删除结果失败"))
    })
  } finally {
    db.close()
  }
}

/** 图片 data URL 进入 IndexedDB；队列元数据留在 localStorage，供跨标签页同步。 */
export function persistGenerateQueue(tasks: GenerateTask[], origin: GenerateOrigin): void {
  preserveLegacyOrigin()
  localStorage.setItem(
    generateQueueKey(origin),
    JSON.stringify(tasks.map((task) => ({
      ...task,
      origin,
      resultCount: countTaskResults(task),
      ...(task.inputBatchId ? { productImageDataUrl: "", productImages: undefined, references: undefined } : {}),
      // 占位保留图号；混合远程/本地或局部重绘不得因过滤而移动图片。
      resultUrls: task.resultsSaved ? task.resultUrls.map(url => url.startsWith("data:") ? "" : url) : task.resultUrls,
    })))
  )
  window.dispatchEvent(new Event(GENERATE_QUEUE_UPDATED_EVENT))
}

export async function hydrateTaskResults(tasks: GenerateTask[]): Promise<GenerateTask[]> {
  return Promise.all(
    tasks.map(async (task) => {
      // 结果可能混合远程URL与data URL，不能因元数据仍有远程URL而跳过其余图片。
      if (!task.resultsSaved && (task.resultUrls.length > 0 || task.status !== "success")) return task
      try {
        const resultUrls = (await readTaskResults(task.id)).slice(0, task.count)
        return resultUrls.length ? { ...task, resultUrls, resultCount: resultUrls.filter(Boolean).length } : task
      } catch {
        return task
      }
    })
  )
}
