export const PERFORMANCE_FIXTURE_SCHEMA_VERSION = 1 as const;
export const CANONICAL_PERFORMANCE_FIXTURE_ID =
  "fishmark-rf-complex-20000-lines-v1" as const;
export const CANONICAL_PERFORMANCE_FIXTURE_PATH =
  "fixtures/performance/complex-20000-lines.md" as const;
export const CANONICAL_PERFORMANCE_FIXTURE_IDENTITY_PATH =
  "fixtures/performance/complex-20000-lines.fixture.json" as const;
export const PERFORMANCE_FIXTURE_ENCODING = "utf-8" as const;
export const PERFORMANCE_FIXTURE_NEWLINE_POLICY =
  "lf-only-no-final-newline" as const;
export const PERFORMANCE_FIXTURE_LINE_COUNT_POLICY =
  "logical-lines-separated-by-lf" as const;

export type PerformanceFixtureIdentity = {
  schemaVersion: typeof PERFORMANCE_FIXTURE_SCHEMA_VERSION;
  fixtureId: typeof CANONICAL_PERFORMANCE_FIXTURE_ID;
  path: typeof CANONICAL_PERFORMANCE_FIXTURE_PATH;
  sha256: string;
  lineCount: number;
  byteLength: number;
  sourceLength: number;
  encoding: typeof PERFORMANCE_FIXTURE_ENCODING;
  newlinePolicy: typeof PERFORMANCE_FIXTURE_NEWLINE_POLICY;
  lineCountPolicy: typeof PERFORMANCE_FIXTURE_LINE_COUNT_POLICY;
  contentProfile: string;
};

export type VerifiedPerformanceFixture = {
  identity: PerformanceFixtureIdentity;
  source: string;
};
