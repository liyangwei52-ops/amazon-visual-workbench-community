"use client"
import { FixedActionBar } from "./fixed-action-bar"
import { ApiSetupNotice } from "./api-setup-notice"
import { ImageModelNotice } from "./image-model-notice"
import { analysisImageModelNote } from "@/lib/model-prompt-profile"
import { selectEntries } from "@/lib/generation-selection"
import { requestedCanvas } from "@/lib/model-image-plan"
import { isCustomOutputValid } from "@/lib/output-ratio"
import { GenerationSettings } from "@/components/generation-settings"
import { RequestWaitNotice } from "@/components/request-wait-notice"
import { EntryEnabled, BatchGenerateButton, SelectionActions } from "@/components/generation-actions"
import { PromptEditor } from "@/components/prompt-editor"
import { ProductImagesUpload } from "@/components/product-images-upload"
import { useProductImages, productImageDrafts, type ProductImageDraft } from "@/lib/use-product-images"
import { productAnalysisImages, productIdentitySystemNote } from "@/lib/image-identities"

import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react"
import {
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { toast } from "sonner"
import { readApiSettings } from "@/lib/api-settings"
import { requestModelApi } from "@/lib/model-api-client"
import { analysisFailureMessage } from "@/lib/analysis-failure"
import { buildAnalyzeRequestBody } from "@/lib/analyze-request"

import { VisualSidebar } from "@/components/visual-sidebar"
import { LoadSuitePanel } from "@/components/load-suite-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  REMIX_DRAFT_KEY,
  buildImageIdentitySuffix,
  normalizeRatio,
  sizeFromRatioQuality,
  type GenerateTask,
  type QualityLevel,
} from "@/lib/visual-shared"
import { applyRequestedOutputSize, prepareImagePrompt } from "@/lib/prompt-utils"
import { parseRemixRewrite } from "@/lib/remix-parse"
import { loadDraftWithImages, saveDraft } from "@/lib/draft-store"
import { REMIX_STRATEGIST_SYSTEM_PROMPT } from "@/lib/remix-strategist-prompt"
import { ANALYSIS_COPY_TASK_NOTE } from "@/lib/analysis-prompt-rules"
import { LOCAL_SCENE_VARIATION_TASK_NOTE } from "@/lib/local-scene-variation"
import { listSuites, type SavedSuite } from "@/lib/suite-store"
import { generateHref, submitGenerateQueue } from "@/lib/generate-queue-store"

type RemixEntry = {
  id: string
  prompt: string
  enabled: boolean
  size: string
  customSize: string
  quality: QualityLevel
  count: string
  isRewriting: boolean
  rewriteError?: string
}

