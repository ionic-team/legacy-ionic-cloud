import { Client } from './client';
import { Cordova } from './cordova';
import { Device } from './device';
import { Environment } from '../environments';
import { EventEmitter } from './events';
import { Storage } from './storage';
import { Logger } from './logger';
import { ISettings, Config } from './config';
export declare class Core {
    client: Client;
    config: Config;
    cordova: Cordova;
    device: Device;
    emitter: EventEmitter;
    env: Environment;
    logger: Logger;
    storage: Storage;
    private pluginsReady;
    private _version;
    constructor();
    init(cfg: ISettings): void;
    version: string;
    private registerEventHandlers();
    /**
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    onReady(callback: any): void;
}
export declare let IonicPlatform: Core;
