import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const files = ["src/renderer/styles/markdown-render.css",
    "packages/codemirror-adapter/src/decorations/block-decorations.ts"];
const candidate = files.map(file => readFileSync(file));
try {
    for (const file of files)
        writeFileSync(file, execFileSync("git", ["show",
            "1654e82cd28008cc4f6ae9adec04c5a4d56389ec:" + file]));
    execFileSync(process.execPath, [resolve("scripts/probe-list-caret.mjs"), process.argv[2]], { stdio: "inherit", timeout: 180000 });
}
finally {
    files.forEach((file, index) => writeFileSync(file, candidate[index]));
    if (!files.every((file, index) => readFileSync(file).equals(candidate[index]))) {
        throw new Error("Candidate restoration verification failed");
    }
    console.log("Candidate bytes restored after official main list baseline");
}
