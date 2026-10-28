"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

/**
 * 全局剪贴板粘贴区：
 * - 把某个上传区域包进 <PasteZone zoneKey="product" onImage={handler}>，
 *   鼠标悬停在该区域时按 Ctrl+V（Cmd+V），剪贴板里的图片会自动当作文件上传。
 * - 所有粘贴区共享一个 window paste 监听（首个注册时安装），
 *   通过鼠标悬停状态判断粘贴目标，互不干扰。
 */

type Zone = { el: HTMLElement; accept: (files: File[]) => void }

const zones = new Map<string, Zone>()
let hoveredZone: string | null = null
let listenerInstalled = false

function installPasteListener() {
  if (listenerInstalled) return
  listenerInstalled = true
  window.addEventListener("paste", (event) => {
    if (hoveredZone == null) return
    const zone = zones.get(hoveredZone)
    if (!zone || !zone.el.isConnected) return
    const items = event.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (!files.length) return
    event.preventDefault()
    zone.accept(files)
  })
  window.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault() })
  window.addEventListener("drop", event => {
    if (!event.defaultPrevented && event.dataTransfer?.files.length) { event.preventDefault(); toast.error("请把文件拖到产品图或参考图上传区域") }
  })
}

export function PasteZone({
  zoneKey,
  onImage,
  onFiles,
  className,
  children,
}: {
  zoneKey: string
  onImage: (file: File) => void | Promise<void>
  onFiles?: (files: File[]) => void | Promise<void>
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pending = useRef(Promise.resolve())
  const [dragging, setDragging] = useState(false)
  const accept = useCallback((files: File[]) => {
    pending.current = pending.current.then(async () => {
      if (onFiles) await onFiles(files)
      else for (const file of files) await onImage(file)
    }).catch(error => { toast.error(error instanceof Error ? error.message : "图片上传失败，请重试") })
  }, [onFiles, onImage])
  useEffect(() => {
    installPasteListener()
    const el = ref.current
    if (!el) return
    zones.set(zoneKey, { el, accept })
    return () => {
      zones.delete(zoneKey)
    }
  }, [zoneKey, accept])

  const handleMouseEnter = useCallback(() => {
    hoveredZone = zoneKey
  }, [zoneKey])

  const handleMouseLeave = useCallback(() => {
    if (hoveredZone === zoneKey) hoveredZone = null
  }, [zoneKey])

  return (
    <div
      ref={ref}
      className={`${className || ""} ${dragging ? "rounded-lg outline-2 outline-offset-2 outline-primary bg-primary/5" : ""}`}
      data-upload-zone={zoneKey}
      data-dragging={dragging || undefined}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes("Files")) return
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setDragging(true)
      }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
      onDrop={event => {
        if (event.defaultPrevented) { setDragging(false); return }
        if (!event.dataTransfer.files.length) return
        event.preventDefault(); event.stopPropagation(); setDragging(false); accept(Array.from(event.dataTransfer.files))
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}
