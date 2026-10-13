import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { normalizePath, type Plugin, type ResolvedConfig } from "vite";

export const PRODUCTION_RENDERER_CSP = "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' fishmark-asset://preview; img-src 'self' fishmark-asset://preview data: http: https:; font-src 'self' fishmark-asset://preview data:; connect-src fishmark-asset://preview; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";

const policyMeta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/giu;

export function createRendererCspPlugin(): Plugin {
  let config: ResolvedConfig;
  let trustedPreamble: string;
  return {
    name: "fishmark-renderer-csp",
    enforce: "post",
    async configResolved(resolved) {
      config = resolved;
      // Vite loads this project's config as CJS. React's CJS callable wrapper
      // omits preambleCode, so use its native ESM export for these trusted bytes.
      const { default: react } = await import("@vitejs/plugin-react");
      trustedPreamble = react.preambleCode;
      if (typeof trustedPreamble !== "string" || !trustedPreamble.includes("__BASE__")) {
        throw new Error("React Refresh does not export the expected trusted preamble.");
      }
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        // Product and workbench share this one entry. Standalone probe pages
        // retain their own existing HTML contracts and receive no script grants.
        if (normalizePath(resolve(context.filename)) !== normalizePath(resolve(config.root, "index.html"))) return html;
        const metas = [...html.matchAll(policyMeta)];
        if (metas.length !== 1 || metas[0]?.[1] !== PRODUCTION_RENDERER_CSP) {
          throw new Error("Renderer entry must contain exactly one unchanged production CSP meta.");
        }
        let policy = PRODUCTION_RENDERER_CSP;
        if (config.command === "serve") {
          const refreshEnabled = !config.isProduction && config.server.hmr !== false;
          if (refreshEnabled) {
            const preamble = trustedPreamble.replace("__BASE__", config.base);
            // Authorize only the plugin's exported trusted bytes. Additional
            // inline HTML is never scanned into the hash allowlist.
            const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu)];
            if (scripts.filter((script) => script[1] === preamble).length !== 1) {
              throw new Error("React Refresh preamble differs from its trusted CSP hash input.");
            }
            const hash = createHash("sha256").update(preamble).digest("base64");
            policy = policy.replace("script-src 'self'", `script-src 'self' 'sha256-${hash}'`);
          }
          let connections = "'self'";
          if (config.server.hmr !== false) {
            const hmr = typeof config.server.hmr === "object" ? config.server.hmr : {};
            const port = config.server.port;
            if (config.server.host !== "localhost" || config.server.https ||
                hmr.host && hmr.host !== "localhost" || hmr.protocol && hmr.protocol !== "ws" ||
                hmr.port && hmr.port !== port || hmr.clientPort && hmr.clientPort !== port ||
                !port || port < 1 || port > 65535) {
              throw new Error("Renderer CSP requires the configured localhost WebSocket on the resolved dev server port.");
            }
            connections += ` ws://localhost:${port}`;
          }
          policy = policy.replace("connect-src fishmark-asset://preview", `connect-src fishmark-asset://preview ${connections}`);
        }
        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
        const withoutPolicy = html.replace(policyMeta, "");
        if (!/<head\b[^>]*>/iu.test(withoutPolicy)) throw new Error("Renderer CSP requires an HTML head.");
        // Vite and React prepend their tags. Move policy ahead of them after
        // all ordinary transforms, so it applies before any script or link.
        return withoutPolicy.replace(/<head\b[^>]*>/iu, `$&\n    ${meta}`);
      }
    }
  };
}
