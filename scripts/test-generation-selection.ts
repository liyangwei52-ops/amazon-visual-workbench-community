import assert from "node:assert/strict"
import { selectEntries, selectOutputs, createRedrawTasks, applyImageOutputs, taskAssetId } from "../src/lib/generation-selection"
import type { GenerateTask } from "../src/lib/visual-shared"

const entries = [{ enabled: true, locked: false }, { enabled: false, locked: false }, { enabled: true, locked: true }]
assert.deepEqual(selectEntries(entries, "none", x => x.locked).map(x => x.enabled), [false, false, true])
assert.deepEqual(selectEntries(entries, "invert", x => x.locked).map(x => x.enabled), [false, true, true])
assert.deepEqual(selectEntries(entries, "all").map(x => x.enabled), [true, true, true])
assert.deepEqual(entries.map(x => x.enabled), [true, false, true])
const base: GenerateTask = { id: "one", label: "提示词1", ratio: "custom", customSize: "5:4", quality: "2k", count: 3, prompt: "完整正负向提示词", productImageDataUrl: "product", productImages: [{ dataUrl: "product", name: "主图" }], references: [{ dataUrl: "reference", name: "竞品" }], status: "success", resultUrls: ["first", "second"], inputBatchId: "old-input", resultCount: 2, resultsSaved: true }
const tasks: GenerateTask[] = [base, { ...base, id: "fail", status: "failed", resultUrls: [], resultCount: 0, count: 1 }, { ...base, id: "run", status: "running" }]
const snapshot = JSON.stringify(tasks)
assert.deepEqual(selectOutputs(tasks, {}, "failed"), { one: [2], fail: [0] })
assert.deepEqual(selectOutputs(tasks, { one: [1] }, "invert"), { one: [0, 2], fail: [0] })
assert.deepEqual(selectOutputs(tasks, {}, "none"), { one: [], fail: [] })
let id = 0
const redraws = createRedrawTasks(tasks, { one: [1, 1, -1, 99], fail: [0], run: [0] }, () => String(++id))
assert.equal(redraws.length, 2)
assert.deepEqual(redraws.map(x => x.count), [3, 1])
assert.deepEqual(redraws[0].redraw, { id: "1", indices: [1], pending: [1] })
assert.equal(redraws[0].id, "one")
assert.equal(redraws[0].inputBatchId, "old-input")
assert.equal(redraws[0].status, "queued")
assert.deepEqual(redraws[0].resultUrls, base.resultUrls)
assert.equal(redraws[0].prompt, base.prompt)
assert.deepEqual(redraws[0].productImages, base.productImages)
assert.deepEqual(redraws[0].references, base.references)
assert.equal(redraws[0].customSize, "5:4")
assert.equal(redraws[0].quality, "2k")
assert.equal(JSON.stringify(tasks), snapshot, "重绘不得修改任何原任务或图片")
const partial = applyImageOutputs(redraws[0], [1], [])
assert.deepEqual(partial.resultUrls, base.resultUrls, "失败保留旧图")
assert.deepEqual(partial.redraw?.pending, [1])
const changed = applyImageOutputs(redraws[0], [1], [{ index: 0, src: "new-second" }])
assert.deepEqual(changed.resultUrls, ["first", "new-second"], "只替换对应图号")
assert.deepEqual(changed.redraw?.pending, [])
assert.notEqual(taskAssetId({ ...redraws[0], ...changed }, 1), taskAssetId(base, 1), "重绘图片另存资产，不能命中旧图")
assert.equal(taskAssetId({ ...redraws[0], ...changed }, 0), taskAssetId(base, 0))
const group = createRedrawTasks([base], { one: [0, 2] }, () => "group")[0]
const outOfOrder = applyImageOutputs(group, [0, 2], [{ index: 1, src: "new-third" }])
assert.deepEqual(outOfOrder.resultUrls, ["first", "second", "new-third"])
assert.deepEqual(outOfOrder.redraw?.pending, [0])
const full = applyImageOutputs(group, [0, 2], [{ index: 1, src: "new-third" }, { index: 0, src: "new-first" }])
assert.deepEqual(full.resultUrls, ["new-first", "second", "new-third"])
assert.deepEqual(full.redraw?.pending, [])
const holes = applyImageOutputs({ ...group, resultUrls: [] }, [0, 2], [{ index: 1, src: "third" }])
assert.deepEqual(holes.resultUrls, ["", "", "third"], "缺图不移动返回位置")
assert.deepEqual(selectOutputs([{ ...group, ...outOfOrder, status: "failed" }], {}, "failed"), { one: [0] })
console.log("PASS: 批量选择、原位重绘身份/完整素材保留、单张/多张乱序回填、失败旧图保留、待重绘筛选、资产版本与缺图槽位（零网络）")
