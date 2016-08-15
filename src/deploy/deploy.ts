import {
  DeployChannel,
  DeployDependencies,
  DeployDownloadOptions,
  DeployExtractOptions,
  DeployOptions,
  DeployUpdateOptions,
  DeployWatchOptions,
  IConfig,
  IDeploy,
  IEventEmitter,
  ILogger
} from '../definitions';

import { DeferredPromise } from '../promise';

declare var window: any;
declare var IonicDeploy: any;

const NO_PLUGIN = new Error('Missing deploy plugin: `ionic-plugin-deploy`');
const INITIAL_DELAY = 1 * 5 * 1000;
const WATCH_INTERVAL = 1 * 60 * 1000;

/**
 * Deploy handles live deploys of the app.
 */
export class Deploy implements IDeploy {

  /**
   * The active deploy channel.
   */
  public channel: DeployChannel = 'production';

  /**
   * The deploy plugin.
   */
  public plugin: any;

  /**
   * @private
   */
  private config: IConfig;

  /**
   * @private
   */
  private emitter: IEventEmitter;

  /**
   * @private
   */
  private logger: ILogger;

  /**
   * @private
   */
  private _checkTimeout: any;

  constructor(
    deps: DeployDependencies,
    public options: DeployOptions = {}
  ) {
    this.config = deps.config;
    this.emitter = deps.emitter;
    this.logger = deps.logger;

    this.emitter.once('device:ready', () => {
      if (this._getPlugin()) {
        this.plugin.init(this.config.get('app_id'), this.config.getURL('api'));
      }

      this.emitter.emit('deploy:ready');
    });
  }

  /**
   * Check for updates on the active channel.
   */
  public check(): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.check(this.config.get('app_id'), this.channel, (result) => {
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
   * Download the available update.
   *
   * This should be used in conjunction with `extract`.
   *
   * TODO: link to extract
   *
   * @param options
   */
  public download(options: DeployDownloadOptions = {}): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.download(this.config.get('app_id'), (result) => {
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
   * Extract the downloaded update.
   *
   * This should be called after `download` successfully resolves.
   *
   * TODO: link to download
   *
   * @param options
   */
  public extract(options: DeployExtractOptions = {}): Promise<boolean> {
    let deferred = new DeferredPromise<boolean, Error>();

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.extract(this.config.get('app_id'), (result) => {
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
   * Load the latest deployed version.
   *
   * This is only necessary to call if you have manually downloaded and
   * extracted an update and wish to reload the app with the latest deploy. The
   * latest deploy will automatically be loaded when the app is started.
   */
  public load() {
    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.redirect(this.config.get('app_id'));
      }
    });
  }

  /**
   * Watch for updates.
   *
   * When an update is available, the `deploy:update-ready` event is fired.
   *
   * @param options
   */
  public watch(options: DeployWatchOptions = {}): void {
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
   * Stop watching for updates.
   */
  unwatch(): void {
    clearTimeout(this._checkTimeout);
    this._checkTimeout = null;
  }

  /**
   * Get information about the current version.
   *
   * The promise is resolved with an object that has key/value pairs pertaining
   * to the currently deployed update.
   */
  public info(): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.info(this.config.get('app_id'), (result) => {
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
   * List the versions that have been installed on this device.
   *
   * The promise is resolved with an array of version UUIDs.
   */
  public getVersions(): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.getVersions(this.config.get('app_id'), (result) => {
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
   * Remove a version from this device.
   *
   * @param uuid - The version UUID to remove from the device.
   */
  public deleteVersion(uuid: string): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.deleteVersion(this.config.get('app_id'), uuid, (result) => {
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
   * Fetches the metadata for a given version. If no UUID is given, it will
   * attempt to grab the metadata for the most recently known version.
   *
   * @param uuid - The version from which to grab metadata.
   */
  public getMetadata(uuid?: string): Promise<any> {
    let deferred = new DeferredPromise<any, Error>(); // TODO

    this.emitter.once('deploy:ready', () => {
      if (this._getPlugin()) {
        this.plugin.getMetadata(this.config.get('app_id'), uuid, (result) => {
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
   * Update app with the latest version.
   *
   * @param options
   */
  public update(options: DeployUpdateOptions = {}): Promise<boolean> {
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
                  this.plugin.redirect(this.config.get('app_id'));
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

  /**
   * @private
   */
  private _getPlugin() {
    if (typeof window.IonicDeploy === 'undefined') {
      this.logger.warn('Ionic Deploy: Disabled! Deploy plugin is not installed or has not loaded. Have you run `ionic plugin add ionic-plugin-deploy` yet?');
      return;
    }
    if (!this.plugin) {
      this.plugin = window.IonicDeploy;
    }
    return this.plugin;
  }

}
