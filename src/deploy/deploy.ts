import {
  DeployChannel,
  DeployDependencies,
  DeployDownloadOptions,
  DeployExtractOptions,
  DeployOptions,
  IConfig,
  IDeploy,
  IEventEmitter,
  ILogger
} from '../definitions';

import { DeferredPromise } from '../promise';

declare var window: any;
declare var IonicDeploy: any;

const NO_PLUGIN = new Error('Missing deploy plugin: `ionic-plugin-deploy`');

/**
 * `Deploy` handles live deploys of the app. Downloading, extracting, and
 * rolling back snapshots.
 *
 * @featured
 */
export class Deploy implements IDeploy {

  /**
   * The active deploy channel. Set this to change the channel on which
   * `Deploy` operates.
   */
  public channel: DeployChannel = 'production';

  /**
   * The deploy plugin. Full documentation and examples can be found on the
   * plugin's
   * [README](https://github.com/driftyco/ionic-plugin-deploy#cordova-plugin-api),
   * but we recommend using the Cloud Client.
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

  constructor(
    deps: DeployDependencies,

    /**
     * @hidden
     */
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
   *
   * The promise resolves with a boolean. When `true`, a new snapshot exists on
   * the channel.
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
   * Download the available snapshot.
   *
   * This should be used in conjunction with `extract()`.
   *
   * TODO: link to extract
   *
   * @param options
   *  Options for this download, such as a progress callback.
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
   * Extract the downloaded snapshot.
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
   * Immediately reload the app with the latest deployed snapshot.
   *
   * This is only necessary to call if you have downloaded and extracted a
   * snapshot and wish to instantly reload the app with the latest deploy. The
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
   * Get information about the current snapshot.
   *
   * The promise is resolved with an object that has key/value pairs pertaining
   * to the currently deployed snapshot.
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
   * List the snapshots that have been installed on this device.
   *
   * The promise is resolved with an array of snapshot UUIDs.
   */
  public getSnapshots(): Promise<any> {
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
   * Remove a snapshot from this device.
   *
   * @param uuid
   *  The snapshot UUID to remove from the device.
   */
  public deleteSnapshot(uuid: string): Promise<any> {
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
   * Fetches the metadata for a given snapshot. If no UUID is given, it will
   * attempt to grab the metadata for the most recently known snapshot.
   *
   * @param uuid
   *  The snapshot from which to grab metadata.
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
