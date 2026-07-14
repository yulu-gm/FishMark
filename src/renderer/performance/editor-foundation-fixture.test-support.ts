import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CANONICAL_PERFORMANCE_FIXTURE_ID,
  CANONICAL_PERFORMANCE_FIXTURE_IDENTITY_PATH,
  CANONICAL_PERFORMANCE_FIXTURE_PATH,
  PERFORMANCE_FIXTURE_ENCODING,
  PERFORMANCE_FIXTURE_LINE_COUNT_POLICY,
  PERFORMANCE_FIXTURE_NEWLINE_POLICY,
  PERFORMANCE_FIXTURE_SCHEMA_VERSION,
  type PerformanceFixtureIdentity,
  type VerifiedPerformanceFixture
} from "./editor-foundation-fixture-contract";

export {
  CANONICAL_PERFORMANCE_FIXTURE_ID,
  CANONICAL_PERFORMANCE_FIXTURE_IDENTITY_PATH,
  CANONICAL_PERFORMANCE_FIXTURE_PATH,
  PERFORMANCE_FIXTURE_ENCODING,
  PERFORMANCE_FIXTURE_LINE_COUNT_POLICY,
  PERFORMANCE_FIXTURE_NEWLINE_POLICY,
  PERFORMANCE_FIXTURE_SCHEMA_VERSION
} from "./editor-foundation-fixture-contract";
export type {
  PerformanceFixtureIdentity,
  VerifiedPerformanceFixture
} from "./editor-foundation-fixture-contract";

export function loadCanonicalPerformanceFixture(rootDir: string): VerifiedPerformanceFixture {
  const identityPath = resolve(rootDir, CANONICAL_PERFORMANCE_FIXTURE_IDENTITY_PATH);
  const identity = JSON.parse(readFileSync(identityPath, "utf8")) as unknown;
  const bytes = readFileSync(resolve(rootDir, CANONICAL_PERFORMANCE_FIXTURE_PATH));

  return validatePerformanceFixture({ bytes, identity });
}

export function validatePerformanceFixture(input: {
  bytes: Uint8Array;
  identity: unknown;
}): VerifiedPerformanceFixture {
  const identity = validateIdentity(input.identity);
  const source = decodeUtf8(input.bytes);

  if (source.includes("\r") || source.endsWith("\n")) {
    throw new Error(
      `Fixture newline bytes do not satisfy ${PERFORMANCE_FIXTURE_NEWLINE_POLICY}.`
    );
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (sha256 !== identity.sha256) {
    throw new Error(`Fixture SHA-256 mismatch: expected ${identity.sha256}, received ${sha256}.`);
  }

  if (input.bytes.byteLength !== identity.byteLength) {
    throw new Error(
      `Fixture byte length mismatch: expected ${identity.byteLength}, received ${input.bytes.byteLength}.`
    );
  }

  if (source.length !== identity.sourceLength) {
    throw new Error(
      `Fixture source length mismatch: expected ${identity.sourceLength}, received ${source.length}.`
    );
  }

  const lineCount = source.length === 0 ? 0 : source.split("\n").length;
  if (lineCount !== identity.lineCount) {
    throw new Error(
      `Fixture line count mismatch: expected ${identity.lineCount}, received ${lineCount}.`
    );
  }

  return { identity, source };
}

function validateIdentity(value: unknown): PerformanceFixtureIdentity {
  if (!isRecord(value)) {
    throw new Error("Fixture identity must be a JSON object.");
  }

  assertEqual(value, "schemaVersion", PERFORMANCE_FIXTURE_SCHEMA_VERSION, "schema version");
  assertEqual(value, "fixtureId", CANONICAL_PERFORMANCE_FIXTURE_ID, "fixture id");
  assertEqual(value, "path", CANONICAL_PERFORMANCE_FIXTURE_PATH, "fixture path");
  assertEqual(value, "encoding", PERFORMANCE_FIXTURE_ENCODING, "encoding");
  assertEqual(value, "newlinePolicy", PERFORMANCE_FIXTURE_NEWLINE_POLICY, "newline policy");
  assertEqual(
    value,
    "lineCountPolicy",
    PERFORMANCE_FIXTURE_LINE_COUNT_POLICY,
    "line count policy"
  );
  const lineCount = readNonNegativeInteger(value, "lineCount", "line count");
  const byteLength = readNonNegativeInteger(value, "byteLength", "byte length");
  const sourceLength = readNonNegativeInteger(value, "sourceLength", "source length");
  const sha256 = value.sha256;
  const contentProfile = value.contentProfile;

  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new Error("Fixture identity SHA-256 must be 64 lowercase hexadecimal characters.");
  }

  if (typeof contentProfile !== "string" || contentProfile.trim().length === 0) {
    throw new Error("Fixture identity content profile must be a non-empty string.");
  }

  return Object.freeze({
    schemaVersion: PERFORMANCE_FIXTURE_SCHEMA_VERSION,
    fixtureId: CANONICAL_PERFORMANCE_FIXTURE_ID,
    path: CANONICAL_PERFORMANCE_FIXTURE_PATH,
    sha256,
    lineCount,
    byteLength,
    sourceLength,
    encoding: PERFORMANCE_FIXTURE_ENCODING,
    newlinePolicy: PERFORMANCE_FIXTURE_NEWLINE_POLICY,
    lineCountPolicy: PERFORMANCE_FIXTURE_LINE_COUNT_POLICY,
    contentProfile
  });
}

function assertEqual(
  value: Record<string, unknown>,
  key: string,
  expected: string | number,
  label: string
): void {
  if (value[key] !== expected) {
    throw new Error(`Fixture identity ${label} mismatch.`);
  }
}

function readNonNegativeInteger(
  value: Record<string, unknown>,
  key: string,
  label: string
): number {
  if (!Number.isInteger(value[key]) || (value[key] as number) < 0) {
    throw new Error(`Fixture identity ${label} must be a non-negative integer.`);
  }

  return value[key] as number;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Fixture bytes are not valid UTF-8.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
