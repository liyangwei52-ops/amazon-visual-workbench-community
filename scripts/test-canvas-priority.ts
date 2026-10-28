import assert from "node:assert/strict"
import { applyRequestedOutputSize } from "../src/lib/prompt-utils"
import { promptForImagePlan, resolveImagePlan } from "../src/lib/model-image-plan"
import { imageOutputWarning } from "../src/lib/image-output-check"

const product = "商品保持方形包装，实测尺寸12×80cm；商品比例1:1。屏幕分辨率1920x1080像素；内嵌4:3横版照片框。"
const source = `1.画面任务：生成完整商品尺寸信息图。\n2.画布尺寸严格为2048×1152像素，横向16:9构图。\n3.输出比例16:9；整体画面采用横版。\n4.aspect ratio:16:9 widescreen composition; image size:2048x1152 pixels.\n5.${product}\n6.完整光影、配色和负向约束：禁止新增配件。`
const square = applyRequestedOutputSize(source, "2048x2048")
assert.ok(square.startsWith("1.画面任务："), "用户画面需求在前，技术设置独立置后")
assert.ok(!square.includes("16:9"), square)
assert.ok(!square.includes("2048×1152") && !square.includes("2048x1152"))
assert.ok(square.includes(product), "商品外观、实测尺寸、屏幕规格、局部照片框必须保留")
assert.ok(square.includes("禁止新增配件"))
assert.ok(square.includes("整体画面采用方形"))
assert.ok(square.includes("1:1构图"))
assert.equal(applyRequestedOutputSize(square, "2048x2048"), square, "多次适配必须幂等")
const portrait = applyRequestedOutputSize(square, "2048x2560")
assert.ok(portrait.includes("4:5构图"))
assert.ok(!portrait.includes("2048x2048"))
assert.ok(portrait.includes(product))
const facts = "画布中放置方形产品。商品宽高比3:2，实物长宽比4:5。内嵌横向4:3构图。"
assert.ok(applyRequestedOutputSize(facts, "2048x2560").includes(facts), "不能改写商品形状与商品、局部构图比例")
assert.equal(portrait.split("<!-- avw:canvas:v2 -->").length, 2)
assert.ok(!portrait.includes("【最终画布尺寸】") && !portrait.includes("【本次输出画布·最高优先级】"))
assert.ok(applyRequestedOutputSize("生成一张1:1方图。", "2048x1152").includes("生成一张16:9横版图。"))
const gemini = resolveImagePlan("gemini-3-pro-image", "2048x1152", "2k", "16:9")
const native = promptForImagePlan("完整内容。画幅1:1，方形画布。", gemini)
assert.ok(native.includes("Native aspect ratio: 16:9"))
assert.ok(native.includes("Resolution setting: 2K"))
assert.ok(!native.includes("2752x1536"), "Gemini像素估计只供界面展示，不与原生比例同时强塞进绘图指令")
assert.ok(!native.includes("179:96"))
assert.equal(promptForImagePlan(native, gemini), native)
assert.ok(imageOutputWarning("2048x2048", 1659, 948).startsWith("比例不符"))
assert.equal(imageOutputWarning("2048x1152", 2048, 1152), "")
assert.equal(imageOutputWarning("2752x1536", 2750, 1536), "")
assert.ok(imageOutputWarning("2048x2048", 1024, 1024).includes("画幅比例接近"))
console.log("PASS: 多段旧画幅和像素清理、商品与局部事实保留、重复适配与换比例、Gemini原生比例、返回比例不符与像素提示")
