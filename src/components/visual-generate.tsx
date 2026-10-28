"use client"

import Link from "next/link"
import { useCallback } from "react"
import { ArrowLeftIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { GenerateQueuePanel } from "@/components/generate-queue-panel"
import { VisualSidebar } from "@/components/visual-sidebar"
import { ApiSetupNotice } from "./api-setup-notice"
import { GENERATE_ORIGINS, type GenerateOrigin } from "@/lib/generate-queue-store"

/** 生图模块页：集中查看/管理所有页面产生的生成队列（进度 + 任务卡 + 暂停/停止/重试/删除） */
export function VisualGenerate({ origin, onRunningCountChange }: { origin: GenerateOrigin; onRunningCountChange?: (origin: GenerateOrigin, count: number) => void }) {
  const reportRunning = useCallback((count: number) => onRunningCountChange?.(origin, count), [origin, onRunningCountChange])
  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 p-4 md:p-6 lg:flex-row">
      {/* 左侧导航栏 */}
      <VisualSidebar current="generate" generateOrigin={origin} />
      <main data-generation-view={origin} className="flex min-w-0 flex-1 flex-col gap-4">
        {/* 顶部 */}
        <header className="flex flex-col gap-3 rounded-xl border bg-card/70 p-4 sm:p-5">
          <Link href={origin} className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" />
            返回{GENERATE_ORIGINS[origin]} · 输入/编辑
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">生图任务</h1>
            <Badge variant="secondary">{GENERATE_ORIGINS[origin]}</Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            默认显示{GENERATE_ORIGINS[origin]}当前清单：只重新生成启用条目，未启用结果保留。全新清单单独统计，历史批次可切换查看。各栏目独立运行；站内切换继续接收，刷新或关闭不会自动重发。
          </p>
        </header>
        <ApiSetupNotice analysis={false} />

        <GenerateQueuePanel
          origin={origin}
          onRunningCountChange={reportRunning}
          emptyHint={
            <>
              本栏目暂无生成任务。返回 <Link href={origin} className="underline">{GENERATE_ORIGINS[origin]} · 输入/编辑</Link> 提交任务，结果只保存在本栏目。
            </>
          }
        />
      </main>
    </div>
  )
}
