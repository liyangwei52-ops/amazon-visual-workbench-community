"use client"
import { isCustomOutputValid } from "@/lib/output-ratio"

import { useId, useRef, useState } from "react"
import { SaveIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveSuite, type SuiteEntry } from "@/lib/suite-store"

type Props = {
  entries: SuiteEntry[]
}

/** Shared save flow for prompt-producing pages. No model request is needed to save. */
export function SaveSuiteButton({ entries }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const nameId = useId()
  const [name, setName] = useState("")
  const open = () => {
    if (!entries.some((entry) => entry.prompt.trim())) {
      toast.error("没有可保存的提示词，请先生成或填写至少一条")
      return
    }
    setName(`提示词套装-${new Date().toLocaleDateString("zh-CN")}`)
    dialogRef.current?.showModal()
  }
  const save = () => {
    const prompts = entries.filter((entry) => entry.prompt.trim())
    if (!name.trim() || !prompts.length) {
      toast.error(!name.trim() ? "请填写套装名称" : "至少需要一条提示词才能保存")
      return
    }
    if (prompts.some((entry) => entry.size === "custom" && !isCustomOutputValid(entry.customSize))) {
      toast.error("请先填写有效的自定义比例，例如 5:4 或 1:3")
      return
    }
    const result = saveSuite({
      id: `suite-${Date.now()}`,
      name: name.trim(),
      entries: prompts.map((entry) => ({ ...entry, prompt: entry.prompt.trim() })),
      savedAt: Date.now(),
    })
    if (result === "failed") {
      toast.error("保存失败：浏览器存储可能已满，请删除部分旧套装或精简内容后重试")
      return
    }
    dialogRef.current?.close()
    toast.success(`已${result === "updated" ? "更新同名" : "保存"}套装「${name.trim()}」（${prompts.length} 条提示词）`)
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={open}>
        <SaveIcon data-icon="inline-start" />保存为套装
      </Button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-black/60">
        <form onSubmit={(event) => { event.preventDefault(); save() }} className="flex flex-col gap-4">
          <h2 id={titleId} className="text-base font-semibold">保存为套装</h2>
          <p className="text-xs leading-6 text-muted-foreground">只保存套装名称、所有非空提示词及各自的生成比例。同名套装会更新为本次内容。</p>
          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-xs font-medium">套装名称</label>
            <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>取消</Button>
            <Button type="submit">保存套装</Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
