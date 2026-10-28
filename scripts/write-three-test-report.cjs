const fs=require('node:fs')
const path=require('node:path')
const ROOT=path.resolve('verification/three-real-tests')
const OUT=path.join(ROOT,'delivery')
const onlineFile=path.join(ROOT,'online-verification.json')
const online=fs.existsSync(onlineFile)?JSON.parse(fs.readFileSync(onlineFile,'utf8')):null
const validation=JSON.parse(fs.readFileSync(path.join(ROOT,'delivery-validation.json'),'utf8'))
const groups=[['workbench','视觉工作台',12],['remix','提示词迁移',12],['planner','一键策划',9]]
const rows=groups.map(([phase,title,count])=>{
 const entries=validation.results.filter(x=>x.phase===phase)
 return `| ${title} | ${entries.length}/${count} | ${entries.length}/${count} | ${entries.reduce((sum,x)=>sum+x.promptChars,0).toLocaleString('zh-CN')} 字符 |`
}).join('\n')
const report=`# 三项真实测试与优化结果

日期：2026-10-15。素材与模型来自用户指定的测试目录；未改动原始素材、策划表或 API 文件。

## 结果

| 流程 | 完整提示词 | 成功图片 | 提示词总长度 |
| --- | ---: | ---: | ---: |
${rows}

共 ${validation.totalImages} 张最终图片。每张都有独立全文 TXT；套装 JSON 仅含名称、提示词和对应比例等套装数据。双击“测试结果总览.html”即可离线查看全部图片和提示词。

- 视觉工作台：上传真实产品图，按 12 张竞品参考图逐条生成提示词、保存套装并生成图片。先前误把竞品商品当成产品的主图已重测；第 6 张未知内页问题另做纠正复测。
- 提示词迁移：实际调用已保存套装，上传腊肠犬主题新品，完成 12 条完整迁移与 12 张生图，保留各条构图目标和比例。未压缩成短句或省略负向提示词。
- 一键策划：实际读取 8MB Excel，提取并发送全部 12 张内嵌参考图，加产品图共 13 张；按表格所在行关联版位，生成 9 条提示词并分发到 9 个框，最终生成 9 张图片。
- 尺寸图：使用用户明确授权编写的虚拟尺寸；图片实际保留“Beispielmaße – nur für Test, nicht gemessen”。这些数字未经实测，不能作为正式商品规格。

## 发现的问题及修复

| 优先级 | 位置与问题 | 影响 | 修复及验证 |
| --- | --- | --- | --- |
| 高 | 分析请求中产品图与竞品图身份不够明确 | 将竞品印花、配件带入我方商品 | 共享 analysis-content 在每张图片前单独标注身份；真实主图和迁移图已核对 |
| 高 | 底层 HTTP 连接约 5 分钟超时 | 上游仍在处理却提前返回待确认 | SDK、连接头和响应体超时统一 15 分钟；原生 FormData 上传及延迟响应回归通过；无自动付费重试 |
| 高 | 云端长请求及大图片响应受平台限制 | 本地能用、公开站点可能提前中断或丢结果 | 已允许的 OpenLux 云端请求使用浏览器直连；校验接口不接收 Key，其他地址继续代理；大 JSON 代理响应改为分块发送 |
| 高 | 草稿与队列直接重复保存图片到 localStorage | 大图提交失败、刷新丢图、较早快照覆盖最后编辑 | 输入图片去重保存至 IndexedDB，文字保留同步元数据；大 PNG、两张参考图、12 条任务及最新编辑刷新回归通过 |
| 高 | Next.js 16.2.4 存在已知生产漏洞 | 公开运行风险 | 更新至 16.4.1、同步 ESLint 配置与兼容间接依赖；生产依赖审计为 0 个已知漏洞 |
| 中 | 迁移或策划缺项时可能覆盖为残缺内容 | 新旧商品提示词混杂或遗漏版位 | 校验连续编号及完整正负向内容，通过后整批替换；迁移成功条目缓存，重试只处理未完成项；模拟页面回归通过 |
| 中 | 未提供内页却照竞品生成打开的笔记本 | 虚构商品结构，把封面印到内页 | 系统规则要求保持本子闭合，书写移到独立便签；迁移第6张已实际验证，工作台第6张另做线上复测 |
| 中 | 迁移页面只在卸载保存、图片仍占本地配额 | 最新编辑或大产品图可能丢失 | 接入统一草稿图片存储，增加防抖、pagehide 保存；超过3MB产品图及12条提示词刷新恢复通过 |
| 低 | Tailwind 扫描测试浏览器文件 | Windows 文件锁导致构建失败 | 扫描限制到 src，忽略验证目录；最终生产构建成功 |

## 运行与上线验证

- Next.js 16.4.1 正式构建成功；全量 src ESLint、TypeScript 检查通过。
- 回归覆盖：提示词完整性与当前尺寸、迁移缺项原子保护与缓存、全部参考图、输入/结果恢复、长连接、文件上传、超过6MB JSON、云端允许列表与直连路径。
- 公开站点：https://amazon-visual-workbench-lac.vercel.app 。七个页面均返回 200；旧匿名上传接口返回 410，未配置服务商返回 400。
- 部署所属账户为用户已确认的 liyangwei52-ops，项目 amazon-visual-workbench；部署 ID：dpl_DsyXAvGK3LL9xuJmt5riLi36EyBk。
${online?`- 线上真实生图：通过公开页面调用 OpenLux images/edits，成功返回 ${online.width}×${online.height} PNG，${(online.bytes/1024/1024).toFixed(2)}MB，用时 ${online.seconds} 秒；观察到 ${online.calls.length} 次真实生图 POST。用于工作台第6张修正测试。`:'- 线上额外真实纠错图：仍在验证，三项本地真实测试的33张已完成。'}

## 使用的 Skills

- amazon-competitor-prompt：产品事实优先、参考图结构迁移、完整正负向约束及商品真实性检查。
- Spreadsheets：只读核查 Excel 的策划文字、内嵌图片数量及图片所在行，不改写原始工作簿。

## 实际限制

- 上游处理时间有波动；本轮有请求接近12分钟才返回。程序可等待15分钟，但无法保证服务商秒级完成；离开生成页面仍会失去当前连接。
- 生图模型并非像素级复刻。小字拼写、细小印花及商品不可见表面仍需人工复核；不要把测试通过等同于全部图片无需审稿即可上架。
- 生产运行依赖为0个已知审计漏洞；开发工具依赖仍有审计项，不能将其表述为全依赖无风险。
- 测试与纠错实际调用了付费接口；具体扣费以服务商账单为准。本报告未推算未公开的模型单价或费用。
- 交付文件已检查不含测试密钥；浏览器测试配置、原始 API 文件和临时日志没有放入交付目录或上传部署。
`
fs.writeFileSync(path.join(OUT,'三项测试结果说明.md'),report,'utf8')
console.log('Wrote 三项测试结果说明.md')
