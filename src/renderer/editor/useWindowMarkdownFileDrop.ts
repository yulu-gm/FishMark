import { useEffect, useEffectEvent } from "react";

const MARKDOWN_FILE_EXTENSIONS = [".md", ".markdown"] as const;

export function isMarkdownFilePath(targetPath: string): boolean {
  const normalizedPath = targetPath.trim().toLowerCase();

  return MARKDOWN_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

export function getDroppedMarkdownPaths(
  getPathForDroppedFile: (file: File) => string,
  dataTransfer: DataTransfer | null
): string[] {
  const resolvedPaths = new Set<string>();

  for (const file of Array.from(dataTransfer?.files ?? [])) {
    if (!(file instanceof File)) {
      continue;
    }

    const filePath = getPathForDroppedFile(file);

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
  getPathForDroppedFile: (file: File) => string;
  dropMarkdownFiles: (targetPaths: string[]) => Promise<void>;
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

    const targetPaths = getDroppedMarkdownPaths(input.getPathForDroppedFile, event.dataTransfer);

    if (targetPaths.length === 0) {
      return;
    }

    void input.dropMarkdownFiles(targetPaths);
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
