/**
 * TimingUtils - Utilities to handle timing issues discovered from Wayback machine work
 * Provides robust initialization, retry logic, and state synchronization
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
}

export interface TimingConfig {
  initDelay: number;
  readyCheckInterval: number;
  staleCheckInterval: number;
  maxReadyWait: number;
}

export class TimingUtils {
  /**
   * Retry function with exponential backoff
   * Prevents timing-related failures during initialization
   */
  static async retry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 100,
      maxDelay = 5000,
      exponentialBackoff = true
    } = config;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          break;
        }
        
        const delay = exponentialBackoff 
          ? Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
          : baseDelay;
        
        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
        await TimingUtils.delay(delay);
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Wait for DOM to be ready with timeout
   */
  static async waitForDOMReady(timeout = 10000): Promise<void> {
    if (document.readyState === 'complete') {
      return;
    }
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('DOM ready timeout'));
      }, timeout);
      
      const checkReady = () => {
        if (document.readyState === 'complete') {
          clearTimeout(timeoutId);
          resolve();
        }
      };
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkReady, { once: true });
      } else {
        // Interactive or complete
        setTimeout(checkReady, 0);
      }
    });
  }
  
  /**
   * Wait for a condition to be true with polling
   */
  static async waitFor(
    condition: () => boolean,
    config: Partial<TimingConfig> = {}
  ): Promise<void> {
    const {
      readyCheckInterval = 100,
      maxReadyWait = 10000
    } = config;
    
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = () => {
        if (condition()) {
          resolve();
          return;
        }
        
        if (Date.now() - startTime > maxReadyWait) {
          reject(new Error('Wait condition timeout'));
          return;
        }
        
        setTimeout(check, readyCheckInterval);
      };
      
      check();
    });
  }
  
  /**
   * Debounce function calls to prevent rapid-fire timing issues
   */
  static debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }
  
  /**
   * Throttle function calls to limit frequency
   */
  static throttle<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;
    
    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  }
  
  /**
   * Simple delay utility
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Execute function when next animation frame is available
   */
  static nextFrame(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve());
    });
  }
  
  /**
   * Execute function when browser is idle
   */
  static whenIdle(timeout = 5000): Promise<void> {
    return new Promise(resolve => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => resolve(), { timeout });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(resolve, 0);
      }
    });
  }
  
  /**
   * Safe initialization wrapper that handles common timing issues
   */
  static async safeInitialize<T>(
    initFn: () => Promise<T>,
    config: Partial<TimingConfig & RetryConfig> = {}
  ): Promise<T> {
    const {
      initDelay = 0,
      maxAttempts = 3,
      baseDelay = 100
    } = config;
    
    // Wait for DOM to be ready
    await TimingUtils.waitForDOMReady();
    
    // Optional initial delay
    if (initDelay > 0) {
      await TimingUtils.delay(initDelay);
    }
    
    // Execute with retry logic
    return TimingUtils.retry(initFn, {
      maxAttempts,
      baseDelay,
      exponentialBackoff: true
    });
  }
}

/**
 * StateManager - Handles state synchronization and stale state detection
 * Based on insights from Wayback machine timing issues
 */
export class StateManager<T> {
  private state: T | null = null;
  private lastUpdate = 0;
  private staleThreshold: number;
  private refreshFn: () => Promise<T>;
  private observers: Set<(state: T) => void> = new Set();
  
  constructor(
    refreshFn: () => Promise<T>,
    staleThreshold = 30000 // 30 seconds
  ) {
    this.refreshFn = refreshFn;
    this.staleThreshold = staleThreshold;
    
    // Setup periodic stale check
    setInterval(() => {
      this.checkStaleState();
    }, staleThreshold / 2);
  }
  
  async getState(): Promise<T> {
    if (!this.state || this.isStale()) {
      await this.refresh();
    }
    
    return this.state!;
  }
  
  async refresh(): Promise<T> {
    try {
      this.state = await this.refreshFn();
      this.lastUpdate = Date.now();
      
      // Notify observers
      this.observers.forEach(observer => {
        try {
          observer(this.state!);
        } catch (error) {
          console.error('StateManager: Observer error:', error);
        }
      });
      
      return this.state;
    } catch (error) {
      console.error('StateManager: Refresh failed:', error);
      throw error;
    }
  }
  
  setState(state: T): void {
    this.state = state;
    this.lastUpdate = Date.now();
    
    // Notify observers
    this.observers.forEach(observer => {
      try {
        observer(state);
      } catch (error) {
        console.error('StateManager: Observer error:', error);
      }
    });
  }
  
  isStale(): boolean {
    return Date.now() - this.lastUpdate > this.staleThreshold;
  }
  
  private async checkStaleState(): Promise<void> {
    if (this.state && this.isStale()) {
      console.warn('StateManager: Detected stale state, refreshing...');
      try {
        await this.refresh();
      } catch (error) {
        console.error('StateManager: Auto-refresh failed:', error);
      }
    }
  }
  
  addObserver(observer: (state: T) => void): void {
    this.observers.add(observer);
    
    // Immediately notify with current state if available
    if (this.state) {
      setTimeout(() => observer(this.state!), 0);
    }
  }
  
  removeObserver(observer: (state: T) => void): void {
    this.observers.delete(observer);
  }
  
  clearObservers(): void {
    this.observers.clear();
  }
}