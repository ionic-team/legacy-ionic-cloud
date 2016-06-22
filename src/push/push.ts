import { ICore, IAuth, IPluginRegistration, IPluginNotification } from '../interfaces';
import { App } from '../app';
import { DeferredPromise } from '../promise';

import { PushToken } from './token';
import { PushMessage } from './message';

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

  app: App;
  plugin: any;

  private blockRegistration: boolean = false;
  private blockUnregister: boolean = false;
  private blockSaveToken: boolean = false;
  private registered: boolean = false;
  private tokenReady: boolean = false;

  private config: PushOptions;
  private _token: PushToken = null;

  constructor(
    config: PushOptions = {},
    public core: ICore,
    public auth: IAuth
  ) {
    this.core.emitter.once('device:ready', () => {
      this.init(config);
    });
  }

  get token() {
    return this._token;
  }

  set token(val) {
    var storage = this.core.storage;
    if (val instanceof PushToken) {
      storage.set('ionic_io_push_token', { 'token': val.token });
    }
    this._token = val;
  }

  getStorageToken(): PushToken {
    var storage = this.core.storage;
    var token = storage.get('ionic_io_push_token');
    if (token) {
      return new PushToken(token.token);
    }
    return null;
  }

  clearStorageToken(): void {
    var storage = this.core.storage;
    storage.delete('ionic_io_push_token');
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
    this.app = new App(this.core.config.get('app_id'));
    this.app.gcmKey = this.core.config.get('gcm_key');

    // Check for the required values to use this service
    if (!this.app.id) {
      this.core.logger.error('Ionic Push: no app_id found. (http://docs.ionic.io/docs/io-install)');
      return;
    } else if (this.core.device.isAndroid() && !this.app.gcmKey) {
      this.core.logger.error('Ionic Push: GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
      return;
    }

    if (!config.pluginConfig) { config.pluginConfig = {}; }

    if (this.core.device.isAndroid()) {
      // inject gcm key for PushPlugin
      if (!config.pluginConfig.android) { config.pluginConfig.android = {}; }
      if (!config.pluginConfig.android.senderId) { config.pluginConfig.android.senderID = this.app.gcmKey; }
    }

    this.config = config;
    this.core.emitter.emit('push:ready', { 'config': this.config });
  }

  saveToken(token: PushToken, options: SaveTokenOptions = {}): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    let tokenData: ServiceTokenData = {
      'token': token.token,
      'app_id': this.core.config.get('app_id')
    };

    if (!options.ignore_user) {
      let user = this.auth.userService.current();
      if (this.auth.isAuthenticated()) {
        tokenData.user_id = user.id;
      }
    }

    if (!this.blockSaveToken) {
      this.core.client.post('/push/tokens')
        .send(tokenData)
        .end((err, res) => {
          if (err) {
            this.blockSaveToken = false;
            this.core.logger.error('Ionic Push:', err);
            deferred.reject(err);
          } else {
            this.blockSaveToken = false;
            this.core.logger.info('Ionic Push: saved push token: ' + token);
            if (tokenData.user_id) {
              this.core.logger.info('Ionic Push: added push token to user: ' + tokenData.user_id);
            }
            deferred.resolve();
          }
        });
    } else {
      this.core.logger.info('Ionic Push: a token save operation is already in progress.');
      deferred.reject();
    }

    return deferred.promise;
  }

  /**
   * Registers the device with GCM/APNS to get a device token
   */
  register(callback: (token: PushToken) => void): void {
    this.core.logger.info('Ionic Push: register');
    if (this.blockRegistration) {
      this.core.logger.info('Ionic Push: another registration is already in progress.');
      return;
    }
    this.blockRegistration = true;
    this.core.emitter.once('push:ready', () => {
      let pushPlugin = this._getPushPlugin();

      if (pushPlugin) {
        this.plugin = pushPlugin.init(this.config.pluginConfig);
        this.plugin.on('registration', (data) => {
          this.blockRegistration = false;
          this.token = new PushToken(data.registrationId);
          this.tokenReady = true;
          if (typeof callback === 'function') {
            callback(this.token);
          }
        });
        this._callbackRegistration();
        this.registered = true;
      }
    });
  }

  /**
   * Invalidate the current GCM/APNS token
   */
  unregister(): Promise<any> {
    let deferred = new DeferredPromise();

    if (!this.blockUnregister) {
      let pushToken = this.getStorageToken();

      if (!pushToken) {
        deferred.resolve();
      } else {
        let tokenData: ServiceTokenData = {
          'token': pushToken.token,
          'app_id': this.core.config.get('app_id')
        };

        if (this.plugin) {
          this.plugin.unregister(function() {}, function() {});
        }
        this.core.client.post('/push/tokens/invalidate')
          .send(tokenData)
          .end((err, res) => {
            this.blockUnregister = false;

            if (err) {
              this.core.logger.error('Ionic Push:', err);
              deferred.reject(err);
            } else {
              this.core.logger.info('Ionic Push: unregistered push token: ' + pushToken.token);
              this.clearStorageToken();
              deferred.resolve();
            }
          });
      }
    } else {
      let msg = 'An unregister operation is already in progress.';
      this.core.logger.warn('Ionic Push: ' + msg);
      deferred.reject(new Error(msg));
    }

    this.blockUnregister = true;

    return deferred.promise;
  }

  /**
   * Registers callbacks with the PushPlugin
   */
  private _callbackRegistration() {
    this.plugin.on('registration', (data: IPluginRegistration) => {
      this.token = new PushToken(data.registrationId);

      if (this.config.debug) {
        this.core.logger.info('Ionic Push (debug): device token registered: ' + this.token);
      }

      this.core.emitter.emit('push:register', {'token': data.registrationId});
    });

    this.plugin.on('notification', (data: IPluginNotification) => {
      let message = PushMessage.fromPluginData(data);

      if (this.config.debug) {
        this.core.logger.info('Ionic Push (debug): notification received: ' + message);
      }

      this.core.emitter.emit('push:notification', {'message': message, 'raw': data});
    });

    this.plugin.on('error', (e: Error) => {
      if (this.config.debug) {
        this.core.logger.error('Ionic Push (debug): unexpected error occured.');
        this.core.logger.error('Ionic Push:', e);
      }

      this.core.emitter.emit('push:error', {'err': e});
    });
  }

  private _getPushPlugin() {
    let plugin = window.PushNotification;

    if (!plugin) {
      if (this.core.device.isIOS() || this.core.device.isAndroid()) {
        this.core.logger.error('Ionic Push: PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
      } else {
        this.core.logger.warn('Ionic Push: Disabled! Native push notifications will not work in a browser. Run your app on an actual device to use push.');
      }
    }

    return plugin;
  }
}
