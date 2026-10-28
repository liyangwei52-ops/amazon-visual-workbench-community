"use client"

import { useEffect, useState } from "react"
import { BrainCircuitIcon, CheckIcon, EyeIcon, EyeOffIcon, ImageIcon, SaveIcon, Settings2Icon } from "lucide-react"
import { toast } from "sonner"
import { VisualSidebar } from "@/components/visual-sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { defaultApiSettings, readApiSettings, saveApiSettings, type ApiSettings } from "@/lib/api-settings"
import { ImageModelDifference } from "./image-model-notice"

export function ApiSettingsPage() {
  const [draft, setDraft] = useState(defaultApiSettings)
  const [saved, setSaved] = useState<ApiSettings | null>(null)
  const [visible, setVisible] = useState({ analysis: false, image: false })
  useEffect(() => {
    const config = readApiSettings()
    // Restore browser preferences after hydration, without writing defaults over them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(config)
    setSaved(config)
  }, [])
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const update = (group: keyof ApiSettings, field: "endpoint" | "apiKey" | "model", value: string) => {
    setDraft((previous) => ({ ...previous, [group]: { ...previous[group], [field]: value } }))
  }
  const save = () => {
    try {
      const config = saveApiSettings(draft)
      setDraft(config)
      setSaved(config)
      toast.success("API 设置已保存，全站后续请求将使用此配置")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请检查浏览器存储权限")
    }
  }
  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 px-4 py-6 lg:flex-row">
      <VisualSidebar current="settings" />
      <main className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex flex-col gap-2 rounded-xl border bg-card p-5">
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Settings2Icon className="size-5" />API 设置</h1>
          <p className="text-sm leading-6 text-muted-foreground">统一管理全站的接口、Key 和模型。点击保存后，视觉工作台、一键策划、提示词迁移和所有生图任务都会使用这里的配置。</p>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); save() }} className="flex flex-col gap-5">
          <div className="grid gap-4 xl:grid-cols-2">
            {(["analysis", "image"] as const).map((group) => {
              const analysis = group === "analysis"
              const Icon = analysis ? BrainCircuitIcon : ImageIcon
              const label = analysis ? "分析" : "生图"
              return (
                <Card key={group}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm"><Icon className="size-4" />{label}配置</CardTitle>
                    <CardDescription className="text-xs leading-5">{analysis ? "读取产品图、参考图和策划需求，生成与改写提示词。" : "根据提示词和参考图片生成成品图，全站生图共用。"}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${group}-endpoint`} className="text-xs font-medium">{label} API 地址</label>
                      <Input id={`${group}-endpoint`} type="url" required disabled={!saved} value={draft[group].endpoint} onChange={(event) => update(group, "endpoint", event.target.value)} placeholder="https://api.openlux.ai/v1" className="font-mono text-xs" />
                      <p className="text-xs leading-5 text-muted-foreground">填写服务商的基础地址（通常以 /v1 结尾），仅支持服务端已允许的 HTTPS 服务商。</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${group}-key`} className="text-xs font-medium">{label} API Key</label>
                      <div className="relative">
                        <Input id={`${group}-key`} type={visible[group] ? "text" : "password"} autoComplete="off" spellCheck={false} disabled={!saved} value={draft[group].apiKey} onChange={(event) => update(group, "apiKey", event.target.value)} placeholder="填写此服务商的 API Key" className="pr-10 font-mono text-xs" />
                        <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 size-9" aria-label={`${visible[group] ? "隐藏" : "显示"}${label} Key`} onClick={() => setVisible((previous) => ({ ...previous, [group]: !previous[group] }))}>{visible[group] ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}</Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`${group}-model`} className="text-xs font-medium">{label}模型</label>
                      <Input id={`${group}-model`} required disabled={!saved} value={draft[group].model} onChange={(event) => update(group, "model", event.target.value)} className="font-mono text-xs" />
                      {!analysis && <>
                        <div className="flex flex-wrap gap-1.5">
                          {[["GPT Image 2", "gpt-image-2"], ["Gemini 3 Pro Image", "gemini-3-pro-image"], ["Gemini Pro Preview", "gemini-3-pro-image-preview"]].map(([name, model]) => <Button key={model} type="button" variant="outline" size="xs" disabled={!saved} onClick={() => update("image", "model", model)}>{name}</Button>)}
                        </div>
                        <ImageModelDifference model={draft.image.model} draft={dirty} />
                      </>}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p role="status" className="flex items-center gap-2 text-sm font-medium">{dirty ? "有未保存的修改" : saved ? <><CheckIcon className="size-4 text-emerald-500" />当前配置已载入</> : "正在读取设置…"}</p>
              <p className="text-xs leading-5 text-muted-foreground">保存后用于后续请求；已在执行的任务继续使用提交时的配置。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" disabled={!dirty} onClick={() => saved && setDraft(saved)}>撤销修改</Button>
              <Button type="submit" disabled={!saved}><SaveIcon className="size-4" />保存设置</Button>
            </div>
          </div>
        </form>
        <p className="text-xs leading-6 text-muted-foreground">设置和 Key 仅保存在当前浏览器，刷新或切换页面会保留。分析与生图可以使用不同的服务商和模型；请确认 Key 与各自的服务商地址匹配。</p>
        <p className="text-xs leading-6 text-muted-foreground">线上使用 OpenLux 时，分析与生图会从当前浏览器直连已配置的服务商，避免长请求和大图片受站点转发限制。请保持浏览器标签页打开；工作台分析和生图任务支持站内切换导航后继续接收。</p>
      </main>
    </div>
  )
}
