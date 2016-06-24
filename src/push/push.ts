import { IConfig, IAuth, IDevice, IClient, IEventEmitter, IStorage, ILogger, IPluginRegistration, IPluginNotification } from '../definitions';
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

  private options: PushOptions;
  private _token: PushToken = null;

  constructor(
    options: PushOptions = {},
    public config: IConfig,
    public auth: IAuth,
    public device: IDevice,
    public client: IClient,
    public emitter: IEventEmitter,
    public storage: IStorage,
    public logger: ILogger
  ) {
    this.emitter.once('device:ready', () => {
      this.init(options);
    });
  }

  get token() {
    return this._token;
  }

  set token(val) {
    if (val instanceof PushToken) {
      this.storage.set('ionic_io_push_token', { 'token': val.token });
    }
    this._token = val;
  }

  getStorageToken(): PushToken {
    var token = this.storage.get('ionic_io_push_token');
    if (token) {
      return new PushToken(token.token);
    }
    return null;
  }

  clearStorageToken(): void {
    this.storage.delete('ionic_io_push_token');
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
  init(options: PushOptions = {}): void {
    this.app = new App(this.config.get('app_id'));
    this.app.gcmKey = this.config.get('gcm_key');

    // Check for the required values to use this service
    if (!this.app.id) {
      this.logger.error('Ionic Push: no app_id found. (http://docs.ionic.io/docs/io-install)');
      return;
    } else if (this.device.isAndroid() && !this.app.gcmKey) {
      this.logger.error('Ionic Push: GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
      return;
    }

    if (!options.pluginConfig) { options.pluginConfig = {}; }

    if (this.device.isAndroid()) {
      // inject gcm key for PushPlugin
      if (!options.pluginConfig.android) { options.pluginConfig.android = {}; }
      if (!options.pluginConfig.android.senderId) { options.pluginConfig.android.senderID = this.app.gcmKey; }
    }

    this.options = options;
    this.emitter.emit('push:ready', { 'options': this.options });
  }

  saveToken(token: PushToken, options: SaveTokenOptions = {}): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    let tokenData: ServiceTokenData = {
      'token': token.token,
      'app_id': this.config.get('app_id')
    };

    if (!options.ignore_user) {
      let user = this.auth.userService.current();
      if (this.auth.isAuthenticated()) {
        tokenData.user_id = user.id;
      }
    }

    if (!this.blockSaveToken) {
      this.client.post('/push/tokens')
        .send(tokenData)
        .end((err, res) => {
          if (err) {
            this.blockSaveToken = false;
            this.logger.error('Ionic Push:', err);
            deferred.reject(err);
          } else {
            this.blockSaveToken = false;
            this.logger.info('Ionic Push: saved push token: ' + token);
            if (tokenData.user_id) {
              this.logger.info('Ionic Push: added push token to user: ' + tokenData.user_id);
            }
            deferred.resolve();
          }
        });
    } else {
      this.logger.info('Ionic Push: a token save operation is already in progress.');
      deferred.reject();
    }

    return deferred.promise;
  }

  /**
   * Registers the device with GCM/APNS to get a device token
   */
  register(callback: (token: PushToken) => void): void {
    this.logger.info('Ionic Push: register');
    if (this.blockRegistration) {
      this.logger.info('Ionic Push: another registration is already in progress.');
      return;
    }
    this.blockRegistration = true;
    this.emitter.once('push:ready', () => {
      let pushPlugin = this._getPushPlugin();

      if (pushPlugin) {
        this.plugin = pushPlugin.init(this.options.pluginConfig);
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
          'app_id': this.config.get('app_id')
        };

        if (this.plugin) {
          this.plugin.unregister(function() {}, function() {});
        }
        this.client.post('/push/tokens/invalidate')
          .send(tokenData)
          .end((err, res) => {
            this.blockUnregister = false;

            if (err) {
              this.logger.error('Ionic Push:', err);
              deferred.reject(err);
            } else {
              this.logger.info('Ionic Push: unregistered push token: ' + pushToken.token);
              this.clearStorageToken();
              deferred.resolve();
            }
          });
      }
    } else {
      let msg = 'An unregister operation is already in progress.';
      this.logger.warn('Ionic Push: ' + msg);
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

      if (this.options.debug) {
        this.logger.info('Ionic Push (debug): device token registered: ' + this.token);
      }

      this.emitter.emit('push:register', {'token': data.registrationId});
    });

    this.plugin.on('notification', (data: IPluginNotification) => {
      let message = PushMessage.fromPluginData(data);

      if (this.options.debug) {
        this.logger.info('Ionic Push (debug): notification received: ' + message);
      }

      this.emitter.emit('push:notification', {'message': message, 'raw': data});
    });

    this.plugin.on('error', (e: Error) => {
      if (this.options.debug) {
        this.logger.error('Ionic Push (debug): unexpected error occured.');
        this.logger.error('Ionic Push:', e);
      }

      this.emitter.emit('push:error', {'err': e});
    });
  }

  private _getPushPlugin() {
    let plugin = window.PushNotification;

    if (!plugin) {
      if (this.device.isIOS() || this.device.isAndroid()) {
        this.logger.error('Ionic Push: PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
      } else {
        this.logger.warn('Ionic Push: Disabled! Native push notifications will not work in a browser. Run your app on an actual device to use push.');
      }
    }

    return plugin;
  }
}
