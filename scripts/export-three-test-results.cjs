const fs=require('node:fs')
const path=require('node:path')
const ROOT=path.resolve('verification/three-real-tests')
const OUT=path.join(ROOT,'delivery')
fs.mkdirSync(OUT,{recursive:true})
const suites=fs.existsSync(path.join(ROOT,'saved-suites.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'saved-suites.json'),'utf8')):[]
const phases=[['workbench','01-视觉工作台','三项实测-友情礼品'],['remix','02-提示词迁移',null],['planner','03-一键策划','三项实测-草莓策划']]
const escape=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const sections=[]
for(const [phase,title,prefix]of phases){
 const suite=prefix?suites.find(x=>x.name.startsWith(prefix)):null
 const promptFile=path.join(ROOT,'remix-prompts.json')
 const prompts=suite?suite.entries.map(x=>({prompt:x.prompt,size:x.size,customSize:x.customSize})):phase==='remix'&&fs.existsSync(promptFile)?JSON.parse(fs.readFileSync(promptFile,'utf8')).map((prompt,i)=>({prompt,size:suites[0]?.entries[i]?.size||'',customSize:suites[0]?.entries[i]?.customSize||''})):[]
 if(!prompts.length)continue
 const dir=path.join(OUT,title);fs.mkdirSync(dir,{recursive:true})
 const rows=[]
 for(let i=0;i<prompts.length;i++){
  const n=String(i+1).padStart(2,'0')
  fs.writeFileSync(path.join(dir,n+'-提示词.txt'),prompts[i].prompt,'utf8')
  const file=`${phase}-${n}-1.png`
  const exists=fs.existsSync(path.join(ROOT,file))
  if(exists)fs.copyFileSync(path.join(ROOT,file),path.join(dir,n+'-生成图.png'))
  rows.push(`<article><h3>${n} · ${escape(prompts[i].size==='custom'?prompts[i].customSize:prompts[i].size)}</h3>${exists?`<a href="${title}/${n}-生成图.png"><img loading="lazy" src="${title}/${n}-生成图.png" alt="${escape(title)} ${n}"></a>`:'<p>图片尚未生成</p>'}<p><a href="${title}/${n}-提示词.txt">打开完整提示词</a></p><details><summary>查看提示词</summary><pre>${escape(prompts[i].prompt)}</pre></details></article>`)
 }
 fs.writeFileSync(path.join(dir,'提示词套装.json'),JSON.stringify({name:suite?.name||'腊肠犬主题迁移套装',entries:prompts},null,2))
 sections.push(`<section><h2>${title}</h2><div class="grid">${rows.join('')}</div></section>`)
 console.log(JSON.stringify({phase,prompts:prompts.length,images:fs.readdirSync(dir).filter(x=>x.endsWith('.png')).length}))
}
fs.writeFileSync(path.join(OUT,'测试结果总览.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>三个流程实测结果</title><style>body{margin:0;background:#f4f5f7;color:#1c232b;font:15px/1.7 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px}h1{margin:0}h2{margin:32px 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}article{min-width:0;background:white;padding:18px;border:1px solid #dde1e5;border-radius:12px}h3{margin:0 0 10px}img{width:100%;height:300px;object-fit:contain;background:#fafafa}pre{white-space:pre-wrap;max-height:400px;overflow:auto;font:13px/1.8 system-ui}a{color:#245aad}summary{cursor:pointer}</style><main><h1>三个流程实测结果</h1><p>2026-10-15 · 使用测试文件夹中的 API、模型与素材；提示词全文保留。点击图片查看原图，展开查看完整提示词。</p>${sections.join('')}</main></html>`)
