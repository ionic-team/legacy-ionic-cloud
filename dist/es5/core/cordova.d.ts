import { Device } from './device';
import { Logger } from './logger';
export declare class Cordova {
    device: Device;
    logger: Logger;
    constructor(device: Device);
    load(): void;
    private isAvailable();
}
