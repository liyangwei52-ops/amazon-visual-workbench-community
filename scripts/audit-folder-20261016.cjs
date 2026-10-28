const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve('verification/folder-20261016'),phases=['workbench','remix','planner','simple'],summary=[],failures=[]
let imageRequests=0,analysisRequests=0
for(const phase of [...phases,'planner-extra']){const calls=JSON.parse(fs.readFileSync(path.join(root,phase,'calls.json'),'utf8'));imageRequests+=calls.filter(x=>x.kind==='images').length;analysisRequests+=calls.filter(x=>x.kind==='analyze').length}
for(const phase of phases){const dir=path.join(root,phase),results=JSON.parse(fs.readFileSync(path.join(dir,phase==='planner'?'combined-results.json':'results.json'),'utf8'));let lowerResolution=0,ratioMismatch=0
 for(const [i,t]of results.entries()){
  if(t.images.length<t.count)failures.push({phase,entry:i+1,expected:t.count,returned:t.images.length,status:t.status,error:t.error})
  const match=/^(\d+)x(\d+)$/.exec(t.requestInfo.submittedSize)
  for(const image of t.images){assert.ok(fs.existsSync(path.join(dir,image.file)));if(match){const w=Number(match[1]),h=Number(match[2]);if(Math.abs(Math.log((image.width/image.height)/(w/h)))>0.03)ratioMismatch++;else if(Math.abs(image.width/w-1)>0.05||Math.abs(image.height/h-1)>0.05)lowerResolution++}}
 }
 const prompts=JSON.parse(fs.readFileSync(path.join(dir,'prompts.json'),'utf8'));assert.ok(prompts.every(p=>p.includes('【正向 Prompt】')&&(/【负向\s*Prompt】|15[.．、]\s*负向\s*Prompt/i.test(p))))
 if(phase!=='simple'){assert.equal(results[2].count,3);assert.equal(results[4].count,3);assert.equal(results[2].images.length,3);assert.equal(results[4].images.length,3)}
 summary.push({phase,prompts:prompts.length,promptCharacters:prompts.map(x=>x.length),expected:results.reduce((s,t)=>s+t.count,0),returned:results.reduce((s,t)=>s+t.images.length,0),lowerResolution,ratioMismatch})
}
assert.equal(imageRequests,47);assert.equal(analysisRequests,25)
const result={date:'2026-10-17',imageRequests,analysisRequests,returned:summary.reduce((s,p)=>s+p.returned,0),summary,failures,automaticRetries:0,notes:['策划首批9次，追加原第3/5版位各2次此前未发出的首次请求；没有重试审核失败项。','工作台有一次单图请求返回多候选，任务只保留设置数量，不能用额外候选填充其他任务。','历史20261015结果不计入本轮；测试尺寸不是实测参数。']}
fs.writeFileSync(path.join(root,'delivery/实测核对.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
const htmlPath=path.join(root,'delivery/测试结果总览.html')
const note='<p id="audit-summary"><strong>25次分析、47次生图首次请求，已保存41张；5次余额不足、1次审核拒绝，未自动重试。15张低于提交像素，其余26张匹配；画幅均接近设置。</strong> <a href="测试记录.md">查看完整测试记录</a> · <a href="实测核对.json">核对请求、像素与失败编号</a></p>'
let html=fs.readFileSync(htmlPath,'utf8').replace(/<p id="audit-summary">[\s\S]*?<\/p>/,'')
html=html.replace(/<h1>[^<]*真实测试结果<\/h1>/,'<h1>2026-10-16—17 真实测试结果</h1>'+note)
fs.writeFileSync(htmlPath,html)
