"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { BrainCircuitIcon, FolderOpenIcon, ImageIcon, LayersIcon, ListChecksIcon, MenuIcon, Settings2Icon, UserRoundIcon, WandSparklesIcon } from "lucide-react"
import { defaultProfile, PROFILE_EVENT, PROFILE_KEY, readProfile } from "@/lib/profile-store"
import { useGenerationNavigation } from "@/lib/use-generation-navigation"
import { generateHref, type GenerateOrigin } from "@/lib/generate-queue-store"
import { suiteHref } from "@/lib/suite-navigation"

type PageKey = "workbench" | "remix" | "suite" | "generate" | "simple" | "planner" | "settings" | "assets" | "profile"

const items = [
  { key: "settings", label: "API 设置", href: "/settings", icon: Settings2Icon },
  { key: "workbench", label: "视觉工作台", href: "/", icon: LayersIcon },
  { key: "remix", label: "提示词迁移", href: "/remix", icon: WandSparklesIcon },
  { key: "planner", label: "一键策划", href: "/planner", icon: BrainCircuitIcon },
  { key: "simple", label: "极简图文生图", href: "/simple", icon: ImageIcon },
  { key: "suite", label: "保存套装", href: "/suite", icon: ListChecksIcon },
  { key: "assets", label: "资产中心", href: "/assets", icon: FolderOpenIcon },
] as const

function NavigationItems({ current, generation, generateOrigin }: { current: PageKey; generation: ReturnType<typeof useGenerationNavigation>; generateOrigin?: GenerateOrigin }) {
  const suiteSource = current === "generate" ? generateHref(generateOrigin || generation.origin) : current === "profile" ? "/profile" : items.find(item => item.key === current)?.href || "/"
  return (
    <nav aria-label="主要页面" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon
        const source = generation.sources.find(source => source.origin === item.href)
        const ownsTasks = Boolean(source)
        const active = item.key === current || (current === "generate" && item.href === generateOrigin)
        return (
          <div key={item.key} className="flex min-w-0 flex-col gap-1">
          <Link
            data-nav-key={item.key}
            href={item.key === "suite" && current !== "suite" ? suiteHref(suiteSource) : ownsTasks ? generateHref(source!.origin) : item.href}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs leading-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              active
                ? "border-primary/40 bg-foreground/10 font-semibold text-foreground shadow-sm ring-1 ring-primary/20"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
            <Icon className={active ? "size-[18px] shrink-0 text-primary" : "size-4 shrink-0"} />
            <span className="min-w-0 flex-1">{item.label}</span>
            {ownsTasks && <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-normal">{source?.running ? "生图中" : source?.queued ? "待执行" : "结果"}</span>}
          </Link>
          {ownsTasks && <div className="ml-7 flex flex-wrap gap-x-3 gap-y-1 pb-1 text-[10px] text-muted-foreground">
            <Link href={item.href} data-generation-input={item.href} className={`rounded px-1 py-0.5 hover:bg-muted hover:text-foreground ${current === item.key ? "bg-muted text-foreground" : ""}`}>输入/编辑</Link>
            <Link href={generateHref(source!.origin)} data-generation-results={item.href} className={`rounded px-1 py-0.5 hover:bg-muted hover:text-foreground ${current === "generate" && item.href === generateOrigin ? "bg-muted text-foreground" : ""}`}>生成结果</Link>
          </div>}
          </div>
        )
      })}
      <Link href="/profile" aria-current={current === "profile" ? "page" : undefined} className="inline-flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted/70 lg:hidden"><UserRoundIcon className="size-4" />个人中心</Link>
    </nav>
  )
}

/** 移动端为可展开的顶部导航，桌面端为固定宽度侧栏。 */
export function VisualSidebar({ current, generateOrigin }: { current: PageKey; generateOrigin?: GenerateOrigin }) {
  const generation = useGenerationNavigation()
  const sourceLabel = items.find(item => item.href === (generateOrigin || generation.origin))?.label
  const currentLabel = current === "generate" ? generation.hasTasks ? `${sourceLabel} · 生图任务` : "生图任务" : current === "profile" ? "个人中心" : items.find((item) => item.key === current)?.label
  const [profile, setProfile] = useState(defaultProfile)
  useEffect(() => {
    const update = () => setProfile(readProfile())
    update()
    const storage = (event: StorageEvent) => { if (event.key === PROFILE_KEY) update() }
    window.addEventListener(PROFILE_EVENT, update); window.addEventListener("storage", storage)
    return () => { window.removeEventListener(PROFILE_EVENT, update); window.removeEventListener("storage", storage) }
  }, [])

  return (
    <>
      <details className="group w-full rounded-xl border bg-card/95 shadow-sm lg:hidden">
        <summary className="flex min-h-12 list-none items-center justify-between gap-3 px-4 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <MenuIcon className="size-4 shrink-0" />
            <span className="truncate">{currentLabel}</span>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground group-open:hidden">切换页面</span>
          <span className="hidden shrink-0 text-[11px] text-muted-foreground group-open:inline">收起</span>
        </summary>
        <div className="border-t px-3 py-3">
          <NavigationItems current={current} generation={generation} generateOrigin={generateOrigin} />
        </div>
      </details>
      <aside className="sticky top-6 hidden h-fit w-52 shrink-0 flex-col gap-3 rounded-xl border bg-card/95 p-3 shadow-sm lg:flex">
        <Link href="/profile" aria-label="打开个人中心" aria-current={current === "profile" ? "page" : undefined} className={`flex min-w-0 items-center gap-2 rounded-md border-b px-1 pt-1 pb-3 hover:bg-muted/50 ${current === "profile" ? "bg-foreground/5" : ""}`}>
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">{profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt="个人头像" className="size-full object-cover" />
          ) : <UserRoundIcon className="size-4" />}</span>
          <span className="flex min-w-0 flex-col gap-1"><span className="text-[10px] font-semibold leading-4">Amazon 电商视觉工作台</span><span className="truncate text-[11px] text-muted-foreground">{profile.name} · 个人中心</span></span>
        </Link>
        <NavigationItems current={current} generation={generation} generateOrigin={generateOrigin} />
        {current === "generate" && <p className="border-t px-2 pt-3 text-[11px] leading-5 text-muted-foreground">当前：{currentLabel}</p>}
      </aside>
    </>
  )
}
