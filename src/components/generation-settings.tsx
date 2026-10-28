"use client"

import { Field, FieldLabel } from "./ui/field"
import { CustomRatioInput } from "./custom-ratio-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { ImageSizeHint } from "./image-size-hint"
import { COUNT_OPTIONS, QUALITY_LEVEL_OPTIONS, RATIO_OPTIONS, sizeFromRatioQuality, type QualityLevel } from "@/lib/visual-shared"

type Props = {
  label: string
  ratio: string
  quality: QualityLevel
  count: string
  customSize: string
  onRatioChange: (value: string) => void
  onQualityChange: (value: QualityLevel) => void
  onCountChange: (value: string) => void
  onCustomSizeChange: (value: string) => void
}

/** 四个入口共用比例与清晰度；customSize兼容旧像素，新输入为比例。 */
export function GenerationSettings(props: Props) {
  const selectClass = "h-9 data-[size=default]:h-9 w-full min-w-0 rounded-md px-3 font-mono text-xs"
  return <div data-generation-settings className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3">
    <Field className="col-span-2 min-w-0 gap-2">
      <FieldLabel className="whitespace-nowrap text-xs text-muted-foreground">输出比例</FieldLabel>
      <Select items={RATIO_OPTIONS} value={props.ratio} onValueChange={value => props.onRatioChange(value || "1:1")}>
        <SelectTrigger aria-label={`${props.label} 的输出比例`} className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>{RATIO_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    {props.ratio === "custom" && <Field className="col-span-2 min-w-0 gap-2">
      <FieldLabel className="whitespace-nowrap text-xs text-muted-foreground">自定义比例（宽 : 高）</FieldLabel>
      <CustomRatioInput label={props.label} value={props.customSize} onChange={props.onCustomSizeChange} />
    </Field>}
    <Field className="min-w-0 gap-2">
      <FieldLabel className="whitespace-nowrap text-xs text-muted-foreground">清晰度</FieldLabel>
      <Select items={QUALITY_LEVEL_OPTIONS} value={props.quality} onValueChange={value => props.onQualityChange(value === "1k" ? "1k" : "2k")}>
        <SelectTrigger aria-label={`${props.label} 的清晰度`} className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>{QUALITY_LEVEL_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <Field className="min-w-0 gap-2">
      <FieldLabel className="whitespace-nowrap text-xs text-muted-foreground">生成数量</FieldLabel>
      <Select items={COUNT_OPTIONS} value={props.count} onValueChange={value => props.onCountChange(value || "1")}>
        <SelectTrigger aria-label={`${props.label} 的生成数量`} className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>{COUNT_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <div className="col-span-2 min-w-0"><ImageSizeHint size={props.ratio === "custom" ? props.customSize : sizeFromRatioQuality(props.ratio, props.quality)} qualityLevel={props.quality} ratio={props.ratio} /></div>
  </div>
}
