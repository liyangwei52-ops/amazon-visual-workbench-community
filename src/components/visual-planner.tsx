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

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  BrainCircuitIcon,
  CheckSquareIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { readApiSettings } from "@/lib/api-settings"
import { requestModelApi } from "@/lib/model-api-client"
import { analysisFailureMessage } from "@/lib/analysis-failure"
import { buildAnalyzeRequestBody } from "@/lib/analyze-request"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { loadDraftWithImages, saveDraft } from "@/lib/draft-store"

import { Textarea } from "@/components/ui/textarea"

import { VisualSidebar } from "@/components/visual-sidebar"
import { SaveSuiteButton } from "@/components/save-suite-button"
import { applyRequestedOutputSize, prepareImagePrompt } from "@/lib/prompt-utils"
import { PLANNER_SYSTEM_PROMPT } from "@/lib/planner-strategist-prompt"
import { ANALYSIS_COPY_TASK_NOTE } from "@/lib/analysis-prompt-rules"
import { inferPlannerRatio, parsePlannerRewrite } from "@/lib/planner-parse"
import { extractPlannerDoc, type PlannerDocInfo } from "@/lib/planner-doc"
import { generateHref, submitGenerateQueue } from "@/lib/generate-queue-store"
import {
  sizeFromRatioQuality,
  buildImageIdentitySuffix,
  type GenerateTask,
  type QualityLevel,
} from "@/lib/visual-shared"

type PlannerEntry = {
  id: string
  title: string
  prompt: string
  enabled: boolean
  size: string
  sizeUserSet: boolean
  customSize: string
  quality: QualityLevel
  count: string
}

