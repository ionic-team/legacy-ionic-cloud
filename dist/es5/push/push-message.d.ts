export interface AppStatus {
    asleep?: boolean;
    closed?: boolean;
}
export declare class PushMessage {
    app: AppStatus;
    text: string;
    title: string;
    count: number;
    sound: string;
    image: string;
    private _raw;
    private _payload;
    constructor(raw: any);
    static fromPluginJSON(json: any): PushMessage;
    payload: any;
    processRaw(): void;
    getRawVersion(): any;
    toString(): string;
}
