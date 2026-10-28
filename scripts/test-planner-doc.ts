import JSZip from "jszip"
import { writeFileSync } from "node:fs"
import { docToAttachment, extractDocxInfo, extractXlsxInfo } from "../src/lib/planner-doc"

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${msg}`)
  }
}

const TEST_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAFUlEQVR4nGP8z8Dwn4GBgYGJAQoAHQEAzQEBfE7siwAAAABJRU5ErkJggg=="
const TEST_JPG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="

async function main() {
  // ===== 构造测试 docx =====
  const docx = new JSZip()
  docx.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>主视觉 | 白底主图，产品居中</w:t></w:r></w:p>
        <w:p><w:r><w:t>尺寸图 | 展示产品尺寸，不虚构数字</w:t></w:r></w:p>
        <w:p><w:r><w:t>场景图 | 派对场景，人物可出镜</w:t></w:r></w:p>
      </w:body>
    </w:document>`
  )
  docx.file("word/media/image1.png", Buffer.from(TEST_PNG_B64, "base64"))
  docx.file("word/media/image2.jpg", Buffer.from(TEST_JPG_B64, "base64"))
  docx.file("word/media/image3.jpg", Buffer.from(TEST_JPG_B64, "base64"))
  docx.file("word/media/image4.jpg", Buffer.from(TEST_JPG_B64, "base64"))
  docx.file("word/media/image5.jpg", Buffer.from(TEST_JPG_B64, "base64"))
  docx.file("word/media/image6.jpg", Buffer.from(TEST_JPG_B64, "base64"))
  const docxBuf = await docx.generateAsync({ type: "nodebuffer" })
  writeFileSync("scripts/test-plan.docx", docxBuf)

  const docxInfo = await extractDocxInfo(
    new File([new Uint8Array(docxBuf).buffer], "策划表.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
  )
  assert(docxInfo.type === "docx", "docx 类型识别")
  assert(docxInfo.text.includes("主视觉 | 白底主图"), "docx 提取段落文案")
  assert(docxInfo.text.includes("场景图"), "docx 提取第三段")
  assert(docxInfo.images.length === 5, `docx 竞品图最多 5 张（实际 ${docxInfo.images.length}）`)
  assert(docxInfo.droppedImages === 1, `docx 超出 1 张被丢弃（实际 ${docxInfo.droppedImages}）`)

  // ===== 构造测试 xlsx =====
  const xlsx = new JSZip()
  xlsx.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
      <si><t>主视觉</t></si>
      <si><t>白底主图，产品居中</t></si>
      <si><t>尺寸图</t></si>
      <si><t>展示产品尺寸</t></si>
    </sst>`
  )
  xlsx.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
      </sheetData>
    </worksheet>`
  )
  xlsx.file("xl/media/image1.png", Buffer.from(TEST_PNG_B64, "base64"))
  xlsx.file("xl/media/image2.jpg", Buffer.from(TEST_JPG_B64, "base64"))
  xlsx.file("xl/media/image3.gif", Buffer.from("GIF89a", "ascii"))
  const xlsxBuf = await xlsx.generateAsync({ type: "nodebuffer" })
  writeFileSync("scripts/test-plan.xlsx", xlsxBuf)

  const xlsxInfo = await extractXlsxInfo(
    new File([new Uint8Array(xlsxBuf).buffer], "策划表.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  )
  assert(xlsxInfo.type === "xlsx", "xlsx 类型识别")
  assert(xlsxInfo.text.includes("主视觉"), "xlsx 提取 sharedStrings 文本")
  assert(xlsxInfo.text.includes("A: 主视觉"), "xlsx 按单元格行输出 A")
  assert(xlsxInfo.text.includes("B: 展示产品尺寸"), "xlsx 按单元格行输出 B")
  assert(xlsxInfo.images.length === 2, `xlsx 竞品图 2 张（实际 ${xlsxInfo.images.length}）`)
  assert(xlsxInfo.droppedImages === 1, `不支持的 GIF 已跳过并计数（实际 ${xlsxInfo.droppedImages}）`)

  // ===== 直接透传：docToAttachment 不解析内容，原样打包给模型 =====
  const docxAttach = await docToAttachment(
    new File([new Uint8Array(docxBuf).buffer], "策划表.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
  )
  assert(docxAttach.type === "docx", "docToAttachment docx 类型识别")
  assert(
    docxAttach.dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"),
    "docToAttachment dataUrl 为原始文档 MIME（不做图片化）"
  )
  assert(docxAttach.size === docxBuf.length, "docToAttachment 保留原始字节数")

  const xlsxAttach = await docToAttachment(
    new File([new Uint8Array(xlsxBuf).buffer], "策划表.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  )
  assert(
    xlsxAttach.dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"),
    "docToAttachment xlsx dataUrl MIME 正确"
  )
  const txtAttach = await docToAttachment(new File(["主视觉 | 白底主图"], "策划.txt", { type: "text/plain" }))
  assert(txtAttach.dataUrl.startsWith("data:text/plain;base64,"), "docToAttachment txt dataUrl MIME 正确")
}

main().catch((e) => { console.error(e); process.exit(1) })
