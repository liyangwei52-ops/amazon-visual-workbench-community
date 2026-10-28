const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const puppeteer=require('puppeteer-core')
const ROOT=path.resolve('verification/three-real-tests')
async function main(){
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(ROOT,'browser-profile-online'),args:['--no-sandbox']})
 try{
  const page=await browser.newPage()
  await page.goto('https://amazon-visual-workbench-lac.vercel.app/settings',{waitUntil:'networkidle0'})
  const task=await page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')).find(x=>x.id==='online-wb-06'))
  assert.equal(task.status,'success');assert.ok(task.prompt.includes('2048'))
  fs.writeFileSync(path.join(ROOT,'online-submitted-prompt.txt'),task.prompt)
  const savedPrompt='【正向 Prompt】'+task.prompt.replace('\n\n避免：','\n\n【负向 Prompt】').replaceAll('1024×1024','2048×2048').replaceAll('1024x1024','2048x2048')
  const before=path.join(ROOT,'workbench-06-before-correction.png')
  if(!fs.existsSync(before))fs.copyFileSync(path.join(ROOT,'workbench-06-1.png'),before)
  fs.copyFileSync(path.join(ROOT,'online-workbench-06-1.png'),path.join(ROOT,'workbench-06-1.png'))
  const suiteFile=path.join(ROOT,'saved-suites.json')
  const suites=JSON.parse(fs.readFileSync(suiteFile,'utf8'))
  suites.find(x=>x.name.startsWith('三项实测-友情礼品')).entries[5].prompt=savedPrompt
  fs.writeFileSync(suiteFile,JSON.stringify(suites,null,2))
  const resultFile=path.join(ROOT,'workbench-final-results.json')
  const results=JSON.parse(fs.readFileSync(resultFile,'utf8'))
  results[5]={...results[5],prompt:task.prompt,customSize:'2048x2048',requestInfo:task.requestInfo}
  fs.writeFileSync(resultFile,JSON.stringify(results,null,2))
  console.log(JSON.stringify({updatedEntry:6,status:task.status,promptChars:task.prompt.length,size:task.requestInfo.size,noModelCalls:true}))
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
