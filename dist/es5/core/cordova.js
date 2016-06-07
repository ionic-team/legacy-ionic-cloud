"use strict";
var logger_1 = require('./logger');
var Cordova = (function () {
    function Cordova(device) {
        this.device = device;
        this.device = device;
        this.logger = new logger_1.Logger('Ionic Cordova:');
    }
    Cordova.prototype.load = function () {
        if (!this.isAvailable()) {
            var cordovaScript = document.createElement('script');
            var cordovaSrc = 'cordova.js';
            switch (this.device.deviceType) {
                case 'android':
                    if (window.location.href.substring(0, 4) === 'file') {
                        cordovaSrc = 'file:///android_asset/www/cordova.js';
                    }
                    break;
                case 'ipad':
                case 'iphone':
                    try {
                        var resource = window.location.search.match(/cordova_js_bootstrap_resource=(.*?)(&|#|$)/i);
                        if (resource) {
                            cordovaSrc = decodeURI(resource[1]);
                        }
                    }
                    catch (e) {
                        this.logger.info('could not find cordova_js_bootstrap_resource query param');
                        this.logger.info(e);
                    }
                    break;
                default:
                    break;
            }
            cordovaScript.setAttribute('src', cordovaSrc);
            document.head.appendChild(cordovaScript);
            this.logger.info('injecting cordova.js');
        }
    };
    Cordova.prototype.isAvailable = function () {
        this.logger.info('searching for cordova.js');
        if (typeof cordova !== 'undefined') {
            this.logger.info('cordova.js has already been loaded');
            return true;
        }
        var scripts = document.getElementsByTagName('script');
        var len = scripts.length;
        for (var i = 0; i < len; i++) {
            var script = scripts[i].getAttribute('src');
            if (script) {
                var parts = script.split('/');
                var partsLength = 0;
                try {
                    partsLength = parts.length;
                    if (parts[partsLength - 1] === 'cordova.js') {
                        this.logger.info('cordova.js has previously been included.');
                        return true;
                    }
                }
                catch (e) {
                    this.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
                }
            }
        }
        return false;
    };
    return Cordova;
}());
exports.Cordova = Cordova;
