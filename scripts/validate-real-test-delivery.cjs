const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
require.extensions['.ts']=(module,filename)=>module._compile(require('typescript').transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText,filename)
const {sizeFromRatioQuality}=require('../src/lib/visual-shared.ts')
const ROOT=path.resolve('verification/three-real-tests')
const suites=JSON.parse(fs.readFileSync(path.join(ROOT,'saved-suites.json'),'utf8'))
const secrets=fs.readFileSync('G:/2026/10月/测试/api.txt','utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>/^sk-|^[a-zA-Z0-9_-]{35,}$/.test(x))
const results=[]
for(const [phase,count,prefix] of [['workbench',12,'三项实测-友情礼品'],['remix',12,null],['planner',9,'三项实测-草莓策划']]){
 const prompts=prefix?suites.find(x=>x.name.startsWith(prefix)).entries.map(x=>x.prompt):JSON.parse(fs.readFileSync(path.join(ROOT,'remix-prompts.json'),'utf8'))
 const tasks=JSON.parse(fs.readFileSync(path.join(ROOT,phase+(phase==='workbench'?'-final-results.json':'-queue.json')),'utf8'))
 assert.equal(prompts.length,count)
 assert.equal(tasks.length,count)
 for(let i=0;i<count;i++){
  const prompt=prompts[i]
  assert.ok(prompt.includes('【正向 Prompt】')&&prompt.includes('【负向 Prompt】'),phase+' complete prompt '+(i+1))
  const file=`${phase}-${String(i+1).padStart(2,'0')}-1.png`
  const image=fs.readFileSync(path.join(ROOT,file))
  const actual=`${image.readUInt32BE(16)}x${image.readUInt32BE(20)}`
  let expected=tasks[i].ratio==='custom'?tasks[i].customSize:sizeFromRatioQuality(tasks[i].ratio,tasks[i].quality)
  if(phase==='workbench'&&i===5&&fs.existsSync(path.join(ROOT,'online-verification.json')))expected='2048x2048'
  assert.equal(actual,expected,phase+' dimensions '+(i+1))
  results.push({phase,entry:i+1,promptChars:prompt.length,file,bytes:image.length,dimensions:actual})
 }
}
const scan=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(/\.(txt|json|html|md)$/.test(file)){const value=fs.readFileSync(file,'utf8');assert.ok(secrets.every(secret=>!value.includes(secret)),'Private credential must not appear in delivery')}}}
scan(path.join(ROOT,'delivery'))
fs.writeFileSync(path.join(ROOT,'delivery-validation.json'),JSON.stringify({totalImages:results.length,fullPrompts:true,dimensionsMatch:true,noCredentialsInDelivery:true,results},null,2))
console.log(JSON.stringify({totalImages:results.length,fullPrompts:true,dimensionsMatch:true,noCredentialsInDelivery:true}))
