import {
  IAuth,
  IClient,
  IConfig,
  IDevice,
  IEventEmitter,
  ILogger,
  IPush,
  ISingleUserService,
  IStorage,
  PushDependencies,
  PushOptions,
  PushPluginNotification,
  PushPluginRegistration,
  PushSaveTokenOptions,
  PushToken
} from '../definitions';

import { DeferredPromise } from '../promise';

import { PushMessage } from './message';

declare var window: any;
declare var PushNotification: any;

interface ServiceTokenData {
  token: string;
  app_id: string;
  user_id?: string;
}

/**
 * `Push` handles push notifications for this app.
 *
 * @featured
 */
export class Push implements IPush {

  /**
   * The push plugin (window.PushNotification).
   */
  public plugin: any;

  /**
   * @private
   */
  private config: IConfig;

  /**
   * @private
   */
  private auth: IAuth;

  /**
   * @private
   */
  private userService: ISingleUserService;

  /**
   * @private
   */
  private device: IDevice;

  /**
   * @private
   */
  private client: IClient;

  /**
   * @private
   */
  private emitter: IEventEmitter;

  /**
   * @private
   */
  private storage: IStorage<PushToken>;

  /**
   * @private
   */
  private logger: ILogger;

  /**
   * @private
   */
  private blockRegistration: boolean = false;

  /**
   * @private
   */
  private blockUnregister: boolean = false;

  /**
   * @private
   */
  private blockSaveToken: boolean = false;

  /**
   * @private
   */
  private registered: boolean = false;

  /**
   * @private
   */
  private _token: PushToken;

  constructor(
    deps: PushDependencies,
    public options: PushOptions = {}
  ) {
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
      this.logger.error('Ionic Push: GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
      return;
    }

    if (!options.pluginConfig) { options.pluginConfig = {}; }

    if (this.device.isAndroid()) {
      // inject gcm key for PushPlugin
      if (!options.pluginConfig.android) { options.pluginConfig.android = {}; }
      if (!options.pluginConfig.android.senderID) { options.pluginConfig.android.senderID = this.options.sender_id; }
    }

    this.options = options;
  }

  public get token(): PushToken {
    if (!this._token) {
      this._token = this.storage.get('push_token');
    }

    return this._token;
  }

  public set token(val: PushToken) {
    if (!val) {
      this.storage.delete('push_token');
    } else {
      this.storage.set('push_token', val);
    }

    this._token = val;
  }

  /**
   * Register a token with the API.
   *
   * When a token is saved, you can send push notifications to it. If a user is
   * logged in, the token is linked to them by their ID.
   *
   * @param token - The token.
   * @param options
   */
  public saveToken(token: PushToken, options: PushSaveTokenOptions = {}): Promise<PushToken> {
    let deferred = new DeferredPromise<PushToken, Error>();

    let tokenData: ServiceTokenData = {
      'token': token.token,
      'app_id': this.config.get('app_id')
    };

    if (!options.ignore_user) {
      let user = this.userService.current();
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
            this.logger.info('Ionic Push: saved push token: ' + token.token);
            if (tokenData.user_id) {
              this.logger.info('Ionic Push: added push token to user: ' + tokenData.user_id);
            }
            token.id = res.body.data.id;
            token.type = res.body.data.type;
            token.saved = true;
            deferred.resolve(token);
          }
        });
    } else {
      deferred.reject(new Error('A token save operation is already in progress.'));
    }

    return deferred.promise;
  }

  /**
   * Registers the device with GCM/APNS to get a push token.
   *
   * After a device is registered, you will likely want to save the token with
   * [`saveToken()`](/api/client/push/#saveToken) to the API.
   */
  public register(): Promise<PushToken> {
    let deferred = new DeferredPromise<PushToken, Error>();

    if (this.blockRegistration) {
      deferred.reject(new Error('Another registration is already in progress.'));
    } else {
      this.blockRegistration = true;
      this.emitter.once('device:ready', () => {
        let pushPlugin = this._getPushPlugin();

        if (pushPlugin) {
          this.plugin = pushPlugin.init(this.options.pluginConfig);
          this.plugin.on('registration', (data) => {
            this.blockRegistration = false;
            this.token = { 'token': data.registrationId };
            this.token.registered = true;
            deferred.resolve(this.token);
          });
          this.plugin.on('error', function (err) {
            this.logger.error('Ionic Push: ', err);
            deferred.reject(new Error('Push plugin failed to initialize! See logs.'));
          });
          this._callbackRegistration();
          this.registered = true;
        } else {
          deferred.reject(new Error('Push plugin not found! See logs.'));
        }
      });
    }

    return deferred.promise;
  }

  /**
   * Invalidate the current push token.
   */
  public unregister(): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (!this.blockUnregister) {
      let pushToken = this.token;

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
              this.token = null;
              deferred.resolve();
            }
          });
      }
    } else {
      deferred.reject(new Error('An unregister operation is already in progress.'));
    }

    this.blockUnregister = true;

    return deferred.promise;
  }

  /**
   * @private
   */
  private _callbackRegistration() {
    this.plugin.on('registration', (data: PushPluginRegistration) => {
      this.token = { 'token': data.registrationId };

      if (this.options.debug) {
        this.logger.info('Ionic Push (debug): device token registered: ' + this.token);
      }

      this.emitter.emit('push:register', this.token);
    });

    this.plugin.on('notification', (data: PushPluginNotification) => {
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

  /**
   * @private
   */
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
