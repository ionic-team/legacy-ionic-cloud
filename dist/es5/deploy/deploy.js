"use strict";
var promise_1 = require('../core/promise');
var logger_1 = require('../core/logger');
var core_1 = require('../core/core');
var events_1 = require('../core/events');
var NO_PLUGIN = 'IONIC_DEPLOY_MISSING_PLUGIN';
var INITIAL_DELAY = 1 * 5 * 1000;
var WATCH_INTERVAL = 1 * 60 * 1000;
var Deploy = (function () {
    function Deploy() {
        var self = this;
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Deploy:'
        });
        this._plugin = false;
        this._isReady = false;
        this._channelTag = 'production';
        this._emitter = new events_1.EventEmitter();
        this.logger.info('init');
        core_1.IonicPlatform.onReady(function () {
            self.initialize();
            self._isReady = true;
            self._emitter.emit('ionic_deploy:ready');
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
    Deploy.prototype._getPlugin = function () {
        if (this._plugin) {
            return this._plugin;
        }
        if (typeof IonicDeploy === 'undefined') {
            this.logger.info('plugin is not installed or has not loaded. Have you run `ionic plugin add ionic-plugin-deploy` yet?');
            return false;
        }
        this._plugin = IonicDeploy;
        return IonicDeploy;
    };
    /**
     * Initialize the Deploy Plugin
     * @return {void}
     */
    Deploy.prototype.initialize = function () {
        var self = this;
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.init(core_1.IonicPlatform.config.get('app_id'), core_1.IonicPlatform.config.getURL('platform-api'));
            }
        });
    };
    /**
     * Check for updates
     *
     * @return {Promise} Will resolve with true if an update is available, false otherwise. A string or
     *   error will be passed to reject() in the event of a failure.
     */
    Deploy.prototype.check = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.check(core_1.IonicPlatform.config.get('app_id'), self._channelTag, function (result) {
                    if (result && result === 'true') {
                        self.logger.info('an update is available');
                        deferred.resolve(true);
                    }
                    else {
                        self.logger.info('no updates available');
                        deferred.resolve(false);
                    }
                }, function (error) {
                    self.logger.error('encountered an error while checking for updates');
                    deferred.reject(error);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Download and available update
     *
     * This should be used in conjunction with extract()
     * @return {Promise} The promise which will resolve with true/false or use
     *    notify to update the download progress.
     */
    Deploy.prototype.download = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.download(core_1.IonicPlatform.config.get('app_id'), function (result) {
                    if (result !== 'true' && result !== 'false') {
                        deferred.notify(result);
                    }
                    else {
                        if (result === 'true') {
                            self.logger.info('download complete');
                        }
                        deferred.resolve(result === 'true');
                    }
                }, function (error) {
                    deferred.reject(error);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Extract the last downloaded update
     *
     * This should be called after a download() successfully resolves.
     * @return {Promise} The promise which will resolve with true/false or use
     *                   notify to update the extraction progress.
     */
    Deploy.prototype.extract = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.extract(core_1.IonicPlatform.config.get('app_id'), function (result) {
                    if (result !== 'done') {
                        deferred.notify(result);
                    }
                    else {
                        if (result === 'true') {
                            self.logger.info('extraction complete');
                        }
                        deferred.resolve(result);
                    }
                }, function (error) {
                    deferred.reject(error);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Load the latest deployed version
     * This is only necessary to call if you have manually downloaded and extracted
     * an update and wish to reload the app with the latest deploy. The latest deploy
     * will automatically be loaded when the app is started.
     *
     * @return {void}
     */
    Deploy.prototype.load = function () {
        var self = this;
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.redirect(core_1.IonicPlatform.config.get('app_id'));
            }
        });
    };
    /**
     * Watch constantly checks for updates, and triggers an
     * event when one is ready.
     * @param {object} options Watch configuration options
     * @return {Promise} returns a promise that will get a notify() callback when an update is available
     */
    Deploy.prototype.watch = function (options) {
        var deferred = new promise_1.DeferredPromise();
        var opts = options || {};
        var self = this;
        if (typeof opts.initialDelay === 'undefined') {
            opts.initialDelay = INITIAL_DELAY;
        }
        if (typeof opts.interval === 'undefined') {
            opts.interval = WATCH_INTERVAL;
        }
        function checkForUpdates() {
            self.check().then(function (hasUpdate) {
                if (hasUpdate) {
                    deferred.notify(hasUpdate);
                }
            }, function (err) {
                self.logger.info('unable to check for updates: ' + err);
            });
            // Check our timeout to make sure it wasn't cleared while we were waiting
            // for a server response
            if (this._checkTimeout) {
                this._checkTimeout = setTimeout(checkForUpdates.bind(self), opts.interval);
            }
        }
        // Check after an initial short deplay
        this._checkTimeout = setTimeout(checkForUpdates.bind(self), opts.initialDelay);
        return deferred.promise;
    };
    /**
     * Stop automatically looking for updates
     * @return {void}
     */
    Deploy.prototype.unwatch = function () {
        clearTimeout(this._checkTimeout);
        this._checkTimeout = null;
    };
    /**
     * Information about the current deploy
     *
     * @return {Promise} The resolver will be passed an object that has key/value
     *    pairs pertaining to the currently deployed update.
     */
    Deploy.prototype.info = function () {
        var deferred = new promise_1.DeferredPromise();
        var self = this;
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.info(core_1.IonicPlatform.config.get('app_id'), function (result) {
                    deferred.resolve(result);
                }, function (err) {
                    deferred.reject(err);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * List the Deploy versions that have been installed on this device
     *
     * @return {Promise} The resolver will be passed an array of deploy uuids
     */
    Deploy.prototype.getVersions = function () {
        var deferred = new promise_1.DeferredPromise();
        var self = this;
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.getVersions(core_1.IonicPlatform.config.get('app_id'), function (result) {
                    deferred.resolve(result);
                }, function (err) {
                    deferred.reject(err);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Remove an installed deploy on this device
     *
     * @param {string} uuid The deploy uuid you wish to remove from the device
     * @return {Promise} Standard resolve/reject resolution
     */
    Deploy.prototype.deleteVersion = function (uuid) {
        var deferred = new promise_1.DeferredPromise();
        var self = this;
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.deleteVersion(core_1.IonicPlatform.config.get('app_id'), uuid, function (result) {
                    deferred.resolve(result);
                }, function (err) {
                    deferred.reject(err);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Fetches the metadata for a given deploy uuid. If no uuid is given, it will attempt
     * to grab the metadata for the most recently known update version.
     *
     * @param {string} uuid The deploy uuid you wish to grab metadata for, can be left blank to grab latest known update metadata
     * @return {Promise} Standard resolve/reject resolution
     */
    Deploy.prototype.getMetadata = function (uuid) {
        var deferred = new promise_1.DeferredPromise();
        var self = this;
        this.onReady(function () {
            if (self._getPlugin()) {
                self._plugin.getMetadata(core_1.IonicPlatform.config.get('app_id'), uuid, function (result) {
                    deferred.resolve(result.metadata);
                }, function (err) {
                    deferred.reject(err);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Set the deploy channel that should be checked for updatse
     * See http://docs.ionic.io/docs/deploy-channels for more information
     *
     * @param {string} channelTag The channel tag to use
     * @return {void}
     */
    Deploy.prototype.setChannel = function (channelTag) {
        this._channelTag = channelTag;
    };
    /**
     * Update app with the latest deploy
     * @param {boolean} deferLoad Defer loading the applied update after the installation
     * @return {Promise} A promise result
     */
    Deploy.prototype.update = function (deferLoad) {
        var deferred = new promise_1.DeferredPromise();
        var self = this;
        var deferLoading = false;
        if (typeof deferLoad !== 'undefined') {
            deferLoading = deferLoad;
        }
        this.onReady(function () {
            if (self._getPlugin()) {
                // Check for updates
                self.check().then(function (result) {
                    if (result === true) {
                        // There are updates, download them
                        var downloadProgress = 0;
                        self.download().then(function (result) {
                            if (!result) {
                                deferred.reject('download error');
                            }
                            self.extract().then(function (result) {
                                if (!result) {
                                    deferred.reject('extraction error');
                                }
                                if (!deferLoading) {
                                    deferred.resolve(true);
                                    self._plugin.redirect(core_1.IonicPlatform.config.get('app_id'));
                                }
                                else {
                                    deferred.resolve(true);
                                }
                            }, function (error) {
                                deferred.reject(error);
                            }, function (update) {
                                var progress = downloadProgress + (update / 2);
                                deferred.notify(progress);
                            });
                        }, function (error) {
                            deferred.reject(error);
                        }, function (update) {
                            downloadProgress = (update / 2);
                            deferred.notify(downloadProgress);
                        });
                    }
                    else {
                        deferred.resolve(false);
                    }
                }, function (error) {
                    deferred.reject(error);
                });
            }
            else {
                deferred.reject(NO_PLUGIN);
            }
        });
        return deferred.promise;
    };
    /**
     * Fire a callback when deploy is ready. This will fire immediately if
     * deploy has already become available.
     *
     * @param {Function} callback Callback function to fire off
     * @return {void}
     */
    Deploy.prototype.onReady = function (callback) {
        var self = this;
        if (this._isReady) {
            callback(self);
        }
        else {
            self._emitter.on('ionic_deploy:ready', function () {
                callback(self);
            });
        }
    };
    return Deploy;
}());
exports.Deploy = Deploy;
