// 验证 parseBatchRewrite 批量改写解析逻辑（逻辑与 visual-remix.tsx 内实现一致）
function parseBatchRewrite(output: string, count: number): string[] {
  const results = new Array<string>(count).fill("")
  const sections = output.split(/【提示词\s*(\d+)】/i)
  for (let i = 1; i + 1 < sections.length; i += 2) {
    const index = parseInt(sections[i], 10)
    if (Number.isNaN(index) || index < 1 || index > count) continue
    let content = (sections[i + 1] || "").trim()
    const codeBlockMatch = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(content)
    if (codeBlockMatch && codeBlockMatch[1].trim()) {
      content = codeBlockMatch[1].trim()
    }
    results[index - 1] = content
  }
  return results
}

let pass = 0
let fail = 0

function check(name: string, actual: string[], expected: string[]) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
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

// Case1: 3 条标准输出（代码块）
const output1 = `【提示词 1】
\`\`\`text
改写后的第1条提示词
\`\`\`
【提示词 2】
\`\`\`
第2条内容
\`\`\`
【提示词 3】
\`\`\`
第3条内容
\`\`\``
check("Case1 三条约代码块", parseBatchRewrite(output1, 3), ["改写后的第1条提示词", "第2条内容", "第3条内容"])

// Case2: 无代码块直接文本
const output2 = `【提示词 1】
纯文本第一条
【提示词 2】
纯文本第二条`
check("Case2 无代码块", parseBatchRewrite(output2, 2), ["纯文本第一条", "纯文本第二条"])

// Case3: 条数不足/缺失（AI 只返回了 2 条但输入 3 条）→ 缺失保持空
const output3 = `【提示词 1】
第一条内容
【提示词 3】
第三条内容`
check("Case3 缺第2条", parseBatchRewrite(output3, 3), ["第一条内容", "", "第三条内容"])

// Case4: 完全无法解析 → 全空
check("Case4 无法解析", parseBatchRewrite("没有任何标记的输出", 2), ["", ""])

// Case5: 变体标记（中英文混排）
const output5 = `【提示词 1】
第一
【提示词 2】
第二`
check("Case5 变体", parseBatchRewrite(output5, 2), ["第一", "第二"])

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
