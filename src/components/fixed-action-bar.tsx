"use client"

import { useEffect, useRef, type ReactNode } from "react"

/** Viewport actions aligned to the current main column; the slot protects the final entry. */
export function FixedActionBar({ children, label = "生成操作" }: { children: ReactNode; label?: string }) {
  const slotRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const slot = slotRef.current, bar = barRef.current
    if (!slot || !bar) return
    const main = slot.closest("main")
    const update = () => {
      const box = slot.getBoundingClientRect()
      // Retained workspaces are hidden during navigation, and must not affect the visible page.
      if (!box.width) return
      bar.style.left = `${box.left}px`
      bar.style.width = `${box.width}px`
      const viewport = window.visualViewport
      bar.style.bottom = `${viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0}px`
      const height = Math.ceil(bar.getBoundingClientRect().height)
      slot.style.height = `${height + 16}px`
      main?.style.setProperty("--workspace-action-height", `${height}px`)
    }
    let frame = 0
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    observer.observe(slot)
    observer.observe(bar)
    window.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("scroll", schedule)
    update()
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("scroll", schedule)
      main?.style.removeProperty("--workspace-action-height")
    }
  }, [])
  return <div ref={slotRef} data-action-space className="w-full shrink-0">
    <div ref={barRef} data-fixed-actions role="region" aria-label={label} className="fixed-action-bar">
      {children}
    </div>
  </div>
}
