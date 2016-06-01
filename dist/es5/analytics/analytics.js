"use strict";
var request_1 = require('../core/request');
var promise_1 = require('../core/promise');
var core_1 = require('../core/core');
var logger_1 = require('../core/logger');
var storage_1 = require('./storage');
var user_1 = require('../core/user');
var util_1 = require('../util/util');
var ANALYTICS_KEY = null;
var DEFER_REGISTER = 'DEFER_REGISTER';
var options = {};
var globalProperties = {};
var globalPropertiesFns = [];
var Analytics = (function () {
    function Analytics(config) {
        this._dispatcher = null;
        this._dispatchIntervalTime = 30;
        this._useEventCaching = true;
        this._serviceHost = core_1.IonicPlatform.config.getURL('analytics');
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Analytics:'
        });
        this.storage = core_1.IonicPlatform.getStorage();
        this.cache = new storage_1.BucketStorage('ionic_analytics');
        this._addGlobalPropertyDefaults();
        if (config !== DEFER_REGISTER) {
            this.register(config);
        }
    }
    Analytics.prototype._addGlobalPropertyDefaults = function () {
        var self = this;
        self.setGlobalProperties(function (eventCollection, eventData) {
            eventData._user = JSON.parse(JSON.stringify(user_1.User.current()));
            eventData._app = {
                'app_id': core_1.IonicPlatform.config.get('app_id'),
                'analytics_version': core_1.IonicPlatform.Version
            };
        });
    };
    Object.defineProperty(Analytics.prototype, "hasValidSettings", {
        get: function () {
            if (!core_1.IonicPlatform.config.get('app_id') || !core_1.IonicPlatform.config.get('api_key')) {
                var msg = 'A valid app_id and api_key are required before you can utilize ' +
                    'analytics properly. See http://docs.ionic.io/v1.0/docs/io-quick-start';
                this.logger.info(msg);
                return false;
            }
            return true;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Analytics.prototype, "dispatchInterval", {
        get: function () {
            return this._dispatchIntervalTime;
        },
        set: function (value) {
            var self = this;
            // Set how often we should send batched events, in seconds.
            // Set this to 0 to disable event caching
            this._dispatchIntervalTime = value;
            // Clear the existing interval
            if (this._dispatcher) {
                window.clearInterval(this._dispatcher);
            }
            if (value > 0) {
                this._dispatcher = window.setInterval(function () { self._dispatchQueue(); }, value * 1000);
                this._useEventCaching = true;
            }
            else {
                this._useEventCaching = false;
            }
        },
        enumerable: true,
        configurable: true
    });
    Analytics.prototype._enqueueEvent = function (collectionName, eventData) {
        var self = this;
        if (options.dryRun) {
            self.logger.info('event recieved but not sent (dryRun active):');
            self.logger.info(collectionName);
            self.logger.info(eventData);
            return;
        }
        self.logger.info('enqueuing event to send later:');
        self.logger.info(collectionName);
        self.logger.info(eventData);
        // Add timestamp property to the data
        if (!eventData.keen) {
            eventData.keen = {};
        }
        eventData.keen.timestamp = new Date().toISOString();
        // Add the data to the queue
        var eventQueue = self.cache.get('event_queue') || {};
        if (!eventQueue[collectionName]) {
            eventQueue[collectionName] = [];
        }
        eventQueue[collectionName].push(eventData);
        // Write the queue to disk
        self.cache.set('event_queue', eventQueue);
    };
    Analytics.prototype._requestAnalyticsKey = function () {
        var requestOptions = {
            'method': 'GET',
            'json': true,
            'uri': core_1.IonicPlatform.config.getURL('api') + '/api/v1/app/' + core_1.IonicPlatform.config.get('app_id') + '/keys/write',
            'headers': {
                'Authorization': 'basic ' + btoa(core_1.IonicPlatform.config.get('app_id') + ':' + core_1.IonicPlatform.config.get('api_key'))
            }
        };
        return request_1.request(requestOptions);
    };
    Analytics.prototype._postEvent = function (name, data) {
        var self = this;
        var payload = {
            'name': [data]
        };
        if (!ANALYTICS_KEY) {
            self.logger.error('Cannot send events to the analytics server without an Analytics key.');
        }
        var requestOptions = {
            'method': 'POST',
            'url': self._serviceHost + '/api/v1/events/' + core_1.IonicPlatform.config.get('app_id'),
            'json': payload,
            'headers': {
                'Authorization': ANALYTICS_KEY
            }
        };
        return request_1.request(requestOptions);
    };
    Analytics.prototype._postEvents = function (events) {
        var self = this;
        if (!ANALYTICS_KEY) {
            self.logger.info('Cannot send events to the analytics server without an Analytics key.');
        }
        var requestOptions = {
            'method': 'POST',
            'url': self._serviceHost + '/api/v1/events/' + core_1.IonicPlatform.config.get('app_id'),
            'json': events,
            'headers': {
                'Authorization': ANALYTICS_KEY
            }
        };
        return request_1.request(requestOptions);
    };
    Analytics.prototype._dispatchQueue = function () {
        var self = this;
        var eventQueue = this.cache.get('event_queue') || {};
        if (Object.keys(eventQueue).length === 0) {
            return;
        }
        if (!core_1.IonicPlatform.deviceConnectedToNetwork()) {
            return;
        }
        self.storage.lockedAsyncCall(self.cache.scopedKey('event_dispatch'), function () {
            return self._postEvents(eventQueue);
        }).then(function () {
            self.cache.set('event_queue', {});
            self.logger.info('sent events');
            self.logger.info(eventQueue);
        }, function (err) {
            self._handleDispatchError(err, this, eventQueue);
        });
    };
    Analytics.prototype._getRequestStatusCode = function (request) {
        var responseCode = null;
        if (request && request.requestInfo._lastResult && request.requestInfo._lastResult.status) {
            responseCode = request.requestInfo._lastResult.status;
        }
        return responseCode;
    };
    Analytics.prototype._handleDispatchError = function (error, request, eventQueue) {
        var self = this;
        var responseCode = this._getRequestStatusCode(request);
        if (error === 'last_call_interrupted') {
            self.cache.set('event_queue', {});
        }
        else {
            // If we didn't connect to the server at all -> keep events
            if (!responseCode) {
                self.logger.error('Error sending analytics data: Failed to connect to analytics server.');
            }
            else {
                self.cache.set('event_queue', {});
                self.logger.error('Error sending analytics data: Server responded with error');
                self.logger.error(eventQueue);
            }
        }
    };
    Analytics.prototype._handleRegisterError = function (error, request) {
        var self = this;
        var responseCode = this._getRequestStatusCode(request);
        var docs = ' See http://docs.ionic.io/v1.0/docs/io-quick-start';
        switch (responseCode) {
            case 401:
                self.logger.error('The api key and app id you provided did not register on the server. ' + docs);
                break;
            case 404:
                self.logger.error('The app id you provided ("' + core_1.IonicPlatform.config.get('app_id') + '") was not found.' + docs);
                break;
            default:
                self.logger.error('Unable to request analytics key.');
                self.logger.error(error);
                break;
        }
    };
    /**
     * Registers an analytics key
     *
     * @param {object} opts Registration options
     * @return {Promise} The register promise
     */
    Analytics.prototype.register = function (opts) {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        if (!this.hasValidSettings) {
            deferred.reject(false);
            return deferred.promise;
        }
        options = opts || {};
        if (options.silent) {
            this.logger.silence();
        }
        else {
            this.logger.verbose();
        }
        if (options.dryRun) {
            this.logger.info('dryRun mode is active. Analytics will not send any events.');
        }
        this._requestAnalyticsKey().then(function (result) {
            ANALYTICS_KEY = result.payload.write_key;
            self.logger.info('successfully registered analytics key');
            self.dispatchInterval = self.dispatchInterval;
            deferred.resolve(true);
        }, function (error) {
            self._handleRegisterError(error, this);
            deferred.reject(false);
        });
        return deferred.promise;
    };
    Analytics.prototype.setGlobalProperties = function (prop) {
        var self = this;
        var propType = (typeof prop);
        switch (propType) {
            case 'object':
                for (var key in prop) {
                    if (!prop.hasOwnProperty(key)) {
                        continue;
                    }
                    globalProperties[key] = prop[key];
                }
                break;
            case 'function':
                globalPropertiesFns.push(prop);
                break;
            default:
                self.logger.error('setGlobalProperties parameter must be an object or function.');
                break;
        }
    };
    Analytics.prototype.track = function (eventCollection, eventData) {
        var self = this;
        if (!this.hasValidSettings) {
            return false;
        }
        if (!eventData) {
            eventData = {};
        }
        else {
            // Clone the event data to avoid modifying it
            eventData = util_1.deepExtend({}, eventData);
        }
        for (var key in globalProperties) {
            if (!globalProperties.hasOwnProperty(key)) {
                continue;
            }
            if (eventData[key] === void 0) {
                eventData[key] = globalProperties[key];
            }
        }
        for (var i = 0; i < globalPropertiesFns.length; i++) {
            var fn = globalPropertiesFns[i];
            fn.call(null, eventCollection, eventData);
        }
        if (this._useEventCaching) {
            self._enqueueEvent(eventCollection, eventData);
        }
        else {
            if (options.dryRun) {
                self.logger.info('dryRun active, will not send event');
                self.logger.info(eventCollection);
                self.logger.info(eventData);
            }
            else {
                self._postEvent(eventCollection, eventData);
            }
        }
    };
    Analytics.prototype.unsetGlobalProperty = function (prop) {
        var self = this;
        var propType = (typeof prop);
        switch (propType) {
            case 'string':
                delete globalProperties[prop];
                break;
            case 'function':
                var i = globalPropertiesFns.indexOf(prop);
                if (i === -1) {
                    self.logger.error('The function passed to unsetGlobalProperty was not a global property.');
                }
                globalPropertiesFns.splice(i, 1);
                break;
            default:
                self.logger.error('unsetGlobalProperty parameter must be a string or function.');
                break;
        }
    };
    return Analytics;
}());
exports.Analytics = Analytics;
