# Yulora Test Cases

This file is used for developer self-checks, review validation, and regression coverage.

---

## 1. File System

### TC-001 New File Round Trip

Steps:

1. Open the app.
2. Create a new document.
3. Enter content.
4. Save the file.
5. Restart the app and reopen the file.

Expected:

- the content matches what was entered
- the file opens without encoding issues

### TC-002 Autosave

Steps:

1. Open a document.
2. Type new content.
3. Do not save manually.
4. Wait for autosave to trigger.
5. Force close the app.
6. Reopen the document.

Expected:

- the latest edits are preserved
- no data is lost

### TC-003 Crash Recovery

Steps:

1. Edit an open document.
2. Terminate the app unexpectedly.
3. Reopen the app.

Expected:

- the most recent unsaved state is restored

## 2. Editing Behavior

### TC-010 Heading Input

Steps:

1. Type `# hello`.

Expected:

- the heading is recognized as H1
- the cursor remains stable

### TC-011 List Behavior

Steps:

1. Type `- item`.
2. Press Enter.
3. Type a second item.
4. Press Enter twice.

Expected:

- the list continues correctly
- an empty item exits the list

### TC-012 Code Block

Steps:

1. Enter a fenced code block.
2. Type code inside it.
3. Press Tab.

Expected:

- indentation is inserted
- the caret stays within the code block

## 3. Input Method

### TC-020 Chinese IME

Steps:

1. Switch to a Chinese input method.
2. Type headings, lists, and plain text.

Expected:

- no character loss
- no cursor jumping during composition

## 4. Images

### TC-030 Paste Image

Steps:

1. Copy an image.
2. Paste it into the editor.

Expected:

- the image file is written locally
- Markdown reference text is inserted
- the path is correct

### TC-031 Drag Image

Steps:

1. Drag an image into the editor.

Expected:

- the image is inserted
- the file is saved locally

## 5. Search

### TC-040 Search

Steps:

1. Enter multiple keywords.
2. Search the document.

Expected:

- matches are highlighted
- match navigation works

## 6. Export

### TC-050 HTML Export

Steps:

1. Export the current document to HTML.
2. Open the exported file.

Expected:

- content matches the source document
- styling is broadly preserved

### TC-051 PDF Export

Steps:

1. Export the current document to PDF.

Expected:

- the layout is legible
- the output is not truncated

## 7. Performance

### TC-060 Long Document

Steps:

1. Open a document with 5000+ lines.
2. Scroll.
3. Edit text.

Expected:

- the app stays responsive
- input remains usable

## 8. Cross-Platform

### TC-070 Windows Launch

Expected:

- the app launches on Windows
- the app can save a file

### TC-071 macOS Launch

Expected:

- the app launches on macOS
- the app can save a file

## 9. Regression Rules

Each finished task should record which tests were run and whether they passed. At minimum, verify the areas affected by the task and include any file operations, editor behavior, or regression-sensitive paths that were touched.

