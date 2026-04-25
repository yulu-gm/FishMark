import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { runCodeMirrorMarkdownCommand } from "./codemirror-markdown-command-adapter";
import {
  runMarkdownArrowDownCommand,
  runMarkdownArrowUpCommand,
  runMarkdownBackspaceCommand,
  runMarkdownEnterCommand,
  runMarkdownShiftTabCommand,
  runMarkdownTabCommand
} from "./markdown-commands";

export function runMarkdownEnter(view: EditorView, activeState: ActiveBlockState): boolean {
  return runCodeMirrorMarkdownCommand(view, activeState, runMarkdownEnterCommand);
}

export function runMarkdownBackspace(view: EditorView, activeState: ActiveBlockState): boolean {
  return runCodeMirrorMarkdownCommand(view, activeState, runMarkdownBackspaceCommand);
}

export function runMarkdownTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runCodeMirrorMarkdownCommand(view, activeState, runMarkdownTabCommand);
}

export function runMarkdownShiftTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runCodeMirrorMarkdownCommand(view, activeState, runMarkdownShiftTabCommand);
}

export function runMarkdownArrowDown(view: EditorView, activeState: ActiveBlockState): boolean {
  return runCodeMirrorMarkdownCommand(view, activeState, runMarkdownArrowDownCommand);
}

export function runMarkdownArrowUp(view: EditorView, activeState: ActiveBlockState): boolean {
  return runCodeMirrorMarkdownCommand(view, activeState, runMarkdownArrowUpCommand);
}
