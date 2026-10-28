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
import { restoreWorkbenchOutput } from "@/lib/workbench-output-settings"
import { PromptEditor } from "@/components/prompt-editor"
import { ProductImagesUpload } from "@/components/product-images-upload"
import { useProductImages, productImageDrafts, type ProductImageDraft } from "@/lib/use-product-images"
import { productAnalysisImages, productIdentitySystemNote } from "@/lib/image-identities"
import { AssetPicker } from "@/components/asset-picker"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  CopyIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { readApiSettings } from "@/lib/api-settings"
import { requestModelApi } from "@/lib/model-api-client"
import { analysisFailureMessage } from "@/lib/analysis-failure"
import { buildAnalyzeRequestBody } from "@/lib/analyze-request"

import { loadDraftWithImages, saveDraft } from "@/lib/draft-store"

import { PasteZone } from "@/components/paste-zone"
import { VisualSidebar } from "@/components/visual-sidebar"
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { applyRequestedOutputSize, extractFinalPrompt, prepareImagePrompt } from "@/lib/prompt-utils"
import { isLegacyDefaultPrompt, VISUAL_STRATEGIST_SYSTEM_PROMPT } from "@/lib/visual-strategist-prompt"
import { ANALYSIS_COPY_TASK_NOTE } from "@/lib/analysis-prompt-rules"
import { WORKBENCH_REFERENCE_TASK_NOTE } from "@/lib/workbench-reference-policy"
import { SaveSuiteButton } from "@/components/save-suite-button"
import { generateHref, submitGenerateQueue } from "@/lib/generate-queue-store"
import {
  sizeFromRatioQuality,
  MAX_REFERENCE_IMAGES,
  buildImageIdentitySuffix,
  compressUploadImage,
  validateUpload,
  type GenerateTask,
  type UploadImage,
} from "@/lib/visual-shared"

type RequestCardState = {
  id: string
  enabled: boolean
  references: UploadImage[]
  sendReferencesToGeneration: boolean
  extraNeeds: string
  prompt: string
  analysis: string
  analysisError: string
  isAnalyzing: boolean
  progress: number
  size: string
  customSize: string
  quality: "1k" | "2k"
  outputFormat: string
  background: string
  count: string
}

/** 视觉工作台现场快照键：切换导航/跳转生图后返回时恢复上传与填写内容 */
const WORKBENCH_DRAFT_KEY = "amazon-workbench.draft.workbench"

type WorkbenchDraft = {
  productImage?: ProductImageDraft | null
  productImages?: ProductImageDraft[]
  productInfo?: string
  systemPrompt?: string
  cards?: Array<{
    id: string
    enabled?: boolean
    sendReferencesToGeneration?: boolean
    references: Array<{ id: string; name: string; dataUrl: string }>
    extraNeeds: string
    prompt: string
    analysis: string
    analysisError?: string
    size: string
    customSize: string
    quality: string
    outputFormat: string
    background: string
    count: string
  }>
}

