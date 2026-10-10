import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { instrumentRuntimeFunctions, runtimePhaseTargets, createRuntimePhaseInstrumentation } from "./runtime-phase-instrumentation.mjs";

test("all frozen target names match exactly one synchronous block body", () => {
  for (const [file, names] of Object.entries(runtimePhaseTargets)) {
    const result = instrumentRuntimeFunctions(readFileSync(file, "utf8"), file, names);
    assert.equal(result.matched.length, names.length);
  }
});

test("instrumentation preserves nested returns, finally, throws and method receiver", () => {
  const source = `function inner(n: number) { if (n < 0) throw new Error('negative'); return n * 2; }
    function outer(n: number) { try { return inner(n) + 1; } finally { marks.push('original-finally'); } }
    const object = { value: 3, method(n: number) { return this.value + outer(n); } };`;
  const transformed = instrumentRuntimeFunctions(source, "example.ts", ["inner", "outer", "method"]);
  const events = [];
  const context = vm.createContext({ marks: [], __fishmarkRuntimePhaseTiming: {
    begin: label => { events.push(`begin:${label}`); return label; },
    end: token => events.push(`end:${token}`)
  } });
  vm.runInContext(ts.transpileModule(transformed.code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  assert.equal(vm.runInContext("object.method(2)", context), 8);
  assert.throws(() => vm.runInContext("object.method(-1)", context), /negative/);
  assert.equal(context.marks.length, 2);
  assert.equal(events.filter(s => s.startsWith("begin:")).length, 6);
  assert.deepEqual(events.filter(s => s.startsWith("end:")).slice(-3), ["end:example.ts#inner", "end:example.ts#outer", "end:example.ts#method"]);
});

test("refuses missing, duplicate or asynchronous targets; leaves unrelated modules alone", () => {
  assert.throws(() => instrumentRuntimeFunctions("function other() {}", "x.ts", ["missing"]), /Expected one/);
  assert.throws(() => instrumentRuntimeFunctions("function x() {} function x() {}", "x.ts", ["x"]), /Expected one/);
  assert.throws(() => instrumentRuntimeFunctions("async function x() {}", "x.ts", ["x"]), /synchronous/);
  const instrumentation = createRuntimePhaseInstrumentation("C:/repo");
  assert.equal(instrumentation.plugin.transform("export const x=1", "C:/repo/unrelated.ts"), null);
  assert.deepEqual(instrumentation.manifest(), []);
});
