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
  readonly schemaVersion: typeof PERFORMANCE_FIXTURE_SCHEMA_VERSION;
  readonly fixtureId: typeof CANONICAL_PERFORMANCE_FIXTURE_ID;
  readonly path: typeof CANONICAL_PERFORMANCE_FIXTURE_PATH;
  readonly sha256: string;
  readonly lineCount: number;
  readonly byteLength: number;
  readonly sourceLength: number;
  readonly encoding: typeof PERFORMANCE_FIXTURE_ENCODING;
  readonly newlinePolicy: typeof PERFORMANCE_FIXTURE_NEWLINE_POLICY;
  readonly lineCountPolicy: typeof PERFORMANCE_FIXTURE_LINE_COUNT_POLICY;
  readonly contentProfile: string;
};

export type VerifiedPerformanceFixture = {
  readonly identity: PerformanceFixtureIdentity;
  readonly source: string;
};
