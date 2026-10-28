"use client"
import { customRatioLabel } from "@/lib/output-ratio"
import { generationSlots, generationStats, generationViewBatches } from "@/lib/generation-batches"
import { useGenerationEntries } from "@/lib/use-generation-entries"
import { stopGenerationTasks } from "@/lib/generation-submission"
import { applyImageOutputs, canSelectResult, countTaskResults, selectOutputs, taskAssetId, taskOutputIndices, type OutputSelection } from "@/lib/generation-selection"
import { ResultSelection, SelectionActions } from "./generation-actions"
import { saveAsset } from "@/lib/asset-store"
import { readProfile } from "@/lib/profile-store"
import { GENERATION_CONCURRENCY_OPTIONS, generateConcurrencyKey, readGenerationConcurrency, generationWorkerCount, normalizeGenerationConcurrency, type GenerationConcurrency } from "@/lib/generate-concurrency"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  StopCircleIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { readApiSettings } from "@/lib/api-settings"
import { requestModelApi } from "@/lib/model-api-client"
import { resolveImagePlan, promptForImagePlan } from "@/lib/model-image-plan"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { TaskImageGallery } from "@/components/task-image-gallery"
import { RequestWaitNotice } from "@/components/request-wait-notice"
import { ImageSizeHint } from "@/components/image-size-hint"
import { readImageFailure } from "@/lib/image-failure"
import { ImageItemError, requestImageBatch } from "@/lib/image-batch"
import {
  GENERATE_QUEUE_KEY as LEGACY_QUEUE_KEY,
  QUEUE_HOLD_KEY as LEGACY_HOLD_KEY,
  QUEUE_LOCK_KEY as LEGACY_LOCK_KEY,
  sizeFromRatioQuality,
  type GenerateTask,
} from "@/lib/visual-shared"
import {
  deleteTaskResults,
  GENERATE_ORIGINS,
  GENERATE_QUEUE_SUBMITTED_EVENT,
  hydrateTaskResults,
  hydrateTaskInputs,
  hasCurrentPageSubmission,
  persistGenerateQueue,
  readGenerateQueue,
  generateQueueKey,
  generateQueueSnapshot,
  generateHoldKey,
  generateLockKey,
  readGenerateLease,
  readGeneratePaused,
  usesLegacyQueue,
  withGenerateQueueLock,
  type GenerateOrigin,
  taskGenerateOrigin,
  submitRedrawQueue,
  releaseQueueInputs,
  saveTaskResults,
} from "@/lib/generate-queue-store"

/**
 * 生成队列面板（可复用）：
 * - 从 localStorage 读取生成队列，按并发设置执行并独立保存每个任务结果；
 * - 每个栏目各自保留一个执行器、任务状态与界面选择；
 * - 栏目执行锁只拦截同栏目跨标签页重复执行。
 */
