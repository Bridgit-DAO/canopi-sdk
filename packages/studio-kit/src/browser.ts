/** Browser bundle for the Studio preview: the runtime plus the host-less mock CanopiTab. */
export * from './runtime.js';
export { createMockTab } from './mockTab.js';
export type { MockTab, MockTabOptions } from './mockTab.js';
