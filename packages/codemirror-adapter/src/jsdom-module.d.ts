// jsdom ships no type declarations and @types/jsdom is not a dependency of this repository.
// This is the minimal ambient surface the moved decoration test needs in its node environment.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
