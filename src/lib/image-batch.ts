import type { ImageFailureOutcome } from "./image-failure"

export class ImageItemError extends Error {
  constructor(message: string, public outcome: ImageFailureOutcome) { super(message) }
}

export type ImageBatchProgress = {
  urls: string[]
  outputs: { index: number; src: string }[]
  failures: { message: string; outcome: ImageFailureOutcome }[]
  finished: number
  total: number
}

/** 每张只请求一次，所有首次请求并行发出；按完成顺序追加，检查点串行保存，绝不自动补发。 */
export async function requestImageBatch(count: number, generateOne: (index: number) => Promise<string>, onProgress: (state: ImageBatchProgress) => Promise<void>) {
  const state: ImageBatchProgress = { urls: [], outputs: [], failures: [], finished: 0, total: Math.min(4, Math.max(1, Math.floor(count) || 1)) }
  let checkpoint = Promise.resolve()
  let checkpointError: unknown
  await Promise.all(Array.from({ length: state.total }, async (_, index) => {
    try {
      const src = await generateOne(index)
      if (!src) throw new ImageItemError("单张请求未返回图片，请核查服务商结果", "interrupted")
      state.urls.push(src)
      state.outputs.push({ index, src })
    } catch (error) {
      state.failures.push({ message: error instanceof Error ? error.message : "图片请求中断", outcome: error instanceof ImageItemError ? error.outcome : "interrupted" })
    }
    state.finished++
    const snapshot = { ...state, urls: [...state.urls], outputs: [...state.outputs], failures: [...state.failures] }
    // 保存回调出错也要等待其余已发送请求，并继续保存更新的检查点。
    checkpoint = checkpoint.then(() => onProgress(snapshot)).catch(error => { checkpointError = error })
    await checkpoint
  }))
  await checkpoint
  if (checkpointError) throw checkpointError
  return state
}
