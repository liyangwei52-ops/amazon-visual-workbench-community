"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { FolderOpenIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { listSuites, SUITES_CHANGED_EVENT, type SavedSuite } from "@/lib/suite-store"
import { suiteHref } from "@/lib/suite-navigation"

export function LoadSuitePanel({ onLoad, disabled = false }: { onLoad: (suite: SavedSuite) => void; disabled?: boolean }) {
  const pathname = usePathname()
  const [suites, setSuites] = useState<SavedSuite[]>([])
  const [selected, setSelected] = useState("")
  const selectId = useId()
  useEffect(() => {
    const refresh = () => setSuites(listSuites())
    refresh()
    window.addEventListener("storage", refresh)
    window.addEventListener("focus", refresh)
    window.addEventListener(SUITES_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener("storage", refresh)
      window.removeEventListener("focus", refresh)
      window.removeEventListener(SUITES_CHANGED_EVENT, refresh)
    }
  }, [])
  const activeId = suites.some((suite) => suite.id === selected) ? selected : suites[0]?.id || ""
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">调用已保存提示词</CardTitle>
        <CardDescription className="text-xs leading-5">整套替换当前提示词和对应比例，逐条填入提示词框。当前产品图、产品信息与生图模式保持不变。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">已保存提示词套装</label>
        <select id={selectId} value={activeId} disabled={disabled || !suites.length} onChange={(event) => setSelected(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-48">
          {!suites.length && <option value="">暂无已保存套装</option>}
          {suites.map((suite) => <option key={suite.id} value={suite.id}>{suite.name}（{suite.entries.length} 条）</option>)}
        </select>
        <Button type="button" size="sm" disabled={disabled || !activeId} onClick={() => {
          const suite = listSuites().find((item) => item.id === activeId)
          if (!suite || !suite.entries.length) { toast.error("此套装为空或已删除，请重新选择"); setSuites(listSuites()); return }
          onLoad(suite)
        }}><FolderOpenIcon className="size-4" />载入提示词</Button>
        <Link href={suiteHref(pathname)} className="inline-flex h-8 items-center rounded-md border px-3 text-xs text-muted-foreground hover:text-foreground">管理套装</Link>
      </CardContent>
    </Card>
  )
}
