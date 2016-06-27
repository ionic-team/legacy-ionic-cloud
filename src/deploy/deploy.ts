import { IConfig, IEventEmitter, ILogger, IDeploy, DeployWatchOptions, DeployDownloadOptions, DeployExtractOptions, DeployUpdateOptions, DeployDependencies, DeployOptions } from '../definitions';
import { DeferredPromise } from '../promise';

declare var window: any;
declare var IonicDeploy: any;

const NO_PLUGIN = new Error('Missing deploy plugin: `ionic-plugin-deploy`');
const INITIAL_DELAY = 1 * 5 * 1000;
const WATCH_INTERVAL = 1 * 60 * 1000;

export class Deploy implements IDeploy {

  public config: IConfig;
  public emitter: IEventEmitter;
  public logger: ILogger;

  private _plugin: any;
  private _channelTag: string = 'production';
  private _checkTimeout: any;

  constructor(
    deps: DeployDependencies,
    options: DeployOptions = {}
  ) {
    this.config = deps.config;
    this.emitter = deps.emitter;
    this.logger = deps.logger;

    this.emitter.once('device:ready', () => {
      if (this._getPlugin()) {
        this._plugin.init(this.config.get('app_id'), this.config.getURL('api'));
      }

      this.emitter.emit('deploy:ready');
    });
  }

  /**
   * Fetch the Deploy Plugin
   *
   * If the plugin has not been set yet, attempt to fetch it, otherwise log
   * a message.
   *
   * @return {IonicDeploy} Returns the plugin or false
   */
  _getPlugin() {
    if (typeof window.IonicDeploy === 'undefined') {
      this.logger.warn('Ionic Deploy: Disabled! Deploy plugin is not installed or has not loaded. Have you run `ionic plugin add ionic-plugin-deploy` yet?');
      return;
    }
    if (!this._plugin) {
      this._plugin = window.IonicDeploy;
    }
    return this._plugin;
  }

