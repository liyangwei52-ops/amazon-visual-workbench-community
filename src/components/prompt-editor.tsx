"use client"

import { useEffect, useId, useRef, useState } from "react"
import { CopyIcon, Maximize2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"

/** 卡片只展示固定高度的编辑区，全文在原生全屏对话框中编辑；不截断存储内容。 */
export function PromptEditor({ value, onChange, title = "提示词", placeholder = "填写或粘贴完整提示词…" }: {
  value: string; onChange: (value: string) => void; title?: string; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    element?.showModal()
    return () => { element?.close(); document.body.style.overflow = previousOverflow }
  }, [open])

  const copy = async () => {
    try { await navigator.clipboard.writeText(value); toast.success("已复制完整提示词") }
    catch { toast.error("复制失败，请在编辑框中全选复制") }
  }
  return <div className="flex min-w-0 flex-col gap-2" data-prompt-editor>
    <Textarea
      data-prompt-preview
      aria-label={title}
      className="field-sizing-fixed h-40 min-h-40 max-h-40 resize-none overflow-y-auto font-mono text-xs leading-5"
      style={{ fieldSizing: "fixed", height: "10rem", minHeight: "10rem", maxHeight: "10rem" }}
      value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}
    />
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 truncate text-xs text-muted-foreground" title={`${value.length} 字符，全文保留`}>{value.length.toLocaleString("zh-CN")} 字符 · 全文保留</span>
      <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setOpen(true)} aria-label={`全屏查看或编辑${title}`}><Maximize2Icon className="size-3.5" />全屏查看 / 编辑</Button>
    </div>
    <dialog ref={dialog} aria-labelledby={headingId} data-prompt-fullscreen onClose={() => setOpen(false)} className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/80">
      {open && <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-6">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 id={headingId} className="text-base font-semibold">{title} · 全屏查看 / 编辑</h2><p className="mt-1 text-xs text-muted-foreground">编辑实时同步到原卡片，关闭或按 Esc 返回。</p></div><Button type="button" variant="outline" size="sm" onClick={() => dialog.current?.close()}><XIcon className="size-4" />完成编辑</Button></header>
        <Textarea autoFocus aria-label={`完整${title}`} data-prompt-fulltext className="field-sizing-fixed min-h-0 flex-1 resize-none overflow-auto font-mono text-sm leading-6" style={{ fieldSizing: "fixed" }} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{value.length.toLocaleString("zh-CN")} 字符 · 未压缩或截断</span><Button type="button" variant="outline" size="sm" disabled={!value} onClick={() => void copy()}><CopyIcon className="size-4" />复制全文</Button></footer>
      </div>}
    </dialog>
  </div>
}
