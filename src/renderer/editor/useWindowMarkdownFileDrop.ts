import { useEffect, useEffectEvent } from "react";

const MARKDOWN_FILE_EXTENSIONS = [".md", ".markdown"] as const;

export function isMarkdownFilePath(targetPath: string): boolean {
  const normalizedPath = targetPath.trim().toLowerCase();

  return MARKDOWN_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

export async function getDroppedMarkdownPaths(
  getPathForDroppedFile: (file: File) => string | Promise<string>,
  dataTransfer: DataTransfer | null,
  reportError: (error: unknown) => void
): Promise<string[]> {
  const resolvedPaths = new Set<string>();

  for (const file of Array.from(dataTransfer?.files ?? [])) {
    if (!(file instanceof File)) {
      continue;
    }

    let filePath: string;
    try { filePath = await getPathForDroppedFile(file); }
    catch (error) { reportError(error); continue; }

    if (typeof filePath !== "string" || !isMarkdownFilePath(filePath)) {
      continue;
    }

    resolvedPaths.add(filePath);
  }

  return [...resolvedPaths];
}

export function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  if ((dataTransfer.files?.length ?? 0) > 0) {
    return true;
  }

  return Array.from(dataTransfer.types ?? []).includes("Files");
}

export function useWindowMarkdownFileDrop(input: {
  getPathForDroppedFile: (file: File) => string | Promise<string>;
  dropMarkdownFiles: (targetPaths: string[]) => Promise<void>;
  reportError: (error: unknown) => void;
}): void {
  const handleWindowDragOver = useEffectEvent((event: DragEvent): void => {
    if (!hasFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  });

  const handleWindowDrop = useEffectEvent((event: DragEvent): void => {
    if (!hasFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    void getDroppedMarkdownPaths(input.getPathForDroppedFile, event.dataTransfer, input.reportError)
      .then((targetPaths) => targetPaths.length === 0 ? undefined : input.dropMarkdownFiles(targetPaths))
      .catch(input.reportError);
  });

  useEffect(() => {
    window.addEventListener("dragover", handleWindowDragOver, true);
    window.addEventListener("drop", handleWindowDrop, true);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver, true);
      window.removeEventListener("drop", handleWindowDrop, true);
    };
  }, []);
}
