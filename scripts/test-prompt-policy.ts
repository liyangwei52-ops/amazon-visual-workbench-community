import { readFileSync } from "node:fs"
import { LEGACY_GPT_IMAGE_POLICY } from "../src/lib/amazon-prompt-policy"
import { PLANNER_SYSTEM_PROMPT } from "../src/lib/planner-strategist-prompt"
import { isLegacyDefaultPrompt, VISUAL_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/visual-strategist-prompt"
import { LEGACY_VISUAL_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/legacy-visual-strategist-prompt"

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
  console.log("PASS: " + message)
}
check(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_SYSTEM_PROMPT), "旧内置压缩模板升级")
check(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_SYSTEM_PROMPT + "\n用户自定义要求"), "用户修改过的模板保留")
check(!isLegacyDefaultPrompt(VISUAL_STRATEGIST_SYSTEM_PROMPT), "新模板不反复迁移")
check([PLANNER_SYSTEM_PROMPT,VISUAL_STRATEGIST_SYSTEM_PROMPT].every(prompt => !/600[–—-]|900 个|2[–—-]4 个|1[–—-]3 条/.test(prompt)), "两处运行模板不含旧字数和要点数量限制")
const sourcePath = process.argv[3]
if (sourcePath) {
  const source = readFileSync(sourcePath,"utf8").trim()
  const beforeOutput = source.slice(0,source.indexOf("十五、最终输出格式"))
  const afterOutput = source.slice(source.indexOf("十六、最终自检"))
  check(LEGACY_GPT_IMAGE_POLICY.includes(beforeOutput) && LEGACY_GPT_IMAGE_POLICY.includes(afterOutput), "用户历史模板保留于兼容常量，不以新版覆盖历史备份")
}
