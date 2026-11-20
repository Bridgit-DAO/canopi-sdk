/**
 * LocalProvider - Default local storage provider for Canopi annotations
 * Stores annotations in browser localStorage with no external dependencies
 */

import { Anchor, Annotation, AnnotationProvider, AnnotationStorage, AnchorStorage } from '../types/annotations.js';

export class LocalProvider implements AnnotationProvider {
  readonly id = 'local';
  readonly name = 'Local Storage';
  
  private annotationStorage: AnnotationStorage;
  private anchorStorage: AnchorStorage;
  
  constructor() {
    this.annotationStorage = new LocalAnnotationStorage();
    this.anchorStorage = new LocalAnchorStorage();
  }
  
  isEnabled(): boolean {
    return typeof localStorage !== 'undefined';
  }
  
  async createAnnotation(anchor: Anchor, annotation: Annotation): Promise<void> {
    try {
      // Save anchor first
      await this.anchorStorage.save(anchor);
      
      // Then save annotation
      const localAnnotation = {
        ...annotation,
        provider: this.id,
        syncState: {
          status: 'synced' as const,
          lastSyncAt: Date.now()
        }
      };
      
      await this.annotationStorage.save(localAnnotation);
      
      console.log(`LocalProvider: Created annotation ${annotation.id} for anchor ${anchor.id}`);
    } catch (error) {
      console.error('LocalProvider: Failed to create annotation:', error);
      throw error;
    }
  }
  
  async getAnnotations(pageUrl: string): Promise<Annotation[]> {
    try {
      // Get all anchors for this URL
      const anchors = await this.anchorStorage.loadByUrl(pageUrl);
      
      // Get annotations for all anchors
      const allAnnotations: Annotation[] = [];
      for (const anchor of anchors) {
        const annotations = await this.annotationStorage.loadByAnchor(anchor.id);
        allAnnotations.push(...annotations);
      }
      
      return allAnnotations.filter(annotation => annotation.provider === this.id);
    } catch (error) {
      console.error('LocalProvider: Failed to get annotations:', error);
      return [];
    }
  }
  
  async updateAnnotation(annotationId: string, updates: Partial<Annotation>): Promise<void> {
    try {
      const updatedAnnotation = {
        ...updates,
        updatedAt: Date.now(),
        syncState: {
          status: 'synced' as const,
          lastSyncAt: Date.now()
        }
      };
      
      await this.annotationStorage.update(annotationId, updatedAnnotation);
      
      console.log(`LocalProvider: Updated annotation ${annotationId}`);
    } catch (error) {
      console.error('LocalProvider: Failed to update annotation:', error);
      throw error;
    }
  }
  
  async deleteAnnotation(annotationId: string): Promise<void> {
    try {
      await this.annotationStorage.delete(annotationId);
      console.log(`LocalProvider: Deleted annotation ${annotationId}`);
    } catch (error) {
      console.error('LocalProvider: Failed to delete annotation:', error);
      throw error;
    }
  }
  
  // Local provider doesn't need sync
  supportsBidirectionalSync(): boolean {
    return false;
  }
}

// Local storage implementation for annotations
class LocalAnnotationStorage implements AnnotationStorage {
  private readonly storageKey = 'canopi-annotations';
  
  async save(annotation: Annotation): Promise<void> {
    const annotations = await this.loadAll();
    annotations[annotation.id] = annotation;
    localStorage.setItem(this.storageKey, JSON.stringify(annotations));
  }
  
  async load(annotationId: string): Promise<Annotation | null> {
    const annotations = await this.loadAll();
    return annotations[annotationId] || null;
  }
  
  async loadByAnchor(anchorId: string): Promise<Annotation[]> {
    const annotations = await this.loadAll();
    return Object.values(annotations).filter(annotation => annotation.anchorId === anchorId);
  }
  
  async loadByUrl(_pageUrl: string): Promise<Annotation[]> {
    // This method requires cross-referencing with anchors
    // For now, return empty array - should be handled by provider
    return [];
  }
  
  async update(annotationId: string, updates: Partial<Annotation>): Promise<void> {
    const annotations = await this.loadAll();
    if (annotations[annotationId]) {
      annotations[annotationId] = { ...annotations[annotationId], ...updates };
      localStorage.setItem(this.storageKey, JSON.stringify(annotations));
    }
  }
  
  async delete(annotationId: string): Promise<void> {
    const annotations = await this.loadAll();
    delete annotations[annotationId];
    localStorage.setItem(this.storageKey, JSON.stringify(annotations));
  }
  
  async clear(): Promise<void> {
    localStorage.removeItem(this.storageKey);
  }
  
  private async loadAll(): Promise<Record<string, Annotation>> {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load annotations from localStorage:', error);
      return {};
    }
  }
}

// Local storage implementation for anchors
class LocalAnchorStorage implements AnchorStorage {
  private readonly storageKey = 'canopi-anchors';
  
  async save(anchor: Anchor): Promise<void> {
    const anchors = await this.loadAll();
    anchors[anchor.id] = anchor;
    localStorage.setItem(this.storageKey, JSON.stringify(anchors));
  }
  
  async load(anchorId: string): Promise<Anchor | null> {
    const anchors = await this.loadAll();
    return anchors[anchorId] || null;
  }
  
  async loadByUrl(pageUrl: string): Promise<Anchor[]> {
    const anchors = await this.loadAll();
    return Object.values(anchors).filter(anchor => anchor.pageUrl === pageUrl);
  }
  
  async update(anchorId: string, updates: Partial<Anchor>): Promise<void> {
    const anchors = await this.loadAll();
    if (anchors[anchorId]) {
      anchors[anchorId] = { ...anchors[anchorId], ...updates };
      localStorage.setItem(this.storageKey, JSON.stringify(anchors));
    }
  }
  
  async delete(anchorId: string): Promise<void> {
    const anchors = await this.loadAll();
    delete anchors[anchorId];
    localStorage.setItem(this.storageKey, JSON.stringify(anchors));
  }
  
  async clear(): Promise<void> {
    localStorage.removeItem(this.storageKey);
  }
  
  private async loadAll(): Promise<Record<string, Anchor>> {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load anchors from localStorage:', error);
      return {};
    }
  }
}