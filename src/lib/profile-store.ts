export const PROFILE_KEY = "amazon-workbench.profile.v1"
export const PROFILE_EVENT = "amazon-workbench.profile-changed"
export type PersonalProfile = { name: string; role: string; bio: string; avatar: string; autoArchive: boolean }
export const defaultProfile: PersonalProfile = { name: "设计师", role: "电商视觉设计", bio: "", avatar: "", autoArchive: true }
export function readProfile(): PersonalProfile {
  if (typeof window === "undefined") return defaultProfile
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}")
    return { name: typeof value.name === "string" ? value.name.slice(0, 40) : defaultProfile.name,
      role: typeof value.role === "string" ? value.role.slice(0, 80) : defaultProfile.role,
      bio: typeof value.bio === "string" ? value.bio.slice(0, 500) : "",
      avatar: typeof value.avatar === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(value.avatar) && value.avatar.length < 100000 ? value.avatar : "",
      autoArchive: value.autoArchive !== false }
  } catch { return defaultProfile }
}
export function saveProfile(profile: PersonalProfile) {
  if (!profile.name.trim()) throw new Error("请填写昵称")
  const normalized = { ...profile, name: profile.name.trim().slice(0, 40), role: profile.role.trim().slice(0, 80), bio: profile.bio.trim().slice(0, 500) }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(PROFILE_EVENT))
  return normalized
}
