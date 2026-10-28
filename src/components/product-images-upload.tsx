"use client"
import { useRef } from "react"
import { ImagePlusIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { Button } from "./ui/button"
import { PasteZone } from "./paste-zone"
import { AssetPicker } from "./asset-picker"
import { MAX_PRODUCT_IMAGES, type ProductImagesManager } from "@/lib/use-product-images"

export function ProductImagesUpload({ manager, zoneKey, primaryAlt = "产品图" }: { manager: ProductImagesManager; zoneKey: string; primaryAlt?: string }) {
  const input = useRef<HTMLInputElement>(null), replacement = useRef<HTMLInputElement>(null), replaceId = useRef("")
  return <PasteZone zoneKey={zoneKey} className="w-full min-w-0" onImage={file => manager.addFiles([file])} onFiles={manager.addFiles}>
    <div className="flex flex-col gap-3" data-product-images>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-5 text-muted-foreground" title="支持拖拽、点击或悬停后粘贴；PNG/JPG/WEBP，单张≤10MB。第一张为主产品，其余为补充资料。">{manager.images.length}/4 张 · 首张为主产品</p><AssetPicker label="调用资产" onSelect={file => manager.addFiles([file])} disabled={manager.busy || manager.images.length >= MAX_PRODUCT_IMAGES} /></div>
      <div className="grid w-full grid-cols-2 gap-3" data-product-grid>
        {manager.images.map((image, index) => <div key={image.id} className="min-w-0 overflow-hidden rounded-lg border" data-product-index={index}>
          <div className="relative aspect-square max-h-56 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.dataUrl} alt={index === 0 ? primaryAlt : `产品补充图 ${index}`} draggable={false} className="size-full object-contain" />
            <span className={`absolute top-1.5 left-1.5 rounded px-1.5 py-1 text-xs ${index === 0 ? "bg-primary text-primary-foreground" : "bg-black/65 text-white"}`}>{index === 0 ? "主产品 · 图1" : `补充图 · 图${index + 1}`}</span>
            <div className="absolute right-1 bottom-1 flex gap-1 rounded bg-black/65 p-0.5 text-white"><Button type="button" variant="ghost" size="icon-xs" className="text-white hover:bg-white/20 hover:text-white" aria-label={`替换产品图 ${index + 1}`} onClick={() => { replaceId.current = image.id; replacement.current?.click() }}><RefreshCwIcon className="size-3" /></Button><Button type="button" variant="ghost" size="icon-xs" className="text-white hover:bg-white/20 hover:text-white" aria-label={`移除产品图 ${index + 1}`} onClick={() => manager.remove(image.id)}><XIcon className="size-3" /></Button></div>
          </div><div className="flex min-w-0 flex-wrap items-center justify-between gap-1 p-2"><p className="min-w-0 flex-1 truncate text-xs" title={image.name}>{image.name}</p>{index > 0 && <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => manager.makeMain(image.id)} aria-label={`设为主产品 ${image.name}`}>设为主产品</Button>}</div>
        </div>)}
        {manager.images.length < MAX_PRODUCT_IMAGES && <button type="button" data-product-drop-target disabled={manager.busy} onClick={() => input.current?.click()} className={`flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center text-muted-foreground hover:border-foreground/50 hover:text-foreground disabled:opacity-60 ${manager.images.length ? "aspect-square max-h-56 min-h-28" : "col-span-2 h-32 sm:h-36"}`}><ImagePlusIcon className="size-7" /><span className="text-sm font-medium">{manager.busy ? "正在添加…" : manager.images.length ? "添加产品补充图" : "上传主产品图"}</span><span className="text-xs">可拖入或选择最多4张</span></button>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="上传产品图片" className="hidden" onChange={e => { void manager.addFiles(Array.from(e.target.files || [])); e.target.value = "" }} />
      <input ref={replacement} type="file" accept="image/png,image/jpeg,image/webp" aria-label="替换产品图片" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void manager.replace(replaceId.current, file); e.target.value = "" }} />
    </div>
  </PasteZone>
}
