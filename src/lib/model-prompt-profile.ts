import { IMAGE_EXECUTION_BOUNDARY } from "./image-intent-policy"

/** Model execution guidance only: never shorten the user's product brief or change exact copy. */
export function imagePromptProfile(model: string) {
  const normalized = model.trim().toLowerCase().replace(/\s+/g, "-")
  if (/^gemini-(?:3-pro-image|3\.1-flash-image)(?:-preview)?$/.test(normalized)) return {
    family: "gemini", label: "Gemini Image",
    summary: "先确定本图出镜主体与空间关系，明确是否有额外上图文字；有文案才安排逐字排版。采用原生比例与清晰度，实际像素以返回为准。",
    suffix: "按本条任务生成一张图，以具体位置、景别、动作、光线和前后层次组织主体。仅在有明确上图文案时逐字呈现，保留原语言、大小写、标点及位置；遵守无字、留白和原负向要求。原生比例与清晰度只控制输出，不画成说明面板。",
  }
  if (/^gpt-image-(?:\d|latest)/.test(normalized)) return {
    family: "gpt", label: "GPT Image",
    summary: "先确定本图用途和主体范围，再区分出镜商品的保真项与可变场景；有明确文案才逐字排版，画布按适配像素提交。",
    suffix: "按本条任务生成一张图，保持要求出镜的主体及明确不变项，场景、动作和光线按需求组织。要求展示商品时保留其外观、结构和真实表面标识；仅对明确的上图文案逐字排版，遵守无字、留白和原负向要求。输出像素只控制画布，不转为可见文字。",
  }
  return {
    family: "generic", label: "其他生图模型",
    summary: "使用通用的完整画面描述；未内置此模型的专属提示词或能力保证，请核对服务商支持的参数。",
    suffix: "按完整需求和主体范围生成一张图，遵守图片身份、正负向要求及本次画布设置；只在要求展示商品时使用商品事实，只在有明确上图文案时逐字排版，不增造内容。",
  }
}

// Only this application-owned block is replaced when the model changes.
const managedSuffix = /\n*<!-- avw:image-model:(v[12]) -->[\s\S]*?<!-- \/avw:image-model:\1 -->/g
export function removeImageModelSuffix(prompt: string) { return prompt.replace(managedSuffix, "") }

export function withImageModelSuffix(prompt: string, model: string): string {
  const profile = imagePromptProfile(model)
  return removeImageModelSuffix(prompt) + `\n\n<!-- avw:image-model:v2 -->\nExecution rules for ${profile.label} — instructions only, never render as text:\n${IMAGE_EXECUTION_BOUNDARY}\n${profile.suffix}\n<!-- /avw:image-model:v2 -->`
}

/** The analysis LLM writes for the saved image model, independently of its own model. */
export function analysisImageModelNote(model: string): string {
  const profile = imagePromptProfile(model)
  return `\n\n【目标生图模型｜${profile.label}】\n${profile.summary}\n按主体、空间关系和必要约束写清画面，不因模型不同增添内容或强制字段；完整保留有效需求、逐字文案与相关正负向约束。输出格式遵循当前入口合同。`
}
