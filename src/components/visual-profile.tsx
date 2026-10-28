"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { FolderOpenIcon, SaveIcon, Settings2Icon, UploadIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"
import { VisualSidebar } from "./visual-sidebar"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"
import { Switch } from "./ui/switch"
import { defaultProfile, readProfile, saveProfile, type PersonalProfile } from "@/lib/profile-store"
import { formatBytes, imageThumbnail } from "@/lib/asset-store"
import { useAssets } from "@/lib/use-assets"

export function VisualProfile() {
  const [profile, setProfile] = useState<PersonalProfile>(defaultProfile)
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState<PersonalProfile>(defaultProfile)
  const [storage, setStorage] = useState("")
  const { assets, error } = useAssets()
  const avatarInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const loaded = readProfile()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(loaded); setSaved(loaded); setReady(true)
    void navigator.storage?.estimate?.().then(value => setStorage(formatBytes(value.usage || 0))).catch(() => {})
  }, [])
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved)
  const avatar = async (file?: File) => {
    if (!file) return
    try { if (file.size > 5 * 1024 * 1024) throw new Error("头像不能超过5MB"); const { thumbnail } = await imageThumbnail(file, 128); setProfile(p => ({ ...p, avatar: thumbnail })) }
    catch (e) { toast.error(e instanceof Error ? e.message : "头像读取失败") }
  }
  return <div data-workspace className="mx-auto flex w-full min-w-0 workspace-shell flex-col gap-5 px-4 py-6 lg:flex-row">
    <VisualSidebar current="profile" />
    <main className="flex min-w-0 flex-1 flex-col gap-5">
      <header className="rounded-xl border bg-card p-5"><h1 className="flex items-center gap-2 text-xl font-semibold"><UserRoundIcon className="size-5" />个人中心</h1><p className="mt-2 text-xs leading-5 text-muted-foreground">管理个人资料、图片保存偏好和存储。当前为本地模式，资料与资产仅保存在此浏览器。</p></header>
      <form className="grid gap-5 xl:grid-cols-[1.4fr_1fr]" onSubmit={e => { e.preventDefault(); try { const value = saveProfile(profile); setProfile(value); setSaved(value); toast.success("个人设置已保存") } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败") } }}>
        <section className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">个人资料</h2><div className="flex flex-wrap items-center gap-4"><div className="flex size-20 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt="个人头像" className="size-full object-cover" />
          ) : <UserRoundIcon className="size-9 text-muted-foreground" />}
        </div><div className="flex flex-col gap-2"><Button type="button" variant="outline" size="sm" onClick={() => avatarInput.current?.click()}><UploadIcon className="size-3.5" />上传头像</Button>{profile.avatar && <Button type="button" variant="ghost" size="sm" onClick={() => setProfile(p => ({ ...p, avatar: "" }))}>移除头像</Button>}</div><input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传个人头像" className="hidden" onChange={e => { void avatar(e.target.files?.[0]); e.target.value = "" }} /></div>
          <label className="flex flex-col gap-2 text-xs font-medium">昵称<Input name="nickname" value={profile.name} maxLength={40} required disabled={!ready} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="你的称呼" /></label>
          <label className="flex flex-col gap-2 text-xs font-medium">职业 / 团队<Input name="role" value={profile.role} maxLength={80} onChange={e => setProfile(p => ({ ...p, role: e.target.value }))} placeholder="例如：品牌视觉设计师" /></label>
          <label className="flex flex-col gap-2 text-xs font-medium">个人简介<Textarea name="bio" value={profile.bio} maxLength={500} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} className="min-h-28 text-xs leading-5" placeholder="记录你的设计方向或常用风格…" /></label>
        </section>
        <div className="flex min-w-0 flex-col gap-5"><section className="rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">图片保存偏好</h2><label className="mt-4 flex items-start justify-between gap-4"><span><span className="text-xs font-medium">生成图片自动存入资产中心</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">保存生成原图、尺寸和完整提示词，方便后续查看与调用。关闭后仍可在结果卡手动保存。</span></span><Switch aria-label="生成图片自动存入资产中心" checked={profile.autoArchive} onCheckedChange={checked => setProfile(p => ({ ...p, autoArchive: checked }))} /></label></section>
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">本地存储</h2><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/50 p-3"><p className="text-xl font-semibold">{assets.length}</p><p className="mt-1 text-xs text-muted-foreground">图片资产</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-xl font-semibold">{formatBytes(assets.reduce((sum, a) => sum + a.bytes, 0))}</p><p className="mt-1 text-xs text-muted-foreground">图片原图大小</p></div></div>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<p className="text-xs leading-5 text-muted-foreground">{storage && <>本站浏览器存储约 {storage}。<br /></>}当前不跨设备同步；清除浏览器网站数据会删除本地内容。请在资产中心导出图片备份。</p><Link href="/assets" className="flex items-center gap-2 text-xs underline underline-offset-4"><FolderOpenIcon className="size-4" />管理图片与导出备份</Link></section>
          <section className="rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">API 设置</h2><p className="my-3 text-xs leading-5 text-muted-foreground">接口、密钥和模型在统一设置页管理。</p><Link href="/settings" className="flex items-center gap-2 text-xs underline underline-offset-4"><Settings2Icon className="size-4" />前往 API 设置</Link></section>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 xl:col-span-2"><p className="text-xs text-muted-foreground">{dirty ? "有未保存的修改" : "设置已保存"}</p><Button type="submit" disabled={!ready || !dirty}><SaveIcon className="size-4" />保存个人设置</Button></div>
      </form>
    </main>
  </div>
}