function createEntry(index: number): RemixEntry {
  return {
    id: `entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: "",
    enabled: true,
    size: "1:1",
    customSize: "",
    quality: "2k",
    count: "1",
    isRewriting: false,
  }
}

export function VisualRemix({ onRewritingChange }: { onRewritingChange?: (active: boolean) => void } = {}) {
  const router = useRouter()
  const pathname = usePathname()

  const products = useProductImages()
  const { images: productImages, main: productImage, restore: restoreProductImages } = products
  const [productInfo, setProductInfo] = useState("")

  const [entries, setEntryState] = useState<RemixEntry[]>(() => [createEntry(1)])
  const entryStateRef = useRef(entries)
  // 乱序响应先更新同一个当前清单，再保存检查点，避免两个返回互相覆盖。
  const setEntries = useCallback((action: SetStateAction<RemixEntry[]>) => {
    const next = typeof action === "function" ? action(entryStateRef.current) : action
    entryStateRef.current = next
    setEntryState(next)
    return next
  }, [])
  const draftInputsRef = useRef({ productInfo, productImages })
  useEffect(() => { draftInputsRef.current = { productInfo, productImages } }, [productInfo, productImages])
  const persistEntries = useCallback((items: RemixEntry[]) => {
    const input = draftInputsRef.current
    const result = saveDraft(REMIX_DRAFT_KEY, {
      entries: items.map(({ id, prompt, enabled, size, customSize, quality, count }) => ({ id, prompt, enabled, size, customSize, quality, count })),
      productInfo: input.productInfo,
      productImages: productImageDrafts(input.productImages),
      savedAt: Date.now(),
    })
    if (result === "failed") toast.error("迁移现场保存失败，请先导出提示词备份")
  }, [])
  const [batchRewriteFull, setBatchRewriteFull] = useState("")

  const [rewritePhase, setRewritePhase] = useState<"preparing" | "waiting" | null>(null)
  const isRewriting = rewritePhase !== null
  const rewritingRef = useRef(false)
  const rewriteEpochRef = useRef(0)
  const [rewriteStats, setRewriteStats] = useState<{ completed: number; total: number } | null>(null)
  const [rewriteError, setRewriteError] = useState("")
  const rewriteCacheRef = useRef<{ context: string; partial: boolean; results: Map<string, { settings: string; output: string }> }>({ context: "", partial: false, results: new Map() })
  const [rewriteProgress, setRewriteProgress] = useState(0)




  const [draftRestored, setDraftRestored] = useState(false)

  useEffect(() => { onRewritingChange?.(isRewriting) }, [isRewriting, onRewritingChange])

  // 刷新先触发 beforeunload，再取消旧连接；站内导航仅隐藏组件，不触发这些事件。
  useEffect(() => {
    const stopDepartingRun = () => {
      if (!rewritingRef.current) return
      rewriteEpochRef.current += 1
      rewritingRef.current = false
      setEntries(current => current.map(entry => entry.isRewriting ? { ...entry, isRewriting: false } : entry))
      setRewritePhase(null)
      setRewriteError("页面已离开，本轮未发出的条目已停止；已填入的内容保留。返回后可手动继续改写。")
      persistEntries(entryStateRef.current)
    }
    window.addEventListener("beforeunload", stopDepartingRun)
    window.addEventListener("pagehide", stopDepartingRun)
    return () => {
      window.removeEventListener("beforeunload", stopDepartingRun)
      window.removeEventListener("pagehide", stopDepartingRun)
    }
  }, [setEntries, persistEntries])

  // 持续保存现场；站内导航仅隐藏，刷新后只恢复草稿，不恢复发送资格。
  useEffect(() => {
    if (!draftRestored) return
    const persist = () => persistEntries(entryStateRef.current)
    const timer = setTimeout(persist, 600)
    window.addEventListener("pagehide", persist)
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", persist); persist() }
  }, [draftRestored, entries, productInfo, productImages, persistEntries])

  /** 只替换提示词和比例，保留当前产品图、产品信息及生成偏好。 */
  const applyLoadedSuite = useCallback((suite: SavedSuite) => {
    if (rewritingRef.current) { toast.error("提示词正在迁移，请完成后再载入套装"); return }
    setEntries((previous) =>
      suite.entries.length > 0
        ? suite.entries.map((entry, index) => ({
            id: `entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            prompt: entry.prompt,
            enabled: true,
            size: normalizeRatio(entry.size),
            customSize: entry.customSize,
            quality: previous[index]?.quality || "2k",
            count: previous[index]?.count || "1",
            isRewriting: false,
          }))
        : [createEntry(1)]
    )
    setBatchRewriteFull("")
    setRewriteError("")
    setRewriteStats(null)
    toast.success(`已载入套装「${suite.name}」（${suite.entries.length} 条提示词，逐条对应提示词框）`)
  }, [setEntries])

  // 首次挂载恢复草稿；站内返回保留内存中的请求、缓存与状态。
  useEffect(() => {
    let active = true
    const restoreDraft = async () => {
      try {
        const draft = await loadDraftWithImages<{
          entries: Array<{
            id?: unknown
            prompt?: unknown
            enabled?: unknown
            size?: unknown
            customSize?: unknown
            quality?: unknown
            count?: unknown
          }>
          productInfo?: unknown
          productImages?: ProductImageDraft[]
          productImageDataUrl?: unknown
          productImageName?: unknown
        }>(REMIX_DRAFT_KEY)
        if (!active) return
        if (!draft || !Array.isArray(draft.entries) || draft.entries.length === 0) return
        setEntries(
          draft.entries.map((entry, index) => ({
            id: typeof entry.id === "string" && entry.id ? entry.id : `entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            prompt: typeof entry.prompt === "string" ? entry.prompt : "",
            enabled: entry.enabled !== false,
            size: normalizeRatio(typeof entry.size === "string" ? entry.size : "1:1"),
            customSize: typeof entry.customSize === "string" ? entry.customSize : "",
            quality: (entry.quality === "1k" || entry.quality === "2k" ? entry.quality : "2k") as QualityLevel,
            count: typeof entry.count === "string" ? entry.count : "1",
            isRewriting: false,
          }))
        )
        if (typeof draft.productInfo === "string") setProductInfo(draft.productInfo)
        const storedProducts = draft.productImages ?? (typeof draft.productImageDataUrl === "string" && draft.productImageDataUrl ? [{ id: "legacy-product", name: typeof draft.productImageName === "string" ? draft.productImageName : "product.png", dataUrl: draft.productImageDataUrl }] : [])
        if (storedProducts.length) await restoreProductImages(storedProducts)
        toast.success("已恢复上次工作台现场（跳转前的条目与产品素材）")
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "迁移现场恢复失败")
      } finally {
        if (active) {
          setDraftRestored(true)
        }
      }
    }
    void restoreDraft()
    return () => { active = false }
    // 仅挂载时注册一次
     
  }, [restoreProductImages, setEntries])

  // 套装页的显式“在提示词迁移使用”仍可载入已常驻的页面；忙碌时不覆盖本轮结果。
  useEffect(() => {
    if (pathname !== "/remix" || !draftRestored) return
    const loadSuiteId = localStorage.getItem("amazon-workbench.loadSuiteId")
    if (!loadSuiteId) return
    localStorage.removeItem("amazon-workbench.loadSuiteId")
    const target = listSuites().find(suite => suite.id === loadSuiteId)
    if (target) applyLoadedSuite(target)
  }, [pathname, draftRestored, applyLoadedSuite])

  const updateEntry = useCallback((entryId: string, patch: Partial<RemixEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry))
    )
  }, [setEntries])

  const handleAddEntry = useCallback(() => {
    setEntries((current) => [...current, createEntry(current.length + 1)])
  }, [setEntries])

  const handleClearAll = useCallback(() => {
    if (rewritingRef.current) return
    setEntries([createEntry(1)])
    setBatchRewriteFull("")
    setRewriteError("")
    setRewriteStats(null)
    toast.success("已清空提示词条目")
  }, [setEntries])

  /** AI 批量改写：根据新产品图/信息，逐条改写产品描述、氛围、人群 */
  const handleRewriteAll = useCallback(async () => {
    if (rewritingRef.current) return
      if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
    const apiSettings = readApiSettings()
    const { apiKey: analyzeApiKey } = apiSettings.analysis
    if (!analyzeApiKey) {
      toast.error("请先在「API 设置」中填写并保存分析配置")
      return
    }
    if (!productImage) {
      toast.error("请先上传【新产品图】")
      return
    }
    const targets = entries.filter((entry) => entry.enabled && entry.prompt.trim())
    const prompts = targets.map(entry => entry.prompt.trim())
    if (prompts.length === 0) {
      toast.error("请先导入 / 填写至少一条提示词")
      return
    }

    rewritingRef.current = true
    const runEpoch = ++rewriteEpochRef.current
    setRewritePhase("preparing")
    setRewriteStats({ completed: 0, total: targets.length })
    setRewriteError("")
    setRewriteProgress(10)
    setEntries((current) => current.map((entry) => ({ ...entry, rewriteError: "", isRewriting: targets.some(target => target.id === entry.id) })))

    try {
      const context = JSON.stringify({ product: productImages.map(image => image.dataUrl), productInfo, endpoint: apiSettings.analysis.endpoint, model: apiSettings.analysis.model, imageModel: apiSettings.image.model })
      const previous = rewriteCacheRef.current
      const results: typeof previous.results = new Map()
      const settingsFor = (entry: RemixEntry) => JSON.stringify([entry.size, entry.customSize, entry.quality])
      if (previous.partial && previous.context === context) {
        for (const entry of targets) {
          const cached = previous.results.get(entry.id)
          if (cached?.settings === settingsFor(entry) && cached.output.trim() === entry.prompt.trim()) results.set(entry.id, cached)
        }
      }
      const cache = { context, partial: true, results }
      rewriteCacheRef.current = cache
      const updateProgress = () => {
        setRewriteStats({ completed: results.size, total: targets.length })
        setRewriteProgress(Math.round(results.size / targets.length * 100))
        setBatchRewriteFull(targets.flatMap(entry => {
          const result = results.get(entry.id)
          return result ? [`【提示词 ${entries.findIndex(item => item.id === entry.id) + 1}】\n${result.output}`] : []
        }).join("\n\n"))
      }
      updateProgress()
      setEntries(current => current.map(entry => results.has(entry.id) ? { ...entry, isRewriting: false } : entry))
      const errors: Array<{ index: number; message: string }> = []
      let nextBatch = 0
      const totalBatches = targets.length
      // 一条一个请求，最多三条并行，保留完整细节并隔离慢请求。
      await Promise.all(Array.from({ length: Math.min(3, totalBatches) }, async () => {
      while (rewriteEpochRef.current === runEpoch && nextBatch < totalBatches) {
        const batchIndex = nextBatch++
        const entry = targets[batchIndex]
        if (results.has(entry.id)) continue
        const entryIndex = entries.findIndex(item => item.id === entry.id) + 1
        try {
        const offset = batchIndex
        const batch = targets.slice(offset, offset + 1)
        const userText = [
          productInfo.trim() ? `【新产品信息】\n${productInfo.trim()}` : "【新产品信息】（未提供，仅依据新产品图）",
          `【本批迁移 ${batch.length} 条，输出编号从1开始】`,
          ...batch.map((entry, index) => `【输入提示词 ${index + 1}】\n【当前画布设置，仅用于构图，不作为上图文字】${requestedCanvas(entry.size === "custom" ? entry.customSize : sizeFromRatioQuality(normalizeRatio(entry.size), entry.quality), entry.quality, entry.size, apiSettings.image.model)}；优先于旧画幅，无需在成品正文重抄技术设置。\n${entry.prompt.trim()}`),
          "【当前任务：同类商品换主题】沿用旧图位和布局，主要替换新产品描述、主题、人物形象/服饰及环境氛围；单品不扩全套，局部框仍属同一主体。新尺寸未知时去掉旧数字/测量线，以可见形态、结构或使用展示完成，不把缺长宽厚当普通迁移的阻断条件，不编数据。仅本次明确必须标注未知实测值且不能替代，或缺对应主体时说明无法完成。输出本批同数量/顺序的完整正负向，不输出映射报告。",
          ANALYSIS_COPY_TASK_NOTE,
          LOCAL_SCENE_VARIATION_TASK_NOTE,
        ].join("\n\n")
        const body = await buildAnalyzeRequestBody({
            ...apiSettings.analysis,
            systemPrompt: REMIX_STRATEGIST_SYSTEM_PROMPT + productIdentitySystemNote(productImages.length) + analysisImageModelNote(apiSettings.image.model),
            userText,
            images: productAnalysisImages(productImages),
          })
        if (rewriteEpochRef.current !== runEpoch) return
        setRewritePhase("waiting")
        const response = await requestModelApi("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
        const data = await response.json().catch(() => ({}))
        if (rewriteEpochRef.current !== runEpoch) return
        if (!response.ok) throw new Error(data.error || `改写请求失败（${response.status}）`)
        const output = typeof data.prompt === "string" ? data.prompt.trim() : ""
        const parsed = parseRemixRewrite(output, batch.length)
        const outputPrompt = applyRequestedOutputSize(parsed[0], requestedCanvas(entry.size === "custom" ? entry.customSize : sizeFromRatioQuality(normalizeRatio(entry.size), entry.quality), entry.quality, entry.size, apiSettings.image.model))
        results.set(entry.id, { settings: settingsFor(entry), output: outputPrompt })
        const current = setEntries(items => items.map(item => item.id === entry.id ? { ...item, prompt: outputPrompt, isRewriting: false, rewriteError: "" } : item))
        persistEntries(current)
        updateProgress()
        } catch (error) {
          if (rewriteEpochRef.current !== runEpoch) return
          const message = analysisFailureMessage(error, "改写请求失败")
          errors.push({ index: entryIndex, message })
          setEntries(items => items.map(item => item.id === entry.id ? { ...item, isRewriting: false, rewriteError: message } : item))
        }
      }
      }))
      if (rewriteEpochRef.current !== runEpoch) return
      cache.partial = errors.length > 0
      if (errors.length) {
        const message = `已填入 ${results.size}/${targets.length} 条，失败条目保留原提示词。\n` + errors.sort((a, b) => a.index - b.index).map(error => `提示词 ${error.index}：${error.message}`).join("\n") + "\n同一会话、输入未改变时，再次手动改写只请求未完成条目；不会自动重发。"
        setRewriteError(message)
        toast.error(`迁移部分完成：已填入 ${results.size}/${targets.length} 条`)
      } else toast.success(`AI 改写完成：${results.size}/${prompts.length} 条已填入`)
    } catch (error) {
      if (rewriteEpochRef.current !== runEpoch) return
      const completed = rewriteCacheRef.current.results.size
      setRewriteProgress(Math.round(completed / targets.length * 100))
      const message = analysisFailureMessage(error, "改写请求失败") + `\n已填入 ${completed}/${targets.length} 条，未完成条目保留原提示词；不会自动重发。`
      setRewriteError(message)
      toast.error(message)
      setEntries((current) => current.map((entry) => ({ ...entry, isRewriting: false })))
    } finally {
      if (rewriteEpochRef.current === runEpoch) {
        rewritingRef.current = false
        setRewritePhase(null)
      }
    }
  }, [entries, productImage, productImages, productInfo, products.busy, setEntries, persistEntries])

  /** 生图全部：组装任务队列 → 写入 localStorage → 二次跳转到生图模块页（/generate）统一执行 */
  const handleGenerateAll = useCallback(async () => {
      if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
    if (rewritingRef.current) { toast.error("提示词正在迁移，请等待本轮结束后再生图"); return }
    if (!readApiSettings().image.apiKey) {
      toast.error("请先在「API 设置」中填写并保存生图配置")
      return
    }
    if (!productImage) {
      toast.error("请先上传【新产品图】")
      return
    }

    const targets = entries.filter((entry) => entry.enabled && entry.prompt.trim())

    if (targets.length === 0) {
      toast.error("没有可生图的提示词（请先导入/填写并启用）")
      return
    }

    if (targets.some(entry => entry.size === "custom" && !isCustomOutputValid(entry.customSize))) { toast.error("请填写有效的自定义比例，例如 5:4 或 1:3"); return }

    const queue: GenerateTask[] = targets.map((entry) => ({
      id: entry.id,
      label: `提示词 ${entries.findIndex(item => item.id === entry.id) + 1}`,
      ratio: normalizeRatio(entry.size),
      customSize: entry.customSize,
      quality: entry.quality,
      count: Number(entry.count) || 1,
      prompt: applyRequestedOutputSize(prepareImagePrompt(entry.prompt) + buildImageIdentitySuffix(productImages.length), requestedCanvas(entry.size === "custom" ? entry.customSize : sizeFromRatioQuality(normalizeRatio(entry.size), entry.quality), entry.quality, entry.size, readApiSettings().image.model)),
      productImageDataUrl: productImage.dataUrl,
      productImages: productImageDrafts(productImages),
      status: "queued",
      resultUrls: [],
      paused: false,
    }))

    const submitted = await submitGenerateQueue(queue, "/remix", entries.map(entry => entry.id))
    if (submitted === "cancelled") return
    if (submitted === "blocked") {
      toast.error("本栏目队列正在生成、排队或更新，请先查看本栏目结果；其他栏目可以独立生成", {
        action: { label: "查看队列", onClick: () => router.push(generateHref("/remix")) },
      })
      return
    }
    if (submitted === "failed") {
      toast.error("任务保存失败，未发送生图请求；请检查浏览器存储空间后重试")
      return
    }
    try {
      // 保存提示词迁移现场：从生图模块返回后自动恢复（条目/产品图/产品信息不丢失）
      try {
        localStorage.setItem(
          REMIX_DRAFT_KEY,
          JSON.stringify({
            entries: entries.map((entry) => ({
              id: entry.id,
              prompt: entry.prompt,
              enabled: entry.enabled,
              size: entry.size,
              customSize: entry.customSize,
              quality: entry.quality,
              count: entry.count,
            })),
            productInfo,
            productImages: productImageDrafts(productImages),
            savedAt: Date.now(),
          })
        )
      } catch {
        // 快照写入失败不阻断跳转
      }
      router.push(generateHref("/remix"))
    } catch {
      router.push(generateHref("/remix"))
    }
  }, [productImage, productImages, entries, productInfo, router, products.busy])



  const generationTargets = entries.filter(entry => entry.enabled && entry.prompt.trim())
  const totalImages = generationTargets.reduce((sum, entry) => sum + (Number(entry.count) || 1), 0)
  const rewriteCount = entries.filter(entry => entry.enabled && entry.prompt.trim()).length

  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 p-4 md:p-6 lg:flex-row">
      {/* 左侧导航栏 */}
      <VisualSidebar current="remix" />
      <main className="flex min-w-0 flex-1 flex-col gap-4">
      {/* 顶部：标题 + 流程说明 */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Amazon 电商视觉提示词迁移</h1>
            <Badge variant="secondary">提示词套装</Badge>
          </div>
          <p className="text-xs text-muted-foreground">调用已保存套装 → AI 批量改写（产品描述/氛围/人群） → 逐条比例 → 批量生图</p>
        </div>
      </header>
      <ApiSetupNotice />
      <ImageModelNotice />

      {isRewriting && <section data-remix-status="running" className="space-y-2" role="status">
        <p className="text-sm leading-6 text-sky-300">{rewritePhase === "preparing" ? "正在准备迁移素材。" : "本次提示词迁移仍在处理中。"}已填入 {rewriteStats?.completed ?? 0}/{rewriteStats?.total ?? 0} 条，成功一条立即回填一条，失败项保留原文。站内切换导航会继续接收，请勿重复提交。刷新或关闭页面可能中断连接，不会自动重发。</p>
        <RequestWaitNotice active={rewritePhase === "waiting"} label="正在等待本次迁移返回" />
        <Progress value={rewriteProgress} className="h-1.5" />
      </section>}
      {!isRewriting && !rewriteError && rewriteStats && <p data-remix-status="completed" role="status" className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-sm leading-6 text-emerald-300">本次提示词迁移已完成，已更新 {rewriteStats.completed}/{rewriteStats.total} 条提示词，可在下方查看和编辑。</p>}
      {rewriteError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm leading-6 break-words">
        <p className="font-medium">提示词迁移未完成</p>
        <p className="whitespace-pre-wrap">{rewriteError}</p>
        <p className="mt-1 text-muted-foreground">系统不会自动重发；请核查服务商记录后再手动改写。</p>
      </div>}

      {/* 新产品 */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">新产品图</CardTitle>
            <CardDescription className="text-xs">必传。AI 将据此改写每条提示词中的产品描述（PNG/JPG/WEBP，≤10MB）</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductImagesUpload manager={products} zoneKey="remix-product" primaryAlt="新产品图" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">新产品信息</CardTitle>
            <CardDescription className="text-xs">可留空。通常为同类产品换主题，主要替换产品描述、人物和氛围；尺寸未知时不编数字，采用无数值展示继续迁移。</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[200px] text-xs leading-5"
              placeholder={"例如：\nMaterial: Silicone\nCapacity: 1.5L\nColor: Blue\nSize: 30*20cm\n..."}
              value={productInfo}
              onChange={(event) => setProductInfo(event.target.value)}
            />
          </CardContent>
        </Card>
      </section>

      <LoadSuitePanel onLoad={applyLoadedSuite} disabled={isRewriting} />

      {/* 提示词条目 */}
      <section className="flex flex-col gap-3">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            提示词条目 · 当前 {entries.length} 条（{entries.filter((entry) => entry.enabled).length} 条启用）— 可通过上方「调用已保存套装」一键载入
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <SelectionActions onSelect={action => setEntries(current => selectEntries(current, action, entry => entry.isRewriting))} />
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={isRewriting} onClick={handleClearAll}>
              <Trash2Icon data-icon="inline-start" />
              清空全部
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={handleAddEntry}>
              <PlusIcon data-icon="inline-start" />
              新增一条
            </Button>
          </div>
        </div>

        {/* 逐条编辑 */}
        <div className="entry-grid">
          {entries.map((entry, index) => (
            <Card key={entry.id} className={entry.enabled ? "h-full" : "h-full opacity-60"}>
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <EntryEnabled label={`启用第 ${index + 1} 条`} checked={entry.enabled} disabled={entry.isRewriting} onChange={enabled => updateEntry(entry.id, { enabled })} />
                    <Badge variant="secondary" className="font-mono text-xs">
                      提示词 {index + 1}
                    </Badge>
                    {entry.isRewriting && <span className="text-xs text-muted-foreground">改写中…</span>}
                  </div>
                  <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setEntries((current) =>
                          current.length === 1
                            ? [createEntry(1)]
                            : current.filter((item) => item.id !== entry.id)
                        )
                      }}
                      aria-label="删除本条"
                      disabled={entry.isRewriting}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                </div>
                <fieldset disabled={entry.isRewriting} className="contents">
                <GenerationSettings label={`提示词 ${index + 1}`} ratio={entry.size} quality={entry.quality} count={entry.count} customSize={entry.customSize}
                  onRatioChange={value => updateEntry(entry.id, { size: value })}
                  onQualityChange={value => updateEntry(entry.id, { quality: value })}
                  onCountChange={value => updateEntry(entry.id, { count: value })}
                  onCustomSizeChange={value => updateEntry(entry.id, { customSize: value })} />
                <PromptEditor title={`提示词 ${index + 1}`} value={entry.prompt} onChange={value => updateEntry(entry.id, { prompt: value })} />
                </fieldset>
                {entry.rewriteError && <p data-remix-entry-error={entry.id} role="alert" className="text-xs leading-5 whitespace-pre-wrap text-destructive">本条未改写，保留原提示词：{entry.rewriteError}</p>}

                {entry.isRewriting && <Progress value={rewriteProgress} className="h-1.5" />}

              </CardContent>
            </Card>
          ))}
        </div>

        {/* AI 批量改写 + 批量生图 */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-4">

            {batchRewriteFull && (
              <details className="rounded-md border bg-muted/30">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  查看完整 AI 改写输出 — 不参与生图
                </summary>
                <pre className="max-h-56 overflow-auto px-3 pb-3 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                  {batchRewriteFull}
                </pre>
              </details>
            )}

            <p className="text-xs text-muted-foreground">
              点击「生成 N 条」后跳转到生图模块页，按并发设置执行。只提交已启用且提示词非空的条目；按钮旁显示本批总图片数。全部产品图按顺序发送，图1为主产品。
            </p>
          </CardContent>
        </Card>
      </section>

      <FixedActionBar>
        <BatchGenerateButton count={generationTargets.length} images={totalImages} onClick={handleGenerateAll} disabled={isRewriting || products.busy || !productImage} disabledReason={isRewriting ? "请等待提示词改写完成" : !productImage ? "请先上传新产品图" : undefined} />
        <Button type="button" variant="secondary" size="sm" className="h-11 text-sm" disabled={isRewriting || rewriteCount === 0} onClick={handleRewriteAll}>
          {isRewriting ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <WandSparklesIcon data-icon="inline-start" />}
          {isRewriting ? `AI 改写中 · 已填入 ${rewriteStats?.completed ?? 0}/${rewriteStats?.total ?? 0} 条` : `改写提示词 ${rewriteCount} 条`}
        </Button>
      </FixedActionBar>
      </main>
    </div>
  )
}
