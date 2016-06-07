import { PromiseWithNotify } from '../core/promise';
export declare class Environment {
    /**
     * Environment constructor
     *
     * @param {object} config Configuration object
     */
    constructor();
    /**
     * Load an environment, calls loadEnvFromAPI
     *
     * @param {string} tag Environment tag
     * @return {DeferredPromise} will resolve/reject with the config object or error
     */
    load(tag: any): PromiseWithNotify<{}>;
    /**
     * Load an environment from the API
     *
     * @param {string} tag Environment tag
     * @return {DeferredPromise} will resolve/reject with the config object or error
     */
    private loadEnvFromAPI(tag);
}
