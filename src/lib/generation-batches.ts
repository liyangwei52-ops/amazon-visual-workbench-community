import { countTaskResults } from "./generation-selection"
import type { GenerateTask } from "./visual-shared"

export type GenerationBatch = { id: string; tasks: GenerateTask[]; entryIds?: string[] }

export function generationSlots(batch: GenerationBatch) {
  if (!batch.entryIds) return batch.tasks.map(task => ({ entryId: task.sourceEntryId || task.id, task }))
  const byEntry = new Map(batch.tasks.filter(task => !task.redrawOf).map(task => [task.sourceEntryId || task.id, task]))
  return batch.entryIds.map(entryId => ({ entryId, task: byEntry.get(entryId) }))
}

/** 结果清单与素材存储批次分离，局部重交仍显示完整清单；旧记录只读回退。 */
export function generationBatches(tasks: GenerateTask[]): GenerationBatch[] {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const groups = new Map<string, GenerateTask[]>()
  const batchOf = (task: GenerateTask, visited = new Set<string>()): string => {
    if (task.generationBatchId) return task.generationBatchId
    // 旧版追加的重绘卡仍归原提交；环状/已删来源只按自身批次保守回退。
    const source = task.redrawOf ? byId.get(task.redrawOf) : undefined
    if (source && !visited.has(source.id)) {
      visited.add(task.id)
      return batchOf(source, visited)
    }
    return task.generationBatchId || task.inputBatchId || "legacy-unbatched"
  }
  for (const task of tasks) {
    const id = batchOf(task)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id)!.push(task)
  }
  return [...groups].map(([id, tasks]) => {
    const entryIds = tasks.find(task => task.generationEntryIds)?.generationEntryIds
    return { id, tasks, ...(entryIds ? { entryIds } : {}) }
  })
}

/** 当前草稿只投影显示；旧图/队列不改写，不因导航发送请求。兼容已经混入旧卡的存量队列。 */
export function generationViewBatches(tasks: GenerateTask[], editorIds: string[] | null): GenerationBatch[] {
  const batches = generationBatches(tasks), latest = batches.at(-1)
  if (!latest) return editorIds?.length ? [{ id: "editor-current", tasks: [], entryIds: [...new Set(editorIds)] }] : batches
  if (!editorIds) return batches
  const entryIds = [...new Set(editorIds)]
  if (latest.entryIds && JSON.stringify(latest.entryIds) === JSON.stringify(entryIds)) return batches
  const byEntry = new Map(latest.tasks.filter(task => !task.redrawOf).map(task => [task.sourceEntryId || task.id, task]))
  const current = entryIds.flatMap(id => byEntry.has(id) ? [byEntry.get(id)!] : [])
  const currentIds = new Set(current.map(task => task.id))
  const history = latest.tasks.filter(task => !currentIds.has(task.id))
  return [...batches.slice(0, -1), ...(history.length ? [{ id: latest.id, tasks: history }] : []),
    { id: `${latest.id}:editor`, tasks: current, entryIds }]
}

export function generationStats(tasks: GenerateTask[]) {
  const success = tasks.filter(task => task.status === "success" && countTaskResults(task) >= task.count).length
  const partial = tasks.filter(task => task.status === "success" && countTaskResults(task) < task.count).length
  const stopped = tasks.filter(task => task.stoppedBeforeSend).length
  const failed = tasks.filter(task => task.status === "failed" && !task.stoppedBeforeSend).length
  const running = tasks.filter(task => task.status === "running").length
  const interrupted = tasks.filter(task => task.status === "interrupted").length
  const queued = tasks.filter(task => task.status === "queued").length
  const totalImages = tasks.reduce((sum, task) => sum + Math.min(4, Math.max(1, Number(task.count) || 1)), 0)
  const receivedImages = tasks.reduce((sum, task) => sum + Math.min(task.count, task.redraw ? task.count - task.redraw.pending.length : countTaskResults(task)), 0)
  return { success, partial, failed, stopped, running, interrupted, queued, total: tasks.length, totalImages, receivedImages,
    percent: totalImages > 0 ? Math.round(receivedImages / totalImages * 100) : 0 }
}
