"use strict";
var Device = (function () {
    function Device() {
        this.deviceType = this.determineDeviceType();
    }
    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
    Device.prototype.isAndroid = function () {
        return this.deviceType === 'android';
    };
    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
    Device.prototype.isIOS = function () {
        return this.deviceType === 'iphone' || this.deviceType === 'ipad';
    };
    Device.prototype.isConnectedToNetwork = function (strictMode) {
        if (typeof strictMode === 'undefined') {
            strictMode = false;
        }
        if (typeof navigator.connection === 'undefined' ||
            typeof navigator.connection.type === 'undefined' ||
            typeof Connection === 'undefined') {
            if (!strictMode) {
                return true;
            }
            return false;
        }
        switch (navigator.connection.type) {
            case Connection.ETHERNET:
            case Connection.WIFI:
            case Connection.CELL_2G:
            case Connection.CELL_3G:
            case Connection.CELL_4G:
            case Connection.CELL:
                return true;
            default:
                return false;
        }
    };
    /**
     * Determine the device type via the user agent string
     * @return {string} name of device platform or 'unknown' if unable to identify the device
     */
    Device.prototype.determineDeviceType = function () {
        var agent = navigator.userAgent;
        var ipad = agent.match(/iPad/i);
        if (ipad && (ipad[0].toLowerCase() === 'ipad')) {
            return 'ipad';
        }
        var iphone = agent.match(/iPhone/i);
        if (iphone && (iphone[0].toLowerCase() === 'iphone')) {
            return 'iphone';
        }
        var android = agent.match(/Android/i);
        if (android && (android[0].toLowerCase() === 'android')) {
            return 'android';
        }
        return 'unknown';
    };
    return Device;
}());
exports.Device = Device;
