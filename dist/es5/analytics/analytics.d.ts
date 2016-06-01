import { APIRequest } from '../core/request';
import { Logger } from '../core/logger';
export declare class Analytics {
    logger: Logger;
    cache: any;
    storage: any;
    private _dispatcher;
    private _dispatchIntervalTime;
    private _useEventCaching;
    private _serviceHost;
    constructor(config: any);
    _addGlobalPropertyDefaults(): void;
    hasValidSettings: boolean;
    dispatchInterval: number;
    _enqueueEvent(collectionName: any, eventData: any): void;
    _requestAnalyticsKey(): APIRequest;
    _postEvent(name: any, data: any): APIRequest;
    _postEvents(events: any): APIRequest;
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
    register(opts: any): any;
    setGlobalProperties(prop: any): void;
    track(eventCollection: any, eventData: any): boolean;
    unsetGlobalProperty(prop: any): void;
}
