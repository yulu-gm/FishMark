import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const sourceDir = path.join(process.cwd(), "src", "renderer", "theme-packages");
const targetDir = path.join(process.cwd(), "dist", "theme-packages");

if (!existsSync(sourceDir)) {
  throw new Error(`Builtin theme packages source directory not found: ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(path.dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
