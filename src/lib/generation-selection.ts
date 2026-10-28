import type { GenerateTask } from "./visual-shared"

export type SelectionAction = "all" | "none" | "invert"

export function selectEntries<T extends { enabled: boolean }>(entries: T[], action: SelectionAction, locked: (entry: T) => boolean = () => false): T[] {
  return entries.map(entry => locked(entry) ? entry : { ...entry, enabled: action === "invert" ? !entry.enabled : action === "all" })
}

export function canSelectResult(task: GenerateTask): boolean {
  return task.status === "success" || task.status === "failed" || task.status === "interrupted"
}

export function taskOutputIndices(task: GenerateTask): number[] {
  return Array.from({ length: Math.min(4, Math.max(1, Math.floor(task.count) || 1)) }, (_, index) => index)
}

export type OutputSelection = Record<string, number[]>

export const countTaskResults = (task: GenerateTask) => Math.max(task.resultUrls.filter(Boolean).length, task.resultsSaved ? task.resultCount || 0 : 0)
export const taskAssetId = (task: GenerateTask, index: number) => `generated-${task.id}-${index}${task.resultVersions?.[index] ? `-${task.resultVersions[index]}` : ""}`

export function selectOutputs(tasks: GenerateTask[], selected: OutputSelection, action: SelectionAction | "failed"): OutputSelection {
  return Object.fromEntries(tasks.filter(canSelectResult).map(task => [task.id, taskOutputIndices(task).filter(index =>
    action === "all" || (action === "invert" && !selected[task.id]?.includes(index))
    || (action === "failed" && (task.redraw?.pending.includes(index) || (!task.resultUrls[index] && (!task.resultsSaved || task.resultUrls.length > 0 || index >= (task.resultCount || 0)))))
  )]))
}

/** 保留原任务身份、图号和素材；返回前不清空旧图。历史追加重绘记录也在其自身位置重绘。 */
export function createRedrawTasks(tasks: GenerateTask[], selected: OutputSelection, createId = () => crypto.randomUUID()): GenerateTask[] {
  return tasks.filter(canSelectResult).flatMap(source => {
    const indices = taskOutputIndices(source).filter(index => selected[source.id]?.includes(index))
    if (!indices.length) return []
    return [{ ...source, status: "queued" as const,
      error: undefined, resultWarning: undefined, requestInfo: undefined, paused: false, stoppedBeforeSend: undefined,
      redraw: { id: createId(), indices, pending: [...indices] },
    }]
  })
}

/** 单图请求按提交图号回填，完成顺序不改变位置；没返回的选中位置继续显示旧图。 */
export function applyImageOutputs(task: GenerateTask, slots: number[], outputs: { index: number; src: string }[]): Pick<GenerateTask, "resultUrls" | "resultCount" | "redraw" | "resultVersions"> {
  const resultUrls = [...task.resultUrls], resultVersions = [...(task.resultVersions || [])]
  const completed = new Set<number>()
  for (const output of outputs) {
    const slot = slots[output.index]
    if (slot === undefined || !output.src) continue
    while (resultUrls.length <= slot) resultUrls.push("")
    resultUrls[slot] = output.src
    if (task.redraw) {
      while (resultVersions.length <= slot) resultVersions.push("")
      resultVersions[slot] = task.redraw.id
    }
    completed.add(slot)
  }
  return { resultUrls, resultCount: resultUrls.filter(Boolean).length, resultVersions,
    redraw: task.redraw ? { ...task.redraw, pending: task.redraw.pending.filter(index => !completed.has(index)) } : undefined }
}
