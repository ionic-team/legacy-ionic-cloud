"use strict";
var promise_1 = require("../promise");
var message_1 = require("./message");
/**
 * `Push` handles push notifications for this app.
 *
 * @featured
 */
var Push = (function () {
    function Push(deps, options) {
        if (options === void 0) { options = {}; }
        this.options = options;
        /**
         * @private
         */
        this.blockRegistration = false;
        /**
         * @private
         */
        this.blockUnregister = false;
        /**
         * @private
         */
        this.blockSaveToken = false;
        /**
         * @private
         */
        this._registered = false;
        this.config = deps.config;
        this.auth = deps.auth;
        this.userService = deps.userService;
        this.device = deps.device;
        this.client = deps.client;
        this.emitter = deps.emitter;
        this.storage = deps.storage;
        this.logger = deps.logger;
        // Check for the required values to use this service
        if (this.device.isAndroid() && !this.options.sender_id) {
            this.logger.error('Ionic Push: GCM project number not found (https://docs.ionic.io/services/push/)');
            return;
        }
        if (!options.pluginConfig) {
            options.pluginConfig = {};
        }
        if (this.device.isAndroid()) {
            // inject gcm key for PushPlugin
            if (!options.pluginConfig.android) {
                options.pluginConfig.android = {};
            }
            if (!options.pluginConfig.android.senderID) {
                options.pluginConfig.android.senderID = this.options.sender_id;
            }
        }
        this.options = options;
    }
    Object.defineProperty(Push.prototype, "token", {
        get: function () {
            if (!this._token) {
                this._token = this.storage.get('push_token') || undefined;
            }
            return this._token;
        },
        set: function (val) {
            if (!val) {
                this.storage.delete('push_token');
            }
            else {
                this.storage.set('push_token', val);
            }
            this._token = val;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Push.prototype, "registered", {
        get: function () {
            return this._registered;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Register a token with the API.
     *
     * When a token is saved, you can send push notifications to it. If a user is
     * logged in, the token is linked to them by their ID.
     *
     * @param token - The token.
     * @param options
     */
    Push.prototype.saveToken = function (token, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        var deferred = new promise_1.DeferredPromise();
        var tokenData = {
            'token': token.token,
            'app_id': this.config.get('app_id')
        };
        if (!options.ignore_user) {
            var user = this.userService.current();
            if (this.auth.isAuthenticated()) {
                tokenData.user_id = user.id;
            }
        }
        if (this.blockSaveToken) {
            return deferred.reject(new Error('A token save operation is already in progress.'));
        }
        this.client.post('/push/tokens')
            .send(tokenData)
            .end(function (err, res) {
            if (err) {
                _this.blockSaveToken = false;
                _this.logger.error('Ionic Push:', err);
                deferred.reject(err);
            }
            else {
                _this.blockSaveToken = false;
                _this.logger.info('Ionic Push: saved push token: ' + token.token);
                if (tokenData.user_id) {
                    _this.logger.info('Ionic Push: added push token to user: ' + tokenData.user_id);
                }
                token.id = res.body.data.id;
                token.type = res.body.data.type;
                token.saved = true;
                deferred.resolve(token);
            }
        });
        return deferred.promise;
    };
    /**
     * Registers the device with GCM/APNS to get a push token.
     *
     * After a device is registered, you will likely want to save the token with
     * [`saveToken()`](/api/client/push/#saveToken) to the API.
     */
    Push.prototype.register = function () {
        var _this = this;
        var deferred = new promise_1.DeferredPromise();
        if (this.blockRegistration) {
            return deferred.reject(new Error('Another registration is already in progress.'));
        }
        this.blockRegistration = true;
        this.emitter.once('device:ready', function () {
            var pushPlugin = _this._getPushPlugin();
            if (pushPlugin) {
                _this.plugin = pushPlugin.init(_this.options.pluginConfig);
                _this.plugin.on('registration', function (data) {
                    _this.blockRegistration = false;
                    _this.token = { 'token': data.registrationId, 'registered': false, 'saved': false };
                    _this.token.registered = true;
                    deferred.resolve(_this.token);
                });
                _this.plugin.on('error', function (err) {
                    _this.logger.error('Ionic Push:', err);
                    deferred.reject(err);
                });
                _this._callbackRegistration();
                _this._registered = true;
            }
            else {
                deferred.reject(new Error('Push plugin not found! See logs.'));
            }
        });
        return deferred.promise;
    };
    /**
     * Invalidate the current push token.
     */
    Push.prototype.unregister = function () {
        var _this = this;
        var deferred = new promise_1.DeferredPromise();
        if (this.blockUnregister) {
            return deferred.reject(new Error('An unregister operation is already in progress.'));
        }
        var pushToken = this.token;
        if (!pushToken) {
            return deferred.resolve();
        }
        var tokenData = {
            'token': pushToken.token,
            'app_id': this.config.get('app_id')
        };
        if (this.plugin) {
            this.plugin.unregister(function () {
                this._registered = false;
            }, function () { });
        }
        this.client.post('/push/tokens/invalidate')
            .send(tokenData)
            .end(function (err, res) {
            _this.blockUnregister = false;
            if (err) {
                _this.logger.error('Ionic Push:', err);
                deferred.reject(err);
            }
            else {
                _this.logger.info('Ionic Push: unregistered push token');
                delete _this.token;
                deferred.resolve();
            }
        });
        this.blockUnregister = true;
        return deferred.promise;
    };
    /**
     * Checks whether the push notification permission has been granted.
     */
    Push.prototype.hasPermission = function () {
        var _this = this;
        this.emitter.once('device:ready', function () {
            var pushPlugin = _this._getPushPlugin();
            if (pushPlugin) {
                pushPlugin.hasPermission(function (data) {
                    return data.isEnabled;
                });
            }
        });
        return false;
    };
    /**
     * @private
     */
    Push.prototype._callbackRegistration = function () {
        var _this = this;
        this.plugin.on('registration', function (data) {
            if (_this.options.debug) {
                _this.logger.info('Ionic Push (debug): device token registered: ' + _this.token);
            }
            _this.emitter.emit('push:register', _this.token);
        });
        this.plugin.on('notification', function (data) {
            var message = message_1.PushMessage.fromPluginData(data);
            if (_this.options.debug) {
                _this.logger.info('Ionic Push (debug): notification received: ' + message);
            }
            _this.emitter.emit('push:notification', { 'message': message, 'raw': data });
        });
        this.plugin.on('error', function (e) {
            if (_this.options.debug) {
                _this.logger.error('Ionic Push (debug): unexpected error occured.');
                _this.logger.error('Ionic Push:', e);
            }
            _this.emitter.emit('push:error', { 'err': e });
        });
    };
    /**
     * @private
     */
    Push.prototype._getPushPlugin = function () {
        var plugin = window.PushNotification;
        if (!plugin) {
            if (this.device.isIOS() || this.device.isAndroid()) {
                this.logger.error('Ionic Push: PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
            }
            else {
                this.logger.warn('Ionic Push: Disabled! Native push notifications will not work in a browser. Run your app on an actual device to use push.');
            }
        }
        return plugin;
    };
    return Push;
}());
exports.Push = Push;
