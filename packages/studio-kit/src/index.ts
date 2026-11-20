export type {
  StudioProject, Stage, Idea, Component, Binding, DataSourceDescriptor, DataSourceKind, Fixture, Design, Extracted, Entity,
  SidebarComponentType, SmartTagComponentType,
} from './types.js';
export { STAGES, CATALOGUE, SIDEBAR_COMPONENTS, SIDEBAR_COMPONENT_TYPES, SMART_TAG_COMPONENTS, SMART_TAG_COMPONENT_TYPES } from './catalogue.js';
export type { CatalogueEntry } from './catalogue.js';
export { PROJECT_SCHEMA, STAGE_OUTPUT_SCHEMAS, EXTRACTED_SCHEMA } from './schema.js';
export { validateProject, validateStageOutput } from './validate.js';
export type { ProjectIssue, ProjectValidation } from './validate.js';
export { scaffoldModules, ScaffoldError } from './scaffold.js';
export type { ScaffoldFile, ScaffoldOptions, ScaffoldResult } from './scaffold.js';
export { RUNTIME_SOURCE } from './generated/runtime-source.js';
export * from './browser.js';
