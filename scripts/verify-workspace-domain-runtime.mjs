import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const domain = require("@fishmark/workspace-domain");
const buffer = domain.createStringTextBuffer("FishMark");

if (buffer.toString() !== "FishMark") {
  throw new Error("workspace-domain runtime entry returned an invalid buffer");
}
