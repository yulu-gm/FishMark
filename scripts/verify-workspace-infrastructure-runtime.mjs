import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const infrastructure = require("@fishmark/workspace-infrastructure");
const buffer = infrastructure.createCodeMirrorTextBuffer("alpha\r\nbeta");
const edited = buffer.apply([
  { from: 0, to: 5, insert: "FishMark" },
  { from: 7, to: 11, insert: "鱼🙂" }
]);

assert.equal(edited.toString(), "FishMark\r\n鱼🙂");
assert.equal(buffer.toString(), "alpha\r\nbeta");
