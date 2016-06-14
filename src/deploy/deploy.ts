import { DeferredPromise } from '../core/promise';
import { IonicPlatform } from '../core/core';

declare var IonicDeploy: any;

var NO_PLUGIN = 'IONIC_DEPLOY_MISSING_PLUGIN';
var INITIAL_DELAY = 1 * 5 * 1000;
var WATCH_INTERVAL = 1 * 60 * 1000;

export interface DeployWatchOptions {
  interval?: number;
  initialDelay?: number;
}

export interface DeployDownloadOptions {
  onProgress?: (p: number) => void;
}

export interface DeployExtractOptions {
  onProgress?: (p: number) => void;
}

export interface DeployUpdateOptions {
  deferLoad?: boolean;
  onProgress?: (p: number) => void;
}

export class Deploy {

  private _plugin: any;
  private _isReady: boolean;
  private _channelTag: string;
  private _checkTimeout: any;

  constructor() {
    var self = this;
    this._plugin = false;
    this._isReady = false;
    this._channelTag = 'production';
    IonicPlatform.logger.info('Ionic Deploy: init');
    IonicPlatform.onReady(function() {
      self.initialize();
      self._isReady = true;
      IonicPlatform.emitter.emit('deploy:ready');
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
    if (this._plugin) { return this._plugin; }
    if (typeof IonicDeploy === 'undefined') {
      IonicPlatform.logger.info('Ionic Deploy: plugin is not installed or has not loaded. Have you run `ionic plugin add ionic-plugin-deploy` yet?');
      return false;
    }
    this._plugin = IonicDeploy;
    return IonicDeploy;
  }

  /**
   * Initialize the Deploy Plugin
   * @return {void}
   */
  initialize() {
    var self = this;
    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.init(IonicPlatform.config.get('app_id'), IonicPlatform.config.getURL('platform-api'));
      }
    });
  }

  /**
   * Check for updates
   *
   * @return {Promise} Will resolve with true if an update is available, false otherwise. A string or
   *   error will be passed to reject() in the event of a failure.
   */
  check(): Promise<boolean> {
    var self = this;
    var deferred = new DeferredPromise<boolean>();

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.check(IonicPlatform.config.get('app_id'), self._channelTag, function(result) {
          if (result && result === 'true') {
            IonicPlatform.logger.info('Ionic Deploy: an update is available');
            deferred.resolve(true);
          } else {
            IonicPlatform.logger.info('Ionic Deploy: no updates available');
            deferred.resolve(false);
          }
        }, function(error) {
          IonicPlatform.logger.error('Ionic Deploy: encountered an error while checking for updates');
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
    var self = this;
    var deferred = new DeferredPromise();

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.download(IonicPlatform.config.get('app_id'), function(result) {
          if (result !== 'true' && result !== 'false') {
            if (options.onProgress) {
              options.onProgress(result);
            }
          } else {
            if (result === 'true') {
              IonicPlatform.logger.info('Ionic Deploy: download complete');
            }
            deferred.resolve(result === 'true');
          }
        }, function(error) {
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
    var self = this;
    var deferred = new DeferredPromise();

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.extract(IonicPlatform.config.get('app_id'), function(result) {
          if (result !== 'done') {
            if (options.onProgress) {
              options.onProgress(result);
            }
          } else {
            if (result === 'true') {
              IonicPlatform.logger.info('Ionic Deploy: extraction complete');
            }
            deferred.resolve(result);
          }
        }, function(error) {
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
    var self = this;
    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.redirect(IonicPlatform.config.get('app_id'));
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
      self.check().then(function(hasUpdate) {
        if (hasUpdate) {
          IonicPlatform.emitter.emit('deploy:update-ready');
        }
      }, function(err) {
        IonicPlatform.logger.info('Ionic Deploy: unable to check for updates: ' + err);
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
    var deferred = new DeferredPromise();
    var self = this;

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.info(IonicPlatform.config.get('app_id'), function(result) {
          deferred.resolve(result);
        }, function(err) {
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
    var deferred = new DeferredPromise();
    var self = this;

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.getVersions(IonicPlatform.config.get('app_id'), function(result) {
          deferred.resolve(result);
        }, function(err) {
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
  deleteVersion(uuid): Promise<any> {
    var deferred = new DeferredPromise();
    var self = this;

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.deleteVersion(IonicPlatform.config.get('app_id'), uuid, function(result) {
          deferred.resolve(result);
        }, function(err) {
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
  getMetadata(uuid): Promise<any> {
    var deferred = new DeferredPromise();
    var self = this;

    this.onReady(function() {
      if (self._getPlugin()) {
        self._plugin.getMetadata(IonicPlatform.config.get('app_id'), uuid, function(result) {
          deferred.resolve(result.metadata);
        }, function(err) {
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
   *
   * @param {boolean} deferLoad Defer loading the applied update after the installation
   */
  update(options: DeployUpdateOptions = {}): Promise<boolean> {
    var deferred = new DeferredPromise();
    var self = this;

    this.onReady(function() {
      if (self._getPlugin()) {
        // Check for updates
        self.check().then(function(result) {
          if (result === true) {
            // There are updates, download them
            let downloadProgress = 0;
            self.download({
              'onProgress': (p: number) => {
                downloadProgress = p / 2;
                if (options.onProgress) {
                  options.onProgress(downloadProgress);
                }
              }
            }).then(function(result) {
              if (!result) { deferred.reject('download error'); }
              self.extract({
                'onProgress': (p: number) => {
                  if (options.onProgress) {
                    options.onProgress(downloadProgress + p / 2);
                  }
                }
              }).then(function(result) {
                if (!result) { deferred.reject('extraction error'); }
                if (!options.deferLoad) {
                  deferred.resolve(true);
                  self._plugin.redirect(IonicPlatform.config.get('app_id'));
                } else {
                  deferred.resolve(true);
                }
              }, function(error) {
                deferred.reject(error);
              });
            }, function(error) {
              deferred.reject(error);
            });
          } else {
            deferred.resolve(false);
          }
        }, function(error) {
          deferred.reject(error);
        });
      } else {
        deferred.reject(NO_PLUGIN);
      }
    });

    return deferred.promise;
  }

  /**
   * Fire a callback when deploy is ready. This will fire immediately if
   * deploy has already become available.
   *
   * @param {Function} callback Callback function to fire off
   * @return {void}
   */
  onReady(callback) {
    var self = this;
    if (this._isReady) {
      callback(self);
    } else {
      IonicPlatform.emitter.on('deploy:ready', function() {
        callback(self);
      });
    }
  }

}
