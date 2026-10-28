// 用独立浏览器上下文并行验证实际生图页面；每张仍只提交一次真实 API。
const fs=require('node:fs')
const path=require('node:path')
const puppeteer=require('puppeteer-core')
const OUT=path.resolve('verification/three-real-tests')
const phase=process.argv[2]
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const log=value=>console.log(new Date().toISOString(),JSON.stringify(value))
async function main(){
 const port=fs.readFileSync(path.join(OUT,'browser-profile/DevToolsActivePort'),'utf8').split('\n')[0]
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port,protocolTimeout:1200000})
 try{
  const original=(await browser.pages()).find(page=>page.url().endsWith('/generate'))
  if(!original)throw new Error('Original generation page required')
  await original.evaluate(()=>{
   const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='暂停后续')
   if(button&&!button.disabled)button.click()
  })
  for(let i=0;i<1200;i++){
   const running=await original.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')).some(x=>x.status==='running'))
   if(!running)break
   await sleep(2000)
  }
  const data=await original.evaluate(async()=>{
   const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('amazon-workbench-inputs',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
   try{
    const batches={}
    for(const id of new Set(tasks.map(x=>x.inputBatchId).filter(Boolean)))batches[id]=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get(id);r.onsuccess=()=>resolve(r.result)})
    const full=tasks.map(task=>{
     const batch=batches[task.inputBatchId],input=batch?.tasks.find(x=>x.id===task.id)
     return input?{...task,productImageDataUrl:input.product<0?'':batch.images[input.product],references:input.references.map(x=>({dataUrl:batch.images[x.image],name:x.name}))}:task
    })
    return {tasks:full,settings:JSON.parse(localStorage.getItem('amazon-workbench.api-settings.v1'))}
   }finally{db.close()}
  })
  if(phase==='workbench'&&!data.tasks.some(x=>x.id==='real-wb-11')){
   const suite=JSON.parse(fs.readFileSync(path.join(OUT,'saved-suites.json'),'utf8')).find(x=>x.name.startsWith('三项实测-友情礼品'))
   const entry=suite.entries[11]
   const reference='data:image/jpeg;base64,'+fs.readFileSync('G:/2026/10月/测试/视觉工作台测试/竞品图/s2.jpg').toString('base64')
   const task={...data.tasks[0],id:'real-wb-11',label:'请求 12',prompt:entry.prompt+'\n\n【图片身份】图1为我方产品，图2只参考构图，不复制竞品商品。\n【最终画布尺寸】1024x1024。',customSize:'1024x1024',status:'queued',resultUrls:[],references:[{dataUrl:reference,name:'s2.jpg'}]}
   data.tasks.push(task)
   await original.evaluate(async task=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-inputs',1);r.onsuccess=()=>resolve(r.result)})
    const batch=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get(task.inputBatchId);r.onsuccess=()=>resolve(r.result)})
    const product=batch.images.indexOf(task.productImageDataUrl)
    const image=batch.images.push(task.references[0].dataUrl)-1
    batch.tasks.push({id:task.id,product,references:[{image,name:'s2.jpg'}]})
    await new Promise(resolve=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(batch,task.inputBatchId);tx.oncomplete=resolve})
    db.close()
    const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
    tasks.push({...task,productImageDataUrl:'',references:undefined})
    const value=JSON.stringify(tasks);localStorage.setItem('amazon-workbench.generateQueue',value)
    window.dispatchEvent(new StorageEvent('storage',{key:'amazon-workbench.generateQueue',newValue:value}))
   },task)
  }
  const pending=data.tasks.filter(task=>task.status==='queued')
  const groups=Array.from({length:3},()=>[])
  const uncertain=[]
  pending.forEach((task,index)=>groups[index%3].push(task))
  log({phase,pending:pending.length,workers:groups.filter(x=>x.length).length})
  async function mirror(task){
   await original.evaluate(async task=>{
    if(task.status==='success'){
     const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('amazon-workbench-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('task-results');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
     await new Promise((resolve,reject)=>{const tx=db.transaction('task-results','readwrite');tx.objectStore('task-results').put(task.resultUrls,task.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})
     db.close()
    }
    const queue=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
    const next=queue.map(x=>x.id===task.id?{...x,status:task.status,error:task.error,requestInfo:task.requestInfo,resultUrls:[],resultsSaved:task.status==='success'}:x)
    const value=JSON.stringify(next)
    localStorage.setItem('amazon-workbench.generateQueue',value)
    window.dispatchEvent(new StorageEvent('storage',{key:'amazon-workbench.generateQueue',newValue:value}))
   },task)
  }
  await Promise.all(groups.filter(x=>x.length).map(async(group,worker)=>{
   const context=await browser.createBrowserContext()
   const page=await context.newPage()
   try{
    await page.goto('http://localhost:3000/settings',{waitUntil:'networkidle0'})
    await page.evaluate(({settings,tasks})=>{
     localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify(settings))
     localStorage.setItem('amazon-workbench.generateQueue',JSON.stringify(tasks.map(({inputBatchId,...task})=>({...task,status:'queued',resultUrls:[],resultsSaved:false}))))
    },{settings:data.settings,tasks:group})
    await page.goto('http://localhost:3000/generate',{waitUntil:'domcontentloaded'})
    const settled=new Set()
    for(let i=0;i<2160;i++){
     const tasks=await page.evaluate(async()=>{
      const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
      const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onupgradeneeded=()=>r.result.createObjectStore('task-results');r.onsuccess=()=>resolve(r.result)})
      for(const task of tasks)if(task.status==='success'&&!task.resultUrls.length)task.resultUrls=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(task.id);r.onsuccess=()=>resolve(r.result||[])})
      db.close();return tasks
     })
     for(const task of tasks)if(!settled.has(task.id)&&['success','failed','interrupted'].includes(task.status)){
      const index=data.tasks.findIndex(x=>x.id===task.id)
      if(task.status==='success')for(let k=0;k<task.resultUrls.length;k++){
       const src=task.resultUrls[k]
       if(!src.startsWith('data:'))throw new Error('Remote image result')
       fs.writeFileSync(path.join(OUT,`${phase}-${String(index+1).padStart(2,'0')}-${k+1}.png`),Buffer.from(src.split(',')[1],'base64'))
      }
      if(task.status==='interrupted')uncertain.push(task)
      else await mirror(task)
      settled.add(task.id)
      log({phase,worker,entry:index+1,status:task.status,seconds:Math.round((task.requestInfo?.elapsedMs||0)/1000),error:task.error})
     }
     if(settled.size===tasks.length||tasks.some(x=>x.status==='interrupted'))break
     await sleep(3000)
    }
    await page.screenshot({path:path.join(OUT,`${phase}-parallel-${worker+1}.png`),fullPage:true})
   }finally{await context.close()}
  }))
  for(const task of uncertain)await mirror(task)
  log({phase,parallelFinished:true})
 }finally{browser.disconnect()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
