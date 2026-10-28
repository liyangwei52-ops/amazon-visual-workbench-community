const fs=require('node:fs')
const puppeteer=require('puppeteer-core')
async function main(){
 const port=fs.readFileSync('verification/three-real-tests/browser-profile/DevToolsActivePort','utf8').split('\n')[0]
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port})
 try{
  const page=(await browser.pages()).find(x=>x.url().endsWith('/generate'))
  const result=await page.evaluate(()=>{
   const queue=JSON.parse(localStorage.getItem('amazon-workbench.generateQueue'))
   const restored=[]
   const next=queue.map(task=>{
    if(task.status==='interrupted'&&task.error?.startsWith('The provided fetch function does not support file uploads')){
     restored.push(task.id);return{...task,status:'queued',error:undefined}
    }
    return task
   })
   const value=JSON.stringify(next);localStorage.setItem('amazon-workbench.generateQueue',value)
   window.dispatchEvent(new StorageEvent('storage',{key:'amazon-workbench.generateQueue',newValue:value}))
   return {restored,unknownPreserved:next.filter(x=>x.status==='interrupted').map(x=>x.id)}
  })
  console.log(JSON.stringify(result))
 }finally{browser.disconnect()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
