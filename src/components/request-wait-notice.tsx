"use client"

import { useEffect, useState } from "react"
import { LoaderCircleIcon } from "lucide-react"

export function RequestWaitNotice({ active, label }: { active: boolean; label: string }) {
  return active ? <ActiveRequestWait label={label} /> : null
}

function ActiveRequestWait({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <div data-request-wait className="flex items-start gap-2 rounded-lg border border-sky-300/20 bg-sky-300/5 p-3 text-xs leading-5 text-muted-foreground" role="status">
    <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-sky-300" />
    <div><p className="font-medium text-foreground">{label} · 已等待 {seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}</p>
      <p>{seconds >= 60 ? "服务商响应较慢，请保持页面打开。" : "请求已发出，正在等待服务商返回。"}每次请求最长等待15分钟，超时会结束等待，不会自动重发；结果不明时请先核查服务商。</p>
    </div>
  </div>
}
