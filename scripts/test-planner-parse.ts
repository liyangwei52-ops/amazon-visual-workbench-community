import { readFileSync } from "node:fs"

import { inferPlannerRatio, parsePlannerRewrite } from "../src/lib/planner-parse"

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${msg}`)
  }
}

const sample = `【提示词 1｜主视觉】生成一张1:1方形Amazon PDP商品展示图，纯白背景。图1是产品唯一事实来源。画面居中完整展示产品，真实阴影。

【提示词 2｜尺寸图】生成一张1:1方形Amazon产品尺寸与数量信息图。图1是产品唯一事实来源。背景为干净白色，顶部设置红色横向标题栏，保留标注走向，不生成任何冗余尺寸数字。

【提示词 3｜场景图】\`\`\`text
生成一张1:1方形Amazon生活方式图。图1是产品唯一事实来源。一名20至30岁的成年女性站在明亮的派对场景中。
\`\`\`

【提示词 4｜A+ 图1】生成一张横版Amazon A+图片，比例约16:9，背景完整铺满浅粉色。图1是产品唯一事实来源。`

const items = parsePlannerRewrite(sample)

assert(items.length === 4, `解析出 4 条（实际 ${items.length}）`)
assert(items[0]?.title === "主视觉", `第1条版位名=主视觉（实际 ${items[0]?.title}）`)
assert(items[0]?.prompt.includes("纯白背景"), "第1条内容保留正文")
assert(items[1]?.title === "尺寸图", `第2条版位名=尺寸图（实际 ${items[1]?.title}）`)
assert(!items[1]?.prompt.includes("【提示词"), "内容不含标题残留")
assert(items[2]?.prompt.startsWith("生成一张1:1方形Amazon生活方式图"), "第3条去掉代码块围栏")
assert(items[3]?.title === "A+ 图1", `第4条版位名含 A+（实际 ${items[3]?.title}）`)

// 无格式兜底
const fallback = parsePlannerRewrite("一段没有分段的完整提示词内容")
assert(fallback.length === 1 && fallback[0]?.prompt.includes("完整提示词"), "无格式时整段兜底为 1 条")

// 空输入
assert(parsePlannerRewrite("").length === 0, "空输入返回 0 条")
assert(inferPlannerRatio("单人场景图", "生成一张4:5竖版生活方式图") === "4:5", "显式 4:5 画幅自动回填")
assert(inferPlannerRatio("A+ 第一张", "生成一张横版品牌图") === "16:9", "A+ 未写比例时默认宽幅")
assert(inferPlannerRatio("主视觉", "生成一张1:1方形副图") === "1:1", "方形副图保持 1:1")

const detailedPositive = "产品硬约束：完整保留实际外轮廓、配件数量和纹理；竞品视觉迁移：左侧人物、右侧四个信息卡片；".repeat(50)
const detailedNegative = "禁止改变商品结构、减少配件或虚构文案。".repeat(30)
const fullFormat = "【提示词 1｜详细版位】\n【最终 AI 绘图 Prompt】\n```text\n【正向 Prompt】\n"
  + detailedPositive + "\n\n【负向 Prompt】\n" + detailedNegative + "\n```"
const fullItems = parsePlannerRewrite(fullFormat)
assert(parsePlannerRewrite(fullFormat, true).length === 1, "严格分发接受完整格式")
for (const invalid of ["未分段的策划", fullFormat.replace("负向 Prompt", "未完成"), fullFormat.replace("提示词 1｜", "提示词 2｜"), fullFormat + fullFormat]) {
  let rejected = false
  try { parsePlannerRewrite(invalid, true) } catch { rejected = true }
  assert(rejected, "严格分发拒绝未分段、残缺或重复编号结果")
}
assert(fullItems.length === 1 && fullItems[0].prompt.includes(detailedPositive) && fullItems[0].prompt.includes(detailedNegative), "完整长提示词分发保留全部正向和负向内容")
assert(!fullItems[0].prompt.includes("【最终 AI 绘图 Prompt】") && !fullItems[0].prompt.includes("```"), "分发仅去除外层包装")

