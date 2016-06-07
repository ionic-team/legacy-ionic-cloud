export declare class Client {
    baseUrl: string;
    token: string;
    req: any;
    constructor(baseUrl: string, token?: string, req?: any);
    get(endpoint: string): any;
    post(endpoint: string): any;
    put(endpoint: string): any;
    patch(endpoint: string): any;
    delete(endpoint: string): any;
    request(method: string, endpoint: string): any;
    private supplement(fn, endpoint);
}
