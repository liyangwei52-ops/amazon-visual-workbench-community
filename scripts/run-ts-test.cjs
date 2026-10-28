const path = require("node:path")
const ts = require("typescript")
const Module = require("node:module")
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.resolve(__dirname, "../src", request.slice(2)) : request, ...args)
}

require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8")
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  })
  module._compile(compiled.outputText, filename)
}

const testFile = process.argv[2]
if (!testFile) {
  console.error("Usage: node scripts/run-ts-test.cjs <test-file.ts>")
  process.exit(1)
}
require(path.resolve(testFile))
