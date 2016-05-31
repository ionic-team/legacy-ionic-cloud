export declare class Logger {
    private _silence;
    private _prefix;
    private _options;
    constructor(opts: any);
    silence(): void;
    verbose(): void;
    _bootstrap(): void;
    info(data: any): void;
    warn(data: any): void;
    error(data: any): void;
}
