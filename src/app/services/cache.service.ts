import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Cache entry interface
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

/**
 * Cache configuration for different data types
 */
interface CacheConfig {
    ttl: number; // Time to live in milliseconds
    staleWhileRevalidate: boolean; // Whether to use stale-while-revalidate pattern
}

/**
 * Service for caching API responses to reduce network calls.
 * Implements stale-while-revalidate pattern for better UX.
 */
@Injectable({
    providedIn: 'root'
})
export class CacheService {
    private cache = new Map<string, CacheEntry<any>>();
    private revalidating = new Set<string>(); // Track keys currently being revalidated
    private debugMode = false; // Set to true to enable verbose cache logging

    // Default cache configurations
    private readonly defaultConfigs: Map<string, CacheConfig> = new Map([
        // Reference data - cache aggressively (5 minutes)
        ['tags', { ttl: 5 * 60 * 1000, staleWhileRevalidate: false }],
        ['organizations', { ttl: 5 * 60 * 1000, staleWhileRevalidate: false }],
        ['organization:', { ttl: 5 * 60 * 1000, staleWhileRevalidate: false }],
        
        // Events - cache for 2 minutes, only revalidate when stale (after TTL expires)
        ['events', { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }],
        ['event:', { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }],
        ['events:search', { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }],
        
        // Users - cache moderately (2 minutes)
        ['users', { ttl: 2 * 60 * 1000, staleWhileRevalidate: false }],
        ['user:', { ttl: 2 * 60 * 1000, staleWhileRevalidate: false }],
        
        // Support messages - cache for 2 minutes, only revalidate when stale
        ['support-messages', { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }],
        ['support-message:', { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }],
        
        // Audit logs - cache for 1 minute, only revalidate when stale
        ['audit-log', { ttl: 60 * 1000, staleWhileRevalidate: true }],
        
        // Signups - cache for 1 minute, only revalidate when stale
        ['signups', { ttl: 60 * 1000, staleWhileRevalidate: true }],
        ['signup:', { ttl: 60 * 1000, staleWhileRevalidate: true }],
        
        // Event tags - cache for 2 minutes (tags for specific events)
        ['event-tags:', { ttl: 2 * 60 * 1000, staleWhileRevalidate: false }],
        
        // User follow organization status - cache for 1 minute (follow status changes infrequently)
        ['user-follow:', { ttl: 60 * 1000, staleWhileRevalidate: false }],
        
        // Metrics - cache for 30 seconds (metrics change frequently)
        ['metrics:admin', { ttl: 30 * 1000, staleWhileRevalidate: false }],
        ['metrics:organizer', { ttl: 30 * 1000, staleWhileRevalidate: false }]
    ]);

    constructor() {
        // Clean up expired cache entries every minute
        setInterval(() => this.cleanExpiredEntries(), 60 * 1000);
    }

