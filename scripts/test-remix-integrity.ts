import assert from "node:assert/strict"
import { parseRemixRewrite } from "../src/lib/remix-parse"
import { applyRequestedOutputSize } from "../src/lib/prompt-utils"
const prompt = "【正向 Prompt】\n" + "完整构图与新产品外观。".repeat(500) + "\n【负向 Prompt】禁止旧商品印花。"
const section = (number: number) => `【提示词 ${number}】\n\`\`\`text\n${prompt}\n\`\`\``
assert.deepEqual(parseRemixRewrite(section(1)+section(2),2),[prompt,prompt])
assert.throws(()=>parseRemixRewrite(section(1),2),/1\/2/)
assert.throws(()=>parseRemixRewrite(section(1)+section(1),2),/重复/)
assert.throws(()=>parseRemixRewrite(section(1)+section(3),2),/超出/)
assert.throws(()=>parseRemixRewrite('【提示词 1】只有正向',1),/缺少/)
assert.ok(applyRequestedOutputSize(prompt,'2048x1152').includes('2048x1152'))
console.log('PASS: 长提示词无压缩；漏项、重复、越界与残缺输出阻止整批替换；当前尺寸显式覆盖旧尺寸')
