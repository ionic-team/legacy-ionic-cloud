export interface IStorageStrategy {
  get(key: string): string;
  remove(key: string): void;
  set(key: string, value: string): void;
}

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

export class Storage {

  private strategy: IStorageStrategy;
  private storageCache: StorageCache;

  constructor(strategy: IStorageStrategy) {
    this.strategy = strategy;
    this.storageCache = {};
  }

  set(key: string, value: any) {
    let json = JSON.stringify(value);

    this.strategy.set(key, json);
    this.storageCache[key] = value;
  }

  delete(key: string) {
    this.strategy.remove(key);
    delete this.storageCache[key];
  }

  get(key: string) {
    let cached = this.storageCache[key];
    if (cached) {
      return cached;
    }

    let json = this.strategy.get(key);
    if (!json) {
      return null;
    }

    try {
      let value = JSON.parse(json);
      this.storageCache[key] = value;
      return value;
    } catch (err) {
      return null;
    }
  }
}
