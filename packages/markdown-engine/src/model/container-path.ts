// A container path is the structural ancestry of a node: the child index taken at each
// container level, from the document root inward. It is independent of raw offsets, so it
// stays meaningful while a document is edited above the node.

export type ContainerPath = readonly number[];

export const ROOT_CONTAINER_PATH: ContainerPath = Object.freeze([]);

export function childContainerPath(path: ContainerPath, childIndex: number): ContainerPath {
  if (!Number.isSafeInteger(childIndex) || childIndex < 0) {
    throw new RangeError("Container child index must be a non-negative safe integer.");
  }
  return Object.freeze([...path, childIndex]);
}

export function containerPathDepth(path: ContainerPath): number {
  return path.length;
}

export function isRootContainerPath(path: ContainerPath): boolean {
  return path.length === 0;
}

export function containerPathKey(path: ContainerPath): string {
  return path.join(".");
}

export function sameContainerPath(left: ContainerPath, right: ContainerPath): boolean {
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment === right[index]);
}

export function isContainerPathAncestor(
  ancestor: ContainerPath,
  descendant: ContainerPath
): boolean {
  if (ancestor.length >= descendant.length) return false;
  return ancestor.every((segment, index) => segment === descendant[index]);
}

export function compareContainerPaths(left: ContainerPath, right: ContainerPath): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (left.length === right.length) return 0;
  return left.length < right.length ? -1 : 1;
}