    /**
     * Gets data from cache or executes the fetch function.
     * Implements stale-while-revalidate pattern when configured.
     * 
     * @param key - Cache key (e.g., 'events:all', 'events:search?city=San+Diego')
     * @param fetchFn - Function that returns an Observable to fetch fresh data
     * @param customConfig - Optional custom cache configuration
     * @returns Observable of cached or fresh data
     */
    get<T>(key: string, fetchFn: () => Observable<T>, customConfig?: CacheConfig): Observable<T> {
        const config = customConfig || this.getConfigForKey(key);
        const cached = this.cache.get(key);

        // If we have valid cached data (within TTL)
        if (cached && this.isValid(cached, config.ttl)) {
            // Return cached data - no API call when cache is fresh
            // Only log HIT for important keys (not event-tags which are too noisy)
            if (!key.startsWith('event-tags:')) {
                const age = Math.round((Date.now() - cached.timestamp) / 1000);
                console.log(`[Cache] ✅ HIT: ${key} (age: ${age}s)`);
            }
            return of(cached.data);
        }

        // If we have stale cached data (past TTL) and revalidation is enabled
        if (cached && config.staleWhileRevalidate && !this.isValid(cached, config.ttl)) {
            if (this.debugMode) {
                const age = Math.round((Date.now() - cached.timestamp) / 1000);
                console.log(`[Cache] ⚠️ STALE: ${key} (age: ${age}s, TTL: ${config.ttl / 1000}s) - returning stale data and fetching fresh`);
            }
            // Return stale data immediately while fetching fresh data in background
            const staleData$ = of(cached.data);
            
            // Start background fetch to refresh stale cache
            if (!this.revalidating.has(key)) {
                this.revalidating.add(key);
                fetchFn().pipe(
                    tap({
                        next: (freshData) => {
                            if (this.debugMode) {
                                console.log(`[Cache] 🔄 REFRESHED: ${key}`);
                            }
                            this.set(key, freshData, config);
                            this.revalidating.delete(key);
                        },
                        error: () => {
                            if (this.debugMode) {
                                console.log(`[Cache] ❌ REFRESH FAILED: ${key}`);
                            }
                            this.revalidating.delete(key);
                        }
                    })
                ).subscribe();
            }
            
            return staleData$;
        }

        // No cache or cache expired without revalidation - fetch fresh data
        // Only log misses for important keys (not event-tags which are called per event)
        const shouldLog = this.debugMode || !key.startsWith('event-tags:');
        if (shouldLog) {
            if (cached) {
                const age = Math.round((Date.now() - cached.timestamp) / 1000);
                console.log(`[Cache] ❌ MISS (expired): ${key} (age: ${age}s, TTL: ${config.ttl / 1000}s)`);
            } else {
                console.log(`[Cache] ❌ MISS (not found): ${key}`);
            }
        }
        return fetchFn().pipe(
            tap(data => {
                if (shouldLog) {
                    console.log(`[Cache] 💾 SET: ${key}`);
                }
                this.set(key, data, config);
            })
        );
    }

    /**
     * Sets data in the cache.
     * 
     * @param key - Cache key
     * @param data - Data to cache
     * @param customConfig - Optional custom cache configuration
     */
    set<T>(key: string, data: T, customConfig?: CacheConfig): void {
        const config = customConfig || this.getConfigForKey(key);
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: config.ttl
        });
    }

    /**
     * Invalidates a specific cache key.
     * 
     * @param key - Cache key to invalidate
     */
    invalidate(key: string): void {
        this.cache.delete(key);
        this.revalidating.delete(key);
    }

    /**
     * Invalidates all cache entries matching a pattern.
     * Useful for invalidating related cache entries.
     * 
     * @param pattern - Pattern to match (e.g., 'events:' to invalidate all event caches)
     */
    invalidatePattern(pattern: string): void {
        const keysToDelete: string[] = [];
        this.cache.forEach((_, key) => {
            if (key.startsWith(pattern)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => {
            this.cache.delete(key);
            this.revalidating.delete(key);
        });
    }

    /**
     * Clears all cache entries.
     */
    clear(): void {
        this.cache.clear();
        this.revalidating.clear();
    }

    /**
     * Gets cache configuration for a key based on its prefix.
     * 
     * @param key - Cache key
     * @returns Cache configuration
     */
    private getConfigForKey(key: string): CacheConfig {
        // Find matching prefix config
        for (const [prefix, config] of this.defaultConfigs.entries()) {
            if (key.startsWith(prefix)) {
                return config;
            }
        }

        // Default config (30 seconds, no revalidation)
        return { ttl: 30 * 1000, staleWhileRevalidate: false };
    }

    /**
     * Checks if a cache entry is still valid.
     * 
     * @param entry - Cache entry
     * @param ttl - Time to live in milliseconds
     * @returns True if entry is valid
     */
    private isValid(entry: CacheEntry<any>, ttl: number): boolean {
        const age = Date.now() - entry.timestamp;
        return age < ttl;
    }

    /**
     * Removes expired cache entries.
     */
    private cleanExpiredEntries(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.cache.forEach((entry, key) => {
            const config = this.getConfigForKey(key);
            if (!this.isValid(entry, config.ttl)) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => {
            // Only delete if not being revalidated (revalidation might be updating it)
            if (!this.revalidating.has(key)) {
                this.cache.delete(key);
            }
        });
    }

    /**
     * Gets cache statistics for debugging.
     */
    getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}
