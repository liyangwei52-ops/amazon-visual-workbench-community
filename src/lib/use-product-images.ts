"use client"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { compressUploadImage, validateUpload, type UploadImage } from "./visual-shared"

export const MAX_PRODUCT_IMAGES = 4
export type ProductImageDraft = { id: string; name: string; dataUrl: string }
export const productImageDrafts = (images: UploadImage[]): ProductImageDraft[] => images.map(({ id, name, dataUrl }) => ({ id, name, dataUrl }))

export function useProductImages() {
  const [images, setImages] = useState<UploadImage[]>([])
  const current = useRef<UploadImage[]>([])
  const pending = useRef(Promise.resolve())
  const [busy, setBusy] = useState(false)
  const commit = useCallback((next: UploadImage[]) => { current.current = next; setImages(next) }, [])
  const restore = useCallback(async (drafts: ProductImageDraft[]) => {
    const restored = await Promise.all(drafts.slice(0, MAX_PRODUCT_IMAGES).map(async item => {
      const blob = await (await fetch(item.dataUrl)).blob()
      return { id: item.id || crypto.randomUUID(), name: item.name || "product.png", dataUrl: item.dataUrl,
        file: new File([blob], item.name || "product.png", { type: blob.type || "image/png" }) }
    }))
    commit(restored)
  }, [commit])
  const prepare = async (file: File): Promise<UploadImage> => {
    const error = validateUpload(file)
    if (error) throw new Error(error)
    const compressed = await compressUploadImage(file)
    return { id: crypto.randomUUID(), name: compressed.file.name, dataUrl: compressed.dataUrl, file: compressed.file }
  }
  const addFiles = useCallback((files: File[]) => {
    pending.current = pending.current.then(async () => {
      setBusy(true)
      let overflow = 0
      try {
        for (const file of files) {
          if (current.current.length >= MAX_PRODUCT_IMAGES) { overflow++; continue }
          try { const image = await prepare(file); commit([...current.current, image]) }
          catch (e) { toast.error(e instanceof Error ? e.message : "产品图读取失败") }
        }
        if (overflow) toast.error(`产品图最多4张，额外 ${overflow} 张未添加；可移除或替换现有图片`)
      } finally { setBusy(false) }
    })
    return pending.current
  }, [commit])
  const replace = useCallback(async (id: string, file: File) => {
    try { const image = await prepare(file); commit(current.current.map(item => item.id === id ? image : item)) }
    catch (e) { toast.error(e instanceof Error ? e.message : "替换失败") }
  }, [commit])
  const remove = useCallback((id: string) => { commit(current.current.filter(item => item.id !== id)) }, [commit])
  const makeMain = useCallback((id: string) => {
    const image = current.current.find(item => item.id === id)
    if (image) { commit([image, ...current.current.filter(item => item.id !== id)]); toast.success("已移到第一张，作为主产品图") }
  }, [commit])
  return { images, main: images[0] || null, busy, addFiles, restore, replace, remove, makeMain }
}
export type ProductImagesManager = ReturnType<typeof useProductImages>
