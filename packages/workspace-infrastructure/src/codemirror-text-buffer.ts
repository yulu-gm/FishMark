import { Text } from "@codemirror/state";
import {
  validateTextChanges,
  type TextBuffer,
  type TextChange
} from "@fishmark/workspace-domain";

class CodeMirrorTextBuffer implements TextBuffer {
  private constructor(private readonly value: Text) {
    Object.freeze(this);
  }

  static fromString(value: string): CodeMirrorTextBuffer {
    return new CodeMirrorTextBuffer(Text.of(value.split("\n")));
  }

  get length(): number {
    return this.value.length;
  }

  apply(changes: readonly TextChange[]): TextBuffer {
    validateTextChanges(changes, this.length);
    if (changes.length === 0) {
      return this;
    }

    let value = this.value;
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const change = changes[index]!;
      value = value.replace(
        change.from,
        change.to,
        Text.of(change.insert.split("\n"))
      );
    }
    return new CodeMirrorTextBuffer(value);
  }

  equals(other: TextBuffer): boolean {
    if (this === other) {
      return true;
    }
    if (other instanceof CodeMirrorTextBuffer) {
      return this.value.eq(other.value);
    }
    return this.length === other.length && this.toString() === other.toString();
  }

  slice(from: number, to = this.length): string {
    return this.value.sliceString(from, to);
  }

  toString(): string {
    return this.value.sliceString(0, this.length);
  }
}

export function createCodeMirrorTextBuffer(value: string): TextBuffer {
  return CodeMirrorTextBuffer.fromString(value);
}
