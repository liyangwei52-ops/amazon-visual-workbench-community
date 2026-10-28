"use client"

import { SparklesIcon } from "lucide-react"
import { Button } from "./ui/button"
import type { SelectionAction } from "@/lib/generation-selection"
import { useApiStatus } from "@/lib/use-api-status"

export function SelectionActions({ onSelect, disabled = false }: { onSelect: (action: SelectionAction) => void; disabled?: boolean }) {
  return <div className="flex flex-wrap items-center gap-1" data-selection-actions>
    {([["all", "全选"], ["none", "全不选"], ["invert", "反选"]] as const).map(([action, label]) =>
      <Button key={action} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onSelect(action)}>{label}</Button>)}
  </div>
}

export function ResultSelection({ checked, mixed = false, disabled = false, label, text = "选择", onChange }: {
  checked: boolean; mixed?: boolean; disabled?: boolean; label: string; text?: string; onChange: (checked: boolean) => void
}) {
  return <label className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
    <input type="checkbox" aria-label={label} aria-checked={mixed ? "mixed" : checked} ref={element => { if (element) element.indeterminate = mixed }} checked={checked} disabled={disabled} className="size-3.5 accent-primary" onChange={event => onChange(event.target.checked)} />{text}
  </label>
}

export function EntryEnabled({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
    <input type="checkbox" aria-label={label} className="size-4 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />启用
  </label>
}

export function BatchGenerateButton({ count, images, onClick, disabled = false, disabledReason }: { count: number; images: number; onClick: () => void; disabled?: boolean; disabledReason?: string }) {
  const { loaded, imageReady } = useApiStatus()
  const reason = loaded && !imageReady ? "先点击页面上方「去配置 API」，保存生图 Key 和模型。" : disabledReason || (disabled ? "请等待当前操作完成" : count === 0 ? "启用并填写提示词后即可生成，也可先载入已保存套装。" : "")
  return <div className="flex w-full flex-col gap-2 sm:w-auto" data-batch-generation>
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">共 {images} 张</span>
      <Button type="button" className="primary-action h-11 flex-1 px-5 text-sm font-semibold sm:flex-none" onClick={onClick} disabled={!loaded || !imageReady || disabled || count === 0} title={reason || undefined}><SparklesIcon data-icon="inline-start" />生成 {count} 条</Button>
    </div>
    {reason && <p className="max-w-md text-xs leading-5 text-muted-foreground" data-generation-guidance>{reason}</p>}
  </div>
}
