const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const puppeteer=require('puppeteer-core')
const OUT=path.resolve('verification/three-real-tests')
const ROOT='G:/2026/10月/测试'
const BASE=process.env.TEST_BASE_URL||'https://amazon-visual-workbench-lac.vercel.app'
const lines=fs.readFileSync(path.join(ROOT,'api.txt'),'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
const after=x=>lines[lines.indexOf(x)+1]
const settings={analysis:{endpoint:after('Api网址'),apiKey:after('Key'),model:'gpt-5.6-sol'},image:{endpoint:after('生图Api网址'),apiKey:after('生图Key'),model:lines.find(x=>x.startsWith('图像模型')).replace(/^图像模型[:：\s]*/,'')}}
async function main(){
 const suites=JSON.parse(fs.readFileSync(path.join(OUT,'saved-suites.json'),'utf8'))
 const suite=suites.find(x=>x.name.startsWith('三项实测-友情礼品'))
 let prompt=suite.entries[5].prompt
 fs.writeFileSync(path.join(OUT,'workbench-06-before-correction.txt'),prompt)
 prompt=prompt.replace('上半部分表现书写使用场景','上半部分表现闭合笔记本和独立便签书写场景')
  .replace(/在打开使用状态下，内页[\s\S]*?不凭空增加第二本笔记本。/,'产品图仅展示封面，笔记本全程闭合，完整保留封面印花；不展示或推测任何内页、页数、横线和背面结构。')
  .replace('表现人物正在打开的笔记本上使用我方圆珠笔书写','表现我方闭合笔记本封面，人物使用我方圆珠笔在一张独立的无印花普通便签上书写')
  .replaceAll('左手自然扶住笔记本页面','左手自然扶住闭合笔记本边缘')
  .replace(/7\. 产品佩戴\/使用方式：上方场景中[\s\S]*?(?=左下场景中)/,'7. 产品佩戴/使用方式：上方场景中我方笔记本闭合平放于浅木桌左侧，封面朝上完整可见，金色线圈沿本子左侧。右侧放置一张普通空白便签，便签明确是非销售场景道具；人物右手持我方圆珠笔在便签上书写，笔杆印花朝向镜头；左手轻扶闭合本子边缘。笔尖只接触便签，不接触封面，不打开笔记本，不生成内页。便签上仅有少量自然手写笔迹，无商品印花、营销文案。')
  .replaceAll('打开的笔记本','闭合的笔记本').replaceAll('右侧横线纸','独立便签纸').replaceAll('左侧页面','闭合封面边缘').replaceAll('上方纸页','上方独立便签纸')
 prompt+='\n\n【本张必需纠正】仅提供了闭合笔记本产品图，必须保持笔记本闭合，完整封面朝上。禁止打开、翻折或展示未知内页；禁止把封面印花放到内页。人物书写仅发生在独立普通便签上，便签为场景道具、不计入四件销售商品。'
 prompt=prompt.replaceAll('1024×1024','2048×2048').replaceAll('1024x1024','2048x2048')
 assert.ok(!prompt.includes('在打开使用状态下'))
 fs.writeFileSync(path.join(OUT,'workbench-06-corrected-prompt.txt'),prompt)
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(OUT,'browser-profile-online'),protocolTimeout:1200000,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000})
  const calls=[]
  page.on('request',request=>{if(request.url().startsWith('https://api.openlux.ai/')&&request.method()==='POST')calls.push({url:request.url(),method:request.method()})})
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  const transport=await page.evaluate(async()=>{const r=await fetch('/api/provider-transport',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'https://api.openlux.ai/v1'})});return r.json()})
  assert.equal(transport.mode,'direct','Online deployment must use approved provider direct transport')
  const refs=fs.readdirSync(path.join(ROOT,'视觉工作台测试/竞品图')).filter(x=>/\.jpg$/i.test(x)).sort((a,b)=>a.localeCompare(b,'zh',{numeric:true}))
  const image=file=>'data:image/jpeg;base64,'+fs.readFileSync(file).toString('base64')
  await page.evaluate(({settings,prompt,product,reference})=>{
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify(settings))
   localStorage.removeItem('amazon-workbench.generateQueue')
   localStorage.setItem('amazon-workbench.draft.workbench',JSON.stringify({productImage:{id:'online-product',name:'产品图.jpg',dataUrl:product},cards:[{id:'online-wb-06',references:[{id:'online-reference',name:'reference.jpg',dataUrl:reference}],prompt,size:'2048x2048',quality:'auto',count:'1',outputFormat:'png',background:'auto'}]}))
  },{settings,prompt,product:image(path.join(ROOT,'视觉工作台测试/产品图/产品图.jpg')),reference:image(path.join(ROOT,'视觉工作台测试/竞品图',refs[5]))})
  await page.goto(BASE+'/',{waitUntil:'networkidle0'})
  await page.waitForSelector('img[alt="我方产品图"]');await page.waitForSelector('img[alt^="参考图"]')
  const started=Date.now()
  await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes('生图全部')||x.textContent.trim().includes('全部生图'));if(!button)throw new Error('Generation button missing');button.click()})
  await page.waitForFunction(()=>location.pathname==='/generate')
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]').every(x=>['success','failed','interrupted'].includes(x.status)),{timeout:960000})
  const tasks=await page.evaluate(async()=>{
   const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
   const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onsuccess=()=>resolve(r.result)})
   for(const task of tasks)if(task.status==='success')task.resultUrls=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(task.id);r.onsuccess=()=>resolve(r.result)})
   db.close();return tasks
  })
  assert.equal(tasks.length,1);assert.equal(tasks[0].status,'success',tasks[0].error)
  fs.writeFileSync(path.join(OUT,'online-submitted-prompt.txt'),tasks[0].prompt)
  const buffer=Buffer.from(tasks[0].resultUrls[0].split(',')[1],'base64')
  fs.writeFileSync(path.join(OUT,'online-workbench-06-1.png'),buffer)
  const result={baseURL:BASE,transport,calls,status:'success',seconds:Math.round((Date.now()-started)/1000),bytes:buffer.length,width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20),promptChars:prompt.length}
  assert.equal(calls.length,1,'No automatic duplicate paid requests')
  fs.writeFileSync(path.join(OUT,'online-verification.json'),JSON.stringify(result,null,2))
  await page.screenshot({path:path.join(OUT,'online-generation-success.png'),fullPage:true})
  console.log(JSON.stringify(result))
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message.replaceAll(settings.image.apiKey,'[REDACTED]').replaceAll(settings.analysis.apiKey,'[REDACTED]'));process.exitCode=1})
