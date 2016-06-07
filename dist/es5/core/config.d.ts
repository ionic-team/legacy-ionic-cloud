export interface ISettings {
    app_id: string;
    gcm_key?: string;
    api_key?: string;
    dev_push?: boolean;
    dev_locations?: any;
    [key: string]: any;
}
export declare class Config {
    private settings;
    private locations;
    constructor();
    register(settings: ISettings): void;
    get(name: string): any;
    getURL(name: string): string;
}
export declare let config: Config;
