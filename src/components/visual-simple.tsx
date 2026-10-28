"use client"
import { FixedActionBar } from "./fixed-action-bar"
import { ApiSetupNotice } from "./api-setup-notice"
import { ImageModelNotice } from "./image-model-notice"
import { selectEntries } from "@/lib/generation-selection"
import { isCustomOutputValid } from "@/lib/output-ratio"
import { GenerationSettings } from "@/components/generation-settings"
import { EntryEnabled, BatchGenerateButton, SelectionActions } from "@/components/generation-actions"
import { PromptEditor } from "@/components/prompt-editor"
import { ProductImagesUpload } from "@/components/product-images-upload"
import { useProductImages, productImageDrafts, type ProductImageDraft } from "@/lib/use-product-images"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { readApiSettings } from "@/lib/api-settings"
import {
  ImageIcon,
  PlusIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VisualSidebar } from "@/components/visual-sidebar"
import { SaveSuiteButton } from "@/components/save-suite-button"
import { LoadSuitePanel } from "@/components/load-suite-panel"
import type { SavedSuite } from "@/lib/suite-store"
import { loadDraftWithImages, saveDraft } from "@/lib/draft-store"
import { generateHref, submitGenerateQueue } from "@/lib/generate-queue-store"
import { type GenerateTask } from "@/lib/visual-shared"

/**
 * 极简图文生图页（/simple）
 * 参考「图文生图」批量卡布局：上传产品图 + 多个提示词卡（启用/比例/清晰度/数量）
 * →「生成 N 条」显示累计图片数，进入统一生图页执行。
 */

type Entry = {
  id: string
  enabled: boolean
  prompt: string
  ratio: string
  customSize: string
  quality: "1k" | "2k"
  count: string
}

const newEntry = (): Entry => ({
  id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  enabled: true,
  prompt: "",
  ratio: "1:1",
  customSize: "",
  quality: "2k",
  count: "1",
})

/** 极简页现场快照键 */
export const SIMPLE_DRAFT_KEY = "amazon-workbench.draft.simple"

type SimpleDraft = {
  generationMode?: "image" | "text"
  productImage?: ProductImageDraft | null
  productImages?: ProductImageDraft[]
  entries?: Array<{
    id: string
    enabled: boolean
    prompt: string
    ratio: string
    customSize: string
    quality: Entry["quality"]
    count: string
  }>
}

