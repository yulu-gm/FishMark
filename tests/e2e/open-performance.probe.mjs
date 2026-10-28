import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { test, expect } from "./product-fixture.mjs";

for (const lines of [5000, 20000]) {
  test(`生产构建 ${lines} 行：一个新进程和两次暖打开`, async ({ product }, testInfo) => {
    const canonical = await readFile("fixtures/performance/complex-20000-lines.md", "utf8");
    const identity = JSON.parse(await readFile("fixtures/performance/complex-20000-lines.fixture.json", "utf8"));
    const hash = text => createHash("sha256").update(text).digest("hex");
    expect(hash(canonical)).toBe(identity.sha256);
    const source = canonical.split("\n").slice(0, lines).join("\n");
    await product.seed(source, 60_000);
    const page = await product.launch(source);
    const samples = [product.current.openPerformance];
    for (let index = 0; index < 3; index++) {
      if (index > 0) {
        const target = join(dirname(product.documentPath), `warm-${index}.md`);
        await writeFile(target, source, { encoding: "utf8", flag: "wx" });
        samples.push(await product.current.app.evaluate(async (_, target) => globalThis.__fishmarkOpenPerformance.open(target), target));
      }
      await writeFile(testInfo.outputPath(`open-sample-${index}.json`), JSON.stringify(samples[index], null, 2), { flag: "wx" });
      // 完整内容、编辑和撤销检查在计时结束后执行，不把快照传输计入 editor-ready。
      await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(source);
      await product.append("\n\n性能检查", page);
      await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(source + "\n\n性能检查");
      await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
      await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(source);
      const document = (await product.snapshot()).activeDocument;
      expect(await readFile(document.path, "utf8")).toBe(source);
    }
    const report = { schemaVersion: 1, lines, sourceSha256: hash(source), sourceBytes: Buffer.byteLength(source),
      measurement: "main monotonic clock: before production main require / File Open callback to DOM then fonts.ready + two RAF; not OS cold cache or compositor",
      budgetMs: lines === 5000 ? 500 : 1500, samples, provenance: product.provenance, identity: product.current.identity };
    // 协议正确性与性能验收分别记录，测试通过不代表首次打开预算通过。
    report.budgetVerdict = samples.every(sample => Number.isFinite(sample.readyMs) && sample.readyMs <= report.budgetMs) ? "PASS" : "FAIL";
    await writeFile(testInfo.outputPath("open-performance.json"), JSON.stringify(report, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ lines, samples: samples.map(({kind, domMs, readyMs}) => ({kind, domMs, readyMs})), budgetMs: report.budgetMs }));
    await product.normalClose();
  });
}
