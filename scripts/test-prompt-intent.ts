import assert from "node:assert/strict"
import { promptForImagePlan, resolveImagePlan } from "../src/lib/model-image-plan"
import { removeImageModelSuffix } from "../src/lib/model-prompt-profile"
import { removeRequestedOutputSettings } from "../src/lib/prompt-utils"
import { LEGACY_VISUAL_STRATEGIST_V3 } from "../src/lib/legacy-visual-strategist-v3"
import { isLegacyDefaultPrompt, VISUAL_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/visual-strategist-prompt"
import { REMIX_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/remix-strategist-prompt"
import { PLANNER_SYSTEM_PROMPT } from "../src/lib/planner-strategist-prompt"

// These assert request integrity and boundaries, NOT real image-model obedience or aesthetics.
const scenes = [
  "女儿（16岁）父亲（45岁）在画面左侧互相拥抱安慰，右侧为窗户，画面明亮。",
  "2×2四宫格背景素材：左上后花园，右上室内盆栽；左下父子站在左侧、右侧窗户；右下父女拥抱在左侧、右侧窗户。远景，每格前景预留空白便于后期添加产品；无任何文字、无水印、无标签。",
  "父子在画面左侧，右侧窗户。不要产品或标题，留空台面。",
  "产品图：仅展示新产品中的笔，三个局部细节框均来自同一支笔；商品尺寸12×80cm。上图文案为“Alles Gute!”和“Hello 2026”，仅各一次。",
  "商品与人物一起出现，瓶子放桌面、正常尺度，不挡住脸。保留标签的Brand原文，不另加广告。",
  "商品白底图：展示瓶子与包装，前景留白，不添加文字；右侧保留用户指定的三个无字使用图标。",
]
for (const model of ["gpt-image-2", "gemini-3-pro-image-preview", "custom-image"]) {
  for (const size of ["2048x2048", "auto"]) {
    const plan = resolveImagePlan(model, size, "2k", size === "auto" ? "auto" : "1:1")
    for (const scene of scenes) {
      const legacy = `【本次输出画布·最高优先级】最终成图必须使用2048x2048像素，保持商品完整。\n\n${scene}\n\n【最终画布尺寸】使用2048x2048，构图铺满。\n\n<!-- avw:image-model:v1 -->\n【生图执行补充｜旧模型】\n旧商品指令。\n<!-- /avw:image-model:v1 -->`
      const sent = promptForImagePlan(legacy, plan)
      assert.ok(sent.startsWith(scene), "短场景、四宫格、留白、明确商品和逐字文案原文必须保留")
      assert.ok(!sent.includes("【本次输出画布") && !sent.includes("【最终画布尺寸】") && !sent.includes("旧商品指令"))
      assert.ok(sent.includes("画布参数、模型说明、字段名、编号、注释与正负向标题均不得出现在图中"))
      assert.equal(sent.split("<!-- avw:image-model:v2 -->").length, 2)
      assert.equal(sent.split("<!-- avw:canvas:v2 -->").length, size === "auto" ? 1 : 2)
      assert.equal(promptForImagePlan(sent, plan), sent, "浏览器/服务端重复适配必须幂等")
      assert.equal(removeRequestedOutputSettings(removeImageModelSuffix(sent)), scene)
    }
  }
}
const arbitrary = '请保留用户注释 <!-- user:note --> 与完整需求。'
assert.ok(promptForImagePlan(arbitrary, resolveImagePlan("gpt-image-2", "auto")).includes(arbitrary))
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V3), "已发布v3精确默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V3 + "\n用户修改"))
assert.ok(!isLegacyDefaultPrompt(VISUAL_STRATEGIST_SYSTEM_PROMPT))
for (const role of [VISUAL_STRATEGIST_SYSTEM_PROMPT, REMIX_STRATEGIST_SYSTEM_PROMPT, PLANNER_SYSTEM_PROMPT]) {
  assert.ok(role.includes("额外上图文字：无") && role.includes("上传产品图不等于每张都要放产品"))
  assert.ok(role.includes("无文字只约束文字") && role.includes("都不等于无商品"))
  assert.ok(role.includes("15项") && role.includes("【无法完成】"))
}
console.log("PASS: 36组GPT/Gemini/通用×自动/指定画布×用户场景，旧包装移除/新包装幂等、短需求和完整文案保留、无文字与无商品分离、仅精确v3默认迁移（零网络，非模型画质验收）")
