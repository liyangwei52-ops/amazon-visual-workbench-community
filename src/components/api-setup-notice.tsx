"use client"
import Link from "next/link"
import { KeyRoundIcon } from "lucide-react"
import { useApiStatus } from "@/lib/use-api-status"

export function ApiSetupNotice({ analysis = true }: { analysis?: boolean }) {
  const status = useApiStatus()
  const missing = [analysis && !status.analysisReady ? "分析" : "", !status.imageReady ? "生图" : ""].filter(Boolean).join("、")
  if (!status.loaded || !missing) return null
  return <aside data-api-setup role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/40 bg-sky-400/10 p-4">
    <div className="flex min-w-0 items-start gap-2.5"><KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-sky-300" /><div className="space-y-1">
      <p className="text-sm font-medium">先完成 API 设置</p>
      <p className="text-xs leading-5 text-muted-foreground">尚未保存{missing}配置。填写对应的 API 地址、Key 和模型并保存后，即可在各页面使用。</p>
    </div></div>
    <Link href="/settings" className="primary-action inline-flex min-h-10 items-center justify-center rounded-md border px-4 text-sm font-semibold">去配置 API</Link>
  </aside>
}
