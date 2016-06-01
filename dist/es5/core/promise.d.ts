export interface ThenableWithNotify<T> {
    then<U>(onFulfilled?: (value: T) => U | ThenableWithNotify<U>, onRejected?: (error: any) => U | ThenableWithNotify<U>, onNotified?: (value: any) => U | ThenableWithNotify<U>): ThenableWithNotify<U>;
    catch<U>(onRejected?: (error: any) => U | ThenableWithNotify<U>): ThenableWithNotify<U>;
}
export declare class PromiseWithNotify<T> extends Promise<T> implements ThenableWithNotify<T> {
    private onNotify;
    then<U>(onFulfilled?: (value: T) => U, onRejected?: (error: any) => U, onNotified?: (value: any) => U): ThenableWithNotify<U>;
}
export declare class DeferredPromise<U> {
    resolve: (value: any) => any;
    reject: (value: any) => any;
    private _notify;
    promise: PromiseWithNotify<U>;
    private notifyValues;
    constructor();
    notify(value: any): void;
}
