export type AnalysisImage = { dataUrl: string; role: string; index: number }
import { imageIdentityDescription } from "./image-identities"

/** 代理与已允许服务商的浏览器请求使用完全相同的多图身份说明。 */
export function buildAnalysisContent(userText: string, images: AnalysisImage[]) {
  const text = [
    userText,
    "请按系统提示词规定的任务和输出格式处理以下输入。",
    "图片身份说明：",
    images.length ? images.map(image => imageIdentityDescription(image.index, image.role)).join("\n") : "（本次未附带任何图片）",
  ].filter(Boolean).join("\n\n")
  return [
    { type: "text" as const, text },
    ...images.flatMap(image => [
      { type: "text" as const, text: `下面这一张是${imageIdentityDescription(image.index, image.role)}` },
      { type: "image_url" as const, image_url: { url: image.dataUrl } },
    ]),
  ]
}
