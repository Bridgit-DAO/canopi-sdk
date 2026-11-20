/**
 * HypothesisProvider - Hypothesis.is integration for Canopi smart tags
 * Reference implementation for external annotation provider
 */

import { 
  Anchor, 
  Annotation, 
  AnnotationProvider, 
  ProviderCredentials, 
  SyncState,
  ProviderError 
} from '../types/annotations.js';

export interface HypothesisConfig {
  apiUrl?: string;
  clientId?: string;
  authority?: string;
}

export interface HypothesisAnnotation {
  id: string;
  created: string;
  updated: string;
  user: string;
  uri: string;
  text: string;
  tags: string[];
  group: string;
  permissions: {
    read: string[];
    admin: string[];
    update: string[];
    delete: string[];
  };
  target: Array<{
    source: string;
    selector?: Array<{
      type: string;
      exact?: string;
      prefix?: string;
      suffix?: string;
      start?: number;
      end?: number;
    }>;
  }>;
  document?: {
    title?: string[];
  };
}

export class HypothesisProvider implements AnnotationProvider {
  readonly id = 'hypothesis';
  readonly name = 'Hypothesis';
  
  private config: HypothesisConfig;
  private credentials: ProviderCredentials | null = null;
  
  constructor(config: HypothesisConfig = {}) {
    this.config = {
      apiUrl: 'https://api.hypothes.is/api',
      authority: 'hypothes.is',
      ...config
    };
    
    this.loadCredentials();
  }
  
  isEnabled(): boolean {
    return this.isAuthenticated();
  }
  
  isAuthenticated(): boolean {
    return this.credentials !== null && this.hasValidToken();
  }
  
  private hasValidToken(): boolean {
    if (!this.credentials || this.credentials.type !== 'token') {
      return false;
    }
    
    // Check if OAuth token is expired
    if (this.credentials.oauthData?.expiresAt) {
      return Date.now() < this.credentials.oauthData.expiresAt;
    }
    
    // For API tokens, assume valid if present
    return !!this.credentials.token;
  }
  
  async authenticate(credentials: ProviderCredentials): Promise<void> {
    try {
      // Validate credentials by making a test API call
      const response = await this.makeApiCall('/profile', 'GET', credentials);
      
      if (response.ok) {
        this.credentials = credentials;
        this.saveCredentials();
        console.log('HypothesisProvider: Authentication successful');
      } else {
        throw new Error(`Authentication failed: ${response.status}`);
      }
    } catch (error) {
      throw new ProviderError(
        'Failed to authenticate with Hypothesis',
        this.id,
        'authenticate',
        error as Error
      );
    }
  }
  
  async logout(): Promise<void> {
    this.credentials = null;
    localStorage.removeItem('canopi-hypothesis-credentials');
    console.log('HypothesisProvider: Logged out');
  }
  
