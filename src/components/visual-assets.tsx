"use client"
import { taskAssetId } from "@/lib/generation-selection"
import { useRef, useState } from "react"
import { DownloadIcon, FolderOpenIcon, ImagePlusIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { VisualSidebar } from "./visual-sidebar"
import { PasteZone } from "./paste-zone"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useAssets } from "@/lib/use-assets"
import { ASSET_LABELS, deleteAsset, downloadBlob, formatBytes, getAssetBlob, renameAsset, saveAsset, type AssetKind, type ImageAsset } from "@/lib/asset-store"
import { validateUpload } from "@/lib/visual-shared"
import { hydrateTaskResults, readGenerateQueue } from "@/lib/generate-queue-store"

export function VisualAssets() {
  const { assets, loading, error } = useAssets()
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<AssetKind | "all">("all")
  const [uploadKind, setUploadKind] = useState<AssetKind>("product")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<ImageAsset | null>(null)
  const [preview, setPreview] = useState("")
  const [name, setName] = useState("")
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const shown = assets.filter(a => (kind === "all" || kind === a.kind) && a.name.toLowerCase().includes(query.toLowerCase()))
  const upload = async (files: File[]) => {
    if (busy || !files.length) return
    setBusy(true); let count = 0
    for (const file of files) {
      try { const invalid = validateUpload(file); if (invalid) throw new Error(invalid); await saveAsset(file, { name: file.name, kind: uploadKind }); count++ }
      catch (e) { toast.error(`${file.name}：${e instanceof Error ? e.message : "保存失败"}`) }
    }
    if (count) toast.success(`已保存 ${count} 张图片到资产中心`)
    setBusy(false)
  }
  const close = () => { dialog.current?.close(); if (preview) URL.revokeObjectURL(preview); setPreview(""); setSelected(null) }
  const open = async (asset: ImageAsset) => {
    try { const url = URL.createObjectURL(await getAssetBlob(asset.id)); if (preview) URL.revokeObjectURL(preview); setPreview(url); setSelected(asset); setName(asset.name); dialog.current?.showModal() }
    catch (e) { toast.error(e instanceof Error ? e.message : "打开图片失败") }
  }
  const download = async (asset: ImageAsset) => {
    try { downloadBlob(await getAssetBlob(asset.id), asset.name) } catch (e) { toast.error(e instanceof Error ? e.message : "下载失败") }
  }
  const backup = async () => {
    setBusy(true)
    try {
      const { default: JSZip } = await import("jszip"), zip = new JSZip()
      for (const asset of assets) {
        const ext = asset.mime === "image/jpeg" ? "jpg" : asset.mime === "image/webp" ? "webp" : "png"
        zip.file(`images/${asset.id}.${ext}`, await getAssetBlob(asset.id))
      }
      zip.file("assets.json", JSON.stringify(assets.map(asset => ({ ...asset, thumbnail: undefined })), null, 2))
      const blob = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(blob), anchor = document.createElement("a")
      anchor.href = url; anchor.download = `图片资产备份-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success("资产备份已导出")
    } catch { toast.error("备份失败，请尝试逐张下载图片") } finally { setBusy(false) }
  }
  const importResults = async () => {
    setBusy(true); let count = 0
    try {
      for (const task of await hydrateTaskResults(readGenerateQueue())) {
        for (const [index, src] of task.resultUrls.entries()) {
          if (!src) continue
          const id = taskAssetId(task, index)
          if (assets.some(a => a.id === id)) continue
          const response = await fetch(src)
          if (!response.ok) throw new Error("原图读取失败")
          await saveAsset(await response.blob(), { id, name: `${task.label || "生成图片"} 第${index + 1}张`, kind: "generated", prompt: task.prompt, model: task.requestInfo?.model }); count++
        }
      }
      toast.success(count ? `已导入 ${count} 张已有生成结果` : "当前任务没有可新增的生成图片")
    } catch { toast.error(`已导入 ${count} 张，其余图片导入失败；已成功的图片会保留`) }
    finally { setBusy(false) }
  }
  return <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 px-4 py-6 lg:flex-row">
    <VisualSidebar current="assets" />
    <main className="flex min-w-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
        <div><h1 className="flex items-center gap-2 text-xl font-semibold"><FolderOpenIcon className="size-5" />资产中心</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">集中管理产品图、参考图和生成图片，在工作台直接调用。当前保存在此浏览器，清除网站数据会删除图片，请定期下载备份。</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void importResults()}>导入已有生成结果</Button><Button type="button" variant="outline" disabled={busy || !assets.length} onClick={() => void backup()}><DownloadIcon className="size-4" />导出图片备份</Button></div>
      </header>
      <PasteZone zoneKey="asset-upload" onImage={file => upload([file])} onFiles={upload}>
        <section className="rounded-xl border border-dashed bg-card p-5" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)) }}>
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-sm font-medium">添加图片资产</h2><p className="mt-1 text-xs text-muted-foreground">支持多张上传、拖入或悬停后粘贴；PNG / JPG / WEBP，单张≤10MB，保留原图。</p></div><div className="flex flex-wrap items-center gap-2">
            <select aria-label="上传图片分类" value={uploadKind} onChange={e => setUploadKind(e.target.value as AssetKind)} className="h-9 rounded-md border bg-background px-3 text-xs">{Object.entries(ASSET_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <Button type="button" disabled={busy} onClick={() => input.current?.click()}><ImagePlusIcon className="size-4" />{busy ? "处理中…" : "上传图片"}</Button>
            <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="上传资产图片" onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = "" }} />
          </div></div>
        </section>
      </PasteZone>
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1" aria-label="资产分类">{(["all", "product", "reference", "generated"] as const).map(value => <Button key={value} type="button" size="sm" variant={kind === value ? "secondary" : "ghost"} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "all" ? "全部图片" : ASSET_LABELS[value]} <span className="text-muted-foreground">{assets.filter(a => value === "all" || a.kind === value).length}</span></Button>)}</div><Input aria-label="搜索图片" className="w-full sm:w-64" placeholder="搜索图片名称…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">共 {assets.length} 张 · {formatBytes(assets.reduce((sum, a) => sum + a.bytes, 0))} · 显示 {shown.length} 张</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading ? <p className="py-16 text-center text-sm text-muted-foreground">读取图片中…</p> : shown.length === 0 ? <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground"><FolderOpenIcon className="size-9" /><p className="text-sm">{assets.length ? "没有匹配的图片，试试其他名称或分类" : "还没有图片资产"}</p><p className="text-xs">上传产品图和参考图，后续生成的图片也会自动保存到这里。</p></div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {shown.map(asset => <article key={asset.id} data-asset-id={asset.id} className="min-w-0 overflow-hidden rounded-lg border bg-background">
            <button type="button" className="block w-full" onClick={() => void open(asset)} aria-label={`预览 ${asset.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.thumbnail} alt={asset.name} loading="lazy" className="aspect-square w-full bg-white object-contain" />
            </button><div className="flex flex-col gap-2 p-3"><p className="truncate text-xs font-medium" title={asset.name}>{asset.name}</p><p className="text-xs text-muted-foreground">{ASSET_LABELS[asset.kind]} · {asset.width}×{asset.height}<br />{formatBytes(asset.bytes)}</p><div className="flex items-center justify-between gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label={`编辑 ${asset.name}`} onClick={() => void open(asset)}><PencilIcon className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`下载 ${asset.name}`} onClick={() => void download(asset)}><DownloadIcon className="size-3.5" /></Button></div></div>
          </article>)}
        </div>}
      </section>
    </main>
    <dialog ref={dialog} aria-label="图片详情" onCancel={e => { e.preventDefault(); close() }} className="m-auto max-h-[90dvh] w-[min(1000px,calc(100%-2rem))] overflow-y-auto rounded-xl border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/70">
      {selected && <><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">图片详情</h2><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭图片详情" onClick={close}><XIcon /></Button></div><div className="grid min-w-0 gap-5 md:grid-cols-[1.5fr_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt={selected.name} className="max-h-[65dvh] w-full rounded-lg bg-white object-contain" />
        <div className="flex min-w-0 flex-col gap-4"><label className="flex flex-col gap-2 text-xs">图片名称<Input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label><p className="text-xs leading-6 text-muted-foreground">{ASSET_LABELS[selected.kind]} · {selected.width}×{selected.height}<br />{formatBytes(selected.bytes)} · {new Date(selected.createdAt).toLocaleString("zh-CN")}{selected.model && <><br />模型：{selected.model}</>}</p>
          {selected.prompt && <details className="text-xs"><summary className="cursor-pointer">查看完整生成提示词</summary><p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border p-3 leading-5">{selected.prompt}</p></details>}
          <Button type="button" onClick={async () => { try { await renameAsset(selected.id, name); setSelected({ ...selected, name: name.trim() }); toast.success("名称已保存") } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败") } }}>保存名称</Button><Button type="button" variant="outline" onClick={() => void download(selected)}><DownloadIcon className="size-4" />下载原图</Button>
          <Button type="button" variant="outline" className="mt-3 text-destructive" onClick={async () => { if (!window.confirm(`删除「${selected.name}」？资产中心中的原图将被移除，已载入页面的图片不受影响。`)) return; try { await deleteAsset(selected.id); close(); toast.success("图片已删除") } catch { toast.error("删除失败，请重试") } }}><Trash2Icon className="size-4" />删除图片</Button>
        </div>
      </div></>}
    </dialog>
  </div>
}
