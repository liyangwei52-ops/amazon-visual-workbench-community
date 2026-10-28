"use client"
import { FixedActionBar } from "./fixed-action-bar"
import { isCustomOutputValid } from "@/lib/output-ratio"
import { CustomRatioInput } from "@/components/custom-ratio-input"
import { PromptEditor } from "@/components/prompt-editor"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react"
import { ArrowLeftIcon, PlusIcon, RefreshCwIcon, SaveIcon, Trash2Icon, WandSparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { VisualSidebar } from "@/components/visual-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { loadDraft, saveDraft } from "@/lib/draft-store"
import { normalizeRatio, RATIO_OPTIONS } from "@/lib/visual-shared"
import { createSuiteEntry, deleteSuite, listSuites, saveSuite, SUITES_CHANGED_EVENT, type SavedSuite, type SuiteEntry } from "@/lib/suite-store"

export const SUITE_DRAFT_KEY = "amazon-workbench.draft.suite"
type SuiteDraft = { name?: string; entries?: SuiteEntry[] }

/** Kept for compatibility with existing title-normalization callers. */
export function normalizeEntryTitle(title: string, index: number): string {
  const trimmed = title.trim()
  if (/^提示词\s*\d+$/.test(trimmed)) return `提示词 ${index + 1}`
  return trimmed || `提示词 ${index + 1}`
}

export function VisualSuite() {
  const [name, setNameState] = useState("")
  const [entries, setEntriesState] = useState<SuiteEntry[]>(() => [createSuiteEntry(0)])
  const draftRef = useRef<SuiteDraft>({ name, entries })
  const setName = useCallback((action: SetStateAction<string>) => {
    const next = typeof action === "function" ? action(draftRef.current.name || "") : action
    draftRef.current = { ...draftRef.current, name: next }
    setNameState(next)
  }, [])
  const setEntries = useCallback((action: SetStateAction<SuiteEntry[]>) => {
    const next = typeof action === "function" ? action(draftRef.current.entries || []) : action
    draftRef.current = { ...draftRef.current, entries: next }
    setEntriesState(next)
  }, [])
  const [suites, setSuites] = useState<SavedSuite[]>([])
  const [saveError, setSaveError] = useState("")
  const [restored, setRestored] = useState(false)
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
  useEffect(() => {
    const draft = loadDraft<SuiteDraft>(SUITE_DRAFT_KEY)
    // Restore only the fields that belong to a prompt suite.
    if (typeof draft?.name === "string") setName(draft.name)
    if (Array.isArray(draft?.entries) && draft.entries.length) {
      setEntries(draft.entries.map((entry, index) => ({
        id: entry.id || createSuiteEntry(index).id,
        size: normalizeRatio(entry.size || "1:1"),
        customSize: entry.customSize || "",
        prompt: typeof entry.prompt === "string" ? entry.prompt : "",
      })))
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestored(true)
  }, [setName, setEntries])
  useEffect(() => {
    if (!restored) return
    const persist = () => saveDraft(SUITE_DRAFT_KEY, draftRef.current)
    const timer = setTimeout(persist, 600)
    window.addEventListener("pagehide", persist)
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", persist); persist() }
  }, [restored, name, entries])
  const updateEntry = (id: string, patch: Partial<SuiteEntry>) => setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...patch } : entry))
  const reset = () => {
    const blank = { name: "", entries: [createSuiteEntry(0)] }
    if (saveDraft(SUITE_DRAFT_KEY, blank) === "failed") {
      setSaveError("无法返回套装列表：编辑草稿保存失败，请检查浏览器存储空间")
      toast.error("编辑草稿保存失败，请检查浏览器存储空间")
      return false
    }
    draftRef.current = blank
    setName("")
    setEntries(blank.entries)
    setSaveError("")
    window.scrollTo({ top: 0, behavior: "smooth" })
    return true
  }
  const save = () => {
    setSaveError("")
    const fail = (message: string) => { setSaveError(message); toast.error(message); return false }
    const prompts = entries.filter(entry => entry.prompt.trim())
    if (!name.trim() || !prompts.length) return fail(!name.trim() ? "请填写套装名称" : "至少填写一条提示词")
    if (prompts.some(entry => entry.size === "custom" && !isCustomOutputValid(entry.customSize))) {
      return fail("请填写有效的自定义比例，例如 5:4 或 1:3")
    }
    const result = saveSuite({
      id: `suite-${Date.now()}`,
      name: name.trim(),
      entries: prompts.map(entry => ({ ...entry, prompt: entry.prompt.trim(), customSize: entry.size === "custom" ? entry.customSize.trim().replace("×", "x") : "" })),
      savedAt: Date.now(),
    })
    if (result === "failed") return fail("保存失败，请检查浏览器存储空间后重试")
    toast.success(`已${result === "updated" ? "更新同名" : "保存"}套装「${name.trim()}」（${prompts.length} 条）`)
    return true
  }
  const saveAndReturnToList = () => { if (save()) reset() }
  const load = useCallback((suite: SavedSuite) => {
    setSaveError("")
    setName(suite.name)
    setEntries(suite.entries.length ? suite.entries.map((entry, index) => ({ ...entry, id: createSuiteEntry(index).id })) : [createSuiteEntry(0)])
    toast.success(`已载入「${suite.name}」，可编辑后保存`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [setName, setEntries])
  return (
    <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 p-4 md:p-6 lg:flex-row">
      <VisualSidebar current="suite" />
      <main className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex flex-col gap-2">
          {(name.trim() || entries.some(entry => entry.prompt.trim())) && <Button type="button" variant="outline" data-suite-list-return className="w-fit" onClick={saveAndReturnToList}><ArrowLeftIcon className="size-4" />保存并返回套装列表</Button>}
          <h1 className="text-lg font-semibold tracking-tight">编辑提示词套装</h1>
          <p className="text-xs leading-5 text-muted-foreground">只保存套装名称、多条提示词和各自比例。可在提示词迁移、极简生图中整套调用。</p>
        </header>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="suite-name" className="text-xs font-semibold">套装名称</label>
              <Input id="suite-name" value={name} maxLength={120} placeholder="例如：户外风铃 · 场景图套装" onChange={event => setName(event.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">共 {entries.length} 条提示词</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={reset}>清空表单</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setEntries(current => [...current, createSuiteEntry(current.length)])}><PlusIcon className="size-4" />新增一条</Button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {entries.map((entry, index) => (
                <div key={entry.id} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Badge variant="secondary" className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</Badge><span className="text-xs font-medium">提示词 {index + 1}</span></div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select items={RATIO_OPTIONS} value={entry.size} onValueChange={value => updateEntry(entry.id, { size: value || "1:1" })}>
                        <SelectTrigger aria-label={`提示词 ${index + 1} 的生成比例`} className="h-8 w-32 font-mono text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{RATIO_OPTIONS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {entry.size === "custom" && <CustomRatioInput compact label={`提示词 ${index + 1}`} value={entry.customSize} onChange={value => updateEntry(entry.id, { customSize: value })} />}
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`删除提示词 ${index + 1}`} onClick={() => setEntries(current => current.length === 1 ? [createSuiteEntry(0)] : current.filter(item => item.id !== entry.id))}><Trash2Icon className="size-4" /></Button>
                    </div>
                  </div>
                  <PromptEditor title={`套装提示词 ${index + 1}`} placeholder="填写或粘贴完整提示词…" value={entry.prompt} onChange={value => updateEntry(entry.id, { prompt: value })} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">已保存套装</CardTitle><CardDescription className="text-xs">点击载入编辑可修改提示词和比例，同名保存会更新原套装。</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!suites.length && <p className="text-xs text-muted-foreground">暂无套装，可填写上方内容保存，或在工作台、策划、极简生图中点击「保存为套装」。</p>}
            {suites.map(suite => (
              <div key={suite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 flex-col gap-1"><p className="truncate text-sm font-medium">{suite.name}</p><p className="text-xs text-muted-foreground">{suite.entries.length} 条提示词 · {new Date(suite.savedAt).toLocaleString("zh-CN")}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => load(suite)}><RefreshCwIcon className="size-3.5" />载入编辑</Button>
                  <Link href="/remix" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs" onClick={() => localStorage.setItem("amazon-workbench.loadSuiteId", suite.id)}><WandSparklesIcon className="size-3.5" />在提示词迁移使用</Link>
                  <Button type="button" variant="ghost" size="icon" aria-label={`删除套装 ${suite.name}`} onClick={() => { if (deleteSuite(suite.id)) toast.success("套装已删除"); else toast.error("删除失败，请重试") }}><Trash2Icon className="size-3.5" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <FixedActionBar label="套装保存操作">
          <div className="mr-auto min-w-0 text-xs text-muted-foreground"><span>共 {entries.length} 条提示词 · 仅保存留在编辑表单</span>{saveError && <p data-suite-save-error role="alert" className="mt-1 max-w-full text-destructive">{saveError}</p>}</div>
          <Button type="button" variant="outline" className="h-11" onClick={() => save()}>仅保存</Button>
          <Button type="button" data-suite-list-return className="primary-action h-11" onClick={saveAndReturnToList}><SaveIcon className="size-4" />保存并返回套装列表</Button>
        </FixedActionBar>
      </main>
    </div>
  )
}
