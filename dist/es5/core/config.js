"use strict";
var IonicPlatformConfig = (function () {
    function IonicPlatformConfig() {
        this._settings = {};
        this._devLocations = {};
        this._locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }
    IonicPlatformConfig.prototype.get = function (name) {
        return this._settings[name];
    };
    IonicPlatformConfig.prototype.getURL = function (name) {
        if (this._devLocations[name]) {
            return this._devLocations[name];
        }
        else if (this._locations[name]) {
            return this._locations[name];
        }
        else {
            return null;
        }
    };
    IonicPlatformConfig.prototype.register = function (settings) {
        if (settings === void 0) { settings = {}; }
        this._settings = settings;
        this._devLocations = settings.dev_locations || {};
    };
    return IonicPlatformConfig;
}());
exports.IonicPlatformConfig = IonicPlatformConfig;
exports.Config = new IonicPlatformConfig();
