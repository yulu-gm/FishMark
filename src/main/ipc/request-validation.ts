/** IPC input checks are transport shape checks; services retain domain normalization. */
export function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalidRequest();
}
export function string(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) invalidRequest();
}
export function nullableString(value: unknown): asserts value is string | null {
  if (value !== null) string(value);
}
export function index(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalidRequest();
}
export function boolean(value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") invalidRequest();
}
export function noArguments(args: readonly unknown[]): void {
  if (args.length !== 0) invalidRequest();
}
export function oneArgument(args: readonly unknown[]): unknown {
  if (args.length !== 1) invalidRequest();
  return args[0];
}
export function invalidRequest(): never { throw new Error("Invalid IPC request."); }