  /**
   * Check for updates
   *
   * @return {Promise} Will resolve with true if an update is available, false otherwise. A string or
   *   error will be passed to reject() in the event of a failure.
   */
  check(): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.check(this.config.get('app_id'), this._channelTag, (result) => {
          if (result && result === 'true') {
            this.logger.info('Ionic Deploy: an update is available');
            deferred.resolve(true);
          } else {
            this.logger.info('Ionic Deploy: no updates available');
            deferred.resolve(false);
          }
        }, (error) => {
          this.logger.error('Ionic Deploy: encountered an error while checking for updates');
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Download and available update
   *
   * This should be used in conjunction with extract()
   * @return {Promise} The promise which will resolve with true/false.
   */
  download(options: DeployDownloadOptions = {}): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.download(this.config.get('app_id'), (result) => {
          if (result !== 'true' && result !== 'false') {
            if (options.onProgress) {
              options.onProgress(result);
            }
          } else {
            if (result === 'true') {
              this.logger.info('Ionic Deploy: download complete');
            }
            deferred.resolve(result === 'true');
          }
        }, (error) => {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Extract the last downloaded update
   *
   * This should be called after a download() successfully resolves.
   * @return {Promise} The promise which will resolve with true/false.
   */
  extract(options: DeployExtractOptions = {}): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.extract(this.config.get('app_id'), (result) => {
          if (result !== 'done') {
            if (options.onProgress) {
              options.onProgress(result);
            }
          } else {
            if (result === 'true') {
              this.logger.info('Ionic Deploy: extraction complete');
            }
            deferred.resolve(result === 'true');
          }
        }, (error) => {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Load the latest deployed version
   * This is only necessary to call if you have manually downloaded and extracted
   * an update and wish to reload the app with the latest deploy. The latest deploy
   * will automatically be loaded when the app is started.
   *
   * @return {void}
   */
  load() {
    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.redirect(this.config.get('app_id'));
      }
    });
  }

  /**
   * Watch constantly checks for updates, and triggers an event when one is ready.
   */
  watch(options: DeployWatchOptions = {}): void {
    var self = this;

    if (!options.initialDelay) {
      options.initialDelay = INITIAL_DELAY;
    }

    if (!options.interval) {
      options.interval = WATCH_INTERVAL;
    }

    function checkForUpdates() {
      self.check().then((hasUpdate) => {
        if (hasUpdate) {
          self.emitter.emit('deploy:update-ready');
        }
      }, (err) => {
        self.logger.info('Ionic Deploy: unable to check for updates: ' + err);
      });

      // Check our timeout to make sure it wasn't cleared while we were waiting
      // for a server response
      if (this._checkTimeout) {
        this._checkTimeout = setTimeout(checkForUpdates.bind(self), options.interval);
      }
    }

    // Check after an initial short deplay
    this._checkTimeout = setTimeout(checkForUpdates.bind(self), options.initialDelay);
  }

  /**
   * Stop automatically looking for updates
   */
  unwatch(): void {
    clearTimeout(this._checkTimeout);
    this._checkTimeout = null;
  }

  /**
   * Information about the current deploy
   *
   * @return {Promise} The resolver will be passed an object that has key/value
   *    pairs pertaining to the currently deployed update.
   */
  info(): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.info(this.config.get('app_id'), (result) => {
          deferred.resolve(result);
        }, (err) => {
          deferred.reject(err);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * List the Deploy versions that have been installed on this device
   *
   * @return {Promise} The resolver will be passed an array of deploy uuids
   */
  getVersions(): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.getVersions(this.config.get('app_id'), (result) => {
          deferred.resolve(result);
        }, (err) => {
          deferred.reject(err);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Remove an installed deploy on this device
   *
   * @param {string} uuid The deploy uuid you wish to remove from the device
   * @return {Promise} Standard resolve/reject resolution
   */
  deleteVersion(uuid: string): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.deleteVersion(this.config.get('app_id'), uuid, (result) => {
          deferred.resolve(result);
        }, (err) => {
          deferred.reject(err);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Fetches the metadata for a given deploy uuid. If no uuid is given, it will attempt
   * to grab the metadata for the most recently known update version.
   *
   * @param {string} uuid The deploy uuid you wish to grab metadata for, can be left blank to grab latest known update metadata
   * @return {Promise} Standard resolve/reject resolution
   */
  getMetadata(uuid: string): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this._plugin.getMetadata(this.config.get('app_id'), uuid, (result) => {
          deferred.resolve(result.metadata);
        }, (err) => {
          deferred.reject(err);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Set the deploy channel that should be checked for updatse
   * See http://docs.ionic.io/docs/deploy-channels for more information
   *
   * @param {string} channelTag The channel tag to use
   */
  setChannel(channelTag: string): void {
    this._channelTag = channelTag;
  }

  /**
   * Update app with the latest deploy
   */
  update(options: DeployUpdateOptions = {}): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        // Check for updates
        this.check().then((result) => {
          if (result === true) {
            // There are updates, download them
            let downloadProgress = 0;
            this.download({
              'onProgress': (p: number) => {
                downloadProgress = p / 2;
                if (options.onProgress) {
                  options.onProgress(downloadProgress);
                }
              }
            }).then((result) => {
              if (!result) { deferred.reject(new Error('Error while downloading')); }
              this.extract({
                'onProgress': (p: number) => {
                  if (options.onProgress) {
                    options.onProgress(downloadProgress + p / 2);
                  }
                }
              }).then((result) => {
                if (!result) { deferred.reject(new Error('Error while extracting')); }
                if (!options.deferLoad) {
                  deferred.resolve(true);
                  this._plugin.redirect(this.config.get('app_id'));
                } else {
                  deferred.resolve(true);
                }
              }, (error) => {
                deferred.reject(error);
              });
            }, (error) => {
              deferred.reject(error);
            });
          } else {
            deferred.resolve(false);
          }
        }, (error) => {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }
}
