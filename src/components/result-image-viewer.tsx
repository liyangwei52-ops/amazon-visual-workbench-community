"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ExternalLinkIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react"
import { Button, buttonVariants } from "./ui/button"

// Opened local originals must remain readable after the dialog closes. The browser
// releases these URLs when the document ends; reopening the same image reuses one URL.
const openedOriginals = new Map<string, string>()
const rasterTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif", "image/bmp"])

export function ResultImageViewer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [zoom, setZoom] = useState<number | null>(null)
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [original, setOriginal] = useState({ href: "", error: "" })
  const remote = /^https?:\/\//i.test(src)
  const href = remote ? src : original.href

  useEffect(() => {
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    element?.showModal()
    const close = () => element?.close()
    window.addEventListener("popstate", close)
    return () => { window.removeEventListener("popstate", close); element?.close(); document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (remote) return
    let active = true
    let created = ""
    const controller = new AbortController()
    void (async () => {
      const retained = openedOriginals.get(src)
      if (retained) { if (active) setOriginal({ href: retained, error: "" }); return }
      const response = await fetch(src, { signal: controller.signal })
      if (!response.ok) throw new Error("无法读取原图，请重新打开后再试")
      const blob = await response.blob()
      if (!rasterTypes.has(blob.type.toLowerCase())) throw new Error("此图片格式暂不支持新标签页查看")
      if (!active) return
      created = URL.createObjectURL(blob)
      setOriginal({ href: created, error: "" })
    })().catch(error => { if (active) setOriginal({ href: "", error: error instanceof Error ? error.message : "原图读取失败" }) })
    return () => {
      active = false
      controller.abort()
      if (created && openedOriginals.get(src) !== created) URL.revokeObjectURL(created)
    }
  }, [src, remote])

  const retain = () => { if (!remote && href) openedOriginals.set(src, href) }
  const fitScale = natural.width > 0 && viewport.width > 0 ? Math.min(1, viewport.width / natural.width, viewport.height / natural.height) : 1
  const stepZoom = (step: number) => setZoom(current => Math.min(4, Math.max(0.25, (current ?? fitScale) + step)))
  const displayWidth = natural.width * (zoom ?? fitScale)
  const displayHeight = natural.height * (zoom ?? fitScale)
  const zoomed = zoom !== null && natural.width > 0

  return <dialog ref={dialog} aria-labelledby={titleId} data-result-image-viewer onClose={onClose} className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/80">
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-5">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><h2 id={titleId} className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{natural.width > 0 ? `${natural.width} × ${natural.height} 像素 · 原图` : "正在载入原图…"}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => dialog.current?.close()}><XIcon className="size-4" />关闭大图</Button>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2" role="toolbar" aria-label="原图查看操作">
        <Button type="button" variant="outline" size="icon-sm" aria-label="缩小原图" disabled={!natural.width || zoom === 0.25} onClick={() => stepZoom(-0.25)}><MinusIcon /></Button>
        <span className="min-w-16 text-center font-mono text-xs" data-image-zoom aria-live="polite">{zoom === null ? "适应窗口" : `${Math.round(zoom * 100)}%`}</span>
        <Button type="button" variant="outline" size="icon-sm" aria-label="放大原图" disabled={!natural.width || zoom === 4} onClick={() => stepZoom(0.25)}><PlusIcon /></Button>
        <Button type="button" variant="outline" size="sm" disabled={!natural.width} onClick={() => setZoom(1)}>100% 原始尺寸</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setZoom(null)}>适应窗口</Button>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" onPointerDown={retain} onClick={retain} onAuxClick={retain} onContextMenu={retain} className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLinkIcon className="size-4" />新标签页打开原图</a> : <Button type="button" variant="outline" size="sm" disabled>{original.error ? "原图链接不可用" : "正在准备原图…"}</Button>}
      </div>
      {original.error && <p className="shrink-0 text-sm text-amber-300" role="alert">{original.error}。当前仍显示返回的图片，可关闭后重开。</p>}
      <div ref={viewportRef} data-image-viewport className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-lg bg-muted/30">
        <div className="grid min-h-full min-w-full place-items-center" style={{ width: displayWidth || "100%", height: displayHeight || "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-original-image src={href || src} alt={`${title}原图`} draggable={false} className={zoomed ? "cursor-zoom-out" : "cursor-zoom-in"} style={{ width: displayWidth || undefined, height: displayHeight || undefined, maxWidth: "none", maxHeight: "none" }} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onClick={() => setZoom(current => current === null ? 1 : null)} onContextMenu={retain} />
        </div>
      </div>
      <p className="shrink-0 text-xs leading-5 text-muted-foreground">点击图片切换原始尺寸与适应窗口；放大后可滚动查看细节，按 Esc 返回。新标签页使用同一张原图。</p>
    </div>
  </dialog>
}
