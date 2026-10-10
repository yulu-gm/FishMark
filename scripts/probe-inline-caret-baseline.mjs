import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const files = ["src/renderer/styles/markdown-render.css", "packages/codemirror-adapter/src/decorations/block-decorations.ts", "packages/codemirror-adapter/src/decorations/inline-decorations.ts"];
const candidate = files.map(file => readFileSync(file));
const baseline = "2fddf428c4d9b335886d517ebb59f7c12c567313";
try {
    for (const file of files) writeFileSync(file, execFileSync("git", ["show", baseline + ":" + file]));
    execFileSync(process.execPath, [resolve("scripts/probe-list-caret.mjs"), process.argv[2], "candidate", "adjacent"], { stdio: "inherit", timeout: 180000 });
} finally {
    files.forEach((file, i) => writeFileSync(file, candidate[i]));
    if (!files.every((file, i) => readFileSync(file).equals(candidate[i]))) throw Error("Candidate restoration verification failed");
    console.log("Candidate bytes restored after previous-checkpoint inline baseline");
}
