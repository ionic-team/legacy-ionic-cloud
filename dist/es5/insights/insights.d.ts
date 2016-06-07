import { Client } from '../core/client';
import { Logger } from '../core/logger';
export interface IStatSerialized {
    app_id: string;
    stat: string;
    value: number;
    created: string;
}
export declare class Stat {
    appId: string;
    stat: string;
    value: number;
    created: Date;
    constructor(appId: string, stat: string, value?: number);
    toJSON(): IStatSerialized;
}
export declare class Insights {
    client: Client;
    appId: string;
    static SUBMIT_COUNT: number;
    submitCount: number;
    private batch;
    protected logger: Logger;
    constructor(client: Client, appId: string);
    track(stat: string, value?: number): void;
    protected trackStat(stat: Stat): void;
    protected shouldSubmit(): boolean;
    protected submit(): any;
}