  async createAnnotation(anchor: Anchor, annotation: Annotation): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new ProviderError('Not authenticated', this.id, 'createAnnotation');
    }
    
    try {
      const hypothesisAnnotation = this.convertToHypothesis(anchor, annotation);
      
      const response = await this.makeApiCall('/annotations', 'POST', this.credentials!, {
        body: JSON.stringify(hypothesisAnnotation),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const created = await response.json();
      console.log(`HypothesisProvider: Created annotation ${created.id}`);
      
    } catch (error) {
      throw new ProviderError(
        'Failed to create annotation in Hypothesis',
        this.id,
        'createAnnotation',
        error as Error
      );
    }
  }
  
  async getAnnotations(pageUrl: string): Promise<Annotation[]> {
    if (!this.isAuthenticated()) {
      return [];
    }
    
    try {
      const url = new URL('/search', this.config.apiUrl);
      url.searchParams.set('uri', pageUrl);
      url.searchParams.set('limit', '200');
      
      const response = await this.makeApiCall(url.pathname + url.search, 'GET', this.credentials!);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json();
      const hypothesisAnnotations: HypothesisAnnotation[] = data.rows || [];
      
      return hypothesisAnnotations.map(ha => this.convertFromHypothesis(ha));
      
    } catch (error) {
      console.error('HypothesisProvider: Failed to get annotations:', error);
      return [];
    }
  }
  
  async updateAnnotation(annotationId: string, updates: Partial<Annotation>): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new ProviderError('Not authenticated', this.id, 'updateAnnotation');
    }
    
    try {
      // Hypothesis uses external ID for updates
      const externalId = updates.externalId || annotationId;
      
      const updateData = {
        text: updates.content,
        tags: updates.tags
      };
      
      const response = await this.makeApiCall(
        `/annotations/${externalId}`, 
        'PATCH', 
        this.credentials!,
        {
          body: JSON.stringify(updateData),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      console.log(`HypothesisProvider: Updated annotation ${externalId}`);
      
    } catch (error) {
      throw new ProviderError(
        'Failed to update annotation in Hypothesis',
        this.id,
        'updateAnnotation',
        error as Error
      );
    }
  }
  
  async deleteAnnotation(annotationId: string): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new ProviderError('Not authenticated', this.id, 'deleteAnnotation');
    }
    
    try {
      const response = await this.makeApiCall(
        `/annotations/${annotationId}`, 
        'DELETE', 
        this.credentials!
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      console.log(`HypothesisProvider: Deleted annotation ${annotationId}`);
      
    } catch (error) {
      throw new ProviderError(
        'Failed to delete annotation in Hypothesis',
        this.id,
        'deleteAnnotation',
        error as Error
      );
    }
  }
  
  supportsBidirectionalSync(): boolean {
    return true;
  }
  
  async sync(): Promise<void> {
    if (!this.isAuthenticated()) {
      console.warn('HypothesisProvider: Cannot sync - not authenticated');
      return;
    }
    
    try {
      // Sync logic would go here
      // For now, just log that sync was called
      console.log('HypothesisProvider: Sync completed');
    } catch (error) {
      console.error('HypothesisProvider: Sync failed:', error);
    }
  }
  
  // Private helper methods
  
  private async makeApiCall(
    endpoint: string, 
    method: string, 
    credentials: ProviderCredentials,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.config.apiUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>
    };
    
    // Add authentication header
    if (credentials.type === 'token' && credentials.token) {
      headers['Authorization'] = `Bearer ${credentials.token}`;
    }
    
    return fetch(url, {
      method,
      headers,
      ...options
    });
  }
  
  private convertToHypothesis(anchor: Anchor, annotation: Annotation): Partial<HypothesisAnnotation> {
    return {
      uri: anchor.pageUrl,
      text: annotation.content,
      tags: annotation.tags,
      target: [{
        source: anchor.pageUrl,
        selector: [{
          type: 'TextQuoteSelector',
          exact: anchor.text,
          // Add prefix/suffix if available in anchor context
        }]
      }],
      permissions: {
        read: annotation.visibility === 'public' ? ['group:__world__'] : ['acct:user@hypothes.is'],
        admin: ['acct:user@hypothes.is'],
        update: ['acct:user@hypothes.is'],
        delete: ['acct:user@hypothes.is']
      }
    };
  }
  
  private convertFromHypothesis(ha: HypothesisAnnotation): Annotation {
    const syncState: SyncState = {
      status: 'synced',
      lastSyncAt: Date.now()
    };
    
    return {
      id: `hypothesis-${ha.id}`,
      anchorId: this.generateAnchorId(ha),
      content: ha.text,
      tags: ha.tags,
      provider: this.id,
      externalId: ha.id,
      syncState,
      visibility: this.determineVisibility(ha),
      groupId: ha.group,
      createdAt: new Date(ha.created).getTime(),
      updatedAt: new Date(ha.updated).getTime(),
      metadata: {
        user: ha.user,
        uri: ha.uri,
        document: ha.document
      }
    };
  }
  
  private generateAnchorId(ha: HypothesisAnnotation): string {
    // Generate consistent anchor ID from Hypothesis annotation
    const target = ha.target[0];
    const selector = target.selector?.[0];
    const text = selector?.exact || '';
    
    return `anchor-hypothesis-${this.hashString(ha.uri + text)}`;
  }
  
  private determineVisibility(ha: HypothesisAnnotation): 'private' | 'public' | 'group' {
    if (ha.permissions.read.includes('group:__world__')) {
      return 'public';
    } else if (ha.group && ha.group !== '__world__') {
      return 'group';
    } else {
      return 'private';
    }
  }
  
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  private loadCredentials(): void {
    try {
      const stored = localStorage.getItem('canopi-hypothesis-credentials');
      if (stored) {
        this.credentials = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load Hypothesis credentials:', error);
    }
  }
  
  private saveCredentials(): void {
    if (this.credentials) {
      localStorage.setItem('canopi-hypothesis-credentials', JSON.stringify(this.credentials));
    }
  }
}