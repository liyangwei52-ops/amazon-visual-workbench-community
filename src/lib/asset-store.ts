export type AssetKind = "product" | "reference" | "generated"
export const ASSET_LABELS: Record<AssetKind, string> = { product: "产品图", reference: "参考图", generated: "生成图片" }
export const ASSETS_EVENT = "amazon-workbench.assets-changed"
export type ImageAsset = {
  id: string; name: string; kind: AssetKind; width: number; height: number; bytes: number
  mime: string; thumbnail: string; createdAt: number; prompt?: string; model?: string
}
const DATABASE = "amazon-workbench-assets"
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore("assets", { keyPath: "id" })
      request.result.createObjectStore("images")
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error("无法打开资产存储，请检查浏览器存储权限"))
  })
}
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(new Error("资产保存失败，可能是浏览器空间不足"))
  })
}
function notify() {
  window.dispatchEvent(new Event(ASSETS_EVENT))
  try { localStorage.setItem(ASSETS_EVENT, crypto.randomUUID()) } catch { /* IndexedDB保存仍有效。 */ }
}
export async function listAssets(): Promise<ImageAsset[]> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("assets").objectStore("assets").getAll()
      request.onsuccess = () => resolve((request.result as ImageAsset[]).sort((a, b) => b.createdAt - a.createdAt))
      request.onerror = () => reject(new Error("读取资产失败"))
    })
  } finally { db.close() }
}
export async function getAssetBlob(id: string): Promise<Blob> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("images").objectStore("images").get(id)
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error("图片已不存在，请刷新资产列表"))
      request.onerror = () => reject(new Error("读取图片失败"))
    })
  } finally { db.close() }
}
export async function imageThumbnail(blob: Blob, edge = 384): Promise<{ width: number; height: number; thumbnail: string }> {
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error("仅支持PNG、JPG和WEBP图片")
  const bitmap = await createImageBitmap(blob).catch(() => { throw new Error("图片无法读取，请换一张有效图片") })
  try {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("浏览器无法处理图片")
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { width: bitmap.width, height: bitmap.height, thumbnail: canvas.toDataURL("image/jpeg", 0.78) }
  } finally { bitmap.close() }
}
export async function saveAsset(blob: Blob, details: { id?: string; name: string; kind: AssetKind; prompt?: string; model?: string }): Promise<ImageAsset> {
  if (details.id) {
    const db = await openDatabase()
    try {
      const existing = await new Promise<ImageAsset | undefined>((resolve, reject) => {
        const request = db.transaction("assets").objectStore("assets").get(details.id!)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error("读取资产失败"))
      })
      if (existing) return existing
    } finally { db.close() }
  }
  if (blob.size > 30 * 1024 * 1024) throw new Error("单张资产不能超过30MB")
  const image = await imageThumbnail(blob)
  const asset: ImageAsset = { ...details, id: details.id || crypto.randomUUID(), name: details.name.trim().slice(0, 120) || "未命名图片", ...image, bytes: blob.size, mime: blob.type, createdAt: Date.now() }
  const db = await openDatabase()
  try {
    const tx = db.transaction(["assets", "images"], "readwrite")
    const done = complete(tx)
    tx.objectStore("assets").put(asset); tx.objectStore("images").put(blob, asset.id)
    await done
  } finally { db.close() }
  notify(); return asset
}
export async function renameAsset(id: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error("请填写图片名称")
  const db = await openDatabase()
  try {
    const tx = db.transaction("assets", "readwrite"), done = complete(tx), store = tx.objectStore("assets")
    const request = store.get(id)
    request.onsuccess = () => { if (request.result) store.put({ ...request.result, name: name.trim().slice(0, 120) }) }
    await done
  } finally { db.close() }
  notify()
}
export async function deleteAsset(id: string): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(["assets", "images"], "readwrite"), done = complete(tx)
    tx.objectStore("assets").delete(id); tx.objectStore("images").delete(id)
    await done
  } finally { db.close() }
  notify()
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a")
  const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"
  anchor.href = url; anchor.download = name.replace(/[<>:"/\\|?*]/g, "_").replace(/\.(png|jpe?g|webp)$/i, "") + "." + extension
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
