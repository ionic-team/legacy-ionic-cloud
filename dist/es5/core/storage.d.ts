import { PromiseWithNotify } from './promise';
export declare class PlatformLocalStorageStrategy {
    constructor();
    get(key: any): any;
    remove(key: any): void;
    set(key: any, value: any): void;
}
export declare class LocalSessionStorageStrategy {
    get(key: any): any;
    remove(key: any): void;
    set(key: any, value: any): void;
}
export declare class Storage {
    strategy: PlatformLocalStorageStrategy;
    constructor();
    /**
     * Stores an object in local storage under the given key
     * @param {string} key Name of the key to store values in
     * @param {object} object The object to store with the key
     * @return {void}
     */
    storeObject(key: any, object: any): void;
    deleteObject(key: any): void;
    /**
     * Either retrieves the cached copy of an object,
     * or the object itself from localStorage.
     * @param {string} key The name of the key to pull from
     * @return {mixed} Returns the previously stored Object or null
     */
    retrieveObject(key: any): any;
    /**
     * Locks the async call represented by the given promise and lock key.
     * Only one asyncFunction given by the lockKey can be running at any time.
     *
     * @param {string} lockKey should be a string representing the name of this async call.
     *        This is required for persistence.
     * @param {function} asyncFunction Returns a promise of the async call.
     * @returns {Promise} A new promise, identical to the one returned by asyncFunction,
     *          but with two new errors: 'in_progress', and 'last_call_interrupted'.
     */
    lockedAsyncCall(lockKey: any, asyncFunction: any): PromiseWithNotify<any>;
}
