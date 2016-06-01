(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"../core/core":10,"../core/logger":14,"../core/promise":15,"../core/request":16,"../core/user":18,"../util/util":30,"./storage":4}],2:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./analytics'));
__export(require('./serializers'));
__export(require('./storage'));

},{"./analytics":1,"./serializers":3,"./storage":4}],3:[function(require,module,exports){
"use strict";
var DOMSerializer = (function () {
    function DOMSerializer() {
    }
    DOMSerializer.prototype.elementSelector = function (element) {
        // iterate up the dom
        var selectors = [];
        while (element.tagName !== 'HTML') {
            var selector = element.tagName.toLowerCase();
            var id = element.getAttribute('id');
            if (id) {
                selector += '#' + id;
            }
            var className = element.className;
            if (className) {
                var classes = className.split(' ');
                for (var i = 0; i < classes.length; i++) {
                    var c = classes[i];
                    if (c) {
                        selector += '.' + c;
                    }
                }
            }
            if (!element.parentNode) {
                return null;
            }
            var childIndex = Array.prototype.indexOf.call(element.parentNode.children, element);
            selector += ':nth-child(' + (childIndex + 1) + ')';
            element = element.parentNode;
            selectors.push(selector);
        }
        return selectors.reverse().join('>');
    };
    DOMSerializer.prototype.elementName = function (element) {
        // 1. ion-track-name directive
        var name = element.getAttribute('ion-track-name');
        if (name) {
            return name;
        }
        // 2. id
        var id = element.getAttribute('id');
        if (id) {
            return id;
        }
        // 3. no unique identifier --> return null
        return null;
    };
    return DOMSerializer;
}());
exports.DOMSerializer = DOMSerializer;

},{}],4:[function(require,module,exports){
"use strict";
var core_1 = require('../core/core');
var BucketStorage = (function () {
    function BucketStorage(name) {
        this.name = name;
        this.baseStorage = core_1.IonicPlatform.getStorage();
    }
    BucketStorage.prototype.get = function (key) {
        return this.baseStorage.retrieveObject(this.scopedKey(key));
    };
    BucketStorage.prototype.set = function (key, value) {
        return this.baseStorage.storeObject(this.scopedKey(key), value);
    };
    BucketStorage.prototype.scopedKey = function (key) {
        return this.name + '_' + key + '_' + core_1.IonicPlatform.config.get('app_id');
    };
    return BucketStorage;
}());
exports.BucketStorage = BucketStorage;

},{"../core/core":10}],5:[function(require,module,exports){
"use strict";
var request_1 = require('../core/request');
var promise_1 = require('../core/promise');
var core_1 = require('../core/core');
var storage_1 = require('../core/storage');
var user_1 = require('../core/user');
var storage = new storage_1.PlatformLocalStorageStrategy();
var sessionStorage = new storage_1.LocalSessionStorageStrategy();
var authModules = {};
var authToken;
var authAPIBase = core_1.IonicPlatform.config.getURL('platform-api') + '/auth';
var authAPIEndpoints = {
    'login': function (provider) {
        if (provider) {
            return authAPIBase + '/login/' + provider;
        }
        return authAPIBase + '/login';
    },
    'signup': function () {
        return authAPIBase + '/users';
    }
};
var TempTokenContext = (function () {
    function TempTokenContext() {
    }
    Object.defineProperty(TempTokenContext, "label", {
        get: function () {
            return 'ionic_io_auth_' + core_1.IonicPlatform.config.get('app_id');
        },
        enumerable: true,
        configurable: true
    });
    TempTokenContext.delete = function () {
        sessionStorage.remove(TempTokenContext.label);
    };
    TempTokenContext.store = function () {
        sessionStorage.set(TempTokenContext.label, authToken);
    };
    TempTokenContext.getRawData = function () {
        return sessionStorage.get(TempTokenContext.label) || false;
    };
    return TempTokenContext;
}());
exports.TempTokenContext = TempTokenContext;
var TokenContext = (function () {
    function TokenContext() {
    }
    Object.defineProperty(TokenContext, "label", {
        get: function () {
            return 'ionic_io_auth_' + core_1.IonicPlatform.config.get('app_id');
        },
        enumerable: true,
        configurable: true
    });
    TokenContext.delete = function () {
        storage.remove(TokenContext.label);
    };
    TokenContext.store = function () {
        storage.set(TokenContext.label, authToken);
    };
    TokenContext.getRawData = function () {
        return storage.get(TokenContext.label) || false;
    };
    return TokenContext;
}());
exports.TokenContext = TokenContext;
function storeToken(options, token) {
    authToken = token;
    if (typeof options === 'object' && options.remember) {
        TokenContext.store();
    }
    else {
        TempTokenContext.store();
    }
}
var InAppBrowserFlow = (function () {
    function InAppBrowserFlow(authOptions, options, data) {
        var deferred = new promise_1.DeferredPromise();
        if (!window || !window.cordova || !window.cordova.InAppBrowser) {
            deferred.reject('Missing InAppBrowser plugin');
        }
        else {
            request_1.request({
                'uri': authAPIEndpoints.login(options.provider),
                'method': options.uri_method || 'POST',
                'json': {
                    'app_id': core_1.IonicPlatform.config.get('app_id'),
                    'callback': options.callback_uri || window.location.href,
                    'data': data
                }
            }).then(function (data) {
                var loc = data.payload.data.url;
                var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no,clearcache=yes,clearsessioncache=yes');
                tempBrowser.addEventListener('loadstart', function (data) {
                    if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
                        var queryString = data.url.split('#')[0].split('?')[1];
                        var paramParts = queryString.split('&');
                        var params = {};
                        for (var i = 0; i < paramParts.length; i++) {
                            var part = paramParts[i].split('=');
                            params[part[0]] = part[1];
                        }
                        storeToken(authOptions, params.token);
                        tempBrowser.close();
                        tempBrowser = null;
                        deferred.resolve(true);
                    }
                });
            }, function (err) {
                deferred.reject(err);
            });
        }
        return deferred.promise;
    }
    return InAppBrowserFlow;
}());
function getAuthErrorDetails(err) {
    var details = [];
    try {
        details = err.response.body.error.details;
    }
    catch (e) {
        e;
    }
    return details;
}
var Auth = (function () {
    function Auth() {
    }
    Auth.isAuthenticated = function () {
        var token = TokenContext.getRawData();
        var tempToken = TempTokenContext.getRawData();
        if (tempToken || token) {
            return true;
        }
        return false;
    };
    Auth.login = function (moduleId, options, data) {
        var deferred = new promise_1.DeferredPromise();
        var context = authModules[moduleId] || false;
        if (!context) {
            throw new Error('Authentication class is invalid or missing:' + context);
        }
        context.authenticate.apply(context, [options, data]).then(function () {
            user_1.User.self().then(function (user) {
                deferred.resolve(user);
            }, function (err) {
                deferred.reject(err);
            });
        }, function (err) {
            deferred.reject(err);
        });
        return deferred.promise;
    };
    Auth.signup = function (data) {
        var context = authModules['basic'] || false;
        if (!context) {
            throw new Error('Authentication class is invalid or missing:' + context);
        }
        return context.signup.apply(context, [data]);
    };
    Auth.logout = function () {
        TokenContext.delete();
        TempTokenContext.delete();
    };
    Auth.register = function (moduleId, module) {
        if (!authModules[moduleId]) {
            authModules[moduleId] = module;
        }
    };
    Auth.getUserToken = function () {
        var usertoken = TokenContext.getRawData();
        var temptoken = TempTokenContext.getRawData();
        var token = temptoken || usertoken;
        if (token) {
            return token;
        }
        return false;
    };
    return Auth;
}());
exports.Auth = Auth;
var BasicAuth = (function () {
    function BasicAuth() {
    }
    BasicAuth.authenticate = function (options, data) {
        var deferred = new promise_1.DeferredPromise();
        request_1.request({
            'uri': authAPIEndpoints.login(),
            'method': 'POST',
            'json': {
                'app_id': core_1.IonicPlatform.config.get('app_id'),
                'email': data.email,
                'password': data.password
            }
        }).then(function (data) {
            storeToken(options, data.payload.data.token);
            deferred.resolve(true);
        }, function (err) {
            deferred.reject(err);
        });
        return deferred.promise;
    };
    BasicAuth.signup = function (data) {
        var deferred = new promise_1.DeferredPromise();
        var userData = {
            'app_id': core_1.IonicPlatform.config.get('app_id'),
            'email': data.email,
            'password': data.password
        };
        // optional details
        if (data.username) {
            userData.username = data.username;
        }
        if (data.image) {
            userData.image = data.image;
        }
        if (data.name) {
            userData.name = data.name;
        }
        if (data.custom) {
            userData.custom = data.custom;
        }
        request_1.request({
            'uri': authAPIEndpoints.signup(),
            'method': 'POST',
            'json': userData
        }).then(function () {
            deferred.resolve(true);
        }, function (err) {
            var errors = [];
            var details = getAuthErrorDetails(err);
            if (details instanceof Array) {
                for (var i = 0; i < details.length; i++) {
                    var detail = details[i];
                    if (typeof detail === 'object') {
                        if (detail.error_type) {
                            errors.push(detail.error_type + '_' + detail.parameter);
                        }
                    }
                }
            }
            deferred.reject({ 'errors': errors });
        });
        return deferred.promise;
    };
    return BasicAuth;
}());
var CustomAuth = (function () {
    function CustomAuth() {
    }
    CustomAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'custom' }, data);
    };
    return CustomAuth;
}());
var TwitterAuth = (function () {
    function TwitterAuth() {
    }
    TwitterAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'twitter' }, data);
    };
    return TwitterAuth;
}());
var FacebookAuth = (function () {
    function FacebookAuth() {
    }
    FacebookAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'facebook' }, data);
    };
    return FacebookAuth;
}());
var GithubAuth = (function () {
    function GithubAuth() {
    }
    GithubAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'github' }, data);
    };
    return GithubAuth;
}());
var GoogleAuth = (function () {
    function GoogleAuth() {
    }
    GoogleAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'google' }, data);
    };
    return GoogleAuth;
}());
var InstagramAuth = (function () {
    function InstagramAuth() {
    }
    InstagramAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'instagram' }, data);
    };
    return InstagramAuth;
}());
var LinkedInAuth = (function () {
    function LinkedInAuth() {
    }
    LinkedInAuth.authenticate = function (options, data) {
        return new InAppBrowserFlow(options, { 'provider': 'linkedin' }, data);
    };
    return LinkedInAuth;
}());
Auth.register('basic', BasicAuth);
Auth.register('custom', CustomAuth);
Auth.register('facebook', FacebookAuth);
Auth.register('github', GithubAuth);
Auth.register('google', GoogleAuth);
Auth.register('instagram', InstagramAuth);
Auth.register('linkedin', LinkedInAuth);
Auth.register('twitter', TwitterAuth);

},{"../core/core":10,"../core/promise":15,"../core/request":16,"../core/storage":17,"../core/user":18}],6:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./auth'));

},{"./auth":5}],7:[function(require,module,exports){
"use strict";
var logger_1 = require('./logger');
var privateData = {};
function privateVar(key) {
    return privateData[key] || null;
}
var App = (function () {
    function App(appId, apiKey) {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic App:'
        });
        if (!appId || appId === '') {
            this.logger.info('No app_id was provided');
            return;
        }
        if (!apiKey || apiKey === '') {
            this.logger.info('No api_key was provided');
            return;
        }
        privateData.id = appId;
        privateData.apiKey = apiKey;
        // other config value reference
        this.devPush = null;
        this.gcmKey = null;
    }
    Object.defineProperty(App.prototype, "id", {
        get: function () {
            return privateVar('id');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(App.prototype, "apiKey", {
        get: function () {
            return privateVar('apiKey');
        },
        enumerable: true,
        configurable: true
    });
    App.prototype.toString = function () {
        return '<App [\'' + this.id + '\'>';
    };
    return App;
}());
exports.App = App;

},{"./logger":14}],8:[function(require,module,exports){
"use strict";
var auth_1 = require('../auth/auth');
var core_1 = require('../core/core');
var request = require('superagent');
var Client = (function () {
    function Client(baseUrl, token, req) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.req = req;
        if (typeof req === 'undefined') {
            req = request;
        }
        this.baseUrl = baseUrl;
        this.token = token;
        this.req = req;
    }
    Client.prototype.get = function (endpoint) {
        return this.supplement(this.req.get, endpoint);
    };
    Client.prototype.post = function (endpoint) {
        return this.supplement(this.req.post, endpoint);
    };
    Client.prototype.put = function (endpoint) {
        return this.supplement(this.req.put, endpoint);
    };
    Client.prototype.patch = function (endpoint) {
        return this.supplement(this.req.patch, endpoint);
    };
    Client.prototype.delete = function (endpoint) {
        return this.supplement(this.req.delete, endpoint);
    };
    Client.prototype.supplement = function (fn, endpoint) {
        if (endpoint.substring(0, 1) !== '/') {
            throw Error('endpoint must start with leading slash');
        }
        return fn(this.baseUrl + endpoint).set('Authorization', "Bearer " + this.token);
    };
    return Client;
}());
exports.Client = Client;
exports.client = new Client(core_1.IonicPlatform.config.getURL('platform-api'), auth_1.Auth.getUserToken(), request);

},{"../auth/auth":5,"../core/core":10,"superagent":35}],9:[function(require,module,exports){
"use strict";
var IonicPlatformConfig = (function () {
    function IonicPlatformConfig() {
        this.locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'analytics': 'https://analytics.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }
    IonicPlatformConfig.prototype.register = function (settings) {
        this.settings = settings;
    };
    IonicPlatformConfig.prototype.get = function (name) {
        if (!this.settings) {
            return undefined;
        }
        return this.settings[name];
    };
    IonicPlatformConfig.prototype.getURL = function (name) {
        var devLocations = this.settings && this.settings['dev_locations'] || {};
        if (devLocations[name]) {
            return devLocations[name];
        }
        else if (this.locations[name]) {
            return this.locations[name];
        }
    };
    return IonicPlatformConfig;
}());
exports.IonicPlatformConfig = IonicPlatformConfig;
exports.Config = new IonicPlatformConfig();

},{}],10:[function(require,module,exports){
"use strict";
var events_1 = require('./events');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var config_1 = require('./config');
var eventEmitter = new events_1.EventEmitter();
var mainStorage = new storage_1.Storage();
var IonicPlatformCore = (function () {
    function IonicPlatformCore() {
        this.cordovaPlatformUnknown = false;
        var self = this;
        this.config = config_1.Config;
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Core:'
        });
        this.logger.info('init');
        this._pluginsReady = false;
        this.emitter = this.getEmitter();
        this._bootstrap();
        if (self.cordovaPlatformUnknown) {
            self.logger.info('attempting to mock plugins');
            self._pluginsReady = true;
            self.emitter.emit('ionic_core:plugins_ready');
        }
        else {
            try {
                document.addEventListener('deviceready', function () {
                    self.logger.info('plugins are ready');
                    self._pluginsReady = true;
                    self.emitter.emit('ionic_core:plugins_ready');
                }, false);
            }
            catch (e) {
                self.logger.info('unable to listen for cordova plugins to be ready');
            }
        }
    }
    IonicPlatformCore.prototype.init = function (cfg) {
        this.config.register(cfg);
    };
    Object.defineProperty(IonicPlatformCore.prototype, "Version", {
        get: function () {
            return '0.7.1';
        },
        enumerable: true,
        configurable: true
    });
    IonicPlatformCore.prototype.getEmitter = function () {
        return eventEmitter;
    };
    IonicPlatformCore.prototype.getStorage = function () {
        return mainStorage;
    };
    IonicPlatformCore.prototype._isCordovaAvailable = function () {
        var self = this;
        this.logger.info('searching for cordova.js');
        if (typeof cordova !== 'undefined') {
            this.logger.info('cordova.js has already been loaded');
            return true;
        }
        var scripts = document.getElementsByTagName('script');
        var len = scripts.length;
        for (var i = 0; i < len; i++) {
            var script = scripts[i].getAttribute('src');
            if (script) {
                var parts = script.split('/');
                var partsLength = 0;
                try {
                    partsLength = parts.length;
                    if (parts[partsLength - 1] === 'cordova.js') {
                        self.logger.info('cordova.js has previously been included.');
                        return true;
                    }
                }
                catch (e) {
                    self.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
                }
            }
        }
        return false;
    };
    IonicPlatformCore.prototype.loadCordova = function () {
        var self = this;
        if (!this._isCordovaAvailable()) {
            var cordovaScript = document.createElement('script');
            var cordovaSrc = 'cordova.js';
            switch (this.getDeviceTypeByNavigator()) {
                case 'android':
                    if (window.location.href.substring(0, 4) === 'file') {
                        cordovaSrc = 'file:///android_asset/www/cordova.js';
                    }
                    break;
                case 'ipad':
                case 'iphone':
                    try {
                        var resource = window.location.search.match(/cordova_js_bootstrap_resource=(.*?)(&|#|$)/i);
                        if (resource) {
                            cordovaSrc = decodeURI(resource[1]);
                        }
                    }
                    catch (e) {
                        self.logger.info('could not find cordova_js_bootstrap_resource query param');
                        self.logger.info(e);
                    }
                    break;
                default:
                    break;
            }
            cordovaScript.setAttribute('src', cordovaSrc);
            document.head.appendChild(cordovaScript);
            self.logger.info('injecting cordova.js');
        }
    };
    /**
     * Determine the device type via the user agent string
     * @return {string} name of device platform or 'unknown' if unable to identify the device
     */
    IonicPlatformCore.prototype.getDeviceTypeByNavigator = function () {
        var agent = navigator.userAgent;
        var ipad = agent.match(/iPad/i);
        if (ipad && (ipad[0].toLowerCase() === 'ipad')) {
            return 'ipad';
        }
        var iphone = agent.match(/iPhone/i);
        if (iphone && (iphone[0].toLowerCase() === 'iphone')) {
            return 'iphone';
        }
        var android = agent.match(/Android/i);
        if (android && (android[0].toLowerCase() === 'android')) {
            return 'android';
        }
        return 'unknown';
    };
    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
    IonicPlatformCore.prototype.isAndroidDevice = function () {
        var device = this.getDeviceTypeByNavigator();
        if (device === 'android') {
            return true;
        }
        return false;
    };
    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
    IonicPlatformCore.prototype.isIOSDevice = function () {
        var device = this.getDeviceTypeByNavigator();
        if (device === 'iphone' || device === 'ipad') {
            return true;
        }
        return false;
    };
    /**
     * Bootstrap Ionic Core
     *
     * Handles the cordova.js bootstrap
     * @return {void}
     */
    IonicPlatformCore.prototype._bootstrap = function () {
        this.loadCordova();
        switch (this.getDeviceTypeByNavigator()) {
            case 'unknown':
                this.cordovaPlatformUnknown = true;
                break;
        }
    };
    IonicPlatformCore.prototype.deviceConnectedToNetwork = function (strictMode) {
        if (strictMode === void 0) { strictMode = null; }
        if (typeof strictMode === 'undefined') {
            strictMode = false;
        }
        if (typeof navigator.connection === 'undefined' ||
            typeof navigator.connection.type === 'undefined' ||
            typeof Connection === 'undefined') {
            if (!strictMode) {
                return true;
            }
            return false;
        }
        switch (navigator.connection.type) {
            case Connection.ETHERNET:
            case Connection.WIFI:
            case Connection.CELL_2G:
            case Connection.CELL_3G:
            case Connection.CELL_4G:
            case Connection.CELL:
                return true;
            default:
                return false;
        }
    };
    /**
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    IonicPlatformCore.prototype.onReady = function (callback) {
        var self = this;
        if (this._pluginsReady) {
            callback(self);
        }
        else {
            self.emitter.on('ionic_core:plugins_ready', function () {
                callback(self);
            });
        }
    };
    return IonicPlatformCore;
}());
exports.IonicPlatformCore = IonicPlatformCore;
exports.IonicPlatform = new IonicPlatformCore();

},{"./config":9,"./events":12,"./logger":14,"./storage":17}],11:[function(require,module,exports){
"use strict";
var dataTypeMapping = {};
var DataTypeSchema = (function () {
    function DataTypeSchema(properties) {
        this.data = {};
        this.setProperties(properties);
    }
    DataTypeSchema.prototype.setProperties = function (properties) {
        if (properties instanceof Object) {
            for (var x in properties) {
                this.data[x] = properties[x];
            }
        }
    };
    DataTypeSchema.prototype.toJSON = function () {
        var data = this.data;
        return {
            '__Ionic_DataTypeSchema': data.name,
            'value': data.value
        };
    };
    DataTypeSchema.prototype.isValid = function () {
        if (this.data.name && this.data.value) {
            return true;
        }
        return false;
    };
    return DataTypeSchema;
}());
exports.DataTypeSchema = DataTypeSchema;
var DataType = (function () {
    function DataType() {
    }
    DataType.get = function (name, value) {
        if (dataTypeMapping[name]) {
            return new dataTypeMapping[name](value);
        }
        return false;
    };
    DataType.getMapping = function () {
        return dataTypeMapping;
    };
    Object.defineProperty(DataType, "Schema", {
        get: function () {
            return DataTypeSchema;
        },
        enumerable: true,
        configurable: true
    });
    DataType.register = function (name, cls) {
        dataTypeMapping[name] = cls;
    };
    return DataType;
}());
exports.DataType = DataType;
var UniqueArray = (function () {
    function UniqueArray(value) {
        this.data = [];
        if (value instanceof Array) {
            for (var x in value) {
                this.push(value[x]);
            }
        }
    }
    UniqueArray.prototype.toJSON = function () {
        var data = this.data;
        var schema = new DataTypeSchema({ 'name': 'UniqueArray', 'value': data });
        return schema.toJSON();
    };
    UniqueArray.fromStorage = function (value) {
        return new UniqueArray(value);
    };
    UniqueArray.prototype.push = function (value) {
        if (this.data.indexOf(value) === -1) {
            this.data.push(value);
        }
    };
    UniqueArray.prototype.pull = function (value) {
        var index = this.data.indexOf(value);
        this.data.splice(index, 1);
    };
    return UniqueArray;
}());
exports.UniqueArray = UniqueArray;
DataType.register('UniqueArray', UniqueArray);

},{}],12:[function(require,module,exports){
"use strict";
var EventEmitter = (function () {
    function EventEmitter() {
        this.eventHandlers = {};
    }
    EventEmitter.prototype.on = function (event, callback) {
        if (typeof this.eventHandlers[event] === 'undefined') {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(callback);
    };
    EventEmitter.prototype.emit = function (event, data) {
        if (data === void 0) { data = null; }
        if (typeof this.eventHandlers[event] === 'undefined') {
            this.eventHandlers[event] = [];
        }
        for (var _i = 0, _a = this.eventHandlers[event]; _i < _a.length; _i++) {
            var callback = _a[_i];
            callback(data);
        }
    };
    return EventEmitter;
}());
exports.EventEmitter = EventEmitter;

},{}],13:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./app'));
__export(require('./core'));
__export(require('./data-types'));
__export(require('./events'));
__export(require('./logger'));
__export(require('./promise'));
__export(require('./request'));
__export(require('./config'));
__export(require('./storage'));
__export(require('./user'));
__export(require('./client'));

},{"./app":7,"./client":8,"./config":9,"./core":10,"./data-types":11,"./events":12,"./logger":14,"./promise":15,"./request":16,"./storage":17,"./user":18}],14:[function(require,module,exports){
"use strict";
var Logger = (function () {
    function Logger(opts) {
        var options = opts || {};
        this._silence = false;
        this._prefix = null;
        this._options = options;
        this._bootstrap();
    }
    Logger.prototype.silence = function () {
        this._silence = true;
    };
    Logger.prototype.verbose = function () {
        this._silence = false;
    };
    Logger.prototype._bootstrap = function () {
        if (this._options.prefix) {
            this._prefix = this._options.prefix;
        }
    };
    Logger.prototype.info = function (data) {
        if (!this._silence) {
            if (this._prefix) {
                console.log(this._prefix, data);
            }
            else {
                console.log(data);
            }
        }
    };
    Logger.prototype.warn = function (data) {
        if (!this._silence) {
            if (this._prefix) {
                console.log(this._prefix, data);
            }
            else {
                console.log(data);
            }
        }
    };
    Logger.prototype.error = function (data) {
        if (this._prefix) {
            console.error(this._prefix, data);
        }
        else {
            console.error(data);
        }
    };
    return Logger;
}());
exports.Logger = Logger;

},{}],15:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var es6_promise_1 = require('es6-promise');
var PromiseWithNotify = (function (_super) {
    __extends(PromiseWithNotify, _super);
    function PromiseWithNotify() {
        _super.apply(this, arguments);
    }
    PromiseWithNotify.prototype.then = function (onFulfilled, onRejected, onNotified) {
        this.onNotify = onNotified;
        return _super.prototype.then.call(this, onFulfilled, onRejected);
    };
    return PromiseWithNotify;
}(es6_promise_1.Promise));
exports.PromiseWithNotify = PromiseWithNotify;
var DeferredPromise = (function () {
    function DeferredPromise() {
        var _this = this;
        this.notifyValues = [];
        this.promise = new PromiseWithNotify(function (resolve, reject) {
            _this.resolve = resolve;
            _this.reject = reject;
        });
        var originalThen = this.promise.then;
        this.promise.then = function (ok, fail, notify) {
            _this._notify = notify;
            for (var _i = 0, _a = _this.notifyValues; _i < _a.length; _i++) {
                var v = _a[_i];
                _this._notify(v);
            }
            return originalThen.call(_this.promise, ok, fail);
        };
    }
    DeferredPromise.prototype.notify = function (value) {
        if (typeof this._notify !== 'function') {
            this.notifyValues.push(value);
        }
        else {
            this._notify(value);
        }
    };
    return DeferredPromise;
}());
exports.DeferredPromise = DeferredPromise;

},{"es6-promise":32}],16:[function(require,module,exports){
"use strict";
var promise_1 = require('./promise');
var auth_1 = require('../auth/auth');
var r = require('superagent');
function request(options) {
    options.headers = options.headers || {};
    if (!options.headers.Authorization) {
        var token = auth_1.Auth.getUserToken();
        if (token) {
            options.headers.Authorization = 'Bearer ' + token;
        }
    }
    var requestInfo = {};
    var p = new promise_1.DeferredPromise();
    var request_method = (options.method || 'get').toLowerCase();
    var req = r[request_method](options.uri || options.url);
    if (options.json) {
        req = req.send(options.json);
    }
    if (options.headers) {
        req = req.set(options.headers);
    }
    req = req.end(function (err, res) {
        requestInfo._lastError = err;
        requestInfo._lastResult = res;
        if (err) {
            p.reject(err);
        }
        else {
            if (res.status < 200 || res.status >= 400) {
                var _err = new Error('Request Failed with status code of ' + res.status);
                p.reject({ 'response': res, 'error': _err });
            }
            else {
                p.resolve({ 'response': res, 'payload': res.body });
            }
        }
    });
    p.requestInfo = requestInfo;
    return p.promise;
}
exports.request = request;

},{"../auth/auth":5,"./promise":15,"superagent":35}],17:[function(require,module,exports){
"use strict";
var promise_1 = require('./promise');
var PlatformLocalStorageStrategy = (function () {
    function PlatformLocalStorageStrategy() {
    }
    PlatformLocalStorageStrategy.prototype.get = function (key) {
        return window.localStorage.getItem(key);
    };
    PlatformLocalStorageStrategy.prototype.remove = function (key) {
        return window.localStorage.removeItem(key);
    };
    PlatformLocalStorageStrategy.prototype.set = function (key, value) {
        return window.localStorage.setItem(key, value);
    };
    return PlatformLocalStorageStrategy;
}());
exports.PlatformLocalStorageStrategy = PlatformLocalStorageStrategy;
var LocalSessionStorageStrategy = (function () {
    function LocalSessionStorageStrategy() {
    }
    LocalSessionStorageStrategy.prototype.get = function (key) {
        return window.sessionStorage.getItem(key);
    };
    LocalSessionStorageStrategy.prototype.remove = function (key) {
        return window.sessionStorage.removeItem(key);
    };
    LocalSessionStorageStrategy.prototype.set = function (key, value) {
        return window.sessionStorage.setItem(key, value);
    };
    return LocalSessionStorageStrategy;
}());
exports.LocalSessionStorageStrategy = LocalSessionStorageStrategy;
var objectCache = {};
var memoryLocks = {};
var Storage = (function () {
    function Storage() {
        this.strategy = new PlatformLocalStorageStrategy();
    }
    /**
     * Stores an object in local storage under the given key
     * @param {string} key Name of the key to store values in
     * @param {object} object The object to store with the key
     * @return {void}
     */
    Storage.prototype.storeObject = function (key, object) {
        // Convert object to JSON and store in localStorage
        var json = JSON.stringify(object);
        this.strategy.set(key, json);
        // Then store it in the object cache
        objectCache[key] = object;
    };
    Storage.prototype.deleteObject = function (key) {
        this.strategy.remove(key);
        delete objectCache[key];
    };
    /**
     * Either retrieves the cached copy of an object,
     * or the object itself from localStorage.
     * @param {string} key The name of the key to pull from
     * @return {mixed} Returns the previously stored Object or null
     */
    Storage.prototype.retrieveObject = function (key) {
        // First check to see if it's the object cache
        var cached = objectCache[key];
        if (cached) {
            return cached;
        }
        // Deserialize the object from JSON
        var json = this.strategy.get(key);
        // null or undefined --> return null.
        if (json === null) {
            return null;
        }
        try {
            return JSON.parse(json);
        }
        catch (err) {
            return null;
        }
    };
    /**
     * Locks the async call represented by the given promise and lock key.
     * Only one asyncFunction given by the lockKey can be running at any time.
     *
     * @param {string} lockKey should be a string representing the name of this async call.
     *        This is required for persistence.
     * @param {function} asyncFunction Returns a promise of the async call.
     * @returns {Promise} A new promise, identical to the one returned by asyncFunction,
     *          but with two new errors: 'in_progress', and 'last_call_interrupted'.
     */
    Storage.prototype.lockedAsyncCall = function (lockKey, asyncFunction) {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        // If the memory lock is set, error out.
        if (memoryLocks[lockKey]) {
            deferred.reject('in_progress');
            return deferred.promise;
        }
        // If there is a stored lock but no memory lock, flag a persistence error
        if (this.strategy.get(lockKey) === 'locked') {
            deferred.reject('last_call_interrupted');
            deferred.promise.then(null, function () {
                self.strategy.remove(lockKey);
            });
            return deferred.promise;
        }
        // Set stored and memory locks
        memoryLocks[lockKey] = true;
        self.strategy.set(lockKey, 'locked');
        // Perform the async operation
        asyncFunction().then(function (successData) {
            deferred.resolve(successData);
            // Remove stored and memory locks
            delete memoryLocks[lockKey];
            self.strategy.remove(lockKey);
        }, function (errorData) {
            deferred.reject(errorData);
            // Remove stored and memory locks
            delete memoryLocks[lockKey];
            self.strategy.remove(lockKey);
        }, function (notifyData) {
            deferred.notify(notifyData);
        });
        return deferred.promise;
    };
    return Storage;
}());
exports.Storage = Storage;

},{"./promise":15}],18:[function(require,module,exports){
"use strict";
var auth_1 = require('../auth/auth');
var request_1 = require('./request');
var promise_1 = require('./promise');
var core_1 = require('./core');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var data_types_1 = require('./data-types');
var AppUserContext = null;
var storage = new storage_1.Storage();
var userAPIBase = core_1.IonicPlatform.config.getURL('platform-api') + '/auth/users';
var userAPIEndpoints = {
    'self': function () {
        return userAPIBase + '/self';
    },
    'get': function (userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'remove': function (userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'save': function (userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'passwordReset': function (userModel) {
        return userAPIBase + '/' + userModel.id + '/password-reset';
    }
};
var UserContext = (function () {
    function UserContext() {
    }
    Object.defineProperty(UserContext, "label", {
        get: function () {
            return 'ionic_io_user_' + core_1.IonicPlatform.config.get('app_id');
        },
        enumerable: true,
        configurable: true
    });
    UserContext.delete = function () {
        storage.deleteObject(UserContext.label);
    };
    UserContext.store = function () {
        if (UserContext.getRawData()) {
            UserContext.storeLegacyData(UserContext.getRawData());
        }
        if (User.current().data.data.__ionic_user_migrated) {
            storage.storeObject(UserContext.label + '_legacy', { '__ionic_user_migrated': true });
        }
        storage.storeObject(UserContext.label, User.current());
    };
    UserContext.storeLegacyData = function (data) {
        if (!UserContext.getRawLegacyData()) {
            storage.storeObject(UserContext.label + '_legacy', data);
        }
    };
    UserContext.getRawData = function () {
        return storage.retrieveObject(UserContext.label) || false;
    };
    UserContext.getRawLegacyData = function () {
        return storage.retrieveObject(UserContext.label + '_legacy') || false;
    };
    UserContext.load = function () {
        var data = storage.retrieveObject(UserContext.label) || false;
        if (data) {
            UserContext.storeLegacyData(data);
            return User.fromContext(data);
        }
        return;
    };
    return UserContext;
}());
var UserData = (function () {
    function UserData(data) {
        if (data === void 0) { data = {}; }
        this.data = {};
        if ((typeof data === 'object')) {
            this.data = data;
            this.deserializerDataTypes();
        }
    }
    UserData.prototype.deserializerDataTypes = function () {
        for (var x in this.data) {
            // if we have an object, let's check for custom data types
            if (typeof this.data[x] === 'object') {
                // do we have a custom type?
                if (this.data[x].__Ionic_DataTypeSchema) {
                    var name = this.data[x].__Ionic_DataTypeSchema;
                    var mapping = data_types_1.DataType.getMapping();
                    if (mapping[name]) {
                        // we have a custom type and a registered class, give the custom data type
                        // from storage
                        this.data[x] = mapping[name].fromStorage(this.data[x].value);
                    }
                }
            }
        }
    };
    UserData.prototype.set = function (key, value) {
        this.data[key] = value;
    };
    UserData.prototype.unset = function (key) {
        delete this.data[key];
    };
    UserData.prototype.get = function (key, defaultValue) {
        if (this.data.hasOwnProperty(key)) {
            return this.data[key];
        }
        else {
            if (defaultValue === 0 || defaultValue === false) {
                return defaultValue;
            }
            return defaultValue || null;
        }
    };
    return UserData;
}());
exports.UserData = UserData;
var User = (function () {
    function User() {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic User:'
        });
        this._blockLoad = false;
        this._blockSave = false;
        this._blockDelete = false;
        this._dirty = false;
        this._fresh = true;
        this._unset = {};
        this.data = new UserData();
    }
    User.prototype.isDirty = function () {
        return this._dirty;
    };
    User.prototype.isAnonymous = function () {
        if (!this.id) {
            return true;
        }
        else {
            return false;
        }
    };
    User.prototype.isAuthenticated = function () {
        if (this === User.current()) {
            return auth_1.Auth.isAuthenticated();
        }
        return false;
    };
    User.current = function (user) {
        if (user) {
            AppUserContext = user;
            UserContext.store();
            return AppUserContext;
        }
        else {
            if (!AppUserContext) {
                AppUserContext = UserContext.load();
            }
            if (!AppUserContext) {
                AppUserContext = new User();
            }
            return AppUserContext;
        }
    };
    User.fromContext = function (data) {
        var user = new User();
        user.id = data._id;
        user.data = new UserData(data.data.data);
        user.details = data.details || {};
        user._fresh = data._fresh;
        user._dirty = data._dirty;
        return user;
    };
    User.self = function () {
        var deferred = new promise_1.DeferredPromise();
        var tempUser = new User();
        if (!tempUser._blockLoad) {
            tempUser._blockLoad = true;
            request_1.request({
                'uri': userAPIEndpoints.self(),
                'method': 'GET',
                'json': true
            }).then(function (result) {
                tempUser._blockLoad = false;
                tempUser.logger.info('loaded user');
                // set the custom data
                tempUser.id = result.payload.data.uuid;
                tempUser.data = new UserData(result.payload.data.custom);
                tempUser.details = result.payload.data.details;
                tempUser._fresh = false;
                User.current(tempUser);
                deferred.resolve(tempUser);
            }, function (error) {
                tempUser._blockLoad = false;
                tempUser.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            tempUser.logger.info('a load operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.load = function (id) {
        var deferred = new promise_1.DeferredPromise();
        var tempUser = new User();
        tempUser.id = id;
        if (!tempUser._blockLoad) {
            tempUser._blockLoad = true;
            request_1.request({
                'uri': userAPIEndpoints.get(tempUser),
                'method': 'GET',
                'json': true
            }).then(function (result) {
                tempUser._blockLoad = false;
                tempUser.logger.info('loaded user');
                // set the custom data
                tempUser.data = new UserData(result.payload.data.custom);
                tempUser.details = result.payload.data.details;
                tempUser._fresh = false;
                deferred.resolve(tempUser);
            }, function (error) {
                tempUser._blockLoad = false;
                tempUser.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            tempUser.logger.info('a load operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.prototype.isFresh = function () {
        return this._fresh;
    };
    User.prototype.isValid = function () {
        if (this.id) {
            return true;
        }
        return false;
    };
    User.prototype.getAPIFormat = function () {
        var apiFormat = {};
        for (var key in this.details) {
            apiFormat[key] = this.details[key];
        }
        apiFormat.custom = this.data.data;
        return apiFormat;
    };
    User.prototype.getFormat = function (format) {
        var self = this;
        var formatted = null;
        switch (format) {
            case 'api-save':
                formatted = self.getAPIFormat();
                break;
        }
        return formatted;
    };
    User.prototype.migrate = function () {
        var rawData = UserContext.getRawLegacyData();
        if (rawData.__ionic_user_migrated) {
            return true;
        }
        if (rawData) {
            var currentUser = Ionic.User.current();
            var userData = new UserData(rawData.data.data);
            for (var key in userData.data) {
                currentUser.set(key, userData.data[key]);
            }
            currentUser.set('__ionic_user_migrated', true);
        }
    };
    User.prototype.delete = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        if (self.isValid()) {
            if (!self._blockDelete) {
                self._blockDelete = true;
                self._delete();
                request_1.request({
                    'uri': userAPIEndpoints.remove(this),
                    'method': 'DELETE',
                    'json': true
                }).then(function (result) {
                    self._blockDelete = false;
                    self.logger.info('deleted ' + self);
                    deferred.resolve(result);
                }, function (error) {
                    self._blockDelete = false;
                    self.logger.error(error);
                    deferred.reject(error);
                });
            }
            else {
                self.logger.info('a delete operation is already in progress for ' + this + '.');
                deferred.reject(false);
            }
        }
        else {
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.prototype._store = function () {
        if (this === User.current()) {
            UserContext.store();
        }
    };
    User.prototype._delete = function () {
        if (this === User.current()) {
            UserContext.delete();
        }
    };
    User.prototype.save = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        if (!self._blockSave) {
            self._blockSave = true;
            self._store();
            request_1.request({
                'uri': userAPIEndpoints.save(this),
                'method': 'PATCH',
                'json': self.getFormat('api-save')
            }).then(function (result) {
                self._dirty = false;
                if (!self.isFresh()) {
                    self._unset = {};
                }
                self._fresh = false;
                self._blockSave = false;
                self.logger.info('saved user');
                deferred.resolve(result);
            }, function (error) {
                self._dirty = true;
                self._blockSave = false;
                self.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            self.logger.info('a save operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.prototype.resetPassword = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        request_1.request({
            'uri': userAPIEndpoints.passwordReset(this),
            'method': 'POST'
        }).then(function (result) {
            self.logger.info('password reset for user');
            deferred.resolve(result);
        }, function (error) {
            self.logger.error(error);
            deferred.reject(error);
        });
        return deferred.promise;
    };
    Object.defineProperty(User.prototype, "id", {
        get: function () {
            return this._id || null;
        },
        set: function (v) {
            this._id = v;
        },
        enumerable: true,
        configurable: true
    });
    User.prototype.toString = function () {
        return '<IonicUser [\'' + this.id + '\']>';
    };
    User.prototype.set = function (key, value) {
        delete this._unset[key];
        return this.data.set(key, value);
    };
    User.prototype.get = function (key, defaultValue) {
        return this.data.get(key, defaultValue);
    };
    User.prototype.unset = function (key) {
        this._unset[key] = true;
        return this.data.unset(key);
    };
    return User;
}());
exports.User = User;

},{"../auth/auth":5,"./core":10,"./data-types":11,"./logger":14,"./promise":15,"./request":16,"./storage":17}],19:[function(require,module,exports){
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

},{"../core/core":10,"../core/events":12,"../core/logger":14,"../core/promise":15}],20:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./deploy'));

},{"./deploy":19}],21:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./analytics/index'));
__export(require('./auth/index'));
__export(require('./core/index'));
__export(require('./deploy/index'));
__export(require('./insights/index'));
__export(require('./push/index'));
__export(require('./util/index'));

},{"./analytics/index":2,"./auth/index":6,"./core/index":13,"./deploy/index":20,"./insights/index":22,"./push/index":24,"./util/index":29}],22:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./insights'));

},{"./insights":23}],23:[function(require,module,exports){
"use strict";
var logger_1 = require('../core/logger');
var Stat = (function () {
    function Stat(appId, stat, value) {
        if (value === void 0) { value = 1; }
        this.appId = appId;
        this.stat = stat;
        this.value = value;
        this.appId = appId;
        this.stat = stat;
        this.value = value;
        this.created = new Date();
    }
    Stat.prototype.toJSON = function () {
        return {
            app_id: this.appId,
            stat: this.stat,
            value: this.value,
            created: this.created.toISOString(),
        };
    };
    return Stat;
}());
var Insights = (function () {
    function Insights(appId) {
        this.appId = appId;
        this.appId = appId;
        this.batch = [];
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Insights:'
        });
        this.logger.info('init');
    }
    Insights.prototype.track = function (stat, value) {
        if (value === void 0) { value = 1; }
        this.batch.push(new Stat(this.appId, stat, value));
        this.submit();
    };
    Insights.prototype.submit = function () {
        if (this.batch.length >= Insights.SUBMIT_COUNT) {
        }
    };
    Insights.SUBMIT_COUNT = 100;
    return Insights;
}());
exports.Insights = Insights;

},{"../core/logger":14}],24:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./push-dev'));
__export(require('./push-message'));
__export(require('./push-token'));
__export(require('./push'));

},{"./push":28,"./push-dev":25,"./push-message":26,"./push-token":27}],25:[function(require,module,exports){
"use strict";
var request_1 = require('../core/request');
var core_1 = require('../core/core');
var logger_1 = require('../core/logger');
var util_1 = require('../util/util');
var push_token_1 = require('./push-token');
/**
 * PushDev Service
 *
 * This service acts as a mock push service that is intended to be used pre-setup of
 * GCM/APNS in an Ionic.io project.
 *
 * How it works:
 *
 *   When register() is called, this service is used to generate a random
 *   development device token. This token is not valid for any service outside of
 *   Ionic Push with `dev_push` set to true. These tokens do not last long and are not
 *   eligible for use in a production app.
 *
 *   The device will then periodically check the Push service for push notifications sent
 *   to our development token -- so unlike a typical "push" update, this actually uses
 *   "polling" to find new notifications. This means you *MUST* have the application open
 *   and in the foreground to retreive messsages.
 *
 *   The callbacks provided in your init() will still be triggered as normal,
 *   but with these notable exceptions:
 *
 *      - There is no payload data available with messages
 *      - An alert() is called when a notification is received unlesss you return false
 *        in your 'onNotification' callback.
 *
 */
var PushDevService = (function () {
    function PushDevService() {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Push (dev):'
        });
        this._serviceHost = core_1.IonicPlatform.config.getURL('platform-api') + '/push';
        this._token = null;
        this._watch = null;
    }
    /**
     * Generate a development token
     *
     * @return {String} development device token
     */
    PushDevService.prototype.getDevToken = function () {
        var token = util_1.generateUUID();
        this._token = 'DEV-' + token;
        return this._token;
    };
    /**
     * Registers a development token with the Ionic Push service
     *
     * @param {IonicPushService} ionicPush Instantiated Push Service
     * @param {function} callback Registration Callback
     * @return {void}
     */
    PushDevService.prototype.init = function (ionicPush, callback) {
        this._push = ionicPush;
        this._emitter = this._push._emitter;
        var token = this._token;
        var self = this;
        if (!token) {
            token = this.getDevToken();
        }
        var requestOptions = {
            'method': 'POST',
            'uri': this._serviceHost + '/development',
            'json': {
                'token': token
            }
        };
        request_1.request(requestOptions).then(function () {
            var data = { 'registrationId': token };
            self.logger.info('registered with development push service: ' + token);
            self._emitter.emit('ionic_push:token', data);
            if ((typeof callback === 'function')) {
                callback(new push_token_1.PushToken(self._token));
            }
            self.watch();
        }, function (error) {
            self.logger.error('error connecting development push service: ' + error);
        });
    };
    /**
     * Checks the push service for notifications that target the current development token
     * @return {void}
     */
    PushDevService.prototype.checkForNotifications = function () {
        if (!this._token) {
            return false;
        }
        var self = this;
        var requestOptions = {
            'method': 'GET',
            'uri': self._serviceHost + '/development?token=' + self._token,
            'json': true
        };
        request_1.request(requestOptions).then(function (result) {
            if (result.payload.data.message) {
                var message = {
                    'message': result.payload.data.message,
                    'title': 'DEVELOPMENT PUSH'
                };
                self.logger.warn('Ionic Push: Development Push received. Development pushes will not contain payload data.');
                self._emitter.emit('ionic_push:notification', message);
            }
        }, function (error) {
            self.logger.error('unable to check for development pushes: ' + error);
        });
    };
    /**
     * Kicks off the "polling" of the Ionic Push service for new push notifications
     * @return {void}
     */
    PushDevService.prototype.watch = function () {
        // Check for new dev pushes every 5 seconds
        this.logger.info('watching for new notifications');
        var self = this;
        if (!this._watch) {
            this._watch = setInterval(function () { self.checkForNotifications(); }, 5000);
        }
    };
    /**
     * Puts the "polling" for new notifications on hold.
     * @return {void}
     */
    PushDevService.prototype.halt = function () {
        if (this._watch) {
            clearInterval(this._watch);
        }
    };
    return PushDevService;
}());
exports.PushDevService = PushDevService;

},{"../core/core":10,"../core/logger":14,"../core/request":16,"../util/util":30,"./push-token":27}],26:[function(require,module,exports){
"use strict";
var PushMessageAppStatus = (function () {
    function PushMessageAppStatus() {
        this.asleep = false;
        this.closed = false;
    }
    Object.defineProperty(PushMessageAppStatus.prototype, "wasAsleep", {
        get: function () {
            return this.asleep;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PushMessageAppStatus.prototype, "wasClosed", {
        get: function () {
            return this.closed;
        },
        enumerable: true,
        configurable: true
    });
    return PushMessageAppStatus;
}());
exports.PushMessageAppStatus = PushMessageAppStatus;
var PushMessage = (function () {
    function PushMessage(raw) {
        this._raw = raw || {};
        if (!this._raw.additionalData) {
            // this should only hit if we are serving up a development push
            this._raw.additionalData = {
                'coldstart': false,
                'foreground': true
            };
        }
        this._payload = null;
        this.app = null;
        this.text = null;
        this.title = null;
        this.count = null;
        this.sound = null;
        this.image = null;
    }
    PushMessage.fromPluginJSON = function (json) {
        var message = new PushMessage(json);
        message.processRaw();
        return message;
    };
    Object.defineProperty(PushMessage.prototype, "payload", {
        get: function () {
            return this._payload || {};
        },
        enumerable: true,
        configurable: true
    });
    PushMessage.prototype.processRaw = function () {
        this.text = this._raw.message || null;
        this.title = this._raw.title || null;
        this.count = this._raw.count || null;
        this.sound = this._raw.sound || null;
        this.image = this._raw.image || null;
        this.app = new PushMessageAppStatus();
        if (!this._raw.additionalData.foreground) {
            this.app.asleep = true;
        }
        if (this._raw.additionalData.coldstart) {
            this.app.closed = true;
        }
        if (this._raw.additionalData.payload) {
            this._payload = this._raw.additionalData.payload;
        }
    };
    PushMessage.prototype.getRawVersion = function () {
        return this._raw;
    };
    PushMessage.prototype.toString = function () {
        return '<PushMessage [\'' + this.title + '\']>';
    };
    return PushMessage;
}());
exports.PushMessage = PushMessage;

},{}],27:[function(require,module,exports){
"use strict";
var PushToken = (function () {
    function PushToken(token) {
        this.token = token;
        this.token = token;
    }
    PushToken.prototype.toString = function () {
        return "<PushToken [" + this.token + "]>";
    };
    return PushToken;
}());
exports.PushToken = PushToken;

},{}],28:[function(require,module,exports){
"use strict";
var app_1 = require('../core/app');
var core_1 = require('../core/core');
var logger_1 = require('../core/logger');
var events_1 = require('../core/events');
var request_1 = require('../core/request');
var promise_1 = require('../core/promise');
var user_1 = require('../core/user');
var push_token_1 = require('./push-token');
var push_message_1 = require('./push-message');
var push_dev_1 = require('./push-dev');
var DEFER_INIT = 'DEFER_INIT';
var pushAPIBase = core_1.IonicPlatform.config.getURL('platform-api') + '/push';
var pushAPIEndpoints = {
    'saveToken': function () {
        return pushAPIBase + '/tokens';
    },
    'invalidateToken': function () {
        return pushAPIBase + '/tokens/invalidate';
    }
};
var Push = (function () {
    function Push(config) {
        this._token = null;
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Push:'
        });
        var app = new app_1.App(core_1.IonicPlatform.config.get('app_id'), core_1.IonicPlatform.config.get('api_key'));
        app.devPush = core_1.IonicPlatform.config.get('dev_push');
        app.gcmKey = core_1.IonicPlatform.config.get('gcm_key');
        // Check for the required values to use this service
        if (!app.id || !app.apiKey) {
            this.logger.error('no app_id found. (http://docs.ionic.io/docs/io-install)');
            return;
        }
        else if (core_1.IonicPlatform.isAndroidDevice() && !app.devPush && !app.gcmKey) {
            this.logger.error('GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
            return;
        }
        this.app = app;
        this.registerCallback = null;
        this.notificationCallback = null;
        this.errorCallback = null;
        this._notification = false;
        this._debug = false;
        this._isReady = false;
        this._tokenReady = false;
        this._blockRegistration = false;
        this._blockSaveToken = false;
        this._registered = false;
        this._emitter = new events_1.EventEmitter();
        this._plugin = null;
        if (config !== DEFER_INIT) {
            var self = this;
            core_1.IonicPlatform.onReady(function () {
                self.init(config);
            });
        }
    }
    Object.defineProperty(Push.prototype, "token", {
        set: function (val) {
            var storage = core_1.IonicPlatform.getStorage();
            if (val instanceof push_token_1.PushToken) {
                storage.storeObject('ionic_io_push_token', { 'token': val.token });
            }
            this._token = val;
        },
        enumerable: true,
        configurable: true
    });
    Push.prototype.getStorageToken = function () {
        var storage = core_1.IonicPlatform.getStorage();
        var token = storage.retrieveObject('ionic_io_push_token');
        if (token) {
            return new push_token_1.PushToken(token.token);
        }
        return null;
    };
    Push.prototype.clearStorageToken = function () {
        var storage = core_1.IonicPlatform.getStorage();
        storage.deleteObject('ionic_io_push_token');
    };
    /**
     * Init method to setup push behavior/options
     *
     * The config supports the following properties:
     *   - debug {Boolean} Enables some extra logging as well as some default callback handlers
     *   - onNotification {Function} Callback function that is passed the notification object
     *   - onRegister {Function} Callback function that is passed the registration object
     *   - onError {Function} Callback function that is passed the error object
     *   - pluginConfig {Object} Plugin configuration: https://github.com/phonegap/phonegap-plugin-push
     *
     * @param {object} config Configuration object
     * @return {Push} returns the called Push instantiation
     */
    Push.prototype.init = function (config) {
        this._getPushPlugin();
        if (typeof config === 'undefined') {
            config = {};
        }
        if (typeof config !== 'object') {
            this.logger.error('init() requires a valid config object.');
            return;
        }
        var self = this;
        if (!config.pluginConfig) {
            config.pluginConfig = {};
        }
        if (core_1.IonicPlatform.isAndroidDevice()) {
            // inject gcm key for PushPlugin
            if (!config.pluginConfig.android) {
                config.pluginConfig.android = {};
            }
            if (!config.pluginConfig.android.senderId) {
                config.pluginConfig.android.senderID = self.app.gcmKey;
            }
        }
        // Store Callbacks
        if (config.onRegister) {
            this.setRegisterCallback(config.onRegister);
        }
        if (config.onNotification) {
            this.setNotificationCallback(config.onNotification);
        }
        if (config.onError) {
            this.setErrorCallback(config.onError);
        }
        this._config = config;
        this._isReady = true;
        this._emitter.emit('ionic_push:ready', { 'config': this._config });
        return this;
    };
    Push.prototype.saveToken = function (token, options) {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        var opts = options || {};
        if (token.token) {
            token = token.token;
        }
        var tokenData = {
            'token': token,
            'app_id': core_1.IonicPlatform.config.get('app_id')
        };
        if (!opts.ignore_user) {
            var user = user_1.User.current();
            if (user.isAuthenticated()) {
                tokenData.user_id = user.id;
            }
        }
        if (!self._blockSaveToken) {
            request_1.request({
                'uri': pushAPIEndpoints.saveToken(),
                'method': 'POST',
                'json': tokenData
            }).then(function (result) {
                self._blockSaveToken = false;
                self.logger.info('saved push token: ' + token);
                if (tokenData.user_id) {
                    self.logger.info('added push token to user: ' + tokenData.user_id);
                }
                deferred.resolve(result);
            }, function (error) {
                self._blockSaveToken = false;
                self.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            self.logger.info('a token save operation is already in progress.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    /**
     * Registers the device with GCM/APNS to get a device token
     * Fires off the 'onRegister' callback if one has been provided in the init() config
     * @param {function} callback Callback Function
     * @return {void}
     */
    Push.prototype.register = function (callback) {
        this.logger.info('register');
        var self = this;
        if (this._blockRegistration) {
            self.logger.info('another registration is already in progress.');
            return false;
        }
        this._blockRegistration = true;
        this.onReady(function () {
            if (self.app.devPush) {
                var IonicDevPush = new push_dev_1.PushDevService();
                self._debugCallbackRegistration();
                self._callbackRegistration();
                IonicDevPush.init(self, callback);
                self._blockRegistration = false;
                self._tokenReady = true;
            }
            else {
                self._plugin = self._getPushPlugin().init(self._config.pluginConfig);
                self._plugin.on('registration', function (data) {
                    self._blockRegistration = false;
                    self.token = new push_token_1.PushToken(data.registrationId);
                    self._tokenReady = true;
                    if ((typeof callback === 'function')) {
                        callback(self._token);
                    }
                });
                self._debugCallbackRegistration();
                self._callbackRegistration();
            }
            self._registered = true;
        });
    };
    /**
     * Invalidate the current GCM/APNS token
     *
     * @return {Promise} the unregister result
     */
    Push.prototype.unregister = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        var platform = null;
        if (core_1.IonicPlatform.isAndroidDevice()) {
            platform = 'android';
        }
        else if (core_1.IonicPlatform.isIOSDevice()) {
            platform = 'ios';
        }
        if (!platform) {
            deferred.reject('Could not detect the platform, are you on a device?');
        }
        if (!self._blockUnregister) {
            if (this._plugin) {
                this._plugin.unregister(function () { }, function () { });
            }
            request_1.request({
                'uri': pushAPIEndpoints.invalidateToken(),
                'method': 'POST',
                'json': {
                    'platform': platform,
                    'token': self.getStorageToken().token
                }
            }).then(function (result) {
                self._blockUnregister = false;
                self.logger.info('unregistered push token: ' + self.getStorageToken().token);
                self.clearStorageToken();
                deferred.resolve(result);
            }, function (error) {
                self._blockUnregister = false;
                self.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            self.logger.info('an unregister operation is already in progress.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    /**
     * Convenience method to grab the payload object from a notification
     *
     * @param {PushNotification} notification Push Notification object
     * @return {object} Payload object or an empty object
     */
    Push.prototype.getPayload = function (notification) {
        return notification.payload;
    };
    /**
     * Set the registration callback
     *
     * @param {function} callback Registration callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    Push.prototype.setRegisterCallback = function (callback) {
        if (typeof callback !== 'function') {
            this.logger.info('setRegisterCallback() requires a valid callback function');
            return false;
        }
        this.registerCallback = callback;
        return true;
    };
    /**
     * Set the notification callback
     *
     * @param {function} callback Notification callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    Push.prototype.setNotificationCallback = function (callback) {
        if (typeof callback !== 'function') {
            this.logger.info('setNotificationCallback() requires a valid callback function');
            return false;
        }
        this.notificationCallback = callback;
        return true;
    };
    /**
     * Set the error callback
     *
     * @param {function} callback Error callback function
     * @return {boolean} true if set correctly, otherwise false
     */
    Push.prototype.setErrorCallback = function (callback) {
        if (typeof callback !== 'function') {
            this.logger.info('setErrorCallback() requires a valid callback function');
            return false;
        }
        this.errorCallback = callback;
        return true;
    };
    Push.prototype._debugRegistrationCallback = function () {
        var self = this;
        function callback(data) {
            self.token = new push_token_1.PushToken(data.registrationId);
            self.logger.info('(debug) device token registered: ' + self._token);
        }
        return callback;
    };
    Push.prototype._debugNotificationCallback = function () {
        var self = this;
        function callback(notification) {
            self._processNotification(notification);
            var message = push_message_1.PushMessage.fromPluginJSON(notification);
            self.logger.info('(debug) notification received: ' + message);
            if (!self.notificationCallback && self.app.devPush) {
                alert(message.text);
            }
        }
        return callback;
    };
    Push.prototype._debugErrorCallback = function () {
        var self = this;
        function callback(err) {
            self.logger.error('(debug) unexpected error occured.');
            self.logger.error(err);
        }
        return callback;
    };
    Push.prototype._registerCallback = function () {
        var self = this;
        function callback(data) {
            self.token = new push_token_1.PushToken(data.registrationId);
            if (self.registerCallback) {
                return self.registerCallback(self._token);
            }
        }
        return callback;
    };
    Push.prototype._notificationCallback = function () {
        var self = this;
        function callback(notification) {
            self._processNotification(notification);
            var message = push_message_1.PushMessage.fromPluginJSON(notification);
            if (self.notificationCallback) {
                return self.notificationCallback(message);
            }
        }
        return callback;
    };
    Push.prototype._errorCallback = function () {
        var self = this;
        function callback(err) {
            if (self.errorCallback) {
                return self.errorCallback(err);
            }
        }
        return callback;
    };
    /**
     * Registers the default debug callbacks with the PushPlugin when debug is enabled
     * Internal Method
     * @private
     * @return {void}
     */
    Push.prototype._debugCallbackRegistration = function () {
        if (this._config.debug) {
            if (!this.app.devPush) {
                this._plugin.on('registration', this._debugRegistrationCallback());
                this._plugin.on('notification', this._debugNotificationCallback());
                this._plugin.on('error', this._debugErrorCallback());
            }
            else {
                if (!this._registered) {
                    this._emitter.on('ionic_push:token', this._debugRegistrationCallback());
                    this._emitter.on('ionic_push:notification', this._debugNotificationCallback());
                    this._emitter.on('ionic_push:error', this._debugErrorCallback());
                }
            }
        }
    };
    /**
     * Registers the user supplied callbacks with the PushPlugin
     * Internal Method
     * @return {void}
     */
    Push.prototype._callbackRegistration = function () {
        if (!this.app.devPush) {
            this._plugin.on('registration', this._registerCallback());
            this._plugin.on('notification', this._notificationCallback());
            this._plugin.on('error', this._errorCallback());
        }
        else {
            if (!this._registered) {
                this._emitter.on('ionic_push:token', this._registerCallback());
                this._emitter.on('ionic_push:notification', this._notificationCallback());
                this._emitter.on('ionic_push:error', this._errorCallback());
            }
        }
    };
    /**
     * Performs misc features based on the contents of a push notification
     * Internal Method
     *
     * Currently just does the payload $state redirection
     * @param {PushNotification} notification Push Notification object
     * @return {void}
     */
    Push.prototype._processNotification = function (notification) {
        this._notification = notification;
        this._emitter.emit('ionic_push:processNotification', notification);
    };
    /* Deprecated in favor of `getPushPlugin` */
    Push.prototype._getPushPlugin = function () {
        var self = this;
        var PushPlugin = null;
        try {
            PushPlugin = window.PushNotification;
        }
        catch (e) {
            self.logger.info('something went wrong looking for the PushNotification plugin');
        }
        if (!self.app.devPush && !PushPlugin && (core_1.IonicPlatform.isIOSDevice() || core_1.IonicPlatform.isAndroidDevice())) {
            self.logger.error('PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?');
        }
        return PushPlugin;
    };
    /**
     * Fetch the phonegap-push-plugin interface
     *
     * @return {PushNotification} PushNotification instance
     */
    Push.prototype.getPushPlugin = function () {
        return this._plugin;
    };
    /**
     * Fire a callback when Push is ready. This will fire immediately if
     * the service has already initialized.
     *
     * @param {function} callback Callback function to fire off
     * @return {void}
     */
    Push.prototype.onReady = function (callback) {
        var self = this;
        if (this._isReady) {
            callback(self);
        }
        else {
            self._emitter.on('ionic_push:ready', function () {
                callback(self);
            });
        }
    };
    return Push;
}());
exports.Push = Push;

},{"../core/app":7,"../core/core":10,"../core/events":12,"../core/logger":14,"../core/promise":15,"../core/request":16,"../core/user":18,"./push-dev":25,"./push-message":26,"./push-token":27}],29:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./util'));

},{"./util":30}],30:[function(require,module,exports){
"use strict";
function deepExtend() {
    var out = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        out[_i - 0] = arguments[_i];
    }
    out = out[0] || {};
    for (var i = 1; i < arguments.length; i++) {
        var obj = arguments[i];
        if (!obj) {
            continue;
        }
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object') {
                    out[key] = deepExtend(out[key], obj[key]);
                }
                else {
                    out[key] = obj[key];
                }
            }
        }
    }
    return out;
}
exports.deepExtend = deepExtend;
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
exports.generateUUID = generateUUID;

},{}],31:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

if (typeof module !== 'undefined') {
  module.exports = Emitter;
}

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks['$' + event] = this._callbacks['$' + event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  function on() {
    this.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks['$' + event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks['$' + event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks['$' + event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks['$' + event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],32:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   3.2.1
 */

(function() {
    "use strict";
    function lib$es6$promise$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function lib$es6$promise$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function lib$es6$promise$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var lib$es6$promise$utils$$_isArray;
    if (!Array.isArray) {
      lib$es6$promise$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      lib$es6$promise$utils$$_isArray = Array.isArray;
    }

    var lib$es6$promise$utils$$isArray = lib$es6$promise$utils$$_isArray;
    var lib$es6$promise$asap$$len = 0;
    var lib$es6$promise$asap$$vertxNext;
    var lib$es6$promise$asap$$customSchedulerFn;

    var lib$es6$promise$asap$$asap = function asap(callback, arg) {
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len] = callback;
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len + 1] = arg;
      lib$es6$promise$asap$$len += 2;
      if (lib$es6$promise$asap$$len === 2) {
        // If len is 2, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        if (lib$es6$promise$asap$$customSchedulerFn) {
          lib$es6$promise$asap$$customSchedulerFn(lib$es6$promise$asap$$flush);
        } else {
          lib$es6$promise$asap$$scheduleFlush();
        }
      }
    }

    function lib$es6$promise$asap$$setScheduler(scheduleFn) {
      lib$es6$promise$asap$$customSchedulerFn = scheduleFn;
    }

    function lib$es6$promise$asap$$setAsap(asapFn) {
      lib$es6$promise$asap$$asap = asapFn;
    }

    var lib$es6$promise$asap$$browserWindow = (typeof window !== 'undefined') ? window : undefined;
    var lib$es6$promise$asap$$browserGlobal = lib$es6$promise$asap$$browserWindow || {};
    var lib$es6$promise$asap$$BrowserMutationObserver = lib$es6$promise$asap$$browserGlobal.MutationObserver || lib$es6$promise$asap$$browserGlobal.WebKitMutationObserver;
    var lib$es6$promise$asap$$isNode = typeof self === 'undefined' && typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

    // test for web worker but not in IE10
    var lib$es6$promise$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function lib$es6$promise$asap$$useNextTick() {
      // node version 0.10.x displays a deprecation warning when nextTick is used recursively
      // see https://github.com/cujojs/when/issues/410 for details
      return function() {
        process.nextTick(lib$es6$promise$asap$$flush);
      };
    }

    // vertx
    function lib$es6$promise$asap$$useVertxTimer() {
      return function() {
        lib$es6$promise$asap$$vertxNext(lib$es6$promise$asap$$flush);
      };
    }

    function lib$es6$promise$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new lib$es6$promise$asap$$BrowserMutationObserver(lib$es6$promise$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function lib$es6$promise$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = lib$es6$promise$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function lib$es6$promise$asap$$useSetTimeout() {
      return function() {
        setTimeout(lib$es6$promise$asap$$flush, 1);
      };
    }

    var lib$es6$promise$asap$$queue = new Array(1000);
    function lib$es6$promise$asap$$flush() {
      for (var i = 0; i < lib$es6$promise$asap$$len; i+=2) {
        var callback = lib$es6$promise$asap$$queue[i];
        var arg = lib$es6$promise$asap$$queue[i+1];

        callback(arg);

        lib$es6$promise$asap$$queue[i] = undefined;
        lib$es6$promise$asap$$queue[i+1] = undefined;
      }

      lib$es6$promise$asap$$len = 0;
    }

    function lib$es6$promise$asap$$attemptVertx() {
      try {
        var r = require;
        var vertx = r('vertx');
        lib$es6$promise$asap$$vertxNext = vertx.runOnLoop || vertx.runOnContext;
        return lib$es6$promise$asap$$useVertxTimer();
      } catch(e) {
        return lib$es6$promise$asap$$useSetTimeout();
      }
    }

    var lib$es6$promise$asap$$scheduleFlush;
    // Decide what async method to use to triggering processing of queued callbacks:
    if (lib$es6$promise$asap$$isNode) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useNextTick();
    } else if (lib$es6$promise$asap$$BrowserMutationObserver) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMutationObserver();
    } else if (lib$es6$promise$asap$$isWorker) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMessageChannel();
    } else if (lib$es6$promise$asap$$browserWindow === undefined && typeof require === 'function') {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$attemptVertx();
    } else {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useSetTimeout();
    }
    function lib$es6$promise$then$$then(onFulfillment, onRejection) {
      var parent = this;

      var child = new this.constructor(lib$es6$promise$$internal$$noop);

      if (child[lib$es6$promise$$internal$$PROMISE_ID] === undefined) {
        lib$es6$promise$$internal$$makePromise(child);
      }

      var state = parent._state;

      if (state) {
        var callback = arguments[state - 1];
        lib$es6$promise$asap$$asap(function(){
          lib$es6$promise$$internal$$invokeCallback(state, child, callback, parent._result);
        });
      } else {
        lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection);
      }

      return child;
    }
    var lib$es6$promise$then$$default = lib$es6$promise$then$$then;
    function lib$es6$promise$promise$resolve$$resolve(object) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$resolve(promise, object);
      return promise;
    }
    var lib$es6$promise$promise$resolve$$default = lib$es6$promise$promise$resolve$$resolve;
    var lib$es6$promise$$internal$$PROMISE_ID = Math.random().toString(36).substring(16);

    function lib$es6$promise$$internal$$noop() {}

    var lib$es6$promise$$internal$$PENDING   = void 0;
    var lib$es6$promise$$internal$$FULFILLED = 1;
    var lib$es6$promise$$internal$$REJECTED  = 2;

    var lib$es6$promise$$internal$$GET_THEN_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$selfFulfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function lib$es6$promise$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.');
    }

    function lib$es6$promise$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        lib$es6$promise$$internal$$GET_THEN_ERROR.error = error;
        return lib$es6$promise$$internal$$GET_THEN_ERROR;
      }
    }

    function lib$es6$promise$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function lib$es6$promise$$internal$$handleForeignThenable(promise, thenable, then) {
       lib$es6$promise$asap$$asap(function(promise) {
        var sealed = false;
        var error = lib$es6$promise$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            lib$es6$promise$$internal$$resolve(promise, value);
          } else {
            lib$es6$promise$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          lib$es6$promise$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          lib$es6$promise$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function lib$es6$promise$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, thenable._result);
      } else if (thenable._state === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, thenable._result);
      } else {
        lib$es6$promise$$internal$$subscribe(thenable, undefined, function(value) {
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      }
    }

    function lib$es6$promise$$internal$$handleMaybeThenable(promise, maybeThenable, then) {
      if (maybeThenable.constructor === promise.constructor &&
          then === lib$es6$promise$then$$default &&
          constructor.resolve === lib$es6$promise$promise$resolve$$default) {
        lib$es6$promise$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        if (then === lib$es6$promise$$internal$$GET_THEN_ERROR) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        } else if (lib$es6$promise$utils$$isFunction(then)) {
          lib$es6$promise$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function lib$es6$promise$$internal$$resolve(promise, value) {
      if (promise === value) {
        lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$selfFulfillment());
      } else if (lib$es6$promise$utils$$objectOrFunction(value)) {
        lib$es6$promise$$internal$$handleMaybeThenable(promise, value, lib$es6$promise$$internal$$getThen(value));
      } else {
        lib$es6$promise$$internal$$fulfill(promise, value);
      }
    }

    function lib$es6$promise$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      lib$es6$promise$$internal$$publish(promise);
    }

    function lib$es6$promise$$internal$$fulfill(promise, value) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = lib$es6$promise$$internal$$FULFILLED;

      if (promise._subscribers.length !== 0) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, promise);
      }
    }

    function lib$es6$promise$$internal$$reject(promise, reason) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }
      promise._state = lib$es6$promise$$internal$$REJECTED;
      promise._result = reason;

      lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publishRejection, promise);
    }

    function lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + lib$es6$promise$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + lib$es6$promise$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, parent);
      }
    }

    function lib$es6$promise$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          lib$es6$promise$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function lib$es6$promise$$internal$$ErrorObject() {
      this.error = null;
    }

    var lib$es6$promise$$internal$$TRY_CATCH_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        lib$es6$promise$$internal$$TRY_CATCH_ERROR.error = e;
        return lib$es6$promise$$internal$$TRY_CATCH_ERROR;
      }
    }

    function lib$es6$promise$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = lib$es6$promise$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = lib$es6$promise$$internal$$tryCatch(callback, detail);

        if (value === lib$es6$promise$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== lib$es6$promise$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        lib$es6$promise$$internal$$resolve(promise, value);
      } else if (failed) {
        lib$es6$promise$$internal$$reject(promise, error);
      } else if (settled === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, value);
      } else if (settled === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, value);
      }
    }

    function lib$es6$promise$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      } catch(e) {
        lib$es6$promise$$internal$$reject(promise, e);
      }
    }

    var lib$es6$promise$$internal$$id = 0;
    function lib$es6$promise$$internal$$nextId() {
      return lib$es6$promise$$internal$$id++;
    }

    function lib$es6$promise$$internal$$makePromise(promise) {
      promise[lib$es6$promise$$internal$$PROMISE_ID] = lib$es6$promise$$internal$$id++;
      promise._state = undefined;
      promise._result = undefined;
      promise._subscribers = [];
    }

    function lib$es6$promise$promise$all$$all(entries) {
      return new lib$es6$promise$enumerator$$default(this, entries).promise;
    }
    var lib$es6$promise$promise$all$$default = lib$es6$promise$promise$all$$all;
    function lib$es6$promise$promise$race$$race(entries) {
      /*jshint validthis:true */
      var Constructor = this;

      if (!lib$es6$promise$utils$$isArray(entries)) {
        return new Constructor(function(resolve, reject) {
          reject(new TypeError('You must pass an array to race.'));
        });
      } else {
        return new Constructor(function(resolve, reject) {
          var length = entries.length;
          for (var i = 0; i < length; i++) {
            Constructor.resolve(entries[i]).then(resolve, reject);
          }
        });
      }
    }
    var lib$es6$promise$promise$race$$default = lib$es6$promise$promise$race$$race;
    function lib$es6$promise$promise$reject$$reject(reason) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$reject(promise, reason);
      return promise;
    }
    var lib$es6$promise$promise$reject$$default = lib$es6$promise$promise$reject$$reject;


    function lib$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function lib$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var lib$es6$promise$promise$$default = lib$es6$promise$promise$$Promise;
    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise's eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function lib$es6$promise$promise$$Promise(resolver) {
      this[lib$es6$promise$$internal$$PROMISE_ID] = lib$es6$promise$$internal$$nextId();
      this._result = this._state = undefined;
      this._subscribers = [];

      if (lib$es6$promise$$internal$$noop !== resolver) {
        typeof resolver !== 'function' && lib$es6$promise$promise$$needsResolver();
        this instanceof lib$es6$promise$promise$$Promise ? lib$es6$promise$$internal$$initializePromise(this, resolver) : lib$es6$promise$promise$$needsNew();
      }
    }

    lib$es6$promise$promise$$Promise.all = lib$es6$promise$promise$all$$default;
    lib$es6$promise$promise$$Promise.race = lib$es6$promise$promise$race$$default;
    lib$es6$promise$promise$$Promise.resolve = lib$es6$promise$promise$resolve$$default;
    lib$es6$promise$promise$$Promise.reject = lib$es6$promise$promise$reject$$default;
    lib$es6$promise$promise$$Promise._setScheduler = lib$es6$promise$asap$$setScheduler;
    lib$es6$promise$promise$$Promise._setAsap = lib$es6$promise$asap$$setAsap;
    lib$es6$promise$promise$$Promise._asap = lib$es6$promise$asap$$asap;

    lib$es6$promise$promise$$Promise.prototype = {
      constructor: lib$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: lib$es6$promise$then$$default,

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };
    var lib$es6$promise$enumerator$$default = lib$es6$promise$enumerator$$Enumerator;
    function lib$es6$promise$enumerator$$Enumerator(Constructor, input) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (!this.promise[lib$es6$promise$$internal$$PROMISE_ID]) {
        lib$es6$promise$$internal$$makePromise(this.promise);
      }

      if (lib$es6$promise$utils$$isArray(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._result = new Array(this.length);

        if (this.length === 0) {
          lib$es6$promise$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            lib$es6$promise$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        lib$es6$promise$$internal$$reject(this.promise, lib$es6$promise$enumerator$$validationError());
      }
    }

    function lib$es6$promise$enumerator$$validationError() {
      return new Error('Array Methods must be provided an Array');
    }

    lib$es6$promise$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var input   = this._input;

      for (var i = 0; this._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      var resolve = c.resolve;

      if (resolve === lib$es6$promise$promise$resolve$$default) {
        var then = lib$es6$promise$$internal$$getThen(entry);

        if (then === lib$es6$promise$then$$default &&
            entry._state !== lib$es6$promise$$internal$$PENDING) {
          this._settledAt(entry._state, i, entry._result);
        } else if (typeof then !== 'function') {
          this._remaining--;
          this._result[i] = entry;
        } else if (c === lib$es6$promise$promise$$default) {
          var promise = new c(lib$es6$promise$$internal$$noop);
          lib$es6$promise$$internal$$handleMaybeThenable(promise, entry, then);
          this._willSettleAt(promise, i);
        } else {
          this._willSettleAt(new c(function(resolve) { resolve(entry); }), i);
        }
      } else {
        this._willSettleAt(resolve(entry), i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === lib$es6$promise$$internal$$PENDING) {
        this._remaining--;

        if (state === lib$es6$promise$$internal$$REJECTED) {
          lib$es6$promise$$internal$$reject(promise, value);
        } else {
          this._result[i] = value;
        }
      }

      if (this._remaining === 0) {
        lib$es6$promise$$internal$$fulfill(promise, this._result);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      lib$es6$promise$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt(lib$es6$promise$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt(lib$es6$promise$$internal$$REJECTED, i, reason);
      });
    };
    function lib$es6$promise$polyfill$$polyfill() {
      var local;

      if (typeof global !== 'undefined') {
          local = global;
      } else if (typeof self !== 'undefined') {
          local = self;
      } else {
          try {
              local = Function('return this')();
          } catch (e) {
              throw new Error('polyfill failed because global object is unavailable in this environment');
          }
      }

      var P = local.Promise;

      if (P && Object.prototype.toString.call(P.resolve()) === '[object Promise]' && !P.cast) {
        return;
      }

      local.Promise = lib$es6$promise$promise$$default;
    }
    var lib$es6$promise$polyfill$$default = lib$es6$promise$polyfill$$polyfill;

    var lib$es6$promise$umd$$ES6Promise = {
      'Promise': lib$es6$promise$promise$$default,
      'polyfill': lib$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return lib$es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = lib$es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = lib$es6$promise$umd$$ES6Promise;
    }

    lib$es6$promise$polyfill$$default();
}).call(this);


}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":33}],33:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],34:[function(require,module,exports){

/**
 * Reduce `arr` with `fn`.
 *
 * @param {Array} arr
 * @param {Function} fn
 * @param {Mixed} initial
 *
 * TODO: combatible error handling?
 */

module.exports = function(arr, fn, initial){  
  var idx = 0;
  var len = arr.length;
  var curr = arguments.length == 3
    ? initial
    : arr[idx++];

  while (idx < len) {
    curr = fn.call(null, curr, arr[idx], ++idx, arr);
  }
  
  return curr;
};
},{}],35:[function(require,module,exports){
/**
 * Module dependencies.
 */

var Emitter = require('emitter');
var reduce = require('reduce');
var requestBase = require('./request-base');
var isObject = require('./is-object');

/**
 * Root reference for iframes.
 */

var root;
if (typeof window !== 'undefined') { // Browser window
  root = window;
} else if (typeof self !== 'undefined') { // Web Worker
  root = self;
} else { // Other environments
  root = this;
}

/**
 * Noop.
 */

function noop(){};

/**
 * Check if `obj` is a host object,
 * we don't want to serialize these :)
 *
 * TODO: future proof, move to compoent land
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isHost(obj) {
  var str = {}.toString.call(obj);

  switch (str) {
    case '[object File]':
    case '[object Blob]':
    case '[object FormData]':
      return true;
    default:
      return false;
  }
}

/**
 * Expose `request`.
 */

var request = module.exports = require('./request').bind(null, Request);

/**
 * Determine XHR.
 */

request.getXHR = function () {
  if (root.XMLHttpRequest
      && (!root.location || 'file:' != root.location.protocol
          || !root.ActiveXObject)) {
    return new XMLHttpRequest;
  } else {
    try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
  }
  return false;
};

/**
 * Removes leading and trailing whitespace, added to support IE.
 *
 * @param {String} s
 * @return {String}
 * @api private
 */

var trim = ''.trim
  ? function(s) { return s.trim(); }
  : function(s) { return s.replace(/(^\s*|\s*$)/g, ''); };

/**
 * Serialize the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

function serialize(obj) {
  if (!isObject(obj)) return obj;
  var pairs = [];
  for (var key in obj) {
    if (null != obj[key]) {
      pushEncodedKeyValuePair(pairs, key, obj[key]);
        }
      }
  return pairs.join('&');
}

/**
 * Helps 'serialize' with serializing arrays.
 * Mutates the pairs array.
 *
 * @param {Array} pairs
 * @param {String} key
 * @param {Mixed} val
 */

function pushEncodedKeyValuePair(pairs, key, val) {
  if (Array.isArray(val)) {
    return val.forEach(function(v) {
      pushEncodedKeyValuePair(pairs, key, v);
    });
  }
  pairs.push(encodeURIComponent(key)
    + '=' + encodeURIComponent(val));
}

/**
 * Expose serialization method.
 */

 request.serializeObject = serialize;

 /**
  * Parse the given x-www-form-urlencoded `str`.
  *
  * @param {String} str
  * @return {Object}
  * @api private
  */

function parseString(str) {
  var obj = {};
  var pairs = str.split('&');
  var parts;
  var pair;

  for (var i = 0, len = pairs.length; i < len; ++i) {
    pair = pairs[i];
    parts = pair.split('=');
    obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  }

  return obj;
}

/**
 * Expose parser.
 */

request.parseString = parseString;

/**
 * Default MIME type map.
 *
 *     superagent.types.xml = 'application/xml';
 *
 */

request.types = {
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  'form': 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
};

/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

 request.serialize = {
   'application/x-www-form-urlencoded': serialize,
   'application/json': JSON.stringify
 };

 /**
  * Default parsers.
  *
  *     superagent.parse['application/xml'] = function(str){
  *       return { object parsed from str };
  *     };
  *
  */

request.parse = {
  'application/x-www-form-urlencoded': parseString,
  'application/json': JSON.parse
};

/**
 * Parse the given header `str` into
 * an object containing the mapped fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseHeader(str) {
  var lines = str.split(/\r?\n/);
  var fields = {};
  var index;
  var line;
  var field;
  var val;

  lines.pop(); // trailing CRLF

  for (var i = 0, len = lines.length; i < len; ++i) {
    line = lines[i];
    index = line.indexOf(':');
    field = line.slice(0, index).toLowerCase();
    val = trim(line.slice(index + 1));
    fields[field] = val;
  }

  return fields;
}

/**
 * Check if `mime` is json or has +json structured syntax suffix.
 *
 * @param {String} mime
 * @return {Boolean}
 * @api private
 */

function isJSON(mime) {
  return /[\/+]json\b/.test(mime);
}

/**
 * Return the mime type for the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function type(str){
  return str.split(/ *; */).shift();
};

/**
 * Return header field parameters.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function params(str){
  return reduce(str.split(/ *; */), function(obj, str){
    var parts = str.split(/ *= */)
      , key = parts.shift()
      , val = parts.shift();

    if (key && val) obj[key] = val;
    return obj;
  }, {});
};

/**
 * Initialize a new `Response` with the given `xhr`.
 *
 *  - set flags (.ok, .error, etc)
 *  - parse header
 *
 * Examples:
 *
 *  Aliasing `superagent` as `request` is nice:
 *
 *      request = superagent;
 *
 *  We can use the promise-like API, or pass callbacks:
 *
 *      request.get('/').end(function(res){});
 *      request.get('/', function(res){});
 *
 *  Sending data can be chained:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' })
 *        .end(function(res){});
 *
 *  Or passed to `.send()`:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' }, function(res){});
 *
 *  Or passed to `.post()`:
 *
 *      request
 *        .post('/user', { name: 'tj' })
 *        .end(function(res){});
 *
 * Or further reduced to a single call for simple cases:
 *
 *      request
 *        .post('/user', { name: 'tj' }, function(res){});
 *
 * @param {XMLHTTPRequest} xhr
 * @param {Object} options
 * @api private
 */

function Response(req, options) {
  options = options || {};
  this.req = req;
  this.xhr = this.req.xhr;
  // responseText is accessible only if responseType is '' or 'text' and on older browsers
  this.text = ((this.req.method !='HEAD' && (this.xhr.responseType === '' || this.xhr.responseType === 'text')) || typeof this.xhr.responseType === 'undefined')
     ? this.xhr.responseText
     : null;
  this.statusText = this.req.xhr.statusText;
  this.setStatusProperties(this.xhr.status);
  this.header = this.headers = parseHeader(this.xhr.getAllResponseHeaders());
  // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
  // getResponseHeader still works. so we get content-type even if getting
  // other headers fails.
  this.header['content-type'] = this.xhr.getResponseHeader('content-type');
  this.setHeaderProperties(this.header);
  this.body = this.req.method != 'HEAD'
    ? this.parseBody(this.text ? this.text : this.xhr.response)
    : null;
}

/**
 * Get case-insensitive `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

Response.prototype.get = function(field){
  return this.header[field.toLowerCase()];
};

/**
 * Set header related properties:
 *
 *   - `.type` the content type without params
 *
 * A response of "Content-Type: text/plain; charset=utf-8"
 * will provide you with a `.type` of "text/plain".
 *
 * @param {Object} header
 * @api private
 */

Response.prototype.setHeaderProperties = function(header){
  // content-type
  var ct = this.header['content-type'] || '';
  this.type = type(ct);

  // params
  var obj = params(ct);
  for (var key in obj) this[key] = obj[key];
};

/**
 * Parse the given body `str`.
 *
 * Used for auto-parsing of bodies. Parsers
 * are defined on the `superagent.parse` object.
 *
 * @param {String} str
 * @return {Mixed}
 * @api private
 */

Response.prototype.parseBody = function(str){
  var parse = request.parse[this.type];
  if (!parse && isJSON(this.type)) {
    parse = request.parse['application/json'];
  }
  return parse && str && (str.length || str instanceof Object)
    ? parse(str)
    : null;
};

/**
 * Set flags such as `.ok` based on `status`.
 *
 * For example a 2xx response will give you a `.ok` of __true__
 * whereas 5xx will be __false__ and `.error` will be __true__. The
 * `.clientError` and `.serverError` are also available to be more
 * specific, and `.statusType` is the class of error ranging from 1..5
 * sometimes useful for mapping respond colors etc.
 *
 * "sugar" properties are also defined for common cases. Currently providing:
 *
 *   - .noContent
 *   - .badRequest
 *   - .unauthorized
 *   - .notAcceptable
 *   - .notFound
 *
 * @param {Number} status
 * @api private
 */

Response.prototype.setStatusProperties = function(status){
  // handle IE9 bug: http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request
  if (status === 1223) {
    status = 204;
  }

  var type = status / 100 | 0;

  // status / class
  this.status = this.statusCode = status;
  this.statusType = type;

  // basics
  this.info = 1 == type;
  this.ok = 2 == type;
  this.clientError = 4 == type;
  this.serverError = 5 == type;
  this.error = (4 == type || 5 == type)
    ? this.toError()
    : false;

  // sugar
  this.accepted = 202 == status;
  this.noContent = 204 == status;
  this.badRequest = 400 == status;
  this.unauthorized = 401 == status;
  this.notAcceptable = 406 == status;
  this.notFound = 404 == status;
  this.forbidden = 403 == status;
};

/**
 * Return an `Error` representative of this response.
 *
 * @return {Error}
 * @api public
 */

Response.prototype.toError = function(){
  var req = this.req;
  var method = req.method;
  var url = req.url;

  var msg = 'cannot ' + method + ' ' + url + ' (' + this.status + ')';
  var err = new Error(msg);
  err.status = this.status;
  err.method = method;
  err.url = url;

  return err;
};

/**
 * Expose `Response`.
 */

request.Response = Response;

/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String} url
 * @api public
 */

function Request(method, url) {
  var self = this;
  this._query = this._query || [];
  this.method = method;
  this.url = url;
  this.header = {}; // preserves header name case
  this._header = {}; // coerces header names to lowercase
  this.on('end', function(){
    var err = null;
    var res = null;

    try {
      res = new Response(self);
    } catch(e) {
      err = new Error('Parser is unable to parse the response');
      err.parse = true;
      err.original = e;
      // issue #675: return the raw response if the response parsing fails
      err.rawResponse = self.xhr && self.xhr.responseText ? self.xhr.responseText : null;
      // issue #876: return the http status code if the response parsing fails
      err.statusCode = self.xhr && self.xhr.status ? self.xhr.status : null;
      return self.callback(err);
    }

    self.emit('response', res);

    if (err) {
      return self.callback(err, res);
    }

    if (res.status >= 200 && res.status < 300) {
      return self.callback(err, res);
    }

    var new_err = new Error(res.statusText || 'Unsuccessful HTTP response');
    new_err.original = err;
    new_err.response = res;
    new_err.status = res.status;

    self.callback(new_err, res);
  });
}

/**
 * Mixin `Emitter` and `requestBase`.
 */

Emitter(Request.prototype);
for (var key in requestBase) {
  Request.prototype[key] = requestBase[key];
}

/**
 * Abort the request, and clear potential timeout.
 *
 * @return {Request}
 * @api public
 */

Request.prototype.abort = function(){
  if (this.aborted) return;
  this.aborted = true;
  this.xhr.abort();
  this.clearTimeout();
  this.emit('abort');
  return this;
};

/**
 * Set Content-Type to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.xml = 'application/xml';
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function(type){
  this.set('Content-Type', request.types[type] || type);
  return this;
};

/**
 * Set responseType to `val`. Presently valid responseTypes are 'blob' and 
 * 'arraybuffer'.
 *
 * Examples:
 *
 *      req.get('/')
 *        .responseType('blob')
 *        .end(callback);
 *
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.responseType = function(val){
  this._responseType = val;
  return this;
};

/**
 * Set Accept to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.json = 'application/json';
 *
 *      request.get('/agent')
 *        .accept('json')
 *        .end(callback);
 *
 *      request.get('/agent')
 *        .accept('application/json')
 *        .end(callback);
 *
 * @param {String} accept
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.accept = function(type){
  this.set('Accept', request.types[type] || type);
  return this;
};

/**
 * Set Authorization field value with `user` and `pass`.
 *
 * @param {String} user
 * @param {String} pass
 * @param {Object} options with 'type' property 'auto' or 'basic' (default 'basic')
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.auth = function(user, pass, options){
  if (!options) {
    options = {
      type: 'basic'
    }
  }

  switch (options.type) {
    case 'basic':
      var str = btoa(user + ':' + pass);
      this.set('Authorization', 'Basic ' + str);
    break;

    case 'auto':
      this.username = user;
      this.password = pass;
    break;
  }
  return this;
};

/**
* Add query-string `val`.
*
* Examples:
*
*   request.get('/shoes')
*     .query('size=10')
*     .query({ color: 'blue' })
*
* @param {Object|String} val
* @return {Request} for chaining
* @api public
*/

Request.prototype.query = function(val){
  if ('string' != typeof val) val = serialize(val);
  if (val) this._query.push(val);
  return this;
};

/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `filename`.
 *
 * ``` js
 * request.post('/upload')
 *   .attach(new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {Blob|File} file
 * @param {String} filename
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.attach = function(field, file, filename){
  this._getFormData().append(field, file, filename || file.name);
  return this;
};

Request.prototype._getFormData = function(){
  if (!this._formData) {
    this._formData = new root.FormData();
  }
  return this._formData;
};

/**
 * Send `data` as the request body, defaulting the `.type()` to "json" when
 * an object is given.
 *
 * Examples:
 *
 *       // manual json
 *       request.post('/user')
 *         .type('json')
 *         .send('{"name":"tj"}')
 *         .end(callback)
 *
 *       // auto json
 *       request.post('/user')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // manual x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send('name=tj')
 *         .end(callback)
 *
 *       // auto x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // defaults to x-www-form-urlencoded
  *      request.post('/user')
  *        .send('name=tobi')
  *        .send('species=ferret')
  *        .end(callback)
 *
 * @param {String|Object} data
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.send = function(data){
  var obj = isObject(data);
  var type = this._header['content-type'];

  // merge
  if (obj && isObject(this._data)) {
    for (var key in data) {
      this._data[key] = data[key];
    }
  } else if ('string' == typeof data) {
    if (!type) this.type('form');
    type = this._header['content-type'];
    if ('application/x-www-form-urlencoded' == type) {
      this._data = this._data
        ? this._data + '&' + data
        : data;
    } else {
      this._data = (this._data || '') + data;
    }
  } else {
    this._data = data;
  }

  if (!obj || isHost(data)) return this;
  if (!type) this.type('json');
  return this;
};

/**
 * @deprecated
 */
Response.prototype.parse = function serialize(fn){
  if (root.console) {
    console.warn("Client-side parse() method has been renamed to serialize(). This method is not compatible with superagent v2.0");
  }
  this.serialize(fn);
  return this;
};

Response.prototype.serialize = function serialize(fn){
  this._parser = fn;
  return this;
};

/**
 * Invoke the callback with `err` and `res`
 * and handle arity check.
 *
 * @param {Error} err
 * @param {Response} res
 * @api private
 */

Request.prototype.callback = function(err, res){
  var fn = this._callback;
  this.clearTimeout();
  fn(err, res);
};

/**
 * Invoke callback with x-domain error.
 *
 * @api private
 */

Request.prototype.crossDomainError = function(){
  var err = new Error('Request has been terminated\nPossible causes: the network is offline, Origin is not allowed by Access-Control-Allow-Origin, the page is being unloaded, etc.');
  err.crossDomain = true;

  err.status = this.status;
  err.method = this.method;
  err.url = this.url;

  this.callback(err);
};

/**
 * Invoke callback with timeout error.
 *
 * @api private
 */

Request.prototype.timeoutError = function(){
  var timeout = this._timeout;
  var err = new Error('timeout of ' + timeout + 'ms exceeded');
  err.timeout = timeout;
  this.callback(err);
};

/**
 * Enable transmission of cookies with x-domain requests.
 *
 * Note that for this to work the origin must not be
 * using "Access-Control-Allow-Origin" with a wildcard,
 * and also must set "Access-Control-Allow-Credentials"
 * to "true".
 *
 * @api public
 */

Request.prototype.withCredentials = function(){
  this._withCredentials = true;
  return this;
};

/**
 * Initiate request, invoking callback `fn(res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.end = function(fn){
  var self = this;
  var xhr = this.xhr = request.getXHR();
  var query = this._query.join('&');
  var timeout = this._timeout;
  var data = this._formData || this._data;

  // store callback
  this._callback = fn || noop;

  // state change
  xhr.onreadystatechange = function(){
    if (4 != xhr.readyState) return;

    // In IE9, reads to any property (e.g. status) off of an aborted XHR will
    // result in the error "Could not complete the operation due to error c00c023f"
    var status;
    try { status = xhr.status } catch(e) { status = 0; }

    if (0 == status) {
      if (self.timedout) return self.timeoutError();
      if (self.aborted) return;
      return self.crossDomainError();
    }
    self.emit('end');
  };

  // progress
  var handleProgress = function(e){
    if (e.total > 0) {
      e.percent = e.loaded / e.total * 100;
    }
    e.direction = 'download';
    self.emit('progress', e);
  };
  if (this.hasListeners('progress')) {
    xhr.onprogress = handleProgress;
  }
  try {
    if (xhr.upload && this.hasListeners('progress')) {
      xhr.upload.onprogress = handleProgress;
    }
  } catch(e) {
    // Accessing xhr.upload fails in IE from a web worker, so just pretend it doesn't exist.
    // Reported here:
    // https://connect.microsoft.com/IE/feedback/details/837245/xmlhttprequest-upload-throws-invalid-argument-when-used-from-web-worker-context
  }

  // timeout
  if (timeout && !this._timer) {
    this._timer = setTimeout(function(){
      self.timedout = true;
      self.abort();
    }, timeout);
  }

  // querystring
  if (query) {
    query = request.serializeObject(query);
    this.url += ~this.url.indexOf('?')
      ? '&' + query
      : '?' + query;
  }

  // initiate request
  if (this.username && this.password) {
    xhr.open(this.method, this.url, true, this.username, this.password);
  } else {
    xhr.open(this.method, this.url, true);
  }

  // CORS
  if (this._withCredentials) xhr.withCredentials = true;

  // body
  if ('GET' != this.method && 'HEAD' != this.method && 'string' != typeof data && !isHost(data)) {
    // serialize stuff
    var contentType = this._header['content-type'];
    var serialize = this._parser || request.serialize[contentType ? contentType.split(';')[0] : ''];
    if (!serialize && isJSON(contentType)) serialize = request.serialize['application/json'];
    if (serialize) data = serialize(data);
  }

  // set header fields
  for (var field in this.header) {
    if (null == this.header[field]) continue;
    xhr.setRequestHeader(field, this.header[field]);
  }

  if (this._responseType) {
    xhr.responseType = this._responseType;
  }

  // send stuff
  this.emit('request', this);

  // IE11 xhr.send(undefined) sends 'undefined' string as POST payload (instead of nothing)
  // We need null here if data is undefined
  xhr.send(typeof data !== 'undefined' ? data : null);
  return this;
};


/**
 * Expose `Request`.
 */

request.Request = Request;

/**
 * GET `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.get = function(url, data, fn){
  var req = request('GET', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.query(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * HEAD `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.head = function(url, data, fn){
  var req = request('HEAD', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * DELETE `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

function del(url, fn){
  var req = request('DELETE', url);
  if (fn) req.end(fn);
  return req;
};

request['del'] = del;
request['delete'] = del;

/**
 * PATCH `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} data
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.patch = function(url, data, fn){
  var req = request('PATCH', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * POST `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} data
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.post = function(url, data, fn){
  var req = request('POST', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * PUT `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} data or fn
 * @param {Function} fn
 * @return {Request}
 * @api public
 */

request.put = function(url, data, fn){
  var req = request('PUT', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

},{"./is-object":36,"./request":38,"./request-base":37,"emitter":31,"reduce":34}],36:[function(require,module,exports){
/**
 * Check if `obj` is an object.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isObject(obj) {
  return null != obj && 'object' == typeof obj;
}

module.exports = isObject;

},{}],37:[function(require,module,exports){
/**
 * Module of mixed-in functions shared between node and client code
 */
var isObject = require('./is-object');

/**
 * Clear previous timeout.
 *
 * @return {Request} for chaining
 * @api public
 */

exports.clearTimeout = function _clearTimeout(){
  this._timeout = 0;
  clearTimeout(this._timer);
  return this;
};

/**
 * Force given parser
 *
 * Sets the body parser no matter type.
 *
 * @param {Function}
 * @api public
 */

exports.parse = function parse(fn){
  this._parser = fn;
  return this;
};

/**
 * Set timeout to `ms`.
 *
 * @param {Number} ms
 * @return {Request} for chaining
 * @api public
 */

exports.timeout = function timeout(ms){
  this._timeout = ms;
  return this;
};

/**
 * Faux promise support
 *
 * @param {Function} fulfill
 * @param {Function} reject
 * @return {Request}
 */

exports.then = function then(fulfill, reject) {
  return this.end(function(err, res) {
    err ? reject(err) : fulfill(res);
  });
}

/**
 * Allow for extension
 */

exports.use = function use(fn) {
  fn(this);
  return this;
}


/**
 * Get request header `field`.
 * Case-insensitive.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

exports.get = function(field){
  return this._header[field.toLowerCase()];
};

/**
 * Get case-insensitive header `field` value.
 * This is a deprecated internal API. Use `.get(field)` instead.
 *
 * (getHeader is no longer used internally by the superagent code base)
 *
 * @param {String} field
 * @return {String}
 * @api private
 * @deprecated
 */

exports.getHeader = exports.get;

/**
 * Set header `field` to `val`, or multiple fields with one object.
 * Case-insensitive.
 *
 * Examples:
 *
 *      req.get('/')
 *        .set('Accept', 'application/json')
 *        .set('X-API-Key', 'foobar')
 *        .end(callback);
 *
 *      req.get('/')
 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
 *        .end(callback);
 *
 * @param {String|Object} field
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

exports.set = function(field, val){
  if (isObject(field)) {
    for (var key in field) {
      this.set(key, field[key]);
    }
    return this;
  }
  this._header[field.toLowerCase()] = val;
  this.header[field] = val;
  return this;
};

/**
 * Remove header `field`.
 * Case-insensitive.
 *
 * Example:
 *
 *      req.get('/')
 *        .unset('User-Agent')
 *        .end(callback);
 *
 * @param {String} field
 */
exports.unset = function(field){
  delete this._header[field.toLowerCase()];
  delete this.header[field];
  return this;
};

/**
 * Write the field `name` and `val` for "multipart/form-data"
 * request bodies.
 *
 * ``` js
 * request.post('/upload')
 *   .field('foo', 'bar')
 *   .end(callback);
 * ```
 *
 * @param {String} name
 * @param {String|Blob|File|Buffer|fs.ReadStream} val
 * @return {Request} for chaining
 * @api public
 */
exports.field = function(name, val) {
  this._getFormData().append(name, val);
  return this;
};

},{"./is-object":36}],38:[function(require,module,exports){
// The node and browser modules expose versions of this with the
// appropriate constructor function bound as first argument
/**
 * Issue a request:
 *
 * Examples:
 *
 *    request('GET', '/users').end(callback)
 *    request('/users').end(callback)
 *    request('/users', callback)
 *
 * @param {String} method
 * @param {String|Function} url or callback
 * @return {Request}
 * @api public
 */

function request(RequestConstructor, method, url) {
  // callback
  if ('function' == typeof url) {
    return new RequestConstructor('GET', method).end(url);
  }

  // url first
  if (2 == arguments.length) {
    return new RequestConstructor('GET', method);
  }

  return new RequestConstructor(method, url);
}

module.exports = request;

},{}],39:[function(require,module,exports){
// Add Angular integrations if Angular is available
if ((typeof angular === 'object') && angular.module) {

  var IonicAngularAnalytics = null;

  angular.module('ionic.service.analytics', ['ionic'])

  .value('IONIC_ANALYTICS_VERSION', Ionic.Analytics.version)

  .factory('$ionicAnalytics', [function() {
    if (!IonicAngularAnalytics) {
      IonicAngularAnalytics = new Ionic.Analytics("DEFER_REGISTER");
    }
    return IonicAngularAnalytics;
  }])

  .factory('domSerializer', [function() {
    return new Ionic.AnalyticSerializers.DOMSerializer();
  }])

  .run(['$ionicAnalytics', '$state', function($ionicAnalytics, $state) {
    $ionicAnalytics.setGlobalProperties(function(eventCollection, eventData) {
      if (!eventData._ui) {
        eventData._ui = {};
      }
      eventData._ui.active_state = $state.current.name; // eslint-disable-line
    });
  }]);


  angular.module('ionic.service.analytics')

  .provider('$ionicAutoTrack',[function() {

    var trackersDisabled = {},
      allTrackersDisabled = false;

    this.disableTracking = function(tracker) {
      if (tracker) {
        trackersDisabled[tracker] = true;
      } else {
        allTrackersDisabled = true;
      }
    };

    this.$get = [function() {
      return {
        "isEnabled": function(tracker) {
          return !allTrackersDisabled && !trackersDisabled[tracker];
        }
      };
    }];
  }])


  // ================================================================================
  // Auto trackers
  // ================================================================================


  .run(['$ionicAutoTrack', '$ionicAnalytics', function($ionicAutoTrack, $ionicAnalytics) {
    if (!$ionicAutoTrack.isEnabled('Load')) {
      return;
    }
    $ionicAnalytics.track('Load');
  }])

  .run([
    '$ionicAutoTrack',
    '$document',
    '$ionicAnalytics',
    'domSerializer',
    function($ionicAutoTrack, $document, $ionicAnalytics, domSerializer) {
      if (!$ionicAutoTrack.isEnabled('Tap')) {
        return;
      }

      $document.on('click', function(event) {
        // want coordinates as a percentage relative to the target element
        var box = event.target.getBoundingClientRect(),
          width = box.right - box.left,
          height = box.bottom - box.top,
          normX = (event.pageX - box.left) / width,
          normY = (event.pageY - box.top) / height;

        var eventData = {
          "coordinates": {
            "x": event.pageX,
            "y": event.pageY
          },
          "target": domSerializer.elementSelector(event.target),
          "target_identifier": domSerializer.elementName(event.target)
        };

        if (isFinite(normX) && isFinite(normY)) {
          eventData.coordinates.x_norm = normX; // eslint-disable-line
          eventData.coordinates.y_norm = normY; // eslint-disable-line
        }

        $ionicAnalytics.track('Tap', {
          "_ui": eventData
        });

      });
    }
  ])

  .run([
    '$ionicAutoTrack',
    '$ionicAnalytics',
    '$rootScope',
    function($ionicAutoTrack, $ionicAnalytics, $rootScope) {
      if (!$ionicAutoTrack.isEnabled('State Change')) {
        return;
      }

      $rootScope.$on('$stateChangeSuccess', function(event, toState, toParams, fromState, fromParams) { // eslint-disable-line
        $ionicAnalytics.track('State Change', {
          "from": fromState.name,
          "to": toState.name
        });
      });
    }
  ])

  // ================================================================================
  // ion-track-$EVENT
  // ================================================================================

  /**
   * @ngdoc directive
   * @name ionTrackClick
   * @module ionic.service.analytics
   * @restrict A
   * @parent ionic.directive:ionTrackClick
   *
   * @description
   *
   * A convenient directive to automatically track a click/tap on a button
   * or other tappable element.
   *
   * @usage
   * ```html
   * <button class="button button-clear" ion-track-click ion-track-event="cta-tap">Try now!</button>
   * ```
   */

  .directive('ionTrackClick', ionTrackDirective('click'))
  .directive('ionTrackTap', ionTrackDirective('tap'))
  .directive('ionTrackDoubletap', ionTrackDirective('doubletap'))
  .directive('ionTrackHold', ionTrackDirective('hold'))
  .directive('ionTrackRelease', ionTrackDirective('release'))
  .directive('ionTrackDrag', ionTrackDirective('drag'))
  .directive('ionTrackDragLeft', ionTrackDirective('dragleft'))
  .directive('ionTrackDragRight', ionTrackDirective('dragright'))
  .directive('ionTrackDragUp', ionTrackDirective('dragup'))
  .directive('ionTrackDragDown', ionTrackDirective('dragdown'))
  .directive('ionTrackSwipeLeft', ionTrackDirective('swipeleft'))
  .directive('ionTrackSwipeRight', ionTrackDirective('swiperight'))
  .directive('ionTrackSwipeUp', ionTrackDirective('swipeup'))
  .directive('ionTrackSwipeDown', ionTrackDirective('swipedown'))
  .directive('ionTrackTransform', ionTrackDirective('hold'))
  .directive('ionTrackPinch', ionTrackDirective('pinch'))
  .directive('ionTrackPinchIn', ionTrackDirective('pinchin'))
  .directive('ionTrackPinchOut', ionTrackDirective('pinchout'))
  .directive('ionTrackRotate', ionTrackDirective('rotate'));

  /**
   * Generic directive to create auto event handling analytics directives like:
   *
   * <button ion-track-click="eventName">Click Track</button>
   * <button ion-track-hold="eventName">Hold Track</button>
   * <button ion-track-tap="eventName">Tap Track</button>
   * <button ion-track-doubletap="eventName">Double Tap Track</button>
   *
   * @param {string} domEventName The DOM event name
   * @return {array} Angular Directive declaration
   */
  function ionTrackDirective(domEventName) { // eslint-disable-line
    return ['$ionicAnalytics', '$ionicGesture', function($ionicAnalytics, $ionicGesture) {

      var gestureDriven = [
        'drag', 'dragstart', 'dragend', 'dragleft', 'dragright', 'dragup', 'dragdown',
        'swipe', 'swipeleft', 'swiperight', 'swipeup', 'swipedown',
        'tap', 'doubletap', 'hold',
        'transform', 'pinch', 'pinchin', 'pinchout', 'rotate'
      ];
      // Check if we need to use the gesture subsystem or the DOM system
      var isGestureDriven = false;
      for (var i = 0; i < gestureDriven.length; i++) {
        if (gestureDriven[i] === domEventName.toLowerCase()) {
          isGestureDriven = true;
        }
      }
      return {
        "restrict": 'A',
        "link": function($scope, $element, $attr) {
          var capitalized = domEventName[0].toUpperCase() + domEventName.slice(1);
          // Grab event name we will send
          var eventName = $attr['ionTrack' + capitalized];

          if (isGestureDriven) {
            var gesture = $ionicGesture.on(domEventName, handler, $element);
            $scope.$on('$destroy', function() {
              $ionicGesture.off(gesture, domEventName, handler);
            });
          } else {
            $element.on(domEventName, handler);
            $scope.$on('$destroy', function() {
              $element.off(domEventName, handler);
            });
          }


          function handler(e) {
            var eventData = $scope.$eval($attr.ionTrackData) || {};
            if (eventName) {
              $ionicAnalytics.track(eventName, eventData);
            } else {
              $ionicAnalytics.trackClick(e.pageX, e.pageY, e.target, {
                "data": eventData
              });
            }
          }
        }
      };
    }];
  }

}

},{}],40:[function(require,module,exports){
// Add Angular integrations if Angular is available
if ((typeof angular === 'object') && angular.module) {

  var IonicAngularAuth = null;

  angular.module('ionic.service.auth', [])

  .factory('$ionicAuth', [function() {
    if (!IonicAngularAuth) {
      IonicAngularAuth = Ionic.Auth;
    }
    return IonicAngularAuth;
  }]);
}

},{}],41:[function(require,module,exports){
// Add Angular integrations if Angular is available
if ((typeof angular === 'object') && angular.module) {
  angular.module('ionic.service.core', [])

  /**
   * @private
   * Provides a safe interface to store objects in persistent memory
   */
  .provider('persistentStorage', function() {
    return {
      '$get': [function() {
        var storage = Ionic.getService('Storage');
        if (!storage) {
          storage = new Ionic.IO.Storage();
          Ionic.addService('Storage', storage, true);
        }
        return storage;
      }]
    };
  })

  .factory('$ionicCoreSettings', [
    function() {
      return Ionic.IO.Config;
    }
  ])

  .factory('$ionicUser', [
    function() {
      return Ionic.User;
    }
  ])

  .run([function() {
    Ionic.io();
  }]);
}


},{}],42:[function(require,module,exports){
// Add Angular integrations if Angular is available
if ((typeof angular === 'object') && angular.module) {

  var IonicAngularDeploy = null;

  angular.module('ionic.service.deploy', [])

  .factory('$ionicDeploy', [function() {
    if (!IonicAngularDeploy) {
      IonicAngularDeploy = new Ionic.Deploy();
    }
    return IonicAngularDeploy;
  }]);
}

},{}],43:[function(require,module,exports){
var Analytics = require("./../dist/es5/analytics/analytics").Analytics;
var App = require("./../dist/es5/core/app").App;
var Auth = require("./../dist/es5/auth/auth").Auth;
var BucketStorage = require("./../dist/es5/analytics/storage").BucketStorage;
var Config = require("./../dist/es5/core/config").Config;
var DOMSerializer = require("./../dist/es5/analytics/serializers").DOMSerializer;
var DataType = require("./../dist/es5/core/data-types").DataType;
var Deploy = require("./../dist/es5/deploy/deploy").Deploy;
var EventEmitter = require("./../dist/es5/core/events").EventEmitter;
var IonicPlatform = require("./../dist/es5/core/core").IonicPlatform;
var Logger = require("./../dist/es5/core/logger").Logger;
var Push = require("./../dist/es5/push/push").Push;
var PushMessage = require("./../dist/es5/push/push-message").PushMessage;
var PushToken = require("./../dist/es5/push/push-token").PushToken;
var Storage = require("./../dist/es5/core/storage").Storage;
var User = require("./../dist/es5/core/user").User;
var promise = require("./../dist/es5/core/promise");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Modules
Ionic.Core = IonicPlatform;
Ionic.User = User;
Ionic.Analytics = Analytics;
Ionic.Auth = Auth;
Ionic.Deploy = Deploy;
Ionic.Push = Push;
Ionic.PushToken = PushToken;
Ionic.PushMessage = PushMessage;

// DataType Namespace
Ionic.DataType = DataType;
Ionic.DataTypes = DataType.getMapping();

// IO Namespace
Ionic.IO = {};
Ionic.IO.App = App;
Ionic.IO.EventEmitter = EventEmitter;
Ionic.IO.Logger = Logger;
Ionic.IO.Promise = promise.Promise;
Ionic.IO.DeferredPromise = promise.DeferredPromise;
Ionic.IO.Storage = Storage;
Ionic.IO.Config = Config;

// Analytic Storage Namespace
Ionic.AnalyticStorage = {};
Ionic.AnalyticStorage.BucketStorage = BucketStorage;

// Analytic Serializers Namespace
Ionic.AnalyticSerializers = {};
Ionic.AnalyticSerializers.DOMSerializer = DOMSerializer;


// Provider a single storage for services that have previously been registered
var serviceStorage = {};

Ionic.io = function() {
  return Ionic.Core;
};

Ionic.getService = function(name) {
  if (typeof serviceStorage[name] === 'undefined' || !serviceStorage[name]) {
    return false;
  }
  return serviceStorage[name];
};

Ionic.addService = function(name, service, force) {
  if (service && typeof serviceStorage[name] === 'undefined') {
    serviceStorage[name] = service;
  } else if (service && force) {
    serviceStorage[name] = service;
  }
};

Ionic.removeService = function(name) {
  if (typeof serviceStorage[name] !== 'undefined') {
    delete serviceStorage[name];
  }
};

},{"./../dist/es5/analytics/analytics":1,"./../dist/es5/analytics/serializers":3,"./../dist/es5/analytics/storage":4,"./../dist/es5/auth/auth":5,"./../dist/es5/core/app":7,"./../dist/es5/core/config":9,"./../dist/es5/core/core":10,"./../dist/es5/core/data-types":11,"./../dist/es5/core/events":12,"./../dist/es5/core/logger":14,"./../dist/es5/core/promise":15,"./../dist/es5/core/storage":17,"./../dist/es5/core/user":18,"./../dist/es5/deploy/deploy":19,"./../dist/es5/push/push":28,"./../dist/es5/push/push-message":26,"./../dist/es5/push/push-token":27}],44:[function(require,module,exports){
// Add Angular integrations if Angular is available
if ((typeof angular === 'object') && angular.module) {

  var IonicAngularPush = null;

  angular.module('ionic.service.push', [])

  /**
   * IonicPushAction Service
   *
   * A utility service to kick off misc features as part of the Ionic Push service
   */
  .factory('$ionicPushAction', ['$state', function($state) {

    function PushActionService() {}

    /**
     * State Navigation
     *
     * Attempts to navigate to a new view if a push notification payload contains:
     *
     *   - $state {String} The state name (e.g 'tab.chats')
     *   - $stateParams {Object} Provided state (url) params
     *
     * Find more info about state navigation and params:
     * https://github.com/angular-ui/ui-router/wiki
     *
     * @param {object} notification Notification Object
     * @return {void}
     */
    PushActionService.prototype.notificationNavigation = function(notification) {
      var state = notification.payload.$state || false;
      var stateParams = notification.payload.$stateParams || {};
      if (state) {
        $state.go(state, stateParams);
      }
    };

    return new PushActionService();
  }])

  .factory('$ionicPush', [function() {
    if (!IonicAngularPush) {
      IonicAngularPush = new Ionic.Push("DEFER_INIT");
    }
    return IonicAngularPush;
  }])

  .run(['$ionicPush', '$ionicPushAction', function($ionicPush, $ionicPushAction) {
    // This is what kicks off the state redirection when a push notificaiton has the relevant details
    $ionicPush._emitter.on('ionic_push:processNotification', function(notification) {
      notification = Ionic.PushMessage.fromPluginJSON(notification);
      if (notification && notification.app) {
        if (notification.app.asleep === true || notification.app.closed === true) {
          $ionicPushAction.notificationNavigation(notification);
        }
      }
    });

  }]);
}

},{}]},{},[43,41,39,40,44,42,21])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2VzNS9hbmFseXRpY3MvYW5hbHl0aWNzLmpzIiwiZGlzdC9lczUvYW5hbHl0aWNzL2luZGV4LmpzIiwiZGlzdC9lczUvYW5hbHl0aWNzL3NlcmlhbGl6ZXJzLmpzIiwiZGlzdC9lczUvYW5hbHl0aWNzL3N0b3JhZ2UuanMiLCJkaXN0L2VzNS9hdXRoL2F1dGguanMiLCJkaXN0L2VzNS9hdXRoL2luZGV4LmpzIiwiZGlzdC9lczUvY29yZS9hcHAuanMiLCJkaXN0L2VzNS9jb3JlL2NsaWVudC5qcyIsImRpc3QvZXM1L2NvcmUvY29uZmlnLmpzIiwiZGlzdC9lczUvY29yZS9jb3JlLmpzIiwiZGlzdC9lczUvY29yZS9kYXRhLXR5cGVzLmpzIiwiZGlzdC9lczUvY29yZS9ldmVudHMuanMiLCJkaXN0L2VzNS9jb3JlL2luZGV4LmpzIiwiZGlzdC9lczUvY29yZS9sb2dnZXIuanMiLCJkaXN0L2VzNS9jb3JlL3Byb21pc2UuanMiLCJkaXN0L2VzNS9jb3JlL3JlcXVlc3QuanMiLCJkaXN0L2VzNS9jb3JlL3N0b3JhZ2UuanMiLCJkaXN0L2VzNS9jb3JlL3VzZXIuanMiLCJkaXN0L2VzNS9kZXBsb3kvZGVwbG95LmpzIiwiZGlzdC9lczUvZGVwbG95L2luZGV4LmpzIiwiZGlzdC9lczUvaW5kZXguanMiLCJkaXN0L2VzNS9pbnNpZ2h0cy9pbmRleC5qcyIsImRpc3QvZXM1L2luc2lnaHRzL2luc2lnaHRzLmpzIiwiZGlzdC9lczUvcHVzaC9pbmRleC5qcyIsImRpc3QvZXM1L3B1c2gvcHVzaC1kZXYuanMiLCJkaXN0L2VzNS9wdXNoL3B1c2gtbWVzc2FnZS5qcyIsImRpc3QvZXM1L3B1c2gvcHVzaC10b2tlbi5qcyIsImRpc3QvZXM1L3B1c2gvcHVzaC5qcyIsImRpc3QvZXM1L3V0aWwvaW5kZXguanMiLCJkaXN0L2VzNS91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvY29tcG9uZW50LWVtaXR0ZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvcmVkdWNlLWNvbXBvbmVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L2xpYi9jbGllbnQuanMiLCJub2RlX21vZHVsZXMvc3VwZXJhZ2VudC9saWIvaXMtb2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzL3N1cGVyYWdlbnQvbGliL3JlcXVlc3QtYmFzZS5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L2xpYi9yZXF1ZXN0LmpzIiwic3JjL2FuYWx5dGljcy9hbmd1bGFyLmpzIiwic3JjL2F1dGgvYW5ndWxhci5qcyIsInNyYy9jb3JlL2FuZ3VsYXIuanMiLCJzcmMvZGVwbG95L2FuZ3VsYXIuanMiLCJzcmMvZXM1LmpzIiwic3JjL3B1c2gvYW5ndWxhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcllBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNuS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDLzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xudmFyIHJlcXVlc3RfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcmVxdWVzdCcpO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIGNvcmVfMSA9IHJlcXVpcmUoJy4uL2NvcmUvY29yZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi4vY29yZS9sb2dnZXInKTtcbnZhciBzdG9yYWdlXzEgPSByZXF1aXJlKCcuL3N0b3JhZ2UnKTtcbnZhciB1c2VyXzEgPSByZXF1aXJlKCcuLi9jb3JlL3VzZXInKTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKCcuLi91dGlsL3V0aWwnKTtcbnZhciBBTkFMWVRJQ1NfS0VZID0gbnVsbDtcbnZhciBERUZFUl9SRUdJU1RFUiA9ICdERUZFUl9SRUdJU1RFUic7XG52YXIgb3B0aW9ucyA9IHt9O1xudmFyIGdsb2JhbFByb3BlcnRpZXMgPSB7fTtcbnZhciBnbG9iYWxQcm9wZXJ0aWVzRm5zID0gW107XG52YXIgQW5hbHl0aWNzID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBBbmFseXRpY3MoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSBudWxsO1xuICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IDMwO1xuICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9zZXJ2aWNlSG9zdCA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ2FuYWx5dGljcycpO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBsb2dnZXJfMS5Mb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBBbmFseXRpY3M6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zdG9yYWdlID0gY29yZV8xLklvbmljUGxhdGZvcm0uZ2V0U3RvcmFnZSgpO1xuICAgICAgICB0aGlzLmNhY2hlID0gbmV3IHN0b3JhZ2VfMS5CdWNrZXRTdG9yYWdlKCdpb25pY19hbmFseXRpY3MnKTtcbiAgICAgICAgdGhpcy5fYWRkR2xvYmFsUHJvcGVydHlEZWZhdWx0cygpO1xuICAgICAgICBpZiAoY29uZmlnICE9PSBERUZFUl9SRUdJU1RFUikge1xuICAgICAgICAgICAgdGhpcy5yZWdpc3Rlcihjb25maWcpO1xuICAgICAgICB9XG4gICAgfVxuICAgIEFuYWx5dGljcy5wcm90b3R5cGUuX2FkZEdsb2JhbFByb3BlcnR5RGVmYXVsdHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgc2VsZi5zZXRHbG9iYWxQcm9wZXJ0aWVzKGZ1bmN0aW9uIChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSkge1xuICAgICAgICAgICAgZXZlbnREYXRhLl91c2VyID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh1c2VyXzEuVXNlci5jdXJyZW50KCkpKTtcbiAgICAgICAgICAgIGV2ZW50RGF0YS5fYXBwID0ge1xuICAgICAgICAgICAgICAgICdhcHBfaWQnOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICAgICAnYW5hbHl0aWNzX3ZlcnNpb24nOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5WZXJzaW9uXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBbmFseXRpY3MucHJvdG90eXBlLCBcImhhc1ZhbGlkU2V0dGluZ3NcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICghY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykgfHwgIWNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwaV9rZXknKSkge1xuICAgICAgICAgICAgICAgIHZhciBtc2cgPSAnQSB2YWxpZCBhcHBfaWQgYW5kIGFwaV9rZXkgYXJlIHJlcXVpcmVkIGJlZm9yZSB5b3UgY2FuIHV0aWxpemUgJyArXG4gICAgICAgICAgICAgICAgICAgICdhbmFseXRpY3MgcHJvcGVybHkuIFNlZSBodHRwOi8vZG9jcy5pb25pYy5pby92MS4wL2RvY3MvaW8tcXVpY2stc3RhcnQnO1xuICAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8obXNnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFuYWx5dGljcy5wcm90b3R5cGUsIFwiZGlzcGF0Y2hJbnRlcnZhbFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2Rpc3BhdGNoSW50ZXJ2YWxUaW1lO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgLy8gU2V0IGhvdyBvZnRlbiB3ZSBzaG91bGQgc2VuZCBiYXRjaGVkIGV2ZW50cywgaW4gc2Vjb25kcy5cbiAgICAgICAgICAgIC8vIFNldCB0aGlzIHRvIDAgdG8gZGlzYWJsZSBldmVudCBjYWNoaW5nXG4gICAgICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IHZhbHVlO1xuICAgICAgICAgICAgLy8gQ2xlYXIgdGhlIGV4aXN0aW5nIGludGVydmFsXG4gICAgICAgICAgICBpZiAodGhpcy5fZGlzcGF0Y2hlcikge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuX2Rpc3BhdGNoZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyBzZWxmLl9kaXNwYXRjaFF1ZXVlKCk7IH0sIHZhbHVlICogMTAwMCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3VzZUV2ZW50Q2FjaGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLl9lbnF1ZXVlRXZlbnQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIGV2ZW50RGF0YSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmIChvcHRpb25zLmRyeVJ1bikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZXZlbnQgcmVjaWV2ZWQgYnV0IG5vdCBzZW50IChkcnlSdW4gYWN0aXZlKTonKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oY29sbGVjdGlvbk5hbWUpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudERhdGEpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2VucXVldWluZyBldmVudCB0byBzZW5kIGxhdGVyOicpO1xuICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGNvbGxlY3Rpb25OYW1lKTtcbiAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudERhdGEpO1xuICAgICAgICAvLyBBZGQgdGltZXN0YW1wIHByb3BlcnR5IHRvIHRoZSBkYXRhXG4gICAgICAgIGlmICghZXZlbnREYXRhLmtlZW4pIHtcbiAgICAgICAgICAgIGV2ZW50RGF0YS5rZWVuID0ge307XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnREYXRhLmtlZW4udGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgICAvLyBBZGQgdGhlIGRhdGEgdG8gdGhlIHF1ZXVlXG4gICAgICAgIHZhciBldmVudFF1ZXVlID0gc2VsZi5jYWNoZS5nZXQoJ2V2ZW50X3F1ZXVlJykgfHwge307XG4gICAgICAgIGlmICghZXZlbnRRdWV1ZVtjb2xsZWN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgIGV2ZW50UXVldWVbY29sbGVjdGlvbk5hbWVdID0gW107XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnRRdWV1ZVtjb2xsZWN0aW9uTmFtZV0ucHVzaChldmVudERhdGEpO1xuICAgICAgICAvLyBXcml0ZSB0aGUgcXVldWUgdG8gZGlza1xuICAgICAgICBzZWxmLmNhY2hlLnNldCgnZXZlbnRfcXVldWUnLCBldmVudFF1ZXVlKTtcbiAgICB9O1xuICAgIEFuYWx5dGljcy5wcm90b3R5cGUuX3JlcXVlc3RBbmFseXRpY3NLZXkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICdqc29uJzogdHJ1ZSxcbiAgICAgICAgICAgICd1cmknOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdhcGknKSArICcvYXBpL3YxL2FwcC8nICsgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykgKyAnL2tleXMvd3JpdGUnLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7XG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiAnYmFzaWMgJyArIGJ0b2EoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykgKyAnOicgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcGlfa2V5JykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiByZXF1ZXN0XzEucmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLl9wb3N0RXZlbnQgPSBmdW5jdGlvbiAobmFtZSwgZGF0YSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBwYXlsb2FkID0ge1xuICAgICAgICAgICAgJ25hbWUnOiBbZGF0YV1cbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFBTkFMWVRJQ1NfS0VZKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignQ2Fubm90IHNlbmQgZXZlbnRzIHRvIHRoZSBhbmFseXRpY3Mgc2VydmVyIHdpdGhvdXQgYW4gQW5hbHl0aWNzIGtleS4nKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgJ3VybCc6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9hcGkvdjEvZXZlbnRzLycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICdqc29uJzogcGF5bG9hZCxcbiAgICAgICAgICAgICdoZWFkZXJzJzoge1xuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogQU5BTFlUSUNTX0tFWVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gcmVxdWVzdF8xLnJlcXVlc3QocmVxdWVzdE9wdGlvbnMpO1xuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5fcG9zdEV2ZW50cyA9IGZ1bmN0aW9uIChldmVudHMpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIUFOQUxZVElDU19LRVkpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ0Nhbm5vdCBzZW5kIGV2ZW50cyB0byB0aGUgYW5hbHl0aWNzIHNlcnZlciB3aXRob3V0IGFuIEFuYWx5dGljcyBrZXkuJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICd1cmwnOiBzZWxmLl9zZXJ2aWNlSG9zdCArICcvYXBpL3YxL2V2ZW50cy8nICsgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAnanNvbic6IGV2ZW50cyxcbiAgICAgICAgICAgICdoZWFkZXJzJzoge1xuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogQU5BTFlUSUNTX0tFWVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gcmVxdWVzdF8xLnJlcXVlc3QocmVxdWVzdE9wdGlvbnMpO1xuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5fZGlzcGF0Y2hRdWV1ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZXZlbnRRdWV1ZSA9IHRoaXMuY2FjaGUuZ2V0KCdldmVudF9xdWV1ZScpIHx8IHt9O1xuICAgICAgICBpZiAoT2JqZWN0LmtleXMoZXZlbnRRdWV1ZSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjb3JlXzEuSW9uaWNQbGF0Zm9ybS5kZXZpY2VDb25uZWN0ZWRUb05ldHdvcmsoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYuc3RvcmFnZS5sb2NrZWRBc3luY0NhbGwoc2VsZi5jYWNoZS5zY29wZWRLZXkoJ2V2ZW50X2Rpc3BhdGNoJyksIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLl9wb3N0RXZlbnRzKGV2ZW50UXVldWUpO1xuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIHt9KTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NlbnQgZXZlbnRzJyk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50UXVldWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBzZWxmLl9oYW5kbGVEaXNwYXRjaEVycm9yKGVyciwgdGhpcywgZXZlbnRRdWV1ZSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5fZ2V0UmVxdWVzdFN0YXR1c0NvZGUgPSBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgICB2YXIgcmVzcG9uc2VDb2RlID0gbnVsbDtcbiAgICAgICAgaWYgKHJlcXVlc3QgJiYgcmVxdWVzdC5yZXF1ZXN0SW5mby5fbGFzdFJlc3VsdCAmJiByZXF1ZXN0LnJlcXVlc3RJbmZvLl9sYXN0UmVzdWx0LnN0YXR1cykge1xuICAgICAgICAgICAgcmVzcG9uc2VDb2RlID0gcmVxdWVzdC5yZXF1ZXN0SW5mby5fbGFzdFJlc3VsdC5zdGF0dXM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlQ29kZTtcbiAgICB9O1xuICAgIEFuYWx5dGljcy5wcm90b3R5cGUuX2hhbmRsZURpc3BhdGNoRXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IsIHJlcXVlc3QsIGV2ZW50UXVldWUpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzcG9uc2VDb2RlID0gdGhpcy5fZ2V0UmVxdWVzdFN0YXR1c0NvZGUocmVxdWVzdCk7XG4gICAgICAgIGlmIChlcnJvciA9PT0gJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpIHtcbiAgICAgICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIHt9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIElmIHdlIGRpZG4ndCBjb25uZWN0IHRvIHRoZSBzZXJ2ZXIgYXQgYWxsIC0+IGtlZXAgZXZlbnRzXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlQ29kZSkge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdFcnJvciBzZW5kaW5nIGFuYWx5dGljcyBkYXRhOiBGYWlsZWQgdG8gY29ubmVjdCB0byBhbmFseXRpY3Mgc2VydmVyLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5jYWNoZS5zZXQoJ2V2ZW50X3F1ZXVlJywge30pO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdFcnJvciBzZW5kaW5nIGFuYWx5dGljcyBkYXRhOiBTZXJ2ZXIgcmVzcG9uZGVkIHdpdGggZXJyb3InKTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihldmVudFF1ZXVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5faGFuZGxlUmVnaXN0ZXJFcnJvciA9IGZ1bmN0aW9uIChlcnJvciwgcmVxdWVzdCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXNwb25zZUNvZGUgPSB0aGlzLl9nZXRSZXF1ZXN0U3RhdHVzQ29kZShyZXF1ZXN0KTtcbiAgICAgICAgdmFyIGRvY3MgPSAnIFNlZSBodHRwOi8vZG9jcy5pb25pYy5pby92MS4wL2RvY3MvaW8tcXVpY2stc3RhcnQnO1xuICAgICAgICBzd2l0Y2ggKHJlc3BvbnNlQ29kZSkge1xuICAgICAgICAgICAgY2FzZSA0MDE6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1RoZSBhcGkga2V5IGFuZCBhcHAgaWQgeW91IHByb3ZpZGVkIGRpZCBub3QgcmVnaXN0ZXIgb24gdGhlIHNlcnZlci4gJyArIGRvY3MpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSA0MDQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1RoZSBhcHAgaWQgeW91IHByb3ZpZGVkIChcIicgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSArICdcIikgd2FzIG5vdCBmb3VuZC4nICsgZG9jcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdVbmFibGUgdG8gcmVxdWVzdCBhbmFseXRpY3Mga2V5LicpO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIGFuIGFuYWx5dGljcyBrZXlcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRzIFJlZ2lzdHJhdGlvbiBvcHRpb25zXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHJlZ2lzdGVyIHByb21pc2VcbiAgICAgKi9cbiAgICBBbmFseXRpY3MucHJvdG90eXBlLnJlZ2lzdGVyID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoIXRoaXMuaGFzVmFsaWRTZXR0aW5ncykge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgICAgICB9XG4gICAgICAgIG9wdGlvbnMgPSBvcHRzIHx8IHt9O1xuICAgICAgICBpZiAob3B0aW9ucy5zaWxlbnQpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLnNpbGVuY2UoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLnZlcmJvc2UoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0aW9ucy5kcnlSdW4pIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2RyeVJ1biBtb2RlIGlzIGFjdGl2ZS4gQW5hbHl0aWNzIHdpbGwgbm90IHNlbmQgYW55IGV2ZW50cy4nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9yZXF1ZXN0QW5hbHl0aWNzS2V5KCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBBTkFMWVRJQ1NfS0VZID0gcmVzdWx0LnBheWxvYWQud3JpdGVfa2V5O1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc3VjY2Vzc2Z1bGx5IHJlZ2lzdGVyZWQgYW5hbHl0aWNzIGtleScpO1xuICAgICAgICAgICAgc2VsZi5kaXNwYXRjaEludGVydmFsID0gc2VsZi5kaXNwYXRjaEludGVydmFsO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLl9oYW5kbGVSZWdpc3RlckVycm9yKGVycm9yLCB0aGlzKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIEFuYWx5dGljcy5wcm90b3R5cGUuc2V0R2xvYmFsUHJvcGVydGllcyA9IGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHByb3BUeXBlID0gKHR5cGVvZiBwcm9wKTtcbiAgICAgICAgc3dpdGNoIChwcm9wVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gcHJvcCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXByb3AuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFsUHJvcGVydGllc1trZXldID0gcHJvcFtrZXldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICBnbG9iYWxQcm9wZXJ0aWVzRm5zLnB1c2gocHJvcCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdzZXRHbG9iYWxQcm9wZXJ0aWVzIHBhcmFtZXRlciBtdXN0IGJlIGFuIG9iamVjdCBvciBmdW5jdGlvbi4nKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS50cmFjayA9IGZ1bmN0aW9uIChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghdGhpcy5oYXNWYWxpZFNldHRpbmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFldmVudERhdGEpIHtcbiAgICAgICAgICAgIGV2ZW50RGF0YSA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2xvbmUgdGhlIGV2ZW50IGRhdGEgdG8gYXZvaWQgbW9kaWZ5aW5nIGl0XG4gICAgICAgICAgICBldmVudERhdGEgPSB1dGlsXzEuZGVlcEV4dGVuZCh7fSwgZXZlbnREYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gZ2xvYmFsUHJvcGVydGllcykge1xuICAgICAgICAgICAgaWYgKCFnbG9iYWxQcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChldmVudERhdGFba2V5XSA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgZXZlbnREYXRhW2tleV0gPSBnbG9iYWxQcm9wZXJ0aWVzW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnbG9iYWxQcm9wZXJ0aWVzRm5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm4gPSBnbG9iYWxQcm9wZXJ0aWVzRm5zW2ldO1xuICAgICAgICAgICAgZm4uY2FsbChudWxsLCBldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3VzZUV2ZW50Q2FjaGluZykge1xuICAgICAgICAgICAgc2VsZi5fZW5xdWV1ZUV2ZW50KGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmRyeVJ1bikge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2RyeVJ1biBhY3RpdmUsIHdpbGwgbm90IHNlbmQgZXZlbnQnKTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50Q29sbGVjdGlvbik7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudERhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcG9zdEV2ZW50KGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS51bnNldEdsb2JhbFByb3BlcnR5ID0gZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcHJvcFR5cGUgPSAodHlwZW9mIHByb3ApO1xuICAgICAgICBzd2l0Y2ggKHByb3BUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIGRlbGV0ZSBnbG9iYWxQcm9wZXJ0aWVzW3Byb3BdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIHZhciBpID0gZ2xvYmFsUHJvcGVydGllc0Zucy5pbmRleE9mKHByb3ApO1xuICAgICAgICAgICAgICAgIGlmIChpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignVGhlIGZ1bmN0aW9uIHBhc3NlZCB0byB1bnNldEdsb2JhbFByb3BlcnR5IHdhcyBub3QgYSBnbG9iYWwgcHJvcGVydHkuJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdsb2JhbFByb3BlcnRpZXNGbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcigndW5zZXRHbG9iYWxQcm9wZXJ0eSBwYXJhbWV0ZXIgbXVzdCBiZSBhIHN0cmluZyBvciBmdW5jdGlvbi4nKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIEFuYWx5dGljcztcbn0oKSk7XG5leHBvcnRzLkFuYWx5dGljcyA9IEFuYWx5dGljcztcbiIsIlwidXNlIHN0cmljdFwiO1xuZnVuY3Rpb24gX19leHBvcnQobSkge1xuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKCFleHBvcnRzLmhhc093blByb3BlcnR5KHApKSBleHBvcnRzW3BdID0gbVtwXTtcbn1cbl9fZXhwb3J0KHJlcXVpcmUoJy4vYW5hbHl0aWNzJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9zZXJpYWxpemVycycpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vc3RvcmFnZScpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIERPTVNlcmlhbGl6ZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERPTVNlcmlhbGl6ZXIoKSB7XG4gICAgfVxuICAgIERPTVNlcmlhbGl6ZXIucHJvdG90eXBlLmVsZW1lbnRTZWxlY3RvciA9IGZ1bmN0aW9uIChlbGVtZW50KSB7XG4gICAgICAgIC8vIGl0ZXJhdGUgdXAgdGhlIGRvbVxuICAgICAgICB2YXIgc2VsZWN0b3JzID0gW107XG4gICAgICAgIHdoaWxlIChlbGVtZW50LnRhZ05hbWUgIT09ICdIVE1MJykge1xuICAgICAgICAgICAgdmFyIHNlbGVjdG9yID0gZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB2YXIgaWQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnaWQnKTtcbiAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yICs9ICcjJyArIGlkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGNsYXNzTmFtZSA9IGVsZW1lbnQuY2xhc3NOYW1lO1xuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgICAgIHZhciBjbGFzc2VzID0gY2xhc3NOYW1lLnNwbGl0KCcgJyk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbGFzc2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjID0gY2xhc3Nlc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yICs9ICcuJyArIGM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWVsZW1lbnQucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGNoaWxkSW5kZXggPSBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGVsZW1lbnQucGFyZW50Tm9kZS5jaGlsZHJlbiwgZWxlbWVudCk7XG4gICAgICAgICAgICBzZWxlY3RvciArPSAnOm50aC1jaGlsZCgnICsgKGNoaWxkSW5kZXggKyAxKSArICcpJztcbiAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudE5vZGU7XG4gICAgICAgICAgICBzZWxlY3RvcnMucHVzaChzZWxlY3Rvcik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNlbGVjdG9ycy5yZXZlcnNlKCkuam9pbignPicpO1xuICAgIH07XG4gICAgRE9NU2VyaWFsaXplci5wcm90b3R5cGUuZWxlbWVudE5hbWUgPSBmdW5jdGlvbiAoZWxlbWVudCkge1xuICAgICAgICAvLyAxLiBpb24tdHJhY2stbmFtZSBkaXJlY3RpdmVcbiAgICAgICAgdmFyIG5hbWUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnaW9uLXRyYWNrLW5hbWUnKTtcbiAgICAgICAgaWYgKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBuYW1lO1xuICAgICAgICB9XG4gICAgICAgIC8vIDIuIGlkXG4gICAgICAgIHZhciBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgIHJldHVybiBpZDtcbiAgICAgICAgfVxuICAgICAgICAvLyAzLiBubyB1bmlxdWUgaWRlbnRpZmllciAtLT4gcmV0dXJuIG51bGxcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfTtcbiAgICByZXR1cm4gRE9NU2VyaWFsaXplcjtcbn0oKSk7XG5leHBvcnRzLkRPTVNlcmlhbGl6ZXIgPSBET01TZXJpYWxpemVyO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgY29yZV8xID0gcmVxdWlyZSgnLi4vY29yZS9jb3JlJyk7XG52YXIgQnVja2V0U3RvcmFnZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQnVja2V0U3RvcmFnZShuYW1lKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuYmFzZVN0b3JhZ2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5nZXRTdG9yYWdlKCk7XG4gICAgfVxuICAgIEJ1Y2tldFN0b3JhZ2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmFzZVN0b3JhZ2UucmV0cmlldmVPYmplY3QodGhpcy5zY29wZWRLZXkoa2V5KSk7XG4gICAgfTtcbiAgICBCdWNrZXRTdG9yYWdlLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXNlU3RvcmFnZS5zdG9yZU9iamVjdCh0aGlzLnNjb3BlZEtleShrZXkpLCB2YWx1ZSk7XG4gICAgfTtcbiAgICBCdWNrZXRTdG9yYWdlLnByb3RvdHlwZS5zY29wZWRLZXkgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5hbWUgKyAnXycgKyBrZXkgKyAnXycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKTtcbiAgICB9O1xuICAgIHJldHVybiBCdWNrZXRTdG9yYWdlO1xufSgpKTtcbmV4cG9ydHMuQnVja2V0U3RvcmFnZSA9IEJ1Y2tldFN0b3JhZ2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciByZXF1ZXN0XzEgPSByZXF1aXJlKCcuLi9jb3JlL3JlcXVlc3QnKTtcbnZhciBwcm9taXNlXzEgPSByZXF1aXJlKCcuLi9jb3JlL3Byb21pc2UnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBzdG9yYWdlXzEgPSByZXF1aXJlKCcuLi9jb3JlL3N0b3JhZ2UnKTtcbnZhciB1c2VyXzEgPSByZXF1aXJlKCcuLi9jb3JlL3VzZXInKTtcbnZhciBzdG9yYWdlID0gbmV3IHN0b3JhZ2VfMS5QbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5KCk7XG52YXIgc2Vzc2lvblN0b3JhZ2UgPSBuZXcgc3RvcmFnZV8xLkxvY2FsU2Vzc2lvblN0b3JhZ2VTdHJhdGVneSgpO1xudmFyIGF1dGhNb2R1bGVzID0ge307XG52YXIgYXV0aFRva2VuO1xudmFyIGF1dGhBUElCYXNlID0gY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL2F1dGgnO1xudmFyIGF1dGhBUElFbmRwb2ludHMgPSB7XG4gICAgJ2xvZ2luJzogZnVuY3Rpb24gKHByb3ZpZGVyKSB7XG4gICAgICAgIGlmIChwcm92aWRlcikge1xuICAgICAgICAgICAgcmV0dXJuIGF1dGhBUElCYXNlICsgJy9sb2dpbi8nICsgcHJvdmlkZXI7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGF1dGhBUElCYXNlICsgJy9sb2dpbic7XG4gICAgfSxcbiAgICAnc2lnbnVwJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYXV0aEFQSUJhc2UgKyAnL3VzZXJzJztcbiAgICB9XG59O1xudmFyIFRlbXBUb2tlbkNvbnRleHQgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFRlbXBUb2tlbkNvbnRleHQoKSB7XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShUZW1wVG9rZW5Db250ZXh0LCBcImxhYmVsXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lvbmljX2lvX2F1dGhfJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBUZW1wVG9rZW5Db250ZXh0LmRlbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlKFRlbXBUb2tlbkNvbnRleHQubGFiZWwpO1xuICAgIH07XG4gICAgVGVtcFRva2VuQ29udGV4dC5zdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0KFRlbXBUb2tlbkNvbnRleHQubGFiZWwsIGF1dGhUb2tlbik7XG4gICAgfTtcbiAgICBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzZXNzaW9uU3RvcmFnZS5nZXQoVGVtcFRva2VuQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gVGVtcFRva2VuQ29udGV4dDtcbn0oKSk7XG5leHBvcnRzLlRlbXBUb2tlbkNvbnRleHQgPSBUZW1wVG9rZW5Db250ZXh0O1xudmFyIFRva2VuQ29udGV4dCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVG9rZW5Db250ZXh0KCkge1xuICAgIH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoVG9rZW5Db250ZXh0LCBcImxhYmVsXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lvbmljX2lvX2F1dGhfJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBUb2tlbkNvbnRleHQuZGVsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdG9yYWdlLnJlbW92ZShUb2tlbkNvbnRleHQubGFiZWwpO1xuICAgIH07XG4gICAgVG9rZW5Db250ZXh0LnN0b3JlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdG9yYWdlLnNldChUb2tlbkNvbnRleHQubGFiZWwsIGF1dGhUb2tlbik7XG4gICAgfTtcbiAgICBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHN0b3JhZ2UuZ2V0KFRva2VuQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gVG9rZW5Db250ZXh0O1xufSgpKTtcbmV4cG9ydHMuVG9rZW5Db250ZXh0ID0gVG9rZW5Db250ZXh0O1xuZnVuY3Rpb24gc3RvcmVUb2tlbihvcHRpb25zLCB0b2tlbikge1xuICAgIGF1dGhUb2tlbiA9IHRva2VuO1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucy5yZW1lbWJlcikge1xuICAgICAgICBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIFRlbXBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG59XG52YXIgSW5BcHBCcm93c2VyRmxvdyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gSW5BcHBCcm93c2VyRmxvdyhhdXRoT3B0aW9ucywgb3B0aW9ucywgZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoIXdpbmRvdyB8fCAhd2luZG93LmNvcmRvdmEgfHwgIXdpbmRvdy5jb3Jkb3ZhLkluQXBwQnJvd3Nlcikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdNaXNzaW5nIEluQXBwQnJvd3NlciBwbHVnaW4nKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJlcXVlc3RfMS5yZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogYXV0aEFQSUVuZHBvaW50cy5sb2dpbihvcHRpb25zLnByb3ZpZGVyKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogb3B0aW9ucy51cmlfbWV0aG9kIHx8ICdQT1NUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHtcbiAgICAgICAgICAgICAgICAgICAgJ2FwcF9pZCc6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgICAgICAgICAnY2FsbGJhY2snOiBvcHRpb25zLmNhbGxiYWNrX3VyaSB8fCB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBkYXRhXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgIHZhciBsb2MgPSBkYXRhLnBheWxvYWQuZGF0YS51cmw7XG4gICAgICAgICAgICAgICAgdmFyIHRlbXBCcm93c2VyID0gd2luZG93LmNvcmRvdmEuSW5BcHBCcm93c2VyLm9wZW4obG9jLCAnX2JsYW5rJywgJ2xvY2F0aW9uPW5vLGNsZWFyY2FjaGU9eWVzLGNsZWFyc2Vzc2lvbmNhY2hlPXllcycpO1xuICAgICAgICAgICAgICAgIHRlbXBCcm93c2VyLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRzdGFydCcsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLnVybC5zbGljZSgwLCAyMCkgPT09ICdodHRwOi8vYXV0aC5pb25pYy5pbycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBxdWVyeVN0cmluZyA9IGRhdGEudXJsLnNwbGl0KCcjJylbMF0uc3BsaXQoJz8nKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbVBhcnRzID0gcXVlcnlTdHJpbmcuc3BsaXQoJyYnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbXMgPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyYW1QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJ0ID0gcGFyYW1QYXJ0c1tpXS5zcGxpdCgnPScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtc1twYXJ0WzBdXSA9IHBhcnRbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBzdG9yZVRva2VuKGF1dGhPcHRpb25zLCBwYXJhbXMudG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGVtcEJyb3dzZXIuY2xvc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBCcm93c2VyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICByZXR1cm4gSW5BcHBCcm93c2VyRmxvdztcbn0oKSk7XG5mdW5jdGlvbiBnZXRBdXRoRXJyb3JEZXRhaWxzKGVycikge1xuICAgIHZhciBkZXRhaWxzID0gW107XG4gICAgdHJ5IHtcbiAgICAgICAgZGV0YWlscyA9IGVyci5yZXNwb25zZS5ib2R5LmVycm9yLmRldGFpbHM7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIGU7XG4gICAgfVxuICAgIHJldHVybiBkZXRhaWxzO1xufVxudmFyIEF1dGggPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEF1dGgoKSB7XG4gICAgfVxuICAgIEF1dGguaXNBdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdG9rZW4gPSBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICB2YXIgdGVtcFRva2VuID0gVGVtcFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIGlmICh0ZW1wVG9rZW4gfHwgdG9rZW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIEF1dGgubG9naW4gPSBmdW5jdGlvbiAobW9kdWxlSWQsIG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIGNvbnRleHQgPSBhdXRoTW9kdWxlc1ttb2R1bGVJZF0gfHwgZmFsc2U7XG4gICAgICAgIGlmICghY29udGV4dCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBjbGFzcyBpcyBpbnZhbGlkIG9yIG1pc3Npbmc6JyArIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRleHQuYXV0aGVudGljYXRlLmFwcGx5KGNvbnRleHQsIFtvcHRpb25zLCBkYXRhXSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB1c2VyXzEuVXNlci5zZWxmKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodXNlcik7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIEF1dGguc2lnbnVwID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIGNvbnRleHQgPSBhdXRoTW9kdWxlc1snYmFzaWMnXSB8fCBmYWxzZTtcbiAgICAgICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0F1dGhlbnRpY2F0aW9uIGNsYXNzIGlzIGludmFsaWQgb3IgbWlzc2luZzonICsgY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbnRleHQuc2lnbnVwLmFwcGx5KGNvbnRleHQsIFtkYXRhXSk7XG4gICAgfTtcbiAgICBBdXRoLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgVG9rZW5Db250ZXh0LmRlbGV0ZSgpO1xuICAgICAgICBUZW1wVG9rZW5Db250ZXh0LmRlbGV0ZSgpO1xuICAgIH07XG4gICAgQXV0aC5yZWdpc3RlciA9IGZ1bmN0aW9uIChtb2R1bGVJZCwgbW9kdWxlKSB7XG4gICAgICAgIGlmICghYXV0aE1vZHVsZXNbbW9kdWxlSWRdKSB7XG4gICAgICAgICAgICBhdXRoTW9kdWxlc1ttb2R1bGVJZF0gPSBtb2R1bGU7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIEF1dGguZ2V0VXNlclRva2VuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdXNlcnRva2VuID0gVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRlbXB0b2tlbiA9IFRlbXBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICB2YXIgdG9rZW4gPSB0ZW1wdG9rZW4gfHwgdXNlcnRva2VuO1xuICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gQXV0aDtcbn0oKSk7XG5leHBvcnRzLkF1dGggPSBBdXRoO1xudmFyIEJhc2ljQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQmFzaWNBdXRoKCkge1xuICAgIH1cbiAgICBCYXNpY0F1dGguYXV0aGVudGljYXRlID0gZnVuY3Rpb24gKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgcmVxdWVzdF8xLnJlcXVlc3Qoe1xuICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMubG9naW4oKSxcbiAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAnanNvbic6IHtcbiAgICAgICAgICAgICAgICAnYXBwX2lkJzogY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAgICAgJ2VtYWlsJzogZGF0YS5lbWFpbCxcbiAgICAgICAgICAgICAgICAncGFzc3dvcmQnOiBkYXRhLnBhc3N3b3JkXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgIHN0b3JlVG9rZW4ob3B0aW9ucywgZGF0YS5wYXlsb2FkLmRhdGEudG9rZW4pO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIEJhc2ljQXV0aC5zaWdudXAgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgdXNlckRhdGEgPSB7XG4gICAgICAgICAgICAnYXBwX2lkJzogY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAnZW1haWwnOiBkYXRhLmVtYWlsLFxuICAgICAgICAgICAgJ3Bhc3N3b3JkJzogZGF0YS5wYXNzd29yZFxuICAgICAgICB9O1xuICAgICAgICAvLyBvcHRpb25hbCBkZXRhaWxzXG4gICAgICAgIGlmIChkYXRhLnVzZXJuYW1lKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS51c2VybmFtZSA9IGRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEuaW1hZ2UpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLmltYWdlID0gZGF0YS5pbWFnZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5uYW1lKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS5uYW1lID0gZGF0YS5uYW1lO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmN1c3RvbSkge1xuICAgICAgICAgICAgdXNlckRhdGEuY3VzdG9tID0gZGF0YS5jdXN0b207XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdF8xLnJlcXVlc3Qoe1xuICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMuc2lnbnVwKCksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgJ2pzb24nOiB1c2VyRGF0YVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHZhciBlcnJvcnMgPSBbXTtcbiAgICAgICAgICAgIHZhciBkZXRhaWxzID0gZ2V0QXV0aEVycm9yRGV0YWlscyhlcnIpO1xuICAgICAgICAgICAgaWYgKGRldGFpbHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGV0YWlscy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGV0YWlsID0gZGV0YWlsc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZXRhaWwgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGV0YWlsLmVycm9yX3R5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChkZXRhaWwuZXJyb3JfdHlwZSArICdfJyArIGRldGFpbC5wYXJhbWV0ZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KHsgJ2Vycm9ycyc6IGVycm9ycyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgcmV0dXJuIEJhc2ljQXV0aDtcbn0oKSk7XG52YXIgQ3VzdG9tQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQ3VzdG9tQXV0aCgpIHtcbiAgICB9XG4gICAgQ3VzdG9tQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnY3VzdG9tJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBDdXN0b21BdXRoO1xufSgpKTtcbnZhciBUd2l0dGVyQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVHdpdHRlckF1dGgoKSB7XG4gICAgfVxuICAgIFR3aXR0ZXJBdXRoLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICd0d2l0dGVyJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBUd2l0dGVyQXV0aDtcbn0oKSk7XG52YXIgRmFjZWJvb2tBdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGYWNlYm9va0F1dGgoKSB7XG4gICAgfVxuICAgIEZhY2Vib29rQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZmFjZWJvb2snIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIEZhY2Vib29rQXV0aDtcbn0oKSk7XG52YXIgR2l0aHViQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gR2l0aHViQXV0aCgpIHtcbiAgICB9XG4gICAgR2l0aHViQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZ2l0aHViJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBHaXRodWJBdXRoO1xufSgpKTtcbnZhciBHb29nbGVBdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBHb29nbGVBdXRoKCkge1xuICAgIH1cbiAgICBHb29nbGVBdXRoLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdnb29nbGUnIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIEdvb2dsZUF1dGg7XG59KCkpO1xudmFyIEluc3RhZ3JhbUF1dGggPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEluc3RhZ3JhbUF1dGgoKSB7XG4gICAgfVxuICAgIEluc3RhZ3JhbUF1dGguYXV0aGVudGljYXRlID0gZnVuY3Rpb24gKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2luc3RhZ3JhbScgfSwgZGF0YSk7XG4gICAgfTtcbiAgICByZXR1cm4gSW5zdGFncmFtQXV0aDtcbn0oKSk7XG52YXIgTGlua2VkSW5BdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBMaW5rZWRJbkF1dGgoKSB7XG4gICAgfVxuICAgIExpbmtlZEluQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnbGlua2VkaW4nIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIExpbmtlZEluQXV0aDtcbn0oKSk7XG5BdXRoLnJlZ2lzdGVyKCdiYXNpYycsIEJhc2ljQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdjdXN0b20nLCBDdXN0b21BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2ZhY2Vib29rJywgRmFjZWJvb2tBdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2dpdGh1YicsIEdpdGh1YkF1dGgpO1xuQXV0aC5yZWdpc3RlcignZ29vZ2xlJywgR29vZ2xlQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdpbnN0YWdyYW0nLCBJbnN0YWdyYW1BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2xpbmtlZGluJywgTGlua2VkSW5BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ3R3aXR0ZXInLCBUd2l0dGVyQXV0aCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2F1dGgnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4vbG9nZ2VyJyk7XG52YXIgcHJpdmF0ZURhdGEgPSB7fTtcbmZ1bmN0aW9uIHByaXZhdGVWYXIoa2V5KSB7XG4gICAgcmV0dXJuIHByaXZhdGVEYXRhW2tleV0gfHwgbnVsbDtcbn1cbnZhciBBcHAgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEFwcChhcHBJZCwgYXBpS2V5KSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIEFwcDonXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIWFwcElkIHx8IGFwcElkID09PSAnJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnTm8gYXBwX2lkIHdhcyBwcm92aWRlZCcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICghYXBpS2V5IHx8IGFwaUtleSA9PT0gJycpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ05vIGFwaV9rZXkgd2FzIHByb3ZpZGVkJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcHJpdmF0ZURhdGEuaWQgPSBhcHBJZDtcbiAgICAgICAgcHJpdmF0ZURhdGEuYXBpS2V5ID0gYXBpS2V5O1xuICAgICAgICAvLyBvdGhlciBjb25maWcgdmFsdWUgcmVmZXJlbmNlXG4gICAgICAgIHRoaXMuZGV2UHVzaCA9IG51bGw7XG4gICAgICAgIHRoaXMuZ2NtS2V5ID0gbnVsbDtcbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFwcC5wcm90b3R5cGUsIFwiaWRcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBwcml2YXRlVmFyKCdpZCcpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQXBwLnByb3RvdHlwZSwgXCJhcGlLZXlcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBwcml2YXRlVmFyKCdhcGlLZXknKTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgQXBwLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICc8QXBwIFtcXCcnICsgdGhpcy5pZCArICdcXCc+JztcbiAgICB9O1xuICAgIHJldHVybiBBcHA7XG59KCkpO1xuZXhwb3J0cy5BcHAgPSBBcHA7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBhdXRoXzEgPSByZXF1aXJlKCcuLi9hdXRoL2F1dGgnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciByZXF1ZXN0ID0gcmVxdWlyZSgnc3VwZXJhZ2VudCcpO1xudmFyIENsaWVudCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQ2xpZW50KGJhc2VVcmwsIHRva2VuLCByZXEpIHtcbiAgICAgICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybDtcbiAgICAgICAgdGhpcy50b2tlbiA9IHRva2VuO1xuICAgICAgICB0aGlzLnJlcSA9IHJlcTtcbiAgICAgICAgaWYgKHR5cGVvZiByZXEgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICByZXEgPSByZXF1ZXN0O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmw7XG4gICAgICAgIHRoaXMudG9rZW4gPSB0b2tlbjtcbiAgICAgICAgdGhpcy5yZXEgPSByZXE7XG4gICAgfVxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGVuZHBvaW50KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN1cHBsZW1lbnQodGhpcy5yZXEuZ2V0LCBlbmRwb2ludCk7XG4gICAgfTtcbiAgICBDbGllbnQucHJvdG90eXBlLnBvc3QgPSBmdW5jdGlvbiAoZW5kcG9pbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3VwcGxlbWVudCh0aGlzLnJlcS5wb3N0LCBlbmRwb2ludCk7XG4gICAgfTtcbiAgICBDbGllbnQucHJvdG90eXBlLnB1dCA9IGZ1bmN0aW9uIChlbmRwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdXBwbGVtZW50KHRoaXMucmVxLnB1dCwgZW5kcG9pbnQpO1xuICAgIH07XG4gICAgQ2xpZW50LnByb3RvdHlwZS5wYXRjaCA9IGZ1bmN0aW9uIChlbmRwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdXBwbGVtZW50KHRoaXMucmVxLnBhdGNoLCBlbmRwb2ludCk7XG4gICAgfTtcbiAgICBDbGllbnQucHJvdG90eXBlLmRlbGV0ZSA9IGZ1bmN0aW9uIChlbmRwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdXBwbGVtZW50KHRoaXMucmVxLmRlbGV0ZSwgZW5kcG9pbnQpO1xuICAgIH07XG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdXBwbGVtZW50ID0gZnVuY3Rpb24gKGZuLCBlbmRwb2ludCkge1xuICAgICAgICBpZiAoZW5kcG9pbnQuc3Vic3RyaW5nKDAsIDEpICE9PSAnLycpIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdlbmRwb2ludCBtdXN0IHN0YXJ0IHdpdGggbGVhZGluZyBzbGFzaCcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmbih0aGlzLmJhc2VVcmwgKyBlbmRwb2ludCkuc2V0KCdBdXRob3JpemF0aW9uJywgXCJCZWFyZXIgXCIgKyB0aGlzLnRva2VuKTtcbiAgICB9O1xuICAgIHJldHVybiBDbGllbnQ7XG59KCkpO1xuZXhwb3J0cy5DbGllbnQgPSBDbGllbnQ7XG5leHBvcnRzLmNsaWVudCA9IG5ldyBDbGllbnQoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJyksIGF1dGhfMS5BdXRoLmdldFVzZXJUb2tlbigpLCByZXF1ZXN0KTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIElvbmljUGxhdGZvcm1Db25maWcgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIElvbmljUGxhdGZvcm1Db25maWcoKSB7XG4gICAgICAgIHRoaXMubG9jYXRpb25zID0ge1xuICAgICAgICAgICAgJ2FwaSc6ICdodHRwczovL2FwcHMuaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ3B1c2gnOiAnaHR0cHM6Ly9wdXNoLmlvbmljLmlvJyxcbiAgICAgICAgICAgICdhbmFseXRpY3MnOiAnaHR0cHM6Ly9hbmFseXRpY3MuaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ2RlcGxveSc6ICdodHRwczovL2FwcHMuaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ3BsYXRmb3JtLWFwaSc6ICdodHRwczovL2FwaS5pb25pYy5pbydcbiAgICAgICAgfTtcbiAgICB9XG4gICAgSW9uaWNQbGF0Zm9ybUNvbmZpZy5wcm90b3R5cGUucmVnaXN0ZXIgPSBmdW5jdGlvbiAoc2V0dGluZ3MpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgIH07XG4gICAgSW9uaWNQbGF0Zm9ybUNvbmZpZy5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzW25hbWVdO1xuICAgIH07XG4gICAgSW9uaWNQbGF0Zm9ybUNvbmZpZy5wcm90b3R5cGUuZ2V0VVJMID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIGRldkxvY2F0aW9ucyA9IHRoaXMuc2V0dGluZ3MgJiYgdGhpcy5zZXR0aW5nc1snZGV2X2xvY2F0aW9ucyddIHx8IHt9O1xuICAgICAgICBpZiAoZGV2TG9jYXRpb25zW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gZGV2TG9jYXRpb25zW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMubG9jYXRpb25zW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2NhdGlvbnNbbmFtZV07XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBJb25pY1BsYXRmb3JtQ29uZmlnO1xufSgpKTtcbmV4cG9ydHMuSW9uaWNQbGF0Zm9ybUNvbmZpZyA9IElvbmljUGxhdGZvcm1Db25maWc7XG5leHBvcnRzLkNvbmZpZyA9IG5ldyBJb25pY1BsYXRmb3JtQ29uZmlnKCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBldmVudHNfMSA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG52YXIgc3RvcmFnZV8xID0gcmVxdWlyZSgnLi9zdG9yYWdlJyk7XG52YXIgbG9nZ2VyXzEgPSByZXF1aXJlKCcuL2xvZ2dlcicpO1xudmFyIGNvbmZpZ18xID0gcmVxdWlyZSgnLi9jb25maWcnKTtcbnZhciBldmVudEVtaXR0ZXIgPSBuZXcgZXZlbnRzXzEuRXZlbnRFbWl0dGVyKCk7XG52YXIgbWFpblN0b3JhZ2UgPSBuZXcgc3RvcmFnZV8xLlN0b3JhZ2UoKTtcbnZhciBJb25pY1BsYXRmb3JtQ29yZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gSW9uaWNQbGF0Zm9ybUNvcmUoKSB7XG4gICAgICAgIHRoaXMuY29yZG92YVBsYXRmb3JtVW5rbm93biA9IGZhbHNlO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnXzEuQ29uZmlnO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBsb2dnZXJfMS5Mb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBDb3JlOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICAgICAgdGhpcy5fcGx1Z2luc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZW1pdHRlciA9IHRoaXMuZ2V0RW1pdHRlcigpO1xuICAgICAgICB0aGlzLl9ib290c3RyYXAoKTtcbiAgICAgICAgaWYgKHNlbGYuY29yZG92YVBsYXRmb3JtVW5rbm93bikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYXR0ZW1wdGluZyB0byBtb2NrIHBsdWdpbnMnKTtcbiAgICAgICAgICAgIHNlbGYuX3BsdWdpbnNSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdwbHVnaW5zIGFyZSByZWFkeScpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgICAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCd1bmFibGUgdG8gbGlzdGVuIGZvciBjb3Jkb3ZhIHBsdWdpbnMgdG8gYmUgcmVhZHknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUuaW5pdCA9IGZ1bmN0aW9uIChjZmcpIHtcbiAgICAgICAgdGhpcy5jb25maWcucmVnaXN0ZXIoY2ZnKTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUsIFwiVmVyc2lvblwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdWRVJTSU9OX1NUUklORyc7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5nZXRFbWl0dGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZXZlbnRFbWl0dGVyO1xuICAgIH07XG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLmdldFN0b3JhZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBtYWluU3RvcmFnZTtcbiAgICB9O1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5faXNDb3Jkb3ZhQXZhaWxhYmxlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NlYXJjaGluZyBmb3IgY29yZG92YS5qcycpO1xuICAgICAgICBpZiAodHlwZW9mIGNvcmRvdmEgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdjb3Jkb3ZhLmpzIGhhcyBhbHJlYWR5IGJlZW4gbG9hZGVkJyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcbiAgICAgICAgdmFyIGxlbiA9IHNjcmlwdHMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgc2NyaXB0ID0gc2NyaXB0c1tpXS5nZXRBdHRyaWJ1dGUoJ3NyYycpO1xuICAgICAgICAgICAgaWYgKHNjcmlwdCkge1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0cyA9IHNjcmlwdC5zcGxpdCgnLycpO1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0c0xlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHNMZW5ndGggPSBwYXJ0cy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0c1twYXJ0c0xlbmd0aCAtIDFdID09PSAnY29yZG92YS5qcycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2NvcmRvdmEuanMgaGFzIHByZXZpb3VzbHkgYmVlbiBpbmNsdWRlZC4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2VuY291bnRlcmVkIGVycm9yIHdoaWxlIHRlc3RpbmcgZm9yIGNvcmRvdmEuanMgcHJlc2VuY2UsICcgKyBlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUubG9hZENvcmRvdmEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLl9pc0NvcmRvdmFBdmFpbGFibGUoKSkge1xuICAgICAgICAgICAgdmFyIGNvcmRvdmFTY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgIHZhciBjb3Jkb3ZhU3JjID0gJ2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgc3dpdGNoICh0aGlzLmdldERldmljZVR5cGVCeU5hdmlnYXRvcigpKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYW5kcm9pZCc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24uaHJlZi5zdWJzdHJpbmcoMCwgNCkgPT09ICdmaWxlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29yZG92YVNyYyA9ICdmaWxlOi8vL2FuZHJvaWRfYXNzZXQvd3d3L2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lwYWQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2lwaG9uZSc6XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVzb3VyY2UgPSB3aW5kb3cubG9jYXRpb24uc2VhcmNoLm1hdGNoKC9jb3Jkb3ZhX2pzX2Jvb3RzdHJhcF9yZXNvdXJjZT0oLio/KSgmfCN8JCkvaSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3Jkb3ZhU3JjID0gZGVjb2RlVVJJKHJlc291cmNlWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnY291bGQgbm90IGZpbmQgY29yZG92YV9qc19ib290c3RyYXBfcmVzb3VyY2UgcXVlcnkgcGFyYW0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb3Jkb3ZhU2NyaXB0LnNldEF0dHJpYnV0ZSgnc3JjJywgY29yZG92YVNyYyk7XG4gICAgICAgICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGNvcmRvdmFTY3JpcHQpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnaW5qZWN0aW5nIGNvcmRvdmEuanMnKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lIHRoZSBkZXZpY2UgdHlwZSB2aWEgdGhlIHVzZXIgYWdlbnQgc3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfSBuYW1lIG9mIGRldmljZSBwbGF0Zm9ybSBvciAndW5rbm93bicgaWYgdW5hYmxlIHRvIGlkZW50aWZ5IHRoZSBkZXZpY2VcbiAgICAgKi9cbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUuZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICB2YXIgaXBhZCA9IGFnZW50Lm1hdGNoKC9pUGFkL2kpO1xuICAgICAgICBpZiAoaXBhZCAmJiAoaXBhZFswXS50b0xvd2VyQ2FzZSgpID09PSAnaXBhZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lwYWQnO1xuICAgICAgICB9XG4gICAgICAgIHZhciBpcGhvbmUgPSBhZ2VudC5tYXRjaCgvaVBob25lL2kpO1xuICAgICAgICBpZiAoaXBob25lICYmIChpcGhvbmVbMF0udG9Mb3dlckNhc2UoKSA9PT0gJ2lwaG9uZScpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lwaG9uZSc7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGFuZHJvaWQgPSBhZ2VudC5tYXRjaCgvQW5kcm9pZC9pKTtcbiAgICAgICAgaWYgKGFuZHJvaWQgJiYgKGFuZHJvaWRbMF0udG9Mb3dlckNhc2UoKSA9PT0gJ2FuZHJvaWQnKSkge1xuICAgICAgICAgICAgcmV0dXJuICdhbmRyb2lkJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ3Vua25vd24nO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGRldmljZSBpcyBhbiBBbmRyb2lkIGRldmljZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgQW5kcm9pZCwgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLmlzQW5kcm9pZERldmljZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRldmljZSA9IHRoaXMuZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yKCk7XG4gICAgICAgIGlmIChkZXZpY2UgPT09ICdhbmRyb2lkJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGRldmljZSBpcyBhbiBpT1MgZGV2aWNlXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiBpT1MsIGZhbHNlIG90aGVyd2lzZVxuICAgICAqL1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5pc0lPU0RldmljZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRldmljZSA9IHRoaXMuZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yKCk7XG4gICAgICAgIGlmIChkZXZpY2UgPT09ICdpcGhvbmUnIHx8IGRldmljZSA9PT0gJ2lwYWQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBCb290c3RyYXAgSW9uaWMgQ29yZVxuICAgICAqXG4gICAgICogSGFuZGxlcyB0aGUgY29yZG92YS5qcyBib290c3RyYXBcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5fYm9vdHN0cmFwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmxvYWRDb3Jkb3ZhKCk7XG4gICAgICAgIHN3aXRjaCAodGhpcy5nZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKSkge1xuICAgICAgICAgICAgY2FzZSAndW5rbm93bic6XG4gICAgICAgICAgICAgICAgdGhpcy5jb3Jkb3ZhUGxhdGZvcm1Vbmtub3duID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH07XG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLmRldmljZUNvbm5lY3RlZFRvTmV0d29yayA9IGZ1bmN0aW9uIChzdHJpY3RNb2RlKSB7XG4gICAgICAgIGlmIChzdHJpY3RNb2RlID09PSB2b2lkIDApIHsgc3RyaWN0TW9kZSA9IG51bGw7IH1cbiAgICAgICAgaWYgKHR5cGVvZiBzdHJpY3RNb2RlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgc3RyaWN0TW9kZSA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yLmNvbm5lY3Rpb24gPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICAgICAgICB0eXBlb2YgbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZSA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgICAgICAgIHR5cGVvZiBDb25uZWN0aW9uID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaWYgKCFzdHJpY3RNb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uRVRIRVJORVQ6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uV0lGSTpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMXzJHOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTExfM0c6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTF80RzpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMOlxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZpcmUgYSBjYWxsYmFjayB3aGVuIGNvcmUgKyBwbHVnaW5zIGFyZSByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgY29tcG9uZW50cyBoYXZlIGFscmVhZHkgYmVjb21lIGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUub25SZWFkeSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9wbHVnaW5zUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5lbWl0dGVyLm9uKCdpb25pY19jb3JlOnBsdWdpbnNfcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIElvbmljUGxhdGZvcm1Db3JlO1xufSgpKTtcbmV4cG9ydHMuSW9uaWNQbGF0Zm9ybUNvcmUgPSBJb25pY1BsYXRmb3JtQ29yZTtcbmV4cG9ydHMuSW9uaWNQbGF0Zm9ybSA9IG5ldyBJb25pY1BsYXRmb3JtQ29yZSgpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgZGF0YVR5cGVNYXBwaW5nID0ge307XG52YXIgRGF0YVR5cGVTY2hlbWEgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERhdGFUeXBlU2NoZW1hKHByb3BlcnRpZXMpIHtcbiAgICAgICAgdGhpcy5kYXRhID0ge307XG4gICAgICAgIHRoaXMuc2V0UHJvcGVydGllcyhwcm9wZXJ0aWVzKTtcbiAgICB9XG4gICAgRGF0YVR5cGVTY2hlbWEucHJvdG90eXBlLnNldFByb3BlcnRpZXMgPSBmdW5jdGlvbiAocHJvcGVydGllcykge1xuICAgICAgICBpZiAocHJvcGVydGllcyBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgICAgZm9yICh2YXIgeCBpbiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhW3hdID0gcHJvcGVydGllc1t4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgRGF0YVR5cGVTY2hlbWEucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmRhdGE7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnX19Jb25pY19EYXRhVHlwZVNjaGVtYSc6IGRhdGEubmFtZSxcbiAgICAgICAgICAgICd2YWx1ZSc6IGRhdGEudmFsdWVcbiAgICAgICAgfTtcbiAgICB9O1xuICAgIERhdGFUeXBlU2NoZW1hLnByb3RvdHlwZS5pc1ZhbGlkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLm5hbWUgJiYgdGhpcy5kYXRhLnZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gRGF0YVR5cGVTY2hlbWE7XG59KCkpO1xuZXhwb3J0cy5EYXRhVHlwZVNjaGVtYSA9IERhdGFUeXBlU2NoZW1hO1xudmFyIERhdGFUeXBlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBEYXRhVHlwZSgpIHtcbiAgICB9XG4gICAgRGF0YVR5cGUuZ2V0ID0gZnVuY3Rpb24gKG5hbWUsIHZhbHVlKSB7XG4gICAgICAgIGlmIChkYXRhVHlwZU1hcHBpbmdbbmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgZGF0YVR5cGVNYXBwaW5nW25hbWVdKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBEYXRhVHlwZS5nZXRNYXBwaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZGF0YVR5cGVNYXBwaW5nO1xuICAgIH07XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KERhdGFUeXBlLCBcIlNjaGVtYVwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIERhdGFUeXBlU2NoZW1hO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBEYXRhVHlwZS5yZWdpc3RlciA9IGZ1bmN0aW9uIChuYW1lLCBjbHMpIHtcbiAgICAgICAgZGF0YVR5cGVNYXBwaW5nW25hbWVdID0gY2xzO1xuICAgIH07XG4gICAgcmV0dXJuIERhdGFUeXBlO1xufSgpKTtcbmV4cG9ydHMuRGF0YVR5cGUgPSBEYXRhVHlwZTtcbnZhciBVbmlxdWVBcnJheSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVW5pcXVlQXJyYXkodmFsdWUpIHtcbiAgICAgICAgdGhpcy5kYXRhID0gW107XG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBmb3IgKHZhciB4IGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wdXNoKHZhbHVlW3hdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBVbmlxdWVBcnJheS5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YTtcbiAgICAgICAgdmFyIHNjaGVtYSA9IG5ldyBEYXRhVHlwZVNjaGVtYSh7ICduYW1lJzogJ1VuaXF1ZUFycmF5JywgJ3ZhbHVlJzogZGF0YSB9KTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS50b0pTT04oKTtcbiAgICB9O1xuICAgIFVuaXF1ZUFycmF5LmZyb21TdG9yYWdlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBuZXcgVW5pcXVlQXJyYXkodmFsdWUpO1xuICAgIH07XG4gICAgVW5pcXVlQXJyYXkucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5pbmRleE9mKHZhbHVlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5wdXNoKHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVW5pcXVlQXJyYXkucHJvdG90eXBlLnB1bGwgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5kYXRhLmluZGV4T2YodmFsdWUpO1xuICAgICAgICB0aGlzLmRhdGEuc3BsaWNlKGluZGV4LCAxKTtcbiAgICB9O1xuICAgIHJldHVybiBVbmlxdWVBcnJheTtcbn0oKSk7XG5leHBvcnRzLlVuaXF1ZUFycmF5ID0gVW5pcXVlQXJyYXk7XG5EYXRhVHlwZS5yZWdpc3RlcignVW5pcXVlQXJyYXknLCBVbmlxdWVBcnJheSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBFdmVudEVtaXR0ZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgICAgICAgdGhpcy5ldmVudEhhbmRsZXJzID0ge307XG4gICAgfVxuICAgIEV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBmdW5jdGlvbiAoZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdLnB1c2goY2FsbGJhY2spO1xuICAgIH07XG4gICAgRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gKGV2ZW50LCBkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhID09PSB2b2lkIDApIHsgZGF0YSA9IG51bGw7IH1cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIF9pID0gMCwgX2EgPSB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdOyBfaSA8IF9hLmxlbmd0aDsgX2krKykge1xuICAgICAgICAgICAgdmFyIGNhbGxiYWNrID0gX2FbX2ldO1xuICAgICAgICAgICAgY2FsbGJhY2soZGF0YSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBFdmVudEVtaXR0ZXI7XG59KCkpO1xuZXhwb3J0cy5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2FwcCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vY29yZScpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vZGF0YS10eXBlcycpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vZXZlbnRzJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9sb2dnZXInKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3Byb21pc2UnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3JlcXVlc3QnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2NvbmZpZycpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vc3RvcmFnZScpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vdXNlcicpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vY2xpZW50JykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgTG9nZ2VyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBMb2dnZXIob3B0cykge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IG9wdHMgfHwge307XG4gICAgICAgIHRoaXMuX3NpbGVuY2UgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fcHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIHRoaXMuX2Jvb3RzdHJhcCgpO1xuICAgIH1cbiAgICBMb2dnZXIucHJvdG90eXBlLnNpbGVuY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX3NpbGVuY2UgPSB0cnVlO1xuICAgIH07XG4gICAgTG9nZ2VyLnByb3RvdHlwZS52ZXJib3NlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLl9zaWxlbmNlID0gZmFsc2U7XG4gICAgfTtcbiAgICBMb2dnZXIucHJvdG90eXBlLl9ib290c3RyYXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9vcHRpb25zLnByZWZpeCkge1xuICAgICAgICAgICAgdGhpcy5fcHJlZml4ID0gdGhpcy5fb3B0aW9ucy5wcmVmaXg7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIExvZ2dlci5wcm90b3R5cGUuaW5mbyA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIGlmICghdGhpcy5fc2lsZW5jZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3ByZWZpeCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHRoaXMuX3ByZWZpeCwgZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgTG9nZ2VyLnByb3RvdHlwZS53YXJuID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zaWxlbmNlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5fcHJlZml4LCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBMb2dnZXIucHJvdG90eXBlLmVycm9yID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKHRoaXMuX3ByZWZpeCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcih0aGlzLl9wcmVmaXgsIGRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihkYXRhKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIExvZ2dlcjtcbn0oKSk7XG5leHBvcnRzLkxvZ2dlciA9IExvZ2dlcjtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIF9fZXh0ZW5kcyA9ICh0aGlzICYmIHRoaXMuX19leHRlbmRzKSB8fCBmdW5jdGlvbiAoZCwgYikge1xuICAgIGZvciAodmFyIHAgaW4gYikgaWYgKGIuaGFzT3duUHJvcGVydHkocCkpIGRbcF0gPSBiW3BdO1xuICAgIGZ1bmN0aW9uIF9fKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gZDsgfVxuICAgIGQucHJvdG90eXBlID0gYiA9PT0gbnVsbCA/IE9iamVjdC5jcmVhdGUoYikgOiAoX18ucHJvdG90eXBlID0gYi5wcm90b3R5cGUsIG5ldyBfXygpKTtcbn07XG52YXIgZXM2X3Byb21pc2VfMSA9IHJlcXVpcmUoJ2VzNi1wcm9taXNlJyk7XG52YXIgUHJvbWlzZVdpdGhOb3RpZnkgPSAoZnVuY3Rpb24gKF9zdXBlcikge1xuICAgIF9fZXh0ZW5kcyhQcm9taXNlV2l0aE5vdGlmeSwgX3N1cGVyKTtcbiAgICBmdW5jdGlvbiBQcm9taXNlV2l0aE5vdGlmeSgpIHtcbiAgICAgICAgX3N1cGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIFByb21pc2VXaXRoTm90aWZ5LnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24gKG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvbk5vdGlmaWVkKSB7XG4gICAgICAgIHRoaXMub25Ob3RpZnkgPSBvbk5vdGlmaWVkO1xuICAgICAgICByZXR1cm4gX3N1cGVyLnByb3RvdHlwZS50aGVuLmNhbGwodGhpcywgb25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQpO1xuICAgIH07XG4gICAgcmV0dXJuIFByb21pc2VXaXRoTm90aWZ5O1xufShlczZfcHJvbWlzZV8xLlByb21pc2UpKTtcbmV4cG9ydHMuUHJvbWlzZVdpdGhOb3RpZnkgPSBQcm9taXNlV2l0aE5vdGlmeTtcbnZhciBEZWZlcnJlZFByb21pc2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERlZmVycmVkUHJvbWlzZSgpIHtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgdGhpcy5ub3RpZnlWYWx1ZXMgPSBbXTtcbiAgICAgICAgdGhpcy5wcm9taXNlID0gbmV3IFByb21pc2VXaXRoTm90aWZ5KGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIF90aGlzLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICAgICAgX3RoaXMucmVqZWN0ID0gcmVqZWN0O1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIG9yaWdpbmFsVGhlbiA9IHRoaXMucHJvbWlzZS50aGVuO1xuICAgICAgICB0aGlzLnByb21pc2UudGhlbiA9IGZ1bmN0aW9uIChvaywgZmFpbCwgbm90aWZ5KSB7XG4gICAgICAgICAgICBfdGhpcy5fbm90aWZ5ID0gbm90aWZ5O1xuICAgICAgICAgICAgZm9yICh2YXIgX2kgPSAwLCBfYSA9IF90aGlzLm5vdGlmeVZhbHVlczsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgdiA9IF9hW19pXTtcbiAgICAgICAgICAgICAgICBfdGhpcy5fbm90aWZ5KHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVGhlbi5jYWxsKF90aGlzLnByb21pc2UsIG9rLCBmYWlsKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgRGVmZXJyZWRQcm9taXNlLnByb3RvdHlwZS5ub3RpZnkgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLl9ub3RpZnkgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMubm90aWZ5VmFsdWVzLnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fbm90aWZ5KHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIERlZmVycmVkUHJvbWlzZTtcbn0oKSk7XG5leHBvcnRzLkRlZmVycmVkUHJvbWlzZSA9IERlZmVycmVkUHJvbWlzZTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4vcHJvbWlzZScpO1xudmFyIGF1dGhfMSA9IHJlcXVpcmUoJy4uL2F1dGgvYXV0aCcpO1xudmFyIHIgPSByZXF1aXJlKCdzdXBlcmFnZW50Jyk7XG5mdW5jdGlvbiByZXF1ZXN0KG9wdGlvbnMpIHtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XG4gICAgaWYgKCFvcHRpb25zLmhlYWRlcnMuQXV0aG9yaXphdGlvbikge1xuICAgICAgICB2YXIgdG9rZW4gPSBhdXRoXzEuQXV0aC5nZXRVc2VyVG9rZW4oKTtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICBvcHRpb25zLmhlYWRlcnMuQXV0aG9yaXphdGlvbiA9ICdCZWFyZXIgJyArIHRva2VuO1xuICAgICAgICB9XG4gICAgfVxuICAgIHZhciByZXF1ZXN0SW5mbyA9IHt9O1xuICAgIHZhciBwID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICB2YXIgcmVxdWVzdF9tZXRob2QgPSAob3B0aW9ucy5tZXRob2QgfHwgJ2dldCcpLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFyIHJlcSA9IHJbcmVxdWVzdF9tZXRob2RdKG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsKTtcbiAgICBpZiAob3B0aW9ucy5qc29uKSB7XG4gICAgICAgIHJlcSA9IHJlcS5zZW5kKG9wdGlvbnMuanNvbik7XG4gICAgfVxuICAgIGlmIChvcHRpb25zLmhlYWRlcnMpIHtcbiAgICAgICAgcmVxID0gcmVxLnNldChvcHRpb25zLmhlYWRlcnMpO1xuICAgIH1cbiAgICByZXEgPSByZXEuZW5kKGZ1bmN0aW9uIChlcnIsIHJlcykge1xuICAgICAgICByZXF1ZXN0SW5mby5fbGFzdEVycm9yID0gZXJyO1xuICAgICAgICByZXF1ZXN0SW5mby5fbGFzdFJlc3VsdCA9IHJlcztcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgcC5yZWplY3QoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmIChyZXMuc3RhdHVzIDwgMjAwIHx8IHJlcy5zdGF0dXMgPj0gNDAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIF9lcnIgPSBuZXcgRXJyb3IoJ1JlcXVlc3QgRmFpbGVkIHdpdGggc3RhdHVzIGNvZGUgb2YgJyArIHJlcy5zdGF0dXMpO1xuICAgICAgICAgICAgICAgIHAucmVqZWN0KHsgJ3Jlc3BvbnNlJzogcmVzLCAnZXJyb3InOiBfZXJyIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcC5yZXNvbHZlKHsgJ3Jlc3BvbnNlJzogcmVzLCAncGF5bG9hZCc6IHJlcy5ib2R5IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG4gICAgcC5yZXF1ZXN0SW5mbyA9IHJlcXVlc3RJbmZvO1xuICAgIHJldHVybiBwLnByb21pc2U7XG59XG5leHBvcnRzLnJlcXVlc3QgPSByZXF1ZXN0O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgcHJvbWlzZV8xID0gcmVxdWlyZSgnLi9wcm9taXNlJyk7XG52YXIgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSgpIHtcbiAgICB9XG4gICAgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSk7XG4gICAgfTtcbiAgICBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbiAgICB9O1xuICAgIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3kucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG4gICAgfTtcbiAgICByZXR1cm4gUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneTtcbn0oKSk7XG5leHBvcnRzLlBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3kgPSBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5O1xudmFyIExvY2FsU2Vzc2lvblN0b3JhZ2VTdHJhdGVneSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5KCkge1xuICAgIH1cbiAgICBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5zZXNzaW9uU3RvcmFnZS5nZXRJdGVtKGtleSk7XG4gICAgfTtcbiAgICBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5zZXNzaW9uU3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XG4gICAgfTtcbiAgICBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbShrZXksIHZhbHVlKTtcbiAgICB9O1xuICAgIHJldHVybiBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3k7XG59KCkpO1xuZXhwb3J0cy5Mb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kgPSBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3k7XG52YXIgb2JqZWN0Q2FjaGUgPSB7fTtcbnZhciBtZW1vcnlMb2NrcyA9IHt9O1xudmFyIFN0b3JhZ2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFN0b3JhZ2UoKSB7XG4gICAgICAgIHRoaXMuc3RyYXRlZ3kgPSBuZXcgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSgpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTdG9yZXMgYW4gb2JqZWN0IGluIGxvY2FsIHN0b3JhZ2UgdW5kZXIgdGhlIGdpdmVuIGtleVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgTmFtZSBvZiB0aGUga2V5IHRvIHN0b3JlIHZhbHVlcyBpblxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBzdG9yZSB3aXRoIHRoZSBrZXlcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFN0b3JhZ2UucHJvdG90eXBlLnN0b3JlT2JqZWN0ID0gZnVuY3Rpb24gKGtleSwgb2JqZWN0KSB7XG4gICAgICAgIC8vIENvbnZlcnQgb2JqZWN0IHRvIEpTT04gYW5kIHN0b3JlIGluIGxvY2FsU3RvcmFnZVxuICAgICAgICB2YXIganNvbiA9IEpTT04uc3RyaW5naWZ5KG9iamVjdCk7XG4gICAgICAgIHRoaXMuc3RyYXRlZ3kuc2V0KGtleSwganNvbik7XG4gICAgICAgIC8vIFRoZW4gc3RvcmUgaXQgaW4gdGhlIG9iamVjdCBjYWNoZVxuICAgICAgICBvYmplY3RDYWNoZVtrZXldID0gb2JqZWN0O1xuICAgIH07XG4gICAgU3RvcmFnZS5wcm90b3R5cGUuZGVsZXRlT2JqZWN0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0aGlzLnN0cmF0ZWd5LnJlbW92ZShrZXkpO1xuICAgICAgICBkZWxldGUgb2JqZWN0Q2FjaGVba2V5XTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEVpdGhlciByZXRyaWV2ZXMgdGhlIGNhY2hlZCBjb3B5IG9mIGFuIG9iamVjdCxcbiAgICAgKiBvciB0aGUgb2JqZWN0IGl0c2VsZiBmcm9tIGxvY2FsU3RvcmFnZS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBuYW1lIG9mIHRoZSBrZXkgdG8gcHVsbCBmcm9tXG4gICAgICogQHJldHVybiB7bWl4ZWR9IFJldHVybnMgdGhlIHByZXZpb3VzbHkgc3RvcmVkIE9iamVjdCBvciBudWxsXG4gICAgICovXG4gICAgU3RvcmFnZS5wcm90b3R5cGUucmV0cmlldmVPYmplY3QgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIC8vIEZpcnN0IGNoZWNrIHRvIHNlZSBpZiBpdCdzIHRoZSBvYmplY3QgY2FjaGVcbiAgICAgICAgdmFyIGNhY2hlZCA9IG9iamVjdENhY2hlW2tleV07XG4gICAgICAgIGlmIChjYWNoZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWQ7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVzZXJpYWxpemUgdGhlIG9iamVjdCBmcm9tIEpTT05cbiAgICAgICAgdmFyIGpzb24gPSB0aGlzLnN0cmF0ZWd5LmdldChrZXkpO1xuICAgICAgICAvLyBudWxsIG9yIHVuZGVmaW5lZCAtLT4gcmV0dXJuIG51bGwuXG4gICAgICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoanNvbik7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIExvY2tzIHRoZSBhc3luYyBjYWxsIHJlcHJlc2VudGVkIGJ5IHRoZSBnaXZlbiBwcm9taXNlIGFuZCBsb2NrIGtleS5cbiAgICAgKiBPbmx5IG9uZSBhc3luY0Z1bmN0aW9uIGdpdmVuIGJ5IHRoZSBsb2NrS2V5IGNhbiBiZSBydW5uaW5nIGF0IGFueSB0aW1lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGxvY2tLZXkgc2hvdWxkIGJlIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgbmFtZSBvZiB0aGlzIGFzeW5jIGNhbGwuXG4gICAgICogICAgICAgIFRoaXMgaXMgcmVxdWlyZWQgZm9yIHBlcnNpc3RlbmNlLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGFzeW5jRnVuY3Rpb24gUmV0dXJucyBhIHByb21pc2Ugb2YgdGhlIGFzeW5jIGNhbGwuXG4gICAgICogQHJldHVybnMge1Byb21pc2V9IEEgbmV3IHByb21pc2UsIGlkZW50aWNhbCB0byB0aGUgb25lIHJldHVybmVkIGJ5IGFzeW5jRnVuY3Rpb24sXG4gICAgICogICAgICAgICAgYnV0IHdpdGggdHdvIG5ldyBlcnJvcnM6ICdpbl9wcm9ncmVzcycsIGFuZCAnbGFzdF9jYWxsX2ludGVycnVwdGVkJy5cbiAgICAgKi9cbiAgICBTdG9yYWdlLnByb3RvdHlwZS5sb2NrZWRBc3luY0NhbGwgPSBmdW5jdGlvbiAobG9ja0tleSwgYXN5bmNGdW5jdGlvbikge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIC8vIElmIHRoZSBtZW1vcnkgbG9jayBpcyBzZXQsIGVycm9yIG91dC5cbiAgICAgICAgaWYgKG1lbW9yeUxvY2tzW2xvY2tLZXldKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2luX3Byb2dyZXNzJyk7XG4gICAgICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHN0b3JlZCBsb2NrIGJ1dCBubyBtZW1vcnkgbG9jaywgZmxhZyBhIHBlcnNpc3RlbmNlIGVycm9yXG4gICAgICAgIGlmICh0aGlzLnN0cmF0ZWd5LmdldChsb2NrS2V5KSA9PT0gJ2xvY2tlZCcpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCgnbGFzdF9jYWxsX2ludGVycnVwdGVkJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5wcm9taXNlLnRoZW4obnVsbCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHNlbGYuc3RyYXRlZ3kucmVtb3ZlKGxvY2tLZXkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBTZXQgc3RvcmVkIGFuZCBtZW1vcnkgbG9ja3NcbiAgICAgICAgbWVtb3J5TG9ja3NbbG9ja0tleV0gPSB0cnVlO1xuICAgICAgICBzZWxmLnN0cmF0ZWd5LnNldChsb2NrS2V5LCAnbG9ja2VkJyk7XG4gICAgICAgIC8vIFBlcmZvcm0gdGhlIGFzeW5jIG9wZXJhdGlvblxuICAgICAgICBhc3luY0Z1bmN0aW9uKCkudGhlbihmdW5jdGlvbiAoc3VjY2Vzc0RhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoc3VjY2Vzc0RhdGEpO1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgICAgICBkZWxldGUgbWVtb3J5TG9ja3NbbG9ja0tleV07XG4gICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yRGF0YSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yRGF0YSk7XG4gICAgICAgICAgICAvLyBSZW1vdmUgc3RvcmVkIGFuZCBtZW1vcnkgbG9ja3NcbiAgICAgICAgICAgIGRlbGV0ZSBtZW1vcnlMb2Nrc1tsb2NrS2V5XTtcbiAgICAgICAgICAgIHNlbGYuc3RyYXRlZ3kucmVtb3ZlKGxvY2tLZXkpO1xuICAgICAgICB9LCBmdW5jdGlvbiAobm90aWZ5RGF0YSkge1xuICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KG5vdGlmeURhdGEpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICByZXR1cm4gU3RvcmFnZTtcbn0oKSk7XG5leHBvcnRzLlN0b3JhZ2UgPSBTdG9yYWdlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgYXV0aF8xID0gcmVxdWlyZSgnLi4vYXV0aC9hdXRoJyk7XG52YXIgcmVxdWVzdF8xID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG52YXIgcHJvbWlzZV8xID0gcmVxdWlyZSgnLi9wcm9taXNlJyk7XG52YXIgY29yZV8xID0gcmVxdWlyZSgnLi9jb3JlJyk7XG52YXIgc3RvcmFnZV8xID0gcmVxdWlyZSgnLi9zdG9yYWdlJyk7XG52YXIgbG9nZ2VyXzEgPSByZXF1aXJlKCcuL2xvZ2dlcicpO1xudmFyIGRhdGFfdHlwZXNfMSA9IHJlcXVpcmUoJy4vZGF0YS10eXBlcycpO1xudmFyIEFwcFVzZXJDb250ZXh0ID0gbnVsbDtcbnZhciBzdG9yYWdlID0gbmV3IHN0b3JhZ2VfMS5TdG9yYWdlKCk7XG52YXIgdXNlckFQSUJhc2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdwbGF0Zm9ybS1hcGknKSArICcvYXV0aC91c2Vycyc7XG52YXIgdXNlckFQSUVuZHBvaW50cyA9IHtcbiAgICAnc2VsZic6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy9zZWxmJztcbiAgICB9LFxuICAgICdnZXQnOiBmdW5jdGlvbiAodXNlck1vZGVsKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvJyArIHVzZXJNb2RlbC5pZDtcbiAgICB9LFxuICAgICdyZW1vdmUnOiBmdW5jdGlvbiAodXNlck1vZGVsKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvJyArIHVzZXJNb2RlbC5pZDtcbiAgICB9LFxuICAgICdzYXZlJzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAncGFzc3dvcmRSZXNldCc6IGZ1bmN0aW9uICh1c2VyTW9kZWwpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy8nICsgdXNlck1vZGVsLmlkICsgJy9wYXNzd29yZC1yZXNldCc7XG4gICAgfVxufTtcbnZhciBVc2VyQ29udGV4dCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVXNlckNvbnRleHQoKSB7XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShVc2VyQ29udGV4dCwgXCJsYWJlbFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdpb25pY19pb191c2VyXycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgVXNlckNvbnRleHQuZGVsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdG9yYWdlLmRlbGV0ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCk7XG4gICAgfTtcbiAgICBVc2VyQ29udGV4dC5zdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKFVzZXJDb250ZXh0LmdldFJhd0RhdGEoKSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmVMZWdhY3lEYXRhKFVzZXJDb250ZXh0LmdldFJhd0RhdGEoKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFVzZXIuY3VycmVudCgpLmRhdGEuZGF0YS5fX2lvbmljX3VzZXJfbWlncmF0ZWQpIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwgKyAnX2xlZ2FjeScsIHsgJ19faW9uaWNfdXNlcl9taWdyYXRlZCc6IHRydWUgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCwgVXNlci5jdXJyZW50KCkpO1xuICAgIH07XG4gICAgVXNlckNvbnRleHQuc3RvcmVMZWdhY3lEYXRhID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKCFVc2VyQ29udGV4dC5nZXRSYXdMZWdhY3lEYXRhKCkpIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwgKyAnX2xlZ2FjeScsIGRhdGEpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyQ29udGV4dC5nZXRSYXdEYXRhID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgfTtcbiAgICBVc2VyQ29udGV4dC5nZXRSYXdMZWdhY3lEYXRhID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JykgfHwgZmFsc2U7XG4gICAgfTtcbiAgICBVc2VyQ29udGV4dC5sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHN0b3JhZ2UucmV0cmlldmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwpIHx8IGZhbHNlO1xuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmVMZWdhY3lEYXRhKGRhdGEpO1xuICAgICAgICAgICAgcmV0dXJuIFVzZXIuZnJvbUNvbnRleHQoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH07XG4gICAgcmV0dXJuIFVzZXJDb250ZXh0O1xufSgpKTtcbnZhciBVc2VyRGF0YSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVXNlckRhdGEoZGF0YSkge1xuICAgICAgICBpZiAoZGF0YSA9PT0gdm9pZCAwKSB7IGRhdGEgPSB7fTsgfVxuICAgICAgICB0aGlzLmRhdGEgPSB7fTtcbiAgICAgICAgaWYgKCh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBkYXRhO1xuICAgICAgICAgICAgdGhpcy5kZXNlcmlhbGl6ZXJEYXRhVHlwZXMoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBVc2VyRGF0YS5wcm90b3R5cGUuZGVzZXJpYWxpemVyRGF0YVR5cGVzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBmb3IgKHZhciB4IGluIHRoaXMuZGF0YSkge1xuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBhbiBvYmplY3QsIGxldCdzIGNoZWNrIGZvciBjdXN0b20gZGF0YSB0eXBlc1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLmRhdGFbeF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gd2UgaGF2ZSBhIGN1c3RvbSB0eXBlP1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGFbeF0uX19Jb25pY19EYXRhVHlwZVNjaGVtYSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmFtZSA9IHRoaXMuZGF0YVt4XS5fX0lvbmljX0RhdGFUeXBlU2NoZW1hO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWFwcGluZyA9IGRhdGFfdHlwZXNfMS5EYXRhVHlwZS5nZXRNYXBwaW5nKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXBwaW5nW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBoYXZlIGEgY3VzdG9tIHR5cGUgYW5kIGEgcmVnaXN0ZXJlZCBjbGFzcywgZ2l2ZSB0aGUgY3VzdG9tIGRhdGEgdHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZnJvbSBzdG9yYWdlXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFbeF0gPSBtYXBwaW5nW25hbWVdLmZyb21TdG9yYWdlKHRoaXMuZGF0YVt4XS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVzZXJEYXRhLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICB0aGlzLmRhdGFba2V5XSA9IHZhbHVlO1xuICAgIH07XG4gICAgVXNlckRhdGEucHJvdG90eXBlLnVuc2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhW2tleV07XG4gICAgfTtcbiAgICBVc2VyRGF0YS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YVtrZXldO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKGRlZmF1bHRWYWx1ZSA9PT0gMCB8fCBkZWZhdWx0VmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWUgfHwgbnVsbDtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIFVzZXJEYXRhO1xufSgpKTtcbmV4cG9ydHMuVXNlckRhdGEgPSBVc2VyRGF0YTtcbnZhciBVc2VyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBVc2VyKCkge1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBsb2dnZXJfMS5Mb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBVc2VyOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tEZWxldGUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZGlydHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZnJlc2ggPSB0cnVlO1xuICAgICAgICB0aGlzLl91bnNldCA9IHt9O1xuICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVXNlckRhdGEoKTtcbiAgICB9XG4gICAgVXNlci5wcm90b3R5cGUuaXNEaXJ0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RpcnR5O1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuaXNBbm9ueW1vdXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICByZXR1cm4gYXV0aF8xLkF1dGguaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgVXNlci5jdXJyZW50ID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgIEFwcFVzZXJDb250ZXh0ID0gdXNlcjtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlKCk7XG4gICAgICAgICAgICByZXR1cm4gQXBwVXNlckNvbnRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIUFwcFVzZXJDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSBVc2VyQ29udGV4dC5sb2FkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIUFwcFVzZXJDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSBuZXcgVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIEFwcFVzZXJDb250ZXh0O1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyLmZyb21Db250ZXh0ID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBuZXcgVXNlcigpO1xuICAgICAgICB1c2VyLmlkID0gZGF0YS5faWQ7XG4gICAgICAgIHVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShkYXRhLmRhdGEuZGF0YSk7XG4gICAgICAgIHVzZXIuZGV0YWlscyA9IGRhdGEuZGV0YWlscyB8fCB7fTtcbiAgICAgICAgdXNlci5fZnJlc2ggPSBkYXRhLl9mcmVzaDtcbiAgICAgICAgdXNlci5fZGlydHkgPSBkYXRhLl9kaXJ0eTtcbiAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgfTtcbiAgICBVc2VyLnNlbGYgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB0ZW1wVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIGlmICghdGVtcFVzZXIuX2Jsb2NrTG9hZCkge1xuICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IHRydWU7XG4gICAgICAgICAgICByZXF1ZXN0XzEucmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMuc2VsZigpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnbG9hZGVkIHVzZXInKTtcbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGN1c3RvbSBkYXRhXG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuaWQgPSByZXN1bHQucGF5bG9hZC5kYXRhLnV1aWQ7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShyZXN1bHQucGF5bG9hZC5kYXRhLmN1c3RvbSk7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGV0YWlscyA9IHJlc3VsdC5wYXlsb2FkLmRhdGEuZGV0YWlscztcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBVc2VyLmN1cnJlbnQodGVtcFVzZXIpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodGVtcFVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2EgbG9hZCBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgJyArIHRoaXMgKyAnLicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIFVzZXIubG9hZCA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgdGVtcFVzZXIgPSBuZXcgVXNlcigpO1xuICAgICAgICB0ZW1wVXNlci5pZCA9IGlkO1xuICAgICAgICBpZiAoIXRlbXBVc2VyLl9ibG9ja0xvYWQpIHtcbiAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSB0cnVlO1xuICAgICAgICAgICAgcmVxdWVzdF8xLnJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLmdldCh0ZW1wVXNlciksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdHRVQnLFxuICAgICAgICAgICAgICAgICdqc29uJzogdHJ1ZVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5pbmZvKCdsb2FkZWQgdXNlcicpO1xuICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgY3VzdG9tIGRhdGFcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5kYXRhID0gbmV3IFVzZXJEYXRhKHJlc3VsdC5wYXlsb2FkLmRhdGEuY3VzdG9tKTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5kZXRhaWxzID0gcmVzdWx0LnBheWxvYWQuZGF0YS5kZXRhaWxzO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9mcmVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodGVtcFVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2EgbG9hZCBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgJyArIHRoaXMgKyAnLicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmlzRnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mcmVzaDtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmlzVmFsaWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5nZXRBUElGb3JtYXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhcGlGb3JtYXQgPSB7fTtcbiAgICAgICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGV0YWlscykge1xuICAgICAgICAgICAgYXBpRm9ybWF0W2tleV0gPSB0aGlzLmRldGFpbHNba2V5XTtcbiAgICAgICAgfVxuICAgICAgICBhcGlGb3JtYXQuY3VzdG9tID0gdGhpcy5kYXRhLmRhdGE7XG4gICAgICAgIHJldHVybiBhcGlGb3JtYXQ7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5nZXRGb3JtYXQgPSBmdW5jdGlvbiAoZm9ybWF0KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGZvcm1hdHRlZCA9IG51bGw7XG4gICAgICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgICAgICBjYXNlICdhcGktc2F2ZSc6XG4gICAgICAgICAgICAgICAgZm9ybWF0dGVkID0gc2VsZi5nZXRBUElGb3JtYXQoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZm9ybWF0dGVkO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUubWlncmF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHJhd0RhdGEgPSBVc2VyQ29udGV4dC5nZXRSYXdMZWdhY3lEYXRhKCk7XG4gICAgICAgIGlmIChyYXdEYXRhLl9faW9uaWNfdXNlcl9taWdyYXRlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJhd0RhdGEpIHtcbiAgICAgICAgICAgIHZhciBjdXJyZW50VXNlciA9IElvbmljLlVzZXIuY3VycmVudCgpO1xuICAgICAgICAgICAgdmFyIHVzZXJEYXRhID0gbmV3IFVzZXJEYXRhKHJhd0RhdGEuZGF0YS5kYXRhKTtcbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiB1c2VyRGF0YS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFVzZXIuc2V0KGtleSwgdXNlckRhdGEuZGF0YVtrZXldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN1cnJlbnRVc2VyLnNldCgnX19pb25pY191c2VyX21pZ3JhdGVkJywgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmRlbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoc2VsZi5pc1ZhbGlkKCkpIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fYmxvY2tEZWxldGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVsZXRlKCk7XG4gICAgICAgICAgICAgICAgcmVxdWVzdF8xLnJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICAgICAndXJpJzogdXNlckFQSUVuZHBvaW50cy5yZW1vdmUodGhpcyksXG4gICAgICAgICAgICAgICAgICAgICdtZXRob2QnOiAnREVMRVRFJyxcbiAgICAgICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2RlbGV0ZWQgJyArIHNlbGYpO1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2EgZGVsZXRlIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciAnICsgdGhpcyArICcuJyk7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5fc3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzID09PSBVc2VyLmN1cnJlbnQoKSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmUoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuX2RlbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5kZWxldGUoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuc2F2ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrU2F2ZSkge1xuICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlbGYuX3N0b3JlKCk7XG4gICAgICAgICAgICByZXF1ZXN0XzEucmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMuc2F2ZSh0aGlzKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ1BBVENIJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHNlbGYuZ2V0Rm9ybWF0KCdhcGktc2F2ZScpXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9kaXJ0eSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmICghc2VsZi5pc0ZyZXNoKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fdW5zZXQgPSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2VsZi5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzYXZlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhIHNhdmUgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yICcgKyB0aGlzICsgJy4nKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5yZXNldFBhc3N3b3JkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHJlcXVlc3RfMS5yZXF1ZXN0KHtcbiAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnBhc3N3b3JkUmVzZXQodGhpcyksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncGFzc3dvcmQgcmVzZXQgZm9yIHVzZXInKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoVXNlci5wcm90b3R5cGUsIFwiaWRcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pZCB8fCBudWxsO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICB0aGlzLl9pZCA9IHY7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFVzZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJzxJb25pY1VzZXIgW1xcJycgKyB0aGlzLmlkICsgJ1xcJ10+JztcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl91bnNldFtrZXldO1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhLnNldChrZXksIHZhbHVlKTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhLmdldChrZXksIGRlZmF1bHRWYWx1ZSk7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS51bnNldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdGhpcy5fdW5zZXRba2V5XSA9IHRydWU7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEudW5zZXQoa2V5KTtcbiAgICB9O1xuICAgIHJldHVybiBVc2VyO1xufSgpKTtcbmV4cG9ydHMuVXNlciA9IFVzZXI7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBwcm9taXNlXzEgPSByZXF1aXJlKCcuLi9jb3JlL3Byb21pc2UnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgY29yZV8xID0gcmVxdWlyZSgnLi4vY29yZS9jb3JlJyk7XG52YXIgZXZlbnRzXzEgPSByZXF1aXJlKCcuLi9jb3JlL2V2ZW50cycpO1xudmFyIE5PX1BMVUdJTiA9ICdJT05JQ19ERVBMT1lfTUlTU0lOR19QTFVHSU4nO1xudmFyIElOSVRJQUxfREVMQVkgPSAxICogNSAqIDEwMDA7XG52YXIgV0FUQ0hfSU5URVJWQUwgPSAxICogNjAgKiAxMDAwO1xudmFyIERlcGxveSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRGVwbG95KCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIERlcGxveTonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9wbHVnaW4gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNSZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jaGFubmVsVGFnID0gJ3Byb2R1Y3Rpb24nO1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gbmV3IGV2ZW50c18xLkV2ZW50RW1pdHRlcigpO1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdpbml0Jyk7XG4gICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5pbml0aWFsaXplKCk7XG4gICAgICAgICAgICBzZWxmLl9pc1JlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIuZW1pdCgnaW9uaWNfZGVwbG95OnJlYWR5Jyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGZXRjaCB0aGUgRGVwbG95IFBsdWdpblxuICAgICAqXG4gICAgICogSWYgdGhlIHBsdWdpbiBoYXMgbm90IGJlZW4gc2V0IHlldCwgYXR0ZW1wdCB0byBmZXRjaCBpdCwgb3RoZXJ3aXNlIGxvZ1xuICAgICAqIGEgbWVzc2FnZS5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0lvbmljRGVwbG95fSBSZXR1cm5zIHRoZSBwbHVnaW4gb3IgZmFsc2VcbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLl9nZXRQbHVnaW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9wbHVnaW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wbHVnaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBJb25pY0RlcGxveSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3BsdWdpbiBpcyBub3QgaW5zdGFsbGVkIG9yIGhhcyBub3QgbG9hZGVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgaW9uaWMtcGx1Z2luLWRlcGxveWAgeWV0PycpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IElvbmljRGVwbG95O1xuICAgICAgICByZXR1cm4gSW9uaWNEZXBsb3k7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBJbml0aWFsaXplIHRoZSBEZXBsb3kgUGx1Z2luXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbml0KGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdwbGF0Zm9ybS1hcGknKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ2hlY2sgZm9yIHVwZGF0ZXNcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFdpbGwgcmVzb2x2ZSB3aXRoIHRydWUgaWYgYW4gdXBkYXRlIGlzIGF2YWlsYWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLiBBIHN0cmluZyBvclxuICAgICAqICAgZXJyb3Igd2lsbCBiZSBwYXNzZWQgdG8gcmVqZWN0KCkgaW4gdGhlIGV2ZW50IG9mIGEgZmFpbHVyZS5cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmNoZWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uY2hlY2soY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIHNlbGYuX2NoYW5uZWxUYWcsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQgPT09ICd0cnVlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYW4gdXBkYXRlIGlzIGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ25vIHVwZGF0ZXMgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignZW5jb3VudGVyZWQgYW4gZXJyb3Igd2hpbGUgY2hlY2tpbmcgZm9yIHVwZGF0ZXMnKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBEb3dubG9hZCBhbmQgYXZhaWxhYmxlIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGV4dHJhY3QoKVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSBwcm9taXNlIHdoaWNoIHdpbGwgcmVzb2x2ZSB3aXRoIHRydWUvZmFsc2Ugb3IgdXNlXG4gICAgICogICAgbm90aWZ5IHRvIHVwZGF0ZSB0aGUgZG93bmxvYWQgcHJvZ3Jlc3MuXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5kb3dubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRvd25sb2FkKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgIT09ICd0cnVlJyAmJiByZXN1bHQgIT09ICdmYWxzZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZG93bmxvYWQgY29tcGxldGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0ID09PSAndHJ1ZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRXh0cmFjdCB0aGUgbGFzdCBkb3dubG9hZGVkIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgY2FsbGVkIGFmdGVyIGEgZG93bmxvYWQoKSBzdWNjZXNzZnVsbHkgcmVzb2x2ZXMuXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHByb21pc2Ugd2hpY2ggd2lsbCByZXNvbHZlIHdpdGggdHJ1ZS9mYWxzZSBvciB1c2VcbiAgICAgKiAgICAgICAgICAgICAgICAgICBub3RpZnkgdG8gdXBkYXRlIHRoZSBleHRyYWN0aW9uIHByb2dyZXNzLlxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuZXh0cmFjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmV4dHJhY3QoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gJ2RvbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICd0cnVlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2V4dHJhY3Rpb24gY29tcGxldGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIExvYWQgdGhlIGxhdGVzdCBkZXBsb3llZCB2ZXJzaW9uXG4gICAgICogVGhpcyBpcyBvbmx5IG5lY2Vzc2FyeSB0byBjYWxsIGlmIHlvdSBoYXZlIG1hbnVhbGx5IGRvd25sb2FkZWQgYW5kIGV4dHJhY3RlZFxuICAgICAqIGFuIHVwZGF0ZSBhbmQgd2lzaCB0byByZWxvYWQgdGhlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95LiBUaGUgbGF0ZXN0IGRlcGxveVxuICAgICAqIHdpbGwgYXV0b21hdGljYWxseSBiZSBsb2FkZWQgd2hlbiB0aGUgYXBwIGlzIHN0YXJ0ZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLnJlZGlyZWN0KGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBXYXRjaCBjb25zdGFudGx5IGNoZWNrcyBmb3IgdXBkYXRlcywgYW5kIHRyaWdnZXJzIGFuXG4gICAgICogZXZlbnQgd2hlbiBvbmUgaXMgcmVhZHkuXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgV2F0Y2ggY29uZmlndXJhdGlvbiBvcHRpb25zXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gcmV0dXJucyBhIHByb21pc2UgdGhhdCB3aWxsIGdldCBhIG5vdGlmeSgpIGNhbGxiYWNrIHdoZW4gYW4gdXBkYXRlIGlzIGF2YWlsYWJsZVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUud2F0Y2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRzLmluaXRpYWxEZWxheSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG9wdHMuaW5pdGlhbERlbGF5ID0gSU5JVElBTF9ERUxBWTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG9wdHMuaW50ZXJ2YWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBvcHRzLmludGVydmFsID0gV0FUQ0hfSU5URVJWQUw7XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gY2hlY2tGb3JVcGRhdGVzKCkge1xuICAgICAgICAgICAgc2VsZi5jaGVjaygpLnRoZW4oZnVuY3Rpb24gKGhhc1VwZGF0ZSkge1xuICAgICAgICAgICAgICAgIGlmIChoYXNVcGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KGhhc1VwZGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3VuYWJsZSB0byBjaGVjayBmb3IgdXBkYXRlczogJyArIGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIENoZWNrIG91ciB0aW1lb3V0IHRvIG1ha2Ugc3VyZSBpdCB3YXNuJ3QgY2xlYXJlZCB3aGlsZSB3ZSB3ZXJlIHdhaXRpbmdcbiAgICAgICAgICAgIC8vIGZvciBhIHNlcnZlciByZXNwb25zZVxuICAgICAgICAgICAgaWYgKHRoaXMuX2NoZWNrVGltZW91dCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NoZWNrVGltZW91dCA9IHNldFRpbWVvdXQoY2hlY2tGb3JVcGRhdGVzLmJpbmQoc2VsZiksIG9wdHMuaW50ZXJ2YWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIENoZWNrIGFmdGVyIGFuIGluaXRpYWwgc2hvcnQgZGVwbGF5XG4gICAgICAgIHRoaXMuX2NoZWNrVGltZW91dCA9IHNldFRpbWVvdXQoY2hlY2tGb3JVcGRhdGVzLmJpbmQoc2VsZiksIG9wdHMuaW5pdGlhbERlbGF5KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBTdG9wIGF1dG9tYXRpY2FsbHkgbG9va2luZyBmb3IgdXBkYXRlc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS51bndhdGNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5fY2hlY2tUaW1lb3V0KTtcbiAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gbnVsbDtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEluZm9ybWF0aW9uIGFib3V0IHRoZSBjdXJyZW50IGRlcGxveVxuICAgICAqXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHJlc29sdmVyIHdpbGwgYmUgcGFzc2VkIGFuIG9iamVjdCB0aGF0IGhhcyBrZXkvdmFsdWVcbiAgICAgKiAgICBwYWlycyBwZXJ0YWluaW5nIHRvIHRoZSBjdXJyZW50bHkgZGVwbG95ZWQgdXBkYXRlLlxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuaW5mbyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmluZm8oY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogTGlzdCB0aGUgRGVwbG95IHZlcnNpb25zIHRoYXQgaGF2ZSBiZWVuIGluc3RhbGxlZCBvbiB0aGlzIGRldmljZVxuICAgICAqXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHJlc29sdmVyIHdpbGwgYmUgcGFzc2VkIGFuIGFycmF5IG9mIGRlcGxveSB1dWlkc1xuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuZ2V0VmVyc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5nZXRWZXJzaW9ucyhjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYW4gaW5zdGFsbGVkIGRlcGxveSBvbiB0aGlzIGRldmljZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHV1aWQgVGhlIGRlcGxveSB1dWlkIHlvdSB3aXNoIHRvIHJlbW92ZSBmcm9tIHRoZSBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBTdGFuZGFyZCByZXNvbHZlL3JlamVjdCByZXNvbHV0aW9uXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5kZWxldGVWZXJzaW9uID0gZnVuY3Rpb24gKHV1aWQpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRlbGV0ZVZlcnNpb24oY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIHV1aWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRmV0Y2hlcyB0aGUgbWV0YWRhdGEgZm9yIGEgZ2l2ZW4gZGVwbG95IHV1aWQuIElmIG5vIHV1aWQgaXMgZ2l2ZW4sIGl0IHdpbGwgYXR0ZW1wdFxuICAgICAqIHRvIGdyYWIgdGhlIG1ldGFkYXRhIGZvciB0aGUgbW9zdCByZWNlbnRseSBrbm93biB1cGRhdGUgdmVyc2lvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB1dWlkIFRoZSBkZXBsb3kgdXVpZCB5b3Ugd2lzaCB0byBncmFiIG1ldGFkYXRhIGZvciwgY2FuIGJlIGxlZnQgYmxhbmsgdG8gZ3JhYiBsYXRlc3Qga25vd24gdXBkYXRlIG1ldGFkYXRhXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gU3RhbmRhcmQgcmVzb2x2ZS9yZWplY3QgcmVzb2x1dGlvblxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuZ2V0TWV0YWRhdGEgPSBmdW5jdGlvbiAodXVpZCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uZ2V0TWV0YWRhdGEoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIHV1aWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQubWV0YWRhdGEpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBkZXBsb3kgY2hhbm5lbCB0aGF0IHNob3VsZCBiZSBjaGVja2VkIGZvciB1cGRhdHNlXG4gICAgICogU2VlIGh0dHA6Ly9kb2NzLmlvbmljLmlvL2RvY3MvZGVwbG95LWNoYW5uZWxzIGZvciBtb3JlIGluZm9ybWF0aW9uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY2hhbm5lbFRhZyBUaGUgY2hhbm5lbCB0YWcgdG8gdXNlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLnNldENoYW5uZWwgPSBmdW5jdGlvbiAoY2hhbm5lbFRhZykge1xuICAgICAgICB0aGlzLl9jaGFubmVsVGFnID0gY2hhbm5lbFRhZztcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFVwZGF0ZSBhcHAgd2l0aCB0aGUgbGF0ZXN0IGRlcGxveVxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gZGVmZXJMb2FkIERlZmVyIGxvYWRpbmcgdGhlIGFwcGxpZWQgdXBkYXRlIGFmdGVyIHRoZSBpbnN0YWxsYXRpb25cbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBBIHByb21pc2UgcmVzdWx0XG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAoZGVmZXJMb2FkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVyTG9hZGluZyA9IGZhbHNlO1xuICAgICAgICBpZiAodHlwZW9mIGRlZmVyTG9hZCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGRlZmVyTG9hZGluZyA9IGRlZmVyTG9hZDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHVwZGF0ZXNcbiAgICAgICAgICAgICAgICBzZWxmLmNoZWNrKCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZXJlIGFyZSB1cGRhdGVzLCBkb3dubG9hZCB0aGVtXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZG93bmxvYWRQcm9ncmVzcyA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmRvd25sb2FkKCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdkb3dubG9hZCBlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmV4dHJhY3QoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCgnZXh0cmFjdGlvbiBlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZGVmZXJMb2FkaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLnJlZGlyZWN0KGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAodXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwcm9ncmVzcyA9IGRvd25sb2FkUHJvZ3Jlc3MgKyAodXBkYXRlIC8gMik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShwcm9ncmVzcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvd25sb2FkUHJvZ3Jlc3MgPSAodXBkYXRlIC8gMik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KGRvd25sb2FkUHJvZ3Jlc3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZpcmUgYSBjYWxsYmFjayB3aGVuIGRlcGxveSBpcyByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiBkZXBsb3kgaGFzIGFscmVhZHkgYmVjb21lIGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLm9uUmVhZHkgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodGhpcy5faXNSZWFkeSkge1xuICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLl9lbWl0dGVyLm9uKCdpb25pY19kZXBsb3k6cmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIERlcGxveTtcbn0oKSk7XG5leHBvcnRzLkRlcGxveSA9IERlcGxveTtcbiIsIlwidXNlIHN0cmljdFwiO1xuZnVuY3Rpb24gX19leHBvcnQobSkge1xuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKCFleHBvcnRzLmhhc093blByb3BlcnR5KHApKSBleHBvcnRzW3BdID0gbVtwXTtcbn1cbl9fZXhwb3J0KHJlcXVpcmUoJy4vZGVwbG95JykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9hbmFseXRpY3MvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2F1dGgvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2NvcmUvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2RlcGxveS9pbmRleCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vaW5zaWdodHMvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3V0aWwvaW5kZXgnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2luc2lnaHRzJykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgbG9nZ2VyXzEgPSByZXF1aXJlKCcuLi9jb3JlL2xvZ2dlcicpO1xudmFyIFN0YXQgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFN0YXQoYXBwSWQsIHN0YXQsIHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7IHZhbHVlID0gMTsgfVxuICAgICAgICB0aGlzLmFwcElkID0gYXBwSWQ7XG4gICAgICAgIHRoaXMuc3RhdCA9IHN0YXQ7XG4gICAgICAgIHRoaXMudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLnN0YXQgPSBzdGF0O1xuICAgICAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIHRoaXMuY3JlYXRlZCA9IG5ldyBEYXRlKCk7XG4gICAgfVxuICAgIFN0YXQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFwcF9pZDogdGhpcy5hcHBJZCxcbiAgICAgICAgICAgIHN0YXQ6IHRoaXMuc3RhdCxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnZhbHVlLFxuICAgICAgICAgICAgY3JlYXRlZDogdGhpcy5jcmVhdGVkLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgfTtcbiAgICByZXR1cm4gU3RhdDtcbn0oKSk7XG52YXIgSW5zaWdodHMgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEluc2lnaHRzKGFwcElkKSB7XG4gICAgICAgIHRoaXMuYXBwSWQgPSBhcHBJZDtcbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLmJhdGNoID0gW107XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIEluc2lnaHRzOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICB9XG4gICAgSW5zaWdodHMucHJvdG90eXBlLnRyYWNrID0gZnVuY3Rpb24gKHN0YXQsIHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7IHZhbHVlID0gMTsgfVxuICAgICAgICB0aGlzLmJhdGNoLnB1c2gobmV3IFN0YXQodGhpcy5hcHBJZCwgc3RhdCwgdmFsdWUpKTtcbiAgICAgICAgdGhpcy5zdWJtaXQoKTtcbiAgICB9O1xuICAgIEluc2lnaHRzLnByb3RvdHlwZS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmJhdGNoLmxlbmd0aCA+PSBJbnNpZ2h0cy5TVUJNSVRfQ09VTlQpIHtcbiAgICAgICAgfVxuICAgIH07XG4gICAgSW5zaWdodHMuU1VCTUlUX0NPVU5UID0gMTAwO1xuICAgIHJldHVybiBJbnNpZ2h0cztcbn0oKSk7XG5leHBvcnRzLkluc2lnaHRzID0gSW5zaWdodHM7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gtZGV2JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9wdXNoLW1lc3NhZ2UnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gtdG9rZW4nKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciByZXF1ZXN0XzEgPSByZXF1aXJlKCcuLi9jb3JlL3JlcXVlc3QnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgdXRpbF8xID0gcmVxdWlyZSgnLi4vdXRpbC91dGlsJyk7XG52YXIgcHVzaF90b2tlbl8xID0gcmVxdWlyZSgnLi9wdXNoLXRva2VuJyk7XG4vKipcbiAqIFB1c2hEZXYgU2VydmljZVxuICpcbiAqIFRoaXMgc2VydmljZSBhY3RzIGFzIGEgbW9jayBwdXNoIHNlcnZpY2UgdGhhdCBpcyBpbnRlbmRlZCB0byBiZSB1c2VkIHByZS1zZXR1cCBvZlxuICogR0NNL0FQTlMgaW4gYW4gSW9uaWMuaW8gcHJvamVjdC5cbiAqXG4gKiBIb3cgaXQgd29ya3M6XG4gKlxuICogICBXaGVuIHJlZ2lzdGVyKCkgaXMgY2FsbGVkLCB0aGlzIHNlcnZpY2UgaXMgdXNlZCB0byBnZW5lcmF0ZSBhIHJhbmRvbVxuICogICBkZXZlbG9wbWVudCBkZXZpY2UgdG9rZW4uIFRoaXMgdG9rZW4gaXMgbm90IHZhbGlkIGZvciBhbnkgc2VydmljZSBvdXRzaWRlIG9mXG4gKiAgIElvbmljIFB1c2ggd2l0aCBgZGV2X3B1c2hgIHNldCB0byB0cnVlLiBUaGVzZSB0b2tlbnMgZG8gbm90IGxhc3QgbG9uZyBhbmQgYXJlIG5vdFxuICogICBlbGlnaWJsZSBmb3IgdXNlIGluIGEgcHJvZHVjdGlvbiBhcHAuXG4gKlxuICogICBUaGUgZGV2aWNlIHdpbGwgdGhlbiBwZXJpb2RpY2FsbHkgY2hlY2sgdGhlIFB1c2ggc2VydmljZSBmb3IgcHVzaCBub3RpZmljYXRpb25zIHNlbnRcbiAqICAgdG8gb3VyIGRldmVsb3BtZW50IHRva2VuIC0tIHNvIHVubGlrZSBhIHR5cGljYWwgXCJwdXNoXCIgdXBkYXRlLCB0aGlzIGFjdHVhbGx5IHVzZXNcbiAqICAgXCJwb2xsaW5nXCIgdG8gZmluZCBuZXcgbm90aWZpY2F0aW9ucy4gVGhpcyBtZWFucyB5b3UgKk1VU1QqIGhhdmUgdGhlIGFwcGxpY2F0aW9uIG9wZW5cbiAqICAgYW5kIGluIHRoZSBmb3JlZ3JvdW5kIHRvIHJldHJlaXZlIG1lc3NzYWdlcy5cbiAqXG4gKiAgIFRoZSBjYWxsYmFja3MgcHJvdmlkZWQgaW4geW91ciBpbml0KCkgd2lsbCBzdGlsbCBiZSB0cmlnZ2VyZWQgYXMgbm9ybWFsLFxuICogICBidXQgd2l0aCB0aGVzZSBub3RhYmxlIGV4Y2VwdGlvbnM6XG4gKlxuICogICAgICAtIFRoZXJlIGlzIG5vIHBheWxvYWQgZGF0YSBhdmFpbGFibGUgd2l0aCBtZXNzYWdlc1xuICogICAgICAtIEFuIGFsZXJ0KCkgaXMgY2FsbGVkIHdoZW4gYSBub3RpZmljYXRpb24gaXMgcmVjZWl2ZWQgdW5sZXNzcyB5b3UgcmV0dXJuIGZhbHNlXG4gKiAgICAgICAgaW4geW91ciAnb25Ob3RpZmljYXRpb24nIGNhbGxiYWNrLlxuICpcbiAqL1xudmFyIFB1c2hEZXZTZXJ2aWNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBQdXNoRGV2U2VydmljZSgpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgUHVzaCAoZGV2KTonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9zZXJ2aWNlSG9zdCA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9wdXNoJztcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl93YXRjaCA9IG51bGw7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGEgZGV2ZWxvcG1lbnQgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gZGV2ZWxvcG1lbnQgZGV2aWNlIHRva2VuXG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmdldERldlRva2VuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdG9rZW4gPSB1dGlsXzEuZ2VuZXJhdGVVVUlEKCk7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gJ0RFVi0nICsgdG9rZW47XG4gICAgICAgIHJldHVybiB0aGlzLl90b2tlbjtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyBhIGRldmVsb3BtZW50IHRva2VuIHdpdGggdGhlIElvbmljIFB1c2ggc2VydmljZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtJb25pY1B1c2hTZXJ2aWNlfSBpb25pY1B1c2ggSW5zdGFudGlhdGVkIFB1c2ggU2VydmljZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFJlZ2lzdHJhdGlvbiBDYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmluaXQgPSBmdW5jdGlvbiAoaW9uaWNQdXNoLCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9wdXNoID0gaW9uaWNQdXNoO1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gdGhpcy5fcHVzaC5fZW1pdHRlcjtcbiAgICAgICAgdmFyIHRva2VuID0gdGhpcy5fdG9rZW47XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmdldERldlRva2VuKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICd1cmknOiB0aGlzLl9zZXJ2aWNlSG9zdCArICcvZGV2ZWxvcG1lbnQnLFxuICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgJ3Rva2VuJzogdG9rZW5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmVxdWVzdF8xLnJlcXVlc3QocmVxdWVzdE9wdGlvbnMpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB7ICdyZWdpc3RyYXRpb25JZCc6IHRva2VuIH07XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdyZWdpc3RlcmVkIHdpdGggZGV2ZWxvcG1lbnQgcHVzaCBzZXJ2aWNlOiAnICsgdG9rZW4pO1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5lbWl0KCdpb25pY19wdXNoOnRva2VuJywgZGF0YSk7XG4gICAgICAgICAgICBpZiAoKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhuZXcgcHVzaF90b2tlbl8xLlB1c2hUb2tlbihzZWxmLl90b2tlbikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZi53YXRjaCgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdlcnJvciBjb25uZWN0aW5nIGRldmVsb3BtZW50IHB1c2ggc2VydmljZTogJyArIGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHB1c2ggc2VydmljZSBmb3Igbm90aWZpY2F0aW9ucyB0aGF0IHRhcmdldCB0aGUgY3VycmVudCBkZXZlbG9wbWVudCB0b2tlblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmNoZWNrRm9yTm90aWZpY2F0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl90b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgJ21ldGhvZCc6ICdHRVQnLFxuICAgICAgICAgICAgJ3VyaSc6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9kZXZlbG9wbWVudD90b2tlbj0nICsgc2VsZi5fdG9rZW4sXG4gICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgfTtcbiAgICAgICAgcmVxdWVzdF8xLnJlcXVlc3QocmVxdWVzdE9wdGlvbnMpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLmRhdGEubWVzc2FnZSkge1xuICAgICAgICAgICAgICAgIHZhciBtZXNzYWdlID0ge1xuICAgICAgICAgICAgICAgICAgICAnbWVzc2FnZSc6IHJlc3VsdC5wYXlsb2FkLmRhdGEubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgJ3RpdGxlJzogJ0RFVkVMT1BNRU5UIFBVU0gnXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci53YXJuKCdJb25pYyBQdXNoOiBEZXZlbG9wbWVudCBQdXNoIHJlY2VpdmVkLiBEZXZlbG9wbWVudCBwdXNoZXMgd2lsbCBub3QgY29udGFpbiBwYXlsb2FkIGRhdGEuJyk7XG4gICAgICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5lbWl0KCdpb25pY19wdXNoOm5vdGlmaWNhdGlvbicsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gY2hlY2sgZm9yIGRldmVsb3BtZW50IHB1c2hlczogJyArIGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBLaWNrcyBvZmYgdGhlIFwicG9sbGluZ1wiIG9mIHRoZSBJb25pYyBQdXNoIHNlcnZpY2UgZm9yIG5ldyBwdXNoIG5vdGlmaWNhdGlvbnNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2hEZXZTZXJ2aWNlLnByb3RvdHlwZS53YXRjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBkZXYgcHVzaGVzIGV2ZXJ5IDUgc2Vjb25kc1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCd3YXRjaGluZyBmb3IgbmV3IG5vdGlmaWNhdGlvbnMnKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuX3dhdGNoKSB7XG4gICAgICAgICAgICB0aGlzLl93YXRjaCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgc2VsZi5jaGVja0Zvck5vdGlmaWNhdGlvbnMoKTsgfSwgNTAwMCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFB1dHMgdGhlIFwicG9sbGluZ1wiIGZvciBuZXcgbm90aWZpY2F0aW9ucyBvbiBob2xkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmhhbHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl93YXRjaCkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl93YXRjaCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBQdXNoRGV2U2VydmljZTtcbn0oKSk7XG5leHBvcnRzLlB1c2hEZXZTZXJ2aWNlID0gUHVzaERldlNlcnZpY2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBQdXNoTWVzc2FnZUFwcFN0YXR1cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUHVzaE1lc3NhZ2VBcHBTdGF0dXMoKSB7XG4gICAgICAgIHRoaXMuYXNsZWVwID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY2xvc2VkID0gZmFsc2U7XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQdXNoTWVzc2FnZUFwcFN0YXR1cy5wcm90b3R5cGUsIFwid2FzQXNsZWVwXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hc2xlZXA7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQdXNoTWVzc2FnZUFwcFN0YXR1cy5wcm90b3R5cGUsIFwid2FzQ2xvc2VkXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jbG9zZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIHJldHVybiBQdXNoTWVzc2FnZUFwcFN0YXR1cztcbn0oKSk7XG5leHBvcnRzLlB1c2hNZXNzYWdlQXBwU3RhdHVzID0gUHVzaE1lc3NhZ2VBcHBTdGF0dXM7XG52YXIgUHVzaE1lc3NhZ2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFB1c2hNZXNzYWdlKHJhdykge1xuICAgICAgICB0aGlzLl9yYXcgPSByYXcgfHwge307XG4gICAgICAgIGlmICghdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhKSB7XG4gICAgICAgICAgICAvLyB0aGlzIHNob3VsZCBvbmx5IGhpdCBpZiB3ZSBhcmUgc2VydmluZyB1cCBhIGRldmVsb3BtZW50IHB1c2hcbiAgICAgICAgICAgIHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YSA9IHtcbiAgICAgICAgICAgICAgICAnY29sZHN0YXJ0JzogZmFsc2UsXG4gICAgICAgICAgICAgICAgJ2ZvcmVncm91bmQnOiB0cnVlXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3BheWxvYWQgPSBudWxsO1xuICAgICAgICB0aGlzLmFwcCA9IG51bGw7XG4gICAgICAgIHRoaXMudGV4dCA9IG51bGw7XG4gICAgICAgIHRoaXMudGl0bGUgPSBudWxsO1xuICAgICAgICB0aGlzLmNvdW50ID0gbnVsbDtcbiAgICAgICAgdGhpcy5zb3VuZCA9IG51bGw7XG4gICAgICAgIHRoaXMuaW1hZ2UgPSBudWxsO1xuICAgIH1cbiAgICBQdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTiA9IGZ1bmN0aW9uIChqc29uKSB7XG4gICAgICAgIHZhciBtZXNzYWdlID0gbmV3IFB1c2hNZXNzYWdlKGpzb24pO1xuICAgICAgICBtZXNzYWdlLnByb2Nlc3NSYXcoKTtcbiAgICAgICAgcmV0dXJuIG1lc3NhZ2U7XG4gICAgfTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUHVzaE1lc3NhZ2UucHJvdG90eXBlLCBcInBheWxvYWRcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wYXlsb2FkIHx8IHt9O1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBQdXNoTWVzc2FnZS5wcm90b3R5cGUucHJvY2Vzc1JhdyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy50ZXh0ID0gdGhpcy5fcmF3Lm1lc3NhZ2UgfHwgbnVsbDtcbiAgICAgICAgdGhpcy50aXRsZSA9IHRoaXMuX3Jhdy50aXRsZSB8fCBudWxsO1xuICAgICAgICB0aGlzLmNvdW50ID0gdGhpcy5fcmF3LmNvdW50IHx8IG51bGw7XG4gICAgICAgIHRoaXMuc291bmQgPSB0aGlzLl9yYXcuc291bmQgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuX3Jhdy5pbWFnZSB8fCBudWxsO1xuICAgICAgICB0aGlzLmFwcCA9IG5ldyBQdXNoTWVzc2FnZUFwcFN0YXR1cygpO1xuICAgICAgICBpZiAoIXRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5mb3JlZ3JvdW5kKSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5hc2xlZXAgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEuY29sZHN0YXJ0KSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5jbG9zZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEucGF5bG9hZCkge1xuICAgICAgICAgICAgdGhpcy5fcGF5bG9hZCA9IHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5wYXlsb2FkO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBQdXNoTWVzc2FnZS5wcm90b3R5cGUuZ2V0UmF3VmVyc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JhdztcbiAgICB9O1xuICAgIFB1c2hNZXNzYWdlLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICc8UHVzaE1lc3NhZ2UgW1xcJycgKyB0aGlzLnRpdGxlICsgJ1xcJ10+JztcbiAgICB9O1xuICAgIHJldHVybiBQdXNoTWVzc2FnZTtcbn0oKSk7XG5leHBvcnRzLlB1c2hNZXNzYWdlID0gUHVzaE1lc3NhZ2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBQdXNoVG9rZW4gPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFB1c2hUb2tlbih0b2tlbikge1xuICAgICAgICB0aGlzLnRva2VuID0gdG9rZW47XG4gICAgICAgIHRoaXMudG9rZW4gPSB0b2tlbjtcbiAgICB9XG4gICAgUHVzaFRva2VuLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFwiPFB1c2hUb2tlbiBbXCIgKyB0aGlzLnRva2VuICsgXCJdPlwiO1xuICAgIH07XG4gICAgcmV0dXJuIFB1c2hUb2tlbjtcbn0oKSk7XG5leHBvcnRzLlB1c2hUb2tlbiA9IFB1c2hUb2tlbjtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGFwcF8xID0gcmVxdWlyZSgnLi4vY29yZS9hcHAnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgZXZlbnRzXzEgPSByZXF1aXJlKCcuLi9jb3JlL2V2ZW50cycpO1xudmFyIHJlcXVlc3RfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcmVxdWVzdCcpO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIHVzZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvdXNlcicpO1xudmFyIHB1c2hfdG9rZW5fMSA9IHJlcXVpcmUoJy4vcHVzaC10b2tlbicpO1xudmFyIHB1c2hfbWVzc2FnZV8xID0gcmVxdWlyZSgnLi9wdXNoLW1lc3NhZ2UnKTtcbnZhciBwdXNoX2Rldl8xID0gcmVxdWlyZSgnLi9wdXNoLWRldicpO1xudmFyIERFRkVSX0lOSVQgPSAnREVGRVJfSU5JVCc7XG52YXIgcHVzaEFQSUJhc2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdwbGF0Zm9ybS1hcGknKSArICcvcHVzaCc7XG52YXIgcHVzaEFQSUVuZHBvaW50cyA9IHtcbiAgICAnc2F2ZVRva2VuJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gcHVzaEFQSUJhc2UgKyAnL3Rva2Vucyc7XG4gICAgfSxcbiAgICAnaW52YWxpZGF0ZVRva2VuJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gcHVzaEFQSUJhc2UgKyAnL3Rva2Vucy9pbnZhbGlkYXRlJztcbiAgICB9XG59O1xudmFyIFB1c2ggPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFB1c2goY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgUHVzaDonXG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgYXBwID0gbmV3IGFwcF8xLkFwcChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBpX2tleScpKTtcbiAgICAgICAgYXBwLmRldlB1c2ggPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdkZXZfcHVzaCcpO1xuICAgICAgICBhcHAuZ2NtS2V5ID0gY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnZ2NtX2tleScpO1xuICAgICAgICAvLyBDaGVjayBmb3IgdGhlIHJlcXVpcmVkIHZhbHVlcyB0byB1c2UgdGhpcyBzZXJ2aWNlXG4gICAgICAgIGlmICghYXBwLmlkIHx8ICFhcHAuYXBpS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignbm8gYXBwX2lkIGZvdW5kLiAoaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9pby1pbnN0YWxsKScpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmlzQW5kcm9pZERldmljZSgpICYmICFhcHAuZGV2UHVzaCAmJiAhYXBwLmdjbUtleSkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ0dDTSBwcm9qZWN0IG51bWJlciBub3QgZm91bmQgKGh0dHA6Ly9kb2NzLmlvbmljLmlvL2RvY3MvcHVzaC1hbmRyb2lkLXNldHVwKScpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnJlZ2lzdGVyQ2FsbGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbkNhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgdGhpcy5lcnJvckNhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgdGhpcy5fbm90aWZpY2F0aW9uID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2RlYnVnID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdG9rZW5SZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9yZWdpc3RlcmVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgZXZlbnRzXzEuRXZlbnRFbWl0dGVyKCk7XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IG51bGw7XG4gICAgICAgIGlmIChjb25maWcgIT09IERFRkVSX0lOSVQpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHNlbGYuaW5pdChjb25maWcpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFB1c2gucHJvdG90eXBlLCBcInRva2VuXCIsIHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgICB2YXIgc3RvcmFnZSA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBwdXNoX3Rva2VuXzEuUHVzaFRva2VuKSB7XG4gICAgICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdCgnaW9uaWNfaW9fcHVzaF90b2tlbicsIHsgJ3Rva2VuJzogdmFsLnRva2VuIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fdG9rZW4gPSB2YWw7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFB1c2gucHJvdG90eXBlLmdldFN0b3JhZ2VUb2tlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHN0b3JhZ2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5nZXRTdG9yYWdlKCk7XG4gICAgICAgIHZhciB0b2tlbiA9IHN0b3JhZ2UucmV0cmlldmVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nKTtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4odG9rZW4udG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuY2xlYXJTdG9yYWdlVG9rZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gY29yZV8xLklvbmljUGxhdGZvcm0uZ2V0U3RvcmFnZSgpO1xuICAgICAgICBzdG9yYWdlLmRlbGV0ZU9iamVjdCgnaW9uaWNfaW9fcHVzaF90b2tlbicpO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogSW5pdCBtZXRob2QgdG8gc2V0dXAgcHVzaCBiZWhhdmlvci9vcHRpb25zXG4gICAgICpcbiAgICAgKiBUaGUgY29uZmlnIHN1cHBvcnRzIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICAgKiAgIC0gZGVidWcge0Jvb2xlYW59IEVuYWJsZXMgc29tZSBleHRyYSBsb2dnaW5nIGFzIHdlbGwgYXMgc29tZSBkZWZhdWx0IGNhbGxiYWNrIGhhbmRsZXJzXG4gICAgICogICAtIG9uTm90aWZpY2F0aW9uIHtGdW5jdGlvbn0gQ2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBpcyBwYXNzZWQgdGhlIG5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiAgIC0gb25SZWdpc3RlciB7RnVuY3Rpb259IENhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgaXMgcGFzc2VkIHRoZSByZWdpc3RyYXRpb24gb2JqZWN0XG4gICAgICogICAtIG9uRXJyb3Ige0Z1bmN0aW9ufSBDYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHBhc3NlZCB0aGUgZXJyb3Igb2JqZWN0XG4gICAgICogICAtIHBsdWdpbkNvbmZpZyB7T2JqZWN0fSBQbHVnaW4gY29uZmlndXJhdGlvbjogaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwL3Bob25lZ2FwLXBsdWdpbi1wdXNoXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gY29uZmlnIENvbmZpZ3VyYXRpb24gb2JqZWN0XG4gICAgICogQHJldHVybiB7UHVzaH0gcmV0dXJucyB0aGUgY2FsbGVkIFB1c2ggaW5zdGFudGlhdGlvblxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLmluaXQgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2dldFB1c2hQbHVnaW4oKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb25maWcgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25maWcgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGNvbmZpZyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdpbml0KCkgcmVxdWlyZXMgYSB2YWxpZCBjb25maWcgb2JqZWN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnKSB7XG4gICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnID0ge307XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmlzQW5kcm9pZERldmljZSgpKSB7XG4gICAgICAgICAgICAvLyBpbmplY3QgZ2NtIGtleSBmb3IgUHVzaFBsdWdpblxuICAgICAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQpIHtcbiAgICAgICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQgPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghY29uZmlnLnBsdWdpbkNvbmZpZy5hbmRyb2lkLnNlbmRlcklkKSB7XG4gICAgICAgICAgICAgICAgY29uZmlnLnBsdWdpbkNvbmZpZy5hbmRyb2lkLnNlbmRlcklEID0gc2VsZi5hcHAuZ2NtS2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIFN0b3JlIENhbGxiYWNrc1xuICAgICAgICBpZiAoY29uZmlnLm9uUmVnaXN0ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0UmVnaXN0ZXJDYWxsYmFjayhjb25maWcub25SZWdpc3Rlcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5vbk5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5zZXROb3RpZmljYXRpb25DYWxsYmFjayhjb25maWcub25Ob3RpZmljYXRpb24pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcub25FcnJvcikge1xuICAgICAgICAgICAgdGhpcy5zZXRFcnJvckNhbGxiYWNrKGNvbmZpZy5vbkVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoJ2lvbmljX3B1c2g6cmVhZHknLCB7ICdjb25maWcnOiB0aGlzLl9jb25maWcgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuc2F2ZVRva2VuID0gZnVuY3Rpb24gKHRva2VuLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICBpZiAodG9rZW4udG9rZW4pIHtcbiAgICAgICAgICAgIHRva2VuID0gdG9rZW4udG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHRva2VuRGF0YSA9IHtcbiAgICAgICAgICAgICd0b2tlbic6IHRva2VuLFxuICAgICAgICAgICAgJ2FwcF9pZCc6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpXG4gICAgICAgIH07XG4gICAgICAgIGlmICghb3B0cy5pZ25vcmVfdXNlcikge1xuICAgICAgICAgICAgdmFyIHVzZXIgPSB1c2VyXzEuVXNlci5jdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAodXNlci5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgICAgIHRva2VuRGF0YS51c2VyX2lkID0gdXNlci5pZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrU2F2ZVRva2VuKSB7XG4gICAgICAgICAgICByZXF1ZXN0XzEucmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHB1c2hBUElFbmRwb2ludHMuc2F2ZVRva2VuKCksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRva2VuRGF0YVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzYXZlZCBwdXNoIHRva2VuOiAnICsgdG9rZW4pO1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbkRhdGEudXNlcl9pZCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhZGRlZCBwdXNoIHRva2VuIHRvIHVzZXI6ICcgKyB0b2tlbkRhdGEudXNlcl9pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZVRva2VuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2EgdG9rZW4gc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy4nKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIGRldmljZSB3aXRoIEdDTS9BUE5TIHRvIGdldCBhIGRldmljZSB0b2tlblxuICAgICAqIEZpcmVzIG9mZiB0aGUgJ29uUmVnaXN0ZXInIGNhbGxiYWNrIGlmIG9uZSBoYXMgYmVlbiBwcm92aWRlZCBpbiB0aGUgaW5pdCgpIGNvbmZpZ1xuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIEZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5yZWdpc3RlciA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdyZWdpc3RlcicpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9ibG9ja1JlZ2lzdHJhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYW5vdGhlciByZWdpc3RyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy4nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IHRydWU7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5hcHAuZGV2UHVzaCkge1xuICAgICAgICAgICAgICAgIHZhciBJb25pY0RldlB1c2ggPSBuZXcgcHVzaF9kZXZfMS5QdXNoRGV2U2VydmljZSgpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2RlYnVnQ2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9jYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIElvbmljRGV2UHVzaC5pbml0KHNlbGYsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYuX3Rva2VuUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luID0gc2VsZi5fZ2V0UHVzaFBsdWdpbigpLmluaXQoc2VsZi5fY29uZmlnLnBsdWdpbkNvbmZpZyk7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLm9uKCdyZWdpc3RyYXRpb24nLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX3Rva2VuUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYuX3Rva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHNlbGYuX2RlYnVnQ2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9jYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZi5fcmVnaXN0ZXJlZCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogSW52YWxpZGF0ZSB0aGUgY3VycmVudCBHQ00vQVBOUyB0b2tlblxuICAgICAqXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gdGhlIHVucmVnaXN0ZXIgcmVzdWx0XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUudW5yZWdpc3RlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgcGxhdGZvcm0gPSBudWxsO1xuICAgICAgICBpZiAoY29yZV8xLklvbmljUGxhdGZvcm0uaXNBbmRyb2lkRGV2aWNlKCkpIHtcbiAgICAgICAgICAgIHBsYXRmb3JtID0gJ2FuZHJvaWQnO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmlzSU9TRGV2aWNlKCkpIHtcbiAgICAgICAgICAgIHBsYXRmb3JtID0gJ2lvcyc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFwbGF0Zm9ybSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdDb3VsZCBub3QgZGV0ZWN0IHRoZSBwbGF0Zm9ybSwgYXJlIHlvdSBvbiBhIGRldmljZT8nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrVW5yZWdpc3Rlcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3BsdWdpbikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi51bnJlZ2lzdGVyKGZ1bmN0aW9uICgpIHsgfSwgZnVuY3Rpb24gKCkgeyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcXVlc3RfMS5yZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogcHVzaEFQSUVuZHBvaW50cy5pbnZhbGlkYXRlVG9rZW4oKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzoge1xuICAgICAgICAgICAgICAgICAgICAncGxhdGZvcm0nOiBwbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICAgICAgJ3Rva2VuJzogc2VsZi5nZXRTdG9yYWdlVG9rZW4oKS50b2tlblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrVW5yZWdpc3RlciA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3VucmVnaXN0ZXJlZCBwdXNoIHRva2VuOiAnICsgc2VsZi5nZXRTdG9yYWdlVG9rZW4oKS50b2tlbik7XG4gICAgICAgICAgICAgICAgc2VsZi5jbGVhclN0b3JhZ2VUb2tlbigpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrVW5yZWdpc3RlciA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhbiB1bnJlZ2lzdGVyIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzLicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENvbnZlbmllbmNlIG1ldGhvZCB0byBncmFiIHRoZSBwYXlsb2FkIG9iamVjdCBmcm9tIGEgbm90aWZpY2F0aW9uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1B1c2hOb3RpZmljYXRpb259IG5vdGlmaWNhdGlvbiBQdXNoIE5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiBAcmV0dXJuIHtvYmplY3R9IFBheWxvYWQgb2JqZWN0IG9yIGFuIGVtcHR5IG9iamVjdFxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLmdldFBheWxvYWQgPSBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHJldHVybiBub3RpZmljYXRpb24ucGF5bG9hZDtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFNldCB0aGUgcmVnaXN0cmF0aW9uIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBSZWdpc3RyYXRpb24gY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnNldFJlZ2lzdGVyQ2FsbGJhY2sgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0UmVnaXN0ZXJDYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJlZ2lzdGVyQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIG5vdGlmaWNhdGlvbiBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgTm90aWZpY2F0aW9uIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gdHJ1ZSBpZiBzZXQgY29ycmVjdGx5LCBvdGhlcndpc2UgZmFsc2VcbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5zZXROb3RpZmljYXRpb25DYWxsYmFjayA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXROb3RpZmljYXRpb25DYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbkNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBlcnJvciBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgRXJyb3IgY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnNldEVycm9yQ2FsbGJhY2sgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0RXJyb3JDYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVycm9yQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fZGVidWdSZWdpc3RyYXRpb25DYWxsYmFjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhkYXRhKSB7XG4gICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCcoZGVidWcpIGRldmljZSB0b2tlbiByZWdpc3RlcmVkOiAnICsgc2VsZi5fdG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLl9kZWJ1Z05vdGlmaWNhdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5fcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBwdXNoX21lc3NhZ2VfMS5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnKGRlYnVnKSBub3RpZmljYXRpb24gcmVjZWl2ZWQ6ICcgKyBtZXNzYWdlKTtcbiAgICAgICAgICAgIGlmICghc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjayAmJiBzZWxmLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQobWVzc2FnZS50ZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fZGVidWdFcnJvckNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGVycikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJyhkZWJ1ZykgdW5leHBlY3RlZCBlcnJvciBvY2N1cmVkLicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fcmVnaXN0ZXJDYWxsYmFjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhkYXRhKSB7XG4gICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAoc2VsZi5yZWdpc3RlckNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYucmVnaXN0ZXJDYWxsYmFjayhzZWxmLl90b2tlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuX25vdGlmaWNhdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5fcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBwdXNoX21lc3NhZ2VfMS5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgaWYgKHNlbGYubm90aWZpY2F0aW9uQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjayhtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fZXJyb3JDYWxsYmFjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhlcnIpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmVycm9yQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5lcnJvckNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIHRoZSBkZWZhdWx0IGRlYnVnIGNhbGxiYWNrcyB3aXRoIHRoZSBQdXNoUGx1Z2luIHdoZW4gZGVidWcgaXMgZW5hYmxlZFxuICAgICAqIEludGVybmFsIE1ldGhvZFxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5kZWJ1Zykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdyZWdpc3RyYXRpb24nLCB0aGlzLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignbm90aWZpY2F0aW9uJywgdGhpcy5fZGVidWdOb3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ2Vycm9yJywgdGhpcy5fZGVidWdFcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9yZWdpc3RlcmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6dG9rZW4nLCB0aGlzLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOm5vdGlmaWNhdGlvbicsIHRoaXMuX2RlYnVnTm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6ZXJyb3InLCB0aGlzLl9kZWJ1Z0Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIHVzZXIgc3VwcGxpZWQgY2FsbGJhY2tzIHdpdGggdGhlIFB1c2hQbHVnaW5cbiAgICAgKiBJbnRlcm5hbCBNZXRob2RcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLl9jYWxsYmFja1JlZ2lzdHJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIHRoaXMuX3JlZ2lzdGVyQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ25vdGlmaWNhdGlvbicsIHRoaXMuX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdlcnJvcicsIHRoaXMuX2Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3JlZ2lzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOnRva2VuJywgdGhpcy5fcmVnaXN0ZXJDYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOm5vdGlmaWNhdGlvbicsIHRoaXMuX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6ZXJyb3InLCB0aGlzLl9lcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBtaXNjIGZlYXR1cmVzIGJhc2VkIG9uIHRoZSBjb250ZW50cyBvZiBhIHB1c2ggbm90aWZpY2F0aW9uXG4gICAgICogSW50ZXJuYWwgTWV0aG9kXG4gICAgICpcbiAgICAgKiBDdXJyZW50bHkganVzdCBkb2VzIHRoZSBwYXlsb2FkICRzdGF0ZSByZWRpcmVjdGlvblxuICAgICAqIEBwYXJhbSB7UHVzaE5vdGlmaWNhdGlvbn0gbm90aWZpY2F0aW9uIFB1c2ggTm90aWZpY2F0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuX3Byb2Nlc3NOb3RpZmljYXRpb24gPSBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHRoaXMuX25vdGlmaWNhdGlvbiA9IG5vdGlmaWNhdGlvbjtcbiAgICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KCdpb25pY19wdXNoOnByb2Nlc3NOb3RpZmljYXRpb24nLCBub3RpZmljYXRpb24pO1xuICAgIH07XG4gICAgLyogRGVwcmVjYXRlZCBpbiBmYXZvciBvZiBgZ2V0UHVzaFBsdWdpbmAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5fZ2V0UHVzaFBsdWdpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgUHVzaFBsdWdpbiA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBQdXNoUGx1Z2luID0gd2luZG93LlB1c2hOb3RpZmljYXRpb247XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NvbWV0aGluZyB3ZW50IHdyb25nIGxvb2tpbmcgZm9yIHRoZSBQdXNoTm90aWZpY2F0aW9uIHBsdWdpbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5hcHAuZGV2UHVzaCAmJiAhUHVzaFBsdWdpbiAmJiAoY29yZV8xLklvbmljUGxhdGZvcm0uaXNJT1NEZXZpY2UoKSB8fCBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5pc0FuZHJvaWREZXZpY2UoKSkpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdQdXNoTm90aWZpY2F0aW9uIHBsdWdpbiBpcyByZXF1aXJlZC4gSGF2ZSB5b3UgcnVuIGBpb25pYyBwbHVnaW4gYWRkIHBob25lZ2FwLXBsdWdpbi1wdXNoYCA/Jyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFB1c2hQbHVnaW47XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBGZXRjaCB0aGUgcGhvbmVnYXAtcHVzaC1wbHVnaW4gaW50ZXJmYWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQdXNoTm90aWZpY2F0aW9ufSBQdXNoTm90aWZpY2F0aW9uIGluc3RhbmNlXG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuZ2V0UHVzaFBsdWdpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsdWdpbjtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZpcmUgYSBjYWxsYmFjayB3aGVuIFB1c2ggaXMgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogdGhlIHNlcnZpY2UgaGFzIGFscmVhZHkgaW5pdGlhbGl6ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUub25SZWFkeSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9pc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6cmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIFB1c2g7XG59KCkpO1xuZXhwb3J0cy5QdXNoID0gUHVzaDtcbiIsIlwidXNlIHN0cmljdFwiO1xuZnVuY3Rpb24gX19leHBvcnQobSkge1xuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKCFleHBvcnRzLmhhc093blByb3BlcnR5KHApKSBleHBvcnRzW3BdID0gbVtwXTtcbn1cbl9fZXhwb3J0KHJlcXVpcmUoJy4vdXRpbCcpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuZnVuY3Rpb24gZGVlcEV4dGVuZCgpIHtcbiAgICB2YXIgb3V0ID0gW107XG4gICAgZm9yICh2YXIgX2kgPSAwOyBfaSA8IGFyZ3VtZW50cy5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgb3V0W19pIC0gMF0gPSBhcmd1bWVudHNbX2ldO1xuICAgIH1cbiAgICBvdXQgPSBvdXRbMF0gfHwge307XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIG9iaiA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dFtrZXldID0gZGVlcEV4dGVuZChvdXRba2V5XSwgb2JqW2tleV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0W2tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn1cbmV4cG9ydHMuZGVlcEV4dGVuZCA9IGRlZXBFeHRlbmQ7XG5mdW5jdGlvbiBnZW5lcmF0ZVVVSUQoKSB7XG4gICAgcmV0dXJuICd4eHh4eHh4eC14eHh4LTR4eHgteXh4eC14eHh4eHh4eHh4eHgnLnJlcGxhY2UoL1t4eV0vZywgZnVuY3Rpb24gKGMpIHtcbiAgICAgICAgdmFyIHIgPSBNYXRoLnJhbmRvbSgpICogMTYgfCAwLCB2ID0gYyA9PT0gJ3gnID8gciA6IChyICYgMHgzIHwgMHg4KTtcbiAgICAgICAgcmV0dXJuIHYudG9TdHJpbmcoMTYpO1xuICAgIH0pO1xufVxuZXhwb3J0cy5nZW5lcmF0ZVVVSUQgPSBnZW5lcmF0ZVVVSUQ7XG4iLCJcclxuLyoqXHJcbiAqIEV4cG9zZSBgRW1pdHRlcmAuXHJcbiAqL1xyXG5cclxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgbW9kdWxlLmV4cG9ydHMgPSBFbWl0dGVyO1xyXG59XHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRW1pdHRlcmAuXHJcbiAqXHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuZnVuY3Rpb24gRW1pdHRlcihvYmopIHtcclxuICBpZiAob2JqKSByZXR1cm4gbWl4aW4ob2JqKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNaXhpbiB0aGUgZW1pdHRlciBwcm9wZXJ0aWVzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXHJcbiAqIEByZXR1cm4ge09iamVjdH1cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZnVuY3Rpb24gbWl4aW4ob2JqKSB7XHJcbiAgZm9yICh2YXIga2V5IGluIEVtaXR0ZXIucHJvdG90eXBlKSB7XHJcbiAgICBvYmpba2V5XSA9IEVtaXR0ZXIucHJvdG90eXBlW2tleV07XHJcbiAgfVxyXG4gIHJldHVybiBvYmo7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBMaXN0ZW4gb24gdGhlIGdpdmVuIGBldmVudGAgd2l0aCBgZm5gLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cclxuICogQHJldHVybiB7RW1pdHRlcn1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5vbiA9XHJcbkVtaXR0ZXIucHJvdG90eXBlLmFkZEV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbihldmVudCwgZm4pe1xyXG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcclxuICAodGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gfHwgW10pXHJcbiAgICAucHVzaChmbik7XHJcbiAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogQWRkcyBhbiBgZXZlbnRgIGxpc3RlbmVyIHRoYXQgd2lsbCBiZSBpbnZva2VkIGEgc2luZ2xlXHJcbiAqIHRpbWUgdGhlbiBhdXRvbWF0aWNhbGx5IHJlbW92ZWQuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxyXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pe1xyXG4gIGZ1bmN0aW9uIG9uKCkge1xyXG4gICAgdGhpcy5vZmYoZXZlbnQsIG9uKTtcclxuICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbiAgfVxyXG5cclxuICBvbi5mbiA9IGZuO1xyXG4gIHRoaXMub24oZXZlbnQsIG9uKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW1vdmUgdGhlIGdpdmVuIGNhbGxiYWNrIGZvciBgZXZlbnRgIG9yIGFsbFxyXG4gKiByZWdpc3RlcmVkIGNhbGxiYWNrcy5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXHJcbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUub2ZmID1cclxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPVxyXG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPVxyXG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVFdmVudExpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcclxuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XHJcblxyXG4gIC8vIGFsbFxyXG4gIGlmICgwID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcclxuICAgIHRoaXMuX2NhbGxiYWNrcyA9IHt9O1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfVxyXG5cclxuICAvLyBzcGVjaWZpYyBldmVudFxyXG4gIHZhciBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdO1xyXG4gIGlmICghY2FsbGJhY2tzKSByZXR1cm4gdGhpcztcclxuXHJcbiAgLy8gcmVtb3ZlIGFsbCBoYW5kbGVyc1xyXG4gIGlmICgxID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcclxuICAgIGRlbGV0ZSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfVxyXG5cclxuICAvLyByZW1vdmUgc3BlY2lmaWMgaGFuZGxlclxyXG4gIHZhciBjYjtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKykge1xyXG4gICAgY2IgPSBjYWxsYmFja3NbaV07XHJcbiAgICBpZiAoY2IgPT09IGZuIHx8IGNiLmZuID09PSBmbikge1xyXG4gICAgICBjYWxsYmFja3Muc3BsaWNlKGksIDEpO1xyXG4gICAgICBicmVhaztcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogRW1pdCBgZXZlbnRgIHdpdGggdGhlIGdpdmVuIGFyZ3MuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcGFyYW0ge01peGVkfSAuLi5cclxuICogQHJldHVybiB7RW1pdHRlcn1cclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24oZXZlbnQpe1xyXG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcclxuICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxyXG4gICAgLCBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdO1xyXG5cclxuICBpZiAoY2FsbGJhY2tzKSB7XHJcbiAgICBjYWxsYmFja3MgPSBjYWxsYmFja3Muc2xpY2UoMCk7XHJcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gY2FsbGJhY2tzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XHJcbiAgICAgIGNhbGxiYWNrc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJldHVybiBhcnJheSBvZiBjYWxsYmFja3MgZm9yIGBldmVudGAuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcmV0dXJuIHtBcnJheX1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbihldmVudCl7XHJcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xyXG4gIHJldHVybiB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdIHx8IFtdO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIENoZWNrIGlmIHRoaXMgZW1pdHRlciBoYXMgYGV2ZW50YCBoYW5kbGVycy5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEByZXR1cm4ge0Jvb2xlYW59XHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUuaGFzTGlzdGVuZXJzID0gZnVuY3Rpb24oZXZlbnQpe1xyXG4gIHJldHVybiAhISB0aGlzLmxpc3RlbmVycyhldmVudCkubGVuZ3RoO1xyXG59O1xyXG4iLCIvKiFcbiAqIEBvdmVydmlldyBlczYtcHJvbWlzZSAtIGEgdGlueSBpbXBsZW1lbnRhdGlvbiBvZiBQcm9taXNlcy9BKy5cbiAqIEBjb3B5cmlnaHQgQ29weXJpZ2h0IChjKSAyMDE0IFllaHVkYSBLYXR6LCBUb20gRGFsZSwgU3RlZmFuIFBlbm5lciBhbmQgY29udHJpYnV0b3JzIChDb252ZXJzaW9uIHRvIEVTNiBBUEkgYnkgSmFrZSBBcmNoaWJhbGQpXG4gKiBAbGljZW5zZSAgIExpY2Vuc2VkIHVuZGVyIE1JVCBsaWNlbnNlXG4gKiAgICAgICAgICAgIFNlZSBodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vamFrZWFyY2hpYmFsZC9lczYtcHJvbWlzZS9tYXN0ZXIvTElDRU5TRVxuICogQHZlcnNpb24gICAzLjIuMVxuICovXG5cbihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJG9iamVjdE9yRnVuY3Rpb24oeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nIHx8ICh0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzTWF5YmVUaGVuYWJsZSh4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdvYmplY3QnICYmIHggIT09IG51bGw7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5ID0gZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkgPSBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuID0gMDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwID0gZnVuY3Rpb24gYXNhcChjYWxsYmFjaywgYXJnKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbl0gPSBjYWxsYmFjaztcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuICsgMV0gPSBhcmc7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuICs9IDI7XG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9PT0gMikge1xuICAgICAgICAvLyBJZiBsZW4gaXMgMiwgdGhhdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gc2NoZWR1bGUgYW4gYXN5bmMgZmx1c2guXG4gICAgICAgIC8vIElmIGFkZGl0aW9uYWwgY2FsbGJhY2tzIGFyZSBxdWV1ZWQgYmVmb3JlIHRoZSBxdWV1ZSBpcyBmbHVzaGVkLCB0aGV5XG4gICAgICAgIC8vIHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoaXMgZmx1c2ggdGhhdCB3ZSBhcmUgc2NoZWR1bGluZy5cbiAgICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbihsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0U2NoZWR1bGVyKHNjaGVkdWxlRm4pIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbiA9IHNjaGVkdWxlRm47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldEFzYXAoYXNhcEZuKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcCA9IGFzYXBGbjtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93IDogdW5kZWZpbmVkO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93IHx8IHt9O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbC5NdXRhdGlvbk9ic2VydmVyIHx8IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsLldlYktpdE11dGF0aW9uT2JzZXJ2ZXI7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc05vZGUgPSB0eXBlb2Ygc2VsZiA9PT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmIHt9LnRvU3RyaW5nLmNhbGwocHJvY2VzcykgPT09ICdbb2JqZWN0IHByb2Nlc3NdJztcblxuICAgIC8vIHRlc3QgZm9yIHdlYiB3b3JrZXIgYnV0IG5vdCBpbiBJRTEwXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc1dvcmtlciA9IHR5cGVvZiBVaW50OENsYW1wZWRBcnJheSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHR5cGVvZiBpbXBvcnRTY3JpcHRzICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgdHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSAndW5kZWZpbmVkJztcblxuICAgIC8vIG5vZGVcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTmV4dFRpY2soKSB7XG4gICAgICAvLyBub2RlIHZlcnNpb24gMC4xMC54IGRpc3BsYXlzIGEgZGVwcmVjYXRpb24gd2FybmluZyB3aGVuIG5leHRUaWNrIGlzIHVzZWQgcmVjdXJzaXZlbHlcbiAgICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vY3Vqb2pzL3doZW4vaXNzdWVzLzQxMCBmb3IgZGV0YWlsc1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHZlcnR4XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVZlcnR4VGltZXIoKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU11dGF0aW9uT2JzZXJ2ZXIoKSB7XG4gICAgICB2YXIgaXRlcmF0aW9ucyA9IDA7XG4gICAgICB2YXIgb2JzZXJ2ZXIgPSBuZXcgbGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICB2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICAgIG9ic2VydmVyLm9ic2VydmUobm9kZSwgeyBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIG5vZGUuZGF0YSA9IChpdGVyYXRpb25zID0gKytpdGVyYXRpb25zICUgMik7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHdlYiB3b3JrZXJcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTWVzc2FnZUNoYW5uZWwoKSB7XG4gICAgICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgICAgY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2g7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgc2V0VGltZW91dChsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gsIDEpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlID0gbmV3IEFycmF5KDEwMDApO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCgpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbjsgaSs9Mikge1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaV07XG4gICAgICAgIHZhciBhcmcgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaSsxXTtcblxuICAgICAgICBjYWxsYmFjayhhcmcpO1xuXG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2krMV0gPSB1bmRlZmluZWQ7XG4gICAgICB9XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhdHRlbXB0VmVydHgoKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YXIgciA9IHJlcXVpcmU7XG4gICAgICAgIHZhciB2ZXJ0eCA9IHIoJ3ZlcnR4Jyk7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQgPSB2ZXJ0eC5ydW5Pbkxvb3AgfHwgdmVydHgucnVuT25Db250ZXh0O1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVZlcnR4VGltZXIoKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVNldFRpbWVvdXQoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2g7XG4gICAgLy8gRGVjaWRlIHdoYXQgYXN5bmMgbWV0aG9kIHRvIHVzZSB0byB0cmlnZ2VyaW5nIHByb2Nlc3Npbmcgb2YgcXVldWVkIGNhbGxiYWNrczpcbiAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGlzTm9kZSkge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTmV4dFRpY2soKTtcbiAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRCcm93c2VyTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGlzV29ya2VyKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgPT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXR0ZW1wdFZlcnR4KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVNldFRpbWVvdXQoKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHRoZW4kJHRoZW4ob25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgICAgIHZhciBwYXJlbnQgPSB0aGlzO1xuXG4gICAgICB2YXIgY2hpbGQgPSBuZXcgdGhpcy5jb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcblxuICAgICAgaWYgKGNoaWxkW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbWFrZVByb21pc2UoY2hpbGQpO1xuICAgICAgfVxuXG4gICAgICB2YXIgc3RhdGUgPSBwYXJlbnQuX3N0YXRlO1xuXG4gICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJndW1lbnRzW3N0YXRlIC0gMV07XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW52b2tlQ2FsbGJhY2soc3RhdGUsIGNoaWxkLCBjYWxsYmFjaywgcGFyZW50Ll9yZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjaGlsZDtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHRoZW4kJHRoZW47XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkcmVzb2x2ZShvYmplY3QpIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gICAgICBpZiAob2JqZWN0ICYmIHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnICYmIG9iamVjdC5jb25zdHJ1Y3RvciA9PT0gQ29uc3RydWN0b3IpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgIH1cblxuICAgICAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIG9iamVjdCk7XG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRyZXNvbHZlO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDE2KTtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3AoKSB7fVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgICA9IHZvaWQgMDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEID0gMTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQgID0gMjtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUiA9IG5ldyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkge1xuICAgICAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoXCJZb3UgY2Fubm90IHJlc29sdmUgYSBwcm9taXNlIHdpdGggaXRzZWxmXCIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdBIHByb21pc2VzIGNhbGxiYWNrIGNhbm5vdCByZXR1cm4gdGhhdCBzYW1lIHByb21pc2UuJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbihwcm9taXNlKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuO1xuICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvciA9IGVycm9yO1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1I7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5VGhlbih0aGVuLCB2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcik7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlLCB0aGVuKSB7XG4gICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAoZnVuY3Rpb24ocHJvbWlzZSkge1xuICAgICAgICB2YXIgc2VhbGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBlcnJvciA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdGhlbmFibGUsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgICAgIGlmICh0aGVuYWJsZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGlmIChzZWFsZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcblxuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9LCAnU2V0dGxlOiAnICsgKHByb21pc2UuX2xhYmVsIHx8ICcgdW5rbm93biBwcm9taXNlJykpO1xuXG4gICAgICAgIGlmICghc2VhbGVkICYmIGVycm9yKSB7XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9LCBwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSkge1xuICAgICAgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gICAgICB9IGVsc2UgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHRoZW5hYmxlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4pIHtcbiAgICAgIGlmIChtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yID09PSBwcm9taXNlLmNvbnN0cnVjdG9yICYmXG4gICAgICAgICAgdGhlbiA9PT0gbGliJGVzNiRwcm9taXNlJHRoZW4kJGRlZmF1bHQgJiZcbiAgICAgICAgICBjb25zdHJ1Y3Rvci5yZXNvbHZlID09PSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0KSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHRoZW4gPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SLmVycm9yKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGVuID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgICAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbih0aGVuKSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSkge1xuICAgICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzZWxmRnVsZmlsbG1lbnQoKSk7XG4gICAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCB2YWx1ZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbih2YWx1ZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaFJlamVjdGlvbihwcm9taXNlKSB7XG4gICAgICBpZiAocHJvbWlzZS5fb25lcnJvcikge1xuICAgICAgICBwcm9taXNlLl9vbmVycm9yKHByb21pc2UuX3Jlc3VsdCk7XG4gICAgICB9XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSkge1xuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7IHJldHVybjsgfVxuXG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSB2YWx1ZTtcbiAgICAgIHByb21pc2UuX3N0YXRlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gsIHByb21pc2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykgeyByZXR1cm47IH1cbiAgICAgIHByb21pc2UuX3N0YXRlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQ7XG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSByZWFzb247XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2hSZWplY3Rpb24sIHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcGFyZW50Ll9zdWJzY3JpYmVycztcbiAgICAgIHZhciBsZW5ndGggPSBzdWJzY3JpYmVycy5sZW5ndGg7XG5cbiAgICAgIHBhcmVudC5fb25lcnJvciA9IG51bGw7XG5cbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aF0gPSBjaGlsZDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRF0gPSBvbkZ1bGZpbGxtZW50O1xuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoICsgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURURdICA9IG9uUmVqZWN0aW9uO1xuXG4gICAgICBpZiAobGVuZ3RoID09PSAwICYmIHBhcmVudC5fc3RhdGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaCwgcGFyZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoKHByb21pc2UpIHtcbiAgICAgIHZhciBzdWJzY3JpYmVycyA9IHByb21pc2UuX3N1YnNjcmliZXJzO1xuICAgICAgdmFyIHNldHRsZWQgPSBwcm9taXNlLl9zdGF0ZTtcblxuICAgICAgaWYgKHN1YnNjcmliZXJzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuICAgICAgdmFyIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsID0gcHJvbWlzZS5fcmVzdWx0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnNjcmliZXJzLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgIGNoaWxkID0gc3Vic2NyaWJlcnNbaV07XG4gICAgICAgIGNhbGxiYWNrID0gc3Vic2NyaWJlcnNbaSArIHNldHRsZWRdO1xuXG4gICAgICAgIGlmIChjaGlsZCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhkZXRhaWwpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKSB7XG4gICAgICB0aGlzLmVycm9yID0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SID0gbmV3IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCk7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZGV0YWlsKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IuZXJyb3IgPSBlO1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIHByb21pc2UsIGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgICAgIHZhciBoYXNDYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbihjYWxsYmFjayksXG4gICAgICAgICAgdmFsdWUsIGVycm9yLCBzdWNjZWVkZWQsIGZhaWxlZDtcblxuICAgICAgaWYgKGhhc0NhbGxiYWNrKSB7XG4gICAgICAgIHZhbHVlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCk7XG5cbiAgICAgICAgaWYgKHZhbHVlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IpIHtcbiAgICAgICAgICBmYWlsZWQgPSB0cnVlO1xuICAgICAgICAgIGVycm9yID0gdmFsdWUuZXJyb3I7XG4gICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkY2Fubm90UmV0dXJuT3duKCkpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IGRldGFpbDtcbiAgICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAoaGFzQ2FsbGJhY2sgJiYgc3VjY2VlZGVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChmYWlsZWQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHByb21pc2UsIHJlc29sdmVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXNvbHZlcihmdW5jdGlvbiByZXNvbHZlUHJvbWlzZSh2YWx1ZSl7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIHJlamVjdFByb21pc2UocmVhc29uKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaWQgPSAwO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5leHRJZCgpIHtcbiAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpZCsrO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG1ha2VQcm9taXNlKHByb21pc2UpIHtcbiAgICAgIHByb21pc2VbbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRF0gPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpZCsrO1xuICAgICAgcHJvbWlzZS5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSB1bmRlZmluZWQ7XG4gICAgICBwcm9taXNlLl9zdWJzY3JpYmVycyA9IFtdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkYWxsKGVudHJpZXMpIHtcbiAgICAgIHJldHVybiBuZXcgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJGRlZmF1bHQodGhpcywgZW50cmllcykucHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkYWxsO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJHJhY2UoZW50cmllcykge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIGlmICghbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0FycmF5KGVudHJpZXMpKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYW4gYXJyYXkgdG8gcmFjZS4nKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICB2YXIgbGVuZ3RoID0gZW50cmllcy5sZW5ndGg7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgQ29uc3RydWN0b3IucmVzb2x2ZShlbnRyaWVzW2ldKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRyYWNlO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkcmVqZWN0KHJlYXNvbikge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJHJlamVjdDtcblxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzUmVzb2x2ZXIoKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGEgcmVzb2x2ZXIgZnVuY3Rpb24gYXMgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHRoZSBwcm9taXNlIGNvbnN0cnVjdG9yJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzTmV3KCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ1Byb21pc2UnOiBQbGVhc2UgdXNlIHRoZSAnbmV3JyBvcGVyYXRvciwgdGhpcyBvYmplY3QgY29uc3RydWN0b3IgY2Fubm90IGJlIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLlwiKTtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZTtcbiAgICAvKipcbiAgICAgIFByb21pc2Ugb2JqZWN0cyByZXByZXNlbnQgdGhlIGV2ZW50dWFsIHJlc3VsdCBvZiBhbiBhc3luY2hyb25vdXMgb3BlcmF0aW9uLiBUaGVcbiAgICAgIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsIHdoaWNoXG4gICAgICByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZSByZWFzb25cbiAgICAgIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gICAgICBUZXJtaW5vbG9neVxuICAgICAgLS0tLS0tLS0tLS1cblxuICAgICAgLSBgcHJvbWlzZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHdpdGggYSBgdGhlbmAgbWV0aG9kIHdob3NlIGJlaGF2aW9yIGNvbmZvcm1zIHRvIHRoaXMgc3BlY2lmaWNhdGlvbi5cbiAgICAgIC0gYHRoZW5hYmxlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gdGhhdCBkZWZpbmVzIGEgYHRoZW5gIG1ldGhvZC5cbiAgICAgIC0gYHZhbHVlYCBpcyBhbnkgbGVnYWwgSmF2YVNjcmlwdCB2YWx1ZSAoaW5jbHVkaW5nIHVuZGVmaW5lZCwgYSB0aGVuYWJsZSwgb3IgYSBwcm9taXNlKS5cbiAgICAgIC0gYGV4Y2VwdGlvbmAgaXMgYSB2YWx1ZSB0aGF0IGlzIHRocm93biB1c2luZyB0aGUgdGhyb3cgc3RhdGVtZW50LlxuICAgICAgLSBgcmVhc29uYCBpcyBhIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoeSBhIHByb21pc2Ugd2FzIHJlamVjdGVkLlxuICAgICAgLSBgc2V0dGxlZGAgdGhlIGZpbmFsIHJlc3Rpbmcgc3RhdGUgb2YgYSBwcm9taXNlLCBmdWxmaWxsZWQgb3IgcmVqZWN0ZWQuXG5cbiAgICAgIEEgcHJvbWlzZSBjYW4gYmUgaW4gb25lIG9mIHRocmVlIHN0YXRlczogcGVuZGluZywgZnVsZmlsbGVkLCBvciByZWplY3RlZC5cblxuICAgICAgUHJvbWlzZXMgdGhhdCBhcmUgZnVsZmlsbGVkIGhhdmUgYSBmdWxmaWxsbWVudCB2YWx1ZSBhbmQgYXJlIGluIHRoZSBmdWxmaWxsZWRcbiAgICAgIHN0YXRlLiAgUHJvbWlzZXMgdGhhdCBhcmUgcmVqZWN0ZWQgaGF2ZSBhIHJlamVjdGlvbiByZWFzb24gYW5kIGFyZSBpbiB0aGVcbiAgICAgIHJlamVjdGVkIHN0YXRlLiAgQSBmdWxmaWxsbWVudCB2YWx1ZSBpcyBuZXZlciBhIHRoZW5hYmxlLlxuXG4gICAgICBQcm9taXNlcyBjYW4gYWxzbyBiZSBzYWlkIHRvICpyZXNvbHZlKiBhIHZhbHVlLiAgSWYgdGhpcyB2YWx1ZSBpcyBhbHNvIGFcbiAgICAgIHByb21pc2UsIHRoZW4gdGhlIG9yaWdpbmFsIHByb21pc2UncyBzZXR0bGVkIHN0YXRlIHdpbGwgbWF0Y2ggdGhlIHZhbHVlJ3NcbiAgICAgIHNldHRsZWQgc3RhdGUuICBTbyBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2lsbFxuICAgICAgaXRzZWxmIHJlamVjdCwgYW5kIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgd2lsbFxuICAgICAgaXRzZWxmIGZ1bGZpbGwuXG5cblxuICAgICAgQmFzaWMgVXNhZ2U6XG4gICAgICAtLS0tLS0tLS0tLS1cblxuICAgICAgYGBganNcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgIC8vIG9uIHN1Y2Nlc3NcbiAgICAgICAgcmVzb2x2ZSh2YWx1ZSk7XG5cbiAgICAgICAgLy8gb24gZmFpbHVyZVxuICAgICAgICByZWplY3QocmVhc29uKTtcbiAgICAgIH0pO1xuXG4gICAgICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAvLyBvbiByZWplY3Rpb25cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFkdmFuY2VkIFVzYWdlOlxuICAgICAgLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFByb21pc2VzIHNoaW5lIHdoZW4gYWJzdHJhY3RpbmcgYXdheSBhc3luY2hyb25vdXMgaW50ZXJhY3Rpb25zIHN1Y2ggYXNcbiAgICAgIGBYTUxIdHRwUmVxdWVzdGBzLlxuXG4gICAgICBgYGBqc1xuICAgICAgZnVuY3Rpb24gZ2V0SlNPTih1cmwpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG4gICAgICAgICAgeGhyLm9wZW4oJ0dFVCcsIHVybCk7XG4gICAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGhhbmRsZXI7XG4gICAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcbiAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcbiAgICAgICAgICB4aHIuc2VuZCgpO1xuXG4gICAgICAgICAgZnVuY3Rpb24gaGFuZGxlcigpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IHRoaXMuRE9ORSkge1xuICAgICAgICAgICAgICBpZiAodGhpcy5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUodGhpcy5yZXNwb25zZSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignZ2V0SlNPTjogYCcgKyB1cmwgKyAnYCBmYWlsZWQgd2l0aCBzdGF0dXM6IFsnICsgdGhpcy5zdGF0dXMgKyAnXScpKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBnZXRKU09OKCcvcG9zdHMuanNvbicpLnRoZW4oZnVuY3Rpb24oanNvbikge1xuICAgICAgICAvLyBvbiBmdWxmaWxsbWVudFxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIC8vIG9uIHJlamVjdGlvblxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgVW5saWtlIGNhbGxiYWNrcywgcHJvbWlzZXMgYXJlIGdyZWF0IGNvbXBvc2FibGUgcHJpbWl0aXZlcy5cblxuICAgICAgYGBganNcbiAgICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgZ2V0SlNPTignL3Bvc3RzJyksXG4gICAgICAgIGdldEpTT04oJy9jb21tZW50cycpXG4gICAgICBdKS50aGVuKGZ1bmN0aW9uKHZhbHVlcyl7XG4gICAgICAgIHZhbHVlc1swXSAvLyA9PiBwb3N0c0pTT05cbiAgICAgICAgdmFsdWVzWzFdIC8vID0+IGNvbW1lbnRzSlNPTlxuXG4gICAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAY2xhc3MgUHJvbWlzZVxuICAgICAgQHBhcmFtIHtmdW5jdGlvbn0gcmVzb2x2ZXJcbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEBjb25zdHJ1Y3RvclxuICAgICovXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UocmVzb2x2ZXIpIHtcbiAgICAgIHRoaXNbbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRF0gPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRuZXh0SWQoKTtcbiAgICAgIHRoaXMuX3Jlc3VsdCA9IHRoaXMuX3N0YXRlID0gdW5kZWZpbmVkO1xuICAgICAgdGhpcy5fc3Vic2NyaWJlcnMgPSBbXTtcblxuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3AgIT09IHJlc29sdmVyKSB7XG4gICAgICAgIHR5cGVvZiByZXNvbHZlciAhPT0gJ2Z1bmN0aW9uJyAmJiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpO1xuICAgICAgICB0aGlzIGluc3RhbmNlb2YgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UgPyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbml0aWFsaXplUHJvbWlzZSh0aGlzLCByZXNvbHZlcikgOiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNOZXcoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5hbGwgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmFjZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmVzb2x2ZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmVqZWN0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLl9zZXRTY2hlZHVsZXIgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0U2NoZWR1bGVyO1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLl9zZXRBc2FwID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldEFzYXA7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX2FzYXAgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcDtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnByb3RvdHlwZSA9IHtcbiAgICAgIGNvbnN0cnVjdG9yOiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZSxcblxuICAgIC8qKlxuICAgICAgVGhlIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsXG4gICAgICB3aGljaCByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZVxuICAgICAgcmVhc29uIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uKHVzZXIpe1xuICAgICAgICAvLyB1c2VyIGlzIGF2YWlsYWJsZVxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gdXNlciBpcyB1bmF2YWlsYWJsZSwgYW5kIHlvdSBhcmUgZ2l2ZW4gdGhlIHJlYXNvbiB3aHlcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIENoYWluaW5nXG4gICAgICAtLS0tLS0tLVxuXG4gICAgICBUaGUgcmV0dXJuIHZhbHVlIG9mIGB0aGVuYCBpcyBpdHNlbGYgYSBwcm9taXNlLiAgVGhpcyBzZWNvbmQsICdkb3duc3RyZWFtJ1xuICAgICAgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZpcnN0IHByb21pc2UncyBmdWxmaWxsbWVudFxuICAgICAgb3IgcmVqZWN0aW9uIGhhbmRsZXIsIG9yIHJlamVjdGVkIGlmIHRoZSBoYW5kbGVyIHRocm93cyBhbiBleGNlcHRpb24uXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIHVzZXIubmFtZTtcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgcmV0dXJuICdkZWZhdWx0IG5hbWUnO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodXNlck5hbWUpIHtcbiAgICAgICAgLy8gSWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGB1c2VyTmFtZWAgd2lsbCBiZSB0aGUgdXNlcidzIG5hbWUsIG90aGVyd2lzZSBpdFxuICAgICAgICAvLyB3aWxsIGJlIGAnZGVmYXVsdCBuYW1lJ2BcbiAgICAgIH0pO1xuXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScpO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gaWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGByZWFzb25gIHdpbGwgYmUgJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jy5cbiAgICAgICAgLy8gSWYgYGZpbmRVc2VyYCByZWplY3RlZCwgYHJlYXNvbmAgd2lsbCBiZSAnYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScuXG4gICAgICB9KTtcbiAgICAgIGBgYFxuICAgICAgSWYgdGhlIGRvd25zdHJlYW0gcHJvbWlzZSBkb2VzIG5vdCBzcGVjaWZ5IGEgcmVqZWN0aW9uIGhhbmRsZXIsIHJlamVjdGlvbiByZWFzb25zIHdpbGwgYmUgcHJvcGFnYXRlZCBmdXJ0aGVyIGRvd25zdHJlYW0uXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBlZGFnb2dpY2FsRXhjZXB0aW9uKCdVcHN0cmVhbSBlcnJvcicpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBUaGUgYFBlZGdhZ29jaWFsRXhjZXB0aW9uYCBpcyBwcm9wYWdhdGVkIGFsbCB0aGUgd2F5IGRvd24gdG8gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQXNzaW1pbGF0aW9uXG4gICAgICAtLS0tLS0tLS0tLS1cblxuICAgICAgU29tZXRpbWVzIHRoZSB2YWx1ZSB5b3Ugd2FudCB0byBwcm9wYWdhdGUgdG8gYSBkb3duc3RyZWFtIHByb21pc2UgY2FuIG9ubHkgYmVcbiAgICAgIHJldHJpZXZlZCBhc3luY2hyb25vdXNseS4gVGhpcyBjYW4gYmUgYWNoaWV2ZWQgYnkgcmV0dXJuaW5nIGEgcHJvbWlzZSBpbiB0aGVcbiAgICAgIGZ1bGZpbGxtZW50IG9yIHJlamVjdGlvbiBoYW5kbGVyLiBUaGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgdGhlbiBiZSBwZW5kaW5nXG4gICAgICB1bnRpbCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBpcyBzZXR0bGVkLiBUaGlzIGlzIGNhbGxlZCAqYXNzaW1pbGF0aW9uKi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgICAvLyBUaGUgdXNlcidzIGNvbW1lbnRzIGFyZSBub3cgYXZhaWxhYmxlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBJZiB0aGUgYXNzaW1saWF0ZWQgcHJvbWlzZSByZWplY3RzLCB0aGVuIHRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCBhbHNvIHJlamVjdC5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIGZ1bGZpbGxzLCB3ZSdsbCBoYXZlIHRoZSB2YWx1ZSBoZXJlXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgcmVqZWN0cywgd2UnbGwgaGF2ZSB0aGUgcmVhc29uIGhlcmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFNpbXBsZSBFeGFtcGxlXG4gICAgICAtLS0tLS0tLS0tLS0tLVxuXG4gICAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIHZhciByZXN1bHQ7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGZpbmRSZXN1bHQoKTtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfVxuICAgICAgYGBgXG5cbiAgICAgIEVycmJhY2sgRXhhbXBsZVxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFJlc3VsdChmdW5jdGlvbihyZXN1bHQsIGVycil7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAvLyBmYWlsdXJlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBQcm9taXNlIEV4YW1wbGU7XG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIGZpbmRSZXN1bHQoKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFkdmFuY2VkIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIGF1dGhvciwgYm9va3M7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF1dGhvciA9IGZpbmRBdXRob3IoKTtcbiAgICAgICAgYm9va3MgID0gZmluZEJvb2tzQnlBdXRob3IoYXV0aG9yKTtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfVxuICAgICAgYGBgXG5cbiAgICAgIEVycmJhY2sgRXhhbXBsZVxuXG4gICAgICBgYGBqc1xuXG4gICAgICBmdW5jdGlvbiBmb3VuZEJvb2tzKGJvb2tzKSB7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZmFpbHVyZShyZWFzb24pIHtcblxuICAgICAgfVxuXG4gICAgICBmaW5kQXV0aG9yKGZ1bmN0aW9uKGF1dGhvciwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAvLyBmYWlsdXJlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZpbmRCb29va3NCeUF1dGhvcihhdXRob3IsIGZ1bmN0aW9uKGJvb2tzLCBlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgZm91bmRCb29rcyhib29rcyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgICAgICAgICAgIGZhaWx1cmUocmVhc29uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBQcm9taXNlIEV4YW1wbGU7XG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIGZpbmRBdXRob3IoKS5cbiAgICAgICAgdGhlbihmaW5kQm9va3NCeUF1dGhvcikuXG4gICAgICAgIHRoZW4oZnVuY3Rpb24oYm9va3Mpe1xuICAgICAgICAgIC8vIGZvdW5kIGJvb2tzXG4gICAgICB9KS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCB0aGVuXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvbkZ1bGZpbGxlZFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZFxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQHJldHVybiB7UHJvbWlzZX1cbiAgICAqL1xuICAgICAgdGhlbjogbGliJGVzNiRwcm9taXNlJHRoZW4kJGRlZmF1bHQsXG5cbiAgICAvKipcbiAgICAgIGBjYXRjaGAgaXMgc2ltcGx5IHN1Z2FyIGZvciBgdGhlbih1bmRlZmluZWQsIG9uUmVqZWN0aW9uKWAgd2hpY2ggbWFrZXMgaXQgdGhlIHNhbWVcbiAgICAgIGFzIHRoZSBjYXRjaCBibG9jayBvZiBhIHRyeS9jYXRjaCBzdGF0ZW1lbnQuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmdW5jdGlvbiBmaW5kQXV0aG9yKCl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignY291bGRuJ3QgZmluZCB0aGF0IGF1dGhvcicpO1xuICAgICAgfVxuXG4gICAgICAvLyBzeW5jaHJvbm91c1xuICAgICAgdHJ5IHtcbiAgICAgICAgZmluZEF1dGhvcigpO1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH1cblxuICAgICAgLy8gYXN5bmMgd2l0aCBwcm9taXNlc1xuICAgICAgZmluZEF1dGhvcigpLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAbWV0aG9kIGNhdGNoXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGlvblxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQHJldHVybiB7UHJvbWlzZX1cbiAgICAqL1xuICAgICAgJ2NhdGNoJzogZnVuY3Rpb24ob25SZWplY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGhlbihudWxsLCBvblJlamVjdGlvbik7XG4gICAgICB9XG4gICAgfTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvcjtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvcihDb25zdHJ1Y3RvciwgaW5wdXQpIHtcbiAgICAgIHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3IgPSBDb25zdHJ1Y3RvcjtcbiAgICAgIHRoaXMucHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcblxuICAgICAgaWYgKCF0aGlzLnByb21pc2VbbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRF0pIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbWFrZVByb21pc2UodGhpcy5wcm9taXNlKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheShpbnB1dCkpIHtcbiAgICAgICAgdGhpcy5faW5wdXQgICAgID0gaW5wdXQ7XG4gICAgICAgIHRoaXMubGVuZ3RoICAgICA9IGlucHV0Lmxlbmd0aDtcbiAgICAgICAgdGhpcy5fcmVtYWluaW5nID0gaW5wdXQubGVuZ3RoO1xuXG4gICAgICAgIHRoaXMuX3Jlc3VsdCA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aCk7XG5cbiAgICAgICAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5sZW5ndGggPSB0aGlzLmxlbmd0aCB8fCAwO1xuICAgICAgICAgIHRoaXMuX2VudW1lcmF0ZSgpO1xuICAgICAgICAgIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHRoaXMucHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJHZhbGlkYXRpb25FcnJvcigpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkdmFsaWRhdGlvbkVycm9yKCkge1xuICAgICAgcmV0dXJuIG5ldyBFcnJvcignQXJyYXkgTWV0aG9kcyBtdXN0IGJlIHByb3ZpZGVkIGFuIEFycmF5Jyk7XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9lbnVtZXJhdGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBsZW5ndGggID0gdGhpcy5sZW5ndGg7XG4gICAgICB2YXIgaW5wdXQgICA9IHRoaXMuX2lucHV0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgdGhpcy5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHRoaXMuX2VhY2hFbnRyeShpbnB1dFtpXSwgaSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZWFjaEVudHJ5ID0gZnVuY3Rpb24oZW50cnksIGkpIHtcbiAgICAgIHZhciBjID0gdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvcjtcbiAgICAgIHZhciByZXNvbHZlID0gYy5yZXNvbHZlO1xuXG4gICAgICBpZiAocmVzb2x2ZSA9PT0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCkge1xuICAgICAgICB2YXIgdGhlbiA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGdldFRoZW4oZW50cnkpO1xuXG4gICAgICAgIGlmICh0aGVuID09PSBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCAmJlxuICAgICAgICAgICAgZW50cnkuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgICAgdGhpcy5fc2V0dGxlZEF0KGVudHJ5Ll9zdGF0ZSwgaSwgZW50cnkuX3Jlc3VsdCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoZW4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICB0aGlzLl9yZW1haW5pbmctLTtcbiAgICAgICAgICB0aGlzLl9yZXN1bHRbaV0gPSBlbnRyeTtcbiAgICAgICAgfSBlbHNlIGlmIChjID09PSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCkge1xuICAgICAgICAgIHZhciBwcm9taXNlID0gbmV3IGMobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBlbnRyeSwgdGhlbik7XG4gICAgICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KHByb21pc2UsIGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChuZXcgYyhmdW5jdGlvbihyZXNvbHZlKSB7IHJlc29sdmUoZW50cnkpOyB9KSwgaSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChyZXNvbHZlKGVudHJ5KSwgaSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fc2V0dGxlZEF0ID0gZnVuY3Rpb24oc3RhdGUsIGksIHZhbHVlKSB7XG4gICAgICB2YXIgcHJvbWlzZSA9IHRoaXMucHJvbWlzZTtcblxuICAgICAgaWYgKHByb21pc2UuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuXG4gICAgICAgIGlmIChzdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3dpbGxTZXR0bGVBdCA9IGZ1bmN0aW9uKHByb21pc2UsIGkpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHByb21pc2UsIHVuZGVmaW5lZCwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgZW51bWVyYXRvci5fc2V0dGxlZEF0KGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCwgaSwgdmFsdWUpO1xuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCwgaSwgcmVhc29uKTtcbiAgICAgIH0pO1xuICAgIH07XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRwb2x5ZmlsbCgpIHtcbiAgICAgIHZhciBsb2NhbDtcblxuICAgICAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgbG9jYWwgPSBnbG9iYWw7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsID0gc2VsZjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgbG9jYWwgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwb2x5ZmlsbCBmYWlsZWQgYmVjYXVzZSBnbG9iYWwgb2JqZWN0IGlzIHVuYXZhaWxhYmxlIGluIHRoaXMgZW52aXJvbm1lbnQnKTtcbiAgICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBQID0gbG9jYWwuUHJvbWlzZTtcblxuICAgICAgaWYgKFAgJiYgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKFAucmVzb2x2ZSgpKSA9PT0gJ1tvYmplY3QgUHJvbWlzZV0nICYmICFQLmNhc3QpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsb2NhbC5Qcm9taXNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQ7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJHBvbHlmaWxsO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2UgPSB7XG4gICAgICAnUHJvbWlzZSc6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0LFxuICAgICAgJ3BvbHlmaWxsJzogbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0XG4gICAgfTtcblxuICAgIC8qIGdsb2JhbCBkZWZpbmU6dHJ1ZSBtb2R1bGU6dHJ1ZSB3aW5kb3c6IHRydWUgKi9cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmVbJ2FtZCddKSB7XG4gICAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlOyB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZVsnZXhwb3J0cyddKSB7XG4gICAgICBtb2R1bGVbJ2V4cG9ydHMnXSA9IGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRoaXNbJ0VTNlByb21pc2UnXSA9IGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0KCk7XG59KS5jYWxsKHRoaXMpO1xuXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIlxuLyoqXG4gKiBSZWR1Y2UgYGFycmAgd2l0aCBgZm5gLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFyclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBwYXJhbSB7TWl4ZWR9IGluaXRpYWxcbiAqXG4gKiBUT0RPOiBjb21iYXRpYmxlIGVycm9yIGhhbmRsaW5nP1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oYXJyLCBmbiwgaW5pdGlhbCl7ICBcbiAgdmFyIGlkeCA9IDA7XG4gIHZhciBsZW4gPSBhcnIubGVuZ3RoO1xuICB2YXIgY3VyciA9IGFyZ3VtZW50cy5sZW5ndGggPT0gM1xuICAgID8gaW5pdGlhbFxuICAgIDogYXJyW2lkeCsrXTtcblxuICB3aGlsZSAoaWR4IDwgbGVuKSB7XG4gICAgY3VyciA9IGZuLmNhbGwobnVsbCwgY3VyciwgYXJyW2lkeF0sICsraWR4LCBhcnIpO1xuICB9XG4gIFxuICByZXR1cm4gY3Vycjtcbn07IiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnZW1pdHRlcicpO1xudmFyIHJlZHVjZSA9IHJlcXVpcmUoJ3JlZHVjZScpO1xudmFyIHJlcXVlc3RCYXNlID0gcmVxdWlyZSgnLi9yZXF1ZXN0LWJhc2UnKTtcbnZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXMtb2JqZWN0Jyk7XG5cbi8qKlxuICogUm9vdCByZWZlcmVuY2UgZm9yIGlmcmFtZXMuXG4gKi9cblxudmFyIHJvb3Q7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHsgLy8gQnJvd3NlciB3aW5kb3dcbiAgcm9vdCA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7IC8vIFdlYiBXb3JrZXJcbiAgcm9vdCA9IHNlbGY7XG59IGVsc2UgeyAvLyBPdGhlciBlbnZpcm9ubWVudHNcbiAgcm9vdCA9IHRoaXM7XG59XG5cbi8qKlxuICogTm9vcC5cbiAqL1xuXG5mdW5jdGlvbiBub29wKCl7fTtcblxuLyoqXG4gKiBDaGVjayBpZiBgb2JqYCBpcyBhIGhvc3Qgb2JqZWN0LFxuICogd2UgZG9uJ3Qgd2FudCB0byBzZXJpYWxpemUgdGhlc2UgOilcbiAqXG4gKiBUT0RPOiBmdXR1cmUgcHJvb2YsIG1vdmUgdG8gY29tcG9lbnQgbGFuZFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBpc0hvc3Qob2JqKSB7XG4gIHZhciBzdHIgPSB7fS50b1N0cmluZy5jYWxsKG9iaik7XG5cbiAgc3dpdGNoIChzdHIpIHtcbiAgICBjYXNlICdbb2JqZWN0IEZpbGVdJzpcbiAgICBjYXNlICdbb2JqZWN0IEJsb2JdJzpcbiAgICBjYXNlICdbb2JqZWN0IEZvcm1EYXRhXSc6XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogRXhwb3NlIGByZXF1ZXN0YC5cbiAqL1xuXG52YXIgcmVxdWVzdCA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9yZXF1ZXN0JykuYmluZChudWxsLCBSZXF1ZXN0KTtcblxuLyoqXG4gKiBEZXRlcm1pbmUgWEhSLlxuICovXG5cbnJlcXVlc3QuZ2V0WEhSID0gZnVuY3Rpb24gKCkge1xuICBpZiAocm9vdC5YTUxIdHRwUmVxdWVzdFxuICAgICAgJiYgKCFyb290LmxvY2F0aW9uIHx8ICdmaWxlOicgIT0gcm9vdC5sb2NhdGlvbi5wcm90b2NvbFxuICAgICAgICAgIHx8ICFyb290LkFjdGl2ZVhPYmplY3QpKSB7XG4gICAgcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdDtcbiAgfSBlbHNlIHtcbiAgICB0cnkgeyByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01pY3Jvc29mdC5YTUxIVFRQJyk7IH0gY2F0Y2goZSkge31cbiAgICB0cnkgeyByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01zeG1sMi5YTUxIVFRQLjYuMCcpOyB9IGNhdGNoKGUpIHt9XG4gICAgdHJ5IHsgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNc3htbDIuWE1MSFRUUC4zLjAnKTsgfSBjYXRjaChlKSB7fVxuICAgIHRyeSB7IHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTXN4bWwyLlhNTEhUVFAnKTsgfSBjYXRjaChlKSB7fVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8qKlxuICogUmVtb3ZlcyBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLCBhZGRlZCB0byBzdXBwb3J0IElFLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG52YXIgdHJpbSA9ICcnLnRyaW1cbiAgPyBmdW5jdGlvbihzKSB7IHJldHVybiBzLnRyaW0oKTsgfVxuICA6IGZ1bmN0aW9uKHMpIHsgcmV0dXJuIHMucmVwbGFjZSgvKF5cXHMqfFxccyokKS9nLCAnJyk7IH07XG5cbi8qKlxuICogU2VyaWFsaXplIHRoZSBnaXZlbiBgb2JqYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzZXJpYWxpemUob2JqKSB7XG4gIGlmICghaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgdmFyIHBhaXJzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAobnVsbCAhPSBvYmpba2V5XSkge1xuICAgICAgcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgb2JqW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gIHJldHVybiBwYWlycy5qb2luKCcmJyk7XG59XG5cbi8qKlxuICogSGVscHMgJ3NlcmlhbGl6ZScgd2l0aCBzZXJpYWxpemluZyBhcnJheXMuXG4gKiBNdXRhdGVzIHRoZSBwYWlycyBhcnJheS5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBwYWlyc1xuICogQHBhcmFtIHtTdHJpbmd9IGtleVxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKi9cblxuZnVuY3Rpb24gcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgdmFsKSB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcbiAgICByZXR1cm4gdmFsLmZvckVhY2goZnVuY3Rpb24odikge1xuICAgICAgcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgdik7XG4gICAgfSk7XG4gIH1cbiAgcGFpcnMucHVzaChlbmNvZGVVUklDb21wb25lbnQoa2V5KVxuICAgICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHZhbCkpO1xufVxuXG4vKipcbiAqIEV4cG9zZSBzZXJpYWxpemF0aW9uIG1ldGhvZC5cbiAqL1xuXG4gcmVxdWVzdC5zZXJpYWxpemVPYmplY3QgPSBzZXJpYWxpemU7XG5cbiAvKipcbiAgKiBQYXJzZSB0aGUgZ2l2ZW4geC13d3ctZm9ybS11cmxlbmNvZGVkIGBzdHJgLlxuICAqXG4gICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICAqIEByZXR1cm4ge09iamVjdH1cbiAgKiBAYXBpIHByaXZhdGVcbiAgKi9cblxuZnVuY3Rpb24gcGFyc2VTdHJpbmcoc3RyKSB7XG4gIHZhciBvYmogPSB7fTtcbiAgdmFyIHBhaXJzID0gc3RyLnNwbGl0KCcmJyk7XG4gIHZhciBwYXJ0cztcbiAgdmFyIHBhaXI7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHBhaXJzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgcGFpciA9IHBhaXJzW2ldO1xuICAgIHBhcnRzID0gcGFpci5zcGxpdCgnPScpO1xuICAgIG9ialtkZWNvZGVVUklDb21wb25lbnQocGFydHNbMF0pXSA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXSk7XG4gIH1cblxuICByZXR1cm4gb2JqO1xufVxuXG4vKipcbiAqIEV4cG9zZSBwYXJzZXIuXG4gKi9cblxucmVxdWVzdC5wYXJzZVN0cmluZyA9IHBhcnNlU3RyaW5nO1xuXG4vKipcbiAqIERlZmF1bHQgTUlNRSB0eXBlIG1hcC5cbiAqXG4gKiAgICAgc3VwZXJhZ2VudC50eXBlcy54bWwgPSAnYXBwbGljYXRpb24veG1sJztcbiAqXG4gKi9cblxucmVxdWVzdC50eXBlcyA9IHtcbiAgaHRtbDogJ3RleHQvaHRtbCcsXG4gIGpzb246ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgeG1sOiAnYXBwbGljYXRpb24veG1sJyxcbiAgdXJsZW5jb2RlZDogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICdmb3JtJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICdmb3JtLWRhdGEnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJ1xufTtcblxuLyoqXG4gKiBEZWZhdWx0IHNlcmlhbGl6YXRpb24gbWFwLlxuICpcbiAqICAgICBzdXBlcmFnZW50LnNlcmlhbGl6ZVsnYXBwbGljYXRpb24veG1sJ10gPSBmdW5jdGlvbihvYmope1xuICogICAgICAgcmV0dXJuICdnZW5lcmF0ZWQgeG1sIGhlcmUnO1xuICogICAgIH07XG4gKlxuICovXG5cbiByZXF1ZXN0LnNlcmlhbGl6ZSA9IHtcbiAgICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOiBzZXJpYWxpemUsXG4gICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5XG4gfTtcblxuIC8qKlxuICAqIERlZmF1bHQgcGFyc2Vycy5cbiAgKlxuICAqICAgICBzdXBlcmFnZW50LnBhcnNlWydhcHBsaWNhdGlvbi94bWwnXSA9IGZ1bmN0aW9uKHN0cil7XG4gICogICAgICAgcmV0dXJuIHsgb2JqZWN0IHBhcnNlZCBmcm9tIHN0ciB9O1xuICAqICAgICB9O1xuICAqXG4gICovXG5cbnJlcXVlc3QucGFyc2UgPSB7XG4gICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOiBwYXJzZVN0cmluZyxcbiAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnBhcnNlXG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBoZWFkZXIgYHN0cmAgaW50b1xuICogYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIG1hcHBlZCBmaWVsZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2VIZWFkZXIoc3RyKSB7XG4gIHZhciBsaW5lcyA9IHN0ci5zcGxpdCgvXFxyP1xcbi8pO1xuICB2YXIgZmllbGRzID0ge307XG4gIHZhciBpbmRleDtcbiAgdmFyIGxpbmU7XG4gIHZhciBmaWVsZDtcbiAgdmFyIHZhbDtcblxuICBsaW5lcy5wb3AoKTsgLy8gdHJhaWxpbmcgQ1JMRlxuXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGxpbmUgPSBsaW5lc1tpXTtcbiAgICBpbmRleCA9IGxpbmUuaW5kZXhPZignOicpO1xuICAgIGZpZWxkID0gbGluZS5zbGljZSgwLCBpbmRleCkudG9Mb3dlckNhc2UoKTtcbiAgICB2YWwgPSB0cmltKGxpbmUuc2xpY2UoaW5kZXggKyAxKSk7XG4gICAgZmllbGRzW2ZpZWxkXSA9IHZhbDtcbiAgfVxuXG4gIHJldHVybiBmaWVsZHM7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYG1pbWVgIGlzIGpzb24gb3IgaGFzICtqc29uIHN0cnVjdHVyZWQgc3ludGF4IHN1ZmZpeC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWltZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlzSlNPTihtaW1lKSB7XG4gIHJldHVybiAvW1xcLytdanNvblxcYi8udGVzdChtaW1lKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gdGhlIG1pbWUgdHlwZSBmb3IgdGhlIGdpdmVuIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHR5cGUoc3RyKXtcbiAgcmV0dXJuIHN0ci5zcGxpdCgvICo7ICovKS5zaGlmdCgpO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gaGVhZGVyIGZpZWxkIHBhcmFtZXRlcnMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyYW1zKHN0cil7XG4gIHJldHVybiByZWR1Y2Uoc3RyLnNwbGl0KC8gKjsgKi8pLCBmdW5jdGlvbihvYmosIHN0cil7XG4gICAgdmFyIHBhcnRzID0gc3RyLnNwbGl0KC8gKj0gKi8pXG4gICAgICAsIGtleSA9IHBhcnRzLnNoaWZ0KClcbiAgICAgICwgdmFsID0gcGFydHMuc2hpZnQoKTtcblxuICAgIGlmIChrZXkgJiYgdmFsKSBvYmpba2V5XSA9IHZhbDtcbiAgICByZXR1cm4gb2JqO1xuICB9LCB7fSk7XG59O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFJlc3BvbnNlYCB3aXRoIHRoZSBnaXZlbiBgeGhyYC5cbiAqXG4gKiAgLSBzZXQgZmxhZ3MgKC5vaywgLmVycm9yLCBldGMpXG4gKiAgLSBwYXJzZSBoZWFkZXJcbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgQWxpYXNpbmcgYHN1cGVyYWdlbnRgIGFzIGByZXF1ZXN0YCBpcyBuaWNlOlxuICpcbiAqICAgICAgcmVxdWVzdCA9IHN1cGVyYWdlbnQ7XG4gKlxuICogIFdlIGNhbiB1c2UgdGhlIHByb21pc2UtbGlrZSBBUEksIG9yIHBhc3MgY2FsbGJhY2tzOlxuICpcbiAqICAgICAgcmVxdWVzdC5nZXQoJy8nKS5lbmQoZnVuY3Rpb24ocmVzKXt9KTtcbiAqICAgICAgcmVxdWVzdC5nZXQoJy8nLCBmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqICBTZW5kaW5nIGRhdGEgY2FuIGJlIGNoYWluZWQ6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJylcbiAqICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogIE9yIHBhc3NlZCB0byBgLnNlbmQoKWA6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJylcbiAqICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSwgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiAgT3IgcGFzc2VkIHRvIGAucG9zdCgpYDpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInLCB7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogT3IgZnVydGhlciByZWR1Y2VkIHRvIGEgc2luZ2xlIGNhbGwgZm9yIHNpbXBsZSBjYXNlczpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInLCB7IG5hbWU6ICd0aicgfSwgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiBAcGFyYW0ge1hNTEhUVFBSZXF1ZXN0fSB4aHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBSZXNwb25zZShyZXEsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHRoaXMucmVxID0gcmVxO1xuICB0aGlzLnhociA9IHRoaXMucmVxLnhocjtcbiAgLy8gcmVzcG9uc2VUZXh0IGlzIGFjY2Vzc2libGUgb25seSBpZiByZXNwb25zZVR5cGUgaXMgJycgb3IgJ3RleHQnIGFuZCBvbiBvbGRlciBicm93c2Vyc1xuICB0aGlzLnRleHQgPSAoKHRoaXMucmVxLm1ldGhvZCAhPSdIRUFEJyAmJiAodGhpcy54aHIucmVzcG9uc2VUeXBlID09PSAnJyB8fCB0aGlzLnhoci5yZXNwb25zZVR5cGUgPT09ICd0ZXh0JykpIHx8IHR5cGVvZiB0aGlzLnhoci5yZXNwb25zZVR5cGUgPT09ICd1bmRlZmluZWQnKVxuICAgICA/IHRoaXMueGhyLnJlc3BvbnNlVGV4dFxuICAgICA6IG51bGw7XG4gIHRoaXMuc3RhdHVzVGV4dCA9IHRoaXMucmVxLnhoci5zdGF0dXNUZXh0O1xuICB0aGlzLnNldFN0YXR1c1Byb3BlcnRpZXModGhpcy54aHIuc3RhdHVzKTtcbiAgdGhpcy5oZWFkZXIgPSB0aGlzLmhlYWRlcnMgPSBwYXJzZUhlYWRlcih0aGlzLnhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSk7XG4gIC8vIGdldEFsbFJlc3BvbnNlSGVhZGVycyBzb21ldGltZXMgZmFsc2VseSByZXR1cm5zIFwiXCIgZm9yIENPUlMgcmVxdWVzdHMsIGJ1dFxuICAvLyBnZXRSZXNwb25zZUhlYWRlciBzdGlsbCB3b3Jrcy4gc28gd2UgZ2V0IGNvbnRlbnQtdHlwZSBldmVuIGlmIGdldHRpbmdcbiAgLy8gb3RoZXIgaGVhZGVycyBmYWlscy5cbiAgdGhpcy5oZWFkZXJbJ2NvbnRlbnQtdHlwZSddID0gdGhpcy54aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ2NvbnRlbnQtdHlwZScpO1xuICB0aGlzLnNldEhlYWRlclByb3BlcnRpZXModGhpcy5oZWFkZXIpO1xuICB0aGlzLmJvZHkgPSB0aGlzLnJlcS5tZXRob2QgIT0gJ0hFQUQnXG4gICAgPyB0aGlzLnBhcnNlQm9keSh0aGlzLnRleHQgPyB0aGlzLnRleHQgOiB0aGlzLnhoci5yZXNwb25zZSlcbiAgICA6IG51bGw7XG59XG5cbi8qKlxuICogR2V0IGNhc2UtaW5zZW5zaXRpdmUgYGZpZWxkYCB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVzcG9uc2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGZpZWxkKXtcbiAgcmV0dXJuIHRoaXMuaGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xufTtcblxuLyoqXG4gKiBTZXQgaGVhZGVyIHJlbGF0ZWQgcHJvcGVydGllczpcbiAqXG4gKiAgIC0gYC50eXBlYCB0aGUgY29udGVudCB0eXBlIHdpdGhvdXQgcGFyYW1zXG4gKlxuICogQSByZXNwb25zZSBvZiBcIkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOFwiXG4gKiB3aWxsIHByb3ZpZGUgeW91IHdpdGggYSBgLnR5cGVgIG9mIFwidGV4dC9wbGFpblwiLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBoZWFkZXJcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS5zZXRIZWFkZXJQcm9wZXJ0aWVzID0gZnVuY3Rpb24oaGVhZGVyKXtcbiAgLy8gY29udGVudC10eXBlXG4gIHZhciBjdCA9IHRoaXMuaGVhZGVyWydjb250ZW50LXR5cGUnXSB8fCAnJztcbiAgdGhpcy50eXBlID0gdHlwZShjdCk7XG5cbiAgLy8gcGFyYW1zXG4gIHZhciBvYmogPSBwYXJhbXMoY3QpO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB0aGlzW2tleV0gPSBvYmpba2V5XTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGJvZHkgYHN0cmAuXG4gKlxuICogVXNlZCBmb3IgYXV0by1wYXJzaW5nIG9mIGJvZGllcy4gUGFyc2Vyc1xuICogYXJlIGRlZmluZWQgb24gdGhlIGBzdXBlcmFnZW50LnBhcnNlYCBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TWl4ZWR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUucGFyc2VCb2R5ID0gZnVuY3Rpb24oc3RyKXtcbiAgdmFyIHBhcnNlID0gcmVxdWVzdC5wYXJzZVt0aGlzLnR5cGVdO1xuICBpZiAoIXBhcnNlICYmIGlzSlNPTih0aGlzLnR5cGUpKSB7XG4gICAgcGFyc2UgPSByZXF1ZXN0LnBhcnNlWydhcHBsaWNhdGlvbi9qc29uJ107XG4gIH1cbiAgcmV0dXJuIHBhcnNlICYmIHN0ciAmJiAoc3RyLmxlbmd0aCB8fCBzdHIgaW5zdGFuY2VvZiBPYmplY3QpXG4gICAgPyBwYXJzZShzdHIpXG4gICAgOiBudWxsO1xufTtcblxuLyoqXG4gKiBTZXQgZmxhZ3Mgc3VjaCBhcyBgLm9rYCBiYXNlZCBvbiBgc3RhdHVzYC5cbiAqXG4gKiBGb3IgZXhhbXBsZSBhIDJ4eCByZXNwb25zZSB3aWxsIGdpdmUgeW91IGEgYC5va2Agb2YgX190cnVlX19cbiAqIHdoZXJlYXMgNXh4IHdpbGwgYmUgX19mYWxzZV9fIGFuZCBgLmVycm9yYCB3aWxsIGJlIF9fdHJ1ZV9fLiBUaGVcbiAqIGAuY2xpZW50RXJyb3JgIGFuZCBgLnNlcnZlckVycm9yYCBhcmUgYWxzbyBhdmFpbGFibGUgdG8gYmUgbW9yZVxuICogc3BlY2lmaWMsIGFuZCBgLnN0YXR1c1R5cGVgIGlzIHRoZSBjbGFzcyBvZiBlcnJvciByYW5naW5nIGZyb20gMS4uNVxuICogc29tZXRpbWVzIHVzZWZ1bCBmb3IgbWFwcGluZyByZXNwb25kIGNvbG9ycyBldGMuXG4gKlxuICogXCJzdWdhclwiIHByb3BlcnRpZXMgYXJlIGFsc28gZGVmaW5lZCBmb3IgY29tbW9uIGNhc2VzLiBDdXJyZW50bHkgcHJvdmlkaW5nOlxuICpcbiAqICAgLSAubm9Db250ZW50XG4gKiAgIC0gLmJhZFJlcXVlc3RcbiAqICAgLSAudW5hdXRob3JpemVkXG4gKiAgIC0gLm5vdEFjY2VwdGFibGVcbiAqICAgLSAubm90Rm91bmRcbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gc3RhdHVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUuc2V0U3RhdHVzUHJvcGVydGllcyA9IGZ1bmN0aW9uKHN0YXR1cyl7XG4gIC8vIGhhbmRsZSBJRTkgYnVnOiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEwMDQ2OTcyL21zaWUtcmV0dXJucy1zdGF0dXMtY29kZS1vZi0xMjIzLWZvci1hamF4LXJlcXVlc3RcbiAgaWYgKHN0YXR1cyA9PT0gMTIyMykge1xuICAgIHN0YXR1cyA9IDIwNDtcbiAgfVxuXG4gIHZhciB0eXBlID0gc3RhdHVzIC8gMTAwIHwgMDtcblxuICAvLyBzdGF0dXMgLyBjbGFzc1xuICB0aGlzLnN0YXR1cyA9IHRoaXMuc3RhdHVzQ29kZSA9IHN0YXR1cztcbiAgdGhpcy5zdGF0dXNUeXBlID0gdHlwZTtcblxuICAvLyBiYXNpY3NcbiAgdGhpcy5pbmZvID0gMSA9PSB0eXBlO1xuICB0aGlzLm9rID0gMiA9PSB0eXBlO1xuICB0aGlzLmNsaWVudEVycm9yID0gNCA9PSB0eXBlO1xuICB0aGlzLnNlcnZlckVycm9yID0gNSA9PSB0eXBlO1xuICB0aGlzLmVycm9yID0gKDQgPT0gdHlwZSB8fCA1ID09IHR5cGUpXG4gICAgPyB0aGlzLnRvRXJyb3IoKVxuICAgIDogZmFsc2U7XG5cbiAgLy8gc3VnYXJcbiAgdGhpcy5hY2NlcHRlZCA9IDIwMiA9PSBzdGF0dXM7XG4gIHRoaXMubm9Db250ZW50ID0gMjA0ID09IHN0YXR1cztcbiAgdGhpcy5iYWRSZXF1ZXN0ID0gNDAwID09IHN0YXR1cztcbiAgdGhpcy51bmF1dGhvcml6ZWQgPSA0MDEgPT0gc3RhdHVzO1xuICB0aGlzLm5vdEFjY2VwdGFibGUgPSA0MDYgPT0gc3RhdHVzO1xuICB0aGlzLm5vdEZvdW5kID0gNDA0ID09IHN0YXR1cztcbiAgdGhpcy5mb3JiaWRkZW4gPSA0MDMgPT0gc3RhdHVzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gYEVycm9yYCByZXByZXNlbnRhdGl2ZSBvZiB0aGlzIHJlc3BvbnNlLlxuICpcbiAqIEByZXR1cm4ge0Vycm9yfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUudG9FcnJvciA9IGZ1bmN0aW9uKCl7XG4gIHZhciByZXEgPSB0aGlzLnJlcTtcbiAgdmFyIG1ldGhvZCA9IHJlcS5tZXRob2Q7XG4gIHZhciB1cmwgPSByZXEudXJsO1xuXG4gIHZhciBtc2cgPSAnY2Fubm90ICcgKyBtZXRob2QgKyAnICcgKyB1cmwgKyAnICgnICsgdGhpcy5zdGF0dXMgKyAnKSc7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IobXNnKTtcbiAgZXJyLnN0YXR1cyA9IHRoaXMuc3RhdHVzO1xuICBlcnIubWV0aG9kID0gbWV0aG9kO1xuICBlcnIudXJsID0gdXJsO1xuXG4gIHJldHVybiBlcnI7XG59O1xuXG4vKipcbiAqIEV4cG9zZSBgUmVzcG9uc2VgLlxuICovXG5cbnJlcXVlc3QuUmVzcG9uc2UgPSBSZXNwb25zZTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSZXF1ZXN0YCB3aXRoIHRoZSBnaXZlbiBgbWV0aG9kYCBhbmQgYHVybGAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBSZXF1ZXN0KG1ldGhvZCwgdXJsKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fcXVlcnkgPSB0aGlzLl9xdWVyeSB8fCBbXTtcbiAgdGhpcy5tZXRob2QgPSBtZXRob2Q7XG4gIHRoaXMudXJsID0gdXJsO1xuICB0aGlzLmhlYWRlciA9IHt9OyAvLyBwcmVzZXJ2ZXMgaGVhZGVyIG5hbWUgY2FzZVxuICB0aGlzLl9oZWFkZXIgPSB7fTsgLy8gY29lcmNlcyBoZWFkZXIgbmFtZXMgdG8gbG93ZXJjYXNlXG4gIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIGVyciA9IG51bGw7XG4gICAgdmFyIHJlcyA9IG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgcmVzID0gbmV3IFJlc3BvbnNlKHNlbGYpO1xuICAgIH0gY2F0Y2goZSkge1xuICAgICAgZXJyID0gbmV3IEVycm9yKCdQYXJzZXIgaXMgdW5hYmxlIHRvIHBhcnNlIHRoZSByZXNwb25zZScpO1xuICAgICAgZXJyLnBhcnNlID0gdHJ1ZTtcbiAgICAgIGVyci5vcmlnaW5hbCA9IGU7XG4gICAgICAvLyBpc3N1ZSAjNjc1OiByZXR1cm4gdGhlIHJhdyByZXNwb25zZSBpZiB0aGUgcmVzcG9uc2UgcGFyc2luZyBmYWlsc1xuICAgICAgZXJyLnJhd1Jlc3BvbnNlID0gc2VsZi54aHIgJiYgc2VsZi54aHIucmVzcG9uc2VUZXh0ID8gc2VsZi54aHIucmVzcG9uc2VUZXh0IDogbnVsbDtcbiAgICAgIC8vIGlzc3VlICM4NzY6IHJldHVybiB0aGUgaHR0cCBzdGF0dXMgY29kZSBpZiB0aGUgcmVzcG9uc2UgcGFyc2luZyBmYWlsc1xuICAgICAgZXJyLnN0YXR1c0NvZGUgPSBzZWxmLnhociAmJiBzZWxmLnhoci5zdGF0dXMgPyBzZWxmLnhoci5zdGF0dXMgOiBudWxsO1xuICAgICAgcmV0dXJuIHNlbGYuY2FsbGJhY2soZXJyKTtcbiAgICB9XG5cbiAgICBzZWxmLmVtaXQoJ3Jlc3BvbnNlJywgcmVzKTtcblxuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiBzZWxmLmNhbGxiYWNrKGVyciwgcmVzKTtcbiAgICB9XG5cbiAgICBpZiAocmVzLnN0YXR1cyA+PSAyMDAgJiYgcmVzLnN0YXR1cyA8IDMwMCkge1xuICAgICAgcmV0dXJuIHNlbGYuY2FsbGJhY2soZXJyLCByZXMpO1xuICAgIH1cblxuICAgIHZhciBuZXdfZXJyID0gbmV3IEVycm9yKHJlcy5zdGF0dXNUZXh0IHx8ICdVbnN1Y2Nlc3NmdWwgSFRUUCByZXNwb25zZScpO1xuICAgIG5ld19lcnIub3JpZ2luYWwgPSBlcnI7XG4gICAgbmV3X2Vyci5yZXNwb25zZSA9IHJlcztcbiAgICBuZXdfZXJyLnN0YXR1cyA9IHJlcy5zdGF0dXM7XG5cbiAgICBzZWxmLmNhbGxiYWNrKG5ld19lcnIsIHJlcyk7XG4gIH0pO1xufVxuXG4vKipcbiAqIE1peGluIGBFbWl0dGVyYCBhbmQgYHJlcXVlc3RCYXNlYC5cbiAqL1xuXG5FbWl0dGVyKFJlcXVlc3QucHJvdG90eXBlKTtcbmZvciAodmFyIGtleSBpbiByZXF1ZXN0QmFzZSkge1xuICBSZXF1ZXN0LnByb3RvdHlwZVtrZXldID0gcmVxdWVzdEJhc2Vba2V5XTtcbn1cblxuLyoqXG4gKiBBYm9ydCB0aGUgcmVxdWVzdCwgYW5kIGNsZWFyIHBvdGVudGlhbCB0aW1lb3V0LlxuICpcbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmFib3J0ID0gZnVuY3Rpb24oKXtcbiAgaWYgKHRoaXMuYWJvcnRlZCkgcmV0dXJuO1xuICB0aGlzLmFib3J0ZWQgPSB0cnVlO1xuICB0aGlzLnhoci5hYm9ydCgpO1xuICB0aGlzLmNsZWFyVGltZW91dCgpO1xuICB0aGlzLmVtaXQoJ2Fib3J0Jyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgQ29udGVudC1UeXBlIHRvIGB0eXBlYCwgbWFwcGluZyB2YWx1ZXMgZnJvbSBgcmVxdWVzdC50eXBlc2AuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICBzdXBlcmFnZW50LnR5cGVzLnhtbCA9ICdhcHBsaWNhdGlvbi94bWwnO1xuICpcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvJylcbiAqICAgICAgICAudHlwZSgneG1sJylcbiAqICAgICAgICAuc2VuZCh4bWxzdHJpbmcpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXF1ZXN0LnBvc3QoJy8nKVxuICogICAgICAgIC50eXBlKCdhcHBsaWNhdGlvbi94bWwnKVxuICogICAgICAgIC5zZW5kKHhtbHN0cmluZylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnR5cGUgPSBmdW5jdGlvbih0eXBlKXtcbiAgdGhpcy5zZXQoJ0NvbnRlbnQtVHlwZScsIHJlcXVlc3QudHlwZXNbdHlwZV0gfHwgdHlwZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgcmVzcG9uc2VUeXBlIHRvIGB2YWxgLiBQcmVzZW50bHkgdmFsaWQgcmVzcG9uc2VUeXBlcyBhcmUgJ2Jsb2InIGFuZCBcbiAqICdhcnJheWJ1ZmZlcicuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAucmVzcG9uc2VUeXBlKCdibG9iJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUucmVzcG9uc2VUeXBlID0gZnVuY3Rpb24odmFsKXtcbiAgdGhpcy5fcmVzcG9uc2VUeXBlID0gdmFsO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IEFjY2VwdCB0byBgdHlwZWAsIG1hcHBpbmcgdmFsdWVzIGZyb20gYHJlcXVlc3QudHlwZXNgLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgc3VwZXJhZ2VudC50eXBlcy5qc29uID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuICpcbiAqICAgICAgcmVxdWVzdC5nZXQoJy9hZ2VudCcpXG4gKiAgICAgICAgLmFjY2VwdCgnanNvbicpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXF1ZXN0LmdldCgnL2FnZW50JylcbiAqICAgICAgICAuYWNjZXB0KCdhcHBsaWNhdGlvbi9qc29uJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYWNjZXB0XG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYWNjZXB0ID0gZnVuY3Rpb24odHlwZSl7XG4gIHRoaXMuc2V0KCdBY2NlcHQnLCByZXF1ZXN0LnR5cGVzW3R5cGVdIHx8IHR5cGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IEF1dGhvcml6YXRpb24gZmllbGQgdmFsdWUgd2l0aCBgdXNlcmAgYW5kIGBwYXNzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlclxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3NcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIHdpdGggJ3R5cGUnIHByb3BlcnR5ICdhdXRvJyBvciAnYmFzaWMnIChkZWZhdWx0ICdiYXNpYycpXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIG9wdGlvbnMpe1xuICBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0ge1xuICAgICAgdHlwZTogJ2Jhc2ljJ1xuICAgIH1cbiAgfVxuXG4gIHN3aXRjaCAob3B0aW9ucy50eXBlKSB7XG4gICAgY2FzZSAnYmFzaWMnOlxuICAgICAgdmFyIHN0ciA9IGJ0b2EodXNlciArICc6JyArIHBhc3MpO1xuICAgICAgdGhpcy5zZXQoJ0F1dGhvcml6YXRpb24nLCAnQmFzaWMgJyArIHN0cik7XG4gICAgYnJlYWs7XG5cbiAgICBjYXNlICdhdXRvJzpcbiAgICAgIHRoaXMudXNlcm5hbWUgPSB1c2VyO1xuICAgICAgdGhpcy5wYXNzd29yZCA9IHBhc3M7XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiogQWRkIHF1ZXJ5LXN0cmluZyBgdmFsYC5cbipcbiogRXhhbXBsZXM6XG4qXG4qICAgcmVxdWVzdC5nZXQoJy9zaG9lcycpXG4qICAgICAucXVlcnkoJ3NpemU9MTAnKVxuKiAgICAgLnF1ZXJ5KHsgY29sb3I6ICdibHVlJyB9KVxuKlxuKiBAcGFyYW0ge09iamVjdHxTdHJpbmd9IHZhbFxuKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiogQGFwaSBwdWJsaWNcbiovXG5cblJlcXVlc3QucHJvdG90eXBlLnF1ZXJ5ID0gZnVuY3Rpb24odmFsKXtcbiAgaWYgKCdzdHJpbmcnICE9IHR5cGVvZiB2YWwpIHZhbCA9IHNlcmlhbGl6ZSh2YWwpO1xuICBpZiAodmFsKSB0aGlzLl9xdWVyeS5wdXNoKHZhbCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBRdWV1ZSB0aGUgZ2l2ZW4gYGZpbGVgIGFzIGFuIGF0dGFjaG1lbnQgdG8gdGhlIHNwZWNpZmllZCBgZmllbGRgLFxuICogd2l0aCBvcHRpb25hbCBgZmlsZW5hbWVgLlxuICpcbiAqIGBgYCBqc1xuICogcmVxdWVzdC5wb3N0KCcvdXBsb2FkJylcbiAqICAgLmF0dGFjaChuZXcgQmxvYihbJzxhIGlkPVwiYVwiPjxiIGlkPVwiYlwiPmhleSE8L2I+PC9hPiddLCB7IHR5cGU6IFwidGV4dC9odG1sXCJ9KSlcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEBwYXJhbSB7QmxvYnxGaWxlfSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWVcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihmaWVsZCwgZmlsZSwgZmlsZW5hbWUpe1xuICB0aGlzLl9nZXRGb3JtRGF0YSgpLmFwcGVuZChmaWVsZCwgZmlsZSwgZmlsZW5hbWUgfHwgZmlsZS5uYW1lKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fZ2V0Rm9ybURhdGEgPSBmdW5jdGlvbigpe1xuICBpZiAoIXRoaXMuX2Zvcm1EYXRhKSB7XG4gICAgdGhpcy5fZm9ybURhdGEgPSBuZXcgcm9vdC5Gb3JtRGF0YSgpO1xuICB9XG4gIHJldHVybiB0aGlzLl9mb3JtRGF0YTtcbn07XG5cbi8qKlxuICogU2VuZCBgZGF0YWAgYXMgdGhlIHJlcXVlc3QgYm9keSwgZGVmYXVsdGluZyB0aGUgYC50eXBlKClgIHRvIFwianNvblwiIHdoZW5cbiAqIGFuIG9iamVjdCBpcyBnaXZlbi5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgICAvLyBtYW51YWwganNvblxuICogICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgIC50eXBlKCdqc29uJylcbiAqICAgICAgICAgLnNlbmQoJ3tcIm5hbWVcIjpcInRqXCJ9JylcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBhdXRvIGpzb25cbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBtYW51YWwgeC13d3ctZm9ybS11cmxlbmNvZGVkXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnR5cGUoJ2Zvcm0nKVxuICogICAgICAgICAuc2VuZCgnbmFtZT10aicpXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gYXV0byB4LXd3dy1mb3JtLXVybGVuY29kZWRcbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAudHlwZSgnZm9ybScpXG4gKiAgICAgICAgIC5zZW5kKHsgbmFtZTogJ3RqJyB9KVxuICogICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqICAgICAgIC8vIGRlZmF1bHRzIHRvIHgtd3d3LWZvcm0tdXJsZW5jb2RlZFxuICAqICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gICogICAgICAgIC5zZW5kKCduYW1lPXRvYmknKVxuICAqICAgICAgICAuc2VuZCgnc3BlY2llcz1mZXJyZXQnKVxuICAqICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gZGF0YVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihkYXRhKXtcbiAgdmFyIG9iaiA9IGlzT2JqZWN0KGRhdGEpO1xuICB2YXIgdHlwZSA9IHRoaXMuX2hlYWRlclsnY29udGVudC10eXBlJ107XG5cbiAgLy8gbWVyZ2VcbiAgaWYgKG9iaiAmJiBpc09iamVjdCh0aGlzLl9kYXRhKSkge1xuICAgIGZvciAodmFyIGtleSBpbiBkYXRhKSB7XG4gICAgICB0aGlzLl9kYXRhW2tleV0gPSBkYXRhW2tleV07XG4gICAgfVxuICB9IGVsc2UgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBkYXRhKSB7XG4gICAgaWYgKCF0eXBlKSB0aGlzLnR5cGUoJ2Zvcm0nKTtcbiAgICB0eXBlID0gdGhpcy5faGVhZGVyWydjb250ZW50LXR5cGUnXTtcbiAgICBpZiAoJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcgPT0gdHlwZSkge1xuICAgICAgdGhpcy5fZGF0YSA9IHRoaXMuX2RhdGFcbiAgICAgICAgPyB0aGlzLl9kYXRhICsgJyYnICsgZGF0YVxuICAgICAgICA6IGRhdGE7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX2RhdGEgPSAodGhpcy5fZGF0YSB8fCAnJykgKyBkYXRhO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgfVxuXG4gIGlmICghb2JqIHx8IGlzSG9zdChkYXRhKSkgcmV0dXJuIHRoaXM7XG4gIGlmICghdHlwZSkgdGhpcy50eXBlKCdqc29uJyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZFxuICovXG5SZXNwb25zZS5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbiBzZXJpYWxpemUoZm4pe1xuICBpZiAocm9vdC5jb25zb2xlKSB7XG4gICAgY29uc29sZS53YXJuKFwiQ2xpZW50LXNpZGUgcGFyc2UoKSBtZXRob2QgaGFzIGJlZW4gcmVuYW1lZCB0byBzZXJpYWxpemUoKS4gVGhpcyBtZXRob2QgaXMgbm90IGNvbXBhdGlibGUgd2l0aCBzdXBlcmFnZW50IHYyLjBcIik7XG4gIH1cbiAgdGhpcy5zZXJpYWxpemUoZm4pO1xuICByZXR1cm4gdGhpcztcbn07XG5cblJlc3BvbnNlLnByb3RvdHlwZS5zZXJpYWxpemUgPSBmdW5jdGlvbiBzZXJpYWxpemUoZm4pe1xuICB0aGlzLl9wYXJzZXIgPSBmbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCBgZXJyYCBhbmQgYHJlc2BcbiAqIGFuZCBoYW5kbGUgYXJpdHkgY2hlY2suXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAcGFyYW0ge1Jlc3BvbnNlfSByZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNhbGxiYWNrID0gZnVuY3Rpb24oZXJyLCByZXMpe1xuICB2YXIgZm4gPSB0aGlzLl9jYWxsYmFjaztcbiAgdGhpcy5jbGVhclRpbWVvdXQoKTtcbiAgZm4oZXJyLCByZXMpO1xufTtcblxuLyoqXG4gKiBJbnZva2UgY2FsbGJhY2sgd2l0aCB4LWRvbWFpbiBlcnJvci5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5jcm9zc0RvbWFpbkVycm9yID0gZnVuY3Rpb24oKXtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignUmVxdWVzdCBoYXMgYmVlbiB0ZXJtaW5hdGVkXFxuUG9zc2libGUgY2F1c2VzOiB0aGUgbmV0d29yayBpcyBvZmZsaW5lLCBPcmlnaW4gaXMgbm90IGFsbG93ZWQgYnkgQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luLCB0aGUgcGFnZSBpcyBiZWluZyB1bmxvYWRlZCwgZXRjLicpO1xuICBlcnIuY3Jvc3NEb21haW4gPSB0cnVlO1xuXG4gIGVyci5zdGF0dXMgPSB0aGlzLnN0YXR1cztcbiAgZXJyLm1ldGhvZCA9IHRoaXMubWV0aG9kO1xuICBlcnIudXJsID0gdGhpcy51cmw7XG5cbiAgdGhpcy5jYWxsYmFjayhlcnIpO1xufTtcblxuLyoqXG4gKiBJbnZva2UgY2FsbGJhY2sgd2l0aCB0aW1lb3V0IGVycm9yLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnRpbWVvdXRFcnJvciA9IGZ1bmN0aW9uKCl7XG4gIHZhciB0aW1lb3V0ID0gdGhpcy5fdGltZW91dDtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcigndGltZW91dCBvZiAnICsgdGltZW91dCArICdtcyBleGNlZWRlZCcpO1xuICBlcnIudGltZW91dCA9IHRpbWVvdXQ7XG4gIHRoaXMuY2FsbGJhY2soZXJyKTtcbn07XG5cbi8qKlxuICogRW5hYmxlIHRyYW5zbWlzc2lvbiBvZiBjb29raWVzIHdpdGggeC1kb21haW4gcmVxdWVzdHMuXG4gKlxuICogTm90ZSB0aGF0IGZvciB0aGlzIHRvIHdvcmsgdGhlIG9yaWdpbiBtdXN0IG5vdCBiZVxuICogdXNpbmcgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIiB3aXRoIGEgd2lsZGNhcmQsXG4gKiBhbmQgYWxzbyBtdXN0IHNldCBcIkFjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzXCJcbiAqIHRvIFwidHJ1ZVwiLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUud2l0aENyZWRlbnRpYWxzID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5fd2l0aENyZWRlbnRpYWxzID0gdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEluaXRpYXRlIHJlcXVlc3QsIGludm9raW5nIGNhbGxiYWNrIGBmbihyZXMpYFxuICogd2l0aCBhbiBpbnN0YW5jZW9mIGBSZXNwb25zZWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHhociA9IHRoaXMueGhyID0gcmVxdWVzdC5nZXRYSFIoKTtcbiAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnkuam9pbignJicpO1xuICB2YXIgdGltZW91dCA9IHRoaXMuX3RpbWVvdXQ7XG4gIHZhciBkYXRhID0gdGhpcy5fZm9ybURhdGEgfHwgdGhpcy5fZGF0YTtcblxuICAvLyBzdG9yZSBjYWxsYmFja1xuICB0aGlzLl9jYWxsYmFjayA9IGZuIHx8IG5vb3A7XG5cbiAgLy8gc3RhdGUgY2hhbmdlXG4gIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpe1xuICAgIGlmICg0ICE9IHhoci5yZWFkeVN0YXRlKSByZXR1cm47XG5cbiAgICAvLyBJbiBJRTksIHJlYWRzIHRvIGFueSBwcm9wZXJ0eSAoZS5nLiBzdGF0dXMpIG9mZiBvZiBhbiBhYm9ydGVkIFhIUiB3aWxsXG4gICAgLy8gcmVzdWx0IGluIHRoZSBlcnJvciBcIkNvdWxkIG5vdCBjb21wbGV0ZSB0aGUgb3BlcmF0aW9uIGR1ZSB0byBlcnJvciBjMDBjMDIzZlwiXG4gICAgdmFyIHN0YXR1cztcbiAgICB0cnkgeyBzdGF0dXMgPSB4aHIuc3RhdHVzIH0gY2F0Y2goZSkgeyBzdGF0dXMgPSAwOyB9XG5cbiAgICBpZiAoMCA9PSBzdGF0dXMpIHtcbiAgICAgIGlmIChzZWxmLnRpbWVkb3V0KSByZXR1cm4gc2VsZi50aW1lb3V0RXJyb3IoKTtcbiAgICAgIGlmIChzZWxmLmFib3J0ZWQpIHJldHVybjtcbiAgICAgIHJldHVybiBzZWxmLmNyb3NzRG9tYWluRXJyb3IoKTtcbiAgICB9XG4gICAgc2VsZi5lbWl0KCdlbmQnKTtcbiAgfTtcblxuICAvLyBwcm9ncmVzc1xuICB2YXIgaGFuZGxlUHJvZ3Jlc3MgPSBmdW5jdGlvbihlKXtcbiAgICBpZiAoZS50b3RhbCA+IDApIHtcbiAgICAgIGUucGVyY2VudCA9IGUubG9hZGVkIC8gZS50b3RhbCAqIDEwMDtcbiAgICB9XG4gICAgZS5kaXJlY3Rpb24gPSAnZG93bmxvYWQnO1xuICAgIHNlbGYuZW1pdCgncHJvZ3Jlc3MnLCBlKTtcbiAgfTtcbiAgaWYgKHRoaXMuaGFzTGlzdGVuZXJzKCdwcm9ncmVzcycpKSB7XG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBoYW5kbGVQcm9ncmVzcztcbiAgfVxuICB0cnkge1xuICAgIGlmICh4aHIudXBsb2FkICYmIHRoaXMuaGFzTGlzdGVuZXJzKCdwcm9ncmVzcycpKSB7XG4gICAgICB4aHIudXBsb2FkLm9ucHJvZ3Jlc3MgPSBoYW5kbGVQcm9ncmVzcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge1xuICAgIC8vIEFjY2Vzc2luZyB4aHIudXBsb2FkIGZhaWxzIGluIElFIGZyb20gYSB3ZWIgd29ya2VyLCBzbyBqdXN0IHByZXRlbmQgaXQgZG9lc24ndCBleGlzdC5cbiAgICAvLyBSZXBvcnRlZCBoZXJlOlxuICAgIC8vIGh0dHBzOi8vY29ubmVjdC5taWNyb3NvZnQuY29tL0lFL2ZlZWRiYWNrL2RldGFpbHMvODM3MjQ1L3htbGh0dHByZXF1ZXN0LXVwbG9hZC10aHJvd3MtaW52YWxpZC1hcmd1bWVudC13aGVuLXVzZWQtZnJvbS13ZWItd29ya2VyLWNvbnRleHRcbiAgfVxuXG4gIC8vIHRpbWVvdXRcbiAgaWYgKHRpbWVvdXQgJiYgIXRoaXMuX3RpbWVyKSB7XG4gICAgdGhpcy5fdGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICBzZWxmLnRpbWVkb3V0ID0gdHJ1ZTtcbiAgICAgIHNlbGYuYWJvcnQoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgfVxuXG4gIC8vIHF1ZXJ5c3RyaW5nXG4gIGlmIChxdWVyeSkge1xuICAgIHF1ZXJ5ID0gcmVxdWVzdC5zZXJpYWxpemVPYmplY3QocXVlcnkpO1xuICAgIHRoaXMudXJsICs9IH50aGlzLnVybC5pbmRleE9mKCc/JylcbiAgICAgID8gJyYnICsgcXVlcnlcbiAgICAgIDogJz8nICsgcXVlcnk7XG4gIH1cblxuICAvLyBpbml0aWF0ZSByZXF1ZXN0XG4gIGlmICh0aGlzLnVzZXJuYW1lICYmIHRoaXMucGFzc3dvcmQpIHtcbiAgICB4aHIub3Blbih0aGlzLm1ldGhvZCwgdGhpcy51cmwsIHRydWUsIHRoaXMudXNlcm5hbWUsIHRoaXMucGFzc3dvcmQpO1xuICB9IGVsc2Uge1xuICAgIHhoci5vcGVuKHRoaXMubWV0aG9kLCB0aGlzLnVybCwgdHJ1ZSk7XG4gIH1cblxuICAvLyBDT1JTXG4gIGlmICh0aGlzLl93aXRoQ3JlZGVudGlhbHMpIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlO1xuXG4gIC8vIGJvZHlcbiAgaWYgKCdHRVQnICE9IHRoaXMubWV0aG9kICYmICdIRUFEJyAhPSB0aGlzLm1ldGhvZCAmJiAnc3RyaW5nJyAhPSB0eXBlb2YgZGF0YSAmJiAhaXNIb3N0KGRhdGEpKSB7XG4gICAgLy8gc2VyaWFsaXplIHN0dWZmXG4gICAgdmFyIGNvbnRlbnRUeXBlID0gdGhpcy5faGVhZGVyWydjb250ZW50LXR5cGUnXTtcbiAgICB2YXIgc2VyaWFsaXplID0gdGhpcy5fcGFyc2VyIHx8IHJlcXVlc3Quc2VyaWFsaXplW2NvbnRlbnRUeXBlID8gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXSA6ICcnXTtcbiAgICBpZiAoIXNlcmlhbGl6ZSAmJiBpc0pTT04oY29udGVudFR5cGUpKSBzZXJpYWxpemUgPSByZXF1ZXN0LnNlcmlhbGl6ZVsnYXBwbGljYXRpb24vanNvbiddO1xuICAgIGlmIChzZXJpYWxpemUpIGRhdGEgPSBzZXJpYWxpemUoZGF0YSk7XG4gIH1cblxuICAvLyBzZXQgaGVhZGVyIGZpZWxkc1xuICBmb3IgKHZhciBmaWVsZCBpbiB0aGlzLmhlYWRlcikge1xuICAgIGlmIChudWxsID09IHRoaXMuaGVhZGVyW2ZpZWxkXSkgY29udGludWU7XG4gICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoZmllbGQsIHRoaXMuaGVhZGVyW2ZpZWxkXSk7XG4gIH1cblxuICBpZiAodGhpcy5fcmVzcG9uc2VUeXBlKSB7XG4gICAgeGhyLnJlc3BvbnNlVHlwZSA9IHRoaXMuX3Jlc3BvbnNlVHlwZTtcbiAgfVxuXG4gIC8vIHNlbmQgc3R1ZmZcbiAgdGhpcy5lbWl0KCdyZXF1ZXN0JywgdGhpcyk7XG5cbiAgLy8gSUUxMSB4aHIuc2VuZCh1bmRlZmluZWQpIHNlbmRzICd1bmRlZmluZWQnIHN0cmluZyBhcyBQT1NUIHBheWxvYWQgKGluc3RlYWQgb2Ygbm90aGluZylcbiAgLy8gV2UgbmVlZCBudWxsIGhlcmUgaWYgZGF0YSBpcyB1bmRlZmluZWRcbiAgeGhyLnNlbmQodHlwZW9mIGRhdGEgIT09ICd1bmRlZmluZWQnID8gZGF0YSA6IG51bGwpO1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBFeHBvc2UgYFJlcXVlc3RgLlxuICovXG5cbnJlcXVlc3QuUmVxdWVzdCA9IFJlcXVlc3Q7XG5cbi8qKlxuICogR0VUIGB1cmxgIHdpdGggb3B0aW9uYWwgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR8RnVuY3Rpb259IGRhdGEgb3IgZm5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LmdldCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnR0VUJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEucXVlcnkoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIEhFQUQgYHVybGAgd2l0aCBvcHRpb25hbCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZHxGdW5jdGlvbn0gZGF0YSBvciBmblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QuaGVhZCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnSEVBRCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIERFTEVURSBgdXJsYCB3aXRoIG9wdGlvbmFsIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVsKHVybCwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnREVMRVRFJywgdXJsKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG5cbnJlcXVlc3RbJ2RlbCddID0gZGVsO1xucmVxdWVzdFsnZGVsZXRlJ10gPSBkZWw7XG5cbi8qKlxuICogUEFUQ0ggYHVybGAgd2l0aCBvcHRpb25hbCBgZGF0YWAgYW5kIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfSBkYXRhXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5wYXRjaCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnUEFUQ0gnLCB1cmwpO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgZGF0YSkgZm4gPSBkYXRhLCBkYXRhID0gbnVsbDtcbiAgaWYgKGRhdGEpIHJlcS5zZW5kKGRhdGEpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcblxuLyoqXG4gKiBQT1NUIGB1cmxgIHdpdGggb3B0aW9uYWwgYGRhdGFgIGFuZCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZH0gZGF0YVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QucG9zdCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnUE9TVCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIFBVVCBgdXJsYCB3aXRoIG9wdGlvbmFsIGBkYXRhYCBhbmQgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR8RnVuY3Rpb259IGRhdGEgb3IgZm5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LnB1dCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnUFVUJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEuc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG4iLCIvKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGFuIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNPYmplY3Qob2JqKSB7XG4gIHJldHVybiBudWxsICE9IG9iaiAmJiAnb2JqZWN0JyA9PSB0eXBlb2Ygb2JqO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzT2JqZWN0O1xuIiwiLyoqXG4gKiBNb2R1bGUgb2YgbWl4ZWQtaW4gZnVuY3Rpb25zIHNoYXJlZCBiZXR3ZWVuIG5vZGUgYW5kIGNsaWVudCBjb2RlXG4gKi9cbnZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXMtb2JqZWN0Jyk7XG5cbi8qKlxuICogQ2xlYXIgcHJldmlvdXMgdGltZW91dC5cbiAqXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5jbGVhclRpbWVvdXQgPSBmdW5jdGlvbiBfY2xlYXJUaW1lb3V0KCl7XG4gIHRoaXMuX3RpbWVvdXQgPSAwO1xuICBjbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRm9yY2UgZ2l2ZW4gcGFyc2VyXG4gKlxuICogU2V0cyB0aGUgYm9keSBwYXJzZXIgbm8gbWF0dGVyIHR5cGUuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIHBhcnNlKGZuKXtcbiAgdGhpcy5fcGFyc2VyID0gZm47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGltZW91dCB0byBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMudGltZW91dCA9IGZ1bmN0aW9uIHRpbWVvdXQobXMpe1xuICB0aGlzLl90aW1lb3V0ID0gbXM7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBGYXV4IHByb21pc2Ugc3VwcG9ydFxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bGZpbGxcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJlamVjdFxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqL1xuXG5leHBvcnRzLnRoZW4gPSBmdW5jdGlvbiB0aGVuKGZ1bGZpbGwsIHJlamVjdCkge1xuICByZXR1cm4gdGhpcy5lbmQoZnVuY3Rpb24oZXJyLCByZXMpIHtcbiAgICBlcnIgPyByZWplY3QoZXJyKSA6IGZ1bGZpbGwocmVzKTtcbiAgfSk7XG59XG5cbi8qKlxuICogQWxsb3cgZm9yIGV4dGVuc2lvblxuICovXG5cbmV4cG9ydHMudXNlID0gZnVuY3Rpb24gdXNlKGZuKSB7XG4gIGZuKHRoaXMpO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vKipcbiAqIEdldCByZXF1ZXN0IGhlYWRlciBgZmllbGRgLlxuICogQ2FzZS1pbnNlbnNpdGl2ZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbihmaWVsZCl7XG4gIHJldHVybiB0aGlzLl9oZWFkZXJbZmllbGQudG9Mb3dlckNhc2UoKV07XG59O1xuXG4vKipcbiAqIEdldCBjYXNlLWluc2Vuc2l0aXZlIGhlYWRlciBgZmllbGRgIHZhbHVlLlxuICogVGhpcyBpcyBhIGRlcHJlY2F0ZWQgaW50ZXJuYWwgQVBJLiBVc2UgYC5nZXQoZmllbGQpYCBpbnN0ZWFkLlxuICpcbiAqIChnZXRIZWFkZXIgaXMgbm8gbG9uZ2VyIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgc3VwZXJhZ2VudCBjb2RlIGJhc2UpXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqIEBkZXByZWNhdGVkXG4gKi9cblxuZXhwb3J0cy5nZXRIZWFkZXIgPSBleHBvcnRzLmdldDtcblxuLyoqXG4gKiBTZXQgaGVhZGVyIGBmaWVsZGAgdG8gYHZhbGAsIG9yIG11bHRpcGxlIGZpZWxkcyB3aXRoIG9uZSBvYmplY3QuXG4gKiBDYXNlLWluc2Vuc2l0aXZlLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgcmVxLmdldCgnLycpXG4gKiAgICAgICAgLnNldCgnQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKVxuICogICAgICAgIC5zZXQoJ1gtQVBJLUtleScsICdmb29iYXInKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqICAgICAgcmVxLmdldCgnLycpXG4gKiAgICAgICAgLnNldCh7IEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nLCAnWC1BUEktS2V5JzogJ2Zvb2JhcicgfSlcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IGZpZWxkXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5zZXQgPSBmdW5jdGlvbihmaWVsZCwgdmFsKXtcbiAgaWYgKGlzT2JqZWN0KGZpZWxkKSkge1xuICAgIGZvciAodmFyIGtleSBpbiBmaWVsZCkge1xuICAgICAgdGhpcy5zZXQoa2V5LCBmaWVsZFtrZXldKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldID0gdmFsO1xuICB0aGlzLmhlYWRlcltmaWVsZF0gPSB2YWw7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgaGVhZGVyIGBmaWVsZGAuXG4gKiBDYXNlLWluc2Vuc2l0aXZlLlxuICpcbiAqIEV4YW1wbGU6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAudW5zZXQoJ1VzZXItQWdlbnQnKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICovXG5leHBvcnRzLnVuc2V0ID0gZnVuY3Rpb24oZmllbGQpe1xuICBkZWxldGUgdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xuICBkZWxldGUgdGhpcy5oZWFkZXJbZmllbGRdO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogV3JpdGUgdGhlIGZpZWxkIGBuYW1lYCBhbmQgYHZhbGAgZm9yIFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiXG4gKiByZXF1ZXN0IGJvZGllcy5cbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnL3VwbG9hZCcpXG4gKiAgIC5maWVsZCgnZm9vJywgJ2JhcicpXG4gKiAgIC5lbmQoY2FsbGJhY2spO1xuICogYGBgXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfEJsb2J8RmlsZXxCdWZmZXJ8ZnMuUmVhZFN0cmVhbX0gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cbmV4cG9ydHMuZmllbGQgPSBmdW5jdGlvbihuYW1lLCB2YWwpIHtcbiAgdGhpcy5fZ2V0Rm9ybURhdGEoKS5hcHBlbmQobmFtZSwgdmFsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuIiwiLy8gVGhlIG5vZGUgYW5kIGJyb3dzZXIgbW9kdWxlcyBleHBvc2UgdmVyc2lvbnMgb2YgdGhpcyB3aXRoIHRoZVxuLy8gYXBwcm9wcmlhdGUgY29uc3RydWN0b3IgZnVuY3Rpb24gYm91bmQgYXMgZmlyc3QgYXJndW1lbnRcbi8qKlxuICogSXNzdWUgYSByZXF1ZXN0OlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgIHJlcXVlc3QoJ0dFVCcsICcvdXNlcnMnKS5lbmQoY2FsbGJhY2spXG4gKiAgICByZXF1ZXN0KCcvdXNlcnMnKS5lbmQoY2FsbGJhY2spXG4gKiAgICByZXF1ZXN0KCcvdXNlcnMnLCBjYWxsYmFjaylcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ3xGdW5jdGlvbn0gdXJsIG9yIGNhbGxiYWNrXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiByZXF1ZXN0KFJlcXVlc3RDb25zdHJ1Y3RvciwgbWV0aG9kLCB1cmwpIHtcbiAgLy8gY2FsbGJhY2tcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIHVybCkge1xuICAgIHJldHVybiBuZXcgUmVxdWVzdENvbnN0cnVjdG9yKCdHRVQnLCBtZXRob2QpLmVuZCh1cmwpO1xuICB9XG5cbiAgLy8gdXJsIGZpcnN0XG4gIGlmICgyID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gbmV3IFJlcXVlc3RDb25zdHJ1Y3RvcignR0VUJywgbWV0aG9kKTtcbiAgfVxuXG4gIHJldHVybiBuZXcgUmVxdWVzdENvbnN0cnVjdG9yKG1ldGhvZCwgdXJsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZXF1ZXN0O1xuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyQW5hbHl0aWNzID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5hbmFseXRpY3MnLCBbJ2lvbmljJ10pXG5cbiAgLnZhbHVlKCdJT05JQ19BTkFMWVRJQ1NfVkVSU0lPTicsIElvbmljLkFuYWx5dGljcy52ZXJzaW9uKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNBbmFseXRpY3MnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJBbmFseXRpY3MpIHtcbiAgICAgIElvbmljQW5ndWxhckFuYWx5dGljcyA9IG5ldyBJb25pYy5BbmFseXRpY3MoXCJERUZFUl9SRUdJU1RFUlwiKTtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhckFuYWx5dGljcztcbiAgfV0pXG5cbiAgLmZhY3RvcnkoJ2RvbVNlcmlhbGl6ZXInLCBbZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzLkRPTVNlcmlhbGl6ZXIoKTtcbiAgfV0pXG5cbiAgLnJ1bihbJyRpb25pY0FuYWx5dGljcycsICckc3RhdGUnLCBmdW5jdGlvbigkaW9uaWNBbmFseXRpY3MsICRzdGF0ZSkge1xuICAgICRpb25pY0FuYWx5dGljcy5zZXRHbG9iYWxQcm9wZXJ0aWVzKGZ1bmN0aW9uKGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKSB7XG4gICAgICBpZiAoIWV2ZW50RGF0YS5fdWkpIHtcbiAgICAgICAgZXZlbnREYXRhLl91aSA9IHt9O1xuICAgICAgfVxuICAgICAgZXZlbnREYXRhLl91aS5hY3RpdmVfc3RhdGUgPSAkc3RhdGUuY3VycmVudC5uYW1lOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgfSk7XG4gIH1dKTtcblxuXG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmFuYWx5dGljcycpXG5cbiAgLnByb3ZpZGVyKCckaW9uaWNBdXRvVHJhY2snLFtmdW5jdGlvbigpIHtcblxuICAgIHZhciB0cmFja2Vyc0Rpc2FibGVkID0ge30sXG4gICAgICBhbGxUcmFja2Vyc0Rpc2FibGVkID0gZmFsc2U7XG5cbiAgICB0aGlzLmRpc2FibGVUcmFja2luZyA9IGZ1bmN0aW9uKHRyYWNrZXIpIHtcbiAgICAgIGlmICh0cmFja2VyKSB7XG4gICAgICAgIHRyYWNrZXJzRGlzYWJsZWRbdHJhY2tlcl0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWxsVHJhY2tlcnNEaXNhYmxlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMuJGdldCA9IFtmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIFwiaXNFbmFibGVkXCI6IGZ1bmN0aW9uKHRyYWNrZXIpIHtcbiAgICAgICAgICByZXR1cm4gIWFsbFRyYWNrZXJzRGlzYWJsZWQgJiYgIXRyYWNrZXJzRGlzYWJsZWRbdHJhY2tlcl07XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dKVxuXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQXV0byB0cmFja2Vyc1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cbiAgLnJ1bihbJyRpb25pY0F1dG9UcmFjaycsICckaW9uaWNBbmFseXRpY3MnLCBmdW5jdGlvbigkaW9uaWNBdXRvVHJhY2ssICRpb25pY0FuYWx5dGljcykge1xuICAgIGlmICghJGlvbmljQXV0b1RyYWNrLmlzRW5hYmxlZCgnTG9hZCcpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgICRpb25pY0FuYWx5dGljcy50cmFjaygnTG9hZCcpO1xuICB9XSlcblxuICAucnVuKFtcbiAgICAnJGlvbmljQXV0b1RyYWNrJyxcbiAgICAnJGRvY3VtZW50JyxcbiAgICAnJGlvbmljQW5hbHl0aWNzJyxcbiAgICAnZG9tU2VyaWFsaXplcicsXG4gICAgZnVuY3Rpb24oJGlvbmljQXV0b1RyYWNrLCAkZG9jdW1lbnQsICRpb25pY0FuYWx5dGljcywgZG9tU2VyaWFsaXplcikge1xuICAgICAgaWYgKCEkaW9uaWNBdXRvVHJhY2suaXNFbmFibGVkKCdUYXAnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgICRkb2N1bWVudC5vbignY2xpY2snLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAvLyB3YW50IGNvb3JkaW5hdGVzIGFzIGEgcGVyY2VudGFnZSByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnRcbiAgICAgICAgdmFyIGJveCA9IGV2ZW50LnRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgICB3aWR0aCA9IGJveC5yaWdodCAtIGJveC5sZWZ0LFxuICAgICAgICAgIGhlaWdodCA9IGJveC5ib3R0b20gLSBib3gudG9wLFxuICAgICAgICAgIG5vcm1YID0gKGV2ZW50LnBhZ2VYIC0gYm94LmxlZnQpIC8gd2lkdGgsXG4gICAgICAgICAgbm9ybVkgPSAoZXZlbnQucGFnZVkgLSBib3gudG9wKSAvIGhlaWdodDtcblxuICAgICAgICB2YXIgZXZlbnREYXRhID0ge1xuICAgICAgICAgIFwiY29vcmRpbmF0ZXNcIjoge1xuICAgICAgICAgICAgXCJ4XCI6IGV2ZW50LnBhZ2VYLFxuICAgICAgICAgICAgXCJ5XCI6IGV2ZW50LnBhZ2VZXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInRhcmdldFwiOiBkb21TZXJpYWxpemVyLmVsZW1lbnRTZWxlY3RvcihldmVudC50YXJnZXQpLFxuICAgICAgICAgIFwidGFyZ2V0X2lkZW50aWZpZXJcIjogZG9tU2VyaWFsaXplci5lbGVtZW50TmFtZShldmVudC50YXJnZXQpXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGlzRmluaXRlKG5vcm1YKSAmJiBpc0Zpbml0ZShub3JtWSkpIHtcbiAgICAgICAgICBldmVudERhdGEuY29vcmRpbmF0ZXMueF9ub3JtID0gbm9ybVg7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgICBldmVudERhdGEuY29vcmRpbmF0ZXMueV9ub3JtID0gbm9ybVk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgfVxuXG4gICAgICAgICRpb25pY0FuYWx5dGljcy50cmFjaygnVGFwJywge1xuICAgICAgICAgIFwiX3VpXCI6IGV2ZW50RGF0YVxuICAgICAgICB9KTtcblxuICAgICAgfSk7XG4gICAgfVxuICBdKVxuXG4gIC5ydW4oW1xuICAgICckaW9uaWNBdXRvVHJhY2snLFxuICAgICckaW9uaWNBbmFseXRpY3MnLFxuICAgICckcm9vdFNjb3BlJyxcbiAgICBmdW5jdGlvbigkaW9uaWNBdXRvVHJhY2ssICRpb25pY0FuYWx5dGljcywgJHJvb3RTY29wZSkge1xuICAgICAgaWYgKCEkaW9uaWNBdXRvVHJhY2suaXNFbmFibGVkKCdTdGF0ZSBDaGFuZ2UnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24oZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUsIGZyb21QYXJhbXMpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAkaW9uaWNBbmFseXRpY3MudHJhY2soJ1N0YXRlIENoYW5nZScsIHtcbiAgICAgICAgICBcImZyb21cIjogZnJvbVN0YXRlLm5hbWUsXG4gICAgICAgICAgXCJ0b1wiOiB0b1N0YXRlLm5hbWVcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gaW9uLXRyYWNrLSRFVkVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBAbmdkb2MgZGlyZWN0aXZlXG4gICAqIEBuYW1lIGlvblRyYWNrQ2xpY2tcbiAgICogQG1vZHVsZSBpb25pYy5zZXJ2aWNlLmFuYWx5dGljc1xuICAgKiBAcmVzdHJpY3QgQVxuICAgKiBAcGFyZW50IGlvbmljLmRpcmVjdGl2ZTppb25UcmFja0NsaWNrXG4gICAqXG4gICAqIEBkZXNjcmlwdGlvblxuICAgKlxuICAgKiBBIGNvbnZlbmllbnQgZGlyZWN0aXZlIHRvIGF1dG9tYXRpY2FsbHkgdHJhY2sgYSBjbGljay90YXAgb24gYSBidXR0b25cbiAgICogb3Igb3RoZXIgdGFwcGFibGUgZWxlbWVudC5cbiAgICpcbiAgICogQHVzYWdlXG4gICAqIGBgYGh0bWxcbiAgICogPGJ1dHRvbiBjbGFzcz1cImJ1dHRvbiBidXR0b24tY2xlYXJcIiBpb24tdHJhY2stY2xpY2sgaW9uLXRyYWNrLWV2ZW50PVwiY3RhLXRhcFwiPlRyeSBub3chPC9idXR0b24+XG4gICAqIGBgYFxuICAgKi9cblxuICAuZGlyZWN0aXZlKCdpb25UcmFja0NsaWNrJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2NsaWNrJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrVGFwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3RhcCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RvdWJsZXRhcCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkb3VibGV0YXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tIb2xkJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2hvbGQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tSZWxlYXNlJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3JlbGVhc2UnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWcnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnTGVmdCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFnbGVmdCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdSaWdodCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFncmlnaHQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnVXAnLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZ3VwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZ0Rvd24nLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZ2Rvd24nKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZUxlZnQnLCBpb25UcmFja0RpcmVjdGl2ZSgnc3dpcGVsZWZ0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVSaWdodCcsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZXJpZ2h0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVVcCcsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZXVwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVEb3duJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBlZG93bicpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1RyYW5zZm9ybScsIGlvblRyYWNrRGlyZWN0aXZlKCdob2xkJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUGluY2gnLCBpb25UcmFja0RpcmVjdGl2ZSgncGluY2gnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tQaW5jaEluJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3BpbmNoaW4nKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tQaW5jaE91dCcsIGlvblRyYWNrRGlyZWN0aXZlKCdwaW5jaG91dCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1JvdGF0ZScsIGlvblRyYWNrRGlyZWN0aXZlKCdyb3RhdGUnKSk7XG5cbiAgLyoqXG4gICAqIEdlbmVyaWMgZGlyZWN0aXZlIHRvIGNyZWF0ZSBhdXRvIGV2ZW50IGhhbmRsaW5nIGFuYWx5dGljcyBkaXJlY3RpdmVzIGxpa2U6XG4gICAqXG4gICAqIDxidXR0b24gaW9uLXRyYWNrLWNsaWNrPVwiZXZlbnROYW1lXCI+Q2xpY2sgVHJhY2s8L2J1dHRvbj5cbiAgICogPGJ1dHRvbiBpb24tdHJhY2staG9sZD1cImV2ZW50TmFtZVwiPkhvbGQgVHJhY2s8L2J1dHRvbj5cbiAgICogPGJ1dHRvbiBpb24tdHJhY2stdGFwPVwiZXZlbnROYW1lXCI+VGFwIFRyYWNrPC9idXR0b24+XG4gICAqIDxidXR0b24gaW9uLXRyYWNrLWRvdWJsZXRhcD1cImV2ZW50TmFtZVwiPkRvdWJsZSBUYXAgVHJhY2s8L2J1dHRvbj5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGRvbUV2ZW50TmFtZSBUaGUgRE9NIGV2ZW50IG5hbWVcbiAgICogQHJldHVybiB7YXJyYXl9IEFuZ3VsYXIgRGlyZWN0aXZlIGRlY2xhcmF0aW9uXG4gICAqL1xuICBmdW5jdGlvbiBpb25UcmFja0RpcmVjdGl2ZShkb21FdmVudE5hbWUpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgIHJldHVybiBbJyRpb25pY0FuYWx5dGljcycsICckaW9uaWNHZXN0dXJlJywgZnVuY3Rpb24oJGlvbmljQW5hbHl0aWNzLCAkaW9uaWNHZXN0dXJlKSB7XG5cbiAgICAgIHZhciBnZXN0dXJlRHJpdmVuID0gW1xuICAgICAgICAnZHJhZycsICdkcmFnc3RhcnQnLCAnZHJhZ2VuZCcsICdkcmFnbGVmdCcsICdkcmFncmlnaHQnLCAnZHJhZ3VwJywgJ2RyYWdkb3duJyxcbiAgICAgICAgJ3N3aXBlJywgJ3N3aXBlbGVmdCcsICdzd2lwZXJpZ2h0JywgJ3N3aXBldXAnLCAnc3dpcGVkb3duJyxcbiAgICAgICAgJ3RhcCcsICdkb3VibGV0YXAnLCAnaG9sZCcsXG4gICAgICAgICd0cmFuc2Zvcm0nLCAncGluY2gnLCAncGluY2hpbicsICdwaW5jaG91dCcsICdyb3RhdGUnXG4gICAgICBdO1xuICAgICAgLy8gQ2hlY2sgaWYgd2UgbmVlZCB0byB1c2UgdGhlIGdlc3R1cmUgc3Vic3lzdGVtIG9yIHRoZSBET00gc3lzdGVtXG4gICAgICB2YXIgaXNHZXN0dXJlRHJpdmVuID0gZmFsc2U7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGdlc3R1cmVEcml2ZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGdlc3R1cmVEcml2ZW5baV0gPT09IGRvbUV2ZW50TmFtZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgaXNHZXN0dXJlRHJpdmVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgXCJyZXN0cmljdFwiOiAnQScsXG4gICAgICAgIFwibGlua1wiOiBmdW5jdGlvbigkc2NvcGUsICRlbGVtZW50LCAkYXR0cikge1xuICAgICAgICAgIHZhciBjYXBpdGFsaXplZCA9IGRvbUV2ZW50TmFtZVswXS50b1VwcGVyQ2FzZSgpICsgZG9tRXZlbnROYW1lLnNsaWNlKDEpO1xuICAgICAgICAgIC8vIEdyYWIgZXZlbnQgbmFtZSB3ZSB3aWxsIHNlbmRcbiAgICAgICAgICB2YXIgZXZlbnROYW1lID0gJGF0dHJbJ2lvblRyYWNrJyArIGNhcGl0YWxpemVkXTtcblxuICAgICAgICAgIGlmIChpc0dlc3R1cmVEcml2ZW4pIHtcbiAgICAgICAgICAgIHZhciBnZXN0dXJlID0gJGlvbmljR2VzdHVyZS5vbihkb21FdmVudE5hbWUsIGhhbmRsZXIsICRlbGVtZW50KTtcbiAgICAgICAgICAgICRzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICRpb25pY0dlc3R1cmUub2ZmKGdlc3R1cmUsIGRvbUV2ZW50TmFtZSwgaGFuZGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJGVsZW1lbnQub24oZG9tRXZlbnROYW1lLCBoYW5kbGVyKTtcbiAgICAgICAgICAgICRzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICRlbGVtZW50Lm9mZihkb21FdmVudE5hbWUsIGhhbmRsZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuXG5cbiAgICAgICAgICBmdW5jdGlvbiBoYW5kbGVyKGUpIHtcbiAgICAgICAgICAgIHZhciBldmVudERhdGEgPSAkc2NvcGUuJGV2YWwoJGF0dHIuaW9uVHJhY2tEYXRhKSB8fCB7fTtcbiAgICAgICAgICAgIGlmIChldmVudE5hbWUpIHtcbiAgICAgICAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKGV2ZW50TmFtZSwgZXZlbnREYXRhKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICRpb25pY0FuYWx5dGljcy50cmFja0NsaWNrKGUucGFnZVgsIGUucGFnZVksIGUudGFyZ2V0LCB7XG4gICAgICAgICAgICAgICAgXCJkYXRhXCI6IGV2ZW50RGF0YVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1cblxufVxuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyQXV0aCA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuYXV0aCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNBdXRoJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyQXV0aCkge1xuICAgICAgSW9uaWNBbmd1bGFyQXV0aCA9IElvbmljLkF1dGg7XG4gICAgfVxuICAgIHJldHVybiBJb25pY0FuZ3VsYXJBdXRoO1xuICB9XSk7XG59XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5jb3JlJywgW10pXG5cbiAgLyoqXG4gICAqIEBwcml2YXRlXG4gICAqIFByb3ZpZGVzIGEgc2FmZSBpbnRlcmZhY2UgdG8gc3RvcmUgb2JqZWN0cyBpbiBwZXJzaXN0ZW50IG1lbW9yeVxuICAgKi9cbiAgLnByb3ZpZGVyKCdwZXJzaXN0ZW50U3RvcmFnZScsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAnJGdldCc6IFtmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHN0b3JhZ2UgPSBJb25pYy5nZXRTZXJ2aWNlKCdTdG9yYWdlJyk7XG4gICAgICAgIGlmICghc3RvcmFnZSkge1xuICAgICAgICAgIHN0b3JhZ2UgPSBuZXcgSW9uaWMuSU8uU3RvcmFnZSgpO1xuICAgICAgICAgIElvbmljLmFkZFNlcnZpY2UoJ1N0b3JhZ2UnLCBzdG9yYWdlLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RvcmFnZTtcbiAgICAgIH1dXG4gICAgfTtcbiAgfSlcblxuICAuZmFjdG9yeSgnJGlvbmljQ29yZVNldHRpbmdzJywgW1xuICAgIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIElvbmljLklPLkNvbmZpZztcbiAgICB9XG4gIF0pXG5cbiAgLmZhY3RvcnkoJyRpb25pY1VzZXInLCBbXG4gICAgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gSW9uaWMuVXNlcjtcbiAgICB9XG4gIF0pXG5cbiAgLnJ1bihbZnVuY3Rpb24oKSB7XG4gICAgSW9uaWMuaW8oKTtcbiAgfV0pO1xufVxuXG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJEZXBsb3kgPSBudWxsO1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmRlcGxveScsIFtdKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNEZXBsb3knLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJEZXBsb3kpIHtcbiAgICAgIElvbmljQW5ndWxhckRlcGxveSA9IG5ldyBJb25pYy5EZXBsb3koKTtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhckRlcGxveTtcbiAgfV0pO1xufVxuIiwidmFyIEFuYWx5dGljcyA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2FuYWx5dGljcy9hbmFseXRpY3NcIikuQW5hbHl0aWNzO1xudmFyIEFwcCA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvYXBwXCIpLkFwcDtcbnZhciBBdXRoID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvYXV0aC9hdXRoXCIpLkF1dGg7XG52YXIgQnVja2V0U3RvcmFnZSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2FuYWx5dGljcy9zdG9yYWdlXCIpLkJ1Y2tldFN0b3JhZ2U7XG52YXIgQ29uZmlnID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9jb25maWdcIikuQ29uZmlnO1xudmFyIERPTVNlcmlhbGl6ZXIgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9hbmFseXRpY3Mvc2VyaWFsaXplcnNcIikuRE9NU2VyaWFsaXplcjtcbnZhciBEYXRhVHlwZSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvZGF0YS10eXBlc1wiKS5EYXRhVHlwZTtcbnZhciBEZXBsb3kgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9kZXBsb3kvZGVwbG95XCIpLkRlcGxveTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL2V2ZW50c1wiKS5FdmVudEVtaXR0ZXI7XG52YXIgSW9uaWNQbGF0Zm9ybSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvY29yZVwiKS5Jb25pY1BsYXRmb3JtO1xudmFyIExvZ2dlciA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvbG9nZ2VyXCIpLkxvZ2dlcjtcbnZhciBQdXNoID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvcHVzaC9wdXNoXCIpLlB1c2g7XG52YXIgUHVzaE1lc3NhZ2UgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9wdXNoL3B1c2gtbWVzc2FnZVwiKS5QdXNoTWVzc2FnZTtcbnZhciBQdXNoVG9rZW4gPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9wdXNoL3B1c2gtdG9rZW5cIikuUHVzaFRva2VuO1xudmFyIFN0b3JhZ2UgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL3N0b3JhZ2VcIikuU3RvcmFnZTtcbnZhciBVc2VyID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS91c2VyXCIpLlVzZXI7XG52YXIgcHJvbWlzZSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvcHJvbWlzZVwiKTtcblxuLy8gRGVjbGFyZSB0aGUgd2luZG93IG9iamVjdFxud2luZG93LklvbmljID0gd2luZG93LklvbmljIHx8IHt9O1xuXG4vLyBJb25pYyBNb2R1bGVzXG5Jb25pYy5Db3JlID0gSW9uaWNQbGF0Zm9ybTtcbklvbmljLlVzZXIgPSBVc2VyO1xuSW9uaWMuQW5hbHl0aWNzID0gQW5hbHl0aWNzO1xuSW9uaWMuQXV0aCA9IEF1dGg7XG5Jb25pYy5EZXBsb3kgPSBEZXBsb3k7XG5Jb25pYy5QdXNoID0gUHVzaDtcbklvbmljLlB1c2hUb2tlbiA9IFB1c2hUb2tlbjtcbklvbmljLlB1c2hNZXNzYWdlID0gUHVzaE1lc3NhZ2U7XG5cbi8vIERhdGFUeXBlIE5hbWVzcGFjZVxuSW9uaWMuRGF0YVR5cGUgPSBEYXRhVHlwZTtcbklvbmljLkRhdGFUeXBlcyA9IERhdGFUeXBlLmdldE1hcHBpbmcoKTtcblxuLy8gSU8gTmFtZXNwYWNlXG5Jb25pYy5JTyA9IHt9O1xuSW9uaWMuSU8uQXBwID0gQXBwO1xuSW9uaWMuSU8uRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuSW9uaWMuSU8uTG9nZ2VyID0gTG9nZ2VyO1xuSW9uaWMuSU8uUHJvbWlzZSA9IHByb21pc2UuUHJvbWlzZTtcbklvbmljLklPLkRlZmVycmVkUHJvbWlzZSA9IHByb21pc2UuRGVmZXJyZWRQcm9taXNlO1xuSW9uaWMuSU8uU3RvcmFnZSA9IFN0b3JhZ2U7XG5Jb25pYy5JTy5Db25maWcgPSBDb25maWc7XG5cbi8vIEFuYWx5dGljIFN0b3JhZ2UgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1N0b3JhZ2UgPSB7fTtcbklvbmljLkFuYWx5dGljU3RvcmFnZS5CdWNrZXRTdG9yYWdlID0gQnVja2V0U3RvcmFnZTtcblxuLy8gQW5hbHl0aWMgU2VyaWFsaXplcnMgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzID0ge307XG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzLkRPTVNlcmlhbGl6ZXIgPSBET01TZXJpYWxpemVyO1xuXG5cbi8vIFByb3ZpZGVyIGEgc2luZ2xlIHN0b3JhZ2UgZm9yIHNlcnZpY2VzIHRoYXQgaGF2ZSBwcmV2aW91c2x5IGJlZW4gcmVnaXN0ZXJlZFxudmFyIHNlcnZpY2VTdG9yYWdlID0ge307XG5cbklvbmljLmlvID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBJb25pYy5Db3JlO1xufTtcblxuSW9uaWMuZ2V0U2VydmljZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgaWYgKHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9PT0gJ3VuZGVmaW5lZCcgfHwgIXNlcnZpY2VTdG9yYWdlW25hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBzZXJ2aWNlU3RvcmFnZVtuYW1lXTtcbn07XG5cbklvbmljLmFkZFNlcnZpY2UgPSBmdW5jdGlvbihuYW1lLCBzZXJ2aWNlLCBmb3JjZSkge1xuICBpZiAoc2VydmljZSAmJiB0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgc2VydmljZVN0b3JhZ2VbbmFtZV0gPSBzZXJ2aWNlO1xuICB9IGVsc2UgaWYgKHNlcnZpY2UgJiYgZm9yY2UpIHtcbiAgICBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9IHNlcnZpY2U7XG4gIH1cbn07XG5cbklvbmljLnJlbW92ZVNlcnZpY2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGlmICh0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZGVsZXRlIHNlcnZpY2VTdG9yYWdlW25hbWVdO1xuICB9XG59O1xuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyUHVzaCA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UucHVzaCcsIFtdKVxuXG4gIC8qKlxuICAgKiBJb25pY1B1c2hBY3Rpb24gU2VydmljZVxuICAgKlxuICAgKiBBIHV0aWxpdHkgc2VydmljZSB0byBraWNrIG9mZiBtaXNjIGZlYXR1cmVzIGFzIHBhcnQgb2YgdGhlIElvbmljIFB1c2ggc2VydmljZVxuICAgKi9cbiAgLmZhY3RvcnkoJyRpb25pY1B1c2hBY3Rpb24nLCBbJyRzdGF0ZScsIGZ1bmN0aW9uKCRzdGF0ZSkge1xuXG4gICAgZnVuY3Rpb24gUHVzaEFjdGlvblNlcnZpY2UoKSB7fVxuXG4gICAgLyoqXG4gICAgICogU3RhdGUgTmF2aWdhdGlvblxuICAgICAqXG4gICAgICogQXR0ZW1wdHMgdG8gbmF2aWdhdGUgdG8gYSBuZXcgdmlldyBpZiBhIHB1c2ggbm90aWZpY2F0aW9uIHBheWxvYWQgY29udGFpbnM6XG4gICAgICpcbiAgICAgKiAgIC0gJHN0YXRlIHtTdHJpbmd9IFRoZSBzdGF0ZSBuYW1lIChlLmcgJ3RhYi5jaGF0cycpXG4gICAgICogICAtICRzdGF0ZVBhcmFtcyB7T2JqZWN0fSBQcm92aWRlZCBzdGF0ZSAodXJsKSBwYXJhbXNcbiAgICAgKlxuICAgICAqIEZpbmQgbW9yZSBpbmZvIGFib3V0IHN0YXRlIG5hdmlnYXRpb24gYW5kIHBhcmFtczpcbiAgICAgKiBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci11aS91aS1yb3V0ZXIvd2lraVxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG5vdGlmaWNhdGlvbiBOb3RpZmljYXRpb24gT2JqZWN0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoQWN0aW9uU2VydmljZS5wcm90b3R5cGUubm90aWZpY2F0aW9uTmF2aWdhdGlvbiA9IGZ1bmN0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgdmFyIHN0YXRlID0gbm90aWZpY2F0aW9uLnBheWxvYWQuJHN0YXRlIHx8IGZhbHNlO1xuICAgICAgdmFyIHN0YXRlUGFyYW1zID0gbm90aWZpY2F0aW9uLnBheWxvYWQuJHN0YXRlUGFyYW1zIHx8IHt9O1xuICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgICRzdGF0ZS5nbyhzdGF0ZSwgc3RhdGVQYXJhbXMpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IFB1c2hBY3Rpb25TZXJ2aWNlKCk7XG4gIH1dKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNQdXNoJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyUHVzaCkge1xuICAgICAgSW9uaWNBbmd1bGFyUHVzaCA9IG5ldyBJb25pYy5QdXNoKFwiREVGRVJfSU5JVFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhclB1c2g7XG4gIH1dKVxuXG4gIC5ydW4oWyckaW9uaWNQdXNoJywgJyRpb25pY1B1c2hBY3Rpb24nLCBmdW5jdGlvbigkaW9uaWNQdXNoLCAkaW9uaWNQdXNoQWN0aW9uKSB7XG4gICAgLy8gVGhpcyBpcyB3aGF0IGtpY2tzIG9mZiB0aGUgc3RhdGUgcmVkaXJlY3Rpb24gd2hlbiBhIHB1c2ggbm90aWZpY2FpdG9uIGhhcyB0aGUgcmVsZXZhbnQgZGV0YWlsc1xuICAgICRpb25pY1B1c2guX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6cHJvY2Vzc05vdGlmaWNhdGlvbicsIGZ1bmN0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgbm90aWZpY2F0aW9uID0gSW9uaWMuUHVzaE1lc3NhZ2UuZnJvbVBsdWdpbkpTT04obm90aWZpY2F0aW9uKTtcbiAgICAgIGlmIChub3RpZmljYXRpb24gJiYgbm90aWZpY2F0aW9uLmFwcCkge1xuICAgICAgICBpZiAobm90aWZpY2F0aW9uLmFwcC5hc2xlZXAgPT09IHRydWUgfHwgbm90aWZpY2F0aW9uLmFwcC5jbG9zZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAkaW9uaWNQdXNoQWN0aW9uLm5vdGlmaWNhdGlvbk5hdmlnYXRpb24obm90aWZpY2F0aW9uKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gIH1dKTtcbn1cbiJdfQ==
