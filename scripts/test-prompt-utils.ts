// 验证分析段落提取与生图指令组装
// 通过 tsx 直接运行：npx tsx scripts/test-prompt-utils.ts
import { applyRequestedOutputSize, extractFinalPrompt, prepareImagePrompt } from "../src/lib/prompt-utils"

let pass = 0
let fail = 0

function check(name: string, actual: string, expected: string) {
  const ok = actual === expected
  if (ok) {
    pass += 1
    console.log(`PASS: ${name}`)
  } else {
    fail += 1
    console.log(`FAIL: ${name}`)
    console.log(`  expected: ${JSON.stringify(expected)}`)
    console.log(`  actual:   ${JSON.stringify(actual)}`)
  }
}

// Case 1: 标准输出 —— 含竞品分析/产品分析/映射 + 最终提示词（代码块）
const output1 = `【竞品分析】
竞品 A：暖光氛围、木纹背景，突出家居感。
竞品 B：冷白背景、多角度展示。

【产品分析】
我方产品为不锈钢锅具，红色硅胶把手。

【竞品 → 产品映射】
借鉴 A 的暖光场景，保留我方产品外观。

【最终 AI 绘图 Prompt】
\`\`\`
暖色调厨房场景，木质台面，不锈钢汤锅置于中央，红色硅胶把手清晰可见，蒸汽升腾，侧光勾勒金属质感，浅景深，高端电商主图风格。
\`\`\``

check(
  "Case1 标准输出 → 只取最终提示词代码块内容",
  extractFinalPrompt(output1),
  "暖色调厨房场景，木质台面，不锈钢汤锅置于中央，红色硅胶把手清晰可见，蒸汽升腾，侧光勾勒金属质感，浅景深，高端电商主图风格。"
)

// Case 2: 最终提示词后还有内容（防止混入其他章节）
const output2 = `【产品分析】
xxx

【最终 AI 绘图 Prompt】
白底棚拍，俯视 45°，产品居中。

【竞品分析】
不应出现的分析内容`

check(
  "Case2 最终段落后有后续章节 → 截断",
  extractFinalPrompt(output2),
  "白底棚拍，俯视 45°，产品居中。"
)

// Case 3: 无代码块，无【最终】标记（回退全文）
const output3 = `【竞品分析】\n竞品构图分析……`
check("Case3 找不到最终标记 → 回退全文", extractFinalPrompt(output3), output3)

// Case 4: 变体标记【最终Prompt】
const output4 = `【最终Prompt】
变体标记提示词内容`

check("Case4 变体标记【最终Prompt】", extractFinalPrompt(output4), "变体标记提示词内容")

// Case 5: 负向约束也必须进入实际生图请求
const output5 = `暖色调厨房场景，木质台面。

【负向 Prompt】
模糊、低清晰度、水印`

check(
  "Case5 正负向要求合并为一条生图指令",
  prepareImagePrompt(output5),
  "暖色调厨房场景，木质台面。\n\n避免：模糊、低清晰度、水印"
)

// Case 6: 无负向标记 → 全文
const output6 = `纯正向提示词内容`
check("Case6 无负向标记 → 全文", prepareImagePrompt(output6), output6)

const output7 = `【正向 Prompt】\n展示图1的原始产品。\n\n【负向 Prompt】\n不要新增配件。`
check("Case7 去掉章节标签并保留具体避免项", prepareImagePrompt(output7), "展示图1的原始产品。\n\n避免：不要新增配件。")

check(
  "Case8 用户当前尺寸覆盖旧提示词比例",
  String(applyRequestedOutputSize("生成一张1:1方图。", "2048x1152").includes("生成一张16:9横版图。")),
  "true"
)

const alignedOnce = applyRequestedOutputSize("生成一张横版图，画布严格为 3072×2048 像素。", "2048x2560")
check(
  "Case9 提示词框旧像素改为用户设定",
  String(alignedOnce.includes("画布严格为 2048x2560 像素") && !alignedOnce.includes("3072×2048")),
  "true"
)
check(
  "Case10 重复入队不会重复最终尺寸",
  String(applyRequestedOutputSize(alignedOnce, "2048x2560").split("<!-- avw:canvas:v2 -->").length),
  "2"
)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
