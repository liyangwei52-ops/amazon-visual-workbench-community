/** 容许模型的小幅像素舍入；明显偏离时保留原图并提示，不裁剪或自动重试。 */
export function imageOutputWarning(expectedSize: string, width: number, height: number): string {
  const match = /^(\d+)x(\d+)$/.exec(expectedSize)
  if (!match || !width || !height) return ""
  const [expectedWidth, expectedHeight] = [Number(match[1]), Number(match[2])]
  const differentRatio = Math.abs(Math.log((width / height) / (expectedWidth / expectedHeight))) > 0.03
  if (differentRatio) return `比例不符：本次提交 ${expectedSize}，服务商实际返回 ${width}x${height}。已保留原图，请核查服务商结果；不会自动重试。`
  if (Math.abs(width / expectedWidth - 1) > 0.05 || Math.abs(height / expectedHeight - 1) > 0.05) {
    return `返回像素与设置不一致：本次提交 ${expectedSize}，实际 ${width}x${height}，画幅比例接近。已保留原图。`
  }
  return ""
}
