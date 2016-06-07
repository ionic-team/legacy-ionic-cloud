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
        this.logger = new logger_1.Logger('Ionic Analytics:');
        this.storage = core_1.IonicPlatform.storage;
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
                'analytics_version': core_1.IonicPlatform.version
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
        if (!core_1.IonicPlatform.device.isConnectedToNetwork()) {
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
            this.logger.silent = true;
        }
        else {
            this.logger.silent = false;
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
            return;
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

},{"../core/core":11,"../core/logger":16,"../core/promise":17,"../core/request":18,"../core/user":20,"../util/util":34,"./storage":4}],2:[function(require,module,exports){
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
        this.baseStorage = core_1.IonicPlatform.storage;
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

},{"../core/core":11}],5:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var promise_1 = require('../core/promise');
var core_1 = require('../core/core');
var storage_1 = require('../core/storage');
var user_1 = require('../core/user');
var storage = new storage_1.PlatformLocalStorageStrategy();
var sessionStorage = new storage_1.LocalSessionStorageStrategy();
var authModules = {};
var authToken;
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
    if (options === void 0) { options = {}; }
    var originalToken = authToken;
    authToken = token;
    if (options.remember) {
        TokenContext.store();
    }
    else {
        TempTokenContext.store();
    }
    core_1.IonicPlatform.emitter.emit('auth:token-changed', { 'old': originalToken, 'new': authToken });
}
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
        if (options === void 0) { options = {}; }
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
var AuthType = (function () {
    function AuthType(client) {
        this.client = client;
        this.client = client;
    }
    AuthType.prototype.inAppBrowserFlow = function (authOptions, options, data) {
        if (authOptions === void 0) { authOptions = {}; }
        var deferred = new promise_1.DeferredPromise();
        if (!window || !window.cordova || !window.cordova.InAppBrowser) {
            deferred.reject('Missing InAppBrowser plugin');
        }
        else {
            var method = options.uri_method ? options.uri_method : 'POST';
            var provider = options.provider ? '/' + options.provider : '';
            this.client.request(method, "/auth/login" + provider)
                .send({
                'app_id': core_1.IonicPlatform.config.get('app_id'),
                'callback': options.callback_uri || window.location.href,
                'data': data
            })
                .end(function (err, res) {
                if (err) {
                    deferred.reject(err);
                }
                else {
                    var loc = res.payload.data.url;
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
                }
            });
        }
        return deferred.promise;
    };
    return AuthType;
}());
var BasicAuth = (function (_super) {
    __extends(BasicAuth, _super);
    function BasicAuth() {
        _super.apply(this, arguments);
    }
    BasicAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        var deferred = new promise_1.DeferredPromise();
        this.client.post('/auth/login')
            .send({
            'app_id': core_1.IonicPlatform.config.get('app_id'),
            'email': data.email,
            'password': data.password
        })
            .end(function (err, res) {
            if (err) {
                deferred.reject(err);
            }
            else {
                storeToken(options, res.body.data.token);
                deferred.resolve(true);
            }
        });
        return deferred.promise;
    };
    BasicAuth.prototype.signup = function (data) {
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
        this.client.post('/auth/users')
            .send(userData)
            .end(function (err, res) {
            if (err) {
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
            }
            else {
                deferred.resolve(true);
            }
        });
        return deferred.promise;
    };
    return BasicAuth;
}(AuthType));
var CustomAuth = (function (_super) {
    __extends(CustomAuth, _super);
    function CustomAuth() {
        _super.apply(this, arguments);
    }
    CustomAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'custom' }, data);
    };
    return CustomAuth;
}(AuthType));
var TwitterAuth = (function (_super) {
    __extends(TwitterAuth, _super);
    function TwitterAuth() {
        _super.apply(this, arguments);
    }
    TwitterAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'twitter' }, data);
    };
    return TwitterAuth;
}(AuthType));
var FacebookAuth = (function (_super) {
    __extends(FacebookAuth, _super);
    function FacebookAuth() {
        _super.apply(this, arguments);
    }
    FacebookAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'facebook' }, data);
    };
    return FacebookAuth;
}(AuthType));
var GithubAuth = (function (_super) {
    __extends(GithubAuth, _super);
    function GithubAuth() {
        _super.apply(this, arguments);
    }
    GithubAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'github' }, data);
    };
    return GithubAuth;
}(AuthType));
var GoogleAuth = (function (_super) {
    __extends(GoogleAuth, _super);
    function GoogleAuth() {
        _super.apply(this, arguments);
    }
    GoogleAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'google' }, data);
    };
    return GoogleAuth;
}(AuthType));
var InstagramAuth = (function (_super) {
    __extends(InstagramAuth, _super);
    function InstagramAuth() {
        _super.apply(this, arguments);
    }
    InstagramAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'instagram' }, data);
    };
    return InstagramAuth;
}(AuthType));
var LinkedInAuth = (function (_super) {
    __extends(LinkedInAuth, _super);
    function LinkedInAuth() {
        _super.apply(this, arguments);
    }
    LinkedInAuth.prototype.authenticate = function (options, data) {
        if (options === void 0) { options = {}; }
        return this.inAppBrowserFlow(options, { 'provider': 'linkedin' }, data);
    };
    return LinkedInAuth;
}(AuthType));
Auth.register('basic', new BasicAuth(core_1.IonicPlatform.client));
Auth.register('custom', new CustomAuth(core_1.IonicPlatform.client));
Auth.register('facebook', new FacebookAuth(core_1.IonicPlatform.client));
Auth.register('github', new GithubAuth(core_1.IonicPlatform.client));
Auth.register('google', new GoogleAuth(core_1.IonicPlatform.client));
Auth.register('instagram', new InstagramAuth(core_1.IonicPlatform.client));
Auth.register('linkedin', new LinkedInAuth(core_1.IonicPlatform.client));
Auth.register('twitter', new TwitterAuth(core_1.IonicPlatform.client));

},{"../core/core":11,"../core/promise":17,"../core/storage":19,"../core/user":20}],6:[function(require,module,exports){
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
        this.logger = new logger_1.Logger('Ionic App:');
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

},{"./logger":16}],8:[function(require,module,exports){
"use strict";
var request = require('superagent');
var Client = (function () {
    function Client(baseUrl, token, req // TODO: use superagent types
        ) {
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
    Client.prototype.request = function (method, endpoint) {
        return this.supplement(this.req.bind(method), endpoint);
    };
    Client.prototype.supplement = function (fn, endpoint) {
        if (endpoint.substring(0, 1) !== '/') {
            throw Error('endpoint must start with leading slash');
        }
        var req = fn(this.baseUrl + endpoint);
        if (this.token) {
            req.set('Authorization', "Bearer " + this.token);
        }
        return req;
    };
    return Client;
}());
exports.Client = Client;

},{"superagent":37}],9:[function(require,module,exports){
"use strict";
var Config = (function () {
    function Config() {
        this.locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'analytics': 'https://analytics.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }
    Config.prototype.register = function (settings) {
        this.settings = settings;
    };
    Config.prototype.get = function (name) {
        if (!this.settings) {
            return undefined;
        }
        return this.settings[name];
    };
    Config.prototype.getURL = function (name) {
        var devLocations = this.settings && this.settings['dev_locations'] || {};
        if (devLocations[name]) {
            return devLocations[name];
        }
        return this.locations[name];
    };
    return Config;
}());
exports.Config = Config;
exports.config = new Config();

},{}],10:[function(require,module,exports){
"use strict";
var logger_1 = require('./logger');
var Cordova = (function () {
    function Cordova(device) {
        this.device = device;
        this.device = device;
        this.logger = new logger_1.Logger('Ionic Cordova:');
    }
    Cordova.prototype.load = function () {
        if (!this.isAvailable()) {
            var cordovaScript = document.createElement('script');
            var cordovaSrc = 'cordova.js';
            switch (this.device.deviceType) {
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
                        this.logger.info('could not find cordova_js_bootstrap_resource query param');
                        this.logger.info(e);
                    }
                    break;
                default:
                    break;
            }
            cordovaScript.setAttribute('src', cordovaSrc);
            document.head.appendChild(cordovaScript);
            this.logger.info('injecting cordova.js');
        }
    };
    Cordova.prototype.isAvailable = function () {
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
                        this.logger.info('cordova.js has previously been included.');
                        return true;
                    }
                }
                catch (e) {
                    this.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
                }
            }
        }
        return false;
    };
    return Cordova;
}());
exports.Cordova = Cordova;

},{"./logger":16}],11:[function(require,module,exports){
"use strict";
var client_1 = require('./client');
var cordova_1 = require('./cordova');
var device_1 = require('./device');
var environments_1 = require('../environments');
var events_1 = require('./events');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var config_1 = require('./config');
var Core = (function () {
    function Core() {
        this.pluginsReady = false;
        this._version = '0.7.1';
        this.config = config_1.config;
        this.client = new client_1.Client(this.config.getURL('platform-api'));
        this.device = new device_1.Device();
        this.cordova = new cordova_1.Cordova(this.device);
        this.logger = new logger_1.Logger('Ionic Core:');
        this.env = new environments_1.Environment();
        this.emitter = new events_1.EventEmitter();
        this.storage = new storage_1.Storage();
        this.cordova.load();
        this.registerEventHandlers();
    }
    Core.prototype.init = function (cfg) {
        this.config.register(cfg);
        this.logger.info('init');
        this.emitter.emit('core:init');
    };
    Object.defineProperty(Core.prototype, "version", {
        get: function () {
            return this._version;
        },
        enumerable: true,
        configurable: true
    });
    Core.prototype.registerEventHandlers = function () {
        var _this = this;
        this.emitter.on('auth:token-changed', function (data) {
            _this.client.token = data['new'];
        });
        if (this.device.deviceType === 'unknown') {
            this.logger.info('attempting to mock plugins');
            this.pluginsReady = true;
            this.emitter.emit('device:ready');
        }
        else {
            document.addEventListener('deviceready', function () {
                _this.logger.info('plugins are ready');
                _this.pluginsReady = true;
                _this.emitter.emit('device:ready');
            }, false);
        }
    };
    /**
     * Fire a callback when core + plugins are ready. This will fire immediately if
     * the components have already become available.
     *
     * @param {function} callback function to fire off
     * @return {void}
     */
    Core.prototype.onReady = function (callback) {
        var _this = this;
        if (this.pluginsReady) {
            callback(this);
        }
        else {
            this.emitter.on('device:ready', function () {
                callback(_this);
            });
        }
    };
    return Core;
}());
exports.Core = Core;
exports.IonicPlatform = new Core();

},{"../environments":24,"./client":8,"./config":9,"./cordova":10,"./device":13,"./events":14,"./logger":16,"./storage":19}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
"use strict";
var Device = (function () {
    function Device() {
        this.deviceType = this.determineDeviceType();
    }
    /**
     * Check if the device is an Android device
     * @return {boolean} True if Android, false otherwise
     */
    Device.prototype.isAndroid = function () {
        return this.deviceType === 'android';
    };
    /**
     * Check if the device is an iOS device
     * @return {boolean} True if iOS, false otherwise
     */
    Device.prototype.isIOS = function () {
        return this.deviceType === 'iphone' || this.deviceType === 'ipad';
    };
    Device.prototype.isConnectedToNetwork = function (strictMode) {
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
     * Determine the device type via the user agent string
     * @return {string} name of device platform or 'unknown' if unable to identify the device
     */
    Device.prototype.determineDeviceType = function () {
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
    return Device;
}());
exports.Device = Device;

},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

},{"./app":7,"./client":8,"./config":9,"./core":11,"./data-types":12,"./events":14,"./logger":16,"./promise":17,"./request":18,"./storage":19,"./user":20}],16:[function(require,module,exports){
"use strict";
var Logger = (function () {
    function Logger(prefix) {
        this.prefix = prefix;
        this.silent = false;
        this.outfn = console.log.bind(console);
        this.errfn = console.error.bind(console);
        this.prefix = prefix;
    }
    Logger.prototype.info = function (data) {
        if (!this.silent) {
            this.outfn(this.prefix, data);
        }
    };
    Logger.prototype.warn = function (data) {
        if (!this.silent) {
            this.outfn(this.prefix, data);
        }
    };
    Logger.prototype.error = function (data) {
        this.errfn(this.prefix, data);
    };
    return Logger;
}());
exports.Logger = Logger;

},{}],17:[function(require,module,exports){
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

},{"es6-promise":36}],18:[function(require,module,exports){
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

},{"../auth/auth":5,"./promise":17,"superagent":37}],19:[function(require,module,exports){
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

},{"./promise":17}],20:[function(require,module,exports){
"use strict";
var auth_1 = require('../auth/auth');
var promise_1 = require('./promise');
var core_1 = require('./core');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var data_types_1 = require('./data-types');
var AppUserContext = null;
var storage = new storage_1.Storage();
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
        this.logger = new logger_1.Logger('Ionic User:');
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
            core_1.IonicPlatform.client.get('/auth/users/self')
                .end(function (err, res) {
                if (err) {
                    tempUser._blockLoad = false;
                    tempUser.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    tempUser._blockLoad = false;
                    tempUser.logger.info('loaded user');
                    // set the custom data
                    tempUser.id = res.body.data.uuid;
                    tempUser.data = new UserData(res.body.data.custom);
                    tempUser.details = res.body.data.details;
                    tempUser._fresh = false;
                    User.current(tempUser);
                    deferred.resolve(tempUser);
                }
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
            core_1.IonicPlatform.client.get("/auth/users/" + tempUser.id)
                .end(function (err, res) {
                if (err) {
                    tempUser._blockLoad = false;
                    tempUser.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    tempUser._blockLoad = false;
                    tempUser.logger.info('loaded user');
                    // set the custom data
                    tempUser.data = new UserData(res.body.data.custom);
                    tempUser.details = res.body.data.details;
                    tempUser._fresh = false;
                    deferred.resolve(tempUser);
                }
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
        if (rawData) {
            if (!rawData.__ionic_user_migrated) {
                var currentUser = Ionic.User.current();
                var userData = new UserData(rawData.data.data);
                for (var key in userData.data) {
                    currentUser.set(key, userData.data[key]);
                }
                currentUser.set('__ionic_user_migrated', true);
            }
        }
    };
    User.prototype.delete = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        if (self.isValid()) {
            if (!self._blockDelete) {
                self._blockDelete = true;
                self._delete();
                core_1.IonicPlatform.client.delete("/auth/users/" + this.id)
                    .end(function (err, res) {
                    if (err) {
                        self._blockDelete = false;
                        self.logger.error(err);
                        deferred.reject(err);
                    }
                    else {
                        self._blockDelete = false;
                        self.logger.info('deleted ' + self);
                        deferred.resolve(res);
                    }
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
            core_1.IonicPlatform.client.patch("/auth/users/" + this.id)
                .send(self.getFormat('api-save'))
                .end(function (err, res) {
                if (err) {
                    self._dirty = true;
                    self._blockSave = false;
                    self.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    self._dirty = false;
                    if (!self.isFresh()) {
                        self._unset = {};
                    }
                    self._fresh = false;
                    self._blockSave = false;
                    self.logger.info('saved user');
                    deferred.resolve(res);
                }
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
        core_1.IonicPlatform.client.post("/auth/users/" + this.id + "/password-reset")
            .end(function (err, res) {
            if (err) {
                self.logger.error(err);
                deferred.reject(err);
            }
            else {
                self.logger.info('password reset for user');
                deferred.resolve(res);
            }
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

},{"../auth/auth":5,"./core":11,"./data-types":12,"./logger":16,"./promise":17,"./storage":19}],21:[function(require,module,exports){
"use strict";
var promise_1 = require('../core/promise');
var logger_1 = require('../core/logger');
var core_1 = require('../core/core');
var NO_PLUGIN = 'IONIC_DEPLOY_MISSING_PLUGIN';
var INITIAL_DELAY = 1 * 5 * 1000;
var WATCH_INTERVAL = 1 * 60 * 1000;
var Deploy = (function () {
    function Deploy() {
        var self = this;
        this.logger = new logger_1.Logger('Ionic Deploy:');
        this._plugin = false;
        this._isReady = false;
        this._channelTag = 'production';
        this.logger.info('init');
        core_1.IonicPlatform.onReady(function () {
            self.initialize();
            self._isReady = true;
            core_1.IonicPlatform.emitter.emit('deploy:ready');
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
            core_1.IonicPlatform.emitter.on('deploy:ready', function () {
                callback(self);
            });
        }
    };
    return Deploy;
}());
exports.Deploy = Deploy;

},{"../core/core":11,"../core/logger":16,"../core/promise":17}],22:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./deploy'));

},{"./deploy":21}],23:[function(require,module,exports){
"use strict";
var core_1 = require('../core/core');
var promise_1 = require('../core/promise');
var envAPIEndpoints = {
    'getEnv': function (appId, tag) {
        return '/apps/' + appId + '/env/' + tag;
    }
};
var Environment = (function () {
    /**
     * Environment constructor
     *
     * @param {object} config Configuration object
     */
    function Environment() {
    }
    /**
     * Load an environment, calls loadEnvFromAPI
     *
     * @param {string} tag Environment tag
     * @return {DeferredPromise} will resolve/reject with the config object or error
     */
    Environment.prototype.load = function (tag) {
        var deferred = new promise_1.DeferredPromise();
        this.loadEnvFromAPI(tag).then(function (env) {
            deferred.resolve(env['config']);
        }, function (err) {
            deferred.reject(err);
        });
        return deferred.promise;
    };
    /**
     * Load an environment from the API
     *
     * @param {string} tag Environment tag
     * @return {DeferredPromise} will resolve/reject with the config object or error
     */
    Environment.prototype.loadEnvFromAPI = function (tag) {
        var deferred = new promise_1.DeferredPromise();
        core_1.IonicPlatform.client.get('/apps/' + core_1.IonicPlatform.config.get('app_id') + '/env/' + tag)
            .end(function (err, res) {
            if (err) {
                deferred.reject(err);
            }
            else if (res.ok) {
                deferred.resolve(res.body.data);
            }
        });
        return deferred.promise;
    };
    return Environment;
}());
exports.Environment = Environment;

},{"../core/core":11,"../core/promise":17}],24:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./environments'));

},{"./environments":23}],25:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./analytics/index'));
__export(require('./auth/index'));
__export(require('./core/index'));
__export(require('./deploy/index'));
__export(require('./insights/index'));
__export(require('./environments/index'));
__export(require('./push/index'));
__export(require('./util/index'));

},{"./analytics/index":2,"./auth/index":6,"./core/index":15,"./deploy/index":22,"./environments/index":24,"./insights/index":26,"./push/index":28,"./util/index":33}],26:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./insights'));

},{"./insights":27}],27:[function(require,module,exports){
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
exports.Stat = Stat;
var Insights = (function () {
    function Insights(client, appId) {
        this.client = client;
        this.appId = appId;
        this.submitCount = Insights.SUBMIT_COUNT;
        this.client = client;
        this.appId = appId;
        this.batch = [];
        this.logger = new logger_1.Logger('Ionic Insights:');
    }
    Insights.prototype.track = function (stat, value) {
        if (value === void 0) { value = 1; }
        this.trackStat(new Stat(this.appId, stat, value));
    };
    Insights.prototype.trackStat = function (stat) {
        this.batch.push(stat);
        if (this.shouldSubmit()) {
            this.submit();
        }
    };
    Insights.prototype.shouldSubmit = function () {
        return this.batch.length >= this.submitCount;
    };
    Insights.prototype.submit = function () {
        var insights = [];
        for (var _i = 0, _a = this.batch; _i < _a.length; _i++) {
            var stat = _a[_i];
            insights.push(stat.toJSON());
        }
        return this.client.post('/insights')
            .send({ 'insights': insights });
    };
    Insights.SUBMIT_COUNT = 100;
    return Insights;
}());
exports.Insights = Insights;

},{"../core/logger":16}],28:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./push-dev'));
__export(require('./push-message'));
__export(require('./push-token'));
__export(require('./push'));

},{"./push":32,"./push-dev":29,"./push-message":30,"./push-token":31}],29:[function(require,module,exports){
"use strict";
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
        this.client = core_1.IonicPlatform.client;
        this.logger = new logger_1.Logger('Ionic Push (dev):');
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
        var _this = this;
        this._push = ionicPush;
        var token = this._token;
        if (!token) {
            token = this.getDevToken();
        }
        this.client.post('/push/development')
            .send({ 'token': token })
            .end(function (err, res) {
            if (err) {
                _this.logger.error('error connecting development push service: ' + err);
            }
            else {
                var data = { 'registrationId': token };
                _this.logger.info('registered with development push service: ' + token);
                core_1.IonicPlatform.emitter.emit('push:token', data);
                if (typeof callback === 'function') {
                    callback(new push_token_1.PushToken(_this._token));
                }
                _this.watch();
            }
        });
    };
    /**
     * Checks the push service for notifications that target the current development token
     * @return {void}
     */
    PushDevService.prototype.checkForNotifications = function () {
        var _this = this;
        if (!this._token) {
            return;
        }
        this.client.get('/push/development')
            .query({ 'token': this._token })
            .end(function (err, res) {
            if (err) {
                _this.logger.error('unable to check for development pushes: ' + err);
            }
            else {
                if (res.body.data.message) {
                    var message = {
                        'message': res.body.data.message,
                        'title': 'DEVELOPMENT PUSH'
                    };
                    _this.logger.warn('Ionic Push: Development Push received. Development pushes will not contain payload data.');
                    core_1.IonicPlatform.emitter.emit('push:notification', message);
                }
            }
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

},{"../core/core":11,"../core/logger":16,"../util/util":34,"./push-token":31}],30:[function(require,module,exports){
"use strict";
var PushMessage = (function () {
    function PushMessage(raw) {
        this.app = {};
        this._raw = raw || {};
        if (!this._raw.additionalData) {
            // this should only hit if we are serving up a development push
            this._raw.additionalData = {
                'coldstart': false,
                'foreground': true
            };
        }
        this._payload = null;
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

},{}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
"use strict";
var app_1 = require('../core/app');
var core_1 = require('../core/core');
var logger_1 = require('../core/logger');
var promise_1 = require('../core/promise');
var user_1 = require('../core/user');
var push_token_1 = require('./push-token');
var push_message_1 = require('./push-message');
var push_dev_1 = require('./push-dev');
var Push = (function () {
    function Push(config) {
        var _this = this;
        if (config === void 0) { config = {}; }
        this._token = null;
        this.client = core_1.IonicPlatform.client;
        this.logger = new logger_1.Logger('Ionic Push:');
        var app = new app_1.App(core_1.IonicPlatform.config.get('app_id'), core_1.IonicPlatform.config.get('api_key'));
        app.devPush = core_1.IonicPlatform.config.get('dev_push');
        app.gcmKey = core_1.IonicPlatform.config.get('gcm_key');
        // Check for the required values to use this service
        if (!app.id || !app.apiKey) {
            this.logger.error('no app_id found. (http://docs.ionic.io/docs/io-install)');
            return;
        }
        else if (core_1.IonicPlatform.device.isAndroid() && !app.devPush && !app.gcmKey) {
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
        this._plugin = null;
        if (config.deferInit) {
            core_1.IonicPlatform.onReady(function () {
                _this.init(config);
            });
        }
    }
    Object.defineProperty(Push.prototype, "token", {
        set: function (val) {
            var storage = core_1.IonicPlatform.storage;
            if (val instanceof push_token_1.PushToken) {
                storage.storeObject('ionic_io_push_token', { 'token': val.token });
            }
            this._token = val;
        },
        enumerable: true,
        configurable: true
    });
    Push.prototype.getStorageToken = function () {
        var storage = core_1.IonicPlatform.storage;
        var token = storage.retrieveObject('ionic_io_push_token');
        if (token) {
            return new push_token_1.PushToken(token.token);
        }
        return null;
    };
    Push.prototype.clearStorageToken = function () {
        var storage = core_1.IonicPlatform.storage;
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
        if (config === void 0) { config = {}; }
        this._getPushPlugin();
        if (!config.pluginConfig) {
            config.pluginConfig = {};
        }
        if (core_1.IonicPlatform.device.isAndroid()) {
            // inject gcm key for PushPlugin
            if (!config.pluginConfig.android) {
                config.pluginConfig.android = {};
            }
            if (!config.pluginConfig.android.senderId) {
                config.pluginConfig.android.senderID = this.app.gcmKey;
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
        core_1.IonicPlatform.emitter.emit('push:ready', { 'config': this._config });
        return this;
    };
    Push.prototype.saveToken = function (token, options) {
        var _this = this;
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
        if (!this._blockSaveToken) {
            this.client.post('/push/tokens')
                .send(tokenData)
                .end(function (err, res) {
                if (err) {
                    _this._blockSaveToken = false;
                    _this.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    _this._blockSaveToken = false;
                    _this.logger.info('saved push token: ' + token);
                    if (tokenData.user_id) {
                        _this.logger.info('added push token to user: ' + tokenData.user_id);
                    }
                    deferred.resolve(true);
                }
            });
        }
        else {
            this.logger.info('a token save operation is already in progress.');
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
            return;
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
     */
    Push.prototype.unregister = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        var platform = null;
        if (core_1.IonicPlatform.device.isAndroid()) {
            platform = 'android';
        }
        else if (core_1.IonicPlatform.device.isIOS()) {
            platform = 'ios';
        }
        if (!platform) {
            deferred.reject('Could not detect the platform, are you on a device?');
        }
        if (!self._blockUnregister) {
            if (this._plugin) {
                this._plugin.unregister(function () { }, function () { });
            }
            this.client.post('/push/tokens/invalidate')
                .send({
                'platform': platform,
                'token': self.getStorageToken().token
            })
                .end(function (err, res) {
                if (err) {
                    self._blockUnregister = false;
                    self.logger.error(err);
                    deferred.reject(err);
                }
                else {
                    self._blockUnregister = false;
                    self.logger.info('unregistered push token: ' + self.getStorageToken().token);
                    self.clearStorageToken();
                    deferred.resolve(res);
                }
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
                    core_1.IonicPlatform.emitter.on('push:token', this._debugRegistrationCallback());
                    core_1.IonicPlatform.emitter.on('push:notification', this._debugNotificationCallback());
                    core_1.IonicPlatform.emitter.on('push:error', this._debugErrorCallback());
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
                core_1.IonicPlatform.emitter.on('push:token', this._registerCallback());
                core_1.IonicPlatform.emitter.on('push:notification', this._notificationCallback());
                core_1.IonicPlatform.emitter.on('push:error', this._errorCallback());
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
        core_1.IonicPlatform.emitter.emit('push:processNotification', notification);
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
        if (!self.app.devPush && !PushPlugin && (core_1.IonicPlatform.device.isIOS() || core_1.IonicPlatform.device.isAndroid())) {
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
            core_1.IonicPlatform.emitter.on('push:ready', function () {
                callback(self);
            });
        }
    };
    return Push;
}());
exports.Push = Push;

},{"../core/app":7,"../core/core":11,"../core/logger":16,"../core/promise":17,"../core/user":20,"./push-dev":29,"./push-message":30,"./push-token":31}],33:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./util'));

},{"./util":34}],34:[function(require,module,exports){
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

},{}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{"_process":35}],37:[function(require,module,exports){
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

},{"./is-object":38,"./request":40,"./request-base":39,"emitter":41,"reduce":42}],38:[function(require,module,exports){
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

},{}],39:[function(require,module,exports){
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

},{"./is-object":38}],40:[function(require,module,exports){
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

},{}],41:[function(require,module,exports){

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

},{}],42:[function(require,module,exports){

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
},{}],43:[function(require,module,exports){
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

},{}],44:[function(require,module,exports){
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

},{}],45:[function(require,module,exports){
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

  .factory('$ionicCore', [
    function() {
      return Ionic.Core;
    }
  ])

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


},{}],46:[function(require,module,exports){
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

},{}],47:[function(require,module,exports){
var Analytics = require("./../dist/es5/analytics/analytics").Analytics;
var App = require("./../dist/es5/core/app").App;
var Auth = require("./../dist/es5/auth/auth").Auth;
var BucketStorage = require("./../dist/es5/analytics/storage").BucketStorage;
var config = require("./../dist/es5/core/config").config;
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
Ionic.IO.Config = config;
Ionic.IO.Settings = function() { return config; };

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

},{"./../dist/es5/analytics/analytics":1,"./../dist/es5/analytics/serializers":3,"./../dist/es5/analytics/storage":4,"./../dist/es5/auth/auth":5,"./../dist/es5/core/app":7,"./../dist/es5/core/config":9,"./../dist/es5/core/core":11,"./../dist/es5/core/data-types":12,"./../dist/es5/core/events":14,"./../dist/es5/core/logger":16,"./../dist/es5/core/promise":17,"./../dist/es5/core/storage":19,"./../dist/es5/core/user":20,"./../dist/es5/deploy/deploy":21,"./../dist/es5/push/push":32,"./../dist/es5/push/push-message":30,"./../dist/es5/push/push-token":31}],48:[function(require,module,exports){
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
      IonicAngularPush = new Ionic.Push({ 'deferInit': true });
    }
    return IonicAngularPush;
  }])

  .run(['$ionicCore', '$ionicPush', '$ionicPushAction', function($ionicCore, $ionicPush, $ionicPushAction) {
    // This is what kicks off the state redirection when a push notificaiton has the relevant details
    $ionicCore.emitter.on('push:processNotification', function(notification) {
      notification = Ionic.PushMessage.fromPluginJSON(notification);
      if (notification && notification.app) {
        if (notification.app.asleep === true || notification.app.closed === true) {
          $ionicPushAction.notificationNavigation(notification);
        }
      }
    });

  }]);
}

},{}]},{},[47,45,43,44,48,46,25])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2VzNS9hbmFseXRpY3MvYW5hbHl0aWNzLmpzIiwiZGlzdC9lczUvYW5hbHl0aWNzL2luZGV4LmpzIiwiZGlzdC9lczUvYW5hbHl0aWNzL3NlcmlhbGl6ZXJzLmpzIiwiZGlzdC9lczUvYW5hbHl0aWNzL3N0b3JhZ2UuanMiLCJkaXN0L2VzNS9hdXRoL2F1dGguanMiLCJkaXN0L2VzNS9hdXRoL2luZGV4LmpzIiwiZGlzdC9lczUvY29yZS9hcHAuanMiLCJkaXN0L2VzNS9jb3JlL2NsaWVudC5qcyIsImRpc3QvZXM1L2NvcmUvY29uZmlnLmpzIiwiZGlzdC9lczUvY29yZS9jb3Jkb3ZhLmpzIiwiZGlzdC9lczUvY29yZS9jb3JlLmpzIiwiZGlzdC9lczUvY29yZS9kYXRhLXR5cGVzLmpzIiwiZGlzdC9lczUvY29yZS9kZXZpY2UuanMiLCJkaXN0L2VzNS9jb3JlL2V2ZW50cy5qcyIsImRpc3QvZXM1L2NvcmUvaW5kZXguanMiLCJkaXN0L2VzNS9jb3JlL2xvZ2dlci5qcyIsImRpc3QvZXM1L2NvcmUvcHJvbWlzZS5qcyIsImRpc3QvZXM1L2NvcmUvcmVxdWVzdC5qcyIsImRpc3QvZXM1L2NvcmUvc3RvcmFnZS5qcyIsImRpc3QvZXM1L2NvcmUvdXNlci5qcyIsImRpc3QvZXM1L2RlcGxveS9kZXBsb3kuanMiLCJkaXN0L2VzNS9kZXBsb3kvaW5kZXguanMiLCJkaXN0L2VzNS9lbnZpcm9ubWVudHMvZW52aXJvbm1lbnRzLmpzIiwiZGlzdC9lczUvZW52aXJvbm1lbnRzL2luZGV4LmpzIiwiZGlzdC9lczUvaW5kZXguanMiLCJkaXN0L2VzNS9pbnNpZ2h0cy9pbmRleC5qcyIsImRpc3QvZXM1L2luc2lnaHRzL2luc2lnaHRzLmpzIiwiZGlzdC9lczUvcHVzaC9pbmRleC5qcyIsImRpc3QvZXM1L3B1c2gvcHVzaC1kZXYuanMiLCJkaXN0L2VzNS9wdXNoL3B1c2gtbWVzc2FnZS5qcyIsImRpc3QvZXM1L3B1c2gvcHVzaC10b2tlbi5qcyIsImRpc3QvZXM1L3B1c2gvcHVzaC5qcyIsImRpc3QvZXM1L3V0aWwvaW5kZXguanMiLCJkaXN0L2VzNS91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1wcm9taXNlL2Rpc3QvZXM2LXByb21pc2UuanMiLCJub2RlX21vZHVsZXMvc3VwZXJhZ2VudC9saWIvY2xpZW50LmpzIiwibm9kZV9tb2R1bGVzL3N1cGVyYWdlbnQvbGliL2lzLW9iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L2xpYi9yZXF1ZXN0LWJhc2UuanMiLCJub2RlX21vZHVsZXMvc3VwZXJhZ2VudC9saWIvcmVxdWVzdC5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L25vZGVfbW9kdWxlcy9jb21wb25lbnQtZW1pdHRlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L25vZGVfbW9kdWxlcy9yZWR1Y2UtY29tcG9uZW50L2luZGV4LmpzIiwic3JjL2FuYWx5dGljcy9hbmd1bGFyLmpzIiwic3JjL2F1dGgvYW5ndWxhci5qcyIsInNyYy9jb3JlL2FuZ3VsYXIuanMiLCJzcmMvZGVwbG95L2FuZ3VsYXIuanMiLCJzcmMvZXM1LmpzIiwic3JjL3B1c2gvYW5ndWxhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzViQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMvN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcbnZhciByZXF1ZXN0XzEgPSByZXF1aXJlKCcuLi9jb3JlL3JlcXVlc3QnKTtcbnZhciBwcm9taXNlXzEgPSByZXF1aXJlKCcuLi9jb3JlL3Byb21pc2UnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgc3RvcmFnZV8xID0gcmVxdWlyZSgnLi9zdG9yYWdlJyk7XG52YXIgdXNlcl8xID0gcmVxdWlyZSgnLi4vY29yZS91c2VyJyk7XG52YXIgdXRpbF8xID0gcmVxdWlyZSgnLi4vdXRpbC91dGlsJyk7XG52YXIgQU5BTFlUSUNTX0tFWSA9IG51bGw7XG52YXIgREVGRVJfUkVHSVNURVIgPSAnREVGRVJfUkVHSVNURVInO1xudmFyIG9wdGlvbnMgPSB7fTtcbnZhciBnbG9iYWxQcm9wZXJ0aWVzID0ge307XG52YXIgZ2xvYmFsUHJvcGVydGllc0ZucyA9IFtdO1xudmFyIEFuYWx5dGljcyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQW5hbHl0aWNzKGNvbmZpZykge1xuICAgICAgICB0aGlzLl9kaXNwYXRjaGVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5fZGlzcGF0Y2hJbnRlcnZhbFRpbWUgPSAzMDtcbiAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fc2VydmljZUhvc3QgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdhbmFseXRpY3MnKTtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKCdJb25pYyBBbmFseXRpY3M6Jyk7XG4gICAgICAgIHRoaXMuc3RvcmFnZSA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLnN0b3JhZ2U7XG4gICAgICAgIHRoaXMuY2FjaGUgPSBuZXcgc3RvcmFnZV8xLkJ1Y2tldFN0b3JhZ2UoJ2lvbmljX2FuYWx5dGljcycpO1xuICAgICAgICB0aGlzLl9hZGRHbG9iYWxQcm9wZXJ0eURlZmF1bHRzKCk7XG4gICAgICAgIGlmIChjb25maWcgIT09IERFRkVSX1JFR0lTVEVSKSB7XG4gICAgICAgICAgICB0aGlzLnJlZ2lzdGVyKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5fYWRkR2xvYmFsUHJvcGVydHlEZWZhdWx0cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBzZWxmLnNldEdsb2JhbFByb3BlcnRpZXMoZnVuY3Rpb24gKGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKSB7XG4gICAgICAgICAgICBldmVudERhdGEuX3VzZXIgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHVzZXJfMS5Vc2VyLmN1cnJlbnQoKSkpO1xuICAgICAgICAgICAgZXZlbnREYXRhLl9hcHAgPSB7XG4gICAgICAgICAgICAgICAgJ2FwcF9pZCc6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgICAgICdhbmFseXRpY3NfdmVyc2lvbic6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLnZlcnNpb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFuYWx5dGljcy5wcm90b3R5cGUsIFwiaGFzVmFsaWRTZXR0aW5nc1wiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCFjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSB8fCAhY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBpX2tleScpKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1zZyA9ICdBIHZhbGlkIGFwcF9pZCBhbmQgYXBpX2tleSBhcmUgcmVxdWlyZWQgYmVmb3JlIHlvdSBjYW4gdXRpbGl6ZSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2FuYWx5dGljcyBwcm9wZXJseS4gU2VlIGh0dHA6Ly9kb2NzLmlvbmljLmlvL3YxLjAvZG9jcy9pby1xdWljay1zdGFydCc7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhtc2cpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQW5hbHl0aWNzLnByb3RvdHlwZSwgXCJkaXNwYXRjaEludGVydmFsXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZGlzcGF0Y2hJbnRlcnZhbFRpbWU7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICAvLyBTZXQgaG93IG9mdGVuIHdlIHNob3VsZCBzZW5kIGJhdGNoZWQgZXZlbnRzLCBpbiBzZWNvbmRzLlxuICAgICAgICAgICAgLy8gU2V0IHRoaXMgdG8gMCB0byBkaXNhYmxlIGV2ZW50IGNhY2hpbmdcbiAgICAgICAgICAgIHRoaXMuX2Rpc3BhdGNoSW50ZXJ2YWxUaW1lID0gdmFsdWU7XG4gICAgICAgICAgICAvLyBDbGVhciB0aGUgZXhpc3RpbmcgaW50ZXJ2YWxcbiAgICAgICAgICAgIGlmICh0aGlzLl9kaXNwYXRjaGVyKSB7XG4gICAgICAgICAgICAgICAgd2luZG93LmNsZWFySW50ZXJ2YWwodGhpcy5fZGlzcGF0Y2hlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUgPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGlzcGF0Y2hlciA9IHdpbmRvdy5zZXRJbnRlcnZhbChmdW5jdGlvbiAoKSB7IHNlbGYuX2Rpc3BhdGNoUXVldWUoKTsgfSwgdmFsdWUgKiAxMDAwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIEFuYWx5dGljcy5wcm90b3R5cGUuX2VucXVldWVFdmVudCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKG9wdGlvbnMuZHJ5UnVuKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdldmVudCByZWNpZXZlZCBidXQgbm90IHNlbnQgKGRyeVJ1biBhY3RpdmUpOicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhjb2xsZWN0aW9uTmFtZSk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZW5xdWV1aW5nIGV2ZW50IHRvIHNlbmQgbGF0ZXI6Jyk7XG4gICAgICAgIHNlbGYubG9nZ2VyLmluZm8oY29sbGVjdGlvbk5hbWUpO1xuICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIEFkZCB0aW1lc3RhbXAgcHJvcGVydHkgdG8gdGhlIGRhdGFcbiAgICAgICAgaWYgKCFldmVudERhdGEua2Vlbikge1xuICAgICAgICAgICAgZXZlbnREYXRhLmtlZW4gPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBldmVudERhdGEua2Vlbi50aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIC8vIEFkZCB0aGUgZGF0YSB0byB0aGUgcXVldWVcbiAgICAgICAgdmFyIGV2ZW50UXVldWUgPSBzZWxmLmNhY2hlLmdldCgnZXZlbnRfcXVldWUnKSB8fCB7fTtcbiAgICAgICAgaWYgKCFldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgZXZlbnRRdWV1ZVtjb2xsZWN0aW9uTmFtZV0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXS5wdXNoKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIFdyaXRlIHRoZSBxdWV1ZSB0byBkaXNrXG4gICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIGV2ZW50UXVldWUpO1xuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5fcmVxdWVzdEFuYWx5dGljc0tleSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgJ21ldGhvZCc6ICdHRVQnLFxuICAgICAgICAgICAgJ2pzb24nOiB0cnVlLFxuICAgICAgICAgICAgJ3VyaSc6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ2FwaScpICsgJy9hcGkvdjEvYXBwLycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSArICcva2V5cy93cml0ZScsXG4gICAgICAgICAgICAnaGVhZGVycyc6IHtcbiAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6ICdiYXNpYyAnICsgYnRvYShjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSArICc6JyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwaV9rZXknKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RfMS5yZXF1ZXN0KHJlcXVlc3RPcHRpb25zKTtcbiAgICB9O1xuICAgIEFuYWx5dGljcy5wcm90b3R5cGUuX3Bvc3RFdmVudCA9IGZ1bmN0aW9uIChuYW1lLCBkYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHBheWxvYWQgPSB7XG4gICAgICAgICAgICAnbmFtZSc6IFtkYXRhXVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIUFOQUxZVElDU19LRVkpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdDYW5ub3Qgc2VuZCBldmVudHMgdG8gdGhlIGFuYWx5dGljcyBzZXJ2ZXIgd2l0aG91dCBhbiBBbmFseXRpY3Mga2V5LicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAndXJsJzogc2VsZi5fc2VydmljZUhvc3QgKyAnL2FwaS92MS9ldmVudHMvJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgJ2pzb24nOiBwYXlsb2FkLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7XG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiByZXF1ZXN0XzEucmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLl9wb3N0RXZlbnRzID0gZnVuY3Rpb24gKGV2ZW50cykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghQU5BTFlUSUNTX0tFWSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnQ2Fubm90IHNlbmQgZXZlbnRzIHRvIHRoZSBhbmFseXRpY3Mgc2VydmVyIHdpdGhvdXQgYW4gQW5hbHl0aWNzIGtleS4nKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgJ3VybCc6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9hcGkvdjEvZXZlbnRzLycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICdqc29uJzogZXZlbnRzLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7XG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiByZXF1ZXN0XzEucmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLl9kaXNwYXRjaFF1ZXVlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBldmVudFF1ZXVlID0gdGhpcy5jYWNoZS5nZXQoJ2V2ZW50X3F1ZXVlJykgfHwge307XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhldmVudFF1ZXVlKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNvcmVfMS5Jb25pY1BsYXRmb3JtLmRldmljZS5pc0Nvbm5lY3RlZFRvTmV0d29yaygpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5zdG9yYWdlLmxvY2tlZEFzeW5jQ2FsbChzZWxmLmNhY2hlLnNjb3BlZEtleSgnZXZlbnRfZGlzcGF0Y2gnKSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuX3Bvc3RFdmVudHMoZXZlbnRRdWV1ZSk7XG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5jYWNoZS5zZXQoJ2V2ZW50X3F1ZXVlJywge30pO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc2VudCBldmVudHMnKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZXZlbnRRdWV1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHNlbGYuX2hhbmRsZURpc3BhdGNoRXJyb3IoZXJyLCB0aGlzLCBldmVudFF1ZXVlKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLl9nZXRSZXF1ZXN0U3RhdHVzQ29kZSA9IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICAgIHZhciByZXNwb25zZUNvZGUgPSBudWxsO1xuICAgICAgICBpZiAocmVxdWVzdCAmJiByZXF1ZXN0LnJlcXVlc3RJbmZvLl9sYXN0UmVzdWx0ICYmIHJlcXVlc3QucmVxdWVzdEluZm8uX2xhc3RSZXN1bHQuc3RhdHVzKSB7XG4gICAgICAgICAgICByZXNwb25zZUNvZGUgPSByZXF1ZXN0LnJlcXVlc3RJbmZvLl9sYXN0UmVzdWx0LnN0YXR1cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2VDb2RlO1xuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5faGFuZGxlRGlzcGF0Y2hFcnJvciA9IGZ1bmN0aW9uIChlcnJvciwgcmVxdWVzdCwgZXZlbnRRdWV1ZSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXNwb25zZUNvZGUgPSB0aGlzLl9nZXRSZXF1ZXN0U3RhdHVzQ29kZShyZXF1ZXN0KTtcbiAgICAgICAgaWYgKGVycm9yID09PSAnbGFzdF9jYWxsX2ludGVycnVwdGVkJykge1xuICAgICAgICAgICAgc2VsZi5jYWNoZS5zZXQoJ2V2ZW50X3F1ZXVlJywge30pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNvbm5lY3QgdG8gdGhlIHNlcnZlciBhdCBhbGwgLT4ga2VlcCBldmVudHNcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2VDb2RlKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ0Vycm9yIHNlbmRpbmcgYW5hbHl0aWNzIGRhdGE6IEZhaWxlZCB0byBjb25uZWN0IHRvIGFuYWx5dGljcyBzZXJ2ZXIuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLmNhY2hlLnNldCgnZXZlbnRfcXVldWUnLCB7fSk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ0Vycm9yIHNlbmRpbmcgYW5hbHl0aWNzIGRhdGE6IFNlcnZlciByZXNwb25kZWQgd2l0aCBlcnJvcicpO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGV2ZW50UXVldWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLl9oYW5kbGVSZWdpc3RlckVycm9yID0gZnVuY3Rpb24gKGVycm9yLCByZXF1ZXN0KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3BvbnNlQ29kZSA9IHRoaXMuX2dldFJlcXVlc3RTdGF0dXNDb2RlKHJlcXVlc3QpO1xuICAgICAgICB2YXIgZG9jcyA9ICcgU2VlIGh0dHA6Ly9kb2NzLmlvbmljLmlvL3YxLjAvZG9jcy9pby1xdWljay1zdGFydCc7XG4gICAgICAgIHN3aXRjaCAocmVzcG9uc2VDb2RlKSB7XG4gICAgICAgICAgICBjYXNlIDQwMTpcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignVGhlIGFwaSBrZXkgYW5kIGFwcCBpZCB5b3UgcHJvdmlkZWQgZGlkIG5vdCByZWdpc3RlciBvbiB0aGUgc2VydmVyLiAnICsgZG9jcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDQwNDpcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignVGhlIGFwcCBpZCB5b3UgcHJvdmlkZWQgKFwiJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpICsgJ1wiKSB3YXMgbm90IGZvdW5kLicgKyBkb2NzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1VuYWJsZSB0byByZXF1ZXN0IGFuYWx5dGljcyBrZXkuJyk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgYW4gYW5hbHl0aWNzIGtleVxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9wdHMgUmVnaXN0cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVnaXN0ZXIgcHJvbWlzZVxuICAgICAqL1xuICAgIEFuYWx5dGljcy5wcm90b3R5cGUucmVnaXN0ZXIgPSBmdW5jdGlvbiAob3B0cykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghdGhpcy5oYXNWYWxpZFNldHRpbmdzKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgb3B0aW9ucyA9IG9wdHMgfHwge307XG4gICAgICAgIGlmIChvcHRpb25zLnNpbGVudCkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuc2lsZW50ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLnNpbGVudCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zLmRyeVJ1bikge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnZHJ5UnVuIG1vZGUgaXMgYWN0aXZlLiBBbmFseXRpY3Mgd2lsbCBub3Qgc2VuZCBhbnkgZXZlbnRzLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3JlcXVlc3RBbmFseXRpY3NLZXkoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIEFOQUxZVElDU19LRVkgPSByZXN1bHQucGF5bG9hZC53cml0ZV9rZXk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzdWNjZXNzZnVsbHkgcmVnaXN0ZXJlZCBhbmFseXRpY3Mga2V5Jyk7XG4gICAgICAgICAgICBzZWxmLmRpc3BhdGNoSW50ZXJ2YWwgPSBzZWxmLmRpc3BhdGNoSW50ZXJ2YWw7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYuX2hhbmRsZVJlZ2lzdGVyRXJyb3IoZXJyb3IsIHRoaXMpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgQW5hbHl0aWNzLnByb3RvdHlwZS5zZXRHbG9iYWxQcm9wZXJ0aWVzID0gZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcHJvcFR5cGUgPSAodHlwZW9mIHByb3ApO1xuICAgICAgICBzd2l0Y2ggKHByb3BUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBwcm9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBnbG9iYWxQcm9wZXJ0aWVzW2tleV0gPSBwcm9wW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGdsb2JhbFByb3BlcnRpZXNGbnMucHVzaChwcm9wKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ3NldEdsb2JhbFByb3BlcnRpZXMgcGFyYW1ldGVyIG11c3QgYmUgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uLicpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLnRyYWNrID0gZnVuY3Rpb24gKGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLmhhc1ZhbGlkU2V0dGluZ3MpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWV2ZW50RGF0YSkge1xuICAgICAgICAgICAgZXZlbnREYXRhID0ge307XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBDbG9uZSB0aGUgZXZlbnQgZGF0YSB0byBhdm9pZCBtb2RpZnlpbmcgaXRcbiAgICAgICAgICAgIGV2ZW50RGF0YSA9IHV0aWxfMS5kZWVwRXh0ZW5kKHt9LCBldmVudERhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBnbG9iYWxQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICBpZiAoIWdsb2JhbFByb3BlcnRpZXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGV2ZW50RGF0YVtrZXldID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICBldmVudERhdGFba2V5XSA9IGdsb2JhbFByb3BlcnRpZXNba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGdsb2JhbFByb3BlcnRpZXNGbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmbiA9IGdsb2JhbFByb3BlcnRpZXNGbnNbaV07XG4gICAgICAgICAgICBmbi5jYWxsKG51bGwsIGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5fdXNlRXZlbnRDYWNoaW5nKSB7XG4gICAgICAgICAgICBzZWxmLl9lbnF1ZXVlRXZlbnQoZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuZHJ5UnVuKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZHJ5UnVuIGFjdGl2ZSwgd2lsbCBub3Qgc2VuZCBldmVudCcpO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZXZlbnRDb2xsZWN0aW9uKTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wb3N0RXZlbnQoZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBBbmFseXRpY3MucHJvdG90eXBlLnVuc2V0R2xvYmFsUHJvcGVydHkgPSBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBwcm9wVHlwZSA9ICh0eXBlb2YgcHJvcCk7XG4gICAgICAgIHN3aXRjaCAocHJvcFR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICAgICAgZGVsZXRlIGdsb2JhbFByb3BlcnRpZXNbcHJvcF07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICAgICAgICAgICAgdmFyIGkgPSBnbG9iYWxQcm9wZXJ0aWVzRm5zLmluZGV4T2YocHJvcCk7XG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdUaGUgZnVuY3Rpb24gcGFzc2VkIHRvIHVuc2V0R2xvYmFsUHJvcGVydHkgd2FzIG5vdCBhIGdsb2JhbCBwcm9wZXJ0eS4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2xvYmFsUHJvcGVydGllc0Zucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCd1bnNldEdsb2JhbFByb3BlcnR5IHBhcmFtZXRlciBtdXN0IGJlIGEgc3RyaW5nIG9yIGZ1bmN0aW9uLicpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gQW5hbHl0aWNzO1xufSgpKTtcbmV4cG9ydHMuQW5hbHl0aWNzID0gQW5hbHl0aWNzO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9hbmFseXRpY3MnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3NlcmlhbGl6ZXJzJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9zdG9yYWdlJykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgRE9NU2VyaWFsaXplciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRE9NU2VyaWFsaXplcigpIHtcbiAgICB9XG4gICAgRE9NU2VyaWFsaXplci5wcm90b3R5cGUuZWxlbWVudFNlbGVjdG9yID0gZnVuY3Rpb24gKGVsZW1lbnQpIHtcbiAgICAgICAgLy8gaXRlcmF0ZSB1cCB0aGUgZG9tXG4gICAgICAgIHZhciBzZWxlY3RvcnMgPSBbXTtcbiAgICAgICAgd2hpbGUgKGVsZW1lbnQudGFnTmFtZSAhPT0gJ0hUTUwnKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3IgPSBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHZhciBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0b3IgKz0gJyMnICsgaWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgY2xhc3NOYW1lID0gZWxlbWVudC5jbGFzc05hbWU7XG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNsYXNzZXMgPSBjbGFzc05hbWUuc3BsaXQoJyAnKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGMgPSBjbGFzc2VzW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3IgKz0gJy4nICsgYztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZWxlbWVudC5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgY2hpbGRJbmRleCA9IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoZWxlbWVudC5wYXJlbnROb2RlLmNoaWxkcmVuLCBlbGVtZW50KTtcbiAgICAgICAgICAgIHNlbGVjdG9yICs9ICc6bnRoLWNoaWxkKCcgKyAoY2hpbGRJbmRleCArIDEpICsgJyknO1xuICAgICAgICAgICAgZWxlbWVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcbiAgICAgICAgICAgIHNlbGVjdG9ycy5wdXNoKHNlbGVjdG9yKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2VsZWN0b3JzLnJldmVyc2UoKS5qb2luKCc+Jyk7XG4gICAgfTtcbiAgICBET01TZXJpYWxpemVyLnByb3RvdHlwZS5lbGVtZW50TmFtZSA9IGZ1bmN0aW9uIChlbGVtZW50KSB7XG4gICAgICAgIC8vIDEuIGlvbi10cmFjay1uYW1lIGRpcmVjdGl2ZVxuICAgICAgICB2YXIgbmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpb24tdHJhY2stbmFtZScpO1xuICAgICAgICBpZiAobmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gMi4gaWRcbiAgICAgICAgdmFyIGlkID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgICB9XG4gICAgICAgIC8vIDMuIG5vIHVuaXF1ZSBpZGVudGlmaWVyIC0tPiByZXR1cm4gbnVsbFxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9O1xuICAgIHJldHVybiBET01TZXJpYWxpemVyO1xufSgpKTtcbmV4cG9ydHMuRE9NU2VyaWFsaXplciA9IERPTVNlcmlhbGl6ZXI7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBCdWNrZXRTdG9yYWdlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBCdWNrZXRTdG9yYWdlKG5hbWUpIHtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAgICAgdGhpcy5iYXNlU3RvcmFnZSA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLnN0b3JhZ2U7XG4gICAgfVxuICAgIEJ1Y2tldFN0b3JhZ2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmFzZVN0b3JhZ2UucmV0cmlldmVPYmplY3QodGhpcy5zY29wZWRLZXkoa2V5KSk7XG4gICAgfTtcbiAgICBCdWNrZXRTdG9yYWdlLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXNlU3RvcmFnZS5zdG9yZU9iamVjdCh0aGlzLnNjb3BlZEtleShrZXkpLCB2YWx1ZSk7XG4gICAgfTtcbiAgICBCdWNrZXRTdG9yYWdlLnByb3RvdHlwZS5zY29wZWRLZXkgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5hbWUgKyAnXycgKyBrZXkgKyAnXycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKTtcbiAgICB9O1xuICAgIHJldHVybiBCdWNrZXRTdG9yYWdlO1xufSgpKTtcbmV4cG9ydHMuQnVja2V0U3RvcmFnZSA9IEJ1Y2tldFN0b3JhZ2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBfX2V4dGVuZHMgPSAodGhpcyAmJiB0aGlzLl9fZXh0ZW5kcykgfHwgZnVuY3Rpb24gKGQsIGIpIHtcbiAgICBmb3IgKHZhciBwIGluIGIpIGlmIChiLmhhc093blByb3BlcnR5KHApKSBkW3BdID0gYltwXTtcbiAgICBmdW5jdGlvbiBfXygpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGQ7IH1cbiAgICBkLnByb3RvdHlwZSA9IGIgPT09IG51bGwgPyBPYmplY3QuY3JlYXRlKGIpIDogKF9fLnByb3RvdHlwZSA9IGIucHJvdG90eXBlLCBuZXcgX18oKSk7XG59O1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIGNvcmVfMSA9IHJlcXVpcmUoJy4uL2NvcmUvY29yZScpO1xudmFyIHN0b3JhZ2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvc3RvcmFnZScpO1xudmFyIHVzZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvdXNlcicpO1xudmFyIHN0b3JhZ2UgPSBuZXcgc3RvcmFnZV8xLlBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3koKTtcbnZhciBzZXNzaW9uU3RvcmFnZSA9IG5ldyBzdG9yYWdlXzEuTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5KCk7XG52YXIgYXV0aE1vZHVsZXMgPSB7fTtcbnZhciBhdXRoVG9rZW47XG52YXIgVGVtcFRva2VuQ29udGV4dCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVGVtcFRva2VuQ29udGV4dCgpIHtcbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFRlbXBUb2tlbkNvbnRleHQsIFwibGFiZWxcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnaW9uaWNfaW9fYXV0aF8nICsgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFRlbXBUb2tlbkNvbnRleHQuZGVsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzZXNzaW9uU3RvcmFnZS5yZW1vdmUoVGVtcFRva2VuQ29udGV4dC5sYWJlbCk7XG4gICAgfTtcbiAgICBUZW1wVG9rZW5Db250ZXh0LnN0b3JlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXQoVGVtcFRva2VuQ29udGV4dC5sYWJlbCwgYXV0aFRva2VuKTtcbiAgICB9O1xuICAgIFRlbXBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHNlc3Npb25TdG9yYWdlLmdldChUZW1wVG9rZW5Db250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBUZW1wVG9rZW5Db250ZXh0O1xufSgpKTtcbmV4cG9ydHMuVGVtcFRva2VuQ29udGV4dCA9IFRlbXBUb2tlbkNvbnRleHQ7XG52YXIgVG9rZW5Db250ZXh0ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBUb2tlbkNvbnRleHQoKSB7XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShUb2tlbkNvbnRleHQsIFwibGFiZWxcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnaW9uaWNfaW9fYXV0aF8nICsgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFRva2VuQ29udGV4dC5kZWxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHN0b3JhZ2UucmVtb3ZlKFRva2VuQ29udGV4dC5sYWJlbCk7XG4gICAgfTtcbiAgICBUb2tlbkNvbnRleHQuc3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHN0b3JhZ2Uuc2V0KFRva2VuQ29udGV4dC5sYWJlbCwgYXV0aFRva2VuKTtcbiAgICB9O1xuICAgIFRva2VuQ29udGV4dC5nZXRSYXdEYXRhID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5nZXQoVG9rZW5Db250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBUb2tlbkNvbnRleHQ7XG59KCkpO1xuZXhwb3J0cy5Ub2tlbkNvbnRleHQgPSBUb2tlbkNvbnRleHQ7XG5mdW5jdGlvbiBzdG9yZVRva2VuKG9wdGlvbnMsIHRva2VuKSB7XG4gICAgaWYgKG9wdGlvbnMgPT09IHZvaWQgMCkgeyBvcHRpb25zID0ge307IH1cbiAgICB2YXIgb3JpZ2luYWxUb2tlbiA9IGF1dGhUb2tlbjtcbiAgICBhdXRoVG9rZW4gPSB0b2tlbjtcbiAgICBpZiAob3B0aW9ucy5yZW1lbWJlcikge1xuICAgICAgICBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIFRlbXBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG4gICAgY29yZV8xLklvbmljUGxhdGZvcm0uZW1pdHRlci5lbWl0KCdhdXRoOnRva2VuLWNoYW5nZWQnLCB7ICdvbGQnOiBvcmlnaW5hbFRva2VuLCAnbmV3JzogYXV0aFRva2VuIH0pO1xufVxuZnVuY3Rpb24gZ2V0QXV0aEVycm9yRGV0YWlscyhlcnIpIHtcbiAgICB2YXIgZGV0YWlscyA9IFtdO1xuICAgIHRyeSB7XG4gICAgICAgIGRldGFpbHMgPSBlcnIucmVzcG9uc2UuYm9keS5lcnJvci5kZXRhaWxzO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICBlO1xuICAgIH1cbiAgICByZXR1cm4gZGV0YWlscztcbn1cbnZhciBBdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBBdXRoKCkge1xuICAgIH1cbiAgICBBdXRoLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHRva2VuID0gVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRlbXBUb2tlbiA9IFRlbXBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICBpZiAodGVtcFRva2VuIHx8IHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBBdXRoLmxvZ2luID0gZnVuY3Rpb24gKG1vZHVsZUlkLCBvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIGlmIChvcHRpb25zID09PSB2b2lkIDApIHsgb3B0aW9ucyA9IHt9OyB9XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBjb250ZXh0ID0gYXV0aE1vZHVsZXNbbW9kdWxlSWRdIHx8IGZhbHNlO1xuICAgICAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gY2xhc3MgaXMgaW52YWxpZCBvciBtaXNzaW5nOicgKyBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBjb250ZXh0LmF1dGhlbnRpY2F0ZS5hcHBseShjb250ZXh0LCBbb3B0aW9ucywgZGF0YV0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdXNlcl8xLlVzZXIuc2VsZigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBBdXRoLnNpZ251cCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBjb250ZXh0ID0gYXV0aE1vZHVsZXNbJ2Jhc2ljJ10gfHwgZmFsc2U7XG4gICAgICAgIGlmICghY29udGV4dCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBjbGFzcyBpcyBpbnZhbGlkIG9yIG1pc3Npbmc6JyArIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb250ZXh0LnNpZ251cC5hcHBseShjb250ZXh0LCBbZGF0YV0pO1xuICAgIH07XG4gICAgQXV0aC5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIFRva2VuQ29udGV4dC5kZWxldGUoKTtcbiAgICAgICAgVGVtcFRva2VuQ29udGV4dC5kZWxldGUoKTtcbiAgICB9O1xuICAgIEF1dGgucmVnaXN0ZXIgPSBmdW5jdGlvbiAobW9kdWxlSWQsIG1vZHVsZSkge1xuICAgICAgICBpZiAoIWF1dGhNb2R1bGVzW21vZHVsZUlkXSkge1xuICAgICAgICAgICAgYXV0aE1vZHVsZXNbbW9kdWxlSWRdID0gbW9kdWxlO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBBdXRoLmdldFVzZXJUb2tlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHVzZXJ0b2tlbiA9IFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIHZhciB0ZW1wdG9rZW4gPSBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRva2VuID0gdGVtcHRva2VuIHx8IHVzZXJ0b2tlbjtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIEF1dGg7XG59KCkpO1xuZXhwb3J0cy5BdXRoID0gQXV0aDtcbnZhciBBdXRoVHlwZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQXV0aFR5cGUoY2xpZW50KSB7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICB9XG4gICAgQXV0aFR5cGUucHJvdG90eXBlLmluQXBwQnJvd3NlckZsb3cgPSBmdW5jdGlvbiAoYXV0aE9wdGlvbnMsIG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgaWYgKGF1dGhPcHRpb25zID09PSB2b2lkIDApIHsgYXV0aE9wdGlvbnMgPSB7fTsgfVxuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoIXdpbmRvdyB8fCAhd2luZG93LmNvcmRvdmEgfHwgIXdpbmRvdy5jb3Jkb3ZhLkluQXBwQnJvd3Nlcikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdNaXNzaW5nIEluQXBwQnJvd3NlciBwbHVnaW4nKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBtZXRob2QgPSBvcHRpb25zLnVyaV9tZXRob2QgPyBvcHRpb25zLnVyaV9tZXRob2QgOiAnUE9TVCc7XG4gICAgICAgICAgICB2YXIgcHJvdmlkZXIgPSBvcHRpb25zLnByb3ZpZGVyID8gJy8nICsgb3B0aW9ucy5wcm92aWRlciA6ICcnO1xuICAgICAgICAgICAgdGhpcy5jbGllbnQucmVxdWVzdChtZXRob2QsIFwiL2F1dGgvbG9naW5cIiArIHByb3ZpZGVyKVxuICAgICAgICAgICAgICAgIC5zZW5kKHtcbiAgICAgICAgICAgICAgICAnYXBwX2lkJzogY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAgICAgJ2NhbGxiYWNrJzogb3B0aW9ucy5jYWxsYmFja191cmkgfHwgd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgICAgICAgJ2RhdGEnOiBkYXRhXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb2MgPSByZXMucGF5bG9hZC5kYXRhLnVybDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlbXBCcm93c2VyID0gd2luZG93LmNvcmRvdmEuSW5BcHBCcm93c2VyLm9wZW4obG9jLCAnX2JsYW5rJywgJ2xvY2F0aW9uPW5vLGNsZWFyY2FjaGU9eWVzLGNsZWFyc2Vzc2lvbmNhY2hlPXllcycpO1xuICAgICAgICAgICAgICAgICAgICB0ZW1wQnJvd3Nlci5hZGRFdmVudExpc3RlbmVyKCdsb2Fkc3RhcnQnLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEudXJsLnNsaWNlKDAsIDIwKSA9PT0gJ2h0dHA6Ly9hdXRoLmlvbmljLmlvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBxdWVyeVN0cmluZyA9IGRhdGEudXJsLnNwbGl0KCcjJylbMF0uc3BsaXQoJz8nKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFyYW1QYXJ0cyA9IHF1ZXJ5U3RyaW5nLnNwbGl0KCcmJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmFtcyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyYW1QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFydCA9IHBhcmFtUGFydHNbaV0uc3BsaXQoJz0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1zW3BhcnRbMF1dID0gcGFydFsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RvcmVUb2tlbihhdXRoT3B0aW9ucywgcGFyYW1zLnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wQnJvd3Nlci5jbG9zZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBCcm93c2VyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIHJldHVybiBBdXRoVHlwZTtcbn0oKSk7XG52YXIgQmFzaWNBdXRoID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoQmFzaWNBdXRoLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIEJhc2ljQXV0aCgpIHtcbiAgICAgICAgX3N1cGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIEJhc2ljQXV0aC5wcm90b3R5cGUuYXV0aGVudGljYXRlID0gZnVuY3Rpb24gKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IHZvaWQgMCkgeyBvcHRpb25zID0ge307IH1cbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdGhpcy5jbGllbnQucG9zdCgnL2F1dGgvbG9naW4nKVxuICAgICAgICAgICAgLnNlbmQoe1xuICAgICAgICAgICAgJ2FwcF9pZCc6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgJ2VtYWlsJzogZGF0YS5lbWFpbCxcbiAgICAgICAgICAgICdwYXNzd29yZCc6IGRhdGEucGFzc3dvcmRcbiAgICAgICAgfSlcbiAgICAgICAgICAgIC5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdG9yZVRva2VuKG9wdGlvbnMsIHJlcy5ib2R5LmRhdGEudG9rZW4pO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIEJhc2ljQXV0aC5wcm90b3R5cGUuc2lnbnVwID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHVzZXJEYXRhID0ge1xuICAgICAgICAgICAgJ2FwcF9pZCc6IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgJ2VtYWlsJzogZGF0YS5lbWFpbCxcbiAgICAgICAgICAgICdwYXNzd29yZCc6IGRhdGEucGFzc3dvcmRcbiAgICAgICAgfTtcbiAgICAgICAgLy8gb3B0aW9uYWwgZGV0YWlsc1xuICAgICAgICBpZiAoZGF0YS51c2VybmFtZSkge1xuICAgICAgICAgICAgdXNlckRhdGEudXNlcm5hbWUgPSBkYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmltYWdlKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS5pbWFnZSA9IGRhdGEuaW1hZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEubmFtZSkge1xuICAgICAgICAgICAgdXNlckRhdGEubmFtZSA9IGRhdGEubmFtZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5jdXN0b20pIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLmN1c3RvbSA9IGRhdGEuY3VzdG9tO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xpZW50LnBvc3QoJy9hdXRoL3VzZXJzJylcbiAgICAgICAgICAgIC5zZW5kKHVzZXJEYXRhKVxuICAgICAgICAgICAgLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgZXJyb3JzID0gW107XG4gICAgICAgICAgICAgICAgdmFyIGRldGFpbHMgPSBnZXRBdXRoRXJyb3JEZXRhaWxzKGVycik7XG4gICAgICAgICAgICAgICAgaWYgKGRldGFpbHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRldGFpbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkZXRhaWwgPSBkZXRhaWxzW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZXRhaWwgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRldGFpbC5lcnJvcl90eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9ycy5wdXNoKGRldGFpbC5lcnJvcl90eXBlICsgJ18nICsgZGV0YWlsLnBhcmFtZXRlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCh7ICdlcnJvcnMnOiBlcnJvcnMgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICByZXR1cm4gQmFzaWNBdXRoO1xufShBdXRoVHlwZSkpO1xudmFyIEN1c3RvbUF1dGggPSAoZnVuY3Rpb24gKF9zdXBlcikge1xuICAgIF9fZXh0ZW5kcyhDdXN0b21BdXRoLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIEN1c3RvbUF1dGgoKSB7XG4gICAgICAgIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgICBDdXN0b21BdXRoLnByb3RvdHlwZS5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gdm9pZCAwKSB7IG9wdGlvbnMgPSB7fTsgfVxuICAgICAgICByZXR1cm4gdGhpcy5pbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2N1c3RvbScgfSwgZGF0YSk7XG4gICAgfTtcbiAgICByZXR1cm4gQ3VzdG9tQXV0aDtcbn0oQXV0aFR5cGUpKTtcbnZhciBUd2l0dGVyQXV0aCA9IChmdW5jdGlvbiAoX3N1cGVyKSB7XG4gICAgX19leHRlbmRzKFR3aXR0ZXJBdXRoLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIFR3aXR0ZXJBdXRoKCkge1xuICAgICAgICBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gICAgVHdpdHRlckF1dGgucHJvdG90eXBlLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIGlmIChvcHRpb25zID09PSB2b2lkIDApIHsgb3B0aW9ucyA9IHt9OyB9XG4gICAgICAgIHJldHVybiB0aGlzLmluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAndHdpdHRlcicgfSwgZGF0YSk7XG4gICAgfTtcbiAgICByZXR1cm4gVHdpdHRlckF1dGg7XG59KEF1dGhUeXBlKSk7XG52YXIgRmFjZWJvb2tBdXRoID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoRmFjZWJvb2tBdXRoLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIEZhY2Vib29rQXV0aCgpIHtcbiAgICAgICAgX3N1cGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIEZhY2Vib29rQXV0aC5wcm90b3R5cGUuYXV0aGVudGljYXRlID0gZnVuY3Rpb24gKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IHZvaWQgMCkgeyBvcHRpb25zID0ge307IH1cbiAgICAgICAgcmV0dXJuIHRoaXMuaW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdmYWNlYm9vaycgfSwgZGF0YSk7XG4gICAgfTtcbiAgICByZXR1cm4gRmFjZWJvb2tBdXRoO1xufShBdXRoVHlwZSkpO1xudmFyIEdpdGh1YkF1dGggPSAoZnVuY3Rpb24gKF9zdXBlcikge1xuICAgIF9fZXh0ZW5kcyhHaXRodWJBdXRoLCBfc3VwZXIpO1xuICAgIGZ1bmN0aW9uIEdpdGh1YkF1dGgoKSB7XG4gICAgICAgIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgICBHaXRodWJBdXRoLnByb3RvdHlwZS5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICBpZiAob3B0aW9ucyA9PT0gdm9pZCAwKSB7IG9wdGlvbnMgPSB7fTsgfVxuICAgICAgICByZXR1cm4gdGhpcy5pbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2dpdGh1YicgfSwgZGF0YSk7XG4gICAgfTtcbiAgICByZXR1cm4gR2l0aHViQXV0aDtcbn0oQXV0aFR5cGUpKTtcbnZhciBHb29nbGVBdXRoID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoR29vZ2xlQXV0aCwgX3N1cGVyKTtcbiAgICBmdW5jdGlvbiBHb29nbGVBdXRoKCkge1xuICAgICAgICBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gICAgR29vZ2xlQXV0aC5wcm90b3R5cGUuYXV0aGVudGljYXRlID0gZnVuY3Rpb24gKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgPT09IHZvaWQgMCkgeyBvcHRpb25zID0ge307IH1cbiAgICAgICAgcmV0dXJuIHRoaXMuaW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdnb29nbGUnIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIEdvb2dsZUF1dGg7XG59KEF1dGhUeXBlKSk7XG52YXIgSW5zdGFncmFtQXV0aCA9IChmdW5jdGlvbiAoX3N1cGVyKSB7XG4gICAgX19leHRlbmRzKEluc3RhZ3JhbUF1dGgsIF9zdXBlcik7XG4gICAgZnVuY3Rpb24gSW5zdGFncmFtQXV0aCgpIHtcbiAgICAgICAgX3N1cGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIEluc3RhZ3JhbUF1dGgucHJvdG90eXBlLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIGlmIChvcHRpb25zID09PSB2b2lkIDApIHsgb3B0aW9ucyA9IHt9OyB9XG4gICAgICAgIHJldHVybiB0aGlzLmluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnaW5zdGFncmFtJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBJbnN0YWdyYW1BdXRoO1xufShBdXRoVHlwZSkpO1xudmFyIExpbmtlZEluQXV0aCA9IChmdW5jdGlvbiAoX3N1cGVyKSB7XG4gICAgX19leHRlbmRzKExpbmtlZEluQXV0aCwgX3N1cGVyKTtcbiAgICBmdW5jdGlvbiBMaW5rZWRJbkF1dGgoKSB7XG4gICAgICAgIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgICBMaW5rZWRJbkF1dGgucHJvdG90eXBlLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIGlmIChvcHRpb25zID09PSB2b2lkIDApIHsgb3B0aW9ucyA9IHt9OyB9XG4gICAgICAgIHJldHVybiB0aGlzLmluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnbGlua2VkaW4nIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIExpbmtlZEluQXV0aDtcbn0oQXV0aFR5cGUpKTtcbkF1dGgucmVnaXN0ZXIoJ2Jhc2ljJywgbmV3IEJhc2ljQXV0aChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jbGllbnQpKTtcbkF1dGgucmVnaXN0ZXIoJ2N1c3RvbScsIG5ldyBDdXN0b21BdXRoKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudCkpO1xuQXV0aC5yZWdpc3RlcignZmFjZWJvb2snLCBuZXcgRmFjZWJvb2tBdXRoKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudCkpO1xuQXV0aC5yZWdpc3RlcignZ2l0aHViJywgbmV3IEdpdGh1YkF1dGgoY29yZV8xLklvbmljUGxhdGZvcm0uY2xpZW50KSk7XG5BdXRoLnJlZ2lzdGVyKCdnb29nbGUnLCBuZXcgR29vZ2xlQXV0aChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jbGllbnQpKTtcbkF1dGgucmVnaXN0ZXIoJ2luc3RhZ3JhbScsIG5ldyBJbnN0YWdyYW1BdXRoKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudCkpO1xuQXV0aC5yZWdpc3RlcignbGlua2VkaW4nLCBuZXcgTGlua2VkSW5BdXRoKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudCkpO1xuQXV0aC5yZWdpc3RlcigndHdpdHRlcicsIG5ldyBUd2l0dGVyQXV0aChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jbGllbnQpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuZnVuY3Rpb24gX19leHBvcnQobSkge1xuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKCFleHBvcnRzLmhhc093blByb3BlcnR5KHApKSBleHBvcnRzW3BdID0gbVtwXTtcbn1cbl9fZXhwb3J0KHJlcXVpcmUoJy4vYXV0aCcpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi9sb2dnZXInKTtcbnZhciBwcml2YXRlRGF0YSA9IHt9O1xuZnVuY3Rpb24gcHJpdmF0ZVZhcihrZXkpIHtcbiAgICByZXR1cm4gcHJpdmF0ZURhdGFba2V5XSB8fCBudWxsO1xufVxudmFyIEFwcCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQXBwKGFwcElkLCBhcGlLZXkpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKCdJb25pYyBBcHA6Jyk7XG4gICAgICAgIGlmICghYXBwSWQgfHwgYXBwSWQgPT09ICcnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdObyBhcHBfaWQgd2FzIHByb3ZpZGVkJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhcGlLZXkgfHwgYXBpS2V5ID09PSAnJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnTm8gYXBpX2tleSB3YXMgcHJvdmlkZWQnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBwcml2YXRlRGF0YS5pZCA9IGFwcElkO1xuICAgICAgICBwcml2YXRlRGF0YS5hcGlLZXkgPSBhcGlLZXk7XG4gICAgICAgIC8vIG90aGVyIGNvbmZpZyB2YWx1ZSByZWZlcmVuY2VcbiAgICAgICAgdGhpcy5kZXZQdXNoID0gbnVsbDtcbiAgICAgICAgdGhpcy5nY21LZXkgPSBudWxsO1xuICAgIH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQXBwLnByb3RvdHlwZSwgXCJpZFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHByaXZhdGVWYXIoJ2lkJyk7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBcHAucHJvdG90eXBlLCBcImFwaUtleVwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHByaXZhdGVWYXIoJ2FwaUtleScpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBBcHAucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJzxBcHAgW1xcJycgKyB0aGlzLmlkICsgJ1xcJz4nO1xuICAgIH07XG4gICAgcmV0dXJuIEFwcDtcbn0oKSk7XG5leHBvcnRzLkFwcCA9IEFwcDtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHJlcXVlc3QgPSByZXF1aXJlKCdzdXBlcmFnZW50Jyk7XG52YXIgQ2xpZW50ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBDbGllbnQoYmFzZVVybCwgdG9rZW4sIHJlcSAvLyBUT0RPOiB1c2Ugc3VwZXJhZ2VudCB0eXBlc1xuICAgICAgICApIHtcbiAgICAgICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybDtcbiAgICAgICAgdGhpcy50b2tlbiA9IHRva2VuO1xuICAgICAgICB0aGlzLnJlcSA9IHJlcTtcbiAgICAgICAgaWYgKHR5cGVvZiByZXEgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICByZXEgPSByZXF1ZXN0O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYmFzZVVybCA9IGJhc2VVcmw7XG4gICAgICAgIHRoaXMudG9rZW4gPSB0b2tlbjtcbiAgICAgICAgdGhpcy5yZXEgPSByZXE7XG4gICAgfVxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGVuZHBvaW50KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN1cHBsZW1lbnQodGhpcy5yZXEuZ2V0LCBlbmRwb2ludCk7XG4gICAgfTtcbiAgICBDbGllbnQucHJvdG90eXBlLnBvc3QgPSBmdW5jdGlvbiAoZW5kcG9pbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3VwcGxlbWVudCh0aGlzLnJlcS5wb3N0LCBlbmRwb2ludCk7XG4gICAgfTtcbiAgICBDbGllbnQucHJvdG90eXBlLnB1dCA9IGZ1bmN0aW9uIChlbmRwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdXBwbGVtZW50KHRoaXMucmVxLnB1dCwgZW5kcG9pbnQpO1xuICAgIH07XG4gICAgQ2xpZW50LnByb3RvdHlwZS5wYXRjaCA9IGZ1bmN0aW9uIChlbmRwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdXBwbGVtZW50KHRoaXMucmVxLnBhdGNoLCBlbmRwb2ludCk7XG4gICAgfTtcbiAgICBDbGllbnQucHJvdG90eXBlLmRlbGV0ZSA9IGZ1bmN0aW9uIChlbmRwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdXBwbGVtZW50KHRoaXMucmVxLmRlbGV0ZSwgZW5kcG9pbnQpO1xuICAgIH07XG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24gKG1ldGhvZCwgZW5kcG9pbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3VwcGxlbWVudCh0aGlzLnJlcS5iaW5kKG1ldGhvZCksIGVuZHBvaW50KTtcbiAgICB9O1xuICAgIENsaWVudC5wcm90b3R5cGUuc3VwcGxlbWVudCA9IGZ1bmN0aW9uIChmbiwgZW5kcG9pbnQpIHtcbiAgICAgICAgaWYgKGVuZHBvaW50LnN1YnN0cmluZygwLCAxKSAhPT0gJy8nKSB7XG4gICAgICAgICAgICB0aHJvdyBFcnJvcignZW5kcG9pbnQgbXVzdCBzdGFydCB3aXRoIGxlYWRpbmcgc2xhc2gnKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxID0gZm4odGhpcy5iYXNlVXJsICsgZW5kcG9pbnQpO1xuICAgICAgICBpZiAodGhpcy50b2tlbikge1xuICAgICAgICAgICAgcmVxLnNldCgnQXV0aG9yaXphdGlvbicsIFwiQmVhcmVyIFwiICsgdGhpcy50b2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcTtcbiAgICB9O1xuICAgIHJldHVybiBDbGllbnQ7XG59KCkpO1xuZXhwb3J0cy5DbGllbnQgPSBDbGllbnQ7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBDb25maWcgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIENvbmZpZygpIHtcbiAgICAgICAgdGhpcy5sb2NhdGlvbnMgPSB7XG4gICAgICAgICAgICAnYXBpJzogJ2h0dHBzOi8vYXBwcy5pb25pYy5pbycsXG4gICAgICAgICAgICAncHVzaCc6ICdodHRwczovL3B1c2guaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ2FuYWx5dGljcyc6ICdodHRwczovL2FuYWx5dGljcy5pb25pYy5pbycsXG4gICAgICAgICAgICAnZGVwbG95JzogJ2h0dHBzOi8vYXBwcy5pb25pYy5pbycsXG4gICAgICAgICAgICAncGxhdGZvcm0tYXBpJzogJ2h0dHBzOi8vYXBpLmlvbmljLmlvJ1xuICAgICAgICB9O1xuICAgIH1cbiAgICBDb25maWcucHJvdG90eXBlLnJlZ2lzdGVyID0gZnVuY3Rpb24gKHNldHRpbmdzKSB7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICB9O1xuICAgIENvbmZpZy5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzW25hbWVdO1xuICAgIH07XG4gICAgQ29uZmlnLnByb3RvdHlwZS5nZXRVUkwgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICB2YXIgZGV2TG9jYXRpb25zID0gdGhpcy5zZXR0aW5ncyAmJiB0aGlzLnNldHRpbmdzWydkZXZfbG9jYXRpb25zJ10gfHwge307XG4gICAgICAgIGlmIChkZXZMb2NhdGlvbnNbbmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiBkZXZMb2NhdGlvbnNbbmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMubG9jYXRpb25zW25hbWVdO1xuICAgIH07XG4gICAgcmV0dXJuIENvbmZpZztcbn0oKSk7XG5leHBvcnRzLkNvbmZpZyA9IENvbmZpZztcbmV4cG9ydHMuY29uZmlnID0gbmV3IENvbmZpZygpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgbG9nZ2VyXzEgPSByZXF1aXJlKCcuL2xvZ2dlcicpO1xudmFyIENvcmRvdmEgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIENvcmRvdmEoZGV2aWNlKSB7XG4gICAgICAgIHRoaXMuZGV2aWNlID0gZGV2aWNlO1xuICAgICAgICB0aGlzLmRldmljZSA9IGRldmljZTtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKCdJb25pYyBDb3Jkb3ZhOicpO1xuICAgIH1cbiAgICBDb3Jkb3ZhLnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMuaXNBdmFpbGFibGUoKSkge1xuICAgICAgICAgICAgdmFyIGNvcmRvdmFTY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgIHZhciBjb3Jkb3ZhU3JjID0gJ2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgc3dpdGNoICh0aGlzLmRldmljZS5kZXZpY2VUeXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYW5kcm9pZCc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24uaHJlZi5zdWJzdHJpbmcoMCwgNCkgPT09ICdmaWxlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29yZG92YVNyYyA9ICdmaWxlOi8vL2FuZHJvaWRfYXNzZXQvd3d3L2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lwYWQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2lwaG9uZSc6XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVzb3VyY2UgPSB3aW5kb3cubG9jYXRpb24uc2VhcmNoLm1hdGNoKC9jb3Jkb3ZhX2pzX2Jvb3RzdHJhcF9yZXNvdXJjZT0oLio/KSgmfCN8JCkvaSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3Jkb3ZhU3JjID0gZGVjb2RlVVJJKHJlc291cmNlWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnY291bGQgbm90IGZpbmQgY29yZG92YV9qc19ib290c3RyYXBfcmVzb3VyY2UgcXVlcnkgcGFyYW0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb3Jkb3ZhU2NyaXB0LnNldEF0dHJpYnV0ZSgnc3JjJywgY29yZG92YVNyYyk7XG4gICAgICAgICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGNvcmRvdmFTY3JpcHQpO1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnaW5qZWN0aW5nIGNvcmRvdmEuanMnKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgQ29yZG92YS5wcm90b3R5cGUuaXNBdmFpbGFibGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NlYXJjaGluZyBmb3IgY29yZG92YS5qcycpO1xuICAgICAgICBpZiAodHlwZW9mIGNvcmRvdmEgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdjb3Jkb3ZhLmpzIGhhcyBhbHJlYWR5IGJlZW4gbG9hZGVkJyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcbiAgICAgICAgdmFyIGxlbiA9IHNjcmlwdHMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgc2NyaXB0ID0gc2NyaXB0c1tpXS5nZXRBdHRyaWJ1dGUoJ3NyYycpO1xuICAgICAgICAgICAgaWYgKHNjcmlwdCkge1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0cyA9IHNjcmlwdC5zcGxpdCgnLycpO1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0c0xlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHNMZW5ndGggPSBwYXJ0cy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0c1twYXJ0c0xlbmd0aCAtIDFdID09PSAnY29yZG92YS5qcycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2NvcmRvdmEuanMgaGFzIHByZXZpb3VzbHkgYmVlbiBpbmNsdWRlZC4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2VuY291bnRlcmVkIGVycm9yIHdoaWxlIHRlc3RpbmcgZm9yIGNvcmRvdmEuanMgcHJlc2VuY2UsICcgKyBlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gQ29yZG92YTtcbn0oKSk7XG5leHBvcnRzLkNvcmRvdmEgPSBDb3Jkb3ZhO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgY2xpZW50XzEgPSByZXF1aXJlKCcuL2NsaWVudCcpO1xudmFyIGNvcmRvdmFfMSA9IHJlcXVpcmUoJy4vY29yZG92YScpO1xudmFyIGRldmljZV8xID0gcmVxdWlyZSgnLi9kZXZpY2UnKTtcbnZhciBlbnZpcm9ubWVudHNfMSA9IHJlcXVpcmUoJy4uL2Vudmlyb25tZW50cycpO1xudmFyIGV2ZW50c18xID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcbnZhciBzdG9yYWdlXzEgPSByZXF1aXJlKCcuL3N0b3JhZ2UnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4vbG9nZ2VyJyk7XG52YXIgY29uZmlnXzEgPSByZXF1aXJlKCcuL2NvbmZpZycpO1xudmFyIENvcmUgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIENvcmUoKSB7XG4gICAgICAgIHRoaXMucGx1Z2luc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3ZlcnNpb24gPSAnVkVSU0lPTl9TVFJJTkcnO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZ18xLmNvbmZpZztcbiAgICAgICAgdGhpcy5jbGllbnQgPSBuZXcgY2xpZW50XzEuQ2xpZW50KHRoaXMuY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykpO1xuICAgICAgICB0aGlzLmRldmljZSA9IG5ldyBkZXZpY2VfMS5EZXZpY2UoKTtcbiAgICAgICAgdGhpcy5jb3Jkb3ZhID0gbmV3IGNvcmRvdmFfMS5Db3Jkb3ZhKHRoaXMuZGV2aWNlKTtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKCdJb25pYyBDb3JlOicpO1xuICAgICAgICB0aGlzLmVudiA9IG5ldyBlbnZpcm9ubWVudHNfMS5FbnZpcm9ubWVudCgpO1xuICAgICAgICB0aGlzLmVtaXR0ZXIgPSBuZXcgZXZlbnRzXzEuRXZlbnRFbWl0dGVyKCk7XG4gICAgICAgIHRoaXMuc3RvcmFnZSA9IG5ldyBzdG9yYWdlXzEuU3RvcmFnZSgpO1xuICAgICAgICB0aGlzLmNvcmRvdmEubG9hZCgpO1xuICAgICAgICB0aGlzLnJlZ2lzdGVyRXZlbnRIYW5kbGVycygpO1xuICAgIH1cbiAgICBDb3JlLnByb3RvdHlwZS5pbml0ID0gZnVuY3Rpb24gKGNmZykge1xuICAgICAgICB0aGlzLmNvbmZpZy5yZWdpc3RlcihjZmcpO1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdpbml0Jyk7XG4gICAgICAgIHRoaXMuZW1pdHRlci5lbWl0KCdjb3JlOmluaXQnKTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShDb3JlLnByb3RvdHlwZSwgXCJ2ZXJzaW9uXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdmVyc2lvbjtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgQ29yZS5wcm90b3R5cGUucmVnaXN0ZXJFdmVudEhhbmRsZXJzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuICAgICAgICB0aGlzLmVtaXR0ZXIub24oJ2F1dGg6dG9rZW4tY2hhbmdlZCcsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICBfdGhpcy5jbGllbnQudG9rZW4gPSBkYXRhWyduZXcnXTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICh0aGlzLmRldmljZS5kZXZpY2VUeXBlID09PSAndW5rbm93bicpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2F0dGVtcHRpbmcgdG8gbW9jayBwbHVnaW5zJyk7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbnNSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGV2aWNlOnJlYWR5Jyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2VyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBfdGhpcy5sb2dnZXIuaW5mbygncGx1Z2lucyBhcmUgcmVhZHknKTtcbiAgICAgICAgICAgICAgICBfdGhpcy5wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgIF90aGlzLmVtaXR0ZXIuZW1pdCgnZGV2aWNlOnJlYWR5Jyk7XG4gICAgICAgICAgICB9LCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZpcmUgYSBjYWxsYmFjayB3aGVuIGNvcmUgKyBwbHVnaW5zIGFyZSByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgY29tcG9uZW50cyBoYXZlIGFscmVhZHkgYmVjb21lIGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBDb3JlLnByb3RvdHlwZS5vblJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLnBsdWdpbnNSZWFkeSkge1xuICAgICAgICAgICAgY2FsbGJhY2sodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVtaXR0ZXIub24oJ2RldmljZTpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhfdGhpcyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIENvcmU7XG59KCkpO1xuZXhwb3J0cy5Db3JlID0gQ29yZTtcbmV4cG9ydHMuSW9uaWNQbGF0Zm9ybSA9IG5ldyBDb3JlKCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBkYXRhVHlwZU1hcHBpbmcgPSB7fTtcbnZhciBEYXRhVHlwZVNjaGVtYSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRGF0YVR5cGVTY2hlbWEocHJvcGVydGllcykge1xuICAgICAgICB0aGlzLmRhdGEgPSB7fTtcbiAgICAgICAgdGhpcy5zZXRQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuICAgIH1cbiAgICBEYXRhVHlwZVNjaGVtYS5wcm90b3R5cGUuc2V0UHJvcGVydGllcyA9IGZ1bmN0aW9uIChwcm9wZXJ0aWVzKSB7XG4gICAgICAgIGlmIChwcm9wZXJ0aWVzIGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgICBmb3IgKHZhciB4IGluIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFbeF0gPSBwcm9wZXJ0aWVzW3hdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBEYXRhVHlwZVNjaGVtYS5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdfX0lvbmljX0RhdGFUeXBlU2NoZW1hJzogZGF0YS5uYW1lLFxuICAgICAgICAgICAgJ3ZhbHVlJzogZGF0YS52YWx1ZVxuICAgICAgICB9O1xuICAgIH07XG4gICAgRGF0YVR5cGVTY2hlbWEucHJvdG90eXBlLmlzVmFsaWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSAmJiB0aGlzLmRhdGEudmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBEYXRhVHlwZVNjaGVtYTtcbn0oKSk7XG5leHBvcnRzLkRhdGFUeXBlU2NoZW1hID0gRGF0YVR5cGVTY2hlbWE7XG52YXIgRGF0YVR5cGUgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERhdGFUeXBlKCkge1xuICAgIH1cbiAgICBEYXRhVHlwZS5nZXQgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgICAgICAgaWYgKGRhdGFUeXBlTWFwcGluZ1tuYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBkYXRhVHlwZU1hcHBpbmdbbmFtZV0odmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIERhdGFUeXBlLmdldE1hcHBpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkYXRhVHlwZU1hcHBpbmc7XG4gICAgfTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRGF0YVR5cGUsIFwiU2NoZW1hXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gRGF0YVR5cGVTY2hlbWE7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIERhdGFUeXBlLnJlZ2lzdGVyID0gZnVuY3Rpb24gKG5hbWUsIGNscykge1xuICAgICAgICBkYXRhVHlwZU1hcHBpbmdbbmFtZV0gPSBjbHM7XG4gICAgfTtcbiAgICByZXR1cm4gRGF0YVR5cGU7XG59KCkpO1xuZXhwb3J0cy5EYXRhVHlwZSA9IERhdGFUeXBlO1xudmFyIFVuaXF1ZUFycmF5ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBVbmlxdWVBcnJheSh2YWx1ZSkge1xuICAgICAgICB0aGlzLmRhdGEgPSBbXTtcbiAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHggaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnB1c2godmFsdWVbeF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFVuaXF1ZUFycmF5LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhO1xuICAgICAgICB2YXIgc2NoZW1hID0gbmV3IERhdGFUeXBlU2NoZW1hKHsgJ25hbWUnOiAnVW5pcXVlQXJyYXknLCAndmFsdWUnOiBkYXRhIH0pO1xuICAgICAgICByZXR1cm4gc2NoZW1hLnRvSlNPTigpO1xuICAgIH07XG4gICAgVW5pcXVlQXJyYXkuZnJvbVN0b3JhZ2UgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBVbmlxdWVBcnJheSh2YWx1ZSk7XG4gICAgfTtcbiAgICBVbmlxdWVBcnJheS5wcm90b3R5cGUucHVzaCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLmluZGV4T2YodmFsdWUpID09PSAtMSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVbmlxdWVBcnJheS5wcm90b3R5cGUucHVsbCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLmRhdGEuaW5kZXhPZih2YWx1ZSk7XG4gICAgICAgIHRoaXMuZGF0YS5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIH07XG4gICAgcmV0dXJuIFVuaXF1ZUFycmF5O1xufSgpKTtcbmV4cG9ydHMuVW5pcXVlQXJyYXkgPSBVbmlxdWVBcnJheTtcbkRhdGFUeXBlLnJlZ2lzdGVyKCdVbmlxdWVBcnJheScsIFVuaXF1ZUFycmF5KTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIERldmljZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRGV2aWNlKCkge1xuICAgICAgICB0aGlzLmRldmljZVR5cGUgPSB0aGlzLmRldGVybWluZURldmljZVR5cGUoKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGRldmljZSBpcyBhbiBBbmRyb2lkIGRldmljZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgQW5kcm9pZCwgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgRGV2aWNlLnByb3RvdHlwZS5pc0FuZHJvaWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRldmljZVR5cGUgPT09ICdhbmRyb2lkJztcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENoZWNrIGlmIHRoZSBkZXZpY2UgaXMgYW4gaU9TIGRldmljZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgaU9TLCBmYWxzZSBvdGhlcndpc2VcbiAgICAgKi9cbiAgICBEZXZpY2UucHJvdG90eXBlLmlzSU9TID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kZXZpY2VUeXBlID09PSAnaXBob25lJyB8fCB0aGlzLmRldmljZVR5cGUgPT09ICdpcGFkJztcbiAgICB9O1xuICAgIERldmljZS5wcm90b3R5cGUuaXNDb25uZWN0ZWRUb05ldHdvcmsgPSBmdW5jdGlvbiAoc3RyaWN0TW9kZSkge1xuICAgICAgICBpZiAodHlwZW9mIHN0cmljdE1vZGUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBzdHJpY3RNb2RlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IuY29ubmVjdGlvbiA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgICAgICAgIHR5cGVvZiBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgICAgICAgdHlwZW9mIENvbm5lY3Rpb24gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBpZiAoIXN0cmljdE1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5FVEhFUk5FVDpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5XSUZJOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTExfMkc6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTF8zRzpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMXzRHOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTEw6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lIHRoZSBkZXZpY2UgdHlwZSB2aWEgdGhlIHVzZXIgYWdlbnQgc3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfSBuYW1lIG9mIGRldmljZSBwbGF0Zm9ybSBvciAndW5rbm93bicgaWYgdW5hYmxlIHRvIGlkZW50aWZ5IHRoZSBkZXZpY2VcbiAgICAgKi9cbiAgICBEZXZpY2UucHJvdG90eXBlLmRldGVybWluZURldmljZVR5cGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG4gICAgICAgIHZhciBpcGFkID0gYWdlbnQubWF0Y2goL2lQYWQvaSk7XG4gICAgICAgIGlmIChpcGFkICYmIChpcGFkWzBdLnRvTG93ZXJDYXNlKCkgPT09ICdpcGFkJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBhZCc7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGlwaG9uZSA9IGFnZW50Lm1hdGNoKC9pUGhvbmUvaSk7XG4gICAgICAgIGlmIChpcGhvbmUgJiYgKGlwaG9uZVswXS50b0xvd2VyQ2FzZSgpID09PSAnaXBob25lJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBob25lJztcbiAgICAgICAgfVxuICAgICAgICB2YXIgYW5kcm9pZCA9IGFnZW50Lm1hdGNoKC9BbmRyb2lkL2kpO1xuICAgICAgICBpZiAoYW5kcm9pZCAmJiAoYW5kcm9pZFswXS50b0xvd2VyQ2FzZSgpID09PSAnYW5kcm9pZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2FuZHJvaWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAndW5rbm93bic7XG4gICAgfTtcbiAgICByZXR1cm4gRGV2aWNlO1xufSgpKTtcbmV4cG9ydHMuRGV2aWNlID0gRGV2aWNlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgRXZlbnRFbWl0dGVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gICAgICAgIHRoaXMuZXZlbnRIYW5kbGVycyA9IHt9O1xuICAgIH1cbiAgICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKGV2ZW50LCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdID0gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XS5wdXNoKGNhbGxiYWNrKTtcbiAgICB9O1xuICAgIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uIChldmVudCwgZGF0YSkge1xuICAgICAgICBpZiAoZGF0YSA9PT0gdm9pZCAwKSB7IGRhdGEgPSBudWxsOyB9XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBfaSA9IDAsIF9hID0gdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XTsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IF9hW19pXTtcbiAgICAgICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xufSgpKTtcbmV4cG9ydHMuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9hcHAnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2NvcmUnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2RhdGEtdHlwZXMnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2V2ZW50cycpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vbG9nZ2VyJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9wcm9taXNlJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9yZXF1ZXN0JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9jb25maWcnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3N0b3JhZ2UnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3VzZXInKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2NsaWVudCcpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIExvZ2dlciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gTG9nZ2VyKHByZWZpeCkge1xuICAgICAgICB0aGlzLnByZWZpeCA9IHByZWZpeDtcbiAgICAgICAgdGhpcy5zaWxlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5vdXRmbiA9IGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG4gICAgICAgIHRoaXMuZXJyZm4gPSBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSk7XG4gICAgICAgIHRoaXMucHJlZml4ID0gcHJlZml4O1xuICAgIH1cbiAgICBMb2dnZXIucHJvdG90eXBlLmluZm8gPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAoIXRoaXMuc2lsZW50KSB7XG4gICAgICAgICAgICB0aGlzLm91dGZuKHRoaXMucHJlZml4LCBkYXRhKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgTG9nZ2VyLnByb3RvdHlwZS53YXJuID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNpbGVudCkge1xuICAgICAgICAgICAgdGhpcy5vdXRmbih0aGlzLnByZWZpeCwgZGF0YSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIExvZ2dlci5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB0aGlzLmVycmZuKHRoaXMucHJlZml4LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBMb2dnZXI7XG59KCkpO1xuZXhwb3J0cy5Mb2dnZXIgPSBMb2dnZXI7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBfX2V4dGVuZHMgPSAodGhpcyAmJiB0aGlzLl9fZXh0ZW5kcykgfHwgZnVuY3Rpb24gKGQsIGIpIHtcbiAgICBmb3IgKHZhciBwIGluIGIpIGlmIChiLmhhc093blByb3BlcnR5KHApKSBkW3BdID0gYltwXTtcbiAgICBmdW5jdGlvbiBfXygpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGQ7IH1cbiAgICBkLnByb3RvdHlwZSA9IGIgPT09IG51bGwgPyBPYmplY3QuY3JlYXRlKGIpIDogKF9fLnByb3RvdHlwZSA9IGIucHJvdG90eXBlLCBuZXcgX18oKSk7XG59O1xudmFyIGVzNl9wcm9taXNlXzEgPSByZXF1aXJlKCdlczYtcHJvbWlzZScpO1xudmFyIFByb21pc2VXaXRoTm90aWZ5ID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoUHJvbWlzZVdpdGhOb3RpZnksIF9zdXBlcik7XG4gICAgZnVuY3Rpb24gUHJvbWlzZVdpdGhOb3RpZnkoKSB7XG4gICAgICAgIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgICBQcm9taXNlV2l0aE5vdGlmeS5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uIChvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Ob3RpZmllZCkge1xuICAgICAgICB0aGlzLm9uTm90aWZ5ID0gb25Ob3RpZmllZDtcbiAgICAgICAgcmV0dXJuIF9zdXBlci5wcm90b3R5cGUudGhlbi5jYWxsKHRoaXMsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkKTtcbiAgICB9O1xuICAgIHJldHVybiBQcm9taXNlV2l0aE5vdGlmeTtcbn0oZXM2X3Byb21pc2VfMS5Qcm9taXNlKSk7XG5leHBvcnRzLlByb21pc2VXaXRoTm90aWZ5ID0gUHJvbWlzZVdpdGhOb3RpZnk7XG52YXIgRGVmZXJyZWRQcm9taXNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBEZWZlcnJlZFByb21pc2UoKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHRoaXMubm90aWZ5VmFsdWVzID0gW107XG4gICAgICAgIHRoaXMucHJvbWlzZSA9IG5ldyBQcm9taXNlV2l0aE5vdGlmeShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICBfdGhpcy5yZXNvbHZlID0gcmVzb2x2ZTtcbiAgICAgICAgICAgIF90aGlzLnJlamVjdCA9IHJlamVjdDtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBvcmlnaW5hbFRoZW4gPSB0aGlzLnByb21pc2UudGhlbjtcbiAgICAgICAgdGhpcy5wcm9taXNlLnRoZW4gPSBmdW5jdGlvbiAob2ssIGZhaWwsIG5vdGlmeSkge1xuICAgICAgICAgICAgX3RoaXMuX25vdGlmeSA9IG5vdGlmeTtcbiAgICAgICAgICAgIGZvciAodmFyIF9pID0gMCwgX2EgPSBfdGhpcy5ub3RpZnlWYWx1ZXM7IF9pIDwgX2EubGVuZ3RoOyBfaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHYgPSBfYVtfaV07XG4gICAgICAgICAgICAgICAgX3RoaXMuX25vdGlmeSh2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFRoZW4uY2FsbChfdGhpcy5wcm9taXNlLCBvaywgZmFpbCk7XG4gICAgICAgIH07XG4gICAgfVxuICAgIERlZmVycmVkUHJvbWlzZS5wcm90b3R5cGUubm90aWZ5ID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5fbm90aWZ5ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLm5vdGlmeVZhbHVlcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX25vdGlmeSh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBEZWZlcnJlZFByb21pc2U7XG59KCkpO1xuZXhwb3J0cy5EZWZlcnJlZFByb21pc2UgPSBEZWZlcnJlZFByb21pc2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBwcm9taXNlXzEgPSByZXF1aXJlKCcuL3Byb21pc2UnKTtcbnZhciBhdXRoXzEgPSByZXF1aXJlKCcuLi9hdXRoL2F1dGgnKTtcbnZhciByID0gcmVxdWlyZSgnc3VwZXJhZ2VudCcpO1xuZnVuY3Rpb24gcmVxdWVzdChvcHRpb25zKSB7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICAgIGlmICghb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24pIHtcbiAgICAgICAgdmFyIHRva2VuID0gYXV0aF8xLkF1dGguZ2V0VXNlclRva2VuKCk7XG4gICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyB0b2tlbjtcbiAgICAgICAgfVxuICAgIH1cbiAgICB2YXIgcmVxdWVzdEluZm8gPSB7fTtcbiAgICB2YXIgcCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgdmFyIHJlcXVlc3RfbWV0aG9kID0gKG9wdGlvbnMubWV0aG9kIHx8ICdnZXQnKS50b0xvd2VyQ2FzZSgpO1xuICAgIHZhciByZXEgPSByW3JlcXVlc3RfbWV0aG9kXShvcHRpb25zLnVyaSB8fCBvcHRpb25zLnVybCk7XG4gICAgaWYgKG9wdGlvbnMuanNvbikge1xuICAgICAgICByZXEgPSByZXEuc2VuZChvcHRpb25zLmpzb24pO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHJlcSA9IHJlcS5zZXQob3B0aW9ucy5oZWFkZXJzKTtcbiAgICB9XG4gICAgcmVxID0gcmVxLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgcmVxdWVzdEluZm8uX2xhc3RFcnJvciA9IGVycjtcbiAgICAgICAgcmVxdWVzdEluZm8uX2xhc3RSZXN1bHQgPSByZXM7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHAucmVqZWN0KGVycik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAocmVzLnN0YXR1cyA8IDIwMCB8fCByZXMuc3RhdHVzID49IDQwMCkge1xuICAgICAgICAgICAgICAgIHZhciBfZXJyID0gbmV3IEVycm9yKCdSZXF1ZXN0IEZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlIG9mICcgKyByZXMuc3RhdHVzKTtcbiAgICAgICAgICAgICAgICBwLnJlamVjdCh7ICdyZXNwb25zZSc6IHJlcywgJ2Vycm9yJzogX2VyciB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHAucmVzb2x2ZSh7ICdyZXNwb25zZSc6IHJlcywgJ3BheWxvYWQnOiByZXMuYm9keSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHAucmVxdWVzdEluZm8gPSByZXF1ZXN0SW5mbztcbiAgICByZXR1cm4gcC5wcm9taXNlO1xufVxuZXhwb3J0cy5yZXF1ZXN0ID0gcmVxdWVzdDtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4vcHJvbWlzZScpO1xudmFyIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3kgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3koKSB7XG4gICAgfVxuICAgIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3kucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH07XG4gICAgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneS5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XG4gICAgfTtcbiAgICBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgdmFsdWUpO1xuICAgIH07XG4gICAgcmV0dXJuIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3k7XG59KCkpO1xuZXhwb3J0cy5QbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5ID0gUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneTtcbnZhciBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIExvY2FsU2Vzc2lvblN0b3JhZ2VTdHJhdGVneSgpIHtcbiAgICB9XG4gICAgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH07XG4gICAgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuICAgIH07XG4gICAgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LnNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG4gICAgfTtcbiAgICByZXR1cm4gTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5O1xufSgpKTtcbmV4cG9ydHMuTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5ID0gTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5O1xudmFyIG9iamVjdENhY2hlID0ge307XG52YXIgbWVtb3J5TG9ja3MgPSB7fTtcbnZhciBTdG9yYWdlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBTdG9yYWdlKCkge1xuICAgICAgICB0aGlzLnN0cmF0ZWd5ID0gbmV3IFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3koKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU3RvcmVzIGFuIG9iamVjdCBpbiBsb2NhbCBzdG9yYWdlIHVuZGVyIHRoZSBnaXZlbiBrZXlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IE5hbWUgb2YgdGhlIGtleSB0byBzdG9yZSB2YWx1ZXMgaW5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gc3RvcmUgd2l0aCB0aGUga2V5XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBTdG9yYWdlLnByb3RvdHlwZS5zdG9yZU9iamVjdCA9IGZ1bmN0aW9uIChrZXksIG9iamVjdCkge1xuICAgICAgICAvLyBDb252ZXJ0IG9iamVjdCB0byBKU09OIGFuZCBzdG9yZSBpbiBsb2NhbFN0b3JhZ2VcbiAgICAgICAgdmFyIGpzb24gPSBKU09OLnN0cmluZ2lmeShvYmplY3QpO1xuICAgICAgICB0aGlzLnN0cmF0ZWd5LnNldChrZXksIGpzb24pO1xuICAgICAgICAvLyBUaGVuIHN0b3JlIGl0IGluIHRoZSBvYmplY3QgY2FjaGVcbiAgICAgICAgb2JqZWN0Q2FjaGVba2V5XSA9IG9iamVjdDtcbiAgICB9O1xuICAgIFN0b3JhZ2UucHJvdG90eXBlLmRlbGV0ZU9iamVjdCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5yZW1vdmUoa2V5KTtcbiAgICAgICAgZGVsZXRlIG9iamVjdENhY2hlW2tleV07XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBFaXRoZXIgcmV0cmlldmVzIHRoZSBjYWNoZWQgY29weSBvZiBhbiBvYmplY3QsXG4gICAgICogb3IgdGhlIG9iamVjdCBpdHNlbGYgZnJvbSBsb2NhbFN0b3JhZ2UuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUgbmFtZSBvZiB0aGUga2V5IHRvIHB1bGwgZnJvbVxuICAgICAqIEByZXR1cm4ge21peGVkfSBSZXR1cm5zIHRoZSBwcmV2aW91c2x5IHN0b3JlZCBPYmplY3Qgb3IgbnVsbFxuICAgICAqL1xuICAgIFN0b3JhZ2UucHJvdG90eXBlLnJldHJpZXZlT2JqZWN0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAvLyBGaXJzdCBjaGVjayB0byBzZWUgaWYgaXQncyB0aGUgb2JqZWN0IGNhY2hlXG4gICAgICAgIHZhciBjYWNoZWQgPSBvYmplY3RDYWNoZVtrZXldO1xuICAgICAgICBpZiAoY2FjaGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlc2VyaWFsaXplIHRoZSBvYmplY3QgZnJvbSBKU09OXG4gICAgICAgIHZhciBqc29uID0gdGhpcy5zdHJhdGVneS5nZXQoa2V5KTtcbiAgICAgICAgLy8gbnVsbCBvciB1bmRlZmluZWQgLS0+IHJldHVybiBudWxsLlxuICAgICAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKGpzb24pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBMb2NrcyB0aGUgYXN5bmMgY2FsbCByZXByZXNlbnRlZCBieSB0aGUgZ2l2ZW4gcHJvbWlzZSBhbmQgbG9jayBrZXkuXG4gICAgICogT25seSBvbmUgYXN5bmNGdW5jdGlvbiBnaXZlbiBieSB0aGUgbG9ja0tleSBjYW4gYmUgcnVubmluZyBhdCBhbnkgdGltZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsb2NrS2V5IHNob3VsZCBiZSBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIG5hbWUgb2YgdGhpcyBhc3luYyBjYWxsLlxuICAgICAqICAgICAgICBUaGlzIGlzIHJlcXVpcmVkIGZvciBwZXJzaXN0ZW5jZS5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBhc3luY0Z1bmN0aW9uIFJldHVybnMgYSBwcm9taXNlIG9mIHRoZSBhc3luYyBjYWxsLlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfSBBIG5ldyBwcm9taXNlLCBpZGVudGljYWwgdG8gdGhlIG9uZSByZXR1cm5lZCBieSBhc3luY0Z1bmN0aW9uLFxuICAgICAqICAgICAgICAgIGJ1dCB3aXRoIHR3byBuZXcgZXJyb3JzOiAnaW5fcHJvZ3Jlc3MnLCBhbmQgJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcuXG4gICAgICovXG4gICAgU3RvcmFnZS5wcm90b3R5cGUubG9ja2VkQXN5bmNDYWxsID0gZnVuY3Rpb24gKGxvY2tLZXksIGFzeW5jRnVuY3Rpb24pIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICAvLyBJZiB0aGUgbWVtb3J5IGxvY2sgaXMgc2V0LCBlcnJvciBvdXQuXG4gICAgICAgIGlmIChtZW1vcnlMb2Nrc1tsb2NrS2V5XSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdpbl9wcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzdG9yZWQgbG9jayBidXQgbm8gbWVtb3J5IGxvY2ssIGZsYWcgYSBwZXJzaXN0ZW5jZSBlcnJvclxuICAgICAgICBpZiAodGhpcy5zdHJhdGVneS5nZXQobG9ja0tleSkgPT09ICdsb2NrZWQnKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpO1xuICAgICAgICAgICAgZGVmZXJyZWQucHJvbWlzZS50aGVuKG51bGwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2V0IHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgIG1lbW9yeUxvY2tzW2xvY2tLZXldID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5zdHJhdGVneS5zZXQobG9ja0tleSwgJ2xvY2tlZCcpO1xuICAgICAgICAvLyBQZXJmb3JtIHRoZSBhc3luYyBvcGVyYXRpb25cbiAgICAgICAgYXN5bmNGdW5jdGlvbigpLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3NEYXRhKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHN1Y2Nlc3NEYXRhKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdG9yZWQgYW5kIG1lbW9yeSBsb2Nrc1xuICAgICAgICAgICAgZGVsZXRlIG1lbW9yeUxvY2tzW2xvY2tLZXldO1xuICAgICAgICAgICAgc2VsZi5zdHJhdGVneS5yZW1vdmUobG9ja0tleSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvckRhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvckRhdGEpO1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgICAgICBkZWxldGUgbWVtb3J5TG9ja3NbbG9ja0tleV07XG4gICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5vdGlmeURhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShub3RpZnlEYXRhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgcmV0dXJuIFN0b3JhZ2U7XG59KCkpO1xuZXhwb3J0cy5TdG9yYWdlID0gU3RvcmFnZTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGF1dGhfMSA9IHJlcXVpcmUoJy4uL2F1dGgvYXV0aCcpO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4vcHJvbWlzZScpO1xudmFyIGNvcmVfMSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIHN0b3JhZ2VfMSA9IHJlcXVpcmUoJy4vc3RvcmFnZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi9sb2dnZXInKTtcbnZhciBkYXRhX3R5cGVzXzEgPSByZXF1aXJlKCcuL2RhdGEtdHlwZXMnKTtcbnZhciBBcHBVc2VyQ29udGV4dCA9IG51bGw7XG52YXIgc3RvcmFnZSA9IG5ldyBzdG9yYWdlXzEuU3RvcmFnZSgpO1xudmFyIFVzZXJDb250ZXh0ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBVc2VyQ29udGV4dCgpIHtcbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFVzZXJDb250ZXh0LCBcImxhYmVsXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lvbmljX2lvX3VzZXJfJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBVc2VyQ29udGV4dC5kZWxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHN0b3JhZ2UuZGVsZXRlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKTtcbiAgICB9O1xuICAgIFVzZXJDb250ZXh0LnN0b3JlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoVXNlckNvbnRleHQuZ2V0UmF3RGF0YSgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEoVXNlckNvbnRleHQuZ2V0UmF3RGF0YSgpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoVXNlci5jdXJyZW50KCkuZGF0YS5kYXRhLl9faW9uaWNfdXNlcl9taWdyYXRlZCkge1xuICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JywgeyAnX19pb25pY191c2VyX21pZ3JhdGVkJzogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBzdG9yYWdlLnN0b3JlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsLCBVc2VyLmN1cnJlbnQoKSk7XG4gICAgfTtcbiAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAoIVVzZXJDb250ZXh0LmdldFJhd0xlZ2FjeURhdGEoKSkge1xuICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JywgZGF0YSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVzZXJDb250ZXh0LmdldFJhd0RhdGEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9O1xuICAgIFVzZXJDb250ZXh0LmdldFJhd0xlZ2FjeURhdGEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsICsgJ19sZWdhY3knKSB8fCBmYWxzZTtcbiAgICB9O1xuICAgIFVzZXJDb250ZXh0LmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkYXRhID0gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEoZGF0YSk7XG4gICAgICAgICAgICByZXR1cm4gVXNlci5mcm9tQ29udGV4dChkYXRhKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfTtcbiAgICByZXR1cm4gVXNlckNvbnRleHQ7XG59KCkpO1xudmFyIFVzZXJEYXRhID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBVc2VyRGF0YShkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhID09PSB2b2lkIDApIHsgZGF0YSA9IHt9OyB9XG4gICAgICAgIHRoaXMuZGF0YSA9IHt9O1xuICAgICAgICBpZiAoKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JykpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGRhdGE7XG4gICAgICAgICAgICB0aGlzLmRlc2VyaWFsaXplckRhdGFUeXBlcygpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFVzZXJEYXRhLnByb3RvdHlwZS5kZXNlcmlhbGl6ZXJEYXRhVHlwZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZvciAodmFyIHggaW4gdGhpcy5kYXRhKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGFuIG9iamVjdCwgbGV0J3MgY2hlY2sgZm9yIGN1c3RvbSBkYXRhIHR5cGVzXG4gICAgICAgICAgICBpZiAodHlwZW9mIHRoaXMuZGF0YVt4XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAvLyBkbyB3ZSBoYXZlIGEgY3VzdG9tIHR5cGU/XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGF0YVt4XS5fX0lvbmljX0RhdGFUeXBlU2NoZW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuYW1lID0gdGhpcy5kYXRhW3hdLl9fSW9uaWNfRGF0YVR5cGVTY2hlbWE7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtYXBwaW5nID0gZGF0YV90eXBlc18xLkRhdGFUeXBlLmdldE1hcHBpbmcoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hcHBpbmdbbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGhhdmUgYSBjdXN0b20gdHlwZSBhbmQgYSByZWdpc3RlcmVkIGNsYXNzLCBnaXZlIHRoZSBjdXN0b20gZGF0YSB0eXBlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmcm9tIHN0b3JhZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YVt4XSA9IG1hcHBpbmdbbmFtZV0uZnJvbVN0b3JhZ2UodGhpcy5kYXRhW3hdLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlckRhdGEucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgIHRoaXMuZGF0YVtrZXldID0gdmFsdWU7XG4gICAgfTtcbiAgICBVc2VyRGF0YS5wcm90b3R5cGUudW5zZXQgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGFba2V5XTtcbiAgICB9O1xuICAgIFVzZXJEYXRhLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kYXRhW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoZGVmYXVsdFZhbHVlID09PSAwIHx8IGRlZmF1bHRWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZSB8fCBudWxsO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gVXNlckRhdGE7XG59KCkpO1xuZXhwb3J0cy5Vc2VyRGF0YSA9IFVzZXJEYXRhO1xudmFyIFVzZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFVzZXIoKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcignSW9uaWMgVXNlcjonKTtcbiAgICAgICAgdGhpcy5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrU2F2ZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja0RlbGV0ZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9kaXJ0eSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9mcmVzaCA9IHRydWU7XG4gICAgICAgIHRoaXMuX3Vuc2V0ID0ge307XG4gICAgICAgIHRoaXMuZGF0YSA9IG5ldyBVc2VyRGF0YSgpO1xuICAgIH1cbiAgICBVc2VyLnByb3RvdHlwZS5pc0RpcnR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGlydHk7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5pc0Fub255bW91cyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuaXNBdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcyA9PT0gVXNlci5jdXJyZW50KCkpIHtcbiAgICAgICAgICAgIHJldHVybiBhdXRoXzEuQXV0aC5pc0F1dGhlbnRpY2F0ZWQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBVc2VyLmN1cnJlbnQgPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSB1c2VyO1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmUoKTtcbiAgICAgICAgICAgIHJldHVybiBBcHBVc2VyQ29udGV4dDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghQXBwVXNlckNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBBcHBVc2VyQ29udGV4dCA9IFVzZXJDb250ZXh0LmxvYWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghQXBwVXNlckNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBBcHBVc2VyQ29udGV4dCA9IG5ldyBVc2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gQXBwVXNlckNvbnRleHQ7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVzZXIuZnJvbUNvbnRleHQgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgdXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIHVzZXIuaWQgPSBkYXRhLl9pZDtcbiAgICAgICAgdXNlci5kYXRhID0gbmV3IFVzZXJEYXRhKGRhdGEuZGF0YS5kYXRhKTtcbiAgICAgICAgdXNlci5kZXRhaWxzID0gZGF0YS5kZXRhaWxzIHx8IHt9O1xuICAgICAgICB1c2VyLl9mcmVzaCA9IGRhdGEuX2ZyZXNoO1xuICAgICAgICB1c2VyLl9kaXJ0eSA9IGRhdGEuX2RpcnR5O1xuICAgICAgICByZXR1cm4gdXNlcjtcbiAgICB9O1xuICAgIFVzZXIuc2VsZiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHRlbXBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICAgICAgaWYgKCF0ZW1wVXNlci5fYmxvY2tMb2FkKSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gdHJ1ZTtcbiAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudC5nZXQoJy9hdXRoL3VzZXJzL3NlbGYnKVxuICAgICAgICAgICAgICAgIC5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5lcnJvcihlcnIpO1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2xvYWRlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgY3VzdG9tIGRhdGFcbiAgICAgICAgICAgICAgICAgICAgdGVtcFVzZXIuaWQgPSByZXMuYm9keS5kYXRhLnV1aWQ7XG4gICAgICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRhdGEgPSBuZXcgVXNlckRhdGEocmVzLmJvZHkuZGF0YS5jdXN0b20pO1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5kZXRhaWxzID0gcmVzLmJvZHkuZGF0YS5kZXRhaWxzO1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgVXNlci5jdXJyZW50KHRlbXBVc2VyKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0ZW1wVXNlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnYSBsb2FkIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciAnICsgdGhpcyArICcuJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgVXNlci5sb2FkID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB0ZW1wVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIHRlbXBVc2VyLmlkID0gaWQ7XG4gICAgICAgIGlmICghdGVtcFVzZXIuX2Jsb2NrTG9hZCkge1xuICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IHRydWU7XG4gICAgICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jbGllbnQuZ2V0KFwiL2F1dGgvdXNlcnMvXCIgKyB0ZW1wVXNlci5pZClcbiAgICAgICAgICAgICAgICAuZW5kKGZ1bmN0aW9uIChlcnIsIHJlcykge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5pbmZvKCdsb2FkZWQgdXNlcicpO1xuICAgICAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGN1c3RvbSBkYXRhXG4gICAgICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRhdGEgPSBuZXcgVXNlckRhdGEocmVzLmJvZHkuZGF0YS5jdXN0b20pO1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5kZXRhaWxzID0gcmVzLmJvZHkuZGF0YS5kZXRhaWxzO1xuICAgICAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0ZW1wVXNlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnYSBsb2FkIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciAnICsgdGhpcyArICcuJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuaXNGcmVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZyZXNoO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuaXNWYWxpZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuaWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmdldEFQSUZvcm1hdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFwaUZvcm1hdCA9IHt9O1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kZXRhaWxzKSB7XG4gICAgICAgICAgICBhcGlGb3JtYXRba2V5XSA9IHRoaXMuZGV0YWlsc1trZXldO1xuICAgICAgICB9XG4gICAgICAgIGFwaUZvcm1hdC5jdXN0b20gPSB0aGlzLmRhdGEuZGF0YTtcbiAgICAgICAgcmV0dXJuIGFwaUZvcm1hdDtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmdldEZvcm1hdCA9IGZ1bmN0aW9uIChmb3JtYXQpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZm9ybWF0dGVkID0gbnVsbDtcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgICAgIGNhc2UgJ2FwaS1zYXZlJzpcbiAgICAgICAgICAgICAgICBmb3JtYXR0ZWQgPSBzZWxmLmdldEFQSUZvcm1hdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb3JtYXR0ZWQ7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5taWdyYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcmF3RGF0YSA9IFVzZXJDb250ZXh0LmdldFJhd0xlZ2FjeURhdGEoKTtcbiAgICAgICAgaWYgKHJhd0RhdGEpIHtcbiAgICAgICAgICAgIGlmICghcmF3RGF0YS5fX2lvbmljX3VzZXJfbWlncmF0ZWQpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudFVzZXIgPSBJb25pYy5Vc2VyLmN1cnJlbnQoKTtcbiAgICAgICAgICAgICAgICB2YXIgdXNlckRhdGEgPSBuZXcgVXNlckRhdGEocmF3RGF0YS5kYXRhLmRhdGEpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiB1c2VyRGF0YS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRVc2VyLnNldChrZXksIHVzZXJEYXRhLmRhdGFba2V5XSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGN1cnJlbnRVc2VyLnNldCgnX19pb25pY191c2VyX21pZ3JhdGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmRlbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoc2VsZi5pc1ZhbGlkKCkpIHtcbiAgICAgICAgICAgIGlmICghc2VsZi5fYmxvY2tEZWxldGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVsZXRlKCk7XG4gICAgICAgICAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uY2xpZW50LmRlbGV0ZShcIi9hdXRoL3VzZXJzL1wiICsgdGhpcy5pZClcbiAgICAgICAgICAgICAgICAgICAgLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tEZWxldGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdkZWxldGVkICcgKyBzZWxmKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYSBkZWxldGUgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yICcgKyB0aGlzICsgJy4nKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLl9zdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZSgpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5fZGVsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcyA9PT0gVXNlci5jdXJyZW50KCkpIHtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LmRlbGV0ZSgpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5zYXZlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tTYXZlKSB7XG4gICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5fc3RvcmUoKTtcbiAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudC5wYXRjaChcIi9hdXRoL3VzZXJzL1wiICsgdGhpcy5pZClcbiAgICAgICAgICAgICAgICAuc2VuZChzZWxmLmdldEZvcm1hdCgnYXBpLXNhdmUnKSlcbiAgICAgICAgICAgICAgICAuZW5kKGZ1bmN0aW9uIChlcnIsIHJlcykge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fZGlydHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9kaXJ0eSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNlbGYuaXNGcmVzaCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl91bnNldCA9IHt9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzYXZlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2Egc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgJyArIHRoaXMgKyAnLicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLnJlc2V0UGFzc3dvcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uY2xpZW50LnBvc3QoXCIvYXV0aC91c2Vycy9cIiArIHRoaXMuaWQgKyBcIi9wYXNzd29yZC1yZXNldFwiKVxuICAgICAgICAgICAgLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncGFzc3dvcmQgcmVzZXQgZm9yIHVzZXInKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShVc2VyLnByb3RvdHlwZSwgXCJpZFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2lkIHx8IG51bGw7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuX2lkID0gdjtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgVXNlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAnPElvbmljVXNlciBbXFwnJyArIHRoaXMuaWQgKyAnXFwnXT4nO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuX3Vuc2V0W2tleV07XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEuc2V0KGtleSwgdmFsdWUpO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEuZ2V0KGtleSwgZGVmYXVsdFZhbHVlKTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLnVuc2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0aGlzLl91bnNldFtrZXldID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS51bnNldChrZXkpO1xuICAgIH07XG4gICAgcmV0dXJuIFVzZXI7XG59KCkpO1xuZXhwb3J0cy5Vc2VyID0gVXNlcjtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi4vY29yZS9sb2dnZXInKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBOT19QTFVHSU4gPSAnSU9OSUNfREVQTE9ZX01JU1NJTkdfUExVR0lOJztcbnZhciBJTklUSUFMX0RFTEFZID0gMSAqIDUgKiAxMDAwO1xudmFyIFdBVENIX0lOVEVSVkFMID0gMSAqIDYwICogMTAwMDtcbnZhciBEZXBsb3kgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIERlcGxveSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBsb2dnZXJfMS5Mb2dnZXIoJ0lvbmljIERlcGxveTonKTtcbiAgICAgICAgdGhpcy5fcGx1Z2luID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY2hhbm5lbFRhZyA9ICdwcm9kdWN0aW9uJztcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnaW5pdCcpO1xuICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuaW5pdGlhbGl6ZSgpO1xuICAgICAgICAgICAgc2VsZi5faXNSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5lbWl0dGVyLmVtaXQoJ2RlcGxveTpyZWFkeScpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRmV0Y2ggdGhlIERlcGxveSBQbHVnaW5cbiAgICAgKlxuICAgICAqIElmIHRoZSBwbHVnaW4gaGFzIG5vdCBiZWVuIHNldCB5ZXQsIGF0dGVtcHQgdG8gZmV0Y2ggaXQsIG90aGVyd2lzZSBsb2dcbiAgICAgKiBhIG1lc3NhZ2UuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtJb25pY0RlcGxveX0gUmV0dXJucyB0aGUgcGx1Z2luIG9yIGZhbHNlXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5fZ2V0UGx1Z2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5fcGx1Z2luKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGx1Z2luO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgSW9uaWNEZXBsb3kgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdwbHVnaW4gaXMgbm90IGluc3RhbGxlZCBvciBoYXMgbm90IGxvYWRlZC4gSGF2ZSB5b3UgcnVuIGBpb25pYyBwbHVnaW4gYWRkIGlvbmljLXBsdWdpbi1kZXBsb3lgIHlldD8nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9wbHVnaW4gPSBJb25pY0RlcGxveTtcbiAgICAgICAgcmV0dXJuIElvbmljRGVwbG95O1xuICAgIH07XG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZSB0aGUgRGVwbG95IFBsdWdpblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5pbml0aWFsaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uaW5pdChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENoZWNrIGZvciB1cGRhdGVzXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBXaWxsIHJlc29sdmUgd2l0aCB0cnVlIGlmIGFuIHVwZGF0ZSBpcyBhdmFpbGFibGUsIGZhbHNlIG90aGVyd2lzZS4gQSBzdHJpbmcgb3JcbiAgICAgKiAgIGVycm9yIHdpbGwgYmUgcGFzc2VkIHRvIHJlamVjdCgpIGluIHRoZSBldmVudCBvZiBhIGZhaWx1cmUuXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5jaGVjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmNoZWNrKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCBzZWxmLl9jaGFubmVsVGFnLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0ID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FuIHVwZGF0ZSBpcyBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdubyB1cGRhdGVzIGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ2VuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIGNoZWNraW5nIGZvciB1cGRhdGVzJyk7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRG93bmxvYWQgYW5kIGF2YWlsYWJsZSB1cGRhdGVcbiAgICAgKlxuICAgICAqIFRoaXMgc2hvdWxkIGJlIHVzZWQgaW4gY29uanVuY3Rpb24gd2l0aCBleHRyYWN0KClcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcHJvbWlzZSB3aGljaCB3aWxsIHJlc29sdmUgd2l0aCB0cnVlL2ZhbHNlIG9yIHVzZVxuICAgICAqICAgIG5vdGlmeSB0byB1cGRhdGUgdGhlIGRvd25sb2FkIHByb2dyZXNzLlxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuZG93bmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5kb3dubG9hZChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAndHJ1ZScgJiYgcmVzdWx0ICE9PSAnZmFsc2UnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICd0cnVlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2Rvd25sb2FkIGNvbXBsZXRlJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCA9PT0gJ3RydWUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEV4dHJhY3QgdGhlIGxhc3QgZG93bmxvYWRlZCB1cGRhdGVcbiAgICAgKlxuICAgICAqIFRoaXMgc2hvdWxkIGJlIGNhbGxlZCBhZnRlciBhIGRvd25sb2FkKCkgc3VjY2Vzc2Z1bGx5IHJlc29sdmVzLlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSBwcm9taXNlIHdoaWNoIHdpbGwgcmVzb2x2ZSB3aXRoIHRydWUvZmFsc2Ugb3IgdXNlXG4gICAgICogICAgICAgICAgICAgICAgICAgbm90aWZ5IHRvIHVwZGF0ZSB0aGUgZXh0cmFjdGlvbiBwcm9ncmVzcy5cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmV4dHJhY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5leHRyYWN0KGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgIT09ICdkb25lJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdleHRyYWN0aW9uIGNvbXBsZXRlJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBMb2FkIHRoZSBsYXRlc3QgZGVwbG95ZWQgdmVyc2lvblxuICAgICAqIFRoaXMgaXMgb25seSBuZWNlc3NhcnkgdG8gY2FsbCBpZiB5b3UgaGF2ZSBtYW51YWxseSBkb3dubG9hZGVkIGFuZCBleHRyYWN0ZWRcbiAgICAgKiBhbiB1cGRhdGUgYW5kIHdpc2ggdG8gcmVsb2FkIHRoZSBhcHAgd2l0aCB0aGUgbGF0ZXN0IGRlcGxveS4gVGhlIGxhdGVzdCBkZXBsb3lcbiAgICAgKiB3aWxsIGF1dG9tYXRpY2FsbHkgYmUgbG9hZGVkIHdoZW4gdGhlIGFwcCBpcyBzdGFydGVkLlxuICAgICAqXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5yZWRpcmVjdChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogV2F0Y2ggY29uc3RhbnRseSBjaGVja3MgZm9yIHVwZGF0ZXMsIGFuZCB0cmlnZ2VycyBhblxuICAgICAqIGV2ZW50IHdoZW4gb25lIGlzIHJlYWR5LlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIFdhdGNoIGNvbmZpZ3VyYXRpb24gb3B0aW9uc1xuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IHJldHVybnMgYSBwcm9taXNlIHRoYXQgd2lsbCBnZXQgYSBub3RpZnkoKSBjYWxsYmFjayB3aGVuIGFuIHVwZGF0ZSBpcyBhdmFpbGFibGVcbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLndhdGNoID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5pbml0aWFsRGVsYXkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBvcHRzLmluaXRpYWxEZWxheSA9IElOSVRJQUxfREVMQVk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBvcHRzLmludGVydmFsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgb3B0cy5pbnRlcnZhbCA9IFdBVENIX0lOVEVSVkFMO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrRm9yVXBkYXRlcygpIHtcbiAgICAgICAgICAgIHNlbGYuY2hlY2soKS50aGVuKGZ1bmN0aW9uIChoYXNVcGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaGFzVXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShoYXNVcGRhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCd1bmFibGUgdG8gY2hlY2sgZm9yIHVwZGF0ZXM6ICcgKyBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBDaGVjayBvdXIgdGltZW91dCB0byBtYWtlIHN1cmUgaXQgd2Fzbid0IGNsZWFyZWQgd2hpbGUgd2Ugd2VyZSB3YWl0aW5nXG4gICAgICAgICAgICAvLyBmb3IgYSBzZXJ2ZXIgcmVzcG9uc2VcbiAgICAgICAgICAgIGlmICh0aGlzLl9jaGVja1RpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jaGVja1RpbWVvdXQgPSBzZXRUaW1lb3V0KGNoZWNrRm9yVXBkYXRlcy5iaW5kKHNlbGYpLCBvcHRzLmludGVydmFsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBDaGVjayBhZnRlciBhbiBpbml0aWFsIHNob3J0IGRlcGxheVxuICAgICAgICB0aGlzLl9jaGVja1RpbWVvdXQgPSBzZXRUaW1lb3V0KGNoZWNrRm9yVXBkYXRlcy5iaW5kKHNlbGYpLCBvcHRzLmluaXRpYWxEZWxheSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogU3RvcCBhdXRvbWF0aWNhbGx5IGxvb2tpbmcgZm9yIHVwZGF0ZXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUudW53YXRjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX2NoZWNrVGltZW91dCk7XG4gICAgICAgIHRoaXMuX2NoZWNrVGltZW91dCA9IG51bGw7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBJbmZvcm1hdGlvbiBhYm91dCB0aGUgY3VycmVudCBkZXBsb3lcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSByZXNvbHZlciB3aWxsIGJlIHBhc3NlZCBhbiBvYmplY3QgdGhhdCBoYXMga2V5L3ZhbHVlXG4gICAgICogICAgcGFpcnMgcGVydGFpbmluZyB0byB0aGUgY3VycmVudGx5IGRlcGxveWVkIHVwZGF0ZS5cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmluZm8gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbmZvKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIExpc3QgdGhlIERlcGxveSB2ZXJzaW9ucyB0aGF0IGhhdmUgYmVlbiBpbnN0YWxsZWQgb24gdGhpcyBkZXZpY2VcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSByZXNvbHZlciB3aWxsIGJlIHBhc3NlZCBhbiBhcnJheSBvZiBkZXBsb3kgdXVpZHNcbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmdldFZlcnNpb25zID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uZ2V0VmVyc2lvbnMoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVtb3ZlIGFuIGluc3RhbGxlZCBkZXBsb3kgb24gdGhpcyBkZXZpY2VcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB1dWlkIFRoZSBkZXBsb3kgdXVpZCB5b3Ugd2lzaCB0byByZW1vdmUgZnJvbSB0aGUgZGV2aWNlXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gU3RhbmRhcmQgcmVzb2x2ZS9yZWplY3QgcmVzb2x1dGlvblxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuZGVsZXRlVmVyc2lvbiA9IGZ1bmN0aW9uICh1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5kZWxldGVWZXJzaW9uKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCB1dWlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZldGNoZXMgdGhlIG1ldGFkYXRhIGZvciBhIGdpdmVuIGRlcGxveSB1dWlkLiBJZiBubyB1dWlkIGlzIGdpdmVuLCBpdCB3aWxsIGF0dGVtcHRcbiAgICAgKiB0byBncmFiIHRoZSBtZXRhZGF0YSBmb3IgdGhlIG1vc3QgcmVjZW50bHkga25vd24gdXBkYXRlIHZlcnNpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXVpZCBUaGUgZGVwbG95IHV1aWQgeW91IHdpc2ggdG8gZ3JhYiBtZXRhZGF0YSBmb3IsIGNhbiBiZSBsZWZ0IGJsYW5rIHRvIGdyYWIgbGF0ZXN0IGtub3duIHVwZGF0ZSBtZXRhZGF0YVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFN0YW5kYXJkIHJlc29sdmUvcmVqZWN0IHJlc29sdXRpb25cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmdldE1ldGFkYXRhID0gZnVuY3Rpb24gKHV1aWQpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldE1ldGFkYXRhKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCB1dWlkLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0Lm1ldGFkYXRhKTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFNldCB0aGUgZGVwbG95IGNoYW5uZWwgdGhhdCBzaG91bGQgYmUgY2hlY2tlZCBmb3IgdXBkYXRzZVxuICAgICAqIFNlZSBodHRwOi8vZG9jcy5pb25pYy5pby9kb2NzL2RlcGxveS1jaGFubmVscyBmb3IgbW9yZSBpbmZvcm1hdGlvblxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGNoYW5uZWxUYWcgVGhlIGNoYW5uZWwgdGFnIHRvIHVzZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5zZXRDaGFubmVsID0gZnVuY3Rpb24gKGNoYW5uZWxUYWcpIHtcbiAgICAgICAgdGhpcy5fY2hhbm5lbFRhZyA9IGNoYW5uZWxUYWc7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBVcGRhdGUgYXBwIHdpdGggdGhlIGxhdGVzdCBkZXBsb3lcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGRlZmVyTG9hZCBEZWZlciBsb2FkaW5nIHRoZSBhcHBsaWVkIHVwZGF0ZSBhZnRlciB0aGUgaW5zdGFsbGF0aW9uXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gQSBwcm9taXNlIHJlc3VsdFxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gKGRlZmVyTG9hZCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlckxvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHR5cGVvZiBkZWZlckxvYWQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBkZWZlckxvYWRpbmcgPSBkZWZlckxvYWQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciB1cGRhdGVzXG4gICAgICAgICAgICAgICAgc2VsZi5jaGVjaygpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGVyZSBhcmUgdXBkYXRlcywgZG93bmxvYWQgdGhlbVxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGRvd25sb2FkUHJvZ3Jlc3MgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5kb3dubG9hZCgpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCgnZG93bmxvYWQgZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5leHRyYWN0KCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2V4dHJhY3Rpb24gZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRlZmVyTG9hZGluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5yZWRpcmVjdChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcHJvZ3Jlc3MgPSBkb3dubG9hZFByb2dyZXNzICsgKHVwZGF0ZSAvIDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkocHJvZ3Jlc3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICh1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3dubG9hZFByb2dyZXNzID0gKHVwZGF0ZSAvIDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShkb3dubG9hZFByb2dyZXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBkZXBsb3kgaXMgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogZGVwbG95IGhhcyBhbHJlYWR5IGJlY29tZSBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5vblJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2lzUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uZW1pdHRlci5vbignZGVwbG95OnJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBEZXBsb3k7XG59KCkpO1xuZXhwb3J0cy5EZXBsb3kgPSBEZXBsb3k7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2RlcGxveScpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGNvcmVfMSA9IHJlcXVpcmUoJy4uL2NvcmUvY29yZScpO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIGVudkFQSUVuZHBvaW50cyA9IHtcbiAgICAnZ2V0RW52JzogZnVuY3Rpb24gKGFwcElkLCB0YWcpIHtcbiAgICAgICAgcmV0dXJuICcvYXBwcy8nICsgYXBwSWQgKyAnL2Vudi8nICsgdGFnO1xuICAgIH1cbn07XG52YXIgRW52aXJvbm1lbnQgPSAoZnVuY3Rpb24gKCkge1xuICAgIC8qKlxuICAgICAqIEVudmlyb25tZW50IGNvbnN0cnVjdG9yXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gY29uZmlnIENvbmZpZ3VyYXRpb24gb2JqZWN0XG4gICAgICovXG4gICAgZnVuY3Rpb24gRW52aXJvbm1lbnQoKSB7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIExvYWQgYW4gZW52aXJvbm1lbnQsIGNhbGxzIGxvYWRFbnZGcm9tQVBJXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdGFnIEVudmlyb25tZW50IHRhZ1xuICAgICAqIEByZXR1cm4ge0RlZmVycmVkUHJvbWlzZX0gd2lsbCByZXNvbHZlL3JlamVjdCB3aXRoIHRoZSBjb25maWcgb2JqZWN0IG9yIGVycm9yXG4gICAgICovXG4gICAgRW52aXJvbm1lbnQucHJvdG90eXBlLmxvYWQgPSBmdW5jdGlvbiAodGFnKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMubG9hZEVudkZyb21BUEkodGFnKS50aGVuKGZ1bmN0aW9uIChlbnYpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZW52Wydjb25maWcnXSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBMb2FkIGFuIGVudmlyb25tZW50IGZyb20gdGhlIEFQSVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHRhZyBFbnZpcm9ubWVudCB0YWdcbiAgICAgKiBAcmV0dXJuIHtEZWZlcnJlZFByb21pc2V9IHdpbGwgcmVzb2x2ZS9yZWplY3Qgd2l0aCB0aGUgY29uZmlnIG9iamVjdCBvciBlcnJvclxuICAgICAqL1xuICAgIEVudmlyb25tZW50LnByb3RvdHlwZS5sb2FkRW52RnJvbUFQSSA9IGZ1bmN0aW9uICh0YWcpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uY2xpZW50LmdldCgnL2FwcHMvJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpICsgJy9lbnYvJyArIHRhZylcbiAgICAgICAgICAgIC5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChyZXMub2spIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlcy5ib2R5LmRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICByZXR1cm4gRW52aXJvbm1lbnQ7XG59KCkpO1xuZXhwb3J0cy5FbnZpcm9ubWVudCA9IEVudmlyb25tZW50O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9lbnZpcm9ubWVudHMnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2FuYWx5dGljcy9pbmRleCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vYXV0aC9pbmRleCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vY29yZS9pbmRleCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vZGVwbG95L2luZGV4JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9pbnNpZ2h0cy9pbmRleCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vZW52aXJvbm1lbnRzL2luZGV4JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9wdXNoL2luZGV4JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi91dGlsL2luZGV4JykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9pbnNpZ2h0cycpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi4vY29yZS9sb2dnZXInKTtcbnZhciBTdGF0ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBTdGF0KGFwcElkLCBzdGF0LCB2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgPT09IHZvaWQgMCkgeyB2YWx1ZSA9IDE7IH1cbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLnN0YXQgPSBzdGF0O1xuICAgICAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIHRoaXMuYXBwSWQgPSBhcHBJZDtcbiAgICAgICAgdGhpcy5zdGF0ID0gc3RhdDtcbiAgICAgICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLmNyZWF0ZWQgPSBuZXcgRGF0ZSgpO1xuICAgIH1cbiAgICBTdGF0LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhcHBfaWQ6IHRoaXMuYXBwSWQsXG4gICAgICAgICAgICBzdGF0OiB0aGlzLnN0YXQsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy52YWx1ZSxcbiAgICAgICAgICAgIGNyZWF0ZWQ6IHRoaXMuY3JlYXRlZC50b0lTT1N0cmluZygpLFxuICAgICAgICB9O1xuICAgIH07XG4gICAgcmV0dXJuIFN0YXQ7XG59KCkpO1xuZXhwb3J0cy5TdGF0ID0gU3RhdDtcbnZhciBJbnNpZ2h0cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gSW5zaWdodHMoY2xpZW50LCBhcHBJZCkge1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLnN1Ym1pdENvdW50ID0gSW5zaWdodHMuU1VCTUlUX0NPVU5UO1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLmJhdGNoID0gW107XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcignSW9uaWMgSW5zaWdodHM6Jyk7XG4gICAgfVxuICAgIEluc2lnaHRzLnByb3RvdHlwZS50cmFjayA9IGZ1bmN0aW9uIChzdGF0LCB2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgPT09IHZvaWQgMCkgeyB2YWx1ZSA9IDE7IH1cbiAgICAgICAgdGhpcy50cmFja1N0YXQobmV3IFN0YXQodGhpcy5hcHBJZCwgc3RhdCwgdmFsdWUpKTtcbiAgICB9O1xuICAgIEluc2lnaHRzLnByb3RvdHlwZS50cmFja1N0YXQgPSBmdW5jdGlvbiAoc3RhdCkge1xuICAgICAgICB0aGlzLmJhdGNoLnB1c2goc3RhdCk7XG4gICAgICAgIGlmICh0aGlzLnNob3VsZFN1Ym1pdCgpKSB7XG4gICAgICAgICAgICB0aGlzLnN1Ym1pdCgpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBJbnNpZ2h0cy5wcm90b3R5cGUuc2hvdWxkU3VibWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXRjaC5sZW5ndGggPj0gdGhpcy5zdWJtaXRDb3VudDtcbiAgICB9O1xuICAgIEluc2lnaHRzLnByb3RvdHlwZS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBpbnNpZ2h0cyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBfaSA9IDAsIF9hID0gdGhpcy5iYXRjaDsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgIHZhciBzdGF0ID0gX2FbX2ldO1xuICAgICAgICAgICAgaW5zaWdodHMucHVzaChzdGF0LnRvSlNPTigpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jbGllbnQucG9zdCgnL2luc2lnaHRzJylcbiAgICAgICAgICAgIC5zZW5kKHsgJ2luc2lnaHRzJzogaW5zaWdodHMgfSk7XG4gICAgfTtcbiAgICBJbnNpZ2h0cy5TVUJNSVRfQ09VTlQgPSAxMDA7XG4gICAgcmV0dXJuIEluc2lnaHRzO1xufSgpKTtcbmV4cG9ydHMuSW5zaWdodHMgPSBJbnNpZ2h0cztcbiIsIlwidXNlIHN0cmljdFwiO1xuZnVuY3Rpb24gX19leHBvcnQobSkge1xuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKCFleHBvcnRzLmhhc093blByb3BlcnR5KHApKSBleHBvcnRzW3BdID0gbVtwXTtcbn1cbl9fZXhwb3J0KHJlcXVpcmUoJy4vcHVzaC1kZXYnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gtbWVzc2FnZScpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vcHVzaC10b2tlbicpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vcHVzaCcpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGNvcmVfMSA9IHJlcXVpcmUoJy4uL2NvcmUvY29yZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi4vY29yZS9sb2dnZXInKTtcbnZhciB1dGlsXzEgPSByZXF1aXJlKCcuLi91dGlsL3V0aWwnKTtcbnZhciBwdXNoX3Rva2VuXzEgPSByZXF1aXJlKCcuL3B1c2gtdG9rZW4nKTtcbi8qKlxuICogUHVzaERldiBTZXJ2aWNlXG4gKlxuICogVGhpcyBzZXJ2aWNlIGFjdHMgYXMgYSBtb2NrIHB1c2ggc2VydmljZSB0aGF0IGlzIGludGVuZGVkIHRvIGJlIHVzZWQgcHJlLXNldHVwIG9mXG4gKiBHQ00vQVBOUyBpbiBhbiBJb25pYy5pbyBwcm9qZWN0LlxuICpcbiAqIEhvdyBpdCB3b3JrczpcbiAqXG4gKiAgIFdoZW4gcmVnaXN0ZXIoKSBpcyBjYWxsZWQsIHRoaXMgc2VydmljZSBpcyB1c2VkIHRvIGdlbmVyYXRlIGEgcmFuZG9tXG4gKiAgIGRldmVsb3BtZW50IGRldmljZSB0b2tlbi4gVGhpcyB0b2tlbiBpcyBub3QgdmFsaWQgZm9yIGFueSBzZXJ2aWNlIG91dHNpZGUgb2ZcbiAqICAgSW9uaWMgUHVzaCB3aXRoIGBkZXZfcHVzaGAgc2V0IHRvIHRydWUuIFRoZXNlIHRva2VucyBkbyBub3QgbGFzdCBsb25nIGFuZCBhcmUgbm90XG4gKiAgIGVsaWdpYmxlIGZvciB1c2UgaW4gYSBwcm9kdWN0aW9uIGFwcC5cbiAqXG4gKiAgIFRoZSBkZXZpY2Ugd2lsbCB0aGVuIHBlcmlvZGljYWxseSBjaGVjayB0aGUgUHVzaCBzZXJ2aWNlIGZvciBwdXNoIG5vdGlmaWNhdGlvbnMgc2VudFxuICogICB0byBvdXIgZGV2ZWxvcG1lbnQgdG9rZW4gLS0gc28gdW5saWtlIGEgdHlwaWNhbCBcInB1c2hcIiB1cGRhdGUsIHRoaXMgYWN0dWFsbHkgdXNlc1xuICogICBcInBvbGxpbmdcIiB0byBmaW5kIG5ldyBub3RpZmljYXRpb25zLiBUaGlzIG1lYW5zIHlvdSAqTVVTVCogaGF2ZSB0aGUgYXBwbGljYXRpb24gb3BlblxuICogICBhbmQgaW4gdGhlIGZvcmVncm91bmQgdG8gcmV0cmVpdmUgbWVzc3NhZ2VzLlxuICpcbiAqICAgVGhlIGNhbGxiYWNrcyBwcm92aWRlZCBpbiB5b3VyIGluaXQoKSB3aWxsIHN0aWxsIGJlIHRyaWdnZXJlZCBhcyBub3JtYWwsXG4gKiAgIGJ1dCB3aXRoIHRoZXNlIG5vdGFibGUgZXhjZXB0aW9uczpcbiAqXG4gKiAgICAgIC0gVGhlcmUgaXMgbm8gcGF5bG9hZCBkYXRhIGF2YWlsYWJsZSB3aXRoIG1lc3NhZ2VzXG4gKiAgICAgIC0gQW4gYWxlcnQoKSBpcyBjYWxsZWQgd2hlbiBhIG5vdGlmaWNhdGlvbiBpcyByZWNlaXZlZCB1bmxlc3NzIHlvdSByZXR1cm4gZmFsc2VcbiAqICAgICAgICBpbiB5b3VyICdvbk5vdGlmaWNhdGlvbicgY2FsbGJhY2suXG4gKlxuICovXG52YXIgUHVzaERldlNlcnZpY2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFB1c2hEZXZTZXJ2aWNlKCkge1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNsaWVudDtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKCdJb25pYyBQdXNoIChkZXYpOicpO1xuICAgICAgICB0aGlzLl90b2tlbiA9IG51bGw7XG4gICAgICAgIHRoaXMuX3dhdGNoID0gbnVsbDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgYSBkZXZlbG9wbWVudCB0b2tlblxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBkZXZlbG9wbWVudCBkZXZpY2UgdG9rZW5cbiAgICAgKi9cbiAgICBQdXNoRGV2U2VydmljZS5wcm90b3R5cGUuZ2V0RGV2VG9rZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB0b2tlbiA9IHV0aWxfMS5nZW5lcmF0ZVVVSUQoKTtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSAnREVWLScgKyB0b2tlbjtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIGEgZGV2ZWxvcG1lbnQgdG9rZW4gd2l0aCB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0lvbmljUHVzaFNlcnZpY2V9IGlvbmljUHVzaCBJbnN0YW50aWF0ZWQgUHVzaCBTZXJ2aWNlXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgUmVnaXN0cmF0aW9uIENhbGxiYWNrXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoRGV2U2VydmljZS5wcm90b3R5cGUuaW5pdCA9IGZ1bmN0aW9uIChpb25pY1B1c2gsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3B1c2ggPSBpb25pY1B1c2g7XG4gICAgICAgIHZhciB0b2tlbiA9IHRoaXMuX3Rva2VuO1xuICAgICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgICAgICB0b2tlbiA9IHRoaXMuZ2V0RGV2VG9rZW4oKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsaWVudC5wb3N0KCcvcHVzaC9kZXZlbG9wbWVudCcpXG4gICAgICAgICAgICAuc2VuZCh7ICd0b2tlbic6IHRva2VuIH0pXG4gICAgICAgICAgICAuZW5kKGZ1bmN0aW9uIChlcnIsIHJlcykge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIF90aGlzLmxvZ2dlci5lcnJvcignZXJyb3IgY29ubmVjdGluZyBkZXZlbG9wbWVudCBwdXNoIHNlcnZpY2U6ICcgKyBlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSB7ICdyZWdpc3RyYXRpb25JZCc6IHRva2VuIH07XG4gICAgICAgICAgICAgICAgX3RoaXMubG9nZ2VyLmluZm8oJ3JlZ2lzdGVyZWQgd2l0aCBkZXZlbG9wbWVudCBwdXNoIHNlcnZpY2U6ICcgKyB0b2tlbik7XG4gICAgICAgICAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uZW1pdHRlci5lbWl0KCdwdXNoOnRva2VuJywgZGF0YSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhuZXcgcHVzaF90b2tlbl8xLlB1c2hUb2tlbihfdGhpcy5fdG9rZW4pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgX3RoaXMud2F0Y2goKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHB1c2ggc2VydmljZSBmb3Igbm90aWZpY2F0aW9ucyB0aGF0IHRhcmdldCB0aGUgY3VycmVudCBkZXZlbG9wbWVudCB0b2tlblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmNoZWNrRm9yTm90aWZpY2F0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLl90b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xpZW50LmdldCgnL3B1c2gvZGV2ZWxvcG1lbnQnKVxuICAgICAgICAgICAgLnF1ZXJ5KHsgJ3Rva2VuJzogdGhpcy5fdG9rZW4gfSlcbiAgICAgICAgICAgIC5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgX3RoaXMubG9nZ2VyLmVycm9yKCd1bmFibGUgdG8gY2hlY2sgZm9yIGRldmVsb3BtZW50IHB1c2hlczogJyArIGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzLmJvZHkuZGF0YS5tZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtZXNzYWdlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgJ21lc3NhZ2UnOiByZXMuYm9keS5kYXRhLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAndGl0bGUnOiAnREVWRUxPUE1FTlQgUFVTSCdcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgX3RoaXMubG9nZ2VyLndhcm4oJ0lvbmljIFB1c2g6IERldmVsb3BtZW50IFB1c2ggcmVjZWl2ZWQuIERldmVsb3BtZW50IHB1c2hlcyB3aWxsIG5vdCBjb250YWluIHBheWxvYWQgZGF0YS4nKTtcbiAgICAgICAgICAgICAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uZW1pdHRlci5lbWl0KCdwdXNoOm5vdGlmaWNhdGlvbicsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBLaWNrcyBvZmYgdGhlIFwicG9sbGluZ1wiIG9mIHRoZSBJb25pYyBQdXNoIHNlcnZpY2UgZm9yIG5ldyBwdXNoIG5vdGlmaWNhdGlvbnNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2hEZXZTZXJ2aWNlLnByb3RvdHlwZS53YXRjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBkZXYgcHVzaGVzIGV2ZXJ5IDUgc2Vjb25kc1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCd3YXRjaGluZyBmb3IgbmV3IG5vdGlmaWNhdGlvbnMnKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuX3dhdGNoKSB7XG4gICAgICAgICAgICB0aGlzLl93YXRjaCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgc2VsZi5jaGVja0Zvck5vdGlmaWNhdGlvbnMoKTsgfSwgNTAwMCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFB1dHMgdGhlIFwicG9sbGluZ1wiIGZvciBuZXcgbm90aWZpY2F0aW9ucyBvbiBob2xkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmhhbHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl93YXRjaCkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl93YXRjaCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBQdXNoRGV2U2VydmljZTtcbn0oKSk7XG5leHBvcnRzLlB1c2hEZXZTZXJ2aWNlID0gUHVzaERldlNlcnZpY2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBQdXNoTWVzc2FnZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUHVzaE1lc3NhZ2UocmF3KSB7XG4gICAgICAgIHRoaXMuYXBwID0ge307XG4gICAgICAgIHRoaXMuX3JhdyA9IHJhdyB8fCB7fTtcbiAgICAgICAgaWYgKCF0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEpIHtcbiAgICAgICAgICAgIC8vIHRoaXMgc2hvdWxkIG9ubHkgaGl0IGlmIHdlIGFyZSBzZXJ2aW5nIHVwIGEgZGV2ZWxvcG1lbnQgcHVzaFxuICAgICAgICAgICAgdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhID0ge1xuICAgICAgICAgICAgICAgICdjb2xkc3RhcnQnOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAnZm9yZWdyb3VuZCc6IHRydWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fcGF5bG9hZCA9IG51bGw7XG4gICAgICAgIHRoaXMudGV4dCA9IG51bGw7XG4gICAgICAgIHRoaXMudGl0bGUgPSBudWxsO1xuICAgICAgICB0aGlzLmNvdW50ID0gbnVsbDtcbiAgICAgICAgdGhpcy5zb3VuZCA9IG51bGw7XG4gICAgICAgIHRoaXMuaW1hZ2UgPSBudWxsO1xuICAgIH1cbiAgICBQdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTiA9IGZ1bmN0aW9uIChqc29uKSB7XG4gICAgICAgIHZhciBtZXNzYWdlID0gbmV3IFB1c2hNZXNzYWdlKGpzb24pO1xuICAgICAgICBtZXNzYWdlLnByb2Nlc3NSYXcoKTtcbiAgICAgICAgcmV0dXJuIG1lc3NhZ2U7XG4gICAgfTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUHVzaE1lc3NhZ2UucHJvdG90eXBlLCBcInBheWxvYWRcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wYXlsb2FkIHx8IHt9O1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBQdXNoTWVzc2FnZS5wcm90b3R5cGUucHJvY2Vzc1JhdyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy50ZXh0ID0gdGhpcy5fcmF3Lm1lc3NhZ2UgfHwgbnVsbDtcbiAgICAgICAgdGhpcy50aXRsZSA9IHRoaXMuX3Jhdy50aXRsZSB8fCBudWxsO1xuICAgICAgICB0aGlzLmNvdW50ID0gdGhpcy5fcmF3LmNvdW50IHx8IG51bGw7XG4gICAgICAgIHRoaXMuc291bmQgPSB0aGlzLl9yYXcuc291bmQgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuX3Jhdy5pbWFnZSB8fCBudWxsO1xuICAgICAgICBpZiAoIXRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5mb3JlZ3JvdW5kKSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5hc2xlZXAgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEuY29sZHN0YXJ0KSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5jbG9zZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEucGF5bG9hZCkge1xuICAgICAgICAgICAgdGhpcy5fcGF5bG9hZCA9IHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5wYXlsb2FkO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBQdXNoTWVzc2FnZS5wcm90b3R5cGUuZ2V0UmF3VmVyc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JhdztcbiAgICB9O1xuICAgIFB1c2hNZXNzYWdlLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICc8UHVzaE1lc3NhZ2UgW1xcJycgKyB0aGlzLnRpdGxlICsgJ1xcJ10+JztcbiAgICB9O1xuICAgIHJldHVybiBQdXNoTWVzc2FnZTtcbn0oKSk7XG5leHBvcnRzLlB1c2hNZXNzYWdlID0gUHVzaE1lc3NhZ2U7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBQdXNoVG9rZW4gPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFB1c2hUb2tlbih0b2tlbikge1xuICAgICAgICB0aGlzLnRva2VuID0gdG9rZW47XG4gICAgICAgIHRoaXMudG9rZW4gPSB0b2tlbjtcbiAgICB9XG4gICAgUHVzaFRva2VuLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFwiPFB1c2hUb2tlbiBbXCIgKyB0aGlzLnRva2VuICsgXCJdPlwiO1xuICAgIH07XG4gICAgcmV0dXJuIFB1c2hUb2tlbjtcbn0oKSk7XG5leHBvcnRzLlB1c2hUb2tlbiA9IFB1c2hUb2tlbjtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGFwcF8xID0gcmVxdWlyZSgnLi4vY29yZS9hcHAnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgcHJvbWlzZV8xID0gcmVxdWlyZSgnLi4vY29yZS9wcm9taXNlJyk7XG52YXIgdXNlcl8xID0gcmVxdWlyZSgnLi4vY29yZS91c2VyJyk7XG52YXIgcHVzaF90b2tlbl8xID0gcmVxdWlyZSgnLi9wdXNoLXRva2VuJyk7XG52YXIgcHVzaF9tZXNzYWdlXzEgPSByZXF1aXJlKCcuL3B1c2gtbWVzc2FnZScpO1xudmFyIHB1c2hfZGV2XzEgPSByZXF1aXJlKCcuL3B1c2gtZGV2Jyk7XG52YXIgUHVzaCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUHVzaChjb25maWcpIHtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcztcbiAgICAgICAgaWYgKGNvbmZpZyA9PT0gdm9pZCAwKSB7IGNvbmZpZyA9IHt9OyB9XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5jbGllbnQgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jbGllbnQ7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcignSW9uaWMgUHVzaDonKTtcbiAgICAgICAgdmFyIGFwcCA9IG5ldyBhcHBfMS5BcHAoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwaV9rZXknKSk7XG4gICAgICAgIGFwcC5kZXZQdXNoID0gY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnZGV2X3B1c2gnKTtcbiAgICAgICAgYXBwLmdjbUtleSA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2djbV9rZXknKTtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIHRoZSByZXF1aXJlZCB2YWx1ZXMgdG8gdXNlIHRoaXMgc2VydmljZVxuICAgICAgICBpZiAoIWFwcC5pZCB8fCAhYXBwLmFwaUtleSkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ25vIGFwcF9pZCBmb3VuZC4gKGh0dHA6Ly9kb2NzLmlvbmljLmlvL2RvY3MvaW8taW5zdGFsbCknKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5kZXZpY2UuaXNBbmRyb2lkKCkgJiYgIWFwcC5kZXZQdXNoICYmICFhcHAuZ2NtS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignR0NNIHByb2plY3QgbnVtYmVyIG5vdCBmb3VuZCAoaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9wdXNoLWFuZHJvaWQtc2V0dXApJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMucmVnaXN0ZXJDYWxsYmFjayA9IG51bGw7XG4gICAgICAgIHRoaXMubm90aWZpY2F0aW9uQ2FsbGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLmVycm9yQ2FsbGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLl9ub3RpZmljYXRpb24gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZGVidWcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNSZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl90b2tlblJlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrU2F2ZVRva2VuID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3JlZ2lzdGVyZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fcGx1Z2luID0gbnVsbDtcbiAgICAgICAgaWYgKGNvbmZpZy5kZWZlckluaXQpIHtcbiAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmluaXQoY29uZmlnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQdXNoLnByb3RvdHlwZSwgXCJ0b2tlblwiLCB7XG4gICAgICAgIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgICAgdmFyIHN0b3JhZ2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5zdG9yYWdlO1xuICAgICAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4pIHtcbiAgICAgICAgICAgICAgICBzdG9yYWdlLnN0b3JlT2JqZWN0KCdpb25pY19pb19wdXNoX3Rva2VuJywgeyAndG9rZW4nOiB2YWwudG9rZW4gfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl90b2tlbiA9IHZhbDtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgUHVzaC5wcm90b3R5cGUuZ2V0U3RvcmFnZVRva2VuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLnN0b3JhZ2U7XG4gICAgICAgIHZhciB0b2tlbiA9IHN0b3JhZ2UucmV0cmlldmVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nKTtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4odG9rZW4udG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuY2xlYXJTdG9yYWdlVG9rZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gY29yZV8xLklvbmljUGxhdGZvcm0uc3RvcmFnZTtcbiAgICAgICAgc3RvcmFnZS5kZWxldGVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEluaXQgbWV0aG9kIHRvIHNldHVwIHB1c2ggYmVoYXZpb3Ivb3B0aW9uc1xuICAgICAqXG4gICAgICogVGhlIGNvbmZpZyBzdXBwb3J0cyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAgICogICAtIGRlYnVnIHtCb29sZWFufSBFbmFibGVzIHNvbWUgZXh0cmEgbG9nZ2luZyBhcyB3ZWxsIGFzIHNvbWUgZGVmYXVsdCBjYWxsYmFjayBoYW5kbGVyc1xuICAgICAqICAgLSBvbk5vdGlmaWNhdGlvbiB7RnVuY3Rpb259IENhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgaXMgcGFzc2VkIHRoZSBub3RpZmljYXRpb24gb2JqZWN0XG4gICAgICogICAtIG9uUmVnaXN0ZXIge0Z1bmN0aW9ufSBDYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHBhc3NlZCB0aGUgcmVnaXN0cmF0aW9uIG9iamVjdFxuICAgICAqICAgLSBvbkVycm9yIHtGdW5jdGlvbn0gQ2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBpcyBwYXNzZWQgdGhlIGVycm9yIG9iamVjdFxuICAgICAqICAgLSBwbHVnaW5Db25maWcge09iamVjdH0gUGx1Z2luIGNvbmZpZ3VyYXRpb246IGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC9waG9uZWdhcC1wbHVnaW4tcHVzaFxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGNvbmZpZyBDb25maWd1cmF0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge1B1c2h9IHJldHVybnMgdGhlIGNhbGxlZCBQdXNoIGluc3RhbnRpYXRpb25cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5pbml0ID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICBpZiAoY29uZmlnID09PSB2b2lkIDApIHsgY29uZmlnID0ge307IH1cbiAgICAgICAgdGhpcy5fZ2V0UHVzaFBsdWdpbigpO1xuICAgICAgICBpZiAoIWNvbmZpZy5wbHVnaW5Db25maWcpIHtcbiAgICAgICAgICAgIGNvbmZpZy5wbHVnaW5Db25maWcgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29yZV8xLklvbmljUGxhdGZvcm0uZGV2aWNlLmlzQW5kcm9pZCgpKSB7XG4gICAgICAgICAgICAvLyBpbmplY3QgZ2NtIGtleSBmb3IgUHVzaFBsdWdpblxuICAgICAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQpIHtcbiAgICAgICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQgPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghY29uZmlnLnBsdWdpbkNvbmZpZy5hbmRyb2lkLnNlbmRlcklkKSB7XG4gICAgICAgICAgICAgICAgY29uZmlnLnBsdWdpbkNvbmZpZy5hbmRyb2lkLnNlbmRlcklEID0gdGhpcy5hcHAuZ2NtS2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIFN0b3JlIENhbGxiYWNrc1xuICAgICAgICBpZiAoY29uZmlnLm9uUmVnaXN0ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0UmVnaXN0ZXJDYWxsYmFjayhjb25maWcub25SZWdpc3Rlcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5vbk5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5zZXROb3RpZmljYXRpb25DYWxsYmFjayhjb25maWcub25Ob3RpZmljYXRpb24pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcub25FcnJvcikge1xuICAgICAgICAgICAgdGhpcy5zZXRFcnJvckNhbGxiYWNrKGNvbmZpZy5vbkVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSB0cnVlO1xuICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5lbWl0dGVyLmVtaXQoJ3B1c2g6cmVhZHknLCB7ICdjb25maWcnOiB0aGlzLl9jb25maWcgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuc2F2ZVRva2VuID0gZnVuY3Rpb24gKHRva2VuLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgaWYgKHRva2VuLnRva2VuKSB7XG4gICAgICAgICAgICB0b2tlbiA9IHRva2VuLnRva2VuO1xuICAgICAgICB9XG4gICAgICAgIHZhciB0b2tlbkRhdGEgPSB7XG4gICAgICAgICAgICAndG9rZW4nOiB0b2tlbixcbiAgICAgICAgICAgICdhcHBfaWQnOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIW9wdHMuaWdub3JlX3VzZXIpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gdXNlcl8xLlVzZXIuY3VycmVudCgpO1xuICAgICAgICAgICAgaWYgKHVzZXIuaXNBdXRoZW50aWNhdGVkKCkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbkRhdGEudXNlcl9pZCA9IHVzZXIuaWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLl9ibG9ja1NhdmVUb2tlbikge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQucG9zdCgnL3B1c2gvdG9rZW5zJylcbiAgICAgICAgICAgICAgICAuc2VuZCh0b2tlbkRhdGEpXG4gICAgICAgICAgICAgICAgLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIF90aGlzLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBfdGhpcy5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBfdGhpcy5fYmxvY2tTYXZlVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgX3RoaXMubG9nZ2VyLmluZm8oJ3NhdmVkIHB1c2ggdG9rZW46ICcgKyB0b2tlbik7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbkRhdGEudXNlcl9pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX3RoaXMubG9nZ2VyLmluZm8oJ2FkZGVkIHB1c2ggdG9rZW4gdG8gdXNlcjogJyArIHRva2VuRGF0YS51c2VyX2lkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnYSB0b2tlbiBzYXZlIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzLicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyB0aGUgZGV2aWNlIHdpdGggR0NNL0FQTlMgdG8gZ2V0IGEgZGV2aWNlIHRva2VuXG4gICAgICogRmlyZXMgb2ZmIHRoZSAnb25SZWdpc3RlcicgY2FsbGJhY2sgaWYgb25lIGhhcyBiZWVuIHByb3ZpZGVkIGluIHRoZSBpbml0KCkgY29uZmlnXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2sgRnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnJlZ2lzdGVyID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3JlZ2lzdGVyJyk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhbm90aGVyIHJlZ2lzdHJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzLicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgdmFyIElvbmljRGV2UHVzaCA9IG5ldyBwdXNoX2Rldl8xLlB1c2hEZXZTZXJ2aWNlKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgSW9uaWNEZXZQdXNoLmluaXQoc2VsZiwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5fdG9rZW5SZWFkeSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4gPSBzZWxmLl9nZXRQdXNoUGx1Z2luKCkuaW5pdChzZWxmLl9jb25maWcucGx1Z2luQ29uZmlnKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgcHVzaF90b2tlbl8xLlB1c2hUb2tlbihkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fdG9rZW5SZWFkeSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soc2VsZi5fdG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxmLl9yZWdpc3RlcmVkID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBJbnZhbGlkYXRlIHRoZSBjdXJyZW50IEdDTS9BUE5TIHRva2VuXG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUudW5yZWdpc3RlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgcGxhdGZvcm0gPSBudWxsO1xuICAgICAgICBpZiAoY29yZV8xLklvbmljUGxhdGZvcm0uZGV2aWNlLmlzQW5kcm9pZCgpKSB7XG4gICAgICAgICAgICBwbGF0Zm9ybSA9ICdhbmRyb2lkJztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5kZXZpY2UuaXNJT1MoKSkge1xuICAgICAgICAgICAgcGxhdGZvcm0gPSAnaW9zJztcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXBsYXRmb3JtKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ0NvdWxkIG5vdCBkZXRlY3QgdGhlIHBsYXRmb3JtLCBhcmUgeW91IG9uIGEgZGV2aWNlPycpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tVbnJlZ2lzdGVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcGx1Z2luKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLnVucmVnaXN0ZXIoZnVuY3Rpb24gKCkgeyB9LCBmdW5jdGlvbiAoKSB7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jbGllbnQucG9zdCgnL3B1c2gvdG9rZW5zL2ludmFsaWRhdGUnKVxuICAgICAgICAgICAgICAgIC5zZW5kKHtcbiAgICAgICAgICAgICAgICAncGxhdGZvcm0nOiBwbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICAndG9rZW4nOiBzZWxmLmdldFN0b3JhZ2VUb2tlbigpLnRva2VuXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1VucmVnaXN0ZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1VucmVnaXN0ZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5yZWdpc3RlcmVkIHB1c2ggdG9rZW46ICcgKyBzZWxmLmdldFN0b3JhZ2VUb2tlbigpLnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5jbGVhclN0b3JhZ2VUb2tlbigpO1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhbiB1bnJlZ2lzdGVyIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzLicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIENvbnZlbmllbmNlIG1ldGhvZCB0byBncmFiIHRoZSBwYXlsb2FkIG9iamVjdCBmcm9tIGEgbm90aWZpY2F0aW9uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1B1c2hOb3RpZmljYXRpb259IG5vdGlmaWNhdGlvbiBQdXNoIE5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiBAcmV0dXJuIHtvYmplY3R9IFBheWxvYWQgb2JqZWN0IG9yIGFuIGVtcHR5IG9iamVjdFxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLmdldFBheWxvYWQgPSBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHJldHVybiBub3RpZmljYXRpb24ucGF5bG9hZDtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFNldCB0aGUgcmVnaXN0cmF0aW9uIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBSZWdpc3RyYXRpb24gY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnNldFJlZ2lzdGVyQ2FsbGJhY2sgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0UmVnaXN0ZXJDYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJlZ2lzdGVyQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIG5vdGlmaWNhdGlvbiBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgTm90aWZpY2F0aW9uIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gdHJ1ZSBpZiBzZXQgY29ycmVjdGx5LCBvdGhlcndpc2UgZmFsc2VcbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5zZXROb3RpZmljYXRpb25DYWxsYmFjayA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXROb3RpZmljYXRpb25DYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbkNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBlcnJvciBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgRXJyb3IgY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnNldEVycm9yQ2FsbGJhY2sgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0RXJyb3JDYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVycm9yQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fZGVidWdSZWdpc3RyYXRpb25DYWxsYmFjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhkYXRhKSB7XG4gICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCcoZGVidWcpIGRldmljZSB0b2tlbiByZWdpc3RlcmVkOiAnICsgc2VsZi5fdG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLl9kZWJ1Z05vdGlmaWNhdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5fcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBwdXNoX21lc3NhZ2VfMS5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnKGRlYnVnKSBub3RpZmljYXRpb24gcmVjZWl2ZWQ6ICcgKyBtZXNzYWdlKTtcbiAgICAgICAgICAgIGlmICghc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjayAmJiBzZWxmLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQobWVzc2FnZS50ZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fZGVidWdFcnJvckNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGVycikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJyhkZWJ1ZykgdW5leHBlY3RlZCBlcnJvciBvY2N1cmVkLicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fcmVnaXN0ZXJDYWxsYmFjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhkYXRhKSB7XG4gICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAoc2VsZi5yZWdpc3RlckNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYucmVnaXN0ZXJDYWxsYmFjayhzZWxmLl90b2tlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuX25vdGlmaWNhdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5fcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBwdXNoX21lc3NhZ2VfMS5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgaWYgKHNlbGYubm90aWZpY2F0aW9uQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjayhtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fZXJyb3JDYWxsYmFjayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhlcnIpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmVycm9yQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5lcnJvckNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIHRoZSBkZWZhdWx0IGRlYnVnIGNhbGxiYWNrcyB3aXRoIHRoZSBQdXNoUGx1Z2luIHdoZW4gZGVidWcgaXMgZW5hYmxlZFxuICAgICAqIEludGVybmFsIE1ldGhvZFxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5kZWJ1Zykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdyZWdpc3RyYXRpb24nLCB0aGlzLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignbm90aWZpY2F0aW9uJywgdGhpcy5fZGVidWdOb3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ2Vycm9yJywgdGhpcy5fZGVidWdFcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9yZWdpc3RlcmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmVtaXR0ZXIub24oJ3B1c2g6dG9rZW4nLCB0aGlzLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5lbWl0dGVyLm9uKCdwdXNoOm5vdGlmaWNhdGlvbicsIHRoaXMuX2RlYnVnTm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmVtaXR0ZXIub24oJ3B1c2g6ZXJyb3InLCB0aGlzLl9kZWJ1Z0Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIHVzZXIgc3VwcGxpZWQgY2FsbGJhY2tzIHdpdGggdGhlIFB1c2hQbHVnaW5cbiAgICAgKiBJbnRlcm5hbCBNZXRob2RcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLl9jYWxsYmFja1JlZ2lzdHJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIHRoaXMuX3JlZ2lzdGVyQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ25vdGlmaWNhdGlvbicsIHRoaXMuX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdlcnJvcicsIHRoaXMuX2Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3JlZ2lzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5lbWl0dGVyLm9uKCdwdXNoOnRva2VuJywgdGhpcy5fcmVnaXN0ZXJDYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5lbWl0dGVyLm9uKCdwdXNoOm5vdGlmaWNhdGlvbicsIHRoaXMuX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmVtaXR0ZXIub24oJ3B1c2g6ZXJyb3InLCB0aGlzLl9lcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBtaXNjIGZlYXR1cmVzIGJhc2VkIG9uIHRoZSBjb250ZW50cyBvZiBhIHB1c2ggbm90aWZpY2F0aW9uXG4gICAgICogSW50ZXJuYWwgTWV0aG9kXG4gICAgICpcbiAgICAgKiBDdXJyZW50bHkganVzdCBkb2VzIHRoZSBwYXlsb2FkICRzdGF0ZSByZWRpcmVjdGlvblxuICAgICAqIEBwYXJhbSB7UHVzaE5vdGlmaWNhdGlvbn0gbm90aWZpY2F0aW9uIFB1c2ggTm90aWZpY2F0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuX3Byb2Nlc3NOb3RpZmljYXRpb24gPSBmdW5jdGlvbiAobm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHRoaXMuX25vdGlmaWNhdGlvbiA9IG5vdGlmaWNhdGlvbjtcbiAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uZW1pdHRlci5lbWl0KCdwdXNoOnByb2Nlc3NOb3RpZmljYXRpb24nLCBub3RpZmljYXRpb24pO1xuICAgIH07XG4gICAgLyogRGVwcmVjYXRlZCBpbiBmYXZvciBvZiBgZ2V0UHVzaFBsdWdpbmAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5fZ2V0UHVzaFBsdWdpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgUHVzaFBsdWdpbiA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBQdXNoUGx1Z2luID0gd2luZG93LlB1c2hOb3RpZmljYXRpb247XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NvbWV0aGluZyB3ZW50IHdyb25nIGxvb2tpbmcgZm9yIHRoZSBQdXNoTm90aWZpY2F0aW9uIHBsdWdpbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5hcHAuZGV2UHVzaCAmJiAhUHVzaFBsdWdpbiAmJiAoY29yZV8xLklvbmljUGxhdGZvcm0uZGV2aWNlLmlzSU9TKCkgfHwgY29yZV8xLklvbmljUGxhdGZvcm0uZGV2aWNlLmlzQW5kcm9pZCgpKSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1B1c2hOb3RpZmljYXRpb24gcGx1Z2luIGlzIHJlcXVpcmVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgcGhvbmVnYXAtcGx1Z2luLXB1c2hgID8nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUHVzaFBsdWdpbjtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBwaG9uZWdhcC1wdXNoLXBsdWdpbiBpbnRlcmZhY2VcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1B1c2hOb3RpZmljYXRpb259IFB1c2hOb3RpZmljYXRpb24gaW5zdGFuY2VcbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5nZXRQdXNoUGx1Z2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGx1Z2luO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRmlyZSBhIGNhbGxiYWNrIHdoZW4gUHVzaCBpcyByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgc2VydmljZSBoYXMgYWxyZWFkeSBpbml0aWFsaXplZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5vblJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2lzUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0uZW1pdHRlci5vbigncHVzaDpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gUHVzaDtcbn0oKSk7XG5leHBvcnRzLlB1c2ggPSBQdXNoO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi91dGlsJykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBkZWVwRXh0ZW5kKCkge1xuICAgIHZhciBvdXQgPSBbXTtcbiAgICBmb3IgKHZhciBfaSA9IDA7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xuICAgICAgICBvdXRbX2kgLSAwXSA9IGFyZ3VtZW50c1tfaV07XG4gICAgfVxuICAgIG91dCA9IG91dFswXSB8fCB7fTtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgb2JqID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBpZiAoIW9iaikge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0W2tleV0gPSBkZWVwRXh0ZW5kKG91dFtrZXldLCBvYmpba2V5XSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvdXRba2V5XSA9IG9ialtrZXldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufVxuZXhwb3J0cy5kZWVwRXh0ZW5kID0gZGVlcEV4dGVuZDtcbmZ1bmN0aW9uIGdlbmVyYXRlVVVJRCgpIHtcbiAgICByZXR1cm4gJ3h4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcucmVwbGFjZSgvW3h5XS9nLCBmdW5jdGlvbiAoYykge1xuICAgICAgICB2YXIgciA9IE1hdGgucmFuZG9tKCkgKiAxNiB8IDAsIHYgPSBjID09PSAneCcgPyByIDogKHIgJiAweDMgfCAweDgpO1xuICAgICAgICByZXR1cm4gdi50b1N0cmluZygxNik7XG4gICAgfSk7XG59XG5leHBvcnRzLmdlbmVyYXRlVVVJRCA9IGdlbmVyYXRlVVVJRDtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiLyohXG4gKiBAb3ZlcnZpZXcgZXM2LXByb21pc2UgLSBhIHRpbnkgaW1wbGVtZW50YXRpb24gb2YgUHJvbWlzZXMvQSsuXG4gKiBAY29weXJpZ2h0IENvcHlyaWdodCAoYykgMjAxNCBZZWh1ZGEgS2F0eiwgVG9tIERhbGUsIFN0ZWZhbiBQZW5uZXIgYW5kIGNvbnRyaWJ1dG9ycyAoQ29udmVyc2lvbiB0byBFUzYgQVBJIGJ5IEpha2UgQXJjaGliYWxkKVxuICogQGxpY2Vuc2UgICBMaWNlbnNlZCB1bmRlciBNSVQgbGljZW5zZVxuICogICAgICAgICAgICBTZWUgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2pha2VhcmNoaWJhbGQvZXM2LXByb21pc2UvbWFzdGVyL0xJQ0VOU0VcbiAqIEB2ZXJzaW9uICAgMy4yLjFcbiAqL1xuXG4oZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRvYmplY3RPckZ1bmN0aW9uKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyB8fCAodHlwZW9mIHggPT09ICdvYmplY3QnICYmIHggIT09IG51bGwpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbic7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc01heWJlVGhlbmFibGUoeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5O1xuICAgIGlmICghQXJyYXkuaXNBcnJheSkge1xuICAgICAgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheSA9IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0FycmF5ID0gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9IDA7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQ7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbjtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcCA9IGZ1bmN0aW9uIGFzYXAoY2FsbGJhY2ssIGFyZykge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2xpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW5dID0gY2FsbGJhY2s7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiArIDFdID0gYXJnO1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiArPSAyO1xuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPT09IDIpIHtcbiAgICAgICAgLy8gSWYgbGVuIGlzIDIsIHRoYXQgbWVhbnMgdGhhdCB3ZSBuZWVkIHRvIHNjaGVkdWxlIGFuIGFzeW5jIGZsdXNoLlxuICAgICAgICAvLyBJZiBhZGRpdGlvbmFsIGNhbGxiYWNrcyBhcmUgcXVldWVkIGJlZm9yZSB0aGUgcXVldWUgaXMgZmx1c2hlZCwgdGhleVxuICAgICAgICAvLyB3aWxsIGJlIHByb2Nlc3NlZCBieSB0aGlzIGZsdXNoIHRoYXQgd2UgYXJlIHNjaGVkdWxpbmcuXG4gICAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4obGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldFNjaGVkdWxlcihzY2hlZHVsZUZuKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4gPSBzY2hlZHVsZUZuO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRBc2FwKGFzYXBGbikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAgPSBhc2FwRm47XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93ID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHdpbmRvdyA6IHVuZGVmaW5lZDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyB8fCB7fTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbC5XZWJLaXRNdXRhdGlvbk9ic2VydmVyO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlID0gdHlwZW9mIHNlbGYgPT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiB7fS50b1N0cmluZy5jYWxsKHByb2Nlc3MpID09PSAnW29iamVjdCBwcm9jZXNzXSc7XG5cbiAgICAvLyB0ZXN0IGZvciB3ZWIgd29ya2VyIGJ1dCBub3QgaW4gSUUxMFxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNXb3JrZXIgPSB0eXBlb2YgVWludDhDbGFtcGVkQXJyYXkgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgaW1wb3J0U2NyaXB0cyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHR5cGVvZiBNZXNzYWdlQ2hhbm5lbCAhPT0gJ3VuZGVmaW5lZCc7XG5cbiAgICAvLyBub2RlXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU5leHRUaWNrKCkge1xuICAgICAgLy8gbm9kZSB2ZXJzaW9uIDAuMTAueCBkaXNwbGF5cyBhIGRlcHJlY2F0aW9uIHdhcm5pbmcgd2hlbiBuZXh0VGljayBpcyB1c2VkIHJlY3Vyc2l2ZWx5XG4gICAgICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2N1am9qcy93aGVuL2lzc3Vlcy80MTAgZm9yIGRldGFpbHNcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgcHJvY2Vzcy5uZXh0VGljayhsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyB2ZXJ0eFxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VWZXJ0eFRpbWVyKCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkdmVydHhOZXh0KGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCkge1xuICAgICAgdmFyIGl0ZXJhdGlvbnMgPSAwO1xuICAgICAgdmFyIG9ic2VydmVyID0gbmV3IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRCcm93c2VyTXV0YXRpb25PYnNlcnZlcihsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgdmFyIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gICAgICBvYnNlcnZlci5vYnNlcnZlKG5vZGUsIHsgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBub2RlLmRhdGEgPSAoaXRlcmF0aW9ucyA9ICsraXRlcmF0aW9ucyAlIDIpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyB3ZWIgd29ya2VyXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCkge1xuICAgICAgdmFyIGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcbiAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoO1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2hhbm5lbC5wb3J0Mi5wb3N0TWVzc2FnZSgwKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVNldFRpbWVvdXQoKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHNldFRpbWVvdXQobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoLCAxKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZSA9IG5ldyBBcnJheSgxMDAwKTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2goKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW47IGkrPTIpIHtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2ldO1xuICAgICAgICB2YXIgYXJnID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2krMV07XG5cbiAgICAgICAgY2FsbGJhY2soYXJnKTtcblxuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaV0gPSB1bmRlZmluZWQ7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpKzFdID0gdW5kZWZpbmVkO1xuICAgICAgfVxuXG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuID0gMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXR0ZW1wdFZlcnR4KCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIHIgPSByZXF1aXJlO1xuICAgICAgICB2YXIgdmVydHggPSByKCd2ZXJ0eCcpO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkdmVydHhOZXh0ID0gdmVydHgucnVuT25Mb29wIHx8IHZlcnR4LnJ1bk9uQ29udGV4dDtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VWZXJ0eFRpbWVyKCk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoO1xuICAgIC8vIERlY2lkZSB3aGF0IGFzeW5jIG1ldGhvZCB0byB1c2UgdG8gdHJpZ2dlcmluZyBwcm9jZXNzaW5nIG9mIHF1ZXVlZCBjYWxsYmFja3M6XG4gICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc05vZGUpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU5leHRUaWNrKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU11dGF0aW9uT2JzZXJ2ZXIoKTtcbiAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc1dvcmtlcikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTWVzc2FnZUNoYW5uZWwoKTtcbiAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93ID09PSB1bmRlZmluZWQgJiYgdHlwZW9mIHJlcXVpcmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGF0dGVtcHRWZXJ0eCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR0aGVuJCR0aGVuKG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gICAgICB2YXIgcGFyZW50ID0gdGhpcztcblxuICAgICAgdmFyIGNoaWxkID0gbmV3IHRoaXMuY29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG5cbiAgICAgIGlmIChjaGlsZFtsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG1ha2VQcm9taXNlKGNoaWxkKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHN0YXRlID0gcGFyZW50Ll9zdGF0ZTtcblxuICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3VtZW50c1tzdGF0ZSAtIDFdO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChmdW5jdGlvbigpe1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHN0YXRlLCBjaGlsZCwgY2FsbGJhY2ssIHBhcmVudC5fcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY2hpbGQ7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSR0aGVuJCR0aGVuO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJHJlc29sdmUob2JqZWN0KSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICAgICAgaWYgKG9iamVjdCAmJiB0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJiBvYmplY3QuY29uc3RydWN0b3IgPT09IENvbnN0cnVjdG9yKSB7XG4gICAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCBvYmplY3QpO1xuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkcmVzb2x2ZTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygxNik7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKCkge31cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICAgPSB2b2lkIDA7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCA9IDE7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEICA9IDI7XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IgPSBuZXcgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKTtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHNlbGZGdWxmaWxsbWVudCgpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKFwiWW91IGNhbm5vdCByZXNvbHZlIGEgcHJvbWlzZSB3aXRoIGl0c2VsZlwiKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRjYW5ub3RSZXR1cm5Pd24oKSB7XG4gICAgICByZXR1cm4gbmV3IFR5cGVFcnJvcignQSBwcm9taXNlcyBjYWxsYmFjayBjYW5ub3QgcmV0dXJuIHRoYXQgc2FtZSBwcm9taXNlLicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGdldFRoZW4ocHJvbWlzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbjtcbiAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhlbi5jYWxsKHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSwgdGhlbikge1xuICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGZ1bmN0aW9uKHByb21pc2UpIHtcbiAgICAgICAgdmFyIHNlYWxlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZXJyb3IgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlUaGVuKHRoZW4sIHRoZW5hYmxlLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGlmIChzZWFsZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICBpZiAodGhlbmFibGUgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICBpZiAoc2VhbGVkKSB7IHJldHVybjsgfVxuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG5cbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSwgJ1NldHRsZTogJyArIChwcm9taXNlLl9sYWJlbCB8fCAnIHVua25vd24gcHJvbWlzZScpKTtcblxuICAgICAgICBpZiAoIXNlYWxlZCAmJiBlcnJvcikge1xuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUpIHtcbiAgICAgIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZSh0aGVuYWJsZSwgdW5kZWZpbmVkLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuKSB7XG4gICAgICBpZiAobWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3RvciA9PT0gcHJvbWlzZS5jb25zdHJ1Y3RvciAmJlxuICAgICAgICAgIHRoZW4gPT09IGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0ICYmXG4gICAgICAgICAgY29uc3RydWN0b3IucmVzb2x2ZSA9PT0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICh0aGVuID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvcik7XG4gICAgICAgIH0gZWxzZSBpZiAodGhlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24odGhlbikpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkpO1xuICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJG9iamVjdE9yRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGdldFRoZW4odmFsdWUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2hSZWplY3Rpb24ocHJvbWlzZSkge1xuICAgICAgaWYgKHByb21pc2UuX29uZXJyb3IpIHtcbiAgICAgICAgcHJvbWlzZS5fb25lcnJvcihwcm9taXNlLl9yZXN1bHQpO1xuICAgICAgfVxuXG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoKHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykgeyByZXR1cm47IH1cblxuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gdmFsdWU7XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRDtcblxuICAgICAgaWYgKHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoLCBwcm9taXNlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHsgcmV0dXJuOyB9XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEO1xuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gcmVhc29uO1xuXG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoUmVqZWN0aW9uLCBwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgICAgIHZhciBzdWJzY3JpYmVycyA9IHBhcmVudC5fc3Vic2NyaWJlcnM7XG4gICAgICB2YXIgbGVuZ3RoID0gc3Vic2NyaWJlcnMubGVuZ3RoO1xuXG4gICAgICBwYXJlbnQuX29uZXJyb3IgPSBudWxsO1xuXG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGhdID0gY2hpbGQ7XG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGggKyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRURdID0gb25GdWxmaWxsbWVudDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEXSAgPSBvblJlamVjdGlvbjtcblxuICAgICAgaWYgKGxlbmd0aCA9PT0gMCAmJiBwYXJlbnQuX3N0YXRlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gsIHBhcmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaChwcm9taXNlKSB7XG4gICAgICB2YXIgc3Vic2NyaWJlcnMgPSBwcm9taXNlLl9zdWJzY3JpYmVycztcbiAgICAgIHZhciBzZXR0bGVkID0gcHJvbWlzZS5fc3RhdGU7XG5cbiAgICAgIGlmIChzdWJzY3JpYmVycy5sZW5ndGggPT09IDApIHsgcmV0dXJuOyB9XG5cbiAgICAgIHZhciBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCA9IHByb21pc2UuX3Jlc3VsdDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJzY3JpYmVycy5sZW5ndGg7IGkgKz0gMykge1xuICAgICAgICBjaGlsZCA9IHN1YnNjcmliZXJzW2ldO1xuICAgICAgICBjYWxsYmFjayA9IHN1YnNjcmliZXJzW2kgKyBzZXR0bGVkXTtcblxuICAgICAgICBpZiAoY2hpbGQpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2FsbGJhY2soZGV0YWlsKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCkge1xuICAgICAgdGhpcy5lcnJvciA9IG51bGw7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUiA9IG5ldyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SLmVycm9yID0gZTtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBwcm9taXNlLCBjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB2YXIgaGFzQ2FsbGJhY2sgPSBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oY2FsbGJhY2spLFxuICAgICAgICAgIHZhbHVlLCBlcnJvciwgc3VjY2VlZGVkLCBmYWlsZWQ7XG5cbiAgICAgIGlmIChoYXNDYWxsYmFjaykge1xuICAgICAgICB2YWx1ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpO1xuXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SKSB7XG4gICAgICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgICAgICBlcnJvciA9IHZhbHVlLmVycm9yO1xuICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWUgPSBkZXRhaWw7XG4gICAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKGhhc0NhbGxiYWNrICYmIHN1Y2NlZWRlZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoZmFpbGVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbml0aWFsaXplUHJvbWlzZShwcm9taXNlLCByZXNvbHZlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzb2x2ZXIoZnVuY3Rpb24gcmVzb2x2ZVByb21pc2UodmFsdWUpe1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiByZWplY3RQcm9taXNlKHJlYXNvbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGlkID0gMDtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRuZXh0SWQoKSB7XG4gICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaWQrKztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRtYWtlUHJvbWlzZShwcm9taXNlKSB7XG4gICAgICBwcm9taXNlW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaWQrKztcbiAgICAgIHByb21pc2UuX3N0YXRlID0gdW5kZWZpbmVkO1xuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gdW5kZWZpbmVkO1xuICAgICAgcHJvbWlzZS5fc3Vic2NyaWJlcnMgPSBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGFsbChlbnRyaWVzKSB7XG4gICAgICByZXR1cm4gbmV3IGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0KHRoaXMsIGVudHJpZXMpLnByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGFsbDtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRyYWNlKGVudHJpZXMpIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gICAgICBpZiAoIWxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheShlbnRyaWVzKSkge1xuICAgICAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgIHJlamVjdChuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGFuIGFycmF5IHRvIHJhY2UuJykpO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgdmFyIGxlbmd0aCA9IGVudHJpZXMubGVuZ3RoO1xuICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIENvbnN0cnVjdG9yLnJlc29sdmUoZW50cmllc1tpXSkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkcmFjZTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJHJlamVjdChyZWFzb24pIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRyZWplY3Q7XG5cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc1Jlc29sdmVyKCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhIHJlc29sdmVyIGZ1bmN0aW9uIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgcHJvbWlzZSBjb25zdHJ1Y3RvcicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdQcm9taXNlJzogUGxlYXNlIHVzZSB0aGUgJ25ldycgb3BlcmF0b3IsIHRoaXMgb2JqZWN0IGNvbnN0cnVjdG9yIGNhbm5vdCBiZSBjYWxsZWQgYXMgYSBmdW5jdGlvbi5cIik7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2U7XG4gICAgLyoqXG4gICAgICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gICAgICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICAgICAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGUgcmVhc29uXG4gICAgICB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICAgICAgVGVybWlub2xvZ3lcbiAgICAgIC0tLS0tLS0tLS0tXG5cbiAgICAgIC0gYHByb21pc2VgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB3aXRoIGEgYHRoZW5gIG1ldGhvZCB3aG9zZSBiZWhhdmlvciBjb25mb3JtcyB0byB0aGlzIHNwZWNpZmljYXRpb24uXG4gICAgICAtIGB0aGVuYWJsZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHRoYXQgZGVmaW5lcyBhIGB0aGVuYCBtZXRob2QuXG4gICAgICAtIGB2YWx1ZWAgaXMgYW55IGxlZ2FsIEphdmFTY3JpcHQgdmFsdWUgKGluY2x1ZGluZyB1bmRlZmluZWQsIGEgdGhlbmFibGUsIG9yIGEgcHJvbWlzZSkuXG4gICAgICAtIGBleGNlcHRpb25gIGlzIGEgdmFsdWUgdGhhdCBpcyB0aHJvd24gdXNpbmcgdGhlIHRocm93IHN0YXRlbWVudC5cbiAgICAgIC0gYHJlYXNvbmAgaXMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aHkgYSBwcm9taXNlIHdhcyByZWplY3RlZC5cbiAgICAgIC0gYHNldHRsZWRgIHRoZSBmaW5hbCByZXN0aW5nIHN0YXRlIG9mIGEgcHJvbWlzZSwgZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuXG4gICAgICBBIHByb21pc2UgY2FuIGJlIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXM6IHBlbmRpbmcsIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQuXG5cbiAgICAgIFByb21pc2VzIHRoYXQgYXJlIGZ1bGZpbGxlZCBoYXZlIGEgZnVsZmlsbG1lbnQgdmFsdWUgYW5kIGFyZSBpbiB0aGUgZnVsZmlsbGVkXG4gICAgICBzdGF0ZS4gIFByb21pc2VzIHRoYXQgYXJlIHJlamVjdGVkIGhhdmUgYSByZWplY3Rpb24gcmVhc29uIGFuZCBhcmUgaW4gdGhlXG4gICAgICByZWplY3RlZCBzdGF0ZS4gIEEgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmV2ZXIgYSB0aGVuYWJsZS5cblxuICAgICAgUHJvbWlzZXMgY2FuIGFsc28gYmUgc2FpZCB0byAqcmVzb2x2ZSogYSB2YWx1ZS4gIElmIHRoaXMgdmFsdWUgaXMgYWxzbyBhXG4gICAgICBwcm9taXNlLCB0aGVuIHRoZSBvcmlnaW5hbCBwcm9taXNlJ3Mgc2V0dGxlZCBzdGF0ZSB3aWxsIG1hdGNoIHRoZSB2YWx1ZSdzXG4gICAgICBzZXR0bGVkIHN0YXRlLiAgU28gYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpbGxcbiAgICAgIGl0c2VsZiByZWplY3QsIGFuZCBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIHdpbGxcbiAgICAgIGl0c2VsZiBmdWxmaWxsLlxuXG5cbiAgICAgIEJhc2ljIFVzYWdlOlxuICAgICAgLS0tLS0tLS0tLS0tXG5cbiAgICAgIGBgYGpzXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAvLyBvbiBzdWNjZXNzXG4gICAgICAgIHJlc29sdmUodmFsdWUpO1xuXG4gICAgICAgIC8vIG9uIGZhaWx1cmVcbiAgICAgICAgcmVqZWN0KHJlYXNvbik7XG4gICAgICB9KTtcblxuICAgICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBZHZhbmNlZCBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICBQcm9taXNlcyBzaGluZSB3aGVuIGFic3RyYWN0aW5nIGF3YXkgYXN5bmNocm9ub3VzIGludGVyYWN0aW9ucyBzdWNoIGFzXG4gICAgICBgWE1MSHR0cFJlcXVlc3Rgcy5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGdldEpTT04odXJsKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICAgICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBoYW5kbGVyO1xuICAgICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICAgICAgeGhyLnNlbmQoKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSB0aGlzLkRPTkUpIHtcbiAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHRoaXMucmVzcG9uc2UpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2dldEpTT046IGAnICsgdXJsICsgJ2AgZmFpbGVkIHdpdGggc3RhdHVzOiBbJyArIHRoaXMuc3RhdHVzICsgJ10nKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZ2V0SlNPTignL3Bvc3RzLmpzb24nKS50aGVuKGZ1bmN0aW9uKGpzb24pIHtcbiAgICAgICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAvLyBvbiByZWplY3Rpb25cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFVubGlrZSBjYWxsYmFja3MsIHByb21pc2VzIGFyZSBncmVhdCBjb21wb3NhYmxlIHByaW1pdGl2ZXMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBQcm9taXNlLmFsbChbXG4gICAgICAgIGdldEpTT04oJy9wb3N0cycpLFxuICAgICAgICBnZXRKU09OKCcvY29tbWVudHMnKVxuICAgICAgXSkudGhlbihmdW5jdGlvbih2YWx1ZXMpe1xuICAgICAgICB2YWx1ZXNbMF0gLy8gPT4gcG9zdHNKU09OXG4gICAgICAgIHZhbHVlc1sxXSAvLyA9PiBjb21tZW50c0pTT05cblxuICAgICAgICByZXR1cm4gdmFsdWVzO1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQGNsYXNzIFByb21pc2VcbiAgICAgIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVyXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAY29uc3RydWN0b3JcbiAgICAqL1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKHJlc29sdmVyKSB7XG4gICAgICB0aGlzW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbmV4dElkKCk7XG4gICAgICB0aGlzLl9yZXN1bHQgPSB0aGlzLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX3N1YnNjcmliZXJzID0gW107XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wICE9PSByZXNvbHZlcikge1xuICAgICAgICB0eXBlb2YgcmVzb2x2ZXIgIT09ICdmdW5jdGlvbicgJiYgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzUmVzb2x2ZXIoKTtcbiAgICAgICAgdGhpcyBpbnN0YW5jZW9mIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlID8gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UodGhpcywgcmVzb2x2ZXIpIDogbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzTmV3KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuYWxsID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJhY2UgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJlc29sdmUgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJlamVjdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fc2V0U2NoZWR1bGVyID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldFNjaGVkdWxlcjtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fc2V0QXNhcCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRBc2FwO1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLl9hc2FwID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXA7XG5cbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5wcm90b3R5cGUgPSB7XG4gICAgICBjb25zdHJ1Y3RvcjogbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UsXG5cbiAgICAvKipcbiAgICAgIFRoZSBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLFxuICAgICAgd2hpY2ggcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGVcbiAgICAgIHJlYXNvbiB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbih1c2VyKXtcbiAgICAgICAgLy8gdXNlciBpcyBhdmFpbGFibGVcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHVzZXIgaXMgdW5hdmFpbGFibGUsIGFuZCB5b3UgYXJlIGdpdmVuIHRoZSByZWFzb24gd2h5XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBDaGFpbmluZ1xuICAgICAgLS0tLS0tLS1cblxuICAgICAgVGhlIHJldHVybiB2YWx1ZSBvZiBgdGhlbmAgaXMgaXRzZWxmIGEgcHJvbWlzZS4gIFRoaXMgc2Vjb25kLCAnZG93bnN0cmVhbSdcbiAgICAgIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmaXJzdCBwcm9taXNlJ3MgZnVsZmlsbG1lbnRcbiAgICAgIG9yIHJlamVjdGlvbiBoYW5kbGVyLCBvciByZWplY3RlZCBpZiB0aGUgaGFuZGxlciB0aHJvd3MgYW4gZXhjZXB0aW9uLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiB1c2VyLm5hbWU7XG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIHJldHVybiAnZGVmYXVsdCBuYW1lJztcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHVzZXJOYW1lKSB7XG4gICAgICAgIC8vIElmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgdXNlck5hbWVgIHdpbGwgYmUgdGhlIHVzZXIncyBuYW1lLCBvdGhlcndpc2UgaXRcbiAgICAgICAgLy8gd2lsbCBiZSBgJ2RlZmF1bHQgbmFtZSdgXG4gICAgICB9KTtcblxuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknKTtcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jyk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIGlmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgcmVhc29uYCB3aWxsIGJlICdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScuXG4gICAgICAgIC8vIElmIGBmaW5kVXNlcmAgcmVqZWN0ZWQsIGByZWFzb25gIHdpbGwgYmUgJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknLlxuICAgICAgfSk7XG4gICAgICBgYGBcbiAgICAgIElmIHRoZSBkb3duc3RyZWFtIHByb21pc2UgZG9lcyBub3Qgc3BlY2lmeSBhIHJlamVjdGlvbiBoYW5kbGVyLCByZWplY3Rpb24gcmVhc29ucyB3aWxsIGJlIHByb3BhZ2F0ZWQgZnVydGhlciBkb3duc3RyZWFtLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQZWRhZ29naWNhbEV4Y2VwdGlvbignVXBzdHJlYW0gZXJyb3InKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gVGhlIGBQZWRnYWdvY2lhbEV4Y2VwdGlvbmAgaXMgcHJvcGFnYXRlZCBhbGwgdGhlIHdheSBkb3duIHRvIGhlcmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFzc2ltaWxhdGlvblxuICAgICAgLS0tLS0tLS0tLS0tXG5cbiAgICAgIFNvbWV0aW1lcyB0aGUgdmFsdWUgeW91IHdhbnQgdG8gcHJvcGFnYXRlIHRvIGEgZG93bnN0cmVhbSBwcm9taXNlIGNhbiBvbmx5IGJlXG4gICAgICByZXRyaWV2ZWQgYXN5bmNocm9ub3VzbHkuIFRoaXMgY2FuIGJlIGFjaGlldmVkIGJ5IHJldHVybmluZyBhIHByb21pc2UgaW4gdGhlXG4gICAgICBmdWxmaWxsbWVudCBvciByZWplY3Rpb24gaGFuZGxlci4gVGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIHRoZW4gYmUgcGVuZGluZ1xuICAgICAgdW50aWwgdGhlIHJldHVybmVkIHByb21pc2UgaXMgc2V0dGxlZC4gVGhpcyBpcyBjYWxsZWQgKmFzc2ltaWxhdGlvbiouXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgICAgLy8gVGhlIHVzZXIncyBjb21tZW50cyBhcmUgbm93IGF2YWlsYWJsZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgSWYgdGhlIGFzc2ltbGlhdGVkIHByb21pc2UgcmVqZWN0cywgdGhlbiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgYWxzbyByZWplY3QuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCBmdWxmaWxscywgd2UnbGwgaGF2ZSB0aGUgdmFsdWUgaGVyZVxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIHJlamVjdHMsIHdlJ2xsIGhhdmUgdGhlIHJlYXNvbiBoZXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBTaW1wbGUgRXhhbXBsZVxuICAgICAgLS0tLS0tLS0tLS0tLS1cblxuICAgICAgU3luY2hyb25vdXMgRXhhbXBsZVxuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICB2YXIgcmVzdWx0O1xuXG4gICAgICB0cnkge1xuICAgICAgICByZXN1bHQgPSBmaW5kUmVzdWx0KCk7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH1cbiAgICAgIGBgYFxuXG4gICAgICBFcnJiYWNrIEV4YW1wbGVcblxuICAgICAgYGBganNcbiAgICAgIGZpbmRSZXN1bHQoZnVuY3Rpb24ocmVzdWx0LCBlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgUHJvbWlzZSBFeGFtcGxlO1xuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICBmaW5kUmVzdWx0KCkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBZHZhbmNlZCBFeGFtcGxlXG4gICAgICAtLS0tLS0tLS0tLS0tLVxuXG4gICAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIHZhciBhdXRob3IsIGJvb2tzO1xuXG4gICAgICB0cnkge1xuICAgICAgICBhdXRob3IgPSBmaW5kQXV0aG9yKCk7XG4gICAgICAgIGJvb2tzICA9IGZpbmRCb29rc0J5QXV0aG9yKGF1dGhvcik7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH1cbiAgICAgIGBgYFxuXG4gICAgICBFcnJiYWNrIEV4YW1wbGVcblxuICAgICAgYGBganNcblxuICAgICAgZnVuY3Rpb24gZm91bmRCb29rcyhib29rcykge1xuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGZhaWx1cmUocmVhc29uKSB7XG5cbiAgICAgIH1cblxuICAgICAgZmluZEF1dGhvcihmdW5jdGlvbihhdXRob3IsIGVycil7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmaW5kQm9vb2tzQnlBdXRob3IoYXV0aG9yLCBmdW5jdGlvbihib29rcywgZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgIGZvdW5kQm9va3MoYm9va3MpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgICBmYWlsdXJlKHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgUHJvbWlzZSBFeGFtcGxlO1xuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICBmaW5kQXV0aG9yKCkuXG4gICAgICAgIHRoZW4oZmluZEJvb2tzQnlBdXRob3IpLlxuICAgICAgICB0aGVuKGZ1bmN0aW9uKGJvb2tzKXtcbiAgICAgICAgICAvLyBmb3VuZCBib29rc1xuICAgICAgfSkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBtZXRob2QgdGhlblxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25GdWxmaWxsZWRcbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0ZWRcbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICAgKi9cbiAgICAgIHRoZW46IGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0LFxuXG4gICAgLyoqXG4gICAgICBgY2F0Y2hgIGlzIHNpbXBseSBzdWdhciBmb3IgYHRoZW4odW5kZWZpbmVkLCBvblJlamVjdGlvbilgIHdoaWNoIG1ha2VzIGl0IHRoZSBzYW1lXG4gICAgICBhcyB0aGUgY2F0Y2ggYmxvY2sgb2YgYSB0cnkvY2F0Y2ggc3RhdGVtZW50LlxuXG4gICAgICBgYGBqc1xuICAgICAgZnVuY3Rpb24gZmluZEF1dGhvcigpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkbid0IGZpbmQgdGhhdCBhdXRob3InKTtcbiAgICAgIH1cblxuICAgICAgLy8gc3luY2hyb25vdXNcbiAgICAgIHRyeSB7XG4gICAgICAgIGZpbmRBdXRob3IoKTtcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9XG5cbiAgICAgIC8vIGFzeW5jIHdpdGggcHJvbWlzZXNcbiAgICAgIGZpbmRBdXRob3IoKS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCBjYXRjaFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3Rpb25cbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICAgKi9cbiAgICAgICdjYXRjaCc6IGZ1bmN0aW9uKG9uUmVqZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuICAgIH07XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3I7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IoQ29uc3RydWN0b3IsIGlucHV0KSB7XG4gICAgICB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yID0gQ29uc3RydWN0b3I7XG4gICAgICB0aGlzLnByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG5cbiAgICAgIGlmICghdGhpcy5wcm9taXNlW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG1ha2VQcm9taXNlKHRoaXMucHJvbWlzZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoaW5wdXQpKSB7XG4gICAgICAgIHRoaXMuX2lucHV0ICAgICA9IGlucHV0O1xuICAgICAgICB0aGlzLmxlbmd0aCAgICAgPSBpbnB1dC5sZW5ndGg7XG4gICAgICAgIHRoaXMuX3JlbWFpbmluZyA9IGlucHV0Lmxlbmd0aDtcblxuICAgICAgICB0aGlzLl9yZXN1bHQgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuXG4gICAgICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5sZW5ndGggfHwgMDtcbiAgICAgICAgICB0aGlzLl9lbnVtZXJhdGUoKTtcbiAgICAgICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdCh0aGlzLnByb21pc2UsIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCR2YWxpZGF0aW9uRXJyb3IoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJHZhbGlkYXRpb25FcnJvcigpIHtcbiAgICAgIHJldHVybiBuZXcgRXJyb3IoJ0FycmF5IE1ldGhvZHMgbXVzdCBiZSBwcm92aWRlZCBhbiBBcnJheScpO1xuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZW51bWVyYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGVuZ3RoICA9IHRoaXMubGVuZ3RoO1xuICAgICAgdmFyIGlucHV0ICAgPSB0aGlzLl9pbnB1dDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRoaXMuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLl9lYWNoRW50cnkoaW5wdXRbaV0sIGkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VhY2hFbnRyeSA9IGZ1bmN0aW9uKGVudHJ5LCBpKSB7XG4gICAgICB2YXIgYyA9IHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3I7XG4gICAgICB2YXIgcmVzb2x2ZSA9IGMucmVzb2x2ZTtcblxuICAgICAgaWYgKHJlc29sdmUgPT09IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQpIHtcbiAgICAgICAgdmFyIHRoZW4gPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKGVudHJ5KTtcblxuICAgICAgICBpZiAodGhlbiA9PT0gbGliJGVzNiRwcm9taXNlJHRoZW4kJGRlZmF1bHQgJiZcbiAgICAgICAgICAgIGVudHJ5Ll9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAgIHRoaXMuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGVuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG4gICAgICAgICAgdGhpcy5fcmVzdWx0W2ldID0gZW50cnk7XG4gICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQpIHtcbiAgICAgICAgICB2YXIgcHJvbWlzZSA9IG5ldyBjKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgZW50cnksIHRoZW4pO1xuICAgICAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChwcm9taXNlLCBpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl93aWxsU2V0dGxlQXQobmV3IGMoZnVuY3Rpb24ocmVzb2x2ZSkgeyByZXNvbHZlKGVudHJ5KTsgfSksIGkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl93aWxsU2V0dGxlQXQocmVzb2x2ZShlbnRyeSksIGkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3NldHRsZWRBdCA9IGZ1bmN0aW9uKHN0YXRlLCBpLCB2YWx1ZSkge1xuICAgICAgdmFyIHByb21pc2UgPSB0aGlzLnByb21pc2U7XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICB0aGlzLl9yZW1haW5pbmctLTtcblxuICAgICAgICBpZiAoc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl9yZXN1bHRbaV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl93aWxsU2V0dGxlQXQgPSBmdW5jdGlvbihwcm9taXNlLCBpKSB7XG4gICAgICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQsIGksIHZhbHVlKTtcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQsIGksIHJlYXNvbik7XG4gICAgICB9KTtcbiAgICB9O1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkcG9seWZpbGwoKSB7XG4gICAgICB2YXIgbG9jYWw7XG5cbiAgICAgIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsID0gZ2xvYmFsO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBsb2NhbCA9IHNlbGY7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGxvY2FsID0gRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncG9seWZpbGwgZmFpbGVkIGJlY2F1c2UgZ2xvYmFsIG9iamVjdCBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG4gICAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgUCA9IGxvY2FsLlByb21pc2U7XG5cbiAgICAgIGlmIChQICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChQLnJlc29sdmUoKSkgPT09ICdbb2JqZWN0IFByb21pc2VdJyAmJiAhUC5jYXN0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbG9jYWwuUHJvbWlzZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0O1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRwb2x5ZmlsbDtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlID0ge1xuICAgICAgJ1Byb21pc2UnOiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCxcbiAgICAgICdwb2x5ZmlsbCc6IGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdFxuICAgIH07XG5cbiAgICAvKiBnbG9iYWwgZGVmaW5lOnRydWUgbW9kdWxlOnRydWUgd2luZG93OiB0cnVlICovXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lWydhbWQnXSkge1xuICAgICAgZGVmaW5lKGZ1bmN0aW9uKCkgeyByZXR1cm4gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGVbJ2V4cG9ydHMnXSkge1xuICAgICAgbW9kdWxlWydleHBvcnRzJ10gPSBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aGlzWydFUzZQcm9taXNlJ10gPSBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdCgpO1xufSkuY2FsbCh0aGlzKTtcblxuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnZW1pdHRlcicpO1xudmFyIHJlZHVjZSA9IHJlcXVpcmUoJ3JlZHVjZScpO1xudmFyIHJlcXVlc3RCYXNlID0gcmVxdWlyZSgnLi9yZXF1ZXN0LWJhc2UnKTtcbnZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXMtb2JqZWN0Jyk7XG5cbi8qKlxuICogUm9vdCByZWZlcmVuY2UgZm9yIGlmcmFtZXMuXG4gKi9cblxudmFyIHJvb3Q7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHsgLy8gQnJvd3NlciB3aW5kb3dcbiAgcm9vdCA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7IC8vIFdlYiBXb3JrZXJcbiAgcm9vdCA9IHNlbGY7XG59IGVsc2UgeyAvLyBPdGhlciBlbnZpcm9ubWVudHNcbiAgcm9vdCA9IHRoaXM7XG59XG5cbi8qKlxuICogTm9vcC5cbiAqL1xuXG5mdW5jdGlvbiBub29wKCl7fTtcblxuLyoqXG4gKiBDaGVjayBpZiBgb2JqYCBpcyBhIGhvc3Qgb2JqZWN0LFxuICogd2UgZG9uJ3Qgd2FudCB0byBzZXJpYWxpemUgdGhlc2UgOilcbiAqXG4gKiBUT0RPOiBmdXR1cmUgcHJvb2YsIG1vdmUgdG8gY29tcG9lbnQgbGFuZFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBpc0hvc3Qob2JqKSB7XG4gIHZhciBzdHIgPSB7fS50b1N0cmluZy5jYWxsKG9iaik7XG5cbiAgc3dpdGNoIChzdHIpIHtcbiAgICBjYXNlICdbb2JqZWN0IEZpbGVdJzpcbiAgICBjYXNlICdbb2JqZWN0IEJsb2JdJzpcbiAgICBjYXNlICdbb2JqZWN0IEZvcm1EYXRhXSc6XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogRXhwb3NlIGByZXF1ZXN0YC5cbiAqL1xuXG52YXIgcmVxdWVzdCA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9yZXF1ZXN0JykuYmluZChudWxsLCBSZXF1ZXN0KTtcblxuLyoqXG4gKiBEZXRlcm1pbmUgWEhSLlxuICovXG5cbnJlcXVlc3QuZ2V0WEhSID0gZnVuY3Rpb24gKCkge1xuICBpZiAocm9vdC5YTUxIdHRwUmVxdWVzdFxuICAgICAgJiYgKCFyb290LmxvY2F0aW9uIHx8ICdmaWxlOicgIT0gcm9vdC5sb2NhdGlvbi5wcm90b2NvbFxuICAgICAgICAgIHx8ICFyb290LkFjdGl2ZVhPYmplY3QpKSB7XG4gICAgcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdDtcbiAgfSBlbHNlIHtcbiAgICB0cnkgeyByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01pY3Jvc29mdC5YTUxIVFRQJyk7IH0gY2F0Y2goZSkge31cbiAgICB0cnkgeyByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01zeG1sMi5YTUxIVFRQLjYuMCcpOyB9IGNhdGNoKGUpIHt9XG4gICAgdHJ5IHsgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNc3htbDIuWE1MSFRUUC4zLjAnKTsgfSBjYXRjaChlKSB7fVxuICAgIHRyeSB7IHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTXN4bWwyLlhNTEhUVFAnKTsgfSBjYXRjaChlKSB7fVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8qKlxuICogUmVtb3ZlcyBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLCBhZGRlZCB0byBzdXBwb3J0IElFLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG52YXIgdHJpbSA9ICcnLnRyaW1cbiAgPyBmdW5jdGlvbihzKSB7IHJldHVybiBzLnRyaW0oKTsgfVxuICA6IGZ1bmN0aW9uKHMpIHsgcmV0dXJuIHMucmVwbGFjZSgvKF5cXHMqfFxccyokKS9nLCAnJyk7IH07XG5cbi8qKlxuICogU2VyaWFsaXplIHRoZSBnaXZlbiBgb2JqYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzZXJpYWxpemUob2JqKSB7XG4gIGlmICghaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgdmFyIHBhaXJzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAobnVsbCAhPSBvYmpba2V5XSkge1xuICAgICAgcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgb2JqW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gIHJldHVybiBwYWlycy5qb2luKCcmJyk7XG59XG5cbi8qKlxuICogSGVscHMgJ3NlcmlhbGl6ZScgd2l0aCBzZXJpYWxpemluZyBhcnJheXMuXG4gKiBNdXRhdGVzIHRoZSBwYWlycyBhcnJheS5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBwYWlyc1xuICogQHBhcmFtIHtTdHJpbmd9IGtleVxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKi9cblxuZnVuY3Rpb24gcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgdmFsKSB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcbiAgICByZXR1cm4gdmFsLmZvckVhY2goZnVuY3Rpb24odikge1xuICAgICAgcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgdik7XG4gICAgfSk7XG4gIH1cbiAgcGFpcnMucHVzaChlbmNvZGVVUklDb21wb25lbnQoa2V5KVxuICAgICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHZhbCkpO1xufVxuXG4vKipcbiAqIEV4cG9zZSBzZXJpYWxpemF0aW9uIG1ldGhvZC5cbiAqL1xuXG4gcmVxdWVzdC5zZXJpYWxpemVPYmplY3QgPSBzZXJpYWxpemU7XG5cbiAvKipcbiAgKiBQYXJzZSB0aGUgZ2l2ZW4geC13d3ctZm9ybS11cmxlbmNvZGVkIGBzdHJgLlxuICAqXG4gICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICAqIEByZXR1cm4ge09iamVjdH1cbiAgKiBAYXBpIHByaXZhdGVcbiAgKi9cblxuZnVuY3Rpb24gcGFyc2VTdHJpbmcoc3RyKSB7XG4gIHZhciBvYmogPSB7fTtcbiAgdmFyIHBhaXJzID0gc3RyLnNwbGl0KCcmJyk7XG4gIHZhciBwYXJ0cztcbiAgdmFyIHBhaXI7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHBhaXJzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgcGFpciA9IHBhaXJzW2ldO1xuICAgIHBhcnRzID0gcGFpci5zcGxpdCgnPScpO1xuICAgIG9ialtkZWNvZGVVUklDb21wb25lbnQocGFydHNbMF0pXSA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXSk7XG4gIH1cblxuICByZXR1cm4gb2JqO1xufVxuXG4vKipcbiAqIEV4cG9zZSBwYXJzZXIuXG4gKi9cblxucmVxdWVzdC5wYXJzZVN0cmluZyA9IHBhcnNlU3RyaW5nO1xuXG4vKipcbiAqIERlZmF1bHQgTUlNRSB0eXBlIG1hcC5cbiAqXG4gKiAgICAgc3VwZXJhZ2VudC50eXBlcy54bWwgPSAnYXBwbGljYXRpb24veG1sJztcbiAqXG4gKi9cblxucmVxdWVzdC50eXBlcyA9IHtcbiAgaHRtbDogJ3RleHQvaHRtbCcsXG4gIGpzb246ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgeG1sOiAnYXBwbGljYXRpb24veG1sJyxcbiAgdXJsZW5jb2RlZDogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICdmb3JtJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICdmb3JtLWRhdGEnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJ1xufTtcblxuLyoqXG4gKiBEZWZhdWx0IHNlcmlhbGl6YXRpb24gbWFwLlxuICpcbiAqICAgICBzdXBlcmFnZW50LnNlcmlhbGl6ZVsnYXBwbGljYXRpb24veG1sJ10gPSBmdW5jdGlvbihvYmope1xuICogICAgICAgcmV0dXJuICdnZW5lcmF0ZWQgeG1sIGhlcmUnO1xuICogICAgIH07XG4gKlxuICovXG5cbiByZXF1ZXN0LnNlcmlhbGl6ZSA9IHtcbiAgICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOiBzZXJpYWxpemUsXG4gICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5XG4gfTtcblxuIC8qKlxuICAqIERlZmF1bHQgcGFyc2Vycy5cbiAgKlxuICAqICAgICBzdXBlcmFnZW50LnBhcnNlWydhcHBsaWNhdGlvbi94bWwnXSA9IGZ1bmN0aW9uKHN0cil7XG4gICogICAgICAgcmV0dXJuIHsgb2JqZWN0IHBhcnNlZCBmcm9tIHN0ciB9O1xuICAqICAgICB9O1xuICAqXG4gICovXG5cbnJlcXVlc3QucGFyc2UgPSB7XG4gICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOiBwYXJzZVN0cmluZyxcbiAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnBhcnNlXG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBoZWFkZXIgYHN0cmAgaW50b1xuICogYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIG1hcHBlZCBmaWVsZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2VIZWFkZXIoc3RyKSB7XG4gIHZhciBsaW5lcyA9IHN0ci5zcGxpdCgvXFxyP1xcbi8pO1xuICB2YXIgZmllbGRzID0ge307XG4gIHZhciBpbmRleDtcbiAgdmFyIGxpbmU7XG4gIHZhciBmaWVsZDtcbiAgdmFyIHZhbDtcblxuICBsaW5lcy5wb3AoKTsgLy8gdHJhaWxpbmcgQ1JMRlxuXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGxpbmUgPSBsaW5lc1tpXTtcbiAgICBpbmRleCA9IGxpbmUuaW5kZXhPZignOicpO1xuICAgIGZpZWxkID0gbGluZS5zbGljZSgwLCBpbmRleCkudG9Mb3dlckNhc2UoKTtcbiAgICB2YWwgPSB0cmltKGxpbmUuc2xpY2UoaW5kZXggKyAxKSk7XG4gICAgZmllbGRzW2ZpZWxkXSA9IHZhbDtcbiAgfVxuXG4gIHJldHVybiBmaWVsZHM7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYG1pbWVgIGlzIGpzb24gb3IgaGFzICtqc29uIHN0cnVjdHVyZWQgc3ludGF4IHN1ZmZpeC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWltZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlzSlNPTihtaW1lKSB7XG4gIHJldHVybiAvW1xcLytdanNvblxcYi8udGVzdChtaW1lKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gdGhlIG1pbWUgdHlwZSBmb3IgdGhlIGdpdmVuIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHR5cGUoc3RyKXtcbiAgcmV0dXJuIHN0ci5zcGxpdCgvICo7ICovKS5zaGlmdCgpO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gaGVhZGVyIGZpZWxkIHBhcmFtZXRlcnMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyYW1zKHN0cil7XG4gIHJldHVybiByZWR1Y2Uoc3RyLnNwbGl0KC8gKjsgKi8pLCBmdW5jdGlvbihvYmosIHN0cil7XG4gICAgdmFyIHBhcnRzID0gc3RyLnNwbGl0KC8gKj0gKi8pXG4gICAgICAsIGtleSA9IHBhcnRzLnNoaWZ0KClcbiAgICAgICwgdmFsID0gcGFydHMuc2hpZnQoKTtcblxuICAgIGlmIChrZXkgJiYgdmFsKSBvYmpba2V5XSA9IHZhbDtcbiAgICByZXR1cm4gb2JqO1xuICB9LCB7fSk7XG59O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFJlc3BvbnNlYCB3aXRoIHRoZSBnaXZlbiBgeGhyYC5cbiAqXG4gKiAgLSBzZXQgZmxhZ3MgKC5vaywgLmVycm9yLCBldGMpXG4gKiAgLSBwYXJzZSBoZWFkZXJcbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgQWxpYXNpbmcgYHN1cGVyYWdlbnRgIGFzIGByZXF1ZXN0YCBpcyBuaWNlOlxuICpcbiAqICAgICAgcmVxdWVzdCA9IHN1cGVyYWdlbnQ7XG4gKlxuICogIFdlIGNhbiB1c2UgdGhlIHByb21pc2UtbGlrZSBBUEksIG9yIHBhc3MgY2FsbGJhY2tzOlxuICpcbiAqICAgICAgcmVxdWVzdC5nZXQoJy8nKS5lbmQoZnVuY3Rpb24ocmVzKXt9KTtcbiAqICAgICAgcmVxdWVzdC5nZXQoJy8nLCBmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqICBTZW5kaW5nIGRhdGEgY2FuIGJlIGNoYWluZWQ6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJylcbiAqICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogIE9yIHBhc3NlZCB0byBgLnNlbmQoKWA6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJylcbiAqICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSwgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiAgT3IgcGFzc2VkIHRvIGAucG9zdCgpYDpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInLCB7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogT3IgZnVydGhlciByZWR1Y2VkIHRvIGEgc2luZ2xlIGNhbGwgZm9yIHNpbXBsZSBjYXNlczpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInLCB7IG5hbWU6ICd0aicgfSwgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiBAcGFyYW0ge1hNTEhUVFBSZXF1ZXN0fSB4aHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBSZXNwb25zZShyZXEsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHRoaXMucmVxID0gcmVxO1xuICB0aGlzLnhociA9IHRoaXMucmVxLnhocjtcbiAgLy8gcmVzcG9uc2VUZXh0IGlzIGFjY2Vzc2libGUgb25seSBpZiByZXNwb25zZVR5cGUgaXMgJycgb3IgJ3RleHQnIGFuZCBvbiBvbGRlciBicm93c2Vyc1xuICB0aGlzLnRleHQgPSAoKHRoaXMucmVxLm1ldGhvZCAhPSdIRUFEJyAmJiAodGhpcy54aHIucmVzcG9uc2VUeXBlID09PSAnJyB8fCB0aGlzLnhoci5yZXNwb25zZVR5cGUgPT09ICd0ZXh0JykpIHx8IHR5cGVvZiB0aGlzLnhoci5yZXNwb25zZVR5cGUgPT09ICd1bmRlZmluZWQnKVxuICAgICA/IHRoaXMueGhyLnJlc3BvbnNlVGV4dFxuICAgICA6IG51bGw7XG4gIHRoaXMuc3RhdHVzVGV4dCA9IHRoaXMucmVxLnhoci5zdGF0dXNUZXh0O1xuICB0aGlzLnNldFN0YXR1c1Byb3BlcnRpZXModGhpcy54aHIuc3RhdHVzKTtcbiAgdGhpcy5oZWFkZXIgPSB0aGlzLmhlYWRlcnMgPSBwYXJzZUhlYWRlcih0aGlzLnhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSk7XG4gIC8vIGdldEFsbFJlc3BvbnNlSGVhZGVycyBzb21ldGltZXMgZmFsc2VseSByZXR1cm5zIFwiXCIgZm9yIENPUlMgcmVxdWVzdHMsIGJ1dFxuICAvLyBnZXRSZXNwb25zZUhlYWRlciBzdGlsbCB3b3Jrcy4gc28gd2UgZ2V0IGNvbnRlbnQtdHlwZSBldmVuIGlmIGdldHRpbmdcbiAgLy8gb3RoZXIgaGVhZGVycyBmYWlscy5cbiAgdGhpcy5oZWFkZXJbJ2NvbnRlbnQtdHlwZSddID0gdGhpcy54aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ2NvbnRlbnQtdHlwZScpO1xuICB0aGlzLnNldEhlYWRlclByb3BlcnRpZXModGhpcy5oZWFkZXIpO1xuICB0aGlzLmJvZHkgPSB0aGlzLnJlcS5tZXRob2QgIT0gJ0hFQUQnXG4gICAgPyB0aGlzLnBhcnNlQm9keSh0aGlzLnRleHQgPyB0aGlzLnRleHQgOiB0aGlzLnhoci5yZXNwb25zZSlcbiAgICA6IG51bGw7XG59XG5cbi8qKlxuICogR2V0IGNhc2UtaW5zZW5zaXRpdmUgYGZpZWxkYCB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVzcG9uc2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGZpZWxkKXtcbiAgcmV0dXJuIHRoaXMuaGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xufTtcblxuLyoqXG4gKiBTZXQgaGVhZGVyIHJlbGF0ZWQgcHJvcGVydGllczpcbiAqXG4gKiAgIC0gYC50eXBlYCB0aGUgY29udGVudCB0eXBlIHdpdGhvdXQgcGFyYW1zXG4gKlxuICogQSByZXNwb25zZSBvZiBcIkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOFwiXG4gKiB3aWxsIHByb3ZpZGUgeW91IHdpdGggYSBgLnR5cGVgIG9mIFwidGV4dC9wbGFpblwiLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBoZWFkZXJcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS5zZXRIZWFkZXJQcm9wZXJ0aWVzID0gZnVuY3Rpb24oaGVhZGVyKXtcbiAgLy8gY29udGVudC10eXBlXG4gIHZhciBjdCA9IHRoaXMuaGVhZGVyWydjb250ZW50LXR5cGUnXSB8fCAnJztcbiAgdGhpcy50eXBlID0gdHlwZShjdCk7XG5cbiAgLy8gcGFyYW1zXG4gIHZhciBvYmogPSBwYXJhbXMoY3QpO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB0aGlzW2tleV0gPSBvYmpba2V5XTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGJvZHkgYHN0cmAuXG4gKlxuICogVXNlZCBmb3IgYXV0by1wYXJzaW5nIG9mIGJvZGllcy4gUGFyc2Vyc1xuICogYXJlIGRlZmluZWQgb24gdGhlIGBzdXBlcmFnZW50LnBhcnNlYCBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TWl4ZWR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUucGFyc2VCb2R5ID0gZnVuY3Rpb24oc3RyKXtcbiAgdmFyIHBhcnNlID0gcmVxdWVzdC5wYXJzZVt0aGlzLnR5cGVdO1xuICBpZiAoIXBhcnNlICYmIGlzSlNPTih0aGlzLnR5cGUpKSB7XG4gICAgcGFyc2UgPSByZXF1ZXN0LnBhcnNlWydhcHBsaWNhdGlvbi9qc29uJ107XG4gIH1cbiAgcmV0dXJuIHBhcnNlICYmIHN0ciAmJiAoc3RyLmxlbmd0aCB8fCBzdHIgaW5zdGFuY2VvZiBPYmplY3QpXG4gICAgPyBwYXJzZShzdHIpXG4gICAgOiBudWxsO1xufTtcblxuLyoqXG4gKiBTZXQgZmxhZ3Mgc3VjaCBhcyBgLm9rYCBiYXNlZCBvbiBgc3RhdHVzYC5cbiAqXG4gKiBGb3IgZXhhbXBsZSBhIDJ4eCByZXNwb25zZSB3aWxsIGdpdmUgeW91IGEgYC5va2Agb2YgX190cnVlX19cbiAqIHdoZXJlYXMgNXh4IHdpbGwgYmUgX19mYWxzZV9fIGFuZCBgLmVycm9yYCB3aWxsIGJlIF9fdHJ1ZV9fLiBUaGVcbiAqIGAuY2xpZW50RXJyb3JgIGFuZCBgLnNlcnZlckVycm9yYCBhcmUgYWxzbyBhdmFpbGFibGUgdG8gYmUgbW9yZVxuICogc3BlY2lmaWMsIGFuZCBgLnN0YXR1c1R5cGVgIGlzIHRoZSBjbGFzcyBvZiBlcnJvciByYW5naW5nIGZyb20gMS4uNVxuICogc29tZXRpbWVzIHVzZWZ1bCBmb3IgbWFwcGluZyByZXNwb25kIGNvbG9ycyBldGMuXG4gKlxuICogXCJzdWdhclwiIHByb3BlcnRpZXMgYXJlIGFsc28gZGVmaW5lZCBmb3IgY29tbW9uIGNhc2VzLiBDdXJyZW50bHkgcHJvdmlkaW5nOlxuICpcbiAqICAgLSAubm9Db250ZW50XG4gKiAgIC0gLmJhZFJlcXVlc3RcbiAqICAgLSAudW5hdXRob3JpemVkXG4gKiAgIC0gLm5vdEFjY2VwdGFibGVcbiAqICAgLSAubm90Rm91bmRcbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gc3RhdHVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUuc2V0U3RhdHVzUHJvcGVydGllcyA9IGZ1bmN0aW9uKHN0YXR1cyl7XG4gIC8vIGhhbmRsZSBJRTkgYnVnOiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzEwMDQ2OTcyL21zaWUtcmV0dXJucy1zdGF0dXMtY29kZS1vZi0xMjIzLWZvci1hamF4LXJlcXVlc3RcbiAgaWYgKHN0YXR1cyA9PT0gMTIyMykge1xuICAgIHN0YXR1cyA9IDIwNDtcbiAgfVxuXG4gIHZhciB0eXBlID0gc3RhdHVzIC8gMTAwIHwgMDtcblxuICAvLyBzdGF0dXMgLyBjbGFzc1xuICB0aGlzLnN0YXR1cyA9IHRoaXMuc3RhdHVzQ29kZSA9IHN0YXR1cztcbiAgdGhpcy5zdGF0dXNUeXBlID0gdHlwZTtcblxuICAvLyBiYXNpY3NcbiAgdGhpcy5pbmZvID0gMSA9PSB0eXBlO1xuICB0aGlzLm9rID0gMiA9PSB0eXBlO1xuICB0aGlzLmNsaWVudEVycm9yID0gNCA9PSB0eXBlO1xuICB0aGlzLnNlcnZlckVycm9yID0gNSA9PSB0eXBlO1xuICB0aGlzLmVycm9yID0gKDQgPT0gdHlwZSB8fCA1ID09IHR5cGUpXG4gICAgPyB0aGlzLnRvRXJyb3IoKVxuICAgIDogZmFsc2U7XG5cbiAgLy8gc3VnYXJcbiAgdGhpcy5hY2NlcHRlZCA9IDIwMiA9PSBzdGF0dXM7XG4gIHRoaXMubm9Db250ZW50ID0gMjA0ID09IHN0YXR1cztcbiAgdGhpcy5iYWRSZXF1ZXN0ID0gNDAwID09IHN0YXR1cztcbiAgdGhpcy51bmF1dGhvcml6ZWQgPSA0MDEgPT0gc3RhdHVzO1xuICB0aGlzLm5vdEFjY2VwdGFibGUgPSA0MDYgPT0gc3RhdHVzO1xuICB0aGlzLm5vdEZvdW5kID0gNDA0ID09IHN0YXR1cztcbiAgdGhpcy5mb3JiaWRkZW4gPSA0MDMgPT0gc3RhdHVzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gYEVycm9yYCByZXByZXNlbnRhdGl2ZSBvZiB0aGlzIHJlc3BvbnNlLlxuICpcbiAqIEByZXR1cm4ge0Vycm9yfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUudG9FcnJvciA9IGZ1bmN0aW9uKCl7XG4gIHZhciByZXEgPSB0aGlzLnJlcTtcbiAgdmFyIG1ldGhvZCA9IHJlcS5tZXRob2Q7XG4gIHZhciB1cmwgPSByZXEudXJsO1xuXG4gIHZhciBtc2cgPSAnY2Fubm90ICcgKyBtZXRob2QgKyAnICcgKyB1cmwgKyAnICgnICsgdGhpcy5zdGF0dXMgKyAnKSc7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IobXNnKTtcbiAgZXJyLnN0YXR1cyA9IHRoaXMuc3RhdHVzO1xuICBlcnIubWV0aG9kID0gbWV0aG9kO1xuICBlcnIudXJsID0gdXJsO1xuXG4gIHJldHVybiBlcnI7XG59O1xuXG4vKipcbiAqIEV4cG9zZSBgUmVzcG9uc2VgLlxuICovXG5cbnJlcXVlc3QuUmVzcG9uc2UgPSBSZXNwb25zZTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSZXF1ZXN0YCB3aXRoIHRoZSBnaXZlbiBgbWV0aG9kYCBhbmQgYHVybGAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBSZXF1ZXN0KG1ldGhvZCwgdXJsKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fcXVlcnkgPSB0aGlzLl9xdWVyeSB8fCBbXTtcbiAgdGhpcy5tZXRob2QgPSBtZXRob2Q7XG4gIHRoaXMudXJsID0gdXJsO1xuICB0aGlzLmhlYWRlciA9IHt9OyAvLyBwcmVzZXJ2ZXMgaGVhZGVyIG5hbWUgY2FzZVxuICB0aGlzLl9oZWFkZXIgPSB7fTsgLy8gY29lcmNlcyBoZWFkZXIgbmFtZXMgdG8gbG93ZXJjYXNlXG4gIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIGVyciA9IG51bGw7XG4gICAgdmFyIHJlcyA9IG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgcmVzID0gbmV3IFJlc3BvbnNlKHNlbGYpO1xuICAgIH0gY2F0Y2goZSkge1xuICAgICAgZXJyID0gbmV3IEVycm9yKCdQYXJzZXIgaXMgdW5hYmxlIHRvIHBhcnNlIHRoZSByZXNwb25zZScpO1xuICAgICAgZXJyLnBhcnNlID0gdHJ1ZTtcbiAgICAgIGVyci5vcmlnaW5hbCA9IGU7XG4gICAgICAvLyBpc3N1ZSAjNjc1OiByZXR1cm4gdGhlIHJhdyByZXNwb25zZSBpZiB0aGUgcmVzcG9uc2UgcGFyc2luZyBmYWlsc1xuICAgICAgZXJyLnJhd1Jlc3BvbnNlID0gc2VsZi54aHIgJiYgc2VsZi54aHIucmVzcG9uc2VUZXh0ID8gc2VsZi54aHIucmVzcG9uc2VUZXh0IDogbnVsbDtcbiAgICAgIC8vIGlzc3VlICM4NzY6IHJldHVybiB0aGUgaHR0cCBzdGF0dXMgY29kZSBpZiB0aGUgcmVzcG9uc2UgcGFyc2luZyBmYWlsc1xuICAgICAgZXJyLnN0YXR1c0NvZGUgPSBzZWxmLnhociAmJiBzZWxmLnhoci5zdGF0dXMgPyBzZWxmLnhoci5zdGF0dXMgOiBudWxsO1xuICAgICAgcmV0dXJuIHNlbGYuY2FsbGJhY2soZXJyKTtcbiAgICB9XG5cbiAgICBzZWxmLmVtaXQoJ3Jlc3BvbnNlJywgcmVzKTtcblxuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiBzZWxmLmNhbGxiYWNrKGVyciwgcmVzKTtcbiAgICB9XG5cbiAgICBpZiAocmVzLnN0YXR1cyA+PSAyMDAgJiYgcmVzLnN0YXR1cyA8IDMwMCkge1xuICAgICAgcmV0dXJuIHNlbGYuY2FsbGJhY2soZXJyLCByZXMpO1xuICAgIH1cblxuICAgIHZhciBuZXdfZXJyID0gbmV3IEVycm9yKHJlcy5zdGF0dXNUZXh0IHx8ICdVbnN1Y2Nlc3NmdWwgSFRUUCByZXNwb25zZScpO1xuICAgIG5ld19lcnIub3JpZ2luYWwgPSBlcnI7XG4gICAgbmV3X2Vyci5yZXNwb25zZSA9IHJlcztcbiAgICBuZXdfZXJyLnN0YXR1cyA9IHJlcy5zdGF0dXM7XG5cbiAgICBzZWxmLmNhbGxiYWNrKG5ld19lcnIsIHJlcyk7XG4gIH0pO1xufVxuXG4vKipcbiAqIE1peGluIGBFbWl0dGVyYCBhbmQgYHJlcXVlc3RCYXNlYC5cbiAqL1xuXG5FbWl0dGVyKFJlcXVlc3QucHJvdG90eXBlKTtcbmZvciAodmFyIGtleSBpbiByZXF1ZXN0QmFzZSkge1xuICBSZXF1ZXN0LnByb3RvdHlwZVtrZXldID0gcmVxdWVzdEJhc2Vba2V5XTtcbn1cblxuLyoqXG4gKiBBYm9ydCB0aGUgcmVxdWVzdCwgYW5kIGNsZWFyIHBvdGVudGlhbCB0aW1lb3V0LlxuICpcbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmFib3J0ID0gZnVuY3Rpb24oKXtcbiAgaWYgKHRoaXMuYWJvcnRlZCkgcmV0dXJuO1xuICB0aGlzLmFib3J0ZWQgPSB0cnVlO1xuICB0aGlzLnhoci5hYm9ydCgpO1xuICB0aGlzLmNsZWFyVGltZW91dCgpO1xuICB0aGlzLmVtaXQoJ2Fib3J0Jyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgQ29udGVudC1UeXBlIHRvIGB0eXBlYCwgbWFwcGluZyB2YWx1ZXMgZnJvbSBgcmVxdWVzdC50eXBlc2AuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICBzdXBlcmFnZW50LnR5cGVzLnhtbCA9ICdhcHBsaWNhdGlvbi94bWwnO1xuICpcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvJylcbiAqICAgICAgICAudHlwZSgneG1sJylcbiAqICAgICAgICAuc2VuZCh4bWxzdHJpbmcpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXF1ZXN0LnBvc3QoJy8nKVxuICogICAgICAgIC50eXBlKCdhcHBsaWNhdGlvbi94bWwnKVxuICogICAgICAgIC5zZW5kKHhtbHN0cmluZylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnR5cGUgPSBmdW5jdGlvbih0eXBlKXtcbiAgdGhpcy5zZXQoJ0NvbnRlbnQtVHlwZScsIHJlcXVlc3QudHlwZXNbdHlwZV0gfHwgdHlwZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgcmVzcG9uc2VUeXBlIHRvIGB2YWxgLiBQcmVzZW50bHkgdmFsaWQgcmVzcG9uc2VUeXBlcyBhcmUgJ2Jsb2InIGFuZCBcbiAqICdhcnJheWJ1ZmZlcicuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAucmVzcG9uc2VUeXBlKCdibG9iJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUucmVzcG9uc2VUeXBlID0gZnVuY3Rpb24odmFsKXtcbiAgdGhpcy5fcmVzcG9uc2VUeXBlID0gdmFsO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IEFjY2VwdCB0byBgdHlwZWAsIG1hcHBpbmcgdmFsdWVzIGZyb20gYHJlcXVlc3QudHlwZXNgLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgc3VwZXJhZ2VudC50eXBlcy5qc29uID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuICpcbiAqICAgICAgcmVxdWVzdC5nZXQoJy9hZ2VudCcpXG4gKiAgICAgICAgLmFjY2VwdCgnanNvbicpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXF1ZXN0LmdldCgnL2FnZW50JylcbiAqICAgICAgICAuYWNjZXB0KCdhcHBsaWNhdGlvbi9qc29uJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYWNjZXB0XG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYWNjZXB0ID0gZnVuY3Rpb24odHlwZSl7XG4gIHRoaXMuc2V0KCdBY2NlcHQnLCByZXF1ZXN0LnR5cGVzW3R5cGVdIHx8IHR5cGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IEF1dGhvcml6YXRpb24gZmllbGQgdmFsdWUgd2l0aCBgdXNlcmAgYW5kIGBwYXNzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlclxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3NcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIHdpdGggJ3R5cGUnIHByb3BlcnR5ICdhdXRvJyBvciAnYmFzaWMnIChkZWZhdWx0ICdiYXNpYycpXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIG9wdGlvbnMpe1xuICBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0ge1xuICAgICAgdHlwZTogJ2Jhc2ljJ1xuICAgIH1cbiAgfVxuXG4gIHN3aXRjaCAob3B0aW9ucy50eXBlKSB7XG4gICAgY2FzZSAnYmFzaWMnOlxuICAgICAgdmFyIHN0ciA9IGJ0b2EodXNlciArICc6JyArIHBhc3MpO1xuICAgICAgdGhpcy5zZXQoJ0F1dGhvcml6YXRpb24nLCAnQmFzaWMgJyArIHN0cik7XG4gICAgYnJlYWs7XG5cbiAgICBjYXNlICdhdXRvJzpcbiAgICAgIHRoaXMudXNlcm5hbWUgPSB1c2VyO1xuICAgICAgdGhpcy5wYXNzd29yZCA9IHBhc3M7XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiogQWRkIHF1ZXJ5LXN0cmluZyBgdmFsYC5cbipcbiogRXhhbXBsZXM6XG4qXG4qICAgcmVxdWVzdC5nZXQoJy9zaG9lcycpXG4qICAgICAucXVlcnkoJ3NpemU9MTAnKVxuKiAgICAgLnF1ZXJ5KHsgY29sb3I6ICdibHVlJyB9KVxuKlxuKiBAcGFyYW0ge09iamVjdHxTdHJpbmd9IHZhbFxuKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiogQGFwaSBwdWJsaWNcbiovXG5cblJlcXVlc3QucHJvdG90eXBlLnF1ZXJ5ID0gZnVuY3Rpb24odmFsKXtcbiAgaWYgKCdzdHJpbmcnICE9IHR5cGVvZiB2YWwpIHZhbCA9IHNlcmlhbGl6ZSh2YWwpO1xuICBpZiAodmFsKSB0aGlzLl9xdWVyeS5wdXNoKHZhbCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBRdWV1ZSB0aGUgZ2l2ZW4gYGZpbGVgIGFzIGFuIGF0dGFjaG1lbnQgdG8gdGhlIHNwZWNpZmllZCBgZmllbGRgLFxuICogd2l0aCBvcHRpb25hbCBgZmlsZW5hbWVgLlxuICpcbiAqIGBgYCBqc1xuICogcmVxdWVzdC5wb3N0KCcvdXBsb2FkJylcbiAqICAgLmF0dGFjaChuZXcgQmxvYihbJzxhIGlkPVwiYVwiPjxiIGlkPVwiYlwiPmhleSE8L2I+PC9hPiddLCB7IHR5cGU6IFwidGV4dC9odG1sXCJ9KSlcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEBwYXJhbSB7QmxvYnxGaWxlfSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWVcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbihmaWVsZCwgZmlsZSwgZmlsZW5hbWUpe1xuICB0aGlzLl9nZXRGb3JtRGF0YSgpLmFwcGVuZChmaWVsZCwgZmlsZSwgZmlsZW5hbWUgfHwgZmlsZS5uYW1lKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fZ2V0Rm9ybURhdGEgPSBmdW5jdGlvbigpe1xuICBpZiAoIXRoaXMuX2Zvcm1EYXRhKSB7XG4gICAgdGhpcy5fZm9ybURhdGEgPSBuZXcgcm9vdC5Gb3JtRGF0YSgpO1xuICB9XG4gIHJldHVybiB0aGlzLl9mb3JtRGF0YTtcbn07XG5cbi8qKlxuICogU2VuZCBgZGF0YWAgYXMgdGhlIHJlcXVlc3QgYm9keSwgZGVmYXVsdGluZyB0aGUgYC50eXBlKClgIHRvIFwianNvblwiIHdoZW5cbiAqIGFuIG9iamVjdCBpcyBnaXZlbi5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgICAvLyBtYW51YWwganNvblxuICogICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgIC50eXBlKCdqc29uJylcbiAqICAgICAgICAgLnNlbmQoJ3tcIm5hbWVcIjpcInRqXCJ9JylcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBhdXRvIGpzb25cbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBtYW51YWwgeC13d3ctZm9ybS11cmxlbmNvZGVkXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnR5cGUoJ2Zvcm0nKVxuICogICAgICAgICAuc2VuZCgnbmFtZT10aicpXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gYXV0byB4LXd3dy1mb3JtLXVybGVuY29kZWRcbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAudHlwZSgnZm9ybScpXG4gKiAgICAgICAgIC5zZW5kKHsgbmFtZTogJ3RqJyB9KVxuICogICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqICAgICAgIC8vIGRlZmF1bHRzIHRvIHgtd3d3LWZvcm0tdXJsZW5jb2RlZFxuICAqICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gICogICAgICAgIC5zZW5kKCduYW1lPXRvYmknKVxuICAqICAgICAgICAuc2VuZCgnc3BlY2llcz1mZXJyZXQnKVxuICAqICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gZGF0YVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihkYXRhKXtcbiAgdmFyIG9iaiA9IGlzT2JqZWN0KGRhdGEpO1xuICB2YXIgdHlwZSA9IHRoaXMuX2hlYWRlclsnY29udGVudC10eXBlJ107XG5cbiAgLy8gbWVyZ2VcbiAgaWYgKG9iaiAmJiBpc09iamVjdCh0aGlzLl9kYXRhKSkge1xuICAgIGZvciAodmFyIGtleSBpbiBkYXRhKSB7XG4gICAgICB0aGlzLl9kYXRhW2tleV0gPSBkYXRhW2tleV07XG4gICAgfVxuICB9IGVsc2UgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBkYXRhKSB7XG4gICAgaWYgKCF0eXBlKSB0aGlzLnR5cGUoJ2Zvcm0nKTtcbiAgICB0eXBlID0gdGhpcy5faGVhZGVyWydjb250ZW50LXR5cGUnXTtcbiAgICBpZiAoJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcgPT0gdHlwZSkge1xuICAgICAgdGhpcy5fZGF0YSA9IHRoaXMuX2RhdGFcbiAgICAgICAgPyB0aGlzLl9kYXRhICsgJyYnICsgZGF0YVxuICAgICAgICA6IGRhdGE7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX2RhdGEgPSAodGhpcy5fZGF0YSB8fCAnJykgKyBkYXRhO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgfVxuXG4gIGlmICghb2JqIHx8IGlzSG9zdChkYXRhKSkgcmV0dXJuIHRoaXM7XG4gIGlmICghdHlwZSkgdGhpcy50eXBlKCdqc29uJyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZFxuICovXG5SZXNwb25zZS5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbiBzZXJpYWxpemUoZm4pe1xuICBpZiAocm9vdC5jb25zb2xlKSB7XG4gICAgY29uc29sZS53YXJuKFwiQ2xpZW50LXNpZGUgcGFyc2UoKSBtZXRob2QgaGFzIGJlZW4gcmVuYW1lZCB0byBzZXJpYWxpemUoKS4gVGhpcyBtZXRob2QgaXMgbm90IGNvbXBhdGlibGUgd2l0aCBzdXBlcmFnZW50IHYyLjBcIik7XG4gIH1cbiAgdGhpcy5zZXJpYWxpemUoZm4pO1xuICByZXR1cm4gdGhpcztcbn07XG5cblJlc3BvbnNlLnByb3RvdHlwZS5zZXJpYWxpemUgPSBmdW5jdGlvbiBzZXJpYWxpemUoZm4pe1xuICB0aGlzLl9wYXJzZXIgPSBmbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCBgZXJyYCBhbmQgYHJlc2BcbiAqIGFuZCBoYW5kbGUgYXJpdHkgY2hlY2suXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAcGFyYW0ge1Jlc3BvbnNlfSByZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNhbGxiYWNrID0gZnVuY3Rpb24oZXJyLCByZXMpe1xuICB2YXIgZm4gPSB0aGlzLl9jYWxsYmFjaztcbiAgdGhpcy5jbGVhclRpbWVvdXQoKTtcbiAgZm4oZXJyLCByZXMpO1xufTtcblxuLyoqXG4gKiBJbnZva2UgY2FsbGJhY2sgd2l0aCB4LWRvbWFpbiBlcnJvci5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5jcm9zc0RvbWFpbkVycm9yID0gZnVuY3Rpb24oKXtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignUmVxdWVzdCBoYXMgYmVlbiB0ZXJtaW5hdGVkXFxuUG9zc2libGUgY2F1c2VzOiB0aGUgbmV0d29yayBpcyBvZmZsaW5lLCBPcmlnaW4gaXMgbm90IGFsbG93ZWQgYnkgQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luLCB0aGUgcGFnZSBpcyBiZWluZyB1bmxvYWRlZCwgZXRjLicpO1xuICBlcnIuY3Jvc3NEb21haW4gPSB0cnVlO1xuXG4gIGVyci5zdGF0dXMgPSB0aGlzLnN0YXR1cztcbiAgZXJyLm1ldGhvZCA9IHRoaXMubWV0aG9kO1xuICBlcnIudXJsID0gdGhpcy51cmw7XG5cbiAgdGhpcy5jYWxsYmFjayhlcnIpO1xufTtcblxuLyoqXG4gKiBJbnZva2UgY2FsbGJhY2sgd2l0aCB0aW1lb3V0IGVycm9yLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnRpbWVvdXRFcnJvciA9IGZ1bmN0aW9uKCl7XG4gIHZhciB0aW1lb3V0ID0gdGhpcy5fdGltZW91dDtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcigndGltZW91dCBvZiAnICsgdGltZW91dCArICdtcyBleGNlZWRlZCcpO1xuICBlcnIudGltZW91dCA9IHRpbWVvdXQ7XG4gIHRoaXMuY2FsbGJhY2soZXJyKTtcbn07XG5cbi8qKlxuICogRW5hYmxlIHRyYW5zbWlzc2lvbiBvZiBjb29raWVzIHdpdGggeC1kb21haW4gcmVxdWVzdHMuXG4gKlxuICogTm90ZSB0aGF0IGZvciB0aGlzIHRvIHdvcmsgdGhlIG9yaWdpbiBtdXN0IG5vdCBiZVxuICogdXNpbmcgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIiB3aXRoIGEgd2lsZGNhcmQsXG4gKiBhbmQgYWxzbyBtdXN0IHNldCBcIkFjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzXCJcbiAqIHRvIFwidHJ1ZVwiLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUud2l0aENyZWRlbnRpYWxzID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5fd2l0aENyZWRlbnRpYWxzID0gdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEluaXRpYXRlIHJlcXVlc3QsIGludm9raW5nIGNhbGxiYWNrIGBmbihyZXMpYFxuICogd2l0aCBhbiBpbnN0YW5jZW9mIGBSZXNwb25zZWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHhociA9IHRoaXMueGhyID0gcmVxdWVzdC5nZXRYSFIoKTtcbiAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnkuam9pbignJicpO1xuICB2YXIgdGltZW91dCA9IHRoaXMuX3RpbWVvdXQ7XG4gIHZhciBkYXRhID0gdGhpcy5fZm9ybURhdGEgfHwgdGhpcy5fZGF0YTtcblxuICAvLyBzdG9yZSBjYWxsYmFja1xuICB0aGlzLl9jYWxsYmFjayA9IGZuIHx8IG5vb3A7XG5cbiAgLy8gc3RhdGUgY2hhbmdlXG4gIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpe1xuICAgIGlmICg0ICE9IHhoci5yZWFkeVN0YXRlKSByZXR1cm47XG5cbiAgICAvLyBJbiBJRTksIHJlYWRzIHRvIGFueSBwcm9wZXJ0eSAoZS5nLiBzdGF0dXMpIG9mZiBvZiBhbiBhYm9ydGVkIFhIUiB3aWxsXG4gICAgLy8gcmVzdWx0IGluIHRoZSBlcnJvciBcIkNvdWxkIG5vdCBjb21wbGV0ZSB0aGUgb3BlcmF0aW9uIGR1ZSB0byBlcnJvciBjMDBjMDIzZlwiXG4gICAgdmFyIHN0YXR1cztcbiAgICB0cnkgeyBzdGF0dXMgPSB4aHIuc3RhdHVzIH0gY2F0Y2goZSkgeyBzdGF0dXMgPSAwOyB9XG5cbiAgICBpZiAoMCA9PSBzdGF0dXMpIHtcbiAgICAgIGlmIChzZWxmLnRpbWVkb3V0KSByZXR1cm4gc2VsZi50aW1lb3V0RXJyb3IoKTtcbiAgICAgIGlmIChzZWxmLmFib3J0ZWQpIHJldHVybjtcbiAgICAgIHJldHVybiBzZWxmLmNyb3NzRG9tYWluRXJyb3IoKTtcbiAgICB9XG4gICAgc2VsZi5lbWl0KCdlbmQnKTtcbiAgfTtcblxuICAvLyBwcm9ncmVzc1xuICB2YXIgaGFuZGxlUHJvZ3Jlc3MgPSBmdW5jdGlvbihlKXtcbiAgICBpZiAoZS50b3RhbCA+IDApIHtcbiAgICAgIGUucGVyY2VudCA9IGUubG9hZGVkIC8gZS50b3RhbCAqIDEwMDtcbiAgICB9XG4gICAgZS5kaXJlY3Rpb24gPSAnZG93bmxvYWQnO1xuICAgIHNlbGYuZW1pdCgncHJvZ3Jlc3MnLCBlKTtcbiAgfTtcbiAgaWYgKHRoaXMuaGFzTGlzdGVuZXJzKCdwcm9ncmVzcycpKSB7XG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBoYW5kbGVQcm9ncmVzcztcbiAgfVxuICB0cnkge1xuICAgIGlmICh4aHIudXBsb2FkICYmIHRoaXMuaGFzTGlzdGVuZXJzKCdwcm9ncmVzcycpKSB7XG4gICAgICB4aHIudXBsb2FkLm9ucHJvZ3Jlc3MgPSBoYW5kbGVQcm9ncmVzcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge1xuICAgIC8vIEFjY2Vzc2luZyB4aHIudXBsb2FkIGZhaWxzIGluIElFIGZyb20gYSB3ZWIgd29ya2VyLCBzbyBqdXN0IHByZXRlbmQgaXQgZG9lc24ndCBleGlzdC5cbiAgICAvLyBSZXBvcnRlZCBoZXJlOlxuICAgIC8vIGh0dHBzOi8vY29ubmVjdC5taWNyb3NvZnQuY29tL0lFL2ZlZWRiYWNrL2RldGFpbHMvODM3MjQ1L3htbGh0dHByZXF1ZXN0LXVwbG9hZC10aHJvd3MtaW52YWxpZC1hcmd1bWVudC13aGVuLXVzZWQtZnJvbS13ZWItd29ya2VyLWNvbnRleHRcbiAgfVxuXG4gIC8vIHRpbWVvdXRcbiAgaWYgKHRpbWVvdXQgJiYgIXRoaXMuX3RpbWVyKSB7XG4gICAgdGhpcy5fdGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICBzZWxmLnRpbWVkb3V0ID0gdHJ1ZTtcbiAgICAgIHNlbGYuYWJvcnQoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgfVxuXG4gIC8vIHF1ZXJ5c3RyaW5nXG4gIGlmIChxdWVyeSkge1xuICAgIHF1ZXJ5ID0gcmVxdWVzdC5zZXJpYWxpemVPYmplY3QocXVlcnkpO1xuICAgIHRoaXMudXJsICs9IH50aGlzLnVybC5pbmRleE9mKCc/JylcbiAgICAgID8gJyYnICsgcXVlcnlcbiAgICAgIDogJz8nICsgcXVlcnk7XG4gIH1cblxuICAvLyBpbml0aWF0ZSByZXF1ZXN0XG4gIGlmICh0aGlzLnVzZXJuYW1lICYmIHRoaXMucGFzc3dvcmQpIHtcbiAgICB4aHIub3Blbih0aGlzLm1ldGhvZCwgdGhpcy51cmwsIHRydWUsIHRoaXMudXNlcm5hbWUsIHRoaXMucGFzc3dvcmQpO1xuICB9IGVsc2Uge1xuICAgIHhoci5vcGVuKHRoaXMubWV0aG9kLCB0aGlzLnVybCwgdHJ1ZSk7XG4gIH1cblxuICAvLyBDT1JTXG4gIGlmICh0aGlzLl93aXRoQ3JlZGVudGlhbHMpIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlO1xuXG4gIC8vIGJvZHlcbiAgaWYgKCdHRVQnICE9IHRoaXMubWV0aG9kICYmICdIRUFEJyAhPSB0aGlzLm1ldGhvZCAmJiAnc3RyaW5nJyAhPSB0eXBlb2YgZGF0YSAmJiAhaXNIb3N0KGRhdGEpKSB7XG4gICAgLy8gc2VyaWFsaXplIHN0dWZmXG4gICAgdmFyIGNvbnRlbnRUeXBlID0gdGhpcy5faGVhZGVyWydjb250ZW50LXR5cGUnXTtcbiAgICB2YXIgc2VyaWFsaXplID0gdGhpcy5fcGFyc2VyIHx8IHJlcXVlc3Quc2VyaWFsaXplW2NvbnRlbnRUeXBlID8gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXSA6ICcnXTtcbiAgICBpZiAoIXNlcmlhbGl6ZSAmJiBpc0pTT04oY29udGVudFR5cGUpKSBzZXJpYWxpemUgPSByZXF1ZXN0LnNlcmlhbGl6ZVsnYXBwbGljYXRpb24vanNvbiddO1xuICAgIGlmIChzZXJpYWxpemUpIGRhdGEgPSBzZXJpYWxpemUoZGF0YSk7XG4gIH1cblxuICAvLyBzZXQgaGVhZGVyIGZpZWxkc1xuICBmb3IgKHZhciBmaWVsZCBpbiB0aGlzLmhlYWRlcikge1xuICAgIGlmIChudWxsID09IHRoaXMuaGVhZGVyW2ZpZWxkXSkgY29udGludWU7XG4gICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoZmllbGQsIHRoaXMuaGVhZGVyW2ZpZWxkXSk7XG4gIH1cblxuICBpZiAodGhpcy5fcmVzcG9uc2VUeXBlKSB7XG4gICAgeGhyLnJlc3BvbnNlVHlwZSA9IHRoaXMuX3Jlc3BvbnNlVHlwZTtcbiAgfVxuXG4gIC8vIHNlbmQgc3R1ZmZcbiAgdGhpcy5lbWl0KCdyZXF1ZXN0JywgdGhpcyk7XG5cbiAgLy8gSUUxMSB4aHIuc2VuZCh1bmRlZmluZWQpIHNlbmRzICd1bmRlZmluZWQnIHN0cmluZyBhcyBQT1NUIHBheWxvYWQgKGluc3RlYWQgb2Ygbm90aGluZylcbiAgLy8gV2UgbmVlZCBudWxsIGhlcmUgaWYgZGF0YSBpcyB1bmRlZmluZWRcbiAgeGhyLnNlbmQodHlwZW9mIGRhdGEgIT09ICd1bmRlZmluZWQnID8gZGF0YSA6IG51bGwpO1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBFeHBvc2UgYFJlcXVlc3RgLlxuICovXG5cbnJlcXVlc3QuUmVxdWVzdCA9IFJlcXVlc3Q7XG5cbi8qKlxuICogR0VUIGB1cmxgIHdpdGggb3B0aW9uYWwgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR8RnVuY3Rpb259IGRhdGEgb3IgZm5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LmdldCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnR0VUJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEucXVlcnkoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIEhFQUQgYHVybGAgd2l0aCBvcHRpb25hbCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZHxGdW5jdGlvbn0gZGF0YSBvciBmblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QuaGVhZCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnSEVBRCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIERFTEVURSBgdXJsYCB3aXRoIG9wdGlvbmFsIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVsKHVybCwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnREVMRVRFJywgdXJsKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG5cbnJlcXVlc3RbJ2RlbCddID0gZGVsO1xucmVxdWVzdFsnZGVsZXRlJ10gPSBkZWw7XG5cbi8qKlxuICogUEFUQ0ggYHVybGAgd2l0aCBvcHRpb25hbCBgZGF0YWAgYW5kIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfSBkYXRhXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5wYXRjaCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnUEFUQ0gnLCB1cmwpO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgZGF0YSkgZm4gPSBkYXRhLCBkYXRhID0gbnVsbDtcbiAgaWYgKGRhdGEpIHJlcS5zZW5kKGRhdGEpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcblxuLyoqXG4gKiBQT1NUIGB1cmxgIHdpdGggb3B0aW9uYWwgYGRhdGFgIGFuZCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZH0gZGF0YVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QucG9zdCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnUE9TVCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIFBVVCBgdXJsYCB3aXRoIG9wdGlvbmFsIGBkYXRhYCBhbmQgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR8RnVuY3Rpb259IGRhdGEgb3IgZm5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LnB1dCA9IGZ1bmN0aW9uKHVybCwgZGF0YSwgZm4pe1xuICB2YXIgcmVxID0gcmVxdWVzdCgnUFVUJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEuc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG4iLCIvKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGFuIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNPYmplY3Qob2JqKSB7XG4gIHJldHVybiBudWxsICE9IG9iaiAmJiAnb2JqZWN0JyA9PSB0eXBlb2Ygb2JqO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzT2JqZWN0O1xuIiwiLyoqXG4gKiBNb2R1bGUgb2YgbWl4ZWQtaW4gZnVuY3Rpb25zIHNoYXJlZCBiZXR3ZWVuIG5vZGUgYW5kIGNsaWVudCBjb2RlXG4gKi9cbnZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXMtb2JqZWN0Jyk7XG5cbi8qKlxuICogQ2xlYXIgcHJldmlvdXMgdGltZW91dC5cbiAqXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5jbGVhclRpbWVvdXQgPSBmdW5jdGlvbiBfY2xlYXJUaW1lb3V0KCl7XG4gIHRoaXMuX3RpbWVvdXQgPSAwO1xuICBjbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRm9yY2UgZ2l2ZW4gcGFyc2VyXG4gKlxuICogU2V0cyB0aGUgYm9keSBwYXJzZXIgbm8gbWF0dGVyIHR5cGUuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uIHBhcnNlKGZuKXtcbiAgdGhpcy5fcGFyc2VyID0gZm47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGltZW91dCB0byBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMudGltZW91dCA9IGZ1bmN0aW9uIHRpbWVvdXQobXMpe1xuICB0aGlzLl90aW1lb3V0ID0gbXM7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBGYXV4IHByb21pc2Ugc3VwcG9ydFxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bGZpbGxcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJlamVjdFxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqL1xuXG5leHBvcnRzLnRoZW4gPSBmdW5jdGlvbiB0aGVuKGZ1bGZpbGwsIHJlamVjdCkge1xuICByZXR1cm4gdGhpcy5lbmQoZnVuY3Rpb24oZXJyLCByZXMpIHtcbiAgICBlcnIgPyByZWplY3QoZXJyKSA6IGZ1bGZpbGwocmVzKTtcbiAgfSk7XG59XG5cbi8qKlxuICogQWxsb3cgZm9yIGV4dGVuc2lvblxuICovXG5cbmV4cG9ydHMudXNlID0gZnVuY3Rpb24gdXNlKGZuKSB7XG4gIGZuKHRoaXMpO1xuICByZXR1cm4gdGhpcztcbn1cblxuXG4vKipcbiAqIEdldCByZXF1ZXN0IGhlYWRlciBgZmllbGRgLlxuICogQ2FzZS1pbnNlbnNpdGl2ZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbihmaWVsZCl7XG4gIHJldHVybiB0aGlzLl9oZWFkZXJbZmllbGQudG9Mb3dlckNhc2UoKV07XG59O1xuXG4vKipcbiAqIEdldCBjYXNlLWluc2Vuc2l0aXZlIGhlYWRlciBgZmllbGRgIHZhbHVlLlxuICogVGhpcyBpcyBhIGRlcHJlY2F0ZWQgaW50ZXJuYWwgQVBJLiBVc2UgYC5nZXQoZmllbGQpYCBpbnN0ZWFkLlxuICpcbiAqIChnZXRIZWFkZXIgaXMgbm8gbG9uZ2VyIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgc3VwZXJhZ2VudCBjb2RlIGJhc2UpXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqIEBkZXByZWNhdGVkXG4gKi9cblxuZXhwb3J0cy5nZXRIZWFkZXIgPSBleHBvcnRzLmdldDtcblxuLyoqXG4gKiBTZXQgaGVhZGVyIGBmaWVsZGAgdG8gYHZhbGAsIG9yIG11bHRpcGxlIGZpZWxkcyB3aXRoIG9uZSBvYmplY3QuXG4gKiBDYXNlLWluc2Vuc2l0aXZlLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgcmVxLmdldCgnLycpXG4gKiAgICAgICAgLnNldCgnQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKVxuICogICAgICAgIC5zZXQoJ1gtQVBJLUtleScsICdmb29iYXInKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqICAgICAgcmVxLmdldCgnLycpXG4gKiAgICAgICAgLnNldCh7IEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nLCAnWC1BUEktS2V5JzogJ2Zvb2JhcicgfSlcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IGZpZWxkXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy5zZXQgPSBmdW5jdGlvbihmaWVsZCwgdmFsKXtcbiAgaWYgKGlzT2JqZWN0KGZpZWxkKSkge1xuICAgIGZvciAodmFyIGtleSBpbiBmaWVsZCkge1xuICAgICAgdGhpcy5zZXQoa2V5LCBmaWVsZFtrZXldKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbiAgdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldID0gdmFsO1xuICB0aGlzLmhlYWRlcltmaWVsZF0gPSB2YWw7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgaGVhZGVyIGBmaWVsZGAuXG4gKiBDYXNlLWluc2Vuc2l0aXZlLlxuICpcbiAqIEV4YW1wbGU6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAudW5zZXQoJ1VzZXItQWdlbnQnKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICovXG5leHBvcnRzLnVuc2V0ID0gZnVuY3Rpb24oZmllbGQpe1xuICBkZWxldGUgdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xuICBkZWxldGUgdGhpcy5oZWFkZXJbZmllbGRdO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogV3JpdGUgdGhlIGZpZWxkIGBuYW1lYCBhbmQgYHZhbGAgZm9yIFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiXG4gKiByZXF1ZXN0IGJvZGllcy5cbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnL3VwbG9hZCcpXG4gKiAgIC5maWVsZCgnZm9vJywgJ2JhcicpXG4gKiAgIC5lbmQoY2FsbGJhY2spO1xuICogYGBgXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfEJsb2J8RmlsZXxCdWZmZXJ8ZnMuUmVhZFN0cmVhbX0gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cbmV4cG9ydHMuZmllbGQgPSBmdW5jdGlvbihuYW1lLCB2YWwpIHtcbiAgdGhpcy5fZ2V0Rm9ybURhdGEoKS5hcHBlbmQobmFtZSwgdmFsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuIiwiLy8gVGhlIG5vZGUgYW5kIGJyb3dzZXIgbW9kdWxlcyBleHBvc2UgdmVyc2lvbnMgb2YgdGhpcyB3aXRoIHRoZVxuLy8gYXBwcm9wcmlhdGUgY29uc3RydWN0b3IgZnVuY3Rpb24gYm91bmQgYXMgZmlyc3QgYXJndW1lbnRcbi8qKlxuICogSXNzdWUgYSByZXF1ZXN0OlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgIHJlcXVlc3QoJ0dFVCcsICcvdXNlcnMnKS5lbmQoY2FsbGJhY2spXG4gKiAgICByZXF1ZXN0KCcvdXNlcnMnKS5lbmQoY2FsbGJhY2spXG4gKiAgICByZXF1ZXN0KCcvdXNlcnMnLCBjYWxsYmFjaylcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ3xGdW5jdGlvbn0gdXJsIG9yIGNhbGxiYWNrXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiByZXF1ZXN0KFJlcXVlc3RDb25zdHJ1Y3RvciwgbWV0aG9kLCB1cmwpIHtcbiAgLy8gY2FsbGJhY2tcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIHVybCkge1xuICAgIHJldHVybiBuZXcgUmVxdWVzdENvbnN0cnVjdG9yKCdHRVQnLCBtZXRob2QpLmVuZCh1cmwpO1xuICB9XG5cbiAgLy8gdXJsIGZpcnN0XG4gIGlmICgyID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gbmV3IFJlcXVlc3RDb25zdHJ1Y3RvcignR0VUJywgbWV0aG9kKTtcbiAgfVxuXG4gIHJldHVybiBuZXcgUmVxdWVzdENvbnN0cnVjdG9yKG1ldGhvZCwgdXJsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZXF1ZXN0O1xuIiwiXHJcbi8qKlxyXG4gKiBFeHBvc2UgYEVtaXR0ZXJgLlxyXG4gKi9cclxuXHJcbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xyXG4gIG1vZHVsZS5leHBvcnRzID0gRW1pdHRlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIEluaXRpYWxpemUgYSBuZXcgYEVtaXR0ZXJgLlxyXG4gKlxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbmZ1bmN0aW9uIEVtaXR0ZXIob2JqKSB7XHJcbiAgaWYgKG9iaikgcmV0dXJuIG1peGluKG9iaik7XHJcbn07XHJcblxyXG4vKipcclxuICogTWl4aW4gdGhlIGVtaXR0ZXIgcHJvcGVydGllcy5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9ialxyXG4gKiBAcmV0dXJuIHtPYmplY3R9XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmZ1bmN0aW9uIG1peGluKG9iaikge1xyXG4gIGZvciAodmFyIGtleSBpbiBFbWl0dGVyLnByb3RvdHlwZSkge1xyXG4gICAgb2JqW2tleV0gPSBFbWl0dGVyLnByb3RvdHlwZVtrZXldO1xyXG4gIH1cclxuICByZXR1cm4gb2JqO1xyXG59XHJcblxyXG4vKipcclxuICogTGlzdGVuIG9uIHRoZSBnaXZlbiBgZXZlbnRgIHdpdGggYGZuYC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXHJcbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUub24gPVxyXG5FbWl0dGVyLnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcclxuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XHJcbiAgKHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gPSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdIHx8IFtdKVxyXG4gICAgLnB1c2goZm4pO1xyXG4gIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEFkZHMgYW4gYGV2ZW50YCBsaXN0ZW5lciB0aGF0IHdpbGwgYmUgaW52b2tlZCBhIHNpbmdsZVxyXG4gKiB0aW1lIHRoZW4gYXV0b21hdGljYWxseSByZW1vdmVkLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cclxuICogQHJldHVybiB7RW1pdHRlcn1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcclxuICBmdW5jdGlvbiBvbigpIHtcclxuICAgIHRoaXMub2ZmKGV2ZW50LCBvbik7XHJcbiAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gIH1cclxuXHJcbiAgb24uZm4gPSBmbjtcclxuICB0aGlzLm9uKGV2ZW50LCBvbik7XHJcbiAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogUmVtb3ZlIHRoZSBnaXZlbiBjYWxsYmFjayBmb3IgYGV2ZW50YCBvciBhbGxcclxuICogcmVnaXN0ZXJlZCBjYWxsYmFja3MuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxyXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLm9mZiA9XHJcbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID1cclxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID1cclxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XHJcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xyXG5cclxuICAvLyBhbGxcclxuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XHJcbiAgICB0aGlzLl9jYWxsYmFja3MgPSB7fTtcclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxuXHJcbiAgLy8gc3BlY2lmaWMgZXZlbnRcclxuICB2YXIgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XTtcclxuICBpZiAoIWNhbGxiYWNrcykgcmV0dXJuIHRoaXM7XHJcblxyXG4gIC8vIHJlbW92ZSBhbGwgaGFuZGxlcnNcclxuICBpZiAoMSA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XHJcbiAgICBkZWxldGUgdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XTtcclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxuXHJcbiAgLy8gcmVtb3ZlIHNwZWNpZmljIGhhbmRsZXJcclxuICB2YXIgY2I7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcclxuICAgIGNiID0gY2FsbGJhY2tzW2ldO1xyXG4gICAgaWYgKGNiID09PSBmbiB8fCBjYi5mbiA9PT0gZm4pIHtcclxuICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVtaXQgYGV2ZW50YCB3aXRoIHRoZSBnaXZlbiBhcmdzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHBhcmFtIHtNaXhlZH0gLi4uXHJcbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKGV2ZW50KXtcclxuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XHJcbiAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSlcclxuICAgICwgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XTtcclxuXHJcbiAgaWYgKGNhbGxiYWNrcykge1xyXG4gICAgY2FsbGJhY2tzID0gY2FsbGJhY2tzLnNsaWNlKDApO1xyXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGNhbGxiYWNrcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xyXG4gICAgICBjYWxsYmFja3NbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm4gYXJyYXkgb2YgY2FsbGJhY2tzIGZvciBgZXZlbnRgLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHJldHVybiB7QXJyYXl9XHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24oZXZlbnQpe1xyXG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcclxuICByZXR1cm4gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSB8fCBbXTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDaGVjayBpZiB0aGlzIGVtaXR0ZXIgaGFzIGBldmVudGAgaGFuZGxlcnMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcmV0dXJuIHtCb29sZWFufVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLmhhc0xpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcclxuICByZXR1cm4gISEgdGhpcy5saXN0ZW5lcnMoZXZlbnQpLmxlbmd0aDtcclxufTtcclxuIiwiXG4vKipcbiAqIFJlZHVjZSBgYXJyYCB3aXRoIGBmbmAuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHBhcmFtIHtNaXhlZH0gaW5pdGlhbFxuICpcbiAqIFRPRE86IGNvbWJhdGlibGUgZXJyb3IgaGFuZGxpbmc/XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihhcnIsIGZuLCBpbml0aWFsKXsgIFxuICB2YXIgaWR4ID0gMDtcbiAgdmFyIGxlbiA9IGFyci5sZW5ndGg7XG4gIHZhciBjdXJyID0gYXJndW1lbnRzLmxlbmd0aCA9PSAzXG4gICAgPyBpbml0aWFsXG4gICAgOiBhcnJbaWR4KytdO1xuXG4gIHdoaWxlIChpZHggPCBsZW4pIHtcbiAgICBjdXJyID0gZm4uY2FsbChudWxsLCBjdXJyLCBhcnJbaWR4XSwgKytpZHgsIGFycik7XG4gIH1cbiAgXG4gIHJldHVybiBjdXJyO1xufTsiLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJBbmFseXRpY3MgPSBudWxsO1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmFuYWx5dGljcycsIFsnaW9uaWMnXSlcblxuICAudmFsdWUoJ0lPTklDX0FOQUxZVElDU19WRVJTSU9OJywgSW9uaWMuQW5hbHl0aWNzLnZlcnNpb24pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0FuYWx5dGljcycsIFtmdW5jdGlvbigpIHtcbiAgICBpZiAoIUlvbmljQW5ndWxhckFuYWx5dGljcykge1xuICAgICAgSW9uaWNBbmd1bGFyQW5hbHl0aWNzID0gbmV3IElvbmljLkFuYWx5dGljcyhcIkRFRkVSX1JFR0lTVEVSXCIpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyQW5hbHl0aWNzO1xuICB9XSlcblxuICAuZmFjdG9yeSgnZG9tU2VyaWFsaXplcicsIFtmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IElvbmljLkFuYWx5dGljU2VyaWFsaXplcnMuRE9NU2VyaWFsaXplcigpO1xuICB9XSlcblxuICAucnVuKFsnJGlvbmljQW5hbHl0aWNzJywgJyRzdGF0ZScsIGZ1bmN0aW9uKCRpb25pY0FuYWx5dGljcywgJHN0YXRlKSB7XG4gICAgJGlvbmljQW5hbHl0aWNzLnNldEdsb2JhbFByb3BlcnRpZXMoZnVuY3Rpb24oZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpIHtcbiAgICAgIGlmICghZXZlbnREYXRhLl91aSkge1xuICAgICAgICBldmVudERhdGEuX3VpID0ge307XG4gICAgICB9XG4gICAgICBldmVudERhdGEuX3VpLmFjdGl2ZV9zdGF0ZSA9ICRzdGF0ZS5jdXJyZW50Lm5hbWU7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICB9KTtcbiAgfV0pO1xuXG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuYW5hbHl0aWNzJylcblxuICAucHJvdmlkZXIoJyRpb25pY0F1dG9UcmFjaycsW2Z1bmN0aW9uKCkge1xuXG4gICAgdmFyIHRyYWNrZXJzRGlzYWJsZWQgPSB7fSxcbiAgICAgIGFsbFRyYWNrZXJzRGlzYWJsZWQgPSBmYWxzZTtcblxuICAgIHRoaXMuZGlzYWJsZVRyYWNraW5nID0gZnVuY3Rpb24odHJhY2tlcikge1xuICAgICAgaWYgKHRyYWNrZXIpIHtcbiAgICAgICAgdHJhY2tlcnNEaXNhYmxlZFt0cmFja2VyXSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhbGxUcmFja2Vyc0Rpc2FibGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdGhpcy4kZ2V0ID0gW2Z1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgXCJpc0VuYWJsZWRcIjogZnVuY3Rpb24odHJhY2tlcikge1xuICAgICAgICAgIHJldHVybiAhYWxsVHJhY2tlcnNEaXNhYmxlZCAmJiAhdHJhY2tlcnNEaXNhYmxlZFt0cmFja2VyXTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV0pXG5cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBBdXRvIHRyYWNrZXJzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblxuICAucnVuKFsnJGlvbmljQXV0b1RyYWNrJywgJyRpb25pY0FuYWx5dGljcycsIGZ1bmN0aW9uKCRpb25pY0F1dG9UcmFjaywgJGlvbmljQW5hbHl0aWNzKSB7XG4gICAgaWYgKCEkaW9uaWNBdXRvVHJhY2suaXNFbmFibGVkKCdMb2FkJykpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKCdMb2FkJyk7XG4gIH1dKVxuXG4gIC5ydW4oW1xuICAgICckaW9uaWNBdXRvVHJhY2snLFxuICAgICckZG9jdW1lbnQnLFxuICAgICckaW9uaWNBbmFseXRpY3MnLFxuICAgICdkb21TZXJpYWxpemVyJyxcbiAgICBmdW5jdGlvbigkaW9uaWNBdXRvVHJhY2ssICRkb2N1bWVudCwgJGlvbmljQW5hbHl0aWNzLCBkb21TZXJpYWxpemVyKSB7XG4gICAgICBpZiAoISRpb25pY0F1dG9UcmFjay5pc0VuYWJsZWQoJ1RhcCcpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgJGRvY3VtZW50Lm9uKCdjbGljaycsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIC8vIHdhbnQgY29vcmRpbmF0ZXMgYXMgYSBwZXJjZW50YWdlIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgZWxlbWVudFxuICAgICAgICB2YXIgYm94ID0gZXZlbnQudGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuICAgICAgICAgIHdpZHRoID0gYm94LnJpZ2h0IC0gYm94LmxlZnQsXG4gICAgICAgICAgaGVpZ2h0ID0gYm94LmJvdHRvbSAtIGJveC50b3AsXG4gICAgICAgICAgbm9ybVggPSAoZXZlbnQucGFnZVggLSBib3gubGVmdCkgLyB3aWR0aCxcbiAgICAgICAgICBub3JtWSA9IChldmVudC5wYWdlWSAtIGJveC50b3ApIC8gaGVpZ2h0O1xuXG4gICAgICAgIHZhciBldmVudERhdGEgPSB7XG4gICAgICAgICAgXCJjb29yZGluYXRlc1wiOiB7XG4gICAgICAgICAgICBcInhcIjogZXZlbnQucGFnZVgsXG4gICAgICAgICAgICBcInlcIjogZXZlbnQucGFnZVlcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidGFyZ2V0XCI6IGRvbVNlcmlhbGl6ZXIuZWxlbWVudFNlbGVjdG9yKGV2ZW50LnRhcmdldCksXG4gICAgICAgICAgXCJ0YXJnZXRfaWRlbnRpZmllclwiOiBkb21TZXJpYWxpemVyLmVsZW1lbnROYW1lKGV2ZW50LnRhcmdldClcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaXNGaW5pdGUobm9ybVgpICYmIGlzRmluaXRlKG5vcm1ZKSkge1xuICAgICAgICAgIGV2ZW50RGF0YS5jb29yZGluYXRlcy54X25vcm0gPSBub3JtWDsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgIGV2ZW50RGF0YS5jb29yZGluYXRlcy55X25vcm0gPSBub3JtWTsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICB9XG5cbiAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKCdUYXAnLCB7XG4gICAgICAgICAgXCJfdWlcIjogZXZlbnREYXRhXG4gICAgICAgIH0pO1xuXG4gICAgICB9KTtcbiAgICB9XG4gIF0pXG5cbiAgLnJ1bihbXG4gICAgJyRpb25pY0F1dG9UcmFjaycsXG4gICAgJyRpb25pY0FuYWx5dGljcycsXG4gICAgJyRyb290U2NvcGUnLFxuICAgIGZ1bmN0aW9uKCRpb25pY0F1dG9UcmFjaywgJGlvbmljQW5hbHl0aWNzLCAkcm9vdFNjb3BlKSB7XG4gICAgICBpZiAoISRpb25pY0F1dG9UcmFjay5pc0VuYWJsZWQoJ1N0YXRlIENoYW5nZScpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN1Y2Nlc3MnLCBmdW5jdGlvbihldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMsIGZyb21TdGF0ZSwgZnJvbVBhcmFtcykgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgICAgICRpb25pY0FuYWx5dGljcy50cmFjaygnU3RhdGUgQ2hhbmdlJywge1xuICAgICAgICAgIFwiZnJvbVwiOiBmcm9tU3RhdGUubmFtZSxcbiAgICAgICAgICBcInRvXCI6IHRvU3RhdGUubmFtZVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgXSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBpb24tdHJhY2stJEVWRU5UXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAgICogQG5hbWUgaW9uVHJhY2tDbGlja1xuICAgKiBAbW9kdWxlIGlvbmljLnNlcnZpY2UuYW5hbHl0aWNzXG4gICAqIEByZXN0cmljdCBBXG4gICAqIEBwYXJlbnQgaW9uaWMuZGlyZWN0aXZlOmlvblRyYWNrQ2xpY2tcbiAgICpcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqXG4gICAqIEEgY29udmVuaWVudCBkaXJlY3RpdmUgdG8gYXV0b21hdGljYWxseSB0cmFjayBhIGNsaWNrL3RhcCBvbiBhIGJ1dHRvblxuICAgKiBvciBvdGhlciB0YXBwYWJsZSBlbGVtZW50LlxuICAgKlxuICAgKiBAdXNhZ2VcbiAgICogYGBgaHRtbFxuICAgKiA8YnV0dG9uIGNsYXNzPVwiYnV0dG9uIGJ1dHRvbi1jbGVhclwiIGlvbi10cmFjay1jbGljayBpb24tdHJhY2stZXZlbnQ9XCJjdGEtdGFwXCI+VHJ5IG5vdyE8L2J1dHRvbj5cbiAgICogYGBgXG4gICAqL1xuXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrQ2xpY2snLCBpb25UcmFja0RpcmVjdGl2ZSgnY2xpY2snKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tUYXAnLCBpb25UcmFja0RpcmVjdGl2ZSgndGFwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRG91YmxldGFwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RvdWJsZXRhcCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0hvbGQnLCBpb25UcmFja0RpcmVjdGl2ZSgnaG9sZCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1JlbGVhc2UnLCBpb25UcmFja0RpcmVjdGl2ZSgncmVsZWFzZScpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWcnLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZycpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdMZWZ0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWdsZWZ0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZ1JpZ2h0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWdyaWdodCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdVcCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFndXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnRG93bicsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFnZG93bicpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1N3aXBlTGVmdCcsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZWxlZnQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZVJpZ2h0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBlcmlnaHQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZVVwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBldXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZURvd24nLCBpb25UcmFja0RpcmVjdGl2ZSgnc3dpcGVkb3duJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrVHJhbnNmb3JtJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2hvbGQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tQaW5jaCcsIGlvblRyYWNrRGlyZWN0aXZlKCdwaW5jaCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1BpbmNoSW4nLCBpb25UcmFja0RpcmVjdGl2ZSgncGluY2hpbicpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1BpbmNoT3V0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ3BpbmNob3V0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUm90YXRlJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3JvdGF0ZScpKTtcblxuICAvKipcbiAgICogR2VuZXJpYyBkaXJlY3RpdmUgdG8gY3JlYXRlIGF1dG8gZXZlbnQgaGFuZGxpbmcgYW5hbHl0aWNzIGRpcmVjdGl2ZXMgbGlrZTpcbiAgICpcbiAgICogPGJ1dHRvbiBpb24tdHJhY2stY2xpY2s9XCJldmVudE5hbWVcIj5DbGljayBUcmFjazwvYnV0dG9uPlxuICAgKiA8YnV0dG9uIGlvbi10cmFjay1ob2xkPVwiZXZlbnROYW1lXCI+SG9sZCBUcmFjazwvYnV0dG9uPlxuICAgKiA8YnV0dG9uIGlvbi10cmFjay10YXA9XCJldmVudE5hbWVcIj5UYXAgVHJhY2s8L2J1dHRvbj5cbiAgICogPGJ1dHRvbiBpb24tdHJhY2stZG91YmxldGFwPVwiZXZlbnROYW1lXCI+RG91YmxlIFRhcCBUcmFjazwvYnV0dG9uPlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZG9tRXZlbnROYW1lIFRoZSBET00gZXZlbnQgbmFtZVxuICAgKiBAcmV0dXJuIHthcnJheX0gQW5ndWxhciBEaXJlY3RpdmUgZGVjbGFyYXRpb25cbiAgICovXG4gIGZ1bmN0aW9uIGlvblRyYWNrRGlyZWN0aXZlKGRvbUV2ZW50TmFtZSkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgcmV0dXJuIFsnJGlvbmljQW5hbHl0aWNzJywgJyRpb25pY0dlc3R1cmUnLCBmdW5jdGlvbigkaW9uaWNBbmFseXRpY3MsICRpb25pY0dlc3R1cmUpIHtcblxuICAgICAgdmFyIGdlc3R1cmVEcml2ZW4gPSBbXG4gICAgICAgICdkcmFnJywgJ2RyYWdzdGFydCcsICdkcmFnZW5kJywgJ2RyYWdsZWZ0JywgJ2RyYWdyaWdodCcsICdkcmFndXAnLCAnZHJhZ2Rvd24nLFxuICAgICAgICAnc3dpcGUnLCAnc3dpcGVsZWZ0JywgJ3N3aXBlcmlnaHQnLCAnc3dpcGV1cCcsICdzd2lwZWRvd24nLFxuICAgICAgICAndGFwJywgJ2RvdWJsZXRhcCcsICdob2xkJyxcbiAgICAgICAgJ3RyYW5zZm9ybScsICdwaW5jaCcsICdwaW5jaGluJywgJ3BpbmNob3V0JywgJ3JvdGF0ZSdcbiAgICAgIF07XG4gICAgICAvLyBDaGVjayBpZiB3ZSBuZWVkIHRvIHVzZSB0aGUgZ2VzdHVyZSBzdWJzeXN0ZW0gb3IgdGhlIERPTSBzeXN0ZW1cbiAgICAgIHZhciBpc0dlc3R1cmVEcml2ZW4gPSBmYWxzZTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ2VzdHVyZURyaXZlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZ2VzdHVyZURyaXZlbltpXSA9PT0gZG9tRXZlbnROYW1lLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICBpc0dlc3R1cmVEcml2ZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBcInJlc3RyaWN0XCI6ICdBJyxcbiAgICAgICAgXCJsaW5rXCI6IGZ1bmN0aW9uKCRzY29wZSwgJGVsZW1lbnQsICRhdHRyKSB7XG4gICAgICAgICAgdmFyIGNhcGl0YWxpemVkID0gZG9tRXZlbnROYW1lWzBdLnRvVXBwZXJDYXNlKCkgKyBkb21FdmVudE5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgLy8gR3JhYiBldmVudCBuYW1lIHdlIHdpbGwgc2VuZFxuICAgICAgICAgIHZhciBldmVudE5hbWUgPSAkYXR0clsnaW9uVHJhY2snICsgY2FwaXRhbGl6ZWRdO1xuXG4gICAgICAgICAgaWYgKGlzR2VzdHVyZURyaXZlbikge1xuICAgICAgICAgICAgdmFyIGdlc3R1cmUgPSAkaW9uaWNHZXN0dXJlLm9uKGRvbUV2ZW50TmFtZSwgaGFuZGxlciwgJGVsZW1lbnQpO1xuICAgICAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgJGlvbmljR2VzdHVyZS5vZmYoZ2VzdHVyZSwgZG9tRXZlbnROYW1lLCBoYW5kbGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkZWxlbWVudC5vbihkb21FdmVudE5hbWUsIGhhbmRsZXIpO1xuICAgICAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgJGVsZW1lbnQub2ZmKGRvbUV2ZW50TmFtZSwgaGFuZGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cblxuICAgICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoZSkge1xuICAgICAgICAgICAgdmFyIGV2ZW50RGF0YSA9ICRzY29wZS4kZXZhbCgkYXR0ci5pb25UcmFja0RhdGEpIHx8IHt9O1xuICAgICAgICAgICAgaWYgKGV2ZW50TmFtZSkge1xuICAgICAgICAgICAgICAkaW9uaWNBbmFseXRpY3MudHJhY2soZXZlbnROYW1lLCBldmVudERhdGEpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrQ2xpY2soZS5wYWdlWCwgZS5wYWdlWSwgZS50YXJnZXQsIHtcbiAgICAgICAgICAgICAgICBcImRhdGFcIjogZXZlbnREYXRhXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfVxuXG59XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJBdXRoID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5hdXRoJywgW10pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0F1dGgnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJBdXRoKSB7XG4gICAgICBJb25pY0FuZ3VsYXJBdXRoID0gSW9uaWMuQXV0aDtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhckF1dGg7XG4gIH1dKTtcbn1cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmNvcmUnLCBbXSlcblxuICAvKipcbiAgICogQHByaXZhdGVcbiAgICogUHJvdmlkZXMgYSBzYWZlIGludGVyZmFjZSB0byBzdG9yZSBvYmplY3RzIGluIHBlcnNpc3RlbnQgbWVtb3J5XG4gICAqL1xuICAucHJvdmlkZXIoJ3BlcnNpc3RlbnRTdG9yYWdlJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICckZ2V0JzogW2Z1bmN0aW9uKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IElvbmljLmdldFNlcnZpY2UoJ1N0b3JhZ2UnKTtcbiAgICAgICAgaWYgKCFzdG9yYWdlKSB7XG4gICAgICAgICAgc3RvcmFnZSA9IG5ldyBJb25pYy5JTy5TdG9yYWdlKCk7XG4gICAgICAgICAgSW9uaWMuYWRkU2VydmljZSgnU3RvcmFnZScsIHN0b3JhZ2UsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdG9yYWdlO1xuICAgICAgfV1cbiAgICB9O1xuICB9KVxuXG4gIC5mYWN0b3J5KCckaW9uaWNDb3JlJywgW1xuICAgIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIElvbmljLkNvcmU7XG4gICAgfVxuICBdKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNDb3JlU2V0dGluZ3MnLCBbXG4gICAgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gSW9uaWMuSU8uQ29uZmlnO1xuICAgIH1cbiAgXSlcblxuICAuZmFjdG9yeSgnJGlvbmljVXNlcicsIFtcbiAgICBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBJb25pYy5Vc2VyO1xuICAgIH1cbiAgXSlcblxuICAucnVuKFtmdW5jdGlvbigpIHtcbiAgICBJb25pYy5pbygpO1xuICB9XSk7XG59XG5cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG5cbiAgdmFyIElvbmljQW5ndWxhckRlcGxveSA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuZGVwbG95JywgW10pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0RlcGxveScsIFtmdW5jdGlvbigpIHtcbiAgICBpZiAoIUlvbmljQW5ndWxhckRlcGxveSkge1xuICAgICAgSW9uaWNBbmd1bGFyRGVwbG95ID0gbmV3IElvbmljLkRlcGxveSgpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyRGVwbG95O1xuICB9XSk7XG59XG4iLCJ2YXIgQW5hbHl0aWNzID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvYW5hbHl0aWNzL2FuYWx5dGljc1wiKS5BbmFseXRpY3M7XG52YXIgQXBwID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9hcHBcIikuQXBwO1xudmFyIEF1dGggPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9hdXRoL2F1dGhcIikuQXV0aDtcbnZhciBCdWNrZXRTdG9yYWdlID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvYW5hbHl0aWNzL3N0b3JhZ2VcIikuQnVja2V0U3RvcmFnZTtcbnZhciBjb25maWcgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL2NvbmZpZ1wiKS5jb25maWc7XG52YXIgRE9NU2VyaWFsaXplciA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2FuYWx5dGljcy9zZXJpYWxpemVyc1wiKS5ET01TZXJpYWxpemVyO1xudmFyIERhdGFUeXBlID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9kYXRhLXR5cGVzXCIpLkRhdGFUeXBlO1xudmFyIERlcGxveSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2RlcGxveS9kZXBsb3lcIikuRGVwbG95O1xudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvZXZlbnRzXCIpLkV2ZW50RW1pdHRlcjtcbnZhciBJb25pY1BsYXRmb3JtID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9jb3JlXCIpLklvbmljUGxhdGZvcm07XG52YXIgTG9nZ2VyID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9sb2dnZXJcIikuTG9nZ2VyO1xudmFyIFB1c2ggPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9wdXNoL3B1c2hcIikuUHVzaDtcbnZhciBQdXNoTWVzc2FnZSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L3B1c2gvcHVzaC1tZXNzYWdlXCIpLlB1c2hNZXNzYWdlO1xudmFyIFB1c2hUb2tlbiA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L3B1c2gvcHVzaC10b2tlblwiKS5QdXNoVG9rZW47XG52YXIgU3RvcmFnZSA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvc3RvcmFnZVwiKS5TdG9yYWdlO1xudmFyIFVzZXIgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL3VzZXJcIikuVXNlcjtcbnZhciBwcm9taXNlID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9wcm9taXNlXCIpO1xuXG4vLyBEZWNsYXJlIHRoZSB3aW5kb3cgb2JqZWN0XG53aW5kb3cuSW9uaWMgPSB3aW5kb3cuSW9uaWMgfHwge307XG5cbi8vIElvbmljIE1vZHVsZXNcbklvbmljLkNvcmUgPSBJb25pY1BsYXRmb3JtO1xuSW9uaWMuVXNlciA9IFVzZXI7XG5Jb25pYy5BbmFseXRpY3MgPSBBbmFseXRpY3M7XG5Jb25pYy5BdXRoID0gQXV0aDtcbklvbmljLkRlcGxveSA9IERlcGxveTtcbklvbmljLlB1c2ggPSBQdXNoO1xuSW9uaWMuUHVzaFRva2VuID0gUHVzaFRva2VuO1xuSW9uaWMuUHVzaE1lc3NhZ2UgPSBQdXNoTWVzc2FnZTtcblxuLy8gRGF0YVR5cGUgTmFtZXNwYWNlXG5Jb25pYy5EYXRhVHlwZSA9IERhdGFUeXBlO1xuSW9uaWMuRGF0YVR5cGVzID0gRGF0YVR5cGUuZ2V0TWFwcGluZygpO1xuXG4vLyBJTyBOYW1lc3BhY2VcbklvbmljLklPID0ge307XG5Jb25pYy5JTy5BcHAgPSBBcHA7XG5Jb25pYy5JTy5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5Jb25pYy5JTy5Mb2dnZXIgPSBMb2dnZXI7XG5Jb25pYy5JTy5Qcm9taXNlID0gcHJvbWlzZS5Qcm9taXNlO1xuSW9uaWMuSU8uRGVmZXJyZWRQcm9taXNlID0gcHJvbWlzZS5EZWZlcnJlZFByb21pc2U7XG5Jb25pYy5JTy5TdG9yYWdlID0gU3RvcmFnZTtcbklvbmljLklPLkNvbmZpZyA9IGNvbmZpZztcbklvbmljLklPLlNldHRpbmdzID0gZnVuY3Rpb24oKSB7IHJldHVybiBjb25maWc7IH07XG5cbi8vIEFuYWx5dGljIFN0b3JhZ2UgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1N0b3JhZ2UgPSB7fTtcbklvbmljLkFuYWx5dGljU3RvcmFnZS5CdWNrZXRTdG9yYWdlID0gQnVja2V0U3RvcmFnZTtcblxuLy8gQW5hbHl0aWMgU2VyaWFsaXplcnMgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzID0ge307XG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzLkRPTVNlcmlhbGl6ZXIgPSBET01TZXJpYWxpemVyO1xuXG5cbi8vIFByb3ZpZGVyIGEgc2luZ2xlIHN0b3JhZ2UgZm9yIHNlcnZpY2VzIHRoYXQgaGF2ZSBwcmV2aW91c2x5IGJlZW4gcmVnaXN0ZXJlZFxudmFyIHNlcnZpY2VTdG9yYWdlID0ge307XG5cbklvbmljLmlvID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBJb25pYy5Db3JlO1xufTtcblxuSW9uaWMuZ2V0U2VydmljZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgaWYgKHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9PT0gJ3VuZGVmaW5lZCcgfHwgIXNlcnZpY2VTdG9yYWdlW25hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBzZXJ2aWNlU3RvcmFnZVtuYW1lXTtcbn07XG5cbklvbmljLmFkZFNlcnZpY2UgPSBmdW5jdGlvbihuYW1lLCBzZXJ2aWNlLCBmb3JjZSkge1xuICBpZiAoc2VydmljZSAmJiB0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgc2VydmljZVN0b3JhZ2VbbmFtZV0gPSBzZXJ2aWNlO1xuICB9IGVsc2UgaWYgKHNlcnZpY2UgJiYgZm9yY2UpIHtcbiAgICBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9IHNlcnZpY2U7XG4gIH1cbn07XG5cbklvbmljLnJlbW92ZVNlcnZpY2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGlmICh0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZGVsZXRlIHNlcnZpY2VTdG9yYWdlW25hbWVdO1xuICB9XG59O1xuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyUHVzaCA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UucHVzaCcsIFtdKVxuXG4gIC8qKlxuICAgKiBJb25pY1B1c2hBY3Rpb24gU2VydmljZVxuICAgKlxuICAgKiBBIHV0aWxpdHkgc2VydmljZSB0byBraWNrIG9mZiBtaXNjIGZlYXR1cmVzIGFzIHBhcnQgb2YgdGhlIElvbmljIFB1c2ggc2VydmljZVxuICAgKi9cbiAgLmZhY3RvcnkoJyRpb25pY1B1c2hBY3Rpb24nLCBbJyRzdGF0ZScsIGZ1bmN0aW9uKCRzdGF0ZSkge1xuXG4gICAgZnVuY3Rpb24gUHVzaEFjdGlvblNlcnZpY2UoKSB7fVxuXG4gICAgLyoqXG4gICAgICogU3RhdGUgTmF2aWdhdGlvblxuICAgICAqXG4gICAgICogQXR0ZW1wdHMgdG8gbmF2aWdhdGUgdG8gYSBuZXcgdmlldyBpZiBhIHB1c2ggbm90aWZpY2F0aW9uIHBheWxvYWQgY29udGFpbnM6XG4gICAgICpcbiAgICAgKiAgIC0gJHN0YXRlIHtTdHJpbmd9IFRoZSBzdGF0ZSBuYW1lIChlLmcgJ3RhYi5jaGF0cycpXG4gICAgICogICAtICRzdGF0ZVBhcmFtcyB7T2JqZWN0fSBQcm92aWRlZCBzdGF0ZSAodXJsKSBwYXJhbXNcbiAgICAgKlxuICAgICAqIEZpbmQgbW9yZSBpbmZvIGFib3V0IHN0YXRlIG5hdmlnYXRpb24gYW5kIHBhcmFtczpcbiAgICAgKiBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci11aS91aS1yb3V0ZXIvd2lraVxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG5vdGlmaWNhdGlvbiBOb3RpZmljYXRpb24gT2JqZWN0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoQWN0aW9uU2VydmljZS5wcm90b3R5cGUubm90aWZpY2F0aW9uTmF2aWdhdGlvbiA9IGZ1bmN0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgdmFyIHN0YXRlID0gbm90aWZpY2F0aW9uLnBheWxvYWQuJHN0YXRlIHx8IGZhbHNlO1xuICAgICAgdmFyIHN0YXRlUGFyYW1zID0gbm90aWZpY2F0aW9uLnBheWxvYWQuJHN0YXRlUGFyYW1zIHx8IHt9O1xuICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgICRzdGF0ZS5nbyhzdGF0ZSwgc3RhdGVQYXJhbXMpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IFB1c2hBY3Rpb25TZXJ2aWNlKCk7XG4gIH1dKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNQdXNoJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyUHVzaCkge1xuICAgICAgSW9uaWNBbmd1bGFyUHVzaCA9IG5ldyBJb25pYy5QdXNoKHsgJ2RlZmVySW5pdCc6IHRydWUgfSk7XG4gICAgfVxuICAgIHJldHVybiBJb25pY0FuZ3VsYXJQdXNoO1xuICB9XSlcblxuICAucnVuKFsnJGlvbmljQ29yZScsICckaW9uaWNQdXNoJywgJyRpb25pY1B1c2hBY3Rpb24nLCBmdW5jdGlvbigkaW9uaWNDb3JlLCAkaW9uaWNQdXNoLCAkaW9uaWNQdXNoQWN0aW9uKSB7XG4gICAgLy8gVGhpcyBpcyB3aGF0IGtpY2tzIG9mZiB0aGUgc3RhdGUgcmVkaXJlY3Rpb24gd2hlbiBhIHB1c2ggbm90aWZpY2FpdG9uIGhhcyB0aGUgcmVsZXZhbnQgZGV0YWlsc1xuICAgICRpb25pY0NvcmUuZW1pdHRlci5vbigncHVzaDpwcm9jZXNzTm90aWZpY2F0aW9uJywgZnVuY3Rpb24obm90aWZpY2F0aW9uKSB7XG4gICAgICBub3RpZmljYXRpb24gPSBJb25pYy5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgaWYgKG5vdGlmaWNhdGlvbiAmJiBub3RpZmljYXRpb24uYXBwKSB7XG4gICAgICAgIGlmIChub3RpZmljYXRpb24uYXBwLmFzbGVlcCA9PT0gdHJ1ZSB8fCBub3RpZmljYXRpb24uYXBwLmNsb3NlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICRpb25pY1B1c2hBY3Rpb24ubm90aWZpY2F0aW9uTmF2aWdhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgfV0pO1xufVxuIl19
