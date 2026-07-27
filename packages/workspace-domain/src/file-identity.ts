declare const fileLocationIdentityBrand: unique symbol;
declare const fileObjectIdentityBrand: unique symbol;

export type FileLocationIdentity = string & {
  readonly [fileLocationIdentityBrand]: true;
};
export type FileObjectIdentity = string & {
  readonly [fileObjectIdentityBrand]: true;
};
export type FileIdentity = Readonly<{
  location: FileLocationIdentity;
  object: FileObjectIdentity;
}>;

export function fileIdentity(
  location: string,
  object: string = location
): FileIdentity {
  if (location.length === 0 || object.length === 0) {
    throw new TypeError("File identity must not be empty.");
  }
  return Object.freeze({
    location: location as FileLocationIdentity,
    object: object as FileObjectIdentity
  });
}

export function sameFileIdentity(
  first: FileIdentity | null,
  second: FileIdentity | null
): boolean {
  return first === second || (
    first !== null &&
    second !== null &&
    first.location === second.location &&
    first.object === second.object
  );
}
