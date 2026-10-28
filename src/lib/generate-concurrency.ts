import { generateScopeName, type GenerateOrigin } from "./generate-queue-store"

export const QUEUE_CONCURRENCY_KEY = "amazon-workbench.generateConcurrency.v1"
export const generateConcurrencyKey = (origin: GenerateOrigin) => `${QUEUE_CONCURRENCY_KEY}.${generateScopeName(origin)}`
export const readGenerationConcurrency = (origin: GenerateOrigin) => normalizeGenerationConcurrency(localStorage.getItem(generateConcurrencyKey(origin)) ?? localStorage.getItem(QUEUE_CONCURRENCY_KEY))
export const GENERATION_CONCURRENCY_OPTIONS = [
  { value: "all", label: "全部同时开始" },
  { value: "1", label: "1个任务" },
  { value: "2", label: "2个任务" },
  { value: "3", label: "3个任务" },
  { value: "4", label: "4个任务" },
  { value: "5", label: "5个任务" },
  { value: "8", label: "8个任务" },
  { value: "10", label: "10个任务" },
] as const
export type GenerationConcurrency = (typeof GENERATION_CONCURRENCY_OPTIONS)[number]["value"]
export function normalizeGenerationConcurrency(value: string | null): GenerationConcurrency {
  return GENERATION_CONCURRENCY_OPTIONS.find(option => option.value === value)?.value || "all"
}
export function generationWorkerCount(setting: GenerationConcurrency, queued: number): number {
  return setting === "all" ? queued : Math.min(queued, Number(setting))
}
