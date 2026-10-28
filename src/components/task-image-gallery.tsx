"use client"

import { useState } from "react"
import { CopyIcon, EyeIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { sizeFromRatioQuality, type GenerateTask } from "@/lib/visual-shared"
import { resolveImagePlan } from "@/lib/model-image-plan"
import { useImageModel } from "@/lib/use-image-model"
import { saveAsset } from "@/lib/asset-store"
import { imageOutputWarning } from "@/lib/image-output-check"
import { ResultSelection } from "./generation-actions"
import { countTaskResults, taskAssetId } from "@/lib/generation-selection"
import { ResultImageViewer } from "./result-image-viewer"

/** 一个任务共用一个预览区，数字只对应该任务设置的图片数量。 */
export function TaskImageGallery({ task, taskNumber, selectedOutputs, onSelectOutput, selectionDisabled = false }: {
  task: GenerateTask; taskNumber: number; selectedOutputs?: number[]; onSelectOutput?: (index: number, checked: boolean) => void; selectionDisabled?: boolean
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [measured, setMeasured] = useState<{ src: string; width: number; height: number } | null>(null)
  const model = useImageModel()
  const count = Math.min(4, Math.max(1, Math.floor(Number(task.count) || 1)))
  const selected = Math.min(activeIndex, count - 1)
  const src = task.resultUrls[selected]
  const requested = task.ratio === "custom" ? task.customSize : sizeFromRatioQuality(task.ratio, task.quality)
  let size = task.requestInfo?.size || requested
  let submittedSize = task.requestInfo?.submittedSize || requested
  try {
    submittedSize = task.requestInfo?.submittedSize || resolveImagePlan(task.requestInfo?.model || model, requested, task.quality, task.ratio).size
    size = task.requestInfo?.size || submittedSize
  } catch { /* 无效尺寸由任务提交处提示。 */ }
  const currentMeasurement = measured?.src === src ? measured : null
  const warning = currentMeasurement ? imageOutputWarning(submittedSize, currentMeasurement.width, currentMeasurement.height) : ""
  if (currentMeasurement) size = `${currentMeasurement.width}x${currentMeasurement.height}`
  const [width, height] = size.toLowerCase().split(/[x×]/).map(Number)
  const aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1"

  return (
    <div className="flex flex-col gap-2" data-task-gallery={task.id}>
      <div className="relative overflow-hidden rounded-lg border bg-muted/30" style={{ aspectRatio, maxHeight: "min(70vh, 600px)" }}>
        {src ? (
          <button type="button" aria-label={`放大任务 ${taskNumber} 第 ${selected + 1} 张原图`} className="absolute inset-0 size-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary" onClick={() => setPreviewOpen(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`任务 ${taskNumber} 成品图 ${selected + 1}`} className="size-full bg-white object-contain" onLoad={event => {
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget
            setMeasured({ src, width, height })
          }} />
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground" aria-live="polite">
            {task.status === "running" && <LoaderCircleIcon className="size-4 animate-spin" />}
            <p>{task.status === "running" ? `正在生成第 ${selected + 1} 张图片…` : task.status === "queued" ? `第 ${selected + 1} 张图片等待执行` : `第 ${selected + 1} 张图片未返回`}</p>
          </div>
        )}
        {src && task.redraw?.pending.includes(selected) && <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 text-center text-xs text-white" role="status">{task.status === "running" ? "此图重绘中，暂时显示原图" : task.status === "queued" ? "此图等待重绘，暂时显示原图" : "此图重绘未完成，已保留原图"}</div>}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={`任务 ${taskNumber} 图片序号`}>
        {Array.from({ length: count }, (_, index) => (
          <Button
            key={index}
            type="button"
            size="icon-xs"
            variant={selected === index ? "default" : "outline"}
            className="size-7 rounded-md font-mono text-xs"
            aria-label={`查看第 ${index + 1} 张图片`}
            aria-pressed={selected === index}
            onClick={() => setActiveIndex(index)}
          >
            {index + 1}
          </Button>
        ))}
      </div>
      {onSelectOutput && <div className="flex flex-wrap items-center justify-between gap-2">
        <ResultSelection disabled={selectionDisabled} label={`选择任务 ${taskNumber} 的第 ${selected + 1} 张重绘`} text={`选择第 ${selected + 1} 张重绘`} checked={Boolean(selectedOutputs?.includes(selected))} onChange={checked => onSelectOutput(selected, checked)} />
        <span className="text-xs text-muted-foreground">已选 {selectedOutputs?.length || 0}/{count} 张</span>
      </div>}
      {task.status === "success" && countTaskResults(task) < count && (
        <p className="text-xs text-amber-300" role="status">本次返回 {countTaskResults(task)}/{count} 张，请先核查服务商结果。</p>
      )}
      {task.resultWarning && <p className="whitespace-pre-wrap text-xs text-amber-300" role="status">{task.resultWarning}</p>}
      {warning && <p data-output-warning className="whitespace-pre-wrap text-xs text-amber-300" role="status">第 {selected + 1} 张：{warning}</p>}
      {src && (
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={async () => {
          try {
            const response = await fetch(src)
            if (!response.ok) throw new Error("无法读取原图")
            await saveAsset(await response.blob(), { id: taskAssetId(task, selected), name: `${task.label || `任务${taskNumber}`} 第${selected + 1}张`, kind: "generated", prompt: task.prompt, model: task.requestInfo?.model })
            toast.success("已保存到资产中心")
          } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败") }
        }}>保存到资产中心</Button>
      )}
      {src && (
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            navigator.clipboard?.writeText(src).then(() => toast.success("图片链接已复制")).catch(() => toast.error("复制失败，请使用查看大图"))
          }}>
            <CopyIcon data-icon="inline-start" />复制链接
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPreviewOpen(true)}>
            <EyeIcon data-icon="inline-start" />查看大图
          </Button>
        </div>
      )}
      {previewOpen && src && <ResultImageViewer key={src} src={src} title={`任务 ${taskNumber} · 第 ${selected + 1} 张`} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}
