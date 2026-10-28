export function imageIdentityDescription(index: number, role: string): string {
  if (role === "product") return `图${index}：我方产品图（主产品图），商品外观事实的最高优先级来源；仅在本条要求商品出镜时保留对应实物的印花、文字、结构和颜色。资料中全部配件不等于本图全部出镜；纯人物/背景任务不因上传此图增加产品或广告文案。`
  if (role === "product-detail") return `图${index}：我方补充产品图，补充视角、细节或配件资料；不是竞品图。与主产品图冲突时以图1为准，不自动把多图解释为销售套装或增加商品数量。`
  return `图${index}：竞品参考图，只借鉴本条需求允许的构图、场景、光影和信息布局；其中的产品、印花、品牌及配件不得替换我方商品，参考上的文字/图标不是默认上图内容。`
}
export function productIdentitySystemNote(count: number): string {
  return `\n\n【本次实际图片身份与顺序，以此覆盖模板中固定图片编号的假设】\n${Array.from({ length: count }, (_, index) => imageIdentityDescription(index + 1, index === 0 ? "product" : "product-detail")).join("\n")}\n如有竞品或文档参考图，从图${count + 1}开始。补充产品图不能误当作竞品图。所有图均须阅读；以图1确定主产品，其他图仅按明确需求补充信息，不推断未知参数或把不同款式拼成新商品。`
}
export function productAnalysisImages(images: { dataUrl: string }[]) {
  return images.map((image, index) => ({ dataUrl: image.dataUrl, role: index === 0 ? "product" : "product-detail", index: index + 1 }))
}
export function parseProductImageCount(value: unknown, total: number): number {
  const count = value === null || value === undefined ? Math.min(1, total) : Number(value)
  if (!Number.isInteger(count) || count < 0 || count > 4 || count > total) throw new Error("产品图数量无效：最多4张，且必须与实际上传图片一致")
  return count
}
