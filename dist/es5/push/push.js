"use strict";
var app_1 = require('../core/app');
var core_1 = require('../core/core');
var logger_1 = require('../core/logger');
var promise_1 = require('../core/promise');
var user_1 = require('../core/user');
var push_token_1 = require('./push-token');
var push_message_1 = require('./push-message');
var push_dev_1 = require('./push-dev');
var Push = (function () {
    function Push(config) {
        var _this = this;
        if (config === void 0) { config = {}; }
        this._token = null;
        this.client = core_1.IonicPlatform.client;
        this.logger = new logger_1.Logger('Ionic Push:');
        var app = new app_1.App(core_1.IonicPlatform.config.get('app_id'), core_1.IonicPlatform.config.get('api_key'));
        app.devPush = core_1.IonicPlatform.config.get('dev_push');
        app.gcmKey = core_1.IonicPlatform.config.get('gcm_key');
        // Check for the required values to use this service
        if (!app.id || !app.apiKey) {
            this.logger.error('no app_id found. (http://docs.ionic.io/docs/io-install)');
            return;
        }
        else if (core_1.IonicPlatform.device.isAndroid() && !app.devPush && !app.gcmKey) {
            this.logger.error('GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
            return;
        }
        this.app = app;
        this.registerCallback = null;
        this.notificationCallback = null;
        this.errorCallback = null;
        this._notification = false;
        this._debug = false;
        this._isReady = false;
        this._tokenReady = false;
        this._blockRegistration = false;
        this._blockSaveToken = false;
        this._registered = false;
        this._plugin = null;
        if (config.deferInit) {
            core_1.IonicPlatform.onReady(function () {
                _this.init(config);
            });
        }
    }
    Object.defineProperty(Push.prototype, "token", {
        set: function (val) {
            var storage = core_1.IonicPlatform.storage;
            if (val instanceof push_token_1.PushToken) {
                storage.storeObject('ionic_io_push_token', { 'token': val.token });
            }
            this._token = val;
        },
        enumerable: true,
        configurable: true
    });
    Push.prototype.getStorageToken = function () {
        var storage = core_1.IonicPlatform.storage;
        var token = storage.retrieveObject('ionic_io_push_token');
        if (token) {
            return new push_token_1.PushToken(token.token);
        }
        return null;
    };
    Push.prototype.clearStorageToken = function () {
        var storage = core_1.IonicPlatform.storage;
        storage.deleteObject('ionic_io_push_token');
    };
    /**
     * Init method to setup push behavior/options
     *
     * The config supports the following properties:
     *   - debug {Boolean} Enables some extra logging as well as some default callback handlers
     *   - onNotification {Function} Callback function that is passed the notification object
     *   - onRegister {Function} Callback function that is passed the registration object
     *   - onError {Function} Callback function that is passed the error object
     *   - pluginConfig {Object} Plugin configuration: https://github.com/phonegap/phonegap-plugin-push
     *
     * @param {object} config Configuration object
     * @return {Push} returns the called Push instantiation
     */
    Push.prototype.init = function (config) {
        if (config === void 0) { config = {}; }
        this._getPushPlugin();
        if (!config.pluginConfig) {
            config.pluginConfig = {};
        }
        if (core_1.IonicPlatform.device.isAndroid()) {
            // inject gcm key for PushPlugin
            if (!config.pluginConfig.android) {
                config.pluginConfig.android = {};
            }
            if (!config.pluginConfig.android.senderId) {
                config.pluginConfig.android.senderID = this.app.gcmKey;
            }
        }
        // Store Callbacks
        if (config.onRegister) {
            this.setRegisterCallback(config.onRegister);
        }
        if (config.onNotification) {
            this.setNotificationCallback(config.onNotification);
        }
        if (config.onError) {
            this.setErrorCallback(config.onError);
        }
        this._config = config;
        this._isReady = true;
        core_1.IonicPlatform.emitter.emit('push:ready', { 'config': this._config });
        return this;
    };
    Push.prototype.saveToken = function (token, options) {
        var _this = this;
        var deferred = new promise_1.DeferredPromise();
        var opts = options || {};
        if (token.token) {
            token = token.token;
        }
        var tokenData = {
            'token': token,
            'app_id': core_1.IonicPlatform.config.get('app_id')
        };
        if (!opts.ignore_user) {
            var user = user_1.User.current();
            if (user.isAuthenticated()) {
                tokenData.user_id = user.id;
            }
        }
        if (!this._blockSaveToken) {
            this.client.post('/push/tokens')
                .send(tokenData)
                .end(function (err, res) {
                if (err) {
                    _this._blockSaveToken = false;
                    _this.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    _this._blockSaveToken = false;
                    _this.logger.info('saved push token: ' + token);
                    if (tokenData.user_id) {
                        _this.logger.info('added push token to user: ' + tokenData.user_id);
                    }
                    deferred.resolve(true);
                }
            });
        }
        else {
            this.logger.info('a token save operation is already in progress.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    /**
     * Registers the device with GCM/APNS to get a device token
     * Fires off the 'onRegister' callback if one has been provided in the init() config
     * @param {function} callback Callback Function
     * @return {void}
     */
    Push.prototype.register = function (callback) {
        this.logger.info('register');
        var self = this;
        if (this._blockRegistration) {
            self.logger.info('another registration is already in progress.');
            return;
        }
        this._blockRegistration = true;
        this.onReady(function () {
            if (self.app.devPush) {
                var IonicDevPush = new push_dev_1.PushDevService();
                self._debugCallbackRegistration();
                self._callbackRegistration();
                IonicDevPush.init(self, callback);
                self._blockRegistration = false;
                self._tokenReady = true;
            }
            else {
                self._plugin = self._getPushPlugin().init(self._config.pluginConfig);
                self._plugin.on('registration', function (data) {
                    self._blockRegistration = false;
                    self.token = new push_token_1.PushToken(data.registrationId);
                    self._tokenReady = true;
                    if ((typeof callback === 'function')) {
                        callback(self._token);
                    }
                });
                self._debugCallbackRegistration();
                self._callbackRegistration();
            }
            self._registered = true;
        });
    };
    /**
     * Invalidate the current GCM/APNS token
     */
    Push.prototype.unregister = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        var platform = null;
        if (core_1.IonicPlatform.device.isAndroid()) {
            platform = 'android';
        }
        else if (core_1.IonicPlatform.device.isIOS()) {
            platform = 'ios';
        }
        if (!platform) {
            deferred.reject('Could not detect the platform, are you on a device?');
        }
        if (!self._blockUnregister) {
            if (this._plugin) {
                this._plugin.unregister(function () { }, function () { });
            }
            this.client.post('/push/tokens/invalidate')
                .send({
                'platform': platform,
                'token': self.getStorageToken().token
            })
                .end(function (err, res) {
                if (err) {
                    self._blockUnregister = false;
                    self.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    self._blockUnregister = false;
                    self.logger.info('unregistered push token: ' + self.getStorageToken().token);
                    self.clearStorageToken();
                    deferred.resolve(res);
                }
            });
        }
        else {
            self.logger.info('an unregister operation is already in progress.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    /**
     * Convenience method to grab the payload object from a notification
     *
     * @param {PushNotification} notification Push Notification object
     * @return {object} Payload object or an empty object
     */
    Push.prototype.getPayload = function (notification) {
        return notification.payload;
    };
    /**
     * Set the registration callback
     *
     * @param {function} callback Registration callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    Push.prototype.setRegisterCallback = function (callback) {
        if (typeof callback !== 'function') {
            this.logger.info('setRegisterCallback() requires a valid callback function');
            return false;
        }
        this.registerCallback = callback;
        return true;
    };
    /**
     * Set the notification callback
     *
     * @param {function} callback Notification callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    Push.prototype.setNotificationCallback = function (callback) {
        if (typeof callback !== 'function') {
            this.logger.info('setNotificationCallback() requires a valid callback function');
            return false;
        }
        this.notificationCallback = callback;
        return true;
    };
    /**
     * Set the error callback
     *
     * @param {function} callback Error callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    Push.prototype.setErrorCallback = function (callback) {
        if (typeof callback !== 'function') {
            this.logger.info('setErrorCallback() requires a valid callback function');
            return false;
        }
        this.errorCallback = callback;
        return true;
    };
    Push.prototype._debugRegistrationCallback = function () {
        var self = this;
        function callback(data) {
            self.token = new push_token_1.PushToken(data.registrationId);
            self.logger.info('(debug) device token registered: ' + self._token);
        }
        return callback;
    };
    Push.prototype._debugNotificationCallback = function () {
        var self = this;
        function callback(notification) {
            self._processNotification(notification);
            var message = push_message_1.PushMessage.fromPluginJSON(notification);
            self.logger.info('(debug) notification received: ' + message);
            if (!self.notificationCallback && self.app.devPush) {
                alert(message.text);
            }
        }
        return callback;
    };
    Push.prototype._debugErrorCallback = function () {
        var self = this;
        function callback(err) {
            self.logger.error('(debug) unexpected error occured.');
            self.logger.error(err);
        }
        return callback;
    };
    Push.prototype._registerCallback = function () {
        var self = this;
        function callback(data) {
            self.token = new push_token_1.PushToken(data.registrationId);
            if (self.registerCallback) {
                return self.registerCallback(self._token);
            }
        }
        return callback;
    };
    Push.prototype._notificationCallback = function () {
        var self = this;
        function callback(notification) {
            self._processNotification(notification);
            var message = push_message_1.PushMessage.fromPluginJSON(notification);
            if (self.notificationCallback) {
                return self.notificationCallback(message);
            }
        }
        return callback;
    };
    Push.prototype._errorCallback = function () {
        var self = this;
        function callback(err) {
            if (self.errorCallback) {
                return self.errorCallback(err);
            }
        }
        return callback;
    };
    /**
     * Registers the default debug callbacks with the PushPlugin when debug is enabled
     * Internal Method
     * @private
     * @return {void}
     */
    Push.prototype._debugCallbackRegistration = function () {
        if (this._config.debug) {
            if (!this.app.devPush) {
                this._plugin.on('registration', this._debugRegistrationCallback());
                this._plugin.on('notification', this._debugNotificationCallback());
                this._plugin.on('error', this._debugErrorCallback());
            }
            else {
                if (!this._registered) {
                    core_1.IonicPlatform.emitter.on('push:token', this._debugRegistrationCallback());
                    core_1.IonicPlatform.emitter.on('push:notification', this._debugNotificationCallback());
                    core_1.IonicPlatform.emitter.on('push:error', this._debugErrorCallback());
                }
            }
        }
    };
    /**
     * Registers the user supplied callbacks with the PushPlugin
     * Internal Method
     * @return {void}
     */
    Push.prototype._callbackRegistration = function () {
        if (!this.app.devPush) {
            this._plugin.on('registration', this._registerCallback());
            this._plugin.on('notification', this._notificationCallback());
            this._plugin.on('error', this._errorCallback());
        }
        else {
            if (!this._registered) {
                core_1.IonicPlatform.emitter.on('push:token', this._registerCallback());
                core_1.IonicPlatform.emitter.on('push:notification', this._notificationCallback());
                core_1.IonicPlatform.emitter.on('push:error', this._errorCallback());
            }
        }
    };
    /**
     * Performs misc features based on the contents of a push notification
     * Internal Method
     *
     * Currently just does the payload $state redirection
     * @param {PushNotification} notification Push Notification object
     * @return {void}
     */
    Push.prototype._processNotification = function (notification) {
        this._notification = notification;
        core_1.IonicPlatform.emitter.emit('push:processNotification', notification);
    };
    /* Deprecated in favor of `getPushPlugin` */
    Push.prototype._getPushPlugin = function () {
        var self = this;
        var PushPlugin = null;
        try {
            PushPlugin = window.PushNotification;
        }
        catch (e) {
            self.logger.info('something went wrong looking for the PushNotification plugin');
        }
        if (!self.app.devPush && !PushPlugin && (core_1.IonicPlatform.device.isIOS() || core_1.IonicPlatform.device.isAndroid())) {
            self.logger.error('PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
        }
        return PushPlugin;
    };
    /**
     * Fetch the phonegap-push-plugin interface
     *
     * @return {PushNotification} PushNotification instance
     */
    Push.prototype.getPushPlugin = function () {
        return this._plugin;
    };
    /**
     * Fire a callback when Push is ready. This will fire immediately if
     * the service has already initialized.
     *
     * @param {function} callback Callback function to fire off
     * @return {void}
     */
    Push.prototype.onReady = function (callback) {
        var self = this;
        if (this._isReady) {
            callback(self);
        }
        else {
            core_1.IonicPlatform.emitter.on('push:ready', function () {
                callback(self);
            });
        }
    };
    return Push;
}());
exports.Push = Push;
