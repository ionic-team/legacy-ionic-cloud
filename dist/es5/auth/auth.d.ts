import { PromiseWithNotify } from '../core/promise';
import { User } from '../core/user';
export declare class TempTokenContext {
    static label: string;
    static delete(): void;
    static store(): void;
    static getRawData(): any;
}
export declare class TokenContext {
    static label: string;
    static delete(): void;
    static store(): void;
    static getRawData(): any;
}
export interface LoginOptions {
    remember?: boolean;
}
export declare class Auth {
    static isAuthenticated(): boolean;
    static login(moduleId: any, options: LoginOptions, data: any): PromiseWithNotify<User>;
    static signup(data: any): any;
    static logout(): void;
    static register(moduleId: any, module: any): void;
    static getUserToken(): any;
}
