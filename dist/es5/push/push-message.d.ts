export declare class PushMessageAppStatus {
    asleep: boolean;
    closed: boolean;
    constructor();
    wasAsleep: boolean;
    wasClosed: boolean;
}
export declare class PushMessage {
    app: PushMessageAppStatus;
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
