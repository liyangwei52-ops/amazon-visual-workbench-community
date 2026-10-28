/* 单元测试：条目标题按位置重编号（01 对应提示词 1） */
import { normalizeEntryTitle } from "../src/components/visual-suite"

const cases: Array<[string, number, string]> = [
  // 删除过中间条目后：位置 0 的默认标题应重编号为「提示词 1」
  ["提示词 2", 0, "提示词 1"],
  // 位置 1 重编号为「提示词 2」
  ["提示词 1", 1, "提示词 2"],
  // 自定义标题保留
  ["主图", 0, "主图"],
  ["场景生活图", 3, "场景生活图"],
  // 空标题回退位置编号
  ["", 2, "提示词 3"],
  // 无空格变体
  ["提示词5", 1, "提示词 2"],
]

let failed = 0
for (const [input, index, expected] of cases) {
  const actual = normalizeEntryTitle(input, index)
  const ok = actual === expected
  if (!ok) failed += 1
  console.log(`${ok ? "PASS" : "FAIL"} normalizeEntryTitle(${JSON.stringify(input)}, ${index}) = ${JSON.stringify(actual)} (期望 ${JSON.stringify(expected)})`)
}
console.log(`\n${cases.length - failed}/${cases.length} 通过`)
process.exit(failed > 0 ? 1 : 0)
