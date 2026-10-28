// Isolated browser. No real model traffic or private credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3031',OUT=path.resolve('verification/folder-20261016')
async function main(){
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 const reports=[]
 try{for(const [mode,status]of [['proxy',403],['proxy',500],['direct',403]]){
  const context=await browser.createBrowserContext(),page=await context.newPage();let calls=0
  await page.setRequestInterception(true)
  page.on('request',r=>{
   if(r.url().endsWith('/api/provider-transport'))return void r.respond({status:200,contentType:'application/json',body:JSON.stringify({mode,baseURL:'https://api.openlux.ai/v1'})})
   if(r.url().endsWith('/api/images')||r.url().startsWith('https://api.openlux.ai/')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
    if(r.method()==='OPTIONS')return void r.respond({status:200,headers})
    calls++;return void r.respond({status,headers,contentType:'application/json',body:JSON.stringify({error:{message:'user quota is not enough (request id: mock-quota-123)'}})})
   }
   if(r.url().includes('/api/'))return void r.abort()
   void r.continue()
  })
  await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
  await page.evaluate(()=>{
   const c={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-quota-only',model:'gpt-image-2'}
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:c,image:c}))
   localStorage.setItem('amazon-workbench.generateQueue',JSON.stringify([{id:'quota-only',label:'余额提示测试',ratio:'1:1',quality:'1k',count:1,prompt:'白底商品图片',status:'queued',resultUrls:[],productImageDataUrl:''}]))
  })
  await page.goto(BASE+'/generate',{waitUntil:'networkidle0'})
  try{await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0]?.status==='failed')}
  catch(e){console.log(JSON.stringify({mode,status,calls,queue:await page.evaluate(()=>localStorage.getItem('amazon-workbench.generateQueue')),text:await page.evaluate(()=>document.body.innerText.slice(-2000))}));throw e}
  const text=await page.evaluate(()=>document.body.innerText)
  assert.ok(text.includes('余额或额度不足')&&text.includes('mock-quota-123'))
  await page.reload({waitUntil:'networkidle0'});assert.equal(calls,1)
  reports.push({mode,status,failed:true,chineseMessage:true,requestIdPreserved:true,noRefreshRepeat:true,calls})
  console.log('PASS',mode,status);await context.close()
 }
 fs.writeFileSync(path.join(OUT,'quota-mock.json'),JSON.stringify(reports,null,2))
 console.log('PASS: 403/500余额不足中文提示、明确失败、保留编号、直连/代理一致、刷新不重发（全模拟）')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