export function GenerateQueuePanel({
  origin,
  emptyHint,
  showSectionHead = true,
  onRunningCountChange,
}: {
  origin: GenerateOrigin
  emptyHint?: ReactNode
  showSectionHead?: boolean
  onRunningCountChange?: (count: number) => void
}) {
  const GENERATE_QUEUE_KEY = generateQueueKey(origin)
  const QUEUE_HOLD_KEY = generateHoldKey(origin)
  const QUEUE_LOCK_KEY = generateLockKey(origin)
  const QUEUE_CONCURRENCY_KEY = generateConcurrencyKey(origin)
  const [tasks, setTasks] = useState<GenerateTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const [paused, setPaused] = useState(false)
  const [externalRunning, setExternalRunning] = useState(false)
  const [concurrency, setConcurrency] = useState<GenerationConcurrency>("all")
  const [selectedOutputs, setSelectedOutputs] = useState<OutputSelection>({})
  const [batchChoice, setBatchChoice] = useState<{ latest: string; selected: string } | null>(null)
  const [redrawBusy, setRedrawBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const stoppingRef = useRef(false)
  const redrawBusyRef = useRef(false)
  const concurrencyRef = useRef<GenerationConcurrency>("all")
  const pausedRef = useRef(false)
  const stopRef = useRef(false)
  const runningRef = useRef(false)
  const ownsLockRef = useRef(false)
  const deferredSubmissionRef = useRef(false)
  const hydrationRevisionRef = useRef(0)
  const tasksRef = useRef<GenerateTask[]>([])
  const activeControllersRef = useRef(new Map<string, AbortController>())
  const wakeSchedulerRef = useRef<(() => void) | null>(null)
  const leavingRef = useRef(false)
  const mountedRef = useRef(true)
  const saveErrorRef = useRef(false)
  const ownerIdRef = useRef("")

  const commitTasks = useCallback((next: GenerateTask[]) => {
    tasksRef.current = next
    if (mountedRef.current) setTasks(next)
    try {
      persistGenerateQueue(next, origin)
      return true
    } catch {
      pausedRef.current = true
      if (mountedRef.current) setPaused(true)
      try { localStorage.setItem(QUEUE_HOLD_KEY, "true") } catch { try { sessionStorage.setItem(QUEUE_HOLD_KEY, "true") } catch { /* 存储均不可用时仍保留内存结果并暂停。 */ } }
      if (!saveErrorRef.current) toast.error("队列保存失败：浏览器本地空间不足，请及时下载已有结果")
      saveErrorRef.current = true
      return false
    }
  }, [origin, QUEUE_HOLD_KEY])

  useEffect(() => {
    mountedRef.current = true
    ownerIdRef.current = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const initial = readGenerateQueue(origin)
    concurrencyRef.current = readGenerationConcurrency(origin)
    setConcurrency(concurrencyRef.current)
    let lockedByOther = false
    try {
      const lock = JSON.parse(readGenerateLease(origin) || "{}") as { owner?: string; at?: number }
      lockedByOther = Boolean(lock.owner && lock.owner !== ownerIdRef.current && (Date.now() - (lock.at || 0) < 30_000 || usesLegacyQueue(origin)))
    } catch {
      // 无法解析的锁视为已失效
    }
    const hadInterruptedRequest = initial.some((task) => task.status === "running") && !lockedByOther
    const restored = hadInterruptedRequest
      ? initial.map((task): GenerateTask => task.status === "running"
          ? { ...task, status: "interrupted", error: "页面已离开，无法确认上游是否完成；检查结果后再手动重试" }
          : task)
      : initial
    const restoredQueued = !lockedByOther && initial.some(task => task.status === "queued") && !hasCurrentPageSubmission(initial)
    const isPaused = readGeneratePaused(origin) || hadInterruptedRequest || restoredQueued
    pausedRef.current = isPaused
    setPaused(isPaused)
    setExternalRunning(lockedByOther)
    if (hadInterruptedRequest || restoredQueued) localStorage.setItem(QUEUE_HOLD_KEY, "true")
    tasksRef.current = restored
    setTasks(restored)
    if (hadInterruptedRequest) commitTasks(restored)
    let active = true
    const revision = ++hydrationRevisionRef.current
    void hydrateTaskInputs(restored).then(hydrateTaskResults).then((hydrated) => {
      if (!active || !mountedRef.current || revision !== hydrationRevisionRef.current) return
      tasksRef.current = hydrated
      setTasks(hydrated)
      setLoaded(true)
    }).catch((error: unknown) => {
      if (!active || !mountedRef.current || revision !== hydrationRevisionRef.current) return
      pausedRef.current = true
      setPaused(true)
      commitTasks(restored.map(task => task.status === "queued" ? { ...task, status: "failed", error: error instanceof Error ? error.message : "输入图片读取失败" } : task))
      setLoaded(true)
    })
    return () => { active = false; mountedRef.current = false }
  }, [commitTasks, origin, QUEUE_HOLD_KEY])

  useEffect(() => {
    const syncQueue = (event: StorageEvent) => {
      if (event.key === QUEUE_CONCURRENCY_KEY) {
        concurrencyRef.current = normalizeGenerationConcurrency(event.newValue)
        setConcurrency(concurrencyRef.current)
      }
      if (event.key === QUEUE_HOLD_KEY || (event.key === LEGACY_HOLD_KEY && usesLegacyQueue(origin))) {
        pausedRef.current = readGeneratePaused(origin)
        setPaused(pausedRef.current)
      }
      const lockChanged = event.key === QUEUE_LOCK_KEY || event.key === LEGACY_LOCK_KEY
      if (lockChanged) {
        try {
          const lock = JSON.parse(readGenerateLease(origin) || "{}") as { owner?: string; at?: number }
          setExternalRunning(Boolean(lock.owner && lock.owner !== ownerIdRef.current && Date.now() - (lock.at || 0) < 30_000))
        } catch {
          setExternalRunning(false)
        }
      }
      const queueChanged = event.key === GENERATE_QUEUE_KEY || (event.key === LEGACY_QUEUE_KEY && usesLegacyQueue(origin)) || (lockChanged && event.newValue === null)
      if (!queueChanged || ownsLockRef.current) return
      const revision = ++hydrationRevisionRef.current
      const next = readGenerateQueue(origin)
      if (next.some(task => !tasksRef.current.some(previous => previous.id === task.id && previous.inputBatchId === task.inputBatchId))) {
        setSelectedOutputs({})
        setBatchChoice(null)
      }
      void hydrateTaskInputs(next).then(hydrateTaskResults).then((hydrated) => {
        if (!mountedRef.current || ownsLockRef.current || revision !== hydrationRevisionRef.current) return
        tasksRef.current = hydrated
        setTasks(hydrated)
        setLoaded(true)
      }).catch(() => { toast.error("输入图片读取失败，请刷新页面后重试") })
    }
    window.addEventListener("storage", syncQueue)
    const onSubmitted = (event: Event) => {
      if ((event as CustomEvent<GenerateOrigin>).detail !== origin) return
      setSelectedOutputs({})
      setBatchChoice(null)
      if (ownsLockRef.current) { deferredSubmissionRef.current = true; return }
      pausedRef.current = readGeneratePaused(origin)
      stopRef.current = false
      setPaused(pausedRef.current)
      syncQueue(new StorageEvent("storage", { key: GENERATE_QUEUE_KEY }))
    }
    window.addEventListener(GENERATE_QUEUE_SUBMITTED_EVENT, onSubmitted)
    return () => { window.removeEventListener("storage", syncQueue); window.removeEventListener(GENERATE_QUEUE_SUBMITTED_EVENT, onSubmitted) }
  }, [origin, GENERATE_QUEUE_KEY, QUEUE_HOLD_KEY, QUEUE_LOCK_KEY, QUEUE_CONCURRENCY_KEY])

  // A crashed tab may leave a fresh lease but no subsequent storage events.
  // Expiration only restores records; it never authorizes another paid request.
  useEffect(() => {
    if (!externalRunning) return
    let checking = false
    const leaseActive = () => {
      try {
        const lock = JSON.parse(readGenerateLease(origin) || "{}") as { owner?: string; at?: number }
        return Boolean(lock.owner && Date.now() - (lock.at || 0) < 30_000)
      } catch { return false }
    }
    const restore = async () => {
      if (ownsLockRef.current || leaseActive()) return
      const revision = ++hydrationRevisionRef.current
      const snapshot = generateQueueSnapshot(origin)
      const current = await hydrateTaskInputs(readGenerateQueue(origin)).then(hydrateTaskResults)
      if (!mountedRef.current || ownsLockRef.current || leaseActive() || revision !== hydrationRevisionRef.current || snapshot !== generateQueueSnapshot(origin)) return
      if (current.some(task => task.status === "queued" || task.status === "running")) {
        pausedRef.current = true
        setPaused(true)
        localStorage.setItem(QUEUE_HOLD_KEY, "true")
      }
      commitTasks(current.map(task => task.status === "running" ? { ...task, status: "interrupted", error: "原执行页面已失去连接，无法确认服务商结果；核查后再手动重试" } : task))
      setExternalRunning(false)
      setLoaded(true)
    }
    const timer = window.setInterval(() => {
      if (checking || leaseActive()) return
      checking = true
      const guarded = withGenerateQueueLock(origin, restore)
      void guarded.catch(() => toast.error("未完成任务读取失败，请检查浏览器存储后刷新")).finally(() => { checking = false })
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [externalRunning, commitTasks, origin, QUEUE_HOLD_KEY])

  /** 每个任务开始时读取统一设置中已保存的配置。 */
  const readImageConfig = useCallback(() => readApiSettings().image, [])

  /** 执行锁：同一队列只允许一个入口跑（30 秒心跳过期兜底） */
  const acquireLock = useCallback(() => {
    try {
      const now = Date.now()
      const raw = readGenerateLease(origin)
      if (raw) {
        const lock = JSON.parse(raw) as { owner: string; at: number }
        if (lock.owner !== ownerIdRef.current && now - lock.at < 30_000) {
          return false
        }
      }
      localStorage.setItem(QUEUE_LOCK_KEY, JSON.stringify({ owner: ownerIdRef.current, at: now }))
      return JSON.parse(localStorage.getItem(QUEUE_LOCK_KEY) || "{}").owner === ownerIdRef.current
    } catch {
      return true
    }
  }, [origin, QUEUE_LOCK_KEY])

  const refreshLock = useCallback(() => {
    try {
      const lock = JSON.parse(localStorage.getItem(QUEUE_LOCK_KEY) || "{}") as { owner?: string }
      if (lock.owner !== ownerIdRef.current) {
        stopRef.current = true
        return
      }
      localStorage.setItem(QUEUE_LOCK_KEY, JSON.stringify({ owner: ownerIdRef.current, at: Date.now() }))
    } catch {
      stopRef.current = true
    }
  }, [QUEUE_LOCK_KEY])

  const releaseLock = useCallback(() => {
    ownsLockRef.current = false
    try {
      const raw = localStorage.getItem(QUEUE_LOCK_KEY)
      if (raw) {
        const lock = JSON.parse(raw) as { owner: string }
        if (lock.owner === ownerIdRef.current) {
          localStorage.removeItem(QUEUE_LOCK_KEY)
        }
      }
    } catch {
      // 忽略
    }
    if (deferredSubmissionRef.current) {
      deferredSubmissionRef.current = false
      queueMicrotask(() => { if (mountedRef.current) window.dispatchEvent(new CustomEvent(GENERATE_QUEUE_SUBMITTED_EVENT, { detail: origin })) })
    }
  }, [origin, QUEUE_LOCK_KEY])

  const updateTask = useCallback((taskId: string, patch: Partial<GenerateTask>) => {
    return commitTasks(tasksRef.current.map((task) => task.id === taskId ? { ...task, ...patch } : task))
  }, [commitTasks])

  const finishStop = useCallback(() => {
    if (!stoppingRef.current) return
    // 已返回检查点先保存完，再释放本栏目执行锁和重交入口。
    commitTasks(stopGenerationTasks(tasksRef.current))
    stoppingRef.current = false
    if (mountedRef.current) setStopping(false)
  }, [commitTasks])

  const editorIds = useGenerationEntries(origin)
  const batches = useMemo(() => generationViewBatches(tasks, editorIds), [tasks, editorIds])
  const latestBatch = batches.at(-1)
  // 新提交或其他标签页出现新批次时自动回到最新；仅浏览历史不写存储或触发调度。
  const viewedBatch = (batchChoice?.latest === latestBatch?.id ? batches.find(batch => batch.id === batchChoice?.selected) : undefined) || latestBatch
  const visibleTasks = viewedBatch?.tasks || tasks
  const visibleSlots = viewedBatch ? generationSlots(viewedBatch) : []
  const unsubmitted = visibleSlots.filter(slot => !slot.task).length
  const stats = generationStats(visibleTasks)
  const queueRunning = tasks.filter(task => task.status === "running").length
  const queueQueued = tasks.filter(task => task.status === "queued").length
  const queueBusy = queueRunning + queueQueued > 0

  useEffect(() => { onRunningCountChange?.(queueRunning) }, [queueRunning, onRunningCountChange])

  /** 执行单个任务（调用 /api/images） */
  const runTask = useCallback(
    async (task: GenerateTask) => {
      if (leavingRef.current || activeControllersRef.current.has(task.id)) return
      const config = readImageConfig()
      if (!config.apiKey) {
        updateTask(task.id, { status: "failed", error: "请先在「API 设置」中填写并保存生图配置" })
        return
      }
      let requestUncertain = false
      const requestedSize = task.ratio === "custom" ? task.customSize : sizeFromRatioQuality(task.ratio, task.quality)
      let plan
      try { plan = resolveImagePlan(config.model, requestedSize, task.quality, task.ratio) }
      catch (error) { updateTask(task.id, { status: "failed", error: error instanceof Error ? error.message : "尺寸无效" }); return }
      const size = plan.size
      const requestInfo = {
        provider: (() => { try { return new URL(config.endpoint || "https://api.openai.com/v1").host } catch { return "地址无效" } })(),
        model: plan.model,
        size,
        submittedSize: size,
        requestedSize,
        aspectRatio: plan.aspectRatio,
        resolution: plan.resolution,
        startedAt: Date.now(),
      }
      const controller = new AbortController()
      const submittedPrompt = promptForImagePlan(task.prompt, plan, task.promptMode)
      activeControllersRef.current.set(task.id, controller)
      try {
        if (!updateTask(task.id, { status: "running", stoppedBeforeSend: undefined, prompt: submittedPrompt, error: undefined, resultWarning: undefined, requestInfo })) return
        const formData = new FormData()
        formData.append("endpoint", config.endpoint)
        formData.append("apiKey", config.apiKey)
        formData.append("model", plan.model)
        formData.append("prompt", submittedPrompt)
        if (task.promptMode) formData.append("promptMode", task.promptMode)
        formData.append("requestedSize", requestedSize)
        formData.append("qualityLevel", task.quality)
        formData.append("ratio", task.ratio)
        formData.append("quality", "auto")
        formData.append("outputFormat", "png")
        formData.append("background", "auto")
        // 每张独立提交n=1，避免服务商忽略批量n参数而只返回一张。
        formData.append("imageCount", "1")
        formData.append("size", size)
        const productImages = task.productImages || (task.productImageDataUrl ? [{ dataUrl: task.productImageDataUrl, name: "product.png" }] : [])
        formData.append("productImageCount", String(productImages.length))
        for (const product of productImages) {
          const blob = await (await fetch(product.dataUrl)).blob()
          const file = new File([blob], product.name || "product.png", { type: blob.type || "image/png" })
          formData.append("images", file)
        }
        if (task.references && task.references.length > 0) {
          for (const ref of task.references) {
            const blob = await (await fetch(ref.dataUrl)).blob()
            const file = new File([blob], ref.name || "reference.png", { type: blob.type || "image/png" })
            formData.append("images", file)
          }
        }

        if (leavingRef.current || controller.signal.aborted) return
        const slots = task.redraw ? [...task.redraw.pending] : taskOutputIndices(task).filter(index => !task.resultUrls[index])
        if (!slots.length) {
          updateTask(task.id, { status: "success", error: undefined })
          return
        }
        const warnings: string[] = []
        let checkpointSaveFailed = false
        const batch = await requestImageBatch(slots.length, async () => {
          const single = new FormData()
          for (const [key, value] of formData.entries()) single.append(key, value)
          const response = await requestModelApi("/api/images", { method: "POST", body: single, signal: controller.signal })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            const failure = readImageFailure(response.status, data)
            throw new ImageItemError(failure.message, failure.outcome)
          }
          const images: { src: string }[] = Array.isArray(data.images) ? data.images : []
          if (!images[0]?.src) throw new ImageItemError("单张生图请求未返回图片，请核查服务商结果", "interrupted")
          if (Array.isArray(data.warnings)) warnings.push(...data.warnings.map(String))
          return images[0].src
        }, async progress => {
          if (leavingRef.current) return
          if (!controller.signal.aborted && progress.failures.some(failure => failure.outcome === "interrupted")) {
            pausedRef.current = true
            stopRef.current = true
            if (mountedRef.current) setPaused(true)
            try { localStorage.setItem(QUEUE_HOLD_KEY, "true") } catch { /* 当前页面仍保持暂停。 */ }
          }
          const patch = applyImageOutputs(task, slots, progress.outputs)
          const { resultUrls } = patch
          let resultsSaved = false
          if (resultUrls.length) {
            try { await saveTaskResults(task.id, resultUrls); resultsSaved = true }
            catch {
              if (!checkpointSaveFailed) toast.error("图片已返回但本地保存失败，请立即保存已有图片")
              checkpointSaveFailed = true
            }
          }
          if (!leavingRef.current) updateTask(task.id, { ...patch, resultsSaved })
        })
        if (leavingRef.current || controller.signal.aborted) return
        const resultPatch = applyImageOutputs(task, slots, batch.outputs)
        const { resultUrls } = resultPatch
        if (!batch.outputs.length && (task.redraw || !resultUrls.some(Boolean))) {
          requestUncertain = batch.failures.some(failure => failure.outcome === "interrupted")
          throw new Error(batch.failures.map(failure => failure.message).join("\n") || "生图模型未返回图片")
        }
        const redrawPending = resultPatch.redraw?.pending.length || 0
        requestUncertain = batch.failures.some(failure => failure.outcome === "interrupted")
        if (batch.failures.length) warnings.push(task.redraw
          ? `本次已替换 ${batch.outputs.length}/${slots.length} 张；未完成的位置保留旧图。${batch.failures.map(failure => failure.message).join("；")}。未自动重试。`
          : `已保留 ${resultUrls.filter(Boolean).length}/${task.count} 张；${batch.failures.map(failure => failure.message).join("；")}。缺少的图片未自动重试。`)
        let actualSize = size
        if (resultUrls[0]?.startsWith("data:image/")) {
          try {
            const bitmap = await createImageBitmap(await (await fetch(resultUrls[0])).blob())
            actualSize = `${bitmap.width}x${bitmap.height}`
            bitmap.close()
          } catch { /* 无法读取像素时保留已提交的尺寸，不影响保存结果。 */ }
        }
        let resultsSaved = false
        try {
          await saveTaskResults(task.id, resultUrls)
          resultsSaved = true
        } catch {
          toast.error("图片已生成，但本地结果存储失败；请在本页立即保存图片")
        }
        if (readProfile().autoArchive) {
          try {
            for (const output of batch.outputs) {
              const index = slots[output.index], src = output.src
              const imageResponse = await fetch(src, { signal: controller.signal })
              if (!imageResponse.ok) throw new Error("图片读取失败")
              await saveAsset(await imageResponse.blob(), { id: taskAssetId({ ...task, ...resultPatch }, index), name: `${task.label || "生成图片"} 第${index + 1}张`, kind: "generated", prompt: submittedPrompt, model: plan.model })
            }
          } catch { if (!controller.signal.aborted) toast.error("图片已生成，但自动存入资产中心失败，请在结果卡手动保存") }
        }
        if (leavingRef.current || controller.signal.aborted) return
        updateTask(task.id, {
          status: redrawPending ? requestUncertain ? "interrupted" : "failed" : "success",
          ...resultPatch,
          resultsSaved,
          error: redrawPending ? warnings.join("\n") + (requestUncertain ? "\n请求结果尚未确认，请先核查服务商记录再手动重试。" : "") : undefined,
          resultWarning: warnings.length ? warnings.join("\n") : undefined,
          requestInfo: { ...requestInfo, size: actualSize, elapsedMs: Date.now() - requestInfo.startedAt },
        })
      } catch (error) {
        if (leavingRef.current || controller.signal.aborted) return
        if (requestUncertain) {
          pausedRef.current = true
          stopRef.current = true
          setPaused(true)
          localStorage.setItem(QUEUE_HOLD_KEY, "true")
          updateTask(task.id, {
            status: "interrupted",
            error: (error instanceof Error ? error.message : "连接中断")
              + "\n请求结果尚未确认；上游可能仍在处理，请核查后再手动重试。",
            requestInfo: { ...requestInfo, elapsedMs: Date.now() - requestInfo.startedAt },
          })
          return
        }
        updateTask(task.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "未知错误",
          requestInfo: { ...requestInfo, elapsedMs: Date.now() - requestInfo.startedAt },
        })
      } finally {
        activeControllersRef.current.delete(task.id)
      }
    },
    [readImageConfig, updateTask, QUEUE_HOLD_KEY]
  )

  /** 同一入口持有执行锁；每个worker领取不同任务，全部结束后才释放跨标签页锁。 */
  const driveQueue = useCallback(async () => {
    if (!loaded || runningRef.current || pausedRef.current || !tasksRef.current.some((task) => task.status === "queued")) return
    runningRef.current = true
    const execute = async () => {
      if (!acquireLock()) {
        setExternalRunning(true)
        return
      }
      ownsLockRef.current = true
      setExternalRunning(false)
      const heartbeat = window.setInterval(refreshLock, 10_000)
      try {
        // 获得锁后重新读取持久化状态，不能根据观察标签页较旧的快照重复提交。
        const current = await hydrateTaskInputs(readGenerateQueue(origin)).then(hydrateTaskResults)
        if (leavingRef.current) return
        tasksRef.current = current
        setTasks(current)
        if (readGeneratePaused(origin)) {
          pausedRef.current = true
          setPaused(true)
        }
        const limit = generationWorkerCount(concurrencyRef.current, tasksRef.current.length)
        const inFlight = new Set<Promise<void>>()
        while (true) {
          while (inFlight.size < limit && !stopRef.current && !pausedRef.current && !leavingRef.current) {
            const target = tasksRef.current.find(task => task.status === "queued" && !activeControllersRef.current.has(task.id))
            if (!target) break
            const execution: Promise<void> = runTask(target).catch(error => {
              pausedRef.current = true
              stopRef.current = true
              setPaused(true)
              try { localStorage.setItem(QUEUE_HOLD_KEY, "true") } catch { /* 当前页面仍保持暂停。 */ }
              updateTask(target.id, { status: "interrupted", error: error instanceof Error ? error.message : "任务执行中断，请核查结果后再重试" })
            }).finally(() => { inFlight.delete(execution) })
            inFlight.add(execution)
          }
          if (inFlight.size === 0) break
          const wake = new Promise<void>(resolve => { wakeSchedulerRef.current = resolve })
          await Promise.race([...inFlight, wake])
          wakeSchedulerRef.current = null
        }
      } catch (error) {
        pausedRef.current = true
        setPaused(true)
        toast.error(error instanceof Error ? error.message : "队列恢复失败，请检查任务后再恢复执行")
      } finally {
        wakeSchedulerRef.current = null
        window.clearInterval(heartbeat)
        finishStop()
        releaseLock()
      }
    }
    try {
      if (!await withGenerateQueueLock(origin, execute)) setExternalRunning(true)
    } finally {
      finishStop()
      runningRef.current = false
      stopRef.current = false
    }
  }, [loaded, runTask, acquireLock, refreshLock, releaseLock, updateTask, finishStop, origin, QUEUE_HOLD_KEY])

  useEffect(() => {
    if (loaded && queueQueued > 0 && !pausedRef.current) {
      void driveQueue()
    }
  }, [loaded, queueQueued, driveQueue])

  useEffect(() => {
    const interruptCurrent = () => {
      if (!runningRef.current || !ownsLockRef.current) return
      leavingRef.current = true
      stopRef.current = true
      pausedRef.current = true
      for (const controller of activeControllersRef.current.values()) controller.abort()
      localStorage.setItem(QUEUE_HOLD_KEY, "true")
      const next = tasksRef.current.map((task): GenerateTask => task.status === "running"
        ? { ...task, status: "interrupted", error: "页面已离开，无法确认上游是否完成；检查结果后再手动重试" }
        : task)
      tasksRef.current = next
      try { persistGenerateQueue(next, origin) } catch { /* 页面关闭时无法再提示 */ }
      releaseLock()
    }
    window.addEventListener("pagehide", interruptCurrent)
    return () => {
      window.removeEventListener("pagehide", interruptCurrent)
      interruptCurrent()
    }
  }, [releaseLock, origin, QUEUE_HOLD_KEY])

  const handlePauseToggle = useCallback(() => {
    const next = !pausedRef.current
    if (!next && !readImageConfig().apiKey) { toast.error("请先在API设置中保存生图配置"); return }
    pausedRef.current = next
    setPaused(next)
    if (next) {
      try { localStorage.setItem(QUEUE_HOLD_KEY, "true") } catch { sessionStorage.setItem(QUEUE_HOLD_KEY, "true") }
    }
    else {
      localStorage.setItem(QUEUE_HOLD_KEY, "false")
      sessionStorage.removeItem(QUEUE_HOLD_KEY)
      stopRef.current = false
      wakeSchedulerRef.current?.()
      void driveQueue()
    }
    toast.info(next ? "已暂停后续任务；已提交的任务仍会完成" : "已恢复执行")
  }, [driveQueue, readImageConfig, QUEUE_HOLD_KEY])

  const handleStopRound = useCallback(() => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    setStopping(true)
    stopRef.current = true
    pausedRef.current = true
    try { localStorage.setItem(QUEUE_HOLD_KEY, "true") } catch { sessionStorage.setItem(QUEUE_HOLD_KEY, "true") }
    setPaused(true)
    for (const controller of activeControllersRef.current.values()) controller.abort()
    wakeSchedulerRef.current?.()
    if (!runningRef.current) finishStop()
    toast.info("已停止发送并结束本地等待；已返回图片保留。服务商可能仍在处理已提交请求，请核查后重试。")
  }, [QUEUE_HOLD_KEY, finishStop])

  const handleContinueStopped = () => {
    if (stoppingRef.current || runningRef.current || externalRunning) return
    if (!readImageConfig().apiKey) { toast.error("请先在API设置中保存生图配置"); return }
    const visibleIds = new Set(visibleTasks.map(task => task.id))
    const next = tasksRef.current.map(task => task.stoppedBeforeSend && visibleIds.has(task.id)
      ? { ...task, status: "queued" as const, stoppedBeforeSend: undefined, error: undefined } : task)
    if (!commitTasks(next)) return
    pausedRef.current = false
    stopRef.current = false
    setPaused(false)
    localStorage.setItem(QUEUE_HOLD_KEY, "false")
    sessionStorage.removeItem(QUEUE_HOLD_KEY)
    void driveQueue()
  }

  const handleRetry = async (taskId: string) => {
      if (activeControllersRef.current.has(taskId)) return
      const current = tasksRef.current.find(task => task.id === taskId)
      if (!current) return
      if (current.redraw?.pending.length) { await handleRedrawSelected({ [taskId]: current.redraw.pending }); return }
      const retainedUrls = current.resultUrls
      const retainedCount = retainedUrls.filter(Boolean).length
      if (retainedCount >= current.count) return
      if (current.status === "interrupted" && !window.confirm("该请求已提交过，服务商可能仍在处理或已经计费。请先核查服务商记录；继续将为缺少图片发送新请求，可能再次计费。确认重试？")) return
      if (!retainedCount) await deleteTaskResults(taskId).catch(() => {})
      pausedRef.current = false
      setPaused(false)
      localStorage.setItem(QUEUE_HOLD_KEY, "false")
      sessionStorage.removeItem(QUEUE_HOLD_KEY)
      stopRef.current = false
      if (!updateTask(taskId, { status: "queued", stoppedBeforeSend: undefined, redraw: undefined, error: undefined, resultWarning: undefined, resultUrls: retainedUrls, resultCount: retainedCount, resultsSaved: retainedCount > 0 && current.resultsSaved })) return
      wakeSchedulerRef.current?.()
      void driveQueue()
  }

  const handleDeleteTask = useCallback((taskId: string) => {
    if (activeControllersRef.current.has(taskId) || (runningRef.current && activeControllersRef.current.size === 0)) return
    const previous = tasksRef.current
    const retained = previous.filter((task) => task.id !== taskId)
    if (!commitTasks(retained)) return
    releaseQueueInputs(previous.filter(task => task.id === taskId), retained)
    void deleteTaskResults(taskId).catch(() => {})
  }, [commitTasks])

  const selectedImageCount = visibleTasks.filter(canSelectResult).reduce((sum, task) => sum + taskOutputIndices(task).filter(index => selectedOutputs[task.id]?.includes(index)).length, 0)
  const setOutputSelected = (taskId: string, index: number, checked: boolean) => setSelectedOutputs(current => ({
    ...current, [taskId]: checked ? [...new Set([...(current[taskId] || []), index])] : (current[taskId] || []).filter(value => value !== index),
  }))

  const handleRedrawSelected = async (selection = selectedOutputs) => {
    if (redrawBusyRef.current || runningRef.current || externalRunning || !loaded || tasksRef.current.some(task => task.status === "queued" || task.status === "running")) return
    if (!readImageConfig().apiKey) { toast.error("请先在API设置中保存生图配置"); return }
    const visibleIds = new Set(visibleTasks.map(task => task.id))
    selection = Object.fromEntries(Object.entries(selection).filter(([id]) => visibleIds.has(id)))
    redrawBusyRef.current = true
    setRedrawBusy(true)
    const execute = async () => {
      if (!acquireLock()) { toast.error("另一标签页正在操作队列，请稍后重试"); return }
      ownsLockRef.current = true
      const heartbeat = window.setInterval(refreshLock, 10_000)
      try {
        const current = await hydrateTaskInputs(readGenerateQueue(origin)).then(hydrateTaskResults)
        if (current.some(task => task.status === "queued" || task.status === "running")) { toast.error("请先处理正在生成或排队的任务"); return }
        const targets = current.filter(task => canSelectResult(task) && taskOutputIndices(task).some(index => selection[task.id]?.includes(index)))
        if (!targets.length) return
        if (targets.some(task => task.status === "interrupted") && !window.confirm("所选项有结果不明的请求，上游可能仍在处理或已经计费。请先核查服务商记录；继续将对所选位置重新生图，可能再次计费。确认重绘？")) return
        const result = await submitRedrawQueue(selection, origin)
        if (result !== "saved") { toast.error(result === "blocked" ? "队列已变化，请核对后重新选择" : "重绘任务保存失败，未发送生图请求"); return }
        setSelectedOutputs({})
        toast.success(`已开始原位重绘 ${targets.reduce((sum, task) => sum + taskOutputIndices(task).filter(index => selection[task.id]?.includes(index)).length, 0)} 张；返回后替换对应图片`)
      } finally { window.clearInterval(heartbeat); releaseLock() }
    }
    try {
      if (!await withGenerateQueueLock(origin, execute)) toast.error("另一标签页正在执行本栏目任务，请稍后重试")
    } catch (error) { toast.error(error instanceof Error ? error.message : "重绘任务创建失败") }
    finally { redrawBusyRef.current = false; if (mountedRef.current) setRedrawBusy(false) }
  }

  const handleClearAll = useCallback(() => {
    if (runningRef.current) return
    const previous = tasksRef.current
    const ids = tasksRef.current.map((task) => task.id)
    if (!commitTasks([])) return
    releaseQueueInputs(previous)
    ids.forEach((id) => { void deleteTaskResults(id).catch(() => {}) })
    localStorage.setItem(QUEUE_HOLD_KEY, "false")
    sessionStorage.removeItem(QUEUE_HOLD_KEY)
    pausedRef.current = false
    setPaused(false)
  }, [commitTasks, QUEUE_HOLD_KEY])

  const statusLabel: Record<GenerateTask["status"], string> = {
    queued: "排队中",
    running: "生成中",
    success: "已完成",
    failed: "失败",
    interrupted: "待确认",
  }

  if (!viewedBatch) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">暂无生成任务</p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            {emptyHint ?? "点击本页的「生图」/「开始生成」后，任务会在这里按并发设置执行并展示结果。"}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {viewedBatch && <section data-generation-batches data-batch-id={viewedBatch.id} data-current-batch={viewedBatch.id === latestBatch?.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{viewedBatch.id === latestBatch?.id ? "当前批次" : "历史批次"} · 计划 {stats.totalImages} 张</h2>
          <p data-result-entry-count className="text-xs text-muted-foreground">{visibleSlots.length} 个提示词框 · {visibleTasks.length} 组已提交结果{unsubmitted > 0 ? ` · ${unsubmitted} 组未生成` : ""}</p>
          <p className="text-xs text-muted-foreground">按提示词框顺序一一对应；只更新启用条目，其余当前结果保留。已移除条目的旧图在历史批次查看。</p>
          {viewedBatch.id !== latestBatch?.id && queueBusy && <p className="text-xs text-amber-300">本栏目仍有任务正在处理，切换查看不会中断接收；并发、暂停和停止控制本栏执行队列。</p>}
        </div>
        {batches.length > 1 && <label className="flex max-w-full items-center gap-2 text-xs text-muted-foreground">查看批次
          <select aria-label="查看生成批次" className="h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm text-foreground" value={viewedBatch.id} onChange={event => {
            if (!latestBatch) return
            setBatchChoice({ latest: latestBatch.id, selected: event.target.value })
            setSelectedOutputs({})
          }}>
            {[...batches].reverse().map((batch, index) => <option key={batch.id} value={batch.id}>{index === 0 ? "当前批次" : `历史批次 ${batches.length - index}`} · {generationStats(batch.tasks).totalImages} 张</option>)}
          </select>
        </label>}
      </section>}
      {loaded && !externalRunning && ((paused && stats.queued > 0) || stats.stopped > 0 || stats.interrupted > 0 || stats.partial > 0) && <aside data-queue-recovery role="status" className="flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">检测到未完成任务</h2>
          <p className="text-xs leading-5 text-muted-foreground">已保留任务记录与图片。排队 {stats.queued} 条，已停止且未发送 {stats.stopped} 条，待确认 {stats.interrupted} 条，部分返回 {stats.partial} 条。</p>
          <p className="text-xs leading-5 text-muted-foreground">“继续”仅执行本栏目排队任务；旧待确认和部分返回会保留。其他栏目独立运行。已发出的连接无法在刷新后接回，请先核查服务商，再确认重试或补图，不会自动重发。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.stopped > 0 && <Button type="button" data-continue-stopped className="primary-action min-h-10" disabled={stopping || queueBusy} onClick={handleContinueStopped}><PlayIcon data-icon="inline-start" />继续未发送任务（{stats.stopped} 条）</Button>}
          {paused && stats.queued > 0 && <Button type="button" data-continue-queue className="primary-action min-h-10" onClick={handlePauseToggle}><PlayIcon data-icon="inline-start" />继续未发送任务（{stats.queued} 条）</Button>}
          {stats.interrupted + stats.partial > 0 && <Button type="button" variant="outline" onClick={() => {
            const target = visibleTasks.find(task => task.status === "interrupted" || (task.status === "success" && countTaskResults(task) < task.count))
            if (target) document.getElementById(`generate-task-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}>查看需核查的任务</Button>}
        </div>
      </aside>}
      {/* 生成进度 */}
      <Card data-generation-progress>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">生成进度</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>成功 {stats.success}</span>
            {stats.partial > 0 && <span className="text-amber-300">/ 部分返回 {stats.partial}</span>}
            <span>/ 失败 {stats.failed}</span>
            {stats.stopped > 0 && <span>/ 已停止 {stats.stopped}</span>}
            <span>/ 生成中 {stats.running}</span>
            <span>/ 排队 {stats.queued}</span>
            {stats.interrupted > 0 && <span>/ 待确认 {stats.interrupted}</span>}
            <span>· 共 {stats.total}</span>
            <span>· 已返回 {stats.receivedImages}/{stats.totalImages} 张</span>
            <span>· 返回率 {stats.percent}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">任务并发
              <select aria-label="任务并发数量" className="h-8 max-w-full rounded-md border bg-background px-2 text-xs text-foreground disabled:opacity-50" value={concurrency} disabled={!loaded || externalRunning || queueRunning > 0} onChange={event => {
                const next = normalizeGenerationConcurrency(event.target.value)
                try { localStorage.setItem(QUEUE_CONCURRENCY_KEY, next); concurrencyRef.current = next; setConcurrency(next) }
                catch { toast.error("并发设置保存失败，请检查浏览器存储权限") }
              }}>
                {GENERATION_CONCURRENCY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Button
              type="button"
              variant={paused ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={handlePauseToggle}
              disabled={stopping || externalRunning || !queueBusy}
            >
              {paused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
              {paused ? "恢复执行" : "暂停后续"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleStopRound}
              disabled={stopping || externalRunning || !queueBusy}
            >
              <StopCircleIcon data-icon="inline-start" />
              {stopping ? "正在停止…" : "停止本轮"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={handleClearAll}
              disabled={externalRunning || queueRunning > 0}
              title="清空本栏目全部批次；资产中心已保存图片不受影响"
            >
              <Trash2Icon data-icon="inline-start" />
              清空本栏目
            </Button>
          </div>
        </CardContent>
        {stopping && <CardContent className="pt-0 text-xs text-muted-foreground">正在结束本地连接并保存已返回图片，完成后即可重新提交；不会等待服务商生成完毕。</CardContent>}
        {externalRunning && <CardContent className="pt-0 text-xs text-muted-foreground">另一标签页正在执行本栏目队列，本页会同步显示进度；其他栏目不受影响。</CardContent>}
        {stats.interrupted > 0 && <CardContent className="pt-0 text-xs text-amber-300">有任务未收到确定结果。请查看卡片中的具体原因，核查后再手动重试。</CardContent>}
        {stats.queued + stats.running > 0 && (
          <CardContent className="pt-0">
            <Progress value={stats.percent} className="h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">
              每张图片单独请求、并行生成，返回一张就保存一张；任务并发控制同时执行的提示词组数。站内切换导航后继续接收。暂停只拦截后续任务，已提交图片仍会完成；刷新后先核查状态再重试。
            </p>
          </CardContent>
        )}
      </Card>

      <RequestWaitNotice active={stats.running > 0} label={`正在生成 ${stats.running} 组图片`} />
      {/* 生成结果 */}
      <section className="flex flex-col gap-3">
        <div data-result-selection className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium">批量重绘 · 已选 {selectedImageCount} 张</p>
            <p className="text-xs leading-5 text-muted-foreground">沿用提示词和原产品素材发起新请求，可能产生费用；新图在原图号替换，失败保留旧图，不新增卡片。待确认项请先核查服务商结果。</p>
            {queueBusy && <p className="text-xs text-muted-foreground">本栏目还有生成中 / 排队任务，请处理完成后再重绘所选。</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectionActions disabled={!loaded || redrawBusy} onSelect={action => setSelectedOutputs(current => selectOutputs(visibleTasks, current, action))} />
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={!loaded || redrawBusy} onClick={() => setSelectedOutputs(current => selectOutputs(visibleTasks, current, "failed"))}>勾选失败/缺图</Button>
            <Button type="button" size="sm" className="h-8 text-xs" disabled={!loaded || redrawBusy || externalRunning || queueBusy || selectedImageCount === 0} onClick={() => void handleRedrawSelected()}><RefreshCwIcon data-icon="inline-start" />{redrawBusy ? "创建重绘任务…" : `重绘所选 ${selectedImageCount} 张`}</Button>
          </div>
        </div>
        {showSectionHead && (
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">生成结果</h2>
            <span className="text-xs text-muted-foreground">比例标签 = 输出比例 · 清晰度（1K/2K）→ 实际像素尺寸</span>
          </div>
        )}
        <div className="entry-grid">
          {visibleSlots.map(({ entryId, task }, index) => task ? (
            <Card key={task.id} id={`generate-task-${task.id}`} data-generation-task={task.id} data-result-entry={entryId} data-result-position={index + 1} className="h-full">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ResultSelection label={`选择任务 ${index + 1} 重绘`} checked={canSelectResult(task) && taskOutputIndices(task).every(output => selectedOutputs[task.id]?.includes(output))} mixed={canSelectResult(task) && Boolean(selectedOutputs[task.id]?.length) && !taskOutputIndices(task).every(output => selectedOutputs[task.id]?.includes(output))} disabled={!canSelectResult(task) || redrawBusy} onChange={checked => setSelectedOutputs(current => ({ ...current, [task.id]: checked ? taskOutputIndices(task) : [] }))} />
                    <Badge variant="secondary" className="font-mono text-xs">
                      任务{String(index + 1).padStart(2, "0")}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {task.ratio === "custom" ? customRatioLabel(task.customSize) : task.ratio}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {task.quality.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{task.count > 1 ? `×${task.count}` : ""}</span>
                  </div>
                  <Badge
                    variant={
                      task.status === "success"
                        ? "default"
                        : task.status === "failed"
                          ? "destructive"
                          : task.status === "running"
                            ? "secondary"
                            : "outline"
                    }
                    className="font-mono text-xs"
                  >
                    {task.status === "running" && (
                      <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
                    )}
                    {task.stoppedBeforeSend ? "已停止·未发送" : task.redraw && (task.status === "running" || task.status === "queued") ? task.status === "running" ? "重绘中" : "重绘排队中" : task.status === "success" && countTaskResults(task) < task.count ? "部分返回" : statusLabel[task.status]}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2 text-xs">
                  {task.prompt.slice(0, 120)}…
                </CardDescription>
                <p data-task-origin={taskGenerateOrigin(task)} className="text-xs text-muted-foreground">来源：{GENERATE_ORIGINS[taskGenerateOrigin(task)]}</p>
                {task.redrawOf && <p className="text-xs text-muted-foreground">重绘版本 · 源任务 {visibleTasks.findIndex(source => source.id === task.redrawOf) + 1 || "已移除"} · 原第 {(task.redrawIndices || []).map(index => index + 1).join("、")} 张 · 原结果保留</p>}
                {task.redraw && <p data-in-place-redraw className="text-xs text-muted-foreground">原位重绘 · 第 {task.redraw.indices.map(index => index + 1).join("、")} 张 · {task.redraw.pending.length ? `还剩 ${task.redraw.pending.length} 张未完成，原图保留至新图返回` : "已替换对应位置"}</p>}
                {task.requestInfo && (
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {task.requestInfo.provider} · {task.requestInfo.model}
                    {task.requestInfo.elapsedMs !== undefined && " · 用时 " + Math.round(task.requestInfo.elapsedMs / 1000) + " 秒"}
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2">
                {(task.status === "failed" || task.status === "interrupted") && (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-destructive">{task.error || (task.status === "interrupted" ? "请求结果尚未确认，请先核查服务商记录。" : "生成失败")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-fit text-xs"
                      onClick={() => handleRetry(task.id)}
                      disabled={externalRunning}
                    >
                      <RefreshCwIcon data-icon="inline-start" />
                      {task.redraw?.pending.length ? `重试未完成的 ${task.redraw.pending.length} 张重绘` : countTaskResults(task) > 0 ? `补生成缺少的 ${Math.max(0, task.count - countTaskResults(task))} 张` : task.status === "interrupted" ? "确认重试" : "重试本条"}
                    </Button>
                  </div>
                )}
                <TaskImageGallery task={task} taskNumber={index + 1} selectionDisabled={redrawBusy} selectedOutputs={selectedOutputs[task.id]} onSelectOutput={canSelectResult(task) ? (output, checked) => setOutputSelected(task.id, output, checked) : undefined} />
                {task.status === "success" && countTaskResults(task) > 0 && countTaskResults(task) < task.count && <div className="flex flex-col gap-1.5 rounded-md border border-amber-400/30 p-2.5">
                  <p className="text-xs text-muted-foreground">保留已有 {countTaskResults(task)} 张；点击后只为缺少部分发起新的生图请求。</p>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-fit text-xs" disabled={externalRunning} onClick={() => void handleRetry(task.id)}>补生成缺少的 {task.count - countTaskResults(task)} 张</Button>
                </div>}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                  <ImageSizeHint size={task.ratio === "custom" ? task.customSize : sizeFromRatioQuality(task.ratio, task.quality)} qualityLevel={task.quality} ratio={task.ratio}
                    model={task.status === "success" || task.status === "running" ? task.requestInfo?.model : undefined}
                    actualSize={task.status === "success" ? task.requestInfo?.size : undefined} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={externalRunning || task.status === "running"}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    删除任务
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card key={`unsubmitted-${entryId}`} data-result-entry={entryId} data-result-position={index + 1} data-result-unsubmitted className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2"><Badge variant="secondary" className="font-mono text-xs">任务{String(index + 1).padStart(2, "0")}</Badge><Badge variant="outline">未生成</Badge></div>
                <CardDescription>对应提示词框 {index + 1}</CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-48 items-center justify-center text-center text-sm leading-6 text-muted-foreground">此条尚未提交生图。<br />返回输入/编辑，填写并启用后再提交。</CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
