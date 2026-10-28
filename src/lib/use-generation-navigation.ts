"use client"

import { useSyncExternalStore } from "react"
import { GENERATE_ORIGIN_KEY, GENERATE_QUEUE_KEY } from "./visual-shared"
import { GENERATE_ORIGINS, GENERATE_QUEUE_SUBMITTED_EVENT, GENERATE_QUEUE_UPDATED_EVENT, readGenerateOrigin, readGenerateQueue, taskGenerateOrigin, type GenerateOrigin } from "./generate-queue-store"

function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(GENERATE_QUEUE_KEY) || event.key.startsWith(GENERATE_ORIGIN_KEY)) notify() }
  window.addEventListener("storage", storage)
  window.addEventListener(GENERATE_QUEUE_SUBMITTED_EVENT, notify)
  window.addEventListener(GENERATE_QUEUE_UPDATED_EVENT, notify)
  return () => {
    window.removeEventListener("storage", storage)
    window.removeEventListener(GENERATE_QUEUE_SUBMITTED_EVENT, notify)
    window.removeEventListener(GENERATE_QUEUE_UPDATED_EVENT, notify)
  }
}

const serverSnapshot = () => "/|"
function snapshot() {
  const queue = readGenerateQueue()
  const fallback = readGenerateOrigin()
  const sources = Object.keys(GENERATE_ORIGINS).flatMap(origin => {
    const tasks = queue.filter(task => taskGenerateOrigin(task, fallback) === origin)
    const status = tasks.some(task => task.status === "running") ? "running" : tasks.some(task => task.status === "queued") ? "queued" : "results"
    return tasks.length ? [`${origin}:${status}`] : []
  })
  return `${fallback}|${sources.join(",")}`
}

/** 导航只读取队列状态，不创建、恢复执行或重发任何请求。 */
export function useGenerationNavigation() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const [origin, stages] = value.split("|")
  const sources = stages ? stages.split(",").map(stage => {
    const [source, status] = stage.split(":")
    return { origin: source as GenerateOrigin, running: status === "running", queued: status === "queued" }
  }) : []
  return { origin: origin as GenerateOrigin, hasTasks: sources.length > 0, running: sources.some(source => source.running), sources }
}
