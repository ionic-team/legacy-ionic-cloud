import { App } from '../core/app';
import { IonicCloud } from '../core/core';
import { Client } from '../core/client';
import { DeferredPromise } from '../core/promise';
import { User } from '../core/user';

import { PushToken } from './push-token';
import { PushMessage } from './push-message';
import { PushDevService } from './push-dev';

declare var window: any;
declare var PushNotification: any;

export interface PushOptions {
  debug?: boolean;
  deferInit?: boolean;
  pluginConfig?: any;
  onRegister?: (token: PushToken) => any;
  onNotification?: (message: PushMessage) => any;
  onError?: (err) => any;
}

export interface SaveTokenOptions {
  ignore_user?: boolean;
}

export class Push {

  client: Client;
  app: App;

  registerCallback: any;
  notificationCallback: any;
  errorCallback: any;

  private _debug: boolean;
  private _isReady: boolean;
  private _blockRegistration: boolean;
  private _blockUnregister: boolean;
  private _blockSaveToken: boolean;
  private _notification: any;
  private _registered: boolean;
  private _tokenReady: boolean;
  private _plugin: any;
  private _config: PushOptions;
  private _token: PushToken = null;

  constructor(config: PushOptions = {}) {
    this.client = IonicCloud.client;

    var app = new App(IonicCloud.config.get('app_id'));
    app.devPush = IonicCloud.config.get('dev_push');
    app.gcmKey = IonicCloud.config.get('gcm_key');

    // Check for the required values to use this service
    if (!app.id) {
      IonicCloud.logger.error('Ionic Push: no app_id found. (http://docs.ionic.io/docs/io-install)');
      return;
    } else if (IonicCloud.device.isAndroid() && !app.devPush && !app.gcmKey) {
      IonicCloud.logger.error('Ionic Push: GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
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

    if (!config.deferInit) {
      IonicCloud.onReady(() => {
        this.init(config);
      });
    }
  }

  set token(val) {
    var storage = IonicCloud.storage;
    if (val instanceof PushToken) {
      storage.storeObject('ionic_io_push_token', { 'token': val.token });
    }
    this._token = val;
  }

  getStorageToken(): PushToken {
    var storage = IonicCloud.storage;
    var token = storage.retrieveObject('ionic_io_push_token');
    if (token) {
      return new PushToken(token.token);
    }
    return null;
  }

  clearStorageToken(): void {
    var storage = IonicCloud.storage;
    storage.deleteObject('ionic_io_push_token');
  }

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
  init(config: PushOptions = {}): void {
    this._getPushPlugin();
    if (!config.pluginConfig) { config.pluginConfig = {}; }

    if (IonicCloud.device.isAndroid()) {
      // inject gcm key for PushPlugin
      if (!config.pluginConfig.android) { config.pluginConfig.android = {}; }
      if (!config.pluginConfig.android.senderId) { config.pluginConfig.android.senderID = this.app.gcmKey; }
    }

    // Store Callbacks
    if (config.onRegister) { this.setRegisterCallback(config.onRegister); }
    if (config.onNotification) { this.setNotificationCallback(config.onNotification); }
    if (config.onError) { this.setErrorCallback(config.onError); }

    this._config = config;
    this._isReady = true;

    IonicCloud.emitter.emit('push:ready', { 'config': this._config });
  }

  saveToken(token: PushToken, options: SaveTokenOptions = {}): Promise<any> {
    var deferred = new DeferredPromise();

    interface TokenData {
      token: string;
      app_id: string;
      user_id?: string;
    }

    var tokenData: TokenData = {
      'token': token.token,
      'app_id': IonicCloud.config.get('app_id')
    };

    if (!options.ignore_user) {
      var user = User.current();
      if (user.isAuthenticated()) {
        tokenData.user_id = user.id;
      }
    }

    if (!this._blockSaveToken) {
      this.client.post('/push/tokens')
        .send(tokenData)
        .end((err, res) => {
          if (err) {
            this._blockSaveToken = false;
            IonicCloud.logger.error('Ionic Push:', err);
            deferred.reject(err);
          } else {
            this._blockSaveToken = false;
            IonicCloud.logger.info('Ionic Push: saved push token: ' + token);
            if (tokenData.user_id) {
              IonicCloud.logger.info('Ionic Push: added push token to user: ' + tokenData.user_id);
            }
            deferred.resolve(true);
          }
        });
    } else {
      IonicCloud.logger.info('Ionic Push: a token save operation is already in progress.');
      deferred.reject(false);
    }

    return deferred.promise;
  }

  /**
   * Registers the device with GCM/APNS to get a device token
   * Fires off the 'onRegister' callback if one has been provided in the init() config
   * @param {function} callback Callback Function
   * @return {void}
   */
  register(callback: (token: PushToken) => void): void {
    IonicCloud.logger.info('Ionic Push: register');
    var self = this;
    if (this._blockRegistration) {
      IonicCloud.logger.info('Ionic Push: another registration is already in progress.');
      return;
    }
    this._blockRegistration = true;
    this.onReady(function() {
      if (self.app.devPush) {
        var IonicDevPush = new PushDevService();
        self._debugCallbackRegistration();
        self._callbackRegistration();
        IonicDevPush.init(self, callback);
        self._blockRegistration = false;
        self._tokenReady = true;
      } else {
        self._plugin = self._getPushPlugin().init(self._config.pluginConfig);
        self._plugin.on('registration', function(data) {
          self._blockRegistration = false;
          self.token = new PushToken(data.registrationId);
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
  }

  /**
   * Invalidate the current GCM/APNS token
   */
  unregister(): Promise<any> {
    var deferred = new DeferredPromise();
    var platform = null;

    if (IonicCloud.device.isAndroid()) {
      platform = 'android';
    } else if (IonicCloud.device.isIOS()) {
      platform = 'ios';
    }

    if (!platform) {
      deferred.reject('Could not detect the platform, are you on a device?');
    }

    if (!this._blockUnregister) {
      if (this._plugin) {
        this._plugin.unregister(function() {}, function() {});
      }
      this.client.post('/push/tokens/invalidate')
        .send({
          'platform': platform,
          'token': this.getStorageToken().token
        })
        .end((err, res) => {
          if (err) {
            this._blockUnregister = false;
            IonicCloud.logger.error('Ionic Push:', err);
            deferred.reject(err);
          } else {
            this._blockUnregister = false;
            IonicCloud.logger.info('Ionic Push: unregistered push token: ' + this.getStorageToken().token);
            this.clearStorageToken();
            deferred.resolve(res);
          }
        });
    } else {
      IonicCloud.logger.info('Ionic Push: an unregister operation is already in progress.');
      deferred.reject(false);
    }

    return deferred.promise;
  }

  /**
   * Convenience method to grab the payload object from a notification
   *
   * @param {PushNotification} notification Push Notification object
   * @return {object} Payload object or an empty object
   */
  getPayload(notification) {
    return notification.payload;
  }

  /**
   * Set the registration callback
   *
   * @param {function} callback Registration callback function
   * @return {boolean} true if set correctly, otherwise false
   */
  setRegisterCallback(callback) {
    if (typeof callback !== 'function') {
      IonicCloud.logger.info('Ionic Push: setRegisterCallback() requires a valid callback function');
      return false;
    }
    this.registerCallback = callback;
    return true;
  }

  /**
   * Set the notification callback
   *
   * @param {function} callback Notification callback function
   * @return {boolean} true if set correctly, otherwise false
   */
  setNotificationCallback(callback) {
    if (typeof callback !== 'function') {
      IonicCloud.logger.info('Ionic Push: setNotificationCallback() requires a valid callback function');
      return false;
    }
    this.notificationCallback = callback;
    return true;
  }

  /**
   * Set the error callback
   *
   * @param {function} callback Error callback function
   * @return {boolean} true if set correctly, otherwise false
   */
  setErrorCallback(callback) {
    if (typeof callback !== 'function') {
      IonicCloud.logger.info('Ionic Push: setErrorCallback() requires a valid callback function');
      return false;
    }
    this.errorCallback = callback;
    return true;
  }

  _debugRegistrationCallback() {
    var self = this;
    function callback(data) {
      self.token = new PushToken(data.registrationId);
      IonicCloud.logger.info('Ionic Push: (debug) device token registered: ' + self._token);
    }
    return callback;
  }

  _debugNotificationCallback() {
    var self = this;
    function callback(notification) {
      self._processNotification(notification);
      var message = PushMessage.fromPluginJSON(notification);
      IonicCloud.logger.info('Ionic Push: (debug) notification received: ' + message);
      if (!self.notificationCallback && self.app.devPush) {
        alert(message.text);
      }
    }
    return callback;
  }

  _debugErrorCallback() {
    function callback(err) {
      IonicCloud.logger.error('Ionic Push: (debug) unexpected error occured.');
      IonicCloud.logger.error('Ionic Push:', err);
    }
    return callback;
  }

  _registerCallback() {
    var self = this;
    function callback(data) {
      self.token = new PushToken(data.registrationId);
      if (self.registerCallback) {
        return self.registerCallback(self._token);
      }
    }
    return callback;
  }

  _notificationCallback() {
    var self = this;
    function callback(notification) {
      self._processNotification(notification);
      var message = PushMessage.fromPluginJSON(notification);
      if (self.notificationCallback) {
        return self.notificationCallback(message);
      }
    }
    return callback;
  }

  _errorCallback() {
    var self = this;
    function callback(err) {
      if (self.errorCallback) {
        return self.errorCallback(err);
      }
    }
    return callback;
  }

  /**
   * Registers the default debug callbacks with the PushPlugin when debug is enabled
   * Internal Method
   * @private
   * @return {void}
   */
  _debugCallbackRegistration() {
    if (this._config.debug) {
      if (!this.app.devPush) {
        this._plugin.on('registration', this._debugRegistrationCallback());
        this._plugin.on('notification', this._debugNotificationCallback());
        this._plugin.on('error', this._debugErrorCallback());
      } else {
        if (!this._registered) {
          IonicCloud.emitter.on('push:token', this._debugRegistrationCallback());
          IonicCloud.emitter.on('push:notification', this._debugNotificationCallback());
          IonicCloud.emitter.on('push:error', this._debugErrorCallback());
        }
      }
    }
  }

  /**
   * Registers the user supplied callbacks with the PushPlugin
   * Internal Method
   * @return {void}
   */
  _callbackRegistration() {
    if (!this.app.devPush) {
      this._plugin.on('registration', this._registerCallback());
      this._plugin.on('notification', this._notificationCallback());
      this._plugin.on('error', this._errorCallback());
    } else {
      if (!this._registered) {
        IonicCloud.emitter.on('push:token', this._registerCallback());
        IonicCloud.emitter.on('push:notification', this._notificationCallback());
        IonicCloud.emitter.on('push:error', this._errorCallback());
      }
    }
  }

  /**
   * Performs misc features based on the contents of a push notification
   * Internal Method
   *
   * Currently just does the payload $state redirection
   * @param {PushNotification} notification Push Notification object
   * @return {void}
   */
  _processNotification(notification) {
    this._notification = notification;
    IonicCloud.emitter.emit('push:processNotification', notification);
  }

  /* Deprecated in favor of `getPushPlugin` */
  _getPushPlugin() {
    let plugin = window.PushNotification;

    if (!this.app.devPush && !plugin) {
      if (IonicCloud.device.isIOS() || IonicCloud.device.isAndroid()) {
        IonicCloud.logger.error('Ionic Push: PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
      } else {
        IonicCloud.logger.info('Ionic Push: PushNotification plugin not found. Native push notifications won\'t work in the browser.');
      }
    }

    return plugin;
  }

  /**
   * Fetch the phonegap-push-plugin interface
   *
   * @return {PushNotification} PushNotification instance
   */
  getPushPlugin() {
    return this._plugin;
  }

  /**
   * Fire a callback when Push is ready. This will fire immediately if
   * the service has already initialized.
   *
   * @param {function} callback Callback function to fire off
   * @return {void}
   */
  onReady(callback) {
    var self = this;
    if (this._isReady) {
      callback(self);
    } else {
      IonicCloud.emitter.on('push:ready', function() {
        callback(self);
      });
    }
  }

}
