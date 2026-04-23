import type { ProductBridge } from "../shared/product-bridge";
import type { TestBridge } from "../shared/test-bridge";

export {};

declare global {
  const __FISHMARK_APP_VERSION__: string;

  interface Window {
    fishmark: ProductBridge;
    fishmarkTest?: TestBridge;
  }
}
