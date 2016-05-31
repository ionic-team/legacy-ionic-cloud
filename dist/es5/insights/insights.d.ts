import { Logger } from '../core/logger';
export declare class Insights {
    appId: string;
    static SUBMIT_COUNT: number;
    private batch;
    protected logger: Logger;
    constructor(appId: string);
    track(stat: string, value?: number): void;
    protected submit(): void;
}
