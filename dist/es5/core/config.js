"use strict";
var IonicPlatformConfig = (function () {
    function IonicPlatformConfig() {
        this.locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'analytics': 'https://analytics.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }
    IonicPlatformConfig.prototype.register = function (settings) {
        this.settings = settings;
    };
    IonicPlatformConfig.prototype.get = function (name) {
        if (!this.settings) {
            return undefined;
        }
        return this.settings[name];
    };
    IonicPlatformConfig.prototype.getURL = function (name) {
        var devLocations = this.settings && this.settings['dev_locations'] || {};
        if (devLocations[name]) {
            return devLocations[name];
        }
        else if (this.locations[name]) {
            return this.locations[name];
        }
    };
    return IonicPlatformConfig;
}());
exports.IonicPlatformConfig = IonicPlatformConfig;
exports.Config = new IonicPlatformConfig();
