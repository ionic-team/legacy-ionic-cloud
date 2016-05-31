import { Logger } from './logger';
export declare class UserData {
    data: any;
    constructor(data?: {});
    deserializerDataTypes(): void;
    set(key: any, value: any): void;
    unset(key: any): void;
    get(key: any, defaultValue: any): any;
}
export declare class User {
    logger: Logger;
    data: UserData;
    details: any;
    private _blockLoad;
    private _blockSave;
    private _blockDelete;
    private _dirty;
    private _fresh;
    private _unset;
    private _id;
    constructor();
    isDirty(): boolean;
    isAnonymous(): boolean;
    isAuthenticated(): boolean;
    static current(user?: any): any;
    static fromContext(data: any): User;
    static self(): any;
    static load(id: any): any;
    isFresh(): boolean;
    isValid(): boolean;
    getAPIFormat(): any;
    getFormat(format: any): any;
    migrate(): boolean;
    delete(): any;
    _store(): void;
    _delete(): void;
    save(): any;
    resetPassword(): any;
    id: string;
    toString(): string;
    set(key: any, value: any): void;
    get(key: any, defaultValue: any): any;
    unset(key: any): void;
}
