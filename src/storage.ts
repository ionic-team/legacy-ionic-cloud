import { StorageOptions, StorageDependencies, IStorage, IStorageStrategy } from './definitions';

export class LocalStorageStrategy implements IStorageStrategy {

  get(key: string): string {
    return localStorage.getItem(key);
  }

  set(key: string, value: string): void {
    return localStorage.setItem(key, value);
  }

  delete(key: string): void {
    return localStorage.removeItem(key);
  }

}

export class SessionStorageStrategy implements IStorageStrategy {

  get(key: string): string {
    return sessionStorage.getItem(key);
  }

  set(key: string, value: string): void {
    return sessionStorage.setItem(key, value);
  }

  delete(key: string): void {
    return sessionStorage.removeItem(key);
  }

}

export class Storage<T> implements IStorage<T> {

  private strategy: IStorageStrategy;
  private storageCache: {
    [key: string]: T;
  };

  constructor(deps: StorageDependencies, public options: StorageOptions = {'prefix': 'ionic', 'cache': true}) {
    this.strategy = deps.strategy;
    this.storageCache = {};
  }

  set(key: string, value: T): void {
    key = this.standardizeKey(key);
    let json = JSON.stringify(value);

    this.strategy.set(key, json);
    if (this.options.cache) {
      this.storageCache[key] = value;
    }
  }

  delete(key: string): void {
    key = this.standardizeKey(key);
    this.strategy.delete(key);
    if (this.options.cache) {
      delete this.storageCache[key];
    }
  }

  get(key: string): T {
    key = this.standardizeKey(key);
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

  private standardizeKey(key: string): string {
    return `${this.options.prefix}_${key}`;
  }

}
