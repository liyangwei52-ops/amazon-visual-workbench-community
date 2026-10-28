/** 生图请求仍使用的错误提示；保留既有语言识别与原始翻译。 */
export const SUPPORTED_LOCALES = ["en","zh","zh-TW","ja","ko","es","fr","de","pt"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

const errorMessages = {
  "en": {
    "invalidEndpoint": "The endpoint URL is invalid.",
    "proxyPromptRequired": "Enter a prompt before submitting.",
    "proxyUnsupportedImageFormat": "Unsupported image format: {name}",
    "proxyImageTooLarge": "Image exceeds 10MB: {name}",
    "proxyRequestFailed": "Upstream request failed: {status}",
    "proxyNoImageField": "The request succeeded, but no image field was found in the response.",
    "proxyGenerationFailed": "Image generation failed."
  },
  "zh": {
    "invalidEndpoint": "接口地址不是有效的 URL。",
    "proxyPromptRequired": "请输入提示词。",
    "proxyUnsupportedImageFormat": "不支持的图片格式：{name}",
    "proxyImageTooLarge": "图片超过 10MB：{name}",
    "proxyRequestFailed": "上游请求失败：{status}",
    "proxyNoImageField": "请求成功，但未在响应中找到图片字段。",
    "proxyGenerationFailed": "图片生成失败。"
  },
  "zh-TW": {
    "invalidEndpoint": "接口地址不是有效的 URL。",
    "proxyPromptRequired": "請輸入提示詞。",
    "proxyUnsupportedImageFormat": "不支援的圖片格式：{name}",
    "proxyImageTooLarge": "圖片超過 10MB：{name}",
    "proxyRequestFailed": "上游請求失敗：{status}",
    "proxyNoImageField": "請求成功，但未在回應中找到圖片欄位。",
    "proxyGenerationFailed": "圖片生成失敗。"
  },
  "ja": {
    "invalidEndpoint": "エンドポイントURLが無効です。",
    "proxyPromptRequired": "プロンプトを入力してください。",
    "proxyUnsupportedImageFormat": "未対応の画像形式：{name}",
    "proxyImageTooLarge": "画像が10MBを超えています：{name}",
    "proxyRequestFailed": "上流リクエスト失敗：{status}",
    "proxyNoImageField": "リクエストは成功しましたが、画像フィールドが見つかりません。",
    "proxyGenerationFailed": "画像生成に失敗しました。"
  },
  "ko": {
    "invalidEndpoint": "엔드포인트 URL이 유효하지 않습니다.",
    "proxyPromptRequired": "프롬프트를 입력하세요.",
    "proxyUnsupportedImageFormat": "지원하지 않는 이미지 형식: {name}",
    "proxyImageTooLarge": "이미지가 10MB를 초과합니다: {name}",
    "proxyRequestFailed": "상위 요청 실패: {status}",
    "proxyNoImageField": "요청은 성공했지만 이미지 필드를 찾을 수 없습니다.",
    "proxyGenerationFailed": "이미지 생성에 실패했습니다."
  },
  "es": {
    "invalidEndpoint": "La URL del endpoint no es válida.",
    "proxyPromptRequired": "Introduce un prompt antes de enviar.",
    "proxyUnsupportedImageFormat": "Formato de imagen no compatible: {name}",
    "proxyImageTooLarge": "La imagen supera los 10MB: {name}",
    "proxyRequestFailed": "La solicitud al proveedor falló: {status}",
    "proxyNoImageField": "La solicitud tuvo éxito, pero no se encontró ningún campo de imagen.",
    "proxyGenerationFailed": "Error al generar imágenes."
  },
  "fr": {
    "invalidEndpoint": "L'URL du point de terminaison est invalide.",
    "proxyPromptRequired": "Saisissez un prompt avant l'envoi.",
    "proxyUnsupportedImageFormat": "Format d'image non pris en charge : {name}",
    "proxyImageTooLarge": "L'image dépasse 10MB : {name}",
    "proxyRequestFailed": "La requête amont a échoué : {status}",
    "proxyNoImageField": "La requête a réussi, mais aucun champ image n'a été trouvé.",
    "proxyGenerationFailed": "La génération d'image a échoué."
  },
  "de": {
    "invalidEndpoint": "Die Endpunkt-URL ist ungültig.",
    "proxyPromptRequired": "Vor dem Absenden einen Prompt eingeben.",
    "proxyUnsupportedImageFormat": "Nicht unterstütztes Bildformat: {name}",
    "proxyImageTooLarge": "Bild überschreitet 10MB: {name}",
    "proxyRequestFailed": "Upstream-Anfrage fehlgeschlagen: {status}",
    "proxyNoImageField": "Die Anfrage war erfolgreich, aber es wurde kein Bildfeld gefunden.",
    "proxyGenerationFailed": "Bildgenerierung fehlgeschlagen."
  },
  "pt": {
    "invalidEndpoint": "A URL do endpoint é inválida.",
    "proxyPromptRequired": "Digite um prompt antes de enviar.",
    "proxyUnsupportedImageFormat": "Formato de imagem não compatível: {name}",
    "proxyImageTooLarge": "A imagem excede 10MB: {name}",
    "proxyRequestFailed": "Falha na solicitação upstream: {status}",
    "proxyNoImageField": "A solicitação foi concluída, mas nenhum campo de imagem foi encontrado.",
    "proxyGenerationFailed": "Falha ao gerar imagens."
  }
} as const

type MessageKey = keyof (typeof errorMessages)[Locale]

export function resolveLocale(value?: string | null): Locale {
  const normalized = value?.trim().toLowerCase().replace("_", "-")

  if (!normalized) {
    return DEFAULT_LOCALE
  }

  if (normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-mo") {
    return "zh-TW"
  }

  if (normalized.startsWith("zh")) return "zh"
  if (normalized.startsWith("ja")) return "ja"
  if (normalized.startsWith("ko")) return "ko"
  if (normalized.startsWith("es")) return "es"
  if (normalized.startsWith("fr")) return "fr"
  if (normalized.startsWith("de")) return "de"
  if (normalized.startsWith("pt")) return "pt"

  return "en"
}

export function t(locale: Locale, key: MessageKey, values?: Record<string, string | number>) {
  const template = String(errorMessages[locale][key])

  if (!values) {
    return template
  }

  return Object.entries(values).reduce<string>(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    template
  )
}
