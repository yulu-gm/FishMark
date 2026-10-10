import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
const directory = resolve(process.argv[2]);
const report = JSON.parse(readFileSync(resolve(directory, "report.json"), "utf8"));
if (!report.complete)
    throw new Error("Incomplete capture cannot be accepted");
const files = readdirSync(directory);
const samples = report.samples.map((sample) => {
    const frames = files.filter(file => file.startsWith(sample.name + "-screen-frame"));
    let visibleFrames = 0, best = { pixels: 0, bounds: null };
    for (const file of frames) {
        const bitmap = PNG.sync.read(readFileSync(resolve(directory, file)));
        let pixels = 0, left = Infinity, top = Infinity, right = -1, bottom = -1;
        for (let y = 0; y < bitmap.height; y++)
            for (let x = 0; x < bitmap.width; x++) {
                const offset = (y * bitmap.width + x) * 4;
                if (bitmap.data[offset] > 180 && bitmap.data[offset + 1] < 80 && bitmap.data[offset + 2] < 80) {
                    pixels++;
                    left = Math.min(left, x);
                    right = Math.max(right, x);
                    top = Math.min(top, y);
                    bottom = Math.max(bottom, y);
                }
            }
        if (pixels > 0)
            visibleFrames++;
        if (pixels > best.pixels)
            best = { pixels, bounds: { left, top, right, bottom } };
    }
    const bounds = best.bounds, range = sample.state.domSelection.range;
    const pass = frames.length === 12 && sample.screenCapture.exit === 0 && sample.foreground &&
        sample.state.hasFocus && bounds !== null && bounds.right === bounds.left &&
        bounds.bottom - bounds.top + 1 >= 15 && best.pixels >= 15 &&
        Math.abs(bounds.left - range.left) <= 2 && Math.abs(bounds.top - range.top - 26) <= 2;
    return { name: sample.name, label: sample.label, pass, visibleFrames, frames: frames.length, ...best,
        selection: sample.state.selection, range, line: sample.state.line.rect };
});
const result = { pass: samples.every(sample => sample.pass), samples };
writeFileSync(resolve(directory, "caret-pixel-verdict.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ pass: result.pass, passed: samples.filter(sample => sample.pass).length,
    total: samples.length, failed: samples.filter(sample => !sample.pass) }, null, 2));
