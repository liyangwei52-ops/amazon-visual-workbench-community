# AI 接手指南：Amazon 电商视觉工作台

最后核对：2026-10-28。本文记录当前源码和已确认产品决策，不保证任意模型未来仍采用相同接口限制。

2026-10-26界面调整：`visual-workbench.tsx`不再渲染“分析角色（系统提示词）”卡片、展开编辑或恢复默认控件，第一部分改为产品图/产品信息两列。`systemPrompt`状态、草稿恢复/保存、旧默认精确升级和分析请求仍保留，因此隐藏界面不重写已有自定义角色，也不改变三入口模型协议。

2026-10-26参考图生图开关：`visual-workbench.tsx`的每张请求卡新增`sendReferencesToGeneration`，新增卡false，旧草稿仅明确true才开启；随原工作台草稿保存，不进入套装。分析的`buildAnalyzePayload`保持始终发送全部产品/参考图；`enqueueCard`按开关得到`generationReferences`，同时用于图片身份后缀与任务references。产品图始终保留，关闭不删除卡片参考素材、不重写提示词。队列继续保存本次实际素材的IndexedDB快照，重绘/补图只读取原任务，不读取编辑开关；旧已提交任务原样兼容。切换、刷新、导航不授予发送资格，迁移/策划/极简不变。发布与模拟验证状态见[进度顶部](progress.md)。

当前本地/线上工作台v13、迁移v9、策划v10；线上部署及GitHub状态见进度顶部。工作台v13以本卡额外需求先确定可保留、可借鉴、必须改变及禁止内容，再映射参考。信息图/拼图保留图型、格数/模块数及信息功能，未锁定时可适度交换左右区域、商品落点和人物组织，关联文案/细节须具体重新定位；用户锁定布局、位置或仅换商品优先。人物默认重新选用不同面孔并写清外观/动作/非商品穿搭，使用条件相容且未锁定时可改变室内外。明确禁止照抄背景时重新设计底色/材质或环境、层次、面板边界与装饰，不能只换色沿用整套造型。工作台独立策略在workbench-reference-policy.ts，不与旧局部规则叠加；迁移v9继续用local-scene-variation.ts，策划v10及极简/生图协议保持。三入口继续按用户指定非中文最终文案优先、未指定部分依事实及目标站点改写，说明中文、营销文案非中文、明确无字仍无字；正向直接写商品结构/完整分区/文案框，不用图片或文档指代。仅精确未改v12默认升级，自定义角色及已有提示词/套装/任务保留，无自动模型请求；本轮不承诺同一提示词多张图互异。

策划信息图默认保留本条参考的整幅背景色/光感/纹理、边缘装饰与内层面板关系，白色面板不等于全幅白底；成品须分别写清背景与面板及露出范围。明确白底/改背景优先，背景主题不固定；新规则仅用于后续手动策划，不自动改写旧提示词/图片或请求模型。

## 1. 当前状态与边界

