const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3005'
const OUT='verification/model-sizing'
async function main(){
 const make=async(width,height,color)=>'data:image/png;base64,'+(await sharp({create:{width,height,channels:3,background:color}}).png().toBuffer()).toString('base64')
 const gpt=await make(1920,1088,'#e5a34f'),gemini=await make(2752,1536,'#8abdaa')
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage();await page.setViewport({width:1500,height:1000})
  const errors=[],calls=[];let partial=false,nativeCount=0
  page.on('pageerror',e=>errors.push(e.message))
  await page.setRequestInterception(true)
  page.on('request',async r=>{
   if(!r.url().startsWith('https://api.openlux.ai/')){void r.continue();return}
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}
   if(r.method()==='OPTIONS'){void r.respond({status:204,headers});return}
   const body=JSON.parse(r.postData())
   if(r.url().includes('/v1beta/')){
    nativeCount++;const c=body.generationConfig.imageConfig
    calls.push({kind:'gemini',url:r.url(),config:c,images:body.contents[0].parts.filter(x=>x.inline_data).length,promptChars:body.contents[0].parts[0].text.length})
    if(partial&&nativeCount===2){void r.respond({status:503,headers,contentType:'application/json',body:JSON.stringify({error:{message:'temporary busy'}})});return}
    void r.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:gpt.split(',')[1]}},{inlineData:{mimeType:'image/png',data:gemini.split(',')[1]}}]}}]})})
   }else{
    calls.push({kind:'gpt',size:body.size,n:body.n,promptChars:body.prompt.length})
    void r.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({data:Array.from({length:body.n},()=>({b64_json:gpt.split(',')[1]}))})})
   }
  })
  async function scenario(model,count,withProduct){
   console.log('Scenario',model,count,withProduct)
   await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
   await page.evaluate(({model,count,withProduct})=>{
    localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:{endpoint:'https://api.openlux.ai/v1',apiKey:'test',model:'test'},image:{endpoint:'https://api.openlux.ai/v1',apiKey:'test',model}}))
    localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:withProduct?'image':'text',entries:[{id:'sizing-test',enabled:true,ratio:'custom',customSize:'1920x1080',quality:'2k',count:String(count),prompt:'【正向 Prompt】'+ '完整商品、构图与光线。'.repeat(220)+'\n【负向 Prompt】禁止改造商品。'}]}))
   },{model,count,withProduct})
   await page.goto(BASE+'/simple',{waitUntil:'networkidle0'})
   if(withProduct){await(await page.$('input[type="file"]')).uploadFile(path.resolve('scripts/test-product.jpg'));await page.waitForSelector('img[alt="产品图"]')}
   await page.waitForFunction(expected=>document.querySelector('[data-size-hint]')?.innerText.includes(expected),{},model.includes('gemini')?'2752x1536':'1920x1088')
   await page.screenshot({path:`${OUT}/${model.includes('gemini')?'gemini':'gpt'}-preview.png`,fullPage:true})
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('开始生成')).click())
   await page.waitForFunction(()=>location.pathname==='/generate')
   try{await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]')[0]?.status==='success')}
   catch(error){console.log(JSON.stringify(await page.evaluate(()=>({url:location.href,text:document.body.innerText.slice(-1700),tasks:JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]').map(x=>({status:x.status,error:x.error}))}))));throw error}
   const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0])
   assert.equal(result.requestInfo.size,model.includes('gemini')?'2752x1536':'1920x1088')
   assert.equal(result.requestInfo.requestedSize,'1920x1080')
   assert.equal(await page.$$eval('[data-task-gallery] [aria-pressed]',els=>els.length),count)
   return result
  }
  await scenario('gpt-image-2',2,false)
  assert.deepEqual(calls[0].size,'1920x1088');assert.equal(calls[0].n,2)
  nativeCount=0;await scenario('gemini-3-pro-image-preview',2,true)
  assert.equal(nativeCount,2)
  for(const c of calls.filter(x=>x.kind==='gemini')){assert.deepEqual(c.config,{aspectRatio:'16:9',imageSize:'2K'});assert.equal(c.images,1);assert.ok(c.promptChars>2000)}
  partial=true;nativeCount=0;const result=await scenario('gemini-3-pro-image-preview',3,true)
  assert.equal(nativeCount,2);assert.ok(result.resultWarning.includes('已保留 1/3'))
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('部分返回')))
  await page.screenshot({path:OUT+'/partial-results.png',fullPage:true})
  await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.deepEqual(errors,[])
  fs.writeFileSync(OUT+'/page-test.json',JSON.stringify({baseURL:BASE,calls,partialSaved:true,noAutoRetry:true,noPaidCalls:true},null,2))
  console.log('PASS: 自定义尺寸适配预览；GPT实际提交1920x1088；Gemini原生图文请求/16:9/2K；实际返回像素；多张角标；部分成功保留；无自动重发；手机无溢出（模拟，无费用）')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
