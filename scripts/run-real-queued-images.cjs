const fs=require('node:fs')
const path=require('node:path')
const puppeteer=require('puppeteer-core')
const {Agent}=require('undici')
require.extensions['.ts']=(module,filename)=>module._compile(require('typescript').transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText,filename)
const {sizeFromRatioQuality}=require('../src/lib/visual-shared.ts')
const OUT=path.resolve('verification/three-real-tests')
const phase=process.argv[2]
const agent=new Agent({headersTimeout:960000,bodyTimeout:960000,connectTimeout:30000})
const log=x=>console.log(new Date().toISOString(),JSON.stringify(x))
async function main(){
 const profile=process.env.TEST_BROWSER_PROFILE||(phase==='workbench'?'browser-profile':'browser-profile-'+phase)
 const port=fs.readFileSync(path.join(OUT,profile,'DevToolsActivePort'),'utf8').split('\n')[0]
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port,protocolTimeout:1200000})
 try{
  const page=(await browser.pages()).find(x=>x.url().endsWith('/generate'))
  await page.evaluate(()=>{
    const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='暂停后续')
    if(button&&!button.disabled)button.click()
  })
  const input=await page.evaluate(async()=>{
   const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
   const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-inputs',1);r.onsuccess=()=>resolve(r.result)})
   const batches={}
   for(const id of new Set(tasks.map(x=>x.inputBatchId).filter(Boolean)))batches[id]=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get(id);r.onsuccess=()=>resolve(r.result)})
   db.close()
   return {settings:JSON.parse(localStorage.getItem('amazon-workbench.api-settings.v1')).image,tasks:tasks.map(task=>{
    const batch=batches[task.inputBatchId], record=batch?.tasks.find(x=>x.id===task.id)
    return record?{...task,productImageDataUrl:record.product<0?'':batch.images[record.product],references:record.references.map(x=>({dataUrl:batch.images[x.image],name:x.name}))}:task
   })}
  })
  const selected=input.tasks.filter(x=>x.status==='queued'||process.argv.includes('--retest-uncertain')&&x.status==='interrupted')
  const resultFile=path.join(OUT,phase+'-backend-results.json')
  const results=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):[]
  const save=()=>fs.writeFileSync(resultFile,JSON.stringify(results,null,2))
  const mirror=async(task,srcs=[])=>{
   try{await page.evaluate(async({task,srcs})=>{
    if(srcs.length){
     const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('task-results');r.onsuccess=()=>resolve(r.result)})
     await new Promise(resolve=>{const tx=db.transaction('task-results','readwrite');tx.objectStore('task-results').put(srcs,task.id);tx.oncomplete=resolve});db.close()
    }
    const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
    const value=JSON.stringify(tasks.map(x=>x.id===task.id?{...x,status:task.status,error:task.error,requestInfo:task.requestInfo,resultsSaved:srcs.length>0,resultUrls:[]}:x))
    localStorage.setItem('amazon-workbench.generateQueue',value)
    window.dispatchEvent(new StorageEvent('storage',{key:'amazon-workbench.generateQueue',newValue:value}))
   },{task,srcs})}catch(error){log({mirrorWarning:error.message})}
  }
  let cursor=0
  log({phase,selected:selected.length,concurrency:3,previousSuccesses:input.tasks.filter(x=>x.status==='success').length})
  await Promise.all(Array.from({length:3},async()=>{
   while(cursor<selected.length){
    const task=selected[cursor++]
    const index=input.tasks.findIndex(x=>x.id===task.id)
    const start=Date.now()
    const size=task.ratio==='custom'?task.customSize:sizeFromRatioQuality(task.ratio,task.quality)
    task.requestInfo={provider:new URL(input.settings.endpoint).host,model:input.settings.model,size,startedAt:start}
    task.status='running';await mirror(task)
    log({phase,entry:index+1,started:true,size})
    try{
     const body=new FormData()
     for(const [key,value] of Object.entries({...input.settings,prompt:task.prompt,size,quality:'auto',outputFormat:'png',background:'auto',imageCount:String(task.count)}))body.append(key,value)
     for(const [i,src]of [task.productImageDataUrl,...(task.references||[]).map(x=>x.dataUrl)].filter(Boolean).entries()){
      const mime=/^data:([^;]+)/.exec(src)[1]
      body.append('images',new File([Buffer.from(src.split(',')[1],'base64')],i?'reference.jpg':'product.jpg',{type:mime}))
     }
     const response=await fetch('http://localhost:3000/api/images',{method:'POST',body,dispatcher:agent,signal:AbortSignal.timeout(960000)})
     const data=await response.json()
     if(!response.ok){task.status=data.outcome==='failed'?'failed':'interrupted';throw new Error(data.error||'HTTP '+response.status)}
     if(!data.images?.length)throw new Error('No images')
     const dimensions=[]
     for(let k=0;k<data.images.length;k++){
      const src=data.images[k].src
      if(!src.startsWith('data:'))throw new Error('Remote image requires download')
      const bytes=Buffer.from(src.split(',')[1],'base64')
      const filename=`${phase}-${String(index+1).padStart(2,'0')}-${k+1}.png`
      fs.writeFileSync(path.join(OUT,filename),bytes)
      dimensions.push({file:filename,bytes:bytes.length,width:bytes.subarray(1,4).toString()==='PNG'?bytes.readUInt32BE(16):null,height:bytes.subarray(1,4).toString()==='PNG'?bytes.readUInt32BE(20):null})
     }
     task.status='success';task.error=undefined;task.requestInfo.elapsedMs=Date.now()-start
     results.push({id:task.id,entry:index+1,status:'success',seconds:Math.round((Date.now()-start)/1000),size,images:dimensions,usage:data.usage})
     save();await mirror(task,data.images.map(x=>x.src));log(results.at(-1))
    }catch(error){
     if(task.status==='running')task.status='interrupted'
     task.error=error.message;task.requestInfo.elapsedMs=Date.now()-start
     results.push({id:task.id,entry:index+1,status:task.status,seconds:Math.round((Date.now()-start)/1000),error:error.message})
     save();await mirror(task);log(results.at(-1))
    }
   }
  }))
  log({phase,done:true})
 }finally{browser.disconnect();await agent.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
