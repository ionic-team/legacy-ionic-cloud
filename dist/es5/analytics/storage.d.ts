export declare class BucketStorage {
    baseStorage: any;
    name: string;
    constructor(name: any);
    get(key: any): any;
    set(key: any, value: any): any;
    scopedKey(key: any): string;
}
