import base from "./playwright.config.mjs";
process.env.FISHMARK_E2E_OPEN_PERFORMANCE = "1";
export default { ...base, testMatch: "open-performance.probe.mjs" };
