import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { AMAZON_PROMPT_POLICY } from "../src/lib/amazon-prompt-policy"
import { VISUAL_STRATEGIST_SYSTEM_PROMPT, PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT, isLegacyDefaultPrompt } from "../src/lib/visual-strategist-prompt"
import { REMIX_STRATEGIST_SYSTEM_PROMPT } from "../src/lib/remix-strategist-prompt"
import { PLANNER_SYSTEM_PROMPT } from "../src/lib/planner-strategist-prompt"
import { extractFinalPrompt } from "../src/lib/prompt-utils"
import { parseRemixRewrite } from "../src/lib/remix-parse"
import { parsePlannerRewrite } from "../src/lib/planner-parse"
import { LEGACY_VISUAL_STRATEGIST_V4 } from "../src/lib/legacy-visual-strategist-v4"
import { LEGACY_VISUAL_STRATEGIST_V5 } from "../src/lib/legacy-visual-strategist-v5"
import { LEGACY_VISUAL_STRATEGIST_V6 } from "../src/lib/legacy-visual-strategist-v6"
import { LEGACY_VISUAL_STRATEGIST_V7 } from "../src/lib/legacy-visual-strategist-v7"
import { LEGACY_VISUAL_STRATEGIST_V8 } from "../src/lib/legacy-visual-strategist-v8"
import { LEGACY_VISUAL_STRATEGIST_V9 } from "../src/lib/legacy-visual-strategist-v9"
import { LEGACY_VISUAL_STRATEGIST_V10 } from "../src/lib/legacy-visual-strategist-v10"
import { LEGACY_VISUAL_STRATEGIST_V11 } from "../src/lib/legacy-visual-strategist-v11"
import { LOCAL_SCENE_VARIATION_RULES } from "../src/lib/local-scene-variation"
import { WORKBENCH_REFERENCE_RULES } from "../src/lib/workbench-reference-policy"
import { LEGACY_VISUAL_STRATEGIST_V12 } from "../src/lib/legacy-visual-strategist-v12"
import { IMAGE_INTENT_RULES } from "../src/lib/image-intent-policy"
import { MARKETING_COPY_RULES, PRECISE_SCENE_RULES } from "../src/lib/analysis-prompt-rules"

