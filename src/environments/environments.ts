import { App } from '../core/app';
import { IonicPlatform } from '../core/core';
import { request } from '../core/request';
import { Logger } from '../core/logger';
import { DeferredPromise } from '../core/promise';

var appsAPIBase = IonicPlatform.config.getURL('platform-api') + '/apps';
var envAPIEndpoints = {
  'getEnv': function(appId, tag) {
    return '/apps/' + appId + '/env/' + tag;
  }
};

export class Environment {

  logger: Logger;
  tag: string;
  label: string;
  config: any;
  loaded: boolean;

  loadCallback: any;

  /**
   * Environment constructor
   *
   * @param {object} config Configuration object
   */
  constructor(config) {
    var self = this;
    IonicPlatform.onReady(() => {
      self.init(config);
    });
  }

  /**
   * Init method to setup environments
   *
   * The config supports the following properties:
   *   - env {String} The tag of an environment to load initially
   *   - onLoad {Function} Callback function that is passed the environment object when one is loaded
   *
   * @param {object} config Configuration object
   * @return {Environment} returns the called Push instantiation
   */
  public init(config) {
    this.logger = new Logger('Ionic Environments:');
    this.logger.info('initializing Environments');

    // Check for the required values to use this service
    if (!IonicPlatform.config.get('app_id')) {
      this.logger.error('no app_id found. (http://docs.ionic.io/docs/io-install)');
      return;
    }

    if (config['onLoad']) {
      this.loadCallback = config['onLoad'];
    } else {
      this.loadCallback = null;
    }

    this.initFromCache();
    if (config['env']) {
      this.load(config['env']);
    }

    return this;
  }

  /**
   * Get an environment var synchronously
   *
   * @param {string} key the environment variable
   * @return {any} the value
   */
  public get(key) {

    if (!this.loaded) {
      this.logger.warn('Environment is currently being loaded, use getAsync() if you wish to async load.');
    } else if (this.config[key]) {
      return this.config[key];
    }

    return null;
  }

  /**
   * Load an environment, calls loadEnvFromAPI
   *
   * @param {string} tag Environment tag
   * @return {DeferredPromise} will resolve/reject with the config object or error
   */
  public load(tag) {
    this.loaded = false;
    var self = this;

    this.loadEnvFromAPI(tag).then(function(env) {
      self.config = env['config'];
      self.label = env['label'];
      self.tag = env['tag'];
      self.loaded = true;
      self.dumpToCache();
      if (self.loadCallback) {
        self.loadCallback(self.config);
      }
    }, function(err) {
      self.logger.error(err);
    });
  }

  /**
   * Load an environment from the API
   *
   * @param {string} tag Environment tag
   * @return {DeferredPromise} will resolve/reject with the config object or error
   */
  private loadEnvFromAPI(tag) {
    var self = this;
    var deferred = new DeferredPromise();

    IonicPlatform.client.get(envAPIEndpoints.getEnv(IonicPlatform.config.get('app_id'), tag))
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else if (res.ok) {
          deferred.resolve(res.body.data);
        }
      });

    return deferred.promise;
  }

  /**
   * Get Environment cache key
   *
   * @return {string} cache key for localstorage cache
   */
  private getEnvCacheKey() {
    return IonicPlatform.config.get('app_id') + '-env-cached';
  }

  /**
   * Init the active environment from the localstorage cache
   */
  private initFromCache() {
    var env = IonicPlatform.storage.retrieveObject(this.getEnvCacheKey());
    if (env) {
      this.config = env['config'];
      this.label = env['label'];
      this.tag = env['tag'];
      this.loaded = true;
    }
  }

  /**
   * Dump the active environment to the localstorage cache
   */
  private dumpToCache() {
    var env = {
      'config': this.config,
      'label': this.label,
      'tag': this.tag,
    };

    IonicPlatform.storage.storeObject(this.getEnvCacheKey(), env);
  }
}
