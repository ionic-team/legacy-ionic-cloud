export declare class Device {
    deviceType: string;
    constructor();
    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
    isAndroid(): boolean;
    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
    isIOS(): boolean;
    isConnectedToNetwork(strictMode?: any): boolean;
    /**
     * Determine the device type via the user agent string
     * @return {string} name of device platform or 'unknown' if unable to identify the device
     */
    private determineDeviceType();
}
