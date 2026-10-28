import type { Metadata } from "next"

import { PersistentWorkspace } from "@/components/persistent-workspace"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

// 原 next/font/google（IBM Plex Sans / Mono、Instrument Serif）在构建时需联网拉取字体，
// 网络受限环境下会导致 build 失败，改为本地字体栈（同名 CSS 变量，视觉接近原设计）。
const FONT_VARS = {
  "--font-plex-sans":
    '"IBM Plex Sans", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif',
  "--font-plex-mono": '"IBM Plex Mono", Consolas, "SFMono-Regular", Menlo, "Courier New", monospace',
  "--font-instrument-serif": '"Instrument Serif", Georgia, "Times New Roman", serif',
} as const

export const metadata: Metadata = {
  title: "Amazon 电商视觉工作台 | 产品图提示词生成",
  description:
    "上传产品图与竞品参考图，分析模型按「Amazon 电商视觉策略师」角色生成成品提示词，生图模型一次出图。PRODUCT FIRST，SCENE SECOND。",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      translate="no"
      className="h-full antialiased"
      style={FONT_VARS as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="notranslate flex min-h-full flex-col" translate="no" suppressHydrationWarning>
        <PersistentWorkspace />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}
