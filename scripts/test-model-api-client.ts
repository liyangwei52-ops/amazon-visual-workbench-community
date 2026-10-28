import assert from "node:assert/strict"
import { requestModelApi } from "../src/lib/model-api-client"
const originalFetch=globalThis.fetch
const image="data:image/png;base64,dGVzdA=="
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}})
async function main(){
  let remoteCalls=0
  const key="sk-test-client-routing"
  const endpoint="https://api.openlux.ai/v1"
  globalThis.fetch=async(input,init)=>{
    const url=String(input)
    if(url==="/api/provider-transport"){
      assert.ok(!String(init?.body).includes(key))
      return response({mode:"direct",baseURL:endpoint})
    }
    assert.ok(url.startsWith(endpoint+"/"))
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer "+key)
    remoteCalls++
    if(url.endsWith("/chat/completions")){
      const body=JSON.parse(String(init?.body))
      const content=body.messages[1].content
      assert.equal(content[1].type,"text")
      assert.ok(content[1].text.includes("我方产品图"))
      assert.equal(content[2].image_url.url,image)
      assert.ok(content[3].text.includes("竞品参考图"))
      assert.equal(body.messages[0].content,"完整系统模板".repeat(2000))
      return response({choices:[{finish_reason:"stop",message:{content:"完整提示词".repeat(2000)}}]})
    }
    assert.ok(init?.body instanceof FormData)
    const form=init.body as FormData
    assert.equal(form.getAll("image[]").length,2)
    assert.equal(form.get("size"),"2048x1152")
    assert.ok(String(form.get("prompt")).includes("原始长提示词".repeat(2000)))
    assert.equal(form.has("apiKey"),false)
    return response({data:[{b64_json:"dGVzdA=="}]})
  }
  const analysis=await requestModelApi("/api/analyze",{body:JSON.stringify({endpoint,apiKey:key,model:"test",systemPrompt:"完整系统模板".repeat(2000),userText:"完整策划",images:[{dataUrl:image,role:"product",index:1},{dataUrl:image,role:"reference",index:2}]})})
  assert.equal((await analysis.json()).prompt.length,10000)
  const form=new FormData()
  for(const [name,value] of Object.entries({endpoint,apiKey:key,model:"test",prompt:"原始长提示词".repeat(2000),size:"2048x1152"}))form.append(name,value)
  form.append("images",new File(["test"],"product.png",{type:"image/png"}))
  form.append("images",new File(["test"],"reference.png",{type:"image/png"}))
  assert.equal((await(await requestModelApi("/api/images",{body:form})).json()).images.length,1)
  globalThis.fetch=async()=>response({mode:"direct",baseURL:"https://unapproved.example/v1"})
  const denied=await requestModelApi("/api/analyze",{body:JSON.stringify({endpoint:endpoint+"/other",apiKey:key})})
  assert.equal(denied.status,400)
  assert.equal(remoteCalls,2)
  console.log("PASS: 线上直连仅使用已校验服务商；校验不含密钥；分析图序、完整提示词、图片文件与尺寸无损；拒绝陌生地址且不自动重试")
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{globalThis.fetch=originalFetch})