function createEntry(index: number): PlannerEntry {
  return {
    id: `plan-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    title: `版位 ${index + 1}`,
    prompt: "",
    enabled: true,
    size: "1:1",
    sizeUserSet: false,
    customSize: "",
    quality: "2k",
    count: "1",
  }
}

/** 文件大小可读格式化 */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MAX_PLAN_DOC_BYTES = 20 * 1024 * 1024
const MAX_PLAN_TEXT_CHARS = 60_000
type PlannerDocument = PlannerDocInfo & { size: number }

/** 一键策划页现场快照键 */
export const PLANNER_DRAFT_KEY = "amazon-workbench.draft.planner"

type PlannerDraft = {
  productImage?: ProductImageDraft | null
  productImages?: ProductImageDraft[]
  productInfo?: string
  planText?: string
  planDoc?: PlannerDocument | null
  planResponse?: string
  planError?: string
  entries?: Array<{
    id: string
    title: string
    prompt: string
    enabled: boolean
    size: string
    sizeUserSet?: boolean
    customSize: string
    quality: QualityLevel
    count: string
  }>
}

export function VisualPlanner({ onPlanningChange }: { onPlanningChange?: (active: boolean) => void } = {}) {
  const router = useRouter()
  const products = useProductImages()
  const { images: productImages, main: productImage, restore: restoreProductImages } = products
  const [productInfo, setProductInfo] = useState("")
  const [planText, setPlanText] = useState("")
  const [planDoc, setPlanDoc] = useState<PlannerDocument | null>(null)
  const [isParsingDoc, setIsParsingDoc] = useState(false)
  const [entries, setEntries] = useState<PlannerEntry[]>(() => [createEntry(0)])
  const planDocInputRef = useRef<HTMLInputElement>(null)
  const parsingDocRef = useRef(false)
  const [draggingPlanDoc, setDraggingPlanDoc] = useState(false)

  const [planPhase, setPlanPhase] = useState<"preparing" | "waiting" | null>(null)
  const isPlanning = planPhase !== null
  const planningRef = useRef(false)
  const [planResultCount, setPlanResultCount] = useState<number | null>(null)
  const [planError, setPlanError] = useState("")
  const [planResponse, setPlanResponse] = useState("")

  useEffect(() => { onPlanningChange?.(isPlanning) }, [isPlanning, onPlanningChange])

  /** 现场恢复是否已完成：恢复完成前禁止写入快照（防止卸载兜底用空 state 覆盖带图快照） */
  const draftRestoredRef = useRef(false)

  // ---- 现场快照：切换导航/跳转后返回，恢复一键策划页已上传与已填写内容 ----
  useEffect(() => {
    let active = true
    void (async () => {
    const draft = await loadDraftWithImages<PlannerDraft>(PLANNER_DRAFT_KEY)
    if (!active) return
    if (!draft) {
      draftRestoredRef.current = true
      return
    }

    const pending: Promise<unknown>[] = []
    const storedProducts = draft.productImages ?? (draft.productImage?.dataUrl ? [draft.productImage] : [])
    if (storedProducts.length) pending.push(restoreProductImages(storedProducts))

    // Browser-only draft restoration happens after hydration.
    if (typeof draft.productInfo === "string") setProductInfo(draft.productInfo)
    if (typeof draft.planText === "string") setPlanText(draft.planText)
    if (typeof draft.planResponse === "string") setPlanResponse(draft.planResponse)
    if (typeof draft.planError === "string") setPlanError(draft.planError)
    if (draft.planDoc && typeof draft.planDoc.text === "string" && Array.isArray(draft.planDoc.images)) {
      setPlanDoc({
        fileName: draft.planDoc.fileName,
        size: typeof draft.planDoc.size === "number" ? draft.planDoc.size : 0,
        text: draft.planDoc.text,
        images: draft.planDoc.images.filter((image) => typeof image?.dataUrl === "string" && image.dataUrl.startsWith("data:image/")),
        droppedImages: draft.planDoc.droppedImages || 0,
        type: (["docx", "xlsx", "csv", "txt"] as const).includes(draft.planDoc.type as "docx")
          ? (draft.planDoc.type as "docx" | "xlsx" | "csv" | "txt")
          : "txt",
      })
    }

    if (Array.isArray(draft.entries) && draft.entries.length > 0) {
      setEntries(
        draft.entries.map((entry) => ({
          id: entry.id || `plan-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: typeof entry.title === "string" ? entry.title : "版位",
          prompt: typeof entry.prompt === "string" ? entry.prompt : "",
          enabled: entry.enabled !== false,
          size: typeof entry.size === "string" && entry.size ? entry.size : "1:1",
          sizeUserSet: entry.sizeUserSet === true || (entry.sizeUserSet === undefined && Boolean(entry.prompt)),
          customSize: typeof entry.customSize === "string" ? entry.customSize : "",
          quality: (entry.quality === "1k" || entry.quality === "2k" ? entry.quality : "2k") as QualityLevel,
          count: typeof entry.count === "string" && entry.count ? entry.count : "1",
        }))
      )
    }

    await Promise.all(pending)
    if (!active) return
      // 恢复完成：允许保存，并把恢复内容立即写回（防止卸载兜底用空 state 覆盖带图快照）
      draftRestoredRef.current = true
      try {
        saveDraft(PLANNER_DRAFT_KEY, draft)
      } catch {
        // 忽略
      }
      toast.success("已恢复上次现场（产品图 / 策划输入 / 提示词）")
    // 仅挂载时执行一次
     
    })().catch((error: unknown) => {
      if (!active) return
      draftRestoredRef.current = true
      toast.error(error instanceof Error ? error.message : "页面图片恢复失败，请重新上传原图")
    })
    return () => { active = false }
  }, [restoreProductImages])

  useEffect(() => {
    if (!draftRestoredRef.current) return
    const snapshot = (): PlannerDraft => ({
      productImages: productImageDrafts(productImages),
      productInfo,
      planText,
      planDoc,
      planResponse,
      planError,
      entries: entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        prompt: entry.prompt,
        enabled: entry.enabled,
        size: entry.size,
        sizeUserSet: entry.sizeUserSet,
        customSize: entry.customSize,
        quality: entry.quality,
        count: entry.count,
      })),
    })
    const timer = setTimeout(() => {
      saveDraft(PLANNER_DRAFT_KEY, snapshot())
    }, 600)
    return () => {
      clearTimeout(timer)
      try {
        saveDraft(PLANNER_DRAFT_KEY, snapshot())
      } catch {
        // 忽略
      }
    }
  }, [productImage, productImages, productInfo, planText, planDoc, planResponse, planError, entries])

  const updateEntry = useCallback((entryId: string, patch: Partial<PlannerEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)))
  }, [])

  const handlePlanDocFile = useCallback(async (file: File) => {
    if (parsingDocRef.current) {
      toast.info("正在读取策划文档，请等待完成后再更换")
      return
    }
    const lower = file.name.toLowerCase()
    if (!/(\.docx|\.xlsx|\.csv|\.txt)$/i.test(lower)) {
      toast.error("只支持 .docx / .xlsx / .csv / .txt 文件")
      return
    }
    if (file.size > MAX_PLAN_DOC_BYTES) {
      toast.error("策划文档不能超过 20MB")
      return
    }
    parsingDocRef.current = true
    setIsParsingDoc(true)
    try {
      const attach = { ...(await extractPlannerDoc(file)), size: file.size }
      if (attach.type === "unsupported") {
        toast.error("不支持该文件类型：请上传 .xlsx / .docx / .csv / .txt")
        return
      }
      if (!attach.text.trim() && attach.images.length === 0) {
        toast.error("文档中未提取到文字或图片，请改为粘贴策划内容")
        return
      }
      if (attach.text.length > MAX_PLAN_TEXT_CHARS) {
        attach.text = attach.text.slice(0, MAX_PLAN_TEXT_CHARS)
        toast.info("文档文字超过 6 万字，仅使用前 6 万字；请检查重要版位是否在前面")
      }
      setPlanDoc(attach)
      toast.success(`已读取 ${attach.fileName}：${attach.text.length} 字，${attach.images.length} 张内嵌图片`)
    } catch (error) {
      toast.error(error instanceof Error ? `读取失败：${error.message}` : "读取失败")
    } finally {
      parsingDocRef.current = false
      setIsParsingDoc(false)
    }
  }, [])

  const fillPlanResponse = useCallback((content: string) => {
    const items = parsePlannerRewrite(content, true)
    setEntries((previous) => items.map((item, index) => {
      const existing = previous.find((entry) => entry.title === item.title && entry.sizeUserSet) || previous[index]
      const keepSize = existing?.sizeUserSet === true
      return {
        ...createEntry(index),
        title: item.title,
        prompt: keepSize
          ? applyRequestedOutputSize(item.prompt, requestedCanvas(existing.size === "custom" ? existing.customSize : sizeFromRatioQuality(existing.size, existing.quality), existing.quality, existing.size, readApiSettings().image.model))
          : item.prompt,
        size: keepSize ? existing.size : inferPlannerRatio(item.title, item.prompt),
        customSize: keepSize ? existing.customSize : "",
        quality: existing?.quality || "2k",
        count: existing?.count || "1",
        sizeUserSet: keepSize,
      }
    }))
    setPlanError("")
    setPlanResultCount(items.length)
    return items.length
  }, [])

  const handlePlan = useCallback(async () => {
    if (planningRef.current) return
    if (parsingDocRef.current) { toast.error("策划文档正在读取，请等待完成后再提交"); return }
    if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
    const { endpoint: analyzeEndpoint, apiKey: analyzeApiKey, model: analyzeModel } = readApiSettings().analysis
    if (!analyzeApiKey) {
      toast.error("请先在「API 设置」中填写并保存分析配置")
      return
    }
    if (!productImage) {
      toast.error("请先上传【产品图】")
      return
    }
    if (entries.some(entry => entry.sizeUserSet && entry.size === "custom" && !isCustomOutputValid(entry.customSize))) { toast.error("请填写有效的自定义比例，例如 5:4 或 1:3"); return }
    planningRef.current = true
    setPlanPhase("preparing")
    setPlanResultCount(null)
    setPlanError("")

    try {
    const requestedSizes = entries.flatMap((entry, index) => entry.sizeUserSet
      ? [`${index + 1}. ${entry.title}：${requestedCanvas(entry.size === "custom" ? entry.customSize : sizeFromRatioQuality(entry.size, entry.quality), entry.quality, entry.size, readApiSettings().image.model)}（以此为准）`]
      : [])
    const userText = [
      productInfo.trim() ? `【产品信息】\n${productInfo.trim()}` : "",
      planText.trim() ? `【产品策划（补充文本）】\n${planText.trim()}` : "",
      planDoc
        ? `【策划文档提取内容：${planDoc.fileName}】\n${planDoc.text}\n${planDoc.images.length ? `文档全部参考图按编号发送：${planDoc.images.map((image, index) => `图${index + productImages.length + 1}=${image.name}${image.source ? `（${image.source}）` : ""}`).join("；")}` : ""}\n参考图所在行是版位关联线索；逐区保留本条的信息功能，并映射为当前商品。外观、结构、数量及实测值依据全部我方产品图和已确认产品信息；参考的旧商品、旧参数和数量文案不当作新商品事实。`
        : "",
      requestedSizes.length ? `【用户已设定的版位尺寸，仅用于构图，不作为上图文字】\n${requestedSizes.join("\n")}\n无需在成品正文重抄技术设置。` : "",
      "【当前任务：整套版位策划】根据产品图 + 产品信息 + 策划文档/补充需求设计每条提示词。产品图确定实物结构，产品信息补充已确认事实，文档确定各图目标、参考关联与信息分工。有关联参考的条目按竞品视觉拆解 → 我方产品识别 → 产品硬约束 → 竞品视觉映射 → 完整成品 Prompt逐图完成；先核对产品结构再映射，无参考按产品和本条目标设计，不虚构竞品。保留文档清单顺序/数量和明确画面、背景/面板分层；不只改写文档，不用通用模板覆盖清单。输出独立完整正负向，内部推导不写进成品。",
      "【落实到成品】信息图逐区对应实物/细节、尺寸或数量、最终文案和位置；分别写清整幅背景与内层信息面板，保留本条参考的背景色/光感/纹理、边缘装饰与面板关系，不能把白色面板或产品图白底变成全幅白底。明确要求白底时按要求执行，不给所有主题套同一背景。拼图明确唯一格数及各格内容，不提供可选方案。站点、上图语言和单位按本次输入确定，不固定为任何国家或语言。每条保留正向与负向标题和完整正文。",
      ANALYSIS_COPY_TASK_NOTE,
    ]
      .filter(Boolean)
      .join("\n\n")

      if (planDoc?.droppedImages) {
        throw new Error(`当前策划文档有 ${planDoc.droppedImages} 张参考图未解析。请重新上传原文档；如果仍提示未解析，请将文档拆分后上传。不会只用部分参考图继续策划。`)
      }
      const images = productAnalysisImages(productImages)
      for (const image of planDoc?.images || []) {
        images.push({ dataUrl: image.dataUrl, role: "reference", index: images.length + 1 })
      }
      const body = await buildAnalyzeRequestBody({
        endpoint: analyzeEndpoint,
        apiKey: analyzeApiKey,
        model: analyzeModel,
        systemPrompt: PLANNER_SYSTEM_PROMPT + productIdentitySystemNote(productImages.length) + analysisImageModelNote(readApiSettings().image.model),
        userText,
        images,
      })
      setPlanPhase("waiting")
      const response = await requestModelApi("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
      const payload: unknown = await response.json().catch(() => null)
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error(
            `请求体过大（413）：策划文档+产品图超过线上部署的请求体上限（约 4.5MB，Vercel 平台限制）。建议：① 精简策划文档（删除冗余图片/工作表）到 3MB 以内再试；② 或将版位表直接粘贴到「产品策划」文本框；③ 或在本机运行（npm run start）无此限制。`
          )
        }
        throw new Error(typeof record.error === "string" ? record.error : `策划请求失败（${response.status}）`)
      }
      const content = typeof record.prompt === "string" ? record.prompt : ""
      if (!content.trim()) {
        throw new Error("策划模型未返回内容")
      }
      // Save the received text before parsing so a formatting error never loses a paid response.
      setPlanResponse(content)
      const count = fillPlanResponse(content)
      toast.success(`策划完成：已自动分发 ${count} 条提示词，可在下方微调`)
    } catch (error) {
      const message = analysisFailureMessage(error, "策划失败")
      setPlanError(message)
      toast.error(message)
    } finally {
      planningRef.current = false
      setPlanPhase(null)
    }
  }, [productImage, productImages, productInfo, planText, planDoc, entries, products.busy, fillPlanResponse])

  const handleAddEntry = useCallback(() => {
    setEntries((prev) => [...prev, createEntry(prev.length)])
  }, [])

  const handleRemoveEntry = useCallback((entryId: string) => {
    setEntries((prev) => {
      const next = prev.filter((entry) => entry.id !== entryId)
      return next.length ? next : [createEntry(0)]
    })
  }, [])


  /** 生成：组装启用任务队列 → 二次跳转到生图模块页（/generate）统一执行 */
  const handleGenerateAll = useCallback(async () => {
      if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
    if (isPlanning) { toast.error("策划正在生成，请等待完整分发后再生图"); return }
    if (!productImage) {
      toast.error("请先上传【产品图】")
      return
    }
    const targets = entries.filter((entry) => entry.enabled && entry.prompt.trim())
    if (targets.length === 0) {
      toast.error("没有可生成的提示词（请先勾选启用并填写提示词）")
      return
    }
    if (targets.some((entry) => entry.size === "custom" && !isCustomOutputValid(entry.customSize))) {
      toast.error("请先填写有效的自定义比例，例如 5:4 或 1:3")
      return
    }
    const queue: GenerateTask[] = targets.map((entry) => ({
      id: entry.id,
      label: `${entry.title || `提示词 ${entries.findIndex(item => item.id === entry.id) + 1}`}`,
      ratio: entry.size,
      customSize: entry.customSize || "",
      quality: entry.quality,
      count: Number(entry.count) || 1,
      prompt: applyRequestedOutputSize(
        prepareImagePrompt(entry.prompt) + buildImageIdentitySuffix(productImages.length),
        requestedCanvas(entry.size === "custom" ? entry.customSize : sizeFromRatioQuality(entry.size, entry.quality), entry.quality, entry.size, readApiSettings().image.model)
      ),
      productImageDataUrl: productImage.dataUrl,
      productImages: productImageDrafts(productImages),
      status: "queued",
      resultUrls: [],
      paused: false,
    }))
    const submitted = await submitGenerateQueue(queue, "/planner", entries.map(entry => entry.id))
    if (submitted === "cancelled") return
    if (submitted === "blocked") {
      toast.error("本栏目队列正在生成、排队或更新，请先查看本栏目结果；其他栏目可以独立生成", {
        action: { label: "查看队列", onClick: () => router.push(generateHref("/planner")) },
      })
    } else if (submitted === "failed") {
      toast.error("任务保存失败。请先复制备份提示词，清理已完成任务或更换浏览器后重试。")
    } else {
      router.push(generateHref("/planner"))
    }
  }, [entries, productImage, productImages, router, isPlanning, products.busy])

  const enabledCount = entries.filter(entry => entry.enabled).length
  const generationTargets = entries.filter(entry => entry.enabled && entry.prompt.trim())
  const totalImages = generationTargets.reduce((sum, entry) => sum + (Number(entry.count) || 1), 0)

  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 p-4 md:p-6 lg:flex-row">
      <VisualSidebar current="planner" />
      <main className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">一键策划</h1>
          <SaveSuiteButton entries={entries} />
        </header>
        <ApiSetupNotice />
        <ImageModelNotice />
        {/* ===== 第一部分 · 输入与策划 ===== */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BrainCircuitIcon className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">一键策划 · 输入与 AI 策划</CardTitle>
            </div>
            <CardDescription className="text-xs">
              上传产品图（必传）+ 基础产品信息（可留空）+ 产品策划（可留空）→ AI 自动分析并生成多条成品提示词，自动分发到下方提示词框。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
            {/* 左栏：产品素材 */}
            <div className="flex min-w-0 flex-col gap-3">
              <Field>
                <FieldLabel className="text-xs font-semibold">产品图（必传）</FieldLabel>
                <ProductImagesUpload manager={products} zoneKey="planner-product" />
              </Field>
              <Field>
                <FieldLabel className="text-xs font-semibold">基础产品信息（可留空）</FieldLabel>
                <Textarea
                  className="min-h-40 text-xs leading-5"
                  placeholder={"例如：\nMaterial: Stainless Steel\nCapacity: 2L\nColor: Red\nPackage Includes: 1*Pot, 1*Lid"}
                  value={productInfo}
                  onChange={(event) => setProductInfo(event.target.value)}
                />
              </Field>
            </div>

            {/* 右栏：策划需求与提交 */}
            <div className="flex min-w-0 flex-col gap-3">
              <Field>
                <FieldLabel className="text-xs font-semibold">产品策划（可留空）</FieldLabel>
                {/* 在浏览器本地解析策划文档，发送提取后的文字和图片。 */}
                <div
                  data-plan-doc-upload
                  data-dragging={draggingPlanDoc || undefined}
                  aria-busy={isParsingDoc}
                  className={draggingPlanDoc ? "rounded-lg bg-primary/5 outline-2 outline-offset-2 outline-primary" : undefined}
                  onDragOver={event => {
                    if (!event.dataTransfer.types.includes("Files")) return
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = parsingDocRef.current ? "none" : "copy"
                    setDraggingPlanDoc(!parsingDocRef.current)
                  }}
                  onDragLeave={event => {
                    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDraggingPlanDoc(false)
                  }}
                  onDrop={event => {
                    if (!event.dataTransfer.types.includes("Files") && !event.dataTransfer.files.length) return
                    event.preventDefault()
                    event.stopPropagation()
                    setDraggingPlanDoc(false)
                    const files = Array.from(event.dataTransfer.files)
                    if (files.length !== 1) {
                      toast.error("请一次拖入一个策划文档（.xlsx / .docx / .csv / .txt）")
                      return
                    }
                    void handlePlanDocFile(files[0])
                  }}
                >
                  {planDoc ? (
                    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileTextIcon className="size-4 shrink-0 text-primary" />
                          <p className="truncate font-mono text-xs">{planDoc.fileName}</p>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {planDoc.type.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatSize(planDoc.size)}</span>
                          <Badge variant="outline" className="font-mono text-xs text-primary">
                            已本地提取
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={isParsingDoc}
                            onClick={() => planDocInputRef.current?.click()}
                          >
                            更换
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            disabled={isParsingDoc}
                            onClick={() => setPlanDoc(null)}
                          >
                            <Trash2Icon data-icon="inline-start" />
                            移除
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        已提取 {planDoc.text.length} 字和 {planDoc.images.length} 张内嵌图片；策划时会检查全部图片已发送，不会静默跳过。
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isParsingDoc}
                      onClick={() => planDocInputRef.current?.click()}
                      className="flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {isParsingDoc ? (
                        <>
                          <Loader2Icon className="size-4 animate-spin" />
                          <span className="text-xs">正在读取策划文档…</span>
                        </>
                      ) : (
                        <>
                          <FileTextIcon className="size-4" />
                          <span className="text-xs font-medium">点击或拖拽上传策划文档（.xlsx / .docx / .csv / .txt，本地提取）</span>
                        </>
                      )}
                    </button>
                  )}
                  <input
                    ref={planDocInputRef}
                    type="file"
                    disabled={isParsingDoc}
                    accept=".docx,.xlsx,.csv,.txt"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void handlePlanDocFile(file)
                      event.target.value = ""
                    }}
                  />
                </div>
                <Textarea
                  className="mt-2 min-h-40 text-xs leading-5"
                  placeholder={
                    "也可直接粘贴策划表内容（每行一个版位：名称 | 描述），例如：\n主视觉 | 白底主图，产品居中，真实阴影\n尺寸图 | 展示产品尺寸，不虚构数字\n场景图 | 派对场景，人物可出镜\n\n文档 + 补充文本可同时使用；留空则 AI 按默认 9 个版位（主视觉/尺寸/细节/配件/场景/四场景拼图/A+×3）自动策划。"
                  }
                  value={planText}
                  onChange={(event) => setPlanText(event.target.value)}
                />
              </Field>
              <div className="flex flex-col items-start gap-2 border-t pt-3">
                <Button type="button" size="sm" className="primary-action h-11 w-full px-6 text-sm" onClick={handlePlan} disabled={isPlanning || products.busy || !productImage || isParsingDoc}>
                  {isPlanning ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon data-icon="inline-start" />
                  )}
                  {planPhase === "preparing" ? "正在准备策划请求…" : isPlanning ? "策划分析中…" : "开始策划"}
                </Button>
                {!productImage && <p className="text-xs text-muted-foreground">先上传主产品图，再开始策划；产品信息和策划文档可留空。</p>}
                {isPlanning && <div data-planner-status="running" className="w-full space-y-2" role="status">
                  <p className="text-sm leading-6 text-sky-300">{planPhase === "preparing" ? "正在准备产品图和策划资料。" : "本次策划请求仍在处理中。"}站内切换导航会继续接收，请勿重复提交。刷新或关闭页面可能中断连接，不会自动重发。</p>
                  <RequestWaitNotice active={planPhase === "waiting"} label="正在等待本次策划返回" />
                </div>}
                {!isPlanning && !planError && planResultCount !== null && <p data-planner-status="completed" role="status" className="w-full rounded-lg border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-sm leading-6 text-emerald-300">本次策划已完成，已填入 {planResultCount} 条提示词，可在下方查看和编辑。</p>}
                {planError && (
                  <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words text-destructive">
                    {planError}
                  </p>
                )}
                {planError && planResponse.trim() && (
                  <details className="w-full min-w-0 rounded-md border p-3">
                    <summary className="cursor-pointer text-sm">查看最近一次模型返回</summary>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      返回内容已保存在当前浏览器。可查看或修正后填入下方提示词框；本地读取会替换当前提示词，不会再次调用模型。
                    </p>
                    <Textarea
                      aria-label="最近一次策划模型返回"
                      className="mt-2 h-48 font-mono text-xs leading-5"
                      value={planResponse}
                      disabled={isPlanning}
                      onChange={event => setPlanResponse(event.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={async () => {
                        try { await navigator.clipboard.writeText(planResponse); toast.success("已复制模型返回") }
                        catch { toast.error("复制失败，请在上方文本框中选择并复制") }
                      }}>复制返回内容</Button>
                      <Button type="button" variant="outline" size="sm" disabled={isPlanning || !planResponse.trim()} onClick={() => {
                        try {
                          const count = fillPlanResponse(planResponse)
                          toast.success(`已从保存内容填入 ${count} 条提示词，未调用模型`)
                        } catch (error) {
                          setPlanError(analysisFailureMessage(error, "读取失败"))
                        }
                      }}>从这段内容填入提示词</Button>
                    </div>
                  </details>
                )}
                <p className="text-xs text-muted-foreground">
                  AI 将按策划版位（或默认 9 版位）逐条生成成品提示词，并自动填入下方提示词框。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ===== 第二部分 · 提示词（AI 自动分发） ===== */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckSquareIcon className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">提示词（自动分发，可逐条微调）</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  共 {entries.length} 条 · 启用 {enabledCount} 条
                </span>
                <SelectionActions disabled={isPlanning} onSelect={action => setEntries(current => selectEntries(current, action))} />
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddEntry}>
                  <PlusIcon data-icon="inline-start" />
                  新增一条
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              每条独立设置：输出比例（宽高比）+ 清晰度（1K/2K）+ 生成数量；未启用条目跳过。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">暂无提示词，点击上方「开始策划」自动生成并分发。</p>
            ) : (
              <div className="entry-grid">
                {entries.map((entry, index) => (
                  <Card key={entry.id} className={entry.enabled ? "h-full" : "h-full opacity-60"}>
                    <CardContent className="flex h-full flex-col gap-2.5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <EntryEnabled label={`启用第 ${index + 1} 条`} checked={entry.enabled} disabled={isPlanning} onChange={enabled => updateEntry(entry.id, { enabled })} />
                          <Badge variant="secondary" className="font-mono text-xs">
                            {String(index + 1).padStart(2, "0")} · {entry.title || `版位 ${index + 1}`}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveEntry(entry.id)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>

                      <GenerationSettings label={`提示词 ${index + 1}`} ratio={entry.size} quality={entry.quality} count={entry.count} customSize={entry.customSize}
                        onRatioChange={value => updateEntry(entry.id, { size: value, sizeUserSet: true })}
                        onQualityChange={value => updateEntry(entry.id, { quality: value, sizeUserSet: true })}
                        onCountChange={value => updateEntry(entry.id, { count: value })}
                        onCustomSizeChange={value => updateEntry(entry.id, { customSize: value, sizeUserSet: true })} />
                      <PromptEditor title={entry.title || `版位 ${index + 1} 提示词`} value={entry.prompt} onChange={value => updateEntry(entry.id, { prompt: value })} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== 第三部分 · 生成 ===== */}
        <FixedActionBar>
            <BatchGenerateButton count={generationTargets.length} images={totalImages} onClick={handleGenerateAll} disabled={isPlanning || products.busy || !productImage} disabledReason={isPlanning ? "策划完成后可生成图片" : !productImage ? "请先上传主产品图" : undefined} />
        </FixedActionBar>
      </main>
    </div>
  )
}