export function VisualSimple() {
  const router = useRouter()
  const [generationMode, setGenerationMode] = useState<"image" | "text">("image")
  const products = useProductImages()
  const { images: productImages, main: productImage, restore: restoreProductImages } = products
  const [entries, setEntries] = useState<Entry[]>([newEntry()])
  /** 现场恢复是否已完成：恢复完成前禁止写入快照（防止卸载兜底用空 state 覆盖带图快照） */
  const draftRestoredRef = useRef(false)

  // ---- 现场快照：切换导航/跳转后返回，恢复极简页已上传与已填写内容 ----
  useEffect(() => {
    let active = true
    void (async () => {
    const draft = await loadDraftWithImages<SimpleDraft>(SIMPLE_DRAFT_KEY)
    if (!active) return
    if (!draft) {
      draftRestoredRef.current = true
      return
    }

    // Restore the chosen mode together with the prompt draft.
    setGenerationMode(draft.generationMode === "text" ? "text" : "image")
    const pending: Promise<unknown>[] = []
    const storedProducts = draft.productImages ?? (draft.productImage?.dataUrl ? [draft.productImage] : [])
    if (storedProducts.length) pending.push(restoreProductImages(storedProducts))

    if (Array.isArray(draft.entries) && draft.entries.length > 0) {
      // Browser-only draft restoration happens after hydration.
       
      setEntries(
        draft.entries.map((entry) => ({
          id: entry.id || `entry-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          enabled: entry.enabled !== false,
          prompt: typeof entry.prompt === "string" ? entry.prompt : "",
          ratio: typeof entry.ratio === "string" && entry.ratio ? entry.ratio : "1:1",
          customSize: typeof entry.customSize === "string" ? entry.customSize : "",
          quality: (entry.quality === "1k" || entry.quality === "2k" ? entry.quality : "2k") as Entry["quality"],
          count: typeof entry.count === "string" && entry.count ? entry.count : "1",
        }))
      )
    }

    await Promise.all(pending)
    if (!active) return
      // 恢复完成：允许保存，并把恢复内容立即写回（防止卸载兜底用空 state 覆盖带图快照）
      draftRestoredRef.current = true
      try {
        saveDraft(SIMPLE_DRAFT_KEY, draft)
      } catch {
        // 忽略
      }
      toast.success("已恢复上次现场（产品图 / 提示词卡）")
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
    const snapshot = (): SimpleDraft => ({
      generationMode,
      productImages: productImageDrafts(productImages),
      entries: entries.map((entry) => ({
        id: entry.id,
        enabled: entry.enabled,
        prompt: entry.prompt,
        ratio: entry.ratio,
        customSize: entry.customSize,
        quality: entry.quality,
        count: entry.count,
      })),
    })
    const timer = setTimeout(() => {
      saveDraft(SIMPLE_DRAFT_KEY, snapshot())
    }, 600)
    return () => {
      clearTimeout(timer)
      try {
        saveDraft(SIMPLE_DRAFT_KEY, snapshot())
      } catch {
        // 忽略
      }
    }
  }, [generationMode, productImages, entries])

  const updateEntry = useCallback((id: string, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((entry) => entry.id !== id)))
  }, [])

  const applyLoadedSuite = useCallback((suite: SavedSuite) => {
    setEntries(previous => suite.entries.map((entry, index) => ({
      ...newEntry(),
      prompt: entry.prompt,
      ratio: entry.size,
      customSize: entry.customSize,
      quality: previous[index]?.quality || "2k",
      count: previous[index]?.count || "1",
    })))
    toast.success(`已载入「${suite.name}」（${suite.entries.length} 条提示词）`)
  }, [])

  const totalCount = useMemo(
    () =>
      entries
        .filter((entry) => entry.enabled && entry.prompt.trim())
        .reduce((sum, entry) => sum + (Number(entry.count) || 1), 0),
    [entries]
  )

  const enabledCount = useMemo(() => entries.filter((entry) => entry.enabled).length, [entries])
  const readyCount = entries.filter(entry => entry.enabled && entry.prompt.trim()).length

  /** 开始生成：组装启用卡任务 → 写入本栏目队列 → 二次跳转到生图模块页（/generate）统一执行 */
  const handleGenerate = useCallback(async () => {
      if (products.busy) { toast.error("产品图正在添加，请等待全部图片就绪后再提交"); return }
    if (!readApiSettings().image.apiKey) {
      toast.error("请先在「API 设置」中填写并保存生图配置")
      return
    }
    if (generationMode === "image" && !productImage) {
      toast.error("请先上传产品图")
      return
    }
    const targets = entries.filter((entry) => entry.enabled && entry.prompt.trim())
    if (targets.length === 0) {
      toast.error("没有可生成的提示词（请先勾选启用并填写提示词）")
      return
    }

    if (targets.some(entry => entry.ratio === "custom" && !isCustomOutputValid(entry.customSize))) { toast.error("请填写有效的自定义比例，例如 5:4 或 1:3"); return }

    const queue: GenerateTask[] = targets.map((entry) => ({
      id: entry.id,
      label: `提示词 ${entries.findIndex(item => item.id === entry.id) + 1}`,
      ratio: entry.ratio,
      customSize: entry.customSize || "",
      quality: entry.quality,
      count: Number(entry.count) || 1,
      prompt: entry.prompt,
      promptMode: "verbatim",
      productImageDataUrl: generationMode === "image" ? productImage?.dataUrl || "" : "",
      productImages: generationMode === "image" ? productImageDrafts(productImages) : [],
      status: "queued",
      resultUrls: [],
      paused: false,
    }))

    const submitted = await submitGenerateQueue(queue, "/simple", entries.map(entry => entry.id))
    if (submitted === "cancelled") return
    if (submitted === "blocked") {
      toast.error("本栏目队列正在生成、排队或更新，请先查看本栏目结果；其他栏目可以独立生成", {
        action: { label: "查看队列", onClick: () => router.push(generateHref("/simple")) },
      })
    } else if (submitted === "failed") {
      toast.error("任务保存失败，未发送生图请求；请检查浏览器存储空间后重试")
    } else {
      router.push(generateHref("/simple"))
    }
  }, [generationMode, productImage, productImages, entries, router, products.busy])

  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 px-4 py-6 lg:flex-row">
      {/* 左侧导航栏 */}
      <VisualSidebar current="simple" />
      <main className="flex min-w-0 flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">极简生图</h1>
        <div className="flex w-full flex-wrap items-start gap-3 sm:w-auto"><SaveSuiteButton
          entries={entries.map((entry) => ({ id: entry.id, size: entry.ratio, customSize: entry.customSize, prompt: entry.prompt }))}
        /></div>
      </header>
      <ApiSetupNotice analysis={false} />
      <ImageModelNotice />

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="生图模式" className="inline-flex shrink-0 gap-1 rounded-lg border bg-muted/30 p-1">
          <Button type="button" size="sm" variant={generationMode === "image" ? "default" : "ghost"} aria-pressed={generationMode === "image"} onClick={() => setGenerationMode("image")}>
            <ImageIcon className="size-4" />图文生图
          </Button>
          <Button type="button" size="sm" variant={generationMode === "text" ? "default" : "ghost"} aria-pressed={generationMode === "text"} onClick={() => setGenerationMode("text")}>
            <TypeIcon className="size-4" />文生图
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {generationMode === "image" ? "上传图片，按你填写的提示词直接生成，不自动补充内容。" : "直接使用你填写的提示词，无需上传图片，不自动补充内容。"}
        </p>
      </div>

      {/* 产品图 */}
      {generationMode === "image" && (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">产品图（最多4张）</CardTitle>
          <CardDescription className="text-xs">必传。图片按顺序发送，展示与修改要求由你的提示词决定（PNG/JPG/WEBP，≤10MB，自动压缩）</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductImagesUpload manager={products} zoneKey="simple-product" />
        </CardContent>
      </Card>
      )}

      <LoadSuitePanel onLoad={applyLoadedSuite} />

      {/* 提示词多卡 */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">提示词 · 启用 {enabledCount}/{entries.length}</CardTitle>
              <CardDescription className="text-xs">每个框一条提示词；只提交已启用且已填写的，可各自设置比例/清晰度/数量并发出图</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SelectionActions onSelect={action => setEntries(current => selectEntries(current, action))} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setEntries((prev) => [...prev, newEntry()])}
              >
                <PlusIcon data-icon="inline-start" />
                添加提示词
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {entries.length === 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-fit text-xs"
              onClick={() => setEntries([newEntry()])}
            >
              <PlusIcon data-icon="inline-start" />
              添加第一条提示词
            </Button>
          )}
          {entries.length > 0 && (
            <div className="entry-grid">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors ${
                    entry.enabled ? "border-foreground/20 bg-muted/10" : "border-dashed border-muted-foreground/25 bg-muted/5 opacity-80"
                  }`}
                >
                  {/* 卡头：启用 + 序号 + 删除 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <EntryEnabled label={`启用第 ${index + 1} 条`} checked={entry.enabled} onChange={enabled => updateEntry(entry.id, { enabled })} />
<span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeEntry(entry.id)}
                      disabled={entries.length <= 1}
                      aria-label="删除本条"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <GenerationSettings label={`提示词 ${index + 1}`} ratio={entry.ratio} quality={entry.quality} count={entry.count} customSize={entry.customSize}
                    onRatioChange={value => updateEntry(entry.id, { ratio: value })}
                    onQualityChange={value => updateEntry(entry.id, { quality: value })}
                    onCountChange={value => updateEntry(entry.id, { count: value })}
                    onCustomSizeChange={value => updateEntry(entry.id, { customSize: value })} />
                  {/* 提示词 */}
                  <PromptEditor title={`提示词 ${index + 1}`} value={entry.prompt} onChange={value => updateEntry(entry.id, { prompt: value })} />

                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 底部操作 */}
      <FixedActionBar>
        <BatchGenerateButton count={readyCount} images={totalCount} onClick={handleGenerate} disabled={products.busy || (generationMode === "image" && !productImage)} disabledReason={products.busy ? "正在处理产品图，请稍候" : generationMode === "image" && !productImage ? "先上传主产品图，或切换为文生图。" : undefined} />
      </FixedActionBar>
      </main>
    </div>
  )
}
