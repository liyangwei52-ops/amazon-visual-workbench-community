import { generationBatches } from "./generation-batches"
import { taskOutputIndices } from "./generation-selection"
import type { GenerateTask } from "./visual-shared"

/** 同一编辑清单局部重交按原位置更新；全新清单仍建立独立结果批次。 */
export function planGenerationSubmission(previous: GenerateTask[], submitted: GenerateTask[], entryIds: string[], inputBatchId: string, createId = () => crypto.randomUUID()) {
  const latest = generationBatches(previous).at(-1)
  entryIds = [...new Set(entryIds)]
  const editorIds = new Set(entryIds)
  if (submitted.some(task => !editorIds.has(task.sourceEntryId || task.id))) throw new Error("提交条目不在当前提示词清单中")
  const related = latest?.tasks.some(task => !task.redrawOf && task.sourceEntryId && editorIds.has(task.sourceEntryId))
  const existing = new Map((related ? latest!.tasks : []).filter(task => !task.redrawOf && task.sourceEntryId).map(task => [task.sourceEntryId!, task]))
  const oldIds = latest?.entryIds || latest?.tasks.filter(task => !task.redrawOf).map(task => task.sourceEntryId || task.id)
  const changed = related && (JSON.stringify(oldIds) !== JSON.stringify(entryIds) || latest!.tasks.some(task => task.redrawOf))
  const generationBatchId = related && !changed ? latest!.id : inputBatchId
  const incoming = submitted.map(task => {
    const sourceEntryId = task.sourceEntryId || task.id
    const source = existing.get(sourceEntryId)
    const next: GenerateTask = { ...task, id: source?.id || `task-${createId()}`, sourceEntryId, inputBatchId,
      generationBatchId, generationEntryIds: entryIds, stoppedBeforeSend: undefined }
    if (source) {
      const indices = taskOutputIndices(next)
      // 提示词/画布/素材使用本次编辑；旧图保留到对应新图成功返回。
      next.resultUrls = source.resultUrls.slice(0, indices.length)
      next.resultCount = next.resultUrls.filter(Boolean).length
      next.resultsSaved = source.resultsSaved
      next.resultVersions = source.resultVersions?.slice(0, indices.length)
      next.redraw = { id: createId(), indices, pending: [...indices] }
    }
    return next
  })
  if (!related) return { incoming, related: false, merged: incoming }
  const replacements = new Map(incoming.map(task => [task.sourceEntryId!, task]))
  const current = entryIds.flatMap(id => {
    const task = replacements.get(id) || existing.get(id)
    if (!task) return [] // 未提交的框只显示占位，不创建可执行任务。
    return [task.generationBatchId === generationBatchId && JSON.stringify(task.generationEntryIds) === JSON.stringify(entryIds)
      ? task : { ...task, generationBatchId, generationEntryIds: entryIds }]
  })
  const currentIds = new Set(current.map(task => task.id))
  const originalBatches = new Map(generationBatches(previous).flatMap(batch => batch.tasks.map(task => [task.id, batch.id] as const)))
  const history = previous.filter(task => !currentIds.has(task.id)).map(task => {
    if (!latest!.tasks.includes(task) && !task.redrawOf) return task
    // 脱离当前编辑框的旧卡仍可历史查看；冻结旧重绘归属，不跟随原卡进入新清单。
    return { ...task, generationBatchId: originalBatches.get(task.id), generationEntryIds: undefined }
  })
  return { incoming, related: true, merged: [...history, ...current] }
}

/** 停止和暂停不同：撤销未发送任务，断开本地等待；保留每个已返回位置。 */
export function stopGenerationTasks(tasks: GenerateTask[]): GenerateTask[] {
  return tasks.map(task => task.status === "queued"
    ? { ...task, status: "failed", stoppedBeforeSend: true, error: "本轮已停止，此任务尚未发送。可继续未发送任务，或返回编辑后只提交启用条目。" }
    : task.status === "running"
      ? { ...task, status: "interrupted", stoppedBeforeSend: undefined, error: "已主动停止本地等待，已返回图片保留。服务商可能仍在处理或已经计费；核查后再手动重试。" }
      : task)
}
