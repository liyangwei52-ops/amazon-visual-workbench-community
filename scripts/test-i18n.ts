import assert from "node:assert/strict"
import { POST } from "../src/app/api/images/route"
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale, t } from "../src/lib/i18n"
import { normalizeImageEndpoint } from "../src/lib/image-request"

async function main() {
  assert.equal(DEFAULT_LOCALE, "en")
  for (const [input, expected] of [
    [undefined, "en"], [null, "en"], ["", "en"], ["unsupported", "en"],
    [" ZH_tw ", "zh-TW"], ["zh-HK", "zh-TW"], ["zh-MO", "zh-TW"],
    ["zh-CN", "zh"], ["ja-JP", "ja"], ["ko-KR", "ko"],
    ["es-ES", "es"], ["fr-FR", "fr"], ["de-DE", "de"], ["pt-BR", "pt"],
  ] as const) {
    assert.equal(resolveLocale(input), expected)
  }
  assert.equal(t("zh", "proxyPromptRequired"), "请输入提示词。")
  assert.equal(t("en", "proxyPromptRequired"), "Enter a prompt before submitting.")
  assert.equal(t("zh", "proxyRequestFailed", { status: 429 }), "上游请求失败：429")
  assert.equal(t("en", "proxyRequestFailed", { status: 503 }), "Upstream request failed: 503")

  const originalFetch = globalThis.fetch
  let upstreamCalls = 0
  globalThis.fetch = async () => {
    upstreamCalls++
    throw new Error("Unexpected upstream call: validation must finish before sending")
  }
  const checkValidation = async (
    locale: string,
    prompt: string,
    expected: string,
    image?: File,
    header = "en-US"
  ) => {
    const form = new FormData()
    form.set("apiKey", "mock-i18n-validation")
    form.set("endpoint", "https://api.openai.com/v1")
    form.set("locale", locale)
    form.set("prompt", prompt)
    if (image) form.append("images", image)
    const response = await POST(new Request("http://localhost/api/images", {
      method: "POST", headers: { "accept-language": header }, body: form,
    }))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: expected })
  }

  try {
    for (const locale of SUPPORTED_LOCALES) {
      assert.throws(() => normalizeImageEndpoint("not a URL", false, locale), {
        message: t(locale, "invalidEndpoint"),
      })
      await checkValidation(locale, " \n ", t(locale, "proxyPromptRequired"))
      const name = "商品 {detail} référence.gif"
      await checkValidation(locale, "测试", t(locale, "proxyUnsupportedImageFormat", { name }),
        new File(["mock"], name, { type: "image/gif" }))
      assert.ok(t(locale, "proxyImageTooLarge", { name }).includes(name))
      assert.ok(t(locale, "proxyRequestFailed", { status: 503 }).includes("503"))
      for (const key of ["invalidEndpoint", "proxyPromptRequired", "proxyNoImageField", "proxyGenerationFailed"] as const) {
        assert.ok(t(locale, key).length > 0)
      }
    }
    await checkValidation("", "", t("zh-TW", "proxyPromptRequired"), undefined, "zh-HK")
    await checkValidation("fr", "", t("fr", "proxyPromptRequired"), undefined, "zh-CN")
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })
    await checkValidation("zh", "测试", "图片超过 10MB：large.png", oversized)
    assert.equal(upstreamCalls, 0)
    console.log("PASS: 9种语言、别名/回退、错误插值、无效地址及21次真实POST校验；无上游请求")
  } finally {
    globalThis.fetch = originalFetch
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
