"use client"
import { imagePromptProfile } from "@/lib/model-prompt-profile"
import { useImageModel } from "@/lib/use-image-model"

export function ImageModelDifference({ model, draft = false }: { model: string; draft?: boolean }) {
  const profile = imagePromptProfile(model)
  return <div data-image-model={profile.family} role="status" className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
    <p className="font-medium text-foreground">{draft ? "待保存的生图模型" : "当前生图模型"}：{model}</p>
    <p>{profile.summary}</p>
    <p>完整提示词保留，仅按模型补充执行要求；文字和复杂排版请核对实际成图。{draft ? "保存后用于后续请求。" : "已提交任务继续使用原配置。"}</p>
  </div>
}
export function ImageModelNotice() { return <ImageModelDifference model={useImageModel()} /> }
