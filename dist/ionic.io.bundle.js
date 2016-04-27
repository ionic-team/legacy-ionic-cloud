(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreRequest = require("../core/request");

var _corePromise = require("../core/promise");

var _coreCore = require("../core/core");

var _coreLogger = require("../core/logger");

var _storage = require("./storage");

var _coreUser = require("../core/user");

var _utilUtil = require("../util/util");

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
        this._serviceHost = _coreCore.IonicPlatform.config.getURL('analytics');
        this.logger = new _coreLogger.Logger({
            'prefix': 'Ionic Analytics:'
        });
        this.storage = _coreCore.IonicPlatform.getStorage();
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
                    "app_id": _coreCore.IonicPlatform.config.get('app_id'),
                    "analytics_version": _coreCore.IonicPlatform.Version
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
                "uri": _coreCore.IonicPlatform.config.getURL('api') + '/api/v1/app/' + _coreCore.IonicPlatform.config.get('app_id') + '/keys/write',
                'headers': {
                    'Authorization': "basic " + btoa(_coreCore.IonicPlatform.config.get('app_id') + ':' + _coreCore.IonicPlatform.config.get('api_key'))
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
                "url": self._serviceHost + '/api/v1/events/' + _coreCore.IonicPlatform.config.get('app_id'),
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
                "url": self._serviceHost + '/api/v1/events/' + _coreCore.IonicPlatform.config.get('app_id'),
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
            if (!_coreCore.IonicPlatform.deviceConnectedToNetwork()) {
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
            if (request && request.requestInfo._lastResult && request.requestInfo._lastResult.status) {
                responseCode = request.requestInfo._lastResult.status;
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
                    self.logger.error('The app id you provided ("' + _coreCore.IonicPlatform.config.get('app_id') + '") was not found.' + docs);
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
            if (!_coreCore.IonicPlatform.config.get('app_id') || !_coreCore.IonicPlatform.config.get('api_key')) {
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

},{"../core/core":9,"../core/logger":13,"../core/promise":14,"../core/request":15,"../core/user":17,"../util/util":26,"./storage":4}],2:[function(require,module,exports){
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
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _coreCore = require("../core/core");

var BucketStorage = (function () {
    function BucketStorage(name) {
        _classCallCheck(this, BucketStorage);

        this.name = name;
        this.baseStorage = _coreCore.IonicPlatform.getStorage();
    }

    _createClass(BucketStorage, [{
        key: 'get',
        value: function get(key) {
            return this.baseStorage.retrieveObject(this.scopedKey(key));
        }
    }, {
        key: 'set',
        value: function set(key, value) {
            return this.baseStorage.storeObject(this.scopedKey(key), value);
        }
    }, {
        key: 'scopedKey',
        value: function scopedKey(key) {
            return this.name + '_' + key + '_' + _coreCore.IonicPlatform.config.get('app_id');
        }
    }]);

    return BucketStorage;
})();

exports.BucketStorage = BucketStorage;

},{"../core/core":9}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _coreRequest = require("../core/request");

var _corePromise = require("../core/promise");

var _coreCore = require("../core/core");

var _coreStorage = require("../core/storage");

var _coreUser = require("../core/user");

var storage = new _coreStorage.PlatformLocalStorageStrategy();
var sessionStorage = new _coreStorage.LocalSessionStorageStrategy();
var __authModules = {};
var __authToken = null;
var authAPIBase = _coreCore.IonicPlatform.config.getURL('platform-api') + '/auth';
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
            return "ionic_io_auth_" + _coreCore.IonicPlatform.config.get('app_id');
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
            return "ionic_io_auth_" + _coreCore.IonicPlatform.config.get('app_id');
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
                'app_id': _coreCore.IonicPlatform.config.get('app_id'),
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
                    'app_id': _coreCore.IonicPlatform.config.get('app_id'),
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
                'app_id': _coreCore.IonicPlatform.config.get('app_id'),
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

},{"../core/core":9,"../core/promise":14,"../core/request":15,"../core/storage":16,"../core/user":17}],6:[function(require,module,exports){
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

},{"./logger":13}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var IonicPlatformConfig = (function () {
    function IonicPlatformConfig() {
        _classCallCheck(this, IonicPlatformConfig);

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

    _createClass(IonicPlatformConfig, [{
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

    return IonicPlatformConfig;
})();

exports.IonicPlatformConfig = IonicPlatformConfig;
var Config = new IonicPlatformConfig();
exports.Config = Config;

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _events = require("./events");

var _storage = require("./storage");

var _logger = require("./logger");

var _config = require("./config");

var eventEmitter = new _events.EventEmitter();
var mainStorage = new _storage.Storage();

var IonicPlatformCore = (function () {
    function IonicPlatformCore() {
        _classCallCheck(this, IonicPlatformCore);

        var self = this;
        this.config = _config.Config;
        this.logger = new _logger.Logger({
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
        key: "init",
        value: function init(cfg) {
            this.config.register(cfg);
        }
    }, {
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
                switch (this.getDeviceTypeByNavigator()) {
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
            var device = this.getDeviceTypeByNavigator();
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
            var device = this.getDeviceTypeByNavigator();
            if (device === 'iphone' || device === 'ipad') {
                return true;
            }
            return false;
        }

        /**
         * Bootstrap Ionic Core
         *
         * Handles the cordova.js bootstrap
         * @return {void}
         */
    }, {
        key: "_bootstrap",
        value: function _bootstrap() {
            this.loadCordova();
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

        /**
         * Fire a callback when core + plugins are ready. This will fire immediately if
         * the components have already become available.
         *
         * @param {function} callback function to fire off
         * @return {void}
         */
    }, {
        key: "onReady",
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

},{"./config":8,"./events":11,"./logger":13,"./storage":16}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{"events":27}],12:[function(require,module,exports){
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

var _config = require("./config");

_defaults(exports, _interopExportWildcard(_config, _defaults));

var _storage = require("./storage");

_defaults(exports, _interopExportWildcard(_storage, _defaults));

var _user = require("./user");

_defaults(exports, _interopExportWildcard(_user, _defaults));

},{"./app":7,"./config":8,"./core":9,"./data-types":10,"./events":11,"./logger":13,"./promise":14,"./request":15,"./storage":16,"./user":17}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{"es6-promise":30}],15:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj["default"] = obj; return newObj; } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _promise = require("./promise");

var _authAuth = require("../auth/auth");

var _superagent = require("superagent");

var request = _interopRequireWildcard(_superagent);

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
        var request_method = (options.method || 'get').toLowerCase();
        var req = request[request_method](options.uri || options.url);
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
            } else {
                if (res.status < 200 || res.status >= 400) {
                    var _err = new Error("Request Failed with status code of " + res.status);
                    p.reject({ 'response': res, 'error': _err });
                } else {
                    p.resolve({ 'response': res, 'payload': res.body });
                }
            }
        });
        p.requestInfo = requestInfo;
        return p.promise;
    }

    return APIRequest;
})(Request);

exports.APIRequest = APIRequest;

},{"../auth/auth":5,"./promise":14,"superagent":32}],16:[function(require,module,exports){
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

},{"./promise":14}],17:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _authAuth = require("../auth/auth");

var _request = require("./request");

var _promise = require("./promise");

var _core = require("./core");

var _storage = require("./storage");

var _logger = require("./logger");

var _dataTypes = require("./data-types");

var AppUserContext = null;
var storage = new _storage.Storage();
var userAPIBase = _core.IonicPlatform.config.getURL('platform-api') + '/auth/users';
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
            return "ionic_io_user_" + _core.IonicPlatform.config.get('app_id');
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

},{"../auth/auth":5,"./core":9,"./data-types":10,"./logger":13,"./promise":14,"./request":15,"./storage":16}],18:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _corePromise = require("../core/promise");

var _coreLogger = require("../core/logger");

var _coreCore = require("../core/core");

var _coreEvents = require("../core/events");

var NO_PLUGIN = "IONIC_DEPLOY_MISSING_PLUGIN";
var INITIAL_DELAY = 1 * 5 * 1000;
var WATCH_INTERVAL = 1 * 60 * 1000;

