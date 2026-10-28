import assert from "node:assert/strict"
import { resolveImagePlan, isValidGptImageSize, promptForImagePlan } from "../src/lib/model-image-plan"
import { requestGeminiImages, extractGeminiImages, GeminiImageError } from "../src/lib/gemini-image-request"

async function main() {
  const plan = resolveImagePlan("gpt-image-2", "1920×1080")
  assert.equal(plan.size, "1920x1088")
  assert.equal(resolveImagePlan("gpt-image-2", "2048x1152").adjusted, false)
  for (let i=0;i<1200;i++) {
    const width=1+(i*7919)%24000, height=1+(i*3571)%12000
    const [w,h]=resolveImagePlan("gpt-image-2",`${width}x${height}`).size.split("x").map(Number)
    assert.ok(isValidGptImageSize(w,h), `${width}x${height} => ${w}x${h}`)
  }
  const gemini=resolveImagePlan("Gemini 3 Pro Image", "1920x1080", "2k", "custom")
  assert.equal(gemini.model,"gemini-3-pro-image")
  assert.equal(gemini.protocol,"gemini")
  assert.equal(gemini.aspectRatio,"16:9")
  assert.equal(gemini.resolution,"2K")
  assert.equal(gemini.size,"2752x1536")
  assert.equal(resolveImagePlan("gemini-3-pro-image-preview","3584x1536","2k","21:9").size,"3168x1344")
  assert.equal(resolveImagePlan("gemini-3-pro-image","4096x4096","4k","1:1").size,"4096x4096")
  assert.equal(resolveImagePlan("other-model","1920x1080").size,"1920x1080")
  assert.throws(()=>resolveImagePlan("gpt-image-2","abc"))
  const full="完整正负向提示词。".repeat(3000)
  assert.ok(promptForImagePlan(full,plan).includes(full))
  assert.ok(promptForImagePlan(full,gemini).includes("Native aspect ratio: 16:9"))
  const native={candidates:[{content:{parts:[{thought:true,inlineData:{data:"hidden",mimeType:"image/png"}},{inlineData:{data:"visible",mimeType:"image/jpeg"}}]}}]}
  assert.deepEqual(extractGeminiImages(native),[{src:"data:image/jpeg;base64,visible"}])
  assert.equal(extractGeminiImages({candidates:[{content:{parts:[{inline_data:{data:"png",mime_type:"image/png"}}]}}]}).length,1)
  let calls=0
  const key="test-gemini-secret"
  const input={baseURL:"https://api.openlux.ai/v1",apiKey:key,plan:gemini,prompt:full,images:[new File(["product"],"product.jpg",{type:"image/jpeg"}),new File(["reference"],"ref.png",{type:"image/png"})],count:2,fetcher:(async(url,init)=>{
    calls++
    assert.equal(String(url),"https://api.openlux.ai/v1beta/models/gemini-3-pro-image:generateContent")
    assert.ok(!String(url).includes(key))
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer "+key)
    const body=JSON.parse(String(init?.body))
    assert.deepEqual(body.generationConfig.imageConfig,{aspectRatio:"16:9",imageSize:"2K"})
    assert.ok(body.contents[0].parts[0].text.includes(full))
    assert.equal(body.contents[0].parts[2].inline_data.data,btoa("product"))
    assert.equal(body.contents[0].parts[4].inline_data.data,btoa("reference"))
    assert.equal(body.n,undefined)
    return Response.json(native)
  }) as typeof fetch}
  assert.equal((await requestGeminiImages(input)).images.length,2)
  assert.equal(calls,2)
  calls=0
  const partial=await requestGeminiImages({...input,count:3,fetcher:async()=>{
    calls++;return calls===1?Response.json(native):Response.json({error:{message:"busy"}},{status:503})
  }})
  assert.equal(partial.images.length,1);assert.equal(calls,2);assert.equal(partial.warnings.length,1)
  calls=0
  await assert.rejects(requestGeminiImages({...input,fetcher:async()=>{calls++;throw new Error("disconnect")}}),GeminiImageError)
  assert.equal(calls,1)
  console.log("PASS: 1200组自定义尺寸满足全部GPT限制；Gemini最近比例/原生分辨率；全文与多图身份保留；原生图片解析；多张独立调用、部分结果保留、无自动重发")
}
main().catch(error=>{console.error(error);process.exitCode=1})
