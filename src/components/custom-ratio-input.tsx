"use client"

import { Input } from "./ui/input"
import { customRatioLabel, legacyOutputPixels } from "@/lib/output-ratio"

export function CustomRatioInput({ label, value, onChange, compact = false }: {
  label: string; value: string; onChange: (value: string) => void; compact?: boolean
}) {
  return <div className={compact ? "flex w-40 max-w-full flex-col gap-1" : "flex min-w-0 flex-col gap-1"}>
    <Input aria-label={`${label} 的自定义比例`} className={`${compact ? "h-8" : "h-9"} w-full min-w-0 px-3 font-mono text-xs`} maxLength={32} placeholder="例如：5:4 或 1:3" value={legacyOutputPixels(value) ? customRatioLabel(value) : value} onChange={event => onChange(event.target.value)} />
    {legacyOutputPixels(value) && <p className="text-xs leading-5 text-muted-foreground">已保留旧尺寸 {value}；编辑比例后按清晰度重新计算。</p>}
  </div>
}
