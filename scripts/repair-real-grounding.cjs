const fs=require('node:fs')
const path=require('node:path')
const puppeteer=require('puppeteer-core')
const OUT=path.resolve('verification/three-real-tests')
async function main(){
 const port=fs.readFileSync(path.join(OUT,'browser-profile/DevToolsActivePort'),'utf8').split('\n')[0]
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port,protocolTimeout:1200000})
 try{
  const page=(await browser.pages()).find(x=>x.url().endsWith(':3000/'))
  const input=await page.evaluate(()=>{
   const draft=JSON.parse(localStorage.getItem('amazon-workbench.draft.workbench'))
   return {settings:JSON.parse(localStorage.getItem('amazon-workbench.api-settings.v1')).analysis,systemPrompt:draft.systemPrompt,product:document.querySelector('img[alt="我方产品图"]').getAttribute('src'),cards:[...document.querySelectorAll('[data-slot="card"]')].filter(x=>x.querySelector('textarea[placeholder^="点击「生成提示词」"]')).map((el,i)=>({i,prompt:el.querySelector('textarea[placeholder^="点击「生成提示词」"]').value,extra:el.querySelector('textarea[placeholder^="自定义文案"]')?.value||'',reference:el.querySelector('img[alt^="参考图"]')?.getAttribute('src')}))}
  })
  console.log(JSON.stringify(input.cards.map(({i,prompt})=>({i,chars:prompt.length,start:prompt.slice(0,430)}))))
  if(!process.argv.includes('--repair'))return
  for(const index of process.argv.slice(2).filter(x=>/^\d+$/.test(x)).map(Number)){
   const card=input.cards[index]
   fs.writeFileSync(path.join(OUT,`workbench-wrong-product-before-${index+1}.txt`),card.prompt)
   console.log('Rechecking source identity for card '+(index+1))
   const response=await fetch('http://localhost:3001/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input.settings,systemPrompt:input.systemPrompt,userText:'【用户设定的最终画布尺寸】1024x1024。输出提示词必须使用此尺寸。\n请按15项完整顺序只输出最终正向与负向提示词，不压缩。\n'+card.extra,images:[{dataUrl:input.product,role:'product',index:1},{dataUrl:card.reference,role:'reference',index:2}]}),signal:AbortSignal.timeout(1200000)})
   const data=await response.json()
   if(!response.ok)throw new Error('Repair failed HTTP '+response.status)
   fs.writeFileSync(path.join(OUT,`workbench-grounding-retest-${index+1}.json`),JSON.stringify(data,null,2))
   // Store response first. Review identity before placing it into the live workflow.
   console.log(JSON.stringify({card:index+1,chars:data.prompt.length,start:data.prompt.slice(0,1100)}))
  }
 }finally{browser.disconnect()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
