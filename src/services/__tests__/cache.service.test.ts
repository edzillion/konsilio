/**
 * CacheService Tests
 *
 * Tests for the in-memory TTL cache service.
 * Pure logic with no external dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheService } from '../cache.service.js';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new CacheService(1000); // 1 second default TTL
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set/get', () => {
    it('stores and retrieves a value', () => {
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('returns undefined for missing key', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('stores different types', () => {
      cache.set('number', 42);
      cache.set('object', { foo: 'bar' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get<number>('number')).toBe(42);
      expect(cache.get<{ foo: string }>('object')).toEqual({ foo: 'bar' });
      expect(cache.get<number[]>('array')).toEqual([1, 2, 3]);
    });
  });

  describe('TTL expiration', () => {
    it('returns undefined after TTL expires', () => {
      cache.set('key', 'value', 500);
      expect(cache.get('key')).toBe('value');

      vi.advanceTimersByTime(600);
      expect(cache.get('key')).toBeUndefined();
    });

    it('uses default TTL when not specified', () => {
      cache.set('key', 'value'); // uses 1000ms default
      expect(cache.get('key')).toBe('value');

      vi.advanceTimersByTime(1100);
      expect(cache.get('key')).toBeUndefined();
    });

    it('keeps value before TTL expires', () => {
      cache.set('key', 'value', 1000);
      vi.advanceTimersByTime(500);
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('has', () => {
    it('returns true for existing non-expired key', () => {
      cache.set('key', 'value', 1000);
      expect(cache.has('key')).toBe(true);
    });

    it('returns false for missing key', () => {
      expect(cache.has('missing')).toBe(false);
    });

    it('returns false and deletes expired key', () => {
      cache.set('key', 'value', 500);
      vi.advanceTimersByTime(600);
      expect(cache.has('key')).toBe(false);
      expect(cache.get('key')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes a key and returns true', () => {
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
    });

    it('returns false for missing key', () => {
      expect(cache.delete('missing')).toBe(false);
    });
  });

  describe('prune', () => {
    it('removes all expired entries and returns count', () => {
      cache.set('short', 'value1', 200);
      cache.set('long', 'value2', 5000);
      cache.set('forever', 'value3', 100000);

      vi.advanceTimersByTime(300);
      const pruned = cache.prune();

      expect(pruned).toBe(1);
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value2');
      expect(cache.get('forever')).toBe('value3');
    });

    it('returns 0 when nothing expired', () => {
      cache.set('key1', 'value1', 5000);
      cache.set('key2', 'value2', 5000);

      vi.advanceTimersByTime(100);
      expect(cache.prune()).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries regardless of TTL', () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100000);

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('stats', () => {
    it('returns size and keys', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      const stats = cache.stats();
      expect(stats.size).toBe(3);
      expect(stats.keys).toContain('a');
      expect(stats.keys).toContain('b');
      expect(stats.keys).toContain('c');
    });

    it('includes expired entries in size until accessed', () => {
      cache.set('key', 'value', 100);
      vi.advanceTimersByTime(200);

      // Expired entry still counts in size until get/has is called
      const stats = cache.stats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toContain('key');
    });
  });
});