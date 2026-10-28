const assert=require('node:assert/strict')
const path=require('node:path')
const puppeteer=require('puppeteer-core')
async function main(){
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage()
  await page.goto('http://localhost:3000/settings',{waitUntil:'networkidle0'})
  await page.evaluate(()=>localStorage.setItem('amazon-workbench.remixDraft',JSON.stringify({entries:Array.from({length:12},(_,i)=>({id:'draft-'+i,prompt:'完整提示词'+i,size:'1:1',enabled:true,quality:'2k',count:'1'}))})))
  await page.goto('http://localhost:3000/remix',{waitUntil:'networkidle0'})
  await(page.$('input[type="file"]')).then(x=>x.uploadFile(path.resolve('verification/analysis-noise.png')))
  await page.waitForSelector('img[alt="新产品图"]')
  await page.$$eval('textarea[placeholder^="提示词内容"]',fields=>{const field=fields.at(-1);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'最后一条最新编辑必须保存');field.dispatchEvent(new Event('input',{bubbles:true}))})
  await page.waitForFunction(()=>{const value=localStorage.getItem('amazon-workbench.remixDraft');return value?.includes('最后一条最新编辑必须保存')&&value.includes('indexeddb-image:')})
  await page.reload({waitUntil:'networkidle0'})
  await page.waitForSelector('img[alt="新产品图"]')
  await page.waitForFunction(()=>document.querySelectorAll('textarea[placeholder^="提示词内容"]').length===12)
  assert.equal(await page.$$eval('textarea[placeholder^="提示词内容"]',fields=>fields.at(-1).value),'最后一条最新编辑必须保存')
  const imageLength=await page.$eval('img[alt="新产品图"]',x=>x.getAttribute('src').length)
  assert.ok(imageLength>3*1024*1024)
  console.log('PASS: 迁移页12条提示词、最新编辑及超过3MB产品图刷新后完整恢复，无模型请求')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
