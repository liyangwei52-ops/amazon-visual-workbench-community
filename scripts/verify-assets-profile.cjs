const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp'),JSZip=require('jszip')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3007',OUT=path.resolve('verification/assets-profile')
async function main(){
 const generated=await sharp({create:{width:768,height:768,channels:3,background:'#aaccdd'}}).png().toBuffer()
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1500,height:1000})
  const errors=[];let calls=0
  page.on('pageerror',e=>errors.push(e.message))
  await page.setRequestInterception(true)
  page.on('request',r=>{
   if(!r.url().startsWith('https://api.openlux.ai/')){void r.continue();return}
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}
   if(r.method()==='OPTIONS'){void r.respond({status:204,headers});return}
   calls++;const body=JSON.parse(r.postData());void r.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({data:Array.from({length:body.n},()=>({b64_json:generated.toString('base64')}))})})
  })
  const click=async label=>page.evaluate(label=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);if(!button)throw new Error('Missing button '+label);button.click()},label)
  const fill=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)
  const assets=()=>page.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('amazon-workbench-assets',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('assets').objectStore('assets').getAll();q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=reject};r.onerror=reject}))
  await page.goto(BASE+'/assets',{waitUntil:'networkidle0'})
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('还没有图片资产')))
  await(await page.$('input[type="file"]')).uploadFile(path.resolve('scripts/test-product.jpg'))
  await page.waitForFunction(()=>document.querySelectorAll('[data-asset-id]').length===1)
  await page.select('select[aria-label="上传图片分类"]','reference')
  await(await page.$('input[type="file"]')).uploadFile(path.resolve('scripts/test-product.jpg'))
  await page.waitForFunction(()=>document.querySelectorAll('[data-asset-id]').length===2)
  assert.equal((await assets()).filter(x=>x.kind==='reference').length,1)
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('[data-asset-id]')
  await page.$eval('[data-asset-id] button',el=>el.click());await page.waitForSelector('dialog[open]')
  await fill('dialog input','产品素材A');await click('保存名称');await page.waitForFunction(()=>document.querySelector('dialog img')?.alt==='产品素材A');await page.click('[aria-label="关闭图片详情"]')
  await fill('[aria-label="搜索图片"]','不存在');assert.equal(await page.$$eval('[data-asset-id]',x=>x.length),0)
  await fill('[aria-label="搜索图片"]','产品素材A');assert.equal(await page.$$eval('[data-asset-id]',x=>x.length),1)
  await fill('[aria-label="搜索图片"]','')
  await page.screenshot({path:OUT+'/assets-desktop.png',fullPage:true})
  const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:OUT})
  await click('导出图片备份');await page.waitForFunction(()=>document.body.innerText.includes('资产备份已导出'))
  await new Promise(r=>setTimeout(r,500))
  const backup=fs.readdirSync(OUT).find(x=>x.endsWith('.zip'));assert.ok(backup)
  const zip=await JSZip.loadAsync(fs.readFileSync(path.join(OUT,backup)));assert.equal(JSON.parse(await zip.file('assets.json').async('string')).length,2);assert.equal(Object.keys(zip.files).filter(x=>/^images\/.+\.(jpg|png|webp)$/.test(x)).length,2)
  for(const [route,alt] of [['/simple','产品图'],['/','我方产品图'],['/planner','产品图'],['/remix','新产品图']]){
   await page.goto(BASE+route,{waitUntil:'networkidle0'});await click('从资产中心选择');await page.waitForSelector('dialog[open]')
   await page.evaluate(()=>[...document.querySelectorAll('dialog[open] button')].find(x=>x.textContent.includes('产品素材A')).click());await page.waitForSelector(`img[alt="${alt}"]`)
   if(route==='/'){
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='调用参考图资产').click());await page.waitForSelector('dialog[open]')
    await page.evaluate(()=>[...document.querySelectorAll('dialog[open] button')].find(x=>x.textContent.includes('产品素材A')).click());await page.waitForSelector('img[alt="参考图 1"]')
   }
  }
  await page.goto(BASE+'/profile',{waitUntil:'networkidle0'})
  await fill('[name="nickname"]','测试设计师');await fill('[name="role"]','品牌团队');await fill('[name="bio"]','完整个人简介')
  await(await page.$('[aria-label="上传个人头像"]')).uploadFile(path.resolve('scripts/test-product.jpg'));await page.waitForSelector('main img[alt="个人头像"]')
  await page.click('[role="switch"]');await click('保存个人设置')
  await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('[name="nickname"]')?.value==='测试设计师')
  assert.equal(await page.$eval('[role="switch"]',x=>x.getAttribute('aria-checked')),'false')
  assert.ok(await page.evaluate(()=>document.querySelector('aside').innerText.includes('测试设计师')))
  await page.screenshot({path:OUT+'/profile-desktop.png',fullPage:true})
  const generate=async count=>{
   await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
   await page.evaluate(count=>{
    const connection={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-only-not-real',model:'gpt-image-2'}
    localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({image:connection,analysis:connection}))
    localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:'text',entries:[{id:'asset-generate-'+count,enabled:true,ratio:'1:1',customSize:'',quality:'1k',count:String(count),prompt:'完整提示词与商品事实。'.repeat(300)}]}))
   },count)
   await page.goto(BASE+'/simple',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.innerText.includes('开始生成'))
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('开始生成')).click())
   await page.waitForFunction(()=>location.pathname==='/generate')
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')[0]?.status==='success')
  }
  await generate(2);assert.equal((await assets()).length,2,'关闭自动保存时不入库')
  await click('保存到资产中心');await page.waitForFunction(()=>document.body.innerText.includes('已保存到资产中心'))
  assert.equal((await assets()).length,3)
  await click('保存到资产中心');await new Promise(r=>setTimeout(r,300));assert.equal((await assets()).length,3,'手动保存同张不重复')
  await page.goto(BASE+'/profile',{waitUntil:'networkidle0'});await page.click('[role="switch"]');await click('保存个人设置')
  await generate(3);const saved=await assets();assert.equal(saved.length,6);assert.equal(saved.filter(x=>x.kind==='generated').length,4);assert.ok(saved.filter(x=>x.kind==='generated').every(x=>x.prompt.length>3000));assert.equal(calls,2)
  await page.goto(BASE+'/assets',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelectorAll('[data-asset-id]').length===6)
  await click('导入已有生成结果');await page.waitForFunction(()=>document.body.innerText.includes('当前任务没有可新增的生成图片'));assert.equal((await assets()).length,6)
  await page.$eval('[data-asset-id] button',el=>el.click());await page.waitForSelector('dialog[open]')
  page.once('dialog',d=>void d.dismiss());await click('删除图片');assert.equal((await assets()).length,6,'取消删除保留原图')
  page.once('dialog',d=>void d.accept());await click('删除图片');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal((await assets()).length,5)
  await click('导入已有生成结果');await page.waitForFunction(()=>document.querySelectorAll('[data-asset-id]').length===6);assert.equal((await assets()).length,6,'已存在结果可导入，无需重新生图');assert.equal(calls,2)
  await page.setViewport({width:390,height:844})
  for(const route of ['/assets','/profile']){await page.goto(BASE+route,{waitUntil:'networkidle0'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' mobile overflow');await page.screenshot({path:OUT+route+'-mobile.png',fullPage:true})}
  assert.deepEqual(errors,[])
  const result={baseURL:BASE,uploadAndReload:true,renameAndSearch:true,backupZip:true,pickerPages:4,referencePicker:true,profileAvatarAndReload:true,autoArchiveToggle:true,manualDedup:true,autoArchivedCount:3,deleteCancelAndConfirm:true,mobileNoOverflow:true,paidCalls:0,simulatedProviderCalls:calls}
  fs.writeFileSync(OUT+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
