import assert from 'node:assert/strict'
import { analysisFailureMessage } from '../src/lib/analysis-failure'

const upstream = 'The upstream service timed out. Please try again later. (request id: edge-test-001)'
const translated = analysisFailureMessage(new Error(upstream), '分析失败')
assert.ok(translated.includes('服务商等待超时'))
assert.ok(translated.includes('系统不会自动重发'))
assert.ok(translated.endsWith(upstream), 'Keep the exact provider error and request ID')
for (const message of ['分析请求等待已超过15分钟，已结束本次等待。', 'Failed to fetch', 'invalid_api_key', 'timeout is a product label']) {
  assert.equal(analysisFailureMessage(new Error(message), '分析失败'), message)
}
assert.equal(analysisFailureMessage(null, '分析失败'), '分析失败')
console.log('analysis failure messages: passed (no network)')
