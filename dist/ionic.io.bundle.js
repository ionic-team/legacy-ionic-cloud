(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreRequest = require("../core/request");

var _corePromise = require("../core/promise");

var _coreSettings = require("../core/settings");

var _coreCore = require("../core/core");

var _coreLogger = require("../core/logger");

var _storage = require("./storage");

var _coreUser = require("../core/user");

var _utilUtil = require("../util/util");

var settings = new _coreSettings.Settings();
var ANALYTICS_KEY = null;
var DEFER_REGISTER = "DEFER_REGISTER";
var options = {};
var globalProperties = {};
var globalPropertiesFns = [];

var Analytics = (function () {
    function Analytics(config) {
        _classCallCheck(this, Analytics);

        this._dispatcher = null;
        this._dispatchIntervalTime = 30;
        this._useEventCaching = true;
        this._serviceHost = settings.getURL('analytics');
        this.logger = new _coreLogger.Logger({
            'prefix': 'Ionic Analytics:'
        });
        this.storage = _coreCore.IonicPlatformCore.getStorage();
        this.cache = new _storage.BucketStorage('ionic_analytics');
        this._addGlobalPropertyDefaults();
        if (config !== DEFER_REGISTER) {
            this.register(config);
        }
    }

    _createClass(Analytics, [{
        key: "_addGlobalPropertyDefaults",
        value: function _addGlobalPropertyDefaults() {
            var self = this;
            self.setGlobalProperties(function (eventCollection, eventData) {
                eventData._user = JSON.parse(JSON.stringify(_coreUser.User.current()));
                eventData._app = {
                    "app_id": settings.get('app_id'),
                    "analytics_version": _coreCore.IonicPlatformCore.Version
                };
            });
        }
    }, {
        key: "_enqueueEvent",
        value: function _enqueueEvent(collectionName, eventData) {
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
        }
    }, {
        key: "_requestAnalyticsKey",
        value: function _requestAnalyticsKey() {
            var requestOptions = {
                "method": 'GET',
                "json": true,
                "uri": settings.getURL('api') + '/api/v1/app/' + settings.get('app_id') + '/keys/write',
                'headers': {
                    'Authorization': "basic " + btoa(settings.get('app_id') + ':' + settings.get('api_key'))
                }
            };
            return new _coreRequest.APIRequest(requestOptions);
        }
    }, {
        key: "_postEvent",
        value: function _postEvent(name, data) {
            var self = this;
            var payload = {
                "name": [data]
            };
            if (!ANALYTICS_KEY) {
                self.logger.error('Cannot send events to the analytics server without an Analytics key.');
            }
            var requestOptions = {
                "method": 'POST',
                "url": self._serviceHost + '/api/v1/events/' + settings.get('app_id'),
                "json": payload,
                "headers": {
                    "Authorization": ANALYTICS_KEY
                }
            };
            return new _coreRequest.APIRequest(requestOptions);
        }
    }, {
        key: "_postEvents",
        value: function _postEvents(events) {
            var self = this;
            if (!ANALYTICS_KEY) {
                self.logger.info('Cannot send events to the analytics server without an Analytics key.');
            }
            var requestOptions = {
                "method": 'POST',
                "url": self._serviceHost + '/api/v1/events/' + settings.get('app_id'),
                "json": events,
                "headers": {
                    "Authorization": ANALYTICS_KEY
                }
            };
            return new _coreRequest.APIRequest(requestOptions);
        }
    }, {
        key: "_dispatchQueue",
        value: function _dispatchQueue() {
            var self = this;
            var eventQueue = this.cache.get('event_queue') || {};
            if (Object.keys(eventQueue).length === 0) {
                return;
            }
            if (!_coreCore.IonicPlatformCore.deviceConnectedToNetwork()) {
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
        }
    }, {
        key: "_getRequestStatusCode",
        value: function _getRequestStatusCode(request) {
            var responseCode = null;
            if (request && request.requestInfo._lastResponse && request.requestInfo._lastResponse.statusCode) {
                responseCode = request.requestInfo._lastResponse.statusCode;
            }
            return responseCode;
        }
    }, {
        key: "_handleDispatchError",
        value: function _handleDispatchError(error, request, eventQueue) {
            var self = this;
            var responseCode = this._getRequestStatusCode(request);
            if (error === 'last_call_interrupted') {
                self.cache.set('event_queue', {});
            } else {
                // If we didn't connect to the server at all -> keep events
                if (!responseCode) {
                    self.logger.error('Error sending analytics data: Failed to connect to analytics server.');
                } else {
                    self.cache.set('event_queue', {});
                    self.logger.error('Error sending analytics data: Server responded with error');
                    self.logger.error(eventQueue);
                }
            }
        }
    }, {
        key: "_handleRegisterError",
        value: function _handleRegisterError(error, request) {
            var self = this;
            var responseCode = this._getRequestStatusCode(request);
            var docs = ' See http://docs.ionic.io/v1.0/docs/io-quick-start';
            switch (responseCode) {
                case 401:
                    self.logger.error('The api key and app id you provided did not register on the server. ' + docs);
                    break;
                case 404:
                    self.logger.error('The app id you provided ("' + settings.get('app_id') + '") was not found.' + docs);
                    break;
                default:
                    self.logger.error('Unable to request analytics key.');
                    self.logger.error(error);
                    break;
            }
        }

        /**
         * Registers an analytics key
         *
         * @param {object} opts Registration options
         * @return {Promise} The register promise
         */
    }, {
        key: "register",
        value: function register(opts) {
            var self = this;
            var deferred = new _corePromise.DeferredPromise();
            if (!this.hasValidSettings) {
                deferred.reject(false);
                return deferred.promise;
            }
            options = opts || {};
            if (options.silent) {
                this.logger.silence();
            } else {
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
        }
    }, {
        key: "setGlobalProperties",
        value: function setGlobalProperties(prop) {
            var self = this;
            var propType = typeof prop;
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
        }
    }, {
        key: "track",
        value: function track(eventCollection, eventData) {
            var self = this;
            if (!this.hasValidSettings) {
                return false;
            }
            if (!eventData) {
                eventData = {};
            } else {
                // Clone the event data to avoid modifying it
                eventData = (0, _utilUtil.deepExtend)({}, eventData);
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
            } else {
                if (options.dryRun) {
                    self.logger.info('dryRun active, will not send event');
                    self.logger.info(eventCollection);
                    self.logger.info(eventData);
                } else {
                    self._postEvent(eventCollection, eventData);
                }
            }
        }
    }, {
        key: "unsetGlobalProperty",
        value: function unsetGlobalProperty(prop) {
            var self = this;
            var propType = typeof prop;
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
        }
    }, {
        key: "hasValidSettings",
        get: function get() {
            if (!settings.get('app_id') || !settings.get('api_key')) {
                var msg = 'A valid app_id and api_key are required before you can utilize ' + 'analytics properly. See http://docs.ionic.io/v1.0/docs/io-quick-start';
                this.logger.info(msg);
                return false;
            }
            return true;
        }
    }, {
        key: "dispatchInterval",
        set: function set(value) {
            var self = this;
            // Set how often we should send batched events, in seconds.
            // Set this to 0 to disable event caching
            this._dispatchIntervalTime = value;
            // Clear the existing interval
            if (this._dispatcher) {
                window.clearInterval(this._dispatcher);
            }
            if (value > 0) {
                this._dispatcher = window.setInterval(function () {
                    self._dispatchQueue();
                }, value * 1000);
                this._useEventCaching = true;
            } else {
                this._useEventCaching = false;
            }
        },
        get: function get() {
            return this._dispatchIntervalTime;
        }
    }]);

    return Analytics;
})();

exports.Analytics = Analytics;

},{"../core/core":8,"../core/logger":12,"../core/promise":13,"../core/request":14,"../core/settings":15,"../core/user":17,"../util/util":26,"./storage":4}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _interopExportWildcard(obj, defaults) { var newObj = defaults({}, obj); delete newObj["default"]; return newObj; }

function _defaults(obj, defaults) { var keys = Object.getOwnPropertyNames(defaults); for (var i = 0; i < keys.length; i++) { var key = keys[i]; var value = Object.getOwnPropertyDescriptor(defaults, key); if (value && value.configurable && obj[key] === undefined) { Object.defineProperty(obj, key, value); } } return obj; }

var _analytics = require("./analytics");

_defaults(exports, _interopExportWildcard(_analytics, _defaults));

var _serializers = require("./serializers");

_defaults(exports, _interopExportWildcard(_serializers, _defaults));

var _storage = require("./storage");

_defaults(exports, _interopExportWildcard(_storage, _defaults));

},{"./analytics":1,"./serializers":3,"./storage":4}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var DOMSerializer = (function () {
    function DOMSerializer() {
        _classCallCheck(this, DOMSerializer);
    }

    _createClass(DOMSerializer, [{
        key: 'elementSelector',
        value: function elementSelector(element) {
            // iterate up the dom
            var selectors = [];
            while (element.tagName !== 'HTML') {
                var selector = element.tagName.toLowerCase();
                var id = element.getAttribute('id');
                if (id) {
                    selector += "#" + id;
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
        }
    }, {
        key: 'elementName',
        value: function elementName(element) {
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
        }
    }]);

    return DOMSerializer;
})();

exports.DOMSerializer = DOMSerializer;

},{}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreSettings = require("../core/settings");

var _coreCore = require("../core/core");

var settings = new _coreSettings.Settings();

var BucketStorage = (function () {
    function BucketStorage(name) {
        _classCallCheck(this, BucketStorage);

        this.name = name;
        this.baseStorage = _coreCore.IonicPlatformCore.getStorage();
    }

    _createClass(BucketStorage, [{
        key: "get",
        value: function get(key) {
            return this.baseStorage.retrieveObject(this.scopedKey(key));
        }
    }, {
        key: "set",
        value: function set(key, value) {
            return this.baseStorage.storeObject(this.scopedKey(key), value);
        }
    }, {
        key: "scopedKey",
        value: function scopedKey(key) {
            return this.name + '_' + key + '_' + settings.get('app_id');
        }
    }]);

    return BucketStorage;
})();

exports.BucketStorage = BucketStorage;

},{"../core/core":8,"../core/settings":15}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreRequest = require("../core/request");

var _corePromise = require("../core/promise");

var _coreSettings = require("../core/settings");

var _coreStorage = require("../core/storage");

var _coreUser = require("../core/user");

var settings = new _coreSettings.Settings();
var storage = new _coreStorage.PlatformLocalStorageStrategy();
var sessionStorage = new _coreStorage.LocalSessionStorageStrategy();
var __authModules = {};
var __authToken = null;
var authAPIBase = settings.getURL('platform-api') + '/auth';
var authAPIEndpoints = {
    'login': function login() {
        var provider = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

        if (provider) {
            return authAPIBase + '/login/' + provider;
        }
        return authAPIBase + '/login';
    },
    'signup': function signup() {
        return authAPIBase + '/users';
    }
};

var TempTokenContext = (function () {
    function TempTokenContext() {
        _classCallCheck(this, TempTokenContext);
    }

    _createClass(TempTokenContext, null, [{
        key: "delete",
        value: function _delete() {
            sessionStorage.remove(TempTokenContext.label);
        }
    }, {
        key: "store",
        value: function store() {
            sessionStorage.set(TempTokenContext.label, __authToken);
        }
    }, {
        key: "getRawData",
        value: function getRawData() {
            return sessionStorage.get(TempTokenContext.label) || false;
        }
    }, {
        key: "label",
        get: function get() {
            return "ionic_io_auth_" + settings.get('app_id');
        }
    }]);

    return TempTokenContext;
})();

exports.TempTokenContext = TempTokenContext;

var TokenContext = (function () {
    function TokenContext() {
        _classCallCheck(this, TokenContext);
    }

    _createClass(TokenContext, null, [{
        key: "delete",
        value: function _delete() {
            storage.remove(TokenContext.label);
        }
    }, {
        key: "store",
        value: function store() {
            storage.set(TokenContext.label, __authToken);
        }
    }, {
        key: "getRawData",
        value: function getRawData() {
            return storage.get(TokenContext.label) || false;
        }
    }, {
        key: "label",
        get: function get() {
            return "ionic_io_auth_" + settings.get('app_id');
        }
    }]);

    return TokenContext;
})();

exports.TokenContext = TokenContext;

function storeToken(options, token) {
    __authToken = token;
    if (typeof options === 'object' && options.remember) {
        TokenContext.store();
    } else {
        TempTokenContext.store();
    }
}

var InAppBrowserFlow = function InAppBrowserFlow(authOptions, options, data) {
    _classCallCheck(this, InAppBrowserFlow);

    var deferred = new _corePromise.DeferredPromise();
    if (!window || !window.cordova || !window.cordova.InAppBrowser) {
        deferred.reject("Missing InAppBrowser plugin");
    } else {
        new _coreRequest.APIRequest({
            'uri': authAPIEndpoints.login(options.provider),
            'method': options.uri_method || 'POST',
            'json': {
                'app_id': settings.get('app_id'),
                'callback': options.callback_uri || window.location.href,
                'data': data
            }
        }).then(function (data) {
            var loc = data.payload.data.url;
            var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no');
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
                    deferred.resolve(true);
                }
            });
        }, function (err) {
            deferred.reject(err);
        });
    }
    return deferred.promise;
};

function getAuthErrorDetails(err) {
    var details = [];
    try {
        details = err.response.body.error.details;
    } catch (e) {
        e;
    }
    return details;
}

var Auth = (function () {
    function Auth() {
        _classCallCheck(this, Auth);
    }

    _createClass(Auth, null, [{
        key: "isAuthenticated",
        value: function isAuthenticated() {
            var token = TokenContext.getRawData();
            var tempToken = TempTokenContext.getRawData();
            if (tempToken || token) {
                return true;
            }
            return false;
        }
    }, {
        key: "login",
        value: function login(moduleId, options, data) {
            var deferred = new _corePromise.DeferredPromise();
            var context = __authModules[moduleId] || false;
            if (!context) {
                throw new Error("Authentication class is invalid or missing:" + context);
            }
            context.authenticate.apply(context, [options, data]).then(function () {
                _coreUser.User.self().then(function (user) {
                    deferred.resolve(user);
                }, function (err) {
                    deferred.reject(err);
                });
            }, function (err) {
                deferred.reject(err);
            });
            return deferred.promise;
        }
    }, {
        key: "signup",
        value: function signup(data) {
            var context = __authModules.basic || false;
            if (!context) {
                throw new Error("Authentication class is invalid or missing:" + context);
            }
            return context.signup.apply(context, [data]);
        }
    }, {
        key: "logout",
        value: function logout() {
            TokenContext["delete"]();
            TempTokenContext["delete"]();
        }
    }, {
        key: "register",
        value: function register(moduleId, module) {
            if (!__authModules[moduleId]) {
                __authModules[moduleId] = module;
            }
        }
    }, {
        key: "getUserToken",
        value: function getUserToken() {
            var usertoken = TokenContext.getRawData();
            var temptoken = TempTokenContext.getRawData();
            var token = temptoken || usertoken;
            if (token) {
                return token;
            }
            return false;
        }
    }]);

    return Auth;
})();

exports.Auth = Auth;

var BasicAuth = (function () {
    function BasicAuth() {
        _classCallCheck(this, BasicAuth);
    }

    _createClass(BasicAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            var deferred = new _corePromise.DeferredPromise();
            new _coreRequest.APIRequest({
                'uri': authAPIEndpoints.login(),
                'method': 'POST',
                'json': {
                    'app_id': settings.get('app_id'),
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
        }
    }, {
        key: "signup",
        value: function signup(data) {
            var deferred = new _corePromise.DeferredPromise();
            var userData = {
                'app_id': settings.get('app_id'),
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
            new _coreRequest.APIRequest({
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
                                errors.push(detail.error_type + "_" + detail.parameter);
                            }
                        }
                    }
                }
                deferred.reject({ "errors": errors });
            });
            return deferred.promise;
        }
    }]);

    return BasicAuth;
})();

var CustomAuth = (function () {
    function CustomAuth() {
        _classCallCheck(this, CustomAuth);
    }

    _createClass(CustomAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'custom' }, data);
        }
    }]);

    return CustomAuth;
})();

var TwitterAuth = (function () {
    function TwitterAuth() {
        _classCallCheck(this, TwitterAuth);
    }

    _createClass(TwitterAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'twitter' }, data);
        }
    }]);

    return TwitterAuth;
})();

var FacebookAuth = (function () {
    function FacebookAuth() {
        _classCallCheck(this, FacebookAuth);
    }

    _createClass(FacebookAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'facebook' }, data);
        }
    }]);

    return FacebookAuth;
})();

var GithubAuth = (function () {
    function GithubAuth() {
        _classCallCheck(this, GithubAuth);
    }

    _createClass(GithubAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'github' }, data);
        }
    }]);

    return GithubAuth;
})();

var GoogleAuth = (function () {
    function GoogleAuth() {
        _classCallCheck(this, GoogleAuth);
    }

    _createClass(GoogleAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'google' }, data);
        }
    }]);

    return GoogleAuth;
})();

var InstagramAuth = (function () {
    function InstagramAuth() {
        _classCallCheck(this, InstagramAuth);
    }

    _createClass(InstagramAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'instagram' }, data);
        }
    }]);

    return InstagramAuth;
})();

var LinkedInAuth = (function () {
    function LinkedInAuth() {
        _classCallCheck(this, LinkedInAuth);
    }

    _createClass(LinkedInAuth, null, [{
        key: "authenticate",
        value: function authenticate(options, data) {
            return new InAppBrowserFlow(options, { 'provider': 'linkedin' }, data);
        }
    }]);

    return LinkedInAuth;
})();

Auth.register('basic', BasicAuth);
Auth.register('custom', CustomAuth);
Auth.register('facebook', FacebookAuth);
Auth.register('github', GithubAuth);
Auth.register('google', GoogleAuth);
Auth.register('instagram', InstagramAuth);
Auth.register('linkedin', LinkedInAuth);
Auth.register('twitter', TwitterAuth);

},{"../core/promise":13,"../core/request":14,"../core/settings":15,"../core/storage":16,"../core/user":17}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _interopExportWildcard(obj, defaults) { var newObj = defaults({}, obj); delete newObj["default"]; return newObj; }

function _defaults(obj, defaults) { var keys = Object.getOwnPropertyNames(defaults); for (var i = 0; i < keys.length; i++) { var key = keys[i]; var value = Object.getOwnPropertyDescriptor(defaults, key); if (value && value.configurable && obj[key] === undefined) { Object.defineProperty(obj, key, value); } } return obj; }

var _auth = require("./auth");

_defaults(exports, _interopExportWildcard(_auth, _defaults));

},{"./auth":5}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _logger = require("./logger");

var privateData = {};
function privateVar(key) {
    return privateData[key] || null;
}

var App = (function () {
    function App(appId, apiKey) {
        _classCallCheck(this, App);

        this.logger = new _logger.Logger({
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

    _createClass(App, [{
        key: 'toString',
        value: function toString() {
            return '<IonicApp [\'' + this.id + '\'>';
        }
    }, {
        key: 'id',
        get: function get() {
            return privateVar('id');
        }
    }, {
        key: 'apiKey',
        get: function get() {
            return privateVar('apiKey');
        }
    }]);

    return App;
})();

exports.App = App;

},{"./logger":12}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _events = require("./events");

var _storage = require("./storage");

var _logger = require("./logger");

var eventEmitter = new _events.EventEmitter();
var mainStorage = new _storage.Storage();

var IonicPlatformCore = (function () {
    function IonicPlatformCore() {
        _classCallCheck(this, IonicPlatformCore);

        var self = this;
        this.logger = new _logger.Logger({
            'prefix': 'Ionic Core:'
        });
        this.logger.info('init');
        this._pluginsReady = false;
        this.emitter = IonicPlatformCore.getEmitter();
        this._bootstrap();
        if (self.cordovaPlatformUnknown) {
            self.logger.info('attempting to mock plugins');
            self._pluginsReady = true;
            self.emitter.emit('ionic_core:plugins_ready');
        } else {
            try {
                document.addEventListener("deviceready", function () {
                    self.logger.info('plugins are ready');
                    self._pluginsReady = true;
                    self.emitter.emit('ionic_core:plugins_ready');
                }, false);
            } catch (e) {
                self.logger.info('unable to listen for cordova plugins to be ready');
            }
        }
    }

    _createClass(IonicPlatformCore, [{
        key: "_isCordovaAvailable",
        value: function _isCordovaAvailable() {
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
                    } catch (e) {
                        self.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
                    }
                }
            }
            return false;
        }
    }, {
        key: "loadCordova",
        value: function loadCordova() {
            var self = this;
            if (!this._isCordovaAvailable()) {
                var cordovaScript = document.createElement('script');
                var cordovaSrc = 'cordova.js';
                switch (IonicPlatformCore.getDeviceTypeByNavigator()) {
                    case 'android':
                        if (window.location.href.substring(0, 4) === "file") {
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
                        } catch (e) {
                            self.logger.info('could not find cordova_js_bootstrap_resource query param');
                            self.logger.info(e);
                        }
                        break;
                    case 'unknown':
                        self.cordovaPlatformUnknown = true;
                        return false;
                    default:
                        break;
                }
                cordovaScript.setAttribute('src', cordovaSrc);
                document.head.appendChild(cordovaScript);
                self.logger.info('injecting cordova.js');
            }
        }

        /**
         * Determine the device type via the user agent string
         * @return {string} name of device platform or "unknown" if unable to identify the device
         */
    }, {
        key: "_bootstrap",

        /**
         * Bootstrap Ionic Core
         *
         * Handles the cordova.js bootstrap
         * @return {void}
         */
        value: function _bootstrap() {
            this.loadCordova();
        }
    }, {
        key: "onReady",

        /**
         * Fire a callback when core + plugins are ready. This will fire immediately if
         * the components have already become available.
         *
         * @param {function} callback function to fire off
         * @return {void}
         */
        value: function onReady(callback) {
            var self = this;
            if (this._pluginsReady) {
                callback(self);
            } else {
                self.emitter.on('ionic_core:plugins_ready', function () {
                    callback(self);
                });
            }
        }
    }], [{
        key: "getEmitter",
        value: function getEmitter() {
            return eventEmitter;
        }
    }, {
        key: "getStorage",
        value: function getStorage() {
            return mainStorage;
        }
    }, {
        key: "getDeviceTypeByNavigator",
        value: function getDeviceTypeByNavigator() {
            var agent = navigator.userAgent;
            var ipad = agent.match(/iPad/i);
            if (ipad && ipad[0].toLowerCase() === 'ipad') {
                return 'ipad';
            }
            var iphone = agent.match(/iPhone/i);
            if (iphone && iphone[0].toLowerCase() === 'iphone') {
                return 'iphone';
            }
            var android = agent.match(/Android/i);
            if (android && android[0].toLowerCase() === 'android') {
                return 'android';
            }
            return "unknown";
        }

        /**
         * Check if the device is an Android device
         * @return {boolean} True if Android, false otherwise
         */
    }, {
        key: "isAndroidDevice",
        value: function isAndroidDevice() {
            var device = IonicPlatformCore.getDeviceTypeByNavigator();
            if (device === 'android') {
                return true;
            }
            return false;
        }

        /**
         * Check if the device is an iOS device
         * @return {boolean} True if iOS, false otherwise
         */
    }, {
        key: "isIOSDevice",
        value: function isIOSDevice() {
            var device = IonicPlatformCore.getDeviceTypeByNavigator();
            if (device === 'iphone' || device === 'ipad') {
                return true;
            }
            return false;
        }
    }, {
        key: "deviceConnectedToNetwork",
        value: function deviceConnectedToNetwork() {
            var strictMode = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

            if (typeof strictMode === 'undefined') {
                strictMode = false;
            }
            if (typeof navigator.connection === 'undefined' || typeof navigator.connection.type === 'undefined' || typeof Connection === 'undefined') {
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
        }
    }, {
        key: "Version",
        get: function get() {
            return '0.7.1';
        }
    }]);

    return IonicPlatformCore;
})();

exports.IonicPlatformCore = IonicPlatformCore;
var IonicPlatform = new IonicPlatformCore();
exports.IonicPlatform = IonicPlatform;

},{"./events":10,"./logger":12,"./storage":16}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var dataTypeMapping = {};

var DataTypeSchema = (function () {
    function DataTypeSchema(properties) {
        _classCallCheck(this, DataTypeSchema);

        this.data = {};
        this.setProperties(properties);
    }

    _createClass(DataTypeSchema, [{
        key: 'setProperties',
        value: function setProperties(properties) {
            if (properties instanceof Object) {
                for (var x in properties) {
                    this.data[x] = properties[x];
                }
            }
        }
    }, {
        key: 'toJSON',
        value: function toJSON() {
            var data = this.data;
            return {
                '__Ionic_DataTypeSchema': data.name,
                'value': data.value
            };
        }
    }, {
        key: 'isValid',
        value: function isValid() {
            if (this.data.name && this.data.value) {
                return true;
            }
            return false;
        }
    }]);

    return DataTypeSchema;
})();

exports.DataTypeSchema = DataTypeSchema;

var DataType = (function () {
    function DataType() {
        _classCallCheck(this, DataType);
    }

    _createClass(DataType, null, [{
        key: 'get',
        value: function get(name, value) {
            if (dataTypeMapping[name]) {
                return new dataTypeMapping[name](value);
            }
            return false;
        }
    }, {
        key: 'getMapping',
        value: function getMapping() {
            return dataTypeMapping;
        }
    }, {
        key: 'register',
        value: function register(name, cls) {
            dataTypeMapping[name] = cls;
        }
    }, {
        key: 'Schema',
        get: function get() {
            return DataTypeSchema;
        }
    }]);

    return DataType;
})();

exports.DataType = DataType;

var UniqueArray = (function () {
    function UniqueArray(value) {
        _classCallCheck(this, UniqueArray);

        this.data = [];
        if (value instanceof Array) {
            for (var x in value) {
                this.push(value[x]);
            }
        }
    }

    _createClass(UniqueArray, [{
        key: 'toJSON',
        value: function toJSON() {
            var data = this.data;
            var schema = new DataTypeSchema({ 'name': 'UniqueArray', 'value': data });
            return schema.toJSON();
        }
    }, {
        key: 'push',
        value: function push(value) {
            if (this.data.indexOf(value) === -1) {
                this.data.push(value);
            }
        }
    }, {
        key: 'pull',
        value: function pull(value) {
            var index = this.data.indexOf(value);
            this.data.splice(index, 1);
        }
    }], [{
        key: 'fromStorage',
        value: function fromStorage(value) {
            return new UniqueArray(value);
        }
    }]);

    return UniqueArray;
})();

exports.UniqueArray = UniqueArray;

DataType.register('UniqueArray', UniqueArray);

},{}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _events = require("events");

var EventEmitter = (function () {
    function EventEmitter() {
        _classCallCheck(this, EventEmitter);

        this._emitter = new _events.EventEmitter();
    }

    _createClass(EventEmitter, [{
        key: "on",
        value: function on(event, callback) {
            return this._emitter.on(event, callback);
        }
    }, {
        key: "emit",
        value: function emit(label) {
            var data = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

            return this._emitter.emit(label, data);
        }
    }]);

    return EventEmitter;
})();

exports.EventEmitter = EventEmitter;

},{"events":28}],11:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _interopExportWildcard(obj, defaults) { var newObj = defaults({}, obj); delete newObj["default"]; return newObj; }

function _defaults(obj, defaults) { var keys = Object.getOwnPropertyNames(defaults); for (var i = 0; i < keys.length; i++) { var key = keys[i]; var value = Object.getOwnPropertyDescriptor(defaults, key); if (value && value.configurable && obj[key] === undefined) { Object.defineProperty(obj, key, value); } } return obj; }

var _app = require("./app");

_defaults(exports, _interopExportWildcard(_app, _defaults));

var _core = require("./core");

_defaults(exports, _interopExportWildcard(_core, _defaults));

var _dataTypes = require("./data-types");

_defaults(exports, _interopExportWildcard(_dataTypes, _defaults));

var _events = require("./events");

_defaults(exports, _interopExportWildcard(_events, _defaults));

var _logger = require("./logger");

_defaults(exports, _interopExportWildcard(_logger, _defaults));

var _promise = require("./promise");

_defaults(exports, _interopExportWildcard(_promise, _defaults));

var _request = require("./request");

_defaults(exports, _interopExportWildcard(_request, _defaults));

var _settings = require("./settings");

_defaults(exports, _interopExportWildcard(_settings, _defaults));

var _storage = require("./storage");

_defaults(exports, _interopExportWildcard(_storage, _defaults));

var _user = require("./user");

_defaults(exports, _interopExportWildcard(_user, _defaults));

},{"./app":7,"./core":8,"./data-types":9,"./events":10,"./logger":12,"./promise":13,"./request":14,"./settings":15,"./storage":16,"./user":17}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Logger = (function () {
    function Logger(opts) {
        _classCallCheck(this, Logger);

        var options = opts || {};
        this._silence = false;
        this._prefix = null;
        this._options = options;
        this._bootstrap();
    }

    _createClass(Logger, [{
        key: "silence",
        value: function silence() {
            this._silence = true;
        }
    }, {
        key: "verbose",
        value: function verbose() {
            this._silence = false;
        }
    }, {
        key: "_bootstrap",
        value: function _bootstrap() {
            if (this._options.prefix) {
                this._prefix = this._options.prefix;
            }
        }
    }, {
        key: "info",
        value: function info(data) {
            if (!this._silence) {
                if (this._prefix) {
                    console.log(this._prefix, data);
                } else {
                    console.log(data);
                }
            }
        }
    }, {
        key: "warn",
        value: function warn(data) {
            if (!this._silence) {
                if (this._prefix) {
                    console.log(this._prefix, data);
                } else {
                    console.log(data);
                }
            }
        }
    }, {
        key: "error",
        value: function error(data) {
            if (this._prefix) {
                console.error(this._prefix, data);
            } else {
                console.error(data);
            }
        }
    }]);

    return Logger;
})();

exports.Logger = Logger;

},{}],13:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _es6Promise = require("es6-promise");

var DeferredPromise = (function () {
    function DeferredPromise() {
        _classCallCheck(this, DeferredPromise);

        var self = this;
        this._update = false;
        this.promise = new _es6Promise.Promise(function (resolve, reject) {
            self.resolve = resolve;
            self.reject = reject;
        });
        var originalThen = this.promise.then;
        this.promise.then = function (ok, fail, update) {
            self._update = update;
            return originalThen.call(self.promise, ok, fail);
        };
    }

    _createClass(DeferredPromise, [{
        key: "notify",
        value: function notify(value) {
            if (this._update && typeof this._update === 'function') {
                this._update(value);
            }
        }
    }]);

    return DeferredPromise;
})();

exports.DeferredPromise = DeferredPromise;

},{"es6-promise":30}],14:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _promise = require("./promise");

var _authAuth = require("../auth/auth");

var _browserRequest = require("browser-request");

var _browserRequest2 = _interopRequireDefault(_browserRequest);

var Request = function Request() {
    _classCallCheck(this, Request);
};

exports.Request = Request;

var Response = function Response() {
    _classCallCheck(this, Response);
};

exports.Response = Response;

var APIResponse = (function (_Response) {
    _inherits(APIResponse, _Response);

    function APIResponse() {
        _classCallCheck(this, APIResponse);

        _get(Object.getPrototypeOf(APIResponse.prototype), "constructor", this).call(this);
    }

    return APIResponse;
})(Response);

exports.APIResponse = APIResponse;

var APIRequest = (function (_Request) {
    _inherits(APIRequest, _Request);

    function APIRequest(options) {
        _classCallCheck(this, APIRequest);

        _get(Object.getPrototypeOf(APIRequest.prototype), "constructor", this).call(this);
        options.headers = options.headers || {};
        if (!options.headers.Authorization) {
            var token = _authAuth.Auth.getUserToken();
            if (token) {
                options.headers.Authorization = 'Bearer ' + token;
            }
        }
        var requestInfo = {};
        var p = new _promise.DeferredPromise();
        (0, _browserRequest2["default"])(options, function (err, response, result) {
            requestInfo._lastError = err;
            requestInfo._lastResponse = response;
            requestInfo._lastResult = result;
            if (err) {
                p.reject(err);
            } else {
                if (response.statusCode < 200 || response.statusCode >= 400) {
                    var _err = new Error("Request Failed with status code of " + response.statusCode);
                    p.reject({ 'response': response, 'error': _err });
                } else {
                    p.resolve({ 'response': response, 'payload': result });
                }
            }
        });
        p.requestInfo = requestInfo;
        return p.promise;
    }

    return APIRequest;
})(Request);

exports.APIRequest = APIRequest;

},{"../auth/auth":5,"./promise":13,"browser-request":27}],15:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _get = function get(_x2, _x3, _x4) { var _again = true; _function: while (_again) { var object = _x2, property = _x3, receiver = _x4; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x2 = parent; _x3 = property; _x4 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var BaseSettings = (function () {
    function BaseSettings() {
        _classCallCheck(this, BaseSettings);

        this._settings = {};
        this._devLocations = {};
        this._locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'analytics': 'https://analytics.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }

    _createClass(BaseSettings, [{
        key: 'get',
        value: function get(name) {
            return this._settings[name];
        }
    }, {
        key: 'getURL',
        value: function getURL(name) {
            if (this._devLocations[name]) {
                return this._devLocations[name];
            } else if (this._locations[name]) {
                return this._locations[name];
            } else {
                return null;
            }
        }
    }, {
        key: 'register',
        value: function register() {
            var settings = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

            this._settings = settings;
            this._devLocations = settings.dev_locations || {};
        }
    }]);

    return BaseSettings;
})();

exports.BaseSettings = BaseSettings;

var settingsSingleton = new BaseSettings();

var Settings = (function (_BaseSettings) {
    _inherits(Settings, _BaseSettings);

    function Settings() {
        _classCallCheck(this, Settings);

        _get(Object.getPrototypeOf(Settings.prototype), 'constructor', this).call(this);
        return settingsSingleton;
    }

    return Settings;
})(BaseSettings);

exports.Settings = Settings;

},{}],16:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _promise = require("./promise");

var PlatformLocalStorageStrategy = (function () {
    function PlatformLocalStorageStrategy() {
        _classCallCheck(this, PlatformLocalStorageStrategy);
    }

    _createClass(PlatformLocalStorageStrategy, [{
        key: 'get',
        value: function get(key) {
            return window.localStorage.getItem(key);
        }
    }, {
        key: 'remove',
        value: function remove(key) {
            return window.localStorage.removeItem(key);
        }
    }, {
        key: 'set',
        value: function set(key, value) {
            return window.localStorage.setItem(key, value);
        }
    }]);

    return PlatformLocalStorageStrategy;
})();

exports.PlatformLocalStorageStrategy = PlatformLocalStorageStrategy;

var LocalSessionStorageStrategy = (function () {
    function LocalSessionStorageStrategy() {
        _classCallCheck(this, LocalSessionStorageStrategy);
    }

    _createClass(LocalSessionStorageStrategy, [{
        key: 'get',
        value: function get(key) {
            return window.sessionStorage.getItem(key);
        }
    }, {
        key: 'remove',
        value: function remove(key) {
            return window.sessionStorage.removeItem(key);
        }
    }, {
        key: 'set',
        value: function set(key, value) {
            return window.sessionStorage.setItem(key, value);
        }
    }]);

    return LocalSessionStorageStrategy;
})();

exports.LocalSessionStorageStrategy = LocalSessionStorageStrategy;

var objectCache = {};
var memoryLocks = {};

var Storage = (function () {
    function Storage() {
        _classCallCheck(this, Storage);

        this.strategy = new PlatformLocalStorageStrategy();
    }

    /**
     * Stores an object in local storage under the given key
     * @param {string} key Name of the key to store values in
     * @param {object} object The object to store with the key
     * @return {void}
     */

    _createClass(Storage, [{
        key: 'storeObject',
        value: function storeObject(key, object) {
            // Convert object to JSON and store in localStorage
            var json = JSON.stringify(object);
            this.strategy.set(key, json);
            // Then store it in the object cache
            objectCache[key] = object;
        }
    }, {
        key: 'deleteObject',
        value: function deleteObject(key) {
            this.strategy.remove(key);
            delete objectCache[key];
        }

        /**
         * Either retrieves the cached copy of an object,
         * or the object itself from localStorage.
         * @param {string} key The name of the key to pull from
         * @return {mixed} Returns the previously stored Object or null
         */
    }, {
        key: 'retrieveObject',
        value: function retrieveObject(key) {
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
            } catch (err) {
                return null;
            }
        }

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
    }, {
        key: 'lockedAsyncCall',
        value: function lockedAsyncCall(lockKey, asyncFunction) {
            var self = this;
            var deferred = new _promise.DeferredPromise();
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
        }
    }]);

    return Storage;
})();

exports.Storage = Storage;

},{"./promise":13}],17:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _authAuth = require("../auth/auth");

var _request = require("./request");

var _promise = require("./promise");

var _settings = require("./settings");

var _storage = require("./storage");

var _logger = require("./logger");

var _dataTypes = require("./data-types");

var AppUserContext = null;
var settings = new _settings.Settings();
var storage = new _storage.Storage();
var userAPIBase = settings.getURL('platform-api') + '/auth/users';
var userAPIEndpoints = {
    'self': function self() {
        return userAPIBase + '/self';
    },
    'get': function get(userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'remove': function remove(userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'save': function save(userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'passwordReset': function passwordReset(userModel) {
        return userAPIBase + '/' + userModel.id + '/password-reset';
    }
};

var UserContext = (function () {
    function UserContext() {
        _classCallCheck(this, UserContext);
    }

    _createClass(UserContext, null, [{
        key: "delete",
        value: function _delete() {
            storage.deleteObject(UserContext.label);
        }
    }, {
        key: "store",
        value: function store() {
            if (UserContext.getRawData()) {
                UserContext.storeLegacyData(UserContext.getRawData());
            }
            if (User.current().data.data.__ionic_user_migrated) {
                storage.storeObject(UserContext.label + '_legacy', { '__ionic_user_migrated': true });
            }
            storage.storeObject(UserContext.label, User.current());
        }
    }, {
        key: "storeLegacyData",
        value: function storeLegacyData(data) {
            if (!UserContext.getRawLegacyData()) {
                storage.storeObject(UserContext.label + '_legacy', data);
            }
        }
    }, {
        key: "getRawData",
        value: function getRawData() {
            return storage.retrieveObject(UserContext.label) || false;
        }
    }, {
        key: "getRawLegacyData",
        value: function getRawLegacyData() {
            return storage.retrieveObject(UserContext.label + '_legacy') || false;
        }
    }, {
        key: "load",
        value: function load() {
            var data = storage.retrieveObject(UserContext.label) || false;
            if (data) {
                UserContext.storeLegacyData(data);
                return User.fromContext(data);
            }
            return;
        }
    }, {
        key: "label",
        get: function get() {
            return "ionic_io_user_" + settings.get('app_id');
        }
    }]);

    return UserContext;
})();

var UserData = (function () {
    function UserData() {
        var data = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

        _classCallCheck(this, UserData);

        this.data = {};
        if (typeof data === 'object') {
            this.data = data;
            this.deserializerDataTypes();
        }
    }

    _createClass(UserData, [{
        key: "deserializerDataTypes",
        value: function deserializerDataTypes() {
            for (var x in this.data) {
                // if we have an object, let's check for custom data types
                if (typeof this.data[x] === 'object') {
                    // do we have a custom type?
                    if (this.data[x].__Ionic_DataTypeSchema) {
                        var name = this.data[x].__Ionic_DataTypeSchema;
                        var mapping = _dataTypes.DataType.getMapping();
                        if (mapping[name]) {
                            // we have a custom type and a registered class, give the custom data type
                            // from storage
                            this.data[x] = mapping[name].fromStorage(this.data[x].value);
                        }
                    }
                }
            }
        }
    }, {
        key: "set",
        value: function set(key, value) {
            this.data[key] = value;
        }
    }, {
        key: "unset",
        value: function unset(key) {
            delete this.data[key];
        }
    }, {
        key: "get",
        value: function get(key, defaultValue) {
            if (this.data.hasOwnProperty(key)) {
                return this.data[key];
            } else {
                if (defaultValue === 0 || defaultValue === false) {
                    return defaultValue;
                }
                return defaultValue || null;
            }
        }
    }]);

    return UserData;
})();

exports.UserData = UserData;

var User = (function () {
    function User() {
        _classCallCheck(this, User);

        this.logger = new _logger.Logger({
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

    _createClass(User, [{
        key: "isDirty",
        value: function isDirty() {
            return this._dirty;
        }
    }, {
        key: "isAnonymous",
        value: function isAnonymous() {
            if (!this.id) {
                return true;
            } else {
                return false;
            }
        }
    }, {
        key: "isAuthenticated",
        value: function isAuthenticated() {
            if (this === User.current()) {
                return _authAuth.Auth.isAuthenticated();
            }
            return false;
        }
    }, {
        key: "isFresh",
        value: function isFresh() {
            return this._fresh;
        }
    }, {
        key: "isValid",
        value: function isValid() {
            if (this.id) {
                return true;
            }
            return false;
        }
    }, {
        key: "getAPIFormat",
        value: function getAPIFormat() {
            var apiFormat = {};
            for (var key in this.details) {
                apiFormat[key] = this.details[key];
            }
            apiFormat.custom = this.data.data;
            return apiFormat;
        }
    }, {
        key: "getFormat",
        value: function getFormat(format) {
            var self = this;
            var formatted = null;
            switch (format) {
                case 'api-save':
                    formatted = self.getAPIFormat();
                    break;
            }
            return formatted;
        }
    }, {
        key: "migrate",
        value: function migrate() {
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
        }
    }, {
        key: "delete",
        value: function _delete() {
            var self = this;
            var deferred = new _promise.DeferredPromise();
            if (!self.isValid()) {
                return false;
            }
            if (!self._blockDelete) {
                self._blockDelete = true;
                self._delete();
                new _request.APIRequest({
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
            } else {
                self.logger.info("a delete operation is already in progress for " + this + ".");
                deferred.reject(false);
            }
            return deferred.promise;
        }
    }, {
        key: "_store",
        value: function _store() {
            if (this === User.current()) {
                UserContext.store();
            }
        }
    }, {
        key: "_delete",
        value: function _delete() {
            if (this === User.current()) {
                UserContext["delete"]();
            }
        }
    }, {
        key: "save",
        value: function save() {
            var self = this;
            var deferred = new _promise.DeferredPromise();
            if (!self._blockSave) {
                self._blockSave = true;
                self._store();
                new _request.APIRequest({
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
            } else {
                self.logger.info("a save operation is already in progress for " + this + ".");
                deferred.reject(false);
            }
            return deferred.promise;
        }
    }, {
        key: "resetPassword",
        value: function resetPassword() {
            var self = this;
            var deferred = new _promise.DeferredPromise();
            new _request.APIRequest({
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
        }
    }, {
        key: "toString",
        value: function toString() {
            return '<IonicUser [\'' + this.id + '\']>';
        }
    }, {
        key: "set",
        value: function set(key, value) {
            delete this._unset[key];
            return this.data.set(key, value);
        }
    }, {
        key: "get",
        value: function get(key, defaultValue) {
            return this.data.get(key, defaultValue);
        }
    }, {
        key: "unset",
        value: function unset(key) {
            this._unset[key] = true;
            return this.data.unset(key);
        }
    }, {
        key: "id",
        set: function set(v) {
            this._id = v;
        },
        get: function get() {
            return this._id || null;
        }
    }], [{
        key: "current",
        value: function current() {
            var user = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

            if (user) {
                AppUserContext = user;
                UserContext.store();
                return AppUserContext;
            } else {
                if (!AppUserContext) {
                    AppUserContext = UserContext.load();
                }
                if (!AppUserContext) {
                    AppUserContext = new User();
                }
                return AppUserContext;
            }
        }
    }, {
        key: "fromContext",
        value: function fromContext(data) {
            var user = new User();
            user.id = data._id;
            user.data = new UserData(data.data.data);
            user.details = data.details || {};
            user._fresh = data._fresh;
            user._dirty = data._dirty;
            return user;
        }
    }, {
        key: "self",
        value: function self() {
            var deferred = new _promise.DeferredPromise();
            var tempUser = new User();
            if (!tempUser._blockLoad) {
                tempUser._blockLoad = true;
                new _request.APIRequest({
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
            } else {
                tempUser.logger.info("a load operation is already in progress for " + this + ".");
                deferred.reject(false);
            }
            return deferred.promise;
        }
    }, {
        key: "load",
        value: function load(id) {
            var deferred = new _promise.DeferredPromise();
            var tempUser = new User();
            tempUser.id = id;
            if (!tempUser._blockLoad) {
                tempUser._blockLoad = true;
                new _request.APIRequest({
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
            } else {
                tempUser.logger.info("a load operation is already in progress for " + this + ".");
                deferred.reject(false);
            }
            return deferred.promise;
        }
    }]);

    return User;
})();

exports.User = User;

},{"../auth/auth":5,"./data-types":9,"./logger":12,"./promise":13,"./request":14,"./settings":15,"./storage":16}],18:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreSettings = require("../core/settings");

var _corePromise = require("../core/promise");

var _coreLogger = require("../core/logger");

var _coreCore = require("../core/core");

var _coreEvents = require("../core/events");

var settings = new _coreSettings.Settings();
var NO_PLUGIN = "IONIC_DEPLOY_MISSING_PLUGIN";
var INITIAL_DELAY = 1 * 5 * 1000;
var WATCH_INTERVAL = 1 * 60 * 1000;

var Deploy = (function () {
    /**
     * Ionic Deploy
     *
     * This is the main interface that talks with the Ionic Deploy Plugin to facilitate
     * checking, downloading, and loading an update to your app.
     *
     * Base Usage:
     *
     *    Ionic.io();
     *    var deploy = new Ionic.Deploy();
     *    deploy.check().then(null, null, function(hasUpdate) {
     *      deploy.update();
     *    });
     *
     * @constructor
     */

    function Deploy() {
        _classCallCheck(this, Deploy);

        var self = this;
        this.logger = new _coreLogger.Logger({
            'prefix': 'Ionic Deploy:'
        });
        this._plugin = false;
        this._isReady = false;
        this._channelTag = 'production';
        this._emitter = new _coreEvents.EventEmitter();
        this.logger.info("init");
        _coreCore.IonicPlatform.onReady(function () {
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

    _createClass(Deploy, [{
        key: "_getPlugin",
        value: function _getPlugin() {
            if (this._plugin) {
                return this._plugin;
            }
            if (typeof IonicDeploy === 'undefined') {
                this.logger.info('plugin is not installed or has not loaded. Have you run `ionic plugin add ionic-plugin-deploy` yet?');
                return false;
            }
            this._plugin = IonicDeploy;
            return IonicDeploy;
        }

        /**
         * Initialize the Deploy Plugin
         * @return {void}
         */
    }, {
        key: "initialize",
        value: function initialize() {
            var self = this;
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.init(settings.get('app_id'), settings.getURL('platform-api'));
                }
            });
        }

        /**
         * Check for updates
         *
         * @return {Promise} Will resolve with true if an update is available, false otherwise. A string or
         *   error will be passed to reject() in the event of a failure.
         */
    }, {
        key: "check",
        value: function check() {
            var self = this;
            var deferred = new _corePromise.DeferredPromise();
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.check(settings.get('app_id'), self._channelTag, function (result) {
                        if (result && result === "true") {
                            self.logger.info('an update is available');
                            deferred.resolve(true);
                        } else {
                            self.logger.info('no updates available');
                            deferred.resolve(false);
                        }
                    }, function (error) {
                        self.logger.error('encountered an error while checking for updates');
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
         * @return {Promise} The promise which will resolve with true/false or use
         *    notify to update the download progress.
         */
    }, {
        key: "download",
        value: function download() {
            var self = this;
            var deferred = new _corePromise.DeferredPromise();
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.download(settings.get('app_id'), function (result) {
                        if (result !== 'true' && result !== 'false') {
                            deferred.notify(result);
                        } else {
                            if (result === 'true') {
                                self.logger.info("download complete");
                            }
                            deferred.resolve(result === 'true');
                        }
                    }, function (error) {
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
         * @return {Promise} The promise which will resolve with true/false or use
         *                   notify to update the extraction progress.
         */
    }, {
        key: "extract",
        value: function extract() {
            var self = this;
            var deferred = new _corePromise.DeferredPromise();
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.extract(settings.get('app_id'), function (result) {
                        if (result !== 'done') {
                            deferred.notify(result);
                        } else {
                            if (result === 'true') {
                                self.logger.info("extraction complete");
                            }
                            deferred.resolve(result);
                        }
                    }, function (error) {
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
    }, {
        key: "load",
        value: function load() {
            var self = this;
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.redirect(settings.get('app_id'));
                }
            });
        }

        /**
         * Watch constantly checks for updates, and triggers an
         * event when one is ready.
         * @param {object} options Watch configuration options
         * @return {Promise} returns a promise that will get a notify() callback when an update is available
         */
    }, {
        key: "watch",
        value: function watch(options) {
            var deferred = new _corePromise.DeferredPromise();
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
        }

        /**
         * Stop automatically looking for updates
         * @return {void}
         */
    }, {
        key: "unwatch",
        value: function unwatch() {
            clearTimeout(this._checkTimeout);
            this._checkTimeout = null;
        }

        /**
         * Information about the current deploy
         *
         * @return {Promise} The resolver will be passed an object that has key/value
         *    pairs pertaining to the currently deployed update.
         */
    }, {
        key: "info",
        value: function info() {
            var deferred = new _corePromise.DeferredPromise();
            var self = this;
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.info(settings.get('app_id'), function (result) {
                        deferred.resolve(result);
                    }, function (err) {
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
    }, {
        key: "getVersions",
        value: function getVersions() {
            var deferred = new _corePromise.DeferredPromise();
            var self = this;
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.getVersions(settings.get('app_id'), function (result) {
                        deferred.resolve(result);
                    }, function (err) {
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
    }, {
        key: "deleteVersion",
        value: function deleteVersion(uuid) {
            var deferred = new _corePromise.DeferredPromise();
            var self = this;
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.deleteVersion(settings.get('app_id'), uuid, function (result) {
                        deferred.resolve(result);
                    }, function (err) {
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
    }, {
        key: "getMetadata",
        value: function getMetadata(uuid) {
            var deferred = new _corePromise.DeferredPromise();
            var self = this;
            this.onReady(function () {
                if (self._getPlugin()) {
                    self._plugin.getMetadata(settings.get('app_id'), uuid, function (result) {
                        deferred.resolve(result.metadata);
                    }, function (err) {
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
         * @return {void}
         */
    }, {
        key: "setChannel",
        value: function setChannel(channelTag) {
            this._channelTag = channelTag;
        }

        /**
         * Update app with the latest deploy
         * @param {boolean} deferLoad Defer loading the applied update after the installation
         * @return {Promise} A promise result
         */
    }, {
        key: "update",
        value: function update(deferLoad) {
            var deferred = new _corePromise.DeferredPromise();
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
                                    deferred.reject("download error");
                                }
                                self.extract().then(function (result) {
                                    if (!result) {
                                        deferred.reject("extraction error");
                                    }
                                    if (!deferLoading) {
                                        deferred.resolve(true);
                                        self._plugin.redirect(settings.get('app_id'));
                                    } else {
                                        deferred.resolve(true);
                                    }
                                }, function (error) {
                                    deferred.reject(error);
                                }, function (update) {
                                    var progress = downloadProgress + update / 2;
                                    deferred.notify(progress);
                                });
                            }, function (error) {
                                deferred.reject(error);
                            }, function (update) {
                                downloadProgress = update / 2;
                                deferred.notify(downloadProgress);
                            });
                        } else {
                            deferred.resolve(false);
                        }
                    }, function (error) {
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
    }, {
        key: "onReady",
        value: function onReady(callback) {
            var self = this;
            if (this._isReady) {
                callback(self);
            } else {
                self._emitter.on('ionic_deploy:ready', function () {
                    callback(self);
                });
            }
        }
    }]);

    return Deploy;
})();

exports.Deploy = Deploy;

},{"../core/core":8,"../core/events":10,"../core/logger":12,"../core/promise":13,"../core/settings":15}],19:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _interopExportWildcard(obj, defaults) { var newObj = defaults({}, obj); delete newObj["default"]; return newObj; }

function _defaults(obj, defaults) { var keys = Object.getOwnPropertyNames(defaults); for (var i = 0; i < keys.length; i++) { var key = keys[i]; var value = Object.getOwnPropertyDescriptor(defaults, key); if (value && value.configurable && obj[key] === undefined) { Object.defineProperty(obj, key, value); } } return obj; }

var _deploy = require("./deploy");

_defaults(exports, _interopExportWildcard(_deploy, _defaults));

},{"./deploy":18}],20:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _interopExportWildcard(obj, defaults) { var newObj = defaults({}, obj); delete newObj["default"]; return newObj; }

function _defaults(obj, defaults) { var keys = Object.getOwnPropertyNames(defaults); for (var i = 0; i < keys.length; i++) { var key = keys[i]; var value = Object.getOwnPropertyDescriptor(defaults, key); if (value && value.configurable && obj[key] === undefined) { Object.defineProperty(obj, key, value); } } return obj; }

var _pushDev = require("./push-dev");

_defaults(exports, _interopExportWildcard(_pushDev, _defaults));

var _pushMessage = require("./push-message");

_defaults(exports, _interopExportWildcard(_pushMessage, _defaults));

var _pushToken = require("./push-token");

_defaults(exports, _interopExportWildcard(_pushToken, _defaults));

var _push = require("./push");

_defaults(exports, _interopExportWildcard(_push, _defaults));

},{"./push":24,"./push-dev":21,"./push-message":22,"./push-token":23}],21:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreRequest = require("../core/request");

var _coreSettings = require("../core/settings");

var _coreLogger = require("../core/logger");

var _pushToken = require("./push-token");

var settings = new _coreSettings.Settings();
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
        _classCallCheck(this, PushDevService);

        this.logger = new _coreLogger.Logger({
            'prefix': 'Ionic Push (dev):'
        });
        this._serviceHost = settings.getURL('platform-api') + '/push';
        this._token = null;
        this._watch = null;
    }

    /**
     * Generate a development token
     *
     * @return {String} development device token
     */

    _createClass(PushDevService, [{
        key: "getDevToken",
        value: function getDevToken() {
            // Some crazy bit-twiddling to generate a random guid
            var token = 'DEV-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0,
                    v = c === 'x' ? r : r & 0x3 | 0x8;
                return v.toString(16);
            });
            this._token = token;
            return this._token;
        }

        /**
         * Registers a development token with the Ionic Push service
         *
         * @param {IonicPushService} ionicPush Instantiated Push Service
         * @param {function} callback Registration Callback
         * @return {void}
         */
    }, {
        key: "init",
        value: function init(ionicPush, callback) {
            this._push = ionicPush;
            this._emitter = this._push._emitter;
            var token = this._token;
            var self = this;
            if (!token) {
                token = this.getDevToken();
            }
            var requestOptions = {
                "method": 'POST',
                "uri": this._serviceHost + '/development',
                "json": {
                    "token": token
                }
            };
            new _coreRequest.APIRequest(requestOptions).then(function () {
                var data = { "registrationId": token };
                self.logger.info('registered with development push service: ' + token);
                self._emitter.emit("ionic_push:token", data);
                if (typeof callback === 'function') {
                    callback(new _pushToken.PushToken(self._token));
                }
                self.watch();
            }, function (error) {
                self.logger.error("error connecting development push service: " + error);
            });
        }

        /**
         * Checks the push service for notifications that target the current development token
         * @return {void}
         */
    }, {
        key: "checkForNotifications",
        value: function checkForNotifications() {
            if (!this._token) {
                return false;
            }
            var self = this;
            var requestOptions = {
                'method': 'GET',
                'uri': self._serviceHost + '/development?token=' + self._token,
                'json': true
            };
            new _coreRequest.APIRequest(requestOptions).then(function (result) {
                if (result.payload.data.message) {
                    var message = {
                        'message': result.payload.data.message,
                        'title': 'DEVELOPMENT PUSH'
                    };
                    self.logger.warn("Ionic Push: Development Push received. Development pushes will not contain payload data.");
                    self._emitter.emit("ionic_push:notification", message);
                }
            }, function (error) {
                self.logger.error("unable to check for development pushes: " + error);
            });
        }

        /**
         * Kicks off the "polling" of the Ionic Push service for new push notifications
         * @return {void}
         */
    }, {
        key: "watch",
        value: function watch() {
            // Check for new dev pushes every 5 seconds
            this.logger.info('watching for new notifications');
            var self = this;
            if (!this._watch) {
                this._watch = setInterval(function () {
                    self.checkForNotifications();
                }, 5000);
            }
        }

        /**
         * Puts the "polling" for new notifications on hold.
         * @return {void}
         */
    }, {
        key: "halt",
        value: function halt() {
            if (this._watch) {
                clearInterval(this._watch);
            }
        }
    }]);

    return PushDevService;
})();

exports.PushDevService = PushDevService;

},{"../core/logger":12,"../core/request":14,"../core/settings":15,"./push-token":23}],22:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var PushMessageAppStatus = (function () {
    function PushMessageAppStatus() {
        _classCallCheck(this, PushMessageAppStatus);

        this.asleep = false;
        this.closed = false;
    }

    _createClass(PushMessageAppStatus, [{
        key: 'wasAsleep',
        get: function get() {
            return this.asleep;
        }
    }, {
        key: 'wasClosed',
        get: function get() {
            return this.closed;
        }
    }]);

    return PushMessageAppStatus;
})();

exports.PushMessageAppStatus = PushMessageAppStatus;

var PushMessage = (function () {
    function PushMessage(raw) {
        _classCallCheck(this, PushMessage);

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

    _createClass(PushMessage, [{
        key: 'processRaw',
        value: function processRaw() {
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
        }
    }, {
        key: 'getRawVersion',
        value: function getRawVersion() {
            return this._raw;
        }
    }, {
        key: 'toString',
        value: function toString() {
            return '<PushMessage [\'' + this.title + '\']>';
        }
    }, {
        key: 'payload',
        get: function get() {
            return this._payload || {};
        }
    }], [{
        key: 'fromPluginJSON',
        value: function fromPluginJSON(json) {
            var message = new PushMessage(json);
            message.processRaw();
            return message;
        }
    }]);

    return PushMessage;
})();

exports.PushMessage = PushMessage;

},{}],23:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var PushToken = (function () {
    function PushToken(token) {
        _classCallCheck(this, PushToken);

        this._token = token || null;
    }

    _createClass(PushToken, [{
        key: 'toString',
        value: function toString() {
            var token = this._token || 'null';
            return '<PushToken [\'' + token + '\']>';
        }
    }, {
        key: 'token',
        set: function set(value) {
            this._token = value;
        },
        get: function get() {
            return this._token;
        }
    }]);

    return PushToken;
})();

exports.PushToken = PushToken;

},{}],24:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreApp = require("../core/app");

var _coreSettings = require("../core/settings");

var _coreCore = require("../core/core");

var _coreLogger = require("../core/logger");

var _coreEvents = require("../core/events");

var _coreRequest = require("../core/request");

var _corePromise = require("../core/promise");

var _coreUser = require("../core/user");

var _pushToken = require("./push-token");

var _pushMessage = require("./push-message");

var _pushDev = require("./push-dev");

var settings = new _coreSettings.Settings();
var DEFER_INIT = "DEFER_INIT";
var pushAPIBase = settings.getURL('platform-api') + '/push';
var pushAPIEndpoints = {
    'saveToken': function saveToken() {
        return pushAPIBase + '/tokens';
    },
    'invalidateToken': function invalidateToken() {
        return pushAPIBase + '/tokens/invalidate';
    }
};
/**
 * Push Service
 *
 * This is the main entrypoint for interacting with the Ionic Push service.
 * Example Usage:
 *
 *   Ionic.io(); // kick off the io platform
 *   var push = new Ionic.Push({
 *     "debug": true,
 *     "onNotification": function(notification) {
 *       var payload = $ionicPush.getPayload(notification);
 *       console.log(notification, payload);
 *     },
 *     "onRegister": function(data) {
 *       console.log(data);
 *     }
 *   });
 *
 *   // Registers for a device token using the options passed to init()
 *   push.register(callback);
 *
 *   // Unregister the current registered token
 *   push.unregister();
 *
 */

var Push = (function () {
    function Push(config) {
        _classCallCheck(this, Push);

        this.logger = new _coreLogger.Logger({
            'prefix': 'Ionic Push:'
        });
        var IonicApp = new _coreApp.App(settings.get('app_id'), settings.get('api_key'));
        IonicApp.devPush = settings.get('dev_push');
        IonicApp.gcmKey = settings.get('gcm_key');
        // Check for the required values to use this service
        if (!IonicApp.id || !IonicApp.apiKey) {
            this.logger.error('no app_id or api_key found. (http://docs.ionic.io/docs/io-install)');
            return;
        } else if (_coreCore.IonicPlatformCore.isAndroidDevice() && !IonicApp.devPush && !IonicApp.gcmKey) {
            this.logger.error('GCM project number not found (http://docs.ionic.io/docs/push-android-setup)');
            return;
        }
        this.app = IonicApp;
        this.registerCallback = null;
        this.notificationCallback = null;
        this.errorCallback = null;
        this._token = null;
        this._notification = false;
        this._debug = false;
        this._isReady = false;
        this._tokenReady = false;
        this._blockRegistration = false;
        this._blockSaveToken = false;
        this._registered = false;
        this._emitter = new _coreEvents.EventEmitter();
        this._plugin = null;
        if (config !== DEFER_INIT) {
            var self = this;
            _coreCore.IonicPlatform.onReady(function () {
                self.init(config);
            });
        }
    }

    _createClass(Push, [{
        key: "getStorageToken",
        value: function getStorageToken() {
            var storage = _coreCore.IonicPlatformCore.getStorage();
            var token = storage.retrieveObject('ionic_io_push_token');
            if (token) {
                return new _pushToken.PushToken(token.token);
            }
            return null;
        }
    }, {
        key: "clearStorageToken",
        value: function clearStorageToken() {
            var storage = _coreCore.IonicPlatformCore.getStorage();
            storage.deleteObject('ionic_io_push_token');
        }

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
    }, {
        key: "init",
        value: function init(config) {
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
            if (_coreCore.IonicPlatformCore.isAndroidDevice()) {
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
            this._emitter.emit('ionic_push:ready', { "config": this._config });
            return this;
        }
    }, {
        key: "saveToken",
        value: function saveToken(token, options) {
            var self = this;
            var deferred = new _corePromise.DeferredPromise();
            var opts = options || {};
            if (token.token) {
                token = token.token;
            }
            var tokenData = {
                'token': token,
                'app_id': settings.get('app_id')
            };
            if (!opts.ignore_user) {
                var user = _coreUser.User.current();
                if (user.isAuthenticated()) {
                    tokenData.user_id = user.id; // eslint-disable-line
                }
            }
            if (!self._blockSaveToken) {
                new _coreRequest.APIRequest({
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
            } else {
                self.logger.info("a token save operation is already in progress.");
                deferred.reject(false);
            }
        }

        /**
         * Registers the device with GCM/APNS to get a device token
         * Fires off the 'onRegister' callback if one has been provided in the init() config
         * @param {function} callback Callback Function
         * @return {void}
         */
    }, {
        key: "register",
        value: function register(callback) {
            this.logger.info('register');
            var self = this;
            if (this._blockRegistration) {
                self.logger.info("another registration is already in progress.");
                return false;
            }
            this._blockRegistration = true;
            this.onReady(function () {
                if (self.app.devPush) {
                    var IonicDevPush = new _pushDev.PushDevService();
                    self._debugCallbackRegistration();
                    self._callbackRegistration();
                    IonicDevPush.init(self, callback);
                    self._blockRegistration = false;
                    self._tokenReady = true;
                } else {
                    self._plugin = self._getPushPlugin().init(self._config.pluginConfig);
                    self._plugin.on('registration', function (data) {
                        self._blockRegistration = false;
                        self.token = new _pushToken.PushToken(data.registrationId);
                        self._tokenReady = true;
                        if (typeof callback === 'function') {
                            callback(self._token);
                        }
                    });
                    self._debugCallbackRegistration();
                    self._callbackRegistration();
                }
                self._registered = true;
            });
        }

        /**
         * Invalidate the current GCM/APNS token
         *
         * @return {Promise} the unregister result
         */
    }, {
        key: "unregister",
        value: function unregister() {
            var self = this;
            var deferred = new _corePromise.DeferredPromise();
            var platform = null;
            if (_coreCore.IonicPlatformCore.isAndroidDevice()) {
                platform = 'android';
            } else if (_coreCore.IonicPlatformCore.isIOSDevice()) {
                platform = 'ios';
            }
            if (!platform) {
                deferred.reject("Could not detect the platform, are you on a device?");
            }
            if (!self._blockUnregister) {
                if (this._plugin) {
                    this._plugin.unregister(function () {}, function () {});
                }
                new _coreRequest.APIRequest({
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
            } else {
                self.logger.info("an unregister operation is already in progress.");
                deferred.reject(false);
            }
            return deferred.promise;
        }

        /**
         * Convenience method to grab the payload object from a notification
         *
         * @param {PushNotification} notification Push Notification object
         * @return {object} Payload object or an empty object
         */
    }, {
        key: "getPayload",
        value: function getPayload(notification) {
            return notification.payload;
        }

        /**
         * Set the registration callback
         *
         * @param {function} callback Registration callback function
         * @return {boolean} true if set correctly, otherwise false
         */
    }, {
        key: "setRegisterCallback",
        value: function setRegisterCallback(callback) {
            if (typeof callback !== 'function') {
                this.logger.info('setRegisterCallback() requires a valid callback function');
                return false;
            }
            this.registerCallback = callback;
            return true;
        }

        /**
         * Set the notification callback
         *
         * @param {function} callback Notification callback function
         * @return {boolean} true if set correctly, otherwise false
         */
    }, {
        key: "setNotificationCallback",
        value: function setNotificationCallback(callback) {
            if (typeof callback !== 'function') {
                this.logger.info('setNotificationCallback() requires a valid callback function');
                return false;
            }
            this.notificationCallback = callback;
            return true;
        }

        /**
         * Set the error callback
         *
         * @param {function} callback Error callback function
         * @return {boolean} true if set correctly, otherwise false
         */
    }, {
        key: "setErrorCallback",
        value: function setErrorCallback(callback) {
            if (typeof callback !== 'function') {
                this.logger.info('setErrorCallback() requires a valid callback function');
                return false;
            }
            this.errorCallback = callback;
            return true;
        }
    }, {
        key: "_debugRegistrationCallback",
        value: function _debugRegistrationCallback() {
            var self = this;
            function callback(data) {
                self.token = new _pushToken.PushToken(data.registrationId);
                self.logger.info('(debug) device token registered: ' + self._token);
            }
            return callback;
        }
    }, {
        key: "_debugNotificationCallback",
        value: function _debugNotificationCallback() {
            var self = this;
            function callback(notification) {
                self._processNotification(notification);
                var message = _pushMessage.PushMessage.fromPluginJSON(notification);
                self.logger.info('(debug) notification received: ' + message);
                if (!self.notificationCallback && self.app.devPush) {
                    alert(message.text);
                }
            }
            return callback;
        }
    }, {
        key: "_debugErrorCallback",
        value: function _debugErrorCallback() {
            var self = this;
            function callback(err) {
                self.logger.error('(debug) unexpected error occured.');
                self.logger.error(err);
            }
            return callback;
        }
    }, {
        key: "_registerCallback",
        value: function _registerCallback() {
            var self = this;
            function callback(data) {
                self.token = new _pushToken.PushToken(data.registrationId);
                if (self.registerCallback) {
                    return self.registerCallback(self._token);
                }
            }
            return callback;
        }
    }, {
        key: "_notificationCallback",
        value: function _notificationCallback() {
            var self = this;
            function callback(notification) {
                self._processNotification(notification);
                var message = _pushMessage.PushMessage.fromPluginJSON(notification);
                if (self.notificationCallback) {
                    return self.notificationCallback(message);
                }
            }
            return callback;
        }
    }, {
        key: "_errorCallback",
        value: function _errorCallback() {
            var self = this;
            function callback(err) {
                if (self.errorCallback) {
                    return self.errorCallback(err);
                }
            }
            return callback;
        }

        /**
         * Registers the default debug callbacks with the PushPlugin when debug is enabled
         * Internal Method
         * @private
         * @return {void}
         */
    }, {
        key: "_debugCallbackRegistration",
        value: function _debugCallbackRegistration() {
            if (this._config.debug) {
                if (!this.app.devPush) {
                    this._plugin.on('registration', this._debugRegistrationCallback());
                    this._plugin.on('notification', this._debugNotificationCallback());
                    this._plugin.on('error', this._debugErrorCallback());
                } else {
                    if (!this._registered) {
                        this._emitter.on('ionic_push:token', this._debugRegistrationCallback());
                        this._emitter.on('ionic_push:notification', this._debugNotificationCallback());
                        this._emitter.on('ionic_push:error', this._debugErrorCallback());
                    }
                }
            }
        }

        /**
         * Registers the user supplied callbacks with the PushPlugin
         * Internal Method
         * @return {void}
         */
    }, {
        key: "_callbackRegistration",
        value: function _callbackRegistration() {
            if (!this.app.devPush) {
                this._plugin.on('registration', this._registerCallback());
                this._plugin.on('notification', this._notificationCallback());
                this._plugin.on('error', this._errorCallback());
            } else {
                if (!this._registered) {
                    this._emitter.on('ionic_push:token', this._registerCallback());
                    this._emitter.on('ionic_push:notification', this._notificationCallback());
                    this._emitter.on('ionic_push:error', this._errorCallback());
                }
            }
        }

        /**
         * Performs misc features based on the contents of a push notification
         * Internal Method
         *
         * Currently just does the payload $state redirection
         * @param {PushNotification} notification Push Notification object
         * @return {void}
         */
    }, {
        key: "_processNotification",
        value: function _processNotification(notification) {
            this._notification = notification;
            this._emitter.emit('ionic_push:processNotification', notification);
        }

        /* Deprecated in favor of `getPushPlugin` */
    }, {
        key: "_getPushPlugin",
        value: function _getPushPlugin() {
            var self = this;
            var PushPlugin = null;
            try {
                PushPlugin = window.PushNotification;
            } catch (e) {
                self.logger.info('something went wrong looking for the PushNotification plugin');
            }
            if (!self.app.devPush && !PushPlugin && (_coreCore.IonicPlatformCore.isIOSDevice() || _coreCore.IonicPlatformCore.isAndroidDevice())) {
                self.logger.error("PushNotification plugin is required. Have you run `ionic plugin add phonegap-plugin-push` ?");
            }
            return PushPlugin;
        }

        /**
         * Fetch the phonegap-push-plugin interface
         *
         * @return {PushNotification} PushNotification instance
         */
    }, {
        key: "getPushPlugin",
        value: function getPushPlugin() {
            return this._plugin;
        }

        /**
         * Fire a callback when Push is ready. This will fire immediately if
         * the service has already initialized.
         *
         * @param {function} callback Callback function to fire off
         * @return {void}
         */
    }, {
        key: "onReady",
        value: function onReady(callback) {
            var self = this;
            if (this._isReady) {
                callback(self);
            } else {
                self._emitter.on('ionic_push:ready', function () {
                    callback(self);
                });
            }
        }
    }, {
        key: "token",
        set: function set(val) {
            var storage = _coreCore.IonicPlatformCore.getStorage();
            if (val instanceof _pushToken.PushToken) {
                storage.storeObject('ionic_io_push_token', { 'token': val.token });
            }
            this._token = val;
        }
    }]);

    return Push;
})();

exports.Push = Push;

},{"../core/app":7,"../core/core":8,"../core/events":10,"../core/logger":12,"../core/promise":13,"../core/request":14,"../core/settings":15,"../core/user":17,"./push-dev":21,"./push-message":22,"./push-token":23}],25:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _interopExportWildcard(obj, defaults) { var newObj = defaults({}, obj); delete newObj["default"]; return newObj; }

function _defaults(obj, defaults) { var keys = Object.getOwnPropertyNames(defaults); for (var i = 0; i < keys.length; i++) { var key = keys[i]; var value = Object.getOwnPropertyDescriptor(defaults, key); if (value && value.configurable && obj[key] === undefined) { Object.defineProperty(obj, key, value); } } return obj; }

var _util = require("./util");

_defaults(exports, _interopExportWildcard(_util, _defaults));

},{"./util":26}],26:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});
exports.deepExtend = deepExtend;

function deepExtend() {
    for (var _len = arguments.length, out = Array(_len), _key = 0; _key < _len; _key++) {
        out[_key] = arguments[_key];
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
                } else {
                    out[key] = obj[key];
                }
            }
        }
    }
    return out;
}

},{}],27:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// UMD HEADER START 
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.returnExports = factory();
  }
}(this, function () {
// UMD HEADER END

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }
  
  //BEGIN QS Hack
  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }
  
  if(options.qs){
    var qs = (typeof options.qs == 'string')? options.qs : serialize(options.qs);
    if(options.uri.indexOf('?') !== -1){ //no get params
        options.uri = options.uri+'&'+qs;
    }else{ //existing get params
        options.uri = options.uri+'?'+qs;
    }
  }
  //END QS Hack
  
  //BEGIN FORM Hack
  var multipart = function(obj) {
    //todo: support file type (useful?)
    var result = {};
    result.boundry = '-------------------------------'+Math.floor(Math.random()*1000000000);
    var lines = [];
    for(var p in obj){
        if (obj.hasOwnProperty(p)) {
            lines.push(
                '--'+result.boundry+"\n"+
                'Content-Disposition: form-data; name="'+p+'"'+"\n"+
                "\n"+
                obj[p]+"\n"
            );
        }
    }
    lines.push( '--'+result.boundry+'--' );
    result.body = lines.join('');
    result.length = result.body.length;
    result.type = 'multipart/form-data; boundary='+result.boundry;
    return result;
  }
  
  if(options.form){
    if(typeof options.form == 'string') throw('form name unsupported');
    if(options.method === 'POST'){
        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
        options.headers['content-type'] = encoding;
        switch(encoding){
            case 'application/x-www-form-urlencoded':
                options.body = serialize(options.form).replace(/%20/g, "+");
                break;
            case 'multipart/form-data':
                var multi = multipart(options.form);
                //options.headers['content-length'] = multi.length;
                options.body = multi.body;
                options.headers['content-type'] = multi.type;
                break;
            default : throw new Error('unsupported encoding:'+encoding);
        }
    }
  }
  //END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}
    return request;
//UMD FOOTER START
}));
//UMD FOOTER END

},{}],28:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],29:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
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

},{}],30:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   3.0.2
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
    var lib$es6$promise$asap$$toString = {}.toString;
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
    var lib$es6$promise$asap$$isNode = typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

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

    function lib$es6$promise$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        lib$es6$promise$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = lib$es6$promise$$internal$$getThen(maybeThenable);

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
        lib$es6$promise$$internal$$handleMaybeThenable(promise, value);
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

    function lib$es6$promise$enumerator$$Enumerator(Constructor, input) {
      var enumerator = this;

      enumerator._instanceConstructor = Constructor;
      enumerator.promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (enumerator._validateInput(input)) {
        enumerator._input     = input;
        enumerator.length     = input.length;
        enumerator._remaining = input.length;

        enumerator._init();

        if (enumerator.length === 0) {
          lib$es6$promise$$internal$$fulfill(enumerator.promise, enumerator._result);
        } else {
          enumerator.length = enumerator.length || 0;
          enumerator._enumerate();
          if (enumerator._remaining === 0) {
            lib$es6$promise$$internal$$fulfill(enumerator.promise, enumerator._result);
          }
        }
      } else {
        lib$es6$promise$$internal$$reject(enumerator.promise, enumerator._validationError());
      }
    }

    lib$es6$promise$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return lib$es6$promise$utils$$isArray(input);
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var lib$es6$promise$enumerator$$default = lib$es6$promise$enumerator$$Enumerator;

    lib$es6$promise$enumerator$$Enumerator.prototype._enumerate = function() {
      var enumerator = this;

      var length  = enumerator.length;
      var promise = enumerator.promise;
      var input   = enumerator._input;

      for (var i = 0; promise._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        enumerator._eachEntry(input[i], i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var enumerator = this;
      var c = enumerator._instanceConstructor;

      if (lib$es6$promise$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== lib$es6$promise$$internal$$PENDING) {
          entry._onerror = null;
          enumerator._settledAt(entry._state, i, entry._result);
        } else {
          enumerator._willSettleAt(c.resolve(entry), i);
        }
      } else {
        enumerator._remaining--;
        enumerator._result[i] = entry;
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var enumerator = this;
      var promise = enumerator.promise;

      if (promise._state === lib$es6$promise$$internal$$PENDING) {
        enumerator._remaining--;

        if (state === lib$es6$promise$$internal$$REJECTED) {
          lib$es6$promise$$internal$$reject(promise, value);
        } else {
          enumerator._result[i] = value;
        }
      }

      if (enumerator._remaining === 0) {
        lib$es6$promise$$internal$$fulfill(promise, enumerator._result);
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
    function lib$es6$promise$promise$all$$all(entries) {
      return new lib$es6$promise$enumerator$$default(this, entries).promise;
    }
    var lib$es6$promise$promise$all$$default = lib$es6$promise$promise$all$$all;
    function lib$es6$promise$promise$race$$race(entries) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (!lib$es6$promise$utils$$isArray(entries)) {
        lib$es6$promise$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        lib$es6$promise$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        lib$es6$promise$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        lib$es6$promise$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    }
    var lib$es6$promise$promise$race$$default = lib$es6$promise$promise$race$$race;
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
    function lib$es6$promise$promise$reject$$reject(reason) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$reject(promise, reason);
      return promise;
    }
    var lib$es6$promise$promise$reject$$default = lib$es6$promise$promise$reject$$reject;

    var lib$es6$promise$promise$$counter = 0;

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
      this._id = lib$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if (lib$es6$promise$$internal$$noop !== resolver) {
        if (!lib$es6$promise$utils$$isFunction(resolver)) {
          lib$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof lib$es6$promise$promise$$Promise)) {
          lib$es6$promise$promise$$needsNew();
        }

        lib$es6$promise$$internal$$initializePromise(this, resolver);
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
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === lib$es6$promise$$internal$$FULFILLED && !onFulfillment || state === lib$es6$promise$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor(lib$es6$promise$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          lib$es6$promise$asap$$asap(function(){
            lib$es6$promise$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

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

},{"_process":29}],31:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

if (typeof angular === 'object' && angular.module) {

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

  var ionTrackDirective = function ionTrackDirective(domEventName) {
    // eslint-disable-line
    return ['$ionicAnalytics', '$ionicGesture', function ($ionicAnalytics, $ionicGesture) {

      var gestureDriven = ['drag', 'dragstart', 'dragend', 'dragleft', 'dragright', 'dragup', 'dragdown', 'swipe', 'swipeleft', 'swiperight', 'swipeup', 'swipedown', 'tap', 'doubletap', 'hold', 'transform', 'pinch', 'pinchin', 'pinchout', 'rotate'];
      // Check if we need to use the gesture subsystem or the DOM system
      var isGestureDriven = false;
      for (var i = 0; i < gestureDriven.length; i++) {
        if (gestureDriven[i] === domEventName.toLowerCase()) {
          isGestureDriven = true;
        }
      }
      return {
        "restrict": 'A',
        "link": function link($scope, $element, $attr) {
          var capitalized = domEventName[0].toUpperCase() + domEventName.slice(1);
          // Grab event name we will send
          var eventName = $attr['ionTrack' + capitalized];

          if (isGestureDriven) {
            var gesture = $ionicGesture.on(domEventName, handler, $element);
            $scope.$on('$destroy', function () {
              $ionicGesture.off(gesture, domEventName, handler);
            });
          } else {
            $element.on(domEventName, handler);
            $scope.$on('$destroy', function () {
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
  };

  var IonicAngularAnalytics = null;

  angular.module('ionic.service.analytics', ['ionic']).value('IONIC_ANALYTICS_VERSION', Ionic.Analytics.version).factory('$ionicAnalytics', [function () {
    if (!IonicAngularAnalytics) {
      IonicAngularAnalytics = new Ionic.Analytics("DEFER_REGISTER");
    }
    return IonicAngularAnalytics;
  }]).factory('domSerializer', [function () {
    return new Ionic.AnalyticSerializers.DOMSerializer();
  }]).run(['$ionicAnalytics', '$state', function ($ionicAnalytics, $state) {
    $ionicAnalytics.setGlobalProperties(function (eventCollection, eventData) {
      if (!eventData._ui) {
        eventData._ui = {};
      }
      eventData._ui.active_state = $state.current.name; // eslint-disable-line
    });
  }]);

  angular.module('ionic.service.analytics').provider('$ionicAutoTrack', [function () {

    var trackersDisabled = {},
        allTrackersDisabled = false;

    this.disableTracking = function (tracker) {
      if (tracker) {
        trackersDisabled[tracker] = true;
      } else {
        allTrackersDisabled = true;
      }
    };

    this.$get = [function () {
      return {
        "isEnabled": function isEnabled(tracker) {
          return !allTrackersDisabled && !trackersDisabled[tracker];
        }
      };
    }];
  }])

  // ================================================================================
  // Auto trackers
  // ================================================================================

  .run(['$ionicAutoTrack', '$ionicAnalytics', function ($ionicAutoTrack, $ionicAnalytics) {
    if (!$ionicAutoTrack.isEnabled('Load')) {
      return;
    }
    $ionicAnalytics.track('Load');
  }]).run(['$ionicAutoTrack', '$document', '$ionicAnalytics', 'domSerializer', function ($ionicAutoTrack, $document, $ionicAnalytics, domSerializer) {
    if (!$ionicAutoTrack.isEnabled('Tap')) {
      return;
    }

    $document.on('click', function (event) {
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
  }]).run(['$ionicAutoTrack', '$ionicAnalytics', '$rootScope', function ($ionicAutoTrack, $ionicAnalytics, $rootScope) {
    if (!$ionicAutoTrack.isEnabled('State Change')) {
      return;
    }

    $rootScope.$on('$stateChangeSuccess', function (event, toState, toParams, fromState, fromParams) {
      // eslint-disable-line
      $ionicAnalytics.track('State Change', {
        "from": fromState.name,
        "to": toState.name
      });
    });
  }])

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

  .directive('ionTrackClick', ionTrackDirective('click')).directive('ionTrackTap', ionTrackDirective('tap')).directive('ionTrackDoubletap', ionTrackDirective('doubletap')).directive('ionTrackHold', ionTrackDirective('hold')).directive('ionTrackRelease', ionTrackDirective('release')).directive('ionTrackDrag', ionTrackDirective('drag')).directive('ionTrackDragLeft', ionTrackDirective('dragleft')).directive('ionTrackDragRight', ionTrackDirective('dragright')).directive('ionTrackDragUp', ionTrackDirective('dragup')).directive('ionTrackDragDown', ionTrackDirective('dragdown')).directive('ionTrackSwipeLeft', ionTrackDirective('swipeleft')).directive('ionTrackSwipeRight', ionTrackDirective('swiperight')).directive('ionTrackSwipeUp', ionTrackDirective('swipeup')).directive('ionTrackSwipeDown', ionTrackDirective('swipedown')).directive('ionTrackTransform', ionTrackDirective('hold')).directive('ionTrackPinch', ionTrackDirective('pinch')).directive('ionTrackPinchIn', ionTrackDirective('pinchin')).directive('ionTrackPinchOut', ionTrackDirective('pinchout')).directive('ionTrackRotate', ionTrackDirective('rotate'));
}

},{}],32:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

if (typeof angular === 'object' && angular.module) {

  var IonicAngularAuth = null;

  angular.module('ionic.service.auth', []).factory('$ionicAuth', [function () {
    if (!IonicAngularAuth) {
      IonicAngularAuth = Ionic.Auth;
    }
    return IonicAngularAuth;
  }]);
}

},{}],33:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

if (typeof angular === 'object' && angular.module) {
  angular.module('ionic.service.core', [])

  /**
   * @private
   * Provides a safe interface to store objects in persistent memory
   */
  .provider('persistentStorage', function () {
    return {
      '$get': [function () {
        var storage = Ionic.getService('Storage');
        if (!storage) {
          storage = new Ionic.IO.Storage();
          Ionic.addService('Storage', storage, true);
        }
        return storage;
      }]
    };
  }).factory('$ionicCoreSettings', [function () {
    return new Ionic.IO.Settings();
  }]).factory('$ionicUser', [function () {
    return Ionic.User;
  }]).run([function () {
    Ionic.io();
  }]);
}

},{}],34:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

if (typeof angular === 'object' && angular.module) {

  var IonicAngularDeploy = null;

  angular.module('ionic.service.deploy', []).factory('$ionicDeploy', [function () {
    if (!IonicAngularDeploy) {
      IonicAngularDeploy = new Ionic.Deploy();
    }
    return IonicAngularDeploy;
  }]);
}

},{}],35:[function(require,module,exports){
"use strict";

var _distEs6CoreApp = require("./../dist/es6/core/app");

var _distEs6CoreCore = require("./../dist/es6/core/core");

var _distEs6CoreEvents = require("./../dist/es6/core/events");

var _distEs6CoreLogger = require("./../dist/es6/core/logger");

var _distEs6CorePromise = require("./../dist/es6/core/promise");

var _distEs6CoreRequest = require("./../dist/es6/core/request");

var _distEs6CoreSettings = require("./../dist/es6/core/settings");

var _distEs6CoreStorage = require("./../dist/es6/core/storage");

var _distEs6CoreUser = require("./../dist/es6/core/user");

var _distEs6CoreDataTypes = require("./../dist/es6/core/data-types");

var _distEs6AnalyticsAnalytics = require("./../dist/es6/analytics/analytics");

var _distEs6AnalyticsStorage = require("./../dist/es6/analytics/storage");

var _distEs6AnalyticsSerializers = require("./../dist/es6/analytics/serializers");

var _distEs6AuthAuth = require("./../dist/es6/auth/auth");

var _distEs6DeployDeploy = require("./../dist/es6/deploy/deploy");

var _distEs6PushPush = require("./../dist/es6/push/push");

var _distEs6PushPushToken = require("./../dist/es6/push/push-token");

var _distEs6PushPushMessage = require("./../dist/es6/push/push-message");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Namespace
Ionic.Core = _distEs6CoreCore.IonicPlatform;
Ionic.User = _distEs6CoreUser.User;
Ionic.Analytics = _distEs6AnalyticsAnalytics.Analytics;
Ionic.Auth = _distEs6AuthAuth.Auth;
Ionic.Deploy = _distEs6DeployDeploy.Deploy;
Ionic.Push = _distEs6PushPush.Push;
Ionic.PushToken = _distEs6PushPushToken.PushToken;
Ionic.PushMessage = _distEs6PushPushMessage.PushMessage;

// DataType Namespace
Ionic.DataType = _distEs6CoreDataTypes.DataType;
Ionic.DataTypes = _distEs6CoreDataTypes.DataType.getMapping();

// IO Namespace
Ionic.IO = {};
Ionic.IO.App = _distEs6CoreApp.App;
Ionic.IO.EventEmitter = _distEs6CoreEvents.EventEmitter;
Ionic.IO.Logger = _distEs6CoreLogger.Logger;
Ionic.IO.Promise = _distEs6CorePromise.Promise;
Ionic.IO.DeferredPromise = _distEs6CorePromise.DeferredPromise;
Ionic.IO.Request = _distEs6CoreRequest.Request;
Ionic.IO.Response = _distEs6CoreRequest.Response;
Ionic.IO.APIRequest = _distEs6CoreRequest.APIRequest;
Ionic.IO.APIResponse = _distEs6CoreRequest.APIResponse;
Ionic.IO.Storage = _distEs6CoreStorage.Storage;
Ionic.IO.Settings = _distEs6CoreSettings.Settings;

// Analytic Storage Namespace
Ionic.AnalyticStorage = {};
Ionic.AnalyticStorage.BucketStorage = _distEs6AnalyticsStorage.BucketStorage;

// Analytic Serializers Namespace
Ionic.AnalyticSerializers = {};
Ionic.AnalyticSerializers.DOMSerializer = _distEs6AnalyticsSerializers.DOMSerializer;

// Provider a single storage for services that have previously been registered
var serviceStorage = {};

Ionic.io = function () {
  if (typeof Ionic.IO.main === 'undefined') {
    Ionic.IO.main = new Ionic.Core();
  }
  return Ionic.IO.main;
};

Ionic.getService = function (name) {
  if (typeof serviceStorage[name] === 'undefined' || !serviceStorage[name]) {
    return false;
  }
  return serviceStorage[name];
};

Ionic.addService = function (name, service, force) {
  if (service && typeof serviceStorage[name] === 'undefined') {
    serviceStorage[name] = service;
  } else if (service && force) {
    serviceStorage[name] = service;
  }
};

Ionic.removeService = function (name) {
  if (typeof serviceStorage[name] !== 'undefined') {
    delete serviceStorage[name];
  }
};

// Kickstart Ionic Platform
Ionic.io();

},{"./../dist/es6/analytics/analytics":1,"./../dist/es6/analytics/serializers":3,"./../dist/es6/analytics/storage":4,"./../dist/es6/auth/auth":5,"./../dist/es6/core/app":7,"./../dist/es6/core/core":8,"./../dist/es6/core/data-types":9,"./../dist/es6/core/events":10,"./../dist/es6/core/logger":12,"./../dist/es6/core/promise":13,"./../dist/es6/core/request":14,"./../dist/es6/core/settings":15,"./../dist/es6/core/storage":16,"./../dist/es6/core/user":17,"./../dist/es6/deploy/deploy":18,"./../dist/es6/push/push":24,"./../dist/es6/push/push-message":22,"./../dist/es6/push/push-token":23}],36:[function(require,module,exports){
// Add Angular integrations if Angular is available
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

if (typeof angular === 'object' && angular.module) {

  var IonicAngularPush = null;

  angular.module('ionic.service.push', [])

  /**
   * IonicPushAction Service
   *
   * A utility service to kick off misc features as part of the Ionic Push service
   */
  .factory('$ionicPushAction', ['$state', function ($state) {
    var PushActionService = (function () {
      function PushActionService() {
        _classCallCheck(this, PushActionService);
      }

      _createClass(PushActionService, [{
        key: 'notificationNavigation',

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
        value: function notificationNavigation(notification) {
          var state = notification.payload.$state || false;
          var stateParams = notification.payload.$stateParams || {};
          if (state) {
            $state.go(state, stateParams);
          }
        }
      }]);

      return PushActionService;
    })();

    return new PushActionService();
  }]).factory('$ionicPush', [function () {
    if (!IonicAngularPush) {
      IonicAngularPush = new Ionic.Push("DEFER_INIT");
    }
    return IonicAngularPush;
  }]).run(['$ionicPush', '$ionicPushAction', function ($ionicPush, $ionicPushAction) {
    // This is what kicks off the state redirection when a push notificaiton has the relevant details
    $ionicPush._emitter.on('ionic_push:processNotification', function (notification) {
      notification = Ionic.PushMessage.fromPluginJSON(notification);
      if (notification && notification.app) {
        if (notification.app.asleep === true || notification.app.closed === true) {
          $ionicPushAction.notificationNavigation(notification);
        }
      }
    });
  }]);
}

},{}]},{},[13,14,10,12,16,15,9,8,17,7,11,5,6,23,22,21,24,20,18,19,4,3,1,2,26,25,33,31,32,36,34,35])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hbmFseXRpY3MvYW5hbHl0aWNzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL3NlcmlhbGl6ZXJzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL3N0b3JhZ2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hdXRoL2F1dGguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hdXRoL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9hcHAuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL2NvcmUuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL2RhdGEtdHlwZXMuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL2V2ZW50cy5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvaW5kZXguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL2xvZ2dlci5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvcHJvbWlzZS5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvcmVxdWVzdC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvc2V0dGluZ3MuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL3N0b3JhZ2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL3VzZXIuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9kZXBsb3kvZGVwbG95LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvZGVwbG95L2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvcHVzaC9pbmRleC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L3B1c2gvcHVzaC1kZXYuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2gtbWVzc2FnZS5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L3B1c2gvcHVzaC10b2tlbi5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L3B1c2gvcHVzaC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L3V0aWwvaW5kZXguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2VzNi1wcm9taXNlL2Rpc3QvZXM2LXByb21pc2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvYW5hbHl0aWNzL2FuZ3VsYXIuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvYXV0aC9hbmd1bGFyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL2NvcmUvYW5ndWxhci5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L3NyYy9kZXBsb3kvYW5ndWxhci5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L3NyYy9lczUuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvcHVzaC9hbmd1bGFyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7OzsyQkNBMkIsaUJBQWlCOzsyQkFDWixpQkFBaUI7OzRCQUN4QixrQkFBa0I7O3dCQUNULGNBQWM7OzBCQUN6QixnQkFBZ0I7O3VCQUNULFdBQVc7O3dCQUNwQixjQUFjOzt3QkFDUixjQUFjOztBQUN6QyxJQUFJLFFBQVEsR0FBRyw0QkFBYyxDQUFDO0FBQzlCLElBQUksYUFBYSxHQUFHLElBQUksQ0FBQztBQUN6QixJQUFJLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQUN0QyxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7QUFDakIsSUFBSSxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7QUFDMUIsSUFBSSxtQkFBbUIsR0FBRyxFQUFFLENBQUM7O0lBQ2hCLFNBQVM7QUFDUCxhQURGLFNBQVMsQ0FDTixNQUFNLEVBQUU7OEJBRFgsU0FBUzs7QUFFZCxZQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztBQUN4QixZQUFJLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLFlBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDN0IsWUFBSSxDQUFDLFlBQVksR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ2pELFlBQUksQ0FBQyxNQUFNLEdBQUcsdUJBQVc7QUFDckIsb0JBQVEsRUFBRSxrQkFBa0I7U0FDL0IsQ0FBQyxDQUFDO0FBQ0gsWUFBSSxDQUFDLE9BQU8sR0FBRyw0QkFBa0IsVUFBVSxFQUFFLENBQUM7QUFDOUMsWUFBSSxDQUFDLEtBQUssR0FBRywyQkFBa0IsaUJBQWlCLENBQUMsQ0FBQztBQUNsRCxZQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztBQUNsQyxZQUFJLE1BQU0sS0FBSyxjQUFjLEVBQUU7QUFDM0IsZ0JBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDekI7S0FDSjs7aUJBZlEsU0FBUzs7ZUFnQlEsc0NBQUc7QUFDekIsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsZUFBZSxFQUFFLFNBQVMsRUFBRTtBQUMzRCx5QkFBUyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDN0QseUJBQVMsQ0FBQyxJQUFJLEdBQUc7QUFDYiw0QkFBUSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO0FBQ2hDLHVDQUFtQixFQUFFLDRCQUFrQixPQUFPO2lCQUNqRCxDQUFDO2FBQ0wsQ0FBQyxDQUFDO1NBQ047OztlQThCWSx1QkFBQyxjQUFjLEVBQUUsU0FBUyxFQUFFO0FBQ3JDLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksT0FBTyxDQUFDLE1BQU0sRUFBRTtBQUNoQixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsOENBQThDLENBQUMsQ0FBQztBQUNqRSxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDakMsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzVCLHVCQUFPO2FBQ1Y7QUFDRCxnQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztBQUNuRCxnQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDakMsZ0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDOztBQUU1QixnQkFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUU7QUFDakIseUJBQVMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO2FBQ3ZCO0FBQ0QscUJBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7O0FBRXBELGdCQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDckQsZ0JBQUksQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEVBQUU7QUFDN0IsMEJBQVUsQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7YUFDbkM7QUFDRCxzQkFBVSxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQzs7QUFFM0MsZ0JBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUMsQ0FBQztTQUM3Qzs7O2VBQ21CLGdDQUFHO0FBQ25CLGdCQUFJLGNBQWMsR0FBRztBQUNqQix3QkFBUSxFQUFFLEtBQUs7QUFDZixzQkFBTSxFQUFFLElBQUk7QUFDWixxQkFBSyxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsYUFBYTtBQUN2Rix5QkFBUyxFQUFFO0FBQ1AsbUNBQWUsRUFBRSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7aUJBQzNGO2FBQ0osQ0FBQztBQUNGLG1CQUFPLDRCQUFlLGNBQWMsQ0FBQyxDQUFDO1NBQ3pDOzs7ZUFDUyxvQkFBQyxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQ25CLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksT0FBTyxHQUFHO0FBQ1Ysc0JBQU0sRUFBRSxDQUFDLElBQUksQ0FBQzthQUNqQixDQUFDO0FBQ0YsZ0JBQUksQ0FBQyxhQUFhLEVBQUU7QUFDaEIsb0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7YUFDN0Y7QUFDRCxnQkFBSSxjQUFjLEdBQUc7QUFDakIsd0JBQVEsRUFBRSxNQUFNO0FBQ2hCLHFCQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksR0FBRyxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNyRSxzQkFBTSxFQUFFLE9BQU87QUFDZix5QkFBUyxFQUFFO0FBQ1AsbUNBQWUsRUFBRSxhQUFhO2lCQUNqQzthQUNKLENBQUM7QUFDRixtQkFBTyw0QkFBZSxjQUFjLENBQUMsQ0FBQztTQUN6Qzs7O2VBQ1UscUJBQUMsTUFBTSxFQUFFO0FBQ2hCLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksQ0FBQyxhQUFhLEVBQUU7QUFDaEIsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHNFQUFzRSxDQUFDLENBQUM7YUFDNUY7QUFDRCxnQkFBSSxjQUFjLEdBQUc7QUFDakIsd0JBQVEsRUFBRSxNQUFNO0FBQ2hCLHFCQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksR0FBRyxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNyRSxzQkFBTSxFQUFFLE1BQU07QUFDZCx5QkFBUyxFQUFFO0FBQ1AsbUNBQWUsRUFBRSxhQUFhO2lCQUNqQzthQUNKLENBQUM7QUFDRixtQkFBTyw0QkFBZSxjQUFjLENBQUMsQ0FBQztTQUN6Qzs7O2VBQ2EsMEJBQUc7QUFDYixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDckQsZ0JBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO0FBQ3RDLHVCQUFPO2FBQ1Y7QUFDRCxnQkFBSSxDQUFDLDRCQUFrQix3QkFBd0IsRUFBRSxFQUFFO0FBQy9DLHVCQUFPO2FBQ1Y7QUFDRCxnQkFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxZQUFZO0FBQzdFLHVCQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7YUFDdkMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZO0FBQ2hCLG9CQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDbEMsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ2hDLG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzthQUNoQyxFQUFFLFVBQVUsR0FBRyxFQUFFO0FBQ2Qsb0JBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO2FBQ3BELENBQUMsQ0FBQztTQUNOOzs7ZUFDb0IsK0JBQUMsT0FBTyxFQUFFO0FBQzNCLGdCQUFJLFlBQVksR0FBRyxJQUFJLENBQUM7QUFDeEIsZ0JBQUksT0FBTyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYSxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRTtBQUM5Riw0QkFBWSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQzthQUMvRDtBQUNELG1CQUFPLFlBQVksQ0FBQztTQUN2Qjs7O2VBQ21CLDhCQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFO0FBQzdDLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN2RCxnQkFBSSxLQUFLLEtBQUssdUJBQXVCLEVBQUU7QUFDbkMsb0JBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNyQyxNQUNJOztBQUVELG9CQUFJLENBQUMsWUFBWSxFQUFFO0FBQ2Ysd0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7aUJBQzdGLE1BQ0k7QUFDRCx3QkFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQ2xDLHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQywyREFBMkQsQ0FBQyxDQUFDO0FBQy9FLHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztpQkFDakM7YUFDSjtTQUNKOzs7ZUFDbUIsOEJBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRTtBQUNqQyxnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFlBQVksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDdkQsZ0JBQUksSUFBSSxHQUFHLG9EQUFvRCxDQUFDO0FBQ2hFLG9CQUFRLFlBQVk7QUFDaEIscUJBQUssR0FBRztBQUNKLHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxzRUFBc0UsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUNqRywwQkFBTTtBQUFBLEFBQ1YscUJBQUssR0FBRztBQUNKLHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLG1CQUFtQixHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ3RHLDBCQUFNO0FBQUEsQUFDVjtBQUNJLHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0FBQ3RELHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN6QiwwQkFBTTtBQUFBLGFBQ2I7U0FDSjs7Ozs7Ozs7OztlQU9PLGtCQUFDLElBQUksRUFBRTtBQUNYLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksUUFBUSxHQUFHLGtDQUFxQixDQUFDO0FBQ3JDLGdCQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFO0FBQ3hCLHdCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3ZCLHVCQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7YUFDM0I7QUFDRCxtQkFBTyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7QUFDckIsZ0JBQUksT0FBTyxDQUFDLE1BQU0sRUFBRTtBQUNoQixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQzthQUN6QixNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7YUFDekI7QUFDRCxnQkFBSSxPQUFPLENBQUMsTUFBTSxFQUFFO0FBQ2hCLG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO2FBQ2xGO0FBQ0QsZ0JBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRTtBQUMvQyw2QkFBYSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO0FBQ3pDLG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO0FBQzFELG9CQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO0FBQzlDLHdCQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzFCLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDaEIsb0JBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkMsd0JBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDMUIsQ0FBQyxDQUFDO0FBQ0gsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7O2VBQ2tCLDZCQUFDLElBQUksRUFBRTtBQUN0QixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFFBQVEsR0FBSSxPQUFPLElBQUksQUFBQyxDQUFDO0FBQzdCLG9CQUFRLFFBQVE7QUFDWixxQkFBSyxRQUFRO0FBQ1QseUJBQUssSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFO0FBQ2xCLDRCQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRTtBQUMzQixxQ0FBUzt5QkFDWjtBQUNELHdDQUFnQixDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztxQkFDckM7QUFDRCwwQkFBTTtBQUFBLEFBQ1YscUJBQUssVUFBVTtBQUNYLHVDQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMvQiwwQkFBTTtBQUFBLEFBQ1Y7QUFDSSx3QkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsOERBQThELENBQUMsQ0FBQztBQUNsRiwwQkFBTTtBQUFBLGFBQ2I7U0FDSjs7O2VBQ0ksZUFBQyxlQUFlLEVBQUUsU0FBUyxFQUFFO0FBQzlCLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7QUFDeEIsdUJBQU8sS0FBSyxDQUFDO2FBQ2hCO0FBQ0QsZ0JBQUksQ0FBQyxTQUFTLEVBQUU7QUFDWix5QkFBUyxHQUFHLEVBQUUsQ0FBQzthQUNsQixNQUNJOztBQUVELHlCQUFTLEdBQUcsMEJBQVcsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQ3pDO0FBQ0QsaUJBQUssSUFBSSxHQUFHLElBQUksZ0JBQWdCLEVBQUU7QUFDOUIsb0JBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDdkMsNkJBQVM7aUJBQ1o7QUFDRCxvQkFBSSxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssS0FBSyxDQUFDLEVBQUU7QUFDM0IsNkJBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDMUM7YUFDSjtBQUNELGlCQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2pELG9CQUFJLEVBQUUsR0FBRyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoQyxrQkFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQzdDO0FBQ0QsZ0JBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFO0FBQ3ZCLG9CQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsRUFBRSxTQUFTLENBQUMsQ0FBQzthQUNsRCxNQUNJO0FBQ0Qsb0JBQUksT0FBTyxDQUFDLE1BQU0sRUFBRTtBQUNoQix3QkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0NBQW9DLENBQUMsQ0FBQztBQUN2RCx3QkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDbEMsd0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2lCQUMvQixNQUNJO0FBQ0Qsd0JBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2lCQUMvQzthQUNKO1NBQ0o7OztlQUNrQiw2QkFBQyxJQUFJLEVBQUU7QUFDdEIsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxRQUFRLEdBQUksT0FBTyxJQUFJLEFBQUMsQ0FBQztBQUM3QixvQkFBUSxRQUFRO0FBQ1oscUJBQUssUUFBUTtBQUNULDJCQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzlCLDBCQUFNO0FBQUEsQUFDVixxQkFBSyxVQUFVO0FBQ1gsd0JBQUksQ0FBQyxHQUFHLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMxQyx3QkFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDViw0QkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUVBQXVFLENBQUMsQ0FBQztxQkFDOUY7QUFDRCx1Q0FBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLDBCQUFNO0FBQUEsQUFDVjtBQUNJLHdCQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO0FBQ2pGLDBCQUFNO0FBQUEsYUFDYjtTQUNKOzs7YUE3UW1CLGVBQUc7QUFDbkIsZ0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRTtBQUNyRCxvQkFBSSxHQUFHLEdBQUcsaUVBQWlFLEdBQ3ZFLHVFQUF1RSxDQUFDO0FBQzVFLG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN0Qix1QkFBTyxLQUFLLENBQUM7YUFDaEI7QUFDRCxtQkFBTyxJQUFJLENBQUM7U0FDZjs7O2FBQ21CLGFBQUMsS0FBSyxFQUFFO0FBQ3hCLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7OztBQUdoQixnQkFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQzs7QUFFbkMsZ0JBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUNsQixzQkFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7YUFDMUM7QUFDRCxnQkFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFO0FBQ1gsb0JBQUksQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZO0FBQUUsd0JBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztpQkFBRSxFQUFFLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQztBQUM1RixvQkFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQzthQUNoQyxNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7YUFDakM7U0FDSjthQUNtQixlQUFHO0FBQ25CLG1CQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQztTQUNyQzs7O1dBdERRLFNBQVM7Ozs7Ozs7Ozs7Ozs7Ozs7eUJDZFIsYUFBYTs7OzsyQkFDYixlQUFlOzs7O3VCQUNmLFdBQVc7Ozs7Ozs7Ozs7Ozs7OztJQ0ZaLGFBQWE7YUFBYixhQUFhOzhCQUFiLGFBQWE7OztpQkFBYixhQUFhOztlQUNQLHlCQUFDLE9BQU8sRUFBRTs7QUFFckIsZ0JBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUNuQixtQkFBTyxPQUFPLENBQUMsT0FBTyxLQUFLLE1BQU0sRUFBRTtBQUMvQixvQkFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUM3QyxvQkFBSSxFQUFFLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNwQyxvQkFBSSxFQUFFLEVBQUU7QUFDSiw0QkFBUSxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7aUJBQ3hCO0FBQ0Qsb0JBQUksU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDbEMsb0JBQUksU0FBUyxFQUFFO0FBQ1gsd0JBQUksT0FBTyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDbkMseUJBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ3JDLDRCQUFJLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbkIsNEJBQUksQ0FBQyxFQUFFO0FBQ0gsb0NBQVEsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO3lCQUN2QjtxQkFDSjtpQkFDSjtBQUNELG9CQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRTtBQUNyQiwyQkFBTyxJQUFJLENBQUM7aUJBQ2Y7QUFDRCxvQkFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3BGLHdCQUFRLElBQUksYUFBYSxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUEsQUFBQyxHQUFHLEdBQUcsQ0FBQztBQUNuRCx1QkFBTyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFDN0IseUJBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDNUI7QUFDRCxtQkFBTyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3hDOzs7ZUFDVSxxQkFBQyxPQUFPLEVBQUU7O0FBRWpCLGdCQUFJLElBQUksR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDbEQsZ0JBQUksSUFBSSxFQUFFO0FBQ04sdUJBQU8sSUFBSSxDQUFDO2FBQ2Y7O0FBRUQsZ0JBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsZ0JBQUksRUFBRSxFQUFFO0FBQ0osdUJBQU8sRUFBRSxDQUFDO2FBQ2I7O0FBRUQsbUJBQU8sSUFBSSxDQUFDO1NBQ2Y7OztXQTNDUSxhQUFhOzs7Ozs7Ozs7Ozs7Ozs7OzRCQ0FELGtCQUFrQjs7d0JBQ1QsY0FBYzs7QUFDaEQsSUFBSSxRQUFRLEdBQUcsNEJBQWMsQ0FBQzs7SUFDakIsYUFBYTtBQUNYLGFBREYsYUFBYSxDQUNWLElBQUksRUFBRTs4QkFEVCxhQUFhOztBQUVsQixZQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUNqQixZQUFJLENBQUMsV0FBVyxHQUFHLDRCQUFrQixVQUFVLEVBQUUsQ0FBQztLQUNyRDs7aUJBSlEsYUFBYTs7ZUFLbkIsYUFBQyxHQUFHLEVBQUU7QUFDTCxtQkFBTyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7U0FDL0Q7OztlQUNFLGFBQUMsR0FBRyxFQUFFLEtBQUssRUFBRTtBQUNaLG1CQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDbkU7OztlQUNRLG1CQUFDLEdBQUcsRUFBRTtBQUNYLG1CQUFPLElBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUMvRDs7O1dBYlEsYUFBYTs7Ozs7Ozs7Ozs7Ozs7OzsyQkNIQyxpQkFBaUI7OzJCQUNaLGlCQUFpQjs7NEJBQ3hCLGtCQUFrQjs7MkJBQytCLGlCQUFpQjs7d0JBQ3RFLGNBQWM7O0FBQ25DLElBQUksUUFBUSxHQUFHLDRCQUFjLENBQUM7QUFDOUIsSUFBSSxPQUFPLEdBQUcsK0NBQWtDLENBQUM7QUFDakQsSUFBSSxjQUFjLEdBQUcsOENBQWlDLENBQUM7QUFDdkQsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDO0FBQ3ZCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQztBQUN2QixJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHLE9BQU8sQ0FBQztBQUM1RCxJQUFJLGdCQUFnQixHQUFHO0FBQ25CLFdBQU8sRUFBRSxpQkFBMkI7WUFBakIsUUFBUSx5REFBRyxJQUFJOztBQUM5QixZQUFJLFFBQVEsRUFBRTtBQUNWLG1CQUFPLFdBQVcsR0FBRyxTQUFTLEdBQUcsUUFBUSxDQUFDO1NBQzdDO0FBQ0QsZUFBTyxXQUFXLEdBQUcsUUFBUSxDQUFDO0tBQ2pDO0FBQ0QsWUFBUSxFQUFFLGtCQUFZO0FBQ2xCLGVBQU8sV0FBVyxHQUFHLFFBQVEsQ0FBQztLQUNqQztDQUNKLENBQUM7O0lBQ1csZ0JBQWdCO2FBQWhCLGdCQUFnQjs4QkFBaEIsZ0JBQWdCOzs7aUJBQWhCLGdCQUFnQjs7ZUFJWixtQkFBRztBQUNaLDBCQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ2pEOzs7ZUFDVyxpQkFBRztBQUNYLDBCQUFjLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztTQUMzRDs7O2VBQ2dCLHNCQUFHO0FBQ2hCLG1CQUFPLGNBQWMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1NBQzlEOzs7YUFYZSxlQUFHO0FBQ2YsbUJBQU8sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUNwRDs7O1dBSFEsZ0JBQWdCOzs7OztJQWNoQixZQUFZO2FBQVosWUFBWTs4QkFBWixZQUFZOzs7aUJBQVosWUFBWTs7ZUFJUixtQkFBRztBQUNaLG1CQUFPLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUN0Qzs7O2VBQ1csaUJBQUc7QUFDWCxtQkFBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1NBQ2hEOzs7ZUFDZ0Isc0JBQUc7QUFDaEIsbUJBQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO1NBQ25EOzs7YUFYZSxlQUFHO0FBQ2YsbUJBQU8sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUNwRDs7O1dBSFEsWUFBWTs7Ozs7QUFjekIsU0FBUyxVQUFVLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRTtBQUNoQyxlQUFXLEdBQUcsS0FBSyxDQUFDO0FBQ3BCLFFBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUU7QUFDakQsb0JBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztLQUN4QixNQUNJO0FBQ0Qsd0JBQWdCLENBQUMsS0FBSyxFQUFFLENBQUM7S0FDNUI7Q0FDSjs7SUFDSyxnQkFBZ0IsR0FDUCxTQURULGdCQUFnQixDQUNOLFdBQVcsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFOzBCQUR0QyxnQkFBZ0I7O0FBRWQsUUFBSSxRQUFRLEdBQUcsa0NBQXFCLENBQUM7QUFDckMsUUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRTtBQUM1RCxnQkFBUSxDQUFDLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0tBQ2xELE1BQ0k7QUFDRCxvQ0FBZTtBQUNYLGlCQUFLLEVBQUUsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDL0Msb0JBQVEsRUFBRSxPQUFPLENBQUMsVUFBVSxJQUFJLE1BQU07QUFDdEMsa0JBQU0sRUFBRTtBQUNKLHdCQUFRLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUM7QUFDaEMsMEJBQVUsRUFBRSxPQUFPLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSTtBQUN4RCxzQkFBTSxFQUFFLElBQUk7YUFDZjtTQUNKLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUU7QUFDcEIsZ0JBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUNoQyxnQkFBSSxXQUFXLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDakYsdUJBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUUsVUFBVSxJQUFJLEVBQUU7QUFDdEQsb0JBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLHNCQUFzQixFQUFFO0FBQ2xELHdCQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdkQsd0JBQUksVUFBVSxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDeEMsd0JBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNoQix5QkFBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDeEMsNEJBQUksSUFBSSxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDcEMsOEJBQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7cUJBQzdCO0FBQ0QsOEJBQVUsQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3RDLCtCQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDcEIsNEJBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQzFCO2FBQ0osQ0FBQyxDQUFDO1NBQ04sRUFBRSxVQUFVLEdBQUcsRUFBRTtBQUNkLG9CQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3hCLENBQUMsQ0FBQztLQUNOO0FBQ0QsV0FBTyxRQUFRLENBQUMsT0FBTyxDQUFDO0NBQzNCOztBQUVMLFNBQVMsbUJBQW1CLENBQUMsR0FBRyxFQUFFO0FBQzlCLFFBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQztBQUNqQixRQUFJO0FBQ0EsZUFBTyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUM7S0FDN0MsQ0FDRCxPQUFPLENBQUMsRUFBRTtBQUNOLFNBQUMsQ0FBQztLQUNMO0FBQ0QsV0FBTyxPQUFPLENBQUM7Q0FDbEI7O0lBQ1ksSUFBSTthQUFKLElBQUk7OEJBQUosSUFBSTs7O2lCQUFKLElBQUk7O2VBQ1MsMkJBQUc7QUFDckIsZ0JBQUksS0FBSyxHQUFHLFlBQVksQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUN0QyxnQkFBSSxTQUFTLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLENBQUM7QUFDOUMsZ0JBQUksU0FBUyxJQUFJLEtBQUssRUFBRTtBQUNwQix1QkFBTyxJQUFJLENBQUM7YUFDZjtBQUNELG1CQUFPLEtBQUssQ0FBQztTQUNoQjs7O2VBQ1csZUFBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTtBQUNsQyxnQkFBSSxRQUFRLEdBQUcsa0NBQXFCLENBQUM7QUFDckMsZ0JBQUksT0FBTyxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUM7QUFDL0MsZ0JBQUksQ0FBQyxPQUFPLEVBQUU7QUFDVixzQkFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsR0FBRyxPQUFPLENBQUMsQ0FBQzthQUM1RTtBQUNELG1CQUFPLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtBQUNsRSwrQkFBSyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUU7QUFDN0IsNEJBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQzFCLEVBQUUsVUFBVSxHQUFHLEVBQUU7QUFDZCw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDeEIsQ0FBQyxDQUFDO2FBQ04sRUFBRSxVQUFVLEdBQUcsRUFBRTtBQUNkLHdCQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3hCLENBQUMsQ0FBQztBQUNILG1CQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7U0FDM0I7OztlQUNZLGdCQUFDLElBQUksRUFBRTtBQUNoQixnQkFBSSxPQUFPLEdBQUcsYUFBYSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUM7QUFDM0MsZ0JBQUksQ0FBQyxPQUFPLEVBQUU7QUFDVixzQkFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsR0FBRyxPQUFPLENBQUMsQ0FBQzthQUM1RTtBQUNELG1CQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7U0FDaEQ7OztlQUNZLGtCQUFHO0FBQ1osd0JBQVksVUFBTyxFQUFFLENBQUM7QUFDdEIsNEJBQWdCLFVBQU8sRUFBRSxDQUFDO1NBQzdCOzs7ZUFDYyxrQkFBQyxRQUFRLEVBQUUsTUFBTSxFQUFFO0FBQzlCLGdCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxFQUFFO0FBQzFCLDZCQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsTUFBTSxDQUFDO2FBQ3BDO1NBQ0o7OztlQUNrQix3QkFBRztBQUNsQixnQkFBSSxTQUFTLEdBQUcsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQzFDLGdCQUFJLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUM5QyxnQkFBSSxLQUFLLEdBQUcsU0FBUyxJQUFJLFNBQVMsQ0FBQztBQUNuQyxnQkFBSSxLQUFLLEVBQUU7QUFDUCx1QkFBTyxLQUFLLENBQUM7YUFDaEI7QUFDRCxtQkFBTyxLQUFLLENBQUM7U0FDaEI7OztXQWxEUSxJQUFJOzs7OztJQW9EWCxTQUFTO2FBQVQsU0FBUzs4QkFBVCxTQUFTOzs7aUJBQVQsU0FBUzs7ZUFDUSxzQkFBQyxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQy9CLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyx3Q0FBZTtBQUNYLHFCQUFLLEVBQUUsZ0JBQWdCLENBQUMsS0FBSyxFQUFFO0FBQy9CLHdCQUFRLEVBQUUsTUFBTTtBQUNoQixzQkFBTSxFQUFFO0FBQ0osNEJBQVEsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNoQywyQkFBTyxFQUFFLElBQUksQ0FBQyxLQUFLO0FBQ25CLDhCQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVE7aUJBQzVCO2FBQ0osQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksRUFBRTtBQUNwQiwwQkFBVSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUM3Qyx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUMxQixFQUFFLFVBQVUsR0FBRyxFQUFFO0FBQ2Qsd0JBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDeEIsQ0FBQyxDQUFDO0FBQ0gsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7O2VBQ1ksZ0JBQUMsSUFBSSxFQUFFO0FBQ2hCLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxRQUFRLEdBQUc7QUFDWCx3QkFBUSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO0FBQ2hDLHVCQUFPLEVBQUUsSUFBSSxDQUFDLEtBQUs7QUFDbkIsMEJBQVUsRUFBRSxJQUFJLENBQUMsUUFBUTthQUM1QixDQUFDOztBQUVGLGdCQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7QUFDZix3QkFBUSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO2FBQ3JDO0FBQ0QsZ0JBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtBQUNaLHdCQUFRLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7YUFDL0I7QUFDRCxnQkFBSSxJQUFJLENBQUMsSUFBSSxFQUFFO0FBQ1gsd0JBQVEsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQzthQUM3QjtBQUNELGdCQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDYix3QkFBUSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO2FBQ2pDO0FBQ0Qsd0NBQWU7QUFDWCxxQkFBSyxFQUFFLGdCQUFnQixDQUFDLE1BQU0sRUFBRTtBQUNoQyx3QkFBUSxFQUFFLE1BQU07QUFDaEIsc0JBQU0sRUFBRSxRQUFRO2FBQ25CLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtBQUNoQix3QkFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUMxQixFQUFFLFVBQVUsR0FBRyxFQUFFO0FBQ2Qsb0JBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNoQixvQkFBSSxPQUFPLEdBQUcsbUJBQW1CLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDdkMsb0JBQUksT0FBTyxZQUFZLEtBQUssRUFBRTtBQUMxQix5QkFBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDckMsNEJBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN4Qiw0QkFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUU7QUFDNUIsZ0NBQUksTUFBTSxDQUFDLFVBQVUsRUFBRTtBQUNuQixzQ0FBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7NkJBQzNEO3lCQUNKO3FCQUNKO2lCQUNKO0FBQ0Qsd0JBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQzthQUN6QyxDQUFDLENBQUM7QUFDSCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7V0E3REMsU0FBUzs7O0lBK0RULFVBQVU7YUFBVixVQUFVOzhCQUFWLFVBQVU7OztpQkFBVixVQUFVOztlQUNPLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDeEU7OztXQUhDLFVBQVU7OztJQUtWLFdBQVc7YUFBWCxXQUFXOzhCQUFYLFdBQVc7OztpQkFBWCxXQUFXOztlQUNNLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDekU7OztXQUhDLFdBQVc7OztJQUtYLFlBQVk7YUFBWixZQUFZOzhCQUFaLFlBQVk7OztpQkFBWixZQUFZOztlQUNLLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDMUU7OztXQUhDLFlBQVk7OztJQUtaLFVBQVU7YUFBVixVQUFVOzhCQUFWLFVBQVU7OztpQkFBVixVQUFVOztlQUNPLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDeEU7OztXQUhDLFVBQVU7OztJQUtWLFVBQVU7YUFBVixVQUFVOzhCQUFWLFVBQVU7OztpQkFBVixVQUFVOztlQUNPLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDeEU7OztXQUhDLFVBQVU7OztJQUtWLGFBQWE7YUFBYixhQUFhOzhCQUFiLGFBQWE7OztpQkFBYixhQUFhOztlQUNJLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDM0U7OztXQUhDLGFBQWE7OztJQUtiLFlBQVk7YUFBWixZQUFZOzhCQUFaLFlBQVk7OztpQkFBWixZQUFZOztlQUNLLHNCQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDL0IsbUJBQU8sSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDMUU7OztXQUhDLFlBQVk7OztBQUtsQixJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNwQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUN4QyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNwQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNwQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxhQUFhLENBQUMsQ0FBQztBQUMxQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUN4QyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQzs7Ozs7Ozs7Ozs7OztvQkN6UXhCLFFBQVE7Ozs7Ozs7Ozs7Ozs7OztzQkNBQyxVQUFVOztBQUNqQyxJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7QUFDckIsU0FBUyxVQUFVLENBQUMsR0FBRyxFQUFFO0FBQ3JCLFdBQU8sV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQztDQUNuQzs7SUFDWSxHQUFHO0FBQ0QsYUFERixHQUFHLENBQ0EsS0FBSyxFQUFFLE1BQU0sRUFBRTs4QkFEbEIsR0FBRzs7QUFFUixZQUFJLENBQUMsTUFBTSxHQUFHLG1CQUFXO0FBQ3JCLG9CQUFRLEVBQUUsWUFBWTtTQUN6QixDQUFDLENBQUM7QUFDSCxZQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssS0FBSyxFQUFFLEVBQUU7QUFDeEIsZ0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7QUFDM0MsbUJBQU87U0FDVjtBQUNELFlBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxLQUFLLEVBQUUsRUFBRTtBQUMxQixnQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUM1QyxtQkFBTztTQUNWO0FBQ0QsbUJBQVcsQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDO0FBQ3ZCLG1CQUFXLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQzs7QUFFNUIsWUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7QUFDcEIsWUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7S0FDdEI7O2lCQWxCUSxHQUFHOztlQXlCSixvQkFBRztBQUNQLG1CQUFPLGVBQWUsR0FBRyxJQUFJLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQztTQUM1Qzs7O2FBUkssZUFBRztBQUNMLG1CQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUMzQjs7O2FBQ1MsZUFBRztBQUNULG1CQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUMvQjs7O1dBeEJRLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7c0JDTGEsVUFBVTs7dUJBQ2YsV0FBVzs7c0JBQ1osVUFBVTs7QUFDakMsSUFBSSxZQUFZLEdBQUcsMEJBQWtCLENBQUM7QUFDdEMsSUFBSSxXQUFXLEdBQUcsc0JBQWEsQ0FBQzs7SUFDbkIsaUJBQWlCO0FBQ2YsYUFERixpQkFBaUIsR0FDWjs4QkFETCxpQkFBaUI7O0FBRXRCLFlBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixZQUFJLENBQUMsTUFBTSxHQUFHLG1CQUFXO0FBQ3JCLG9CQUFRLEVBQUUsYUFBYTtTQUMxQixDQUFDLENBQUM7QUFDSCxZQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6QixZQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztBQUMzQixZQUFJLENBQUMsT0FBTyxHQUFHLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQzlDLFlBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUNsQixZQUFJLElBQUksQ0FBQyxzQkFBc0IsRUFBRTtBQUM3QixnQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztBQUMvQyxnQkFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7QUFDMUIsZ0JBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7U0FDakQsTUFDSTtBQUNELGdCQUFJO0FBQ0Esd0JBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsWUFBWTtBQUNqRCx3QkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUN0Qyx3QkFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7QUFDMUIsd0JBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7aUJBQ2pELEVBQUUsS0FBSyxDQUFDLENBQUM7YUFDYixDQUNELE9BQU8sQ0FBQyxFQUFFO0FBQ04sb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtEQUFrRCxDQUFDLENBQUM7YUFDeEU7U0FDSjtLQUNKOztpQkEzQlEsaUJBQWlCOztlQXFDUCwrQkFBRztBQUNsQixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQzdDLGdCQUFJLE9BQU8sT0FBTyxLQUFLLFdBQVcsRUFBRTtBQUNoQyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0NBQW9DLENBQUMsQ0FBQztBQUN2RCx1QkFBTyxJQUFJLENBQUM7YUFDZjtBQUNELGdCQUFJLE9BQU8sR0FBRyxRQUFRLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdEQsZ0JBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDekIsaUJBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDMUIsb0JBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDNUMsb0JBQUksTUFBTSxFQUFFO0FBQ1Isd0JBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDOUIsd0JBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztBQUNwQix3QkFBSTtBQUNBLG1DQUFXLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztBQUMzQiw0QkFBSSxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxLQUFLLFlBQVksRUFBRTtBQUN6QyxnQ0FBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMENBQTBDLENBQUMsQ0FBQztBQUM3RCxtQ0FBTyxJQUFJLENBQUM7eUJBQ2Y7cUJBQ0osQ0FDRCxPQUFPLENBQUMsRUFBRTtBQUNOLDRCQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQywyREFBMkQsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztxQkFDaEc7aUJBQ0o7YUFDSjtBQUNELG1CQUFPLEtBQUssQ0FBQztTQUNoQjs7O2VBQ1UsdUJBQUc7QUFDVixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEVBQUU7QUFDN0Isb0JBQUksYUFBYSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDckQsb0JBQUksVUFBVSxHQUFHLFlBQVksQ0FBQztBQUM5Qix3QkFBUSxpQkFBaUIsQ0FBQyx3QkFBd0IsRUFBRTtBQUNoRCx5QkFBSyxTQUFTO0FBQ1YsNEJBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxNQUFNLEVBQUU7QUFDakQsc0NBQVUsR0FBRyxzQ0FBc0MsQ0FBQzt5QkFDdkQ7QUFDRCw4QkFBTTtBQUFBLEFBQ1YseUJBQUssTUFBTSxDQUFDO0FBQ1oseUJBQUssUUFBUTtBQUNULDRCQUFJO0FBQ0EsZ0NBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO0FBQzNGLGdDQUFJLFFBQVEsRUFBRTtBQUNWLDBDQUFVLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDOzZCQUN2Qzt5QkFDSixDQUNELE9BQU8sQ0FBQyxFQUFFO0FBQ04sZ0NBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLDBEQUEwRCxDQUFDLENBQUM7QUFDN0UsZ0NBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO3lCQUN2QjtBQUNELDhCQUFNO0FBQUEsQUFDVix5QkFBSyxTQUFTO0FBQ1YsNEJBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUM7QUFDbkMsK0JBQU8sS0FBSyxDQUFDO0FBQUEsQUFDakI7QUFDSSw4QkFBTTtBQUFBLGlCQUNiO0FBQ0QsNkJBQWEsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQzlDLHdCQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN6QyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQzthQUM1QztTQUNKOzs7Ozs7Ozs7Ozs7Ozs7ZUFpRFMsc0JBQUc7QUFDVCxnQkFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQ3RCOzs7Ozs7Ozs7OztlQWdDTSxpQkFBQyxRQUFRLEVBQUU7QUFDZCxnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7QUFDcEIsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNsQixNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLDBCQUEwQixFQUFFLFlBQVk7QUFDcEQsNEJBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDbEIsQ0FBQyxDQUFDO2FBQ047U0FDSjs7O2VBaktnQixzQkFBRztBQUNoQixtQkFBTyxZQUFZLENBQUM7U0FDdkI7OztlQUNnQixzQkFBRztBQUNoQixtQkFBTyxXQUFXLENBQUM7U0FDdEI7OztlQW9FOEIsb0NBQUc7QUFDOUIsZ0JBQUksS0FBSyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7QUFDaEMsZ0JBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDaEMsZ0JBQUksSUFBSSxJQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxNQUFNLEFBQUMsRUFBRTtBQUM1Qyx1QkFBTyxNQUFNLENBQUM7YUFDakI7QUFDRCxnQkFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNwQyxnQkFBSSxNQUFNLElBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLFFBQVEsQUFBQyxFQUFFO0FBQ2xELHVCQUFPLFFBQVEsQ0FBQzthQUNuQjtBQUNELGdCQUFJLE9BQU8sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ3RDLGdCQUFJLE9BQU8sSUFBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssU0FBUyxBQUFDLEVBQUU7QUFDckQsdUJBQU8sU0FBUyxDQUFDO2FBQ3BCO0FBQ0QsbUJBQU8sU0FBUyxDQUFDO1NBQ3BCOzs7Ozs7OztlQUtxQiwyQkFBRztBQUNyQixnQkFBSSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztBQUMxRCxnQkFBSSxNQUFNLEtBQUssU0FBUyxFQUFFO0FBQ3RCLHVCQUFPLElBQUksQ0FBQzthQUNmO0FBQ0QsbUJBQU8sS0FBSyxDQUFDO1NBQ2hCOzs7Ozs7OztlQUtpQix1QkFBRztBQUNqQixnQkFBSSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztBQUMxRCxnQkFBSSxNQUFNLEtBQUssUUFBUSxJQUFJLE1BQU0sS0FBSyxNQUFNLEVBQUU7QUFDMUMsdUJBQU8sSUFBSSxDQUFDO2FBQ2Y7QUFDRCxtQkFBTyxLQUFLLENBQUM7U0FDaEI7OztlQVU4QixvQ0FBb0I7Z0JBQW5CLFVBQVUseURBQUcsSUFBSTs7QUFDN0MsZ0JBQUksT0FBTyxVQUFVLEtBQUssV0FBVyxFQUFFO0FBQ25DLDBCQUFVLEdBQUcsS0FBSyxDQUFDO2FBQ3RCO0FBQ0QsZ0JBQUksT0FBTyxTQUFTLENBQUMsVUFBVSxLQUFLLFdBQVcsSUFDM0MsT0FBTyxTQUFTLENBQUMsVUFBVSxDQUFDLElBQUksS0FBSyxXQUFXLElBQ2hELE9BQU8sVUFBVSxLQUFLLFdBQVcsRUFBRTtBQUNuQyxvQkFBSSxDQUFDLFVBQVUsRUFBRTtBQUNiLDJCQUFPLElBQUksQ0FBQztpQkFDZjtBQUNELHVCQUFPLEtBQUssQ0FBQzthQUNoQjtBQUNELG9CQUFRLFNBQVMsQ0FBQyxVQUFVLENBQUMsSUFBSTtBQUM3QixxQkFBSyxVQUFVLENBQUMsUUFBUSxDQUFDO0FBQ3pCLHFCQUFLLFVBQVUsQ0FBQyxJQUFJLENBQUM7QUFDckIscUJBQUssVUFBVSxDQUFDLE9BQU8sQ0FBQztBQUN4QixxQkFBSyxVQUFVLENBQUMsT0FBTyxDQUFDO0FBQ3hCLHFCQUFLLFVBQVUsQ0FBQyxPQUFPLENBQUM7QUFDeEIscUJBQUssVUFBVSxDQUFDLElBQUk7QUFDaEIsMkJBQU8sSUFBSSxDQUFDO0FBQUEsQUFDaEI7QUFDSSwyQkFBTyxLQUFLLENBQUM7QUFBQSxhQUNwQjtTQUNKOzs7YUFsSmlCLGVBQUc7QUFDakIsbUJBQU8sZ0JBQWdCLENBQUM7U0FDM0I7OztXQTlCUSxpQkFBaUI7Ozs7QUFrTXZCLElBQUksYUFBYSxHQUFHLElBQUksaUJBQWlCLEVBQUUsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7QUN2TW5ELElBQUksZUFBZSxHQUFHLEVBQUUsQ0FBQzs7SUFDWixjQUFjO0FBQ1osYUFERixjQUFjLENBQ1gsVUFBVSxFQUFFOzhCQURmLGNBQWM7O0FBRW5CLFlBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2YsWUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztLQUNsQzs7aUJBSlEsY0FBYzs7ZUFLVix1QkFBQyxVQUFVLEVBQUU7QUFDdEIsZ0JBQUksVUFBVSxZQUFZLE1BQU0sRUFBRTtBQUM5QixxQkFBSyxJQUFJLENBQUMsSUFBSSxVQUFVLEVBQUU7QUFDdEIsd0JBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUNoQzthQUNKO1NBQ0o7OztlQUNLLGtCQUFHO0FBQ0wsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDckIsbUJBQU87QUFDSCx3Q0FBd0IsRUFBRSxJQUFJLENBQUMsSUFBSTtBQUNuQyx1QkFBTyxFQUFFLElBQUksQ0FBQyxLQUFLO2FBQ3RCLENBQUM7U0FDTDs7O2VBQ00sbUJBQUc7QUFDTixnQkFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtBQUNuQyx1QkFBTyxJQUFJLENBQUM7YUFDZjtBQUNELG1CQUFPLEtBQUssQ0FBQztTQUNoQjs7O1dBeEJRLGNBQWM7Ozs7O0lBMEJkLFFBQVE7YUFBUixRQUFROzhCQUFSLFFBQVE7OztpQkFBUixRQUFROztlQUNQLGFBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtBQUNwQixnQkFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDdkIsdUJBQU8sSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDM0M7QUFDRCxtQkFBTyxLQUFLLENBQUM7U0FDaEI7OztlQUNnQixzQkFBRztBQUNoQixtQkFBTyxlQUFlLENBQUM7U0FDMUI7OztlQUljLGtCQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7QUFDdkIsMkJBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUM7U0FDL0I7OzthQUxnQixlQUFHO0FBQ2hCLG1CQUFPLGNBQWMsQ0FBQztTQUN6Qjs7O1dBWlEsUUFBUTs7Ozs7SUFpQlIsV0FBVztBQUNULGFBREYsV0FBVyxDQUNSLEtBQUssRUFBRTs4QkFEVixXQUFXOztBQUVoQixZQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNmLFlBQUksS0FBSyxZQUFZLEtBQUssRUFBRTtBQUN4QixpQkFBSyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUU7QUFDakIsb0JBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDdkI7U0FDSjtLQUNKOztpQkFSUSxXQUFXOztlQVNkLGtCQUFHO0FBQ0wsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDckIsZ0JBQUksTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUMxRSxtQkFBTyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7U0FDMUI7OztlQUlHLGNBQUMsS0FBSyxFQUFFO0FBQ1IsZ0JBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7QUFDakMsb0JBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3pCO1NBQ0o7OztlQUNHLGNBQUMsS0FBSyxFQUFFO0FBQ1IsZ0JBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3JDLGdCQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDOUI7OztlQVhpQixxQkFBQyxLQUFLLEVBQUU7QUFDdEIsbUJBQU8sSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDakM7OztXQWhCUSxXQUFXOzs7OztBQTJCeEIsUUFBUSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7Ozs7Ozs7Ozs7Ozs7c0JDdkVBLFFBQVE7O0lBQ3pDLFlBQVk7QUFDVixhQURGLFlBQVksR0FDUDs4QkFETCxZQUFZOztBQUVqQixZQUFJLENBQUMsUUFBUSxHQUFHLDBCQUFtQixDQUFDO0tBQ3ZDOztpQkFIUSxZQUFZOztlQUluQixZQUFDLEtBQUssRUFBRSxRQUFRLEVBQUU7QUFDaEIsbUJBQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQzVDOzs7ZUFDRyxjQUFDLEtBQUssRUFBZTtnQkFBYixJQUFJLHlEQUFHLElBQUk7O0FBQ25CLG1CQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztTQUMxQzs7O1dBVFEsWUFBWTs7Ozs7Ozs7Ozs7Ozs7OzttQkNEWCxPQUFPOzs7O29CQUNQLFFBQVE7Ozs7eUJBQ1IsY0FBYzs7OztzQkFDZCxVQUFVOzs7O3NCQUNWLFVBQVU7Ozs7dUJBQ1YsV0FBVzs7Ozt1QkFDWCxXQUFXOzs7O3dCQUNYLFlBQVk7Ozs7dUJBQ1osV0FBVzs7OztvQkFDWCxRQUFROzs7Ozs7Ozs7Ozs7Ozs7SUNUVCxNQUFNO0FBQ0osYUFERixNQUFNLENBQ0gsSUFBSSxFQUFFOzhCQURULE1BQU07O0FBRVgsWUFBSSxPQUFPLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUN6QixZQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztBQUN0QixZQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztBQUNwQixZQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztBQUN4QixZQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7S0FDckI7O2lCQVBRLE1BQU07O2VBUVIsbUJBQUc7QUFDTixnQkFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7U0FDeEI7OztlQUNNLG1CQUFHO0FBQ04sZ0JBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1NBQ3pCOzs7ZUFDUyxzQkFBRztBQUNULGdCQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO0FBQ3RCLG9CQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO2FBQ3ZDO1NBQ0o7OztlQUNHLGNBQUMsSUFBSSxFQUFFO0FBQ1AsZ0JBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ2hCLG9CQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDZCwyQkFBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO2lCQUNuQyxNQUNJO0FBQ0QsMkJBQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQ3JCO2FBQ0o7U0FDSjs7O2VBQ0csY0FBQyxJQUFJLEVBQUU7QUFDUCxnQkFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUU7QUFDaEIsb0JBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtBQUNkLDJCQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7aUJBQ25DLE1BQ0k7QUFDRCwyQkFBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDckI7YUFDSjtTQUNKOzs7ZUFDSSxlQUFDLElBQUksRUFBRTtBQUNSLGdCQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDZCx1QkFBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQ3JDLE1BQ0k7QUFDRCx1QkFBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUN2QjtTQUNKOzs7V0E5Q1EsTUFBTTs7Ozs7Ozs7Ozs7Ozs7OzswQkNBbUIsYUFBYTs7SUFDdEMsZUFBZTtBQUNiLGFBREYsZUFBZSxHQUNWOzhCQURMLGVBQWU7O0FBRXBCLFlBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixZQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztBQUNyQixZQUFJLENBQUMsT0FBTyxHQUFHLHdCQUFlLFVBQVUsT0FBTyxFQUFFLE1BQU0sRUFBRTtBQUNyRCxnQkFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7QUFDdkIsZ0JBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1NBQ3hCLENBQUMsQ0FBQztBQUNILFlBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBQ3JDLFlBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUU7QUFDNUMsZ0JBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQ3RCLG1CQUFPLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDcEQsQ0FBQztLQUNMOztpQkFiUSxlQUFlOztlQWNsQixnQkFBQyxLQUFLLEVBQUU7QUFDVixnQkFBSSxJQUFJLENBQUMsT0FBTyxJQUFLLE9BQU8sSUFBSSxDQUFDLE9BQU8sS0FBSyxVQUFVLEFBQUMsRUFBRTtBQUN0RCxvQkFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUN2QjtTQUNKOzs7V0FsQlEsZUFBZTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7dUJDREksV0FBVzs7d0JBQ3RCLGNBQWM7OzhCQUNmLGlCQUFpQjs7OztJQUN4QixPQUFPLEdBQ0wsU0FERixPQUFPLEdBQ0Y7MEJBREwsT0FBTztDQUVmOzs7O0lBRVEsUUFBUSxHQUNOLFNBREYsUUFBUSxHQUNIOzBCQURMLFFBQVE7Q0FFaEI7Ozs7SUFFUSxXQUFXO2NBQVgsV0FBVzs7QUFDVCxhQURGLFdBQVcsR0FDTjs4QkFETCxXQUFXOztBQUVoQixtQ0FGSyxXQUFXLDZDQUVSO0tBQ1g7O1dBSFEsV0FBVztHQUFTLFFBQVE7Ozs7SUFLNUIsVUFBVTtjQUFWLFVBQVU7O0FBQ1IsYUFERixVQUFVLENBQ1AsT0FBTyxFQUFFOzhCQURaLFVBQVU7O0FBRWYsbUNBRkssVUFBVSw2Q0FFUDtBQUNSLGVBQU8sQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7QUFDeEMsWUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFO0FBQ2hDLGdCQUFJLEtBQUssR0FBRyxlQUFLLFlBQVksRUFBRSxDQUFDO0FBQ2hDLGdCQUFJLEtBQUssRUFBRTtBQUNQLHVCQUFPLENBQUMsT0FBTyxDQUFDLGFBQWEsR0FBRyxTQUFTLEdBQUcsS0FBSyxDQUFDO2FBQ3JEO1NBQ0o7QUFDRCxZQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7QUFDckIsWUFBSSxDQUFDLEdBQUcsOEJBQXFCLENBQUM7QUFDOUIseUNBQVEsT0FBTyxFQUFFLFVBQVUsR0FBRyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUU7QUFDOUMsdUJBQVcsQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDO0FBQzdCLHVCQUFXLENBQUMsYUFBYSxHQUFHLFFBQVEsQ0FBQztBQUNyQyx1QkFBVyxDQUFDLFdBQVcsR0FBRyxNQUFNLENBQUM7QUFDakMsZ0JBQUksR0FBRyxFQUFFO0FBQ0wsaUJBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDakIsTUFDSTtBQUNELG9CQUFJLFFBQVEsQ0FBQyxVQUFVLEdBQUcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxVQUFVLElBQUksR0FBRyxFQUFFO0FBQ3pELHdCQUFJLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxxQ0FBcUMsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDbEYscUJBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2lCQUNyRCxNQUNJO0FBQ0QscUJBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO2lCQUMxRDthQUNKO1NBQ0osQ0FBQyxDQUFDO0FBQ0gsU0FBQyxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7QUFDNUIsZUFBTyxDQUFDLENBQUMsT0FBTyxDQUFDO0tBQ3BCOztXQS9CUSxVQUFVO0dBQVMsT0FBTzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQ2hCMUIsWUFBWTtBQUNWLGFBREYsWUFBWSxHQUNQOzhCQURMLFlBQVk7O0FBRWpCLFlBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQ3BCLFlBQUksQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO0FBQ3hCLFlBQUksQ0FBQyxVQUFVLEdBQUc7QUFDZCxpQkFBSyxFQUFFLHVCQUF1QjtBQUM5QixrQkFBTSxFQUFFLHVCQUF1QjtBQUMvQix1QkFBVyxFQUFFLDRCQUE0QjtBQUN6QyxvQkFBUSxFQUFFLHVCQUF1QjtBQUNqQywwQkFBYyxFQUFFLHNCQUFzQjtTQUN6QyxDQUFDO0tBQ0w7O2lCQVhRLFlBQVk7O2VBWWxCLGFBQUMsSUFBSSxFQUFFO0FBQ04sbUJBQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUMvQjs7O2VBQ0ssZ0JBQUMsSUFBSSxFQUFFO0FBQ1QsZ0JBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUMxQix1QkFBTyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ25DLE1BQ0ksSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQzVCLHVCQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDaEMsTUFDSTtBQUNELHVCQUFPLElBQUksQ0FBQzthQUNmO1NBQ0o7OztlQUNPLG9CQUFnQjtnQkFBZixRQUFRLHlEQUFHLEVBQUU7O0FBQ2xCLGdCQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztBQUMxQixnQkFBSSxDQUFDLGFBQWEsR0FBRyxRQUFRLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FBQztTQUNyRDs7O1dBN0JRLFlBQVk7Ozs7O0FBK0J6QixJQUFJLGlCQUFpQixHQUFHLElBQUksWUFBWSxFQUFFLENBQUM7O0lBQzlCLFFBQVE7Y0FBUixRQUFROztBQUNOLGFBREYsUUFBUSxHQUNIOzhCQURMLFFBQVE7O0FBRWIsbUNBRkssUUFBUSw2Q0FFTDtBQUNSLGVBQU8saUJBQWlCLENBQUM7S0FDNUI7O1dBSlEsUUFBUTtHQUFTLFlBQVk7Ozs7Ozs7Ozs7Ozs7Ozt1QkNoQ1YsV0FBVzs7SUFDOUIsNEJBQTRCO0FBQzFCLGFBREYsNEJBQTRCLEdBQ3ZCOzhCQURMLDRCQUE0QjtLQUVwQzs7aUJBRlEsNEJBQTRCOztlQUdsQyxhQUFDLEdBQUcsRUFBRTtBQUNMLG1CQUFPLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQzNDOzs7ZUFDSyxnQkFBQyxHQUFHLEVBQUU7QUFDUixtQkFBTyxNQUFNLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUM5Qzs7O2VBQ0UsYUFBQyxHQUFHLEVBQUUsS0FBSyxFQUFFO0FBQ1osbUJBQU8sTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ2xEOzs7V0FYUSw0QkFBNEI7Ozs7O0lBYTVCLDJCQUEyQjthQUEzQiwyQkFBMkI7OEJBQTNCLDJCQUEyQjs7O2lCQUEzQiwyQkFBMkI7O2VBQ2pDLGFBQUMsR0FBRyxFQUFFO0FBQ0wsbUJBQU8sTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDN0M7OztlQUNLLGdCQUFDLEdBQUcsRUFBRTtBQUNSLG1CQUFPLE1BQU0sQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ2hEOzs7ZUFDRSxhQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUU7QUFDWixtQkFBTyxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDcEQ7OztXQVRRLDJCQUEyQjs7Ozs7QUFXeEMsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQzs7SUFDUixPQUFPO0FBQ0wsYUFERixPQUFPLEdBQ0Y7OEJBREwsT0FBTzs7QUFFWixZQUFJLENBQUMsUUFBUSxHQUFHLElBQUksNEJBQTRCLEVBQUUsQ0FBQztLQUN0RDs7Ozs7Ozs7O2lCQUhRLE9BQU87O2VBVUwscUJBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRTs7QUFFckIsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDbEMsZ0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQzs7QUFFN0IsdUJBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUM7U0FDN0I7OztlQUNXLHNCQUFDLEdBQUcsRUFBRTtBQUNkLGdCQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxQixtQkFBTyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDM0I7Ozs7Ozs7Ozs7ZUFPYSx3QkFBQyxHQUFHLEVBQUU7O0FBRWhCLGdCQUFJLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDOUIsZ0JBQUksTUFBTSxFQUFFO0FBQ1IsdUJBQU8sTUFBTSxDQUFDO2FBQ2pCOztBQUVELGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7QUFFbEMsZ0JBQUksSUFBSSxLQUFLLElBQUksRUFBRTtBQUNmLHVCQUFPLElBQUksQ0FBQzthQUNmO0FBQ0QsZ0JBQUk7QUFDQSx1QkFBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzNCLENBQ0QsT0FBTyxHQUFHLEVBQUU7QUFDUix1QkFBTyxJQUFJLENBQUM7YUFDZjtTQUNKOzs7Ozs7Ozs7Ozs7OztlQVdjLHlCQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUU7QUFDcEMsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxRQUFRLEdBQUcsOEJBQXFCLENBQUM7O0FBRXJDLGdCQUFJLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRTtBQUN0Qix3QkFBUSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMvQix1QkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO2FBQzNCOztBQUVELGdCQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLFFBQVEsRUFBRTtBQUN6Qyx3QkFBUSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3pDLHdCQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWTtBQUNwQyx3QkFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7aUJBQ2pDLENBQUMsQ0FBQztBQUNILHVCQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7YUFDM0I7O0FBRUQsdUJBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDNUIsZ0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQzs7QUFFckMseUJBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLFdBQVcsRUFBRTtBQUN4Qyx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQzs7QUFFOUIsdUJBQU8sV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQzVCLG9CQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUNqQyxFQUFFLFVBQVUsU0FBUyxFQUFFO0FBQ3BCLHdCQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDOztBQUUzQix1QkFBTyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDNUIsb0JBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ2pDLEVBQUUsVUFBVSxVQUFVLEVBQUU7QUFDckIsd0JBQVEsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7YUFDL0IsQ0FBQyxDQUFDO0FBQ0gsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7O1dBMUZRLE9BQU87Ozs7Ozs7Ozs7Ozs7Ozs7d0JDM0JDLGNBQWM7O3VCQUNSLFdBQVc7O3VCQUNOLFdBQVc7O3dCQUNsQixZQUFZOzt1QkFDYixXQUFXOztzQkFDWixVQUFVOzt5QkFDUixjQUFjOztBQUN2QyxJQUFJLGNBQWMsR0FBRyxJQUFJLENBQUM7QUFDMUIsSUFBSSxRQUFRLEdBQUcsd0JBQWMsQ0FBQztBQUM5QixJQUFJLE9BQU8sR0FBRyxzQkFBYSxDQUFDO0FBQzVCLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUcsYUFBYSxDQUFDO0FBQ2xFLElBQUksZ0JBQWdCLEdBQUc7QUFDbkIsVUFBTSxFQUFFLGdCQUFZO0FBQ2hCLGVBQU8sV0FBVyxHQUFHLE9BQU8sQ0FBQztLQUNoQztBQUNELFNBQUssRUFBRSxhQUFVLFNBQVMsRUFBRTtBQUN4QixlQUFPLFdBQVcsR0FBRyxHQUFHLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQztLQUMzQztBQUNELFlBQVEsRUFBRSxnQkFBVSxTQUFTLEVBQUU7QUFDM0IsZUFBTyxXQUFXLEdBQUcsR0FBRyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7S0FDM0M7QUFDRCxVQUFNLEVBQUUsY0FBVSxTQUFTLEVBQUU7QUFDekIsZUFBTyxXQUFXLEdBQUcsR0FBRyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7S0FDM0M7QUFDRCxtQkFBZSxFQUFFLHVCQUFVLFNBQVMsRUFBRTtBQUNsQyxlQUFPLFdBQVcsR0FBRyxHQUFHLEdBQUcsU0FBUyxDQUFDLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQztLQUMvRDtDQUNKLENBQUM7O0lBQ0ksV0FBVzthQUFYLFdBQVc7OEJBQVgsV0FBVzs7O2lCQUFYLFdBQVc7O2VBSUEsbUJBQUc7QUFDWixtQkFBTyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDM0M7OztlQUNXLGlCQUFHO0FBQ1gsZ0JBQUksV0FBVyxDQUFDLFVBQVUsRUFBRSxFQUFFO0FBQzFCLDJCQUFXLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO2FBQ3pEO0FBQ0QsZ0JBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUU7QUFDaEQsdUJBQU8sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxTQUFTLEVBQUUsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2FBQ3pGO0FBQ0QsbUJBQU8sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztTQUMxRDs7O2VBQ3FCLHlCQUFDLElBQUksRUFBRTtBQUN6QixnQkFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFO0FBQ2pDLHVCQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQzVEO1NBQ0o7OztlQUNnQixzQkFBRztBQUNoQixtQkFBTyxPQUFPLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUM7U0FDN0Q7OztlQUNzQiw0QkFBRztBQUN0QixtQkFBTyxPQUFPLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDO1NBQ3pFOzs7ZUFDVSxnQkFBRztBQUNWLGdCQUFJLElBQUksR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUM7QUFDOUQsZ0JBQUksSUFBSSxFQUFFO0FBQ04sMkJBQVcsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbEMsdUJBQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNqQztBQUNELG1CQUFPO1NBQ1Y7OzthQWpDZSxlQUFHO0FBQ2YsbUJBQU8sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUNwRDs7O1dBSEMsV0FBVzs7O0lBb0NKLFFBQVE7QUFDTixhQURGLFFBQVEsR0FDTTtZQUFYLElBQUkseURBQUcsRUFBRTs7OEJBRFosUUFBUTs7QUFFYixZQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUNmLFlBQUssT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFHO0FBQzVCLGdCQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUNqQixnQkFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7U0FDaEM7S0FDSjs7aUJBUFEsUUFBUTs7ZUFRSSxpQ0FBRztBQUNwQixpQkFBSyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFOztBQUVyQixvQkFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssUUFBUSxFQUFFOztBQUVsQyx3QkFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixFQUFFO0FBQ3JDLDRCQUFJLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDO0FBQy9DLDRCQUFJLE9BQU8sR0FBRyxvQkFBUyxVQUFVLEVBQUUsQ0FBQztBQUNwQyw0QkFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7OztBQUdmLGdDQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQzt5QkFDaEU7cUJBQ0o7aUJBQ0o7YUFDSjtTQUNKOzs7ZUFDRSxhQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUU7QUFDWixnQkFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7U0FDMUI7OztlQUNJLGVBQUMsR0FBRyxFQUFFO0FBQ1AsbUJBQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUN6Qjs7O2VBQ0UsYUFBQyxHQUFHLEVBQUUsWUFBWSxFQUFFO0FBQ25CLGdCQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFFO0FBQy9CLHVCQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDekIsTUFDSTtBQUNELG9CQUFJLFlBQVksS0FBSyxDQUFDLElBQUksWUFBWSxLQUFLLEtBQUssRUFBRTtBQUM5QywyQkFBTyxZQUFZLENBQUM7aUJBQ3ZCO0FBQ0QsdUJBQU8sWUFBWSxJQUFJLElBQUksQ0FBQzthQUMvQjtTQUNKOzs7V0F6Q1EsUUFBUTs7Ozs7SUEyQ1IsSUFBSTtBQUNGLGFBREYsSUFBSSxHQUNDOzhCQURMLElBQUk7O0FBRVQsWUFBSSxDQUFDLE1BQU0sR0FBRyxtQkFBVztBQUNyQixvQkFBUSxFQUFFLGFBQWE7U0FDMUIsQ0FBQyxDQUFDO0FBQ0gsWUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDeEIsWUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDeEIsWUFBSSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7QUFDMUIsWUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFDcEIsWUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDbkIsWUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDakIsWUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO0tBQzlCOztpQkFaUSxJQUFJOztlQWFOLG1CQUFHO0FBQ04sbUJBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztTQUN0Qjs7O2VBQ1UsdUJBQUc7QUFDVixnQkFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUU7QUFDVix1QkFBTyxJQUFJLENBQUM7YUFDZixNQUNJO0FBQ0QsdUJBQU8sS0FBSyxDQUFDO2FBQ2hCO1NBQ0o7OztlQUNjLDJCQUFHO0FBQ2QsZ0JBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRTtBQUN6Qix1QkFBTyxlQUFLLGVBQWUsRUFBRSxDQUFDO2FBQ2pDO0FBQ0QsbUJBQU8sS0FBSyxDQUFDO1NBQ2hCOzs7ZUF1Rk0sbUJBQUc7QUFDTixtQkFBTyxJQUFJLENBQUMsTUFBTSxDQUFDO1NBQ3RCOzs7ZUFDTSxtQkFBRztBQUNOLGdCQUFJLElBQUksQ0FBQyxFQUFFLEVBQUU7QUFDVCx1QkFBTyxJQUFJLENBQUM7YUFDZjtBQUNELG1CQUFPLEtBQUssQ0FBQztTQUNoQjs7O2VBQ1csd0JBQUc7QUFDWCxnQkFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQ25CLGlCQUFLLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDMUIseUJBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3RDO0FBQ0QscUJBQVMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDbEMsbUJBQU8sU0FBUyxDQUFDO1NBQ3BCOzs7ZUFDUSxtQkFBQyxNQUFNLEVBQUU7QUFDZCxnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7QUFDckIsb0JBQVEsTUFBTTtBQUNWLHFCQUFLLFVBQVU7QUFDWCw2QkFBUyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUNoQywwQkFBTTtBQUFBLGFBQ2I7QUFDRCxtQkFBTyxTQUFTLENBQUM7U0FDcEI7OztlQUNNLG1CQUFHO0FBQ04sZ0JBQUksT0FBTyxHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQzdDLGdCQUFJLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRTtBQUMvQix1QkFBTyxJQUFJLENBQUM7YUFDZjtBQUNELGdCQUFJLE9BQU8sRUFBRTtBQUNULG9CQUFJLFdBQVcsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ3ZDLG9CQUFJLFFBQVEsR0FBRyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9DLHFCQUFLLElBQUksR0FBRyxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUU7QUFDM0IsK0JBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztpQkFDNUM7QUFDRCwyQkFBVyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsQ0FBQzthQUNsRDtTQUNKOzs7ZUFDSyxtQkFBRztBQUNMLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksUUFBUSxHQUFHLDhCQUFxQixDQUFDO0FBQ3JDLGdCQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFO0FBQ2pCLHVCQUFPLEtBQUssQ0FBQzthQUNoQjtBQUNELGdCQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTtBQUNwQixvQkFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7QUFDekIsb0JBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUNmLHdDQUFlO0FBQ1gseUJBQUssRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQ3BDLDRCQUFRLEVBQUUsUUFBUTtBQUNsQiwwQkFBTSxFQUFFLElBQUk7aUJBQ2YsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRTtBQUN0Qix3QkFBSSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7QUFDMUIsd0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUNwQyw0QkFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztpQkFDNUIsRUFBRSxVQUFVLEtBQUssRUFBRTtBQUNoQix3QkFBSSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7QUFDMUIsd0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3pCLDRCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUMxQixDQUFDLENBQUM7YUFDTixNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdEQUFnRCxHQUFHLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztBQUNoRix3QkFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUMxQjtBQUNELG1CQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7U0FDM0I7OztlQUNLLGtCQUFHO0FBQ0wsZ0JBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRTtBQUN6QiwyQkFBVyxDQUFDLEtBQUssRUFBRSxDQUFDO2FBQ3ZCO1NBQ0o7OztlQUNNLG1CQUFHO0FBQ04sZ0JBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRTtBQUN6QiwyQkFBVyxVQUFPLEVBQUUsQ0FBQzthQUN4QjtTQUNKOzs7ZUFDRyxnQkFBRztBQUNILGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksUUFBUSxHQUFHLDhCQUFxQixDQUFDO0FBQ3JDLGdCQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRTtBQUNsQixvQkFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7QUFDdkIsb0JBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUNkLHdDQUFlO0FBQ1gseUJBQUssRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ2xDLDRCQUFRLEVBQUUsT0FBTztBQUNqQiwwQkFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO2lCQUNyQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsTUFBTSxFQUFFO0FBQ3RCLHdCQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNwQix3QkFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRTtBQUNqQiw0QkFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7cUJBQ3BCO0FBQ0Qsd0JBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0FBQ3BCLHdCQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUN4Qix3QkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDL0IsNEJBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7aUJBQzVCLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDaEIsd0JBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0FBQ25CLHdCQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUN4Qix3QkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDekIsNEJBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQzFCLENBQUMsQ0FBQzthQUNOLE1BQ0k7QUFDRCxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsOENBQThDLEdBQUcsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQzlFLHdCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQzFCO0FBQ0QsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7O2VBQ1kseUJBQUc7QUFDWixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFFBQVEsR0FBRyw4QkFBcUIsQ0FBQztBQUNyQyxvQ0FBZTtBQUNYLHFCQUFLLEVBQUUsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQztBQUMzQyx3QkFBUSxFQUFFLE1BQU07YUFDbkIsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRTtBQUN0QixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUM1Qyx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUM1QixFQUFFLFVBQVUsS0FBSyxFQUFFO0FBQ2hCLG9CQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN6Qix3QkFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUMxQixDQUFDLENBQUM7QUFDSCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7ZUFPTyxvQkFBRztBQUNQLG1CQUFPLGdCQUFnQixHQUFHLElBQUksQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDO1NBQzlDOzs7ZUFDRSxhQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUU7QUFDWixtQkFBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3hCLG1CQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztTQUNwQzs7O2VBQ0UsYUFBQyxHQUFHLEVBQUUsWUFBWSxFQUFFO0FBQ25CLG1CQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxZQUFZLENBQUMsQ0FBQztTQUMzQzs7O2VBQ0ksZUFBQyxHQUFHLEVBQUU7QUFDUCxnQkFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDeEIsbUJBQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDL0I7OzthQW5CSyxhQUFDLENBQUMsRUFBRTtBQUNOLGdCQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztTQUNoQjthQUNLLGVBQUc7QUFDTCxtQkFBTyxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztTQUMzQjs7O2VBMU5hLG1CQUFjO2dCQUFiLElBQUkseURBQUcsSUFBSTs7QUFDdEIsZ0JBQUksSUFBSSxFQUFFO0FBQ04sOEJBQWMsR0FBRyxJQUFJLENBQUM7QUFDdEIsMkJBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUNwQix1QkFBTyxjQUFjLENBQUM7YUFDekIsTUFDSTtBQUNELG9CQUFJLENBQUMsY0FBYyxFQUFFO0FBQ2pCLGtDQUFjLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2lCQUN2QztBQUNELG9CQUFJLENBQUMsY0FBYyxFQUFFO0FBQ2pCLGtDQUFjLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztpQkFDL0I7QUFDRCx1QkFBTyxjQUFjLENBQUM7YUFDekI7U0FDSjs7O2VBQ2lCLHFCQUFDLElBQUksRUFBRTtBQUNyQixnQkFBSSxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUN0QixnQkFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO0FBQ25CLGdCQUFJLENBQUMsSUFBSSxHQUFHLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekMsZ0JBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7QUFDbEMsZ0JBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztBQUMxQixnQkFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO0FBQzFCLG1CQUFPLElBQUksQ0FBQztTQUNmOzs7ZUFDVSxnQkFBRztBQUNWLGdCQUFJLFFBQVEsR0FBRyw4QkFBcUIsQ0FBQztBQUNyQyxnQkFBSSxRQUFRLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUMxQixnQkFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUU7QUFDdEIsd0JBQVEsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO0FBQzNCLHdDQUFlO0FBQ1gseUJBQUssRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUU7QUFDOUIsNEJBQVEsRUFBRSxLQUFLO0FBQ2YsMEJBQU0sRUFBRSxJQUFJO2lCQUNmLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxNQUFNLEVBQUU7QUFDdEIsNEJBQVEsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQzVCLDRCQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQzs7QUFFcEMsNEJBQVEsQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ3ZDLDRCQUFRLENBQUMsSUFBSSxHQUFHLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3pELDRCQUFRLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztBQUMvQyw0QkFBUSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFDeEIsd0JBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdkIsNEJBQVEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7aUJBQzlCLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDaEIsNEJBQVEsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQzVCLDRCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUM3Qiw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztpQkFDMUIsQ0FBQyxDQUFDO2FBQ04sTUFDSTtBQUNELHdCQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyw4Q0FBOEMsR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDbEYsd0JBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDMUI7QUFDRCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7ZUFDVSxjQUFDLEVBQUUsRUFBRTtBQUNaLGdCQUFJLFFBQVEsR0FBRyw4QkFBcUIsQ0FBQztBQUNyQyxnQkFBSSxRQUFRLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUMxQixvQkFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDakIsZ0JBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO0FBQ3RCLHdCQUFRLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztBQUMzQix3Q0FBZTtBQUNYLHlCQUFLLEVBQUUsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNyQyw0QkFBUSxFQUFFLEtBQUs7QUFDZiwwQkFBTSxFQUFFLElBQUk7aUJBQ2YsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRTtBQUN0Qiw0QkFBUSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDNUIsNEJBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDOztBQUVwQyw0QkFBUSxDQUFDLElBQUksR0FBRyxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6RCw0QkFBUSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7QUFDL0MsNEJBQVEsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0FBQ3hCLDRCQUFRLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2lCQUM5QixFQUFFLFVBQVUsS0FBSyxFQUFFO0FBQ2hCLDRCQUFRLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUM1Qiw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDN0IsNEJBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQzFCLENBQUMsQ0FBQzthQUNOLE1BQ0k7QUFDRCx3QkFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsOENBQThDLEdBQUcsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ2xGLHdCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQzFCO0FBQ0QsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7O1dBbkhRLElBQUk7Ozs7Ozs7Ozs7Ozs7Ozs7NEJDM0dRLGtCQUFrQjs7MkJBQ1gsaUJBQWlCOzswQkFDMUIsZ0JBQWdCOzt3QkFDVCxjQUFjOzswQkFDZixnQkFBZ0I7O0FBQzdDLElBQUksUUFBUSxHQUFHLDRCQUFjLENBQUM7QUFDOUIsSUFBSSxTQUFTLEdBQUcsNkJBQTZCLENBQUM7QUFDOUMsSUFBSSxhQUFhLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDakMsSUFBSSxjQUFjLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7O0lBQ3RCLE1BQU07Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWlCSixhQWpCRixNQUFNLEdBaUJEOzhCQWpCTCxNQUFNOztBQWtCWCxZQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsWUFBSSxDQUFDLE1BQU0sR0FBRyx1QkFBVztBQUNyQixvQkFBUSxFQUFFLGVBQWU7U0FDNUIsQ0FBQyxDQUFDO0FBQ0gsWUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7QUFDckIsWUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7QUFDdEIsWUFBSSxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUM7QUFDaEMsWUFBSSxDQUFDLFFBQVEsR0FBRyw4QkFBa0IsQ0FBQztBQUNuQyxZQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6QixnQ0FBYyxPQUFPLENBQUMsWUFBWTtBQUM5QixnQkFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQ2xCLGdCQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUNyQixnQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztTQUM1QyxDQUFDLENBQUM7S0FDTjs7Ozs7Ozs7Ozs7aUJBaENRLE1BQU07O2VBeUNMLHNCQUFHO0FBQ1QsZ0JBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtBQUNkLHVCQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7YUFDdkI7QUFDRCxnQkFBSSxPQUFPLFdBQVcsS0FBSyxXQUFXLEVBQUU7QUFDcEMsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFHQUFxRyxDQUFDLENBQUM7QUFDeEgsdUJBQU8sS0FBSyxDQUFDO2FBQ2hCO0FBQ0QsZ0JBQUksQ0FBQyxPQUFPLEdBQUcsV0FBVyxDQUFDO0FBQzNCLG1CQUFPLFdBQVcsQ0FBQztTQUN0Qjs7Ozs7Ozs7ZUFLUyxzQkFBRztBQUNULGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksQ0FBQyxPQUFPLENBQUMsWUFBWTtBQUNyQixvQkFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUU7QUFDbkIsd0JBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO2lCQUM5RTthQUNKLENBQUMsQ0FBQztTQUNOOzs7Ozs7Ozs7O2VBT0ksaUJBQUc7QUFDSixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZO0FBQ3JCLG9CQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRTtBQUNuQix3QkFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLFVBQVUsTUFBTSxFQUFFO0FBQzNFLDRCQUFJLE1BQU0sSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFO0FBQzdCLGdDQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQzNDLG9DQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO3lCQUMxQixNQUNJO0FBQ0QsZ0NBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFDekMsb0NBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7eUJBQzNCO3FCQUNKLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDaEIsNEJBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7QUFDckUsZ0NBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7cUJBQzFCLENBQUMsQ0FBQztpQkFDTixNQUNJO0FBQ0QsNEJBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7aUJBQzlCO2FBQ0osQ0FBQyxDQUFDO0FBQ0gsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7Ozs7Ozs7Ozs7ZUFRTyxvQkFBRztBQUNQLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksUUFBUSxHQUFHLGtDQUFxQixDQUFDO0FBQ3JDLGdCQUFJLENBQUMsT0FBTyxDQUFDLFlBQVk7QUFDckIsb0JBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFO0FBQ25CLHdCQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsTUFBTSxFQUFFO0FBQzVELDRCQUFJLE1BQU0sS0FBSyxNQUFNLElBQUksTUFBTSxLQUFLLE9BQU8sRUFBRTtBQUN6QyxvQ0FBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQzt5QkFDM0IsTUFDSTtBQUNELGdDQUFJLE1BQU0sS0FBSyxNQUFNLEVBQUU7QUFDbkIsb0NBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7NkJBQ3pDO0FBQ0Qsb0NBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxDQUFDO3lCQUN2QztxQkFDSixFQUFFLFVBQVUsS0FBSyxFQUFFO0FBQ2hCLGdDQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO3FCQUMxQixDQUFDLENBQUM7aUJBQ04sTUFDSTtBQUNELDRCQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2lCQUM5QjthQUNKLENBQUMsQ0FBQztBQUNILG1CQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7U0FDM0I7Ozs7Ozs7Ozs7O2VBUU0sbUJBQUc7QUFDTixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZO0FBQ3JCLG9CQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRTtBQUNuQix3QkFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLE1BQU0sRUFBRTtBQUMzRCw0QkFBSSxNQUFNLEtBQUssTUFBTSxFQUFFO0FBQ25CLG9DQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3lCQUMzQixNQUNJO0FBQ0QsZ0NBQUksTUFBTSxLQUFLLE1BQU0sRUFBRTtBQUNuQixvQ0FBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQzs2QkFDM0M7QUFDRCxvQ0FBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQzt5QkFDNUI7cUJBQ0osRUFBRSxVQUFVLEtBQUssRUFBRTtBQUNoQixnQ0FBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztxQkFDMUIsQ0FBQyxDQUFDO2lCQUNOLE1BQ0k7QUFDRCw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztpQkFDOUI7YUFDSixDQUFDLENBQUM7QUFDSCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7Ozs7Ozs7Ozs7ZUFTRyxnQkFBRztBQUNILGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksQ0FBQyxPQUFPLENBQUMsWUFBWTtBQUNyQixvQkFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUU7QUFDbkIsd0JBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztpQkFDakQ7YUFDSixDQUFDLENBQUM7U0FDTjs7Ozs7Ozs7OztlQU9JLGVBQUMsT0FBTyxFQUFFO0FBQ1gsZ0JBQUksUUFBUSxHQUFHLGtDQUFxQixDQUFDO0FBQ3JDLGdCQUFJLElBQUksR0FBRyxPQUFPLElBQUksRUFBRSxDQUFDO0FBQ3pCLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksT0FBTyxJQUFJLENBQUMsWUFBWSxLQUFLLFdBQVcsRUFBRTtBQUMxQyxvQkFBSSxDQUFDLFlBQVksR0FBRyxhQUFhLENBQUM7YUFDckM7QUFDRCxnQkFBSSxPQUFPLElBQUksQ0FBQyxRQUFRLEtBQUssV0FBVyxFQUFFO0FBQ3RDLG9CQUFJLENBQUMsUUFBUSxHQUFHLGNBQWMsQ0FBQzthQUNsQztBQUNELHFCQUFTLGVBQWUsR0FBRztBQUN2QixvQkFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLFNBQVMsRUFBRTtBQUNuQyx3QkFBSSxTQUFTLEVBQUU7QUFDWCxnQ0FBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztxQkFDOUI7aUJBQ0osRUFBRSxVQUFVLEdBQUcsRUFBRTtBQUNkLHdCQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQywrQkFBK0IsR0FBRyxHQUFHLENBQUMsQ0FBQztpQkFDM0QsQ0FBQyxDQUFDOzs7QUFHSCxvQkFBSSxJQUFJLENBQUMsYUFBYSxFQUFFO0FBQ3BCLHdCQUFJLENBQUMsYUFBYSxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztpQkFDOUU7YUFDSjs7QUFFRCxnQkFBSSxDQUFDLGFBQWEsR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDL0UsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7Ozs7Ozs7ZUFLTSxtQkFBRztBQUNOLHdCQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ2pDLGdCQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztTQUM3Qjs7Ozs7Ozs7OztlQU9HLGdCQUFHO0FBQ0gsZ0JBQUksUUFBUSxHQUFHLGtDQUFxQixDQUFDO0FBQ3JDLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksQ0FBQyxPQUFPLENBQUMsWUFBWTtBQUNyQixvQkFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUU7QUFDbkIsd0JBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsVUFBVSxNQUFNLEVBQUU7QUFDeEQsZ0NBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7cUJBQzVCLEVBQUUsVUFBVSxHQUFHLEVBQUU7QUFDZCxnQ0FBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztxQkFDeEIsQ0FBQyxDQUFDO2lCQUNOLE1BQ0k7QUFDRCw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztpQkFDOUI7YUFDSixDQUFDLENBQUM7QUFDSCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7Ozs7Ozs7ZUFNVSx1QkFBRztBQUNWLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLENBQUMsT0FBTyxDQUFDLFlBQVk7QUFDckIsb0JBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFO0FBQ25CLHdCQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsTUFBTSxFQUFFO0FBQy9ELGdDQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO3FCQUM1QixFQUFFLFVBQVUsR0FBRyxFQUFFO0FBQ2QsZ0NBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7cUJBQ3hCLENBQUMsQ0FBQztpQkFDTixNQUNJO0FBQ0QsNEJBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7aUJBQzlCO2FBQ0osQ0FBQyxDQUFDO0FBQ0gsbUJBQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQztTQUMzQjs7Ozs7Ozs7OztlQU9ZLHVCQUFDLElBQUksRUFBRTtBQUNoQixnQkFBSSxRQUFRLEdBQUcsa0NBQXFCLENBQUM7QUFDckMsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZO0FBQ3JCLG9CQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRTtBQUNuQix3QkFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxNQUFNLEVBQUU7QUFDdkUsZ0NBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7cUJBQzVCLEVBQUUsVUFBVSxHQUFHLEVBQUU7QUFDZCxnQ0FBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztxQkFDeEIsQ0FBQyxDQUFDO2lCQUNOLE1BQ0k7QUFDRCw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztpQkFDOUI7YUFDSixDQUFDLENBQUM7QUFDSCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7Ozs7Ozs7OztlQVFVLHFCQUFDLElBQUksRUFBRTtBQUNkLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLENBQUMsT0FBTyxDQUFDLFlBQVk7QUFDckIsb0JBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFO0FBQ25CLHdCQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLE1BQU0sRUFBRTtBQUNyRSxnQ0FBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7cUJBQ3JDLEVBQUUsVUFBVSxHQUFHLEVBQUU7QUFDZCxnQ0FBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztxQkFDeEIsQ0FBQyxDQUFDO2lCQUNOLE1BQ0k7QUFDRCw0QkFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztpQkFDOUI7YUFDSixDQUFDLENBQUM7QUFDSCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7Ozs7Ozs7OztlQVFTLG9CQUFDLFVBQVUsRUFBRTtBQUNuQixnQkFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7U0FDakM7Ozs7Ozs7OztlQU1LLGdCQUFDLFNBQVMsRUFBRTtBQUNkLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFlBQVksR0FBRyxLQUFLLENBQUM7QUFDekIsZ0JBQUksT0FBTyxTQUFTLEtBQUssV0FBVyxFQUFFO0FBQ2xDLDRCQUFZLEdBQUcsU0FBUyxDQUFDO2FBQzVCO0FBQ0QsZ0JBQUksQ0FBQyxPQUFPLENBQUMsWUFBWTtBQUNyQixvQkFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUU7O0FBRW5CLHdCQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsTUFBTSxFQUFFO0FBQ2hDLDRCQUFJLE1BQU0sS0FBSyxJQUFJLEVBQUU7O0FBRWpCLGdDQUFJLGdCQUFnQixHQUFHLENBQUMsQ0FBQztBQUN6QixnQ0FBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRTtBQUNuQyxvQ0FBSSxDQUFDLE1BQU0sRUFBRTtBQUNULDRDQUFRLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7aUNBQ3JDO0FBQ0Qsb0NBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxNQUFNLEVBQUU7QUFDbEMsd0NBQUksQ0FBQyxNQUFNLEVBQUU7QUFDVCxnREFBUSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3FDQUN2QztBQUNELHdDQUFJLENBQUMsWUFBWSxFQUFFO0FBQ2YsZ0RBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdkIsNENBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztxQ0FDakQsTUFDSTtBQUNELGdEQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO3FDQUMxQjtpQ0FDSixFQUFFLFVBQVUsS0FBSyxFQUFFO0FBQ2hCLDRDQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2lDQUMxQixFQUFFLFVBQVUsTUFBTSxFQUFFO0FBQ2pCLHdDQUFJLFFBQVEsR0FBRyxnQkFBZ0IsR0FBSSxNQUFNLEdBQUcsQ0FBQyxBQUFDLENBQUM7QUFDL0MsNENBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7aUNBQzdCLENBQUMsQ0FBQzs2QkFDTixFQUFFLFVBQVUsS0FBSyxFQUFFO0FBQ2hCLHdDQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDOzZCQUMxQixFQUFFLFVBQVUsTUFBTSxFQUFFO0FBQ2pCLGdEQUFnQixHQUFJLE1BQU0sR0FBRyxDQUFDLEFBQUMsQ0FBQztBQUNoQyx3Q0FBUSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDOzZCQUNyQyxDQUFDLENBQUM7eUJBQ04sTUFDSTtBQUNELG9DQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO3lCQUMzQjtxQkFDSixFQUFFLFVBQVUsS0FBSyxFQUFFO0FBQ2hCLGdDQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO3FCQUMxQixDQUFDLENBQUM7aUJBQ04sTUFDSTtBQUNELDRCQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2lCQUM5QjthQUNKLENBQUMsQ0FBQztBQUNILG1CQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUM7U0FDM0I7Ozs7Ozs7Ozs7O2VBUU0saUJBQUMsUUFBUSxFQUFFO0FBQ2QsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ2Ysd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNsQixNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLG9CQUFvQixFQUFFLFlBQVk7QUFDL0MsNEJBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDbEIsQ0FBQyxDQUFDO2FBQ047U0FDSjs7O1dBNVlRLE1BQU07Ozs7Ozs7Ozs7Ozs7Ozs7c0JDVEwsVUFBVTs7Ozs7Ozs7Ozs7Ozs7O3VCQ0FWLFlBQVk7Ozs7MkJBQ1osZ0JBQWdCOzs7O3lCQUNoQixjQUFjOzs7O29CQUNkLFFBQVE7Ozs7Ozs7Ozs7Ozs7OzsyQkNISyxpQkFBaUI7OzRCQUNuQixrQkFBa0I7OzBCQUNwQixnQkFBZ0I7O3lCQUNiLGNBQWM7O0FBQ3hDLElBQUksUUFBUSxHQUFHLDRCQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUEyQmpCLGNBQWM7QUFDWixhQURGLGNBQWMsR0FDVDs4QkFETCxjQUFjOztBQUVuQixZQUFJLENBQUMsTUFBTSxHQUFHLHVCQUFXO0FBQ3JCLG9CQUFRLEVBQUUsbUJBQW1CO1NBQ2hDLENBQUMsQ0FBQztBQUNILFlBQUksQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBRyxPQUFPLENBQUM7QUFDOUQsWUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDbkIsWUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7S0FDdEI7Ozs7Ozs7O2lCQVJRLGNBQWM7O2VBY1osdUJBQUc7O0FBRVYsZ0JBQUksS0FBSyxHQUFHLDBDQUEwQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLEVBQUU7QUFDakYsb0JBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztvQkFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEFBQUMsQ0FBQztBQUNwRSx1QkFBTyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ3pCLENBQUMsQ0FBQztBQUNILGdCQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNwQixtQkFBTyxJQUFJLENBQUMsTUFBTSxDQUFDO1NBQ3RCOzs7Ozs7Ozs7OztlQVFHLGNBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRTtBQUN0QixnQkFBSSxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7QUFDdkIsZ0JBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7QUFDcEMsZ0JBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7QUFDeEIsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxDQUFDLEtBQUssRUFBRTtBQUNSLHFCQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2FBQzlCO0FBQ0QsZ0JBQUksY0FBYyxHQUFHO0FBQ2pCLHdCQUFRLEVBQUUsTUFBTTtBQUNoQixxQkFBSyxFQUFFLElBQUksQ0FBQyxZQUFZLEdBQUcsY0FBYztBQUN6QyxzQkFBTSxFQUFFO0FBQ0osMkJBQU8sRUFBRSxLQUFLO2lCQUNqQjthQUNKLENBQUM7QUFDRix3Q0FBZSxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWTtBQUM1QyxvQkFBSSxJQUFJLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUN2QyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsNENBQTRDLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDdkUsb0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO0FBQzdDLG9CQUFLLE9BQU8sUUFBUSxLQUFLLFVBQVUsRUFBRztBQUNsQyw0QkFBUSxDQUFDLHlCQUFjLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2lCQUN4QztBQUNELG9CQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7YUFDaEIsRUFBRSxVQUFVLEtBQUssRUFBRTtBQUNoQixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkNBQTZDLEdBQUcsS0FBSyxDQUFDLENBQUM7YUFDNUUsQ0FBQyxDQUFDO1NBQ047Ozs7Ozs7O2VBS29CLGlDQUFHO0FBQ3BCLGdCQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUNkLHVCQUFPLEtBQUssQ0FBQzthQUNoQjtBQUNELGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksY0FBYyxHQUFHO0FBQ2pCLHdCQUFRLEVBQUUsS0FBSztBQUNmLHFCQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksR0FBRyxxQkFBcUIsR0FBRyxJQUFJLENBQUMsTUFBTTtBQUM5RCxzQkFBTSxFQUFFLElBQUk7YUFDZixDQUFDO0FBQ0Ysd0NBQWUsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsTUFBTSxFQUFFO0FBQ2xELG9CQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtBQUM3Qix3QkFBSSxPQUFPLEdBQUc7QUFDVixpQ0FBUyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU87QUFDdEMsK0JBQU8sRUFBRSxrQkFBa0I7cUJBQzlCLENBQUM7QUFDRix3QkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMEZBQTBGLENBQUMsQ0FBQztBQUM3Ryx3QkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLENBQUM7aUJBQzFEO2FBQ0osRUFBRSxVQUFVLEtBQUssRUFBRTtBQUNoQixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsMENBQTBDLEdBQUcsS0FBSyxDQUFDLENBQUM7YUFDekUsQ0FBQyxDQUFDO1NBQ047Ozs7Ozs7O2VBS0ksaUJBQUc7O0FBRUosZ0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLENBQUM7QUFDbkQsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDZCxvQkFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsWUFBWTtBQUFFLHdCQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztpQkFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQ2xGO1NBQ0o7Ozs7Ozs7O2VBS0csZ0JBQUc7QUFDSCxnQkFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO0FBQ2IsNkJBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDOUI7U0FDSjs7O1dBeEdRLGNBQWM7Ozs7Ozs7Ozs7Ozs7Ozs7SUMvQmQsb0JBQW9CO0FBQ2xCLGFBREYsb0JBQW9CLEdBQ2Y7OEJBREwsb0JBQW9COztBQUV6QixZQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNwQixZQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztLQUN2Qjs7aUJBSlEsb0JBQW9COzthQUtoQixlQUFHO0FBQ1osbUJBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztTQUN0Qjs7O2FBQ1ksZUFBRztBQUNaLG1CQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7U0FDdEI7OztXQVZRLG9CQUFvQjs7Ozs7SUFZcEIsV0FBVztBQUNULGFBREYsV0FBVyxDQUNSLEdBQUcsRUFBRTs4QkFEUixXQUFXOztBQUVoQixZQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsSUFBSSxFQUFFLENBQUM7QUFDdEIsWUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFOztBQUUzQixnQkFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEdBQUc7QUFDdkIsMkJBQVcsRUFBRSxLQUFLO0FBQ2xCLDRCQUFZLEVBQUUsSUFBSTthQUNyQixDQUFDO1NBQ0w7QUFDRCxZQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUNyQixZQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQztBQUNoQixZQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUNqQixZQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztBQUNsQixZQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztBQUNsQixZQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztBQUNsQixZQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztLQUNyQjs7aUJBakJRLFdBQVc7O2VBMEJWLHNCQUFHO0FBQ1QsZ0JBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDO0FBQ3RDLGdCQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQztBQUNyQyxnQkFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUM7QUFDckMsZ0JBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDO0FBQ3JDLGdCQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQztBQUNyQyxnQkFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLG9CQUFvQixFQUFFLENBQUM7QUFDdEMsZ0JBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUU7QUFDdEMsb0JBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQzthQUMxQjtBQUNELGdCQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRTtBQUNwQyxvQkFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO2FBQzFCO0FBQ0QsZ0JBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFO0FBQ2xDLG9CQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQzthQUNwRDtTQUNKOzs7ZUFDWSx5QkFBRztBQUNaLG1CQUFPLElBQUksQ0FBQyxJQUFJLENBQUM7U0FDcEI7OztlQUNPLG9CQUFHO0FBQ1AsbUJBQU8sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUM7U0FDbkQ7OzthQXpCVSxlQUFHO0FBQ1YsbUJBQU8sSUFBSSxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUM7U0FDOUI7OztlQVBvQix3QkFBQyxJQUFJLEVBQUU7QUFDeEIsZ0JBQUksT0FBTyxHQUFHLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3BDLG1CQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7QUFDckIsbUJBQU8sT0FBTyxDQUFDO1NBQ2xCOzs7V0F0QlEsV0FBVzs7Ozs7Ozs7Ozs7Ozs7OztJQ1pYLFNBQVM7QUFDUCxhQURGLFNBQVMsQ0FDTixLQUFLLEVBQUU7OEJBRFYsU0FBUzs7QUFFZCxZQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssSUFBSSxJQUFJLENBQUM7S0FDL0I7O2lCQUhRLFNBQVM7O2VBVVYsb0JBQUc7QUFDUCxnQkFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUM7QUFDbEMsbUJBQU8sZ0JBQWdCLEdBQUcsS0FBSyxHQUFHLE1BQU0sQ0FBQztTQUM1Qzs7O2FBVFEsYUFBQyxLQUFLLEVBQUU7QUFDYixnQkFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7U0FDdkI7YUFDUSxlQUFHO0FBQ1IsbUJBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztTQUN0Qjs7O1dBVFEsU0FBUzs7Ozs7Ozs7Ozs7Ozs7Ozt1QkNBRixhQUFhOzs0QkFDUixrQkFBa0I7O3dCQUNNLGNBQWM7OzBCQUN4QyxnQkFBZ0I7OzBCQUNWLGdCQUFnQjs7MkJBQ2xCLGlCQUFpQjs7MkJBQ1osaUJBQWlCOzt3QkFDNUIsY0FBYzs7eUJBQ1QsY0FBYzs7MkJBQ1osZ0JBQWdCOzt1QkFDYixZQUFZOztBQUMzQyxJQUFJLFFBQVEsR0FBRyw0QkFBYyxDQUFDO0FBQzlCLElBQUksVUFBVSxHQUFHLFlBQVksQ0FBQztBQUM5QixJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHLE9BQU8sQ0FBQztBQUM1RCxJQUFJLGdCQUFnQixHQUFHO0FBQ25CLGVBQVcsRUFBRSxxQkFBWTtBQUNyQixlQUFPLFdBQVcsR0FBRyxTQUFTLENBQUM7S0FDbEM7QUFDRCxxQkFBaUIsRUFBRSwyQkFBWTtBQUMzQixlQUFPLFdBQVcsR0FBRyxvQkFBb0IsQ0FBQztLQUM3QztDQUNKLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQTBCVyxJQUFJO0FBQ0YsYUFERixJQUFJLENBQ0QsTUFBTSxFQUFFOzhCQURYLElBQUk7O0FBRVQsWUFBSSxDQUFDLE1BQU0sR0FBRyx1QkFBVztBQUNyQixvQkFBUSxFQUFFLGFBQWE7U0FDMUIsQ0FBQyxDQUFDO0FBQ0gsWUFBSSxRQUFRLEdBQUcsaUJBQVEsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDeEUsZ0JBQVEsQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUM1QyxnQkFBUSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDOztBQUUxQyxZQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUU7QUFDbEMsZ0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLG9FQUFvRSxDQUFDLENBQUM7QUFDeEYsbUJBQU87U0FDVixNQUNJLElBQUksNEJBQWtCLGVBQWUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUU7QUFDbkYsZ0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDZFQUE2RSxDQUFDLENBQUM7QUFDakcsbUJBQU87U0FDVjtBQUNELFlBQUksQ0FBQyxHQUFHLEdBQUcsUUFBUSxDQUFDO0FBQ3BCLFlBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDN0IsWUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztBQUNqQyxZQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztBQUMxQixZQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztBQUNuQixZQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztBQUMzQixZQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNwQixZQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztBQUN0QixZQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztBQUN6QixZQUFJLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO0FBQ2hDLFlBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO0FBQzdCLFlBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO0FBQ3pCLFlBQUksQ0FBQyxRQUFRLEdBQUcsOEJBQWtCLENBQUM7QUFDbkMsWUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7QUFDcEIsWUFBSSxNQUFNLEtBQUssVUFBVSxFQUFFO0FBQ3ZCLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsb0NBQWMsT0FBTyxDQUFDLFlBQVk7QUFDOUIsb0JBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDckIsQ0FBQyxDQUFDO1NBQ047S0FDSjs7aUJBckNRLElBQUk7O2VBNkNFLDJCQUFHO0FBQ2QsZ0JBQUksT0FBTyxHQUFHLDRCQUFrQixVQUFVLEVBQUUsQ0FBQztBQUM3QyxnQkFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQzFELGdCQUFJLEtBQUssRUFBRTtBQUNQLHVCQUFPLHlCQUFjLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUNyQztBQUNELG1CQUFPLElBQUksQ0FBQztTQUNmOzs7ZUFDZ0IsNkJBQUc7QUFDaEIsZ0JBQUksT0FBTyxHQUFHLDRCQUFrQixVQUFVLEVBQUUsQ0FBQztBQUM3QyxtQkFBTyxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1NBQy9DOzs7Ozs7Ozs7Ozs7Ozs7OztlQWNHLGNBQUMsTUFBTSxFQUFFO0FBQ1QsZ0JBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUN0QixnQkFBSSxPQUFPLE1BQU0sS0FBSyxXQUFXLEVBQUU7QUFDL0Isc0JBQU0sR0FBRyxFQUFFLENBQUM7YUFDZjtBQUNELGdCQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRTtBQUM1QixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztBQUM1RCx1QkFBTzthQUNWO0FBQ0QsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUU7QUFDdEIsc0JBQU0sQ0FBQyxZQUFZLEdBQUcsRUFBRSxDQUFDO2FBQzVCO0FBQ0QsZ0JBQUksNEJBQWtCLGVBQWUsRUFBRSxFQUFFOztBQUVyQyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFO0FBQzlCLDBCQUFNLENBQUMsWUFBWSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7aUJBQ3BDO0FBQ0Qsb0JBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUU7QUFDdkMsMEJBQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztpQkFDMUQ7YUFDSjs7QUFFRCxnQkFBSSxNQUFNLENBQUMsVUFBVSxFQUFFO0FBQ25CLG9CQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2FBQy9DO0FBQ0QsZ0JBQUksTUFBTSxDQUFDLGNBQWMsRUFBRTtBQUN2QixvQkFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQzthQUN2RDtBQUNELGdCQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUU7QUFDaEIsb0JBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDekM7QUFDRCxnQkFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7QUFDdEIsZ0JBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0FBQ3JCLGdCQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztBQUNuRSxtQkFBTyxJQUFJLENBQUM7U0FDZjs7O2VBQ1EsbUJBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRTtBQUN0QixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLFFBQVEsR0FBRyxrQ0FBcUIsQ0FBQztBQUNyQyxnQkFBSSxJQUFJLEdBQUcsT0FBTyxJQUFJLEVBQUUsQ0FBQztBQUN6QixnQkFBSSxLQUFLLENBQUMsS0FBSyxFQUFFO0FBQ2IscUJBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO2FBQ3ZCO0FBQ0QsZ0JBQUksU0FBUyxHQUFHO0FBQ1osdUJBQU8sRUFBRSxLQUFLO0FBQ2Qsd0JBQVEsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQzthQUNuQyxDQUFDO0FBQ0YsZ0JBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQ25CLG9CQUFJLElBQUksR0FBRyxlQUFLLE9BQU8sRUFBRSxDQUFDO0FBQzFCLG9CQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRTtBQUN4Qiw2QkFBUyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO2lCQUMvQjthQUNKO0FBQ0QsZ0JBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFO0FBQ3ZCLDRDQUFlO0FBQ1gseUJBQUssRUFBRSxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUU7QUFDbkMsNEJBQVEsRUFBRSxNQUFNO0FBQ2hCLDBCQUFNLEVBQUUsU0FBUztpQkFDcEIsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLE1BQU0sRUFBRTtBQUN0Qix3QkFBSSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUM7QUFDN0Isd0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQy9DLHdCQUFJLFNBQVMsQ0FBQyxPQUFPLEVBQUU7QUFDbkIsNEJBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLDRCQUE0QixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztxQkFDdEU7QUFDRCw0QkFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztpQkFDNUIsRUFBRSxVQUFVLEtBQUssRUFBRTtBQUNoQix3QkFBSSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUM7QUFDN0Isd0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3pCLDRCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUMxQixDQUFDLENBQUM7YUFDTixNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdEQUFnRCxDQUFDLENBQUM7QUFDbkUsd0JBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDMUI7U0FDSjs7Ozs7Ozs7OztlQU9PLGtCQUFDLFFBQVEsRUFBRTtBQUNmLGdCQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUM3QixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLGdCQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRTtBQUN6QixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsOENBQThDLENBQUMsQ0FBQztBQUNqRSx1QkFBTyxLQUFLLENBQUM7YUFDaEI7QUFDRCxnQkFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztBQUMvQixnQkFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZO0FBQ3JCLG9CQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO0FBQ2xCLHdCQUFJLFlBQVksR0FBRyw2QkFBb0IsQ0FBQztBQUN4Qyx3QkFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7QUFDbEMsd0JBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0FBQzdCLGdDQUFZLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztBQUNsQyx3QkFBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztBQUNoQyx3QkFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7aUJBQzNCLE1BQ0k7QUFDRCx3QkFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDckUsd0JBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxVQUFVLElBQUksRUFBRTtBQUM1Qyw0QkFBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztBQUNoQyw0QkFBSSxDQUFDLEtBQUssR0FBRyx5QkFBYyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDaEQsNEJBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO0FBQ3hCLDRCQUFLLE9BQU8sUUFBUSxLQUFLLFVBQVUsRUFBRztBQUNsQyxvQ0FBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQzt5QkFDekI7cUJBQ0osQ0FBQyxDQUFDO0FBQ0gsd0JBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO0FBQ2xDLHdCQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztpQkFDaEM7QUFDRCxvQkFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7YUFDM0IsQ0FBQyxDQUFDO1NBQ047Ozs7Ozs7OztlQU1TLHNCQUFHO0FBQ1QsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxRQUFRLEdBQUcsa0NBQXFCLENBQUM7QUFDckMsZ0JBQUksUUFBUSxHQUFHLElBQUksQ0FBQztBQUNwQixnQkFBSSw0QkFBa0IsZUFBZSxFQUFFLEVBQUU7QUFDckMsd0JBQVEsR0FBRyxTQUFTLENBQUM7YUFDeEIsTUFDSSxJQUFJLDRCQUFrQixXQUFXLEVBQUUsRUFBRTtBQUN0Qyx3QkFBUSxHQUFHLEtBQUssQ0FBQzthQUNwQjtBQUNELGdCQUFJLENBQUMsUUFBUSxFQUFFO0FBQ1gsd0JBQVEsQ0FBQyxNQUFNLENBQUMscURBQXFELENBQUMsQ0FBQzthQUMxRTtBQUNELGdCQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFO0FBQ3hCLG9CQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDZCx3QkFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFHLEVBQUUsWUFBWSxFQUFHLENBQUMsQ0FBQztpQkFDN0Q7QUFDRCw0Q0FBZTtBQUNYLHlCQUFLLEVBQUUsZ0JBQWdCLENBQUMsZUFBZSxFQUFFO0FBQ3pDLDRCQUFRLEVBQUUsTUFBTTtBQUNoQiwwQkFBTSxFQUFFO0FBQ0osa0NBQVUsRUFBRSxRQUFRO0FBQ3BCLCtCQUFPLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLEtBQUs7cUJBQ3hDO2lCQUNKLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxNQUFNLEVBQUU7QUFDdEIsd0JBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7QUFDOUIsd0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLDJCQUEyQixHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUM3RSx3QkFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7QUFDekIsNEJBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7aUJBQzVCLEVBQUUsVUFBVSxLQUFLLEVBQUU7QUFDaEIsd0JBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7QUFDOUIsd0JBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3pCLDRCQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUMxQixDQUFDLENBQUM7YUFDTixNQUNJO0FBQ0Qsb0JBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlEQUFpRCxDQUFDLENBQUM7QUFDcEUsd0JBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDMUI7QUFDRCxtQkFBTyxRQUFRLENBQUMsT0FBTyxDQUFDO1NBQzNCOzs7Ozs7Ozs7O2VBT1Msb0JBQUMsWUFBWSxFQUFFO0FBQ3JCLG1CQUFPLFlBQVksQ0FBQyxPQUFPLENBQUM7U0FDL0I7Ozs7Ozs7Ozs7ZUFPa0IsNkJBQUMsUUFBUSxFQUFFO0FBQzFCLGdCQUFJLE9BQU8sUUFBUSxLQUFLLFVBQVUsRUFBRTtBQUNoQyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMERBQTBELENBQUMsQ0FBQztBQUM3RSx1QkFBTyxLQUFLLENBQUM7YUFDaEI7QUFDRCxnQkFBSSxDQUFDLGdCQUFnQixHQUFHLFFBQVEsQ0FBQztBQUNqQyxtQkFBTyxJQUFJLENBQUM7U0FDZjs7Ozs7Ozs7OztlQU9zQixpQ0FBQyxRQUFRLEVBQUU7QUFDOUIsZ0JBQUksT0FBTyxRQUFRLEtBQUssVUFBVSxFQUFFO0FBQ2hDLG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyw4REFBOEQsQ0FBQyxDQUFDO0FBQ2pGLHVCQUFPLEtBQUssQ0FBQzthQUNoQjtBQUNELGdCQUFJLENBQUMsb0JBQW9CLEdBQUcsUUFBUSxDQUFDO0FBQ3JDLG1CQUFPLElBQUksQ0FBQztTQUNmOzs7Ozs7Ozs7O2VBT2UsMEJBQUMsUUFBUSxFQUFFO0FBQ3ZCLGdCQUFJLE9BQU8sUUFBUSxLQUFLLFVBQVUsRUFBRTtBQUNoQyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsdURBQXVELENBQUMsQ0FBQztBQUMxRSx1QkFBTyxLQUFLLENBQUM7YUFDaEI7QUFDRCxnQkFBSSxDQUFDLGFBQWEsR0FBRyxRQUFRLENBQUM7QUFDOUIsbUJBQU8sSUFBSSxDQUFDO1NBQ2Y7OztlQUN5QixzQ0FBRztBQUN6QixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLHFCQUFTLFFBQVEsQ0FBQyxJQUFJLEVBQUU7QUFDcEIsb0JBQUksQ0FBQyxLQUFLLEdBQUcseUJBQWMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQ2hELG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDdkU7QUFDRCxtQkFBTyxRQUFRLENBQUM7U0FDbkI7OztlQUN5QixzQ0FBRztBQUN6QixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLHFCQUFTLFFBQVEsQ0FBQyxZQUFZLEVBQUU7QUFDNUIsb0JBQUksQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN4QyxvQkFBSSxPQUFPLEdBQUcseUJBQVksY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQ3ZELG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsR0FBRyxPQUFPLENBQUMsQ0FBQztBQUM5RCxvQkFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRTtBQUNoRCx5QkFBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDdkI7YUFDSjtBQUNELG1CQUFPLFFBQVEsQ0FBQztTQUNuQjs7O2VBQ2tCLCtCQUFHO0FBQ2xCLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIscUJBQVMsUUFBUSxDQUFDLEdBQUcsRUFBRTtBQUNuQixvQkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztBQUN2RCxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDMUI7QUFDRCxtQkFBTyxRQUFRLENBQUM7U0FDbkI7OztlQUNnQiw2QkFBRztBQUNoQixnQkFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hCLHFCQUFTLFFBQVEsQ0FBQyxJQUFJLEVBQUU7QUFDcEIsb0JBQUksQ0FBQyxLQUFLLEdBQUcseUJBQWMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQ2hELG9CQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRTtBQUN2QiwyQkFBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2lCQUM3QzthQUNKO0FBQ0QsbUJBQU8sUUFBUSxDQUFDO1NBQ25COzs7ZUFDb0IsaUNBQUc7QUFDcEIsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixxQkFBUyxRQUFRLENBQUMsWUFBWSxFQUFFO0FBQzVCLG9CQUFJLENBQUMsb0JBQW9CLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDeEMsb0JBQUksT0FBTyxHQUFHLHlCQUFZLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN2RCxvQkFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUU7QUFDM0IsMkJBQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDO2lCQUM3QzthQUNKO0FBQ0QsbUJBQU8sUUFBUSxDQUFDO1NBQ25COzs7ZUFDYSwwQkFBRztBQUNiLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIscUJBQVMsUUFBUSxDQUFDLEdBQUcsRUFBRTtBQUNuQixvQkFBSSxJQUFJLENBQUMsYUFBYSxFQUFFO0FBQ3BCLDJCQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ2xDO2FBQ0o7QUFDRCxtQkFBTyxRQUFRLENBQUM7U0FDbkI7Ozs7Ozs7Ozs7ZUFPeUIsc0NBQUc7QUFDekIsZ0JBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUU7QUFDcEIsb0JBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRTtBQUNuQix3QkFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDLENBQUM7QUFDbkUsd0JBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO0FBQ25FLHdCQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQztpQkFDeEQsTUFDSTtBQUNELHdCQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUNuQiw0QkFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUMsQ0FBQztBQUN4RSw0QkFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUMsQ0FBQztBQUMvRSw0QkFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQztxQkFDcEU7aUJBQ0o7YUFDSjtTQUNKOzs7Ozs7Ozs7ZUFNb0IsaUNBQUc7QUFDcEIsZ0JBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRTtBQUNuQixvQkFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7QUFDMUQsb0JBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO0FBQzlELG9CQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7YUFDbkQsTUFDSTtBQUNELG9CQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUNuQix3QkFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztBQUMvRCx3QkFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQztBQUMxRSx3QkFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7aUJBQy9EO2FBQ0o7U0FDSjs7Ozs7Ozs7Ozs7O2VBU21CLDhCQUFDLFlBQVksRUFBRTtBQUMvQixnQkFBSSxDQUFDLGFBQWEsR0FBRyxZQUFZLENBQUM7QUFDbEMsZ0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1NBQ3RFOzs7OztlQUVhLDBCQUFHO0FBQ2IsZ0JBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoQixnQkFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDO0FBQ3RCLGdCQUFJO0FBQ0EsMEJBQVUsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7YUFDeEMsQ0FDRCxPQUFPLENBQUMsRUFBRTtBQUNOLG9CQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyw4REFBOEQsQ0FBQyxDQUFDO2FBQ3BGO0FBQ0QsZ0JBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxDQUFDLFVBQVUsS0FBSyw0QkFBa0IsV0FBVyxFQUFFLElBQUksNEJBQWtCLGVBQWUsRUFBRSxDQUFBLEFBQUMsRUFBRTtBQUM5RyxvQkFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkZBQTZGLENBQUMsQ0FBQzthQUNwSDtBQUNELG1CQUFPLFVBQVUsQ0FBQztTQUNyQjs7Ozs7Ozs7O2VBTVkseUJBQUc7QUFDWixtQkFBTyxJQUFJLENBQUMsT0FBTyxDQUFDO1NBQ3ZCOzs7Ozs7Ozs7OztlQVFNLGlCQUFDLFFBQVEsRUFBRTtBQUNkLGdCQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFDaEIsZ0JBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUNmLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDbEIsTUFDSTtBQUNELG9CQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxZQUFZO0FBQzdDLDRCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQ2xCLENBQUMsQ0FBQzthQUNOO1NBQ0o7OzthQTVZUSxhQUFDLEdBQUcsRUFBRTtBQUNYLGdCQUFJLE9BQU8sR0FBRyw0QkFBa0IsVUFBVSxFQUFFLENBQUM7QUFDN0MsZ0JBQUksR0FBRyxnQ0FBcUIsRUFBRTtBQUMxQix1QkFBTyxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQzthQUN0RTtBQUNELGdCQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztTQUNyQjs7O1dBNUNRLElBQUk7Ozs7Ozs7Ozs7Ozs7Ozs7b0JDL0NILFFBQVE7Ozs7Ozs7Ozs7OztBQ0FmLFNBQVMsVUFBVSxHQUFTO3NDQUFMLEdBQUc7QUFBSCxXQUFHOzs7QUFDN0IsT0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDbkIsU0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDdkMsWUFBSSxHQUFHLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3ZCLFlBQUksQ0FBQyxHQUFHLEVBQUU7QUFDTixxQkFBUztTQUNaO0FBQ0QsYUFBSyxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFDakIsZ0JBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRTtBQUN6QixvQkFBSSxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxRQUFRLEVBQUU7QUFDOUIsdUJBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2lCQUM3QyxNQUNJO0FBQ0QsdUJBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ3ZCO2FBQ0o7U0FDSjtLQUNKO0FBQ0QsV0FBTyxHQUFHLENBQUM7Q0FDZDs7O0FDbkJEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5ZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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Q0FBQyxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7V0FDL0I7U0FDRjs7O2FBdEJHLGlCQUFpQjs7O0FBeUJ2QixXQUFPLElBQUksaUJBQWlCLEVBQUUsQ0FBQztHQUNoQyxDQUFDLENBQUMsQ0FFRixPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsWUFBVztBQUNqQyxRQUFJLENBQUMsZ0JBQWdCLEVBQUU7QUFDckIsc0JBQWdCLEdBQUcsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0tBQ2pEO0FBQ0QsV0FBTyxnQkFBZ0IsQ0FBQztHQUN6QixDQUFDLENBQUMsQ0FFRixHQUFHLENBQUMsQ0FBQyxZQUFZLEVBQUUsa0JBQWtCLEVBQUUsVUFBUyxVQUFVLEVBQUUsZ0JBQWdCLEVBQUU7O0FBRTdFLGNBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLGdDQUFnQyxFQUFFLFVBQVMsWUFBWSxFQUFFO0FBQzlFLGtCQUFZLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDOUQsVUFBSSxZQUFZLElBQUksWUFBWSxDQUFDLEdBQUcsRUFBRTtBQUNwQyxZQUFJLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLElBQUksSUFBSSxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyxJQUFJLEVBQUU7QUFDeEUsMEJBQWdCLENBQUMsc0JBQXNCLENBQUMsWUFBWSxDQUFDLENBQUM7U0FDdkQ7T0FDRjtLQUNGLENBQUMsQ0FBQztHQUVKLENBQUMsQ0FBQyxDQUFDO0NBQ0wiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IHsgQVBJUmVxdWVzdCB9IGZyb20gXCIuLi9jb3JlL3JlcXVlc3RcIjtcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IFNldHRpbmdzIH0gZnJvbSBcIi4uL2NvcmUvc2V0dGluZ3NcIjtcbmltcG9ydCB7IElvbmljUGxhdGZvcm1Db3JlIH0gZnJvbSBcIi4uL2NvcmUvY29yZVwiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4uL2NvcmUvbG9nZ2VyXCI7XG5pbXBvcnQgeyBCdWNrZXRTdG9yYWdlIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLi9jb3JlL3VzZXJcIjtcbmltcG9ydCB7IGRlZXBFeHRlbmQgfSBmcm9tIFwiLi4vdXRpbC91dGlsXCI7XG52YXIgc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcbnZhciBBTkFMWVRJQ1NfS0VZID0gbnVsbDtcbnZhciBERUZFUl9SRUdJU1RFUiA9IFwiREVGRVJfUkVHSVNURVJcIjtcbnZhciBvcHRpb25zID0ge307XG52YXIgZ2xvYmFsUHJvcGVydGllcyA9IHt9O1xudmFyIGdsb2JhbFByb3BlcnRpZXNGbnMgPSBbXTtcbmV4cG9ydCBjbGFzcyBBbmFseXRpY3Mge1xuICAgIGNvbnN0cnVjdG9yKGNvbmZpZykge1xuICAgICAgICB0aGlzLl9kaXNwYXRjaGVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5fZGlzcGF0Y2hJbnRlcnZhbFRpbWUgPSAzMDtcbiAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fc2VydmljZUhvc3QgPSBzZXR0aW5ncy5nZXRVUkwoJ2FuYWx5dGljcycpO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBBbmFseXRpY3M6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zdG9yYWdlID0gSW9uaWNQbGF0Zm9ybUNvcmUuZ2V0U3RvcmFnZSgpO1xuICAgICAgICB0aGlzLmNhY2hlID0gbmV3IEJ1Y2tldFN0b3JhZ2UoJ2lvbmljX2FuYWx5dGljcycpO1xuICAgICAgICB0aGlzLl9hZGRHbG9iYWxQcm9wZXJ0eURlZmF1bHRzKCk7XG4gICAgICAgIGlmIChjb25maWcgIT09IERFRkVSX1JFR0lTVEVSKSB7XG4gICAgICAgICAgICB0aGlzLnJlZ2lzdGVyKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgX2FkZEdsb2JhbFByb3BlcnR5RGVmYXVsdHMoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgc2VsZi5zZXRHbG9iYWxQcm9wZXJ0aWVzKGZ1bmN0aW9uIChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSkge1xuICAgICAgICAgICAgZXZlbnREYXRhLl91c2VyID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShVc2VyLmN1cnJlbnQoKSkpO1xuICAgICAgICAgICAgZXZlbnREYXRhLl9hcHAgPSB7XG4gICAgICAgICAgICAgICAgXCJhcHBfaWRcIjogc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICAgICBcImFuYWx5dGljc192ZXJzaW9uXCI6IElvbmljUGxhdGZvcm1Db3JlLlZlcnNpb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgaGFzVmFsaWRTZXR0aW5ncygpIHtcbiAgICAgICAgaWYgKCFzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpIHx8ICFzZXR0aW5ncy5nZXQoJ2FwaV9rZXknKSkge1xuICAgICAgICAgICAgdmFyIG1zZyA9ICdBIHZhbGlkIGFwcF9pZCBhbmQgYXBpX2tleSBhcmUgcmVxdWlyZWQgYmVmb3JlIHlvdSBjYW4gdXRpbGl6ZSAnICtcbiAgICAgICAgICAgICAgICAnYW5hbHl0aWNzIHByb3Blcmx5LiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vdjEuMC9kb2NzL2lvLXF1aWNrLXN0YXJ0JztcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8obXNnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgc2V0IGRpc3BhdGNoSW50ZXJ2YWwodmFsdWUpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAvLyBTZXQgaG93IG9mdGVuIHdlIHNob3VsZCBzZW5kIGJhdGNoZWQgZXZlbnRzLCBpbiBzZWNvbmRzLlxuICAgICAgICAvLyBTZXQgdGhpcyB0byAwIHRvIGRpc2FibGUgZXZlbnQgY2FjaGluZ1xuICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IHZhbHVlO1xuICAgICAgICAvLyBDbGVhciB0aGUgZXhpc3RpbmcgaW50ZXJ2YWxcbiAgICAgICAgaWYgKHRoaXMuX2Rpc3BhdGNoZXIpIHtcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuX2Rpc3BhdGNoZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZSA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyBzZWxmLl9kaXNwYXRjaFF1ZXVlKCk7IH0sIHZhbHVlICogMTAwMCk7XG4gICAgICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IGRpc3BhdGNoSW50ZXJ2YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZTtcbiAgICB9XG4gICAgX2VucXVldWVFdmVudChjb2xsZWN0aW9uTmFtZSwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKG9wdGlvbnMuZHJ5UnVuKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdldmVudCByZWNpZXZlZCBidXQgbm90IHNlbnQgKGRyeVJ1biBhY3RpdmUpOicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhjb2xsZWN0aW9uTmFtZSk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZW5xdWV1aW5nIGV2ZW50IHRvIHNlbmQgbGF0ZXI6Jyk7XG4gICAgICAgIHNlbGYubG9nZ2VyLmluZm8oY29sbGVjdGlvbk5hbWUpO1xuICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIEFkZCB0aW1lc3RhbXAgcHJvcGVydHkgdG8gdGhlIGRhdGFcbiAgICAgICAgaWYgKCFldmVudERhdGEua2Vlbikge1xuICAgICAgICAgICAgZXZlbnREYXRhLmtlZW4gPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBldmVudERhdGEua2Vlbi50aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIC8vIEFkZCB0aGUgZGF0YSB0byB0aGUgcXVldWVcbiAgICAgICAgdmFyIGV2ZW50UXVldWUgPSBzZWxmLmNhY2hlLmdldCgnZXZlbnRfcXVldWUnKSB8fCB7fTtcbiAgICAgICAgaWYgKCFldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgZXZlbnRRdWV1ZVtjb2xsZWN0aW9uTmFtZV0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXS5wdXNoKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIFdyaXRlIHRoZSBxdWV1ZSB0byBkaXNrXG4gICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIGV2ZW50UXVldWUpO1xuICAgIH1cbiAgICBfcmVxdWVzdEFuYWx5dGljc0tleSgpIHtcbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgXCJtZXRob2RcIjogJ0dFVCcsXG4gICAgICAgICAgICBcImpzb25cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwidXJpXCI6IHNldHRpbmdzLmdldFVSTCgnYXBpJykgKyAnL2FwaS92MS9hcHAvJyArIHNldHRpbmdzLmdldCgnYXBwX2lkJykgKyAnL2tleXMvd3JpdGUnLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7XG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBcImJhc2ljIFwiICsgYnRvYShzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpICsgJzonICsgc2V0dGluZ3MuZ2V0KCdhcGlfa2V5JykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9wb3N0RXZlbnQobmFtZSwgZGF0YSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBwYXlsb2FkID0ge1xuICAgICAgICAgICAgXCJuYW1lXCI6IFtkYXRhXVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIUFOQUxZVElDU19LRVkpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdDYW5ub3Qgc2VuZCBldmVudHMgdG8gdGhlIGFuYWx5dGljcyBzZXJ2ZXIgd2l0aG91dCBhbiBBbmFseXRpY3Mga2V5LicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIFwibWV0aG9kXCI6ICdQT1NUJyxcbiAgICAgICAgICAgIFwidXJsXCI6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9hcGkvdjEvZXZlbnRzLycgKyBzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgXCJqc29uXCI6IHBheWxvYWQsXG4gICAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9wb3N0RXZlbnRzKGV2ZW50cykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghQU5BTFlUSUNTX0tFWSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnQ2Fubm90IHNlbmQgZXZlbnRzIHRvIHRoZSBhbmFseXRpY3Mgc2VydmVyIHdpdGhvdXQgYW4gQW5hbHl0aWNzIGtleS4nKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBcIm1ldGhvZFwiOiAnUE9TVCcsXG4gICAgICAgICAgICBcInVybFwiOiBzZWxmLl9zZXJ2aWNlSG9zdCArICcvYXBpL3YxL2V2ZW50cy8nICsgc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgIFwianNvblwiOiBldmVudHMsXG4gICAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9kaXNwYXRjaFF1ZXVlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBldmVudFF1ZXVlID0gdGhpcy5jYWNoZS5nZXQoJ2V2ZW50X3F1ZXVlJykgfHwge307XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhldmVudFF1ZXVlKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIUlvbmljUGxhdGZvcm1Db3JlLmRldmljZUNvbm5lY3RlZFRvTmV0d29yaygpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5zdG9yYWdlLmxvY2tlZEFzeW5jQ2FsbChzZWxmLmNhY2hlLnNjb3BlZEtleSgnZXZlbnRfZGlzcGF0Y2gnKSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuX3Bvc3RFdmVudHMoZXZlbnRRdWV1ZSk7XG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5jYWNoZS5zZXQoJ2V2ZW50X3F1ZXVlJywge30pO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc2VudCBldmVudHMnKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZXZlbnRRdWV1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHNlbGYuX2hhbmRsZURpc3BhdGNoRXJyb3IoZXJyLCB0aGlzLCBldmVudFF1ZXVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIF9nZXRSZXF1ZXN0U3RhdHVzQ29kZShyZXF1ZXN0KSB7XG4gICAgICAgIHZhciByZXNwb25zZUNvZGUgPSBudWxsO1xuICAgICAgICBpZiAocmVxdWVzdCAmJiByZXF1ZXN0LnJlcXVlc3RJbmZvLl9sYXN0UmVzcG9uc2UgJiYgcmVxdWVzdC5yZXF1ZXN0SW5mby5fbGFzdFJlc3BvbnNlLnN0YXR1c0NvZGUpIHtcbiAgICAgICAgICAgIHJlc3BvbnNlQ29kZSA9IHJlcXVlc3QucmVxdWVzdEluZm8uX2xhc3RSZXNwb25zZS5zdGF0dXNDb2RlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZUNvZGU7XG4gICAgfVxuICAgIF9oYW5kbGVEaXNwYXRjaEVycm9yKGVycm9yLCByZXF1ZXN0LCBldmVudFF1ZXVlKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3BvbnNlQ29kZSA9IHRoaXMuX2dldFJlcXVlc3RTdGF0dXNDb2RlKHJlcXVlc3QpO1xuICAgICAgICBpZiAoZXJyb3IgPT09ICdsYXN0X2NhbGxfaW50ZXJydXB0ZWQnKSB7XG4gICAgICAgICAgICBzZWxmLmNhY2hlLnNldCgnZXZlbnRfcXVldWUnLCB7fSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY29ubmVjdCB0byB0aGUgc2VydmVyIGF0IGFsbCAtPiBrZWVwIGV2ZW50c1xuICAgICAgICAgICAgaWYgKCFyZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignRXJyb3Igc2VuZGluZyBhbmFseXRpY3MgZGF0YTogRmFpbGVkIHRvIGNvbm5lY3QgdG8gYW5hbHl0aWNzIHNlcnZlci4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIHt9KTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignRXJyb3Igc2VuZGluZyBhbmFseXRpY3MgZGF0YTogU2VydmVyIHJlc3BvbmRlZCB3aXRoIGVycm9yJyk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXZlbnRRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgX2hhbmRsZVJlZ2lzdGVyRXJyb3IoZXJyb3IsIHJlcXVlc3QpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzcG9uc2VDb2RlID0gdGhpcy5fZ2V0UmVxdWVzdFN0YXR1c0NvZGUocmVxdWVzdCk7XG4gICAgICAgIHZhciBkb2NzID0gJyBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vdjEuMC9kb2NzL2lvLXF1aWNrLXN0YXJ0JztcbiAgICAgICAgc3dpdGNoIChyZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgNDAxOlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdUaGUgYXBpIGtleSBhbmQgYXBwIGlkIHlvdSBwcm92aWRlZCBkaWQgbm90IHJlZ2lzdGVyIG9uIHRoZSBzZXJ2ZXIuICcgKyBkb2NzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgNDA0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdUaGUgYXBwIGlkIHlvdSBwcm92aWRlZCAoXCInICsgc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKSArICdcIikgd2FzIG5vdCBmb3VuZC4nICsgZG9jcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdVbmFibGUgdG8gcmVxdWVzdCBhbmFseXRpY3Mga2V5LicpO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgYW4gYW5hbHl0aWNzIGtleVxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9wdHMgUmVnaXN0cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVnaXN0ZXIgcHJvbWlzZVxuICAgICAqL1xuICAgIHJlZ2lzdGVyKG9wdHMpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghdGhpcy5oYXNWYWxpZFNldHRpbmdzKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgb3B0aW9ucyA9IG9wdHMgfHwge307XG4gICAgICAgIGlmIChvcHRpb25zLnNpbGVudCkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuc2lsZW5jZSgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIudmVyYm9zZSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zLmRyeVJ1bikge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnZHJ5UnVuIG1vZGUgaXMgYWN0aXZlLiBBbmFseXRpY3Mgd2lsbCBub3Qgc2VuZCBhbnkgZXZlbnRzLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3JlcXVlc3RBbmFseXRpY3NLZXkoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIEFOQUxZVElDU19LRVkgPSByZXN1bHQucGF5bG9hZC53cml0ZV9rZXk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzdWNjZXNzZnVsbHkgcmVnaXN0ZXJlZCBhbmFseXRpY3Mga2V5Jyk7XG4gICAgICAgICAgICBzZWxmLmRpc3BhdGNoSW50ZXJ2YWwgPSBzZWxmLmRpc3BhdGNoSW50ZXJ2YWw7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYuX2hhbmRsZVJlZ2lzdGVyRXJyb3IoZXJyb3IsIHRoaXMpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBzZXRHbG9iYWxQcm9wZXJ0aWVzKHByb3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcHJvcFR5cGUgPSAodHlwZW9mIHByb3ApO1xuICAgICAgICBzd2l0Y2ggKHByb3BUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBwcm9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBnbG9iYWxQcm9wZXJ0aWVzW2tleV0gPSBwcm9wW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGdsb2JhbFByb3BlcnRpZXNGbnMucHVzaChwcm9wKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ3NldEdsb2JhbFByb3BlcnRpZXMgcGFyYW1ldGVyIG11c3QgYmUgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uLicpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHRyYWNrKGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLmhhc1ZhbGlkU2V0dGluZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWV2ZW50RGF0YSkge1xuICAgICAgICAgICAgZXZlbnREYXRhID0ge307XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBDbG9uZSB0aGUgZXZlbnQgZGF0YSB0byBhdm9pZCBtb2RpZnlpbmcgaXRcbiAgICAgICAgICAgIGV2ZW50RGF0YSA9IGRlZXBFeHRlbmQoe30sIGV2ZW50RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIga2V5IGluIGdsb2JhbFByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGlmICghZ2xvYmFsUHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZXZlbnREYXRhW2tleV0gPT09IHZvaWQgMCkge1xuICAgICAgICAgICAgICAgIGV2ZW50RGF0YVtrZXldID0gZ2xvYmFsUHJvcGVydGllc1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ2xvYmFsUHJvcGVydGllc0Zucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZuID0gZ2xvYmFsUHJvcGVydGllc0Zuc1tpXTtcbiAgICAgICAgICAgIGZuLmNhbGwobnVsbCwgZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl91c2VFdmVudENhY2hpbmcpIHtcbiAgICAgICAgICAgIHNlbGYuX2VucXVldWVFdmVudChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5kcnlSdW4pIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdkcnlSdW4gYWN0aXZlLCB3aWxsIG5vdCBzZW5kIGV2ZW50Jyk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudENvbGxlY3Rpb24pO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZXZlbnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuX3Bvc3RFdmVudChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdW5zZXRHbG9iYWxQcm9wZXJ0eShwcm9wKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHByb3BUeXBlID0gKHR5cGVvZiBwcm9wKTtcbiAgICAgICAgc3dpdGNoIChwcm9wVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBkZWxldGUgZ2xvYmFsUHJvcGVydGllc1twcm9wXTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICB2YXIgaSA9IGdsb2JhbFByb3BlcnRpZXNGbnMuaW5kZXhPZihwcm9wKTtcbiAgICAgICAgICAgICAgICBpZiAoaSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1RoZSBmdW5jdGlvbiBwYXNzZWQgdG8gdW5zZXRHbG9iYWxQcm9wZXJ0eSB3YXMgbm90IGEgZ2xvYmFsIHByb3BlcnR5LicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnbG9iYWxQcm9wZXJ0aWVzRm5zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ3Vuc2V0R2xvYmFsUHJvcGVydHkgcGFyYW1ldGVyIG11c3QgYmUgYSBzdHJpbmcgb3IgZnVuY3Rpb24uJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9hbmFseXRpY3NcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3NlcmlhbGl6ZXJzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zdG9yYWdlXCI7XG4iLCJleHBvcnQgY2xhc3MgRE9NU2VyaWFsaXplciB7XG4gICAgZWxlbWVudFNlbGVjdG9yKGVsZW1lbnQpIHtcbiAgICAgICAgLy8gaXRlcmF0ZSB1cCB0aGUgZG9tXG4gICAgICAgIHZhciBzZWxlY3RvcnMgPSBbXTtcbiAgICAgICAgd2hpbGUgKGVsZW1lbnQudGFnTmFtZSAhPT0gJ0hUTUwnKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3IgPSBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHZhciBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0b3IgKz0gXCIjXCIgKyBpZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBjbGFzc05hbWUgPSBlbGVtZW50LmNsYXNzTmFtZTtcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2xhc3NlcyA9IGNsYXNzTmFtZS5zcGxpdCgnICcpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYyA9IGNsYXNzZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvciArPSAnLicgKyBjO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFlbGVtZW50LnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBjaGlsZEluZGV4ID0gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChlbGVtZW50LnBhcmVudE5vZGUuY2hpbGRyZW4sIGVsZW1lbnQpO1xuICAgICAgICAgICAgc2VsZWN0b3IgKz0gJzpudGgtY2hpbGQoJyArIChjaGlsZEluZGV4ICsgMSkgKyAnKSc7XG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgc2VsZWN0b3JzLnB1c2goc2VsZWN0b3IpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWxlY3RvcnMucmV2ZXJzZSgpLmpvaW4oJz4nKTtcbiAgICB9XG4gICAgZWxlbWVudE5hbWUoZWxlbWVudCkge1xuICAgICAgICAvLyAxLiBpb24tdHJhY2stbmFtZSBkaXJlY3RpdmVcbiAgICAgICAgdmFyIG5hbWUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnaW9uLXRyYWNrLW5hbWUnKTtcbiAgICAgICAgaWYgKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBuYW1lO1xuICAgICAgICB9XG4gICAgICAgIC8vIDIuIGlkXG4gICAgICAgIHZhciBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgIHJldHVybiBpZDtcbiAgICAgICAgfVxuICAgICAgICAvLyAzLiBubyB1bmlxdWUgaWRlbnRpZmllciAtLT4gcmV0dXJuIG51bGxcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vY29yZS9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybUNvcmUgfSBmcm9tIFwiLi4vY29yZS9jb3JlXCI7XG52YXIgc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcbmV4cG9ydCBjbGFzcyBCdWNrZXRTdG9yYWdlIHtcbiAgICBjb25zdHJ1Y3RvcihuYW1lKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuYmFzZVN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtQ29yZS5nZXRTdG9yYWdlKCk7XG4gICAgfVxuICAgIGdldChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmFzZVN0b3JhZ2UucmV0cmlldmVPYmplY3QodGhpcy5zY29wZWRLZXkoa2V5KSk7XG4gICAgfVxuICAgIHNldChrZXksIHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmJhc2VTdG9yYWdlLnN0b3JlT2JqZWN0KHRoaXMuc2NvcGVkS2V5KGtleSksIHZhbHVlKTtcbiAgICB9XG4gICAgc2NvcGVkS2V5KGtleSkge1xuICAgICAgICByZXR1cm4gdGhpcy5uYW1lICsgJ18nICsga2V5ICsgJ18nICsgc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4uL2NvcmUvcHJvbWlzZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vY29yZS9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSwgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5IH0gZnJvbSBcIi4uL2NvcmUvc3RvcmFnZVwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLi9jb3JlL3VzZXJcIjtcbnZhciBzZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpO1xudmFyIHN0b3JhZ2UgPSBuZXcgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSgpO1xudmFyIHNlc3Npb25TdG9yYWdlID0gbmV3IExvY2FsU2Vzc2lvblN0b3JhZ2VTdHJhdGVneSgpO1xudmFyIF9fYXV0aE1vZHVsZXMgPSB7fTtcbnZhciBfX2F1dGhUb2tlbiA9IG51bGw7XG52YXIgYXV0aEFQSUJhc2UgPSBzZXR0aW5ncy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9hdXRoJztcbnZhciBhdXRoQVBJRW5kcG9pbnRzID0ge1xuICAgICdsb2dpbic6IGZ1bmN0aW9uIChwcm92aWRlciA9IG51bGwpIHtcbiAgICAgICAgaWYgKHByb3ZpZGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gYXV0aEFQSUJhc2UgKyAnL2xvZ2luLycgKyBwcm92aWRlcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXV0aEFQSUJhc2UgKyAnL2xvZ2luJztcbiAgICB9LFxuICAgICdzaWdudXAnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBhdXRoQVBJQmFzZSArICcvdXNlcnMnO1xuICAgIH1cbn07XG5leHBvcnQgY2xhc3MgVGVtcFRva2VuQ29udGV4dCB7XG4gICAgc3RhdGljIGdldCBsYWJlbCgpIHtcbiAgICAgICAgcmV0dXJuIFwiaW9uaWNfaW9fYXV0aF9cIiArIHNldHRpbmdzLmdldCgnYXBwX2lkJyk7XG4gICAgfVxuICAgIHN0YXRpYyBkZWxldGUoKSB7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnJlbW92ZShUZW1wVG9rZW5Db250ZXh0LmxhYmVsKTtcbiAgICB9XG4gICAgc3RhdGljIHN0b3JlKCkge1xuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXQoVGVtcFRva2VuQ29udGV4dC5sYWJlbCwgX19hdXRoVG9rZW4pO1xuICAgIH1cbiAgICBzdGF0aWMgZ2V0UmF3RGF0YSgpIHtcbiAgICAgICAgcmV0dXJuIHNlc3Npb25TdG9yYWdlLmdldChUZW1wVG9rZW5Db250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgVG9rZW5Db250ZXh0IHtcbiAgICBzdGF0aWMgZ2V0IGxhYmVsKCkge1xuICAgICAgICByZXR1cm4gXCJpb25pY19pb19hdXRoX1wiICsgc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKTtcbiAgICB9XG4gICAgc3RhdGljIGRlbGV0ZSgpIHtcbiAgICAgICAgc3RvcmFnZS5yZW1vdmUoVG9rZW5Db250ZXh0LmxhYmVsKTtcbiAgICB9XG4gICAgc3RhdGljIHN0b3JlKCkge1xuICAgICAgICBzdG9yYWdlLnNldChUb2tlbkNvbnRleHQubGFiZWwsIF9fYXV0aFRva2VuKTtcbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0RhdGEoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLmdldChUb2tlbkNvbnRleHQubGFiZWwpIHx8IGZhbHNlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHN0b3JlVG9rZW4ob3B0aW9ucywgdG9rZW4pIHtcbiAgICBfX2F1dGhUb2tlbiA9IHRva2VuO1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucy5yZW1lbWJlcikge1xuICAgICAgICBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIFRlbXBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG59XG5jbGFzcyBJbkFwcEJyb3dzZXJGbG93IHtcbiAgICBjb25zdHJ1Y3RvcihhdXRoT3B0aW9ucywgb3B0aW9ucywgZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghd2luZG93IHx8ICF3aW5kb3cuY29yZG92YSB8fCAhd2luZG93LmNvcmRvdmEuSW5BcHBCcm93c2VyKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJNaXNzaW5nIEluQXBwQnJvd3NlciBwbHVnaW5cIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMubG9naW4ob3B0aW9ucy5wcm92aWRlciksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6IG9wdGlvbnMudXJpX21ldGhvZCB8fCAnUE9TVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgICAgICdhcHBfaWQnOiBzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgICAgICAgICAnY2FsbGJhY2snOiBvcHRpb25zLmNhbGxiYWNrX3VyaSB8fCB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBkYXRhXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgIHZhciBsb2MgPSBkYXRhLnBheWxvYWQuZGF0YS51cmw7XG4gICAgICAgICAgICAgICAgdmFyIHRlbXBCcm93c2VyID0gd2luZG93LmNvcmRvdmEuSW5BcHBCcm93c2VyLm9wZW4obG9jLCAnX2JsYW5rJywgJ2xvY2F0aW9uPW5vJyk7XG4gICAgICAgICAgICAgICAgdGVtcEJyb3dzZXIuYWRkRXZlbnRMaXN0ZW5lcignbG9hZHN0YXJ0JywgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEudXJsLnNsaWNlKDAsIDIwKSA9PT0gJ2h0dHA6Ly9hdXRoLmlvbmljLmlvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHF1ZXJ5U3RyaW5nID0gZGF0YS51cmwuc3BsaXQoJyMnKVswXS5zcGxpdCgnPycpWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmFtUGFydHMgPSBxdWVyeVN0cmluZy5zcGxpdCgnJicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmFtcyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJhbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcnQgPSBwYXJhbVBhcnRzW2ldLnNwbGl0KCc9Jyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1zW3BhcnRbMF1dID0gcGFydFsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0b3JlVG9rZW4oYXV0aE9wdGlvbnMsIHBhcmFtcy50b2tlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wQnJvd3Nlci5jbG9zZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxufVxuZnVuY3Rpb24gZ2V0QXV0aEVycm9yRGV0YWlscyhlcnIpIHtcbiAgICB2YXIgZGV0YWlscyA9IFtdO1xuICAgIHRyeSB7XG4gICAgICAgIGRldGFpbHMgPSBlcnIucmVzcG9uc2UuYm9keS5lcnJvci5kZXRhaWxzO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICBlO1xuICAgIH1cbiAgICByZXR1cm4gZGV0YWlscztcbn1cbmV4cG9ydCBjbGFzcyBBdXRoIHtcbiAgICBzdGF0aWMgaXNBdXRoZW50aWNhdGVkKCkge1xuICAgICAgICB2YXIgdG9rZW4gPSBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICB2YXIgdGVtcFRva2VuID0gVGVtcFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIGlmICh0ZW1wVG9rZW4gfHwgdG9rZW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGxvZ2luKG1vZHVsZUlkLCBvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIGNvbnRleHQgPSBfX2F1dGhNb2R1bGVzW21vZHVsZUlkXSB8fCBmYWxzZTtcbiAgICAgICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBdXRoZW50aWNhdGlvbiBjbGFzcyBpcyBpbnZhbGlkIG9yIG1pc3Npbmc6XCIgKyBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBjb250ZXh0LmF1dGhlbnRpY2F0ZS5hcHBseShjb250ZXh0LCBbb3B0aW9ucywgZGF0YV0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgVXNlci5zZWxmKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodXNlcik7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgc3RhdGljIHNpZ251cChkYXRhKSB7XG4gICAgICAgIHZhciBjb250ZXh0ID0gX19hdXRoTW9kdWxlcy5iYXNpYyB8fCBmYWxzZTtcbiAgICAgICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBdXRoZW50aWNhdGlvbiBjbGFzcyBpcyBpbnZhbGlkIG9yIG1pc3Npbmc6XCIgKyBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29udGV4dC5zaWdudXAuYXBwbHkoY29udGV4dCwgW2RhdGFdKTtcbiAgICB9XG4gICAgc3RhdGljIGxvZ291dCgpIHtcbiAgICAgICAgVG9rZW5Db250ZXh0LmRlbGV0ZSgpO1xuICAgICAgICBUZW1wVG9rZW5Db250ZXh0LmRlbGV0ZSgpO1xuICAgIH1cbiAgICBzdGF0aWMgcmVnaXN0ZXIobW9kdWxlSWQsIG1vZHVsZSkge1xuICAgICAgICBpZiAoIV9fYXV0aE1vZHVsZXNbbW9kdWxlSWRdKSB7XG4gICAgICAgICAgICBfX2F1dGhNb2R1bGVzW21vZHVsZUlkXSA9IG1vZHVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzdGF0aWMgZ2V0VXNlclRva2VuKCkge1xuICAgICAgICB2YXIgdXNlcnRva2VuID0gVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRlbXB0b2tlbiA9IFRlbXBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICB2YXIgdG9rZW4gPSB0ZW1wdG9rZW4gfHwgdXNlcnRva2VuO1xuICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuY2xhc3MgQmFzaWNBdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAndXJpJzogYXV0aEFQSUVuZHBvaW50cy5sb2dpbigpLFxuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICdqc29uJzoge1xuICAgICAgICAgICAgICAgICdhcHBfaWQnOiBzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgICAgICdlbWFpbCc6IGRhdGEuZW1haWwsXG4gICAgICAgICAgICAgICAgJ3Bhc3N3b3JkJzogZGF0YS5wYXNzd29yZFxuICAgICAgICAgICAgfVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICBzdG9yZVRva2VuKG9wdGlvbnMsIGRhdGEucGF5bG9hZC5kYXRhLnRva2VuKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHN0YXRpYyBzaWdudXAoZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB1c2VyRGF0YSA9IHtcbiAgICAgICAgICAgICdhcHBfaWQnOiBzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgJ2VtYWlsJzogZGF0YS5lbWFpbCxcbiAgICAgICAgICAgICdwYXNzd29yZCc6IGRhdGEucGFzc3dvcmRcbiAgICAgICAgfTtcbiAgICAgICAgLy8gb3B0aW9uYWwgZGV0YWlsc1xuICAgICAgICBpZiAoZGF0YS51c2VybmFtZSkge1xuICAgICAgICAgICAgdXNlckRhdGEudXNlcm5hbWUgPSBkYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmltYWdlKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS5pbWFnZSA9IGRhdGEuaW1hZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEubmFtZSkge1xuICAgICAgICAgICAgdXNlckRhdGEubmFtZSA9IGRhdGEubmFtZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5jdXN0b20pIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLmN1c3RvbSA9IGRhdGEuY3VzdG9tO1xuICAgICAgICB9XG4gICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICd1cmknOiBhdXRoQVBJRW5kcG9pbnRzLnNpZ251cCgpLFxuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICdqc29uJzogdXNlckRhdGFcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICB2YXIgZXJyb3JzID0gW107XG4gICAgICAgICAgICB2YXIgZGV0YWlscyA9IGdldEF1dGhFcnJvckRldGFpbHMoZXJyKTtcbiAgICAgICAgICAgIGlmIChkZXRhaWxzIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRldGFpbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRldGFpbCA9IGRldGFpbHNbaV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGV0YWlsID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRldGFpbC5lcnJvcl90eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goZGV0YWlsLmVycm9yX3R5cGUgKyBcIl9cIiArIGRldGFpbC5wYXJhbWV0ZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KHsgXCJlcnJvcnNcIjogZXJyb3JzIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxufVxuY2xhc3MgQ3VzdG9tQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdjdXN0b20nIH0sIGRhdGEpO1xuICAgIH1cbn1cbmNsYXNzIFR3aXR0ZXJBdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ3R3aXR0ZXInIH0sIGRhdGEpO1xuICAgIH1cbn1cbmNsYXNzIEZhY2Vib29rQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdmYWNlYm9vaycgfSwgZGF0YSk7XG4gICAgfVxufVxuY2xhc3MgR2l0aHViQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdnaXRodWInIH0sIGRhdGEpO1xuICAgIH1cbn1cbmNsYXNzIEdvb2dsZUF1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZ29vZ2xlJyB9LCBkYXRhKTtcbiAgICB9XG59XG5jbGFzcyBJbnN0YWdyYW1BdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2luc3RhZ3JhbScgfSwgZGF0YSk7XG4gICAgfVxufVxuY2xhc3MgTGlua2VkSW5BdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2xpbmtlZGluJyB9LCBkYXRhKTtcbiAgICB9XG59XG5BdXRoLnJlZ2lzdGVyKCdiYXNpYycsIEJhc2ljQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdjdXN0b20nLCBDdXN0b21BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2ZhY2Vib29rJywgRmFjZWJvb2tBdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2dpdGh1YicsIEdpdGh1YkF1dGgpO1xuQXV0aC5yZWdpc3RlcignZ29vZ2xlJywgR29vZ2xlQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdpbnN0YWdyYW0nLCBJbnN0YWdyYW1BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2xpbmtlZGluJywgTGlua2VkSW5BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ3R3aXR0ZXInLCBUd2l0dGVyQXV0aCk7XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9hdXRoXCI7XG4iLCJpbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9sb2dnZXJcIjtcbnZhciBwcml2YXRlRGF0YSA9IHt9O1xuZnVuY3Rpb24gcHJpdmF0ZVZhcihrZXkpIHtcbiAgICByZXR1cm4gcHJpdmF0ZURhdGFba2V5XSB8fCBudWxsO1xufVxuZXhwb3J0IGNsYXNzIEFwcCB7XG4gICAgY29uc3RydWN0b3IoYXBwSWQsIGFwaUtleSkge1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBBcHA6J1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCFhcHBJZCB8fCBhcHBJZCA9PT0gJycpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ05vIGFwcF9pZCB3YXMgcHJvdmlkZWQnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWFwaUtleSB8fCBhcGlLZXkgPT09ICcnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdObyBhcGlfa2V5IHdhcyBwcm92aWRlZCcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHByaXZhdGVEYXRhLmlkID0gYXBwSWQ7XG4gICAgICAgIHByaXZhdGVEYXRhLmFwaUtleSA9IGFwaUtleTtcbiAgICAgICAgLy8gb3RoZXIgY29uZmlnIHZhbHVlIHJlZmVyZW5jZVxuICAgICAgICB0aGlzLmRldlB1c2ggPSBudWxsO1xuICAgICAgICB0aGlzLmdjbUtleSA9IG51bGw7XG4gICAgfVxuICAgIGdldCBpZCgpIHtcbiAgICAgICAgcmV0dXJuIHByaXZhdGVWYXIoJ2lkJyk7XG4gICAgfVxuICAgIGdldCBhcGlLZXkoKSB7XG4gICAgICAgIHJldHVybiBwcml2YXRlVmFyKCdhcGlLZXknKTtcbiAgICB9XG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiAnPElvbmljQXBwIFtcXCcnICsgdGhpcy5pZCArICdcXCc+JztcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi9ldmVudHNcIjtcbmltcG9ydCB7IFN0b3JhZ2UgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9sb2dnZXJcIjtcbnZhciBldmVudEVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG52YXIgbWFpblN0b3JhZ2UgPSBuZXcgU3RvcmFnZSgpO1xuZXhwb3J0IGNsYXNzIElvbmljUGxhdGZvcm1Db3JlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBDb3JlOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICAgICAgdGhpcy5fcGx1Z2luc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZW1pdHRlciA9IElvbmljUGxhdGZvcm1Db3JlLmdldEVtaXR0ZXIoKTtcbiAgICAgICAgdGhpcy5fYm9vdHN0cmFwKCk7XG4gICAgICAgIGlmIChzZWxmLmNvcmRvdmFQbGF0Zm9ybVVua25vd24pIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2F0dGVtcHRpbmcgdG8gbW9jayBwbHVnaW5zJyk7XG4gICAgICAgICAgICBzZWxmLl9wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5lbWl0dGVyLmVtaXQoJ2lvbmljX2NvcmU6cGx1Z2luc19yZWFkeScpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiZGV2aWNlcmVhZHlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdwbHVnaW5zIGFyZSByZWFkeScpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgICAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCd1bmFibGUgdG8gbGlzdGVuIGZvciBjb3Jkb3ZhIHBsdWdpbnMgdG8gYmUgcmVhZHknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBzdGF0aWMgZ2V0IFZlcnNpb24oKSB7XG4gICAgICAgIHJldHVybiAnVkVSU0lPTl9TVFJJTkcnO1xuICAgIH1cbiAgICBzdGF0aWMgZ2V0RW1pdHRlcigpIHtcbiAgICAgICAgcmV0dXJuIGV2ZW50RW1pdHRlcjtcbiAgICB9XG4gICAgc3RhdGljIGdldFN0b3JhZ2UoKSB7XG4gICAgICAgIHJldHVybiBtYWluU3RvcmFnZTtcbiAgICB9XG4gICAgX2lzQ29yZG92YUF2YWlsYWJsZSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZWFyY2hpbmcgZm9yIGNvcmRvdmEuanMnKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb3Jkb3ZhICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnY29yZG92YS5qcyBoYXMgYWxyZWFkeSBiZWVuIGxvYWRlZCcpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0Jyk7XG4gICAgICAgIHZhciBsZW4gPSBzY3JpcHRzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgdmFyIHNjcmlwdCA9IHNjcmlwdHNbaV0uZ2V0QXR0cmlidXRlKCdzcmMnKTtcbiAgICAgICAgICAgIGlmIChzY3JpcHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFydHMgPSBzY3JpcHQuc3BsaXQoJy8nKTtcbiAgICAgICAgICAgICAgICB2YXIgcGFydHNMZW5ndGggPSAwO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzTGVuZ3RoID0gcGFydHMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFydHNbcGFydHNMZW5ndGggLSAxXSA9PT0gJ2NvcmRvdmEuanMnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdjb3Jkb3ZhLmpzIGhhcyBwcmV2aW91c2x5IGJlZW4gaW5jbHVkZWQuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdlbmNvdW50ZXJlZCBlcnJvciB3aGlsZSB0ZXN0aW5nIGZvciBjb3Jkb3ZhLmpzIHByZXNlbmNlLCAnICsgZS50b1N0cmluZygpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBsb2FkQ29yZG92YSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuX2lzQ29yZG92YUF2YWlsYWJsZSgpKSB7XG4gICAgICAgICAgICB2YXIgY29yZG92YVNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgICAgICAgdmFyIGNvcmRvdmFTcmMgPSAnY29yZG92YS5qcyc7XG4gICAgICAgICAgICBzd2l0Y2ggKElvbmljUGxhdGZvcm1Db3JlLmdldERldmljZVR5cGVCeU5hdmlnYXRvcigpKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYW5kcm9pZCc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24uaHJlZi5zdWJzdHJpbmcoMCwgNCkgPT09IFwiZmlsZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb3Jkb3ZhU3JjID0gJ2ZpbGU6Ly8vYW5kcm9pZF9hc3NldC93d3cvY29yZG92YS5qcyc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaXBhZCc6XG4gICAgICAgICAgICAgICAgY2FzZSAnaXBob25lJzpcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZXNvdXJjZSA9IHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gubWF0Y2goL2NvcmRvdmFfanNfYm9vdHN0cmFwX3Jlc291cmNlPSguKj8pKCZ8I3wkKS9pKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXNvdXJjZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvcmRvdmFTcmMgPSBkZWNvZGVVUkkocmVzb3VyY2VbMV0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdjb3VsZCBub3QgZmluZCBjb3Jkb3ZhX2pzX2Jvb3RzdHJhcF9yZXNvdXJjZSBxdWVyeSBwYXJhbScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICd1bmtub3duJzpcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5jb3Jkb3ZhUGxhdGZvcm1Vbmtub3duID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29yZG92YVNjcmlwdC5zZXRBdHRyaWJ1dGUoJ3NyYycsIGNvcmRvdmFTcmMpO1xuICAgICAgICAgICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChjb3Jkb3ZhU2NyaXB0KTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2luamVjdGluZyBjb3Jkb3ZhLmpzJyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lIHRoZSBkZXZpY2UgdHlwZSB2aWEgdGhlIHVzZXIgYWdlbnQgc3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfSBuYW1lIG9mIGRldmljZSBwbGF0Zm9ybSBvciBcInVua25vd25cIiBpZiB1bmFibGUgdG8gaWRlbnRpZnkgdGhlIGRldmljZVxuICAgICAqL1xuICAgIHN0YXRpYyBnZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKSB7XG4gICAgICAgIHZhciBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG4gICAgICAgIHZhciBpcGFkID0gYWdlbnQubWF0Y2goL2lQYWQvaSk7XG4gICAgICAgIGlmIChpcGFkICYmIChpcGFkWzBdLnRvTG93ZXJDYXNlKCkgPT09ICdpcGFkJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBhZCc7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGlwaG9uZSA9IGFnZW50Lm1hdGNoKC9pUGhvbmUvaSk7XG4gICAgICAgIGlmIChpcGhvbmUgJiYgKGlwaG9uZVswXS50b0xvd2VyQ2FzZSgpID09PSAnaXBob25lJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBob25lJztcbiAgICAgICAgfVxuICAgICAgICB2YXIgYW5kcm9pZCA9IGFnZW50Lm1hdGNoKC9BbmRyb2lkL2kpO1xuICAgICAgICBpZiAoYW5kcm9pZCAmJiAoYW5kcm9pZFswXS50b0xvd2VyQ2FzZSgpID09PSAnYW5kcm9pZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2FuZHJvaWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcInVua25vd25cIjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGRldmljZSBpcyBhbiBBbmRyb2lkIGRldmljZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgQW5kcm9pZCwgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgc3RhdGljIGlzQW5kcm9pZERldmljZSgpIHtcbiAgICAgICAgdmFyIGRldmljZSA9IElvbmljUGxhdGZvcm1Db3JlLmdldERldmljZVR5cGVCeU5hdmlnYXRvcigpO1xuICAgICAgICBpZiAoZGV2aWNlID09PSAnYW5kcm9pZCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGRldmljZSBpcyBhbiBpT1MgZGV2aWNlXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiBpT1MsIGZhbHNlIG90aGVyd2lzZVxuICAgICAqL1xuICAgIHN0YXRpYyBpc0lPU0RldmljZSgpIHtcbiAgICAgICAgdmFyIGRldmljZSA9IElvbmljUGxhdGZvcm1Db3JlLmdldERldmljZVR5cGVCeU5hdmlnYXRvcigpO1xuICAgICAgICBpZiAoZGV2aWNlID09PSAnaXBob25lJyB8fCBkZXZpY2UgPT09ICdpcGFkJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBCb290c3RyYXAgSW9uaWMgQ29yZVxuICAgICAqXG4gICAgICogSGFuZGxlcyB0aGUgY29yZG92YS5qcyBib290c3RyYXBcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIF9ib290c3RyYXAoKSB7XG4gICAgICAgIHRoaXMubG9hZENvcmRvdmEoKTtcbiAgICB9XG4gICAgc3RhdGljIGRldmljZUNvbm5lY3RlZFRvTmV0d29yayhzdHJpY3RNb2RlID0gbnVsbCkge1xuICAgICAgICBpZiAodHlwZW9mIHN0cmljdE1vZGUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBzdHJpY3RNb2RlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IuY29ubmVjdGlvbiA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgICAgICAgIHR5cGVvZiBuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgICAgICAgdHlwZW9mIENvbm5lY3Rpb24gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBpZiAoIXN0cmljdE1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5FVEhFUk5FVDpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5XSUZJOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTExfMkc6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTF8zRzpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMXzRHOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTEw6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBjb3JlICsgcGx1Z2lucyBhcmUgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogdGhlIGNvbXBvbmVudHMgaGF2ZSBhbHJlYWR5IGJlY29tZSBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb25SZWFkeShjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9wbHVnaW5zUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5lbWl0dGVyLm9uKCdpb25pY19jb3JlOnBsdWdpbnNfcmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmV4cG9ydCB2YXIgSW9uaWNQbGF0Zm9ybSA9IG5ldyBJb25pY1BsYXRmb3JtQ29yZSgpO1xuIiwidmFyIGRhdGFUeXBlTWFwcGluZyA9IHt9O1xuZXhwb3J0IGNsYXNzIERhdGFUeXBlU2NoZW1hIHtcbiAgICBjb25zdHJ1Y3Rvcihwcm9wZXJ0aWVzKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IHt9O1xuICAgICAgICB0aGlzLnNldFByb3BlcnRpZXMocHJvcGVydGllcyk7XG4gICAgfVxuICAgIHNldFByb3BlcnRpZXMocHJvcGVydGllcykge1xuICAgICAgICBpZiAocHJvcGVydGllcyBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgICAgZm9yICh2YXIgeCBpbiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhW3hdID0gcHJvcGVydGllc1t4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB0b0pTT04oKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ19fSW9uaWNfRGF0YVR5cGVTY2hlbWEnOiBkYXRhLm5hbWUsXG4gICAgICAgICAgICAndmFsdWUnOiBkYXRhLnZhbHVlXG4gICAgICAgIH07XG4gICAgfVxuICAgIGlzVmFsaWQoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSAmJiB0aGlzLmRhdGEudmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgRGF0YVR5cGUge1xuICAgIHN0YXRpYyBnZXQobmFtZSwgdmFsdWUpIHtcbiAgICAgICAgaWYgKGRhdGFUeXBlTWFwcGluZ1tuYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBkYXRhVHlwZU1hcHBpbmdbbmFtZV0odmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGdldE1hcHBpbmcoKSB7XG4gICAgICAgIHJldHVybiBkYXRhVHlwZU1hcHBpbmc7XG4gICAgfVxuICAgIHN0YXRpYyBnZXQgU2NoZW1hKCkge1xuICAgICAgICByZXR1cm4gRGF0YVR5cGVTY2hlbWE7XG4gICAgfVxuICAgIHN0YXRpYyByZWdpc3RlcihuYW1lLCBjbHMpIHtcbiAgICAgICAgZGF0YVR5cGVNYXBwaW5nW25hbWVdID0gY2xzO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBVbmlxdWVBcnJheSB7XG4gICAgY29uc3RydWN0b3IodmFsdWUpIHtcbiAgICAgICAgdGhpcy5kYXRhID0gW107XG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBmb3IgKHZhciB4IGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wdXNoKHZhbHVlW3hdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB0b0pTT04oKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhO1xuICAgICAgICB2YXIgc2NoZW1hID0gbmV3IERhdGFUeXBlU2NoZW1hKHsgJ25hbWUnOiAnVW5pcXVlQXJyYXknLCAndmFsdWUnOiBkYXRhIH0pO1xuICAgICAgICByZXR1cm4gc2NoZW1hLnRvSlNPTigpO1xuICAgIH1cbiAgICBzdGF0aWMgZnJvbVN0b3JhZ2UodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBVbmlxdWVBcnJheSh2YWx1ZSk7XG4gICAgfVxuICAgIHB1c2godmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5pbmRleE9mKHZhbHVlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5wdXNoKHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBwdWxsKHZhbHVlKSB7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuZGF0YS5pbmRleE9mKHZhbHVlKTtcbiAgICAgICAgdGhpcy5kYXRhLnNwbGljZShpbmRleCwgMSk7XG4gICAgfVxufVxuRGF0YVR5cGUucmVnaXN0ZXIoJ1VuaXF1ZUFycmF5JywgVW5pcXVlQXJyYXkpO1xuIiwiaW1wb3J0IHsgRXZlbnRFbWl0dGVyIGFzIF9FdmVudEVtaXR0ZXIgfSBmcm9tIFwiZXZlbnRzXCI7XG5leHBvcnQgY2xhc3MgRXZlbnRFbWl0dGVyIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fZW1pdHRlciA9IG5ldyBfRXZlbnRFbWl0dGVyKCk7XG4gICAgfVxuICAgIG9uKGV2ZW50LCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihldmVudCwgY2FsbGJhY2spO1xuICAgIH1cbiAgICBlbWl0KGxhYmVsLCBkYXRhID0gbnVsbCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5lbWl0KGxhYmVsLCBkYXRhKTtcbiAgICB9XG59XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9hcHBcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2NvcmVcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2RhdGEtdHlwZXNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2V2ZW50c1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vbG9nZ2VyXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wcm9taXNlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9yZXF1ZXN0XCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zZXR0aW5nc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc3RvcmFnZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vdXNlclwiO1xuIiwiZXhwb3J0IGNsYXNzIExvZ2dlciB7XG4gICAgY29uc3RydWN0b3Iob3B0cykge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IG9wdHMgfHwge307XG4gICAgICAgIHRoaXMuX3NpbGVuY2UgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fcHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIHRoaXMuX2Jvb3RzdHJhcCgpO1xuICAgIH1cbiAgICBzaWxlbmNlKCkge1xuICAgICAgICB0aGlzLl9zaWxlbmNlID0gdHJ1ZTtcbiAgICB9XG4gICAgdmVyYm9zZSgpIHtcbiAgICAgICAgdGhpcy5fc2lsZW5jZSA9IGZhbHNlO1xuICAgIH1cbiAgICBfYm9vdHN0cmFwKCkge1xuICAgICAgICBpZiAodGhpcy5fb3B0aW9ucy5wcmVmaXgpIHtcbiAgICAgICAgICAgIHRoaXMuX3ByZWZpeCA9IHRoaXMuX29wdGlvbnMucHJlZml4O1xuICAgICAgICB9XG4gICAgfVxuICAgIGluZm8oZGF0YSkge1xuICAgICAgICBpZiAoIXRoaXMuX3NpbGVuY2UpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wcmVmaXgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyh0aGlzLl9wcmVmaXgsIGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgd2FybihkYXRhKSB7XG4gICAgICAgIGlmICghdGhpcy5fc2lsZW5jZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3ByZWZpeCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHRoaXMuX3ByZWZpeCwgZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBlcnJvcihkYXRhKSB7XG4gICAgICAgIGlmICh0aGlzLl9wcmVmaXgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IodGhpcy5fcHJlZml4LCBkYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJpbXBvcnQgeyBQcm9taXNlIGFzIEVTNlByb21pc2UgfSBmcm9tIFwiZXM2LXByb21pc2VcIjtcbmV4cG9ydCBjbGFzcyBEZWZlcnJlZFByb21pc2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3VwZGF0ZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLnByb21pc2UgPSBuZXcgRVM2UHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICBzZWxmLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICAgICAgc2VsZi5yZWplY3QgPSByZWplY3Q7XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgb3JpZ2luYWxUaGVuID0gdGhpcy5wcm9taXNlLnRoZW47XG4gICAgICAgIHRoaXMucHJvbWlzZS50aGVuID0gZnVuY3Rpb24gKG9rLCBmYWlsLCB1cGRhdGUpIHtcbiAgICAgICAgICAgIHNlbGYuX3VwZGF0ZSA9IHVwZGF0ZTtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFRoZW4uY2FsbChzZWxmLnByb21pc2UsIG9rLCBmYWlsKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgbm90aWZ5KHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl91cGRhdGUgJiYgKHR5cGVvZiB0aGlzLl91cGRhdGUgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGUodmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4vcHJvbWlzZVwiO1xuaW1wb3J0IHsgQXV0aCB9IGZyb20gXCIuLi9hdXRoL2F1dGhcIjtcbmltcG9ydCByZXF1ZXN0IGZyb20gXCJicm93c2VyLXJlcXVlc3RcIjtcbmV4cG9ydCBjbGFzcyBSZXF1ZXN0IHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgUmVzcG9uc2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBBUElSZXNwb25zZSBleHRlbmRzIFJlc3BvbnNlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgQVBJUmVxdWVzdCBleHRlbmRzIFJlcXVlc3Qge1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICAgICAgICBpZiAoIW9wdGlvbnMuaGVhZGVycy5BdXRob3JpemF0aW9uKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSBBdXRoLmdldFVzZXJUb2tlbigpO1xuICAgICAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyB0b2tlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdEluZm8gPSB7fTtcbiAgICAgICAgdmFyIHAgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHJlcXVlc3Qob3B0aW9ucywgZnVuY3Rpb24gKGVyciwgcmVzcG9uc2UsIHJlc3VsdCkge1xuICAgICAgICAgICAgcmVxdWVzdEluZm8uX2xhc3RFcnJvciA9IGVycjtcbiAgICAgICAgICAgIHJlcXVlc3RJbmZvLl9sYXN0UmVzcG9uc2UgPSByZXNwb25zZTtcbiAgICAgICAgICAgIHJlcXVlc3RJbmZvLl9sYXN0UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHAucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzQ29kZSA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXNDb2RlID49IDQwMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX2VyciA9IG5ldyBFcnJvcihcIlJlcXVlc3QgRmFpbGVkIHdpdGggc3RhdHVzIGNvZGUgb2YgXCIgKyByZXNwb25zZS5zdGF0dXNDb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgcC5yZWplY3QoeyAncmVzcG9uc2UnOiByZXNwb25zZSwgJ2Vycm9yJzogX2VyciB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHAucmVzb2x2ZSh7ICdyZXNwb25zZSc6IHJlc3BvbnNlLCAncGF5bG9hZCc6IHJlc3VsdCB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBwLnJlcXVlc3RJbmZvID0gcmVxdWVzdEluZm87XG4gICAgICAgIHJldHVybiBwLnByb21pc2U7XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIEJhc2VTZXR0aW5ncyB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuX3NldHRpbmdzID0ge307XG4gICAgICAgIHRoaXMuX2RldkxvY2F0aW9ucyA9IHt9O1xuICAgICAgICB0aGlzLl9sb2NhdGlvbnMgPSB7XG4gICAgICAgICAgICAnYXBpJzogJ2h0dHBzOi8vYXBwcy5pb25pYy5pbycsXG4gICAgICAgICAgICAncHVzaCc6ICdodHRwczovL3B1c2guaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ2FuYWx5dGljcyc6ICdodHRwczovL2FuYWx5dGljcy5pb25pYy5pbycsXG4gICAgICAgICAgICAnZGVwbG95JzogJ2h0dHBzOi8vYXBwcy5pb25pYy5pbycsXG4gICAgICAgICAgICAncGxhdGZvcm0tYXBpJzogJ2h0dHBzOi8vYXBpLmlvbmljLmlvJ1xuICAgICAgICB9O1xuICAgIH1cbiAgICBnZXQobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2V0dGluZ3NbbmFtZV07XG4gICAgfVxuICAgIGdldFVSTChuYW1lKSB7XG4gICAgICAgIGlmICh0aGlzLl9kZXZMb2NhdGlvbnNbbmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9kZXZMb2NhdGlvbnNbbmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fbG9jYXRpb25zW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbG9jYXRpb25zW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmVnaXN0ZXIoc2V0dGluZ3MgPSB7fSkge1xuICAgICAgICB0aGlzLl9zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICB0aGlzLl9kZXZMb2NhdGlvbnMgPSBzZXR0aW5ncy5kZXZfbG9jYXRpb25zIHx8IHt9O1xuICAgIH1cbn1cbmxldCBzZXR0aW5nc1NpbmdsZXRvbiA9IG5ldyBCYXNlU2V0dGluZ3MoKTtcbmV4cG9ydCBjbGFzcyBTZXR0aW5ncyBleHRlbmRzIEJhc2VTZXR0aW5ncyB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHJldHVybiBzZXR0aW5nc1NpbmdsZXRvbjtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi9wcm9taXNlXCI7XG5leHBvcnQgY2xhc3MgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgfVxuICAgIGdldChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH1cbiAgICByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIHZhbHVlKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5IHtcbiAgICBnZXQoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH1cbiAgICByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LnNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG4gICAgfVxufVxudmFyIG9iamVjdENhY2hlID0ge307XG52YXIgbWVtb3J5TG9ja3MgPSB7fTtcbmV4cG9ydCBjbGFzcyBTdG9yYWdlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneSA9IG5ldyBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5KCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFN0b3JlcyBhbiBvYmplY3QgaW4gbG9jYWwgc3RvcmFnZSB1bmRlciB0aGUgZ2l2ZW4ga2V5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSBOYW1lIG9mIHRoZSBrZXkgdG8gc3RvcmUgdmFsdWVzIGluXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHN0b3JlIHdpdGggdGhlIGtleVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc3RvcmVPYmplY3Qoa2V5LCBvYmplY3QpIHtcbiAgICAgICAgLy8gQ29udmVydCBvYmplY3QgdG8gSlNPTiBhbmQgc3RvcmUgaW4gbG9jYWxTdG9yYWdlXG4gICAgICAgIHZhciBqc29uID0gSlNPTi5zdHJpbmdpZnkob2JqZWN0KTtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5zZXQoa2V5LCBqc29uKTtcbiAgICAgICAgLy8gVGhlbiBzdG9yZSBpdCBpbiB0aGUgb2JqZWN0IGNhY2hlXG4gICAgICAgIG9iamVjdENhY2hlW2tleV0gPSBvYmplY3Q7XG4gICAgfVxuICAgIGRlbGV0ZU9iamVjdChrZXkpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5yZW1vdmUoa2V5KTtcbiAgICAgICAgZGVsZXRlIG9iamVjdENhY2hlW2tleV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEVpdGhlciByZXRyaWV2ZXMgdGhlIGNhY2hlZCBjb3B5IG9mIGFuIG9iamVjdCxcbiAgICAgKiBvciB0aGUgb2JqZWN0IGl0c2VsZiBmcm9tIGxvY2FsU3RvcmFnZS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBuYW1lIG9mIHRoZSBrZXkgdG8gcHVsbCBmcm9tXG4gICAgICogQHJldHVybiB7bWl4ZWR9IFJldHVybnMgdGhlIHByZXZpb3VzbHkgc3RvcmVkIE9iamVjdCBvciBudWxsXG4gICAgICovXG4gICAgcmV0cmlldmVPYmplY3Qoa2V5KSB7XG4gICAgICAgIC8vIEZpcnN0IGNoZWNrIHRvIHNlZSBpZiBpdCdzIHRoZSBvYmplY3QgY2FjaGVcbiAgICAgICAgdmFyIGNhY2hlZCA9IG9iamVjdENhY2hlW2tleV07XG4gICAgICAgIGlmIChjYWNoZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWQ7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVzZXJpYWxpemUgdGhlIG9iamVjdCBmcm9tIEpTT05cbiAgICAgICAgdmFyIGpzb24gPSB0aGlzLnN0cmF0ZWd5LmdldChrZXkpO1xuICAgICAgICAvLyBudWxsIG9yIHVuZGVmaW5lZCAtLT4gcmV0dXJuIG51bGwuXG4gICAgICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoanNvbik7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogTG9ja3MgdGhlIGFzeW5jIGNhbGwgcmVwcmVzZW50ZWQgYnkgdGhlIGdpdmVuIHByb21pc2UgYW5kIGxvY2sga2V5LlxuICAgICAqIE9ubHkgb25lIGFzeW5jRnVuY3Rpb24gZ2l2ZW4gYnkgdGhlIGxvY2tLZXkgY2FuIGJlIHJ1bm5pbmcgYXQgYW55IHRpbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbG9ja0tleSBzaG91bGQgYmUgYSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBuYW1lIG9mIHRoaXMgYXN5bmMgY2FsbC5cbiAgICAgKiAgICAgICAgVGhpcyBpcyByZXF1aXJlZCBmb3IgcGVyc2lzdGVuY2UuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gYXN5bmNGdW5jdGlvbiBSZXR1cm5zIGEgcHJvbWlzZSBvZiB0aGUgYXN5bmMgY2FsbC5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gQSBuZXcgcHJvbWlzZSwgaWRlbnRpY2FsIHRvIHRoZSBvbmUgcmV0dXJuZWQgYnkgYXN5bmNGdW5jdGlvbixcbiAgICAgKiAgICAgICAgICBidXQgd2l0aCB0d28gbmV3IGVycm9yczogJ2luX3Byb2dyZXNzJywgYW5kICdsYXN0X2NhbGxfaW50ZXJydXB0ZWQnLlxuICAgICAqL1xuICAgIGxvY2tlZEFzeW5jQ2FsbChsb2NrS2V5LCBhc3luY0Z1bmN0aW9uKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICAvLyBJZiB0aGUgbWVtb3J5IGxvY2sgaXMgc2V0LCBlcnJvciBvdXQuXG4gICAgICAgIGlmIChtZW1vcnlMb2Nrc1tsb2NrS2V5XSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdpbl9wcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzdG9yZWQgbG9jayBidXQgbm8gbWVtb3J5IGxvY2ssIGZsYWcgYSBwZXJzaXN0ZW5jZSBlcnJvclxuICAgICAgICBpZiAodGhpcy5zdHJhdGVneS5nZXQobG9ja0tleSkgPT09ICdsb2NrZWQnKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpO1xuICAgICAgICAgICAgZGVmZXJyZWQucHJvbWlzZS50aGVuKG51bGwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2V0IHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgIG1lbW9yeUxvY2tzW2xvY2tLZXldID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5zdHJhdGVneS5zZXQobG9ja0tleSwgJ2xvY2tlZCcpO1xuICAgICAgICAvLyBQZXJmb3JtIHRoZSBhc3luYyBvcGVyYXRpb25cbiAgICAgICAgYXN5bmNGdW5jdGlvbigpLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3NEYXRhKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHN1Y2Nlc3NEYXRhKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdG9yZWQgYW5kIG1lbW9yeSBsb2Nrc1xuICAgICAgICAgICAgZGVsZXRlIG1lbW9yeUxvY2tzW2xvY2tLZXldO1xuICAgICAgICAgICAgc2VsZi5zdHJhdGVneS5yZW1vdmUobG9ja0tleSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvckRhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvckRhdGEpO1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgICAgICBkZWxldGUgbWVtb3J5TG9ja3NbbG9ja0tleV07XG4gICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5vdGlmeURhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShub3RpZnlEYXRhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEF1dGggfSBmcm9tIFwiLi4vYXV0aC9hdXRoXCI7XG5pbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4vcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4vcHJvbWlzZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgU3RvcmFnZSB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuL2xvZ2dlclwiO1xuaW1wb3J0IHsgRGF0YVR5cGUgfSBmcm9tIFwiLi9kYXRhLXR5cGVzXCI7XG52YXIgQXBwVXNlckNvbnRleHQgPSBudWxsO1xudmFyIHNldHRpbmdzID0gbmV3IFNldHRpbmdzKCk7XG52YXIgc3RvcmFnZSA9IG5ldyBTdG9yYWdlKCk7XG52YXIgdXNlckFQSUJhc2UgPSBzZXR0aW5ncy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9hdXRoL3VzZXJzJztcbnZhciB1c2VyQVBJRW5kcG9pbnRzID0ge1xuICAgICdzZWxmJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnL3NlbGYnO1xuICAgIH0sXG4gICAgJ2dldCc6IGZ1bmN0aW9uICh1c2VyTW9kZWwpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy8nICsgdXNlck1vZGVsLmlkO1xuICAgIH0sXG4gICAgJ3JlbW92ZSc6IGZ1bmN0aW9uICh1c2VyTW9kZWwpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy8nICsgdXNlck1vZGVsLmlkO1xuICAgIH0sXG4gICAgJ3NhdmUnOiBmdW5jdGlvbiAodXNlck1vZGVsKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvJyArIHVzZXJNb2RlbC5pZDtcbiAgICB9LFxuICAgICdwYXNzd29yZFJlc2V0JzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQgKyAnL3Bhc3N3b3JkLXJlc2V0JztcbiAgICB9XG59O1xuY2xhc3MgVXNlckNvbnRleHQge1xuICAgIHN0YXRpYyBnZXQgbGFiZWwoKSB7XG4gICAgICAgIHJldHVybiBcImlvbmljX2lvX3VzZXJfXCIgKyBzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpO1xuICAgIH1cbiAgICBzdGF0aWMgZGVsZXRlKCkge1xuICAgICAgICBzdG9yYWdlLmRlbGV0ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCk7XG4gICAgfVxuICAgIHN0YXRpYyBzdG9yZSgpIHtcbiAgICAgICAgaWYgKFVzZXJDb250ZXh0LmdldFJhd0RhdGEoKSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmVMZWdhY3lEYXRhKFVzZXJDb250ZXh0LmdldFJhd0RhdGEoKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFVzZXIuY3VycmVudCgpLmRhdGEuZGF0YS5fX2lvbmljX3VzZXJfbWlncmF0ZWQpIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwgKyAnX2xlZ2FjeScsIHsgJ19faW9uaWNfdXNlcl9taWdyYXRlZCc6IHRydWUgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCwgVXNlci5jdXJyZW50KCkpO1xuICAgIH1cbiAgICBzdGF0aWMgc3RvcmVMZWdhY3lEYXRhKGRhdGEpIHtcbiAgICAgICAgaWYgKCFVc2VyQ29udGV4dC5nZXRSYXdMZWdhY3lEYXRhKCkpIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwgKyAnX2xlZ2FjeScsIGRhdGEpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHN0YXRpYyBnZXRSYXdEYXRhKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgfVxuICAgIHN0YXRpYyBnZXRSYXdMZWdhY3lEYXRhKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JykgfHwgZmFsc2U7XG4gICAgfVxuICAgIHN0YXRpYyBsb2FkKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHN0b3JhZ2UucmV0cmlldmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwpIHx8IGZhbHNlO1xuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmVMZWdhY3lEYXRhKGRhdGEpO1xuICAgICAgICAgICAgcmV0dXJuIFVzZXIuZnJvbUNvbnRleHQoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YSB7XG4gICAgY29uc3RydWN0b3IoZGF0YSA9IHt9KSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IHt9O1xuICAgICAgICBpZiAoKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JykpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGRhdGE7XG4gICAgICAgICAgICB0aGlzLmRlc2VyaWFsaXplckRhdGFUeXBlcygpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGRlc2VyaWFsaXplckRhdGFUeXBlcygpIHtcbiAgICAgICAgZm9yICh2YXIgeCBpbiB0aGlzLmRhdGEpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgYW4gb2JqZWN0LCBsZXQncyBjaGVjayBmb3IgY3VzdG9tIGRhdGEgdHlwZXNcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhW3hdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIC8vIGRvIHdlIGhhdmUgYSBjdXN0b20gdHlwZT9cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhW3hdLl9fSW9uaWNfRGF0YVR5cGVTY2hlbWEpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5hbWUgPSB0aGlzLmRhdGFbeF0uX19Jb25pY19EYXRhVHlwZVNjaGVtYTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1hcHBpbmcgPSBEYXRhVHlwZS5nZXRNYXBwaW5nKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXBwaW5nW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBoYXZlIGEgY3VzdG9tIHR5cGUgYW5kIGEgcmVnaXN0ZXJlZCBjbGFzcywgZ2l2ZSB0aGUgY3VzdG9tIGRhdGEgdHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZnJvbSBzdG9yYWdlXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFbeF0gPSBtYXBwaW5nW25hbWVdLmZyb21TdG9yYWdlKHRoaXMuZGF0YVt4XS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgdGhpcy5kYXRhW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgdW5zZXQoa2V5KSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG4gICAgZ2V0KGtleSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YVtrZXldO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKGRlZmF1bHRWYWx1ZSA9PT0gMCB8fCBkZWZhdWx0VmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWUgfHwgbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgVXNlcjonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tTYXZlID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2RpcnR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2ZyZXNoID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fdW5zZXQgPSB7fTtcbiAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVzZXJEYXRhKCk7XG4gICAgfVxuICAgIGlzRGlydHkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kaXJ0eTtcbiAgICB9XG4gICAgaXNBbm9ueW1vdXMoKSB7XG4gICAgICAgIGlmICghdGhpcy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaXNBdXRoZW50aWNhdGVkKCkge1xuICAgICAgICBpZiAodGhpcyA9PT0gVXNlci5jdXJyZW50KCkpIHtcbiAgICAgICAgICAgIHJldHVybiBBdXRoLmlzQXV0aGVudGljYXRlZCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGN1cnJlbnQodXNlciA9IG51bGwpIHtcbiAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgIEFwcFVzZXJDb250ZXh0ID0gdXNlcjtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlKCk7XG4gICAgICAgICAgICByZXR1cm4gQXBwVXNlckNvbnRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIUFwcFVzZXJDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSBVc2VyQ29udGV4dC5sb2FkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIUFwcFVzZXJDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSBuZXcgVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIEFwcFVzZXJDb250ZXh0O1xuICAgICAgICB9XG4gICAgfVxuICAgIHN0YXRpYyBmcm9tQ29udGV4dChkYXRhKSB7XG4gICAgICAgIHZhciB1c2VyID0gbmV3IFVzZXIoKTtcbiAgICAgICAgdXNlci5pZCA9IGRhdGEuX2lkO1xuICAgICAgICB1c2VyLmRhdGEgPSBuZXcgVXNlckRhdGEoZGF0YS5kYXRhLmRhdGEpO1xuICAgICAgICB1c2VyLmRldGFpbHMgPSBkYXRhLmRldGFpbHMgfHwge307XG4gICAgICAgIHVzZXIuX2ZyZXNoID0gZGF0YS5fZnJlc2g7XG4gICAgICAgIHVzZXIuX2RpcnR5ID0gZGF0YS5fZGlydHk7XG4gICAgICAgIHJldHVybiB1c2VyO1xuICAgIH1cbiAgICBzdGF0aWMgc2VsZigpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgdGVtcFVzZXIgPSBuZXcgVXNlcigpO1xuICAgICAgICBpZiAoIXRlbXBVc2VyLl9ibG9ja0xvYWQpIHtcbiAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSB0cnVlO1xuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnNlbGYoKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ0dFVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2xvYWRlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZSBjdXN0b20gZGF0YVxuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmlkID0gcmVzdWx0LnBheWxvYWQuZGF0YS51dWlkO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRhdGEgPSBuZXcgVXNlckRhdGEocmVzdWx0LnBheWxvYWQuZGF0YS5jdXN0b20pO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRldGFpbHMgPSByZXN1bHQucGF5bG9hZC5kYXRhLmRldGFpbHM7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgVXNlci5jdXJyZW50KHRlbXBVc2VyKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRlbXBVc2VyKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5pbmZvKFwiYSBsb2FkIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciBcIiArIHRoaXMgKyBcIi5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBzdGF0aWMgbG9hZChpZCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB0ZW1wVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIHRlbXBVc2VyLmlkID0gaWQ7XG4gICAgICAgIGlmICghdGVtcFVzZXIuX2Jsb2NrTG9hZCkge1xuICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IHRydWU7XG4gICAgICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMuZ2V0KHRlbXBVc2VyKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ0dFVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2xvYWRlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZSBjdXN0b20gZGF0YVxuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRhdGEgPSBuZXcgVXNlckRhdGEocmVzdWx0LnBheWxvYWQuZGF0YS5jdXN0b20pO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRldGFpbHMgPSByZXN1bHQucGF5bG9hZC5kYXRhLmRldGFpbHM7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0ZW1wVXNlcik7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbyhcImEgbG9hZCBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgXCIgKyB0aGlzICsgXCIuXCIpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgaXNGcmVzaCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZyZXNoO1xuICAgIH1cbiAgICBpc1ZhbGlkKCkge1xuICAgICAgICBpZiAodGhpcy5pZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBnZXRBUElGb3JtYXQoKSB7XG4gICAgICAgIHZhciBhcGlGb3JtYXQgPSB7fTtcbiAgICAgICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGV0YWlscykge1xuICAgICAgICAgICAgYXBpRm9ybWF0W2tleV0gPSB0aGlzLmRldGFpbHNba2V5XTtcbiAgICAgICAgfVxuICAgICAgICBhcGlGb3JtYXQuY3VzdG9tID0gdGhpcy5kYXRhLmRhdGE7XG4gICAgICAgIHJldHVybiBhcGlGb3JtYXQ7XG4gICAgfVxuICAgIGdldEZvcm1hdChmb3JtYXQpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZm9ybWF0dGVkID0gbnVsbDtcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgICAgIGNhc2UgJ2FwaS1zYXZlJzpcbiAgICAgICAgICAgICAgICBmb3JtYXR0ZWQgPSBzZWxmLmdldEFQSUZvcm1hdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb3JtYXR0ZWQ7XG4gICAgfVxuICAgIG1pZ3JhdGUoKSB7XG4gICAgICAgIHZhciByYXdEYXRhID0gVXNlckNvbnRleHQuZ2V0UmF3TGVnYWN5RGF0YSgpO1xuICAgICAgICBpZiAocmF3RGF0YS5fX2lvbmljX3VzZXJfbWlncmF0ZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYXdEYXRhKSB7XG4gICAgICAgICAgICB2YXIgY3VycmVudFVzZXIgPSBJb25pYy5Vc2VyLmN1cnJlbnQoKTtcbiAgICAgICAgICAgIHZhciB1c2VyRGF0YSA9IG5ldyBVc2VyRGF0YShyYXdEYXRhLmRhdGEuZGF0YSk7XG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gdXNlckRhdGEuZGF0YSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRVc2VyLnNldChrZXksIHVzZXJEYXRhLmRhdGFba2V5XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdXJyZW50VXNlci5zZXQoJ19faW9uaWNfdXNlcl9taWdyYXRlZCcsIHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGRlbGV0ZSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghc2VsZi5pc1ZhbGlkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrRGVsZXRlKSB7XG4gICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLl9kZWxldGUoKTtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogdXNlckFQSUVuZHBvaW50cy5yZW1vdmUodGhpcyksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdERUxFVEUnLFxuICAgICAgICAgICAgICAgICdqc29uJzogdHJ1ZVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tEZWxldGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdkZWxldGVkICcgKyBzZWxmKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiYSBkZWxldGUgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yIFwiICsgdGhpcyArIFwiLlwiKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIF9zdG9yZSgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZSgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIF9kZWxldGUoKSB7XG4gICAgICAgIGlmICh0aGlzID09PSBVc2VyLmN1cnJlbnQoKSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuZGVsZXRlKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc2F2ZSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tTYXZlKSB7XG4gICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5fc3RvcmUoKTtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogdXNlckFQSUVuZHBvaW50cy5zYXZlKHRoaXMpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnUEFUQ0gnLFxuICAgICAgICAgICAgICAgICdqc29uJzogc2VsZi5nZXRGb3JtYXQoJ2FwaS1zYXZlJylcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2RpcnR5ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWxmLmlzRnJlc2goKSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl91bnNldCA9IHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZWxmLl9mcmVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NhdmVkIHVzZXInKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9kaXJ0eSA9IHRydWU7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oXCJhIHNhdmUgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yIFwiICsgdGhpcyArIFwiLlwiKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHJlc2V0UGFzc3dvcmQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAndXJpJzogdXNlckFQSUVuZHBvaW50cy5wYXNzd29yZFJlc2V0KHRoaXMpLFxuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJ1xuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3Bhc3N3b3JkIHJlc2V0IGZvciB1c2VyJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBzZXQgaWQodikge1xuICAgICAgICB0aGlzLl9pZCA9IHY7XG4gICAgfVxuICAgIGdldCBpZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2lkIHx8IG51bGw7XG4gICAgfVxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gJzxJb25pY1VzZXIgW1xcJycgKyB0aGlzLmlkICsgJ1xcJ10+JztcbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuX3Vuc2V0W2tleV07XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEuc2V0KGtleSwgdmFsdWUpO1xuICAgIH1cbiAgICBnZXQoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS5nZXQoa2V5LCBkZWZhdWx0VmFsdWUpO1xuICAgIH1cbiAgICB1bnNldChrZXkpIHtcbiAgICAgICAgdGhpcy5fdW5zZXRba2V5XSA9IHRydWU7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEudW5zZXQoa2V5KTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBTZXR0aW5ncyB9IGZyb20gXCIuLi9jb3JlL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi4vY29yZS9wcm9taXNlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi4vY29yZS9sb2dnZXJcIjtcbmltcG9ydCB7IElvbmljUGxhdGZvcm0gfSBmcm9tIFwiLi4vY29yZS9jb3JlXCI7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi4vY29yZS9ldmVudHNcIjtcbnZhciBzZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpO1xudmFyIE5PX1BMVUdJTiA9IFwiSU9OSUNfREVQTE9ZX01JU1NJTkdfUExVR0lOXCI7XG52YXIgSU5JVElBTF9ERUxBWSA9IDEgKiA1ICogMTAwMDtcbnZhciBXQVRDSF9JTlRFUlZBTCA9IDEgKiA2MCAqIDEwMDA7XG5leHBvcnQgY2xhc3MgRGVwbG95IHtcbiAgICAvKipcbiAgICAgKiBJb25pYyBEZXBsb3lcbiAgICAgKlxuICAgICAqIFRoaXMgaXMgdGhlIG1haW4gaW50ZXJmYWNlIHRoYXQgdGFsa3Mgd2l0aCB0aGUgSW9uaWMgRGVwbG95IFBsdWdpbiB0byBmYWNpbGl0YXRlXG4gICAgICogY2hlY2tpbmcsIGRvd25sb2FkaW5nLCBhbmQgbG9hZGluZyBhbiB1cGRhdGUgdG8geW91ciBhcHAuXG4gICAgICpcbiAgICAgKiBCYXNlIFVzYWdlOlxuICAgICAqXG4gICAgICogICAgSW9uaWMuaW8oKTtcbiAgICAgKiAgICB2YXIgZGVwbG95ID0gbmV3IElvbmljLkRlcGxveSgpO1xuICAgICAqICAgIGRlcGxveS5jaGVjaygpLnRoZW4obnVsbCwgbnVsbCwgZnVuY3Rpb24oaGFzVXBkYXRlKSB7XG4gICAgICogICAgICBkZXBsb3kudXBkYXRlKCk7XG4gICAgICogICAgfSk7XG4gICAgICpcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBEZXBsb3k6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fcGx1Z2luID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY2hhbm5lbFRhZyA9ICdwcm9kdWN0aW9uJztcbiAgICAgICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhcImluaXRcIik7XG4gICAgICAgIElvbmljUGxhdGZvcm0ub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmluaXRpYWxpemUoKTtcbiAgICAgICAgICAgIHNlbGYuX2lzUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5lbWl0KCdpb25pY19kZXBsb3k6cmVhZHknKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBEZXBsb3kgUGx1Z2luXG4gICAgICpcbiAgICAgKiBJZiB0aGUgcGx1Z2luIGhhcyBub3QgYmVlbiBzZXQgeWV0LCBhdHRlbXB0IHRvIGZldGNoIGl0LCBvdGhlcndpc2UgbG9nXG4gICAgICogYSBtZXNzYWdlLlxuICAgICAqXG4gICAgICogQHJldHVybiB7SW9uaWNEZXBsb3l9IFJldHVybnMgdGhlIHBsdWdpbiBvciBmYWxzZVxuICAgICAqL1xuICAgIF9nZXRQbHVnaW4oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wbHVnaW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wbHVnaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBJb25pY0RlcGxveSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3BsdWdpbiBpcyBub3QgaW5zdGFsbGVkIG9yIGhhcyBub3QgbG9hZGVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgaW9uaWMtcGx1Z2luLWRlcGxveWAgeWV0PycpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IElvbmljRGVwbG95O1xuICAgICAgICByZXR1cm4gSW9uaWNEZXBsb3k7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgdGhlIERlcGxveSBQbHVnaW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluaXRpYWxpemUoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbml0KHNldHRpbmdzLmdldCgnYXBwX2lkJyksIHNldHRpbmdzLmdldFVSTCgncGxhdGZvcm0tYXBpJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgZm9yIHVwZGF0ZXNcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFdpbGwgcmVzb2x2ZSB3aXRoIHRydWUgaWYgYW4gdXBkYXRlIGlzIGF2YWlsYWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLiBBIHN0cmluZyBvclxuICAgICAqICAgZXJyb3Igd2lsbCBiZSBwYXNzZWQgdG8gcmVqZWN0KCkgaW4gdGhlIGV2ZW50IG9mIGEgZmFpbHVyZS5cbiAgICAgKi9cbiAgICBjaGVjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uY2hlY2soc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKSwgc2VsZi5fY2hhbm5lbFRhZywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCA9PT0gXCJ0cnVlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FuIHVwZGF0ZSBpcyBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdubyB1cGRhdGVzIGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ2VuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIGNoZWNraW5nIGZvciB1cGRhdGVzJyk7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBEb3dubG9hZCBhbmQgYXZhaWxhYmxlIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGV4dHJhY3QoKVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSBwcm9taXNlIHdoaWNoIHdpbGwgcmVzb2x2ZSB3aXRoIHRydWUvZmFsc2Ugb3IgdXNlXG4gICAgICogICAgbm90aWZ5IHRvIHVwZGF0ZSB0aGUgZG93bmxvYWQgcHJvZ3Jlc3MuXG4gICAgICovXG4gICAgZG93bmxvYWQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRvd25sb2FkKHNldHRpbmdzLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gJ3RydWUnICYmIHJlc3VsdCAhPT0gJ2ZhbHNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiZG93bmxvYWQgY29tcGxldGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCA9PT0gJ3RydWUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRXh0cmFjdCB0aGUgbGFzdCBkb3dubG9hZGVkIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgY2FsbGVkIGFmdGVyIGEgZG93bmxvYWQoKSBzdWNjZXNzZnVsbHkgcmVzb2x2ZXMuXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHByb21pc2Ugd2hpY2ggd2lsbCByZXNvbHZlIHdpdGggdHJ1ZS9mYWxzZSBvciB1c2VcbiAgICAgKiAgICAgICAgICAgICAgICAgICBub3RpZnkgdG8gdXBkYXRlIHRoZSBleHRyYWN0aW9uIHByb2dyZXNzLlxuICAgICAqL1xuICAgIGV4dHJhY3QoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmV4dHJhY3Qoc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAnZG9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImV4dHJhY3Rpb24gY29tcGxldGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIExvYWQgdGhlIGxhdGVzdCBkZXBsb3llZCB2ZXJzaW9uXG4gICAgICogVGhpcyBpcyBvbmx5IG5lY2Vzc2FyeSB0byBjYWxsIGlmIHlvdSBoYXZlIG1hbnVhbGx5IGRvd25sb2FkZWQgYW5kIGV4dHJhY3RlZFxuICAgICAqIGFuIHVwZGF0ZSBhbmQgd2lzaCB0byByZWxvYWQgdGhlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95LiBUaGUgbGF0ZXN0IGRlcGxveVxuICAgICAqIHdpbGwgYXV0b21hdGljYWxseSBiZSBsb2FkZWQgd2hlbiB0aGUgYXBwIGlzIHN0YXJ0ZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGxvYWQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5yZWRpcmVjdChzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdhdGNoIGNvbnN0YW50bHkgY2hlY2tzIGZvciB1cGRhdGVzLCBhbmQgdHJpZ2dlcnMgYW5cbiAgICAgKiBldmVudCB3aGVuIG9uZSBpcyByZWFkeS5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBXYXRjaCBjb25maWd1cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdpbGwgZ2V0IGEgbm90aWZ5KCkgY2FsbGJhY2sgd2hlbiBhbiB1cGRhdGUgaXMgYXZhaWxhYmxlXG4gICAgICovXG4gICAgd2F0Y2gob3B0aW9ucykge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodHlwZW9mIG9wdHMuaW5pdGlhbERlbGF5ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgb3B0cy5pbml0aWFsRGVsYXkgPSBJTklUSUFMX0RFTEFZO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5pbnRlcnZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG9wdHMuaW50ZXJ2YWwgPSBXQVRDSF9JTlRFUlZBTDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBjaGVja0ZvclVwZGF0ZXMoKSB7XG4gICAgICAgICAgICBzZWxmLmNoZWNrKCkudGhlbihmdW5jdGlvbiAoaGFzVXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhc1VwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoaGFzVXBkYXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5hYmxlIHRvIGNoZWNrIGZvciB1cGRhdGVzOiAnICsgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQ2hlY2sgb3VyIHRpbWVvdXQgdG8gbWFrZSBzdXJlIGl0IHdhc24ndCBjbGVhcmVkIHdoaWxlIHdlIHdlcmUgd2FpdGluZ1xuICAgICAgICAgICAgLy8gZm9yIGEgc2VydmVyIHJlc3BvbnNlXG4gICAgICAgICAgICBpZiAodGhpcy5fY2hlY2tUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbnRlcnZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgYWZ0ZXIgYW4gaW5pdGlhbCBzaG9ydCBkZXBsYXlcbiAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbml0aWFsRGVsYXkpO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU3RvcCBhdXRvbWF0aWNhbGx5IGxvb2tpbmcgZm9yIHVwZGF0ZXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVud2F0Y2goKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9jaGVja1RpbWVvdXQpO1xuICAgICAgICB0aGlzLl9jaGVja1RpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJbmZvcm1hdGlvbiBhYm91dCB0aGUgY3VycmVudCBkZXBsb3lcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSByZXNvbHZlciB3aWxsIGJlIHBhc3NlZCBhbiBvYmplY3QgdGhhdCBoYXMga2V5L3ZhbHVlXG4gICAgICogICAgcGFpcnMgcGVydGFpbmluZyB0byB0aGUgY3VycmVudGx5IGRlcGxveWVkIHVwZGF0ZS5cbiAgICAgKi9cbiAgICBpbmZvKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbmZvKHNldHRpbmdzLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBMaXN0IHRoZSBEZXBsb3kgdmVyc2lvbnMgdGhhdCBoYXZlIGJlZW4gaW5zdGFsbGVkIG9uIHRoaXMgZGV2aWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVzb2x2ZXIgd2lsbCBiZSBwYXNzZWQgYW4gYXJyYXkgb2YgZGVwbG95IHV1aWRzXG4gICAgICovXG4gICAgZ2V0VmVyc2lvbnMoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldFZlcnNpb25zKHNldHRpbmdzLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYW4gaW5zdGFsbGVkIGRlcGxveSBvbiB0aGlzIGRldmljZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHV1aWQgVGhlIGRlcGxveSB1dWlkIHlvdSB3aXNoIHRvIHJlbW92ZSBmcm9tIHRoZSBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBTdGFuZGFyZCByZXNvbHZlL3JlamVjdCByZXNvbHV0aW9uXG4gICAgICovXG4gICAgZGVsZXRlVmVyc2lvbih1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRlbGV0ZVZlcnNpb24oc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKSwgdXVpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoZXMgdGhlIG1ldGFkYXRhIGZvciBhIGdpdmVuIGRlcGxveSB1dWlkLiBJZiBubyB1dWlkIGlzIGdpdmVuLCBpdCB3aWxsIGF0dGVtcHRcbiAgICAgKiB0byBncmFiIHRoZSBtZXRhZGF0YSBmb3IgdGhlIG1vc3QgcmVjZW50bHkga25vd24gdXBkYXRlIHZlcnNpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXVpZCBUaGUgZGVwbG95IHV1aWQgeW91IHdpc2ggdG8gZ3JhYiBtZXRhZGF0YSBmb3IsIGNhbiBiZSBsZWZ0IGJsYW5rIHRvIGdyYWIgbGF0ZXN0IGtub3duIHVwZGF0ZSBtZXRhZGF0YVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFN0YW5kYXJkIHJlc29sdmUvcmVqZWN0IHJlc29sdXRpb25cbiAgICAgKi9cbiAgICBnZXRNZXRhZGF0YSh1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldE1ldGFkYXRhKHNldHRpbmdzLmdldCgnYXBwX2lkJyksIHV1aWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQubWV0YWRhdGEpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGRlcGxveSBjaGFubmVsIHRoYXQgc2hvdWxkIGJlIGNoZWNrZWQgZm9yIHVwZGF0c2VcbiAgICAgKiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9kZXBsb3ktY2hhbm5lbHMgZm9yIG1vcmUgaW5mb3JtYXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsVGFnIFRoZSBjaGFubmVsIHRhZyB0byB1c2VcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldENoYW5uZWwoY2hhbm5lbFRhZykge1xuICAgICAgICB0aGlzLl9jaGFubmVsVGFnID0gY2hhbm5lbFRhZztcbiAgICB9XG4gICAgLyoqXG4gICAgICogVXBkYXRlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95XG4gICAgICogQHBhcmFtIHtib29sZWFufSBkZWZlckxvYWQgRGVmZXIgbG9hZGluZyB0aGUgYXBwbGllZCB1cGRhdGUgYWZ0ZXIgdGhlIGluc3RhbGxhdGlvblxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IEEgcHJvbWlzZSByZXN1bHRcbiAgICAgKi9cbiAgICB1cGRhdGUoZGVmZXJMb2FkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJMb2FkaW5nID0gZmFsc2U7XG4gICAgICAgIGlmICh0eXBlb2YgZGVmZXJMb2FkICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgZGVmZXJMb2FkaW5nID0gZGVmZXJMb2FkO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdXBkYXRlc1xuICAgICAgICAgICAgICAgIHNlbGYuY2hlY2soKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlcmUgYXJlIHVwZGF0ZXMsIGRvd25sb2FkIHRoZW1cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkb3dubG9hZFByb2dyZXNzID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuZG93bmxvYWQoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJkb3dubG9hZCBlcnJvclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5leHRyYWN0KCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJleHRyYWN0aW9uIGVycm9yXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZGVmZXJMb2FkaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLnJlZGlyZWN0KHNldHRpbmdzLmdldCgnYXBwX2lkJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICh1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHByb2dyZXNzID0gZG93bmxvYWRQcm9ncmVzcyArICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHByb2dyZXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAodXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWRQcm9ncmVzcyA9ICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoZG93bmxvYWRQcm9ncmVzcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBkZXBsb3kgaXMgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogZGVwbG95IGhhcyBhbHJlYWR5IGJlY29tZSBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb25SZWFkeShjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9pc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIub24oJ2lvbmljX2RlcGxveTpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vZGVwbG95XCI7XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9wdXNoLWRldlwiO1xuZXhwb3J0ICogZnJvbSBcIi4vcHVzaC1tZXNzYWdlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wdXNoLXRva2VuXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wdXNoXCI7XG4iLCJpbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi4vY29yZS9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4uL2NvcmUvbG9nZ2VyXCI7XG5pbXBvcnQgeyBQdXNoVG9rZW4gfSBmcm9tIFwiLi9wdXNoLXRva2VuXCI7XG52YXIgc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcbi8qKlxuICogUHVzaERldiBTZXJ2aWNlXG4gKlxuICogVGhpcyBzZXJ2aWNlIGFjdHMgYXMgYSBtb2NrIHB1c2ggc2VydmljZSB0aGF0IGlzIGludGVuZGVkIHRvIGJlIHVzZWQgcHJlLXNldHVwIG9mXG4gKiBHQ00vQVBOUyBpbiBhbiBJb25pYy5pbyBwcm9qZWN0LlxuICpcbiAqIEhvdyBpdCB3b3JrczpcbiAqXG4gKiAgIFdoZW4gcmVnaXN0ZXIoKSBpcyBjYWxsZWQsIHRoaXMgc2VydmljZSBpcyB1c2VkIHRvIGdlbmVyYXRlIGEgcmFuZG9tXG4gKiAgIGRldmVsb3BtZW50IGRldmljZSB0b2tlbi4gVGhpcyB0b2tlbiBpcyBub3QgdmFsaWQgZm9yIGFueSBzZXJ2aWNlIG91dHNpZGUgb2ZcbiAqICAgSW9uaWMgUHVzaCB3aXRoIGBkZXZfcHVzaGAgc2V0IHRvIHRydWUuIFRoZXNlIHRva2VucyBkbyBub3QgbGFzdCBsb25nIGFuZCBhcmUgbm90XG4gKiAgIGVsaWdpYmxlIGZvciB1c2UgaW4gYSBwcm9kdWN0aW9uIGFwcC5cbiAqXG4gKiAgIFRoZSBkZXZpY2Ugd2lsbCB0aGVuIHBlcmlvZGljYWxseSBjaGVjayB0aGUgUHVzaCBzZXJ2aWNlIGZvciBwdXNoIG5vdGlmaWNhdGlvbnMgc2VudFxuICogICB0byBvdXIgZGV2ZWxvcG1lbnQgdG9rZW4gLS0gc28gdW5saWtlIGEgdHlwaWNhbCBcInB1c2hcIiB1cGRhdGUsIHRoaXMgYWN0dWFsbHkgdXNlc1xuICogICBcInBvbGxpbmdcIiB0byBmaW5kIG5ldyBub3RpZmljYXRpb25zLiBUaGlzIG1lYW5zIHlvdSAqTVVTVCogaGF2ZSB0aGUgYXBwbGljYXRpb24gb3BlblxuICogICBhbmQgaW4gdGhlIGZvcmVncm91bmQgdG8gcmV0cmVpdmUgbWVzc3NhZ2VzLlxuICpcbiAqICAgVGhlIGNhbGxiYWNrcyBwcm92aWRlZCBpbiB5b3VyIGluaXQoKSB3aWxsIHN0aWxsIGJlIHRyaWdnZXJlZCBhcyBub3JtYWwsXG4gKiAgIGJ1dCB3aXRoIHRoZXNlIG5vdGFibGUgZXhjZXB0aW9uczpcbiAqXG4gKiAgICAgIC0gVGhlcmUgaXMgbm8gcGF5bG9hZCBkYXRhIGF2YWlsYWJsZSB3aXRoIG1lc3NhZ2VzXG4gKiAgICAgIC0gQW4gYWxlcnQoKSBpcyBjYWxsZWQgd2hlbiBhIG5vdGlmaWNhdGlvbiBpcyByZWNlaXZlZCB1bmxlc3NzIHlvdSByZXR1cm4gZmFsc2VcbiAqICAgICAgICBpbiB5b3VyICdvbk5vdGlmaWNhdGlvbicgY2FsbGJhY2suXG4gKlxuICovXG5leHBvcnQgY2xhc3MgUHVzaERldlNlcnZpY2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBQdXNoIChkZXYpOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3NlcnZpY2VIb3N0ID0gc2V0dGluZ3MuZ2V0VVJMKCdwbGF0Zm9ybS1hcGknKSArICcvcHVzaCc7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5fd2F0Y2ggPSBudWxsO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZSBhIGRldmVsb3BtZW50IHRva2VuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IGRldmVsb3BtZW50IGRldmljZSB0b2tlblxuICAgICAqL1xuICAgIGdldERldlRva2VuKCkge1xuICAgICAgICAvLyBTb21lIGNyYXp5IGJpdC10d2lkZGxpbmcgdG8gZ2VuZXJhdGUgYSByYW5kb20gZ3VpZFxuICAgICAgICB2YXIgdG9rZW4gPSAnREVWLXh4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcucmVwbGFjZSgvW3h5XS9nLCBmdW5jdGlvbiAoYykge1xuICAgICAgICAgICAgdmFyIHIgPSBNYXRoLnJhbmRvbSgpICogMTYgfCAwLCB2ID0gYyA9PT0gJ3gnID8gciA6IChyICYgMHgzIHwgMHg4KTtcbiAgICAgICAgICAgIHJldHVybiB2LnRvU3RyaW5nKDE2KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gdG9rZW47XG4gICAgICAgIHJldHVybiB0aGlzLl90b2tlbjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIGEgZGV2ZWxvcG1lbnQgdG9rZW4gd2l0aCB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0lvbmljUHVzaFNlcnZpY2V9IGlvbmljUHVzaCBJbnN0YW50aWF0ZWQgUHVzaCBTZXJ2aWNlXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgUmVnaXN0cmF0aW9uIENhbGxiYWNrXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBpbml0KGlvbmljUHVzaCwgY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5fcHVzaCA9IGlvbmljUHVzaDtcbiAgICAgICAgdGhpcy5fZW1pdHRlciA9IHRoaXMuX3B1c2guX2VtaXR0ZXI7XG4gICAgICAgIHZhciB0b2tlbiA9IHRoaXMuX3Rva2VuO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgICAgIHRva2VuID0gdGhpcy5nZXREZXZUb2tlbigpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIFwibWV0aG9kXCI6ICdQT1NUJyxcbiAgICAgICAgICAgIFwidXJpXCI6IHRoaXMuX3NlcnZpY2VIb3N0ICsgJy9kZXZlbG9wbWVudCcsXG4gICAgICAgICAgICBcImpzb25cIjoge1xuICAgICAgICAgICAgICAgIFwidG9rZW5cIjogdG9rZW5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgbmV3IEFQSVJlcXVlc3QocmVxdWVzdE9wdGlvbnMpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB7IFwicmVnaXN0cmF0aW9uSWRcIjogdG9rZW4gfTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3JlZ2lzdGVyZWQgd2l0aCBkZXZlbG9wbWVudCBwdXNoIHNlcnZpY2U6ICcgKyB0b2tlbik7XG4gICAgICAgICAgICBzZWxmLl9lbWl0dGVyLmVtaXQoXCJpb25pY19wdXNoOnRva2VuXCIsIGRhdGEpO1xuICAgICAgICAgICAgaWYgKCh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobmV3IFB1c2hUb2tlbihzZWxmLl90b2tlbikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZi53YXRjaCgpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKFwiZXJyb3IgY29ubmVjdGluZyBkZXZlbG9wbWVudCBwdXNoIHNlcnZpY2U6IFwiICsgZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHRoZSBwdXNoIHNlcnZpY2UgZm9yIG5vdGlmaWNhdGlvbnMgdGhhdCB0YXJnZXQgdGhlIGN1cnJlbnQgZGV2ZWxvcG1lbnQgdG9rZW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGNoZWNrRm9yTm90aWZpY2F0aW9ucygpIHtcbiAgICAgICAgaWYgKCF0aGlzLl90b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgJ21ldGhvZCc6ICdHRVQnLFxuICAgICAgICAgICAgJ3VyaSc6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9kZXZlbG9wbWVudD90b2tlbj0nICsgc2VsZi5fdG9rZW4sXG4gICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgfTtcbiAgICAgICAgbmV3IEFQSVJlcXVlc3QocmVxdWVzdE9wdGlvbnMpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5wYXlsb2FkLmRhdGEubWVzc2FnZSkge1xuICAgICAgICAgICAgICAgIHZhciBtZXNzYWdlID0ge1xuICAgICAgICAgICAgICAgICAgICAnbWVzc2FnZSc6IHJlc3VsdC5wYXlsb2FkLmRhdGEubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgJ3RpdGxlJzogJ0RFVkVMT1BNRU5UIFBVU0gnXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci53YXJuKFwiSW9uaWMgUHVzaDogRGV2ZWxvcG1lbnQgUHVzaCByZWNlaXZlZC4gRGV2ZWxvcG1lbnQgcHVzaGVzIHdpbGwgbm90IGNvbnRhaW4gcGF5bG9hZCBkYXRhLlwiKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9lbWl0dGVyLmVtaXQoXCJpb25pY19wdXNoOm5vdGlmaWNhdGlvblwiLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihcInVuYWJsZSB0byBjaGVjayBmb3IgZGV2ZWxvcG1lbnQgcHVzaGVzOiBcIiArIGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEtpY2tzIG9mZiB0aGUgXCJwb2xsaW5nXCIgb2YgdGhlIElvbmljIFB1c2ggc2VydmljZSBmb3IgbmV3IHB1c2ggbm90aWZpY2F0aW9uc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgd2F0Y2goKSB7XG4gICAgICAgIC8vIENoZWNrIGZvciBuZXcgZGV2IHB1c2hlcyBldmVyeSA1IHNlY29uZHNcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnd2F0Y2hpbmcgZm9yIG5ldyBub3RpZmljYXRpb25zJyk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLl93YXRjaCkge1xuICAgICAgICAgICAgdGhpcy5fd2F0Y2ggPSBzZXRJbnRlcnZhbChmdW5jdGlvbiAoKSB7IHNlbGYuY2hlY2tGb3JOb3RpZmljYXRpb25zKCk7IH0sIDUwMDApO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFB1dHMgdGhlIFwicG9sbGluZ1wiIGZvciBuZXcgbm90aWZpY2F0aW9ucyBvbiBob2xkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgaGFsdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3dhdGNoKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuX3dhdGNoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBQdXNoTWVzc2FnZUFwcFN0YXR1cyB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuYXNsZWVwID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY2xvc2VkID0gZmFsc2U7XG4gICAgfVxuICAgIGdldCB3YXNBc2xlZXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFzbGVlcDtcbiAgICB9XG4gICAgZ2V0IHdhc0Nsb3NlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2xvc2VkO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBQdXNoTWVzc2FnZSB7XG4gICAgY29uc3RydWN0b3IocmF3KSB7XG4gICAgICAgIHRoaXMuX3JhdyA9IHJhdyB8fCB7fTtcbiAgICAgICAgaWYgKCF0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEpIHtcbiAgICAgICAgICAgIC8vIHRoaXMgc2hvdWxkIG9ubHkgaGl0IGlmIHdlIGFyZSBzZXJ2aW5nIHVwIGEgZGV2ZWxvcG1lbnQgcHVzaFxuICAgICAgICAgICAgdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhID0ge1xuICAgICAgICAgICAgICAgICdjb2xkc3RhcnQnOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAnZm9yZWdyb3VuZCc6IHRydWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fcGF5bG9hZCA9IG51bGw7XG4gICAgICAgIHRoaXMuYXBwID0gbnVsbDtcbiAgICAgICAgdGhpcy50ZXh0ID0gbnVsbDtcbiAgICAgICAgdGhpcy50aXRsZSA9IG51bGw7XG4gICAgICAgIHRoaXMuY291bnQgPSBudWxsO1xuICAgICAgICB0aGlzLnNvdW5kID0gbnVsbDtcbiAgICAgICAgdGhpcy5pbWFnZSA9IG51bGw7XG4gICAgfVxuICAgIHN0YXRpYyBmcm9tUGx1Z2luSlNPTihqc29uKSB7XG4gICAgICAgIHZhciBtZXNzYWdlID0gbmV3IFB1c2hNZXNzYWdlKGpzb24pO1xuICAgICAgICBtZXNzYWdlLnByb2Nlc3NSYXcoKTtcbiAgICAgICAgcmV0dXJuIG1lc3NhZ2U7XG4gICAgfVxuICAgIGdldCBwYXlsb2FkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGF5bG9hZCB8fCB7fTtcbiAgICB9XG4gICAgcHJvY2Vzc1JhdygpIHtcbiAgICAgICAgdGhpcy50ZXh0ID0gdGhpcy5fcmF3Lm1lc3NhZ2UgfHwgbnVsbDtcbiAgICAgICAgdGhpcy50aXRsZSA9IHRoaXMuX3Jhdy50aXRsZSB8fCBudWxsO1xuICAgICAgICB0aGlzLmNvdW50ID0gdGhpcy5fcmF3LmNvdW50IHx8IG51bGw7XG4gICAgICAgIHRoaXMuc291bmQgPSB0aGlzLl9yYXcuc291bmQgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuX3Jhdy5pbWFnZSB8fCBudWxsO1xuICAgICAgICB0aGlzLmFwcCA9IG5ldyBQdXNoTWVzc2FnZUFwcFN0YXR1cygpO1xuICAgICAgICBpZiAoIXRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5mb3JlZ3JvdW5kKSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5hc2xlZXAgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEuY29sZHN0YXJ0KSB7XG4gICAgICAgICAgICB0aGlzLmFwcC5jbG9zZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEucGF5bG9hZCkge1xuICAgICAgICAgICAgdGhpcy5fcGF5bG9hZCA9IHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5wYXlsb2FkO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldFJhd1ZlcnNpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yYXc7XG4gICAgfVxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gJzxQdXNoTWVzc2FnZSBbXFwnJyArIHRoaXMudGl0bGUgKyAnXFwnXT4nO1xuICAgIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBQdXNoVG9rZW4ge1xuICAgIGNvbnN0cnVjdG9yKHRva2VuKSB7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gdG9rZW4gfHwgbnVsbDtcbiAgICB9XG4gICAgc2V0IHRva2VuKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gdmFsdWU7XG4gICAgfVxuICAgIGdldCB0b2tlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuO1xuICAgIH1cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgdmFyIHRva2VuID0gdGhpcy5fdG9rZW4gfHwgJ251bGwnO1xuICAgICAgICByZXR1cm4gJzxQdXNoVG9rZW4gW1xcJycgKyB0b2tlbiArICdcXCddPic7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgQXBwIH0gZnJvbSBcIi4uL2NvcmUvYXBwXCI7XG5pbXBvcnQgeyBTZXR0aW5ncyB9IGZyb20gXCIuLi9jb3JlL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBJb25pY1BsYXRmb3JtLCBJb25pY1BsYXRmb3JtQ29yZSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSBcIi4uL2NvcmUvZXZlbnRzXCI7XG5pbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4uL2NvcmUvcHJvbWlzZVwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLi9jb3JlL3VzZXJcIjtcbmltcG9ydCB7IFB1c2hUb2tlbiB9IGZyb20gXCIuL3B1c2gtdG9rZW5cIjtcbmltcG9ydCB7IFB1c2hNZXNzYWdlIH0gZnJvbSBcIi4vcHVzaC1tZXNzYWdlXCI7XG5pbXBvcnQgeyBQdXNoRGV2U2VydmljZSB9IGZyb20gXCIuL3B1c2gtZGV2XCI7XG5sZXQgc2V0dGluZ3MgPSBuZXcgU2V0dGluZ3MoKTtcbnZhciBERUZFUl9JTklUID0gXCJERUZFUl9JTklUXCI7XG52YXIgcHVzaEFQSUJhc2UgPSBzZXR0aW5ncy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9wdXNoJztcbnZhciBwdXNoQVBJRW5kcG9pbnRzID0ge1xuICAgICdzYXZlVG9rZW4nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBwdXNoQVBJQmFzZSArICcvdG9rZW5zJztcbiAgICB9LFxuICAgICdpbnZhbGlkYXRlVG9rZW4nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBwdXNoQVBJQmFzZSArICcvdG9rZW5zL2ludmFsaWRhdGUnO1xuICAgIH1cbn07XG4vKipcbiAqIFB1c2ggU2VydmljZVxuICpcbiAqIFRoaXMgaXMgdGhlIG1haW4gZW50cnlwb2ludCBmb3IgaW50ZXJhY3Rpbmcgd2l0aCB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlLlxuICogRXhhbXBsZSBVc2FnZTpcbiAqXG4gKiAgIElvbmljLmlvKCk7IC8vIGtpY2sgb2ZmIHRoZSBpbyBwbGF0Zm9ybVxuICogICB2YXIgcHVzaCA9IG5ldyBJb25pYy5QdXNoKHtcbiAqICAgICBcImRlYnVnXCI6IHRydWUsXG4gKiAgICAgXCJvbk5vdGlmaWNhdGlvblwiOiBmdW5jdGlvbihub3RpZmljYXRpb24pIHtcbiAqICAgICAgIHZhciBwYXlsb2FkID0gJGlvbmljUHVzaC5nZXRQYXlsb2FkKG5vdGlmaWNhdGlvbik7XG4gKiAgICAgICBjb25zb2xlLmxvZyhub3RpZmljYXRpb24sIHBheWxvYWQpO1xuICogICAgIH0sXG4gKiAgICAgXCJvblJlZ2lzdGVyXCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAqICAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICogICAgIH1cbiAqICAgfSk7XG4gKlxuICogICAvLyBSZWdpc3RlcnMgZm9yIGEgZGV2aWNlIHRva2VuIHVzaW5nIHRoZSBvcHRpb25zIHBhc3NlZCB0byBpbml0KClcbiAqICAgcHVzaC5yZWdpc3RlcihjYWxsYmFjayk7XG4gKlxuICogICAvLyBVbnJlZ2lzdGVyIHRoZSBjdXJyZW50IHJlZ2lzdGVyZWQgdG9rZW5cbiAqICAgcHVzaC51bnJlZ2lzdGVyKCk7XG4gKlxuICovXG5leHBvcnQgY2xhc3MgUHVzaCB7XG4gICAgY29uc3RydWN0b3IoY29uZmlnKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIFB1c2g6J1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIElvbmljQXBwID0gbmV3IEFwcChzZXR0aW5ncy5nZXQoJ2FwcF9pZCcpLCBzZXR0aW5ncy5nZXQoJ2FwaV9rZXknKSk7XG4gICAgICAgIElvbmljQXBwLmRldlB1c2ggPSBzZXR0aW5ncy5nZXQoJ2Rldl9wdXNoJyk7XG4gICAgICAgIElvbmljQXBwLmdjbUtleSA9IHNldHRpbmdzLmdldCgnZ2NtX2tleScpO1xuICAgICAgICAvLyBDaGVjayBmb3IgdGhlIHJlcXVpcmVkIHZhbHVlcyB0byB1c2UgdGhpcyBzZXJ2aWNlXG4gICAgICAgIGlmICghSW9uaWNBcHAuaWQgfHwgIUlvbmljQXBwLmFwaUtleSkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ25vIGFwcF9pZCBvciBhcGlfa2V5IGZvdW5kLiAoaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9pby1pbnN0YWxsKScpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKElvbmljUGxhdGZvcm1Db3JlLmlzQW5kcm9pZERldmljZSgpICYmICFJb25pY0FwcC5kZXZQdXNoICYmICFJb25pY0FwcC5nY21LZXkpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdHQ00gcHJvamVjdCBudW1iZXIgbm90IGZvdW5kIChodHRwOi8vZG9jcy5pb25pYy5pby9kb2NzL3B1c2gtYW5kcm9pZC1zZXR1cCknKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFwcCA9IElvbmljQXBwO1xuICAgICAgICB0aGlzLnJlZ2lzdGVyQ2FsbGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbkNhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgdGhpcy5lcnJvckNhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl9ub3RpZmljYXRpb24gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZGVidWcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNSZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl90b2tlblJlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrU2F2ZVRva2VuID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3JlZ2lzdGVyZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICAgICAgdGhpcy5fcGx1Z2luID0gbnVsbDtcbiAgICAgICAgaWYgKGNvbmZpZyAhPT0gREVGRVJfSU5JVCkge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgSW9uaWNQbGF0Zm9ybS5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmluaXQoY29uZmlnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHNldCB0b2tlbih2YWwpIHtcbiAgICAgICAgdmFyIHN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtQ29yZS5nZXRTdG9yYWdlKCk7XG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBQdXNoVG9rZW4pIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nLCB7ICd0b2tlbic6IHZhbC50b2tlbiB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl90b2tlbiA9IHZhbDtcbiAgICB9XG4gICAgZ2V0U3RvcmFnZVRva2VuKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IElvbmljUGxhdGZvcm1Db3JlLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgdmFyIHRva2VuID0gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdCgnaW9uaWNfaW9fcHVzaF90b2tlbicpO1xuICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHVzaFRva2VuKHRva2VuLnRva2VuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY2xlYXJTdG9yYWdlVG9rZW4oKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gSW9uaWNQbGF0Zm9ybUNvcmUuZ2V0U3RvcmFnZSgpO1xuICAgICAgICBzdG9yYWdlLmRlbGV0ZU9iamVjdCgnaW9uaWNfaW9fcHVzaF90b2tlbicpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJbml0IG1ldGhvZCB0byBzZXR1cCBwdXNoIGJlaGF2aW9yL29wdGlvbnNcbiAgICAgKlxuICAgICAqIFRoZSBjb25maWcgc3VwcG9ydHMgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgICAqICAgLSBkZWJ1ZyB7Qm9vbGVhbn0gRW5hYmxlcyBzb21lIGV4dHJhIGxvZ2dpbmcgYXMgd2VsbCBhcyBzb21lIGRlZmF1bHQgY2FsbGJhY2sgaGFuZGxlcnNcbiAgICAgKiAgIC0gb25Ob3RpZmljYXRpb24ge0Z1bmN0aW9ufSBDYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHBhc3NlZCB0aGUgbm90aWZpY2F0aW9uIG9iamVjdFxuICAgICAqICAgLSBvblJlZ2lzdGVyIHtGdW5jdGlvbn0gQ2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBpcyBwYXNzZWQgdGhlIHJlZ2lzdHJhdGlvbiBvYmplY3RcbiAgICAgKiAgIC0gb25FcnJvciB7RnVuY3Rpb259IENhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgaXMgcGFzc2VkIHRoZSBlcnJvciBvYmplY3RcbiAgICAgKiAgIC0gcGx1Z2luQ29uZmlnIHtPYmplY3R9IFBsdWdpbiBjb25maWd1cmF0aW9uOiBodHRwczovL2dpdGh1Yi5jb20vcGhvbmVnYXAvcGhvbmVnYXAtcGx1Z2luLXB1c2hcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBjb25maWcgQ29uZmlndXJhdGlvbiBvYmplY3RcbiAgICAgKiBAcmV0dXJuIHtQdXNofSByZXR1cm5zIHRoZSBjYWxsZWQgUHVzaCBpbnN0YW50aWF0aW9uXG4gICAgICovXG4gICAgaW5pdChjb25maWcpIHtcbiAgICAgICAgdGhpcy5fZ2V0UHVzaFBsdWdpbigpO1xuICAgICAgICBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGNvbmZpZyA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuZXJyb3IoJ2luaXQoKSByZXF1aXJlcyBhIHZhbGlkIGNvbmZpZyBvYmplY3QuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIWNvbmZpZy5wbHVnaW5Db25maWcpIHtcbiAgICAgICAgICAgIGNvbmZpZy5wbHVnaW5Db25maWcgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoSW9uaWNQbGF0Zm9ybUNvcmUuaXNBbmRyb2lkRGV2aWNlKCkpIHtcbiAgICAgICAgICAgIC8vIGluamVjdCBnY20ga2V5IGZvciBQdXNoUGx1Z2luXG4gICAgICAgICAgICBpZiAoIWNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZCkge1xuICAgICAgICAgICAgICAgIGNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZCA9IHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQuc2VuZGVySWQpIHtcbiAgICAgICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQuc2VuZGVySUQgPSBzZWxmLmFwcC5nY21LZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gU3RvcmUgQ2FsbGJhY2tzXG4gICAgICAgIGlmIChjb25maWcub25SZWdpc3Rlcikge1xuICAgICAgICAgICAgdGhpcy5zZXRSZWdpc3RlckNhbGxiYWNrKGNvbmZpZy5vblJlZ2lzdGVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLm9uTm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNldE5vdGlmaWNhdGlvbkNhbGxiYWNrKGNvbmZpZy5vbk5vdGlmaWNhdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5vbkVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLnNldEVycm9yQ2FsbGJhY2soY29uZmlnLm9uRXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5faXNSZWFkeSA9IHRydWU7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdCgnaW9uaWNfcHVzaDpyZWFkeScsIHsgXCJjb25maWdcIjogdGhpcy5fY29uZmlnIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgc2F2ZVRva2VuKHRva2VuLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIGlmICh0b2tlbi50b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0b2tlbi50b2tlbjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdG9rZW5EYXRhID0ge1xuICAgICAgICAgICAgJ3Rva2VuJzogdG9rZW4sXG4gICAgICAgICAgICAnYXBwX2lkJzogc2V0dGluZ3MuZ2V0KCdhcHBfaWQnKVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIW9wdHMuaWdub3JlX3VzZXIpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gVXNlci5jdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAodXNlci5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgICAgIHRva2VuRGF0YS51c2VyX2lkID0gdXNlci5pZDsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tTYXZlVG9rZW4pIHtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogcHVzaEFQSUVuZHBvaW50cy5zYXZlVG9rZW4oKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzogdG9rZW5EYXRhXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NhdmVkIHB1c2ggdG9rZW46ICcgKyB0b2tlbik7XG4gICAgICAgICAgICAgICAgaWYgKHRva2VuRGF0YS51c2VyX2lkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FkZGVkIHB1c2ggdG9rZW4gdG8gdXNlcjogJyArIHRva2VuRGF0YS51c2VyX2lkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImEgdG9rZW4gc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyB0aGUgZGV2aWNlIHdpdGggR0NNL0FQTlMgdG8gZ2V0IGEgZGV2aWNlIHRva2VuXG4gICAgICogRmlyZXMgb2ZmIHRoZSAnb25SZWdpc3RlcicgY2FsbGJhY2sgaWYgb25lIGhhcyBiZWVuIHByb3ZpZGVkIGluIHRoZSBpbml0KCkgY29uZmlnXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2sgRnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlZ2lzdGVyKGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3JlZ2lzdGVyJyk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiYW5vdGhlciByZWdpc3RyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYmxvY2tSZWdpc3RyYXRpb24gPSB0cnVlO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICB2YXIgSW9uaWNEZXZQdXNoID0gbmV3IFB1c2hEZXZTZXJ2aWNlKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgSW9uaWNEZXZQdXNoLmluaXQoc2VsZiwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5fdG9rZW5SZWFkeSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4gPSBzZWxmLl9nZXRQdXNoUGx1Z2luKCkuaW5pdChzZWxmLl9jb25maWcucGx1Z2luQ29uZmlnKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgUHVzaFRva2VuKGRhdGEucmVnaXN0cmF0aW9uSWQpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl90b2tlblJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmLl90b2tlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZWxmLl9kZWJ1Z0NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fY2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGYuX3JlZ2lzdGVyZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSW52YWxpZGF0ZSB0aGUgY3VycmVudCBHQ00vQVBOUyB0b2tlblxuICAgICAqXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gdGhlIHVucmVnaXN0ZXIgcmVzdWx0XG4gICAgICovXG4gICAgdW5yZWdpc3RlcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBwbGF0Zm9ybSA9IG51bGw7XG4gICAgICAgIGlmIChJb25pY1BsYXRmb3JtQ29yZS5pc0FuZHJvaWREZXZpY2UoKSkge1xuICAgICAgICAgICAgcGxhdGZvcm0gPSAnYW5kcm9pZCc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoSW9uaWNQbGF0Zm9ybUNvcmUuaXNJT1NEZXZpY2UoKSkge1xuICAgICAgICAgICAgcGxhdGZvcm0gPSAnaW9zJztcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXBsYXRmb3JtKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJDb3VsZCBub3QgZGV0ZWN0IHRoZSBwbGF0Zm9ybSwgYXJlIHlvdSBvbiBhIGRldmljZT9cIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWxmLl9ibG9ja1VucmVnaXN0ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wbHVnaW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4udW5yZWdpc3RlcihmdW5jdGlvbiAoKSB7IH0sIGZ1bmN0aW9uICgpIHsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHB1c2hBUElFbmRwb2ludHMuaW52YWxpZGF0ZVRva2VuKCksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHtcbiAgICAgICAgICAgICAgICAgICAgJ3BsYXRmb3JtJzogcGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgICAgICd0b2tlbic6IHNlbGYuZ2V0U3RvcmFnZVRva2VuKCkudG9rZW5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1VucmVnaXN0ZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCd1bnJlZ2lzdGVyZWQgcHVzaCB0b2tlbjogJyArIHNlbGYuZ2V0U3RvcmFnZVRva2VuKCkudG9rZW4pO1xuICAgICAgICAgICAgICAgIHNlbGYuY2xlYXJTdG9yYWdlVG9rZW4oKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1VucmVnaXN0ZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImFuIHVucmVnaXN0ZXIgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ29udmVuaWVuY2UgbWV0aG9kIHRvIGdyYWIgdGhlIHBheWxvYWQgb2JqZWN0IGZyb20gYSBub3RpZmljYXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UHVzaE5vdGlmaWNhdGlvbn0gbm90aWZpY2F0aW9uIFB1c2ggTm90aWZpY2F0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge29iamVjdH0gUGF5bG9hZCBvYmplY3Qgb3IgYW4gZW1wdHkgb2JqZWN0XG4gICAgICovXG4gICAgZ2V0UGF5bG9hZChub3RpZmljYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIG5vdGlmaWNhdGlvbi5wYXlsb2FkO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIHJlZ2lzdHJhdGlvbiBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgUmVnaXN0cmF0aW9uIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gdHJ1ZSBpZiBzZXQgY29ycmVjdGx5LCBvdGhlcndpc2UgZmFsc2VcbiAgICAgKi9cbiAgICBzZXRSZWdpc3RlckNhbGxiYWNrKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NldFJlZ2lzdGVyQ2FsbGJhY2soKSByZXF1aXJlcyBhIHZhbGlkIGNhbGxiYWNrIGZ1bmN0aW9uJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZWdpc3RlckNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIG5vdGlmaWNhdGlvbiBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgTm90aWZpY2F0aW9uIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gdHJ1ZSBpZiBzZXQgY29ycmVjdGx5LCBvdGhlcndpc2UgZmFsc2VcbiAgICAgKi9cbiAgICBzZXROb3RpZmljYXRpb25DYWxsYmFjayhjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXROb3RpZmljYXRpb25DYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbkNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGVycm9yIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBFcnJvciBjYWxsYmFjayBmdW5jdGlvblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IHRydWUgaWYgc2V0IGNvcnJlY3RseSwgb3RoZXJ3aXNlIGZhbHNlXG4gICAgICovXG4gICAgc2V0RXJyb3JDYWxsYmFjayhjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXRFcnJvckNhbGxiYWNrKCkgcmVxdWlyZXMgYSB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZXJyb3JDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgX2RlYnVnUmVnaXN0cmF0aW9uQ2FsbGJhY2soKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2soZGF0YSkge1xuICAgICAgICAgICAgc2VsZi50b2tlbiA9IG5ldyBQdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCcoZGVidWcpIGRldmljZSB0b2tlbiByZWdpc3RlcmVkOiAnICsgc2VsZi5fdG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9XG4gICAgX2RlYnVnTm90aWZpY2F0aW9uQ2FsbGJhY2soKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2sobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLl9wcm9jZXNzTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9IFB1c2hNZXNzYWdlLmZyb21QbHVnaW5KU09OKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCcoZGVidWcpIG5vdGlmaWNhdGlvbiByZWNlaXZlZDogJyArIG1lc3NhZ2UpO1xuICAgICAgICAgICAgaWYgKCFzZWxmLm5vdGlmaWNhdGlvbkNhbGxiYWNrICYmIHNlbGYuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICBhbGVydChtZXNzYWdlLnRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9XG4gICAgX2RlYnVnRXJyb3JDYWxsYmFjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhlcnIpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCcoZGVidWcpIHVuZXhwZWN0ZWQgZXJyb3Igb2NjdXJlZC4nKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH1cbiAgICBfcmVnaXN0ZXJDYWxsYmFjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhkYXRhKSB7XG4gICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IFB1c2hUb2tlbihkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICAgIGlmIChzZWxmLnJlZ2lzdGVyQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5yZWdpc3RlckNhbGxiYWNrKHNlbGYuX3Rva2VuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfVxuICAgIF9ub3RpZmljYXRpb25DYWxsYmFjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhub3RpZmljYXRpb24pIHtcbiAgICAgICAgICAgIHNlbGYuX3Byb2Nlc3NOb3RpZmljYXRpb24obm90aWZpY2F0aW9uKTtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlID0gUHVzaE1lc3NhZ2UuZnJvbVBsdWdpbkpTT04obm90aWZpY2F0aW9uKTtcbiAgICAgICAgICAgIGlmIChzZWxmLm5vdGlmaWNhdGlvbkNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYubm90aWZpY2F0aW9uQ2FsbGJhY2sobWVzc2FnZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH1cbiAgICBfZXJyb3JDYWxsYmFjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhlcnIpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmVycm9yQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5lcnJvckNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIGRlZmF1bHQgZGVidWcgY2FsbGJhY2tzIHdpdGggdGhlIFB1c2hQbHVnaW4gd2hlbiBkZWJ1ZyBpcyBlbmFibGVkXG4gICAgICogSW50ZXJuYWwgTWV0aG9kXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIF9kZWJ1Z0NhbGxiYWNrUmVnaXN0cmF0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fY29uZmlnLmRlYnVnKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIHRoaXMuX2RlYnVnUmVnaXN0cmF0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdub3RpZmljYXRpb24nLCB0aGlzLl9kZWJ1Z05vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignZXJyb3InLCB0aGlzLl9kZWJ1Z0Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX3JlZ2lzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDp0b2tlbicsIHRoaXMuX2RlYnVnUmVnaXN0cmF0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6bm90aWZpY2F0aW9uJywgdGhpcy5fZGVidWdOb3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDplcnJvcicsIHRoaXMuX2RlYnVnRXJyb3JDYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIHRoZSB1c2VyIHN1cHBsaWVkIGNhbGxiYWNrcyB3aXRoIHRoZSBQdXNoUGx1Z2luXG4gICAgICogSW50ZXJuYWwgTWV0aG9kXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBfY2FsbGJhY2tSZWdpc3RyYXRpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy5hcHAuZGV2UHVzaCkge1xuICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdyZWdpc3RyYXRpb24nLCB0aGlzLl9yZWdpc3RlckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdub3RpZmljYXRpb24nLCB0aGlzLl9ub3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignZXJyb3InLCB0aGlzLl9lcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKCF0aGlzLl9yZWdpc3RlcmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDp0b2tlbicsIHRoaXMuX3JlZ2lzdGVyQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpub3RpZmljYXRpb24nLCB0aGlzLl9ub3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOmVycm9yJywgdGhpcy5fZXJyb3JDYWxsYmFjaygpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBtaXNjIGZlYXR1cmVzIGJhc2VkIG9uIHRoZSBjb250ZW50cyBvZiBhIHB1c2ggbm90aWZpY2F0aW9uXG4gICAgICogSW50ZXJuYWwgTWV0aG9kXG4gICAgICpcbiAgICAgKiBDdXJyZW50bHkganVzdCBkb2VzIHRoZSBwYXlsb2FkICRzdGF0ZSByZWRpcmVjdGlvblxuICAgICAqIEBwYXJhbSB7UHVzaE5vdGlmaWNhdGlvbn0gbm90aWZpY2F0aW9uIFB1c2ggTm90aWZpY2F0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgX3Byb2Nlc3NOb3RpZmljYXRpb24obm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHRoaXMuX25vdGlmaWNhdGlvbiA9IG5vdGlmaWNhdGlvbjtcbiAgICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KCdpb25pY19wdXNoOnByb2Nlc3NOb3RpZmljYXRpb24nLCBub3RpZmljYXRpb24pO1xuICAgIH1cbiAgICAvKiBEZXByZWNhdGVkIGluIGZhdm9yIG9mIGBnZXRQdXNoUGx1Z2luYCAqL1xuICAgIF9nZXRQdXNoUGx1Z2luKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBQdXNoUGx1Z2luID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIFB1c2hQbHVnaW4gPSB3aW5kb3cuUHVzaE5vdGlmaWNhdGlvbjtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc29tZXRoaW5nIHdlbnQgd3JvbmcgbG9va2luZyBmb3IgdGhlIFB1c2hOb3RpZmljYXRpb24gcGx1Z2luJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWxmLmFwcC5kZXZQdXNoICYmICFQdXNoUGx1Z2luICYmIChJb25pY1BsYXRmb3JtQ29yZS5pc0lPU0RldmljZSgpIHx8IElvbmljUGxhdGZvcm1Db3JlLmlzQW5kcm9pZERldmljZSgpKSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoXCJQdXNoTm90aWZpY2F0aW9uIHBsdWdpbiBpcyByZXF1aXJlZC4gSGF2ZSB5b3UgcnVuIGBpb25pYyBwbHVnaW4gYWRkIHBob25lZ2FwLXBsdWdpbi1wdXNoYCA/XCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBQdXNoUGx1Z2luO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGZXRjaCB0aGUgcGhvbmVnYXAtcHVzaC1wbHVnaW4gaW50ZXJmYWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQdXNoTm90aWZpY2F0aW9ufSBQdXNoTm90aWZpY2F0aW9uIGluc3RhbmNlXG4gICAgICovXG4gICAgZ2V0UHVzaFBsdWdpbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsdWdpbjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRmlyZSBhIGNhbGxiYWNrIHdoZW4gUHVzaCBpcyByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgc2VydmljZSBoYXMgYWxyZWFkeSBpbml0aWFsaXplZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvblJlYWR5KGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2lzUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vdXRpbFwiO1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGRlZXBFeHRlbmQoLi4ub3V0KSB7XG4gICAgb3V0ID0gb3V0WzBdIHx8IHt9O1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBvYmogPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGlmICghb2JqKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICBvdXRba2V5XSA9IGRlZXBFeHRlbmQob3V0W2tleV0sIG9ialtrZXldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dFtrZXldID0gb2JqW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59XG4iLCIvLyBCcm93c2VyIFJlcXVlc3Rcbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbi8vIFVNRCBIRUFERVIgU1RBUlQgXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cbiAgICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAvLyBOb2RlLiBEb2VzIG5vdCB3b3JrIHdpdGggc3RyaWN0IENvbW1vbkpTLCBidXRcbiAgICAgICAgLy8gb25seSBDb21tb25KUy1saWtlIGVudmlyb21lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cyxcbiAgICAgICAgLy8gbGlrZSBOb2RlLlxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHJvb3QgaXMgd2luZG93KVxuICAgICAgICByb290LnJldHVybkV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gIH1cbn0odGhpcywgZnVuY3Rpb24gKCkge1xuLy8gVU1EIEhFQURFUiBFTkRcblxudmFyIFhIUiA9IFhNTEh0dHBSZXF1ZXN0XG5pZiAoIVhIUikgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIFhNTEh0dHBSZXF1ZXN0JylcbnJlcXVlc3QubG9nID0ge1xuICAndHJhY2UnOiBub29wLCAnZGVidWcnOiBub29wLCAnaW5mbyc6IG5vb3AsICd3YXJuJzogbm9vcCwgJ2Vycm9yJzogbm9vcFxufVxuXG52YXIgREVGQVVMVF9USU1FT1VUID0gMyAqIDYwICogMTAwMCAvLyAzIG1pbnV0ZXNcblxuLy9cbi8vIHJlcXVlc3Rcbi8vXG5cbmZ1bmN0aW9uIHJlcXVlc3Qob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgLy8gVGhlIGVudHJ5LXBvaW50IHRvIHRoZSBBUEk6IHByZXAgdGhlIG9wdGlvbnMgb2JqZWN0IGFuZCBwYXNzIHRoZSByZWFsIHdvcmsgdG8gcnVuX3hoci5cbiAgaWYodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcignQmFkIGNhbGxiYWNrIGdpdmVuOiAnICsgY2FsbGJhY2spXG5cbiAgaWYoIW9wdGlvbnMpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBvcHRpb25zIGdpdmVuJylcblxuICB2YXIgb3B0aW9uc19vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlOyAvLyBTYXZlIHRoaXMgZm9yIGxhdGVyLlxuXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9O1xuICBlbHNlXG4gICAgb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucykpOyAvLyBVc2UgYSBkdXBsaWNhdGUgZm9yIG11dGF0aW5nLlxuXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnNfb25SZXNwb25zZSAvLyBBbmQgcHV0IGl0IGJhY2suXG5cbiAgaWYgKG9wdGlvbnMudmVyYm9zZSkgcmVxdWVzdC5sb2cgPSBnZXRMb2dnZXIoKTtcblxuICBpZihvcHRpb25zLnVybCkge1xuICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmw7XG4gICAgZGVsZXRlIG9wdGlvbnMudXJsO1xuICB9XG5cbiAgaWYoIW9wdGlvbnMudXJpICYmIG9wdGlvbnMudXJpICE9PSBcIlwiKVxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIGlzIGEgcmVxdWlyZWQgYXJndW1lbnRcIik7XG5cbiAgaWYodHlwZW9mIG9wdGlvbnMudXJpICE9IFwic3RyaW5nXCIpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgbXVzdCBiZSBhIHN0cmluZ1wiKTtcblxuICB2YXIgdW5zdXBwb3J0ZWRfb3B0aW9ucyA9IFsncHJveHknLCAnX3JlZGlyZWN0c0ZvbGxvd2VkJywgJ21heFJlZGlyZWN0cycsICdmb2xsb3dSZWRpcmVjdCddXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdW5zdXBwb3J0ZWRfb3B0aW9ucy5sZW5ndGg7IGkrKylcbiAgICBpZihvcHRpb25zWyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldIF0pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLlwiICsgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSArIFwiIGlzIG5vdCBzdXBwb3J0ZWRcIilcblxuICBvcHRpb25zLmNhbGxiYWNrID0gY2FsbGJhY2tcbiAgb3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJztcbiAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICBvcHRpb25zLmJvZHkgICAgPSBvcHRpb25zLmJvZHkgfHwgbnVsbFxuICBvcHRpb25zLnRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQgfHwgcmVxdWVzdC5ERUZBVUxUX1RJTUVPVVRcblxuICBpZihvcHRpb25zLmhlYWRlcnMuaG9zdClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJPcHRpb25zLmhlYWRlcnMuaG9zdCBpcyBub3Qgc3VwcG9ydGVkXCIpO1xuXG4gIGlmKG9wdGlvbnMuanNvbikge1xuICAgIG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgPSBvcHRpb25zLmhlYWRlcnMuYWNjZXB0IHx8ICdhcHBsaWNhdGlvbi9qc29uJ1xuICAgIGlmKG9wdGlvbnMubWV0aG9kICE9PSAnR0VUJylcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcblxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmpzb24gIT09ICdib29sZWFuJylcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcbiAgICBlbHNlIGlmKHR5cGVvZiBvcHRpb25zLmJvZHkgIT09ICdzdHJpbmcnKVxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5ib2R5KVxuICB9XG4gIFxuICAvL0JFR0lOIFFTIEhhY2tcbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBzdHIgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKVxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9XG4gIFxuICBpZihvcHRpb25zLnFzKXtcbiAgICB2YXIgcXMgPSAodHlwZW9mIG9wdGlvbnMucXMgPT0gJ3N0cmluZycpPyBvcHRpb25zLnFzIDogc2VyaWFsaXplKG9wdGlvbnMucXMpO1xuICAgIGlmKG9wdGlvbnMudXJpLmluZGV4T2YoJz8nKSAhPT0gLTEpeyAvL25vIGdldCBwYXJhbXNcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnJicrcXM7XG4gICAgfWVsc2V7IC8vZXhpc3RpbmcgZ2V0IHBhcmFtc1xuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKyc/JytxcztcbiAgICB9XG4gIH1cbiAgLy9FTkQgUVMgSGFja1xuICBcbiAgLy9CRUdJTiBGT1JNIEhhY2tcbiAgdmFyIG11bHRpcGFydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIC8vdG9kbzogc3VwcG9ydCBmaWxlIHR5cGUgKHVzZWZ1bD8pXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHJlc3VsdC5ib3VuZHJ5ID0gJy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0nK01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMDAwMDAwKTtcbiAgICB2YXIgbGluZXMgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKXtcbiAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICAgICAgbGluZXMucHVzaChcbiAgICAgICAgICAgICAgICAnLS0nK3Jlc3VsdC5ib3VuZHJ5K1wiXFxuXCIrXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtRGlzcG9zaXRpb246IGZvcm0tZGF0YTsgbmFtZT1cIicrcCsnXCInK1wiXFxuXCIrXG4gICAgICAgICAgICAgICAgXCJcXG5cIitcbiAgICAgICAgICAgICAgICBvYmpbcF0rXCJcXG5cIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBsaW5lcy5wdXNoKCAnLS0nK3Jlc3VsdC5ib3VuZHJ5KyctLScgKTtcbiAgICByZXN1bHQuYm9keSA9IGxpbmVzLmpvaW4oJycpO1xuICAgIHJlc3VsdC5sZW5ndGggPSByZXN1bHQuYm9keS5sZW5ndGg7XG4gICAgcmVzdWx0LnR5cGUgPSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9JytyZXN1bHQuYm91bmRyeTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIFxuICBpZihvcHRpb25zLmZvcm0pe1xuICAgIGlmKHR5cGVvZiBvcHRpb25zLmZvcm0gPT0gJ3N0cmluZycpIHRocm93KCdmb3JtIG5hbWUgdW5zdXBwb3J0ZWQnKTtcbiAgICBpZihvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnKXtcbiAgICAgICAgdmFyIGVuY29kaW5nID0gKG9wdGlvbnMuZW5jb2RpbmcgfHwgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBlbmNvZGluZztcbiAgICAgICAgc3dpdGNoKGVuY29kaW5nKXtcbiAgICAgICAgICAgIGNhc2UgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gc2VyaWFsaXplKG9wdGlvbnMuZm9ybSkucmVwbGFjZSgvJTIwL2csIFwiK1wiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGFydC9mb3JtLWRhdGEnOlxuICAgICAgICAgICAgICAgIHZhciBtdWx0aSA9IG11bHRpcGFydChvcHRpb25zLmZvcm0pO1xuICAgICAgICAgICAgICAgIC8vb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gbXVsdGkubGVuZ3RoO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IG11bHRpLmJvZHk7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IG11bHRpLnR5cGU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0IDogdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBlbmNvZGluZzonK2VuY29kaW5nKTtcbiAgICAgICAgfVxuICAgIH1cbiAgfVxuICAvL0VORCBGT1JNIEhhY2tcblxuICAvLyBJZiBvblJlc3BvbnNlIGlzIGJvb2xlYW4gdHJ1ZSwgY2FsbCBiYWNrIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHJlc3BvbnNlIGlzIGtub3duLFxuICAvLyBub3Qgd2hlbiB0aGUgZnVsbCByZXF1ZXN0IGlzIGNvbXBsZXRlLlxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2UgfHwgbm9vcFxuICBpZihvcHRpb25zLm9uUmVzcG9uc2UgPT09IHRydWUpIHtcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UgPSBjYWxsYmFja1xuICAgIG9wdGlvbnMuY2FsbGJhY2sgPSBub29wXG4gIH1cblxuICAvLyBYWFggQnJvd3NlcnMgZG8gbm90IGxpa2UgdGhpcy5cbiAgLy9pZihvcHRpb25zLmJvZHkpXG4gIC8vICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBvcHRpb25zLmJvZHkubGVuZ3RoO1xuXG4gIC8vIEhUVFAgYmFzaWMgYXV0aGVudGljYXRpb25cbiAgaWYoIW9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uICYmIG9wdGlvbnMuYXV0aClcbiAgICBvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9ICdCYXNpYyAnICsgYjY0X2VuYyhvcHRpb25zLmF1dGgudXNlcm5hbWUgKyAnOicgKyBvcHRpb25zLmF1dGgucGFzc3dvcmQpO1xuXG4gIHJldHVybiBydW5feGhyKG9wdGlvbnMpXG59XG5cbnZhciByZXFfc2VxID0gMFxuZnVuY3Rpb24gcnVuX3hocihvcHRpb25zKSB7XG4gIHZhciB4aHIgPSBuZXcgWEhSXG4gICAgLCB0aW1lZF9vdXQgPSBmYWxzZVxuICAgICwgaXNfY29ycyA9IGlzX2Nyb3NzRG9tYWluKG9wdGlvbnMudXJpKVxuICAgICwgc3VwcG9ydHNfY29ycyA9ICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpXG5cbiAgcmVxX3NlcSArPSAxXG4gIHhoci5zZXFfaWQgPSByZXFfc2VxXG4gIHhoci5pZCA9IHJlcV9zZXEgKyAnOiAnICsgb3B0aW9ucy5tZXRob2QgKyAnICcgKyBvcHRpb25zLnVyaVxuICB4aHIuX2lkID0geGhyLmlkIC8vIEkga25vdyBJIHdpbGwgdHlwZSBcIl9pZFwiIGZyb20gaGFiaXQgYWxsIHRoZSB0aW1lLlxuXG4gIGlmKGlzX2NvcnMgJiYgIXN1cHBvcnRzX2NvcnMpIHtcbiAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0Jyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBjcm9zcy1vcmlnaW4gcmVxdWVzdDogJyArIG9wdGlvbnMudXJpKVxuICAgIGNvcnNfZXJyLmNvcnMgPSAndW5zdXBwb3J0ZWQnXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcbiAgfVxuXG4gIHhoci50aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KHRvb19sYXRlLCBvcHRpb25zLnRpbWVvdXQpXG4gIGZ1bmN0aW9uIHRvb19sYXRlKCkge1xuICAgIHRpbWVkX291dCA9IHRydWVcbiAgICB2YXIgZXIgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpXG4gICAgZXIuY29kZSA9ICdFVElNRURPVVQnXG4gICAgZXIuZHVyYXRpb24gPSBvcHRpb25zLnRpbWVvdXRcblxuICAgIHJlcXVlc3QubG9nLmVycm9yKCdUaW1lb3V0JywgeyAnaWQnOnhoci5faWQsICdtaWxsaXNlY29uZHMnOm9wdGlvbnMudGltZW91dCB9KVxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpXG4gIH1cblxuICAvLyBTb21lIHN0YXRlcyBjYW4gYmUgc2tpcHBlZCBvdmVyLCBzbyByZW1lbWJlciB3aGF0IGlzIHN0aWxsIGluY29tcGxldGUuXG4gIHZhciBkaWQgPSB7J3Jlc3BvbnNlJzpmYWxzZSwgJ2xvYWRpbmcnOmZhbHNlLCAnZW5kJzpmYWxzZX1cblxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25fc3RhdGVfY2hhbmdlXG4gIHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVyaSwgdHJ1ZSkgLy8gYXN5bmNocm9ub3VzXG4gIGlmKGlzX2NvcnMpXG4gICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzXG4gIHhoci5zZW5kKG9wdGlvbnMuYm9keSlcbiAgcmV0dXJuIHhoclxuXG4gIGZ1bmN0aW9uIG9uX3N0YXRlX2NoYW5nZShldmVudCkge1xuICAgIGlmKHRpbWVkX291dClcbiAgICAgIHJldHVybiByZXF1ZXN0LmxvZy5kZWJ1ZygnSWdub3JpbmcgdGltZWQgb3V0IHN0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZH0pXG5cbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnU3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkLCAndGltZWRfb3V0Jzp0aW1lZF9vdXR9KVxuXG4gICAgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5PUEVORUQpIHtcbiAgICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IHN0YXJ0ZWQnLCB7J2lkJzp4aHIuaWR9KVxuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMuaGVhZGVycylcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBvcHRpb25zLmhlYWRlcnNba2V5XSlcbiAgICB9XG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuSEVBREVSU19SRUNFSVZFRClcbiAgICAgIG9uX3Jlc3BvbnNlKClcblxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5MT0FESU5HKSB7XG4gICAgICBvbl9yZXNwb25zZSgpXG4gICAgICBvbl9sb2FkaW5nKClcbiAgICB9XG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuRE9ORSkge1xuICAgICAgb25fcmVzcG9uc2UoKVxuICAgICAgb25fbG9hZGluZygpXG4gICAgICBvbl9lbmQoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uX3Jlc3BvbnNlKCkge1xuICAgIGlmKGRpZC5yZXNwb25zZSlcbiAgICAgIHJldHVyblxuXG4gICAgZGlkLnJlc3BvbnNlID0gdHJ1ZVxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdHb3QgcmVzcG9uc2UnLCB7J2lkJzp4aHIuaWQsICdzdGF0dXMnOnhoci5zdGF0dXN9KVxuICAgIGNsZWFyVGltZW91dCh4aHIudGltZW91dFRpbWVyKVxuICAgIHhoci5zdGF0dXNDb2RlID0geGhyLnN0YXR1cyAvLyBOb2RlIHJlcXVlc3QgY29tcGF0aWJpbGl0eVxuXG4gICAgLy8gRGV0ZWN0IGZhaWxlZCBDT1JTIHJlcXVlc3RzLlxuICAgIGlmKGlzX2NvcnMgJiYgeGhyLnN0YXR1c0NvZGUgPT0gMCkge1xuICAgICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdDT1JTIHJlcXVlc3QgcmVqZWN0ZWQ6ICcgKyBvcHRpb25zLnVyaSlcbiAgICAgIGNvcnNfZXJyLmNvcnMgPSAncmVqZWN0ZWQnXG5cbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHRoaXMgcmVxdWVzdCBmdXJ0aGVyLlxuICAgICAgZGlkLmxvYWRpbmcgPSB0cnVlXG4gICAgICBkaWQuZW5kID0gdHJ1ZVxuXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxuICAgIH1cblxuICAgIG9wdGlvbnMub25SZXNwb25zZShudWxsLCB4aHIpXG4gIH1cblxuICBmdW5jdGlvbiBvbl9sb2FkaW5nKCkge1xuICAgIGlmKGRpZC5sb2FkaW5nKVxuICAgICAgcmV0dXJuXG5cbiAgICBkaWQubG9hZGluZyA9IHRydWVcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVzcG9uc2UgYm9keSBsb2FkaW5nJywgeydpZCc6eGhyLmlkfSlcbiAgICAvLyBUT0RPOiBNYXliZSBzaW11bGF0ZSBcImRhdGFcIiBldmVudHMgYnkgd2F0Y2hpbmcgeGhyLnJlc3BvbnNlVGV4dFxuICB9XG5cbiAgZnVuY3Rpb24gb25fZW5kKCkge1xuICAgIGlmKGRpZC5lbmQpXG4gICAgICByZXR1cm5cblxuICAgIGRpZC5lbmQgPSB0cnVlXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3QgZG9uZScsIHsnaWQnOnhoci5pZH0pXG5cbiAgICB4aHIuYm9keSA9IHhoci5yZXNwb25zZVRleHRcbiAgICBpZihvcHRpb25zLmpzb24pIHtcbiAgICAgIHRyeSAgICAgICAgeyB4aHIuYm9keSA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCkgfVxuICAgICAgY2F0Y2ggKGVyKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpICAgICAgICB9XG4gICAgfVxuXG4gICAgb3B0aW9ucy5jYWxsYmFjayhudWxsLCB4aHIsIHhoci5ib2R5KVxuICB9XG5cbn0gLy8gcmVxdWVzdFxuXG5yZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IGZhbHNlO1xucmVxdWVzdC5ERUZBVUxUX1RJTUVPVVQgPSBERUZBVUxUX1RJTUVPVVQ7XG5cbi8vXG4vLyBkZWZhdWx0c1xuLy9cblxucmVxdWVzdC5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIHJlcXVlc3Rlcikge1xuICB2YXIgZGVmID0gZnVuY3Rpb24gKG1ldGhvZCkge1xuICAgIHZhciBkID0gZnVuY3Rpb24gKHBhcmFtcywgY2FsbGJhY2spIHtcbiAgICAgIGlmKHR5cGVvZiBwYXJhbXMgPT09ICdzdHJpbmcnKVxuICAgICAgICBwYXJhbXMgPSB7J3VyaSc6IHBhcmFtc307XG4gICAgICBlbHNlIHtcbiAgICAgICAgcGFyYW1zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShwYXJhbXMpKTtcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xuICAgICAgICBpZiAocGFyYW1zW2ldID09PSB1bmRlZmluZWQpIHBhcmFtc1tpXSA9IG9wdGlvbnNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtZXRob2QocGFyYW1zLCBjYWxsYmFjaylcbiAgICB9XG4gICAgcmV0dXJuIGRcbiAgfVxuICB2YXIgZGUgPSBkZWYocmVxdWVzdClcbiAgZGUuZ2V0ID0gZGVmKHJlcXVlc3QuZ2V0KVxuICBkZS5wb3N0ID0gZGVmKHJlcXVlc3QucG9zdClcbiAgZGUucHV0ID0gZGVmKHJlcXVlc3QucHV0KVxuICBkZS5oZWFkID0gZGVmKHJlcXVlc3QuaGVhZClcbiAgcmV0dXJuIGRlXG59XG5cbi8vXG4vLyBIVFRQIG1ldGhvZCBzaG9ydGN1dHNcbi8vXG5cbnZhciBzaG9ydGN1dHMgPSBbICdnZXQnLCAncHV0JywgJ3Bvc3QnLCAnaGVhZCcgXTtcbnNob3J0Y3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHNob3J0Y3V0KSB7XG4gIHZhciBtZXRob2QgPSBzaG9ydGN1dC50b1VwcGVyQ2FzZSgpO1xuICB2YXIgZnVuYyAgID0gc2hvcnRjdXQudG9Mb3dlckNhc2UoKTtcblxuICByZXF1ZXN0W2Z1bmNdID0gZnVuY3Rpb24ob3B0cykge1xuICAgIGlmKHR5cGVvZiBvcHRzID09PSAnc3RyaW5nJylcbiAgICAgIG9wdHMgPSB7J21ldGhvZCc6bWV0aG9kLCAndXJpJzpvcHRzfTtcbiAgICBlbHNlIHtcbiAgICAgIG9wdHMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdHMpKTtcbiAgICAgIG9wdHMubWV0aG9kID0gbWV0aG9kO1xuICAgIH1cblxuICAgIHZhciBhcmdzID0gW29wdHNdLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzLCBbMV0pKTtcbiAgICByZXR1cm4gcmVxdWVzdC5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxufSlcblxuLy9cbi8vIENvdWNoREIgc2hvcnRjdXRcbi8vXG5cbnJlcXVlc3QuY291Y2ggPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfVxuXG4gIC8vIEp1c3QgdXNlIHRoZSByZXF1ZXN0IEFQSSB0byBkbyBKU09OLlxuICBvcHRpb25zLmpzb24gPSB0cnVlXG4gIGlmKG9wdGlvbnMuYm9keSlcbiAgICBvcHRpb25zLmpzb24gPSBvcHRpb25zLmJvZHlcbiAgZGVsZXRlIG9wdGlvbnMuYm9keVxuXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgbm9vcFxuXG4gIHZhciB4aHIgPSByZXF1ZXN0KG9wdGlvbnMsIGNvdWNoX2hhbmRsZXIpXG4gIHJldHVybiB4aHJcblxuICBmdW5jdGlvbiBjb3VjaF9oYW5kbGVyKGVyLCByZXNwLCBib2R5KSB7XG4gICAgaWYoZXIpXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpXG5cbiAgICBpZigocmVzcC5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3Auc3RhdHVzQ29kZSA+IDI5OSkgJiYgYm9keS5lcnJvcikge1xuICAgICAgLy8gVGhlIGJvZHkgaXMgYSBDb3VjaCBKU09OIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBlcnJvci5cbiAgICAgIGVyID0gbmV3IEVycm9yKCdDb3VjaERCIGVycm9yOiAnICsgKGJvZHkuZXJyb3IucmVhc29uIHx8IGJvZHkuZXJyb3IuZXJyb3IpKVxuICAgICAgZm9yICh2YXIga2V5IGluIGJvZHkpXG4gICAgICAgIGVyW2tleV0gPSBib2R5W2tleV1cbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcbiAgfVxufVxuXG4vL1xuLy8gVXRpbGl0eVxuLy9cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbmZ1bmN0aW9uIGdldExvZ2dlcigpIHtcbiAgdmFyIGxvZ2dlciA9IHt9XG4gICAgLCBsZXZlbHMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddXG4gICAgLCBsZXZlbCwgaVxuXG4gIGZvcihpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xuICAgIGxldmVsID0gbGV2ZWxzW2ldXG5cbiAgICBsb2dnZXJbbGV2ZWxdID0gbm9vcFxuICAgIGlmKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlICYmIGNvbnNvbGVbbGV2ZWxdKVxuICAgICAgbG9nZ2VyW2xldmVsXSA9IGZvcm1hdHRlZChjb25zb2xlLCBsZXZlbClcbiAgfVxuXG4gIHJldHVybiBsb2dnZXJcbn1cblxuZnVuY3Rpb24gZm9ybWF0dGVkKG9iaiwgbWV0aG9kKSB7XG4gIHJldHVybiBmb3JtYXR0ZWRfbG9nZ2VyXG5cbiAgZnVuY3Rpb24gZm9ybWF0dGVkX2xvZ2dlcihzdHIsIGNvbnRleHQpIHtcbiAgICBpZih0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpXG4gICAgICBzdHIgKz0gJyAnICsgSlNPTi5zdHJpbmdpZnkoY29udGV4dClcblxuICAgIHJldHVybiBvYmpbbWV0aG9kXS5jYWxsKG9iaiwgc3RyKVxuICB9XG59XG5cbi8vIFJldHVybiB3aGV0aGVyIGEgVVJMIGlzIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3QuXG5mdW5jdGlvbiBpc19jcm9zc0RvbWFpbih1cmwpIHtcbiAgdmFyIHJ1cmwgPSAvXihbXFx3XFwrXFwuXFwtXSs6KSg/OlxcL1xcLyhbXlxcLz8jOl0qKSg/OjooXFxkKykpPyk/L1xuXG4gIC8vIGpRdWVyeSAjODEzOCwgSUUgbWF5IHRocm93IGFuIGV4Y2VwdGlvbiB3aGVuIGFjY2Vzc2luZ1xuICAvLyBhIGZpZWxkIGZyb20gd2luZG93LmxvY2F0aW9uIGlmIGRvY3VtZW50LmRvbWFpbiBoYXMgYmVlbiBzZXRcbiAgdmFyIGFqYXhMb2NhdGlvblxuICB0cnkgeyBhamF4TG9jYXRpb24gPSBsb2NhdGlvbi5ocmVmIH1cbiAgY2F0Y2ggKGUpIHtcbiAgICAvLyBVc2UgdGhlIGhyZWYgYXR0cmlidXRlIG9mIGFuIEEgZWxlbWVudCBzaW5jZSBJRSB3aWxsIG1vZGlmeSBpdCBnaXZlbiBkb2N1bWVudC5sb2NhdGlvblxuICAgIGFqYXhMb2NhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoIFwiYVwiICk7XG4gICAgYWpheExvY2F0aW9uLmhyZWYgPSBcIlwiO1xuICAgIGFqYXhMb2NhdGlvbiA9IGFqYXhMb2NhdGlvbi5ocmVmO1xuICB9XG5cbiAgdmFyIGFqYXhMb2NQYXJ0cyA9IHJ1cmwuZXhlYyhhamF4TG9jYXRpb24udG9Mb3dlckNhc2UoKSkgfHwgW11cbiAgICAsIHBhcnRzID0gcnVybC5leGVjKHVybC50b0xvd2VyQ2FzZSgpIClcblxuICB2YXIgcmVzdWx0ID0gISEoXG4gICAgcGFydHMgJiZcbiAgICAoICBwYXJ0c1sxXSAhPSBhamF4TG9jUGFydHNbMV1cbiAgICB8fCBwYXJ0c1syXSAhPSBhamF4TG9jUGFydHNbMl1cbiAgICB8fCAocGFydHNbM10gfHwgKHBhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpICE9IChhamF4TG9jUGFydHNbM10gfHwgKGFqYXhMb2NQYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKVxuICAgIClcbiAgKVxuXG4gIC8vY29uc29sZS5kZWJ1ZygnaXNfY3Jvc3NEb21haW4oJyt1cmwrJykgLT4gJyArIHJlc3VsdClcbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBNSVQgTGljZW5zZSBmcm9tIGh0dHA6Ly9waHBqcy5vcmcvZnVuY3Rpb25zL2Jhc2U2NF9lbmNvZGU6MzU4XG5mdW5jdGlvbiBiNjRfZW5jIChkYXRhKSB7XG4gICAgLy8gRW5jb2RlcyBzdHJpbmcgdXNpbmcgTUlNRSBiYXNlNjQgYWxnb3JpdGhtXG4gICAgdmFyIGI2NCA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIjtcbiAgICB2YXIgbzEsIG8yLCBvMywgaDEsIGgyLCBoMywgaDQsIGJpdHMsIGkgPSAwLCBhYyA9IDAsIGVuYz1cIlwiLCB0bXBfYXJyID0gW107XG5cbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfVxuXG4gICAgLy8gYXNzdW1lIHV0ZjggZGF0YVxuICAgIC8vIGRhdGEgPSB0aGlzLnV0ZjhfZW5jb2RlKGRhdGErJycpO1xuXG4gICAgZG8geyAvLyBwYWNrIHRocmVlIG9jdGV0cyBpbnRvIGZvdXIgaGV4ZXRzXG4gICAgICAgIG8xID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgIG8yID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgIG8zID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG5cbiAgICAgICAgYml0cyA9IG8xPDwxNiB8IG8yPDw4IHwgbzM7XG5cbiAgICAgICAgaDEgPSBiaXRzPj4xOCAmIDB4M2Y7XG4gICAgICAgIGgyID0gYml0cz4+MTIgJiAweDNmO1xuICAgICAgICBoMyA9IGJpdHM+PjYgJiAweDNmO1xuICAgICAgICBoNCA9IGJpdHMgJiAweDNmO1xuXG4gICAgICAgIC8vIHVzZSBoZXhldHMgdG8gaW5kZXggaW50byBiNjQsIGFuZCBhcHBlbmQgcmVzdWx0IHRvIGVuY29kZWQgc3RyaW5nXG4gICAgICAgIHRtcF9hcnJbYWMrK10gPSBiNjQuY2hhckF0KGgxKSArIGI2NC5jaGFyQXQoaDIpICsgYjY0LmNoYXJBdChoMykgKyBiNjQuY2hhckF0KGg0KTtcbiAgICB9IHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpO1xuXG4gICAgZW5jID0gdG1wX2Fyci5qb2luKCcnKTtcblxuICAgIHN3aXRjaCAoZGF0YS5sZW5ndGggJSAzKSB7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMikgKyAnPT0nO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0xKSArICc9JztcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVuYztcbn1cbiAgICByZXR1cm4gcmVxdWVzdDtcbi8vVU1EIEZPT1RFUiBTVEFSVFxufSkpO1xuLy9VTUQgRk9PVEVSIEVORFxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XG5cbi8vIEJhY2t3YXJkcy1jb21wYXQgd2l0aCBub2RlIDAuMTAueFxuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWF4TGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXG4vLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuIDEwIGxpc3RlbmVycyBhcmVcbi8vIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2ggaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXG5FdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XG4gIGlmICghaXNOdW1iZXIobikgfHwgbiA8IDAgfHwgaXNOYU4obikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCduIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc09iamVjdCh0aGlzLl9ldmVudHMuZXJyb3IpICYmICF0aGlzLl9ldmVudHMuZXJyb3IubGVuZ3RoKSkge1xuICAgICAgZXIgPSBhcmd1bWVudHNbMV07XG4gICAgICBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH1cbiAgICAgIHRocm93IFR5cGVFcnJvcignVW5jYXVnaHQsIHVuc3BlY2lmaWVkIFwiZXJyb3JcIiBldmVudC4nKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc1VuZGVmaW5lZChoYW5kbGVyKSlcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIHZhciBtO1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlLnRyYWNlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgaW4gSUUgMTBcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghZW1pdHRlci5fZXZlbnRzIHx8ICFlbWl0dGVyLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gMDtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbihlbWl0dGVyLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IDE7XG4gIGVsc2VcbiAgICByZXQgPSBlbWl0dGVyLl9ldmVudHNbdHlwZV0ubGVuZ3RoO1xuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCIvKiFcbiAqIEBvdmVydmlldyBlczYtcHJvbWlzZSAtIGEgdGlueSBpbXBsZW1lbnRhdGlvbiBvZiBQcm9taXNlcy9BKy5cbiAqIEBjb3B5cmlnaHQgQ29weXJpZ2h0IChjKSAyMDE0IFllaHVkYSBLYXR6LCBUb20gRGFsZSwgU3RlZmFuIFBlbm5lciBhbmQgY29udHJpYnV0b3JzIChDb252ZXJzaW9uIHRvIEVTNiBBUEkgYnkgSmFrZSBBcmNoaWJhbGQpXG4gKiBAbGljZW5zZSAgIExpY2Vuc2VkIHVuZGVyIE1JVCBsaWNlbnNlXG4gKiAgICAgICAgICAgIFNlZSBodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vamFrZWFyY2hpYmFsZC9lczYtcHJvbWlzZS9tYXN0ZXIvTElDRU5TRVxuICogQHZlcnNpb24gICAzLjAuMlxuICovXG5cbihmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJG9iamVjdE9yRnVuY3Rpb24oeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nIHx8ICh0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzTWF5YmVUaGVuYWJsZSh4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdvYmplY3QnICYmIHggIT09IG51bGw7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5ID0gZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkgPSBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuID0gMDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHRvU3RyaW5nID0ge30udG9TdHJpbmc7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQ7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbjtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcCA9IGZ1bmN0aW9uIGFzYXAoY2FsbGJhY2ssIGFyZykge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2xpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW5dID0gY2FsbGJhY2s7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiArIDFdID0gYXJnO1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiArPSAyO1xuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPT09IDIpIHtcbiAgICAgICAgLy8gSWYgbGVuIGlzIDIsIHRoYXQgbWVhbnMgdGhhdCB3ZSBuZWVkIHRvIHNjaGVkdWxlIGFuIGFzeW5jIGZsdXNoLlxuICAgICAgICAvLyBJZiBhZGRpdGlvbmFsIGNhbGxiYWNrcyBhcmUgcXVldWVkIGJlZm9yZSB0aGUgcXVldWUgaXMgZmx1c2hlZCwgdGhleVxuICAgICAgICAvLyB3aWxsIGJlIHByb2Nlc3NlZCBieSB0aGlzIGZsdXNoIHRoYXQgd2UgYXJlIHNjaGVkdWxpbmcuXG4gICAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4obGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldFNjaGVkdWxlcihzY2hlZHVsZUZuKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4gPSBzY2hlZHVsZUZuO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRBc2FwKGFzYXBGbikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAgPSBhc2FwRm47XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93ID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHdpbmRvdyA6IHVuZGVmaW5lZDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyB8fCB7fTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbC5XZWJLaXRNdXRhdGlvbk9ic2VydmVyO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlID0gdHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmIHt9LnRvU3RyaW5nLmNhbGwocHJvY2VzcykgPT09ICdbb2JqZWN0IHByb2Nlc3NdJztcblxuICAgIC8vIHRlc3QgZm9yIHdlYiB3b3JrZXIgYnV0IG5vdCBpbiBJRTEwXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc1dvcmtlciA9IHR5cGVvZiBVaW50OENsYW1wZWRBcnJheSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHR5cGVvZiBpbXBvcnRTY3JpcHRzICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgdHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSAndW5kZWZpbmVkJztcblxuICAgIC8vIG5vZGVcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTmV4dFRpY2soKSB7XG4gICAgICAvLyBub2RlIHZlcnNpb24gMC4xMC54IGRpc3BsYXlzIGEgZGVwcmVjYXRpb24gd2FybmluZyB3aGVuIG5leHRUaWNrIGlzIHVzZWQgcmVjdXJzaXZlbHlcbiAgICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vY3Vqb2pzL3doZW4vaXNzdWVzLzQxMCBmb3IgZGV0YWlsc1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHZlcnR4XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVZlcnR4VGltZXIoKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU11dGF0aW9uT2JzZXJ2ZXIoKSB7XG4gICAgICB2YXIgaXRlcmF0aW9ucyA9IDA7XG4gICAgICB2YXIgb2JzZXJ2ZXIgPSBuZXcgbGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICB2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICAgIG9ic2VydmVyLm9ic2VydmUobm9kZSwgeyBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIG5vZGUuZGF0YSA9IChpdGVyYXRpb25zID0gKytpdGVyYXRpb25zICUgMik7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHdlYiB3b3JrZXJcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTWVzc2FnZUNoYW5uZWwoKSB7XG4gICAgICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgICAgY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2g7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgc2V0VGltZW91dChsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gsIDEpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlID0gbmV3IEFycmF5KDEwMDApO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCgpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbjsgaSs9Mikge1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaV07XG4gICAgICAgIHZhciBhcmcgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaSsxXTtcblxuICAgICAgICBjYWxsYmFjayhhcmcpO1xuXG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2krMV0gPSB1bmRlZmluZWQ7XG4gICAgICB9XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhdHRlbXB0VmVydHgoKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YXIgciA9IHJlcXVpcmU7XG4gICAgICAgIHZhciB2ZXJ0eCA9IHIoJ3ZlcnR4Jyk7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQgPSB2ZXJ0eC5ydW5Pbkxvb3AgfHwgdmVydHgucnVuT25Db250ZXh0O1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVZlcnR4VGltZXIoKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVNldFRpbWVvdXQoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2g7XG4gICAgLy8gRGVjaWRlIHdoYXQgYXN5bmMgbWV0aG9kIHRvIHVzZSB0byB0cmlnZ2VyaW5nIHByb2Nlc3Npbmcgb2YgcXVldWVkIGNhbGxiYWNrczpcbiAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGlzTm9kZSkge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTmV4dFRpY2soKTtcbiAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRCcm93c2VyTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGlzV29ya2VyKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgPT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXR0ZW1wdFZlcnR4KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVNldFRpbWVvdXQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKCkge31cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICAgPSB2b2lkIDA7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCA9IDE7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEICA9IDI7XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IgPSBuZXcgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKTtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHNlbGZGdWxmaWxsbWVudCgpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKFwiWW91IGNhbm5vdCByZXNvbHZlIGEgcHJvbWlzZSB3aXRoIGl0c2VsZlwiKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRjYW5ub3RSZXR1cm5Pd24oKSB7XG4gICAgICByZXR1cm4gbmV3IFR5cGVFcnJvcignQSBwcm9taXNlcyBjYWxsYmFjayBjYW5ub3QgcmV0dXJuIHRoYXQgc2FtZSBwcm9taXNlLicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGdldFRoZW4ocHJvbWlzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbjtcbiAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhlbi5jYWxsKHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSwgdGhlbikge1xuICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGZ1bmN0aW9uKHByb21pc2UpIHtcbiAgICAgICAgdmFyIHNlYWxlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZXJyb3IgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlUaGVuKHRoZW4sIHRoZW5hYmxlLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGlmIChzZWFsZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICBpZiAodGhlbmFibGUgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICBpZiAoc2VhbGVkKSB7IHJldHVybjsgfVxuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG5cbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSwgJ1NldHRsZTogJyArIChwcm9taXNlLl9sYWJlbCB8fCAnIHVua25vd24gcHJvbWlzZScpKTtcblxuICAgICAgICBpZiAoIXNlYWxlZCAmJiBlcnJvcikge1xuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUpIHtcbiAgICAgIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZSh0aGVuYWJsZSwgdW5kZWZpbmVkLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKSB7XG4gICAgICBpZiAobWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3RvciA9PT0gcHJvbWlzZS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB0aGVuID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbihtYXliZVRoZW5hYmxlKTtcblxuICAgICAgICBpZiAodGhlbiA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKHRoZW4pKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKSB7XG4gICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHNlbGZGdWxmaWxsbWVudCgpKTtcbiAgICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRvYmplY3RPckZ1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2hSZWplY3Rpb24ocHJvbWlzZSkge1xuICAgICAgaWYgKHByb21pc2UuX29uZXJyb3IpIHtcbiAgICAgICAgcHJvbWlzZS5fb25lcnJvcihwcm9taXNlLl9yZXN1bHQpO1xuICAgICAgfVxuXG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoKHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykgeyByZXR1cm47IH1cblxuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gdmFsdWU7XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRDtcblxuICAgICAgaWYgKHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoLCBwcm9taXNlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHsgcmV0dXJuOyB9XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEO1xuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gcmVhc29uO1xuXG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoUmVqZWN0aW9uLCBwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgICAgIHZhciBzdWJzY3JpYmVycyA9IHBhcmVudC5fc3Vic2NyaWJlcnM7XG4gICAgICB2YXIgbGVuZ3RoID0gc3Vic2NyaWJlcnMubGVuZ3RoO1xuXG4gICAgICBwYXJlbnQuX29uZXJyb3IgPSBudWxsO1xuXG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGhdID0gY2hpbGQ7XG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGggKyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRURdID0gb25GdWxmaWxsbWVudDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEXSAgPSBvblJlamVjdGlvbjtcblxuICAgICAgaWYgKGxlbmd0aCA9PT0gMCAmJiBwYXJlbnQuX3N0YXRlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gsIHBhcmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaChwcm9taXNlKSB7XG4gICAgICB2YXIgc3Vic2NyaWJlcnMgPSBwcm9taXNlLl9zdWJzY3JpYmVycztcbiAgICAgIHZhciBzZXR0bGVkID0gcHJvbWlzZS5fc3RhdGU7XG5cbiAgICAgIGlmIChzdWJzY3JpYmVycy5sZW5ndGggPT09IDApIHsgcmV0dXJuOyB9XG5cbiAgICAgIHZhciBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCA9IHByb21pc2UuX3Jlc3VsdDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJzY3JpYmVycy5sZW5ndGg7IGkgKz0gMykge1xuICAgICAgICBjaGlsZCA9IHN1YnNjcmliZXJzW2ldO1xuICAgICAgICBjYWxsYmFjayA9IHN1YnNjcmliZXJzW2kgKyBzZXR0bGVkXTtcblxuICAgICAgICBpZiAoY2hpbGQpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2FsbGJhY2soZGV0YWlsKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCkge1xuICAgICAgdGhpcy5lcnJvciA9IG51bGw7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUiA9IG5ldyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SLmVycm9yID0gZTtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBwcm9taXNlLCBjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB2YXIgaGFzQ2FsbGJhY2sgPSBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oY2FsbGJhY2spLFxuICAgICAgICAgIHZhbHVlLCBlcnJvciwgc3VjY2VlZGVkLCBmYWlsZWQ7XG5cbiAgICAgIGlmIChoYXNDYWxsYmFjaykge1xuICAgICAgICB2YWx1ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpO1xuXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SKSB7XG4gICAgICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgICAgICBlcnJvciA9IHZhbHVlLmVycm9yO1xuICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWUgPSBkZXRhaWw7XG4gICAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKGhhc0NhbGxiYWNrICYmIHN1Y2NlZWRlZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoZmFpbGVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbml0aWFsaXplUHJvbWlzZShwcm9taXNlLCByZXNvbHZlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzb2x2ZXIoZnVuY3Rpb24gcmVzb2x2ZVByb21pc2UodmFsdWUpe1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiByZWplY3RQcm9taXNlKHJlYXNvbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IoQ29uc3RydWN0b3IsIGlucHV0KSB7XG4gICAgICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgICAgIGVudW1lcmF0b3IuX2luc3RhbmNlQ29uc3RydWN0b3IgPSBDb25zdHJ1Y3RvcjtcbiAgICAgIGVudW1lcmF0b3IucHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcblxuICAgICAgaWYgKGVudW1lcmF0b3IuX3ZhbGlkYXRlSW5wdXQoaW5wdXQpKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX2lucHV0ICAgICA9IGlucHV0O1xuICAgICAgICBlbnVtZXJhdG9yLmxlbmd0aCAgICAgPSBpbnB1dC5sZW5ndGg7XG4gICAgICAgIGVudW1lcmF0b3IuX3JlbWFpbmluZyA9IGlucHV0Lmxlbmd0aDtcblxuICAgICAgICBlbnVtZXJhdG9yLl9pbml0KCk7XG5cbiAgICAgICAgaWYgKGVudW1lcmF0b3IubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChlbnVtZXJhdG9yLnByb21pc2UsIGVudW1lcmF0b3IuX3Jlc3VsdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZW51bWVyYXRvci5sZW5ndGggPSBlbnVtZXJhdG9yLmxlbmd0aCB8fCAwO1xuICAgICAgICAgIGVudW1lcmF0b3IuX2VudW1lcmF0ZSgpO1xuICAgICAgICAgIGlmIChlbnVtZXJhdG9yLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwoZW51bWVyYXRvci5wcm9taXNlLCBlbnVtZXJhdG9yLl9yZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KGVudW1lcmF0b3IucHJvbWlzZSwgZW51bWVyYXRvci5fdmFsaWRhdGlvbkVycm9yKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fdmFsaWRhdGVJbnB1dCA9IGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0FycmF5KGlucHV0KTtcbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl92YWxpZGF0aW9uRXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRXJyb3IoJ0FycmF5IE1ldGhvZHMgbXVzdCBiZSBwcm92aWRlZCBhbiBBcnJheScpO1xuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMuX3Jlc3VsdCA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aCk7XG4gICAgfTtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yO1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9lbnVtZXJhdGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICAgICAgdmFyIGxlbmd0aCAgPSBlbnVtZXJhdG9yLmxlbmd0aDtcbiAgICAgIHZhciBwcm9taXNlID0gZW51bWVyYXRvci5wcm9taXNlO1xuICAgICAgdmFyIGlucHV0ICAgPSBlbnVtZXJhdG9yLl9pbnB1dDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IHByb21pc2UuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBlbnVtZXJhdG9yLl9lYWNoRW50cnkoaW5wdXRbaV0sIGkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VhY2hFbnRyeSA9IGZ1bmN0aW9uKGVudHJ5LCBpKSB7XG4gICAgICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG4gICAgICB2YXIgYyA9IGVudW1lcmF0b3IuX2luc3RhbmNlQ29uc3RydWN0b3I7XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzTWF5YmVUaGVuYWJsZShlbnRyeSkpIHtcbiAgICAgICAgaWYgKGVudHJ5LmNvbnN0cnVjdG9yID09PSBjICYmIGVudHJ5Ll9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAgIGVudHJ5Ll9vbmVycm9yID0gbnVsbDtcbiAgICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQoZW50cnkuX3N0YXRlLCBpLCBlbnRyeS5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbnVtZXJhdG9yLl93aWxsU2V0dGxlQXQoYy5yZXNvbHZlKGVudHJ5KSwgaSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3JlbWFpbmluZy0tO1xuICAgICAgICBlbnVtZXJhdG9yLl9yZXN1bHRbaV0gPSBlbnRyeTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9zZXR0bGVkQXQgPSBmdW5jdGlvbihzdGF0ZSwgaSwgdmFsdWUpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcbiAgICAgIHZhciBwcm9taXNlID0gZW51bWVyYXRvci5wcm9taXNlO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgZW51bWVyYXRvci5fcmVtYWluaW5nLS07XG5cbiAgICAgICAgaWYgKHN0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZW51bWVyYXRvci5fcmVzdWx0W2ldID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGVudW1lcmF0b3IuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIGVudW1lcmF0b3IuX3Jlc3VsdCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fd2lsbFNldHRsZUF0ID0gZnVuY3Rpb24ocHJvbWlzZSwgaSkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocHJvbWlzZSwgdW5kZWZpbmVkLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVELCBpLCB2YWx1ZSk7XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgZW51bWVyYXRvci5fc2V0dGxlZEF0KGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVELCBpLCByZWFzb24pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGFsbChlbnRyaWVzKSB7XG4gICAgICByZXR1cm4gbmV3IGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0KHRoaXMsIGVudHJpZXMpLnByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGFsbDtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRyYWNlKGVudHJpZXMpIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcblxuICAgICAgaWYgKCFsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoZW50cmllcykpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYW4gYXJyYXkgdG8gcmFjZS4nKSk7XG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgfVxuXG4gICAgICB2YXIgbGVuZ3RoID0gZW50cmllcy5sZW5ndGg7XG5cbiAgICAgIGZ1bmN0aW9uIG9uRnVsZmlsbG1lbnQodmFsdWUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG9uUmVqZWN0aW9uKHJlYXNvbikge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaSA9IDA7IHByb21pc2UuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUoQ29uc3RydWN0b3IucmVzb2x2ZShlbnRyaWVzW2ldKSwgdW5kZWZpbmVkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJHJhY2U7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkcmVzb2x2ZShvYmplY3QpIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gICAgICBpZiAob2JqZWN0ICYmIHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnICYmIG9iamVjdC5jb25zdHJ1Y3RvciA9PT0gQ29uc3RydWN0b3IpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgIH1cblxuICAgICAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIG9iamVjdCk7XG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRyZXNvbHZlO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkcmVqZWN0KHJlYXNvbikge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJHJlamVjdDtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkY291bnRlciA9IDA7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYSByZXNvbHZlciBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIHByb21pc2UgY29uc3RydWN0b3InKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNOZXcoKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnUHJvbWlzZSc6IFBsZWFzZSB1c2UgdGhlICduZXcnIG9wZXJhdG9yLCB0aGlzIG9iamVjdCBjb25zdHJ1Y3RvciBjYW5ub3QgYmUgY2FsbGVkIGFzIGEgZnVuY3Rpb24uXCIpO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlO1xuICAgIC8qKlxuICAgICAgUHJvbWlzZSBvYmplY3RzIHJlcHJlc2VudCB0aGUgZXZlbnR1YWwgcmVzdWx0IG9mIGFuIGFzeW5jaHJvbm91cyBvcGVyYXRpb24uIFRoZVxuICAgICAgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCwgd2hpY2hcbiAgICAgIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlIHJlYXNvblxuICAgICAgd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIFRlcm1pbm9sb2d5XG4gICAgICAtLS0tLS0tLS0tLVxuXG4gICAgICAtIGBwcm9taXNlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gd2l0aCBhIGB0aGVuYCBtZXRob2Qgd2hvc2UgYmVoYXZpb3IgY29uZm9ybXMgdG8gdGhpcyBzcGVjaWZpY2F0aW9uLlxuICAgICAgLSBgdGhlbmFibGVgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgYSBgdGhlbmAgbWV0aG9kLlxuICAgICAgLSBgdmFsdWVgIGlzIGFueSBsZWdhbCBKYXZhU2NyaXB0IHZhbHVlIChpbmNsdWRpbmcgdW5kZWZpbmVkLCBhIHRoZW5hYmxlLCBvciBhIHByb21pc2UpLlxuICAgICAgLSBgZXhjZXB0aW9uYCBpcyBhIHZhbHVlIHRoYXQgaXMgdGhyb3duIHVzaW5nIHRoZSB0aHJvdyBzdGF0ZW1lbnQuXG4gICAgICAtIGByZWFzb25gIGlzIGEgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2h5IGEgcHJvbWlzZSB3YXMgcmVqZWN0ZWQuXG4gICAgICAtIGBzZXR0bGVkYCB0aGUgZmluYWwgcmVzdGluZyBzdGF0ZSBvZiBhIHByb21pc2UsIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cblxuICAgICAgQSBwcm9taXNlIGNhbiBiZSBpbiBvbmUgb2YgdGhyZWUgc3RhdGVzOiBwZW5kaW5nLCBmdWxmaWxsZWQsIG9yIHJlamVjdGVkLlxuXG4gICAgICBQcm9taXNlcyB0aGF0IGFyZSBmdWxmaWxsZWQgaGF2ZSBhIGZ1bGZpbGxtZW50IHZhbHVlIGFuZCBhcmUgaW4gdGhlIGZ1bGZpbGxlZFxuICAgICAgc3RhdGUuICBQcm9taXNlcyB0aGF0IGFyZSByZWplY3RlZCBoYXZlIGEgcmVqZWN0aW9uIHJlYXNvbiBhbmQgYXJlIGluIHRoZVxuICAgICAgcmVqZWN0ZWQgc3RhdGUuICBBIGZ1bGZpbGxtZW50IHZhbHVlIGlzIG5ldmVyIGEgdGhlbmFibGUuXG5cbiAgICAgIFByb21pc2VzIGNhbiBhbHNvIGJlIHNhaWQgdG8gKnJlc29sdmUqIGEgdmFsdWUuICBJZiB0aGlzIHZhbHVlIGlzIGFsc28gYVxuICAgICAgcHJvbWlzZSwgdGhlbiB0aGUgb3JpZ2luYWwgcHJvbWlzZSdzIHNldHRsZWQgc3RhdGUgd2lsbCBtYXRjaCB0aGUgdmFsdWUnc1xuICAgICAgc2V0dGxlZCBzdGF0ZS4gIFNvIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aWxsXG4gICAgICBpdHNlbGYgcmVqZWN0LCBhbmQgYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCBmdWxmaWxscyB3aWxsXG4gICAgICBpdHNlbGYgZnVsZmlsbC5cblxuXG4gICAgICBCYXNpYyBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBgYGBqc1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgLy8gb24gc3VjY2Vzc1xuICAgICAgICByZXNvbHZlKHZhbHVlKTtcblxuICAgICAgICAvLyBvbiBmYWlsdXJlXG4gICAgICAgIHJlamVjdChyZWFzb24pO1xuICAgICAgfSk7XG5cbiAgICAgIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAvLyBvbiBmdWxmaWxsbWVudFxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIC8vIG9uIHJlamVjdGlvblxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgVXNhZ2U6XG4gICAgICAtLS0tLS0tLS0tLS0tLS1cblxuICAgICAgUHJvbWlzZXMgc2hpbmUgd2hlbiBhYnN0cmFjdGluZyBhd2F5IGFzeW5jaHJvbm91cyBpbnRlcmFjdGlvbnMgc3VjaCBhc1xuICAgICAgYFhNTEh0dHBSZXF1ZXN0YHMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmdW5jdGlvbiBnZXRKU09OKHVybCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICAgICAgICB4aHIub3BlbignR0VUJywgdXJsKTtcbiAgICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gaGFuZGxlcjtcbiAgICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgICAgICAgIHhoci5zZW5kKCk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gdGhpcy5ET05FKSB7XG4gICAgICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdnZXRKU09OOiBgJyArIHVybCArICdgIGZhaWxlZCB3aXRoIHN0YXR1czogWycgKyB0aGlzLnN0YXR1cyArICddJykpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGdldEpTT04oJy9wb3N0cy5qc29uJykudGhlbihmdW5jdGlvbihqc29uKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBVbmxpa2UgY2FsbGJhY2tzLCBwcm9taXNlcyBhcmUgZ3JlYXQgY29tcG9zYWJsZSBwcmltaXRpdmVzLlxuXG4gICAgICBgYGBqc1xuICAgICAgUHJvbWlzZS5hbGwoW1xuICAgICAgICBnZXRKU09OKCcvcG9zdHMnKSxcbiAgICAgICAgZ2V0SlNPTignL2NvbW1lbnRzJylcbiAgICAgIF0pLnRoZW4oZnVuY3Rpb24odmFsdWVzKXtcbiAgICAgICAgdmFsdWVzWzBdIC8vID0+IHBvc3RzSlNPTlxuICAgICAgICB2YWx1ZXNbMV0gLy8gPT4gY29tbWVudHNKU09OXG5cbiAgICAgICAgcmV0dXJuIHZhbHVlcztcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBjbGFzcyBQcm9taXNlXG4gICAgICBAcGFyYW0ge2Z1bmN0aW9ufSByZXNvbHZlclxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQGNvbnN0cnVjdG9yXG4gICAgKi9cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZShyZXNvbHZlcikge1xuICAgICAgdGhpcy5faWQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkY291bnRlcisrO1xuICAgICAgdGhpcy5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9yZXN1bHQgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9zdWJzY3JpYmVycyA9IFtdO1xuXG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCAhPT0gcmVzb2x2ZXIpIHtcbiAgICAgICAgaWYgKCFsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24ocmVzb2x2ZXIpKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzUmVzb2x2ZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZSkpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNOZXcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHRoaXMsIHJlc29sdmVyKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5hbGwgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmFjZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmVzb2x2ZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmVqZWN0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLl9zZXRTY2hlZHVsZXIgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0U2NoZWR1bGVyO1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLl9zZXRBc2FwID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldEFzYXA7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX2FzYXAgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcDtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnByb3RvdHlwZSA9IHtcbiAgICAgIGNvbnN0cnVjdG9yOiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZSxcblxuICAgIC8qKlxuICAgICAgVGhlIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsXG4gICAgICB3aGljaCByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZVxuICAgICAgcmVhc29uIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uKHVzZXIpe1xuICAgICAgICAvLyB1c2VyIGlzIGF2YWlsYWJsZVxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gdXNlciBpcyB1bmF2YWlsYWJsZSwgYW5kIHlvdSBhcmUgZ2l2ZW4gdGhlIHJlYXNvbiB3aHlcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIENoYWluaW5nXG4gICAgICAtLS0tLS0tLVxuXG4gICAgICBUaGUgcmV0dXJuIHZhbHVlIG9mIGB0aGVuYCBpcyBpdHNlbGYgYSBwcm9taXNlLiAgVGhpcyBzZWNvbmQsICdkb3duc3RyZWFtJ1xuICAgICAgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZpcnN0IHByb21pc2UncyBmdWxmaWxsbWVudFxuICAgICAgb3IgcmVqZWN0aW9uIGhhbmRsZXIsIG9yIHJlamVjdGVkIGlmIHRoZSBoYW5kbGVyIHRocm93cyBhbiBleGNlcHRpb24uXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIHVzZXIubmFtZTtcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgcmV0dXJuICdkZWZhdWx0IG5hbWUnO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodXNlck5hbWUpIHtcbiAgICAgICAgLy8gSWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGB1c2VyTmFtZWAgd2lsbCBiZSB0aGUgdXNlcidzIG5hbWUsIG90aGVyd2lzZSBpdFxuICAgICAgICAvLyB3aWxsIGJlIGAnZGVmYXVsdCBuYW1lJ2BcbiAgICAgIH0pO1xuXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScpO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gaWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGByZWFzb25gIHdpbGwgYmUgJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jy5cbiAgICAgICAgLy8gSWYgYGZpbmRVc2VyYCByZWplY3RlZCwgYHJlYXNvbmAgd2lsbCBiZSAnYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScuXG4gICAgICB9KTtcbiAgICAgIGBgYFxuICAgICAgSWYgdGhlIGRvd25zdHJlYW0gcHJvbWlzZSBkb2VzIG5vdCBzcGVjaWZ5IGEgcmVqZWN0aW9uIGhhbmRsZXIsIHJlamVjdGlvbiByZWFzb25zIHdpbGwgYmUgcHJvcGFnYXRlZCBmdXJ0aGVyIGRvd25zdHJlYW0uXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBlZGFnb2dpY2FsRXhjZXB0aW9uKCdVcHN0cmVhbSBlcnJvcicpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBUaGUgYFBlZGdhZ29jaWFsRXhjZXB0aW9uYCBpcyBwcm9wYWdhdGVkIGFsbCB0aGUgd2F5IGRvd24gdG8gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQXNzaW1pbGF0aW9uXG4gICAgICAtLS0tLS0tLS0tLS1cblxuICAgICAgU29tZXRpbWVzIHRoZSB2YWx1ZSB5b3Ugd2FudCB0byBwcm9wYWdhdGUgdG8gYSBkb3duc3RyZWFtIHByb21pc2UgY2FuIG9ubHkgYmVcbiAgICAgIHJldHJpZXZlZCBhc3luY2hyb25vdXNseS4gVGhpcyBjYW4gYmUgYWNoaWV2ZWQgYnkgcmV0dXJuaW5nIGEgcHJvbWlzZSBpbiB0aGVcbiAgICAgIGZ1bGZpbGxtZW50IG9yIHJlamVjdGlvbiBoYW5kbGVyLiBUaGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgdGhlbiBiZSBwZW5kaW5nXG4gICAgICB1bnRpbCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBpcyBzZXR0bGVkLiBUaGlzIGlzIGNhbGxlZCAqYXNzaW1pbGF0aW9uKi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgICAvLyBUaGUgdXNlcidzIGNvbW1lbnRzIGFyZSBub3cgYXZhaWxhYmxlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBJZiB0aGUgYXNzaW1saWF0ZWQgcHJvbWlzZSByZWplY3RzLCB0aGVuIHRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCBhbHNvIHJlamVjdC5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIGZ1bGZpbGxzLCB3ZSdsbCBoYXZlIHRoZSB2YWx1ZSBoZXJlXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgcmVqZWN0cywgd2UnbGwgaGF2ZSB0aGUgcmVhc29uIGhlcmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFNpbXBsZSBFeGFtcGxlXG4gICAgICAtLS0tLS0tLS0tLS0tLVxuXG4gICAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIHZhciByZXN1bHQ7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGZpbmRSZXN1bHQoKTtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfVxuICAgICAgYGBgXG5cbiAgICAgIEVycmJhY2sgRXhhbXBsZVxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFJlc3VsdChmdW5jdGlvbihyZXN1bHQsIGVycil7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAvLyBmYWlsdXJlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBQcm9taXNlIEV4YW1wbGU7XG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIGZpbmRSZXN1bHQoKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFkdmFuY2VkIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIGF1dGhvciwgYm9va3M7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF1dGhvciA9IGZpbmRBdXRob3IoKTtcbiAgICAgICAgYm9va3MgID0gZmluZEJvb2tzQnlBdXRob3IoYXV0aG9yKTtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfVxuICAgICAgYGBgXG5cbiAgICAgIEVycmJhY2sgRXhhbXBsZVxuXG4gICAgICBgYGBqc1xuXG4gICAgICBmdW5jdGlvbiBmb3VuZEJvb2tzKGJvb2tzKSB7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZmFpbHVyZShyZWFzb24pIHtcblxuICAgICAgfVxuXG4gICAgICBmaW5kQXV0aG9yKGZ1bmN0aW9uKGF1dGhvciwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAvLyBmYWlsdXJlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZpbmRCb29va3NCeUF1dGhvcihhdXRob3IsIGZ1bmN0aW9uKGJvb2tzLCBlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgZm91bmRCb29rcyhib29rcyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgICAgICAgICAgIGZhaWx1cmUocmVhc29uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBQcm9taXNlIEV4YW1wbGU7XG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIGZpbmRBdXRob3IoKS5cbiAgICAgICAgdGhlbihmaW5kQm9va3NCeUF1dGhvcikuXG4gICAgICAgIHRoZW4oZnVuY3Rpb24oYm9va3Mpe1xuICAgICAgICAgIC8vIGZvdW5kIGJvb2tzXG4gICAgICB9KS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCB0aGVuXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvbkZ1bGZpbGxlZFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZFxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQHJldHVybiB7UHJvbWlzZX1cbiAgICAqL1xuICAgICAgdGhlbjogZnVuY3Rpb24ob25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgICAgICAgdmFyIHBhcmVudCA9IHRoaXM7XG4gICAgICAgIHZhciBzdGF0ZSA9IHBhcmVudC5fc3RhdGU7XG5cbiAgICAgICAgaWYgKHN0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQgJiYgIW9uRnVsZmlsbG1lbnQgfHwgc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEICYmICFvblJlamVjdGlvbikge1xuICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNoaWxkID0gbmV3IHRoaXMuY29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICAgIHZhciByZXN1bHQgPSBwYXJlbnQuX3Jlc3VsdDtcblxuICAgICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmd1bWVudHNbc3RhdGUgLSAxXTtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChmdW5jdGlvbigpe1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW52b2tlQ2FsbGJhY2soc3RhdGUsIGNoaWxkLCBjYWxsYmFjaywgcmVzdWx0KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNoaWxkO1xuICAgICAgfSxcblxuICAgIC8qKlxuICAgICAgYGNhdGNoYCBpcyBzaW1wbHkgc3VnYXIgZm9yIGB0aGVuKHVuZGVmaW5lZCwgb25SZWplY3Rpb24pYCB3aGljaCBtYWtlcyBpdCB0aGUgc2FtZVxuICAgICAgYXMgdGhlIGNhdGNoIGJsb2NrIG9mIGEgdHJ5L2NhdGNoIHN0YXRlbWVudC5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGZpbmRBdXRob3IoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZG4ndCBmaW5kIHRoYXQgYXV0aG9yJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIHN5bmNocm9ub3VzXG4gICAgICB0cnkge1xuICAgICAgICBmaW5kQXV0aG9yKCk7XG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfVxuXG4gICAgICAvLyBhc3luYyB3aXRoIHByb21pc2VzXG4gICAgICBmaW5kQXV0aG9yKCkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBtZXRob2QgY2F0Y2hcbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0aW9uXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICAnY2F0Y2gnOiBmdW5jdGlvbihvblJlamVjdGlvbikge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkcG9seWZpbGwoKSB7XG4gICAgICB2YXIgbG9jYWw7XG5cbiAgICAgIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsID0gZ2xvYmFsO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBsb2NhbCA9IHNlbGY7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGxvY2FsID0gRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncG9seWZpbGwgZmFpbGVkIGJlY2F1c2UgZ2xvYmFsIG9iamVjdCBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG4gICAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgUCA9IGxvY2FsLlByb21pc2U7XG5cbiAgICAgIGlmIChQICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChQLnJlc29sdmUoKSkgPT09ICdbb2JqZWN0IFByb21pc2VdJyAmJiAhUC5jYXN0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbG9jYWwuUHJvbWlzZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0O1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRwb2x5ZmlsbDtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlID0ge1xuICAgICAgJ1Byb21pc2UnOiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCxcbiAgICAgICdwb2x5ZmlsbCc6IGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdFxuICAgIH07XG5cbiAgICAvKiBnbG9iYWwgZGVmaW5lOnRydWUgbW9kdWxlOnRydWUgd2luZG93OiB0cnVlICovXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lWydhbWQnXSkge1xuICAgICAgZGVmaW5lKGZ1bmN0aW9uKCkgeyByZXR1cm4gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGVbJ2V4cG9ydHMnXSkge1xuICAgICAgbW9kdWxlWydleHBvcnRzJ10gPSBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aGlzWydFUzZQcm9taXNlJ10gPSBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdCgpO1xufSkuY2FsbCh0aGlzKTtcblxuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyQW5hbHl0aWNzID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5hbmFseXRpY3MnLCBbJ2lvbmljJ10pXG5cbiAgLnZhbHVlKCdJT05JQ19BTkFMWVRJQ1NfVkVSU0lPTicsIElvbmljLkFuYWx5dGljcy52ZXJzaW9uKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNBbmFseXRpY3MnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJBbmFseXRpY3MpIHtcbiAgICAgIElvbmljQW5ndWxhckFuYWx5dGljcyA9IG5ldyBJb25pYy5BbmFseXRpY3MoXCJERUZFUl9SRUdJU1RFUlwiKTtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhckFuYWx5dGljcztcbiAgfV0pXG5cbiAgLmZhY3RvcnkoJ2RvbVNlcmlhbGl6ZXInLCBbZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzLkRPTVNlcmlhbGl6ZXIoKTtcbiAgfV0pXG5cbiAgLnJ1bihbJyRpb25pY0FuYWx5dGljcycsICckc3RhdGUnLCBmdW5jdGlvbigkaW9uaWNBbmFseXRpY3MsICRzdGF0ZSkge1xuICAgICRpb25pY0FuYWx5dGljcy5zZXRHbG9iYWxQcm9wZXJ0aWVzKGZ1bmN0aW9uKGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKSB7XG4gICAgICBpZiAoIWV2ZW50RGF0YS5fdWkpIHtcbiAgICAgICAgZXZlbnREYXRhLl91aSA9IHt9O1xuICAgICAgfVxuICAgICAgZXZlbnREYXRhLl91aS5hY3RpdmVfc3RhdGUgPSAkc3RhdGUuY3VycmVudC5uYW1lOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgfSk7XG4gIH1dKTtcblxuXG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmFuYWx5dGljcycpXG5cbiAgLnByb3ZpZGVyKCckaW9uaWNBdXRvVHJhY2snLFtmdW5jdGlvbigpIHtcblxuICAgIHZhciB0cmFja2Vyc0Rpc2FibGVkID0ge30sXG4gICAgICBhbGxUcmFja2Vyc0Rpc2FibGVkID0gZmFsc2U7XG5cbiAgICB0aGlzLmRpc2FibGVUcmFja2luZyA9IGZ1bmN0aW9uKHRyYWNrZXIpIHtcbiAgICAgIGlmICh0cmFja2VyKSB7XG4gICAgICAgIHRyYWNrZXJzRGlzYWJsZWRbdHJhY2tlcl0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWxsVHJhY2tlcnNEaXNhYmxlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMuJGdldCA9IFtmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIFwiaXNFbmFibGVkXCI6IGZ1bmN0aW9uKHRyYWNrZXIpIHtcbiAgICAgICAgICByZXR1cm4gIWFsbFRyYWNrZXJzRGlzYWJsZWQgJiYgIXRyYWNrZXJzRGlzYWJsZWRbdHJhY2tlcl07XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1dKVxuXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gQXV0byB0cmFja2Vyc1xuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cbiAgLnJ1bihbJyRpb25pY0F1dG9UcmFjaycsICckaW9uaWNBbmFseXRpY3MnLCBmdW5jdGlvbigkaW9uaWNBdXRvVHJhY2ssICRpb25pY0FuYWx5dGljcykge1xuICAgIGlmICghJGlvbmljQXV0b1RyYWNrLmlzRW5hYmxlZCgnTG9hZCcpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgICRpb25pY0FuYWx5dGljcy50cmFjaygnTG9hZCcpO1xuICB9XSlcblxuICAucnVuKFtcbiAgICAnJGlvbmljQXV0b1RyYWNrJyxcbiAgICAnJGRvY3VtZW50JyxcbiAgICAnJGlvbmljQW5hbHl0aWNzJyxcbiAgICAnZG9tU2VyaWFsaXplcicsXG4gICAgZnVuY3Rpb24oJGlvbmljQXV0b1RyYWNrLCAkZG9jdW1lbnQsICRpb25pY0FuYWx5dGljcywgZG9tU2VyaWFsaXplcikge1xuICAgICAgaWYgKCEkaW9uaWNBdXRvVHJhY2suaXNFbmFibGVkKCdUYXAnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgICRkb2N1bWVudC5vbignY2xpY2snLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAvLyB3YW50IGNvb3JkaW5hdGVzIGFzIGEgcGVyY2VudGFnZSByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnRcbiAgICAgICAgdmFyIGJveCA9IGV2ZW50LnRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICAgICAgICB3aWR0aCA9IGJveC5yaWdodCAtIGJveC5sZWZ0LFxuICAgICAgICAgIGhlaWdodCA9IGJveC5ib3R0b20gLSBib3gudG9wLFxuICAgICAgICAgIG5vcm1YID0gKGV2ZW50LnBhZ2VYIC0gYm94LmxlZnQpIC8gd2lkdGgsXG4gICAgICAgICAgbm9ybVkgPSAoZXZlbnQucGFnZVkgLSBib3gudG9wKSAvIGhlaWdodDtcblxuICAgICAgICB2YXIgZXZlbnREYXRhID0ge1xuICAgICAgICAgIFwiY29vcmRpbmF0ZXNcIjoge1xuICAgICAgICAgICAgXCJ4XCI6IGV2ZW50LnBhZ2VYLFxuICAgICAgICAgICAgXCJ5XCI6IGV2ZW50LnBhZ2VZXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInRhcmdldFwiOiBkb21TZXJpYWxpemVyLmVsZW1lbnRTZWxlY3RvcihldmVudC50YXJnZXQpLFxuICAgICAgICAgIFwidGFyZ2V0X2lkZW50aWZpZXJcIjogZG9tU2VyaWFsaXplci5lbGVtZW50TmFtZShldmVudC50YXJnZXQpXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGlzRmluaXRlKG5vcm1YKSAmJiBpc0Zpbml0ZShub3JtWSkpIHtcbiAgICAgICAgICBldmVudERhdGEuY29vcmRpbmF0ZXMueF9ub3JtID0gbm9ybVg7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgICBldmVudERhdGEuY29vcmRpbmF0ZXMueV9ub3JtID0gbm9ybVk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgfVxuXG4gICAgICAgICRpb25pY0FuYWx5dGljcy50cmFjaygnVGFwJywge1xuICAgICAgICAgIFwiX3VpXCI6IGV2ZW50RGF0YVxuICAgICAgICB9KTtcblxuICAgICAgfSk7XG4gICAgfVxuICBdKVxuXG4gIC5ydW4oW1xuICAgICckaW9uaWNBdXRvVHJhY2snLFxuICAgICckaW9uaWNBbmFseXRpY3MnLFxuICAgICckcm9vdFNjb3BlJyxcbiAgICBmdW5jdGlvbigkaW9uaWNBdXRvVHJhY2ssICRpb25pY0FuYWx5dGljcywgJHJvb3RTY29wZSkge1xuICAgICAgaWYgKCEkaW9uaWNBdXRvVHJhY2suaXNFbmFibGVkKCdTdGF0ZSBDaGFuZ2UnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24oZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUsIGZyb21QYXJhbXMpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAkaW9uaWNBbmFseXRpY3MudHJhY2soJ1N0YXRlIENoYW5nZScsIHtcbiAgICAgICAgICBcImZyb21cIjogZnJvbVN0YXRlLm5hbWUsXG4gICAgICAgICAgXCJ0b1wiOiB0b1N0YXRlLm5hbWVcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIF0pXG5cbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gaW9uLXRyYWNrLSRFVkVOVFxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBAbmdkb2MgZGlyZWN0aXZlXG4gICAqIEBuYW1lIGlvblRyYWNrQ2xpY2tcbiAgICogQG1vZHVsZSBpb25pYy5zZXJ2aWNlLmFuYWx5dGljc1xuICAgKiBAcmVzdHJpY3QgQVxuICAgKiBAcGFyZW50IGlvbmljLmRpcmVjdGl2ZTppb25UcmFja0NsaWNrXG4gICAqXG4gICAqIEBkZXNjcmlwdGlvblxuICAgKlxuICAgKiBBIGNvbnZlbmllbnQgZGlyZWN0aXZlIHRvIGF1dG9tYXRpY2FsbHkgdHJhY2sgYSBjbGljay90YXAgb24gYSBidXR0b25cbiAgICogb3Igb3RoZXIgdGFwcGFibGUgZWxlbWVudC5cbiAgICpcbiAgICogQHVzYWdlXG4gICAqIGBgYGh0bWxcbiAgICogPGJ1dHRvbiBjbGFzcz1cImJ1dHRvbiBidXR0b24tY2xlYXJcIiBpb24tdHJhY2stY2xpY2sgaW9uLXRyYWNrLWV2ZW50PVwiY3RhLXRhcFwiPlRyeSBub3chPC9idXR0b24+XG4gICAqIGBgYFxuICAgKi9cblxuICAuZGlyZWN0aXZlKCdpb25UcmFja0NsaWNrJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2NsaWNrJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrVGFwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3RhcCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RvdWJsZXRhcCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkb3VibGV0YXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tIb2xkJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2hvbGQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tSZWxlYXNlJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3JlbGVhc2UnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWcnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnTGVmdCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFnbGVmdCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdSaWdodCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFncmlnaHQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnVXAnLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZ3VwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZ0Rvd24nLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZ2Rvd24nKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZUxlZnQnLCBpb25UcmFja0RpcmVjdGl2ZSgnc3dpcGVsZWZ0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVSaWdodCcsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZXJpZ2h0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVVcCcsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZXVwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVEb3duJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBlZG93bicpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1RyYW5zZm9ybScsIGlvblRyYWNrRGlyZWN0aXZlKCdob2xkJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUGluY2gnLCBpb25UcmFja0RpcmVjdGl2ZSgncGluY2gnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tQaW5jaEluJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3BpbmNoaW4nKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tQaW5jaE91dCcsIGlvblRyYWNrRGlyZWN0aXZlKCdwaW5jaG91dCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1JvdGF0ZScsIGlvblRyYWNrRGlyZWN0aXZlKCdyb3RhdGUnKSk7XG5cbiAgLyoqXG4gICAqIEdlbmVyaWMgZGlyZWN0aXZlIHRvIGNyZWF0ZSBhdXRvIGV2ZW50IGhhbmRsaW5nIGFuYWx5dGljcyBkaXJlY3RpdmVzIGxpa2U6XG4gICAqXG4gICAqIDxidXR0b24gaW9uLXRyYWNrLWNsaWNrPVwiZXZlbnROYW1lXCI+Q2xpY2sgVHJhY2s8L2J1dHRvbj5cbiAgICogPGJ1dHRvbiBpb24tdHJhY2staG9sZD1cImV2ZW50TmFtZVwiPkhvbGQgVHJhY2s8L2J1dHRvbj5cbiAgICogPGJ1dHRvbiBpb24tdHJhY2stdGFwPVwiZXZlbnROYW1lXCI+VGFwIFRyYWNrPC9idXR0b24+XG4gICAqIDxidXR0b24gaW9uLXRyYWNrLWRvdWJsZXRhcD1cImV2ZW50TmFtZVwiPkRvdWJsZSBUYXAgVHJhY2s8L2J1dHRvbj5cbiAgICpcbiAgICogQHBhcmFtIHtzdHJpbmd9IGRvbUV2ZW50TmFtZSBUaGUgRE9NIGV2ZW50IG5hbWVcbiAgICogQHJldHVybiB7YXJyYXl9IEFuZ3VsYXIgRGlyZWN0aXZlIGRlY2xhcmF0aW9uXG4gICAqL1xuICBmdW5jdGlvbiBpb25UcmFja0RpcmVjdGl2ZShkb21FdmVudE5hbWUpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgIHJldHVybiBbJyRpb25pY0FuYWx5dGljcycsICckaW9uaWNHZXN0dXJlJywgZnVuY3Rpb24oJGlvbmljQW5hbHl0aWNzLCAkaW9uaWNHZXN0dXJlKSB7XG5cbiAgICAgIHZhciBnZXN0dXJlRHJpdmVuID0gW1xuICAgICAgICAnZHJhZycsICdkcmFnc3RhcnQnLCAnZHJhZ2VuZCcsICdkcmFnbGVmdCcsICdkcmFncmlnaHQnLCAnZHJhZ3VwJywgJ2RyYWdkb3duJyxcbiAgICAgICAgJ3N3aXBlJywgJ3N3aXBlbGVmdCcsICdzd2lwZXJpZ2h0JywgJ3N3aXBldXAnLCAnc3dpcGVkb3duJyxcbiAgICAgICAgJ3RhcCcsICdkb3VibGV0YXAnLCAnaG9sZCcsXG4gICAgICAgICd0cmFuc2Zvcm0nLCAncGluY2gnLCAncGluY2hpbicsICdwaW5jaG91dCcsICdyb3RhdGUnXG4gICAgICBdO1xuICAgICAgLy8gQ2hlY2sgaWYgd2UgbmVlZCB0byB1c2UgdGhlIGdlc3R1cmUgc3Vic3lzdGVtIG9yIHRoZSBET00gc3lzdGVtXG4gICAgICB2YXIgaXNHZXN0dXJlRHJpdmVuID0gZmFsc2U7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGdlc3R1cmVEcml2ZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGdlc3R1cmVEcml2ZW5baV0gPT09IGRvbUV2ZW50TmFtZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgaXNHZXN0dXJlRHJpdmVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgXCJyZXN0cmljdFwiOiAnQScsXG4gICAgICAgIFwibGlua1wiOiBmdW5jdGlvbigkc2NvcGUsICRlbGVtZW50LCAkYXR0cikge1xuICAgICAgICAgIHZhciBjYXBpdGFsaXplZCA9IGRvbUV2ZW50TmFtZVswXS50b1VwcGVyQ2FzZSgpICsgZG9tRXZlbnROYW1lLnNsaWNlKDEpO1xuICAgICAgICAgIC8vIEdyYWIgZXZlbnQgbmFtZSB3ZSB3aWxsIHNlbmRcbiAgICAgICAgICB2YXIgZXZlbnROYW1lID0gJGF0dHJbJ2lvblRyYWNrJyArIGNhcGl0YWxpemVkXTtcblxuICAgICAgICAgIGlmIChpc0dlc3R1cmVEcml2ZW4pIHtcbiAgICAgICAgICAgIHZhciBnZXN0dXJlID0gJGlvbmljR2VzdHVyZS5vbihkb21FdmVudE5hbWUsIGhhbmRsZXIsICRlbGVtZW50KTtcbiAgICAgICAgICAgICRzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICRpb25pY0dlc3R1cmUub2ZmKGdlc3R1cmUsIGRvbUV2ZW50TmFtZSwgaGFuZGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJGVsZW1lbnQub24oZG9tRXZlbnROYW1lLCBoYW5kbGVyKTtcbiAgICAgICAgICAgICRzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICRlbGVtZW50Lm9mZihkb21FdmVudE5hbWUsIGhhbmRsZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuXG5cbiAgICAgICAgICBmdW5jdGlvbiBoYW5kbGVyKGUpIHtcbiAgICAgICAgICAgIHZhciBldmVudERhdGEgPSAkc2NvcGUuJGV2YWwoJGF0dHIuaW9uVHJhY2tEYXRhKSB8fCB7fTtcbiAgICAgICAgICAgIGlmIChldmVudE5hbWUpIHtcbiAgICAgICAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKGV2ZW50TmFtZSwgZXZlbnREYXRhKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICRpb25pY0FuYWx5dGljcy50cmFja0NsaWNrKGUucGFnZVgsIGUucGFnZVksIGUudGFyZ2V0LCB7XG4gICAgICAgICAgICAgICAgXCJkYXRhXCI6IGV2ZW50RGF0YVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfV07XG4gIH1cblxufVxuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyQXV0aCA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuYXV0aCcsIFtdKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNBdXRoJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyQXV0aCkge1xuICAgICAgSW9uaWNBbmd1bGFyQXV0aCA9IElvbmljLkF1dGg7XG4gICAgfVxuICAgIHJldHVybiBJb25pY0FuZ3VsYXJBdXRoO1xuICB9XSk7XG59XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5jb3JlJywgW10pXG5cbiAgLyoqXG4gICAqIEBwcml2YXRlXG4gICAqIFByb3ZpZGVzIGEgc2FmZSBpbnRlcmZhY2UgdG8gc3RvcmUgb2JqZWN0cyBpbiBwZXJzaXN0ZW50IG1lbW9yeVxuICAgKi9cbiAgLnByb3ZpZGVyKCdwZXJzaXN0ZW50U3RvcmFnZScsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAnJGdldCc6IFtmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHN0b3JhZ2UgPSBJb25pYy5nZXRTZXJ2aWNlKCdTdG9yYWdlJyk7XG4gICAgICAgIGlmICghc3RvcmFnZSkge1xuICAgICAgICAgIHN0b3JhZ2UgPSBuZXcgSW9uaWMuSU8uU3RvcmFnZSgpO1xuICAgICAgICAgIElvbmljLmFkZFNlcnZpY2UoJ1N0b3JhZ2UnLCBzdG9yYWdlLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RvcmFnZTtcbiAgICAgIH1dXG4gICAgfTtcbiAgfSlcblxuICAuZmFjdG9yeSgnJGlvbmljQ29yZVNldHRpbmdzJywgW1xuICAgIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBJb25pYy5JTy5TZXR0aW5ncygpO1xuICAgIH1cbiAgXSlcblxuICAuZmFjdG9yeSgnJGlvbmljVXNlcicsIFtcbiAgICBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBJb25pYy5Vc2VyO1xuICAgIH1cbiAgXSlcblxuICAucnVuKFtmdW5jdGlvbigpIHtcbiAgICBJb25pYy5pbygpO1xuICB9XSk7XG59XG5cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG5cbiAgdmFyIElvbmljQW5ndWxhckRlcGxveSA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuZGVwbG95JywgW10pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0RlcGxveScsIFtmdW5jdGlvbigpIHtcbiAgICBpZiAoIUlvbmljQW5ndWxhckRlcGxveSkge1xuICAgICAgSW9uaWNBbmd1bGFyRGVwbG95ID0gbmV3IElvbmljLkRlcGxveSgpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyRGVwbG95O1xuICB9XSk7XG59XG4iLCJpbXBvcnQgeyBBcHAgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2FwcFwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvY29yZVwiO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9ldmVudHNcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvbG9nZ2VyXCI7XG5pbXBvcnQgeyBQcm9taXNlLCBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IFJlcXVlc3QsIFJlc3BvbnNlLCBBUElSZXF1ZXN0LCBBUElSZXNwb25zZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBTdG9yYWdlIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9zdG9yYWdlXCI7XG5pbXBvcnQgeyBVc2VyIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS91c2VyXCI7XG5pbXBvcnQgeyBEYXRhVHlwZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvZGF0YS10eXBlc1wiO1xuaW1wb3J0IHsgQW5hbHl0aWNzIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvYW5hbHl0aWNzL2FuYWx5dGljc1wiO1xuaW1wb3J0IHsgQnVja2V0U3RvcmFnZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2FuYWx5dGljcy9zdG9yYWdlXCI7XG5pbXBvcnQgeyBET01TZXJpYWxpemVyIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvYW5hbHl0aWNzL3NlcmlhbGl6ZXJzXCI7XG5pbXBvcnQgeyBBdXRoIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvYXV0aC9hdXRoXCI7XG5pbXBvcnQgeyBEZXBsb3kgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9kZXBsb3kvZGVwbG95XCI7XG5pbXBvcnQgeyBQdXNoIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvcHVzaC9wdXNoXCI7XG5pbXBvcnQgeyBQdXNoVG9rZW4gfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9wdXNoL3B1c2gtdG9rZW5cIjtcbmltcG9ydCB7IFB1c2hNZXNzYWdlIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvcHVzaC9wdXNoLW1lc3NhZ2VcIjtcblxuLy8gRGVjbGFyZSB0aGUgd2luZG93IG9iamVjdFxud2luZG93LklvbmljID0gd2luZG93LklvbmljIHx8IHt9O1xuXG4vLyBJb25pYyBOYW1lc3BhY2VcbklvbmljLkNvcmUgPSBJb25pY1BsYXRmb3JtO1xuSW9uaWMuVXNlciA9IFVzZXI7XG5Jb25pYy5BbmFseXRpY3MgPSBBbmFseXRpY3M7XG5Jb25pYy5BdXRoID0gQXV0aDtcbklvbmljLkRlcGxveSA9IERlcGxveTtcbklvbmljLlB1c2ggPSBQdXNoO1xuSW9uaWMuUHVzaFRva2VuID0gUHVzaFRva2VuO1xuSW9uaWMuUHVzaE1lc3NhZ2UgPSBQdXNoTWVzc2FnZTtcblxuLy8gRGF0YVR5cGUgTmFtZXNwYWNlXG5Jb25pYy5EYXRhVHlwZSA9IERhdGFUeXBlO1xuSW9uaWMuRGF0YVR5cGVzID0gRGF0YVR5cGUuZ2V0TWFwcGluZygpO1xuXG4vLyBJTyBOYW1lc3BhY2VcbklvbmljLklPID0ge307XG5Jb25pYy5JTy5BcHAgPSBBcHA7XG5Jb25pYy5JTy5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5Jb25pYy5JTy5Mb2dnZXIgPSBMb2dnZXI7XG5Jb25pYy5JTy5Qcm9taXNlID0gUHJvbWlzZTtcbklvbmljLklPLkRlZmVycmVkUHJvbWlzZSA9IERlZmVycmVkUHJvbWlzZTtcbklvbmljLklPLlJlcXVlc3QgPSBSZXF1ZXN0O1xuSW9uaWMuSU8uUmVzcG9uc2UgPSBSZXNwb25zZTtcbklvbmljLklPLkFQSVJlcXVlc3QgPSBBUElSZXF1ZXN0O1xuSW9uaWMuSU8uQVBJUmVzcG9uc2UgPSBBUElSZXNwb25zZTtcbklvbmljLklPLlN0b3JhZ2UgPSBTdG9yYWdlO1xuSW9uaWMuSU8uU2V0dGluZ3MgPSBTZXR0aW5ncztcblxuLy8gQW5hbHl0aWMgU3RvcmFnZSBOYW1lc3BhY2VcbklvbmljLkFuYWx5dGljU3RvcmFnZSA9IHt9O1xuSW9uaWMuQW5hbHl0aWNTdG9yYWdlLkJ1Y2tldFN0b3JhZ2UgPSBCdWNrZXRTdG9yYWdlO1xuXG4vLyBBbmFseXRpYyBTZXJpYWxpemVycyBOYW1lc3BhY2VcbklvbmljLkFuYWx5dGljU2VyaWFsaXplcnMgPSB7fTtcbklvbmljLkFuYWx5dGljU2VyaWFsaXplcnMuRE9NU2VyaWFsaXplciA9IERPTVNlcmlhbGl6ZXI7XG5cblxuLy8gUHJvdmlkZXIgYSBzaW5nbGUgc3RvcmFnZSBmb3Igc2VydmljZXMgdGhhdCBoYXZlIHByZXZpb3VzbHkgYmVlbiByZWdpc3RlcmVkXG52YXIgc2VydmljZVN0b3JhZ2UgPSB7fTtcblxuSW9uaWMuaW8gPSBmdW5jdGlvbigpIHtcbiAgaWYgKHR5cGVvZiBJb25pYy5JTy5tYWluID09PSAndW5kZWZpbmVkJykge1xuICAgIElvbmljLklPLm1haW4gPSBuZXcgSW9uaWMuQ29yZSgpO1xuICB9XG4gIHJldHVybiBJb25pYy5JTy5tYWluO1xufTtcblxuSW9uaWMuZ2V0U2VydmljZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgaWYgKHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9PT0gJ3VuZGVmaW5lZCcgfHwgIXNlcnZpY2VTdG9yYWdlW25hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBzZXJ2aWNlU3RvcmFnZVtuYW1lXTtcbn07XG5cbklvbmljLmFkZFNlcnZpY2UgPSBmdW5jdGlvbihuYW1lLCBzZXJ2aWNlLCBmb3JjZSkge1xuICBpZiAoc2VydmljZSAmJiB0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgc2VydmljZVN0b3JhZ2VbbmFtZV0gPSBzZXJ2aWNlO1xuICB9IGVsc2UgaWYgKHNlcnZpY2UgJiYgZm9yY2UpIHtcbiAgICBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9IHNlcnZpY2U7XG4gIH1cbn07XG5cbklvbmljLnJlbW92ZVNlcnZpY2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGlmICh0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZGVsZXRlIHNlcnZpY2VTdG9yYWdlW25hbWVdO1xuICB9XG59O1xuXG4vLyBLaWNrc3RhcnQgSW9uaWMgUGxhdGZvcm1cbklvbmljLmlvKCk7XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJQdXNoID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5wdXNoJywgW10pXG5cbiAgLyoqXG4gICAqIElvbmljUHVzaEFjdGlvbiBTZXJ2aWNlXG4gICAqXG4gICAqIEEgdXRpbGl0eSBzZXJ2aWNlIHRvIGtpY2sgb2ZmIG1pc2MgZmVhdHVyZXMgYXMgcGFydCBvZiB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlXG4gICAqL1xuICAuZmFjdG9yeSgnJGlvbmljUHVzaEFjdGlvbicsIFsnJHN0YXRlJywgZnVuY3Rpb24oJHN0YXRlKSB7XG5cbiAgICBjbGFzcyBQdXNoQWN0aW9uU2VydmljZSB7XG5cbiAgICAgIC8qKlxuICAgICAgICogU3RhdGUgTmF2aWdhdGlvblxuICAgICAgICpcbiAgICAgICAqIEF0dGVtcHRzIHRvIG5hdmlnYXRlIHRvIGEgbmV3IHZpZXcgaWYgYSBwdXNoIG5vdGlmaWNhdGlvbiBwYXlsb2FkIGNvbnRhaW5zOlxuICAgICAgICpcbiAgICAgICAqICAgLSAkc3RhdGUge1N0cmluZ30gVGhlIHN0YXRlIG5hbWUgKGUuZyAndGFiLmNoYXRzJylcbiAgICAgICAqICAgLSAkc3RhdGVQYXJhbXMge09iamVjdH0gUHJvdmlkZWQgc3RhdGUgKHVybCkgcGFyYW1zXG4gICAgICAgKlxuICAgICAgICogRmluZCBtb3JlIGluZm8gYWJvdXQgc3RhdGUgbmF2aWdhdGlvbiBhbmQgcGFyYW1zOlxuICAgICAgICogaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXItdWkvdWktcm91dGVyL3dpa2lcbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbm90aWZpY2F0aW9uIE5vdGlmaWNhdGlvbiBPYmplY3RcbiAgICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICAgKi9cbiAgICAgIG5vdGlmaWNhdGlvbk5hdmlnYXRpb24obm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHZhciBzdGF0ZSA9IG5vdGlmaWNhdGlvbi5wYXlsb2FkLiRzdGF0ZSB8fCBmYWxzZTtcbiAgICAgICAgdmFyIHN0YXRlUGFyYW1zID0gbm90aWZpY2F0aW9uLnBheWxvYWQuJHN0YXRlUGFyYW1zIHx8IHt9O1xuICAgICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgICAkc3RhdGUuZ28oc3RhdGUsIHN0YXRlUGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgUHVzaEFjdGlvblNlcnZpY2UoKTtcbiAgfV0pXG5cbiAgLmZhY3RvcnkoJyRpb25pY1B1c2gnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJQdXNoKSB7XG4gICAgICBJb25pY0FuZ3VsYXJQdXNoID0gbmV3IElvbmljLlB1c2goXCJERUZFUl9JTklUXCIpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyUHVzaDtcbiAgfV0pXG5cbiAgLnJ1bihbJyRpb25pY1B1c2gnLCAnJGlvbmljUHVzaEFjdGlvbicsIGZ1bmN0aW9uKCRpb25pY1B1c2gsICRpb25pY1B1c2hBY3Rpb24pIHtcbiAgICAvLyBUaGlzIGlzIHdoYXQga2lja3Mgb2ZmIHRoZSBzdGF0ZSByZWRpcmVjdGlvbiB3aGVuIGEgcHVzaCBub3RpZmljYWl0b24gaGFzIHRoZSByZWxldmFudCBkZXRhaWxzXG4gICAgJGlvbmljUHVzaC5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpwcm9jZXNzTm90aWZpY2F0aW9uJywgZnVuY3Rpb24obm90aWZpY2F0aW9uKSB7XG4gICAgICBub3RpZmljYXRpb24gPSBJb25pYy5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgaWYgKG5vdGlmaWNhdGlvbiAmJiBub3RpZmljYXRpb24uYXBwKSB7XG4gICAgICAgIGlmIChub3RpZmljYXRpb24uYXBwLmFzbGVlcCA9PT0gdHJ1ZSB8fCBub3RpZmljYXRpb24uYXBwLmNsb3NlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICRpb25pY1B1c2hBY3Rpb24ubm90aWZpY2F0aW9uTmF2aWdhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgfV0pO1xufVxuIl19
