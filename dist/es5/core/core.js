"use strict";
var events_1 = require('./events');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var config_1 = require('./config');
var eventEmitter = new events_1.EventEmitter();
var mainStorage = new storage_1.Storage();
var IonicPlatformCore = (function () {
    function IonicPlatformCore() {
        var self = this;
        this.config = config_1.Config;
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Core:'
        });
        this.logger.info('init');
        this._pluginsReady = false;
        this.emitter = this.getEmitter();
        this._bootstrap();
        if (self.cordovaPlatformUnknown) {
            self.logger.info('attempting to mock plugins');
            self._pluginsReady = true;
            self.emitter.emit('ionic_core:plugins_ready');
        }
        else {
            try {
                document.addEventListener('deviceready', function () {
                    self.logger.info('plugins are ready');
                    self._pluginsReady = true;
                    self.emitter.emit('ionic_core:plugins_ready');
                }, false);
            }
            catch (e) {
                self.logger.info('unable to listen for cordova plugins to be ready');
            }
        }
    }
    IonicPlatformCore.prototype.init = function (cfg) {
        this.config.register(cfg);
    };
    Object.defineProperty(IonicPlatformCore.prototype, "Version", {
        get: function () {
            return '0.7.1';
        },
        enumerable: true,
        configurable: true
    });
    IonicPlatformCore.prototype.getEmitter = function () {
        return eventEmitter;
    };
    IonicPlatformCore.prototype.getStorage = function () {
        return mainStorage;
    };
    IonicPlatformCore.prototype._isCordovaAvailable = function () {
        var self = this;
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
                        self.logger.info('cordova.js has previously been included.');
                        return true;
                    }
                }
                catch (e) {
                    self.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
                }
            }
        }
        return false;
    };
    IonicPlatformCore.prototype.loadCordova = function () {
        var self = this;
        if (!this._isCordovaAvailable()) {
            var cordovaScript = document.createElement('script');
            var cordovaSrc = 'cordova.js';
            switch (this.getDeviceTypeByNavigator()) {
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
                        self.logger.info('could not find cordova_js_bootstrap_resource query param');
                        self.logger.info(e);
                    }
                    break;
                case 'unknown':
                    self.cordovaPlatformUnknown = true;
                    return false;
                default:
                    break;
            }
            cordovaScript.setAttribute('src', cordovaSrc);
            document.head.appendChild(cordovaScript);
            self.logger.info('injecting cordova.js');
        }
    };
    /**
     * Determine the device type via the user agent string
     * @return {string} name of device platform or 'unknown' if unable to identify the device
     */
    IonicPlatformCore.prototype.getDeviceTypeByNavigator = function () {
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
    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
    IonicPlatformCore.prototype.isAndroidDevice = function () {
        var device = this.getDeviceTypeByNavigator();
        if (device === 'android') {
            return true;
        }
        return false;
    };
    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
    IonicPlatformCore.prototype.isIOSDevice = function () {
        var device = this.getDeviceTypeByNavigator();
        if (device === 'iphone' || device === 'ipad') {
            return true;
        }
        return false;
    };
    /**
     * Bootstrap Ionic Core
     *
     * Handles the cordova.js bootstrap
     * @return {void}
     */
    IonicPlatformCore.prototype._bootstrap = function () {
        this.loadCordova();
    };
    IonicPlatformCore.prototype.deviceConnectedToNetwork = function (strictMode) {
        if (strictMode === void 0) { strictMode = null; }
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
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    IonicPlatformCore.prototype.onReady = function (callback) {
        var self = this;
        if (this._pluginsReady) {
            callback(self);
        }
        else {
            self.emitter.on('ionic_core:plugins_ready', function () {
                callback(self);
            });
        }
    };
    return IonicPlatformCore;
}());
exports.IonicPlatformCore = IonicPlatformCore;
exports.IonicPlatform = new IonicPlatformCore();
