// Attach only to the isolated test browser; inspect already requested responses.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core'),sharp=require('sharp'),crypto=require('node:crypto')
const phase=process.argv[2],out=path.resolve('verification/folder-20261016',phase),report=[]
async function main(){const port=fs.readFileSync(path.join(out,'profile/DevToolsActivePort'),'utf8').split('\n')[0],browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port,protocolTimeout:1200000}),pending=[]
 const pages=await browser.pages();const page=pages.find(p=>p.url().includes('localhost:3000'));if(!page)throw Error('No test page')
 page.on('response',r=>{if(!r.url().endsWith('/api/images'))return;const number=report.length+1;const row={number,status:r.status(),images:[]};report.push(row);pending.push((async()=>{try{const body=await r.json();for(const[i,im]of(body.images||[]).entries()){if(!im.src?.startsWith('data:image/')){row.images.push({remote:true});continue}const bytes=Buffer.from(im.src.split(',')[1],'base64'),meta=await sharp(bytes).metadata(),file=`response-${number}-${i+1}.${meta.format==='jpeg'?'jpg':meta.format}`;fs.writeFileSync(path.join(out,file),bytes);row.images.push({file,width:meta.width,height:meta.height,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}fs.writeFileSync(path.join(out,'response-image-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(row))}catch(e){console.log(e.message)}})())})
 await new Promise(resolve=>browser.on('disconnected',resolve));await Promise.allSettled(pending)
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
