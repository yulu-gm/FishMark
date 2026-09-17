import path from "node:path";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true, watch: null },
  resolve: { alias: {
    "@fishmark/workspace-domain": path.resolve("packages/workspace-domain/src/index.ts"),
    "@fishmark/workspace-application": path.resolve("packages/workspace-application/src/index.ts")
  } },
  ssr: { noExternal: ["@fishmark/workspace-domain", "@fishmark/workspace-application"] }
});
const domain = await server.ssrLoadModule("/packages/workspace-domain/src/index.ts");
const { createRecoverableDocumentEdits } = await server.ssrLoadModule("/packages/workspace-application/src/recoverable-document-edits.ts");
const { createRecoveryService } = await server.ssrLoadModule("/src/main/infrastructure/recovery-service.ts");
const workspace = domain.createWorkspaceState({ createTextBuffer: domain.createStringTextBuffer });
workspace.registerWindow("window-1");
const tabId = workspace.createUntitledTab("window-1").activeTabId;
const edits = createRecoverableDocumentEdits({ workspace, recovery: createRecoveryService(process.argv[2]) });
await edits.applyDocumentEdits({ tabId, expectedWindowId: "window-1", clientId: "child",
  clientSequence: 1, baseRevision: 0, changes: [{ from: 0, to: 0, insert: "unsaved after crash" }] });
process.stdout.write("RECOVERY_ACK_READY\n");
// Parent kills this process after the durable ACK, without shutdown/compaction.
setInterval(() => {}, 1000);
