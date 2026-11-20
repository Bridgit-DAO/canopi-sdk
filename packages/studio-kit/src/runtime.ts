/**
 * Browser runtime: what an exported tablication needs (renderers, data sources, bindings).
 * Bundled into src/generated/runtime-source.ts and shipped as studio-kit.js in every
 * scaffolded tablication. No ajv, no manifest validator, no Node APIs.
 */
export { renderSidebar, renderComponent, SIDEBAR_CSS, toText, safeUrl } from './render.js';
export type { RenderOptions, SidebarHandle } from './render.js';
export { humanizeField, fieldLabel, formatNumber, formatTimestamp } from './format.js';
export type { FieldHint } from './format.js';
export { createDataSource, createMemoryDataSource, pickFixture, fillTemplate, DataSourceError } from './datasource.js';
export type { DataSource, DataSourceOptions } from './datasource.js';
export { resolveBinding, parseBindingPath, isValidBindingPath, getField } from './binding.js';
export type { PathSegment } from './binding.js';
