const fs=require('node:fs')
const path=require('node:path')
const sharp=require('sharp')
const OUT=path.resolve('verification/three-real-tests')
async function main(){
 for(const phase of process.argv.slice(2)){
  const files=fs.readdirSync(OUT).filter(x=>new RegExp('^'+phase+'-\\d+-1\\.png$').test(x)).sort()
  const layers=[]
  for(let i=0;i<files.length;i++){
   const image=await sharp(path.join(OUT,files[i])).resize(320,300,{fit:'contain',background:'#ffffff'}).png().toBuffer()
   layers.push({input:image,left:i%4*320,top:Math.floor(i/4)*330+30})
   layers.push({input:Buffer.from(`<svg width="320" height="30"><rect width="320" height="30" fill="#dfe7ef"/><text x="12" y="21" font-family="Arial" font-size="16">${phase} ${files[i].split('-')[1]}</text></svg>`),left:i%4*320,top:Math.floor(i/4)*330})
  }
  if(layers.length)await sharp({create:{width:1280,height:Math.ceil(files.length/4)*330,channels:3,background:'#eeeeee'}}).composite(layers).png().toFile(path.join(OUT,phase+'-contact-sheet.png'))
  console.log(JSON.stringify({phase,images:files.length}))
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
