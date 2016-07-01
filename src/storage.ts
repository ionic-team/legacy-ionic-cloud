import { StorageOptions, StorageDependencies, IStorage, IStorageStrategy } from './definitions';

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

interface StorageCache {
  [key: string]: any;
}

export class Storage implements IStorage {

  private strategy: IStorageStrategy;
  private storageCache: StorageCache;

  constructor(deps: StorageDependencies, public options: StorageOptions = {'cache': true}) {
    this.strategy = deps.strategy;
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
