import { PromiseWithNotify } from './promise';
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
    static current(user?: User): User;
    static fromContext(data: any): User;
    static self(): Promise<User>;
    static load(id: any): PromiseWithNotify<{}>;
    isFresh(): boolean;
    isValid(): boolean;
    getAPIFormat(): any;
    getFormat(format: any): any;
    migrate(): void;
    delete(): PromiseWithNotify<any>;
    _store(): void;
    _delete(): void;
    save(): PromiseWithNotify<{}>;
    resetPassword(): PromiseWithNotify<{}>;
    id: string;
    toString(): string;
    set(key: any, value: any): void;
    get(key: any, defaultValue: any): any;
    unset(key: any): void;
}
