import assert from "node:assert/strict"
import { imagePromptProfile, analysisImageModelNote } from "../src/lib/model-prompt-profile"
import { promptForImagePlan, resolveImagePlan } from "../src/lib/model-image-plan"
import { AMAZON_PROMPT_POLICY } from "../src/lib/amazon-prompt-policy"
import { MARKETING_COPY_RULES } from "../src/lib/analysis-prompt-rules"
import { PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT, isLegacyDefaultPrompt } from "../src/lib/visual-strategist-prompt"
const brief = '商品尺寸12×80cm，保留三件配件。文案“Happy Birthday! Alles Gute.”不可增删；负向：禁止多余配件。' + "完整细节；".repeat(2400)
const gpt = resolveImagePlan("gpt-image-2", "2048x2048", "2k", "1:1")
const gemini = resolveImagePlan("gemini-3-pro-image-preview", "2048x2048", "2k", "1:1")
const first = promptForImagePlan(brief, gpt)
assert.ok(first.includes(brief)); assert.equal(promptForImagePlan(first, gpt), first)
const switched = promptForImagePlan(first, gemini)
assert.ok(switched.includes(brief)); assert.ok(switched.includes("Execution rules for Gemini Image")); assert.ok(!switched.includes("Execution rules for GPT Image"))
assert.equal(promptForImagePlan(switched, gemini), switched)
assert.equal(promptForImagePlan(switched, gpt), first)
assert.ok(promptForImagePlan(brief, resolveImagePlan("gemini-3-pro-image", "auto")).includes("Gemini Image"))
assert.equal(imagePromptProfile("Gemini 3 Pro Image").family, "gemini")
assert.equal(imagePromptProfile("custom-provider-image").family, "generic")
assert.ok(analysisImageModelNote(gemini.model).includes("不因模型不同增添内容或强制字段"))
assert.ok(!AMAZON_PROMPT_POLICY.includes("GPT Image")); assert.ok(AMAZON_PROMPT_POLICY.includes("上图文案")); assert.ok(AMAZON_PROMPT_POLICY.includes(MARKETING_COPY_RULES), "模型补充保留统一站点/参考改写及指定非中文原文优先规则")
const oldDefault = PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT
assert.ok(isLegacyDefaultPrompt(oldDefault)); assert.ok(!isLegacyDefaultPrompt(oldDefault + "用户自定义"))
console.log("PASS: GPT/Gemini/其他模型后缀、完整长提示词与多语言原文保留、重复适配/换模型幂等、旧内置模板精确升级/自定义保留")
