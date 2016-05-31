export declare class Request {
    then: any;
    reject: any;
    resolve: any;
    constructor();
}
export declare class Response {
    constructor();
}
export declare class APIResponse extends Response {
    constructor();
}
export declare class APIRequest extends Request {
    constructor(options: any);
}
