import assert from "node:assert/strict"
import { ImageItemError, requestImageBatch } from "../src/lib/image-batch"

async function main() {
  const pending: { resolve: (url: string) => void; reject: (error: Error) => void }[] = []
  const progress: number[] = []
  let saves = 0
  const batch = requestImageBatch(4, () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject })), async state => {
    assert.equal(saves++, 0, "检查点不能重叠写入")
    await new Promise(resolve => setTimeout(resolve, 5))
    progress.push(state.urls.length)
    saves--
  })
  assert.equal(pending.length, 4, "必须在任何返回前发出全部首次请求")
  pending[2].resolve("third-first")
  pending[0].resolve("first-second")
  pending[1].reject(new ImageItemError("mock upstream unknown", "interrupted"))
  pending[3].resolve("last-third")
  const result = await batch
  assert.deepEqual(result.urls, ["third-first", "first-second", "last-third"])
  assert.deepEqual(result.outputs, [{ index: 2, src: "third-first" }, { index: 0, src: "first-second" }, { index: 3, src: "last-third" }], "乱序返回保留请求图号")
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].outcome, "interrupted")
  assert.equal(result.finished, 4)
  assert.deepEqual(progress, [1, 2, 2, 3])
  assert.equal(pending.length, 4, "失败不得自动补发")

  let completed = 0, checkpoints = 0
  await assert.rejects(requestImageBatch(2, async () => {
    await new Promise(resolve => setTimeout(resolve, completed ? 1 : 5))
    return String(++completed)
  }, async () => { if (++checkpoints === 1) throw new Error("mock storage failure") }), /storage failure/)
  assert.equal(completed, 2, "本地错误不能提前退出而遗失已发送请求")
  assert.equal(checkpoints, 2, "后续检查点仍须尝试保存")
  console.log("PASS: 单图并行首次请求、乱序追加、串行检查点、部分失败不补发、保存失败后等待全部请求（零网络）")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
