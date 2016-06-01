import { PromiseWithNotify } from '../core/promise';
import { Logger } from '../core/logger';
export declare class Analytics {
    logger: Logger;
    cache: any;
    storage: any;
    private _dispatcher;
    private _dispatchIntervalTime;
    private _useEventCaching;
    private _serviceHost;
    constructor(config?: any);
    _addGlobalPropertyDefaults(): void;
    hasValidSettings: boolean;
    dispatchInterval: number;
    _enqueueEvent(collectionName: any, eventData: any): void;
    _requestAnalyticsKey(): any;
    _postEvent(name: any, data: any): any;
    _postEvents(events: any): any;
    _dispatchQueue(): void;
    _getRequestStatusCode(request: any): number;
    _handleDispatchError(error: any, request: any, eventQueue: any): void;
    _handleRegisterError(error: any, request: any): void;
    /**
     * Registers an analytics key
     *
     * @param {object} opts Registration options
     * @return {Promise} The register promise
     */
    register(opts?: any): PromiseWithNotify<any>;
    setGlobalProperties(prop: any): void;
    track(eventCollection: any, eventData: any): boolean;
    unsetGlobalProperty(prop: any): void;
}