function createCard(index: number): RequestCardState {
  return {
    id: `card-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: false,
    references: [],
    sendReferencesToGeneration: false,
    extraNeeds: "",
    prompt: "",
    analysis: "",
    analysisError: "",
    isAnalyzing: false,
    progress: 0,
    size: "1:1",
    customSize: "",
    quality: "2k",
    outputFormat: "png",
    background: "auto",
    count: "1",
  }
}

export function VisualWorkbench({ onAnalysisCountChange }: { onAnalysisCountChange?: (count: number) => void } = {}) {
  const router = useRouter()

  const products = useProductImages()
  const { images: productImages, main: productImage, restore: restoreProductImages } = products
  const [productInfo, setProductInfo] = useState("")
  const [systemPrompt, setSystemPrompt] = useState(VISUAL_STRATEGIST_SYSTEM_PROMPT)

  const [cards, setCards] = useState<RequestCardState[]>(() => [
    createCard(1),
    createCard(2),
  ])
  /** 现场恢复是否已完成：恢复完成前禁止写入快照（防止卸载兜底用空 state 覆盖带图快照） */
  const draftRestoredRef = useRef(false)
  const analyzingIdsRef = useRef(new Set<string>())
  const analyzingBatchRef = useRef(false)




  // ---- 现场快照：切换导航/跳转后返回，恢复视觉工作台上传与填写内容 ----
  useEffect(() => {
    let active = true
    void (async () => {
    const draft = await loadDraftWithImages<WorkbenchDraft>(WORKBENCH_DRAFT_KEY)
    if (!active) return
    if (!draft) {
      draftRestoredRef.current = true
      return
    }

    const restoreImage = async (dataUrl: string, name: string, id: string): Promise<UploadImage | null> => {
      try {
        const blob = await fetch(dataUrl).then((response) => response.blob())
        return {
          id,
          name,
          dataUrl,
          file: new File([blob], name || "image.png", { type: blob.type || "image/png" }),
        }
      } catch {
        return null
      }
    }

    const pending: Promise<unknown>[] = []
    const storedProducts = draft.productImages ?? (draft.productImage?.dataUrl ? [draft.productImage] : [])
    if (storedProducts.length) pending.push(restoreProductImages(storedProducts))

    // Browser-only draft restoration happens after hydration.
    if (typeof draft.productInfo === "string") setProductInfo(draft.productInfo)
    if (typeof draft.systemPrompt === "string") {
      setSystemPrompt(isLegacyDefaultPrompt(draft.systemPrompt) ? VISUAL_STRATEGIST_SYSTEM_PROMPT : draft.systemPrompt)
    }

    if (Array.isArray(draft.cards) && draft.cards.length > 0) {
      setCards(
        draft.cards.map((card, index) => ({
          id: card.id || `card-draft-${Date.now()}-${index}`,
          enabled: card.enabled === true && Boolean(card.references?.length || card.extraNeeds?.trim() || card.prompt?.trim()),
          references: [],
          sendReferencesToGeneration: card.sendReferencesToGeneration === true,
          extraNeeds: typeof card.extraNeeds === "string" ? card.extraNeeds : "",
          prompt: typeof card.prompt === "string" ? card.prompt : "",
          analysis: typeof card.analysis === "string" ? card.analysis : "",
          analysisError: typeof card.analysisError === "string" ? card.analysisError : "",
          isAnalyzing: false,
          progress: 0,
          ...restoreWorkbenchOutput(card),
          outputFormat: typeof card.outputFormat === "string" && card.outputFormat ? card.outputFormat : "png",
          background: typeof card.background === "string" && card.background ? card.background : "auto",
          count: typeof card.count === "string" && card.count ? card.count : "1",
        }))
      )
      draft.cards.forEach((card, cardIndex) => {
        if (!Array.isArray(card.references)) return
        pending.push(Promise.all(card.references.filter(reference => reference?.dataUrl).map(reference => restoreImage(reference.dataUrl, reference.name, reference.id || crypto.randomUUID()))).then(restored => {
          if (!active) return
          setCards(previous => previous.map((item, index) => index === cardIndex ? { ...item, references: restored.filter((image): image is UploadImage => image !== null) } : item))
        }))
      })
    }

    await Promise.all(pending)
    if (!active) return
      // 恢复完成：允许保存，并把恢复内容立即写回（防止卸载兜底用空 state 覆盖带图快照）
      draftRestoredRef.current = true
      try {
        saveDraft(WORKBENCH_DRAFT_KEY, draft)
      } catch {
        // 忽略
      }
      toast.success("已恢复上次现场（产品图 / 参考图 / 提示词）")
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
    const snapshot = (): WorkbenchDraft => ({
      productImages: productImageDrafts(productImages),
      productInfo,
      systemPrompt,
      cards: cards.map((card) => ({
        id: card.id,
        enabled: card.enabled,
        sendReferencesToGeneration: card.sendReferencesToGeneration,
        references: card.references.map((reference) => ({
          id: reference.id,
          name: reference.name,
          dataUrl: reference.dataUrl,
        })),
        extraNeeds: card.extraNeeds,
        prompt: card.prompt,
        analysis: card.analysis,
        analysisError: card.analysisError,
        size: card.size,
        customSize: card.customSize,
        quality: card.quality,
        outputFormat: card.outputFormat,
        background: card.background,
        count: card.count,
      })),
    })
    const timer = setTimeout(() => {
      saveDraft(WORKBENCH_DRAFT_KEY, snapshot())
    }, 600)
    return () => {
      clearTimeout(timer)
      // 卸载兜底：切页瞬间立即保存当前现场
      try {
        saveDraft(WORKBENCH_DRAFT_KEY, snapshot())
      } catch {
        // 忽略
      }
    }
  }, [productImages, productInfo, systemPrompt, cards])


  const handleReferenceFile = useCallback(async (cardId: string, file: File) => {
    const error = validateUpload(file)
    if (error) {
      toast.error(error)
      return
    }

    const { file: compressedFile, dataUrl } = await compressUploadImage(file)
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card
        if (card.references.length >= MAX_REFERENCE_IMAGES) {
          toast.error(`每路请求最多 ${MAX_REFERENCE_IMAGES} 张参考图`)
          return card
        }
        return {
          ...card,
          references: [...card.references, { id: crypto.randomUUID(), name: compressedFile.name, dataUrl, file: compressedFile }],
        }
      })
    )
  }, [])

  const handleReferenceFiles = useCallback(async (cardId: string, files: File[]) => {
    for (const file of files) await handleReferenceFile(cardId, file)
  }, [handleReferenceFile])

  const updateCard = useCallback((cardId: string, patch: Partial<RequestCardState>) => {
    setCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, ...patch } : card)))
  }, [])

  const addCard = useCallback(() => {
    setCards((prev) => [...prev, createCard(prev.length + 1)])
  }, [])

  const removeCard = useCallback((cardId: string) => {
    setCards((prev) => {
      const next = prev.filter((card) => card.id !== cardId)
      return next.length ? next : [createCard(1)]
    })
  }, [])

  const buildAnalyzePayload = useCallback(
    (card: RequestCardState) => {
      const images = productAnalysisImages(productImages)
      card.references.forEach((reference, index) => {
        images.push({ dataUrl: reference.dataUrl, role: "reference", index: index + productImages.length + 1 })
      })
      return images
    },
    [productImages]
  )

  const handleAnalyze = useCallback(
    async (cardId: string) => {
      const card = cards.find((item) => item.id === cardId)
      if (!card?.enabled || card.isAnalyzing || analyzingIdsRef.current.has(cardId)) return
      if (!card.references.length && !card.extraNeeds.trim()) return
      if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
      const { endpoint: analyzeEndpoint, apiKey: analyzeApiKey, model: analyzeModel } = readApiSettings().analysis
      if (!analyzeApiKey) {
        toast.error("请先在「API 设置」中填写并保存分析配置")
        return
      }
      if (!productImage) {
        toast.error("请先上传【我方产品图】")
        return
      }

      analyzingIdsRef.current.add(cardId)
      updateCard(cardId, { isAnalyzing: true, progress: 15, analysisError: "" })

      try {
        const images = buildAnalyzePayload(card)
        const extraNeeds = card.extraNeeds.trim()
        const userText = [
          extraNeeds ? `【本卡额外需求，优先于参考默认，须逐项落实到成品画面】\n${extraNeeds}` : "",
          productInfo.trim() ? `【产品信息】\n${productInfo.trim()}` : "",
          `【当前画布设置，仅用于构图，不作为上图文字】${requestedCanvas(card.size === "custom" ? card.customSize : sizeFromRatioQuality(card.size, card.quality), card.quality, card.size, readApiSettings().image.model)}。优先于参考图外框，无需在成品正文重抄技术设置。`,
          "【当前任务：单图视觉设计】根据本卡产品图、产品信息、竞品参考和额外需求，在内部按竞品视觉拆解 → 我方产品识别 → 产品硬约束 → 竞品视觉映射 → 完整成品 Prompt完成一条成品。先核对产品结构再映射，不能为套参考改实物。正向写明出镜产品的轮廓、部件数量与连接、比例和表面特征，以及完整分区、占比/间距和各区主体位置大小。有文案时逐条绑定最终原文、所属区域、文字框位置与字体层级；文案是否出现按本次指定及参考文字模块确定，明确无字图位保持无字。禁止以参考图编号、原位置或类似布局代替描述，不编造商品实测值。参考保留范围先受本卡额外需求约束，默认保留图型、格数/模块数与信息功能，未锁定的人物形象、左右位置、背景及相容场景可适度重新设计；无参考按本卡目标设计。按单图合同输出，内部推导不写进成品。",
          ANALYSIS_COPY_TASK_NOTE,
          WORKBENCH_REFERENCE_TASK_NOTE,
        ]
          .filter(Boolean)
          .join("\n\n")

        const response = await requestModelApi("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: await buildAnalyzeRequestBody({
            endpoint: analyzeEndpoint,
            apiKey: analyzeApiKey,
            model: analyzeModel,
            systemPrompt: systemPrompt + productIdentitySystemNote(productImages.length) + analysisImageModelNote(readApiSettings().image.model),
            userText,
            images,
          }),
        })

        const payload: unknown = await response.json().catch(() => null)
        const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}

        if (!response.ok) {
          throw new Error(typeof record.error === "string" ? record.error : `分析请求失败（${response.status}）`)
        }

        const generatedPrompt = typeof record.prompt === "string" ? record.prompt.trim() : ""

        if (!generatedPrompt) {
          throw new Error("分析模型未返回提示词内容")
        }

        const finalPrompt = extractFinalPrompt(generatedPrompt)

        updateCard(cardId, { prompt: finalPrompt, analysis: generatedPrompt, progress: 100 })
        toast.success(`第 ${cards.findIndex((item) => item.id === cardId) + 1} 路提示词已生成（已自动提取最终提示词）`)
      } catch (error) {
        const message = analysisFailureMessage(error, "提示词生成失败")
        updateCard(cardId, { progress: 0, analysisError: message })
        toast.error(`第 ${cards.findIndex((item) => item.id === cardId) + 1} 路分析失败：${message}`)
      } finally {
        analyzingIdsRef.current.delete(cardId)
        updateCard(cardId, { isAnalyzing: false })
      }
    },
    [buildAnalyzePayload, cards, productImage, productImages, productInfo, systemPrompt, updateCard, products.busy]
  )

  const handleAnalyzeAll = useCallback(async () => {
    if (analyzingBatchRef.current || analyzingIdsRef.current.size > 0) return
    const selected = cards.filter(card => card.enabled && (card.references.length > 0 || card.extraNeeds.trim()) && !card.isAnalyzing)
    if (!selected.length) { toast.error("请启用请求，并添加参考图或填写额外需求"); return }
    if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
    if (!readApiSettings().analysis.apiKey) { toast.error("请先在「API 设置」中填写并保存分析配置"); return }
    if (!productImage) { toast.error("请先上传【我方产品图】"); return }
    analyzingBatchRef.current = true
    try { await Promise.all(selected.map(card => handleAnalyze(card.id))) }
    finally { analyzingBatchRef.current = false }
  }, [cards, handleAnalyze, productImage, products.busy])

  /** 生图：把该路任务写入本栏目队列 → 跳转生图模块页（/generate）统一执行 */
  const enqueueCard = useCallback(
    async (cardsToRun: RequestCardState[]) => {
      if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
      if (cardsToRun.some((card) => card.size === "custom" && !isCustomOutputValid(card.customSize))) {
        toast.error("请先填写有效的自定义比例，例如 5:4 或 1:3")
        return
      }
      const queue: GenerateTask[] = cardsToRun.map((card) => {
        // 分析始终读取全部参考图；生图只保存本次开关选定的素材快照，重绘沿用该快照。
        const generationReferences = card.sendReferencesToGeneration ? card.references : []
        return {
          id: card.id,
          label: `请求 ${cards.findIndex(item => item.id === card.id) + 1}`,
          ratio: card.size,
          customSize: card.size === "custom" ? card.customSize.trim().replace("×", "x") : "",
          quality: card.quality,
          count: Number(card.count) || 1,
          prompt: applyRequestedOutputSize(
            prepareImagePrompt(card.prompt) + buildImageIdentitySuffix(productImages.length, generationReferences.length),
            requestedCanvas(card.size === "custom" ? card.customSize : sizeFromRatioQuality(card.size, card.quality), card.quality, card.size, readApiSettings().image.model)
          ),
          productImageDataUrl: productImage?.dataUrl || "",
          productImages: productImageDrafts(productImages),
          references: generationReferences.map((reference) => ({ dataUrl: reference.dataUrl, name: reference.name })),
          status: "queued",
          resultUrls: [],
          paused: false,
        }
      })
      const submitted = await submitGenerateQueue(queue, "/", cards.map(card => card.id))
      if (submitted === "cancelled") return
      if (submitted === "blocked") {
        toast.error("本栏目队列正在生成、排队或更新，请先查看本栏目结果；其他栏目可以独立生成", {
          action: { label: "查看队列", onClick: () => router.push(generateHref("/")) },
        })
      } else if (submitted === "failed") {
        toast.error("任务保存失败。请先复制备份提示词，清理已完成任务或更换浏览器后重试。")
      } else {
        router.push(generateHref("/"))
      }
    },
    [productImage, productImages, router, products.busy, cards]
  )

  const handleGenerate = useCallback(
    (cardId: string) => {
      if (!readApiSettings().image.apiKey) {
        toast.error("请先在「API 设置」中填写并保存生图配置")
        return
      }
      if (!productImage) {
        toast.error("请先上传【我方产品图】")
        return
      }
      const card = cards.find((item) => item.id === cardId)
      if (!card?.enabled || card.isAnalyzing) return
      if (!card.prompt.trim()) {
        toast.error("提示词为空，请先点击「生成提示词」或手动填写")
        return
      }
      enqueueCard([card])
    },
    [cards, productImage, enqueueCard]
  )

  const handleGenerateAll = useCallback(() => {
    const pending = cards.filter((card) => card.enabled && card.prompt.trim() && !card.isAnalyzing)
    if (!pending.length) {
      toast.error("没有已勾选且已填写提示词的请求")
      return
    }
    if (!readApiSettings().image.apiKey) {
      toast.error("请先在「API 设置」中填写并保存生图配置")
      return
    }
    if (!productImage) {
      toast.error("请先上传【我方产品图】")
      return
    }
    enqueueCard(pending)
  }, [cards, productImage, enqueueCard])

  const copyPrompt = useCallback(async (card: RequestCardState) => {
    try {
      await navigator.clipboard.writeText(card.prompt)
      toast.success("提示词已复制")
    } catch {
      toast.error("复制失败，请手动选择复制")
    }
  }, [])

  const isBusy = cards.some((card) => card.isAnalyzing)
  const selectedCount = cards.filter(card => card.enabled).length
  const generationTargets = cards.filter(card => card.enabled && card.prompt.trim() && !card.isAnalyzing)
  const totalImages = generationTargets.reduce((sum, card) => sum + (Number(card.count) || 1), 0)
  const analysisTargetsCount = cards.filter(card => card.enabled && (card.references.length > 0 || card.extraNeeds.trim())).length
  const analysisCount = cards.filter(card => card.isAnalyzing).length
  useEffect(() => { onAnalysisCountChange?.(analysisCount) }, [analysisCount, onAnalysisCountChange])


  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row">
      {/* 左侧导航栏 */}
      <VisualSidebar current="workbench" />
      <main className="flex min-w-0 flex-1 flex-col gap-6">
      {/* 顶栏 */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <SparklesIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Amazon 电商视觉工作台</h1>
              <p className="text-xs text-muted-foreground">
                PRODUCT FIRST · SCENE SECOND — 产品图 + 竞品参考 → 分析模型生成成品提示词 → 生图模型一次出图
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              多路并行 · {cards.length} 路
            </Badge>
            <SaveSuiteButton
              entries={cards.map((card) => ({ id: card.id, size: card.size, customSize: card.customSize, prompt: card.prompt }))}
            />
          </div>
        </div>

      </header>
      <ApiSetupNotice />
      <ImageModelNotice />

      {/* 第一部分：上传产品 + 信息（共用素材） */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">1</span>
          <h2 className="text-sm font-semibold tracking-tight">上传产品 + 信息（共用素材）</h2>
        </div>
        <Separator />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 产品图（必传） */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">我方产品图</CardTitle>
              <CardDescription className="text-xs">商品本体最高优先级来源，必传（PNG / JPG / WEBP，≤10MB）</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductImagesUpload manager={products} zoneKey="workbench-product" primaryAlt="我方产品图" />
            </CardContent>
          </Card>

          {/* 产品信息（可留空） */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">产品信息</CardTitle>
              <CardDescription className="text-xs">可留空。补充产品图中无法直接表达的参数 / 卖点 / 佩戴方式</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[200px] text-xs leading-5"
                placeholder={"例如：\nMaterial: Stainless Steel\nCapacity: 2L\nPower: 1200W\nVoltage: 110V\nSize: 22*18*15cm\nColor: Red\nPackage Includes: 1*Pot, 1*Lid, 3*Silicone Handles..."}
                value={productInfo}
                onChange={(event) => setProductInfo(event.target.value)}
              />
            </CardContent>
          </Card>

        </div>
      </section>

      {/* 第二部分：分析生成提示词 + 生图（多路并行） */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">2</span>
            <h2 className="text-sm font-semibold tracking-tight">多路请求 · 分析生成提示词 → 微调 → 生图</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectionActions onSelect={action => setCards(current => selectEntries(current, action, card => card.isAnalyzing))} />
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addCard}>
              <PlusIcon data-icon="inline-start" />
              新增请求
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">已启用 {selectedCount}/{cards.length} 路。新请求默认关闭；启用并添加参考图或填写额外需求后才分析，已有提示词可直接生图。站内切换导航会继续接收结果；刷新或关闭页面可能中断。重新生成会替换原提示词。</p>
        <Separator />

        <RequestWaitNotice active={analysisCount > 0} label={`正在分析 ${analysisCount} 条需求`} />
        <div className="entry-grid">
          {cards.map((card, index) => {
            const cardNumber = index + 1

            return (
              <Card key={card.id} data-request-card={card.id} className={cn("overflow-visible", !card.enabled && "border-dashed")}>
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <EntryEnabled label={`选择请求 ${cardNumber}`} checked={card.enabled} disabled={card.isAnalyzing} onChange={enabled => updateCard(card.id, { enabled })} />
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                      {cardNumber}
                    </span>
                    {card.isAnalyzing && (
                      <Badge variant="secondary" className="gap-1 font-mono text-xs">
                        <LoaderCircleIcon className="size-3 animate-spin" />
                        分析中
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => removeCard(card.id)}
                    aria-label={`删除请求 ${cardNumber}`}
                    disabled={cards.length === 1 || card.isAnalyzing}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  {/* 参考图（可留空） */}
                  <PasteZone zoneKey={`workbench-refs-${card.id}`} onImage={file => handleReferenceFile(card.id, file)} onFiles={files => handleReferenceFiles(card.id, files)}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">竞品参考图（可留空 · 最多 {MAX_REFERENCE_IMAGES} 张）</span>
                      <span className="font-mono text-xs text-muted-foreground">{card.references.length}/{MAX_REFERENCE_IMAGES}</span>
                    </div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <AssetPicker label="调用参考图资产" disabled={card.references.length >= MAX_REFERENCE_IMAGES} onSelect={file => handleReferenceFile(card.id, file)} />
                      <Button
                        type="button"
                        role="switch"
                        aria-checked={card.sendReferencesToGeneration}
                        aria-label={`请求 ${cardNumber} 生图时提交参考图`}
                        aria-describedby={`generation-refs-note-${card.id}`}
                        variant={card.sendReferencesToGeneration ? "secondary" : "outline"}
                        size="sm"
                        className="h-auto min-h-8 max-w-full whitespace-normal text-xs"
                        onClick={() => updateCard(card.id, { sendReferencesToGeneration: !card.sendReferencesToGeneration })}
                      >
                        生图时提交参考图：{card.sendReferencesToGeneration ? "开" : "关"}
                      </Button>
                    </div>
                    <p id={`generation-refs-note-${card.id}`} className="mb-2 text-xs leading-5 text-muted-foreground">分析始终提交已添加的参考图；开关仅影响下次生图，产品图照常提交。</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[0, 1].map((slot) => {
                        const reference = card.references[slot]

                        if (reference) {
                          return (
                            <div key={reference.id} className="relative overflow-hidden rounded-lg border">
                              <Image
                                src={reference.dataUrl}
                                alt={`参考图 ${slot + 1}`}
                                width={256}
                                height={256}
                                className="aspect-square w-full object-cover"
                              />
                              <div className="absolute top-1.5 left-1.5">
                                <Badge className="bg-black/60 text-xs backdrop-blur">参考图 {slot + 1}</Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1 size-6 p-0 text-white hover:bg-white/20"
                                onClick={() =>
                                  setCards((prev) =>
                                    prev.map((item) =>
                                      item.id === card.id
                                        ? { ...item, references: item.references.filter((_, refIndex) => refIndex !== slot) }
                                        : item
                                    )
                                  )
                                }
                                aria-label={`移除参考图 ${slot + 1}`}
                              >
                                <XIcon className="size-3.5" />
                              </Button>
                            </div>
                          )
                        }

                        return (
                          <PasteZone
                            key={slot}
                            zoneKey={`workbench-ref-${card.id}-${slot}`}
                            onImage={(file) => handleReferenceFile(card.id, file)}
                          >
                            <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                              <input
                                type="file"
                                multiple
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                className="hidden"
                                onChange={(event) => {
                                  const files = event.target.files
                                  if (files && files.length) {
                                    void handleReferenceFiles(card.id, Array.from(files))
                                  }
                                  event.target.value = ""
                                }}
                              />
                              <ImagePlusIcon className="size-5" />
                              <span className="text-xs font-medium">参考图 {slot + 1}</span>
                              <span className="text-[9px] opacity-70">可留空 · Ctrl+V 粘贴</span>
                            </label>
                          </PasteZone>
                        )
                      })}
                    </div>
                  </PasteZone>

                  {/* 额外需求（可留空） */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">额外需求（可留空）</span>
                    <Textarea
                      className="min-h-[64px] text-xs leading-5"
                      placeholder="自定义文案 / 布局要求，例如：画面上的文字请改成 Happy Birthday，标题居中放大、英文文案置于底部；竞品文案布局仅供参考，请按我方产品需要微调。"
                      value={card.extraNeeds}
                      onChange={(event) =>
                        setCards((prev) =>
                          prev.map((item) =>
                            item.id === card.id ? { ...item, extraNeeds: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>

                  <Separator />

                  {/* ① 生成提示词 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">① 提示词（分析模型 · 可微调）</span>
                      {card.prompt && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => void copyPrompt(card)}>
                          <CopyIcon data-icon="inline-start" />
                          复制
                        </Button>
                      )}
                    </div>
                    {card.prompt && !card.isAnalyzing && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground"
                          onClick={() => updateCard(card.id, { prompt: "", analysis: "" })}
                        >
                          <XIcon data-icon="inline-start" />
                          清空
                        </Button>
                      </div>
                    )}
                    <PromptEditor title={`请求 ${index + 1} 提示词`} value={card.prompt} onChange={value => updateCard(card.id, { prompt: value })} />
                    {card.isAnalyzing && <Progress value={card.progress} className="h-1.5" />}
                    {card.analysisError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm leading-6 break-words">
                      <p className="font-medium">第 {index + 1} 路分析未完成</p>
                      <p className="whitespace-pre-wrap">{card.analysisError}</p>
                      <p className="mt-1 text-muted-foreground">原提示词和素材已保留。系统不会自动重发；请核查服务商记录后再手动生成提示词。</p>
                    </div>}
                    {card.analysis && card.analysis !== card.prompt && (
                      <details className="rounded-md border bg-muted/30">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                          查看模型原始输出
                        </summary>
                        <pre className="max-h-56 overflow-auto px-3 pb-3 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                          {card.analysis}
                        </pre>
                      </details>
                    )}
                  </div>

                  <Separator />

                  <GenerationSettings label={`请求 ${index + 1}`} ratio={card.size} quality={card.quality} count={card.count} customSize={card.customSize}
                    onRatioChange={value => updateCard(card.id, { size: value })}
                    onQualityChange={value => updateCard(card.id, { quality: value })}
                    onCountChange={value => updateCard(card.id, { count: value })}
                    onCustomSizeChange={value => updateCard(card.id, { customSize: value })} />
                  {/* ② 生图 */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => void handleGenerate(card.id)}
                        disabled={!card.enabled || card.isAnalyzing || !card.prompt.trim()}
                      >
                        <WandSparklesIcon data-icon="inline-start" />
                        ② 生图
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        生图将携带全部 {productImages.length} 张产品图（图1为主产品）{card.sendReferencesToGeneration && card.references.length ? ` + ${card.references.length} 张参考图（从图${productImages.length + 1}开始）` : "，不提交参考图"}。
                      </span>
                    </div>

                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="flex justify-center pb-4">
          <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={addCard}>
            <PlusIcon data-icon="inline-start" />
            新增请求（可继续扩展多个并行线路）
          </Button>
        </div>
      </section>

      {/* 底部说明 */}
      <footer className="pb-8">
        <Separator />
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          流程：上传产品图 + 产品信息（共用）→ 每路请求绑定竞品参考图 → 分析模型按「Amazon 电商视觉策略师」角色生成成品提示词 →
          微调提示词 → 选择比例 / 数量 → 生图模型一次出图。API Key 仅保存在本机浏览器，请求经本站代理转发。
        </p>
      </footer>
      <FixedActionBar>
        <BatchGenerateButton count={generationTargets.length} images={totalImages} onClick={() => void handleGenerateAll()} disabled={isBusy || products.busy || !productImage} disabledReason={isBusy ? "请等待当前分析完成" : !productImage ? "请先上传主产品图" : undefined} />
        <Button type="button" variant="secondary" size="sm" className="h-11 text-sm" onClick={() => void handleAnalyzeAll()} disabled={isBusy || products.busy || !cards.some(card => card.enabled && (card.references.length > 0 || card.extraNeeds.trim()))}>
          {isBusy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
          {isBusy ? "生成提示词中…" : `生成提示词 ${analysisTargetsCount} 条`}
        </Button>
      </FixedActionBar>
      </main>
    </div>
  )
}
