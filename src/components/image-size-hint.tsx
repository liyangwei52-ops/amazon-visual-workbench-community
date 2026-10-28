"use client"
import { Badge } from "@/components/ui/badge"
import { resolveImagePlan } from "@/lib/model-image-plan"
import { useImageModel } from "@/lib/use-image-model"
import { parseOutputRatio } from "@/lib/output-ratio"

export function ImageSizeHint({ size, qualityLevel, ratio, model, actualSize }: {
  size: string; qualityLevel?: string; ratio?: string; model?: string; actualSize?: string
}) {
  const currentModel = useImageModel()
  if (!size.trim()) return <p className="text-xs text-muted-foreground">输入宽:高比例，例如5:4、1:3，再选择1K/2K。</p>
  let plan
  let message = ""
  try { plan = resolveImagePlan(model || currentModel, size || "1024x1024", qualityLevel, ratio) }
  catch (error) { message = error instanceof Error ? error.message : "尺寸无效" }
  if (!plan) return <p className="text-xs text-destructive" role="alert">{message}</p>
  const output = actualSize || plan.size
  return <div className="flex min-w-0 flex-col items-start gap-1 text-xs leading-5" data-size-hint>
      <Badge variant="secondary" className="max-w-full whitespace-normal break-all font-mono text-xs">
        {plan.requestedSize !== output ? `${plan.requestedSize} → ${output}` : output}
      </Badge>
      {plan.protocol === "gemini" ? <span className="text-muted-foreground">{plan.aspectRatio || "自动比例"} · {plan.resolution} · {actualSize ? "实际返回尺寸" : "预计尺寸，以模型返回为准"}</span>
        : plan.adjusted ? <span className="text-amber-300">{parseOutputRatio(size) ? plan.note : "已就近适配当前模型的合法尺寸"}</span> : null}
      {plan.protocol === "gemini" && parseOutputRatio(size) && plan.aspectRatio !== parseOutputRatio(size)?.label && <span className="text-amber-300">{plan.note}</span>}
    </div>
}
