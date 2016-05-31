export declare class DeferredPromise {
    resolve: (value: any) => any;
    reject: (value: any) => any;
    private _notify;
    promise: any;
    private notifyValues;
    constructor();
    notify(value: any): void;
}