// Representative protocol fixtures, not a claim that an actual LLM follows these semantics.
const prompt = '【正向 Prompt】\n1. 任务：仅展示新商品中的一支笔；2. 身份：图1主产品、图2补充；3. 保真；4. 单支笔印花与结构保持；5. 左主物右三个同一主体细节框；6. 无人物；7. 静物；8. 浅色背景；9. 画布5:4；10. 左上柔光；11. 按真实表面质感；12. 原文“Alles Gute!”出现一次；13. 产品和文字清楚；14. 成品可用。\n【负向 Prompt】\n不出现旧商品红色和旧品牌，不把袋/本子加入单品细节框，不虚构尺寸。'
const fence = (text: string) => '```text\n' + text + '\n```'
assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(prompt)), prompt)
assert.deepEqual(parseRemixRewrite('【提示词 1】\n' + fence(prompt), 1), [prompt])
assert.deepEqual(parsePlannerRewrite('【提示词 1｜单品细节】\n【最终 AI 绘图 Prompt】\n' + fence(prompt), true), [{ title: '单品细节', prompt }])
for (const parse of [extractFinalPrompt, (s: string) => parseRemixRewrite(s, 1), (s: string) => parsePlannerRewrite(s, true)]) {
  assert.throws(() => parse('【无法完成】输入1要求的圆珠笔未出现在新产品资料中。'), /圆珠笔未出现在新产品资料中/, '具体失败原因应保留，不生成伪成品')
}
assert.throws(() => extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence('【无法完成】缺少对应的笔。')), /缺少对应的笔/)
assert.throws(() => parseRemixRewrite('【提示词 1】\n' + fence('【无法完成】缺少对应的笔。'), 1), /缺少对应的笔/)
const longPrompt = prompt + '\n用户原始细节；'.repeat(2200)
assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(longPrompt)), longPrompt, '全文和多语言不截断')
assert.ok(isLegacyDefaultPrompt(PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT))
assert.ok(!isLegacyDefaultPrompt(PREVIOUS_VISUAL_STRATEGIST_SYSTEM_PROMPT + '\n用户自定义'))
assert.ok(!isLegacyDefaultPrompt(VISUAL_STRATEGIST_SYSTEM_PROMPT))
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V4), "已发布v4精确默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V4 + "\n我的自定义角色"), "修改过的v4不被覆盖")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V5), "已发布v5精确默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V5 + "\n我的自定义角色"), "修改过的v5不被覆盖")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V6), "已发布v6精确默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V6 + "\n我的自定义角色"), "修改过的v6不被覆盖")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V7), "已发布v7精确默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V7 + "\n我的自定义角色"), "修改过的v7不被覆盖")
assert.equal(createHash("sha256").update(LEGACY_VISUAL_STRATEGIST_V8).digest("hex"), "b8c4ce14ce66bda3c657e35d98a2fb9009e1de98a0e37b522366185fd9eeb849", "冻结实际已发布的完整v8，不从新规则重算")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V8), "已发布v8精确默认升级")
assert.ok(isLegacyDefaultPrompt("\n" + LEGACY_VISUAL_STRATEGIST_V8 + "\n"), "沿用旧版仅忽略首尾空白的兼容方式")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V8.replace("三宫格仍做三宫格", "三宫格改为单图")), "用户改过角色正文也不能升级覆盖")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V8 + "\n我的自定义角色"), "修改过的v8不被覆盖")
assert.equal(createHash("sha256").update(LEGACY_VISUAL_STRATEGIST_V9).digest("hex"), "6956cff4ec4ea8121d02532fb8c8894da89a83dcf14080b846a4eeea8c455d78", "冻结实际v9完整默认，不随新工作流重算")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V9), "未修改v9默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V9 + "\n个人补充"), "个人v9不覆盖")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V9.replace("三宫格仍是三宫格", "我想改为单图")), "正文修改过的v9不覆盖")
assert.equal(createHash("sha256").update(LEGACY_VISUAL_STRATEGIST_V10).digest("hex"), "4d94d0b1a404bfd70c75e1b490aecdc36813aa6f17530151bb540009da67b42c", "独立冻结本轮修改前完整v10，不随文案共享规则重算")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V10), "未修改v10默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V10 + "\n我的站点规则"), "个人v10不覆盖")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V10.replace("三宫格仍是三宫格", "只做单图")), "正文定制的v10不覆盖")
assert.equal(createHash("sha256").update(LEGACY_VISUAL_STRATEGIST_V11).digest("hex"), "c1e7d54ed3ba4c1d56412bbea9842b7b7a87795a22fb4155664f42f0a191899a", "冻结修改前完整v11，不能用新规则重算历史默认")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V11), "未修改v11默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V11 + "\n我锁定所有服装"), "用户追加的v11规则保留")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V11.replace("三宫格仍是三宫格", "改为单场景")), "用户修改正文的v11不覆盖")
assert.equal(createHash("sha256").update(LEGACY_VISUAL_STRATEGIST_V12).digest("hex"), "9692f16a8dd32873cc30c1b944baa63fe8844b3b13b1938cdf76359fad6a7a00", "完整冻结本轮前实际v12，不用新参考规则重算")
assert.ok(isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V12), "未修改v12默认升级")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V12 + "\n我锁定场景与人脸"), "个人追加的v12规则保留")
assert.ok(!isLegacyDefaultPrompt(LEGACY_VISUAL_STRATEGIST_V12.replace("三宫格仍是三宫格", "换成单图")), "用户改过正文的v12不覆盖")
// Synthetic prompt fixture: layout estimates, never measured product data or real LLM output.
const precisePrompt = '【正向 Prompt】\n单品细节信息图，仅展示一支合成示例笔。笔身为直圆柱，圆锥笔尖接在下端，上端笔帽的纵向笔夹贴近笔身，白色表面带黑色线条印花。整图左上为原点，横纵坐标均相对画布宽高：左侧产品区x=5%至60%、y=8%至92%，笔中心x=30%、y=56%，长轴竖直、高度占画布64%；右侧三枚细节框x=66%至95%，y分别为8%至32%、36%至60%、64%至88%，依次展示同一支笔的笔夹连接、笔身印花和笔尖。左上柔光，接触阴影向右下。上图文字：“Alles Gute!”一次，位于产品区顶部，文字框x=8%至55%、y=9%至17%，一行居中、黑色粗体无衬线，字高为画布高度4%。\n【负向 Prompt】\n不添加第二支笔，不改笔夹连接，不增加第四个细节框，不加入未指定广告文字。'
assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(precisePrompt)), precisePrompt, "具体结构、整幅/局部位置、多语言文案原文和百分比完整保留")
// Natural paragraphs do not need the former numbered product-only fields.
const scene = '【正向 Prompt】\n父女在左侧拥抱，右侧窗户保持可见；远景，前景留空用于后期合成。柔和日光，人物清晰。\n上图文字：额外上图文字：无。\n【负向 Prompt】\n不加入商品、包装或标题，不遮挡窗户。'
assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(scene)), scene)
assert.deepEqual(parseRemixRewrite('【提示词 1】\n' + fence(scene) + '\n【提示词 2】\n' + fence(prompt), 2), [scene, prompt])
assert.deepEqual(parsePlannerRewrite('【提示词 1｜人物背景】\n【最终 AI 绘图 Prompt】\n' + fence(scene), true), [{ title: '人物背景', prompt: scene }])
const roles = [VISUAL_STRATEGIST_SYSTEM_PROMPT, REMIX_STRATEGIST_SYSTEM_PROMPT, PLANNER_SYSTEM_PROMPT]
assert.ok(new Set(roles).size === 3)
for (const role of roles) {
  assert.ok(role.includes(IMAGE_INTENT_RULES), "所有入口保留相同主体范围与文字白名单")
  assert.equal(role.split(MARKETING_COPY_RULES).length, 2, "三入口同一文案决策只拼接一次")
  assert.equal(role.split(PRECISE_SCENE_RULES).length, 2, "三入口同一直接表达规则只拼接一次")
  assert.ok(!/仅把用户指定要上图的原文|只在用户要求时创作文案|未要求文案则写/.test(role), "不能残留阻止参考文案改写的旧限制")
  assert.ok(!role.includes('GPT Image'))
  assert.ok(role.includes('15项'))
  assert.ok(role.includes('不是15个成品字段'))
  assert.ok(!role.includes('正向完整依次落实1—14项') && !role.includes('逐条完整展开15项'))
  assert.ok(role.includes('【无法完成】'))
  assert.ok(role.includes('不压缩') || role.includes('禁止压缩'))
}
assert.ok(roles[0].startsWith('# 视觉工作台｜Amazon 电商视觉策略师与商品图提示词工程师 v13'))
const workflow = '竞品视觉拆解 → 我方产品识别 → 产品硬约束 → 竞品视觉映射 → 完整成品 Prompt'
for (const role of [roles[0], roles[2]]) assert.ok(role.includes(workflow), '两个入口采用用户明确的映射流程')
assert.ok(roles[0].includes('只有产品结构核对通过') && roles[0].includes('不能把阴影当开口'), '先核对结构，不把视觉误判变硬约束')
assert.ok(roles[2].includes('产品图 + 产品信息 + 策划文档') && roles[2].includes('没有关联参考的条目'), '策划三源融合，无参考不虚构竞品')
assert.ok(!roles[0].includes(AMAZON_PROMPT_POLICY), "工作台以用户模板独立改写，不叠加旧通用流程")
for (const role of roles.slice(1)) assert.ok(role.includes(AMAZON_PROMPT_POLICY), "其他入口共享规则不变")
assert.ok(roles[1].startsWith('# 提示词迁移｜图位语义与产品映射师'))
assert.ok(roles[1].includes('【默认任务：同类商品换主题】') && roles[1].includes('主要修改新产品外观描述、主题文案'), '同品类默认沿用原图位并更新主题人物氛围')
assert.ok(roles[1].includes('普通展示、人物/氛围及使用方式图不要求先提供完整长宽厚') && roles[1].includes('将未知数值区域改为不含数值的形态/结构或使用展示'), '未知尺寸保留信息区域并给非数字替代')
assert.ok(roles[1].includes('当前用户明确要求必须呈现某个未知实测数值且不允许改成无数值展示'), '只有本次不可替代的实测要求才因未知尺寸拒绝')
assert.equal(roles[0].split(WORKBENCH_REFERENCE_RULES).length, 2, '工作台采用独立的额外需求优先与灵活参考策略')
assert.ok(!roles[0].includes(LOCAL_SCENE_VARIATION_RULES), '工作台不再叠加锁定场景类别及文案框的旧局部规则')
assert.equal(roles[1].split(LOCAL_SCENE_VARIATION_RULES).length, 2, '迁移仍保留原有局部变化合同')
for (const role of roles.slice(1)) assert.ok(!role.includes(WORKBENCH_REFERENCE_RULES), '本轮参考策略不改变迁移/策划')
assert.ok(!roles[2].includes(LOCAL_SCENE_VARIATION_RULES), '策划保持原独立规则')
assert.ok(roles[2].startsWith('# 一键策划｜整套商品视觉内容策划师'))
assert.ok(!AMAZON_PROMPT_POLICY.includes('只输出【最终 AI 绘图 Prompt】'), '公共层不能覆盖批量入口的外层输出合同')
// Representative localized results test lossless parsing only, never real LLM copy quality.
for (const copy of ['For Your Everyday Notes', 'Für deinen Alltag', 'Pour vos idées du quotidien', '毎日のメモに']) {
  const localized = precisePrompt.replace('Alles Gute!', copy)
  assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(localized)), localized)
  assert.deepEqual(parseRemixRewrite('【提示词 1】\n' + fence(localized), 1), [localized])
  assert.deepEqual(parsePlannerRewrite('【提示词 1｜细节图】\n【最终 AI 绘图 Prompt】\n' + fence(localized), true), [{ title: '细节图', prompt: localized }])
}
// Synthetic local-variation fixture: validates lossless output, not actual LLM choices or image diversity.
const variedScene = '【正向 Prompt】\n三宫格：上方宽格占整图高度55%，下方左右两格各占剩余宽度的一半。上格为成年母女送礼，母亲位于左侧，穿浅蓝色立领衬衫，双手从底部托住礼盒递向右侧；女儿穿酒红色圆领针织衫，身体转向左侧，双手接住盒底，目光朝向母亲。右后方窄桌上放一只透明直筒花瓶，内插三枝白色花，其他区域不加道具。下左格仅展示同一礼盒闭合外观，下右格仅展示其盒盖表面印花。礼盒为长方体，平直盒盖覆盖底盒上沿，米白表面带蓝色线条花纹，形状、连接和销售数量按合成示例设定；示例不是实测商品资料。上图文字：“A Thoughtful Gift”一次，位于上格右上方，文字框相对整幅x=65%至96%、y=4%至15%，两行左对齐，黑色粗体无衬线，字高为整幅3%，行距为字号1.2倍。\n【负向 Prompt】\n不改成单场景，不添加销售配件，不遮挡文字，不加入旧品牌。'
assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(variedScene)), variedScene, '具体新动作、非商品服装、装饰位置与三格/文案完整保留')
assert.deepEqual(parseRemixRewrite('【提示词 1】\n' + fence(variedScene), 1), [variedScene], '迁移不截断或重写选定的局部变化')
// Synthetic design fixtures only: verify lossless parsing, not evidence that a model obeyed the brief.
const backgroundRedesign = '【正向 Prompt】\n商品细节信息图，整幅为深青色哑光纸面，光线由左上斜落，背景不含弧形分隔。右侧主商品区相对整幅x=55%至95%、y=20%至92%，仅展示合成示例纸袋：粉色长方体袋身，袋口两侧各连接一条粉色扁带提手，真实商品外观仅以本次产品资料为准。左侧三枚竖排矩形细节框均为x=5%至40%，y分别为25%至43%、48%至66%、71%至89%，依次展示同一纸袋的提手连接、可见袋口与正面印花，框底为浅灰蓝色，与整幅底色分层。上图文字：“PRODUCT DETAILS”一次，框x=5%至95%、y=5%至15%，一行居中，白色粗体无衬线，字高为画布高度5%，行距为字号1.1倍。\n【负向 Prompt】\n不加入金色大弧线或散落彩屑，不改成三张独立场景，不编造袋底内部。'
const peopleRedesign = '【正向 Prompt】\n户外花园生日送礼场景，三名匿名成人：左后方站立的成人为方脸、黑色短直发，穿浅蓝衬衫；中后方成人为圆脸、栗色齐耳短发，穿米白立领上衣，转身看向右侧；右侧坐姿成人为窄椭圆脸、黑色低盘发，穿鼠尾草绿色圆领衫，头部朝左轻转、张开双手接礼。人物头部中心相对整幅分别为x=22%、42%、77%，y=22%、25%、23%。合成示例粉色纸袋位于右前景，中心x=73%、y=70%，宽占整幅34%、高占45%，方正袋身和两条扁带提手明确可见；卡片在纸袋前方靠右直立，蛋糕位于左侧中景。后方为木栅栏与绿色灌木，树荫形成柔和明暗，花园实景不带室内窗帘。右侧人物双手分别托住袋底左右角，不遮正面印花。额外上图文字：无。\n【负向 Prompt】\n不把商品放回左前景，不加第四个人，不出现室内窗户/窗帘，不镜像商品印花。'
for (const content of [backgroundRedesign, peopleRedesign]) assert.equal(extractFinalPrompt('【最终 AI 绘图 Prompt】\n' + fence(content)), content, '新背景、具体新面孔、右前景商品/户外与确定坐标原文完整保留')
console.log('PASS: 三入口独立合同/解析、失败原因保留、完整长文本/多语言、公共层无单图格式冲突、精确旧默认升级与自定义保留（无网络，不代替真实模型质量验收）')
