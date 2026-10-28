const fs=require('node:fs')
const assert=require('node:assert/strict')
const puppeteer=require('puppeteer-core')
const FINAL='【正向 Prompt】'+ '完整新产品、构图与光线。'.repeat(150)+'\n【负向 Prompt】禁止旧商品印花。'
async function click(page,text){await page.evaluate(text=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text).click(),text)}
async function main(){
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage()
  await page.setViewport({width:1440,height:1000})
  const calls=[];let missing=true
  await page.setRequestInterception(true)
  page.on('request',async request=>{
   if(!request.url().startsWith('https://api.openlux.ai/')){void request.continue();return}
   if(request.method()==='OPTIONS'){
    void request.respond({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}})
    return
   }
   calls.push({url:request.url(),body:request.postData()})
   if(request.url().endsWith('/chat/completions')){
    const body=JSON.parse(request.postData())
    const content=body.messages[1].content
    const count=Number(/本批迁移 (\d+) 条/.exec(content[0].text)?.[1]||1)
    const invalid=missing&&content[0].text.includes('旧提示词2')
    const output=Array.from({length:count},(_,i)=>`【提示词 ${i+1}】\n\`\`\`text\n${invalid?'【正向 Prompt】未完整返回':FINAL}\n\`\`\``).join('\n')
    await new Promise(resolve=>setTimeout(resolve,800))
    void request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:output}}]})})
   }else void request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII='}]})})
  })
  await page.goto('http://localhost:3002/settings',{waitUntil:'networkidle0'})
  await page.evaluate(()=>{
   localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:{endpoint:'https://api.openlux.ai/v1',apiKey:'sk-test-routing',model:'test'},image:{endpoint:'https://api.openlux.ai/v1',apiKey:'sk-test-routing',model:'test'}}))
   localStorage.setItem('amazon-workbench.remixDraft',JSON.stringify({entries:[{id:'one',prompt:'旧提示词1',enabled:true,size:'16:9',customSize:'',quality:'2k',count:'1'},{id:'two',prompt:'旧提示词2',enabled:true,size:'1:1',customSize:'',quality:'2k',count:'1'}]}))
  })
  await page.goto('http://localhost:3002/remix',{waitUntil:'networkidle0'})
  await (await page.$('input[type="file"]')).uploadFile(require('node:path').resolve('scripts/test-product.jpg'))
  await page.waitForSelector('img[alt="新产品图"]')
  await click(page,'AI 改写全部')
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('生图全部')&&x.disabled))
  await page.waitForFunction(()=>document.body.innerText.includes('本次未替换原提示词'))
  assert.deepEqual(await page.$$eval('textarea[placeholder^="提示词内容"]',els=>els.map(x=>x.value)),['旧提示词1','旧提示词2'])
  missing=false
  await click(page,'AI 改写全部')
  await page.waitForFunction(()=>[...document.querySelectorAll('textarea[placeholder^="提示词内容"]')].every(x=>x.value.includes('完整新产品')))
  assert.equal(calls.length,3,'重试只请求未成功的第二条，第一条缓存复用')
  const outgoing=JSON.parse(calls[0].body)
  assert.equal(outgoing.messages[1].content[1].type,'text')
  assert.ok(outgoing.messages[1].content[1].text.includes('我方产品图'))
  assert.ok(outgoing.messages[1].content[0].text.includes('2048x1152'))
  await page.screenshot({path:'verification/cloud-routing-remix.png',fullPage:true})
  const generate=await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes('生图全部')).textContent.trim())
  await click(page,generate)
  await page.waitForFunction(()=>location.pathname==='/generate')
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]').filter(x=>x.status==='success').length===2,{timeout:30000})
  assert.equal(calls.filter(x=>x.url.endsWith('/images/edits')).length,2)
  const denied=await page.evaluate(async()=>{const r=await fetch('/api/provider-transport',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'https://unapproved.example/v1'})});return{status:r.status,...await r.json()}})
  assert.equal(denied.status,400)
  fs.writeFileSync('verification/cloud-routing.json',JSON.stringify({directAnalysisCalls:3,directImageCalls:2,atomicRewrite:true,successfulRewriteCached:true,generateDisabledWhileRewriting:true,blockedProvider:denied.status,noRealApiCalls:true},null,2))
  console.log('PASS: 云端模式真实页面直连路径、长提示词和尺寸保留、缺项不覆盖、改写期间不能误生图、未知服务商被拒绝（所有服务商响应均模拟，无费用）')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
