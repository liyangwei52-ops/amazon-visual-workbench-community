const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),sharp=require('sharp')
const BASE=process.env.TEST_BASE_URL||'http://localhost:3017',OUT=path.resolve('verification/individual-images')
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(test,label){const deadline=Date.now()+15000;while(!test()){if(Date.now()>deadline)throw new Error('Timed out: '+label);await delay(25)}}
async function main(){
 fs.mkdirSync(OUT,{recursive:true})
 const fixtures=await Promise.all(Array.from({length:5},(_,index)=>sharp({create:{width:96+index*16,height:96,channels:3,background:['#eeaaaa','#aaeeaa','#aaaaee','#eeddaa','#ddaadd'][index]}}).png().toBuffer()))
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding']})
 const reports=[]
 try{
  async function scenario(name,counts,concurrency='all'){
   const context=await browser.createBrowserContext(),requests=[],errors=[];let active=0,maximum=0
   async function wire(page){
    await page.evaluateOnNewDocument(() => {
      const original = window.fetch
      window.fetch = (url, init) => {
        if (String(url).startsWith('https://api.openlux.ai/') && init?.method === 'POST') {
          const body = init.body, fields = body instanceof FormData ? { prompt: body.get('prompt'), n: body.get('n') } : JSON.parse(body)
          const headers = new Headers(init.headers)
          headers.set('x-mock-task', /CONCURRENT_TEST_(\d+)/.exec(String(fields.prompt))[1]); headers.set('x-mock-count', String(fields.n))
          return original.call(window, url, { ...init, headers })
        }
        return original.call(window, url, init)
      }
    })
    await page.setViewport({width:1440,height:1000});page.on('pageerror',error=>errors.push(error.message));await page.setRequestInterception(true)
    page.on('request',request=>{
     const pathname=new URL(request.url()).pathname
     if(pathname==='/mock-result.png')return void request.respond({status:200,contentType:'image/png',body:fixtures[0]})
     if(pathname==='/api/provider-transport')return void request.respond({status:200,contentType:'application/json',body:JSON.stringify({mode:'direct',baseURL:'https://api.openlux.ai/v1'})})
     if(pathname==='/api/images'||pathname==='/api/analyze')return void request.respond({status:400,contentType:'application/json',body:JSON.stringify({error:'Unexpected unmocked proxy call',outcome:'failed'})})
     if(!request.url().startsWith('https://api.openlux.ai/')){void request.continue().catch(()=>{});return}
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,x-mock-task,x-mock-count'}
     if(request.method()==='OPTIONS'){void request.respond({status:204,headers}).catch(()=>{});return}
     const n=Number(request.headers()['x-mock-count']),index=Number(request.headers()['x-mock-task'])
     assert.ok(Number.isInteger(index)&&index>=0&&index<5,'任务标识必须完整');assert.equal(n,1,'每张图片必须独立请求n=1')
     active++;maximum=Math.max(maximum,active);requests.push({request,index,n,headers,settled:false,startedAt:Date.now()})
    })
   }
   const page=await context.newPage();await wire(page);await page.goto(BASE+'/settings',{waitUntil:'networkidle0'})
   await page.evaluate(({counts,concurrency,product})=>{
    const connection={endpoint:'https://api.openlux.ai/v1',apiKey:'mock-concurrency-only',model:'gpt-image-2'}
    localStorage.setItem('amazon-workbench.api-settings.v1',JSON.stringify({analysis:connection,image:connection}));localStorage.setItem('amazon-workbench.profile.v1',JSON.stringify({name:'并发测试',autoArchive:false}));localStorage.setItem('amazon-workbench.generateConcurrency.v1',concurrency)
    localStorage.setItem('amazon-workbench.draft.simple',JSON.stringify({generationMode:'image',productImages:[{id:'product',name:'product.png',dataUrl:product}],entries:counts.map((count,index)=>({id:'concurrent-task-'+index,enabled:true,ratio:'1:1',customSize:'',quality:'1k',count:String(count),prompt:`CONCURRENT_TEST_${index} 完整产品图与光线要求。`}))}))
   },{counts,concurrency,product:'data:image/png;base64,'+fixtures[0].toString('base64')})
   await page.goto(BASE+'/simple',{waitUntil:'networkidle0'});await page.waitForSelector('img[alt="产品图"]')
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.closest('[data-batch-generation]')).click());await page.waitForFunction(()=>location.pathname==='/generate')
   const click=label=>page.evaluate(label=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);if(!button||button.disabled)throw new Error('Missing or disabled '+label);button.click()},label)
   const states=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]'))
   const waitStates=async(statuses)=>{try{await page.waitForFunction(statuses=>{const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue')||'[]');return Object.entries(statuses).every(([state,count])=>tasks.filter(task=>task.status===state).length===count)}, {}, statuses)}catch(error){console.log(JSON.stringify({name,statuses,tasks:(await states()).map(({status,error,count})=>({status,error,count})),errors}));throw error}}
   const reply=async(item,status=200)=>{
    if(item.settled)throw new Error('Duplicate response')
    item.settled=true;active--
    const body=status===200?{data:Array.from({length:item.n},()=>({b64_json:fixtures[item.index].toString('base64')}))}:{error:{message:'mock uncertain upstream result'}}
    await item.request.respond({status,headers:item.headers,contentType:'application/json',body:JSON.stringify(body)})
   }
   return{context,page,wire,requests,errors,click,states,waitStates,reply,get maximum(){return maximum},async close(){assert.deepEqual(errors,[]);await context.close()}}
  }
  console.log('Scenario all: 5 tasks / 11 images')
  {
   const s=await scenario('all',[4,3,2,1,1]);await until(()=>s.requests.length===11,'eleven single-image requests before any response').catch(async e=>{console.log('DIAGNOSTIC',JSON.stringify({requests:s.requests.map(x=>({index:x.index,n:x.n})),states:await s.states(),errors:s.errors}));throw e});await s.waitStates({running:5});assert.equal(s.maximum,11);assert.deepEqual([0,1,2,3,4].map(index=>s.requests.filter(x=>x.index===index).length),[4,3,2,1,1])
   assert.ok(await s.page.evaluate(()=>document.body.innerText.includes('已返回 0/11 张')))
   const observer=await s.context.newPage();await s.wire(observer);await observer.goto(BASE+'/generate',{waitUntil:'domcontentloaded'});await observer.waitForFunction(()=>document.body.innerText.includes('另一标签页正在执行'))
   for(const index of [3,1,4,2,0])for(const item of s.requests.filter(request=>request.index===index))await s.reply(item)
   await s.page.bringToFront();await s.waitStates({success:5});await observer.waitForFunction(()=>document.body.innerText.includes('成功 5'),{polling:100})
   assert.equal(s.requests.length,11,'第二标签不能重复提交')
   const result=await s.page.evaluate(async()=>{const tasks=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'));const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onsuccess=()=>resolve(r.result)});const results=await Promise.all(tasks.map(task=>new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(task.id);r.onsuccess=()=>resolve({id:task.id,count:r.result.length,size:task.requestInfo.size})})));db.close();return results})
   assert.deepEqual(result.map(x=>x.count),[4,3,2,1,1]);assert.equal(result.reduce((sum,x)=>sum+x.count,0),11)
   for(const [index,item]of result.entries())assert.equal(item.size,`${96+index*16}x96`,'乱序返回必须保存到对应任务')
   await s.page.screenshot({path:OUT+'/all-11-images.png',fullPage:true});await s.page.reload({waitUntil:'networkidle0'});assert.equal(s.requests.length,11,'刷新完成结果不重复调用')
   reports.push({scenario:'all',concurrentRequests:11,logicalTasks:5,counts:result.map(x=>x.count),imagesSaved:11,crossTabDuplicateRequests:0,outOfOrderResultsCorrect:true});await s.close()
  }
  console.log('Scenario incremental save / partial / missing-only retry')
  {
   const s=await scenario('partial',[2]);await until(()=>s.requests.length===2,'two individual first attempts');await s.reply(s.requests[0]);await s.page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0]?.resultCount===1);await s.waitStates({running:1});assert.ok(await s.page.evaluate(()=>document.body.innerText.includes('已返回 1/2 张')&&document.body.innerText.includes('返回率 50%')))
   const readImages=()=>s.page.evaluate(async()=>{const task=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0];const r=indexedDB.open('amazon-workbench-results',1);const db=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));const data=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(task.id);r.onsuccess=()=>resolve(r.result)});db.close();return data})
   const first=await readImages();assert.equal(first.length,1,'第一张必须在第二张完成前落盘');await s.reply(s.requests[1],502);await s.waitStates({success:1});assert.ok(await s.page.evaluate(()=>document.body.innerText.includes('部分返回 1')&&document.body.innerText.includes('返回率 50%')&&document.body.innerText.includes('成功 0')));await s.page.evaluate(()=>{const key='amazon-workbench.generateQueue',tasks=JSON.parse(localStorage.getItem(key));delete tasks[0].resultCount;delete tasks[0].resultsSaved;localStorage.setItem(key,JSON.stringify(tasks))});await s.page.reload({waitUntil:'networkidle0'});assert.equal(s.requests.length,2,'旧部分返回刷新不能自动补费');await s.page.waitForSelector('img[alt="任务 1 成品图 1"]');await s.page.screenshot({path:OUT+'/partial-before-retry.png',fullPage:true});await s.click('补生成缺少的 1 张');await until(()=>s.requests.length===3,'one manual missing request');await s.reply(s.requests[2]);await s.waitStates({success:1});await s.page.waitForFunction(()=>document.body.innerText.includes('已返回 2/2 张'));const completed=await readImages();assert.equal(completed.length,2);assert.equal(completed[0],first[0],'补图不得重跑或覆盖第一张');await s.page.click('[aria-label="查看第 2 张图片"]');await s.page.waitForSelector('img[alt="任务 1 成品图 2"]');assert.equal(s.requests.length,3);reports.push({scenario:'partial',incrementalSaved:true,partialPercent:50,missingOnlyManualRequest:1,firstRetained:true});await s.close()
  }
  console.log('Scenario mixed URL / base64 result hydration')
  {
   const s=await scenario('mixed',[2]);await until(()=>s.requests.length===2,'two mixed fixtures');for(const item of s.requests)await s.reply(item);await s.waitStates({success:1});await s.page.evaluate(async()=>{const key='amazon-workbench.generateQueue',tasks=JSON.parse(localStorage.getItem(key)),task=tasks[0];const db=await new Promise(resolve=>{const r=indexedDB.open('amazon-workbench-results',1);r.onsuccess=()=>resolve(r.result)});const urls=await new Promise(resolve=>{const r=db.transaction('task-results').objectStore('task-results').get(task.id);r.onsuccess=()=>resolve(r.result)});urls[0]=location.origin+'/mock-result.png';await new Promise(resolve=>{const tx=db.transaction('task-results','readwrite');tx.objectStore('task-results').put(urls,task.id);tx.oncomplete=resolve});db.close();task.resultUrls=[urls[0]];task.resultCount=2;task.resultsSaved=true;localStorage.setItem(key,JSON.stringify(tasks))});await s.page.reload({waitUntil:'networkidle0'});await s.page.click('[aria-label="查看第 2 张图片"]');await s.page.waitForSelector('img[alt="任务 1 成品图 2"]');assert.equal(s.requests.length,2);reports.push({scenario:'mixed-results',secondBase64Restored:true,noDuplicateRequest:true});await s.close()
  }
  console.log('Scenario reload after first image / retain interrupted results')
  {
   const s=await scenario('reload-partial',[2]);await until(()=>s.requests.length===2,'two before refresh');await s.reply(s.requests[0]);await s.page.waitForFunction(()=>JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))[0]?.resultCount===1);await s.page.reload({waitUntil:'networkidle0'});await s.waitStates({interrupted:1});await s.page.waitForSelector('img[alt="任务 1 成品图 1"]');assert.equal(s.requests.length,2);assert.ok(await s.page.evaluate(()=>document.body.innerText.includes('补生成缺少的 1 张')));reports.push({scenario:'reload-partial',firstRestored:true,noAutomaticRetry:true});await s.close()
  }
  console.log('Scenario limit / pause / stop / resume')
  {
   const s=await scenario('limit',[1,1,1,1,1],'2');await until(()=>s.requests.length===2,'initial limit 2');await s.click('暂停后续');await s.reply(s.requests[0]);await s.waitStates({success:1,running:1,queued:3});assert.equal(s.requests.length,2)
   await s.click('恢复执行');await until(()=>s.requests.length===3,'resume fills free slot without waiting for other task');await s.click('停止本轮');await s.reply(s.requests[1]);await s.reply(s.requests[2]);await s.waitStates({success:3,queued:2});assert.equal(s.requests.length,3)
   await s.page.waitForFunction(()=>!document.querySelector('[aria-label="任务并发数量"]').disabled);await s.page.select('[aria-label="任务并发数量"]','1');await s.click('恢复执行');await until(()=>s.requests.length===4,'resume serial');await delay(150);assert.equal(s.requests.length,4);await s.reply(s.requests[3]);await until(()=>s.requests.length===5,'next serial');await s.reply(s.requests[4]);await s.waitStates({success:5});assert.ok(s.maximum<=2)
   reports.push({scenario:'limited',maxActive:s.maximum,pausePreservesActive:true,resumeFillsAvailableSlot:true,stopLeavesQueued:true,changedConcurrencyToOne:true});await s.close()
  }
  console.log('Scenario uncertainty / explicit retry')
  {
   const s=await scenario('uncertain',[1,1,1,1,1],'2');await until(()=>s.requests.length===2,'two active');await s.reply(s.requests.find(x=>x.index===0),502);await s.waitStates({interrupted:1,running:1,queued:3});await s.reply(s.requests.find(x=>x.index===1));await s.waitStates({interrupted:1,success:1,queued:3});assert.equal(s.requests.length,2,'未确认结果不能自动重发或继续排队')
   s.page.once('dialog',dialog=>void dialog.accept());await s.click('确认重试');await until(()=>s.requests.length===4,'explicit retry plus next queued');assert.equal(s.requests.filter(x=>x.index===0).length,2);assert.equal(s.requests.filter(x=>x.index===1).length,1)
   for(let pass=0;pass<8;pass++){for(const request of s.requests.filter(x=>!x.settled))await s.reply(request);const states=await s.states();if(states.every(x=>x.status==='success'))break;await delay(100)}
   await s.waitStates({success:5});assert.equal(s.requests.length,6,'只手动重试的任务多一次请求');assert.ok(s.maximum<=2);reports.push({scenario:'uncertain',noAutomaticRetry:true,successfulSiblingRetained:true,explicitRetryOnly:true,requests:6});await s.close()
  }
  console.log('Scenario leave page with five active')
  {
   const s=await scenario('leave',[4,3,2,1,1]);await until(()=>s.requests.length===11,'eleven active before leave');await s.waitStates({running:5});await s.page.goto(BASE+'/settings',{waitUntil:'domcontentloaded'});await s.page.goto(BASE+'/generate',{waitUntil:'networkidle0'});await s.waitStates({interrupted:5});await delay(200);assert.equal(s.requests.length,11,'离开页面后不能自动重复请求');reports.push({scenario:'leave',interruptedTasks:5,noAutomaticRestart:true});await s.close()
  }
  fs.writeFileSync(OUT+'/result.json',JSON.stringify({baseURL:BASE,reports,paidCalls:0},null,2));console.log('PASS: 5任务/11个独立单图请求；逐张保存；缺图50%；手动只补1张；刷新保留部分结果；限制与暂停恢复；多标签不重复（模拟，零费用）')
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
