const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve('verification/edge-real-20261017');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-manifest.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(root, 'plan.json'), 'utf8'));
const escape = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function main() {
  plan.analysisSubmitted = 24;
  plan.analysisReturned = 22;
  plan.imageSubmitted = 32;
  plan.imageReturned = 32;
  plan.currentStage = '本轮结束：32次生图全部返回；工作台第8路无提示词、策划上游超时，未自动重试；15张未发送。';
  plan.analysisFailures = [
    { phase: 'workbench', entry: 8, result: '分析结束但没有提示词；旧版临时通知已消失，无法确认原始原因；没有重试。' },
    { phase: 'planner', result: 'The upstream service timed out. Please try again later.', requestId: '20261017160813827737352fR1jE1Ds', imageRequestsSent: 0, retried: false }
  ];
  plan.pendingAction = null;
  plan.imageRequestsNotSent = { workbench: 1, remix: 1, planner: 13, total: 15 };
  const checks = manifest.map(x => {
    const ratio = x.phase.startsWith('04') && x.original === 2 ? '5:4' : x.phase.startsWith('01') || x.phase.startsWith('02') ? [9, 10].includes(x.original) ? '21:9' : '1:1' : '1:1';
    const [a, b] = ratio.split(':').map(Number);
    const expected = ratio === '21:9' ? [3584, 1536] : ratio === '5:4' ? [2560, 2048] : [2048, 2048];
    return { ...x, ratio, submitted: expected.join('x'), ratioError: Math.abs(x.width / x.height - a / b) / (a / b), exactPixels: x.width === expected[0] && x.height === expected[1] };
  });
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(root, 'image-checks.json'), JSON.stringify(checks, null, 2));
  const phaseCounts = Object.fromEntries(['01-视觉工作台', '02-提示词迁移', '03-一键策划', '04-极简生图'].map(phase => [phase, checks.filter(x => x.phase === phase).length]));
  const summary = { analysisSubmitted: 24, analysisReturned: 22, imageSubmitted: 32, imageReturned: 32, imageNotSubmitted: 15, decoded: 32,
    phases: phaseCounts, exactPixels: checks.filter(x => x.exactPixels).length, pixelMismatch: checks.filter(x => !x.exactPixels).length,
    ratioWithinTwoPercent: checks.filter(x => x.ratioError <= .02).length, noPaidRetries: true };
  fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
  const rows = checks.sort((a, b) => a.phase.localeCompare(b.phase) || a.original - b.original || a.slot - b.slot);
  const text = `# 2026-10-17 Edge 真实实例测试\n\n使用 Microsoft Edge 操作正式网站，资料来自 G:\\2026\\10月\\测试。API Key 不包含在报告或备份中。\n\n|阶段|实际分析|提示词返回|生图提交|图片返回|\n|---|---:|---:|---:|---:|\n|视觉工作台|12|11|15|15|\n|提示词迁移|11|11|15|15|\n|一键策划|1|0|0|0|\n|极简生图|0|直接使用2份原文|2|2|\n|合计|24|22|32|32|\n\n## 异常及限制\n\n- 工作台原第8路分析结束但没有提示词，旧版通知消失，未能追溯原始原因。没有重发，后续套装/迁移跳过这一项。\n- 一键策划成功提取800字、12张内嵌图并提交分析，上游返回超时；请求编号20261017160813827737352fR1jE1Ds。没有返回提示词，因此计划13张图片全部未发送。测试虚拟尺寸已填写，但本次没有尺寸图可验收。\n- 原计划47张中15张未发送（上述工作台/迁移各1张、策划13张）；不能声称47张已测通过。\n- 32张原图全部通过完整解码。${summary.ratioWithinTwoPercent}/32张实际比例与设置偏差≤2%；${summary.pixelMismatch}/32张实际像素低于设置，${summary.exactPixels}/32张达到提交像素。未放大、裁剪、拉伸或自动重试。\n- 极简第二张：提示词正文原1:1，自定义5:4优先，提交2560×2048，返回1402×1122，比例接近但像素不足。\n- 原第3、5条在工作台和迁移均各3张全部返回；结果独立保存，资产中心自动归档32张。\n\n## 已修复\n\n- 工作台分析错误留在对应卡片并随草稿保存，刷新后仍保留原因、原提示词及素材；不自动重发。\n- 迁移失败增加常驻说明，保留原提示词；载入套装或清空时清理旧错误。\n- 三处分析入口将上游超时解释为中文，保留英文原文和请求编号；策划错误区域支持屏幕阅读器。\n- ESLint、隔离生产构建、错误消息测试通过；Edge本地模拟503验证工作台失败、刷新不重发和迁移不替换原文。两次模拟分析无真实模型费用。\n\n## 文件\n\n各阶段目录包含完整提示词、实际提交提示词与原图；image-checks.json逐张记录尺寸，assets-32.zip为页面原生备份。planner-error.txt/png保留超时证据。最终本地/发布状态以项目docs/progress.md为准。\n`;
  const visualNote = '## 画面抽查与规则调整\n\n迁移原第4条从单支圆珠笔细节改写成整套商品，主体范围发生偏移。已在迁移系统合同和逐条用户消息中补强“保留本条主体范围、局部框对应同一主体”。现有测试图片与提示词原样保留；新规则尚未追加真实付费质量复测，不能声称该成图问题已经被实测消除。\n\n';
  fs.writeFileSync(path.join(root, '测试记录.md'), text.replace('## 已修复', visualNote + '## 已修复'));
  const cards = rows.map(x => `<article><h3>${escape(x.phase)} · ${x.original} / 图${x.slot}</h3><a href="${encodeURI(`${x.phase}/${x.file}`)}"><img loading="lazy" src="${encodeURI(`${x.phase}/${x.file}`)}"></a><p>${x.ratio} · 提交${x.submitted} → 实际${x.width}×${x.height}${x.exactPixels ? '' : ' · 像素不足'}</p><a href="${encodeURI(`${x.phase}/${String(x.original).padStart(2, '0')}-提示词.txt`)}">完整提示词</a></article>`).join('');
  fs.writeFileSync(path.join(root, '测试结果总览.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>20261017 Edge 实测结果</title><style>body{font:16px/1.7 system-ui;background:#101316;color:#edf3f7;margin:24px}a{color:#9ecfff}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}article{background:#1b2229;padding:16px;border:1px solid #41515d;border-radius:12px}h3{font-size:15px}img{width:100%;height:280px;object-fit:contain;background:#fff}p{font-size:14px}aside{padding:20px;border:1px solid #d4aa50;margin-bottom:24px}</style><h1>Edge 真实实例测试 · 2026-10-17</h1><aside><b>32次生图 / 32张返回；24次分析 / 22条返回。</b><p>工作台15张、迁移15张、极简2张。策划上游超时，13张未发送；工作台原第8路未返回提示词，其本身与迁移各1张未发送。原计划47张，不能按47张通过计算。</p><p>${summary.pixelMismatch}/32张实际像素低于设置，全部保留原图。没有自动重试或重新计费。</p><a href="测试记录.md">完整测试记录</a> · <a href="planner-error.png">策划失败截图</a></aside><section>${cards}</section></html>`);
  const width = 1200, tileW = 300, tileH = 250;
  const composite = [];
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i], left = i % 4 * tileW, top = Math.floor(i / 4) * tileH;
    const thumb = await sharp(path.join(root, x.phase, x.file)).resize(288, 208, { fit: 'contain', background: '#fff' }).png().toBuffer();
    const label = `<svg width="300" height="36"><rect width="300" height="36" fill="#17212b"/><text x="8" y="22" fill="white" font-family="Arial" font-size="14">${x.phase.slice(0,2)} / ${x.original}-${x.slot} : ${x.width}x${x.height}</text></svg>`;
    composite.push({ input: Buffer.from(label), left, top }, { input: thumb, left: left + 6, top: top + 36 });
  }
  await sharp({ create: { width, height: Math.ceil(rows.length / 4) * tileH, channels: 3, background: '#26333e' } }).composite(composite).png().toFile(path.join(root, 'contact-sheet.png'));
  console.log(JSON.stringify(summary));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
