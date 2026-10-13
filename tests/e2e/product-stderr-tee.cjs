const { appendFileSync, writeFileSync } = require("node:fs");

// Tee process.stderr's actual formatted bytes and asynchronous write semantics.
// Do not reconstruct output from console args
// or combine this source with Playwright's later child-pipe observation.
function installStderrTee(stream, targetPath) {
  writeFileSync(targetPath, Buffer.alloc(0), { flag: "wx" });
  const originalWrite = stream.write;
  stream.write = function (chunk, encoding) {
    const bytes = typeof chunk === "string"
      ? Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8")
      : Buffer.from(chunk);
    const result = Reflect.apply(originalWrite, this, arguments);
    appendFileSync(targetPath, bytes);
    return result;
  };
}

module.exports = { installStderrTee };
