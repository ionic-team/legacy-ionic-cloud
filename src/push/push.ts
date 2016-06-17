import { App } from '../core/app';
import { IonicCloud } from '../core/core';
import { Client } from '../core/client';
import { DeferredPromise } from '../core/promise';
import { User } from '../core/user';

import { PushToken } from './push-token';
import { PushMessage } from './push-message';

declare var window: any;
declare var PushNotification: any;

export interface PushOptions {
  debug?: boolean;
  pluginConfig?: any;
}

export interface SaveTokenOptions {
  ignore_user?: boolean;
}

interface ServiceTokenData {
  token: string;
  app_id: string;
  user_id?: string;
}

export class Push {

  client: Client;
  app: App;

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

    this._notification = false;
    this._debug = false;
    this._isReady = false;
    this._tokenReady = false;
    this._blockRegistration = false;
    this._blockSaveToken = false;
    this._registered = false;
    this._plugin = null;

    IonicCloud.onReady(() => {
      this.init(config);
    });
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
   *   - pluginConfig {Object} Plugin configuration: https://github.com/phonegap/phonegap-plugin-push
   *
   * @param {object} config Configuration object
   * @return {Push} returns the called Push instantiation
   */
  init(config: PushOptions = {}): void {
    this.app = new App(IonicCloud.config.get('app_id'));
    this.app.gcmKey = IonicCloud.config.get('gcm_key');

    // Check for the required values to use this service
    if (!this.app.id) {
      IonicCloud.logger.error('Ionic Push: no app_id found. (http://docs.ionic.io/docs/io-install)');
      return;
    } else if (IonicCloud.device.isAndroid() && !this.app.gcmKey) {
      IonicCloud.logger.error('Ionic Push: GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
      return;
    }

    this._getPushPlugin();
    if (!config.pluginConfig) { config.pluginConfig = {}; }

    if (IonicCloud.device.isAndroid()) {
      // inject gcm key for PushPlugin
      if (!config.pluginConfig.android) { config.pluginConfig.android = {}; }
      if (!config.pluginConfig.android.senderId) { config.pluginConfig.android.senderID = this.app.gcmKey; }
    }

    this._config = config;
    this._isReady = true;

    IonicCloud.emitter.emit('push:ready', { 'config': this._config });
  }

  saveToken(token: PushToken, options: SaveTokenOptions = {}): Promise<any> {
    let deferred = new DeferredPromise();

    let tokenData: ServiceTokenData = {
      'token': token.token,
      'app_id': IonicCloud.config.get('app_id')
    };

    if (!options.ignore_user) {
      let user = User.current();
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
   *
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
      self._plugin = self._getPushPlugin().init(self._config.pluginConfig);
      self._plugin.on('registration', function(data) {
        self._blockRegistration = false;
        self.token = new PushToken(data.registrationId);
        self._tokenReady = true;
        if (typeof callback === 'function') {
          callback(self._token);
        }
      });
      self._debugCallbackRegistration();
      self._callbackRegistration();
      self._registered = true;
    });
  }

  /**
   * Invalidate the current GCM/APNS token
   */
  unregister(): Promise<any> {
    let deferred = new DeferredPromise();

    if (!this._blockUnregister) {
      let tokenData: ServiceTokenData = {
        'token': this.getStorageToken().token,
        'app_id': IonicCloud.config.get('app_id')
      };

      if (this._plugin) {
        this._plugin.unregister(function() {}, function() {});
      }
      this.client.post('/push/tokens/invalidate')
        .send(tokenData)
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

  private _debugRegistrationCallback() {
    var self = this;
    function callback(data) {
      self.token = new PushToken(data.registrationId);
      IonicCloud.logger.info('Ionic Push: (debug) device token registered: ' + self._token);
    }
    return callback;
  }

  private _debugNotificationCallback() {
    var self = this;
    function callback(notification) {
      self._processNotification(notification);
      var message = PushMessage.fromPluginJSON(notification);
      IonicCloud.logger.info('Ionic Push: (debug) notification received: ' + message);
    }
    return callback;
  }

  private _debugErrorCallback() {
    function callback(err) {
      IonicCloud.logger.error('Ionic Push: (debug) unexpected error occured.');
      IonicCloud.logger.error('Ionic Push:', err);
    }
    return callback;
  }

  /**
   * Registers callbacks with the PushPlugin
   */
  private _callbackRegistration() {
    this._plugin.on('registration', (data) => { IonicCloud.emitter.emit('push:register', { 'token': data.registrationId }); });
    this._plugin.on('notification', (data) => { IonicCloud.emitter.emit('push:notification', data); });
    this._plugin.on('error', (e) => { IonicCloud.emitter.emit('push:error', { 'err': e }); });
  }

  /**
   * Registers the default debug callbacks with the PushPlugin when debug is enabled
   * Internal Method
   * @private
   * @return {void}
   */
  private _debugCallbackRegistration() {
    if (this._config.debug) {
      this._plugin.on('registration', this._debugRegistrationCallback());
      this._plugin.on('notification', this._debugNotificationCallback());
      this._plugin.on('error', this._debugErrorCallback());
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
  private _processNotification(notification) {
    this._notification = notification;
    IonicCloud.emitter.emit('push:processNotification', notification);
  }

  /* Deprecated in favor of `getPushPlugin` */
  private _getPushPlugin() {
    let plugin = window.PushNotification;

    if (!plugin && (IonicCloud.device.isIOS() || IonicCloud.device.isAndroid())) {
      IonicCloud.logger.error('Ionic Push: PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
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
