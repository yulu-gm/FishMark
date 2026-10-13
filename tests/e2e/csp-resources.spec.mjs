import { createServer } from "node:http";
import { test, expect } from "./product-fixture.mjs";

test("CSP preserves Mermaid KaTeX fonts and data HTTP document images", async ({ product }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16"><rect width="20" height="16" fill="#228866"/></svg>';
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    response.end(svg);
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const dataImage = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const content = ["CSP allowed resource document", "", "$$", "x^2 + y^2 = z^2", "$$", "",
    "```mermaid", "graph LR", "  A[CSP allowed] --> B[Bundled renderer]", "```", "",
    `![CSP data image](${dataImage})`, "", `![CSP HTTP image](${origin}/resource.svg)`, "", "Tail", ""].join("\n");
  try {
    await product.seed(content, 60_000);
    const page = await product.launch(content);
    await expect(page.locator(".cm-math-preview-block .katex")).toBeVisible();
    await expect(page.locator(".cm-mermaid-preview svg")).toBeVisible();
    await expect(page.locator(".cm-mermaid-preview")).toContainText("CSP allowed");
    for (const label of ["CSP data image", "CSP HTTP image"]) {
      const image = page.locator(`img[alt="${label}"]`);
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => ({ complete: element.complete, width: element.naturalWidth, height: element.naturalHeight })))
        .toEqual({ complete: true, width: 20, height: 16 });
    }
    const proof = await page.evaluate(async () => {
      await document.fonts.ready;
      return { policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
        math: document.querySelector(".cm-math-preview-block .katex").textContent,
        diagram: document.querySelector(".cm-mermaid-preview svg").textContent,
        fonts: [...document.fonts].filter((font) => font.family.startsWith("KaTeX") && font.status === "loaded").map((font) => ({ family: font.family, status: font.status })),
        images: [...document.querySelectorAll('img[alt^="CSP "]')].map((image) => ({ alt: image.alt, src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight })),
        resources: performance.getEntriesByType("resource").map((entry) => entry.name) };
    });
    expect(proof.fonts.length).toBeGreaterThan(0);
    expect(proof.images.find((image) => image.alt === "CSP data image").src).toBe(dataImage);
    expect(proof.images.find((image) => image.alt === "CSP HTTP image").src).toBe(`${origin}/resource.svg`);
    expect(requests).toEqual(["/resource.svg"]);
    expect(proof.policy).not.toContain("unsafe-eval");
    expect(proof.policy).not.toContain("sha256-");
    await product.testInfo.attach("csp-positive-resources", { body: JSON.stringify({ proof, requests }, null, 2), contentType: "application/json" });
    await product.checkpoint("csp-allowed-resources");
    await product.append("continued");
    await product.manualSave();
    await product.expectSaved(content + "continued");
    await product.normalClose();
  } finally { await new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
});
