export declare class Logger {
    prefix: string;
    silent: boolean;
    outfn: any;
    errfn: any;
    constructor(prefix: string);
    info(data: any): void;
    warn(data: any): void;
    error(data: any): void;
}
