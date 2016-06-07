"use strict";
var Config = (function () {
    function Config() {
        this.locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'analytics': 'https://analytics.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }
    Config.prototype.register = function (settings) {
        this.settings = settings;
    };
    Config.prototype.get = function (name) {
        if (!this.settings) {
            return undefined;
        }
        return this.settings[name];
    };
    Config.prototype.getURL = function (name) {
        var devLocations = this.settings && this.settings['dev_locations'] || {};
        if (devLocations[name]) {
            return devLocations[name];
        }
        return this.locations[name];
    };
    return Config;
}());
exports.Config = Config;
exports.config = new Config();
