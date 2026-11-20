/**
 * CanonicalUrlService - URL normalization for canopi proxy and direct access
 * Based on canopi bike rack implementation plan Phase 0
 */

export interface CanonicalUrlService {
  getCanonicalUrl(rawUrl: string): string;
  isProxyUrl(url: string): boolean;
  extractTargetUrl(proxyUrl: string): string | null;
}

export class DefaultCanonicalUrlService implements CanonicalUrlService {
  private proxyPatterns: RegExp[] = [
    /canopi\.live\/proxy\?url=(.+)/,
    /canopi\.com\/proxy\?url=(.+)/,
    /localhost:\d+\/proxy\?url=(.+)/,
    // Add more proxy patterns as needed
  ];
  
  getCanonicalUrl(rawUrl: string): string {
    try {
      // First, check if this is a proxy URL
      if (this.isProxyUrl(rawUrl)) {
        const targetUrl = this.extractTargetUrl(rawUrl);
        if (targetUrl) {
          return this.normalizeUrl(targetUrl);
        }
      }
      
      // Not a proxy URL, normalize directly
      return this.normalizeUrl(rawUrl);
    } catch (error) {
      console.warn('CanonicalUrlService: Failed to parse URL:', rawUrl, error);
      return rawUrl;
    }
  }
  
  isProxyUrl(url: string): boolean {
    return this.proxyPatterns.some(pattern => pattern.test(url));
  }
  
  extractTargetUrl(proxyUrl: string): string | null {
    for (const pattern of this.proxyPatterns) {
      const match = proxyUrl.match(pattern);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1]);
        } catch (error) {
          console.warn('Failed to decode target URL:', match[1], error);
        }
      }
    }
    
    // Try generic URL parameter extraction
    try {
      const url = new URL(proxyUrl);
      const targetUrl = url.searchParams.get('url') || url.searchParams.get('target');
      return targetUrl ? decodeURIComponent(targetUrl) : null;
    } catch (error) {
      return null;
    }
  }
  
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Remove fragment (hash)
      urlObj.hash = '';
      
      // Sort query parameters for consistency
      const sortedParams = new URLSearchParams();
      const params = [...urlObj.searchParams].sort((a, b) =>
        a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
      );
      for (const [key, value] of params) {
        sortedParams.append(key, value);
      }
      urlObj.search = sortedParams.toString();
      
      // Normalize trailing slash
      if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      // Convert to lowercase hostname
      urlObj.hostname = urlObj.hostname.toLowerCase();
      
      return urlObj.toString();
    } catch (error) {
      console.warn('Failed to normalize URL:', url, error);
      return url;
    }
  }
  
  // Utility methods for working with URLs
  
  isSameOrigin(url1: string, url2: string): boolean {
    try {
      const canonical1 = this.getCanonicalUrl(url1);
      const canonical2 = this.getCanonicalUrl(url2);
      
      const urlObj1 = new URL(canonical1);
      const urlObj2 = new URL(canonical2);
      
      return urlObj1.origin === urlObj2.origin;
    } catch (error) {
      return false;
    }
  }
  
  isSamePage(url1: string, url2: string): boolean {
    const canonical1 = this.getCanonicalUrl(url1);
    const canonical2 = this.getCanonicalUrl(url2);
    
    return canonical1 === canonical2;
  }
  
  getDomain(url: string): string | null {
    try {
      const canonical = this.getCanonicalUrl(url);
      const urlObj = new URL(canonical);
      return urlObj.hostname;
    } catch (error) {
      return null;
    }
  }
  
  getPath(url: string): string | null {
    try {
      const canonical = this.getCanonicalUrl(url);
      const urlObj = new URL(canonical);
      return urlObj.pathname;
    } catch (error) {
      return null;
    }
  }
}

// Singleton instance
export const canonicalUrlService = new DefaultCanonicalUrlService();