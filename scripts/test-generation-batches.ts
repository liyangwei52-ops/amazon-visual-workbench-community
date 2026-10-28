import assert from "node:assert/strict"
import { generationBatches, generationStats } from "../src/lib/generation-batches"
import { createRedrawTasks, selectOutputs } from "../src/lib/generation-selection"
import type { GenerateTask } from "../src/lib/visual-shared"

const task = (id: string, count: number, batch?: string, extra: Partial<GenerateTask> = {}): GenerateTask => ({
  id, count, inputBatchId: batch, label: id, ratio: "1:1", customSize: "", quality: "1k", prompt: "完整提示词", productImageDataUrl: "", status: "success", resultUrls: Array(count).fill("https://fixture.invalid/image.png"), ...extra,
})
const old = [task("old1", 4, "batch-10"), task("old2", 4, "batch-10"), task("old3", 2, "batch-10", { status: "interrupted", resultUrls: ["https://fixture.invalid/first.png"] })]
const latest = [task("new1", 4, "batch-15"), task("new2", 4, "batch-15"), task("new3", 4, "batch-15"), task("new4", 3, "batch-15")]
const tasks = [...old, ...latest], before = JSON.stringify(tasks)
const batches = generationBatches(tasks)
assert.equal(batches.length, 2)
assert.equal(generationStats(batches[0].tasks).totalImages, 10)
assert.equal(generationStats(batches.at(-1)!.tasks).totalImages, 15, "最新批次是15，不累加成25")
assert.equal(generationStats(batches.at(-1)!.tasks).receivedImages, 15)
assert.equal(generationStats(batches.at(-1)!.tasks).interrupted, 0, "历史待确认不混入当前统计")
assert.equal(JSON.stringify(tasks), before, "分组不删除或改写旧任务/图片")
assert.deepEqual(Object.keys(selectOutputs(batches.at(-1)!.tasks, {}, "all")), latest.map(task => task.id), "全选仅本批")
const redrawn = createRedrawTasks(latest, { new2: [1] }, () => "redraw-v1")[0]
assert.equal(redrawn.inputBatchId, "batch-15")
assert.equal(generationBatches([...old, ...latest.map(task => task.id === redrawn.id ? redrawn : task)]).length, 2, "原位重绘不创建新提交批次")
assert.equal(generationBatches([...tasks, task("historical-redraw", 1, "old-redraw-inputs", { redrawOf: "old1", redrawIndices: [0] })]).at(-1)!.id, "batch-15", "旧追加重绘归原批次，不能夺走当前批次")
assert.equal(generationBatches([task("legacy1", 2), task("legacy2", 3)]).length, 1, "无批次字段的旧记录保守合组，不猜测拆分")
assert.equal(generationStats(generationBatches([task("legacy1", 2), ...latest]).at(-1)!.tasks).totalImages, 15)
assert.doesNotThrow(() => generationBatches([task("a", 1, "a-input", { redrawOf: "b" }), task("b", 1, "b-input", { redrawOf: "a" })]))
assert.equal(generationBatches([task("orphan", 1, "orphan-input", { redrawOf: "deleted" })])[0].id, "orphan-input")
assert.equal(generationBatches([task("current", 1, "new-input", { generationBatchId: "current-list" }), task("archived-redraw", 1, "old-input", { generationBatchId: "archived-list", redrawOf: "current" })])[1].id, "archived-list", "显式历史归属不跟随当前源卡重新混入")
assert.deepEqual(generationBatches([]), [])
console.log("PASS: 10→15最新批次单独统计、历史结果无改写、全选仅本批、原位与历史重绘归属、旧无批次/断链/环兼容（零网络）")
