"use client"
import { useSyncExternalStore } from "react"
import { readApiSettings } from "./api-settings"
import { subscribeApiSettings } from "./use-api-status"
const readModel = () => readApiSettings().image.model
const serverModel = () => "gpt-image-2"
export function useImageModel() { return useSyncExternalStore(subscribeApiSettings, readModel, serverModel) }