// Model formatting variants must not discard a paid, otherwise complete plan.
const variants = [
  "## 【提示词 1|德语版位】\r\n【最终 AI 绘图 Prompt】\r\n```text\r\n【正向提示词】\r\n产品放在左侧，上图文案“Für dich”。\r\n```\r\n【负面约束】\r\n```text\r\n不增加配件，不改变德语原文。\r\n```",
  "**【提示词 1：德语版位】**\n### 正向 Prompt：\n产品放在左侧，上图文案“Für dich”。\n### 负向提示词：\n不增加配件，不改变德语原文。",
  "[提示词 1|德语版位]\nPositive Prompt: 产品放在左侧，上图文案“Für dich”。\nNegative Prompt: 不增加配件，不改变德语原文。",
  "【提示词 1｜德语版位】\n【最终 AI 绘图 Prompt】\n```text\n【正向 Prompt】\n产品放在左侧，上图文案“Für dich”。\n```\n```text\n【负向 Prompt】\n不增加配件，不改变德语原文。\n```",
]
for (const [index, variant] of variants.entries()) {
  const parsed = parsePlannerRewrite(variant, true)
  assert(parsed.length === 1 && parsed[0].title === "德语版位", `格式变体${index + 1}按一框分发`)
  assert(parsed[0]?.prompt.includes("产品放在左侧，上图文案“Für dich”。") && parsed[0]?.prompt.includes("不增加配件，不改变德语原文。"), `格式变体${index + 1}完整保留正负向及德语原文`)
  assert(!parsed[0]?.prompt.includes("```"), `格式变体${index + 1}只清除代码围栏`)
}
const combined = "产品放在左侧，白底柔光，上图文字为“Für dich”。不要增加配件或更改德语拼写。"
assert(parsePlannerRewrite("【提示词 1｜合并指令】\n" + combined, true)[0]?.prompt === combined, "合并书写的画面和避免项完整保留，不因缺少字段标签拒绝")
const unlabelledPositive = "1:1 合成商品信息图，左侧完整主体，右侧三个局部框。\n上图文字：“寸法と特徴”。\n【负向 Prompt】\n不增加部件，不把局部长度当成总长。"
const recovered = parsePlannerRewrite("【提示词 1｜未写正向标签】\n【最终 AI 绘图 Prompt】\n```text\n" + unlabelledPositive + "\n```", true)[0].prompt
assert(recovered === "【正向 Prompt】\n" + unlabelledPositive, "有完整画面正文和负向但缺正向标签，自动分发只补标签，不改正文")
const reversed = parsePlannerRewrite("【提示词 1｜顺序变体】\n【负向 Prompt】\n不要增加配件。\n【正向 Prompt】\n白底完整展示商品。", true)[0].prompt
assert(reversed.startsWith("【正向 Prompt】") && reversed.includes("白底完整展示商品。") && reversed.includes("不要增加配件。"), "正负向顺序变化时保留两段并按可执行顺序整理")
const nine = Array.from({ length: 9 }, (_, index) => {
  const n = index + 1
  const content = n === 5 ? variants[0] : n === 6 ? variants[3] : fullFormat
  return content.replace(/提示词 1/, `提示词 ${n}`)
}).join("\n\n")
assert(parsePlannerRewrite(nine, true).length === 9, "第5条标题变体、第6条分开代码框不导致九条整批丢失")
for (const invalid of [
  "【提示词 1｜空正文】\n【正向 Prompt】\n【负向 Prompt】\n不添加字。",
  "【提示词 1｜空负向】\n【正向 Prompt】\n完整产品画面。\n【负向 Prompt】",
  "【提示词 1】\n" + combined,
  fullFormat + "\n【提示词 2｜未返回】",
  "【提示词 1｜只有负向】\n【负向 Prompt】\n不要增加部件。",
]) {
  let rejected = false
  try { parsePlannerRewrite(invalid, true) } catch { rejected = true }
  assert(rejected, "真实空字段/缺少版位/未返回正文仍拒绝，不编造缺失内容")
}

const actualOutputPath = process.argv[3]
if (actualOutputPath) {
  const actualEntries = parsePlannerRewrite(readFileSync(actualOutputPath, "utf8"))
  assert(actualEntries.length > 0, `真实模型输出分发 ${actualEntries.length} 条提示词`)
  assert(actualEntries.every((entry) => entry.title && entry.prompt), "真实模型输出每条均有标题和正文")
  console.log(`真实输出比例：${actualEntries.map((entry) => inferPlannerRatio(entry.title, entry.prompt)).join(", ")}`)
}
