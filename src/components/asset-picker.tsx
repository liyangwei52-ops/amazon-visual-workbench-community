"use client"
import { useRef, useState } from "react"
import Link from "next/link"
import { FolderOpenIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useAssets } from "@/lib/use-assets"
import { ASSET_LABELS, getAssetBlob, type ImageAsset } from "@/lib/asset-store"
import { compressUploadImage } from "@/lib/visual-shared"

export function AssetPicker({ onSelect, label = "从资产中心选择", disabled = false }: { onSelect: (file: File) => void | Promise<void>; label?: string; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const { assets, loading, error } = useAssets(open)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const select = async (asset: ImageAsset) => {
    setBusy(true)
    try {
      const file = new File([await getAssetBlob(asset.id)], asset.name, { type: asset.mime })
      // 资产保留原图，调用时按现有上传规则处理，避免大幅生成图超过模型输入限制。
      const prepared = await compressUploadImage(file)
      await onSelect(prepared.file); dialog.current?.close()
    } catch (e) { toast.error(e instanceof Error ? e.message : "图片调用失败") }
    finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant="outline" size="sm" className="h-8 w-fit max-w-full text-xs" disabled={disabled} onClick={() => { setOpen(true); dialog.current?.showModal() }}><FolderOpenIcon className="size-3.5" />{label}</Button>
    <dialog ref={dialog} onClose={() => setOpen(false)} aria-label="选择资产图片" className="m-auto max-h-[85dvh] w-[min(900px,calc(100%-2rem))] overflow-y-auto rounded-xl border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/70" onClick={e => { if (e.target === e.currentTarget && !busy) dialog.current?.close() }}>
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">选择资产图片</h2><p className="mt-1 text-xs text-muted-foreground">点击图片载入当前页面，原图保留在资产中心。</p></div><Button type="button" size="icon-sm" variant="ghost" aria-label="关闭资产选择" disabled={busy} onClick={() => dialog.current?.close()}><XIcon /></Button></div>
      <Input aria-label="搜索资产图片" placeholder="搜索图片名称…" value={query} onChange={e => setQuery(e.target.value)} className="mb-4" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm">读取中…</p> : assets.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">暂无资产图片。<Link href="/assets" className="ml-1 underline">前往资产中心上传</Link></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {assets.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).map(asset => <button key={asset.id} type="button" disabled={busy} onClick={() => void select(asset)} className="min-w-0 rounded-lg border p-2 text-left hover:border-foreground/50 disabled:opacity-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.thumbnail} alt={asset.name} className="mb-2 aspect-square w-full rounded bg-white object-contain" /><p className="truncate text-xs">{asset.name}</p><p className="mt-1 text-xs text-muted-foreground">{ASSET_LABELS[asset.kind]} · {asset.width}×{asset.height}</p>
        </button>)}
      </div>}
      {busy && <p role="status" className="mt-3 text-xs">正在载入图片…</p>}
    </dialog>
  </>
}