- 目标用户：Amazon 电商视觉设计人员，完成产品分析、提示词策划、批量生成和图片复用。
- 站点：<https://amazon-visual-workbench-lac.vercel.app>。本地默认 `http://localhost:3000`。
- 源码：[liyangwei52-ops/amazon-visual-workbench-community](https://github.com/liyangwei52-ops/amazon-visual-workbench-community)，公开仓库，采用Fork与Pull Request协作，维护者审核合并。入门与验证见[贡献指南](../CONTRIBUTING.md)，PR模板在`.github/pull_request_template.md`；尚未新增许可证。公开仓库只从已审查的当前源码建立干净历史，原amazon-visual-workbench及其旧开发历史保持私有。原工作区origin仍指向私有仓库；公开贡献须克隆公开仓库或Fork，不能将原私有main或镜像历史推入公开库。贡献者Fork中的origin指向自己的副本、upstream指向公开项目，不混用工作区。GitHub公开/上传与网站部署分别记录，最新状态见[进度顶部](progress.md)。
- 公开访问；当前没有账号认证、数据库或跨设备同步。用户已明确选择“先完成本地版，注册登录暂缓”。
- `/profile` 是头像、昵称、团队 / 职业、简介和自动归档偏好，不代表已经登录。
- 所有浏览器存储按源隔离：localhost 和线上域名的数据互不共享，不同浏览器也不共享。
- 当前实现不依赖某个 AI 工具的私有记忆或已安装 Skill；业务提示词已经放在项目代码中。

## 2. 技术与页面地图

Next.js 16.4.1、React 19.2.4、TypeScript、Tailwind CSS 4、Base UI、Lucide、Sonner、OpenAI SDK、Undici、JSZip。版本以 `package.json` 和 `package-lock.json` 为准。

App Router页面交互集中在客户端组件。根布局的persistent-workspace.tsx保留工作台分析、提示词迁移、一键策划输入和四个栏目各自的生图执行器，`/`、`/remix`、`/planner`与`/generate`的page均返回null，避免重复挂载。访问过的分析/迁移/策划页以及已有队列栏目/访问过的结果页只切换hidden/inert，不卸载正在接收结果的组件；useSearchParams仅在内部Suspense边界中读取栏目参数，三分析页自身仍保留预渲染。其余输入页面由各自page挂载。整页离开/刷新仍可能中断连接，不能承诺服务端后台运行或自动重发。

根布局直接挂载PersistentWorkspace、页面内容和Toaster。旧ImageStudio及其专用界面已移除；i18n.ts仅保留生图校验/API错误使用的9种语言、7类错误文本与语言识别，旧提示词默认仍用于精确兼容升级。后续清理按[项目边界技能](skills/amazon-safe-simplify/SKILL.md)核对引用与行为。

三分析入口编辑页只恢复完整提示词、启用、比例/清晰度/数量和产品资料；没有生成图预览、其派生完成标签或队列结果回填。生成图的查看、复制、下载和保存由本栏结果页负责；旧草稿中的result字段不批量迁移，队列、缓存图与资产保留。

策划运行状态：VisualPlanner的planPhase区分准备资料与等待返回，planningRef同步阻止重复点击，onPlanningChange只上报当前是否忙碌。根布局在其他页面显示“一键策划进行中 · 返回查看”；返回保留原RequestWaitNotice计时器及禁用按钮。成功返回在隐藏期间仍保存planResponse、自动分发并显示已填入条数，失败保留planError与原提示词。完成条数与运行状态不持久化为刷新执行资格，草稿字段/存储键不变；刷新只恢复已有文本、原返回与错误，不重发、不声称恢复旧连接。工作台分析回调及四栏生图状态独立；隐藏策划的固定操作栏不显示。

| 路由 | 主要组件 | 职责 |
| --- | --- | --- |
| `/settings` | `api-settings-page.tsx` | 统一保存分析 / 生图接口、Key、模型 |
| `/` | `visual-workbench.tsx` | 共用产品素材，每路竞品参考图与需求 → 完整提示词 |
| `/remix` | `visual-remix.tsx` | 已保存套装迁移到新产品，逐条改写和生图 |
| `/planner` | `visual-planner.tsx` | 产品图 + 产品信息 + 策划文档 / 文本 → 逐图设计画面并分发提示词 |
| `/simple` | `visual-simple.tsx` | 图文生图 / 文生图切换，多个提示词卡 |
| `/suite` | `visual-suite.tsx` | 保存、编辑与调用提示词套装 |
| `/assets` | `visual-assets.tsx` | 图片分类、上传、搜索、预览、改名、下载、删除、ZIP备份与已有结果导入 |
| `/profile` | `visual-profile.tsx` | 本地个人资料、图片自动归档偏好、存储概览 |
| `/generate?source=workbench\|planner\|remix\|simple` | `visual-generate.tsx` + `generate-queue-panel.tsx` | 共用实现、四个独立的栏目队列/执行器/结果页 |

导航状态由use-generation-navigation.ts使用useSyncExternalStore只读各栏目队列，生成中/待执行/结果分别计算。主链接与结果链接使用generateHref(origin)，进入带source参数的本栏目结果；VisualSidebar按显式generateOrigin高亮，不读取最后提交来源来替代当前选择。输入/编辑链接保留，清空本栏目仅恢复该栏输入链接。GENERATE_QUEUE_UPDATED_EVENT及storage只驱动只读导航；提交事件带栏目detail，不携带配置或Key，不能跨栏目触发调度。

侧栏顺序：API 设置、视觉工作台、提示词迁移、一键策划、极简图文生图、保存套装、资产中心。左上头像进入个人中心。生图页由提交任务进入，不是常驻侧栏入口。移动端使用顶部展开导航。

五个提示词页面统一使用 `prompt-editor.tsx`：卡片中固定160px高度、内部滚动，点击“全屏查看 / 编辑”在原生模态对话框中查看和编辑全文。修改实时回填，沿用页面草稿 / 套装保存逻辑；Esc或完成编辑关闭并恢复焦点与页面滚动。不要把预览实现成对提示词字符串的截断，也不要让底层Textarea的 `field-sizing: content` 再次撑高卡片。

页面外层使用globals.css的workspace-shell，最大1680px；entry-grid按实际卡片数量和可用宽度自适应，正文通常13–14px。ProductImagesUpload的空上传目标整行128–144px，不按宽度无限增高；已上传图片保留完整显示。BatchGenerateButton主操作强调色、44px高，并显示缺少条件或忙碌原因；四个生图入口统一在固定底栏提供一次批量操作，保持必填和启用校验。结果预览高度最高600px/70vh，object-contain保留完整原图，不改变存储像素。

TaskImageGallery的卡片图片与“查看大图”共用ResultImageViewer原生dialog：ResizeObserver读取实际可视区，适应模式按原图自然宽高等比计算显示像素；100%及25%—400%缩放只改变CSS尺寸，超出范围在独立容器滚动，不裁切或重编码。每次打开/换图重置缩放，Esc/关闭或浏览器历史切换关闭对话框并恢复页面滚动。data/blob原图异步读取原Blob并先创建链接，限制为栅格图片类型，新标签入口是原生target=_blank/noopener/noreferrer链接，不在异步等待后window.open；图片文件字节不变。未导出链接在关闭时释放，已打开链接在当前文档会话保留并按源复用，避免关闭对话框或再次打开导致新标签链接立即失效；原文档结束后由浏览器释放，链接不作为持久存储。HTTP(S)原图直接链接，不依赖CORS读取。查看器不调用模型、不更新任务/缓存，旧IndexedDB结果直接可看，缺图无入口。

fixed-action-bar.tsx为四个生图入口及套装保存提供主操作底栏：position:fixed，与当前main列的正常流占位宽度/左边界对齐；ResizeObserver经requestAnimationFrame同步尺寸，并按实测高度预留末尾空间。监听窗口与visualViewport变化以适配窄屏、缩放和软键盘，安全区由CSS处理。隐藏常驻工作台不参与尺寸更新、不显示覆盖层；全屏dialog使用浏览器顶层，固定栏在其下。工作台顺序为生图→生成提示词，迁移为生图→改写；新增/全选仍在列表头，单卡操作保留。组件仅处理布局，不改启用、计数、请求、并发或存储。

四个生成入口统一使用 `generation-settings.tsx`：输出比例占整行，自定义比例输入占整行，清晰度1K/2K与生成数量各占一列，下方显示模型预计像素。不要恢复旧像素下拉框，也不要把清晰度与API质量auto/low/high混淆；原来的格式 / 背景控件已去除，统一队列仍使用PNG / 自动背景。`output-ratio.ts`校验宽高比；新customSize存5:4/1:3等比例，旧值仍可为1280x720，CustomRatioInput显示其准确比例并提示历史像素。新比例由model-image-plan按清晰度计算，GPT优先保比例缩放到合法像素范围；Gemini选原生比例并在不支持时说明。旧像素不因加载、保存或刷新被改写。工作台的 `size` 现保存比例；`workbench-output-settings.ts` 兼容旧草稿：匹配预设的像素恢复为比例和清晰度，不能精确对应的旧像素（如3840x2160）保留为自定义尺寸，不能偷偷改成相近预设。套装仍只保存名称、提示词和比例 / 自定义比例（兼容旧像素），不加入清晰度或数量。

批量选择共用 `generation-actions.tsx` 的SelectionActions以及generation-selection.ts的selectEntries：全选、全不选、反选；工作台和迁移页跳过正在处理的卡片，选择随草稿保存。启用控件共用 `generation-actions.tsx` 的 `EntryEnabled`。工作台卡头仅保留启用和数字编号，不显示“单独请求”。四页共用 `BatchGenerateButton`，显示“生成 N 条”和“共 M 张”；N只计算启用且提示词非空的实际提交项，M累计这些条目的数量，已完成条目可再次启用提交。分析/改写也显示实际条数，工作台空需求不计分析数。最新一一对应回归为scripts/verify-result-entry-map.cjs；scripts/verify-incremental-submit.cjs继续覆盖局部重交与停止。

工作台每张需求卡的“启用”复选框控制分析和生图资格。新卡和没有enabled字段的旧草稿默认关闭；已保存的明确选择保留，但完全没有参考图、额外需求和提示词的空卡恢复时关闭。添加素材或填写内容不会自动启用。顶栏按“新增请求 → 生成 N 条 → 生成提示词 N 条”排列，生成提示词只并行分析已启用且有参考图或额外需求的卡片，空卡跳过；失败保留原提示词。生图仅提交已启用且有提示词的卡片，手写提示词不要求竞品图。选择随草稿保存，关闭不清除内容；分析中禁止重复点击、删除或关闭当前卡片，关闭不能撤回已发送请求。

工作台分析、提示词迁移、一键策划与统一生图在站内导航后继续运行，隐藏页面仍处理并保存返回，其他页面显示进行中入口；不是服务端后台任务，刷新、关闭页面或整页跳转仍可能中断。

迁移运行状态：VisualRemix的rewritePhase区分准备素材/等待返回，rewritingRef同步阻止双击和改写期间生图，onRewritingChange仅上报忙碌。其他页面显示“提示词迁移进行中 · 返回查看”，返回保持同一RequestWaitNotice、已填入数和固定栏忙碌按钮。每条独立请求最多三路并行，成功即按原ID写当前框、同步保存已有草稿格式；失败只保留本条原文/原因，其余仍继续。entryStateRef串行提交乱序结果，draftRestored门禁避免初始空快照回写；未启用条目不改写。会话缓存按产品/配置/条目ID/设置/当前成品相等校验，部分成功后用户手动再提交才跳过已完成项，人工修改的已完成项重新发送；无自动重试。刷新/离页废止旧页面剩余未发请求，已填入草稿可恢复，运行/错误/缓存不持久化且不赋予重新发送资格。套装页显式loadSuiteId在迁移页可见且草稿已恢复后消费，不依赖重新挂载；忙碌时拒绝载入并提示重新选择，完成后不自动覆盖结果。

工作台RequestCardState.analysisError保留失败原文，WorkbenchDraft可选同名字段兼容旧草稿；重新手动分析时清空旧错误，失败不清空原提示词，刷新不重新分析。迁移页rewriteError为本页状态，新改写/载入套装/清空时清理；不声称其缓存或错误跨刷新恢复。analysis-failure.ts为三处分析入口翻译英文上游超时，原文/请求编号保留；策划错误用role=alert。结果不明仍需先核查，不自动重发。

## 3. 核心数据流

### 3.1 分析和提示词

**当前本地/线上工作台v13、迁移v9、策划v10，发布及GitHub见进度顶部。** 三入口systemPrompt与userText同步同一文案/明确表达合同；工作台和策划原有五阶段保留，迁移保留旧图位与主体范围。同类商品通常只按新事实替换商品外观/主题、人物与氛围；未知新尺寸采用无数值区域，不沿用旧参数。产品图提供可见结构，已确认产品信息补事实，额外需求/文档决定目标；参考只提供画法和可改写的文字功能，不提供新商品参数。成品按任务/主体→具体结构→完整分区/区内布局→光影材质→逐条非中文营销文案及文字框组织，说明可中文，15项只在内部检查。各自正负向/外层合同不变，精确默认升级不覆盖个人角色及旧成品/套装。

极简图文/文生图新任务直接保存原文及`promptMode: "verbatim"`；执行器将该字段带入FormData，浏览器/代理/原生Gemini都跳过提示词处理，Gemini不插入图片身份文字。不会提取/合并正负向、裁掉代码围栏、替换用户粘贴的旧块或追加商品/模型/画布说明。比例与清晰度继续由`resolveImagePlan`计算，作为API参数发送；原文中的旧画幅也保留，不保证模型如何解决冲突。原文空白仍须校验，multipart仅可能规范换行编码。可选字段随现有队列序列化及原位重绘保留，不新增存储键、不批量迁移旧任务，刷新不发送。

三分析入口及无标记旧任务继续使用原适配：`removeRequestedOutputSettings`仅清理应用画布块，`model-prompt-profile`幂等替换模型v1/v2块为v2。Gemini原生参数不使用预计像素横幅，图片身份限定资料不强制出镜。新角色的来源/成品结构与验收见[prompt-design](prompt-design.md)。

```text
产品图 + 商品事实 + 竞品参考图 / 策划文档
  → 上传校验、输入副本压缩
  → 对应页面组装系统角色、用户需求、图片身份与顺序
  → analyze-request.ts 控制完整请求大小
  → model-api-client.ts 选择直连 / 代理
  → 分析模型返回完整提示词
  → planner-parse.ts / remix-parse.ts 等解析、按版位回填
  → 用户编辑，或保存为提示词套装
```

- 当前角色为工作台`visual-strategist-prompt.ts`（v13）、迁移`remix-strategist-prompt.ts`（v9）、策划`planner-strategist-prompt.ts`（v10）。`analysis-prompt-rules.ts`提供MARKETING_COPY_RULES、PRECISE_SCENE_RULES和ANALYSIS_COPY_TASK_NOTE：image-intent-policy拼接文案规则，工作台直接使用具体表达，迁移/策划经amazon-prompt-policy复用，每规则在每角色只拼一次。三组件均发送同一短任务说明，已清理旧“未指定就不加文案”限制。原五阶段、素材身份/顺序、当前画布和inferPlannerRatio、外层合同均保留。
- 文案决策逐模块执行：本次指定非中文最终原文优先，局部指定不删除其余文字模块；未指定部分可参考竞品、文档竞品图或旧稿的标题/卖点/标签功能，按当前商品与站点改写。站点/语言先用本次要求，其次文档，之后相容参考的非中文消费语言；无可靠线索暂用英语，不假称已确认站点。中文需求转成目标语言，新增营销文案不夹中文或中文释义；正常日文汉字不删，真实中文印字只留原表面。明确无字/背景/人物素材及列表首图继续保留无字边界；逐字中文和禁中文等冲突须说明，不能静默改字。
- legacy-visual-strategist-v12.ts独立冻结本轮前实际完整v12默认，SHA-256为9692f16a8dd32873cc30c1b944baa63fe8844b3b13b1938cdf76359fad6a7a00；精确未修改默认升级v13。更早快照原样保留，不能用新规则重算历史默认；个人角色、旧提示词/套装/队列不覆盖、不自动分析。
- 一键策划以产品图、产品信息及策划文档共同为画面设计依据：先识别商品的可见特征和已确认用途/卖点，再逐图与文档意图对应，选择展示方式、构图、动作、光影和文字关系。内部信息分工服务产品与文档的融合，不先套通用模板再填商品；保留用户具体画面、清单顺序/数量及无商品/留白边界。systemPrompt与userText均按此指导，三类实际素材仍沿用原通路完整发送。
- 工作台v9延续v8，优先参考的画面类型、分格/模块数量、大小层级、相邻关系和各区功能。三宫格保持三宫格，尺寸＋特点图保留对应模块；变化在区域内部，允许非商品服装、小装饰和产品位置等调整，不要求改变大构图来证明创新。正向明确写出完整版式及各区内容，不能只说“照参考”；当前比例优先，适配占比/间距但不静默删除区域。多参考先按用户分工，未指定以本卡第一张为结构来源，其余补相容细节；只有用户明确要求改版式时才改结构。尺寸模块不复制竞品数据，必需实测值缺失仍失败说明。仅改工作台systemPrompt/userText，图片与共享身份说明原样发送，其他入口/请求协议不变。旧提示词/套装不改写，生效需用户后续手动分析。
- prompt-utils.assertAnalysisCanComplete拦截【无法完成】，包含最终章节/代码块包裹的说明；planner-parse/remix-parse在分发前校验。保留具体缺少资料的原因，沿用三入口原错误区域与原提示词，不触发生图/自动重试。
- 迁移任务合同区分新照片中完整商品清单与当前图位实际展示范围：单品/部件特写只映射对应新实物，保留局部框与该主体的关系，禁止擅自扩大为全套。系统与逐条用户消息共同声明；20261017 Edge实测旧第4条从笔特写漂移成四件套，因此补强规则。现有提示词不改写，新规则只做构建/协议检查，尚未追加真实付费质量复测。
- 三入口正向逐件写明商品轮廓/部件连接/表面与数量，完整分区和背景/面板层次、区内位置大小及逐条文案/文字框。空间约数注明整幅或分区参照，不冒充实测；不能以“参考图一的摆放位置”“同竞品”“按文档”等代替具体内容。缺必需事实仍说明无法完成；没有新增输出删词、截断、自动改写或重试机制。
- 分析主体边界：`image-intent-policy.ts`；三入口文案/具体布局与短任务说明：`analysis-prompt-rules.ts`；迁移/策划共享商品规则：`amazon-prompt-policy.ts`；完整提示词解析/画布适配：`prompt-utils.ts`。生图用IMAGE_EXECUTION_BOUNDARY及模型后缀未改，极简verbatim跳过文本处理，旧任务不自动更新。
- `model-prompt-profile.ts`维护简短目标模型说明，三个分析入口读取已保存的生图模型；说明不再强制15字段。`promptForImagePlan`默认幂等适配画布与模型块，第三参数为verbatim时原样返回。完整文案/相关约束不删减，不绑定模型品牌；切换不改写草稿/套装。迁移分析缓存含目标模型，切换后不复用旧模型改写结果。
- 四入口共用api-setup-notice.tsx和image-model-notice.tsx；API缺失引导分别检查分析/生图，极简及结果页只检查生图。use-api-status.ts只暴露就绪布尔快照；API_SETTINGS_CHANGED_EVENT无载荷，保存后同步常驻页面模型/就绪提示，草稿编辑不触发。模型说明不宣称Gemini文字更差或绝对成片保证；本批无真实付费质量对比。
- `analysis-content.ts` 将图片身份说明与对应图片交错排列，不能把商品事实来源和竞品图混淆。
- 产品上传统一使用 `product-images-upload.tsx` 和 `use-product-images.ts`，最多4张，按添加顺序排列，第一张为主产品，支持替换、移除和“设为主产品”。`paste-zone.tsx` 接收原生文件拖入、放下和粘贴，批量处理保持文件顺序。
- `image-identities.ts` 统一身份：图1为主产品，后续产品为 `product-detail`，竞品为 `reference` 并从产品图数量+1开始编号。分析与GPT / Gemini生图都必须发送全部产品图，不能把第二张产品图标成竞品；不据多图推断销售套装。
- `planner-doc.ts` 使用浏览器本地解析 XLSX / DOCX / CSV / TXT，提取文字和内嵌图，并保留工作表 / 行号等线索；原始 Excel 文件并未直接发送给模型。
- `planner-parse.ts` 独立兼容全/半角分发分隔符、Markdown与常见中英文正负向标签；先去围栏再读完整最终段，不能只取首个代码块导致后面的负向丢失。合并正文保持原文，显式正负向字段须各有正文，编号仍连续/唯一、版位须有名称；无法完成仍按原理由拒绝，不生成空字段补丁。共享extractFinalPrompt及其他入口合同不改。
- `visual-planner.tsx` 将200成功响应中的完整模型文本先存到planResponse，再通过fillPlanResponse原子替换提示词清单；解析失败保留原框与参数。planResponse/planError为PlannerDraft的兼容可选字段，仅本栏保存；错误面板提供最近原返回查看/复制/手工修正及“从这段内容填入提示词”，该按钮只解析本地文本，无API调用。上游超时/已知长度截断继续使用既有失败规则，不自动补写、重发或执行；刷新恢复字段不自动分发。
- 2026-10-21用户提供实际九条返回：第6至9条的最终段有画面正文和负向，漏了正向标签。plannerPrompt把负向前的非空正文识别为既有正向，只补结构标签，不生成/删改内容；九条自动分发，仍拒绝纯负向或显式空字段。保存的旧原返回可直接点本地填入按钮，无需修字或请求模型；不会刷新自动填入。
- 策划v8与对应userText强化逐区“参考功能→当前实物/部位→可确认数据→最终文案→空间位置”，具体规则/人工验收见prompt-design。完整清单、全部我方产品图/参考图、当前画布和模型目标继续传入；站点/文案语言/单位由当前输入确定，不内置固定市场。已有提示词不重写，其他角色和共享模型/画布协议不改。
- `visual-planner.tsx` 的 `data-plan-doc-upload` 容器包住空上传按钮和已有文档卡片，接收原生文件拖入并高亮；本区阻止默认打开与冒泡，避免触发 `paste-zone.tsx` 的全局图片投放错误。点击和拖入共用 `handlePlanDocFile`，一次一个支持的文档、最大20MB；同步ref与禁用控件防止并发更换，解析成功才替换，失败保留旧文档。不接管下方文本框的文字拖动，不修改草稿结构或发起模型请求。
- 当前共享限制：完整分析请求4MiB、图片Data URL合计3.5MiB、所有产品图和参考图合计最多32张。策划文档仍可解析最多31张参考图，增加产品图后若合计超限，应明确阻止提交。以 `analyze-limits.ts` 和解析器的实际校验为准，不能静默截断提示词或丢弃图片。

### 3.2 生图与结果

结果框映射：`generationEntryIds`记录完整编辑框顺序，`generationSlots`一框一组、允许未提交占位；占位不进入GenerateTask或发送意图。`generation-submission`按当前完整ID清单选取原位结果，删除/重排后重建当前组，移出框及旧追加重绘冻结原批次到历史，不从历史同名条目恢复。新任务仍唯一ID，已匹配任务沿用ID/旧图；相同5框只重交第3框仍保留其他4框。

`generationViewBatches`与`use-generation-entries.ts`读取当前草稿ID只投影显示，修正已存“1框却显示3卡”的旧混合结果；其余旧图在历史可看，队列/原图不改写，不需要重新生图。草稿保存的draft-updated事件只含键，订阅不恢复图片或读取Key、不调度。没有可靠草稿ID时回退原批次，不猜测主体映射；不同栏目分别取自己的草稿。计划张数/全选/失败筛选仅实际任务，未生成占位不计费、不重绘；锁、暂停/停止和并发仍按全栏真实任务。显式generationBatchId优先于旧redrawOf追溯，防止历史追加卡跟随当前任务重新混入。

结果按完整清单展示：generation-batches.ts优先generationBatchId，旧记录回退inputBatchId。generation-submission.ts以最新清单sourceEntryId和四入口传入的完整entryIds判断是否同一清单；只更新submitted条目，沿用结果ID/位置，使用新inputBatchId保存新素材，redraw.pending覆盖本次目标图号。未启用条目不改写；新图返回前/失败时保留旧图，resultVersions继续区分资产。同清单新增且单独启用条目也并入；无关清单分开统计，先10再15不显示25，五条只改第三条仍显示5。

GenerateQueuePanel持有完整执行队列，只渲染visibleTasks；批量选择/失败筛选/重绘仅当前清单。查看历史只改内存状态，不写存储或授予发送意图；提交事件或检测到新素材时回最新并清空勾选，刷新不恢复历史选择。历史redrawOf追溯来源归组；断链回退自身批次，无批次旧记录保守合组。

并发/暂停/停止/清空与onRunningCountChange仍按栏目完整队列判断，不能因查看历史stats.running=0解锁。generationBatchId和stoppedBeforeSend为可选字段，无新增存储键/批量迁移；无关且完整完成的旧清单仍允许替换，不保证归档全部历史。同清单局部更新保留其他条目；跨栏目、历史redrawOf不参与同条目匹配。输入批次只在全部有效引用释放后删除；结果ID复用时旧图通过原结果缓存保留，恢复按当前count限定图号。

栏目独立：readGenerateQueue(origin)、persistGenerateQueue(tasks, origin)、提交互斥、快照比较、内存意图、暂停、并发及Web Lock均按栏目隔离。四栏可同时生成；本栏运行/排队阻止本栏重交，其他栏目不阻塞。元数据保存失败不能继续发送或删除旧图。同条目处于interrupted时提交显示费用确认，取消返回cancelled，不写新素材/计划、不授予意图；其他未选待确认项不会自动重发。

任务origin对应栏目，sourceEntryId对应原编辑条目。新增任务分配全局唯一ID，同清单重交沿用原结果ID；不同栏目的同名编辑条目不冲突。迁移以自身sourceEntryId（旧任务回退id）恢复，排除历史redrawOf追加卡。统一API设置和资产中心继续共用。栏目参数为workbench/planner/remix/simple；裸/generate仅地址兼容，不触发提交。

暂停后续只拦截未开始任务，已发送连接继续接收；停止本轮设置stopping/暂停并abort本执行器所有本地连接。requestModelApi的waitWithSignal使共享连接校验、响应头/完整响应体等待均立即响应取消，底层延迟校验完成后检查signal，不会追加模型提交。runTask仍等待已返回检查点保存，取消后的最终状态/归档不能覆盖新结果；finishStop先将排队项标failed+stoppedBeforeSend、运行项标interrupted，再释放栏目锁。未发送项显式继续仅恢复当前visibleTasks相应条目；提交另一条不恢复它们。刷新无自动执行，服务商已收到的请求可能继续处理/计费，不承诺上游取消；禁止迟到响应改写后续重交。

旧全局generateQueue只读回退按每条origin分开；缺省origin使用generateOrigin.legacy-v2冻结原来源，防止新栏目提交后把旧记录搬到最新来源。v2栏目即使是[]也优先，不复活旧任务；旧全局记录不直接删除。旧输入批次可能跨栏共用，releaseQueueInputs核对所有有效栏目引用后才删除。新栏目使用独立Web Lock；当前栏目包含旧未完成任务时额外尊重旧全局Web Lock和租约，防止旧标签页仍执行时重复提交。兼容恢复不自动重发，测试与发布范围见进度顶部。

```text
任一生成入口
  → submitGenerateQueue 保存去重后的输入图和任务元数据
  → 跳转 /generate?source=当前栏目
  → 对应该栏的常驻generate-queue-panel按本栏并发设置驱动，仅同栏目跨标签互斥
  → 读取统一已保存配置，记录本次请求的配置快照
  → resolveImagePlan 按模型解析尺寸
  → requestModelApi → 直连服务商 / 本地服务端代理
  → 解析图片、读取实际像素、保存任务结果
  → 按个人偏好自动归档到资产中心
```

- 结果页SelectionActions操作终态任务的图片选择，ResultSelection支持卡头整组和图库当前单图；失败/缺图快捷选择包含缺少槽位及本轮redraw.pending。createRedrawTasks返回同ID/数量/输入批次的原位计划，保留原产品/参考素材；不把成品图自动充当参考。结果选择只存在当前常驻面板内，刷新清空，不触发请求；新提交批次及跨标签同步发现新输入批次时清空选择，防止复用卡片ID继承旧勾选。
- task-image-gallery的查看大图采用页内原生dialog，直接显示同一原图，保持比例；Esc/关闭恢复滚动。不能恢复window.open(dataURL)方式，Chrome可能阻止导航而无图片显示。验证脚本verify-result-preview.cjs阻断全部API并使用本地合成图。
- 手动重绘先获取栏目Web Lock和心跳租约，重新恢复素材；submitRedrawQueue与普通提交共用本栏提交互斥，异步恢复前后核对元数据快照。只更新所选原任务，不追加卡、不分配新任务ID或输入批次；先保存原位计划再设置仅当前页面有效的提交意图，失败不发送。redraw={id,indices,pending}记录本轮版本与零起始图号，resultVersions每个位置持有最新图片版本。image-batch.outputs携带请求序号，applyImageOutputs只回填所选对应位置；已返回即串行保存，成功位置从pending移除，其他图及旧图保持。部分明确失败为failed、结果不明为interrupted，手动重试仅选pending，待确认需核查确认；刷新/关闭保留检查点但不自动重发。
- 本次新增字段均可选，不迁移旧任务/输入/结果主键。历史redrawOf/redrawIndices追加卡原样保留，也可在自己的位置重绘；resultUrls的空槽位保留图号，计数只统计实际图片，元数据脱离data URL时用空串占位，IndexedDB保存完整对应数组。资产导入/手动保存/自动归档统一taskAssetId，用resultVersions区别重绘新图，既有资产不清理。
- 队列状态包括 `queued`、`running`、`success`、`failed`、`interrupted`。最后一个表示结果尚未确认，不能当成“肯定没生成”。
- image-failure.ts识别余额/额度不足（含user quota is not enough）为明确失败，即使服务商返回HTTP500；中文提示保留原始错误及请求编号。verify-quota-error.cjs拦截全部上游，覆盖代理403/500、直连403和刷新不重发。用户明确授权编写的尺寸只用于有标记的测试示例，不进入默认商品事实。
- `/generate` 的“任务并发”默认“全部同时开始”，也可保存为1、2、3、4、5、8、10个任务。全部模式按当前任务数分配，不限制为4个或10个；运行中不修改并发，每个任务的生成数量仍为1–4张。
- `image-batch.ts` 将每个任务拆成单图首次请求并行执行，GPT的n固定1，Gemini也每次只请求1张。5个任务分别设4、3、2、1、1张，全部模式发出11个请求，仍保留5张任务卡。较低任务并发数限制同时运行的组，组内仍单图并行。实际处理速度由服务商决定。
- 返回一张便串行写入IndexedDB检查点并更新resultCount，刷新恢复运行中 / 待确认的部分图片；兼容旧成功任务无resultCount。进度按已返回 / 计划总张数，部分返回不能算完整成功。手动“补生成缺少的 N 张”只请求缺少数量，保留已有URL与角标，不自动补费；未知结果先核查服务商。缺图和未完成重绘属于未完成记录，同栏目正常新批次保留旧项后追加，不自动补图或重试。原位重绘按pending扣除本轮未返回位置，不把旧图计作本轮新返回。
- 调度器使用独立任务控制器和结果存储；一个任务完成即可补入下一个。暂停只阻止后续任务，已提交连接继续接收；停止主动结束本地等待、保存检查点后释放锁，上游仍可能处理或计费。整页离开或刷新中断连接并将未确认任务标记为待确认，站内侧栏切换不会中断。结果不确定时暂停后续提交，保留其他任务已成功的结果，不自动补发。
- `submitGenerateQueue` 在输入、元数据、来源和暂停状态更新后派发 `GENERATE_QUEUE_SUBMITTED_EVENT`，使同一标签页常驻面板接收后续批次；面板运行锁收尾期间收到的通知延后到释放锁再处理。来源链接也监听该事件，不能只监听跨标签页storage事件。
- 每栏目各自由一个标签页持有Web Lock和心跳租约，同栏目其他标签页只读同步；不同栏目不互锁。获得锁后只重读本栏目持久化状态，防止根据旧快照重复提交。pagehide还需ownsLockRef为真，等待锁的观察页关闭/刷新不能把原执行页任务改成待确认。
- generate-queue-store.ts阻止覆盖本栏目排队/执行任务，待确认/缺图则保留后追加；不会查询其他栏目来阻止提交。
- 任务的 `productImages` 保存有序产品图；`productImageDataUrl` 兼容旧单图任务。输入批次在IndexedDB中按内容去重，localStorage只留指针；恢复时兼容旧批次的 `product` 和新批次的 `products`。生图FormData带 `productImageCount`，供原生Gemini正确区分补充图与竞品。
- 页面离开、刷新或连接中断，不应触发已经执行过的付费任务自动重发。手动确认重试仍可能再次计费。
- 加载/generate发现排队、待确认或旧部分结果时显示恢复条及数量，继续按钮仅执行排队项，查看按钮只滚动到核查卡片。待确认项重试需明确确认，原图保留。页面加载的旧排队任务设置暂停，本页submitGenerateQueue新提交由内存集合hasCurrentPageSubmission识别并正常开始；不将提交意图存入LS/sessionStorage，刷新无法据旧意图自动发送。
- 另一标签页的有效租约继续只读同步；每5秒检查过期租约，并在Web Lock可用及快照不变时恢复记录。原running转interrupted，排队暂停，恢复不发请求。已有单图检查点继续从IndexedDB恢复，不能承诺接回旧HTTP连接或服务端后台执行。
- `task-image-gallery.tsx`：一个预览区域配数字切换，数量为3就只显示1、2、3；保留部分返回的结果和警告。
- `requestInfo` 区分原始尺寸或自定义比例 `requestedSize`、提交尺寸 `submittedSize`、最终实际尺寸 `size`，并保存模型和耗时。
- `applyRequestedOutputSize`在全文对齐明确画布比例/像素/方向，末尾仅一个v2技术块，幂等保留商品实测尺寸、形状、屏幕与局部框事实。执行器/浏览器/代理/Gemini共享`promptForImagePlan`；三入口及无标记旧任务保持默认适配。极简新任务verbatim跳过全部文本处理，当前尺寸仅经API参数发送；Gemini预计像素不作为另一项严格比例。
- 队列开始执行时保存实际提交的提示词，任务预览和自动 / 手动归档使用此版本，原编辑卡的正文保留。`image-output-check.ts` 与图库onLoad按当前选中的原图实际像素检查偏离，含远程图片与恢复的历史结果；容许小幅舍入，明显比例或像素偏离须显示提示，保留原图，不裁剪 / 拉伸或自动重发。
- 自动归档失败不能让已成功的生图变为失败；任务结果与资产库是不同存储，结果卡可手动补存。

### 3.3 资产与套装

- 图片资产保留原图和独立缩略图、名称、分类、尺寸、生成提示词及模型；不包含API密钥。
- `AssetPicker` 在打开时读取列表，选图后按现有上传规则准备输入副本；原资产不被压缩覆盖。
- 自动 / 手动保存同一生成图片使用确定性ID，重复保存不增加副本，也不覆盖改过的名称。
- “导入已有生成结果”使用无参数readGenerateQueue汇总四个有效栏目能恢复的已有图片，不扫描所有历史文件，也不会调用模型。执行器读写必须显式传origin，不能把汇总列表写回某个栏目。
- 套装由 `suite-store.ts` 管理：名称和多条提示词，每条包含比例 / 自定义比例（兼容旧像素）；不随套装加载图片、Key、数量、清晰度或生成模式。
- 套装编辑：LoadSuitePanel和侧栏旧链接仍可带returnTo访问/suite，但VisualSuite不再按来源跳转；顶部（有编辑内容时）和固定底栏的“保存并返回套装列表”在saveSuite返回created/updated后立即把表单恢复为名称空、一条空提示词，并同步保存空白草稿，保留已保存列表在同页。固定底栏“仅保存”留在原编辑表单。校验、套装存储或草稿清空失败时留在当前内容、固定栏持续显示saveError；同名更新保留ID、长文、比例和旧像素，其他栏草稿不动。setName/setEntries同步更新draftRef，旧保存effect cleanup和pagehide只写最新快照，避免刚返回列表又被旧编辑快照覆盖；恢复完成前不保存空首帧。不自动载入套装、调度模型或新增存储键/字段。

## 4. API、代理和模型差异

| 模块 / 接口 | 职责 |
| --- | --- |
| `api-settings.ts` | 统一配置读写、旧配置兼容；只有设置页提交保存 |
| `POST /api/provider-transport` | 校验服务商并选择直连或代理，不接收Key |
| `model-api-client.ts` | 浏览器统一请求入口；尺寸预处理及直连接口适配 |
| `POST /api/analyze` | 服务端分析代理、请求体和图片校验 |
| `POST /api/images` | 服务端生图代理、输入校验、模型路由 |
| `POST /api/blob-upload` | 返回410；匿名云端文档上传已禁用 |
| `server-api-endpoint.ts` | 只允许默认OpenAI源和 `ALLOWED_API_ORIGINS` 配置的HTTPS源 |
| `upstream-fetch.ts` / `stream-json.ts` | 服务端长请求传输与JSON响应 |

云端仅在 `VERCEL=1`、服务商为精确的 `https://api.openlux.ai/v1`、且已通过允许列表时使用浏览器直连，规避部署平台的长请求限制。其他情况走代理。不能无条件开放任意URL直连或代理。

model-api-client的浏览器统一15分钟截止时间覆盖直连/代理及完整响应体，返回前先完成读取，避免代理已给响应头但正文一直不结束。超时返回504及interrupted，不自动重试；用户主动取消仍抛原取消异常。transportFor的无密钥配置校验15秒超时，失败后清除缓存，可由下次用户操作重新校验。RequestWaitNotice在分析/迁移/策划/生成页展示等待秒数及提示，只读状态。验证见test-model-request-deadline.ts（无网络）和verify-ux-u2-u7.cjs（隔离浏览器全模拟，测试中缩短计时）。

修改模型逻辑先读 `model-image-plan.ts`、`gemini-image-request.ts`、`image-request.ts`：

- 当前GPT Image 2规则：每边为16的倍数，最长边≤3840，长短边比≤3，总像素655360–8294400。已经合法的尺寸原样使用，其余就近适配。例如1920×1080 → 1920×1088。21:9预设为1K 2464×1056、2K 3584×1536。
- Gemini 3 Pro Image / Gemini 3.1 Flash Image（含preview）走原生 `v1beta/models/{model}:generateContent`，传 `aspectRatio` + `imageSize`，而非直接套GPT像素限制。像素为预估，完成后显示实际返回值。界面通常提供1K/2K，适配器也可识别4K参数。
- Gemini正常队列按单图并行调用原生接口，忽略 `thought:true` 思考图片。底层gemini-image-request工具仍兼容直接传入多张时的顺序调用，但四个入口的统一队列每次只传1张；任何通道均不得自动补发。
- 其他未内置模型通过兼容接口提交填写尺寸，不保证所有服务商都支持；不要宣称“任何模型都已适配”。
- 请求超时配置不能保证上游一定完成，或超过平台限制仍可持续执行。结果不确定时应展示待确认。

上述是当前实现。更新模型兼容性时再核对服务商官方文档与实际响应，不只修改下拉框里的模型名称。

## 5. 浏览器数据与安全边界

| 存储 | 内容 | 主要文件 |
| --- | --- | --- |
| localStorage `amazon-workbench.api-settings.v1` | 两组API配置，含用户Key | `api-settings.ts` |
| localStorage `amazon-workbench.draft.*` | 页面文字和图片恢复指针；小图也可能内联 | `draft-store.ts` |
| localStorage `amazon-workbench.generateQueue.v2.<栏目>` | 四个独立栏目元数据；旧generateQueue按来源只读回退 | `generate-queue-store.ts` |
| localStorage `amazon-workbench.queueHold.v2.<栏目>` / `queueLock.v2.<栏目>` | 栏目暂停与心跳租约；旧未完成任务兼容旧租约 | `generate-queue-store.ts` |
| localStorage `amazon-workbench.generateConcurrency.v1.<栏目>` | 栏目并发偏好；旧全局值仅作初始回退，默认all | `generate-concurrency.ts` |
| localStorage `amazon-workbench.suites` | 提示词套装 | `suite-store.ts` |
| localStorage `amazon-workbench.profile.v1` | 本地个人资料和偏好 | `profile-store.ts` |
| IndexedDB `amazon-workbench-inputs` / `records` | 大图和去重后的任务输入 | `browser-image-store.ts` |
| IndexedDB `amazon-workbench-results` / `task-results` | 已生成图片，按任务恢复 | `generate-queue-store.ts` |
| IndexedDB `amazon-workbench-assets` / `assets` + `images` | 资产元数据、缩略图和原图Blob | `asset-store.ts` |

- 密钥是浏览器中的用户配置，不是项目内置公用Key；它会随请求发送给选定服务商，代理模式也会经过本站服务端。localStorage不是加密密钥保险箱，修改时需继续防范XSS和日志泄露。
- 没有账号权限隔离；同一浏览器配置文件内能访问本站数据的人可以读取这些本地内容。不能把当前系统描述成多用户云端资产系统。
- 不清空 localStorage、IndexedDB 或用户草稿来“修复”问题。变更存储结构需考虑已有用户和迁移。
- 大图不能直接塞进localStorage。资产元数据和原图分别保存，避免列表加载全部原图。
- 不把 `.env*`、API测试文件、访问令牌、浏览器用户目录和生成结果公开或写入日志。

## 6. 运行、验证与部署

### 安装与启动

安装版本的Next要求Node≥20.9.0；此前验证环境使用Node24。新环境先安装依赖，已有环境先检查，不要为读文档重装依赖。

```powershell
# 新检出目录；使用npm和package-lock.json
npm ci
npm run dev
# 生产运行：先构建，后启动
npm run build
npm run start
```

开发脚本默认使用Webpack，另有 `npm run dev:turbo`。生产构建使用 `npm run build`。修改Next相关代码前查阅 `node_modules/next/dist/docs/`，不要按旧版本记忆套用API。

本地允许OpenLux代理需要服务端环境变量：`ALLOWED_API_ORIGINS=https://api.openlux.ai`。这是服务商源允许列表，不是Key；用户接口和Key仍在页面配置。新增服务商前保留相同校验规则。

`next.config.ts` 支持 `NEXT_BUILD_DIR` 隔离构建目录。普通端口3000、测试端口和测试环境以当前运行进程为准；不要照抄某次会话PID，不要杀掉所有Node进程。更新本地服务前确认无正在执行的上游生图；避免覆盖正在提供服务的构建目录。

### 构建产物与清理

- 历史`.next-verify*`与未在使用的旧`.next`可重建；必须先核对绝对路径、目录用途和服务进程，临时服务停止后才清理对应产物。当前需要立即启动的生产构建保留。
- TypeScript/ESLint已排除`verification/`、`backups/`及历史`.next-verify*`，移除tsconfig里旧隔离构建类型的显式include；普通源码、脚本及默认`.next`类型检查仍保留。
- `verification/`有私人输入、真实付费结果和浏览器资料，不可批量当缓存删除；`backups/`亦保留恢复用途。node_modules保留运行依赖；JSZip已自带类型，仅删除无效stub包`@types/jszip`。
- 历次构建清理的删除清单、恢复位置和实际验证结果见progress；历史通过不能代替新改动验证。

### 优先选择与修改相关的验证

```powershell
npx tsc --noEmit
# 对实际改动文件运行ESLint；全项目可能包含旧脚本和历史诊断代码
npx eslint src/lib/model-image-plan.ts
# 下面的TypeScript测试需要tsx执行器，当前未固定为项目依赖
npx --yes tsx scripts/test-model-image-plan.ts
npx --yes tsx scripts/test-image-sizes.ts
npx --yes tsx scripts/test-model-api-client.ts
```

| 场景 | 参考脚本 | 性质 |
| --- | --- | --- |
| 八条长文套装保存并返回列表/仅保存、同名更新和原输入保留、校验/存储失败、旧来源参数、保存后立即刷新、390/320固定栏 | `verify-suite-return.cjs` | 独立Edge、合成套装和原草稿、所有模型端点阻断，无真实请求；默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR |
| 迁移切走继续并发/逐条回填、计时/条数/完成/失败、策划并行、双击保护、缓存手动补项、超时/刷新零重发、套装载入及手机 | `verify-remix-navigation.cjs`、`verify-remix-incremental.cjs` | 独立Edge、合成条目/虚拟Key、所有模型端点拦截；后者覆盖8条中6条成功、乱序检查点/仅重发失败、人工编辑后重发及快速刷新；默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR；不读取个人浏览器资料/不产生模型费用 |
| 四栏目卡片点击/大图、100%/缩放/适应/滚动、新标签字节与尺寸、JPEG/PNG/纵图/缺图、旧缓存及手机 | `verify-original-viewer.cjs` | 独立Edge、合成2048×1536/1536×2048原图、模型端点全部阻断；新标签真实打开本地Blob并核对SHA-256，远程图仅拦截模拟/链接检查；默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR |
| 策划切换导航继续等待/完整回填、忙碌/完成/失败、工作台并行、重复点击、超时与刷新零重发、隐藏固定栏 | `verify-planner-navigation.cjs` | 独立Edge点击真实站内链接、模型接口全拦截；默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR；15分钟超时以受控缩短浏览器计时验证，无真实模型费用 |
| 生图错误提示的9种语言、别名/回退、插值、语言优先级及21次本地POST校验 | `test-i18n.ts` | `node scripts/run-ts-test.cjs scripts/test-i18n.ts`；上游网络全拦截，无真实模型费用 |
| 极简新任务原文、空白/围栏/多语言保留，直连/代理与GPT/Gemini/通用，四图顺序及API尺寸 | `test-verbatim-prompts.ts`、`verify-prompt-intent.cjs` | 12种离线出站组合/独立Edge30次模拟；三入口仍适配，极简图文/文生图直传，不代表真实画质 |
| 四入口10→15当前批次只计15，历史保留/切换无请求、并发保护/选择隔离/原位重绘/刷新默认最新 | `test-generation-batches.ts`、`verify-result-batches.cjs` | 无网络逻辑/独立Edge全模拟；默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR |
| 工作台v13/迁移v9/策划v10完整角色、工作台额外需求优先/灵活参考及三处站点文案、完整回填/失败、v12冻结/精确升级/自定义保留 | `test-prompt-workflows.ts`、`verify-prompt-workflows.cjs` | 无网络逻辑/独立Edge13次全模拟，默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR；不证明真实文案/图像质量 |
| 四栏目同时执行；暂停/停止/并发/超时/重绘/清空隔离；同栏多标签、刷新仅手动继续；旧混合任务和共用图片兼容 | `test-queue-submission.cjs`、`verify-scoped-queues.cjs` | 当前栏目结构的主回归；无网络逻辑 / 隔离无头Edge全模拟，默认3037，可设TEST_BASE_URL与TEST_OUTPUT_DIR |
| 旧缺图/待确认后从四入口提交、同名任务隔离、来源导航、旧图/输入保留及刷新不重发 | `test-queue-submission.cjs`、`verify-queue-conflict.cjs` | 无网络逻辑 / 隔离无头Edge全模拟；默认3037，不读取用户浏览器资料 |
| 五页新增6条后固定栏不移动、桌面/390/320、末条无遮挡、全屏编辑、固定栏实际操作及隐藏页不叠加 | `verify-fixed-actions.cjs` | 合成图片、隔离Chrome、模型接口全拦截，无费用；默认3034，可设TEST_BASE_URL |
| API引导/同页保存/三入口分析模型、继续仅排队、核查确认、部分补图、刷新检查点和过期租约 | `verify-recovery-model-setup.cjs`、`test-model-prompt-profile.ts` | 隔离Chrome和单元模拟，无真实费用；默认3033，可设TEST_BASE_URL |
| 自定义比例与清晰度、四入口、保存/编辑/调用套装、模型出站参数 | `test-custom-ratio.ts`、`verify-custom-ratio.cjs` | 单元/真实路由上游拦截/隔离浏览器模拟；默认3027 |
| 四入口原位重绘、图号/卡片身份保持、乱序/部分失败、重试仅pending、保存失败、刷新零重发和历史记录兼容 | `test-generation-selection.ts`、`test-image-batch.ts`、`verify-in-place-redraw.cjs` | 无网络逻辑 / 独立无头Edge全模拟；默认3037，可设TEST_BASE_URL/TEST_OUTPUT_DIR |
| 四栏目高亮、切回生成结果、输入编辑、成功/失败/清空及手机 | `verify-generation-navigation.cjs` | 隔离Chrome，全模拟；默认3029 |
| 模型尺寸、Gemini请求、多张和部分失败 | `verify-model-sizing.cjs` | 模拟接口，无生图费用 |
| 四入口当前1:1覆盖多段旧16:9、直连 / 代理、Gemini、第二张比例不符及刷新不重发 | `verify-canvas-priority.cjs` | 模拟接口，无模型费用；默认3016，可设TEST_BASE_URL |
| 全文画幅、商品事实、幂等、Gemini及实际POST路由出站控制 | `test-canvas-priority.ts`、`test-image-route-canvas.ts` | tsx执行；后者拦截全部上游网络，无模型费用 |
| 5任务 / 11个单图请求、逐张保存、旧缺图恢复、只补缺图、混合结果、限制并发、多标签及待确认 | `verify-concurrent-queue.cjs` | 隔离Chrome、模拟接口，无生图费用；默认端口3017，可设TEST_BASE_URL |
| 资产、个人资料、跨页选图、备份、归档 | `verify-assets-profile.cjs` | 模拟接口，无生图费用 |
| 统一API设置与页面调用 | `verify-image-settings.cjs` | 模拟接口 |
| 套装、导航和保存加载 | `verify-navigation-suite.cjs` | 模拟接口 |
| 分析图片预算与完整传输 | `verify-analysis-image-budget.cjs` | 模拟接口 |
| 原生拖拽、四产品图、主次、参考图顺序和恢复 | `verify-product-uploads.cjs`、`test-product-image-order.ts` | Chrome原生文件拖拽 / 模拟模型，无生图费用 |
| 提示词固定高度、全屏编辑、复制与草稿恢复 | `verify-prompt-editor.cjs` | 长短文本、五页和手机布局，无模型调用 |
| 工作台勾选、批量分析、未勾选零请求、失败保留、选中生图与手机布局 | `verify-workbench-selection.cjs` | 模拟接口，无模型费用，默认端口3013，可设TEST_BASE_URL |
| 四页参数统一、实际条数 / 张数、旧像素迁移、自定义保留、比例 / 清晰度接口参数、其余页面与手机 | `verify-unified-generation.cjs` | 模拟接口，无模型费用，默认端口3015，可设TEST_BASE_URL |
| 默认关闭、空卡跳过、侧栏切换延迟结果、工作台回填、生图后台接收、新批次与刷新待确认 | `verify-navigation-continuity.cjs` | 隔离Chrome点击真实站内链接，模拟接口，无模型费用；默认端口3014 |
| 策划文档和返回解析 | `test-planner-doc.ts`、`test-planner-parse.ts` | 先查看夹具与执行方式 |
| GPT / Gemini真实生图 | `verify-real-model-sizing.cjs` | **真实付费请求**，依赖私人测试文件 |

脚本在 `scripts/`，先打开脚本核对BASE地址、Chrome路径、测试夹具与付费标志。模型尺寸脚本默认端口3005，资产脚本默认端口3007；可通过 `TEST_BASE_URL` 指向自己的隔离服务。模拟直连测试需匹配脚本和服务端的transport模式，必要时仅对隔离服务设置 `VERCEL=1`。脚本可能需要可用的本机Chrome路径。

`verification/`是被Git和部署忽略的本机输出，可有历史测试数据和私人文件，交接副本可能没有。旧诊断脚本可能断言全局队列键、裸/generate或混合结果页（如verify-queue-conflict旧版本、假设追加重绘的verify-selection-redraw），不代表栏目隔离后的现行规则。旧verify-canvas-priority等脚本若仍断言极简正文自动覆盖画幅，也不适用于v5原文模式；以test-verbatim-prompts与已更新verify-prompt-intent为准。先适配再作门禁，不能一键盲跑；新脚本用独立TEST_OUTPUT_DIR避免覆盖历史记录。

截至上次功能交付已完成：构建、相关ESLint、1200组GPT尺寸规则验证、模拟界面验证，以及GPT自定义尺寸 / Gemini原生接口各一张真实成功测试。资产和个人中心也做过线上隔离浏览器完整流程验证。**这些是历史验证，不代表新修改已通过；不能伪称当前环境重新运行过。**

### 发布

当前使用Vercel CLI部署，具体项目绑定在本机 `.vercel/`，不包含在通用交接包。新环境应由项目所有者确认绑定项目。

用户要求发布且目标已确认后，使用其账户执行生产部署，核对构建结果、生产别名和实际页面。仅修改交接文档无需发布。

`.vercelignore` 排除了环境文件、测试脚本与结果、构建缓存和本机状态。仓库没有已配置的云端账号数据库；环境中存在历史Blob令牌也不表示公开上传已启用，不能因此恢复匿名上传。

## 7. 容易误判的事项

1. `项目概述.md` 的六页、每页配置、任意中转站、原Excel直发、旧套装字段、老Node版本均不能照搬。
2. `legacy-visual-strategist-prompt.ts` 等文件可能承担兼容用途，删除前先查引用。
3. 浏览器仍显示旧提示词或旧页面时，先辨别草稿恢复、保存的角色覆盖、缓存和运行服务版本；不要直接清用户数据。
4. 模型请求很快返回不一定是失败，也可能本地校验、鉴权错误、连接中断或上游结构不兼容。先看错误状态、请求次数和返回结构，不自动重发试错。
5. 只改API服务端可能漏掉Vercel直连路径；只改前端也可能漏掉本地代理。模型适配需检查两条路径。
6. 本项目此前的大量未提交 / 未跟踪功能代码已纳入本次GitHub上传范围，实际提交/推送状态见进度顶部。以后交接仍必须检查 `git status`；仅复制HEAD、只给远程仓库地址或用 `git archive HEAD`，可能漏掉新的未提交功能。
7. 账号、云端资产、SMTP和Supabase只是后续可能方向，用户已暂缓，不是当前版本的待修复缺陷。

## 8. 如何把项目交给其他AI

建议提供：`src/`、`public/`（若存在）、`package.json`、`package-lock.json`、构建 / TypeScript / ESLint配置、`AGENTS.md`、`AI_QUICKSTART.md`、本文件和必要的无密钥测试脚本 / 夹具。先核对未跟踪文件，交接当前源码状态。

排除：`.env*`、`.vercel/`、`.git/`（除非明确需要历史且已审查）、`node_modules/`、`.next*`、`verification/`、备份压缩包、私人产品图、测试API文件、浏览器资料和含密钥的日志。单个脚本也可能含本机路径或真实请求逻辑，分享前审查。

在对方工具打开源码目录后，将 `AI_QUICKSTART.md` 的开场说明连同本次具体需求发给它。要求它先确认“用途、相关数据流、不能破坏的规则”，再修改相应模块。每次功能更新后同步维护这些交接文档，避免另起一份互相矛盾的项目介绍。
