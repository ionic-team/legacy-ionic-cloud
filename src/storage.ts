import { IStorage, IStorageStrategy } from './definitions';

export class LocalStorageStrategy implements IStorageStrategy {
  get(key: string): string {
    return localStorage.getItem(key);
  }

  remove(key: string): void {
    return localStorage.removeItem(key);
  }

  set(key: string, value: string): void {
    return localStorage.setItem(key, value);
  }
}

export class SessionStorageStrategy implements IStorageStrategy {
  get(key: string): string {
    return sessionStorage.getItem(key);
  }

  remove(key: string): void {
    return sessionStorage.removeItem(key);
  }

  set(key: string, value: string): void {
    return sessionStorage.setItem(key, value);
  }
}

export interface StorageCache {
  [key: string]: any;
}

export interface StorageOptions {
  cache?: boolean;
}

export class Storage implements IStorage {

  private storageCache: StorageCache;

  constructor(public options: StorageOptions = {}, private strategy: IStorageStrategy) {
    if (typeof options.cache === 'undefined') {
      options.cache = true;
    }

    this.strategy = strategy;
    this.options = options;
    this.storageCache = {};
  }

  set(key: string, value: any): void {
    let json = JSON.stringify(value);

    this.strategy.set(key, json);
    if (this.options.cache) {
      this.storageCache[key] = value;
    }
  }

  delete(key: string): void {
    this.strategy.remove(key);
    if (this.options.cache) {
      delete this.storageCache[key];
    }
  }

  get(key: string): any {
    if (this.options.cache) {
      let cached = this.storageCache[key];
      if (cached) {
        return cached;
      }
    }

    let json = this.strategy.get(key);
    if (!json) {
      return null;
    }

    try {
      let value = JSON.parse(json);
      if (this.options.cache) {
        this.storageCache[key] = value;
      }
      return value;
    } catch (err) {
      return null;
    }
  }
}
