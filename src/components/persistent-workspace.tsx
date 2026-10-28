"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useState } from "react"
import { GENERATE_ORIGINS, generateHref, generateOriginFromParam, type GenerateOrigin } from "@/lib/generate-queue-store"
import { useGenerationNavigation } from "@/lib/use-generation-navigation"
import { VisualWorkbench } from "./visual-workbench"
import { VisualGenerate } from "./visual-generate"
import { VisualPlanner } from "./visual-planner"
import { VisualRemix } from "./visual-remix"

/** 每栏目一个常驻执行器；切换查询参数只切换可见性。 */
function PersistentGenerations({ pathname }: { pathname: string }) {
  const params = useSearchParams()
  const generation = useGenerationNavigation()
  const activeOrigin = generateOriginFromParam(params.get("source"), generation.origin)
  const [visited, setVisited] = useState<GenerateOrigin[]>([])
  const [counts, setCounts] = useState<Partial<Record<GenerateOrigin, number>>>({})
  const required = [...generation.sources.map(source => source.origin), ...(pathname === "/generate" ? [activeOrigin] : [])]
  const missing = [...new Set(required)].filter(origin => !visited.includes(origin))
  if (missing.length) setVisited([...visited, ...missing])
  const updateCount = useCallback((origin: GenerateOrigin, count: number) => {
    setCounts(previous => previous[origin] === count ? previous : { ...previous, [origin]: count })
  }, [setCounts])
  const hiddenRunning = visited.filter(origin => (counts[origin] || 0) > 0 && (pathname !== "/generate" || origin !== activeOrigin))
  return <>
    {hiddenRunning.length > 0 && <aside aria-live="polite" data-running-notice className="mx-4 mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg border bg-card px-4 py-2 text-xs">
      <span className="text-muted-foreground">其他栏目继续接收生图结果</span>
      {hiddenRunning.map(origin => <Link key={origin} href={generateHref(origin)} className="underline underline-offset-4">{GENERATE_ORIGINS[origin]} · {counts[origin]} 个任务</Link>)}
    </aside>}
    {visited.map(origin => {
      const hidden = pathname !== "/generate" || origin !== activeOrigin
      return <div key={origin} hidden={hidden} inert={hidden} data-persistent-generate={origin}>
        <VisualGenerate origin={origin} onRunningCountChange={updateCount} />
      </div>
    })}
  </>
}

/** 根布局保留已访问的请求页面，站内导航只切换可见性，不卸载正在收取结果的组件。 */
export function PersistentWorkspace() {
  const pathname = usePathname()
  const [visited, setVisited] = useState({ workbench: pathname === "/", planner: pathname === "/planner", remix: pathname === "/remix" })
  const [analysisCount, setAnalysisCount] = useState(0)
  const [plannerRunning, setPlannerRunning] = useState(false)
  const [remixRunning, setRemixRunning] = useState(false)
  if (pathname === "/" && !visited.workbench) setVisited({ ...visited, workbench: true })
  if (pathname === "/planner" && !visited.planner) setVisited({ ...visited, planner: true })
  if (pathname === "/remix" && !visited.remix) setVisited({ ...visited, remix: true })
  const hiddenAnalysis = pathname !== "/" && analysisCount > 0
  const hiddenPlanning = pathname !== "/planner" && plannerRunning
  const hiddenRemix = pathname !== "/remix" && remixRunning
  return <>
    {(hiddenAnalysis || hiddenPlanning || hiddenRemix) && <aside aria-live="polite" data-running-notice className="mx-4 mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg border bg-card px-4 py-2 text-xs">
      <span className="text-muted-foreground">请求继续接收中，返回原页面查看结果</span>
      {hiddenAnalysis && <Link href="/" className="underline underline-offset-4">提示词分析 {analysisCount} 路 · 返回工作台</Link>}
      {hiddenPlanning && <Link href="/planner" data-planner-running-link className="underline underline-offset-4">一键策划进行中 · 返回查看</Link>}
      {hiddenRemix && <Link href="/remix" data-remix-running-link className="underline underline-offset-4">提示词迁移进行中 · 返回查看</Link>}
    </aside>}
    {visited.workbench && <div hidden={pathname !== "/"} inert={pathname !== "/"} data-persistent-workbench><VisualWorkbench onAnalysisCountChange={setAnalysisCount} /></div>}
    {visited.planner && <div hidden={pathname !== "/planner"} inert={pathname !== "/planner"} data-persistent-planner><VisualPlanner onPlanningChange={setPlannerRunning} /></div>}
    {visited.remix && <div hidden={pathname !== "/remix"} inert={pathname !== "/remix"} data-persistent-remix><VisualRemix onRewritingChange={setRemixRunning} /></div>}
    <Suspense fallback={null}><PersistentGenerations pathname={pathname} /></Suspense>
  </>
}
