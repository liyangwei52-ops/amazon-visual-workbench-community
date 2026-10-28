import assert from "node:assert/strict"
import { describeImageConnectionFailure, inspectImageTransportError } from "../src/lib/image-connection"

const connect = new TypeError("fetch failed", { cause: Object.assign(new Error("Connect timed out"), { code: "UND_ERR_CONNECT_TIMEOUT" }) })
const detail = inspectImageTransportError(connect)
assert.deepEqual(detail, { phase: "connect", code: "UND_ERR_CONNECT_TIMEOUT" })
const rejection = describeImageConnectionFailure(detail, true, 10001)
assert.equal(rejection.outcome, "failed")
assert.ok(rejection.error.includes("10 秒") && rejection.error.includes("尚未提交"))
const dropped = new TypeError("fetch failed", { cause: Object.assign(new Error("socket closed"), { code: "UND_ERR_SOCKET" }) })
assert.equal(describeImageConnectionFailure(inspectImageTransportError(dropped), false, 4000).outcome, "interrupted")
assert.equal(describeImageConnectionFailure(undefined, true, 900000).outcome, "interrupted")
const aggregate = new AggregateError([Object.assign(new Error("DNS failed"), { code: "ENOTFOUND" })])
assert.equal(inspectImageTransportError(aggregate)?.phase, "connect")
console.log("PASS: 连接前失败与提交后断线分开处理，保留错误代码及真实耗时")
