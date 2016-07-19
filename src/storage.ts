import {
  IStorage,
  IStorageStrategy,
  StorageDependencies,
  StorageOptions
} from './definitions';

/**
 * @private
 */
export class LocalStorageStrategy implements IStorageStrategy {

  public get(key: string): string {
    return localStorage.getItem(key);
  }

  public set(key: string, value: string): void {
    return localStorage.setItem(key, value);
  }

  public delete(key: string): void {
    return localStorage.removeItem(key);
  }

}

/**
 * @private
 */
export class SessionStorageStrategy implements IStorageStrategy {

  public get(key: string): string {
    return sessionStorage.getItem(key);
  }

  public set(key: string, value: string): void {
    return sessionStorage.setItem(key, value);
  }

  public delete(key: string): void {
    return sessionStorage.removeItem(key);
  }

}

/**
 * A generic local/session storage abstraction.
 */
export class Storage<T> implements IStorage<T> {

  private strategy: IStorageStrategy;
  private storageCache: {
    [key: string]: T;
  };

  constructor(deps: StorageDependencies, public options: StorageOptions = {'prefix': 'ionic', 'cache': true}) {
    this.strategy = deps.strategy;
    this.storageCache = {};
  }

  /**
   * Set a value in the storage by the given key.
   *
   * @param key - The storage key to set.
   * @param value - The value to set. (Must be JSON-serializable).
   */
  public set(key: string, value: T): void {
    key = this.standardizeKey(key);
    let json = JSON.stringify(value);

    this.strategy.set(key, json);
    if (this.options.cache) {
      this.storageCache[key] = value;
    }
  }

  /**
   * Delete a value from the storage by the given key.
   *
   * @param key - The storage key to delete.
   */
  public delete(key: string): void {
    key = this.standardizeKey(key);
    this.strategy.delete(key);
    if (this.options.cache) {
      delete this.storageCache[key];
    }
  }

  /**
   * Get a value from the storage by the given key.
   *
   * @param key - The storage key to get.
   */
  public get(key: string): T {
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
