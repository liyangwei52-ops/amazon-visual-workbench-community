const fs=require('node:fs')
const path=require('node:path')
const puppeteer=require('puppeteer-core')
const OUT=path.resolve('verification/three-real-tests')
async function main(){
 const phase=process.argv[2]
 const profile=phase==='workbench'?'browser-profile':'browser-profile-'+phase
 const port=fs.readFileSync(path.join(OUT,profile,'DevToolsActivePort'),'utf8').split('\n')[0]
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port,protocolTimeout:120000})
 try{
  const page=(await browser.pages()).find(x=>x.url().endsWith('/generate'))
  const results=JSON.parse(fs.readFileSync(path.join(OUT,phase+'-backend-results.json'),'utf8'))
  const files=fs.readdirSync(OUT).filter(x=>new RegExp('^'+phase+'-\\d+-1\\.png$').test(x)).map(file=>({entry:Number(/-(\d+)-/.exec(file)[1]),src:'data:image/png;base64,'+fs.readFileSync(path.join(OUT,file)).toString('base64')}))
  const tasks=await page.evaluate(async({results,files})=>{
   const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
   const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('task-results');r.onsuccess=()=>resolve(r.result)})
   for(let index=0;index<tasks.length;index++){
    const file=files.find(x=>x.entry===index+1)
    if(!file)continue
    await new Promise((resolve,reject)=>{const tx=db.transaction('task-results','readwrite');tx.objectStore('task-results').put([file.src],tasks[index].id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})
    const result=[...results].reverse().find(x=>x.entry===index+1&&x.status==='success')
    tasks[index]={...tasks[index],status:'success',resultUrls:[],resultsSaved:true,error:undefined,requestInfo:result?{...tasks[index].requestInfo,elapsedMs:result.seconds*1000}:tasks[index].requestInfo}
   }
   db.close()
   const value=JSON.stringify(tasks);localStorage.setItem('amazon-workbench.generateQueue',value)
   window.dispatchEvent(new StorageEvent('storage',{key:'amazon-workbench.generateQueue',newValue:value}))
   return tasks.map(({productImageDataUrl,references,resultUrls,...task})=>({...task,imageCount:task.resultsSaved?1:resultUrls.length}))
  },{results,files})
  fs.writeFileSync(path.join(OUT,phase+'-final-results.json'),JSON.stringify(tasks,null,2))
  await page.screenshot({path:path.join(OUT,phase+'-final-page.png'),fullPage:true})
  console.log(JSON.stringify({phase,success:tasks.filter(x=>x.status==='success').length,total:tasks.length}))
 }finally{browser.disconnect()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
