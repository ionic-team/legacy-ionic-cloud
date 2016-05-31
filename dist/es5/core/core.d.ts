import { EventEmitter } from './events';
import { Storage } from './storage';
import { Logger } from './logger';
export declare class IonicPlatformCore {
    logger: Logger;
    emitter: EventEmitter;
    config: any;
    cordovaPlatformUnknown: boolean;
    private _pluginsReady;
    constructor();
    init(cfg: any): void;
    Version: string;
    getEmitter(): EventEmitter;
    getStorage(): Storage;
    _isCordovaAvailable(): boolean;
    loadCordova(): boolean;
    /**
     * Determine the device type via the user agent string
     * @return {string} name of device platform or 'unknown' if unable to identify the device
     */
    getDeviceTypeByNavigator(): string;
    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
    isAndroidDevice(): boolean;
    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
    isIOSDevice(): boolean;
    /**
     * Bootstrap Ionic Core
     *
     * Handles the cordova.js bootstrap
     * @return {void}
     */
    _bootstrap(): void;
    deviceConnectedToNetwork(strictMode?: any): boolean;
    /**
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    onReady(callback: any): void;
}
export declare var IonicPlatform: IonicPlatformCore;
