/**
 * Canopi Smart Tags - Type Definitions
 * Based on bike rack architecture and canopi anchor specifications
 */

// Core anchor interface - aligned with canopi/src/types/anchors.ts
export interface Anchor {
  id: string;
  selector: string;              // CSS selector or XPath
  text: string;                  // Captured selection text (display + fallback match)
  pageUrl: string;               // Canonical target URL (from CanonicalUrlService)
  startOffset?: number;
  endOffset?: number;
  messageIds?: string[];
  createdAt?: number;
  [key: string]: unknown;
}

// Enhanced anchor with context information
export interface EnhancedAnchor extends Anchor {
  textAnchorContext?: {
    before: string;              // Text before selection
    after: string;               // Text after selection
    containerTag: string;        // HTML tag containing selection
    containerClasses: string;    // CSS classes of container
  };
  expandedText?: string;         // Full sentence containing selection
  contentHash?: string;          // Hash for content verification
}

// Annotation interface - smart tag content
export interface Annotation {
  id: string;
  anchorId: string;             // Reference to anchor
  content: string;              // Annotation text/content
  tags: string[];               // User-defined tags
  provider: string;             // Provider ID (local, hypothesis, etc.)
  externalId?: string;          // ID in external system (e.g., Hypothesis)
  syncState?: SyncState;        // Synchronization status
  visibility?: 'private' | 'public' | 'group';
  groupId?: string;             // Group ID for group visibility
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// Synchronization state
export interface SyncState {
  status: 'pending' | 'synced' | 'failed' | 'conflict';
  lastSyncAt?: number;
  error?: string;
  conflictData?: unknown;
}

// Provider interface - pluggable annotation backends
export interface AnnotationProvider {
  readonly id: string;
  readonly name: string;
  
  // Provider status
  isEnabled(): boolean;
  isAuthenticated?(): boolean;
  
  // Core operations
  createAnnotation(anchor: Anchor, annotation: Annotation): Promise<void>;
  getAnnotations(pageUrl: string): Promise<Annotation[]>;
  updateAnnotation?(annotationId: string, updates: Partial<Annotation>): Promise<void>;
  deleteAnnotation?(annotationId: string): Promise<void>;
  
  // Synchronization (optional)
  sync?(): Promise<void>;
  supportsBidirectionalSync?(): boolean;
  
  // Authentication (optional)
  authenticate?(credentials: ProviderCredentials): Promise<void>;
  logout?(): Promise<void>;
}

// Provider credentials
export interface ProviderCredentials {
  type: 'token' | 'oauth' | 'basic';
  token?: string;
  username?: string;
  password?: string;
  oauthData?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

// Provider configuration
export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  credentials?: ProviderCredentials;
  settings?: Record<string, unknown>;
}

// Smart tag events
export interface SmartTagEvent {
  type: 'selection' | 'annotation' | 'sync' | 'provider';
  data: unknown;
  timestamp: number;
}

export interface SelectionChangedEvent extends SmartTagEvent {
  type: 'selection';
  data: {
    selection: Selection;
    text: string;
    anchor?: Anchor;
  };
}

export interface AnnotationEvent extends SmartTagEvent {
  type: 'annotation';
  data: {
    action: 'created' | 'updated' | 'deleted' | 'loaded';
    annotation: Annotation;
    anchor?: Anchor;
  };
}

export interface SyncEvent extends SmartTagEvent {
  type: 'sync';
  data: {
    provider: string;
    status: 'started' | 'completed' | 'failed';
    error?: string;
  };
}

export interface ProviderEvent extends SmartTagEvent {
  type: 'provider';
  data: {
    provider: string;
    action: 'enabled' | 'disabled' | 'authenticated' | 'error';
    error?: string;
  };
}

// UI-related types
export interface AnnotationUIOptions {
  showToolbar?: boolean;
  showCategories?: boolean;
  allowCustomStyles?: boolean;
  enableRichText?: boolean;
  maxTags?: number;
}

export interface AnnotationStyle {
  backgroundColor?: string;
  color?: string;
  border?: string;
  padding?: string;
  borderRadius?: string;
  boxShadow?: string;
  textDecoration?: string;
}

export interface AnnotationPreset {
  id: string;
  name: string;
  description?: string;
  style: AnnotationStyle;
  category?: string;
}

// Storage interfaces
export interface AnnotationStorage {
  save(annotation: Annotation): Promise<void>;
  load(annotationId: string): Promise<Annotation | null>;
  loadByAnchor(anchorId: string): Promise<Annotation[]>;
  loadByUrl(pageUrl: string): Promise<Annotation[]>;
  update(annotationId: string, updates: Partial<Annotation>): Promise<void>;
  delete(annotationId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AnchorStorage {
  save(anchor: Anchor): Promise<void>;
  load(anchorId: string): Promise<Anchor | null>;
  loadByUrl(pageUrl: string): Promise<Anchor[]>;
  update(anchorId: string, updates: Partial<Anchor>): Promise<void>;
  delete(anchorId: string): Promise<void>;
  clear(): Promise<void>;
}

// Configuration interfaces
export interface SmartTagConfig {
  providers?: string[];
  defaultProvider?: string;
  syncEnabled?: boolean;
  autoSave?: boolean;
  uiOptions?: AnnotationUIOptions;
  storageConfig?: {
    annotations?: AnnotationStorage;
    anchors?: AnchorStorage;
  };
}

// Error types
export class SmartTagError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SmartTagError';
  }
}

export class ProviderError extends SmartTagError {
  constructor(
    message: string,
    public provider: string,
    public operation: string,
    originalError?: Error
  ) {
    super(message, 'PROVIDER_ERROR', provider, originalError);
    this.name = 'ProviderError';
  }
}

export class SyncError extends SmartTagError {
  constructor(
    message: string,
    public provider: string,
    public conflictData?: unknown,
    originalError?: Error
  ) {
    super(message, 'SYNC_ERROR', provider, originalError);
    this.name = 'SyncError';
  }
}

// Utility types
export type AnnotationFilter = {
  provider?: string;
  tags?: string[];
  dateRange?: {
    start: number;
    end: number;
  };
  visibility?: 'private' | 'public' | 'group';
  textSearch?: string;
};

export type AnnotationSort = {
  field: 'createdAt' | 'updatedAt' | 'content' | 'tags';
  direction: 'asc' | 'desc';
};

// Re-export for convenience
// Provider types are exported from src/providers/* – not from this types file.
// UI types are defined in src/ – not re-exported from this types file.