var Deploy = (function () {
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
                    self._plugin.init(_coreCore.IonicPlatform.config.get('app_id'), _coreCore.IonicPlatform.config.getURL('platform-api'));
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
                    self._plugin.check(_coreCore.IonicPlatform.config.get('app_id'), self._channelTag, function (result) {
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
                    self._plugin.download(_coreCore.IonicPlatform.config.get('app_id'), function (result) {
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
                    self._plugin.extract(_coreCore.IonicPlatform.config.get('app_id'), function (result) {
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
                    self._plugin.redirect(_coreCore.IonicPlatform.config.get('app_id'));
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
                    self._plugin.info(_coreCore.IonicPlatform.config.get('app_id'), function (result) {
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
                    self._plugin.getVersions(_coreCore.IonicPlatform.config.get('app_id'), function (result) {
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
                    self._plugin.deleteVersion(_coreCore.IonicPlatform.config.get('app_id'), uuid, function (result) {
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
                    self._plugin.getMetadata(_coreCore.IonicPlatform.config.get('app_id'), uuid, function (result) {
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
                                        self._plugin.redirect(_coreCore.IonicPlatform.config.get('app_id'));
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

},{"../core/core":9,"../core/events":11,"../core/logger":13,"../core/promise":14}],19:[function(require,module,exports){
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

var _coreCore = require("../core/core");

var _coreLogger = require("../core/logger");

var _pushToken = require("./push-token");

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
        this._serviceHost = _coreCore.IonicPlatform.config.getURL('platform-api') + '/push';
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

},{"../core/core":9,"../core/logger":13,"../core/request":15,"./push-token":23}],22:[function(require,module,exports){
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

var _coreCore = require("../core/core");

var _coreLogger = require("../core/logger");

var _coreEvents = require("../core/events");

var _coreRequest = require("../core/request");

var _corePromise = require("../core/promise");

var _coreUser = require("../core/user");

var _pushToken = require("./push-token");

var _pushMessage = require("./push-message");

var _pushDev = require("./push-dev");

var DEFER_INIT = "DEFER_INIT";
var pushAPIBase = _coreCore.IonicPlatform.config.getURL('platform-api') + '/push';
var pushAPIEndpoints = {
    'saveToken': function saveToken() {
        return pushAPIBase + '/tokens';
    },
    'invalidateToken': function invalidateToken() {
        return pushAPIBase + '/tokens/invalidate';
    }
};

var Push = (function () {
    function Push(config) {
        _classCallCheck(this, Push);

        this.logger = new _coreLogger.Logger({
            'prefix': 'Ionic Push:'
        });
        var IonicApp = new _coreApp.App(_coreCore.IonicPlatform.config.get('app_id'), _coreCore.IonicPlatform.config.get('api_key'));
        IonicApp.devPush = _coreCore.IonicPlatform.config.get('dev_push');
        IonicApp.gcmKey = _coreCore.IonicPlatform.config.get('gcm_key');
        // Check for the required values to use this service
        if (!IonicApp.id || !IonicApp.apiKey) {
            this.logger.error('no app_id or api_key found. (http://docs.ionic.io/docs/io-install)');
            return;
        } else if (_coreCore.IonicPlatform.isAndroidDevice() && !IonicApp.devPush && !IonicApp.gcmKey) {
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
            var storage = _coreCore.IonicPlatform.getStorage();
            var token = storage.retrieveObject('ionic_io_push_token');
            if (token) {
                return new _pushToken.PushToken(token.token);
            }
            return null;
        }
    }, {
        key: "clearStorageToken",
        value: function clearStorageToken() {
            var storage = _coreCore.IonicPlatform.getStorage();
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
            if (_coreCore.IonicPlatform.isAndroidDevice()) {
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
                'app_id': _coreCore.IonicPlatform.config.get('app_id')
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
            return deferred.promise;
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
            if (_coreCore.IonicPlatform.isAndroidDevice()) {
                platform = 'android';
            } else if (_coreCore.IonicPlatform.isIOSDevice()) {
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
            if (!self.app.devPush && !PushPlugin && (_coreCore.IonicPlatform.isIOSDevice() || _coreCore.IonicPlatform.isAndroidDevice())) {
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
            var storage = _coreCore.IonicPlatform.getStorage();
            if (val instanceof _pushToken.PushToken) {
                storage.storeObject('ionic_io_push_token', { 'token': val.token });
            }
            this._token = val;
        }
    }]);

    return Push;
})();

exports.Push = Push;

},{"../core/app":7,"../core/core":9,"../core/events":11,"../core/logger":13,"../core/promise":14,"../core/request":15,"../core/user":17,"./push-dev":21,"./push-message":22,"./push-token":23}],25:[function(require,module,exports){
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

},{}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){

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

},{"_process":28}],31:[function(require,module,exports){

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
},{}],32:[function(require,module,exports){
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

},{"./is-object":33,"./request":35,"./request-base":34,"emitter":29,"reduce":31}],33:[function(require,module,exports){
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

},{}],34:[function(require,module,exports){
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

},{"./is-object":33}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{}],37:[function(require,module,exports){
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

},{}],38:[function(require,module,exports){
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
    return Ionic.IO.Config;
  }]).factory('$ionicUser', [function () {
    return Ionic.User;
  }]).run([function () {
    Ionic.io();
  }]);
}

},{}],39:[function(require,module,exports){
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

},{}],40:[function(require,module,exports){
"use strict";

var _distEs6CoreApp = require("./../dist/es6/core/app");

var _distEs6CoreCore = require("./../dist/es6/core/core");

var _distEs6CoreEvents = require("./../dist/es6/core/events");

var _distEs6CoreLogger = require("./../dist/es6/core/logger");

var _distEs6CorePromise = require("./../dist/es6/core/promise");

var _distEs6CoreRequest = require("./../dist/es6/core/request");

var _distEs6CoreConfig = require("./../dist/es6/core/config");

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

// Ionic Modules
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
Ionic.IO.Config = _distEs6CoreConfig.Config;

// Analytic Storage Namespace
Ionic.AnalyticStorage = {};
Ionic.AnalyticStorage.BucketStorage = _distEs6AnalyticsStorage.BucketStorage;

// Analytic Serializers Namespace
Ionic.AnalyticSerializers = {};
Ionic.AnalyticSerializers.DOMSerializer = _distEs6AnalyticsSerializers.DOMSerializer;

// Provider a single storage for services that have previously been registered
var serviceStorage = {};

Ionic.io = function () {
  return Ionic.Core;
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

},{"./../dist/es6/analytics/analytics":1,"./../dist/es6/analytics/serializers":3,"./../dist/es6/analytics/storage":4,"./../dist/es6/auth/auth":5,"./../dist/es6/core/app":7,"./../dist/es6/core/config":8,"./../dist/es6/core/core":9,"./../dist/es6/core/data-types":10,"./../dist/es6/core/events":11,"./../dist/es6/core/logger":13,"./../dist/es6/core/promise":14,"./../dist/es6/core/request":15,"./../dist/es6/core/storage":16,"./../dist/es6/core/user":17,"./../dist/es6/deploy/deploy":18,"./../dist/es6/push/push":24,"./../dist/es6/push/push-message":22,"./../dist/es6/push/push-token":23}],41:[function(require,module,exports){
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

},{}]},{},[14,15,11,13,16,8,10,9,17,7,12,5,6,23,22,21,24,20,18,19,4,3,1,2,26,25,40,38,36,37,41,39])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hbmFseXRpY3MvYW5hbHl0aWNzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL3NlcmlhbGl6ZXJzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL3N0b3JhZ2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hdXRoL2F1dGguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hdXRoL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9hcHAuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL2NvbmZpZy5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvY29yZS5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvZGF0YS10eXBlcy5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvZXZlbnRzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9pbmRleC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvbG9nZ2VyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9wcm9taXNlLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9yZXF1ZXN0LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9zdG9yYWdlLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS91c2VyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvZGVwbG95L2RlcGxveS5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2RlcGxveS9pbmRleC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L3B1c2gvaW5kZXguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2gtZGV2LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvcHVzaC9wdXNoLW1lc3NhZ2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2gtdG9rZW4uanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2guanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi91dGlsL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvdXRpbC91dGlsLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2NvbXBvbmVudC1lbWl0dGVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2VzNi1wcm9taXNlL2Rpc3QvZXM2LXByb21pc2UuanMiLCJub2RlX21vZHVsZXMvcmVkdWNlLWNvbXBvbmVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L2xpYi9jbGllbnQuanMiLCJub2RlX21vZHVsZXMvc3VwZXJhZ2VudC9saWIvaXMtb2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzL3N1cGVyYWdlbnQvbGliL3JlcXVlc3QtYmFzZS5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L2xpYi9yZXF1ZXN0LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL2FuYWx5dGljcy9hbmd1bGFyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL2F1dGgvYW5ndWxhci5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L3NyYy9jb3JlL2FuZ3VsYXIuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvZGVwbG95L2FuZ3VsYXIuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvZXM1LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL3B1c2gvYW5ndWxhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7MkJDQTJCLGlCQUFpQjs7MkJBQ1osaUJBQWlCOzt3QkFDbkIsY0FBYzs7MEJBQ3JCLGdCQUFnQjs7dUJBQ1QsV0FBVzs7d0JB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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNuS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3Y4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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RUFBRTtBQUNyQixzQkFBZ0IsR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7S0FDakQ7QUFDRCxXQUFPLGdCQUFnQixDQUFDO0dBQ3pCLENBQUMsQ0FBQyxDQUVGLEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxrQkFBa0IsRUFBRSxVQUFTLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRTs7QUFFN0UsY0FBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsZ0NBQWdDLEVBQUUsVUFBUyxZQUFZLEVBQUU7QUFDOUUsa0JBQVksR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM5RCxVQUFJLFlBQVksSUFBSSxZQUFZLENBQUMsR0FBRyxFQUFFO0FBQ3BDLFlBQUksWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFJLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLElBQUksRUFBRTtBQUN4RSwwQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUN2RDtPQUNGO0tBQ0YsQ0FBQyxDQUFDO0dBRUosQ0FBQyxDQUFDLENBQUM7Q0FDTCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJpbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4uL2NvcmUvcHJvbWlzZVwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgQnVja2V0U3RvcmFnZSB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLi4vY29yZS91c2VyXCI7XG5pbXBvcnQgeyBkZWVwRXh0ZW5kIH0gZnJvbSBcIi4uL3V0aWwvdXRpbFwiO1xudmFyIEFOQUxZVElDU19LRVkgPSBudWxsO1xudmFyIERFRkVSX1JFR0lTVEVSID0gXCJERUZFUl9SRUdJU1RFUlwiO1xudmFyIG9wdGlvbnMgPSB7fTtcbnZhciBnbG9iYWxQcm9wZXJ0aWVzID0ge307XG52YXIgZ2xvYmFsUHJvcGVydGllc0ZucyA9IFtdO1xuZXhwb3J0IGNsYXNzIEFuYWx5dGljcyB7XG4gICAgY29uc3RydWN0b3IoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSBudWxsO1xuICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IDMwO1xuICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9zZXJ2aWNlSG9zdCA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgnYW5hbHl0aWNzJyk7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIEFuYWx5dGljczonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgdGhpcy5jYWNoZSA9IG5ldyBCdWNrZXRTdG9yYWdlKCdpb25pY19hbmFseXRpY3MnKTtcbiAgICAgICAgdGhpcy5fYWRkR2xvYmFsUHJvcGVydHlEZWZhdWx0cygpO1xuICAgICAgICBpZiAoY29uZmlnICE9PSBERUZFUl9SRUdJU1RFUikge1xuICAgICAgICAgICAgdGhpcy5yZWdpc3Rlcihjb25maWcpO1xuICAgICAgICB9XG4gICAgfVxuICAgIF9hZGRHbG9iYWxQcm9wZXJ0eURlZmF1bHRzKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHNlbGYuc2V0R2xvYmFsUHJvcGVydGllcyhmdW5jdGlvbiAoZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpIHtcbiAgICAgICAgICAgIGV2ZW50RGF0YS5fdXNlciA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoVXNlci5jdXJyZW50KCkpKTtcbiAgICAgICAgICAgIGV2ZW50RGF0YS5fYXBwID0ge1xuICAgICAgICAgICAgICAgIFwiYXBwX2lkXCI6IElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAgICAgXCJhbmFseXRpY3NfdmVyc2lvblwiOiBJb25pY1BsYXRmb3JtLlZlcnNpb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgaGFzVmFsaWRTZXR0aW5ncygpIHtcbiAgICAgICAgaWYgKCFJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpIHx8ICFJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwaV9rZXknKSkge1xuICAgICAgICAgICAgdmFyIG1zZyA9ICdBIHZhbGlkIGFwcF9pZCBhbmQgYXBpX2tleSBhcmUgcmVxdWlyZWQgYmVmb3JlIHlvdSBjYW4gdXRpbGl6ZSAnICtcbiAgICAgICAgICAgICAgICAnYW5hbHl0aWNzIHByb3Blcmx5LiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vdjEuMC9kb2NzL2lvLXF1aWNrLXN0YXJ0JztcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8obXNnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgc2V0IGRpc3BhdGNoSW50ZXJ2YWwodmFsdWUpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAvLyBTZXQgaG93IG9mdGVuIHdlIHNob3VsZCBzZW5kIGJhdGNoZWQgZXZlbnRzLCBpbiBzZWNvbmRzLlxuICAgICAgICAvLyBTZXQgdGhpcyB0byAwIHRvIGRpc2FibGUgZXZlbnQgY2FjaGluZ1xuICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IHZhbHVlO1xuICAgICAgICAvLyBDbGVhciB0aGUgZXhpc3RpbmcgaW50ZXJ2YWxcbiAgICAgICAgaWYgKHRoaXMuX2Rpc3BhdGNoZXIpIHtcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuX2Rpc3BhdGNoZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZSA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyBzZWxmLl9kaXNwYXRjaFF1ZXVlKCk7IH0sIHZhbHVlICogMTAwMCk7XG4gICAgICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IGRpc3BhdGNoSW50ZXJ2YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZTtcbiAgICB9XG4gICAgX2VucXVldWVFdmVudChjb2xsZWN0aW9uTmFtZSwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKG9wdGlvbnMuZHJ5UnVuKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdldmVudCByZWNpZXZlZCBidXQgbm90IHNlbnQgKGRyeVJ1biBhY3RpdmUpOicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhjb2xsZWN0aW9uTmFtZSk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZW5xdWV1aW5nIGV2ZW50IHRvIHNlbmQgbGF0ZXI6Jyk7XG4gICAgICAgIHNlbGYubG9nZ2VyLmluZm8oY29sbGVjdGlvbk5hbWUpO1xuICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIEFkZCB0aW1lc3RhbXAgcHJvcGVydHkgdG8gdGhlIGRhdGFcbiAgICAgICAgaWYgKCFldmVudERhdGEua2Vlbikge1xuICAgICAgICAgICAgZXZlbnREYXRhLmtlZW4gPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBldmVudERhdGEua2Vlbi50aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIC8vIEFkZCB0aGUgZGF0YSB0byB0aGUgcXVldWVcbiAgICAgICAgdmFyIGV2ZW50UXVldWUgPSBzZWxmLmNhY2hlLmdldCgnZXZlbnRfcXVldWUnKSB8fCB7fTtcbiAgICAgICAgaWYgKCFldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgZXZlbnRRdWV1ZVtjb2xsZWN0aW9uTmFtZV0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXS5wdXNoKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIFdyaXRlIHRoZSBxdWV1ZSB0byBkaXNrXG4gICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIGV2ZW50UXVldWUpO1xuICAgIH1cbiAgICBfcmVxdWVzdEFuYWx5dGljc0tleSgpIHtcbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgXCJtZXRob2RcIjogJ0dFVCcsXG4gICAgICAgICAgICBcImpzb25cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwidXJpXCI6IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgnYXBpJykgKyAnL2FwaS92MS9hcHAvJyArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykgKyAnL2tleXMvd3JpdGUnLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7XG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBcImJhc2ljIFwiICsgYnRvYShJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpICsgJzonICsgSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcGlfa2V5JykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9wb3N0RXZlbnQobmFtZSwgZGF0YSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBwYXlsb2FkID0ge1xuICAgICAgICAgICAgXCJuYW1lXCI6IFtkYXRhXVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIUFOQUxZVElDU19LRVkpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdDYW5ub3Qgc2VuZCBldmVudHMgdG8gdGhlIGFuYWx5dGljcyBzZXJ2ZXIgd2l0aG91dCBhbiBBbmFseXRpY3Mga2V5LicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIFwibWV0aG9kXCI6ICdQT1NUJyxcbiAgICAgICAgICAgIFwidXJsXCI6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9hcGkvdjEvZXZlbnRzLycgKyBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgXCJqc29uXCI6IHBheWxvYWQsXG4gICAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9wb3N0RXZlbnRzKGV2ZW50cykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghQU5BTFlUSUNTX0tFWSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnQ2Fubm90IHNlbmQgZXZlbnRzIHRvIHRoZSBhbmFseXRpY3Mgc2VydmVyIHdpdGhvdXQgYW4gQW5hbHl0aWNzIGtleS4nKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBcIm1ldGhvZFwiOiAnUE9TVCcsXG4gICAgICAgICAgICBcInVybFwiOiBzZWxmLl9zZXJ2aWNlSG9zdCArICcvYXBpL3YxL2V2ZW50cy8nICsgSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgIFwianNvblwiOiBldmVudHMsXG4gICAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9kaXNwYXRjaFF1ZXVlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBldmVudFF1ZXVlID0gdGhpcy5jYWNoZS5nZXQoJ2V2ZW50X3F1ZXVlJykgfHwge307XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhldmVudFF1ZXVlKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIUlvbmljUGxhdGZvcm0uZGV2aWNlQ29ubmVjdGVkVG9OZXR3b3JrKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnN0b3JhZ2UubG9ja2VkQXN5bmNDYWxsKHNlbGYuY2FjaGUuc2NvcGVkS2V5KCdldmVudF9kaXNwYXRjaCcpLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5fcG9zdEV2ZW50cyhldmVudFF1ZXVlKTtcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmNhY2hlLnNldCgnZXZlbnRfcXVldWUnLCB7fSk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzZW50IGV2ZW50cycpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudFF1ZXVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgc2VsZi5faGFuZGxlRGlzcGF0Y2hFcnJvcihlcnIsIHRoaXMsIGV2ZW50UXVldWUpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgX2dldFJlcXVlc3RTdGF0dXNDb2RlKHJlcXVlc3QpIHtcbiAgICAgICAgdmFyIHJlc3BvbnNlQ29kZSA9IG51bGw7XG4gICAgICAgIGlmIChyZXF1ZXN0ICYmIHJlcXVlc3QucmVxdWVzdEluZm8uX2xhc3RSZXN1bHQgJiYgcmVxdWVzdC5yZXF1ZXN0SW5mby5fbGFzdFJlc3VsdC5zdGF0dXMpIHtcbiAgICAgICAgICAgIHJlc3BvbnNlQ29kZSA9IHJlcXVlc3QucmVxdWVzdEluZm8uX2xhc3RSZXN1bHQuc3RhdHVzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZUNvZGU7XG4gICAgfVxuICAgIF9oYW5kbGVEaXNwYXRjaEVycm9yKGVycm9yLCByZXF1ZXN0LCBldmVudFF1ZXVlKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3BvbnNlQ29kZSA9IHRoaXMuX2dldFJlcXVlc3RTdGF0dXNDb2RlKHJlcXVlc3QpO1xuICAgICAgICBpZiAoZXJyb3IgPT09ICdsYXN0X2NhbGxfaW50ZXJydXB0ZWQnKSB7XG4gICAgICAgICAgICBzZWxmLmNhY2hlLnNldCgnZXZlbnRfcXVldWUnLCB7fSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY29ubmVjdCB0byB0aGUgc2VydmVyIGF0IGFsbCAtPiBrZWVwIGV2ZW50c1xuICAgICAgICAgICAgaWYgKCFyZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignRXJyb3Igc2VuZGluZyBhbmFseXRpY3MgZGF0YTogRmFpbGVkIHRvIGNvbm5lY3QgdG8gYW5hbHl0aWNzIHNlcnZlci4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIHt9KTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignRXJyb3Igc2VuZGluZyBhbmFseXRpY3MgZGF0YTogU2VydmVyIHJlc3BvbmRlZCB3aXRoIGVycm9yJyk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXZlbnRRdWV1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgX2hhbmRsZVJlZ2lzdGVyRXJyb3IoZXJyb3IsIHJlcXVlc3QpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzcG9uc2VDb2RlID0gdGhpcy5fZ2V0UmVxdWVzdFN0YXR1c0NvZGUocmVxdWVzdCk7XG4gICAgICAgIHZhciBkb2NzID0gJyBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vdjEuMC9kb2NzL2lvLXF1aWNrLXN0YXJ0JztcbiAgICAgICAgc3dpdGNoIChyZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgNDAxOlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdUaGUgYXBpIGtleSBhbmQgYXBwIGlkIHlvdSBwcm92aWRlZCBkaWQgbm90IHJlZ2lzdGVyIG9uIHRoZSBzZXJ2ZXIuICcgKyBkb2NzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgNDA0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdUaGUgYXBwIGlkIHlvdSBwcm92aWRlZCAoXCInICsgSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSArICdcIikgd2FzIG5vdCBmb3VuZC4nICsgZG9jcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdVbmFibGUgdG8gcmVxdWVzdCBhbmFseXRpY3Mga2V5LicpO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgYW4gYW5hbHl0aWNzIGtleVxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9wdHMgUmVnaXN0cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVnaXN0ZXIgcHJvbWlzZVxuICAgICAqL1xuICAgIHJlZ2lzdGVyKG9wdHMpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghdGhpcy5oYXNWYWxpZFNldHRpbmdzKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgb3B0aW9ucyA9IG9wdHMgfHwge307XG4gICAgICAgIGlmIChvcHRpb25zLnNpbGVudCkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuc2lsZW5jZSgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIudmVyYm9zZSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zLmRyeVJ1bikge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnZHJ5UnVuIG1vZGUgaXMgYWN0aXZlLiBBbmFseXRpY3Mgd2lsbCBub3Qgc2VuZCBhbnkgZXZlbnRzLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3JlcXVlc3RBbmFseXRpY3NLZXkoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgIEFOQUxZVElDU19LRVkgPSByZXN1bHQucGF5bG9hZC53cml0ZV9rZXk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzdWNjZXNzZnVsbHkgcmVnaXN0ZXJlZCBhbmFseXRpY3Mga2V5Jyk7XG4gICAgICAgICAgICBzZWxmLmRpc3BhdGNoSW50ZXJ2YWwgPSBzZWxmLmRpc3BhdGNoSW50ZXJ2YWw7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYuX2hhbmRsZVJlZ2lzdGVyRXJyb3IoZXJyb3IsIHRoaXMpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBzZXRHbG9iYWxQcm9wZXJ0aWVzKHByb3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcHJvcFR5cGUgPSAodHlwZW9mIHByb3ApO1xuICAgICAgICBzd2l0Y2ggKHByb3BUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBwcm9wKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBnbG9iYWxQcm9wZXJ0aWVzW2tleV0gPSBwcm9wW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIGdsb2JhbFByb3BlcnRpZXNGbnMucHVzaChwcm9wKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ3NldEdsb2JhbFByb3BlcnRpZXMgcGFyYW1ldGVyIG11c3QgYmUgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uLicpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHRyYWNrKGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLmhhc1ZhbGlkU2V0dGluZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWV2ZW50RGF0YSkge1xuICAgICAgICAgICAgZXZlbnREYXRhID0ge307XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBDbG9uZSB0aGUgZXZlbnQgZGF0YSB0byBhdm9pZCBtb2RpZnlpbmcgaXRcbiAgICAgICAgICAgIGV2ZW50RGF0YSA9IGRlZXBFeHRlbmQoe30sIGV2ZW50RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIga2V5IGluIGdsb2JhbFByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGlmICghZ2xvYmFsUHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZXZlbnREYXRhW2tleV0gPT09IHZvaWQgMCkge1xuICAgICAgICAgICAgICAgIGV2ZW50RGF0YVtrZXldID0gZ2xvYmFsUHJvcGVydGllc1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ2xvYmFsUHJvcGVydGllc0Zucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZuID0gZ2xvYmFsUHJvcGVydGllc0Zuc1tpXTtcbiAgICAgICAgICAgIGZuLmNhbGwobnVsbCwgZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl91c2VFdmVudENhY2hpbmcpIHtcbiAgICAgICAgICAgIHNlbGYuX2VucXVldWVFdmVudChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5kcnlSdW4pIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdkcnlSdW4gYWN0aXZlLCB3aWxsIG5vdCBzZW5kIGV2ZW50Jyk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudENvbGxlY3Rpb24pO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZXZlbnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuX3Bvc3RFdmVudChldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdW5zZXRHbG9iYWxQcm9wZXJ0eShwcm9wKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHByb3BUeXBlID0gKHR5cGVvZiBwcm9wKTtcbiAgICAgICAgc3dpdGNoIChwcm9wVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgICAgICBkZWxldGUgZ2xvYmFsUHJvcGVydGllc1twcm9wXTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgICAgICAgICAgICB2YXIgaSA9IGdsb2JhbFByb3BlcnRpZXNGbnMuaW5kZXhPZihwcm9wKTtcbiAgICAgICAgICAgICAgICBpZiAoaSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1RoZSBmdW5jdGlvbiBwYXNzZWQgdG8gdW5zZXRHbG9iYWxQcm9wZXJ0eSB3YXMgbm90IGEgZ2xvYmFsIHByb3BlcnR5LicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnbG9iYWxQcm9wZXJ0aWVzRm5zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ3Vuc2V0R2xvYmFsUHJvcGVydHkgcGFyYW1ldGVyIG11c3QgYmUgYSBzdHJpbmcgb3IgZnVuY3Rpb24uJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9hbmFseXRpY3NcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3NlcmlhbGl6ZXJzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zdG9yYWdlXCI7XG4iLCJleHBvcnQgY2xhc3MgRE9NU2VyaWFsaXplciB7XG4gICAgZWxlbWVudFNlbGVjdG9yKGVsZW1lbnQpIHtcbiAgICAgICAgLy8gaXRlcmF0ZSB1cCB0aGUgZG9tXG4gICAgICAgIHZhciBzZWxlY3RvcnMgPSBbXTtcbiAgICAgICAgd2hpbGUgKGVsZW1lbnQudGFnTmFtZSAhPT0gJ0hUTUwnKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3IgPSBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHZhciBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0b3IgKz0gXCIjXCIgKyBpZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBjbGFzc05hbWUgPSBlbGVtZW50LmNsYXNzTmFtZTtcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2xhc3NlcyA9IGNsYXNzTmFtZS5zcGxpdCgnICcpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYyA9IGNsYXNzZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvciArPSAnLicgKyBjO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFlbGVtZW50LnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBjaGlsZEluZGV4ID0gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChlbGVtZW50LnBhcmVudE5vZGUuY2hpbGRyZW4sIGVsZW1lbnQpO1xuICAgICAgICAgICAgc2VsZWN0b3IgKz0gJzpudGgtY2hpbGQoJyArIChjaGlsZEluZGV4ICsgMSkgKyAnKSc7XG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgc2VsZWN0b3JzLnB1c2goc2VsZWN0b3IpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWxlY3RvcnMucmV2ZXJzZSgpLmpvaW4oJz4nKTtcbiAgICB9XG4gICAgZWxlbWVudE5hbWUoZWxlbWVudCkge1xuICAgICAgICAvLyAxLiBpb24tdHJhY2stbmFtZSBkaXJlY3RpdmVcbiAgICAgICAgdmFyIG5hbWUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnaW9uLXRyYWNrLW5hbWUnKTtcbiAgICAgICAgaWYgKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBuYW1lO1xuICAgICAgICB9XG4gICAgICAgIC8vIDIuIGlkXG4gICAgICAgIHZhciBpZCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgIHJldHVybiBpZDtcbiAgICAgICAgfVxuICAgICAgICAvLyAzLiBubyB1bmlxdWUgaWRlbnRpZmllciAtLT4gcmV0dXJuIG51bGxcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmV4cG9ydCBjbGFzcyBCdWNrZXRTdG9yYWdlIHtcbiAgICBjb25zdHJ1Y3RvcihuYW1lKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuYmFzZVN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICB9XG4gICAgZ2V0KGtleSkge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXNlU3RvcmFnZS5yZXRyaWV2ZU9iamVjdCh0aGlzLnNjb3BlZEtleShrZXkpKTtcbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmFzZVN0b3JhZ2Uuc3RvcmVPYmplY3QodGhpcy5zY29wZWRLZXkoa2V5KSwgdmFsdWUpO1xuICAgIH1cbiAgICBzY29wZWRLZXkoa2V5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5hbWUgKyAnXycgKyBrZXkgKyAnXycgKyBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEFQSVJlcXVlc3QgfSBmcm9tIFwiLi4vY29yZS9yZXF1ZXN0XCI7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi4vY29yZS9wcm9taXNlXCI7XG5pbXBvcnQgeyBJb25pY1BsYXRmb3JtIH0gZnJvbSBcIi4uL2NvcmUvY29yZVwiO1xuaW1wb3J0IHsgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSwgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5IH0gZnJvbSBcIi4uL2NvcmUvc3RvcmFnZVwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLi9jb3JlL3VzZXJcIjtcbnZhciBzdG9yYWdlID0gbmV3IFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3koKTtcbnZhciBzZXNzaW9uU3RvcmFnZSA9IG5ldyBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3koKTtcbnZhciBfX2F1dGhNb2R1bGVzID0ge307XG52YXIgX19hdXRoVG9rZW4gPSBudWxsO1xudmFyIGF1dGhBUElCYXNlID0gSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdwbGF0Zm9ybS1hcGknKSArICcvYXV0aCc7XG52YXIgYXV0aEFQSUVuZHBvaW50cyA9IHtcbiAgICAnbG9naW4nOiBmdW5jdGlvbiAocHJvdmlkZXIgPSBudWxsKSB7XG4gICAgICAgIGlmIChwcm92aWRlcikge1xuICAgICAgICAgICAgcmV0dXJuIGF1dGhBUElCYXNlICsgJy9sb2dpbi8nICsgcHJvdmlkZXI7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGF1dGhBUElCYXNlICsgJy9sb2dpbic7XG4gICAgfSxcbiAgICAnc2lnbnVwJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYXV0aEFQSUJhc2UgKyAnL3VzZXJzJztcbiAgICB9XG59O1xuZXhwb3J0IGNsYXNzIFRlbXBUb2tlbkNvbnRleHQge1xuICAgIHN0YXRpYyBnZXQgbGFiZWwoKSB7XG4gICAgICAgIHJldHVybiBcImlvbmljX2lvX2F1dGhfXCIgKyBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpO1xuICAgIH1cbiAgICBzdGF0aWMgZGVsZXRlKCkge1xuICAgICAgICBzZXNzaW9uU3RvcmFnZS5yZW1vdmUoVGVtcFRva2VuQ29udGV4dC5sYWJlbCk7XG4gICAgfVxuICAgIHN0YXRpYyBzdG9yZSgpIHtcbiAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0KFRlbXBUb2tlbkNvbnRleHQubGFiZWwsIF9fYXV0aFRva2VuKTtcbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0RhdGEoKSB7XG4gICAgICAgIHJldHVybiBzZXNzaW9uU3RvcmFnZS5nZXQoVGVtcFRva2VuQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFRva2VuQ29udGV4dCB7XG4gICAgc3RhdGljIGdldCBsYWJlbCgpIHtcbiAgICAgICAgcmV0dXJuIFwiaW9uaWNfaW9fYXV0aF9cIiArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgfVxuICAgIHN0YXRpYyBkZWxldGUoKSB7XG4gICAgICAgIHN0b3JhZ2UucmVtb3ZlKFRva2VuQ29udGV4dC5sYWJlbCk7XG4gICAgfVxuICAgIHN0YXRpYyBzdG9yZSgpIHtcbiAgICAgICAgc3RvcmFnZS5zZXQoVG9rZW5Db250ZXh0LmxhYmVsLCBfX2F1dGhUb2tlbik7XG4gICAgfVxuICAgIHN0YXRpYyBnZXRSYXdEYXRhKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5nZXQoVG9rZW5Db250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9XG59XG5mdW5jdGlvbiBzdG9yZVRva2VuKG9wdGlvbnMsIHRva2VuKSB7XG4gICAgX19hdXRoVG9rZW4gPSB0b2tlbjtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmIG9wdGlvbnMucmVtZW1iZXIpIHtcbiAgICAgICAgVG9rZW5Db250ZXh0LnN0b3JlKCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBUZW1wVG9rZW5Db250ZXh0LnN0b3JlKCk7XG4gICAgfVxufVxuY2xhc3MgSW5BcHBCcm93c2VyRmxvdyB7XG4gICAgY29uc3RydWN0b3IoYXV0aE9wdGlvbnMsIG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoIXdpbmRvdyB8fCAhd2luZG93LmNvcmRvdmEgfHwgIXdpbmRvdy5jb3Jkb3ZhLkluQXBwQnJvd3Nlcikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KFwiTWlzc2luZyBJbkFwcEJyb3dzZXIgcGx1Z2luXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiBhdXRoQVBJRW5kcG9pbnRzLmxvZ2luKG9wdGlvbnMucHJvdmlkZXIpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiBvcHRpb25zLnVyaV9tZXRob2QgfHwgJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzoge1xuICAgICAgICAgICAgICAgICAgICAnYXBwX2lkJzogSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICAgICAgICAgJ2NhbGxiYWNrJzogb3B0aW9ucy5jYWxsYmFja191cmkgfHwgd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzogZGF0YVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICB2YXIgbG9jID0gZGF0YS5wYXlsb2FkLmRhdGEudXJsO1xuICAgICAgICAgICAgICAgIHZhciB0ZW1wQnJvd3NlciA9IHdpbmRvdy5jb3Jkb3ZhLkluQXBwQnJvd3Nlci5vcGVuKGxvYywgJ19ibGFuaycsICdsb2NhdGlvbj1ubyxjbGVhcmNhY2hlPXllcyxjbGVhcnNlc3Npb25jYWNoZT15ZXMnKTtcbiAgICAgICAgICAgICAgICB0ZW1wQnJvd3Nlci5hZGRFdmVudExpc3RlbmVyKCdsb2Fkc3RhcnQnLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS51cmwuc2xpY2UoMCwgMjApID09PSAnaHR0cDovL2F1dGguaW9uaWMuaW8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcXVlcnlTdHJpbmcgPSBkYXRhLnVybC5zcGxpdCgnIycpWzBdLnNwbGl0KCc/JylbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFyYW1QYXJ0cyA9IHF1ZXJ5U3RyaW5nLnNwbGl0KCcmJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFyYW1zID0ge307XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhcmFtUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFydCA9IHBhcmFtUGFydHNbaV0uc3BsaXQoJz0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbXNbcGFydFswXV0gPSBwYXJ0WzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc3RvcmVUb2tlbihhdXRoT3B0aW9ucywgcGFyYW1zLnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBCcm93c2VyLmNsb3NlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wQnJvd3NlciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG59XG5mdW5jdGlvbiBnZXRBdXRoRXJyb3JEZXRhaWxzKGVycikge1xuICAgIHZhciBkZXRhaWxzID0gW107XG4gICAgdHJ5IHtcbiAgICAgICAgZGV0YWlscyA9IGVyci5yZXNwb25zZS5ib2R5LmVycm9yLmRldGFpbHM7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIGU7XG4gICAgfVxuICAgIHJldHVybiBkZXRhaWxzO1xufVxuZXhwb3J0IGNsYXNzIEF1dGgge1xuICAgIHN0YXRpYyBpc0F1dGhlbnRpY2F0ZWQoKSB7XG4gICAgICAgIHZhciB0b2tlbiA9IFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIHZhciB0ZW1wVG9rZW4gPSBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgaWYgKHRlbXBUb2tlbiB8fCB0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzdGF0aWMgbG9naW4obW9kdWxlSWQsIG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgY29udGV4dCA9IF9fYXV0aE1vZHVsZXNbbW9kdWxlSWRdIHx8IGZhbHNlO1xuICAgICAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkF1dGhlbnRpY2F0aW9uIGNsYXNzIGlzIGludmFsaWQgb3IgbWlzc2luZzpcIiArIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRleHQuYXV0aGVudGljYXRlLmFwcGx5KGNvbnRleHQsIFtvcHRpb25zLCBkYXRhXSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBVc2VyLnNlbGYoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBzdGF0aWMgc2lnbnVwKGRhdGEpIHtcbiAgICAgICAgdmFyIGNvbnRleHQgPSBfX2F1dGhNb2R1bGVzLmJhc2ljIHx8IGZhbHNlO1xuICAgICAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkF1dGhlbnRpY2F0aW9uIGNsYXNzIGlzIGludmFsaWQgb3IgbWlzc2luZzpcIiArIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb250ZXh0LnNpZ251cC5hcHBseShjb250ZXh0LCBbZGF0YV0pO1xuICAgIH1cbiAgICBzdGF0aWMgbG9nb3V0KCkge1xuICAgICAgICBUb2tlbkNvbnRleHQuZGVsZXRlKCk7XG4gICAgICAgIFRlbXBUb2tlbkNvbnRleHQuZGVsZXRlKCk7XG4gICAgfVxuICAgIHN0YXRpYyByZWdpc3Rlcihtb2R1bGVJZCwgbW9kdWxlKSB7XG4gICAgICAgIGlmICghX19hdXRoTW9kdWxlc1ttb2R1bGVJZF0pIHtcbiAgICAgICAgICAgIF9fYXV0aE1vZHVsZXNbbW9kdWxlSWRdID0gbW9kdWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHN0YXRpYyBnZXRVc2VyVG9rZW4oKSB7XG4gICAgICAgIHZhciB1c2VydG9rZW4gPSBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICB2YXIgdGVtcHRva2VuID0gVGVtcFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIHZhciB0b2tlbiA9IHRlbXB0b2tlbiB8fCB1c2VydG9rZW47XG4gICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5jbGFzcyBCYXNpY0F1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICd1cmknOiBhdXRoQVBJRW5kcG9pbnRzLmxvZ2luKCksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgJ2FwcF9pZCc6IElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAgICAgJ2VtYWlsJzogZGF0YS5lbWFpbCxcbiAgICAgICAgICAgICAgICAncGFzc3dvcmQnOiBkYXRhLnBhc3N3b3JkXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgIHN0b3JlVG9rZW4ob3B0aW9ucywgZGF0YS5wYXlsb2FkLmRhdGEudG9rZW4pO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgc3RhdGljIHNpZ251cChkYXRhKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHVzZXJEYXRhID0ge1xuICAgICAgICAgICAgJ2FwcF9pZCc6IElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAnZW1haWwnOiBkYXRhLmVtYWlsLFxuICAgICAgICAgICAgJ3Bhc3N3b3JkJzogZGF0YS5wYXNzd29yZFxuICAgICAgICB9O1xuICAgICAgICAvLyBvcHRpb25hbCBkZXRhaWxzXG4gICAgICAgIGlmIChkYXRhLnVzZXJuYW1lKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS51c2VybmFtZSA9IGRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEuaW1hZ2UpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLmltYWdlID0gZGF0YS5pbWFnZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5uYW1lKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS5uYW1lID0gZGF0YS5uYW1lO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmN1c3RvbSkge1xuICAgICAgICAgICAgdXNlckRhdGEuY3VzdG9tID0gZGF0YS5jdXN0b207XG4gICAgICAgIH1cbiAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMuc2lnbnVwKCksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgJ2pzb24nOiB1c2VyRGF0YVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHZhciBlcnJvcnMgPSBbXTtcbiAgICAgICAgICAgIHZhciBkZXRhaWxzID0gZ2V0QXV0aEVycm9yRGV0YWlscyhlcnIpO1xuICAgICAgICAgICAgaWYgKGRldGFpbHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGV0YWlscy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGV0YWlsID0gZGV0YWlsc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZXRhaWwgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGV0YWlsLmVycm9yX3R5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChkZXRhaWwuZXJyb3JfdHlwZSArIFwiX1wiICsgZGV0YWlsLnBhcmFtZXRlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoeyBcImVycm9yc1wiOiBlcnJvcnMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG59XG5jbGFzcyBDdXN0b21BdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2N1c3RvbScgfSwgZGF0YSk7XG4gICAgfVxufVxuY2xhc3MgVHdpdHRlckF1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAndHdpdHRlcicgfSwgZGF0YSk7XG4gICAgfVxufVxuY2xhc3MgRmFjZWJvb2tBdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2ZhY2Vib29rJyB9LCBkYXRhKTtcbiAgICB9XG59XG5jbGFzcyBHaXRodWJBdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2dpdGh1YicgfSwgZGF0YSk7XG4gICAgfVxufVxuY2xhc3MgR29vZ2xlQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdnb29nbGUnIH0sIGRhdGEpO1xuICAgIH1cbn1cbmNsYXNzIEluc3RhZ3JhbUF1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnaW5zdGFncmFtJyB9LCBkYXRhKTtcbiAgICB9XG59XG5jbGFzcyBMaW5rZWRJbkF1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnbGlua2VkaW4nIH0sIGRhdGEpO1xuICAgIH1cbn1cbkF1dGgucmVnaXN0ZXIoJ2Jhc2ljJywgQmFzaWNBdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2N1c3RvbScsIEN1c3RvbUF1dGgpO1xuQXV0aC5yZWdpc3RlcignZmFjZWJvb2snLCBGYWNlYm9va0F1dGgpO1xuQXV0aC5yZWdpc3RlcignZ2l0aHViJywgR2l0aHViQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdnb29nbGUnLCBHb29nbGVBdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2luc3RhZ3JhbScsIEluc3RhZ3JhbUF1dGgpO1xuQXV0aC5yZWdpc3RlcignbGlua2VkaW4nLCBMaW5rZWRJbkF1dGgpO1xuQXV0aC5yZWdpc3RlcigndHdpdHRlcicsIFR3aXR0ZXJBdXRoKTtcbiIsImV4cG9ydCAqIGZyb20gXCIuL2F1dGhcIjtcbiIsImltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuL2xvZ2dlclwiO1xudmFyIHByaXZhdGVEYXRhID0ge307XG5mdW5jdGlvbiBwcml2YXRlVmFyKGtleSkge1xuICAgIHJldHVybiBwcml2YXRlRGF0YVtrZXldIHx8IG51bGw7XG59XG5leHBvcnQgY2xhc3MgQXBwIHtcbiAgICBjb25zdHJ1Y3RvcihhcHBJZCwgYXBpS2V5KSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIEFwcDonXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIWFwcElkIHx8IGFwcElkID09PSAnJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnTm8gYXBwX2lkIHdhcyBwcm92aWRlZCcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICghYXBpS2V5IHx8IGFwaUtleSA9PT0gJycpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ05vIGFwaV9rZXkgd2FzIHByb3ZpZGVkJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcHJpdmF0ZURhdGEuaWQgPSBhcHBJZDtcbiAgICAgICAgcHJpdmF0ZURhdGEuYXBpS2V5ID0gYXBpS2V5O1xuICAgICAgICAvLyBvdGhlciBjb25maWcgdmFsdWUgcmVmZXJlbmNlXG4gICAgICAgIHRoaXMuZGV2UHVzaCA9IG51bGw7XG4gICAgICAgIHRoaXMuZ2NtS2V5ID0gbnVsbDtcbiAgICB9XG4gICAgZ2V0IGlkKCkge1xuICAgICAgICByZXR1cm4gcHJpdmF0ZVZhcignaWQnKTtcbiAgICB9XG4gICAgZ2V0IGFwaUtleSgpIHtcbiAgICAgICAgcmV0dXJuIHByaXZhdGVWYXIoJ2FwaUtleScpO1xuICAgIH1cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuICc8SW9uaWNBcHAgW1xcJycgKyB0aGlzLmlkICsgJ1xcJz4nO1xuICAgIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBJb25pY1BsYXRmb3JtQ29uZmlnIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fc2V0dGluZ3MgPSB7fTtcbiAgICAgICAgdGhpcy5fZGV2TG9jYXRpb25zID0ge307XG4gICAgICAgIHRoaXMuX2xvY2F0aW9ucyA9IHtcbiAgICAgICAgICAgICdhcGknOiAnaHR0cHM6Ly9hcHBzLmlvbmljLmlvJyxcbiAgICAgICAgICAgICdwdXNoJzogJ2h0dHBzOi8vcHVzaC5pb25pYy5pbycsXG4gICAgICAgICAgICAnYW5hbHl0aWNzJzogJ2h0dHBzOi8vYW5hbHl0aWNzLmlvbmljLmlvJyxcbiAgICAgICAgICAgICdkZXBsb3knOiAnaHR0cHM6Ly9hcHBzLmlvbmljLmlvJyxcbiAgICAgICAgICAgICdwbGF0Zm9ybS1hcGknOiAnaHR0cHM6Ly9hcGkuaW9uaWMuaW8nXG4gICAgICAgIH07XG4gICAgfVxuICAgIGdldChuYW1lKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXR0aW5nc1tuYW1lXTtcbiAgICB9XG4gICAgZ2V0VVJMKG5hbWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RldkxvY2F0aW9uc1tuYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2RldkxvY2F0aW9uc1tuYW1lXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9sb2NhdGlvbnNbbmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9sb2NhdGlvbnNbbmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZWdpc3RlcihzZXR0aW5ncyA9IHt9KSB7XG4gICAgICAgIHRoaXMuX3NldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMuX2RldkxvY2F0aW9ucyA9IHNldHRpbmdzLmRldl9sb2NhdGlvbnMgfHwge307XG4gICAgfVxufVxuZXhwb3J0IHZhciBDb25maWcgPSBuZXcgSW9uaWNQbGF0Zm9ybUNvbmZpZygpO1xuIiwiaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSBcIi4vZXZlbnRzXCI7XG5pbXBvcnQgeyBTdG9yYWdlIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4vbG9nZ2VyXCI7XG5pbXBvcnQgeyBDb25maWcgfSBmcm9tIFwiLi9jb25maWdcIjtcbnZhciBldmVudEVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG52YXIgbWFpblN0b3JhZ2UgPSBuZXcgU3RvcmFnZSgpO1xuZXhwb3J0IGNsYXNzIElvbmljUGxhdGZvcm1Db3JlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IENvbmZpZztcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgQ29yZTonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdpbml0Jyk7XG4gICAgICAgIHRoaXMuX3BsdWdpbnNSZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLmVtaXR0ZXIgPSB0aGlzLmdldEVtaXR0ZXIoKTtcbiAgICAgICAgdGhpcy5fYm9vdHN0cmFwKCk7XG4gICAgICAgIGlmIChzZWxmLmNvcmRvdmFQbGF0Zm9ybVVua25vd24pIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2F0dGVtcHRpbmcgdG8gbW9jayBwbHVnaW5zJyk7XG4gICAgICAgICAgICBzZWxmLl9wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5lbWl0dGVyLmVtaXQoJ2lvbmljX2NvcmU6cGx1Z2luc19yZWFkeScpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiZGV2aWNlcmVhZHlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdwbHVnaW5zIGFyZSByZWFkeScpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgICAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCd1bmFibGUgdG8gbGlzdGVuIGZvciBjb3Jkb3ZhIHBsdWdpbnMgdG8gYmUgcmVhZHknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpbml0KGNmZykge1xuICAgICAgICB0aGlzLmNvbmZpZy5yZWdpc3RlcihjZmcpO1xuICAgIH1cbiAgICBnZXQgVmVyc2lvbigpIHtcbiAgICAgICAgcmV0dXJuICdWRVJTSU9OX1NUUklORyc7XG4gICAgfVxuICAgIGdldEVtaXR0ZXIoKSB7XG4gICAgICAgIHJldHVybiBldmVudEVtaXR0ZXI7XG4gICAgfVxuICAgIGdldFN0b3JhZ2UoKSB7XG4gICAgICAgIHJldHVybiBtYWluU3RvcmFnZTtcbiAgICB9XG4gICAgX2lzQ29yZG92YUF2YWlsYWJsZSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZWFyY2hpbmcgZm9yIGNvcmRvdmEuanMnKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb3Jkb3ZhICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnY29yZG92YS5qcyBoYXMgYWxyZWFkeSBiZWVuIGxvYWRlZCcpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0Jyk7XG4gICAgICAgIHZhciBsZW4gPSBzY3JpcHRzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgdmFyIHNjcmlwdCA9IHNjcmlwdHNbaV0uZ2V0QXR0cmlidXRlKCdzcmMnKTtcbiAgICAgICAgICAgIGlmIChzY3JpcHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFydHMgPSBzY3JpcHQuc3BsaXQoJy8nKTtcbiAgICAgICAgICAgICAgICB2YXIgcGFydHNMZW5ndGggPSAwO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzTGVuZ3RoID0gcGFydHMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFydHNbcGFydHNMZW5ndGggLSAxXSA9PT0gJ2NvcmRvdmEuanMnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdjb3Jkb3ZhLmpzIGhhcyBwcmV2aW91c2x5IGJlZW4gaW5jbHVkZWQuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdlbmNvdW50ZXJlZCBlcnJvciB3aGlsZSB0ZXN0aW5nIGZvciBjb3Jkb3ZhLmpzIHByZXNlbmNlLCAnICsgZS50b1N0cmluZygpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBsb2FkQ29yZG92YSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuX2lzQ29yZG92YUF2YWlsYWJsZSgpKSB7XG4gICAgICAgICAgICB2YXIgY29yZG92YVNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgICAgICAgdmFyIGNvcmRvdmFTcmMgPSAnY29yZG92YS5qcyc7XG4gICAgICAgICAgICBzd2l0Y2ggKHRoaXMuZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yKCkpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdhbmRyb2lkJzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5ocmVmLnN1YnN0cmluZygwLCA0KSA9PT0gXCJmaWxlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvcmRvdmFTcmMgPSAnZmlsZTovLy9hbmRyb2lkX2Fzc2V0L3d3dy9jb3Jkb3ZhLmpzJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdpcGFkJzpcbiAgICAgICAgICAgICAgICBjYXNlICdpcGhvbmUnOlxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlc291cmNlID0gd2luZG93LmxvY2F0aW9uLnNlYXJjaC5tYXRjaCgvY29yZG92YV9qc19ib290c3RyYXBfcmVzb3VyY2U9KC4qPykoJnwjfCQpL2kpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc291cmNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29yZG92YVNyYyA9IGRlY29kZVVSSShyZXNvdXJjZVsxXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2NvdWxkIG5vdCBmaW5kIGNvcmRvdmFfanNfYm9vdHN0cmFwX3Jlc291cmNlIHF1ZXJ5IHBhcmFtJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3Vua25vd24nOlxuICAgICAgICAgICAgICAgICAgICBzZWxmLmNvcmRvdmFQbGF0Zm9ybVVua25vd24gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb3Jkb3ZhU2NyaXB0LnNldEF0dHJpYnV0ZSgnc3JjJywgY29yZG92YVNyYyk7XG4gICAgICAgICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGNvcmRvdmFTY3JpcHQpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnaW5qZWN0aW5nIGNvcmRvdmEuanMnKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmUgdGhlIGRldmljZSB0eXBlIHZpYSB0aGUgdXNlciBhZ2VudCBzdHJpbmdcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IG5hbWUgb2YgZGV2aWNlIHBsYXRmb3JtIG9yIFwidW5rbm93blwiIGlmIHVuYWJsZSB0byBpZGVudGlmeSB0aGUgZGV2aWNlXG4gICAgICovXG4gICAgZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yKCkge1xuICAgICAgICB2YXIgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICB2YXIgaXBhZCA9IGFnZW50Lm1hdGNoKC9pUGFkL2kpO1xuICAgICAgICBpZiAoaXBhZCAmJiAoaXBhZFswXS50b0xvd2VyQ2FzZSgpID09PSAnaXBhZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lwYWQnO1xuICAgICAgICB9XG4gICAgICAgIHZhciBpcGhvbmUgPSBhZ2VudC5tYXRjaCgvaVBob25lL2kpO1xuICAgICAgICBpZiAoaXBob25lICYmIChpcGhvbmVbMF0udG9Mb3dlckNhc2UoKSA9PT0gJ2lwaG9uZScpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lwaG9uZSc7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGFuZHJvaWQgPSBhZ2VudC5tYXRjaCgvQW5kcm9pZC9pKTtcbiAgICAgICAgaWYgKGFuZHJvaWQgJiYgKGFuZHJvaWRbMF0udG9Mb3dlckNhc2UoKSA9PT0gJ2FuZHJvaWQnKSkge1xuICAgICAgICAgICAgcmV0dXJuICdhbmRyb2lkJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENoZWNrIGlmIHRoZSBkZXZpY2UgaXMgYW4gQW5kcm9pZCBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIEFuZHJvaWQsIGZhbHNlIG90aGVyd2lzZVxuICAgICAqL1xuICAgIGlzQW5kcm9pZERldmljZSgpIHtcbiAgICAgICAgdmFyIGRldmljZSA9IHRoaXMuZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yKCk7XG4gICAgICAgIGlmIChkZXZpY2UgPT09ICdhbmRyb2lkJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiB0aGUgZGV2aWNlIGlzIGFuIGlPUyBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIGlPUywgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgaXNJT1NEZXZpY2UoKSB7XG4gICAgICAgIHZhciBkZXZpY2UgPSB0aGlzLmdldERldmljZVR5cGVCeU5hdmlnYXRvcigpO1xuICAgICAgICBpZiAoZGV2aWNlID09PSAnaXBob25lJyB8fCBkZXZpY2UgPT09ICdpcGFkJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBCb290c3RyYXAgSW9uaWMgQ29yZVxuICAgICAqXG4gICAgICogSGFuZGxlcyB0aGUgY29yZG92YS5qcyBib290c3RyYXBcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIF9ib290c3RyYXAoKSB7XG4gICAgICAgIHRoaXMubG9hZENvcmRvdmEoKTtcbiAgICB9XG4gICAgZGV2aWNlQ29ubmVjdGVkVG9OZXR3b3JrKHN0cmljdE1vZGUgPSBudWxsKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc3RyaWN0TW9kZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHN0cmljdE1vZGUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5hdmlnYXRvci5jb25uZWN0aW9uID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgICAgICAgdHlwZW9mIG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGUgPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICAgICAgICB0eXBlb2YgQ29ubmVjdGlvbiA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGlmICghc3RyaWN0TW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAobmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZSkge1xuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkVUSEVSTkVUOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLldJRkk6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTF8yRzpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMXzNHOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTExfNEc6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTDpcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZpcmUgYSBjYWxsYmFjayB3aGVuIGNvcmUgKyBwbHVnaW5zIGFyZSByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgY29tcG9uZW50cyBoYXZlIGFscmVhZHkgYmVjb21lIGF2YWlsYWJsZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvblJlYWR5KGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX3BsdWdpbnNSZWFkeSkge1xuICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmVtaXR0ZXIub24oJ2lvbmljX2NvcmU6cGx1Z2luc19yZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0IHZhciBJb25pY1BsYXRmb3JtID0gbmV3IElvbmljUGxhdGZvcm1Db3JlKCk7XG4iLCJ2YXIgZGF0YVR5cGVNYXBwaW5nID0ge307XG5leHBvcnQgY2xhc3MgRGF0YVR5cGVTY2hlbWEge1xuICAgIGNvbnN0cnVjdG9yKHByb3BlcnRpZXMpIHtcbiAgICAgICAgdGhpcy5kYXRhID0ge307XG4gICAgICAgIHRoaXMuc2V0UHJvcGVydGllcyhwcm9wZXJ0aWVzKTtcbiAgICB9XG4gICAgc2V0UHJvcGVydGllcyhwcm9wZXJ0aWVzKSB7XG4gICAgICAgIGlmIChwcm9wZXJ0aWVzIGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgICBmb3IgKHZhciB4IGluIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFbeF0gPSBwcm9wZXJ0aWVzW3hdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRvSlNPTigpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmRhdGE7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnX19Jb25pY19EYXRhVHlwZVNjaGVtYSc6IGRhdGEubmFtZSxcbiAgICAgICAgICAgICd2YWx1ZSc6IGRhdGEudmFsdWVcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaXNWYWxpZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5uYW1lICYmIHRoaXMuZGF0YS52YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBEYXRhVHlwZSB7XG4gICAgc3RhdGljIGdldChuYW1lLCB2YWx1ZSkge1xuICAgICAgICBpZiAoZGF0YVR5cGVNYXBwaW5nW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IGRhdGFUeXBlTWFwcGluZ1tuYW1lXSh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzdGF0aWMgZ2V0TWFwcGluZygpIHtcbiAgICAgICAgcmV0dXJuIGRhdGFUeXBlTWFwcGluZztcbiAgICB9XG4gICAgc3RhdGljIGdldCBTY2hlbWEoKSB7XG4gICAgICAgIHJldHVybiBEYXRhVHlwZVNjaGVtYTtcbiAgICB9XG4gICAgc3RhdGljIHJlZ2lzdGVyKG5hbWUsIGNscykge1xuICAgICAgICBkYXRhVHlwZU1hcHBpbmdbbmFtZV0gPSBjbHM7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVuaXF1ZUFycmF5IHtcbiAgICBjb25zdHJ1Y3Rvcih2YWx1ZSkge1xuICAgICAgICB0aGlzLmRhdGEgPSBbXTtcbiAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHggaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnB1c2godmFsdWVbeF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRvSlNPTigpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmRhdGE7XG4gICAgICAgIHZhciBzY2hlbWEgPSBuZXcgRGF0YVR5cGVTY2hlbWEoeyAnbmFtZSc6ICdVbmlxdWVBcnJheScsICd2YWx1ZSc6IGRhdGEgfSk7XG4gICAgICAgIHJldHVybiBzY2hlbWEudG9KU09OKCk7XG4gICAgfVxuICAgIHN0YXRpYyBmcm9tU3RvcmFnZSh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gbmV3IFVuaXF1ZUFycmF5KHZhbHVlKTtcbiAgICB9XG4gICAgcHVzaCh2YWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLmluZGV4T2YodmFsdWUpID09PSAtMSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHB1bGwodmFsdWUpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5kYXRhLmluZGV4T2YodmFsdWUpO1xuICAgICAgICB0aGlzLmRhdGEuc3BsaWNlKGluZGV4LCAxKTtcbiAgICB9XG59XG5EYXRhVHlwZS5yZWdpc3RlcignVW5pcXVlQXJyYXknLCBVbmlxdWVBcnJheSk7XG4iLCJpbXBvcnQgeyBFdmVudEVtaXR0ZXIgYXMgX0V2ZW50RW1pdHRlciB9IGZyb20gXCJldmVudHNcIjtcbmV4cG9ydCBjbGFzcyBFdmVudEVtaXR0ZXIge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gbmV3IF9FdmVudEVtaXR0ZXIoKTtcbiAgICB9XG4gICAgb24oZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKGV2ZW50LCBjYWxsYmFjayk7XG4gICAgfVxuICAgIGVtaXQobGFiZWwsIGRhdGEgPSBudWxsKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLmVtaXQobGFiZWwsIGRhdGEpO1xuICAgIH1cbn1cbiIsImV4cG9ydCAqIGZyb20gXCIuL2FwcFwiO1xuZXhwb3J0ICogZnJvbSBcIi4vY29yZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vZGF0YS10eXBlc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZXZlbnRzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9sb2dnZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3Byb21pc2VcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3JlcXVlc3RcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2NvbmZpZ1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc3RvcmFnZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vdXNlclwiO1xuIiwiZXhwb3J0IGNsYXNzIExvZ2dlciB7XG4gICAgY29uc3RydWN0b3Iob3B0cykge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IG9wdHMgfHwge307XG4gICAgICAgIHRoaXMuX3NpbGVuY2UgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fcHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgICAgIHRoaXMuX2Jvb3RzdHJhcCgpO1xuICAgIH1cbiAgICBzaWxlbmNlKCkge1xuICAgICAgICB0aGlzLl9zaWxlbmNlID0gdHJ1ZTtcbiAgICB9XG4gICAgdmVyYm9zZSgpIHtcbiAgICAgICAgdGhpcy5fc2lsZW5jZSA9IGZhbHNlO1xuICAgIH1cbiAgICBfYm9vdHN0cmFwKCkge1xuICAgICAgICBpZiAodGhpcy5fb3B0aW9ucy5wcmVmaXgpIHtcbiAgICAgICAgICAgIHRoaXMuX3ByZWZpeCA9IHRoaXMuX29wdGlvbnMucHJlZml4O1xuICAgICAgICB9XG4gICAgfVxuICAgIGluZm8oZGF0YSkge1xuICAgICAgICBpZiAoIXRoaXMuX3NpbGVuY2UpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wcmVmaXgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyh0aGlzLl9wcmVmaXgsIGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgd2FybihkYXRhKSB7XG4gICAgICAgIGlmICghdGhpcy5fc2lsZW5jZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3ByZWZpeCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHRoaXMuX3ByZWZpeCwgZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBlcnJvcihkYXRhKSB7XG4gICAgICAgIGlmICh0aGlzLl9wcmVmaXgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IodGhpcy5fcHJlZml4LCBkYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJpbXBvcnQgeyBQcm9taXNlIGFzIEVTNlByb21pc2UgfSBmcm9tIFwiZXM2LXByb21pc2VcIjtcbmV4cG9ydCBjbGFzcyBEZWZlcnJlZFByb21pc2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3VwZGF0ZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLnByb21pc2UgPSBuZXcgRVM2UHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICBzZWxmLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICAgICAgc2VsZi5yZWplY3QgPSByZWplY3Q7XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgb3JpZ2luYWxUaGVuID0gdGhpcy5wcm9taXNlLnRoZW47XG4gICAgICAgIHRoaXMucHJvbWlzZS50aGVuID0gZnVuY3Rpb24gKG9rLCBmYWlsLCB1cGRhdGUpIHtcbiAgICAgICAgICAgIHNlbGYuX3VwZGF0ZSA9IHVwZGF0ZTtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFRoZW4uY2FsbChzZWxmLnByb21pc2UsIG9rLCBmYWlsKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgbm90aWZ5KHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLl91cGRhdGUgJiYgKHR5cGVvZiB0aGlzLl91cGRhdGUgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICB0aGlzLl91cGRhdGUodmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4vcHJvbWlzZVwiO1xuaW1wb3J0IHsgQXV0aCB9IGZyb20gXCIuLi9hdXRoL2F1dGhcIjtcbmltcG9ydCAqIGFzIHJlcXVlc3QgZnJvbSBcInN1cGVyYWdlbnRcIjtcbmV4cG9ydCBjbGFzcyBSZXF1ZXN0IHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgUmVzcG9uc2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBBUElSZXNwb25zZSBleHRlbmRzIFJlc3BvbnNlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgQVBJUmVxdWVzdCBleHRlbmRzIFJlcXVlc3Qge1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICAgICAgICBpZiAoIW9wdGlvbnMuaGVhZGVycy5BdXRob3JpemF0aW9uKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSBBdXRoLmdldFVzZXJUb2tlbigpO1xuICAgICAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyB0b2tlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBsZXQgcmVxdWVzdEluZm8gPSB7fTtcbiAgICAgICAgbGV0IHAgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGxldCByZXF1ZXN0X21ldGhvZCA9IChvcHRpb25zLm1ldGhvZCB8fCAnZ2V0JykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgbGV0IHJlcSA9IHJlcXVlc3RbcmVxdWVzdF9tZXRob2RdKG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsKTtcbiAgICAgICAgaWYgKG9wdGlvbnMuanNvbikge1xuICAgICAgICAgICAgcmVxID0gcmVxLnNlbmQob3B0aW9ucy5qc29uKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgICAgICByZXEgPSByZXEuc2V0KG9wdGlvbnMuaGVhZGVycyk7XG4gICAgICAgIH1cbiAgICAgICAgcmVxID0gcmVxLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgIHJlcXVlc3RJbmZvLl9sYXN0RXJyb3IgPSBlcnI7XG4gICAgICAgICAgICByZXF1ZXN0SW5mby5fbGFzdFJlc3VsdCA9IHJlcztcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBwLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlcy5zdGF0dXMgPCAyMDAgfHwgcmVzLnN0YXR1cyA+PSA0MDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9lcnIgPSBuZXcgRXJyb3IoXCJSZXF1ZXN0IEZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlIG9mIFwiICsgcmVzLnN0YXR1cyk7XG4gICAgICAgICAgICAgICAgICAgIHAucmVqZWN0KHsgJ3Jlc3BvbnNlJzogcmVzLCAnZXJyb3InOiBfZXJyIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcC5yZXNvbHZlKHsgJ3Jlc3BvbnNlJzogcmVzLCAncGF5bG9hZCc6IHJlcy5ib2R5IH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHAucmVxdWVzdEluZm8gPSByZXF1ZXN0SW5mbztcbiAgICAgICAgcmV0dXJuIHAucHJvbWlzZTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi9wcm9taXNlXCI7XG5leHBvcnQgY2xhc3MgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgfVxuICAgIGdldChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH1cbiAgICByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIHZhbHVlKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5IHtcbiAgICBnZXQoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH1cbiAgICByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LnNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG4gICAgfVxufVxudmFyIG9iamVjdENhY2hlID0ge307XG52YXIgbWVtb3J5TG9ja3MgPSB7fTtcbmV4cG9ydCBjbGFzcyBTdG9yYWdlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneSA9IG5ldyBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5KCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFN0b3JlcyBhbiBvYmplY3QgaW4gbG9jYWwgc3RvcmFnZSB1bmRlciB0aGUgZ2l2ZW4ga2V5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSBOYW1lIG9mIHRoZSBrZXkgdG8gc3RvcmUgdmFsdWVzIGluXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHN0b3JlIHdpdGggdGhlIGtleVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc3RvcmVPYmplY3Qoa2V5LCBvYmplY3QpIHtcbiAgICAgICAgLy8gQ29udmVydCBvYmplY3QgdG8gSlNPTiBhbmQgc3RvcmUgaW4gbG9jYWxTdG9yYWdlXG4gICAgICAgIHZhciBqc29uID0gSlNPTi5zdHJpbmdpZnkob2JqZWN0KTtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5zZXQoa2V5LCBqc29uKTtcbiAgICAgICAgLy8gVGhlbiBzdG9yZSBpdCBpbiB0aGUgb2JqZWN0IGNhY2hlXG4gICAgICAgIG9iamVjdENhY2hlW2tleV0gPSBvYmplY3Q7XG4gICAgfVxuICAgIGRlbGV0ZU9iamVjdChrZXkpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5yZW1vdmUoa2V5KTtcbiAgICAgICAgZGVsZXRlIG9iamVjdENhY2hlW2tleV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEVpdGhlciByZXRyaWV2ZXMgdGhlIGNhY2hlZCBjb3B5IG9mIGFuIG9iamVjdCxcbiAgICAgKiBvciB0aGUgb2JqZWN0IGl0c2VsZiBmcm9tIGxvY2FsU3RvcmFnZS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBuYW1lIG9mIHRoZSBrZXkgdG8gcHVsbCBmcm9tXG4gICAgICogQHJldHVybiB7bWl4ZWR9IFJldHVybnMgdGhlIHByZXZpb3VzbHkgc3RvcmVkIE9iamVjdCBvciBudWxsXG4gICAgICovXG4gICAgcmV0cmlldmVPYmplY3Qoa2V5KSB7XG4gICAgICAgIC8vIEZpcnN0IGNoZWNrIHRvIHNlZSBpZiBpdCdzIHRoZSBvYmplY3QgY2FjaGVcbiAgICAgICAgdmFyIGNhY2hlZCA9IG9iamVjdENhY2hlW2tleV07XG4gICAgICAgIGlmIChjYWNoZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWQ7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVzZXJpYWxpemUgdGhlIG9iamVjdCBmcm9tIEpTT05cbiAgICAgICAgdmFyIGpzb24gPSB0aGlzLnN0cmF0ZWd5LmdldChrZXkpO1xuICAgICAgICAvLyBudWxsIG9yIHVuZGVmaW5lZCAtLT4gcmV0dXJuIG51bGwuXG4gICAgICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoanNvbik7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogTG9ja3MgdGhlIGFzeW5jIGNhbGwgcmVwcmVzZW50ZWQgYnkgdGhlIGdpdmVuIHByb21pc2UgYW5kIGxvY2sga2V5LlxuICAgICAqIE9ubHkgb25lIGFzeW5jRnVuY3Rpb24gZ2l2ZW4gYnkgdGhlIGxvY2tLZXkgY2FuIGJlIHJ1bm5pbmcgYXQgYW55IHRpbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbG9ja0tleSBzaG91bGQgYmUgYSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBuYW1lIG9mIHRoaXMgYXN5bmMgY2FsbC5cbiAgICAgKiAgICAgICAgVGhpcyBpcyByZXF1aXJlZCBmb3IgcGVyc2lzdGVuY2UuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gYXN5bmNGdW5jdGlvbiBSZXR1cm5zIGEgcHJvbWlzZSBvZiB0aGUgYXN5bmMgY2FsbC5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gQSBuZXcgcHJvbWlzZSwgaWRlbnRpY2FsIHRvIHRoZSBvbmUgcmV0dXJuZWQgYnkgYXN5bmNGdW5jdGlvbixcbiAgICAgKiAgICAgICAgICBidXQgd2l0aCB0d28gbmV3IGVycm9yczogJ2luX3Byb2dyZXNzJywgYW5kICdsYXN0X2NhbGxfaW50ZXJydXB0ZWQnLlxuICAgICAqL1xuICAgIGxvY2tlZEFzeW5jQ2FsbChsb2NrS2V5LCBhc3luY0Z1bmN0aW9uKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICAvLyBJZiB0aGUgbWVtb3J5IGxvY2sgaXMgc2V0LCBlcnJvciBvdXQuXG4gICAgICAgIGlmIChtZW1vcnlMb2Nrc1tsb2NrS2V5XSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdpbl9wcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzdG9yZWQgbG9jayBidXQgbm8gbWVtb3J5IGxvY2ssIGZsYWcgYSBwZXJzaXN0ZW5jZSBlcnJvclxuICAgICAgICBpZiAodGhpcy5zdHJhdGVneS5nZXQobG9ja0tleSkgPT09ICdsb2NrZWQnKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpO1xuICAgICAgICAgICAgZGVmZXJyZWQucHJvbWlzZS50aGVuKG51bGwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2V0IHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgIG1lbW9yeUxvY2tzW2xvY2tLZXldID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5zdHJhdGVneS5zZXQobG9ja0tleSwgJ2xvY2tlZCcpO1xuICAgICAgICAvLyBQZXJmb3JtIHRoZSBhc3luYyBvcGVyYXRpb25cbiAgICAgICAgYXN5bmNGdW5jdGlvbigpLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3NEYXRhKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHN1Y2Nlc3NEYXRhKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdG9yZWQgYW5kIG1lbW9yeSBsb2Nrc1xuICAgICAgICAgICAgZGVsZXRlIG1lbW9yeUxvY2tzW2xvY2tLZXldO1xuICAgICAgICAgICAgc2VsZi5zdHJhdGVneS5yZW1vdmUobG9ja0tleSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvckRhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvckRhdGEpO1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgICAgICBkZWxldGUgbWVtb3J5TG9ja3NbbG9ja0tleV07XG4gICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5vdGlmeURhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShub3RpZnlEYXRhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEF1dGggfSBmcm9tIFwiLi4vYXV0aC9hdXRoXCI7XG5pbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4vcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4vcHJvbWlzZVwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuL2NvcmVcIjtcbmltcG9ydCB7IFN0b3JhZ2UgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9sb2dnZXJcIjtcbmltcG9ydCB7IERhdGFUeXBlIH0gZnJvbSBcIi4vZGF0YS10eXBlc1wiO1xudmFyIEFwcFVzZXJDb250ZXh0ID0gbnVsbDtcbnZhciBzdG9yYWdlID0gbmV3IFN0b3JhZ2UoKTtcbnZhciB1c2VyQVBJQmFzZSA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL2F1dGgvdXNlcnMnO1xudmFyIHVzZXJBUElFbmRwb2ludHMgPSB7XG4gICAgJ3NlbGYnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvc2VsZic7XG4gICAgfSxcbiAgICAnZ2V0JzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAncmVtb3ZlJzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAnc2F2ZSc6IGZ1bmN0aW9uICh1c2VyTW9kZWwpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy8nICsgdXNlck1vZGVsLmlkO1xuICAgIH0sXG4gICAgJ3Bhc3N3b3JkUmVzZXQnOiBmdW5jdGlvbiAodXNlck1vZGVsKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvJyArIHVzZXJNb2RlbC5pZCArICcvcGFzc3dvcmQtcmVzZXQnO1xuICAgIH1cbn07XG5jbGFzcyBVc2VyQ29udGV4dCB7XG4gICAgc3RhdGljIGdldCBsYWJlbCgpIHtcbiAgICAgICAgcmV0dXJuIFwiaW9uaWNfaW9fdXNlcl9cIiArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgfVxuICAgIHN0YXRpYyBkZWxldGUoKSB7XG4gICAgICAgIHN0b3JhZ2UuZGVsZXRlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKTtcbiAgICB9XG4gICAgc3RhdGljIHN0b3JlKCkge1xuICAgICAgICBpZiAoVXNlckNvbnRleHQuZ2V0UmF3RGF0YSgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEoVXNlckNvbnRleHQuZ2V0UmF3RGF0YSgpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoVXNlci5jdXJyZW50KCkuZGF0YS5kYXRhLl9faW9uaWNfdXNlcl9taWdyYXRlZCkge1xuICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JywgeyAnX19pb25pY191c2VyX21pZ3JhdGVkJzogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBzdG9yYWdlLnN0b3JlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsLCBVc2VyLmN1cnJlbnQoKSk7XG4gICAgfVxuICAgIHN0YXRpYyBzdG9yZUxlZ2FjeURhdGEoZGF0YSkge1xuICAgICAgICBpZiAoIVVzZXJDb250ZXh0LmdldFJhd0xlZ2FjeURhdGEoKSkge1xuICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JywgZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0RhdGEoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0xlZ2FjeURhdGEoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsICsgJ19sZWdhY3knKSB8fCBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGxvYWQoKSB7XG4gICAgICAgIHZhciBkYXRhID0gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEoZGF0YSk7XG4gICAgICAgICAgICByZXR1cm4gVXNlci5mcm9tQ29udGV4dChkYXRhKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhIHtcbiAgICBjb25zdHJ1Y3RvcihkYXRhID0ge30pIHtcbiAgICAgICAgdGhpcy5kYXRhID0ge307XG4gICAgICAgIGlmICgodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICAgICAgICAgIHRoaXMuZGVzZXJpYWxpemVyRGF0YVR5cGVzKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZGVzZXJpYWxpemVyRGF0YVR5cGVzKCkge1xuICAgICAgICBmb3IgKHZhciB4IGluIHRoaXMuZGF0YSkge1xuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBhbiBvYmplY3QsIGxldCdzIGNoZWNrIGZvciBjdXN0b20gZGF0YSB0eXBlc1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLmRhdGFbeF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gd2UgaGF2ZSBhIGN1c3RvbSB0eXBlP1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGFbeF0uX19Jb25pY19EYXRhVHlwZVNjaGVtYSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmFtZSA9IHRoaXMuZGF0YVt4XS5fX0lvbmljX0RhdGFUeXBlU2NoZW1hO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWFwcGluZyA9IERhdGFUeXBlLmdldE1hcHBpbmcoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hcHBpbmdbbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGhhdmUgYSBjdXN0b20gdHlwZSBhbmQgYSByZWdpc3RlcmVkIGNsYXNzLCBnaXZlIHRoZSBjdXN0b20gZGF0YSB0eXBlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmcm9tIHN0b3JhZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YVt4XSA9IG1hcHBpbmdbbmFtZV0uZnJvbVN0b3JhZ2UodGhpcy5kYXRhW3hdLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICB0aGlzLmRhdGFba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICB1bnNldChrZXkpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YVtrZXldO1xuICAgIH1cbiAgICBnZXQoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kYXRhW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoZGVmYXVsdFZhbHVlID09PSAwIHx8IGRlZmF1bHRWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZSB8fCBudWxsO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVzZXIge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBVc2VyOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tEZWxldGUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZGlydHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZnJlc2ggPSB0cnVlO1xuICAgICAgICB0aGlzLl91bnNldCA9IHt9O1xuICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVXNlckRhdGEoKTtcbiAgICB9XG4gICAgaXNEaXJ0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RpcnR5O1xuICAgIH1cbiAgICBpc0Fub255bW91cygpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpc0F1dGhlbnRpY2F0ZWQoKSB7XG4gICAgICAgIGlmICh0aGlzID09PSBVc2VyLmN1cnJlbnQoKSkge1xuICAgICAgICAgICAgcmV0dXJuIEF1dGguaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzdGF0aWMgY3VycmVudCh1c2VyID0gbnVsbCkge1xuICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSB1c2VyO1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmUoKTtcbiAgICAgICAgICAgIHJldHVybiBBcHBVc2VyQ29udGV4dDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghQXBwVXNlckNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBBcHBVc2VyQ29udGV4dCA9IFVzZXJDb250ZXh0LmxvYWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghQXBwVXNlckNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBBcHBVc2VyQ29udGV4dCA9IG5ldyBVc2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gQXBwVXNlckNvbnRleHQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIGZyb21Db250ZXh0KGRhdGEpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBuZXcgVXNlcigpO1xuICAgICAgICB1c2VyLmlkID0gZGF0YS5faWQ7XG4gICAgICAgIHVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShkYXRhLmRhdGEuZGF0YSk7XG4gICAgICAgIHVzZXIuZGV0YWlscyA9IGRhdGEuZGV0YWlscyB8fCB7fTtcbiAgICAgICAgdXNlci5fZnJlc2ggPSBkYXRhLl9mcmVzaDtcbiAgICAgICAgdXNlci5fZGlydHkgPSBkYXRhLl9kaXJ0eTtcbiAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgfVxuICAgIHN0YXRpYyBzZWxmKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB0ZW1wVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIGlmICghdGVtcFVzZXIuX2Jsb2NrTG9hZCkge1xuICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IHRydWU7XG4gICAgICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMuc2VsZigpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnbG9hZGVkIHVzZXInKTtcbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGN1c3RvbSBkYXRhXG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuaWQgPSByZXN1bHQucGF5bG9hZC5kYXRhLnV1aWQ7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShyZXN1bHQucGF5bG9hZC5kYXRhLmN1c3RvbSk7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGV0YWlscyA9IHJlc3VsdC5wYXlsb2FkLmRhdGEuZGV0YWlscztcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBVc2VyLmN1cnJlbnQodGVtcFVzZXIpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodGVtcFVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oXCJhIGxvYWQgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yIFwiICsgdGhpcyArIFwiLlwiKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHN0YXRpYyBsb2FkKGlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHRlbXBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICAgICAgdGVtcFVzZXIuaWQgPSBpZDtcbiAgICAgICAgaWYgKCF0ZW1wVXNlci5fYmxvY2tMb2FkKSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gdHJ1ZTtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogdXNlckFQSUVuZHBvaW50cy5nZXQodGVtcFVzZXIpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnbG9hZGVkIHVzZXInKTtcbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGN1c3RvbSBkYXRhXG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShyZXN1bHQucGF5bG9hZC5kYXRhLmN1c3RvbSk7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGV0YWlscyA9IHJlc3VsdC5wYXlsb2FkLmRhdGEuZGV0YWlscztcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRlbXBVc2VyKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5pbmZvKFwiYSBsb2FkIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciBcIiArIHRoaXMgKyBcIi5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBpc0ZyZXNoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZnJlc2g7XG4gICAgfVxuICAgIGlzVmFsaWQoKSB7XG4gICAgICAgIGlmICh0aGlzLmlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGdldEFQSUZvcm1hdCgpIHtcbiAgICAgICAgdmFyIGFwaUZvcm1hdCA9IHt9O1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kZXRhaWxzKSB7XG4gICAgICAgICAgICBhcGlGb3JtYXRba2V5XSA9IHRoaXMuZGV0YWlsc1trZXldO1xuICAgICAgICB9XG4gICAgICAgIGFwaUZvcm1hdC5jdXN0b20gPSB0aGlzLmRhdGEuZGF0YTtcbiAgICAgICAgcmV0dXJuIGFwaUZvcm1hdDtcbiAgICB9XG4gICAgZ2V0Rm9ybWF0KGZvcm1hdCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBudWxsO1xuICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgICAgY2FzZSAnYXBpLXNhdmUnOlxuICAgICAgICAgICAgICAgIGZvcm1hdHRlZCA9IHNlbGYuZ2V0QVBJRm9ybWF0KCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG4gICAgbWlncmF0ZSgpIHtcbiAgICAgICAgdmFyIHJhd0RhdGEgPSBVc2VyQ29udGV4dC5nZXRSYXdMZWdhY3lEYXRhKCk7XG4gICAgICAgIGlmIChyYXdEYXRhLl9faW9uaWNfdXNlcl9taWdyYXRlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJhd0RhdGEpIHtcbiAgICAgICAgICAgIHZhciBjdXJyZW50VXNlciA9IElvbmljLlVzZXIuY3VycmVudCgpO1xuICAgICAgICAgICAgdmFyIHVzZXJEYXRhID0gbmV3IFVzZXJEYXRhKHJhd0RhdGEuZGF0YS5kYXRhKTtcbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiB1c2VyRGF0YS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFVzZXIuc2V0KGtleSwgdXNlckRhdGEuZGF0YVtrZXldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN1cnJlbnRVc2VyLnNldCgnX19pb25pY191c2VyX21pZ3JhdGVkJywgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZGVsZXRlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgaWYgKCFzZWxmLmlzVmFsaWQoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tEZWxldGUpIHtcbiAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlbGYuX2RlbGV0ZSgpO1xuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnJlbW92ZSh0aGlzKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ0RFTEVURScsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2RlbGV0ZWQgJyArIHNlbGYpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oXCJhIGRlbGV0ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgXCIgKyB0aGlzICsgXCIuXCIpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgX3N0b3JlKCkge1xuICAgICAgICBpZiAodGhpcyA9PT0gVXNlci5jdXJyZW50KCkpIHtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgX2RlbGV0ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5kZWxldGUoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzYXZlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgaWYgKCFzZWxmLl9ibG9ja1NhdmUpIHtcbiAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLl9zdG9yZSgpO1xuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnNhdmUodGhpcyksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdQQVRDSCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiBzZWxmLmdldEZvcm1hdCgnYXBpLXNhdmUnKVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGlydHkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGYuaXNGcmVzaCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX3Vuc2V0ID0ge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGYuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc2F2ZWQgdXNlcicpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2RpcnR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImEgc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgXCIgKyB0aGlzICsgXCIuXCIpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgcmVzZXRQYXNzd29yZCgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnBhc3N3b3JkUmVzZXQodGhpcyksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncGFzc3dvcmQgcmVzZXQgZm9yIHVzZXInKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHNldCBpZCh2KSB7XG4gICAgICAgIHRoaXMuX2lkID0gdjtcbiAgICB9XG4gICAgZ2V0IGlkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faWQgfHwgbnVsbDtcbiAgICB9XG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiAnPElvbmljVXNlciBbXFwnJyArIHRoaXMuaWQgKyAnXFwnXT4nO1xuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICBkZWxldGUgdGhpcy5fdW5zZXRba2V5XTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgfVxuICAgIGdldChrZXksIGRlZmF1bHRWYWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhLmdldChrZXksIGRlZmF1bHRWYWx1ZSk7XG4gICAgfVxuICAgIHVuc2V0KGtleSkge1xuICAgICAgICB0aGlzLl91bnNldFtrZXldID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS51bnNldChrZXkpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCIuLi9jb3JlL2V2ZW50c1wiO1xudmFyIE5PX1BMVUdJTiA9IFwiSU9OSUNfREVQTE9ZX01JU1NJTkdfUExVR0lOXCI7XG52YXIgSU5JVElBTF9ERUxBWSA9IDEgKiA1ICogMTAwMDtcbnZhciBXQVRDSF9JTlRFUlZBTCA9IDEgKiA2MCAqIDEwMDA7XG5leHBvcnQgY2xhc3MgRGVwbG95IHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBEZXBsb3k6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fcGx1Z2luID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY2hhbm5lbFRhZyA9ICdwcm9kdWN0aW9uJztcbiAgICAgICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhcImluaXRcIik7XG4gICAgICAgIElvbmljUGxhdGZvcm0ub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmluaXRpYWxpemUoKTtcbiAgICAgICAgICAgIHNlbGYuX2lzUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5lbWl0KCdpb25pY19kZXBsb3k6cmVhZHknKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBEZXBsb3kgUGx1Z2luXG4gICAgICpcbiAgICAgKiBJZiB0aGUgcGx1Z2luIGhhcyBub3QgYmVlbiBzZXQgeWV0LCBhdHRlbXB0IHRvIGZldGNoIGl0LCBvdGhlcndpc2UgbG9nXG4gICAgICogYSBtZXNzYWdlLlxuICAgICAqXG4gICAgICogQHJldHVybiB7SW9uaWNEZXBsb3l9IFJldHVybnMgdGhlIHBsdWdpbiBvciBmYWxzZVxuICAgICAqL1xuICAgIF9nZXRQbHVnaW4oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wbHVnaW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wbHVnaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBJb25pY0RlcGxveSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3BsdWdpbiBpcyBub3QgaW5zdGFsbGVkIG9yIGhhcyBub3QgbG9hZGVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgaW9uaWMtcGx1Z2luLWRlcGxveWAgeWV0PycpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IElvbmljRGVwbG95O1xuICAgICAgICByZXR1cm4gSW9uaWNEZXBsb3k7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgdGhlIERlcGxveSBQbHVnaW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluaXRpYWxpemUoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbml0KElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgZm9yIHVwZGF0ZXNcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFdpbGwgcmVzb2x2ZSB3aXRoIHRydWUgaWYgYW4gdXBkYXRlIGlzIGF2YWlsYWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLiBBIHN0cmluZyBvclxuICAgICAqICAgZXJyb3Igd2lsbCBiZSBwYXNzZWQgdG8gcmVqZWN0KCkgaW4gdGhlIGV2ZW50IG9mIGEgZmFpbHVyZS5cbiAgICAgKi9cbiAgICBjaGVjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uY2hlY2soSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgc2VsZi5fY2hhbm5lbFRhZywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCA9PT0gXCJ0cnVlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FuIHVwZGF0ZSBpcyBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdubyB1cGRhdGVzIGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ2VuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIGNoZWNraW5nIGZvciB1cGRhdGVzJyk7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBEb3dubG9hZCBhbmQgYXZhaWxhYmxlIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGV4dHJhY3QoKVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSBwcm9taXNlIHdoaWNoIHdpbGwgcmVzb2x2ZSB3aXRoIHRydWUvZmFsc2Ugb3IgdXNlXG4gICAgICogICAgbm90aWZ5IHRvIHVwZGF0ZSB0aGUgZG93bmxvYWQgcHJvZ3Jlc3MuXG4gICAgICovXG4gICAgZG93bmxvYWQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRvd25sb2FkKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gJ3RydWUnICYmIHJlc3VsdCAhPT0gJ2ZhbHNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiZG93bmxvYWQgY29tcGxldGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCA9PT0gJ3RydWUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRXh0cmFjdCB0aGUgbGFzdCBkb3dubG9hZGVkIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgY2FsbGVkIGFmdGVyIGEgZG93bmxvYWQoKSBzdWNjZXNzZnVsbHkgcmVzb2x2ZXMuXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHByb21pc2Ugd2hpY2ggd2lsbCByZXNvbHZlIHdpdGggdHJ1ZS9mYWxzZSBvciB1c2VcbiAgICAgKiAgICAgICAgICAgICAgICAgICBub3RpZnkgdG8gdXBkYXRlIHRoZSBleHRyYWN0aW9uIHByb2dyZXNzLlxuICAgICAqL1xuICAgIGV4dHJhY3QoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmV4dHJhY3QoSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAnZG9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImV4dHJhY3Rpb24gY29tcGxldGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIExvYWQgdGhlIGxhdGVzdCBkZXBsb3llZCB2ZXJzaW9uXG4gICAgICogVGhpcyBpcyBvbmx5IG5lY2Vzc2FyeSB0byBjYWxsIGlmIHlvdSBoYXZlIG1hbnVhbGx5IGRvd25sb2FkZWQgYW5kIGV4dHJhY3RlZFxuICAgICAqIGFuIHVwZGF0ZSBhbmQgd2lzaCB0byByZWxvYWQgdGhlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95LiBUaGUgbGF0ZXN0IGRlcGxveVxuICAgICAqIHdpbGwgYXV0b21hdGljYWxseSBiZSBsb2FkZWQgd2hlbiB0aGUgYXBwIGlzIHN0YXJ0ZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGxvYWQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5yZWRpcmVjdChJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdhdGNoIGNvbnN0YW50bHkgY2hlY2tzIGZvciB1cGRhdGVzLCBhbmQgdHJpZ2dlcnMgYW5cbiAgICAgKiBldmVudCB3aGVuIG9uZSBpcyByZWFkeS5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBXYXRjaCBjb25maWd1cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdpbGwgZ2V0IGEgbm90aWZ5KCkgY2FsbGJhY2sgd2hlbiBhbiB1cGRhdGUgaXMgYXZhaWxhYmxlXG4gICAgICovXG4gICAgd2F0Y2gob3B0aW9ucykge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodHlwZW9mIG9wdHMuaW5pdGlhbERlbGF5ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgb3B0cy5pbml0aWFsRGVsYXkgPSBJTklUSUFMX0RFTEFZO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5pbnRlcnZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG9wdHMuaW50ZXJ2YWwgPSBXQVRDSF9JTlRFUlZBTDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBjaGVja0ZvclVwZGF0ZXMoKSB7XG4gICAgICAgICAgICBzZWxmLmNoZWNrKCkudGhlbihmdW5jdGlvbiAoaGFzVXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhc1VwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoaGFzVXBkYXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5hYmxlIHRvIGNoZWNrIGZvciB1cGRhdGVzOiAnICsgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQ2hlY2sgb3VyIHRpbWVvdXQgdG8gbWFrZSBzdXJlIGl0IHdhc24ndCBjbGVhcmVkIHdoaWxlIHdlIHdlcmUgd2FpdGluZ1xuICAgICAgICAgICAgLy8gZm9yIGEgc2VydmVyIHJlc3BvbnNlXG4gICAgICAgICAgICBpZiAodGhpcy5fY2hlY2tUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbnRlcnZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgYWZ0ZXIgYW4gaW5pdGlhbCBzaG9ydCBkZXBsYXlcbiAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbml0aWFsRGVsYXkpO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU3RvcCBhdXRvbWF0aWNhbGx5IGxvb2tpbmcgZm9yIHVwZGF0ZXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVud2F0Y2goKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9jaGVja1RpbWVvdXQpO1xuICAgICAgICB0aGlzLl9jaGVja1RpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJbmZvcm1hdGlvbiBhYm91dCB0aGUgY3VycmVudCBkZXBsb3lcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSByZXNvbHZlciB3aWxsIGJlIHBhc3NlZCBhbiBvYmplY3QgdGhhdCBoYXMga2V5L3ZhbHVlXG4gICAgICogICAgcGFpcnMgcGVydGFpbmluZyB0byB0aGUgY3VycmVudGx5IGRlcGxveWVkIHVwZGF0ZS5cbiAgICAgKi9cbiAgICBpbmZvKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbmZvKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBMaXN0IHRoZSBEZXBsb3kgdmVyc2lvbnMgdGhhdCBoYXZlIGJlZW4gaW5zdGFsbGVkIG9uIHRoaXMgZGV2aWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVzb2x2ZXIgd2lsbCBiZSBwYXNzZWQgYW4gYXJyYXkgb2YgZGVwbG95IHV1aWRzXG4gICAgICovXG4gICAgZ2V0VmVyc2lvbnMoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldFZlcnNpb25zKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYW4gaW5zdGFsbGVkIGRlcGxveSBvbiB0aGlzIGRldmljZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHV1aWQgVGhlIGRlcGxveSB1dWlkIHlvdSB3aXNoIHRvIHJlbW92ZSBmcm9tIHRoZSBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBTdGFuZGFyZCByZXNvbHZlL3JlamVjdCByZXNvbHV0aW9uXG4gICAgICovXG4gICAgZGVsZXRlVmVyc2lvbih1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRlbGV0ZVZlcnNpb24oSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgdXVpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoZXMgdGhlIG1ldGFkYXRhIGZvciBhIGdpdmVuIGRlcGxveSB1dWlkLiBJZiBubyB1dWlkIGlzIGdpdmVuLCBpdCB3aWxsIGF0dGVtcHRcbiAgICAgKiB0byBncmFiIHRoZSBtZXRhZGF0YSBmb3IgdGhlIG1vc3QgcmVjZW50bHkga25vd24gdXBkYXRlIHZlcnNpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXVpZCBUaGUgZGVwbG95IHV1aWQgeW91IHdpc2ggdG8gZ3JhYiBtZXRhZGF0YSBmb3IsIGNhbiBiZSBsZWZ0IGJsYW5rIHRvIGdyYWIgbGF0ZXN0IGtub3duIHVwZGF0ZSBtZXRhZGF0YVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFN0YW5kYXJkIHJlc29sdmUvcmVqZWN0IHJlc29sdXRpb25cbiAgICAgKi9cbiAgICBnZXRNZXRhZGF0YSh1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldE1ldGFkYXRhKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIHV1aWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQubWV0YWRhdGEpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGRlcGxveSBjaGFubmVsIHRoYXQgc2hvdWxkIGJlIGNoZWNrZWQgZm9yIHVwZGF0c2VcbiAgICAgKiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9kZXBsb3ktY2hhbm5lbHMgZm9yIG1vcmUgaW5mb3JtYXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsVGFnIFRoZSBjaGFubmVsIHRhZyB0byB1c2VcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldENoYW5uZWwoY2hhbm5lbFRhZykge1xuICAgICAgICB0aGlzLl9jaGFubmVsVGFnID0gY2hhbm5lbFRhZztcbiAgICB9XG4gICAgLyoqXG4gICAgICogVXBkYXRlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95XG4gICAgICogQHBhcmFtIHtib29sZWFufSBkZWZlckxvYWQgRGVmZXIgbG9hZGluZyB0aGUgYXBwbGllZCB1cGRhdGUgYWZ0ZXIgdGhlIGluc3RhbGxhdGlvblxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IEEgcHJvbWlzZSByZXN1bHRcbiAgICAgKi9cbiAgICB1cGRhdGUoZGVmZXJMb2FkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJMb2FkaW5nID0gZmFsc2U7XG4gICAgICAgIGlmICh0eXBlb2YgZGVmZXJMb2FkICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgZGVmZXJMb2FkaW5nID0gZGVmZXJMb2FkO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdXBkYXRlc1xuICAgICAgICAgICAgICAgIHNlbGYuY2hlY2soKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlcmUgYXJlIHVwZGF0ZXMsIGRvd25sb2FkIHRoZW1cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkb3dubG9hZFByb2dyZXNzID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuZG93bmxvYWQoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJkb3dubG9hZCBlcnJvclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5leHRyYWN0KCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJleHRyYWN0aW9uIGVycm9yXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZGVmZXJMb2FkaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLnJlZGlyZWN0KElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICh1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHByb2dyZXNzID0gZG93bmxvYWRQcm9ncmVzcyArICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHByb2dyZXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAodXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWRQcm9ncmVzcyA9ICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoZG93bmxvYWRQcm9ncmVzcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBkZXBsb3kgaXMgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogZGVwbG95IGhhcyBhbHJlYWR5IGJlY29tZSBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb25SZWFkeShjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9pc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIub24oJ2lvbmljX2RlcGxveTpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vZGVwbG95XCI7XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9wdXNoLWRldlwiO1xuZXhwb3J0ICogZnJvbSBcIi4vcHVzaC1tZXNzYWdlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wdXNoLXRva2VuXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wdXNoXCI7XG4iLCJpbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgUHVzaFRva2VuIH0gZnJvbSBcIi4vcHVzaC10b2tlblwiO1xuLyoqXG4gKiBQdXNoRGV2IFNlcnZpY2VcbiAqXG4gKiBUaGlzIHNlcnZpY2UgYWN0cyBhcyBhIG1vY2sgcHVzaCBzZXJ2aWNlIHRoYXQgaXMgaW50ZW5kZWQgdG8gYmUgdXNlZCBwcmUtc2V0dXAgb2ZcbiAqIEdDTS9BUE5TIGluIGFuIElvbmljLmlvIHByb2plY3QuXG4gKlxuICogSG93IGl0IHdvcmtzOlxuICpcbiAqICAgV2hlbiByZWdpc3RlcigpIGlzIGNhbGxlZCwgdGhpcyBzZXJ2aWNlIGlzIHVzZWQgdG8gZ2VuZXJhdGUgYSByYW5kb21cbiAqICAgZGV2ZWxvcG1lbnQgZGV2aWNlIHRva2VuLiBUaGlzIHRva2VuIGlzIG5vdCB2YWxpZCBmb3IgYW55IHNlcnZpY2Ugb3V0c2lkZSBvZlxuICogICBJb25pYyBQdXNoIHdpdGggYGRldl9wdXNoYCBzZXQgdG8gdHJ1ZS4gVGhlc2UgdG9rZW5zIGRvIG5vdCBsYXN0IGxvbmcgYW5kIGFyZSBub3RcbiAqICAgZWxpZ2libGUgZm9yIHVzZSBpbiBhIHByb2R1Y3Rpb24gYXBwLlxuICpcbiAqICAgVGhlIGRldmljZSB3aWxsIHRoZW4gcGVyaW9kaWNhbGx5IGNoZWNrIHRoZSBQdXNoIHNlcnZpY2UgZm9yIHB1c2ggbm90aWZpY2F0aW9ucyBzZW50XG4gKiAgIHRvIG91ciBkZXZlbG9wbWVudCB0b2tlbiAtLSBzbyB1bmxpa2UgYSB0eXBpY2FsIFwicHVzaFwiIHVwZGF0ZSwgdGhpcyBhY3R1YWxseSB1c2VzXG4gKiAgIFwicG9sbGluZ1wiIHRvIGZpbmQgbmV3IG5vdGlmaWNhdGlvbnMuIFRoaXMgbWVhbnMgeW91ICpNVVNUKiBoYXZlIHRoZSBhcHBsaWNhdGlvbiBvcGVuXG4gKiAgIGFuZCBpbiB0aGUgZm9yZWdyb3VuZCB0byByZXRyZWl2ZSBtZXNzc2FnZXMuXG4gKlxuICogICBUaGUgY2FsbGJhY2tzIHByb3ZpZGVkIGluIHlvdXIgaW5pdCgpIHdpbGwgc3RpbGwgYmUgdHJpZ2dlcmVkIGFzIG5vcm1hbCxcbiAqICAgYnV0IHdpdGggdGhlc2Ugbm90YWJsZSBleGNlcHRpb25zOlxuICpcbiAqICAgICAgLSBUaGVyZSBpcyBubyBwYXlsb2FkIGRhdGEgYXZhaWxhYmxlIHdpdGggbWVzc2FnZXNcbiAqICAgICAgLSBBbiBhbGVydCgpIGlzIGNhbGxlZCB3aGVuIGEgbm90aWZpY2F0aW9uIGlzIHJlY2VpdmVkIHVubGVzc3MgeW91IHJldHVybiBmYWxzZVxuICogICAgICAgIGluIHlvdXIgJ29uTm90aWZpY2F0aW9uJyBjYWxsYmFjay5cbiAqXG4gKi9cbmV4cG9ydCBjbGFzcyBQdXNoRGV2U2VydmljZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIFB1c2ggKGRldik6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc2VydmljZUhvc3QgPSBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9wdXNoJztcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl93YXRjaCA9IG51bGw7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGEgZGV2ZWxvcG1lbnQgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gZGV2ZWxvcG1lbnQgZGV2aWNlIHRva2VuXG4gICAgICovXG4gICAgZ2V0RGV2VG9rZW4oKSB7XG4gICAgICAgIC8vIFNvbWUgY3JhenkgYml0LXR3aWRkbGluZyB0byBnZW5lcmF0ZSBhIHJhbmRvbSBndWlkXG4gICAgICAgIHZhciB0b2tlbiA9ICdERVYteHh4eHh4eHgteHh4eC00eHh4LXl4eHgteHh4eHh4eHh4eHh4Jy5yZXBsYWNlKC9beHldL2csIGZ1bmN0aW9uIChjKSB7XG4gICAgICAgICAgICB2YXIgciA9IE1hdGgucmFuZG9tKCkgKiAxNiB8IDAsIHYgPSBjID09PSAneCcgPyByIDogKHIgJiAweDMgfCAweDgpO1xuICAgICAgICAgICAgcmV0dXJuIHYudG9TdHJpbmcoMTYpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbjtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgYSBkZXZlbG9wbWVudCB0b2tlbiB3aXRoIHRoZSBJb25pYyBQdXNoIHNlcnZpY2VcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7SW9uaWNQdXNoU2VydmljZX0gaW9uaWNQdXNoIEluc3RhbnRpYXRlZCBQdXNoIFNlcnZpY2VcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBSZWdpc3RyYXRpb24gQ2FsbGJhY2tcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluaXQoaW9uaWNQdXNoLCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9wdXNoID0gaW9uaWNQdXNoO1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gdGhpcy5fcHVzaC5fZW1pdHRlcjtcbiAgICAgICAgdmFyIHRva2VuID0gdGhpcy5fdG9rZW47XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmdldERldlRva2VuKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgXCJtZXRob2RcIjogJ1BPU1QnLFxuICAgICAgICAgICAgXCJ1cmlcIjogdGhpcy5fc2VydmljZUhvc3QgKyAnL2RldmVsb3BtZW50JyxcbiAgICAgICAgICAgIFwianNvblwiOiB7XG4gICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0b2tlblxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHsgXCJyZWdpc3RyYXRpb25JZFwiOiB0b2tlbiB9O1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncmVnaXN0ZXJlZCB3aXRoIGRldmVsb3BtZW50IHB1c2ggc2VydmljZTogJyArIHRva2VuKTtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIuZW1pdChcImlvbmljX3B1c2g6dG9rZW5cIiwgZGF0YSk7XG4gICAgICAgICAgICBpZiAoKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhuZXcgUHVzaFRva2VuKHNlbGYuX3Rva2VuKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxmLndhdGNoKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoXCJlcnJvciBjb25uZWN0aW5nIGRldmVsb3BtZW50IHB1c2ggc2VydmljZTogXCIgKyBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHB1c2ggc2VydmljZSBmb3Igbm90aWZpY2F0aW9ucyB0aGF0IHRhcmdldCB0aGUgY3VycmVudCBkZXZlbG9wbWVudCB0b2tlblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgY2hlY2tGb3JOb3RpZmljYXRpb25zKCkge1xuICAgICAgICBpZiAoIXRoaXMuX3Rva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICAnbWV0aG9kJzogJ0dFVCcsXG4gICAgICAgICAgICAndXJpJzogc2VsZi5fc2VydmljZUhvc3QgKyAnL2RldmVsb3BtZW50P3Rva2VuPScgKyBzZWxmLl90b2tlbixcbiAgICAgICAgICAgICdqc29uJzogdHJ1ZVxuICAgICAgICB9O1xuICAgICAgICBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucykudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0LnBheWxvYWQuZGF0YS5tZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSB7XG4gICAgICAgICAgICAgICAgICAgICdtZXNzYWdlJzogcmVzdWx0LnBheWxvYWQuZGF0YS5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAndGl0bGUnOiAnREVWRUxPUE1FTlQgUFVTSCdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLndhcm4oXCJJb25pYyBQdXNoOiBEZXZlbG9wbWVudCBQdXNoIHJlY2VpdmVkLiBEZXZlbG9wbWVudCBwdXNoZXMgd2lsbCBub3QgY29udGFpbiBwYXlsb2FkIGRhdGEuXCIpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIuZW1pdChcImlvbmljX3B1c2g6bm90aWZpY2F0aW9uXCIsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKFwidW5hYmxlIHRvIGNoZWNrIGZvciBkZXZlbG9wbWVudCBwdXNoZXM6IFwiICsgZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogS2lja3Mgb2ZmIHRoZSBcInBvbGxpbmdcIiBvZiB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlIGZvciBuZXcgcHVzaCBub3RpZmljYXRpb25zXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB3YXRjaCgpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBkZXYgcHVzaGVzIGV2ZXJ5IDUgc2Vjb25kc1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCd3YXRjaGluZyBmb3IgbmV3IG5vdGlmaWNhdGlvbnMnKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuX3dhdGNoKSB7XG4gICAgICAgICAgICB0aGlzLl93YXRjaCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgc2VsZi5jaGVja0Zvck5vdGlmaWNhdGlvbnMoKTsgfSwgNTAwMCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogUHV0cyB0aGUgXCJwb2xsaW5nXCIgZm9yIG5ldyBub3RpZmljYXRpb25zIG9uIGhvbGQuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBoYWx0KCkge1xuICAgICAgICBpZiAodGhpcy5fd2F0Y2gpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5fd2F0Y2gpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIFB1c2hNZXNzYWdlQXBwU3RhdHVzIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5hc2xlZXAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jbG9zZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgZ2V0IHdhc0FzbGVlcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXNsZWVwO1xuICAgIH1cbiAgICBnZXQgd2FzQ2xvc2VkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jbG9zZWQ7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFB1c2hNZXNzYWdlIHtcbiAgICBjb25zdHJ1Y3RvcihyYXcpIHtcbiAgICAgICAgdGhpcy5fcmF3ID0gcmF3IHx8IHt9O1xuICAgICAgICBpZiAoIXRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YSkge1xuICAgICAgICAgICAgLy8gdGhpcyBzaG91bGQgb25seSBoaXQgaWYgd2UgYXJlIHNlcnZpbmcgdXAgYSBkZXZlbG9wbWVudCBwdXNoXG4gICAgICAgICAgICB0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEgPSB7XG4gICAgICAgICAgICAgICAgJ2NvbGRzdGFydCc6IGZhbHNlLFxuICAgICAgICAgICAgICAgICdmb3JlZ3JvdW5kJzogdHJ1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9wYXlsb2FkID0gbnVsbDtcbiAgICAgICAgdGhpcy5hcHAgPSBudWxsO1xuICAgICAgICB0aGlzLnRleHQgPSBudWxsO1xuICAgICAgICB0aGlzLnRpdGxlID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb3VudCA9IG51bGw7XG4gICAgICAgIHRoaXMuc291bmQgPSBudWxsO1xuICAgICAgICB0aGlzLmltYWdlID0gbnVsbDtcbiAgICB9XG4gICAgc3RhdGljIGZyb21QbHVnaW5KU09OKGpzb24pIHtcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBuZXcgUHVzaE1lc3NhZ2UoanNvbik7XG4gICAgICAgIG1lc3NhZ2UucHJvY2Vzc1JhdygpO1xuICAgICAgICByZXR1cm4gbWVzc2FnZTtcbiAgICB9XG4gICAgZ2V0IHBheWxvYWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXlsb2FkIHx8IHt9O1xuICAgIH1cbiAgICBwcm9jZXNzUmF3KCkge1xuICAgICAgICB0aGlzLnRleHQgPSB0aGlzLl9yYXcubWVzc2FnZSB8fCBudWxsO1xuICAgICAgICB0aGlzLnRpdGxlID0gdGhpcy5fcmF3LnRpdGxlIHx8IG51bGw7XG4gICAgICAgIHRoaXMuY291bnQgPSB0aGlzLl9yYXcuY291bnQgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5zb3VuZCA9IHRoaXMuX3Jhdy5zb3VuZCB8fCBudWxsO1xuICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5fcmF3LmltYWdlIHx8IG51bGw7XG4gICAgICAgIHRoaXMuYXBwID0gbmV3IFB1c2hNZXNzYWdlQXBwU3RhdHVzKCk7XG4gICAgICAgIGlmICghdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhLmZvcmVncm91bmQpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLmFzbGVlcCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5jb2xkc3RhcnQpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLmNsb3NlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5wYXlsb2FkKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXlsb2FkID0gdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhLnBheWxvYWQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0UmF3VmVyc2lvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JhdztcbiAgICB9XG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiAnPFB1c2hNZXNzYWdlIFtcXCcnICsgdGhpcy50aXRsZSArICdcXCddPic7XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIFB1c2hUb2tlbiB7XG4gICAgY29uc3RydWN0b3IodG9rZW4pIHtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbiB8fCBudWxsO1xuICAgIH1cbiAgICBzZXQgdG9rZW4odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB2YWx1ZTtcbiAgICB9XG4gICAgZ2V0IHRva2VuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdG9rZW47XG4gICAgfVxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICB2YXIgdG9rZW4gPSB0aGlzLl90b2tlbiB8fCAnbnVsbCc7XG4gICAgICAgIHJldHVybiAnPFB1c2hUb2tlbiBbXFwnJyArIHRva2VuICsgJ1xcJ10+JztcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBBcHAgfSBmcm9tIFwiLi4vY29yZS9hcHBcIjtcbmltcG9ydCB7IElvbmljUGxhdGZvcm0gfSBmcm9tIFwiLi4vY29yZS9jb3JlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi4vY29yZS9sb2dnZXJcIjtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCIuLi9jb3JlL2V2ZW50c1wiO1xuaW1wb3J0IHsgQVBJUmVxdWVzdCB9IGZyb20gXCIuLi9jb3JlL3JlcXVlc3RcIjtcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLi4vY29yZS91c2VyXCI7XG5pbXBvcnQgeyBQdXNoVG9rZW4gfSBmcm9tIFwiLi9wdXNoLXRva2VuXCI7XG5pbXBvcnQgeyBQdXNoTWVzc2FnZSB9IGZyb20gXCIuL3B1c2gtbWVzc2FnZVwiO1xuaW1wb3J0IHsgUHVzaERldlNlcnZpY2UgfSBmcm9tIFwiLi9wdXNoLWRldlwiO1xudmFyIERFRkVSX0lOSVQgPSBcIkRFRkVSX0lOSVRcIjtcbnZhciBwdXNoQVBJQmFzZSA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL3B1c2gnO1xudmFyIHB1c2hBUElFbmRwb2ludHMgPSB7XG4gICAgJ3NhdmVUb2tlbic6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHB1c2hBUElCYXNlICsgJy90b2tlbnMnO1xuICAgIH0sXG4gICAgJ2ludmFsaWRhdGVUb2tlbic6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHB1c2hBUElCYXNlICsgJy90b2tlbnMvaW52YWxpZGF0ZSc7XG4gICAgfVxufTtcbmV4cG9ydCBjbGFzcyBQdXNoIHtcbiAgICBjb25zdHJ1Y3Rvcihjb25maWcpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgUHVzaDonXG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgSW9uaWNBcHAgPSBuZXcgQXBwKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBpX2tleScpKTtcbiAgICAgICAgSW9uaWNBcHAuZGV2UHVzaCA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnZGV2X3B1c2gnKTtcbiAgICAgICAgSW9uaWNBcHAuZ2NtS2V5ID0gSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdnY21fa2V5Jyk7XG4gICAgICAgIC8vIENoZWNrIGZvciB0aGUgcmVxdWlyZWQgdmFsdWVzIHRvIHVzZSB0aGlzIHNlcnZpY2VcbiAgICAgICAgaWYgKCFJb25pY0FwcC5pZCB8fCAhSW9uaWNBcHAuYXBpS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignbm8gYXBwX2lkIG9yIGFwaV9rZXkgZm91bmQuIChodHRwOi8vZG9jcy5pb25pYy5pby9kb2NzL2lvLWluc3RhbGwpJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoSW9uaWNQbGF0Zm9ybS5pc0FuZHJvaWREZXZpY2UoKSAmJiAhSW9uaWNBcHAuZGV2UHVzaCAmJiAhSW9uaWNBcHAuZ2NtS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignR0NNIHByb2plY3QgbnVtYmVyIG5vdCBmb3VuZCAoaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9wdXNoLWFuZHJvaWQtc2V0dXApJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hcHAgPSBJb25pY0FwcDtcbiAgICAgICAgdGhpcy5yZWdpc3RlckNhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgdGhpcy5ub3RpZmljYXRpb25DYWxsYmFjayA9IG51bGw7XG4gICAgICAgIHRoaXMuZXJyb3JDYWxsYmFjayA9IG51bGw7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5fbm90aWZpY2F0aW9uID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2RlYnVnID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdG9rZW5SZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9yZWdpc3RlcmVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IG51bGw7XG4gICAgICAgIGlmIChjb25maWcgIT09IERFRkVSX0lOSVQpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIElvbmljUGxhdGZvcm0ub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5pbml0KGNvbmZpZyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXQgdG9rZW4odmFsKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gSW9uaWNQbGF0Zm9ybS5nZXRTdG9yYWdlKCk7XG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBQdXNoVG9rZW4pIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nLCB7ICd0b2tlbic6IHZhbC50b2tlbiB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl90b2tlbiA9IHZhbDtcbiAgICB9XG4gICAgZ2V0U3RvcmFnZVRva2VuKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IElvbmljUGxhdGZvcm0uZ2V0U3RvcmFnZSgpO1xuICAgICAgICB2YXIgdG9rZW4gPSBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KCdpb25pY19pb19wdXNoX3Rva2VuJyk7XG4gICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQdXNoVG9rZW4odG9rZW4udG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjbGVhclN0b3JhZ2VUb2tlbigpIHtcbiAgICAgICAgdmFyIHN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgc3RvcmFnZS5kZWxldGVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSW5pdCBtZXRob2QgdG8gc2V0dXAgcHVzaCBiZWhhdmlvci9vcHRpb25zXG4gICAgICpcbiAgICAgKiBUaGUgY29uZmlnIHN1cHBvcnRzIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICAgKiAgIC0gZGVidWcge0Jvb2xlYW59IEVuYWJsZXMgc29tZSBleHRyYSBsb2dnaW5nIGFzIHdlbGwgYXMgc29tZSBkZWZhdWx0IGNhbGxiYWNrIGhhbmRsZXJzXG4gICAgICogICAtIG9uTm90aWZpY2F0aW9uIHtGdW5jdGlvbn0gQ2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBpcyBwYXNzZWQgdGhlIG5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiAgIC0gb25SZWdpc3RlciB7RnVuY3Rpb259IENhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgaXMgcGFzc2VkIHRoZSByZWdpc3RyYXRpb24gb2JqZWN0XG4gICAgICogICAtIG9uRXJyb3Ige0Z1bmN0aW9ufSBDYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHBhc3NlZCB0aGUgZXJyb3Igb2JqZWN0XG4gICAgICogICAtIHBsdWdpbkNvbmZpZyB7T2JqZWN0fSBQbHVnaW4gY29uZmlndXJhdGlvbjogaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwL3Bob25lZ2FwLXBsdWdpbi1wdXNoXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gY29uZmlnIENvbmZpZ3VyYXRpb24gb2JqZWN0XG4gICAgICogQHJldHVybiB7UHVzaH0gcmV0dXJucyB0aGUgY2FsbGVkIFB1c2ggaW5zdGFudGlhdGlvblxuICAgICAqL1xuICAgIGluaXQoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2dldFB1c2hQbHVnaW4oKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb25maWcgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25maWcgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGNvbmZpZyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdpbml0KCkgcmVxdWlyZXMgYSB2YWxpZCBjb25maWcgb2JqZWN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnKSB7XG4gICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnID0ge307XG4gICAgICAgIH1cbiAgICAgICAgaWYgKElvbmljUGxhdGZvcm0uaXNBbmRyb2lkRGV2aWNlKCkpIHtcbiAgICAgICAgICAgIC8vIGluamVjdCBnY20ga2V5IGZvciBQdXNoUGx1Z2luXG4gICAgICAgICAgICBpZiAoIWNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZCkge1xuICAgICAgICAgICAgICAgIGNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZCA9IHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQuc2VuZGVySWQpIHtcbiAgICAgICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQuc2VuZGVySUQgPSBzZWxmLmFwcC5nY21LZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gU3RvcmUgQ2FsbGJhY2tzXG4gICAgICAgIGlmIChjb25maWcub25SZWdpc3Rlcikge1xuICAgICAgICAgICAgdGhpcy5zZXRSZWdpc3RlckNhbGxiYWNrKGNvbmZpZy5vblJlZ2lzdGVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLm9uTm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNldE5vdGlmaWNhdGlvbkNhbGxiYWNrKGNvbmZpZy5vbk5vdGlmaWNhdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5vbkVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLnNldEVycm9yQ2FsbGJhY2soY29uZmlnLm9uRXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5faXNSZWFkeSA9IHRydWU7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdCgnaW9uaWNfcHVzaDpyZWFkeScsIHsgXCJjb25maWdcIjogdGhpcy5fY29uZmlnIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgc2F2ZVRva2VuKHRva2VuLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIGlmICh0b2tlbi50b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0b2tlbi50b2tlbjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdG9rZW5EYXRhID0ge1xuICAgICAgICAgICAgJ3Rva2VuJzogdG9rZW4sXG4gICAgICAgICAgICAnYXBwX2lkJzogSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIW9wdHMuaWdub3JlX3VzZXIpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gVXNlci5jdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAodXNlci5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgICAgIHRva2VuRGF0YS51c2VyX2lkID0gdXNlci5pZDsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tTYXZlVG9rZW4pIHtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogcHVzaEFQSUVuZHBvaW50cy5zYXZlVG9rZW4oKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzogdG9rZW5EYXRhXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NhdmVkIHB1c2ggdG9rZW46ICcgKyB0b2tlbik7XG4gICAgICAgICAgICAgICAgaWYgKHRva2VuRGF0YS51c2VyX2lkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FkZGVkIHB1c2ggdG9rZW4gdG8gdXNlcjogJyArIHRva2VuRGF0YS51c2VyX2lkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImEgdG9rZW4gc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIGRldmljZSB3aXRoIEdDTS9BUE5TIHRvIGdldCBhIGRldmljZSB0b2tlblxuICAgICAqIEZpcmVzIG9mZiB0aGUgJ29uUmVnaXN0ZXInIGNhbGxiYWNrIGlmIG9uZSBoYXMgYmVlbiBwcm92aWRlZCBpbiB0aGUgaW5pdCgpIGNvbmZpZ1xuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIEZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZWdpc3RlcihjYWxsYmFjaykge1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdyZWdpc3RlcicpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9ibG9ja1JlZ2lzdHJhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImFub3RoZXIgcmVnaXN0cmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuXCIpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgdmFyIElvbmljRGV2UHVzaCA9IG5ldyBQdXNoRGV2U2VydmljZSgpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2RlYnVnQ2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9jYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIElvbmljRGV2UHVzaC5pbml0KHNlbGYsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYuX3Rva2VuUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luID0gc2VsZi5fZ2V0UHVzaFBsdWdpbigpLmluaXQoc2VsZi5fY29uZmlnLnBsdWdpbkNvbmZpZyk7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLm9uKCdyZWdpc3RyYXRpb24nLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IFB1c2hUb2tlbihkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fdG9rZW5SZWFkeSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soc2VsZi5fdG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxmLl9yZWdpc3RlcmVkID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEludmFsaWRhdGUgdGhlIGN1cnJlbnQgR0NNL0FQTlMgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IHRoZSB1bnJlZ2lzdGVyIHJlc3VsdFxuICAgICAqL1xuICAgIHVucmVnaXN0ZXIoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgcGxhdGZvcm0gPSBudWxsO1xuICAgICAgICBpZiAoSW9uaWNQbGF0Zm9ybS5pc0FuZHJvaWREZXZpY2UoKSkge1xuICAgICAgICAgICAgcGxhdGZvcm0gPSAnYW5kcm9pZCc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoSW9uaWNQbGF0Zm9ybS5pc0lPU0RldmljZSgpKSB7XG4gICAgICAgICAgICBwbGF0Zm9ybSA9ICdpb3MnO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcGxhdGZvcm0pIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChcIkNvdWxkIG5vdCBkZXRlY3QgdGhlIHBsYXRmb3JtLCBhcmUgeW91IG9uIGEgZGV2aWNlP1wiKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrVW5yZWdpc3Rlcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3BsdWdpbikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi51bnJlZ2lzdGVyKGZ1bmN0aW9uICgpIHsgfSwgZnVuY3Rpb24gKCkgeyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogcHVzaEFQSUVuZHBvaW50cy5pbnZhbGlkYXRlVG9rZW4oKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzoge1xuICAgICAgICAgICAgICAgICAgICAncGxhdGZvcm0nOiBwbGF0Zm9ybSxcbiAgICAgICAgICAgICAgICAgICAgJ3Rva2VuJzogc2VsZi5nZXRTdG9yYWdlVG9rZW4oKS50b2tlblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrVW5yZWdpc3RlciA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3VucmVnaXN0ZXJlZCBwdXNoIHRva2VuOiAnICsgc2VsZi5nZXRTdG9yYWdlVG9rZW4oKS50b2tlbik7XG4gICAgICAgICAgICAgICAgc2VsZi5jbGVhclN0b3JhZ2VUb2tlbigpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrVW5yZWdpc3RlciA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiYW4gdW5yZWdpc3RlciBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDb252ZW5pZW5jZSBtZXRob2QgdG8gZ3JhYiB0aGUgcGF5bG9hZCBvYmplY3QgZnJvbSBhIG5vdGlmaWNhdGlvblxuICAgICAqXG4gICAgICogQHBhcmFtIHtQdXNoTm90aWZpY2F0aW9ufSBub3RpZmljYXRpb24gUHVzaCBOb3RpZmljYXRpb24gb2JqZWN0XG4gICAgICogQHJldHVybiB7b2JqZWN0fSBQYXlsb2FkIG9iamVjdCBvciBhbiBlbXB0eSBvYmplY3RcbiAgICAgKi9cbiAgICBnZXRQYXlsb2FkKG5vdGlmaWNhdGlvbikge1xuICAgICAgICByZXR1cm4gbm90aWZpY2F0aW9uLnBheWxvYWQ7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFNldCB0aGUgcmVnaXN0cmF0aW9uIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBSZWdpc3RyYXRpb24gY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIHNldFJlZ2lzdGVyQ2FsbGJhY2soY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0UmVnaXN0ZXJDYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJlZ2lzdGVyQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFNldCB0aGUgbm90aWZpY2F0aW9uIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBOb3RpZmljYXRpb24gY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIHNldE5vdGlmaWNhdGlvbkNhbGxiYWNrKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NldE5vdGlmaWNhdGlvbkNhbGxiYWNrKCkgcmVxdWlyZXMgYSB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubm90aWZpY2F0aW9uQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFNldCB0aGUgZXJyb3IgY2FsbGJhY2tcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIEVycm9yIGNhbGxiYWNrIGZ1bmN0aW9uXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gdHJ1ZSBpZiBzZXQgY29ycmVjdGx5LCBvdGhlcndpc2UgZmFsc2VcbiAgICAgKi9cbiAgICBzZXRFcnJvckNhbGxiYWNrKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NldEVycm9yQ2FsbGJhY2soKSByZXF1aXJlcyBhIHZhbGlkIGNhbGxiYWNrIGZ1bmN0aW9uJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lcnJvckNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBfZGVidWdSZWdpc3RyYXRpb25DYWxsYmFjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhkYXRhKSB7XG4gICAgICAgICAgICBzZWxmLnRva2VuID0gbmV3IFB1c2hUb2tlbihkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJyhkZWJ1ZykgZGV2aWNlIHRva2VuIHJlZ2lzdGVyZWQ6ICcgKyBzZWxmLl90b2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH1cbiAgICBfZGVidWdOb3RpZmljYXRpb25DYWxsYmFjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBmdW5jdGlvbiBjYWxsYmFjayhub3RpZmljYXRpb24pIHtcbiAgICAgICAgICAgIHNlbGYuX3Byb2Nlc3NOb3RpZmljYXRpb24obm90aWZpY2F0aW9uKTtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlID0gUHVzaE1lc3NhZ2UuZnJvbVBsdWdpbkpTT04obm90aWZpY2F0aW9uKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJyhkZWJ1Zykgbm90aWZpY2F0aW9uIHJlY2VpdmVkOiAnICsgbWVzc2FnZSk7XG4gICAgICAgICAgICBpZiAoIXNlbGYubm90aWZpY2F0aW9uQ2FsbGJhY2sgJiYgc2VsZi5hcHAuZGV2UHVzaCkge1xuICAgICAgICAgICAgICAgIGFsZXJ0KG1lc3NhZ2UudGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH1cbiAgICBfZGVidWdFcnJvckNhbGxiYWNrKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGVycikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJyhkZWJ1ZykgdW5leHBlY3RlZCBlcnJvciBvY2N1cmVkLicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfVxuICAgIF9yZWdpc3RlckNhbGxiYWNrKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGRhdGEpIHtcbiAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgUHVzaFRva2VuKGRhdGEucmVnaXN0cmF0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHNlbGYucmVnaXN0ZXJDYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLnJlZ2lzdGVyQ2FsbGJhY2soc2VsZi5fdG9rZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9XG4gICAgX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5fcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBQdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgaWYgKHNlbGYubm90aWZpY2F0aW9uQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjayhtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfVxuICAgIF9lcnJvckNhbGxiYWNrKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGVycikge1xuICAgICAgICAgICAgaWYgKHNlbGYuZXJyb3JDYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLmVycm9yQ2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyB0aGUgZGVmYXVsdCBkZWJ1ZyBjYWxsYmFja3Mgd2l0aCB0aGUgUHVzaFBsdWdpbiB3aGVuIGRlYnVnIGlzIGVuYWJsZWRcbiAgICAgKiBJbnRlcm5hbCBNZXRob2RcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgX2RlYnVnQ2FsbGJhY2tSZWdpc3RyYXRpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb25maWcuZGVidWcpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5hcHAuZGV2UHVzaCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbigncmVnaXN0cmF0aW9uJywgdGhpcy5fZGVidWdSZWdpc3RyYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ25vdGlmaWNhdGlvbicsIHRoaXMuX2RlYnVnTm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdlcnJvcicsIHRoaXMuX2RlYnVnRXJyb3JDYWxsYmFjaygpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5fcmVnaXN0ZXJlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOnRva2VuJywgdGhpcy5fZGVidWdSZWdpc3RyYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpub3RpZmljYXRpb24nLCB0aGlzLl9kZWJ1Z05vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOmVycm9yJywgdGhpcy5fZGVidWdFcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIHVzZXIgc3VwcGxpZWQgY2FsbGJhY2tzIHdpdGggdGhlIFB1c2hQbHVnaW5cbiAgICAgKiBJbnRlcm5hbCBNZXRob2RcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIF9jYWxsYmFja1JlZ2lzdHJhdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIHRoaXMuX3JlZ2lzdGVyQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ25vdGlmaWNhdGlvbicsIHRoaXMuX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdlcnJvcicsIHRoaXMuX2Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3JlZ2lzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOnRva2VuJywgdGhpcy5fcmVnaXN0ZXJDYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOm5vdGlmaWNhdGlvbicsIHRoaXMuX25vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6ZXJyb3InLCB0aGlzLl9lcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIG1pc2MgZmVhdHVyZXMgYmFzZWQgb24gdGhlIGNvbnRlbnRzIG9mIGEgcHVzaCBub3RpZmljYXRpb25cbiAgICAgKiBJbnRlcm5hbCBNZXRob2RcbiAgICAgKlxuICAgICAqIEN1cnJlbnRseSBqdXN0IGRvZXMgdGhlIHBheWxvYWQgJHN0YXRlIHJlZGlyZWN0aW9uXG4gICAgICogQHBhcmFtIHtQdXNoTm90aWZpY2F0aW9ufSBub3RpZmljYXRpb24gUHVzaCBOb3RpZmljYXRpb24gb2JqZWN0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBfcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pIHtcbiAgICAgICAgdGhpcy5fbm90aWZpY2F0aW9uID0gbm90aWZpY2F0aW9uO1xuICAgICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoJ2lvbmljX3B1c2g6cHJvY2Vzc05vdGlmaWNhdGlvbicsIG5vdGlmaWNhdGlvbik7XG4gICAgfVxuICAgIC8qIERlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgYGdldFB1c2hQbHVnaW5gICovXG4gICAgX2dldFB1c2hQbHVnaW4oKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIFB1c2hQbHVnaW4gPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgUHVzaFBsdWdpbiA9IHdpbmRvdy5QdXNoTm90aWZpY2F0aW9uO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzb21ldGhpbmcgd2VudCB3cm9uZyBsb29raW5nIGZvciB0aGUgUHVzaE5vdGlmaWNhdGlvbiBwbHVnaW4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuYXBwLmRldlB1c2ggJiYgIVB1c2hQbHVnaW4gJiYgKElvbmljUGxhdGZvcm0uaXNJT1NEZXZpY2UoKSB8fCBJb25pY1BsYXRmb3JtLmlzQW5kcm9pZERldmljZSgpKSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoXCJQdXNoTm90aWZpY2F0aW9uIHBsdWdpbiBpcyByZXF1aXJlZC4gSGF2ZSB5b3UgcnVuIGBpb25pYyBwbHVnaW4gYWRkIHBob25lZ2FwLXBsdWdpbi1wdXNoYCA/XCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBQdXNoUGx1Z2luO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGZXRjaCB0aGUgcGhvbmVnYXAtcHVzaC1wbHVnaW4gaW50ZXJmYWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQdXNoTm90aWZpY2F0aW9ufSBQdXNoTm90aWZpY2F0aW9uIGluc3RhbmNlXG4gICAgICovXG4gICAgZ2V0UHVzaFBsdWdpbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsdWdpbjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRmlyZSBhIGNhbGxiYWNrIHdoZW4gUHVzaCBpcyByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgc2VydmljZSBoYXMgYWxyZWFkeSBpbml0aWFsaXplZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvblJlYWR5KGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2lzUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vdXRpbFwiO1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGRlZXBFeHRlbmQoLi4ub3V0KSB7XG4gICAgb3V0ID0gb3V0WzBdIHx8IHt9O1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBvYmogPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGlmICghb2JqKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICBvdXRba2V5XSA9IGRlZXBFeHRlbmQob3V0W2tleV0sIG9ialtrZXldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dFtrZXldID0gb2JqW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfVxuICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIlxyXG4vKipcclxuICogRXhwb3NlIGBFbWl0dGVyYC5cclxuICovXHJcblxyXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICBtb2R1bGUuZXhwb3J0cyA9IEVtaXR0ZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbml0aWFsaXplIGEgbmV3IGBFbWl0dGVyYC5cclxuICpcclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5mdW5jdGlvbiBFbWl0dGVyKG9iaikge1xyXG4gIGlmIChvYmopIHJldHVybiBtaXhpbihvYmopO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIE1peGluIHRoZSBlbWl0dGVyIHByb3BlcnRpZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcclxuICogQHJldHVybiB7T2JqZWN0fVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5mdW5jdGlvbiBtaXhpbihvYmopIHtcclxuICBmb3IgKHZhciBrZXkgaW4gRW1pdHRlci5wcm90b3R5cGUpIHtcclxuICAgIG9ialtrZXldID0gRW1pdHRlci5wcm90b3R5cGVba2V5XTtcclxuICB9XHJcbiAgcmV0dXJuIG9iajtcclxufVxyXG5cclxuLyoqXHJcbiAqIExpc3RlbiBvbiB0aGUgZ2l2ZW4gYGV2ZW50YCB3aXRoIGBmbmAuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxyXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLm9uID1cclxuRW1pdHRlci5wcm90b3R5cGUuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XHJcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xyXG4gICh0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSB8fCBbXSlcclxuICAgIC5wdXNoKGZuKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBBZGRzIGFuIGBldmVudGAgbGlzdGVuZXIgdGhhdCB3aWxsIGJlIGludm9rZWQgYSBzaW5nbGVcclxuICogdGltZSB0aGVuIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXHJcbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XHJcbiAgZnVuY3Rpb24gb24oKSB7XHJcbiAgICB0aGlzLm9mZihldmVudCwgb24pO1xyXG4gICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuICB9XHJcblxyXG4gIG9uLmZuID0gZm47XHJcbiAgdGhpcy5vbihldmVudCwgb24pO1xyXG4gIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbW92ZSB0aGUgZ2l2ZW4gY2FsbGJhY2sgZm9yIGBldmVudGAgb3IgYWxsXHJcbiAqIHJlZ2lzdGVyZWQgY2FsbGJhY2tzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cclxuICogQHJldHVybiB7RW1pdHRlcn1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5vZmYgPVxyXG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9XHJcbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9XHJcbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbihldmVudCwgZm4pe1xyXG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcclxuXHJcbiAgLy8gYWxsXHJcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xyXG4gICAgdGhpcy5fY2FsbGJhY2tzID0ge307XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIC8vIHNwZWNpZmljIGV2ZW50XHJcbiAgdmFyIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XHJcbiAgaWYgKCFjYWxsYmFja3MpIHJldHVybiB0aGlzO1xyXG5cclxuICAvLyByZW1vdmUgYWxsIGhhbmRsZXJzXHJcbiAgaWYgKDEgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xyXG4gICAgZGVsZXRlIHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIC8vIHJlbW92ZSBzcGVjaWZpYyBoYW5kbGVyXHJcbiAgdmFyIGNiO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjYiA9IGNhbGxiYWNrc1tpXTtcclxuICAgIGlmIChjYiA9PT0gZm4gfHwgY2IuZm4gPT09IGZuKSB7XHJcbiAgICAgIGNhbGxiYWNrcy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFbWl0IGBldmVudGAgd2l0aCB0aGUgZ2l2ZW4gYXJncy5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEBwYXJhbSB7TWl4ZWR9IC4uLlxyXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbihldmVudCl7XHJcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xyXG4gIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXHJcbiAgICAsIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XHJcblxyXG4gIGlmIChjYWxsYmFja3MpIHtcclxuICAgIGNhbGxiYWNrcyA9IGNhbGxiYWNrcy5zbGljZSgwKTtcclxuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBjYWxsYmFja3MubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcclxuICAgICAgY2FsbGJhY2tzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIGFycmF5IG9mIGNhbGxiYWNrcyBmb3IgYGV2ZW50YC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEByZXR1cm4ge0FycmF5fVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcclxuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XHJcbiAgcmV0dXJuIHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gfHwgW107XHJcbn07XHJcblxyXG4vKipcclxuICogQ2hlY2sgaWYgdGhpcyBlbWl0dGVyIGhhcyBgZXZlbnRgIGhhbmRsZXJzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHJldHVybiB7Qm9vbGVhbn1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5oYXNMaXN0ZW5lcnMgPSBmdW5jdGlvbihldmVudCl7XHJcbiAgcmV0dXJuICEhIHRoaXMubGlzdGVuZXJzKGV2ZW50KS5sZW5ndGg7XHJcbn07XHJcbiIsIi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9qYWtlYXJjaGliYWxkL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDMuMC4yXG4gKi9cblxuKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgKHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNNYXliZVRoZW5hYmxlKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheSA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXk7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPSAwO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkdG9TdHJpbmcgPSB7fS50b1N0cmluZztcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwID0gZnVuY3Rpb24gYXNhcChjYWxsYmFjaywgYXJnKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbl0gPSBjYWxsYmFjaztcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuICsgMV0gPSBhcmc7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuICs9IDI7XG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9PT0gMikge1xuICAgICAgICAvLyBJZiBsZW4gaXMgMiwgdGhhdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gc2NoZWR1bGUgYW4gYXN5bmMgZmx1c2guXG4gICAgICAgIC8vIElmIGFkZGl0aW9uYWwgY2FsbGJhY2tzIGFyZSBxdWV1ZWQgYmVmb3JlIHRoZSBxdWV1ZSBpcyBmbHVzaGVkLCB0aGV5XG4gICAgICAgIC8vIHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoaXMgZmx1c2ggdGhhdCB3ZSBhcmUgc2NoZWR1bGluZy5cbiAgICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbihsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0U2NoZWR1bGVyKHNjaGVkdWxlRm4pIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbiA9IHNjaGVkdWxlRm47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldEFzYXAoYXNhcEZuKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcCA9IGFzYXBGbjtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93IDogdW5kZWZpbmVkO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93IHx8IHt9O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbC5NdXRhdGlvbk9ic2VydmVyIHx8IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsLldlYktpdE11dGF0aW9uT2JzZXJ2ZXI7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc05vZGUgPSB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYge30udG9TdHJpbmcuY2FsbChwcm9jZXNzKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuXG4gICAgLy8gdGVzdCBmb3Igd2ViIHdvcmtlciBidXQgbm90IGluIElFMTBcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGlzV29ya2VyID0gdHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgdHlwZW9mIGltcG9ydFNjcmlwdHMgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09ICd1bmRlZmluZWQnO1xuXG4gICAgLy8gbm9kZVxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpIHtcbiAgICAgIC8vIG5vZGUgdmVyc2lvbiAwLjEwLnggZGlzcGxheXMgYSBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gbmV4dFRpY2sgaXMgdXNlZCByZWN1cnNpdmVseVxuICAgICAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jdWpvanMvd2hlbi9pc3N1ZXMvNDEwIGZvciBkZXRhaWxzXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2sobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gdmVydHhcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dChsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpIHtcbiAgICAgIHZhciBpdGVyYXRpb25zID0gMDtcbiAgICAgIHZhciBvYnNlcnZlciA9IG5ldyBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbm9kZS5kYXRhID0gKGl0ZXJhdGlvbnMgPSArK2l0ZXJhdGlvbnMgJSAyKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gd2ViIHdvcmtlclxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpIHtcbiAgICAgIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaDtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZXRUaW1lb3V0KGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCwgMSk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuOyBpKz0yKSB7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpXTtcbiAgICAgICAgdmFyIGFyZyA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpKzFdO1xuXG4gICAgICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2ldID0gdW5kZWZpbmVkO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaSsxXSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGF0dGVtcHRWZXJ0eCgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhciByID0gcmVxdWlyZTtcbiAgICAgICAgdmFyIHZlcnR4ID0gcigndmVydHgnKTtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dCA9IHZlcnR4LnJ1bk9uTG9vcCB8fCB2ZXJ0eC5ydW5PbkNvbnRleHQ7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaDtcbiAgICAvLyBEZWNpZGUgd2hhdCBhc3luYyBtZXRob2QgdG8gdXNlIHRvIHRyaWdnZXJpbmcgcHJvY2Vzc2luZyBvZiBxdWV1ZWQgY2FsbGJhY2tzOlxuICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNXb3JrZXIpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhdHRlbXB0VmVydHgoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3AoKSB7fVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgICA9IHZvaWQgMDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEID0gMTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQgID0gMjtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUiA9IG5ldyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkge1xuICAgICAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoXCJZb3UgY2Fubm90IHJlc29sdmUgYSBwcm9taXNlIHdpdGggaXRzZWxmXCIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdBIHByb21pc2VzIGNhbGxiYWNrIGNhbm5vdCByZXR1cm4gdGhhdCBzYW1lIHByb21pc2UuJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbihwcm9taXNlKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuO1xuICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvciA9IGVycm9yO1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1I7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5VGhlbih0aGVuLCB2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcik7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlLCB0aGVuKSB7XG4gICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAoZnVuY3Rpb24ocHJvbWlzZSkge1xuICAgICAgICB2YXIgc2VhbGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBlcnJvciA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdGhlbmFibGUsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgICAgIGlmICh0aGVuYWJsZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGlmIChzZWFsZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcblxuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9LCAnU2V0dGxlOiAnICsgKHByb21pc2UuX2xhYmVsIHx8ICcgdW5rbm93biBwcm9taXNlJykpO1xuXG4gICAgICAgIGlmICghc2VhbGVkICYmIGVycm9yKSB7XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9LCBwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSkge1xuICAgICAgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gICAgICB9IGVsc2UgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHRoZW5hYmxlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpIHtcbiAgICAgIGlmIChtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yID09PSBwcm9taXNlLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHRoZW4gPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKG1heWJlVGhlbmFibGUpO1xuXG4gICAgICAgIGlmICh0aGVuID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvcik7XG4gICAgICAgIH0gZWxzZSBpZiAodGhlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24odGhlbikpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkpO1xuICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJG9iamVjdE9yRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaFJlamVjdGlvbihwcm9taXNlKSB7XG4gICAgICBpZiAocHJvbWlzZS5fb25lcnJvcikge1xuICAgICAgICBwcm9taXNlLl9vbmVycm9yKHByb21pc2UuX3Jlc3VsdCk7XG4gICAgICB9XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSkge1xuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7IHJldHVybjsgfVxuXG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSB2YWx1ZTtcbiAgICAgIHByb21pc2UuX3N0YXRlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gsIHByb21pc2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykgeyByZXR1cm47IH1cbiAgICAgIHByb21pc2UuX3N0YXRlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQ7XG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSByZWFzb247XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2hSZWplY3Rpb24sIHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcGFyZW50Ll9zdWJzY3JpYmVycztcbiAgICAgIHZhciBsZW5ndGggPSBzdWJzY3JpYmVycy5sZW5ndGg7XG5cbiAgICAgIHBhcmVudC5fb25lcnJvciA9IG51bGw7XG5cbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aF0gPSBjaGlsZDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRF0gPSBvbkZ1bGZpbGxtZW50O1xuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoICsgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURURdICA9IG9uUmVqZWN0aW9uO1xuXG4gICAgICBpZiAobGVuZ3RoID09PSAwICYmIHBhcmVudC5fc3RhdGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaCwgcGFyZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoKHByb21pc2UpIHtcbiAgICAgIHZhciBzdWJzY3JpYmVycyA9IHByb21pc2UuX3N1YnNjcmliZXJzO1xuICAgICAgdmFyIHNldHRsZWQgPSBwcm9taXNlLl9zdGF0ZTtcblxuICAgICAgaWYgKHN1YnNjcmliZXJzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuICAgICAgdmFyIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsID0gcHJvbWlzZS5fcmVzdWx0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnNjcmliZXJzLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgIGNoaWxkID0gc3Vic2NyaWJlcnNbaV07XG4gICAgICAgIGNhbGxiYWNrID0gc3Vic2NyaWJlcnNbaSArIHNldHRsZWRdO1xuXG4gICAgICAgIGlmIChjaGlsZCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhkZXRhaWwpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKSB7XG4gICAgICB0aGlzLmVycm9yID0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SID0gbmV3IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCk7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZGV0YWlsKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IuZXJyb3IgPSBlO1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIHByb21pc2UsIGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgICAgIHZhciBoYXNDYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbihjYWxsYmFjayksXG4gICAgICAgICAgdmFsdWUsIGVycm9yLCBzdWNjZWVkZWQsIGZhaWxlZDtcblxuICAgICAgaWYgKGhhc0NhbGxiYWNrKSB7XG4gICAgICAgIHZhbHVlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCk7XG5cbiAgICAgICAgaWYgKHZhbHVlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IpIHtcbiAgICAgICAgICBmYWlsZWQgPSB0cnVlO1xuICAgICAgICAgIGVycm9yID0gdmFsdWUuZXJyb3I7XG4gICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkY2Fubm90UmV0dXJuT3duKCkpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IGRldGFpbDtcbiAgICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAoaGFzQ2FsbGJhY2sgJiYgc3VjY2VlZGVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChmYWlsZWQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHByb21pc2UsIHJlc29sdmVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXNvbHZlcihmdW5jdGlvbiByZXNvbHZlUHJvbWlzZSh2YWx1ZSl7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIHJlamVjdFByb21pc2UocmVhc29uKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvcihDb25zdHJ1Y3RvciwgaW5wdXQpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICAgICAgZW51bWVyYXRvci5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICAgICAgZW51bWVyYXRvci5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoZW51bWVyYXRvci5fdmFsaWRhdGVJbnB1dChpbnB1dCkpIHtcbiAgICAgICAgZW51bWVyYXRvci5faW5wdXQgICAgID0gaW5wdXQ7XG4gICAgICAgIGVudW1lcmF0b3IubGVuZ3RoICAgICA9IGlucHV0Lmxlbmd0aDtcbiAgICAgICAgZW51bWVyYXRvci5fcmVtYWluaW5nID0gaW5wdXQubGVuZ3RoO1xuXG4gICAgICAgIGVudW1lcmF0b3IuX2luaXQoKTtcblxuICAgICAgICBpZiAoZW51bWVyYXRvci5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKGVudW1lcmF0b3IucHJvbWlzZSwgZW51bWVyYXRvci5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbnVtZXJhdG9yLmxlbmd0aCA9IGVudW1lcmF0b3IubGVuZ3RoIHx8IDA7XG4gICAgICAgICAgZW51bWVyYXRvci5fZW51bWVyYXRlKCk7XG4gICAgICAgICAgaWYgKGVudW1lcmF0b3IuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChlbnVtZXJhdG9yLnByb21pc2UsIGVudW1lcmF0b3IuX3Jlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QoZW51bWVyYXRvci5wcm9taXNlLCBlbnVtZXJhdG9yLl92YWxpZGF0aW9uRXJyb3IoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl92YWxpZGF0ZUlucHV0ID0gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoaW5wdXQpO1xuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3ZhbGlkYXRpb25FcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBFcnJvcignQXJyYXkgTWV0aG9kcyBtdXN0IGJlIHByb3ZpZGVkIGFuIEFycmF5Jyk7XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5faW5pdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fcmVzdWx0ID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcbiAgICB9O1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3I7XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VudW1lcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gICAgICB2YXIgbGVuZ3RoICA9IGVudW1lcmF0b3IubGVuZ3RoO1xuICAgICAgdmFyIHByb21pc2UgPSBlbnVtZXJhdG9yLnByb21pc2U7XG4gICAgICB2YXIgaW5wdXQgICA9IGVudW1lcmF0b3IuX2lucHV0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgcHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX2VhY2hFbnRyeShpbnB1dFtpXSwgaSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZWFjaEVudHJ5ID0gZnVuY3Rpb24oZW50cnksIGkpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcbiAgICAgIHZhciBjID0gZW51bWVyYXRvci5faW5zdGFuY2VDb25zdHJ1Y3RvcjtcblxuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNNYXliZVRoZW5hYmxlKGVudHJ5KSkge1xuICAgICAgICBpZiAoZW50cnkuY29uc3RydWN0b3IgPT09IGMgJiYgZW50cnkuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgICAgZW50cnkuX29uZXJyb3IgPSBudWxsO1xuICAgICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVudW1lcmF0b3IuX3dpbGxTZXR0bGVBdChjLnJlc29sdmUoZW50cnkpLCBpKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW51bWVyYXRvci5fcmVtYWluaW5nLS07XG4gICAgICAgIGVudW1lcmF0b3IuX3Jlc3VsdFtpXSA9IGVudHJ5O1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3NldHRsZWRBdCA9IGZ1bmN0aW9uKHN0YXRlLCBpLCB2YWx1ZSkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuICAgICAgdmFyIHByb21pc2UgPSBlbnVtZXJhdG9yLnByb21pc2U7XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICBlbnVtZXJhdG9yLl9yZW1haW5pbmctLTtcblxuICAgICAgICBpZiAoc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbnVtZXJhdG9yLl9yZXN1bHRbaV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZW51bWVyYXRvci5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgZW51bWVyYXRvci5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl93aWxsU2V0dGxlQXQgPSBmdW5jdGlvbihwcm9taXNlLCBpKSB7XG4gICAgICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQsIGksIHZhbHVlKTtcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQsIGksIHJlYXNvbik7XG4gICAgICB9KTtcbiAgICB9O1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkYWxsKGVudHJpZXMpIHtcbiAgICAgIHJldHVybiBuZXcgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJGRlZmF1bHQodGhpcywgZW50cmllcykucHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkYWxsO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJHJhY2UoZW50cmllcykge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoIWxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheShlbnRyaWVzKSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhbiBhcnJheSB0byByYWNlLicpKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIHZhciBsZW5ndGggPSBlbnRyaWVzLmxlbmd0aDtcblxuICAgICAgZnVuY3Rpb24gb25GdWxmaWxsbWVudCh2YWx1ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gb25SZWplY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBpID0gMDsgcHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShDb25zdHJ1Y3Rvci5yZXNvbHZlKGVudHJpZXNbaV0pLCB1bmRlZmluZWQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkcmFjZTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRyZXNvbHZlKG9iamVjdCkge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIGlmIChvYmplY3QgJiYgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0LmNvbnN0cnVjdG9yID09PSBDb25zdHJ1Y3Rvcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgb2JqZWN0KTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJHJlc29sdmU7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRyZWplY3QocmVhc29uKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkcmVqZWN0O1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRjb3VudGVyID0gMDtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc1Jlc29sdmVyKCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhIHJlc29sdmVyIGZ1bmN0aW9uIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgcHJvbWlzZSBjb25zdHJ1Y3RvcicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdQcm9taXNlJzogUGxlYXNlIHVzZSB0aGUgJ25ldycgb3BlcmF0b3IsIHRoaXMgb2JqZWN0IGNvbnN0cnVjdG9yIGNhbm5vdCBiZSBjYWxsZWQgYXMgYSBmdW5jdGlvbi5cIik7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2U7XG4gICAgLyoqXG4gICAgICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gICAgICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICAgICAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGUgcmVhc29uXG4gICAgICB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICAgICAgVGVybWlub2xvZ3lcbiAgICAgIC0tLS0tLS0tLS0tXG5cbiAgICAgIC0gYHByb21pc2VgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB3aXRoIGEgYHRoZW5gIG1ldGhvZCB3aG9zZSBiZWhhdmlvciBjb25mb3JtcyB0byB0aGlzIHNwZWNpZmljYXRpb24uXG4gICAgICAtIGB0aGVuYWJsZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHRoYXQgZGVmaW5lcyBhIGB0aGVuYCBtZXRob2QuXG4gICAgICAtIGB2YWx1ZWAgaXMgYW55IGxlZ2FsIEphdmFTY3JpcHQgdmFsdWUgKGluY2x1ZGluZyB1bmRlZmluZWQsIGEgdGhlbmFibGUsIG9yIGEgcHJvbWlzZSkuXG4gICAgICAtIGBleGNlcHRpb25gIGlzIGEgdmFsdWUgdGhhdCBpcyB0aHJvd24gdXNpbmcgdGhlIHRocm93IHN0YXRlbWVudC5cbiAgICAgIC0gYHJlYXNvbmAgaXMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aHkgYSBwcm9taXNlIHdhcyByZWplY3RlZC5cbiAgICAgIC0gYHNldHRsZWRgIHRoZSBmaW5hbCByZXN0aW5nIHN0YXRlIG9mIGEgcHJvbWlzZSwgZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuXG4gICAgICBBIHByb21pc2UgY2FuIGJlIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXM6IHBlbmRpbmcsIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQuXG5cbiAgICAgIFByb21pc2VzIHRoYXQgYXJlIGZ1bGZpbGxlZCBoYXZlIGEgZnVsZmlsbG1lbnQgdmFsdWUgYW5kIGFyZSBpbiB0aGUgZnVsZmlsbGVkXG4gICAgICBzdGF0ZS4gIFByb21pc2VzIHRoYXQgYXJlIHJlamVjdGVkIGhhdmUgYSByZWplY3Rpb24gcmVhc29uIGFuZCBhcmUgaW4gdGhlXG4gICAgICByZWplY3RlZCBzdGF0ZS4gIEEgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmV2ZXIgYSB0aGVuYWJsZS5cblxuICAgICAgUHJvbWlzZXMgY2FuIGFsc28gYmUgc2FpZCB0byAqcmVzb2x2ZSogYSB2YWx1ZS4gIElmIHRoaXMgdmFsdWUgaXMgYWxzbyBhXG4gICAgICBwcm9taXNlLCB0aGVuIHRoZSBvcmlnaW5hbCBwcm9taXNlJ3Mgc2V0dGxlZCBzdGF0ZSB3aWxsIG1hdGNoIHRoZSB2YWx1ZSdzXG4gICAgICBzZXR0bGVkIHN0YXRlLiAgU28gYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpbGxcbiAgICAgIGl0c2VsZiByZWplY3QsIGFuZCBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIHdpbGxcbiAgICAgIGl0c2VsZiBmdWxmaWxsLlxuXG5cbiAgICAgIEJhc2ljIFVzYWdlOlxuICAgICAgLS0tLS0tLS0tLS0tXG5cbiAgICAgIGBgYGpzXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAvLyBvbiBzdWNjZXNzXG4gICAgICAgIHJlc29sdmUodmFsdWUpO1xuXG4gICAgICAgIC8vIG9uIGZhaWx1cmVcbiAgICAgICAgcmVqZWN0KHJlYXNvbik7XG4gICAgICB9KTtcblxuICAgICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBZHZhbmNlZCBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICBQcm9taXNlcyBzaGluZSB3aGVuIGFic3RyYWN0aW5nIGF3YXkgYXN5bmNocm9ub3VzIGludGVyYWN0aW9ucyBzdWNoIGFzXG4gICAgICBgWE1MSHR0cFJlcXVlc3Rgcy5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGdldEpTT04odXJsKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICAgICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBoYW5kbGVyO1xuICAgICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICAgICAgeGhyLnNlbmQoKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSB0aGlzLkRPTkUpIHtcbiAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHRoaXMucmVzcG9uc2UpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2dldEpTT046IGAnICsgdXJsICsgJ2AgZmFpbGVkIHdpdGggc3RhdHVzOiBbJyArIHRoaXMuc3RhdHVzICsgJ10nKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZ2V0SlNPTignL3Bvc3RzLmpzb24nKS50aGVuKGZ1bmN0aW9uKGpzb24pIHtcbiAgICAgICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAvLyBvbiByZWplY3Rpb25cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFVubGlrZSBjYWxsYmFja3MsIHByb21pc2VzIGFyZSBncmVhdCBjb21wb3NhYmxlIHByaW1pdGl2ZXMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBQcm9taXNlLmFsbChbXG4gICAgICAgIGdldEpTT04oJy9wb3N0cycpLFxuICAgICAgICBnZXRKU09OKCcvY29tbWVudHMnKVxuICAgICAgXSkudGhlbihmdW5jdGlvbih2YWx1ZXMpe1xuICAgICAgICB2YWx1ZXNbMF0gLy8gPT4gcG9zdHNKU09OXG4gICAgICAgIHZhbHVlc1sxXSAvLyA9PiBjb21tZW50c0pTT05cblxuICAgICAgICByZXR1cm4gdmFsdWVzO1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQGNsYXNzIFByb21pc2VcbiAgICAgIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVyXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAY29uc3RydWN0b3JcbiAgICAqL1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKHJlc29sdmVyKSB7XG4gICAgICB0aGlzLl9pZCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRjb3VudGVyKys7XG4gICAgICB0aGlzLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX3Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX3N1YnNjcmliZXJzID0gW107XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wICE9PSByZXNvbHZlcikge1xuICAgICAgICBpZiAoIWxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbihyZXNvbHZlcikpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UodGhpcywgcmVzb2x2ZXIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLmFsbCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yYWNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZXNvbHZlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZWplY3QgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldFNjaGVkdWxlciA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRTY2hlZHVsZXI7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldEFzYXAgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0QXNhcDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fYXNhcCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwO1xuXG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucHJvdG90eXBlID0ge1xuICAgICAgY29uc3RydWN0b3I6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLFxuXG4gICAgLyoqXG4gICAgICBUaGUgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCxcbiAgICAgIHdoaWNoIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlXG4gICAgICByZWFzb24gd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcil7XG4gICAgICAgIC8vIHVzZXIgaXMgYXZhaWxhYmxlXG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyB1c2VyIGlzIHVuYXZhaWxhYmxlLCBhbmQgeW91IGFyZSBnaXZlbiB0aGUgcmVhc29uIHdoeVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQ2hhaW5pbmdcbiAgICAgIC0tLS0tLS0tXG5cbiAgICAgIFRoZSByZXR1cm4gdmFsdWUgb2YgYHRoZW5gIGlzIGl0c2VsZiBhIHByb21pc2UuICBUaGlzIHNlY29uZCwgJ2Rvd25zdHJlYW0nXG4gICAgICBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZmlyc3QgcHJvbWlzZSdzIGZ1bGZpbGxtZW50XG4gICAgICBvciByZWplY3Rpb24gaGFuZGxlciwgb3IgcmVqZWN0ZWQgaWYgdGhlIGhhbmRsZXIgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gdXNlci5uYW1lO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICByZXR1cm4gJ2RlZmF1bHQgbmFtZSc7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh1c2VyTmFtZSkge1xuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHVzZXJOYW1lYCB3aWxsIGJlIHRoZSB1c2VyJ3MgbmFtZSwgb3RoZXJ3aXNlIGl0XG4gICAgICAgIC8vIHdpbGwgYmUgYCdkZWZhdWx0IG5hbWUnYFxuICAgICAgfSk7XG5cbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jyk7XG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBpZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHJlYXNvbmAgd2lsbCBiZSAnRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknLlxuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIHJlamVjdGVkLCBgcmVhc29uYCB3aWxsIGJlICdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jy5cbiAgICAgIH0pO1xuICAgICAgYGBgXG4gICAgICBJZiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIGRvZXMgbm90IHNwZWNpZnkgYSByZWplY3Rpb24gaGFuZGxlciwgcmVqZWN0aW9uIHJlYXNvbnMgd2lsbCBiZSBwcm9wYWdhdGVkIGZ1cnRoZXIgZG93bnN0cmVhbS5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGVkYWdvZ2ljYWxFeGNlcHRpb24oJ1Vwc3RyZWFtIGVycm9yJyk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIFRoZSBgUGVkZ2Fnb2NpYWxFeGNlcHRpb25gIGlzIHByb3BhZ2F0ZWQgYWxsIHRoZSB3YXkgZG93biB0byBoZXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBc3NpbWlsYXRpb25cbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBTb21ldGltZXMgdGhlIHZhbHVlIHlvdSB3YW50IHRvIHByb3BhZ2F0ZSB0byBhIGRvd25zdHJlYW0gcHJvbWlzZSBjYW4gb25seSBiZVxuICAgICAgcmV0cmlldmVkIGFzeW5jaHJvbm91c2x5LiBUaGlzIGNhbiBiZSBhY2hpZXZlZCBieSByZXR1cm5pbmcgYSBwcm9taXNlIGluIHRoZVxuICAgICAgZnVsZmlsbG1lbnQgb3IgcmVqZWN0aW9uIGhhbmRsZXIuIFRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCB0aGVuIGJlIHBlbmRpbmdcbiAgICAgIHVudGlsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlzIHNldHRsZWQuIFRoaXMgaXMgY2FsbGVkICphc3NpbWlsYXRpb24qLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIFRoZSB1c2VyJ3MgY29tbWVudHMgYXJlIG5vdyBhdmFpbGFibGVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIElmIHRoZSBhc3NpbWxpYXRlZCBwcm9taXNlIHJlamVjdHMsIHRoZW4gdGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIGFsc28gcmVqZWN0LlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgZnVsZmlsbHMsIHdlJ2xsIGhhdmUgdGhlIHZhbHVlIGhlcmVcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCByZWplY3RzLCB3ZSdsbCBoYXZlIHRoZSByZWFzb24gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgU2ltcGxlIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIHJlc3VsdDtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzdWx0ID0gZmluZFJlc3VsdCgpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kUmVzdWx0KGZ1bmN0aW9uKHJlc3VsdCwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZFJlc3VsdCgpLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgRXhhbXBsZVxuICAgICAgLS0tLS0tLS0tLS0tLS1cblxuICAgICAgU3luY2hyb25vdXMgRXhhbXBsZVxuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICB2YXIgYXV0aG9yLCBib29rcztcblxuICAgICAgdHJ5IHtcbiAgICAgICAgYXV0aG9yID0gZmluZEF1dGhvcigpO1xuICAgICAgICBib29rcyAgPSBmaW5kQm9va3NCeUF1dGhvcihhdXRob3IpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG5cbiAgICAgIGZ1bmN0aW9uIGZvdW5kQm9va3MoYm9va3MpIHtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBmYWlsdXJlKHJlYXNvbikge1xuXG4gICAgICB9XG5cbiAgICAgIGZpbmRBdXRob3IoZnVuY3Rpb24oYXV0aG9yLCBlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZmluZEJvb29rc0J5QXV0aG9yKGF1dGhvciwgZnVuY3Rpb24oYm9va3MsIGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBmb3VuZEJvb2tzKGJvb2tzKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgZmFpbHVyZShyZWFzb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZEF1dGhvcigpLlxuICAgICAgICB0aGVuKGZpbmRCb29rc0J5QXV0aG9yKS5cbiAgICAgICAgdGhlbihmdW5jdGlvbihib29rcyl7XG4gICAgICAgICAgLy8gZm91bmQgYm9va3NcbiAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAbWV0aG9kIHRoZW5cbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uRnVsZmlsbGVkXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICB0aGVuOiBmdW5jdGlvbihvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgICB2YXIgcGFyZW50ID0gdGhpcztcbiAgICAgICAgdmFyIHN0YXRlID0gcGFyZW50Ll9zdGF0ZTtcblxuICAgICAgICBpZiAoc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCAmJiAhb25GdWxmaWxsbWVudCB8fCBzdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQgJiYgIW9uUmVqZWN0aW9uKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2hpbGQgPSBuZXcgdGhpcy5jb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgICAgdmFyIHJlc3VsdCA9IHBhcmVudC5fcmVzdWx0O1xuXG4gICAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3VtZW50c1tzdGF0ZSAtIDFdO1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCByZXN1bHQpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2hpbGQ7XG4gICAgICB9LFxuXG4gICAgLyoqXG4gICAgICBgY2F0Y2hgIGlzIHNpbXBseSBzdWdhciBmb3IgYHRoZW4odW5kZWZpbmVkLCBvblJlamVjdGlvbilgIHdoaWNoIG1ha2VzIGl0IHRoZSBzYW1lXG4gICAgICBhcyB0aGUgY2F0Y2ggYmxvY2sgb2YgYSB0cnkvY2F0Y2ggc3RhdGVtZW50LlxuXG4gICAgICBgYGBqc1xuICAgICAgZnVuY3Rpb24gZmluZEF1dGhvcigpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkbid0IGZpbmQgdGhhdCBhdXRob3InKTtcbiAgICAgIH1cblxuICAgICAgLy8gc3luY2hyb25vdXNcbiAgICAgIHRyeSB7XG4gICAgICAgIGZpbmRBdXRob3IoKTtcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9XG5cbiAgICAgIC8vIGFzeW5jIHdpdGggcHJvbWlzZXNcbiAgICAgIGZpbmRBdXRob3IoKS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCBjYXRjaFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3Rpb25cbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICAgKi9cbiAgICAgICdjYXRjaCc6IGZ1bmN0aW9uKG9uUmVqZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuICAgIH07XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRwb2x5ZmlsbCgpIHtcbiAgICAgIHZhciBsb2NhbDtcblxuICAgICAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgbG9jYWwgPSBnbG9iYWw7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsID0gc2VsZjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgbG9jYWwgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwb2x5ZmlsbCBmYWlsZWQgYmVjYXVzZSBnbG9iYWwgb2JqZWN0IGlzIHVuYXZhaWxhYmxlIGluIHRoaXMgZW52aXJvbm1lbnQnKTtcbiAgICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBQID0gbG9jYWwuUHJvbWlzZTtcblxuICAgICAgaWYgKFAgJiYgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKFAucmVzb2x2ZSgpKSA9PT0gJ1tvYmplY3QgUHJvbWlzZV0nICYmICFQLmNhc3QpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsb2NhbC5Qcm9taXNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQ7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJHBvbHlmaWxsO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2UgPSB7XG4gICAgICAnUHJvbWlzZSc6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0LFxuICAgICAgJ3BvbHlmaWxsJzogbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0XG4gICAgfTtcblxuICAgIC8qIGdsb2JhbCBkZWZpbmU6dHJ1ZSBtb2R1bGU6dHJ1ZSB3aW5kb3c6IHRydWUgKi9cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmVbJ2FtZCddKSB7XG4gICAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlOyB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZVsnZXhwb3J0cyddKSB7XG4gICAgICBtb2R1bGVbJ2V4cG9ydHMnXSA9IGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRoaXNbJ0VTNlByb21pc2UnXSA9IGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0KCk7XG59KS5jYWxsKHRoaXMpO1xuXG4iLCJcbi8qKlxuICogUmVkdWNlIGBhcnJgIHdpdGggYGZuYC5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge01peGVkfSBpbml0aWFsXG4gKlxuICogVE9ETzogY29tYmF0aWJsZSBlcnJvciBoYW5kbGluZz9cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGFyciwgZm4sIGluaXRpYWwpeyAgXG4gIHZhciBpZHggPSAwO1xuICB2YXIgbGVuID0gYXJyLmxlbmd0aDtcbiAgdmFyIGN1cnIgPSBhcmd1bWVudHMubGVuZ3RoID09IDNcbiAgICA/IGluaXRpYWxcbiAgICA6IGFycltpZHgrK107XG5cbiAgd2hpbGUgKGlkeCA8IGxlbikge1xuICAgIGN1cnIgPSBmbi5jYWxsKG51bGwsIGN1cnIsIGFycltpZHhdLCArK2lkeCwgYXJyKTtcbiAgfVxuICBcbiAgcmV0dXJuIGN1cnI7XG59OyIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgRW1pdHRlciA9IHJlcXVpcmUoJ2VtaXR0ZXInKTtcbnZhciByZWR1Y2UgPSByZXF1aXJlKCdyZWR1Y2UnKTtcbnZhciByZXF1ZXN0QmFzZSA9IHJlcXVpcmUoJy4vcmVxdWVzdC1iYXNlJyk7XG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL2lzLW9iamVjdCcpO1xuXG4vKipcbiAqIFJvb3QgcmVmZXJlbmNlIGZvciBpZnJhbWVzLlxuICovXG5cbnZhciByb290O1xuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7IC8vIEJyb3dzZXIgd2luZG93XG4gIHJvb3QgPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykgeyAvLyBXZWIgV29ya2VyXG4gIHJvb3QgPSBzZWxmO1xufSBlbHNlIHsgLy8gT3RoZXIgZW52aXJvbm1lbnRzXG4gIHJvb3QgPSB0aGlzO1xufVxuXG4vKipcbiAqIE5vb3AuXG4gKi9cblxuZnVuY3Rpb24gbm9vcCgpe307XG5cbi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYSBob3N0IG9iamVjdCxcbiAqIHdlIGRvbid0IHdhbnQgdG8gc2VyaWFsaXplIHRoZXNlIDopXG4gKlxuICogVE9ETzogZnV0dXJlIHByb29mLCBtb3ZlIHRvIGNvbXBvZW50IGxhbmRcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNIb3N0KG9iaikge1xuICB2YXIgc3RyID0ge30udG9TdHJpbmcuY2FsbChvYmopO1xuXG4gIHN3aXRjaCAoc3RyKSB7XG4gICAgY2FzZSAnW29iamVjdCBGaWxlXSc6XG4gICAgY2FzZSAnW29iamVjdCBCbG9iXSc6XG4gICAgY2FzZSAnW29iamVjdCBGb3JtRGF0YV0nOlxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIEV4cG9zZSBgcmVxdWVzdGAuXG4gKi9cblxudmFyIHJlcXVlc3QgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpLmJpbmQobnVsbCwgUmVxdWVzdCk7XG5cbi8qKlxuICogRGV0ZXJtaW5lIFhIUi5cbiAqL1xuXG5yZXF1ZXN0LmdldFhIUiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHJvb3QuWE1MSHR0cFJlcXVlc3RcbiAgICAgICYmICghcm9vdC5sb2NhdGlvbiB8fCAnZmlsZTonICE9IHJvb3QubG9jYXRpb24ucHJvdG9jb2xcbiAgICAgICAgICB8fCAhcm9vdC5BY3RpdmVYT2JqZWN0KSkge1xuICAgIHJldHVybiBuZXcgWE1MSHR0cFJlcXVlc3Q7XG4gIH0gZWxzZSB7XG4gICAgdHJ5IHsgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNaWNyb3NvZnQuWE1MSFRUUCcpOyB9IGNhdGNoKGUpIHt9XG4gICAgdHJ5IHsgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNc3htbDIuWE1MSFRUUC42LjAnKTsgfSBjYXRjaChlKSB7fVxuICAgIHRyeSB7IHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTXN4bWwyLlhNTEhUVFAuMy4wJyk7IH0gY2F0Y2goZSkge31cbiAgICB0cnkgeyByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01zeG1sMi5YTUxIVFRQJyk7IH0gY2F0Y2goZSkge31cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vKipcbiAqIFJlbW92ZXMgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZSwgYWRkZWQgdG8gc3VwcG9ydCBJRS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxudmFyIHRyaW0gPSAnJy50cmltXG4gID8gZnVuY3Rpb24ocykgeyByZXR1cm4gcy50cmltKCk7IH1cbiAgOiBmdW5jdGlvbihzKSB7IHJldHVybiBzLnJlcGxhY2UoLyheXFxzKnxcXHMqJCkvZywgJycpOyB9O1xuXG4vKipcbiAqIFNlcmlhbGl6ZSB0aGUgZ2l2ZW4gYG9iamAuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2VyaWFsaXplKG9iaikge1xuICBpZiAoIWlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gIHZhciBwYWlycyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKG51bGwgIT0gb2JqW2tleV0pIHtcbiAgICAgIHB1c2hFbmNvZGVkS2V5VmFsdWVQYWlyKHBhaXJzLCBrZXksIG9ialtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICByZXR1cm4gcGFpcnMuam9pbignJicpO1xufVxuXG4vKipcbiAqIEhlbHBzICdzZXJpYWxpemUnIHdpdGggc2VyaWFsaXppbmcgYXJyYXlzLlxuICogTXV0YXRlcyB0aGUgcGFpcnMgYXJyYXkuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gcGFpcnNcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAqIEBwYXJhbSB7TWl4ZWR9IHZhbFxuICovXG5cbmZ1bmN0aW9uIHB1c2hFbmNvZGVkS2V5VmFsdWVQYWlyKHBhaXJzLCBrZXksIHZhbCkge1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWwpKSB7XG4gICAgcmV0dXJuIHZhbC5mb3JFYWNoKGZ1bmN0aW9uKHYpIHtcbiAgICAgIHB1c2hFbmNvZGVkS2V5VmFsdWVQYWlyKHBhaXJzLCBrZXksIHYpO1xuICAgIH0pO1xuICB9XG4gIHBhaXJzLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KGtleSlcbiAgICArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudCh2YWwpKTtcbn1cblxuLyoqXG4gKiBFeHBvc2Ugc2VyaWFsaXphdGlvbiBtZXRob2QuXG4gKi9cblxuIHJlcXVlc3Quc2VyaWFsaXplT2JqZWN0ID0gc2VyaWFsaXplO1xuXG4gLyoqXG4gICogUGFyc2UgdGhlIGdpdmVuIHgtd3d3LWZvcm0tdXJsZW5jb2RlZCBgc3RyYC5cbiAgKlxuICAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICogQGFwaSBwcml2YXRlXG4gICovXG5cbmZ1bmN0aW9uIHBhcnNlU3RyaW5nKHN0cikge1xuICB2YXIgb2JqID0ge307XG4gIHZhciBwYWlycyA9IHN0ci5zcGxpdCgnJicpO1xuICB2YXIgcGFydHM7XG4gIHZhciBwYWlyO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBwYWlycy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIHBhaXIgPSBwYWlyc1tpXTtcbiAgICBwYXJ0cyA9IHBhaXIuc3BsaXQoJz0nKTtcbiAgICBvYmpbZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzBdKV0gPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG9iajtcbn1cblxuLyoqXG4gKiBFeHBvc2UgcGFyc2VyLlxuICovXG5cbnJlcXVlc3QucGFyc2VTdHJpbmcgPSBwYXJzZVN0cmluZztcblxuLyoqXG4gKiBEZWZhdWx0IE1JTUUgdHlwZSBtYXAuXG4gKlxuICogICAgIHN1cGVyYWdlbnQudHlwZXMueG1sID0gJ2FwcGxpY2F0aW9uL3htbCc7XG4gKlxuICovXG5cbnJlcXVlc3QudHlwZXMgPSB7XG4gIGh0bWw6ICd0ZXh0L2h0bWwnLFxuICBqc29uOiAnYXBwbGljYXRpb24vanNvbicsXG4gIHhtbDogJ2FwcGxpY2F0aW9uL3htbCcsXG4gIHVybGVuY29kZWQ6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuICAnZm9ybSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuICAnZm9ybS1kYXRhJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcbn07XG5cbi8qKlxuICogRGVmYXVsdCBzZXJpYWxpemF0aW9uIG1hcC5cbiAqXG4gKiAgICAgc3VwZXJhZ2VudC5zZXJpYWxpemVbJ2FwcGxpY2F0aW9uL3htbCddID0gZnVuY3Rpb24ob2JqKXtcbiAqICAgICAgIHJldHVybiAnZ2VuZXJhdGVkIHhtbCBoZXJlJztcbiAqICAgICB9O1xuICpcbiAqL1xuXG4gcmVxdWVzdC5zZXJpYWxpemUgPSB7XG4gICAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJzogc2VyaWFsaXplLFxuICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeVxuIH07XG5cbiAvKipcbiAgKiBEZWZhdWx0IHBhcnNlcnMuXG4gICpcbiAgKiAgICAgc3VwZXJhZ2VudC5wYXJzZVsnYXBwbGljYXRpb24veG1sJ10gPSBmdW5jdGlvbihzdHIpe1xuICAqICAgICAgIHJldHVybiB7IG9iamVjdCBwYXJzZWQgZnJvbSBzdHIgfTtcbiAgKiAgICAgfTtcbiAgKlxuICAqL1xuXG5yZXF1ZXN0LnBhcnNlID0ge1xuICAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJzogcGFyc2VTdHJpbmcsXG4gICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5wYXJzZVxufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gaGVhZGVyIGBzdHJgIGludG9cbiAqIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBtYXBwZWQgZmllbGRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlSGVhZGVyKHN0cikge1xuICB2YXIgbGluZXMgPSBzdHIuc3BsaXQoL1xccj9cXG4vKTtcbiAgdmFyIGZpZWxkcyA9IHt9O1xuICB2YXIgaW5kZXg7XG4gIHZhciBsaW5lO1xuICB2YXIgZmllbGQ7XG4gIHZhciB2YWw7XG5cbiAgbGluZXMucG9wKCk7IC8vIHRyYWlsaW5nIENSTEZcblxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBsaW5lID0gbGluZXNbaV07XG4gICAgaW5kZXggPSBsaW5lLmluZGV4T2YoJzonKTtcbiAgICBmaWVsZCA9IGxpbmUuc2xpY2UoMCwgaW5kZXgpLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFsID0gdHJpbShsaW5lLnNsaWNlKGluZGV4ICsgMSkpO1xuICAgIGZpZWxkc1tmaWVsZF0gPSB2YWw7XG4gIH1cblxuICByZXR1cm4gZmllbGRzO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGBtaW1lYCBpcyBqc29uIG9yIGhhcyAranNvbiBzdHJ1Y3R1cmVkIHN5bnRheCBzdWZmaXguXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1pbWVcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBpc0pTT04obWltZSkge1xuICByZXR1cm4gL1tcXC8rXWpzb25cXGIvLnRlc3QobWltZSk7XG59XG5cbi8qKlxuICogUmV0dXJuIHRoZSBtaW1lIHR5cGUgZm9yIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiB0eXBlKHN0cil7XG4gIHJldHVybiBzdHIuc3BsaXQoLyAqOyAqLykuc2hpZnQoKTtcbn07XG5cbi8qKlxuICogUmV0dXJuIGhlYWRlciBmaWVsZCBwYXJhbWV0ZXJzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcmFtcyhzdHIpe1xuICByZXR1cm4gcmVkdWNlKHN0ci5zcGxpdCgvICo7ICovKSwgZnVuY3Rpb24ob2JqLCBzdHIpe1xuICAgIHZhciBwYXJ0cyA9IHN0ci5zcGxpdCgvICo9ICovKVxuICAgICAgLCBrZXkgPSBwYXJ0cy5zaGlmdCgpXG4gICAgICAsIHZhbCA9IHBhcnRzLnNoaWZ0KCk7XG5cbiAgICBpZiAoa2V5ICYmIHZhbCkgb2JqW2tleV0gPSB2YWw7XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xufTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSZXNwb25zZWAgd2l0aCB0aGUgZ2l2ZW4gYHhocmAuXG4gKlxuICogIC0gc2V0IGZsYWdzICgub2ssIC5lcnJvciwgZXRjKVxuICogIC0gcGFyc2UgaGVhZGVyXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogIEFsaWFzaW5nIGBzdXBlcmFnZW50YCBhcyBgcmVxdWVzdGAgaXMgbmljZTpcbiAqXG4gKiAgICAgIHJlcXVlc3QgPSBzdXBlcmFnZW50O1xuICpcbiAqICBXZSBjYW4gdXNlIHRoZSBwcm9taXNlLWxpa2UgQVBJLCBvciBwYXNzIGNhbGxiYWNrczpcbiAqXG4gKiAgICAgIHJlcXVlc3QuZ2V0KCcvJykuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKiAgICAgIHJlcXVlc3QuZ2V0KCcvJywgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiAgU2VuZGluZyBkYXRhIGNhbiBiZSBjaGFpbmVkOlxuICpcbiAqICAgICAgcmVxdWVzdFxuICogICAgICAgIC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgLnNlbmQoeyBuYW1lOiAndGonIH0pXG4gKiAgICAgICAgLmVuZChmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqICBPciBwYXNzZWQgdG8gYC5zZW5kKClgOlxuICpcbiAqICAgICAgcmVxdWVzdFxuICogICAgICAgIC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgLnNlbmQoeyBuYW1lOiAndGonIH0sIGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogIE9yIHBhc3NlZCB0byBgLnBvc3QoKWA6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJywgeyBuYW1lOiAndGonIH0pXG4gKiAgICAgICAgLmVuZChmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqIE9yIGZ1cnRoZXIgcmVkdWNlZCB0byBhIHNpbmdsZSBjYWxsIGZvciBzaW1wbGUgY2FzZXM6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJywgeyBuYW1lOiAndGonIH0sIGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogQHBhcmFtIHtYTUxIVFRQUmVxdWVzdH0geGhyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gUmVzcG9uc2UocmVxLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB0aGlzLnJlcSA9IHJlcTtcbiAgdGhpcy54aHIgPSB0aGlzLnJlcS54aHI7XG4gIC8vIHJlc3BvbnNlVGV4dCBpcyBhY2Nlc3NpYmxlIG9ubHkgaWYgcmVzcG9uc2VUeXBlIGlzICcnIG9yICd0ZXh0JyBhbmQgb24gb2xkZXIgYnJvd3NlcnNcbiAgdGhpcy50ZXh0ID0gKCh0aGlzLnJlcS5tZXRob2QgIT0nSEVBRCcgJiYgKHRoaXMueGhyLnJlc3BvbnNlVHlwZSA9PT0gJycgfHwgdGhpcy54aHIucmVzcG9uc2VUeXBlID09PSAndGV4dCcpKSB8fCB0eXBlb2YgdGhpcy54aHIucmVzcG9uc2VUeXBlID09PSAndW5kZWZpbmVkJylcbiAgICAgPyB0aGlzLnhoci5yZXNwb25zZVRleHRcbiAgICAgOiBudWxsO1xuICB0aGlzLnN0YXR1c1RleHQgPSB0aGlzLnJlcS54aHIuc3RhdHVzVGV4dDtcbiAgdGhpcy5zZXRTdGF0dXNQcm9wZXJ0aWVzKHRoaXMueGhyLnN0YXR1cyk7XG4gIHRoaXMuaGVhZGVyID0gdGhpcy5oZWFkZXJzID0gcGFyc2VIZWFkZXIodGhpcy54aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpO1xuICAvLyBnZXRBbGxSZXNwb25zZUhlYWRlcnMgc29tZXRpbWVzIGZhbHNlbHkgcmV0dXJucyBcIlwiIGZvciBDT1JTIHJlcXVlc3RzLCBidXRcbiAgLy8gZ2V0UmVzcG9uc2VIZWFkZXIgc3RpbGwgd29ya3MuIHNvIHdlIGdldCBjb250ZW50LXR5cGUgZXZlbiBpZiBnZXR0aW5nXG4gIC8vIG90aGVyIGhlYWRlcnMgZmFpbHMuXG4gIHRoaXMuaGVhZGVyWydjb250ZW50LXR5cGUnXSA9IHRoaXMueGhyLmdldFJlc3BvbnNlSGVhZGVyKCdjb250ZW50LXR5cGUnKTtcbiAgdGhpcy5zZXRIZWFkZXJQcm9wZXJ0aWVzKHRoaXMuaGVhZGVyKTtcbiAgdGhpcy5ib2R5ID0gdGhpcy5yZXEubWV0aG9kICE9ICdIRUFEJ1xuICAgID8gdGhpcy5wYXJzZUJvZHkodGhpcy50ZXh0ID8gdGhpcy50ZXh0IDogdGhpcy54aHIucmVzcG9uc2UpXG4gICAgOiBudWxsO1xufVxuXG4vKipcbiAqIEdldCBjYXNlLWluc2Vuc2l0aXZlIGBmaWVsZGAgdmFsdWUuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbihmaWVsZCl7XG4gIHJldHVybiB0aGlzLmhlYWRlcltmaWVsZC50b0xvd2VyQ2FzZSgpXTtcbn07XG5cbi8qKlxuICogU2V0IGhlYWRlciByZWxhdGVkIHByb3BlcnRpZXM6XG4gKlxuICogICAtIGAudHlwZWAgdGhlIGNvbnRlbnQgdHlwZSB3aXRob3V0IHBhcmFtc1xuICpcbiAqIEEgcmVzcG9uc2Ugb2YgXCJDb250ZW50LVR5cGU6IHRleHQvcGxhaW47IGNoYXJzZXQ9dXRmLThcIlxuICogd2lsbCBwcm92aWRlIHlvdSB3aXRoIGEgYC50eXBlYCBvZiBcInRleHQvcGxhaW5cIi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gaGVhZGVyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUuc2V0SGVhZGVyUHJvcGVydGllcyA9IGZ1bmN0aW9uKGhlYWRlcil7XG4gIC8vIGNvbnRlbnQtdHlwZVxuICB2YXIgY3QgPSB0aGlzLmhlYWRlclsnY29udGVudC10eXBlJ10gfHwgJyc7XG4gIHRoaXMudHlwZSA9IHR5cGUoY3QpO1xuXG4gIC8vIHBhcmFtc1xuICB2YXIgb2JqID0gcGFyYW1zKGN0KTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikgdGhpc1trZXldID0gb2JqW2tleV07XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBib2R5IGBzdHJgLlxuICpcbiAqIFVzZWQgZm9yIGF1dG8tcGFyc2luZyBvZiBib2RpZXMuIFBhcnNlcnNcbiAqIGFyZSBkZWZpbmVkIG9uIHRoZSBgc3VwZXJhZ2VudC5wYXJzZWAgb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVzcG9uc2UucHJvdG90eXBlLnBhcnNlQm9keSA9IGZ1bmN0aW9uKHN0cil7XG4gIHZhciBwYXJzZSA9IHJlcXVlc3QucGFyc2VbdGhpcy50eXBlXTtcbiAgaWYgKCFwYXJzZSAmJiBpc0pTT04odGhpcy50eXBlKSkge1xuICAgIHBhcnNlID0gcmVxdWVzdC5wYXJzZVsnYXBwbGljYXRpb24vanNvbiddO1xuICB9XG4gIHJldHVybiBwYXJzZSAmJiBzdHIgJiYgKHN0ci5sZW5ndGggfHwgc3RyIGluc3RhbmNlb2YgT2JqZWN0KVxuICAgID8gcGFyc2Uoc3RyKVxuICAgIDogbnVsbDtcbn07XG5cbi8qKlxuICogU2V0IGZsYWdzIHN1Y2ggYXMgYC5va2AgYmFzZWQgb24gYHN0YXR1c2AuXG4gKlxuICogRm9yIGV4YW1wbGUgYSAyeHggcmVzcG9uc2Ugd2lsbCBnaXZlIHlvdSBhIGAub2tgIG9mIF9fdHJ1ZV9fXG4gKiB3aGVyZWFzIDV4eCB3aWxsIGJlIF9fZmFsc2VfXyBhbmQgYC5lcnJvcmAgd2lsbCBiZSBfX3RydWVfXy4gVGhlXG4gKiBgLmNsaWVudEVycm9yYCBhbmQgYC5zZXJ2ZXJFcnJvcmAgYXJlIGFsc28gYXZhaWxhYmxlIHRvIGJlIG1vcmVcbiAqIHNwZWNpZmljLCBhbmQgYC5zdGF0dXNUeXBlYCBpcyB0aGUgY2xhc3Mgb2YgZXJyb3IgcmFuZ2luZyBmcm9tIDEuLjVcbiAqIHNvbWV0aW1lcyB1c2VmdWwgZm9yIG1hcHBpbmcgcmVzcG9uZCBjb2xvcnMgZXRjLlxuICpcbiAqIFwic3VnYXJcIiBwcm9wZXJ0aWVzIGFyZSBhbHNvIGRlZmluZWQgZm9yIGNvbW1vbiBjYXNlcy4gQ3VycmVudGx5IHByb3ZpZGluZzpcbiAqXG4gKiAgIC0gLm5vQ29udGVudFxuICogICAtIC5iYWRSZXF1ZXN0XG4gKiAgIC0gLnVuYXV0aG9yaXplZFxuICogICAtIC5ub3RBY2NlcHRhYmxlXG4gKiAgIC0gLm5vdEZvdW5kXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHN0YXR1c1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVzcG9uc2UucHJvdG90eXBlLnNldFN0YXR1c1Byb3BlcnRpZXMgPSBmdW5jdGlvbihzdGF0dXMpe1xuICAvLyBoYW5kbGUgSUU5IGJ1ZzogaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMDA0Njk3Mi9tc2llLXJldHVybnMtc3RhdHVzLWNvZGUtb2YtMTIyMy1mb3ItYWpheC1yZXF1ZXN0XG4gIGlmIChzdGF0dXMgPT09IDEyMjMpIHtcbiAgICBzdGF0dXMgPSAyMDQ7XG4gIH1cblxuICB2YXIgdHlwZSA9IHN0YXR1cyAvIDEwMCB8IDA7XG5cbiAgLy8gc3RhdHVzIC8gY2xhc3NcbiAgdGhpcy5zdGF0dXMgPSB0aGlzLnN0YXR1c0NvZGUgPSBzdGF0dXM7XG4gIHRoaXMuc3RhdHVzVHlwZSA9IHR5cGU7XG5cbiAgLy8gYmFzaWNzXG4gIHRoaXMuaW5mbyA9IDEgPT0gdHlwZTtcbiAgdGhpcy5vayA9IDIgPT0gdHlwZTtcbiAgdGhpcy5jbGllbnRFcnJvciA9IDQgPT0gdHlwZTtcbiAgdGhpcy5zZXJ2ZXJFcnJvciA9IDUgPT0gdHlwZTtcbiAgdGhpcy5lcnJvciA9ICg0ID09IHR5cGUgfHwgNSA9PSB0eXBlKVxuICAgID8gdGhpcy50b0Vycm9yKClcbiAgICA6IGZhbHNlO1xuXG4gIC8vIHN1Z2FyXG4gIHRoaXMuYWNjZXB0ZWQgPSAyMDIgPT0gc3RhdHVzO1xuICB0aGlzLm5vQ29udGVudCA9IDIwNCA9PSBzdGF0dXM7XG4gIHRoaXMuYmFkUmVxdWVzdCA9IDQwMCA9PSBzdGF0dXM7XG4gIHRoaXMudW5hdXRob3JpemVkID0gNDAxID09IHN0YXR1cztcbiAgdGhpcy5ub3RBY2NlcHRhYmxlID0gNDA2ID09IHN0YXR1cztcbiAgdGhpcy5ub3RGb3VuZCA9IDQwNCA9PSBzdGF0dXM7XG4gIHRoaXMuZm9yYmlkZGVuID0gNDAzID09IHN0YXR1cztcbn07XG5cbi8qKlxuICogUmV0dXJuIGFuIGBFcnJvcmAgcmVwcmVzZW50YXRpdmUgb2YgdGhpcyByZXNwb25zZS5cbiAqXG4gKiBAcmV0dXJuIHtFcnJvcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVzcG9uc2UucHJvdG90eXBlLnRvRXJyb3IgPSBmdW5jdGlvbigpe1xuICB2YXIgcmVxID0gdGhpcy5yZXE7XG4gIHZhciBtZXRob2QgPSByZXEubWV0aG9kO1xuICB2YXIgdXJsID0gcmVxLnVybDtcblxuICB2YXIgbXNnID0gJ2Nhbm5vdCAnICsgbWV0aG9kICsgJyAnICsgdXJsICsgJyAoJyArIHRoaXMuc3RhdHVzICsgJyknO1xuICB2YXIgZXJyID0gbmV3IEVycm9yKG1zZyk7XG4gIGVyci5zdGF0dXMgPSB0aGlzLnN0YXR1cztcbiAgZXJyLm1ldGhvZCA9IG1ldGhvZDtcbiAgZXJyLnVybCA9IHVybDtcblxuICByZXR1cm4gZXJyO1xufTtcblxuLyoqXG4gKiBFeHBvc2UgYFJlc3BvbnNlYC5cbiAqL1xuXG5yZXF1ZXN0LlJlc3BvbnNlID0gUmVzcG9uc2U7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgUmVxdWVzdGAgd2l0aCB0aGUgZ2l2ZW4gYG1ldGhvZGAgYW5kIGB1cmxgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXRob2RcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gUmVxdWVzdChtZXRob2QsIHVybCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHRoaXMuX3F1ZXJ5ID0gdGhpcy5fcXVlcnkgfHwgW107XG4gIHRoaXMubWV0aG9kID0gbWV0aG9kO1xuICB0aGlzLnVybCA9IHVybDtcbiAgdGhpcy5oZWFkZXIgPSB7fTsgLy8gcHJlc2VydmVzIGhlYWRlciBuYW1lIGNhc2VcbiAgdGhpcy5faGVhZGVyID0ge307IC8vIGNvZXJjZXMgaGVhZGVyIG5hbWVzIHRvIGxvd2VyY2FzZVxuICB0aGlzLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHZhciBlcnIgPSBudWxsO1xuICAgIHZhciByZXMgPSBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgIHJlcyA9IG5ldyBSZXNwb25zZShzZWxmKTtcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIGVyciA9IG5ldyBFcnJvcignUGFyc2VyIGlzIHVuYWJsZSB0byBwYXJzZSB0aGUgcmVzcG9uc2UnKTtcbiAgICAgIGVyci5wYXJzZSA9IHRydWU7XG4gICAgICBlcnIub3JpZ2luYWwgPSBlO1xuICAgICAgLy8gaXNzdWUgIzY3NTogcmV0dXJuIHRoZSByYXcgcmVzcG9uc2UgaWYgdGhlIHJlc3BvbnNlIHBhcnNpbmcgZmFpbHNcbiAgICAgIGVyci5yYXdSZXNwb25zZSA9IHNlbGYueGhyICYmIHNlbGYueGhyLnJlc3BvbnNlVGV4dCA/IHNlbGYueGhyLnJlc3BvbnNlVGV4dCA6IG51bGw7XG4gICAgICAvLyBpc3N1ZSAjODc2OiByZXR1cm4gdGhlIGh0dHAgc3RhdHVzIGNvZGUgaWYgdGhlIHJlc3BvbnNlIHBhcnNpbmcgZmFpbHNcbiAgICAgIGVyci5zdGF0dXNDb2RlID0gc2VsZi54aHIgJiYgc2VsZi54aHIuc3RhdHVzID8gc2VsZi54aHIuc3RhdHVzIDogbnVsbDtcbiAgICAgIHJldHVybiBzZWxmLmNhbGxiYWNrKGVycik7XG4gICAgfVxuXG4gICAgc2VsZi5lbWl0KCdyZXNwb25zZScsIHJlcyk7XG5cbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gc2VsZi5jYWxsYmFjayhlcnIsIHJlcyk7XG4gICAgfVxuXG4gICAgaWYgKHJlcy5zdGF0dXMgPj0gMjAwICYmIHJlcy5zdGF0dXMgPCAzMDApIHtcbiAgICAgIHJldHVybiBzZWxmLmNhbGxiYWNrKGVyciwgcmVzKTtcbiAgICB9XG5cbiAgICB2YXIgbmV3X2VyciA9IG5ldyBFcnJvcihyZXMuc3RhdHVzVGV4dCB8fCAnVW5zdWNjZXNzZnVsIEhUVFAgcmVzcG9uc2UnKTtcbiAgICBuZXdfZXJyLm9yaWdpbmFsID0gZXJyO1xuICAgIG5ld19lcnIucmVzcG9uc2UgPSByZXM7XG4gICAgbmV3X2Vyci5zdGF0dXMgPSByZXMuc3RhdHVzO1xuXG4gICAgc2VsZi5jYWxsYmFjayhuZXdfZXJyLCByZXMpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBNaXhpbiBgRW1pdHRlcmAgYW5kIGByZXF1ZXN0QmFzZWAuXG4gKi9cblxuRW1pdHRlcihSZXF1ZXN0LnByb3RvdHlwZSk7XG5mb3IgKHZhciBrZXkgaW4gcmVxdWVzdEJhc2UpIHtcbiAgUmVxdWVzdC5wcm90b3R5cGVba2V5XSA9IHJlcXVlc3RCYXNlW2tleV07XG59XG5cbi8qKlxuICogQWJvcnQgdGhlIHJlcXVlc3QsIGFuZCBjbGVhciBwb3RlbnRpYWwgdGltZW91dC5cbiAqXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hYm9ydCA9IGZ1bmN0aW9uKCl7XG4gIGlmICh0aGlzLmFib3J0ZWQpIHJldHVybjtcbiAgdGhpcy5hYm9ydGVkID0gdHJ1ZTtcbiAgdGhpcy54aHIuYWJvcnQoKTtcbiAgdGhpcy5jbGVhclRpbWVvdXQoKTtcbiAgdGhpcy5lbWl0KCdhYm9ydCcpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IENvbnRlbnQtVHlwZSB0byBgdHlwZWAsIG1hcHBpbmcgdmFsdWVzIGZyb20gYHJlcXVlc3QudHlwZXNgLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgc3VwZXJhZ2VudC50eXBlcy54bWwgPSAnYXBwbGljYXRpb24veG1sJztcbiAqXG4gKiAgICAgIHJlcXVlc3QucG9zdCgnLycpXG4gKiAgICAgICAgLnR5cGUoJ3htbCcpXG4gKiAgICAgICAgLnNlbmQoeG1sc3RyaW5nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvJylcbiAqICAgICAgICAudHlwZSgnYXBwbGljYXRpb24veG1sJylcbiAqICAgICAgICAuc2VuZCh4bWxzdHJpbmcpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS50eXBlID0gZnVuY3Rpb24odHlwZSl7XG4gIHRoaXMuc2V0KCdDb250ZW50LVR5cGUnLCByZXF1ZXN0LnR5cGVzW3R5cGVdIHx8IHR5cGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHJlc3BvbnNlVHlwZSB0byBgdmFsYC4gUHJlc2VudGx5IHZhbGlkIHJlc3BvbnNlVHlwZXMgYXJlICdibG9iJyBhbmQgXG4gKiAnYXJyYXlidWZmZXInLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgcmVxLmdldCgnLycpXG4gKiAgICAgICAgLnJlc3BvbnNlVHlwZSgnYmxvYicpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHZhbFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnJlc3BvbnNlVHlwZSA9IGZ1bmN0aW9uKHZhbCl7XG4gIHRoaXMuX3Jlc3BvbnNlVHlwZSA9IHZhbDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBBY2NlcHQgdG8gYHR5cGVgLCBtYXBwaW5nIHZhbHVlcyBmcm9tIGByZXF1ZXN0LnR5cGVzYC5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgIHN1cGVyYWdlbnQudHlwZXMuanNvbiA9ICdhcHBsaWNhdGlvbi9qc29uJztcbiAqXG4gKiAgICAgIHJlcXVlc3QuZ2V0KCcvYWdlbnQnKVxuICogICAgICAgIC5hY2NlcHQoJ2pzb24nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqICAgICAgcmVxdWVzdC5nZXQoJy9hZ2VudCcpXG4gKiAgICAgICAgLmFjY2VwdCgnYXBwbGljYXRpb24vanNvbicpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGFjY2VwdFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmFjY2VwdCA9IGZ1bmN0aW9uKHR5cGUpe1xuICB0aGlzLnNldCgnQWNjZXB0JywgcmVxdWVzdC50eXBlc1t0eXBlXSB8fCB0eXBlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBBdXRob3JpemF0aW9uIGZpZWxkIHZhbHVlIHdpdGggYHVzZXJgIGFuZCBgcGFzc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyB3aXRoICd0eXBlJyBwcm9wZXJ0eSAnYXV0bycgb3IgJ2Jhc2ljJyAoZGVmYXVsdCAnYmFzaWMnKVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbih1c2VyLCBwYXNzLCBvcHRpb25zKXtcbiAgaWYgKCFvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IHtcbiAgICAgIHR5cGU6ICdiYXNpYydcbiAgICB9XG4gIH1cblxuICBzd2l0Y2ggKG9wdGlvbnMudHlwZSkge1xuICAgIGNhc2UgJ2Jhc2ljJzpcbiAgICAgIHZhciBzdHIgPSBidG9hKHVzZXIgKyAnOicgKyBwYXNzKTtcbiAgICAgIHRoaXMuc2V0KCdBdXRob3JpemF0aW9uJywgJ0Jhc2ljICcgKyBzdHIpO1xuICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnYXV0byc6XG4gICAgICB0aGlzLnVzZXJuYW1lID0gdXNlcjtcbiAgICAgIHRoaXMucGFzc3dvcmQgPSBwYXNzO1xuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4qIEFkZCBxdWVyeS1zdHJpbmcgYHZhbGAuXG4qXG4qIEV4YW1wbGVzOlxuKlxuKiAgIHJlcXVlc3QuZ2V0KCcvc2hvZXMnKVxuKiAgICAgLnF1ZXJ5KCdzaXplPTEwJylcbiogICAgIC5xdWVyeSh7IGNvbG9yOiAnYmx1ZScgfSlcbipcbiogQHBhcmFtIHtPYmplY3R8U3RyaW5nfSB2YWxcbiogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4qIEBhcGkgcHVibGljXG4qL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5xdWVyeSA9IGZ1bmN0aW9uKHZhbCl7XG4gIGlmICgnc3RyaW5nJyAhPSB0eXBlb2YgdmFsKSB2YWwgPSBzZXJpYWxpemUodmFsKTtcbiAgaWYgKHZhbCkgdGhpcy5fcXVlcnkucHVzaCh2YWwpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUXVldWUgdGhlIGdpdmVuIGBmaWxlYCBhcyBhbiBhdHRhY2htZW50IHRvIHRoZSBzcGVjaWZpZWQgYGZpZWxkYCxcbiAqIHdpdGggb3B0aW9uYWwgYGZpbGVuYW1lYC5cbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnL3VwbG9hZCcpXG4gKiAgIC5hdHRhY2gobmV3IEJsb2IoWyc8YSBpZD1cImFcIj48YiBpZD1cImJcIj5oZXkhPC9iPjwvYT4nXSwgeyB0eXBlOiBcInRleHQvaHRtbFwifSkpXG4gKiAgIC5lbmQoY2FsbGJhY2spO1xuICogYGBgXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gKiBAcGFyYW0ge0Jsb2J8RmlsZX0gZmlsZVxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVuYW1lXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYXR0YWNoID0gZnVuY3Rpb24oZmllbGQsIGZpbGUsIGZpbGVuYW1lKXtcbiAgdGhpcy5fZ2V0Rm9ybURhdGEoKS5hcHBlbmQoZmllbGQsIGZpbGUsIGZpbGVuYW1lIHx8IGZpbGUubmFtZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuUmVxdWVzdC5wcm90b3R5cGUuX2dldEZvcm1EYXRhID0gZnVuY3Rpb24oKXtcbiAgaWYgKCF0aGlzLl9mb3JtRGF0YSkge1xuICAgIHRoaXMuX2Zvcm1EYXRhID0gbmV3IHJvb3QuRm9ybURhdGEoKTtcbiAgfVxuICByZXR1cm4gdGhpcy5fZm9ybURhdGE7XG59O1xuXG4vKipcbiAqIFNlbmQgYGRhdGFgIGFzIHRoZSByZXF1ZXN0IGJvZHksIGRlZmF1bHRpbmcgdGhlIGAudHlwZSgpYCB0byBcImpzb25cIiB3aGVuXG4gKiBhbiBvYmplY3QgaXMgZ2l2ZW4uXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICAgLy8gbWFudWFsIGpzb25cbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAudHlwZSgnanNvbicpXG4gKiAgICAgICAgIC5zZW5kKCd7XCJuYW1lXCI6XCJ0alwifScpXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gYXV0byBqc29uXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnNlbmQoeyBuYW1lOiAndGonIH0pXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gbWFudWFsIHgtd3d3LWZvcm0tdXJsZW5jb2RlZFxuICogICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgIC50eXBlKCdmb3JtJylcbiAqICAgICAgICAgLnNlbmQoJ25hbWU9dGonKVxuICogICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqICAgICAgIC8vIGF1dG8geC13d3ctZm9ybS11cmxlbmNvZGVkXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnR5cGUoJ2Zvcm0nKVxuICogICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBkZWZhdWx0cyB0byB4LXd3dy1mb3JtLXVybGVuY29kZWRcbiAgKiAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICAqICAgICAgICAuc2VuZCgnbmFtZT10b2JpJylcbiAgKiAgICAgICAgLnNlbmQoJ3NwZWNpZXM9ZmVycmV0JylcbiAgKiAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IGRhdGFcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oZGF0YSl7XG4gIHZhciBvYmogPSBpc09iamVjdChkYXRhKTtcbiAgdmFyIHR5cGUgPSB0aGlzLl9oZWFkZXJbJ2NvbnRlbnQtdHlwZSddO1xuXG4gIC8vIG1lcmdlXG4gIGlmIChvYmogJiYgaXNPYmplY3QodGhpcy5fZGF0YSkpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gZGF0YSkge1xuICAgICAgdGhpcy5fZGF0YVtrZXldID0gZGF0YVtrZXldO1xuICAgIH1cbiAgfSBlbHNlIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgZGF0YSkge1xuICAgIGlmICghdHlwZSkgdGhpcy50eXBlKCdmb3JtJyk7XG4gICAgdHlwZSA9IHRoaXMuX2hlYWRlclsnY29udGVudC10eXBlJ107XG4gICAgaWYgKCdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnID09IHR5cGUpIHtcbiAgICAgIHRoaXMuX2RhdGEgPSB0aGlzLl9kYXRhXG4gICAgICAgID8gdGhpcy5fZGF0YSArICcmJyArIGRhdGFcbiAgICAgICAgOiBkYXRhO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9kYXRhID0gKHRoaXMuX2RhdGEgfHwgJycpICsgZGF0YTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5fZGF0YSA9IGRhdGE7XG4gIH1cblxuICBpZiAoIW9iaiB8fCBpc0hvc3QoZGF0YSkpIHJldHVybiB0aGlzO1xuICBpZiAoIXR5cGUpIHRoaXMudHlwZSgnanNvbicpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQGRlcHJlY2F0ZWRcbiAqL1xuUmVzcG9uc2UucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gc2VyaWFsaXplKGZuKXtcbiAgaWYgKHJvb3QuY29uc29sZSkge1xuICAgIGNvbnNvbGUud2FybihcIkNsaWVudC1zaWRlIHBhcnNlKCkgbWV0aG9kIGhhcyBiZWVuIHJlbmFtZWQgdG8gc2VyaWFsaXplKCkuIFRoaXMgbWV0aG9kIGlzIG5vdCBjb21wYXRpYmxlIHdpdGggc3VwZXJhZ2VudCB2Mi4wXCIpO1xuICB9XG4gIHRoaXMuc2VyaWFsaXplKGZuKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5SZXNwb25zZS5wcm90b3R5cGUuc2VyaWFsaXplID0gZnVuY3Rpb24gc2VyaWFsaXplKGZuKXtcbiAgdGhpcy5fcGFyc2VyID0gZm47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggYGVycmAgYW5kIGByZXNgXG4gKiBhbmQgaGFuZGxlIGFyaXR5IGNoZWNrLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQHBhcmFtIHtSZXNwb25zZX0gcmVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5jYWxsYmFjayA9IGZ1bmN0aW9uKGVyciwgcmVzKXtcbiAgdmFyIGZuID0gdGhpcy5fY2FsbGJhY2s7XG4gIHRoaXMuY2xlYXJUaW1lb3V0KCk7XG4gIGZuKGVyciwgcmVzKTtcbn07XG5cbi8qKlxuICogSW52b2tlIGNhbGxiYWNrIHdpdGggeC1kb21haW4gZXJyb3IuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuY3Jvc3NEb21haW5FcnJvciA9IGZ1bmN0aW9uKCl7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1JlcXVlc3QgaGFzIGJlZW4gdGVybWluYXRlZFxcblBvc3NpYmxlIGNhdXNlczogdGhlIG5ldHdvcmsgaXMgb2ZmbGluZSwgT3JpZ2luIGlzIG5vdCBhbGxvd2VkIGJ5IEFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbiwgdGhlIHBhZ2UgaXMgYmVpbmcgdW5sb2FkZWQsIGV0Yy4nKTtcbiAgZXJyLmNyb3NzRG9tYWluID0gdHJ1ZTtcblxuICBlcnIuc3RhdHVzID0gdGhpcy5zdGF0dXM7XG4gIGVyci5tZXRob2QgPSB0aGlzLm1ldGhvZDtcbiAgZXJyLnVybCA9IHRoaXMudXJsO1xuXG4gIHRoaXMuY2FsbGJhY2soZXJyKTtcbn07XG5cbi8qKlxuICogSW52b2tlIGNhbGxiYWNrIHdpdGggdGltZW91dCBlcnJvci5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS50aW1lb3V0RXJyb3IgPSBmdW5jdGlvbigpe1xuICB2YXIgdGltZW91dCA9IHRoaXMuX3RpbWVvdXQ7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ3RpbWVvdXQgb2YgJyArIHRpbWVvdXQgKyAnbXMgZXhjZWVkZWQnKTtcbiAgZXJyLnRpbWVvdXQgPSB0aW1lb3V0O1xuICB0aGlzLmNhbGxiYWNrKGVycik7XG59O1xuXG4vKipcbiAqIEVuYWJsZSB0cmFuc21pc3Npb24gb2YgY29va2llcyB3aXRoIHgtZG9tYWluIHJlcXVlc3RzLlxuICpcbiAqIE5vdGUgdGhhdCBmb3IgdGhpcyB0byB3b3JrIHRoZSBvcmlnaW4gbXVzdCBub3QgYmVcbiAqIHVzaW5nIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCIgd2l0aCBhIHdpbGRjYXJkLFxuICogYW5kIGFsc28gbXVzdCBzZXQgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFsc1wiXG4gKiB0byBcInRydWVcIi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLndpdGhDcmVkZW50aWFscyA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMuX3dpdGhDcmVkZW50aWFscyA9IHRydWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJbml0aWF0ZSByZXF1ZXN0LCBpbnZva2luZyBjYWxsYmFjayBgZm4ocmVzKWBcbiAqIHdpdGggYW4gaW5zdGFuY2VvZiBgUmVzcG9uc2VgLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oZm4pe1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciB4aHIgPSB0aGlzLnhociA9IHJlcXVlc3QuZ2V0WEhSKCk7XG4gIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5LmpvaW4oJyYnKTtcbiAgdmFyIHRpbWVvdXQgPSB0aGlzLl90aW1lb3V0O1xuICB2YXIgZGF0YSA9IHRoaXMuX2Zvcm1EYXRhIHx8IHRoaXMuX2RhdGE7XG5cbiAgLy8gc3RvcmUgY2FsbGJhY2tcbiAgdGhpcy5fY2FsbGJhY2sgPSBmbiB8fCBub29wO1xuXG4gIC8vIHN0YXRlIGNoYW5nZVxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKXtcbiAgICBpZiAoNCAhPSB4aHIucmVhZHlTdGF0ZSkgcmV0dXJuO1xuXG4gICAgLy8gSW4gSUU5LCByZWFkcyB0byBhbnkgcHJvcGVydHkgKGUuZy4gc3RhdHVzKSBvZmYgb2YgYW4gYWJvcnRlZCBYSFIgd2lsbFxuICAgIC8vIHJlc3VsdCBpbiB0aGUgZXJyb3IgXCJDb3VsZCBub3QgY29tcGxldGUgdGhlIG9wZXJhdGlvbiBkdWUgdG8gZXJyb3IgYzAwYzAyM2ZcIlxuICAgIHZhciBzdGF0dXM7XG4gICAgdHJ5IHsgc3RhdHVzID0geGhyLnN0YXR1cyB9IGNhdGNoKGUpIHsgc3RhdHVzID0gMDsgfVxuXG4gICAgaWYgKDAgPT0gc3RhdHVzKSB7XG4gICAgICBpZiAoc2VsZi50aW1lZG91dCkgcmV0dXJuIHNlbGYudGltZW91dEVycm9yKCk7XG4gICAgICBpZiAoc2VsZi5hYm9ydGVkKSByZXR1cm47XG4gICAgICByZXR1cm4gc2VsZi5jcm9zc0RvbWFpbkVycm9yKCk7XG4gICAgfVxuICAgIHNlbGYuZW1pdCgnZW5kJyk7XG4gIH07XG5cbiAgLy8gcHJvZ3Jlc3NcbiAgdmFyIGhhbmRsZVByb2dyZXNzID0gZnVuY3Rpb24oZSl7XG4gICAgaWYgKGUudG90YWwgPiAwKSB7XG4gICAgICBlLnBlcmNlbnQgPSBlLmxvYWRlZCAvIGUudG90YWwgKiAxMDA7XG4gICAgfVxuICAgIGUuZGlyZWN0aW9uID0gJ2Rvd25sb2FkJztcbiAgICBzZWxmLmVtaXQoJ3Byb2dyZXNzJywgZSk7XG4gIH07XG4gIGlmICh0aGlzLmhhc0xpc3RlbmVycygncHJvZ3Jlc3MnKSkge1xuICAgIHhoci5vbnByb2dyZXNzID0gaGFuZGxlUHJvZ3Jlc3M7XG4gIH1cbiAgdHJ5IHtcbiAgICBpZiAoeGhyLnVwbG9hZCAmJiB0aGlzLmhhc0xpc3RlbmVycygncHJvZ3Jlc3MnKSkge1xuICAgICAgeGhyLnVwbG9hZC5vbnByb2dyZXNzID0gaGFuZGxlUHJvZ3Jlc3M7XG4gICAgfVxuICB9IGNhdGNoKGUpIHtcbiAgICAvLyBBY2Nlc3NpbmcgeGhyLnVwbG9hZCBmYWlscyBpbiBJRSBmcm9tIGEgd2ViIHdvcmtlciwgc28ganVzdCBwcmV0ZW5kIGl0IGRvZXNuJ3QgZXhpc3QuXG4gICAgLy8gUmVwb3J0ZWQgaGVyZTpcbiAgICAvLyBodHRwczovL2Nvbm5lY3QubWljcm9zb2Z0LmNvbS9JRS9mZWVkYmFjay9kZXRhaWxzLzgzNzI0NS94bWxodHRwcmVxdWVzdC11cGxvYWQtdGhyb3dzLWludmFsaWQtYXJndW1lbnQtd2hlbi11c2VkLWZyb20td2ViLXdvcmtlci1jb250ZXh0XG4gIH1cblxuICAvLyB0aW1lb3V0XG4gIGlmICh0aW1lb3V0ICYmICF0aGlzLl90aW1lcikge1xuICAgIHRoaXMuX3RpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgc2VsZi50aW1lZG91dCA9IHRydWU7XG4gICAgICBzZWxmLmFib3J0KCk7XG4gICAgfSwgdGltZW91dCk7XG4gIH1cblxuICAvLyBxdWVyeXN0cmluZ1xuICBpZiAocXVlcnkpIHtcbiAgICBxdWVyeSA9IHJlcXVlc3Quc2VyaWFsaXplT2JqZWN0KHF1ZXJ5KTtcbiAgICB0aGlzLnVybCArPSB+dGhpcy51cmwuaW5kZXhPZignPycpXG4gICAgICA/ICcmJyArIHF1ZXJ5XG4gICAgICA6ICc/JyArIHF1ZXJ5O1xuICB9XG5cbiAgLy8gaW5pdGlhdGUgcmVxdWVzdFxuICBpZiAodGhpcy51c2VybmFtZSAmJiB0aGlzLnBhc3N3b3JkKSB7XG4gICAgeGhyLm9wZW4odGhpcy5tZXRob2QsIHRoaXMudXJsLCB0cnVlLCB0aGlzLnVzZXJuYW1lLCB0aGlzLnBhc3N3b3JkKTtcbiAgfSBlbHNlIHtcbiAgICB4aHIub3Blbih0aGlzLm1ldGhvZCwgdGhpcy51cmwsIHRydWUpO1xuICB9XG5cbiAgLy8gQ09SU1xuICBpZiAodGhpcy5fd2l0aENyZWRlbnRpYWxzKSB4aHIud2l0aENyZWRlbnRpYWxzID0gdHJ1ZTtcblxuICAvLyBib2R5XG4gIGlmICgnR0VUJyAhPSB0aGlzLm1ldGhvZCAmJiAnSEVBRCcgIT0gdGhpcy5tZXRob2QgJiYgJ3N0cmluZycgIT0gdHlwZW9mIGRhdGEgJiYgIWlzSG9zdChkYXRhKSkge1xuICAgIC8vIHNlcmlhbGl6ZSBzdHVmZlxuICAgIHZhciBjb250ZW50VHlwZSA9IHRoaXMuX2hlYWRlclsnY29udGVudC10eXBlJ107XG4gICAgdmFyIHNlcmlhbGl6ZSA9IHRoaXMuX3BhcnNlciB8fCByZXF1ZXN0LnNlcmlhbGl6ZVtjb250ZW50VHlwZSA/IGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF0gOiAnJ107XG4gICAgaWYgKCFzZXJpYWxpemUgJiYgaXNKU09OKGNvbnRlbnRUeXBlKSkgc2VyaWFsaXplID0gcmVxdWVzdC5zZXJpYWxpemVbJ2FwcGxpY2F0aW9uL2pzb24nXTtcbiAgICBpZiAoc2VyaWFsaXplKSBkYXRhID0gc2VyaWFsaXplKGRhdGEpO1xuICB9XG5cbiAgLy8gc2V0IGhlYWRlciBmaWVsZHNcbiAgZm9yICh2YXIgZmllbGQgaW4gdGhpcy5oZWFkZXIpIHtcbiAgICBpZiAobnVsbCA9PSB0aGlzLmhlYWRlcltmaWVsZF0pIGNvbnRpbnVlO1xuICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGZpZWxkLCB0aGlzLmhlYWRlcltmaWVsZF0pO1xuICB9XG5cbiAgaWYgKHRoaXMuX3Jlc3BvbnNlVHlwZSkge1xuICAgIHhoci5yZXNwb25zZVR5cGUgPSB0aGlzLl9yZXNwb25zZVR5cGU7XG4gIH1cblxuICAvLyBzZW5kIHN0dWZmXG4gIHRoaXMuZW1pdCgncmVxdWVzdCcsIHRoaXMpO1xuXG4gIC8vIElFMTEgeGhyLnNlbmQodW5kZWZpbmVkKSBzZW5kcyAndW5kZWZpbmVkJyBzdHJpbmcgYXMgUE9TVCBwYXlsb2FkIChpbnN0ZWFkIG9mIG5vdGhpbmcpXG4gIC8vIFdlIG5lZWQgbnVsbCBoZXJlIGlmIGRhdGEgaXMgdW5kZWZpbmVkXG4gIHhoci5zZW5kKHR5cGVvZiBkYXRhICE9PSAndW5kZWZpbmVkJyA/IGRhdGEgOiBudWxsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogRXhwb3NlIGBSZXF1ZXN0YC5cbiAqL1xuXG5yZXF1ZXN0LlJlcXVlc3QgPSBSZXF1ZXN0O1xuXG4vKipcbiAqIEdFVCBgdXJsYCB3aXRoIG9wdGlvbmFsIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfEZ1bmN0aW9ufSBkYXRhIG9yIGZuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5nZXQgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGZuKXtcbiAgdmFyIHJlcSA9IHJlcXVlc3QoJ0dFVCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnF1ZXJ5KGRhdGEpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcblxuLyoqXG4gKiBIRUFEIGB1cmxgIHdpdGggb3B0aW9uYWwgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR8RnVuY3Rpb259IGRhdGEgb3IgZm5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LmhlYWQgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGZuKXtcbiAgdmFyIHJlcSA9IHJlcXVlc3QoJ0hFQUQnLCB1cmwpO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgZGF0YSkgZm4gPSBkYXRhLCBkYXRhID0gbnVsbDtcbiAgaWYgKGRhdGEpIHJlcS5zZW5kKGRhdGEpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcblxuLyoqXG4gKiBERUxFVEUgYHVybGAgd2l0aCBvcHRpb25hbCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGRlbCh1cmwsIGZuKXtcbiAgdmFyIHJlcSA9IHJlcXVlc3QoJ0RFTEVURScsIHVybCk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG5yZXF1ZXN0WydkZWwnXSA9IGRlbDtcbnJlcXVlc3RbJ2RlbGV0ZSddID0gZGVsO1xuXG4vKipcbiAqIFBBVENIIGB1cmxgIHdpdGggb3B0aW9uYWwgYGRhdGFgIGFuZCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZH0gZGF0YVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QucGF0Y2ggPSBmdW5jdGlvbih1cmwsIGRhdGEsIGZuKXtcbiAgdmFyIHJlcSA9IHJlcXVlc3QoJ1BBVENIJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEuc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG5cbi8qKlxuICogUE9TVCBgdXJsYCB3aXRoIG9wdGlvbmFsIGBkYXRhYCBhbmQgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR9IGRhdGFcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LnBvc3QgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGZuKXtcbiAgdmFyIHJlcSA9IHJlcXVlc3QoJ1BPU1QnLCB1cmwpO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgZGF0YSkgZm4gPSBkYXRhLCBkYXRhID0gbnVsbDtcbiAgaWYgKGRhdGEpIHJlcS5zZW5kKGRhdGEpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcblxuLyoqXG4gKiBQVVQgYHVybGAgd2l0aCBvcHRpb25hbCBgZGF0YWAgYW5kIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfEZ1bmN0aW9ufSBkYXRhIG9yIGZuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5wdXQgPSBmdW5jdGlvbih1cmwsIGRhdGEsIGZuKXtcbiAgdmFyIHJlcSA9IHJlcXVlc3QoJ1BVVCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuIiwiLyoqXG4gKiBDaGVjayBpZiBgb2JqYCBpcyBhbiBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlzT2JqZWN0KG9iaikge1xuICByZXR1cm4gbnVsbCAhPSBvYmogJiYgJ29iamVjdCcgPT0gdHlwZW9mIG9iajtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc09iamVjdDtcbiIsIi8qKlxuICogTW9kdWxlIG9mIG1peGVkLWluIGZ1bmN0aW9ucyBzaGFyZWQgYmV0d2VlbiBub2RlIGFuZCBjbGllbnQgY29kZVxuICovXG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL2lzLW9iamVjdCcpO1xuXG4vKipcbiAqIENsZWFyIHByZXZpb3VzIHRpbWVvdXQuXG4gKlxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuY2xlYXJUaW1lb3V0ID0gZnVuY3Rpb24gX2NsZWFyVGltZW91dCgpe1xuICB0aGlzLl90aW1lb3V0ID0gMDtcbiAgY2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEZvcmNlIGdpdmVuIHBhcnNlclxuICpcbiAqIFNldHMgdGhlIGJvZHkgcGFyc2VyIG5vIG1hdHRlciB0eXBlLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiBwYXJzZShmbil7XG4gIHRoaXMuX3BhcnNlciA9IGZuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHRpbWVvdXQgdG8gYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLnRpbWVvdXQgPSBmdW5jdGlvbiB0aW1lb3V0KG1zKXtcbiAgdGhpcy5fdGltZW91dCA9IG1zO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRmF1eCBwcm9taXNlIHN1cHBvcnRcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdWxmaWxsXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSByZWplY3RcbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKi9cblxuZXhwb3J0cy50aGVuID0gZnVuY3Rpb24gdGhlbihmdWxmaWxsLCByZWplY3QpIHtcbiAgcmV0dXJuIHRoaXMuZW5kKGZ1bmN0aW9uKGVyciwgcmVzKSB7XG4gICAgZXJyID8gcmVqZWN0KGVycikgOiBmdWxmaWxsKHJlcyk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEFsbG93IGZvciBleHRlbnNpb25cbiAqL1xuXG5leHBvcnRzLnVzZSA9IGZ1bmN0aW9uIHVzZShmbikge1xuICBmbih0aGlzKTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cblxuLyoqXG4gKiBHZXQgcmVxdWVzdCBoZWFkZXIgYGZpZWxkYC5cbiAqIENhc2UtaW5zZW5zaXRpdmUuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuZ2V0ID0gZnVuY3Rpb24oZmllbGQpe1xuICByZXR1cm4gdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xufTtcblxuLyoqXG4gKiBHZXQgY2FzZS1pbnNlbnNpdGl2ZSBoZWFkZXIgYGZpZWxkYCB2YWx1ZS5cbiAqIFRoaXMgaXMgYSBkZXByZWNhdGVkIGludGVybmFsIEFQSS4gVXNlIGAuZ2V0KGZpZWxkKWAgaW5zdGVhZC5cbiAqXG4gKiAoZ2V0SGVhZGVyIGlzIG5vIGxvbmdlciB1c2VkIGludGVybmFsbHkgYnkgdGhlIHN1cGVyYWdlbnQgY29kZSBiYXNlKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKiBAZGVwcmVjYXRlZFxuICovXG5cbmV4cG9ydHMuZ2V0SGVhZGVyID0gZXhwb3J0cy5nZXQ7XG5cbi8qKlxuICogU2V0IGhlYWRlciBgZmllbGRgIHRvIGB2YWxgLCBvciBtdWx0aXBsZSBmaWVsZHMgd2l0aCBvbmUgb2JqZWN0LlxuICogQ2FzZS1pbnNlbnNpdGl2ZS5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgIHJlcS5nZXQoJy8nKVxuICogICAgICAgIC5zZXQoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJylcbiAqICAgICAgICAuc2V0KCdYLUFQSS1LZXknLCAnZm9vYmFyJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiAgICAgIHJlcS5nZXQoJy8nKVxuICogICAgICAgIC5zZXQoeyBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJywgJ1gtQVBJLUtleSc6ICdmb29iYXInIH0pXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogQHBhcmFtIHtTdHJpbmd8T2JqZWN0fSBmaWVsZFxuICogQHBhcmFtIHtTdHJpbmd9IHZhbFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuc2V0ID0gZnVuY3Rpb24oZmllbGQsIHZhbCl7XG4gIGlmIChpc09iamVjdChmaWVsZCkpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gZmllbGQpIHtcbiAgICAgIHRoaXMuc2V0KGtleSwgZmllbGRba2V5XSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIHRoaXMuX2hlYWRlcltmaWVsZC50b0xvd2VyQ2FzZSgpXSA9IHZhbDtcbiAgdGhpcy5oZWFkZXJbZmllbGRdID0gdmFsO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlIGhlYWRlciBgZmllbGRgLlxuICogQ2FzZS1pbnNlbnNpdGl2ZS5cbiAqXG4gKiBFeGFtcGxlOlxuICpcbiAqICAgICAgcmVxLmdldCgnLycpXG4gKiAgICAgICAgLnVuc2V0KCdVc2VyLUFnZW50JylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqL1xuZXhwb3J0cy51bnNldCA9IGZ1bmN0aW9uKGZpZWxkKXtcbiAgZGVsZXRlIHRoaXMuX2hlYWRlcltmaWVsZC50b0xvd2VyQ2FzZSgpXTtcbiAgZGVsZXRlIHRoaXMuaGVhZGVyW2ZpZWxkXTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFdyaXRlIHRoZSBmaWVsZCBgbmFtZWAgYW5kIGB2YWxgIGZvciBcIm11bHRpcGFydC9mb3JtLWRhdGFcIlxuICogcmVxdWVzdCBib2RpZXMuXG4gKlxuICogYGBgIGpzXG4gKiByZXF1ZXN0LnBvc3QoJy91cGxvYWQnKVxuICogICAuZmllbGQoJ2ZvbycsICdiYXInKVxuICogICAuZW5kKGNhbGxiYWNrKTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ3xCbG9ifEZpbGV8QnVmZmVyfGZzLlJlYWRTdHJlYW19IHZhbFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5leHBvcnRzLmZpZWxkID0gZnVuY3Rpb24obmFtZSwgdmFsKSB7XG4gIHRoaXMuX2dldEZvcm1EYXRhKCkuYXBwZW5kKG5hbWUsIHZhbCk7XG4gIHJldHVybiB0aGlzO1xufTtcbiIsIi8vIFRoZSBub2RlIGFuZCBicm93c2VyIG1vZHVsZXMgZXhwb3NlIHZlcnNpb25zIG9mIHRoaXMgd2l0aCB0aGVcbi8vIGFwcHJvcHJpYXRlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIGJvdW5kIGFzIGZpcnN0IGFyZ3VtZW50XG4vKipcbiAqIElzc3VlIGEgcmVxdWVzdDpcbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICByZXF1ZXN0KCdHRVQnLCAnL3VzZXJzJykuZW5kKGNhbGxiYWNrKVxuICogICAgcmVxdWVzdCgnL3VzZXJzJykuZW5kKGNhbGxiYWNrKVxuICogICAgcmVxdWVzdCgnL3VzZXJzJywgY2FsbGJhY2spXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd8RnVuY3Rpb259IHVybCBvciBjYWxsYmFja1xuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gcmVxdWVzdChSZXF1ZXN0Q29uc3RydWN0b3IsIG1ldGhvZCwgdXJsKSB7XG4gIC8vIGNhbGxiYWNrXG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiB1cmwpIHtcbiAgICByZXR1cm4gbmV3IFJlcXVlc3RDb25zdHJ1Y3RvcignR0VUJywgbWV0aG9kKS5lbmQodXJsKTtcbiAgfVxuXG4gIC8vIHVybCBmaXJzdFxuICBpZiAoMiA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIG5ldyBSZXF1ZXN0Q29uc3RydWN0b3IoJ0dFVCcsIG1ldGhvZCk7XG4gIH1cblxuICByZXR1cm4gbmV3IFJlcXVlc3RDb25zdHJ1Y3RvcihtZXRob2QsIHVybCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWVzdDtcbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG5cbiAgdmFyIElvbmljQW5ndWxhckFuYWx5dGljcyA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuYW5hbHl0aWNzJywgWydpb25pYyddKVxuXG4gIC52YWx1ZSgnSU9OSUNfQU5BTFlUSUNTX1ZFUlNJT04nLCBJb25pYy5BbmFseXRpY3MudmVyc2lvbilcblxuICAuZmFjdG9yeSgnJGlvbmljQW5hbHl0aWNzJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyQW5hbHl0aWNzKSB7XG4gICAgICBJb25pY0FuZ3VsYXJBbmFseXRpY3MgPSBuZXcgSW9uaWMuQW5hbHl0aWNzKFwiREVGRVJfUkVHSVNURVJcIik7XG4gICAgfVxuICAgIHJldHVybiBJb25pY0FuZ3VsYXJBbmFseXRpY3M7XG4gIH1dKVxuXG4gIC5mYWN0b3J5KCdkb21TZXJpYWxpemVyJywgW2Z1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW9uaWMuQW5hbHl0aWNTZXJpYWxpemVycy5ET01TZXJpYWxpemVyKCk7XG4gIH1dKVxuXG4gIC5ydW4oWyckaW9uaWNBbmFseXRpY3MnLCAnJHN0YXRlJywgZnVuY3Rpb24oJGlvbmljQW5hbHl0aWNzLCAkc3RhdGUpIHtcbiAgICAkaW9uaWNBbmFseXRpY3Muc2V0R2xvYmFsUHJvcGVydGllcyhmdW5jdGlvbihldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSkge1xuICAgICAgaWYgKCFldmVudERhdGEuX3VpKSB7XG4gICAgICAgIGV2ZW50RGF0YS5fdWkgPSB7fTtcbiAgICAgIH1cbiAgICAgIGV2ZW50RGF0YS5fdWkuYWN0aXZlX3N0YXRlID0gJHN0YXRlLmN1cnJlbnQubmFtZTsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgIH0pO1xuICB9XSk7XG5cblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5hbmFseXRpY3MnKVxuXG4gIC5wcm92aWRlcignJGlvbmljQXV0b1RyYWNrJyxbZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgdHJhY2tlcnNEaXNhYmxlZCA9IHt9LFxuICAgICAgYWxsVHJhY2tlcnNEaXNhYmxlZCA9IGZhbHNlO1xuXG4gICAgdGhpcy5kaXNhYmxlVHJhY2tpbmcgPSBmdW5jdGlvbih0cmFja2VyKSB7XG4gICAgICBpZiAodHJhY2tlcikge1xuICAgICAgICB0cmFja2Vyc0Rpc2FibGVkW3RyYWNrZXJdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFsbFRyYWNrZXJzRGlzYWJsZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLiRnZXQgPSBbZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBcImlzRW5hYmxlZFwiOiBmdW5jdGlvbih0cmFja2VyKSB7XG4gICAgICAgICAgcmV0dXJuICFhbGxUcmFja2Vyc0Rpc2FibGVkICYmICF0cmFja2Vyc0Rpc2FibGVkW3RyYWNrZXJdO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XSlcblxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIEF1dG8gdHJhY2tlcnNcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXG4gIC5ydW4oWyckaW9uaWNBdXRvVHJhY2snLCAnJGlvbmljQW5hbHl0aWNzJywgZnVuY3Rpb24oJGlvbmljQXV0b1RyYWNrLCAkaW9uaWNBbmFseXRpY3MpIHtcbiAgICBpZiAoISRpb25pY0F1dG9UcmFjay5pc0VuYWJsZWQoJ0xvYWQnKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAkaW9uaWNBbmFseXRpY3MudHJhY2soJ0xvYWQnKTtcbiAgfV0pXG5cbiAgLnJ1bihbXG4gICAgJyRpb25pY0F1dG9UcmFjaycsXG4gICAgJyRkb2N1bWVudCcsXG4gICAgJyRpb25pY0FuYWx5dGljcycsXG4gICAgJ2RvbVNlcmlhbGl6ZXInLFxuICAgIGZ1bmN0aW9uKCRpb25pY0F1dG9UcmFjaywgJGRvY3VtZW50LCAkaW9uaWNBbmFseXRpY3MsIGRvbVNlcmlhbGl6ZXIpIHtcbiAgICAgIGlmICghJGlvbmljQXV0b1RyYWNrLmlzRW5hYmxlZCgnVGFwJykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAkZG9jdW1lbnQub24oJ2NsaWNrJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgLy8gd2FudCBjb29yZGluYXRlcyBhcyBhIHBlcmNlbnRhZ2UgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBlbGVtZW50XG4gICAgICAgIHZhciBib3ggPSBldmVudC50YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksXG4gICAgICAgICAgd2lkdGggPSBib3gucmlnaHQgLSBib3gubGVmdCxcbiAgICAgICAgICBoZWlnaHQgPSBib3guYm90dG9tIC0gYm94LnRvcCxcbiAgICAgICAgICBub3JtWCA9IChldmVudC5wYWdlWCAtIGJveC5sZWZ0KSAvIHdpZHRoLFxuICAgICAgICAgIG5vcm1ZID0gKGV2ZW50LnBhZ2VZIC0gYm94LnRvcCkgLyBoZWlnaHQ7XG5cbiAgICAgICAgdmFyIGV2ZW50RGF0YSA9IHtcbiAgICAgICAgICBcImNvb3JkaW5hdGVzXCI6IHtcbiAgICAgICAgICAgIFwieFwiOiBldmVudC5wYWdlWCxcbiAgICAgICAgICAgIFwieVwiOiBldmVudC5wYWdlWVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ0YXJnZXRcIjogZG9tU2VyaWFsaXplci5lbGVtZW50U2VsZWN0b3IoZXZlbnQudGFyZ2V0KSxcbiAgICAgICAgICBcInRhcmdldF9pZGVudGlmaWVyXCI6IGRvbVNlcmlhbGl6ZXIuZWxlbWVudE5hbWUoZXZlbnQudGFyZ2V0KVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpc0Zpbml0ZShub3JtWCkgJiYgaXNGaW5pdGUobm9ybVkpKSB7XG4gICAgICAgICAgZXZlbnREYXRhLmNvb3JkaW5hdGVzLnhfbm9ybSA9IG5vcm1YOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgICAgICAgZXZlbnREYXRhLmNvb3JkaW5hdGVzLnlfbm9ybSA9IG5vcm1ZOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgICAgIH1cblxuICAgICAgICAkaW9uaWNBbmFseXRpY3MudHJhY2soJ1RhcCcsIHtcbiAgICAgICAgICBcIl91aVwiOiBldmVudERhdGFcbiAgICAgICAgfSk7XG5cbiAgICAgIH0pO1xuICAgIH1cbiAgXSlcblxuICAucnVuKFtcbiAgICAnJGlvbmljQXV0b1RyYWNrJyxcbiAgICAnJGlvbmljQW5hbHl0aWNzJyxcbiAgICAnJHJvb3RTY29wZScsXG4gICAgZnVuY3Rpb24oJGlvbmljQXV0b1RyYWNrLCAkaW9uaWNBbmFseXRpY3MsICRyb290U2NvcGUpIHtcbiAgICAgIGlmICghJGlvbmljQXV0b1RyYWNrLmlzRW5hYmxlZCgnU3RhdGUgQ2hhbmdlJykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3VjY2VzcycsIGZ1bmN0aW9uKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlLCBmcm9tUGFyYW1zKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKCdTdGF0ZSBDaGFuZ2UnLCB7XG4gICAgICAgICAgXCJmcm9tXCI6IGZyb21TdGF0ZS5uYW1lLFxuICAgICAgICAgIFwidG9cIjogdG9TdGF0ZS5uYW1lXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICBdKVxuXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vIGlvbi10cmFjay0kRVZFTlRcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAvKipcbiAgICogQG5nZG9jIGRpcmVjdGl2ZVxuICAgKiBAbmFtZSBpb25UcmFja0NsaWNrXG4gICAqIEBtb2R1bGUgaW9uaWMuc2VydmljZS5hbmFseXRpY3NcbiAgICogQHJlc3RyaWN0IEFcbiAgICogQHBhcmVudCBpb25pYy5kaXJlY3RpdmU6aW9uVHJhY2tDbGlja1xuICAgKlxuICAgKiBAZGVzY3JpcHRpb25cbiAgICpcbiAgICogQSBjb252ZW5pZW50IGRpcmVjdGl2ZSB0byBhdXRvbWF0aWNhbGx5IHRyYWNrIGEgY2xpY2svdGFwIG9uIGEgYnV0dG9uXG4gICAqIG9yIG90aGVyIHRhcHBhYmxlIGVsZW1lbnQuXG4gICAqXG4gICAqIEB1c2FnZVxuICAgKiBgYGBodG1sXG4gICAqIDxidXR0b24gY2xhc3M9XCJidXR0b24gYnV0dG9uLWNsZWFyXCIgaW9uLXRyYWNrLWNsaWNrIGlvbi10cmFjay1ldmVudD1cImN0YS10YXBcIj5Ucnkgbm93ITwvYnV0dG9uPlxuICAgKiBgYGBcbiAgICovXG5cbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tDbGljaycsIGlvblRyYWNrRGlyZWN0aXZlKCdjbGljaycpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1RhcCcsIGlvblRyYWNrRGlyZWN0aXZlKCd0YXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEb3VibGV0YXAnLCBpb25UcmFja0RpcmVjdGl2ZSgnZG91YmxldGFwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrSG9sZCcsIGlvblRyYWNrRGlyZWN0aXZlKCdob2xkJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUmVsZWFzZScsIGlvblRyYWNrRGlyZWN0aXZlKCdyZWxlYXNlJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZycsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFnJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZ0xlZnQnLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZ2xlZnQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnUmlnaHQnLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZ3JpZ2h0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZ1VwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWd1cCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdEb3duJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWdkb3duJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrU3dpcGVMZWZ0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBlbGVmdCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1N3aXBlUmlnaHQnLCBpb25UcmFja0RpcmVjdGl2ZSgnc3dpcGVyaWdodCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1N3aXBlVXAnLCBpb25UcmFja0RpcmVjdGl2ZSgnc3dpcGV1cCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1N3aXBlRG93bicsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZWRvd24nKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tUcmFuc2Zvcm0nLCBpb25UcmFja0RpcmVjdGl2ZSgnaG9sZCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1BpbmNoJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3BpbmNoJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUGluY2hJbicsIGlvblRyYWNrRGlyZWN0aXZlKCdwaW5jaGluJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUGluY2hPdXQnLCBpb25UcmFja0RpcmVjdGl2ZSgncGluY2hvdXQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tSb3RhdGUnLCBpb25UcmFja0RpcmVjdGl2ZSgncm90YXRlJykpO1xuXG4gIC8qKlxuICAgKiBHZW5lcmljIGRpcmVjdGl2ZSB0byBjcmVhdGUgYXV0byBldmVudCBoYW5kbGluZyBhbmFseXRpY3MgZGlyZWN0aXZlcyBsaWtlOlxuICAgKlxuICAgKiA8YnV0dG9uIGlvbi10cmFjay1jbGljaz1cImV2ZW50TmFtZVwiPkNsaWNrIFRyYWNrPC9idXR0b24+XG4gICAqIDxidXR0b24gaW9uLXRyYWNrLWhvbGQ9XCJldmVudE5hbWVcIj5Ib2xkIFRyYWNrPC9idXR0b24+XG4gICAqIDxidXR0b24gaW9uLXRyYWNrLXRhcD1cImV2ZW50TmFtZVwiPlRhcCBUcmFjazwvYnV0dG9uPlxuICAgKiA8YnV0dG9uIGlvbi10cmFjay1kb3VibGV0YXA9XCJldmVudE5hbWVcIj5Eb3VibGUgVGFwIFRyYWNrPC9idXR0b24+XG4gICAqXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBkb21FdmVudE5hbWUgVGhlIERPTSBldmVudCBuYW1lXG4gICAqIEByZXR1cm4ge2FycmF5fSBBbmd1bGFyIERpcmVjdGl2ZSBkZWNsYXJhdGlvblxuICAgKi9cbiAgZnVuY3Rpb24gaW9uVHJhY2tEaXJlY3RpdmUoZG9tRXZlbnROYW1lKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICByZXR1cm4gWyckaW9uaWNBbmFseXRpY3MnLCAnJGlvbmljR2VzdHVyZScsIGZ1bmN0aW9uKCRpb25pY0FuYWx5dGljcywgJGlvbmljR2VzdHVyZSkge1xuXG4gICAgICB2YXIgZ2VzdHVyZURyaXZlbiA9IFtcbiAgICAgICAgJ2RyYWcnLCAnZHJhZ3N0YXJ0JywgJ2RyYWdlbmQnLCAnZHJhZ2xlZnQnLCAnZHJhZ3JpZ2h0JywgJ2RyYWd1cCcsICdkcmFnZG93bicsXG4gICAgICAgICdzd2lwZScsICdzd2lwZWxlZnQnLCAnc3dpcGVyaWdodCcsICdzd2lwZXVwJywgJ3N3aXBlZG93bicsXG4gICAgICAgICd0YXAnLCAnZG91YmxldGFwJywgJ2hvbGQnLFxuICAgICAgICAndHJhbnNmb3JtJywgJ3BpbmNoJywgJ3BpbmNoaW4nLCAncGluY2hvdXQnLCAncm90YXRlJ1xuICAgICAgXTtcbiAgICAgIC8vIENoZWNrIGlmIHdlIG5lZWQgdG8gdXNlIHRoZSBnZXN0dXJlIHN1YnN5c3RlbSBvciB0aGUgRE9NIHN5c3RlbVxuICAgICAgdmFyIGlzR2VzdHVyZURyaXZlbiA9IGZhbHNlO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZXN0dXJlRHJpdmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChnZXN0dXJlRHJpdmVuW2ldID09PSBkb21FdmVudE5hbWUudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgIGlzR2VzdHVyZURyaXZlbiA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIFwicmVzdHJpY3RcIjogJ0EnLFxuICAgICAgICBcImxpbmtcIjogZnVuY3Rpb24oJHNjb3BlLCAkZWxlbWVudCwgJGF0dHIpIHtcbiAgICAgICAgICB2YXIgY2FwaXRhbGl6ZWQgPSBkb21FdmVudE5hbWVbMF0udG9VcHBlckNhc2UoKSArIGRvbUV2ZW50TmFtZS5zbGljZSgxKTtcbiAgICAgICAgICAvLyBHcmFiIGV2ZW50IG5hbWUgd2Ugd2lsbCBzZW5kXG4gICAgICAgICAgdmFyIGV2ZW50TmFtZSA9ICRhdHRyWydpb25UcmFjaycgKyBjYXBpdGFsaXplZF07XG5cbiAgICAgICAgICBpZiAoaXNHZXN0dXJlRHJpdmVuKSB7XG4gICAgICAgICAgICB2YXIgZ2VzdHVyZSA9ICRpb25pY0dlc3R1cmUub24oZG9tRXZlbnROYW1lLCBoYW5kbGVyLCAkZWxlbWVudCk7XG4gICAgICAgICAgICAkc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAkaW9uaWNHZXN0dXJlLm9mZihnZXN0dXJlLCBkb21FdmVudE5hbWUsIGhhbmRsZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICRlbGVtZW50Lm9uKGRvbUV2ZW50TmFtZSwgaGFuZGxlcik7XG4gICAgICAgICAgICAkc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAkZWxlbWVudC5vZmYoZG9tRXZlbnROYW1lLCBoYW5kbGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuXG4gICAgICAgICAgZnVuY3Rpb24gaGFuZGxlcihlKSB7XG4gICAgICAgICAgICB2YXIgZXZlbnREYXRhID0gJHNjb3BlLiRldmFsKCRhdHRyLmlvblRyYWNrRGF0YSkgfHwge307XG4gICAgICAgICAgICBpZiAoZXZlbnROYW1lKSB7XG4gICAgICAgICAgICAgICRpb25pY0FuYWx5dGljcy50cmFjayhldmVudE5hbWUsIGV2ZW50RGF0YSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAkaW9uaWNBbmFseXRpY3MudHJhY2tDbGljayhlLnBhZ2VYLCBlLnBhZ2VZLCBlLnRhcmdldCwge1xuICAgICAgICAgICAgICAgIFwiZGF0YVwiOiBldmVudERhdGFcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1dO1xuICB9XG5cbn1cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG5cbiAgdmFyIElvbmljQW5ndWxhckF1dGggPSBudWxsO1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmF1dGgnLCBbXSlcblxuICAuZmFjdG9yeSgnJGlvbmljQXV0aCcsIFtmdW5jdGlvbigpIHtcbiAgICBpZiAoIUlvbmljQW5ndWxhckF1dGgpIHtcbiAgICAgIElvbmljQW5ndWxhckF1dGggPSBJb25pYy5BdXRoO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyQXV0aDtcbiAgfV0pO1xufVxuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuY29yZScsIFtdKVxuXG4gIC8qKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBQcm92aWRlcyBhIHNhZmUgaW50ZXJmYWNlIHRvIHN0b3JlIG9iamVjdHMgaW4gcGVyc2lzdGVudCBtZW1vcnlcbiAgICovXG4gIC5wcm92aWRlcigncGVyc2lzdGVudFN0b3JhZ2UnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgJyRnZXQnOiBbZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gSW9uaWMuZ2V0U2VydmljZSgnU3RvcmFnZScpO1xuICAgICAgICBpZiAoIXN0b3JhZ2UpIHtcbiAgICAgICAgICBzdG9yYWdlID0gbmV3IElvbmljLklPLlN0b3JhZ2UoKTtcbiAgICAgICAgICBJb25pYy5hZGRTZXJ2aWNlKCdTdG9yYWdlJywgc3RvcmFnZSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0b3JhZ2U7XG4gICAgICB9XVxuICAgIH07XG4gIH0pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0NvcmVTZXR0aW5ncycsIFtcbiAgICBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBJb25pYy5JTy5Db25maWc7XG4gICAgfVxuICBdKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNVc2VyJywgW1xuICAgIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIElvbmljLlVzZXI7XG4gICAgfVxuICBdKVxuXG4gIC5ydW4oW2Z1bmN0aW9uKCkge1xuICAgIElvbmljLmlvKCk7XG4gIH1dKTtcbn1cblxuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyRGVwbG95ID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5kZXBsb3knLCBbXSlcblxuICAuZmFjdG9yeSgnJGlvbmljRGVwbG95JywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyRGVwbG95KSB7XG4gICAgICBJb25pY0FuZ3VsYXJEZXBsb3kgPSBuZXcgSW9uaWMuRGVwbG95KCk7XG4gICAgfVxuICAgIHJldHVybiBJb25pY0FuZ3VsYXJEZXBsb3k7XG4gIH1dKTtcbn1cbiIsImltcG9ydCB7IEFwcCB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvYXBwXCI7XG5pbXBvcnQgeyBJb25pY1BsYXRmb3JtIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9jb3JlXCI7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2V2ZW50c1wiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9sb2dnZXJcIjtcbmltcG9ydCB7IFByb21pc2UsIERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvcHJvbWlzZVwiO1xuaW1wb3J0IHsgUmVxdWVzdCwgUmVzcG9uc2UsIEFQSVJlcXVlc3QsIEFQSVJlc3BvbnNlIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9yZXF1ZXN0XCI7XG5pbXBvcnQgeyBDb25maWcgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2NvbmZpZ1wiO1xuaW1wb3J0IHsgU3RvcmFnZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvc3RvcmFnZVwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvdXNlclwiO1xuaW1wb3J0IHsgRGF0YVR5cGUgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2RhdGEtdHlwZXNcIjtcbmltcG9ydCB7IEFuYWx5dGljcyB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2FuYWx5dGljcy9hbmFseXRpY3NcIjtcbmltcG9ydCB7IEJ1Y2tldFN0b3JhZ2UgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9hbmFseXRpY3Mvc3RvcmFnZVwiO1xuaW1wb3J0IHsgRE9NU2VyaWFsaXplciB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2FuYWx5dGljcy9zZXJpYWxpemVyc1wiO1xuaW1wb3J0IHsgQXV0aCB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2F1dGgvYXV0aFwiO1xuaW1wb3J0IHsgRGVwbG95IH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvZGVwbG95L2RlcGxveVwiO1xuaW1wb3J0IHsgUHVzaCB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L3B1c2gvcHVzaFwiO1xuaW1wb3J0IHsgUHVzaFRva2VuIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvcHVzaC9wdXNoLXRva2VuXCI7XG5pbXBvcnQgeyBQdXNoTWVzc2FnZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L3B1c2gvcHVzaC1tZXNzYWdlXCI7XG5cbi8vIERlY2xhcmUgdGhlIHdpbmRvdyBvYmplY3RcbndpbmRvdy5Jb25pYyA9IHdpbmRvdy5Jb25pYyB8fCB7fTtcblxuLy8gSW9uaWMgTW9kdWxlc1xuSW9uaWMuQ29yZSA9IElvbmljUGxhdGZvcm07XG5Jb25pYy5Vc2VyID0gVXNlcjtcbklvbmljLkFuYWx5dGljcyA9IEFuYWx5dGljcztcbklvbmljLkF1dGggPSBBdXRoO1xuSW9uaWMuRGVwbG95ID0gRGVwbG95O1xuSW9uaWMuUHVzaCA9IFB1c2g7XG5Jb25pYy5QdXNoVG9rZW4gPSBQdXNoVG9rZW47XG5Jb25pYy5QdXNoTWVzc2FnZSA9IFB1c2hNZXNzYWdlO1xuXG4vLyBEYXRhVHlwZSBOYW1lc3BhY2VcbklvbmljLkRhdGFUeXBlID0gRGF0YVR5cGU7XG5Jb25pYy5EYXRhVHlwZXMgPSBEYXRhVHlwZS5nZXRNYXBwaW5nKCk7XG5cbi8vIElPIE5hbWVzcGFjZVxuSW9uaWMuSU8gPSB7fTtcbklvbmljLklPLkFwcCA9IEFwcDtcbklvbmljLklPLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcbklvbmljLklPLkxvZ2dlciA9IExvZ2dlcjtcbklvbmljLklPLlByb21pc2UgPSBQcm9taXNlO1xuSW9uaWMuSU8uRGVmZXJyZWRQcm9taXNlID0gRGVmZXJyZWRQcm9taXNlO1xuSW9uaWMuSU8uUmVxdWVzdCA9IFJlcXVlc3Q7XG5Jb25pYy5JTy5SZXNwb25zZSA9IFJlc3BvbnNlO1xuSW9uaWMuSU8uQVBJUmVxdWVzdCA9IEFQSVJlcXVlc3Q7XG5Jb25pYy5JTy5BUElSZXNwb25zZSA9IEFQSVJlc3BvbnNlO1xuSW9uaWMuSU8uU3RvcmFnZSA9IFN0b3JhZ2U7XG5Jb25pYy5JTy5Db25maWcgPSBDb25maWc7XG5cbi8vIEFuYWx5dGljIFN0b3JhZ2UgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1N0b3JhZ2UgPSB7fTtcbklvbmljLkFuYWx5dGljU3RvcmFnZS5CdWNrZXRTdG9yYWdlID0gQnVja2V0U3RvcmFnZTtcblxuLy8gQW5hbHl0aWMgU2VyaWFsaXplcnMgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzID0ge307XG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzLkRPTVNlcmlhbGl6ZXIgPSBET01TZXJpYWxpemVyO1xuXG5cbi8vIFByb3ZpZGVyIGEgc2luZ2xlIHN0b3JhZ2UgZm9yIHNlcnZpY2VzIHRoYXQgaGF2ZSBwcmV2aW91c2x5IGJlZW4gcmVnaXN0ZXJlZFxudmFyIHNlcnZpY2VTdG9yYWdlID0ge307XG5cbklvbmljLmlvID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBJb25pYy5Db3JlO1xufTtcblxuSW9uaWMuZ2V0U2VydmljZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgaWYgKHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9PT0gJ3VuZGVmaW5lZCcgfHwgIXNlcnZpY2VTdG9yYWdlW25hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBzZXJ2aWNlU3RvcmFnZVtuYW1lXTtcbn07XG5cbklvbmljLmFkZFNlcnZpY2UgPSBmdW5jdGlvbihuYW1lLCBzZXJ2aWNlLCBmb3JjZSkge1xuICBpZiAoc2VydmljZSAmJiB0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgc2VydmljZVN0b3JhZ2VbbmFtZV0gPSBzZXJ2aWNlO1xuICB9IGVsc2UgaWYgKHNlcnZpY2UgJiYgZm9yY2UpIHtcbiAgICBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9IHNlcnZpY2U7XG4gIH1cbn07XG5cbklvbmljLnJlbW92ZVNlcnZpY2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGlmICh0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZGVsZXRlIHNlcnZpY2VTdG9yYWdlW25hbWVdO1xuICB9XG59O1xuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyUHVzaCA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UucHVzaCcsIFtdKVxuXG4gIC8qKlxuICAgKiBJb25pY1B1c2hBY3Rpb24gU2VydmljZVxuICAgKlxuICAgKiBBIHV0aWxpdHkgc2VydmljZSB0byBraWNrIG9mZiBtaXNjIGZlYXR1cmVzIGFzIHBhcnQgb2YgdGhlIElvbmljIFB1c2ggc2VydmljZVxuICAgKi9cbiAgLmZhY3RvcnkoJyRpb25pY1B1c2hBY3Rpb24nLCBbJyRzdGF0ZScsIGZ1bmN0aW9uKCRzdGF0ZSkge1xuXG4gICAgY2xhc3MgUHVzaEFjdGlvblNlcnZpY2Uge1xuXG4gICAgICAvKipcbiAgICAgICAqIFN0YXRlIE5hdmlnYXRpb25cbiAgICAgICAqXG4gICAgICAgKiBBdHRlbXB0cyB0byBuYXZpZ2F0ZSB0byBhIG5ldyB2aWV3IGlmIGEgcHVzaCBub3RpZmljYXRpb24gcGF5bG9hZCBjb250YWluczpcbiAgICAgICAqXG4gICAgICAgKiAgIC0gJHN0YXRlIHtTdHJpbmd9IFRoZSBzdGF0ZSBuYW1lIChlLmcgJ3RhYi5jaGF0cycpXG4gICAgICAgKiAgIC0gJHN0YXRlUGFyYW1zIHtPYmplY3R9IFByb3ZpZGVkIHN0YXRlICh1cmwpIHBhcmFtc1xuICAgICAgICpcbiAgICAgICAqIEZpbmQgbW9yZSBpbmZvIGFib3V0IHN0YXRlIG5hdmlnYXRpb24gYW5kIHBhcmFtczpcbiAgICAgICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyLXVpL3VpLXJvdXRlci93aWtpXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IG5vdGlmaWNhdGlvbiBOb3RpZmljYXRpb24gT2JqZWN0XG4gICAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAgICovXG4gICAgICBub3RpZmljYXRpb25OYXZpZ2F0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgICB2YXIgc3RhdGUgPSBub3RpZmljYXRpb24ucGF5bG9hZC4kc3RhdGUgfHwgZmFsc2U7XG4gICAgICAgIHZhciBzdGF0ZVBhcmFtcyA9IG5vdGlmaWNhdGlvbi5wYXlsb2FkLiRzdGF0ZVBhcmFtcyB8fCB7fTtcbiAgICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgICAgJHN0YXRlLmdvKHN0YXRlLCBzdGF0ZVBhcmFtcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFB1c2hBY3Rpb25TZXJ2aWNlKCk7XG4gIH1dKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNQdXNoJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyUHVzaCkge1xuICAgICAgSW9uaWNBbmd1bGFyUHVzaCA9IG5ldyBJb25pYy5QdXNoKFwiREVGRVJfSU5JVFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhclB1c2g7XG4gIH1dKVxuXG4gIC5ydW4oWyckaW9uaWNQdXNoJywgJyRpb25pY1B1c2hBY3Rpb24nLCBmdW5jdGlvbigkaW9uaWNQdXNoLCAkaW9uaWNQdXNoQWN0aW9uKSB7XG4gICAgLy8gVGhpcyBpcyB3aGF0IGtpY2tzIG9mZiB0aGUgc3RhdGUgcmVkaXJlY3Rpb24gd2hlbiBhIHB1c2ggbm90aWZpY2FpdG9uIGhhcyB0aGUgcmVsZXZhbnQgZGV0YWlsc1xuICAgICRpb25pY1B1c2guX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6cHJvY2Vzc05vdGlmaWNhdGlvbicsIGZ1bmN0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgbm90aWZpY2F0aW9uID0gSW9uaWMuUHVzaE1lc3NhZ2UuZnJvbVBsdWdpbkpTT04obm90aWZpY2F0aW9uKTtcbiAgICAgIGlmIChub3RpZmljYXRpb24gJiYgbm90aWZpY2F0aW9uLmFwcCkge1xuICAgICAgICBpZiAobm90aWZpY2F0aW9uLmFwcC5hc2xlZXAgPT09IHRydWUgfHwgbm90aWZpY2F0aW9uLmFwcC5jbG9zZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAkaW9uaWNQdXNoQWN0aW9uLm5vdGlmaWNhdGlvbk5hdmlnYXRpb24obm90aWZpY2F0aW9uKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gIH1dKTtcbn1cbiJdfQ==
