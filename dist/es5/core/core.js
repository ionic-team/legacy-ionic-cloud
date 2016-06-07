"use strict";
var client_1 = require('./client');
var cordova_1 = require('./cordova');
var device_1 = require('./device');
var environments_1 = require('../environments');
var events_1 = require('./events');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var config_1 = require('./config');
var Core = (function () {
    function Core() {
        this.pluginsReady = false;
        this._version = '0.7.1';
        this.config = config_1.config;
        this.client = new client_1.Client(this.config.getURL('platform-api'));
        this.device = new device_1.Device();
        this.cordova = new cordova_1.Cordova(this.device);
        this.logger = new logger_1.Logger('Ionic Core:');
        this.env = new environments_1.Environment();
        this.emitter = new events_1.EventEmitter();
        this.storage = new storage_1.Storage();
        this.cordova.load();
        this.registerEventHandlers();
    }
    Core.prototype.init = function (cfg) {
        this.config.register(cfg);
        this.logger.info('init');
        this.emitter.emit('core:init');
    };
    Object.defineProperty(Core.prototype, "version", {
        get: function () {
            return this._version;
        },
        enumerable: true,
        configurable: true
    });
    Core.prototype.registerEventHandlers = function () {
        var _this = this;
        this.emitter.on('auth:token-changed', function (data) {
            _this.client.token = data['new'];
        });
        if (this.device.deviceType === 'unknown') {
            this.logger.info('attempting to mock plugins');
            this.pluginsReady = true;
            this.emitter.emit('device:ready');
        }
        else {
            document.addEventListener('deviceready', function () {
                _this.logger.info('plugins are ready');
                _this.pluginsReady = true;
                _this.emitter.emit('device:ready');
            }, false);
        }
    };
    /**
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    Core.prototype.onReady = function (callback) {
        var _this = this;
        if (this.pluginsReady) {
            callback(this);
        }
        else {
            this.emitter.on('device:ready', function () {
                callback(_this);
            });
        }
    };
    return Core;
}());
exports.Core = Core;
exports.IonicPlatform = new Core();
