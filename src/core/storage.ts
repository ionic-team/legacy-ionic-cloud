import { DeferredPromise } from './promise';

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

var objectCache = {};
var memoryLocks = {};

export class Storage {

  strategy: LocalStorageStrategy;

  constructor() {
    this.strategy = new LocalStorageStrategy();
  }

  /**
   * Stores an object in local storage under the given key
   * @param {string} key Name of the key to store values in
   * @param {object} object The object to store with the key
   * @return {void}
   */
  storeObject(key, object) {
    // Convert object to JSON and store in localStorage
    var json = JSON.stringify(object);
    this.strategy.set(key, json);

    // Then store it in the object cache
    objectCache[key] = object;
  }

  deleteObject(key) {
    this.strategy.remove(key);
    delete objectCache[key];
  }

  /**
   * Either retrieves the cached copy of an object,
   * or the object itself from localStorage.
   * @param {string} key The name of the key to pull from
   * @return {mixed} Returns the previously stored Object or null
   */
  retrieveObject(key) {
    // First check to see if it's the object cache
    var cached = objectCache[key];
    if (cached) {
      return cached;
    }

    // Deserialize the object from JSON
    var json = this.strategy.get(key);

    // null or undefined --> return null.
    if (json === null) {
      return null;
    }

    try {
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  }
}
