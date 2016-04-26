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

},{"events":28}],12:[function(require,module,exports){
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

},{"../auth/auth":5,"./promise":14,"browser-request":27}],16:[function(require,module,exports){
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

},{"./../dist/es6/analytics/analytics":1,"./../dist/es6/analytics/serializers":3,"./../dist/es6/analytics/storage":4,"./../dist/es6/auth/auth":5,"./../dist/es6/core/app":7,"./../dist/es6/core/config":8,"./../dist/es6/core/core":9,"./../dist/es6/core/data-types":10,"./../dist/es6/core/events":11,"./../dist/es6/core/logger":13,"./../dist/es6/core/promise":14,"./../dist/es6/core/request":15,"./../dist/es6/core/storage":16,"./../dist/es6/core/user":17,"./../dist/es6/deploy/deploy":18,"./../dist/es6/push/push":24,"./../dist/es6/push/push-message":22,"./../dist/es6/push/push-token":23}],36:[function(require,module,exports){
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

},{}]},{},[14,15,11,13,16,8,10,9,17,7,12,5,6,23,22,21,24,20,18,19,4,3,1,2,26,25,35,33,31,32,36,34])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hbmFseXRpY3MvYW5hbHl0aWNzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL3NlcmlhbGl6ZXJzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvYW5hbHl0aWNzL3N0b3JhZ2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hdXRoL2F1dGguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9hdXRoL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9hcHAuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9jb3JlL2NvbmZpZy5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvY29yZS5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvZGF0YS10eXBlcy5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvZXZlbnRzLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9pbmRleC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2NvcmUvbG9nZ2VyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9wcm9taXNlLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9yZXF1ZXN0LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS9zdG9yYWdlLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvY29yZS91c2VyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvZGVwbG95L2RlcGxveS5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L2RlcGxveS9pbmRleC5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L2Rpc3QvZXM2L3B1c2gvaW5kZXguanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2gtZGV2LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvcHVzaC9wdXNoLW1lc3NhZ2UuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2gtdG9rZW4uanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi9wdXNoL3B1c2guanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9kaXN0L2VzNi91dGlsL2luZGV4LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvZGlzdC9lczYvdXRpbC91dGlsLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVxdWVzdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9lczYtcHJvbWlzZS9kaXN0L2VzNi1wcm9taXNlLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL2FuYWx5dGljcy9hbmd1bGFyLmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL2F1dGgvYW5ndWxhci5qcyIsIi9Vc2Vycy9lcmljYi9pb25pYy9wbGF0Zm9ybS13ZWItY2xpZW50L3NyYy9jb3JlL2FuZ3VsYXIuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvZGVwbG95L2FuZ3VsYXIuanMiLCIvVXNlcnMvZXJpY2IvaW9uaWMvcGxhdGZvcm0td2ViLWNsaWVudC9zcmMvZXM1LmpzIiwiL1VzZXJzL2VyaWNiL2lvbmljL3BsYXRmb3JtLXdlYi1jbGllbnQvc3JjL3B1c2gvYW5ndWxhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7MkJDQTJCLGlCQUFpQjs7MkJBQ1osaUJBQWlCOzt3QkFDbkIsY0FBYzs7MEJBQ3JCLGdCQUFnQjs7dUJBQ1QsV0FBVzs7d0JBQ3BCLGNBQWM7O3dCQUNSLGNBQWM7O0FBQ3pDLElBQUksYUFBYSxHQUFHLElBQUksQ0FBQztBQUN6QixJQUFJLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQUN0QyxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7QUFDakIsSUFBSSxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7QUFDMUIsSUFBSSxtQkFBbUIsR0FBRyxFQUFFLENBQUM7O0lBQ2hCLFNBQVM7QUFDUCxhQURGLFNBQVMsQ0FD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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5ZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxrQkFBa0IsRUFBRSxVQUFTLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRTs7QUFFN0UsY0FBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsZ0NBQWdDLEVBQUUsVUFBUyxZQUFZLEVBQUU7QUFDOUUsa0JBQVksR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM5RCxVQUFJLFlBQVksSUFBSSxZQUFZLENBQUMsR0FBRyxFQUFFO0FBQ3BDLFlBQUksWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFJLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLElBQUksRUFBRTtBQUN4RSwwQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUN2RDtPQUNGO0tBQ0YsQ0FBQyxDQUFDO0dBRUosQ0FBQyxDQUFDLENBQUM7Q0FDTCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJpbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4uL2NvcmUvcHJvbWlzZVwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgQnVja2V0U3RvcmFnZSB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLi4vY29yZS91c2VyXCI7XG5pbXBvcnQgeyBkZWVwRXh0ZW5kIH0gZnJvbSBcIi4uL3V0aWwvdXRpbFwiO1xudmFyIEFOQUxZVElDU19LRVkgPSBudWxsO1xudmFyIERFRkVSX1JFR0lTVEVSID0gXCJERUZFUl9SRUdJU1RFUlwiO1xudmFyIG9wdGlvbnMgPSB7fTtcbnZhciBnbG9iYWxQcm9wZXJ0aWVzID0ge307XG52YXIgZ2xvYmFsUHJvcGVydGllc0ZucyA9IFtdO1xuZXhwb3J0IGNsYXNzIEFuYWx5dGljcyB7XG4gICAgY29uc3RydWN0b3IoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSBudWxsO1xuICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IDMwO1xuICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9zZXJ2aWNlSG9zdCA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgnYW5hbHl0aWNzJyk7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIEFuYWx5dGljczonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgdGhpcy5jYWNoZSA9IG5ldyBCdWNrZXRTdG9yYWdlKCdpb25pY19hbmFseXRpY3MnKTtcbiAgICAgICAgdGhpcy5fYWRkR2xvYmFsUHJvcGVydHlEZWZhdWx0cygpO1xuICAgICAgICBpZiAoY29uZmlnICE9PSBERUZFUl9SRUdJU1RFUikge1xuICAgICAgICAgICAgdGhpcy5yZWdpc3Rlcihjb25maWcpO1xuICAgICAgICB9XG4gICAgfVxuICAgIF9hZGRHbG9iYWxQcm9wZXJ0eURlZmF1bHRzKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHNlbGYuc2V0R2xvYmFsUHJvcGVydGllcyhmdW5jdGlvbiAoZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpIHtcbiAgICAgICAgICAgIGV2ZW50RGF0YS5fdXNlciA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoVXNlci5jdXJyZW50KCkpKTtcbiAgICAgICAgICAgIGV2ZW50RGF0YS5fYXBwID0ge1xuICAgICAgICAgICAgICAgIFwiYXBwX2lkXCI6IElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAgICAgXCJhbmFseXRpY3NfdmVyc2lvblwiOiBJb25pY1BsYXRmb3JtLlZlcnNpb25cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgaGFzVmFsaWRTZXR0aW5ncygpIHtcbiAgICAgICAgaWYgKCFJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpIHx8ICFJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwaV9rZXknKSkge1xuICAgICAgICAgICAgdmFyIG1zZyA9ICdBIHZhbGlkIGFwcF9pZCBhbmQgYXBpX2tleSBhcmUgcmVxdWlyZWQgYmVmb3JlIHlvdSBjYW4gdXRpbGl6ZSAnICtcbiAgICAgICAgICAgICAgICAnYW5hbHl0aWNzIHByb3Blcmx5LiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vdjEuMC9kb2NzL2lvLXF1aWNrLXN0YXJ0JztcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8obXNnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgc2V0IGRpc3BhdGNoSW50ZXJ2YWwodmFsdWUpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAvLyBTZXQgaG93IG9mdGVuIHdlIHNob3VsZCBzZW5kIGJhdGNoZWQgZXZlbnRzLCBpbiBzZWNvbmRzLlxuICAgICAgICAvLyBTZXQgdGhpcyB0byAwIHRvIGRpc2FibGUgZXZlbnQgY2FjaGluZ1xuICAgICAgICB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZSA9IHZhbHVlO1xuICAgICAgICAvLyBDbGVhciB0aGUgZXhpc3RpbmcgaW50ZXJ2YWxcbiAgICAgICAgaWYgKHRoaXMuX2Rpc3BhdGNoZXIpIHtcbiAgICAgICAgICAgIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuX2Rpc3BhdGNoZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZSA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2Rpc3BhdGNoZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyBzZWxmLl9kaXNwYXRjaFF1ZXVlKCk7IH0sIHZhbHVlICogMTAwMCk7XG4gICAgICAgICAgICB0aGlzLl91c2VFdmVudENhY2hpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdXNlRXZlbnRDYWNoaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IGRpc3BhdGNoSW50ZXJ2YWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kaXNwYXRjaEludGVydmFsVGltZTtcbiAgICB9XG4gICAgX2VucXVldWVFdmVudChjb2xsZWN0aW9uTmFtZSwgZXZlbnREYXRhKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKG9wdGlvbnMuZHJ5UnVuKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdldmVudCByZWNpZXZlZCBidXQgbm90IHNlbnQgKGRyeVJ1biBhY3RpdmUpOicpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhjb2xsZWN0aW9uTmFtZSk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZW5xdWV1aW5nIGV2ZW50IHRvIHNlbmQgbGF0ZXI6Jyk7XG4gICAgICAgIHNlbGYubG9nZ2VyLmluZm8oY29sbGVjdGlvbk5hbWUpO1xuICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIEFkZCB0aW1lc3RhbXAgcHJvcGVydHkgdG8gdGhlIGRhdGFcbiAgICAgICAgaWYgKCFldmVudERhdGEua2Vlbikge1xuICAgICAgICAgICAgZXZlbnREYXRhLmtlZW4gPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBldmVudERhdGEua2Vlbi50aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIC8vIEFkZCB0aGUgZGF0YSB0byB0aGUgcXVldWVcbiAgICAgICAgdmFyIGV2ZW50UXVldWUgPSBzZWxmLmNhY2hlLmdldCgnZXZlbnRfcXVldWUnKSB8fCB7fTtcbiAgICAgICAgaWYgKCFldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXSkge1xuICAgICAgICAgICAgZXZlbnRRdWV1ZVtjb2xsZWN0aW9uTmFtZV0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBldmVudFF1ZXVlW2NvbGxlY3Rpb25OYW1lXS5wdXNoKGV2ZW50RGF0YSk7XG4gICAgICAgIC8vIFdyaXRlIHRoZSBxdWV1ZSB0byBkaXNrXG4gICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIGV2ZW50UXVldWUpO1xuICAgIH1cbiAgICBfcmVxdWVzdEFuYWx5dGljc0tleSgpIHtcbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgXCJtZXRob2RcIjogJ0dFVCcsXG4gICAgICAgICAgICBcImpzb25cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwidXJpXCI6IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgnYXBpJykgKyAnL2FwaS92MS9hcHAvJyArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykgKyAnL2tleXMvd3JpdGUnLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7XG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBcImJhc2ljIFwiICsgYnRvYShJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpICsgJzonICsgSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcGlfa2V5JykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9wb3N0RXZlbnQobmFtZSwgZGF0YSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBwYXlsb2FkID0ge1xuICAgICAgICAgICAgXCJuYW1lXCI6IFtkYXRhXVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIUFOQUxZVElDU19LRVkpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdDYW5ub3Qgc2VuZCBldmVudHMgdG8gdGhlIGFuYWx5dGljcyBzZXJ2ZXIgd2l0aG91dCBhbiBBbmFseXRpY3Mga2V5LicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIFwibWV0aG9kXCI6ICdQT1NUJyxcbiAgICAgICAgICAgIFwidXJsXCI6IHNlbGYuX3NlcnZpY2VIb3N0ICsgJy9hcGkvdjEvZXZlbnRzLycgKyBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgXCJqc29uXCI6IHBheWxvYWQsXG4gICAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9wb3N0RXZlbnRzKGV2ZW50cykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghQU5BTFlUSUNTX0tFWSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnQ2Fubm90IHNlbmQgZXZlbnRzIHRvIHRoZSBhbmFseXRpY3Mgc2VydmVyIHdpdGhvdXQgYW4gQW5hbHl0aWNzIGtleS4nKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBcIm1ldGhvZFwiOiAnUE9TVCcsXG4gICAgICAgICAgICBcInVybFwiOiBzZWxmLl9zZXJ2aWNlSG9zdCArICcvYXBpL3YxL2V2ZW50cy8nICsgSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgIFwianNvblwiOiBldmVudHMsXG4gICAgICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBBTkFMWVRJQ1NfS0VZXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucyk7XG4gICAgfVxuICAgIF9kaXNwYXRjaFF1ZXVlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBldmVudFF1ZXVlID0gdGhpcy5jYWNoZS5nZXQoJ2V2ZW50X3F1ZXVlJykgfHwge307XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhldmVudFF1ZXVlKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIUlvbmljUGxhdGZvcm0uZGV2aWNlQ29ubmVjdGVkVG9OZXR3b3JrKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnN0b3JhZ2UubG9ja2VkQXN5bmNDYWxsKHNlbGYuY2FjaGUuc2NvcGVkS2V5KCdldmVudF9kaXNwYXRjaCcpLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5fcG9zdEV2ZW50cyhldmVudFF1ZXVlKTtcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmNhY2hlLnNldCgnZXZlbnRfcXVldWUnLCB7fSk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdzZW50IGV2ZW50cycpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudFF1ZXVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgc2VsZi5faGFuZGxlRGlzcGF0Y2hFcnJvcihlcnIsIHRoaXMsIGV2ZW50UXVldWUpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgX2dldFJlcXVlc3RTdGF0dXNDb2RlKHJlcXVlc3QpIHtcbiAgICAgICAgdmFyIHJlc3BvbnNlQ29kZSA9IG51bGw7XG4gICAgICAgIGlmIChyZXF1ZXN0ICYmIHJlcXVlc3QucmVxdWVzdEluZm8uX2xhc3RSZXNwb25zZSAmJiByZXF1ZXN0LnJlcXVlc3RJbmZvLl9sYXN0UmVzcG9uc2Uuc3RhdHVzQ29kZSkge1xuICAgICAgICAgICAgcmVzcG9uc2VDb2RlID0gcmVxdWVzdC5yZXF1ZXN0SW5mby5fbGFzdFJlc3BvbnNlLnN0YXR1c0NvZGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlQ29kZTtcbiAgICB9XG4gICAgX2hhbmRsZURpc3BhdGNoRXJyb3IoZXJyb3IsIHJlcXVlc3QsIGV2ZW50UXVldWUpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzcG9uc2VDb2RlID0gdGhpcy5fZ2V0UmVxdWVzdFN0YXR1c0NvZGUocmVxdWVzdCk7XG4gICAgICAgIGlmIChlcnJvciA9PT0gJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpIHtcbiAgICAgICAgICAgIHNlbGYuY2FjaGUuc2V0KCdldmVudF9xdWV1ZScsIHt9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIElmIHdlIGRpZG4ndCBjb25uZWN0IHRvIHRoZSBzZXJ2ZXIgYXQgYWxsIC0+IGtlZXAgZXZlbnRzXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlQ29kZSkge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdFcnJvciBzZW5kaW5nIGFuYWx5dGljcyBkYXRhOiBGYWlsZWQgdG8gY29ubmVjdCB0byBhbmFseXRpY3Mgc2VydmVyLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5jYWNoZS5zZXQoJ2V2ZW50X3F1ZXVlJywge30pO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdFcnJvciBzZW5kaW5nIGFuYWx5dGljcyBkYXRhOiBTZXJ2ZXIgcmVzcG9uZGVkIHdpdGggZXJyb3InKTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihldmVudFF1ZXVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBfaGFuZGxlUmVnaXN0ZXJFcnJvcihlcnJvciwgcmVxdWVzdCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXNwb25zZUNvZGUgPSB0aGlzLl9nZXRSZXF1ZXN0U3RhdHVzQ29kZShyZXF1ZXN0KTtcbiAgICAgICAgdmFyIGRvY3MgPSAnIFNlZSBodHRwOi8vZG9jcy5pb25pYy5pby92MS4wL2RvY3MvaW8tcXVpY2stc3RhcnQnO1xuICAgICAgICBzd2l0Y2ggKHJlc3BvbnNlQ29kZSkge1xuICAgICAgICAgICAgY2FzZSA0MDE6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1RoZSBhcGkga2V5IGFuZCBhcHAgaWQgeW91IHByb3ZpZGVkIGRpZCBub3QgcmVnaXN0ZXIgb24gdGhlIHNlcnZlci4gJyArIGRvY3MpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSA0MDQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1RoZSBhcHAgaWQgeW91IHByb3ZpZGVkIChcIicgKyBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpICsgJ1wiKSB3YXMgbm90IGZvdW5kLicgKyBkb2NzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1VuYWJsZSB0byByZXF1ZXN0IGFuYWx5dGljcyBrZXkuJyk7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyBhbiBhbmFseXRpY3Mga2V5XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb3B0cyBSZWdpc3RyYXRpb24gb3B0aW9uc1xuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSByZWdpc3RlciBwcm9taXNlXG4gICAgICovXG4gICAgcmVnaXN0ZXIob3B0cykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgaWYgKCF0aGlzLmhhc1ZhbGlkU2V0dGluZ3MpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgICBvcHRpb25zID0gb3B0cyB8fCB7fTtcbiAgICAgICAgaWYgKG9wdGlvbnMuc2lsZW50KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5zaWxlbmNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci52ZXJib3NlKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdGlvbnMuZHJ5UnVuKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdkcnlSdW4gbW9kZSBpcyBhY3RpdmUuIEFuYWx5dGljcyB3aWxsIG5vdCBzZW5kIGFueSBldmVudHMuJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fcmVxdWVzdEFuYWx5dGljc0tleSgpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgQU5BTFlUSUNTX0tFWSA9IHJlc3VsdC5wYXlsb2FkLndyaXRlX2tleTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3N1Y2Nlc3NmdWxseSByZWdpc3RlcmVkIGFuYWx5dGljcyBrZXknKTtcbiAgICAgICAgICAgIHNlbGYuZGlzcGF0Y2hJbnRlcnZhbCA9IHNlbGYuZGlzcGF0Y2hJbnRlcnZhbDtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5faGFuZGxlUmVnaXN0ZXJFcnJvcihlcnJvciwgdGhpcyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHNldEdsb2JhbFByb3BlcnRpZXMocHJvcCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBwcm9wVHlwZSA9ICh0eXBlb2YgcHJvcCk7XG4gICAgICAgIHN3aXRjaCAocHJvcFR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIHByb3ApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9wLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbFByb3BlcnRpZXNba2V5XSA9IHByb3Bba2V5XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICAgICAgICAgICAgZ2xvYmFsUHJvcGVydGllc0Zucy5wdXNoKHByb3ApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignc2V0R2xvYmFsUHJvcGVydGllcyBwYXJhbWV0ZXIgbXVzdCBiZSBhbiBvYmplY3Qgb3IgZnVuY3Rpb24uJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdHJhY2soZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuaGFzVmFsaWRTZXR0aW5ncykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICghZXZlbnREYXRhKSB7XG4gICAgICAgICAgICBldmVudERhdGEgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIENsb25lIHRoZSBldmVudCBkYXRhIHRvIGF2b2lkIG1vZGlmeWluZyBpdFxuICAgICAgICAgICAgZXZlbnREYXRhID0gZGVlcEV4dGVuZCh7fSwgZXZlbnREYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gZ2xvYmFsUHJvcGVydGllcykge1xuICAgICAgICAgICAgaWYgKCFnbG9iYWxQcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChldmVudERhdGFba2V5XSA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgZXZlbnREYXRhW2tleV0gPSBnbG9iYWxQcm9wZXJ0aWVzW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnbG9iYWxQcm9wZXJ0aWVzRm5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm4gPSBnbG9iYWxQcm9wZXJ0aWVzRm5zW2ldO1xuICAgICAgICAgICAgZm4uY2FsbChudWxsLCBldmVudENvbGxlY3Rpb24sIGV2ZW50RGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3VzZUV2ZW50Q2FjaGluZykge1xuICAgICAgICAgICAgc2VsZi5fZW5xdWV1ZUV2ZW50KGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmRyeVJ1bikge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2RyeVJ1biBhY3RpdmUsIHdpbGwgbm90IHNlbmQgZXZlbnQnKTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKGV2ZW50Q29sbGVjdGlvbik7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhldmVudERhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcG9zdEV2ZW50KGV2ZW50Q29sbGVjdGlvbiwgZXZlbnREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB1bnNldEdsb2JhbFByb3BlcnR5KHByb3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcHJvcFR5cGUgPSAodHlwZW9mIHByb3ApO1xuICAgICAgICBzd2l0Y2ggKHByb3BUeXBlKSB7XG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIGRlbGV0ZSBnbG9iYWxQcm9wZXJ0aWVzW3Byb3BdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICAgICAgICAgIHZhciBpID0gZ2xvYmFsUHJvcGVydGllc0Zucy5pbmRleE9mKHByb3ApO1xuICAgICAgICAgICAgICAgIGlmIChpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignVGhlIGZ1bmN0aW9uIHBhc3NlZCB0byB1bnNldEdsb2JhbFByb3BlcnR5IHdhcyBub3QgYSBnbG9iYWwgcHJvcGVydHkuJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdsb2JhbFByb3BlcnRpZXNGbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcigndW5zZXRHbG9iYWxQcm9wZXJ0eSBwYXJhbWV0ZXIgbXVzdCBiZSBhIHN0cmluZyBvciBmdW5jdGlvbi4nKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImV4cG9ydCAqIGZyb20gXCIuL2FuYWx5dGljc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc2VyaWFsaXplcnNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3N0b3JhZ2VcIjtcbiIsImV4cG9ydCBjbGFzcyBET01TZXJpYWxpemVyIHtcbiAgICBlbGVtZW50U2VsZWN0b3IoZWxlbWVudCkge1xuICAgICAgICAvLyBpdGVyYXRlIHVwIHRoZSBkb21cbiAgICAgICAgdmFyIHNlbGVjdG9ycyA9IFtdO1xuICAgICAgICB3aGlsZSAoZWxlbWVudC50YWdOYW1lICE9PSAnSFRNTCcpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3RvciA9IGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgdmFyIGlkID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3RvciArPSBcIiNcIiArIGlkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGNsYXNzTmFtZSA9IGVsZW1lbnQuY2xhc3NOYW1lO1xuICAgICAgICAgICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgICAgIHZhciBjbGFzc2VzID0gY2xhc3NOYW1lLnNwbGl0KCcgJyk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbGFzc2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjID0gY2xhc3Nlc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yICs9ICcuJyArIGM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWVsZW1lbnQucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGNoaWxkSW5kZXggPSBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGVsZW1lbnQucGFyZW50Tm9kZS5jaGlsZHJlbiwgZWxlbWVudCk7XG4gICAgICAgICAgICBzZWxlY3RvciArPSAnOm50aC1jaGlsZCgnICsgKGNoaWxkSW5kZXggKyAxKSArICcpJztcbiAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudE5vZGU7XG4gICAgICAgICAgICBzZWxlY3RvcnMucHVzaChzZWxlY3Rvcik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNlbGVjdG9ycy5yZXZlcnNlKCkuam9pbignPicpO1xuICAgIH1cbiAgICBlbGVtZW50TmFtZShlbGVtZW50KSB7XG4gICAgICAgIC8vIDEuIGlvbi10cmFjay1uYW1lIGRpcmVjdGl2ZVxuICAgICAgICB2YXIgbmFtZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdpb24tdHJhY2stbmFtZScpO1xuICAgICAgICBpZiAobmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gMi4gaWRcbiAgICAgICAgdmFyIGlkID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgICB9XG4gICAgICAgIC8vIDMuIG5vIHVuaXF1ZSBpZGVudGlmaWVyIC0tPiByZXR1cm4gbnVsbFxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBJb25pY1BsYXRmb3JtIH0gZnJvbSBcIi4uL2NvcmUvY29yZVwiO1xuZXhwb3J0IGNsYXNzIEJ1Y2tldFN0b3JhZ2Uge1xuICAgIGNvbnN0cnVjdG9yKG5hbWUpIHtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAgICAgdGhpcy5iYXNlU3RvcmFnZSA9IElvbmljUGxhdGZvcm0uZ2V0U3RvcmFnZSgpO1xuICAgIH1cbiAgICBnZXQoa2V5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmJhc2VTdG9yYWdlLnJldHJpZXZlT2JqZWN0KHRoaXMuc2NvcGVkS2V5KGtleSkpO1xuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5iYXNlU3RvcmFnZS5zdG9yZU9iamVjdCh0aGlzLnNjb3BlZEtleShrZXkpLCB2YWx1ZSk7XG4gICAgfVxuICAgIHNjb3BlZEtleShrZXkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZSArICdfJyArIGtleSArICdfJyArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgQVBJUmVxdWVzdCB9IGZyb20gXCIuLi9jb3JlL3JlcXVlc3RcIjtcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IElvbmljUGxhdGZvcm0gfSBmcm9tIFwiLi4vY29yZS9jb3JlXCI7XG5pbXBvcnQgeyBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5LCBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kgfSBmcm9tIFwiLi4vY29yZS9zdG9yYWdlXCI7XG5pbXBvcnQgeyBVc2VyIH0gZnJvbSBcIi4uL2NvcmUvdXNlclwiO1xudmFyIHN0b3JhZ2UgPSBuZXcgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSgpO1xudmFyIHNlc3Npb25TdG9yYWdlID0gbmV3IExvY2FsU2Vzc2lvblN0b3JhZ2VTdHJhdGVneSgpO1xudmFyIF9fYXV0aE1vZHVsZXMgPSB7fTtcbnZhciBfX2F1dGhUb2tlbiA9IG51bGw7XG52YXIgYXV0aEFQSUJhc2UgPSBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9hdXRoJztcbnZhciBhdXRoQVBJRW5kcG9pbnRzID0ge1xuICAgICdsb2dpbic6IGZ1bmN0aW9uIChwcm92aWRlciA9IG51bGwpIHtcbiAgICAgICAgaWYgKHByb3ZpZGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gYXV0aEFQSUJhc2UgKyAnL2xvZ2luLycgKyBwcm92aWRlcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXV0aEFQSUJhc2UgKyAnL2xvZ2luJztcbiAgICB9LFxuICAgICdzaWdudXAnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBhdXRoQVBJQmFzZSArICcvdXNlcnMnO1xuICAgIH1cbn07XG5leHBvcnQgY2xhc3MgVGVtcFRva2VuQ29udGV4dCB7XG4gICAgc3RhdGljIGdldCBsYWJlbCgpIHtcbiAgICAgICAgcmV0dXJuIFwiaW9uaWNfaW9fYXV0aF9cIiArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgfVxuICAgIHN0YXRpYyBkZWxldGUoKSB7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnJlbW92ZShUZW1wVG9rZW5Db250ZXh0LmxhYmVsKTtcbiAgICB9XG4gICAgc3RhdGljIHN0b3JlKCkge1xuICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXQoVGVtcFRva2VuQ29udGV4dC5sYWJlbCwgX19hdXRoVG9rZW4pO1xuICAgIH1cbiAgICBzdGF0aWMgZ2V0UmF3RGF0YSgpIHtcbiAgICAgICAgcmV0dXJuIHNlc3Npb25TdG9yYWdlLmdldChUZW1wVG9rZW5Db250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgVG9rZW5Db250ZXh0IHtcbiAgICBzdGF0aWMgZ2V0IGxhYmVsKCkge1xuICAgICAgICByZXR1cm4gXCJpb25pY19pb19hdXRoX1wiICsgSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKTtcbiAgICB9XG4gICAgc3RhdGljIGRlbGV0ZSgpIHtcbiAgICAgICAgc3RvcmFnZS5yZW1vdmUoVG9rZW5Db250ZXh0LmxhYmVsKTtcbiAgICB9XG4gICAgc3RhdGljIHN0b3JlKCkge1xuICAgICAgICBzdG9yYWdlLnNldChUb2tlbkNvbnRleHQubGFiZWwsIF9fYXV0aFRva2VuKTtcbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0RhdGEoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLmdldChUb2tlbkNvbnRleHQubGFiZWwpIHx8IGZhbHNlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHN0b3JlVG9rZW4ob3B0aW9ucywgdG9rZW4pIHtcbiAgICBfX2F1dGhUb2tlbiA9IHRva2VuO1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucy5yZW1lbWJlcikge1xuICAgICAgICBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIFRlbXBUb2tlbkNvbnRleHQuc3RvcmUoKTtcbiAgICB9XG59XG5jbGFzcyBJbkFwcEJyb3dzZXJGbG93IHtcbiAgICBjb25zdHJ1Y3RvcihhdXRoT3B0aW9ucywgb3B0aW9ucywgZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghd2luZG93IHx8ICF3aW5kb3cuY29yZG92YSB8fCAhd2luZG93LmNvcmRvdmEuSW5BcHBCcm93c2VyKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJNaXNzaW5nIEluQXBwQnJvd3NlciBwbHVnaW5cIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMubG9naW4ob3B0aW9ucy5wcm92aWRlciksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6IG9wdGlvbnMudXJpX21ldGhvZCB8fCAnUE9TVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgICAgICdhcHBfaWQnOiBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLFxuICAgICAgICAgICAgICAgICAgICAnY2FsbGJhY2snOiBvcHRpb25zLmNhbGxiYWNrX3VyaSB8fCB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBkYXRhXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgIHZhciBsb2MgPSBkYXRhLnBheWxvYWQuZGF0YS51cmw7XG4gICAgICAgICAgICAgICAgdmFyIHRlbXBCcm93c2VyID0gd2luZG93LmNvcmRvdmEuSW5BcHBCcm93c2VyLm9wZW4obG9jLCAnX2JsYW5rJywgJ2xvY2F0aW9uPW5vLGNsZWFyY2FjaGU9eWVzLGNsZWFyc2Vzc2lvbmNhY2hlPXllcycpO1xuICAgICAgICAgICAgICAgIHRlbXBCcm93c2VyLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRzdGFydCcsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLnVybC5zbGljZSgwLCAyMCkgPT09ICdodHRwOi8vYXV0aC5pb25pYy5pbycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBxdWVyeVN0cmluZyA9IGRhdGEudXJsLnNwbGl0KCcjJylbMF0uc3BsaXQoJz8nKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbVBhcnRzID0gcXVlcnlTdHJpbmcuc3BsaXQoJyYnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbXMgPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyYW1QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJ0ID0gcGFyYW1QYXJ0c1tpXS5zcGxpdCgnPScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtc1twYXJ0WzBdXSA9IHBhcnRbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBzdG9yZVRva2VuKGF1dGhPcHRpb25zLCBwYXJhbXMudG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGVtcEJyb3dzZXIuY2xvc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBCcm93c2VyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGdldEF1dGhFcnJvckRldGFpbHMoZXJyKSB7XG4gICAgdmFyIGRldGFpbHMgPSBbXTtcbiAgICB0cnkge1xuICAgICAgICBkZXRhaWxzID0gZXJyLnJlc3BvbnNlLmJvZHkuZXJyb3IuZGV0YWlscztcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgZTtcbiAgICB9XG4gICAgcmV0dXJuIGRldGFpbHM7XG59XG5leHBvcnQgY2xhc3MgQXV0aCB7XG4gICAgc3RhdGljIGlzQXV0aGVudGljYXRlZCgpIHtcbiAgICAgICAgdmFyIHRva2VuID0gVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRlbXBUb2tlbiA9IFRlbXBUb2tlbkNvbnRleHQuZ2V0UmF3RGF0YSgpO1xuICAgICAgICBpZiAodGVtcFRva2VuIHx8IHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHN0YXRpYyBsb2dpbihtb2R1bGVJZCwgb3B0aW9ucywgZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBjb250ZXh0ID0gX19hdXRoTW9kdWxlc1ttb2R1bGVJZF0gfHwgZmFsc2U7XG4gICAgICAgIGlmICghY29udGV4dCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXV0aGVudGljYXRpb24gY2xhc3MgaXMgaW52YWxpZCBvciBtaXNzaW5nOlwiICsgY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGV4dC5hdXRoZW50aWNhdGUuYXBwbHkoY29udGV4dCwgW29wdGlvbnMsIGRhdGFdKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIFVzZXIuc2VsZigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHN0YXRpYyBzaWdudXAoZGF0YSkge1xuICAgICAgICB2YXIgY29udGV4dCA9IF9fYXV0aE1vZHVsZXMuYmFzaWMgfHwgZmFsc2U7XG4gICAgICAgIGlmICghY29udGV4dCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXV0aGVudGljYXRpb24gY2xhc3MgaXMgaW52YWxpZCBvciBtaXNzaW5nOlwiICsgY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbnRleHQuc2lnbnVwLmFwcGx5KGNvbnRleHQsIFtkYXRhXSk7XG4gICAgfVxuICAgIHN0YXRpYyBsb2dvdXQoKSB7XG4gICAgICAgIFRva2VuQ29udGV4dC5kZWxldGUoKTtcbiAgICAgICAgVGVtcFRva2VuQ29udGV4dC5kZWxldGUoKTtcbiAgICB9XG4gICAgc3RhdGljIHJlZ2lzdGVyKG1vZHVsZUlkLCBtb2R1bGUpIHtcbiAgICAgICAgaWYgKCFfX2F1dGhNb2R1bGVzW21vZHVsZUlkXSkge1xuICAgICAgICAgICAgX19hdXRoTW9kdWxlc1ttb2R1bGVJZF0gPSBtb2R1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIGdldFVzZXJUb2tlbigpIHtcbiAgICAgICAgdmFyIHVzZXJ0b2tlbiA9IFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIHZhciB0ZW1wdG9rZW4gPSBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRva2VuID0gdGVtcHRva2VuIHx8IHVzZXJ0b2tlbjtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbmNsYXNzIEJhc2ljQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMubG9naW4oKSxcbiAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAnanNvbic6IHtcbiAgICAgICAgICAgICAgICAnYXBwX2lkJzogSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICAgICAnZW1haWwnOiBkYXRhLmVtYWlsLFxuICAgICAgICAgICAgICAgICdwYXNzd29yZCc6IGRhdGEucGFzc3dvcmRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgc3RvcmVUb2tlbihvcHRpb25zLCBkYXRhLnBheWxvYWQuZGF0YS50b2tlbik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBzdGF0aWMgc2lnbnVwKGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgdXNlckRhdGEgPSB7XG4gICAgICAgICAgICAnYXBwX2lkJzogSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICdlbWFpbCc6IGRhdGEuZW1haWwsXG4gICAgICAgICAgICAncGFzc3dvcmQnOiBkYXRhLnBhc3N3b3JkXG4gICAgICAgIH07XG4gICAgICAgIC8vIG9wdGlvbmFsIGRldGFpbHNcbiAgICAgICAgaWYgKGRhdGEudXNlcm5hbWUpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLnVzZXJuYW1lID0gZGF0YS51c2VybmFtZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5pbWFnZSkge1xuICAgICAgICAgICAgdXNlckRhdGEuaW1hZ2UgPSBkYXRhLmltYWdlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLm5hbWUpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEuY3VzdG9tKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS5jdXN0b20gPSBkYXRhLmN1c3RvbTtcbiAgICAgICAgfVxuICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAndXJpJzogYXV0aEFQSUVuZHBvaW50cy5zaWdudXAoKSxcbiAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAnanNvbic6IHVzZXJEYXRhXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgdmFyIGVycm9ycyA9IFtdO1xuICAgICAgICAgICAgdmFyIGRldGFpbHMgPSBnZXRBdXRoRXJyb3JEZXRhaWxzKGVycik7XG4gICAgICAgICAgICBpZiAoZGV0YWlscyBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZXRhaWxzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkZXRhaWwgPSBkZXRhaWxzW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGRldGFpbCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXRhaWwuZXJyb3JfdHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9ycy5wdXNoKGRldGFpbC5lcnJvcl90eXBlICsgXCJfXCIgKyBkZXRhaWwucGFyYW1ldGVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCh7IFwiZXJyb3JzXCI6IGVycm9ycyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbn1cbmNsYXNzIEN1c3RvbUF1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnY3VzdG9tJyB9LCBkYXRhKTtcbiAgICB9XG59XG5jbGFzcyBUd2l0dGVyQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICd0d2l0dGVyJyB9LCBkYXRhKTtcbiAgICB9XG59XG5jbGFzcyBGYWNlYm9va0F1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZmFjZWJvb2snIH0sIGRhdGEpO1xuICAgIH1cbn1cbmNsYXNzIEdpdGh1YkF1dGgge1xuICAgIHN0YXRpYyBhdXRoZW50aWNhdGUob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZ2l0aHViJyB9LCBkYXRhKTtcbiAgICB9XG59XG5jbGFzcyBHb29nbGVBdXRoIHtcbiAgICBzdGF0aWMgYXV0aGVudGljYXRlKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2dvb2dsZScgfSwgZGF0YSk7XG4gICAgfVxufVxuY2xhc3MgSW5zdGFncmFtQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdpbnN0YWdyYW0nIH0sIGRhdGEpO1xuICAgIH1cbn1cbmNsYXNzIExpbmtlZEluQXV0aCB7XG4gICAgc3RhdGljIGF1dGhlbnRpY2F0ZShvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdsaW5rZWRpbicgfSwgZGF0YSk7XG4gICAgfVxufVxuQXV0aC5yZWdpc3RlcignYmFzaWMnLCBCYXNpY0F1dGgpO1xuQXV0aC5yZWdpc3RlcignY3VzdG9tJywgQ3VzdG9tQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdmYWNlYm9vaycsIEZhY2Vib29rQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdnaXRodWInLCBHaXRodWJBdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2dvb2dsZScsIEdvb2dsZUF1dGgpO1xuQXV0aC5yZWdpc3RlcignaW5zdGFncmFtJywgSW5zdGFncmFtQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdsaW5rZWRpbicsIExpbmtlZEluQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCd0d2l0dGVyJywgVHdpdHRlckF1dGgpO1xuIiwiZXhwb3J0ICogZnJvbSBcIi4vYXV0aFwiO1xuIiwiaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4vbG9nZ2VyXCI7XG52YXIgcHJpdmF0ZURhdGEgPSB7fTtcbmZ1bmN0aW9uIHByaXZhdGVWYXIoa2V5KSB7XG4gICAgcmV0dXJuIHByaXZhdGVEYXRhW2tleV0gfHwgbnVsbDtcbn1cbmV4cG9ydCBjbGFzcyBBcHAge1xuICAgIGNvbnN0cnVjdG9yKGFwcElkLCBhcGlLZXkpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgQXBwOidcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghYXBwSWQgfHwgYXBwSWQgPT09ICcnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdObyBhcHBfaWQgd2FzIHByb3ZpZGVkJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhcGlLZXkgfHwgYXBpS2V5ID09PSAnJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnTm8gYXBpX2tleSB3YXMgcHJvdmlkZWQnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBwcml2YXRlRGF0YS5pZCA9IGFwcElkO1xuICAgICAgICBwcml2YXRlRGF0YS5hcGlLZXkgPSBhcGlLZXk7XG4gICAgICAgIC8vIG90aGVyIGNvbmZpZyB2YWx1ZSByZWZlcmVuY2VcbiAgICAgICAgdGhpcy5kZXZQdXNoID0gbnVsbDtcbiAgICAgICAgdGhpcy5nY21LZXkgPSBudWxsO1xuICAgIH1cbiAgICBnZXQgaWQoKSB7XG4gICAgICAgIHJldHVybiBwcml2YXRlVmFyKCdpZCcpO1xuICAgIH1cbiAgICBnZXQgYXBpS2V5KCkge1xuICAgICAgICByZXR1cm4gcHJpdmF0ZVZhcignYXBpS2V5Jyk7XG4gICAgfVxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gJzxJb25pY0FwcCBbXFwnJyArIHRoaXMuaWQgKyAnXFwnPic7XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIElvbmljUGxhdGZvcm1Db25maWcge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9zZXR0aW5ncyA9IHt9O1xuICAgICAgICB0aGlzLl9kZXZMb2NhdGlvbnMgPSB7fTtcbiAgICAgICAgdGhpcy5fbG9jYXRpb25zID0ge1xuICAgICAgICAgICAgJ2FwaSc6ICdodHRwczovL2FwcHMuaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ3B1c2gnOiAnaHR0cHM6Ly9wdXNoLmlvbmljLmlvJyxcbiAgICAgICAgICAgICdhbmFseXRpY3MnOiAnaHR0cHM6Ly9hbmFseXRpY3MuaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ2RlcGxveSc6ICdodHRwczovL2FwcHMuaW9uaWMuaW8nLFxuICAgICAgICAgICAgJ3BsYXRmb3JtLWFwaSc6ICdodHRwczovL2FwaS5pb25pYy5pbydcbiAgICAgICAgfTtcbiAgICB9XG4gICAgZ2V0KG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NldHRpbmdzW25hbWVdO1xuICAgIH1cbiAgICBnZXRVUkwobmFtZSkge1xuICAgICAgICBpZiAodGhpcy5fZGV2TG9jYXRpb25zW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZGV2TG9jYXRpb25zW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX2xvY2F0aW9uc1tuYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xvY2F0aW9uc1tuYW1lXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJlZ2lzdGVyKHNldHRpbmdzID0ge30pIHtcbiAgICAgICAgdGhpcy5fc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy5fZGV2TG9jYXRpb25zID0gc2V0dGluZ3MuZGV2X2xvY2F0aW9ucyB8fCB7fTtcbiAgICB9XG59XG5leHBvcnQgdmFyIENvbmZpZyA9IG5ldyBJb25pY1BsYXRmb3JtQ29uZmlnKCk7XG4iLCJpbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi9ldmVudHNcIjtcbmltcG9ydCB7IFN0b3JhZ2UgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9sb2dnZXJcIjtcbmltcG9ydCB7IENvbmZpZyB9IGZyb20gXCIuL2NvbmZpZ1wiO1xudmFyIGV2ZW50RW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbnZhciBtYWluU3RvcmFnZSA9IG5ldyBTdG9yYWdlKCk7XG5leHBvcnQgY2xhc3MgSW9uaWNQbGF0Zm9ybUNvcmUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuY29uZmlnID0gQ29uZmlnO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBDb3JlOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICAgICAgdGhpcy5fcGx1Z2luc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZW1pdHRlciA9IHRoaXMuZ2V0RW1pdHRlcigpO1xuICAgICAgICB0aGlzLl9ib290c3RyYXAoKTtcbiAgICAgICAgaWYgKHNlbGYuY29yZG92YVBsYXRmb3JtVW5rbm93bikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYXR0ZW1wdGluZyB0byBtb2NrIHBsdWdpbnMnKTtcbiAgICAgICAgICAgIHNlbGYuX3BsdWdpbnNSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJkZXZpY2VyZWFkeVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3BsdWdpbnMgYXJlIHJlYWR5Jyk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbnNSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZW1pdHRlci5lbWl0KCdpb25pY19jb3JlOnBsdWdpbnNfcmVhZHknKTtcbiAgICAgICAgICAgICAgICB9LCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3VuYWJsZSB0byBsaXN0ZW4gZm9yIGNvcmRvdmEgcGx1Z2lucyB0byBiZSByZWFkeScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGluaXQoY2ZnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnJlZ2lzdGVyKGNmZyk7XG4gICAgfVxuICAgIGdldCBWZXJzaW9uKCkge1xuICAgICAgICByZXR1cm4gJ1ZFUlNJT05fU1RSSU5HJztcbiAgICB9XG4gICAgZ2V0RW1pdHRlcigpIHtcbiAgICAgICAgcmV0dXJuIGV2ZW50RW1pdHRlcjtcbiAgICB9XG4gICAgZ2V0U3RvcmFnZSgpIHtcbiAgICAgICAgcmV0dXJuIG1haW5TdG9yYWdlO1xuICAgIH1cbiAgICBfaXNDb3Jkb3ZhQXZhaWxhYmxlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NlYXJjaGluZyBmb3IgY29yZG92YS5qcycpO1xuICAgICAgICBpZiAodHlwZW9mIGNvcmRvdmEgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdjb3Jkb3ZhLmpzIGhhcyBhbHJlYWR5IGJlZW4gbG9hZGVkJyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcbiAgICAgICAgdmFyIGxlbiA9IHNjcmlwdHMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgc2NyaXB0ID0gc2NyaXB0c1tpXS5nZXRBdHRyaWJ1dGUoJ3NyYycpO1xuICAgICAgICAgICAgaWYgKHNjcmlwdCkge1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0cyA9IHNjcmlwdC5zcGxpdCgnLycpO1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0c0xlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHNMZW5ndGggPSBwYXJ0cy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0c1twYXJ0c0xlbmd0aCAtIDFdID09PSAnY29yZG92YS5qcycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2NvcmRvdmEuanMgaGFzIHByZXZpb3VzbHkgYmVlbiBpbmNsdWRlZC4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2VuY291bnRlcmVkIGVycm9yIHdoaWxlIHRlc3RpbmcgZm9yIGNvcmRvdmEuanMgcHJlc2VuY2UsICcgKyBlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGxvYWRDb3Jkb3ZhKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghdGhpcy5faXNDb3Jkb3ZhQXZhaWxhYmxlKCkpIHtcbiAgICAgICAgICAgIHZhciBjb3Jkb3ZhU2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgICAgICAgICB2YXIgY29yZG92YVNyYyA9ICdjb3Jkb3ZhLmpzJztcbiAgICAgICAgICAgIHN3aXRjaCAodGhpcy5nZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2FuZHJvaWQnOlxuICAgICAgICAgICAgICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLmhyZWYuc3Vic3RyaW5nKDAsIDQpID09PSBcImZpbGVcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29yZG92YVNyYyA9ICdmaWxlOi8vL2FuZHJvaWRfYXNzZXQvd3d3L2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lwYWQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2lwaG9uZSc6XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVzb3VyY2UgPSB3aW5kb3cubG9jYXRpb24uc2VhcmNoLm1hdGNoKC9jb3Jkb3ZhX2pzX2Jvb3RzdHJhcF9yZXNvdXJjZT0oLio/KSgmfCN8JCkvaSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3Jkb3ZhU3JjID0gZGVjb2RlVVJJKHJlc291cmNlWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnY291bGQgbm90IGZpbmQgY29yZG92YV9qc19ib290c3RyYXBfcmVzb3VyY2UgcXVlcnkgcGFyYW0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAndW5rbm93bic6XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuY29yZG92YVBsYXRmb3JtVW5rbm93biA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvcmRvdmFTY3JpcHQuc2V0QXR0cmlidXRlKCdzcmMnLCBjb3Jkb3ZhU3JjKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoY29yZG92YVNjcmlwdCk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdpbmplY3RpbmcgY29yZG92YS5qcycpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIERldGVybWluZSB0aGUgZGV2aWNlIHR5cGUgdmlhIHRoZSB1c2VyIGFnZW50IHN0cmluZ1xuICAgICAqIEByZXR1cm4ge3N0cmluZ30gbmFtZSBvZiBkZXZpY2UgcGxhdGZvcm0gb3IgXCJ1bmtub3duXCIgaWYgdW5hYmxlIHRvIGlkZW50aWZ5IHRoZSBkZXZpY2VcbiAgICAgKi9cbiAgICBnZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKSB7XG4gICAgICAgIHZhciBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG4gICAgICAgIHZhciBpcGFkID0gYWdlbnQubWF0Y2goL2lQYWQvaSk7XG4gICAgICAgIGlmIChpcGFkICYmIChpcGFkWzBdLnRvTG93ZXJDYXNlKCkgPT09ICdpcGFkJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBhZCc7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGlwaG9uZSA9IGFnZW50Lm1hdGNoKC9pUGhvbmUvaSk7XG4gICAgICAgIGlmIChpcGhvbmUgJiYgKGlwaG9uZVswXS50b0xvd2VyQ2FzZSgpID09PSAnaXBob25lJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBob25lJztcbiAgICAgICAgfVxuICAgICAgICB2YXIgYW5kcm9pZCA9IGFnZW50Lm1hdGNoKC9BbmRyb2lkL2kpO1xuICAgICAgICBpZiAoYW5kcm9pZCAmJiAoYW5kcm9pZFswXS50b0xvd2VyQ2FzZSgpID09PSAnYW5kcm9pZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2FuZHJvaWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcInVua25vd25cIjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgaWYgdGhlIGRldmljZSBpcyBhbiBBbmRyb2lkIGRldmljZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgQW5kcm9pZCwgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgaXNBbmRyb2lkRGV2aWNlKCkge1xuICAgICAgICB2YXIgZGV2aWNlID0gdGhpcy5nZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKTtcbiAgICAgICAgaWYgKGRldmljZSA9PT0gJ2FuZHJvaWQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENoZWNrIGlmIHRoZSBkZXZpY2UgaXMgYW4gaU9TIGRldmljZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgaU9TLCBmYWxzZSBvdGhlcndpc2VcbiAgICAgKi9cbiAgICBpc0lPU0RldmljZSgpIHtcbiAgICAgICAgdmFyIGRldmljZSA9IHRoaXMuZ2V0RGV2aWNlVHlwZUJ5TmF2aWdhdG9yKCk7XG4gICAgICAgIGlmIChkZXZpY2UgPT09ICdpcGhvbmUnIHx8IGRldmljZSA9PT0gJ2lwYWQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEJvb3RzdHJhcCBJb25pYyBDb3JlXG4gICAgICpcbiAgICAgKiBIYW5kbGVzIHRoZSBjb3Jkb3ZhLmpzIGJvb3RzdHJhcFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgX2Jvb3RzdHJhcCgpIHtcbiAgICAgICAgdGhpcy5sb2FkQ29yZG92YSgpO1xuICAgIH1cbiAgICBkZXZpY2VDb25uZWN0ZWRUb05ldHdvcmsoc3RyaWN0TW9kZSA9IG51bGwpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBzdHJpY3RNb2RlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgc3RyaWN0TW9kZSA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yLmNvbm5lY3Rpb24gPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICAgICAgICB0eXBlb2YgbmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZSA9PT0gJ3VuZGVmaW5lZCcgfHxcbiAgICAgICAgICAgIHR5cGVvZiBDb25uZWN0aW9uID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaWYgKCFzdHJpY3RNb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChuYXZpZ2F0b3IuY29ubmVjdGlvbi50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uRVRIRVJORVQ6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uV0lGSTpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMXzJHOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTExfM0c6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTF80RzpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMOlxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogRmlyZSBhIGNhbGxiYWNrIHdoZW4gY29yZSArIHBsdWdpbnMgYXJlIHJlYWR5LiBUaGlzIHdpbGwgZmlyZSBpbW1lZGlhdGVseSBpZlxuICAgICAqIHRoZSBjb21wb25lbnRzIGhhdmUgYWxyZWFkeSBiZWNvbWUgYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBvZmZcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uUmVhZHkoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodGhpcy5fcGx1Z2luc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdHRlci5vbignaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnQgdmFyIElvbmljUGxhdGZvcm0gPSBuZXcgSW9uaWNQbGF0Zm9ybUNvcmUoKTtcbiIsInZhciBkYXRhVHlwZU1hcHBpbmcgPSB7fTtcbmV4cG9ydCBjbGFzcyBEYXRhVHlwZVNjaGVtYSB7XG4gICAgY29uc3RydWN0b3IocHJvcGVydGllcykge1xuICAgICAgICB0aGlzLmRhdGEgPSB7fTtcbiAgICAgICAgdGhpcy5zZXRQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuICAgIH1cbiAgICBzZXRQcm9wZXJ0aWVzKHByb3BlcnRpZXMpIHtcbiAgICAgICAgaWYgKHByb3BlcnRpZXMgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHggaW4gcHJvcGVydGllcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YVt4XSA9IHByb3BlcnRpZXNbeF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdG9KU09OKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdfX0lvbmljX0RhdGFUeXBlU2NoZW1hJzogZGF0YS5uYW1lLFxuICAgICAgICAgICAgJ3ZhbHVlJzogZGF0YS52YWx1ZVxuICAgICAgICB9O1xuICAgIH1cbiAgICBpc1ZhbGlkKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLm5hbWUgJiYgdGhpcy5kYXRhLnZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIERhdGFUeXBlIHtcbiAgICBzdGF0aWMgZ2V0KG5hbWUsIHZhbHVlKSB7XG4gICAgICAgIGlmIChkYXRhVHlwZU1hcHBpbmdbbmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgZGF0YVR5cGVNYXBwaW5nW25hbWVdKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHN0YXRpYyBnZXRNYXBwaW5nKCkge1xuICAgICAgICByZXR1cm4gZGF0YVR5cGVNYXBwaW5nO1xuICAgIH1cbiAgICBzdGF0aWMgZ2V0IFNjaGVtYSgpIHtcbiAgICAgICAgcmV0dXJuIERhdGFUeXBlU2NoZW1hO1xuICAgIH1cbiAgICBzdGF0aWMgcmVnaXN0ZXIobmFtZSwgY2xzKSB7XG4gICAgICAgIGRhdGFUeXBlTWFwcGluZ1tuYW1lXSA9IGNscztcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgVW5pcXVlQXJyYXkge1xuICAgIGNvbnN0cnVjdG9yKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IFtdO1xuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgZm9yICh2YXIgeCBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMucHVzaCh2YWx1ZVt4XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdG9KU09OKCkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZGF0YTtcbiAgICAgICAgdmFyIHNjaGVtYSA9IG5ldyBEYXRhVHlwZVNjaGVtYSh7ICduYW1lJzogJ1VuaXF1ZUFycmF5JywgJ3ZhbHVlJzogZGF0YSB9KTtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS50b0pTT04oKTtcbiAgICB9XG4gICAgc3RhdGljIGZyb21TdG9yYWdlKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBuZXcgVW5pcXVlQXJyYXkodmFsdWUpO1xuICAgIH1cbiAgICBwdXNoKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5kZXhPZih2YWx1ZSkgPT09IC0xKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHVsbCh2YWx1ZSkge1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLmRhdGEuaW5kZXhPZih2YWx1ZSk7XG4gICAgICAgIHRoaXMuZGF0YS5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIH1cbn1cbkRhdGFUeXBlLnJlZ2lzdGVyKCdVbmlxdWVBcnJheScsIFVuaXF1ZUFycmF5KTtcbiIsImltcG9ydCB7IEV2ZW50RW1pdHRlciBhcyBfRXZlbnRFbWl0dGVyIH0gZnJvbSBcImV2ZW50c1wiO1xuZXhwb3J0IGNsYXNzIEV2ZW50RW1pdHRlciB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgX0V2ZW50RW1pdHRlcigpO1xuICAgIH1cbiAgICBvbihldmVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oZXZlbnQsIGNhbGxiYWNrKTtcbiAgICB9XG4gICAgZW1pdChsYWJlbCwgZGF0YSA9IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIuZW1pdChsYWJlbCwgZGF0YSk7XG4gICAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vYXBwXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9jb3JlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9kYXRhLXR5cGVzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9ldmVudHNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2xvZ2dlclwiO1xuZXhwb3J0ICogZnJvbSBcIi4vcHJvbWlzZVwiO1xuZXhwb3J0ICogZnJvbSBcIi4vcmVxdWVzdFwiO1xuZXhwb3J0ICogZnJvbSBcIi4vY29uZmlnXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zdG9yYWdlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi91c2VyXCI7XG4iLCJleHBvcnQgY2xhc3MgTG9nZ2VyIHtcbiAgICBjb25zdHJ1Y3RvcihvcHRzKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gb3B0cyB8fCB7fTtcbiAgICAgICAgdGhpcy5fc2lsZW5jZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9wcmVmaXggPSBudWxsO1xuICAgICAgICB0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgdGhpcy5fYm9vdHN0cmFwKCk7XG4gICAgfVxuICAgIHNpbGVuY2UoKSB7XG4gICAgICAgIHRoaXMuX3NpbGVuY2UgPSB0cnVlO1xuICAgIH1cbiAgICB2ZXJib3NlKCkge1xuICAgICAgICB0aGlzLl9zaWxlbmNlID0gZmFsc2U7XG4gICAgfVxuICAgIF9ib290c3RyYXAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9vcHRpb25zLnByZWZpeCkge1xuICAgICAgICAgICAgdGhpcy5fcHJlZml4ID0gdGhpcy5fb3B0aW9ucy5wcmVmaXg7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaW5mbyhkYXRhKSB7XG4gICAgICAgIGlmICghdGhpcy5fc2lsZW5jZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3ByZWZpeCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHRoaXMuX3ByZWZpeCwgZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB3YXJuKGRhdGEpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zaWxlbmNlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5fcHJlZml4LCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGVycm9yKGRhdGEpIHtcbiAgICAgICAgaWYgKHRoaXMuX3ByZWZpeCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcih0aGlzLl9wcmVmaXgsIGRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihkYXRhKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7IFByb21pc2UgYXMgRVM2UHJvbWlzZSB9IGZyb20gXCJlczYtcHJvbWlzZVwiO1xuZXhwb3J0IGNsYXNzIERlZmVycmVkUHJvbWlzZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5fdXBkYXRlID0gZmFsc2U7XG4gICAgICAgIHRoaXMucHJvbWlzZSA9IG5ldyBFUzZQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIHNlbGYucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgICAgICBzZWxmLnJlamVjdCA9IHJlamVjdDtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBvcmlnaW5hbFRoZW4gPSB0aGlzLnByb21pc2UudGhlbjtcbiAgICAgICAgdGhpcy5wcm9taXNlLnRoZW4gPSBmdW5jdGlvbiAob2ssIGZhaWwsIHVwZGF0ZSkge1xuICAgICAgICAgICAgc2VsZi5fdXBkYXRlID0gdXBkYXRlO1xuICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsVGhlbi5jYWxsKHNlbGYucHJvbWlzZSwgb2ssIGZhaWwpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBub3RpZnkodmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuX3VwZGF0ZSAmJiAodHlwZW9mIHRoaXMuX3VwZGF0ZSA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHRoaXMuX3VwZGF0ZSh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJpbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi9wcm9taXNlXCI7XG5pbXBvcnQgeyBBdXRoIH0gZnJvbSBcIi4uL2F1dGgvYXV0aFwiO1xuaW1wb3J0IHJlcXVlc3QgZnJvbSBcImJyb3dzZXItcmVxdWVzdFwiO1xuZXhwb3J0IGNsYXNzIFJlcXVlc3Qge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBSZXNwb25zZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIEFQSVJlc3BvbnNlIGV4dGVuZHMgUmVzcG9uc2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcigpO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBBUElSZXF1ZXN0IGV4dGVuZHMgUmVxdWVzdCB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XG4gICAgICAgIGlmICghb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24pIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IEF1dGguZ2V0VXNlclRva2VuKCk7XG4gICAgICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmhlYWRlcnMuQXV0aG9yaXphdGlvbiA9ICdCZWFyZXIgJyArIHRva2VuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXF1ZXN0SW5mbyA9IHt9O1xuICAgICAgICB2YXIgcCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgcmVxdWVzdChvcHRpb25zLCBmdW5jdGlvbiAoZXJyLCByZXNwb25zZSwgcmVzdWx0KSB7XG4gICAgICAgICAgICByZXF1ZXN0SW5mby5fbGFzdEVycm9yID0gZXJyO1xuICAgICAgICAgICAgcmVxdWVzdEluZm8uX2xhc3RSZXNwb25zZSA9IHJlc3BvbnNlO1xuICAgICAgICAgICAgcmVxdWVzdEluZm8uX2xhc3RSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1c0NvZGUgPj0gNDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfZXJyID0gbmV3IEVycm9yKFwiUmVxdWVzdCBGYWlsZWQgd2l0aCBzdGF0dXMgY29kZSBvZiBcIiArIHJlc3BvbnNlLnN0YXR1c0NvZGUpO1xuICAgICAgICAgICAgICAgICAgICBwLnJlamVjdCh7ICdyZXNwb25zZSc6IHJlc3BvbnNlLCAnZXJyb3InOiBfZXJyIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcC5yZXNvbHZlKHsgJ3Jlc3BvbnNlJzogcmVzcG9uc2UsICdwYXlsb2FkJzogcmVzdWx0IH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHAucmVxdWVzdEluZm8gPSByZXF1ZXN0SW5mbztcbiAgICAgICAgcmV0dXJuIHAucHJvbWlzZTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tIFwiLi9wcm9taXNlXCI7XG5leHBvcnQgY2xhc3MgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgfVxuICAgIGdldChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH1cbiAgICByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIHZhbHVlKTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5IHtcbiAgICBnZXQoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH1cbiAgICByZW1vdmUoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LnNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG4gICAgfVxufVxudmFyIG9iamVjdENhY2hlID0ge307XG52YXIgbWVtb3J5TG9ja3MgPSB7fTtcbmV4cG9ydCBjbGFzcyBTdG9yYWdlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneSA9IG5ldyBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5KCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFN0b3JlcyBhbiBvYmplY3QgaW4gbG9jYWwgc3RvcmFnZSB1bmRlciB0aGUgZ2l2ZW4ga2V5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSBOYW1lIG9mIHRoZSBrZXkgdG8gc3RvcmUgdmFsdWVzIGluXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHN0b3JlIHdpdGggdGhlIGtleVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc3RvcmVPYmplY3Qoa2V5LCBvYmplY3QpIHtcbiAgICAgICAgLy8gQ29udmVydCBvYmplY3QgdG8gSlNPTiBhbmQgc3RvcmUgaW4gbG9jYWxTdG9yYWdlXG4gICAgICAgIHZhciBqc29uID0gSlNPTi5zdHJpbmdpZnkob2JqZWN0KTtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5zZXQoa2V5LCBqc29uKTtcbiAgICAgICAgLy8gVGhlbiBzdG9yZSBpdCBpbiB0aGUgb2JqZWN0IGNhY2hlXG4gICAgICAgIG9iamVjdENhY2hlW2tleV0gPSBvYmplY3Q7XG4gICAgfVxuICAgIGRlbGV0ZU9iamVjdChrZXkpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5yZW1vdmUoa2V5KTtcbiAgICAgICAgZGVsZXRlIG9iamVjdENhY2hlW2tleV07XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEVpdGhlciByZXRyaWV2ZXMgdGhlIGNhY2hlZCBjb3B5IG9mIGFuIG9iamVjdCxcbiAgICAgKiBvciB0aGUgb2JqZWN0IGl0c2VsZiBmcm9tIGxvY2FsU3RvcmFnZS5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBuYW1lIG9mIHRoZSBrZXkgdG8gcHVsbCBmcm9tXG4gICAgICogQHJldHVybiB7bWl4ZWR9IFJldHVybnMgdGhlIHByZXZpb3VzbHkgc3RvcmVkIE9iamVjdCBvciBudWxsXG4gICAgICovXG4gICAgcmV0cmlldmVPYmplY3Qoa2V5KSB7XG4gICAgICAgIC8vIEZpcnN0IGNoZWNrIHRvIHNlZSBpZiBpdCdzIHRoZSBvYmplY3QgY2FjaGVcbiAgICAgICAgdmFyIGNhY2hlZCA9IG9iamVjdENhY2hlW2tleV07XG4gICAgICAgIGlmIChjYWNoZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWQ7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRGVzZXJpYWxpemUgdGhlIG9iamVjdCBmcm9tIEpTT05cbiAgICAgICAgdmFyIGpzb24gPSB0aGlzLnN0cmF0ZWd5LmdldChrZXkpO1xuICAgICAgICAvLyBudWxsIG9yIHVuZGVmaW5lZCAtLT4gcmV0dXJuIG51bGwuXG4gICAgICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoanNvbik7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogTG9ja3MgdGhlIGFzeW5jIGNhbGwgcmVwcmVzZW50ZWQgYnkgdGhlIGdpdmVuIHByb21pc2UgYW5kIGxvY2sga2V5LlxuICAgICAqIE9ubHkgb25lIGFzeW5jRnVuY3Rpb24gZ2l2ZW4gYnkgdGhlIGxvY2tLZXkgY2FuIGJlIHJ1bm5pbmcgYXQgYW55IHRpbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbG9ja0tleSBzaG91bGQgYmUgYSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBuYW1lIG9mIHRoaXMgYXN5bmMgY2FsbC5cbiAgICAgKiAgICAgICAgVGhpcyBpcyByZXF1aXJlZCBmb3IgcGVyc2lzdGVuY2UuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gYXN5bmNGdW5jdGlvbiBSZXR1cm5zIGEgcHJvbWlzZSBvZiB0aGUgYXN5bmMgY2FsbC5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gQSBuZXcgcHJvbWlzZSwgaWRlbnRpY2FsIHRvIHRoZSBvbmUgcmV0dXJuZWQgYnkgYXN5bmNGdW5jdGlvbixcbiAgICAgKiAgICAgICAgICBidXQgd2l0aCB0d28gbmV3IGVycm9yczogJ2luX3Byb2dyZXNzJywgYW5kICdsYXN0X2NhbGxfaW50ZXJydXB0ZWQnLlxuICAgICAqL1xuICAgIGxvY2tlZEFzeW5jQ2FsbChsb2NrS2V5LCBhc3luY0Z1bmN0aW9uKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICAvLyBJZiB0aGUgbWVtb3J5IGxvY2sgaXMgc2V0LCBlcnJvciBvdXQuXG4gICAgICAgIGlmIChtZW1vcnlMb2Nrc1tsb2NrS2V5XSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdpbl9wcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzdG9yZWQgbG9jayBidXQgbm8gbWVtb3J5IGxvY2ssIGZsYWcgYSBwZXJzaXN0ZW5jZSBlcnJvclxuICAgICAgICBpZiAodGhpcy5zdHJhdGVneS5nZXQobG9ja0tleSkgPT09ICdsb2NrZWQnKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpO1xuICAgICAgICAgICAgZGVmZXJyZWQucHJvbWlzZS50aGVuKG51bGwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2V0IHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgIG1lbW9yeUxvY2tzW2xvY2tLZXldID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5zdHJhdGVneS5zZXQobG9ja0tleSwgJ2xvY2tlZCcpO1xuICAgICAgICAvLyBQZXJmb3JtIHRoZSBhc3luYyBvcGVyYXRpb25cbiAgICAgICAgYXN5bmNGdW5jdGlvbigpLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3NEYXRhKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHN1Y2Nlc3NEYXRhKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdG9yZWQgYW5kIG1lbW9yeSBsb2Nrc1xuICAgICAgICAgICAgZGVsZXRlIG1lbW9yeUxvY2tzW2xvY2tLZXldO1xuICAgICAgICAgICAgc2VsZi5zdHJhdGVneS5yZW1vdmUobG9ja0tleSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvckRhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvckRhdGEpO1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgICAgICBkZWxldGUgbWVtb3J5TG9ja3NbbG9ja0tleV07XG4gICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5vdGlmeURhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShub3RpZnlEYXRhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IEF1dGggfSBmcm9tIFwiLi4vYXV0aC9hdXRoXCI7XG5pbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4vcmVxdWVzdFwiO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSBcIi4vcHJvbWlzZVwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuL2NvcmVcIjtcbmltcG9ydCB7IFN0b3JhZ2UgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi9sb2dnZXJcIjtcbmltcG9ydCB7IERhdGFUeXBlIH0gZnJvbSBcIi4vZGF0YS10eXBlc1wiO1xudmFyIEFwcFVzZXJDb250ZXh0ID0gbnVsbDtcbnZhciBzdG9yYWdlID0gbmV3IFN0b3JhZ2UoKTtcbnZhciB1c2VyQVBJQmFzZSA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL2F1dGgvdXNlcnMnO1xudmFyIHVzZXJBUElFbmRwb2ludHMgPSB7XG4gICAgJ3NlbGYnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvc2VsZic7XG4gICAgfSxcbiAgICAnZ2V0JzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAncmVtb3ZlJzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAnc2F2ZSc6IGZ1bmN0aW9uICh1c2VyTW9kZWwpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy8nICsgdXNlck1vZGVsLmlkO1xuICAgIH0sXG4gICAgJ3Bhc3N3b3JkUmVzZXQnOiBmdW5jdGlvbiAodXNlck1vZGVsKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvJyArIHVzZXJNb2RlbC5pZCArICcvcGFzc3dvcmQtcmVzZXQnO1xuICAgIH1cbn07XG5jbGFzcyBVc2VyQ29udGV4dCB7XG4gICAgc3RhdGljIGdldCBsYWJlbCgpIHtcbiAgICAgICAgcmV0dXJuIFwiaW9uaWNfaW9fdXNlcl9cIiArIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgfVxuICAgIHN0YXRpYyBkZWxldGUoKSB7XG4gICAgICAgIHN0b3JhZ2UuZGVsZXRlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKTtcbiAgICB9XG4gICAgc3RhdGljIHN0b3JlKCkge1xuICAgICAgICBpZiAoVXNlckNvbnRleHQuZ2V0UmF3RGF0YSgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEoVXNlckNvbnRleHQuZ2V0UmF3RGF0YSgpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoVXNlci5jdXJyZW50KCkuZGF0YS5kYXRhLl9faW9uaWNfdXNlcl9taWdyYXRlZCkge1xuICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JywgeyAnX19pb25pY191c2VyX21pZ3JhdGVkJzogdHJ1ZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBzdG9yYWdlLnN0b3JlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsLCBVc2VyLmN1cnJlbnQoKSk7XG4gICAgfVxuICAgIHN0YXRpYyBzdG9yZUxlZ2FjeURhdGEoZGF0YSkge1xuICAgICAgICBpZiAoIVVzZXJDb250ZXh0LmdldFJhd0xlZ2FjeURhdGEoKSkge1xuICAgICAgICAgICAgc3RvcmFnZS5zdG9yZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCArICdfbGVnYWN5JywgZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0RhdGEoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGdldFJhd0xlZ2FjeURhdGEoKSB7XG4gICAgICAgIHJldHVybiBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsICsgJ19sZWdhY3knKSB8fCBmYWxzZTtcbiAgICB9XG4gICAgc3RhdGljIGxvYWQoKSB7XG4gICAgICAgIHZhciBkYXRhID0gc3RvcmFnZS5yZXRyaWV2ZU9iamVjdChVc2VyQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5zdG9yZUxlZ2FjeURhdGEoZGF0YSk7XG4gICAgICAgICAgICByZXR1cm4gVXNlci5mcm9tQ29udGV4dChkYXRhKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhIHtcbiAgICBjb25zdHJ1Y3RvcihkYXRhID0ge30pIHtcbiAgICAgICAgdGhpcy5kYXRhID0ge307XG4gICAgICAgIGlmICgodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICAgICAgICAgIHRoaXMuZGVzZXJpYWxpemVyRGF0YVR5cGVzKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZGVzZXJpYWxpemVyRGF0YVR5cGVzKCkge1xuICAgICAgICBmb3IgKHZhciB4IGluIHRoaXMuZGF0YSkge1xuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSBhbiBvYmplY3QsIGxldCdzIGNoZWNrIGZvciBjdXN0b20gZGF0YSB0eXBlc1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLmRhdGFbeF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gd2UgaGF2ZSBhIGN1c3RvbSB0eXBlP1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGFbeF0uX19Jb25pY19EYXRhVHlwZVNjaGVtYSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmFtZSA9IHRoaXMuZGF0YVt4XS5fX0lvbmljX0RhdGFUeXBlU2NoZW1hO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWFwcGluZyA9IERhdGFUeXBlLmdldE1hcHBpbmcoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hcHBpbmdbbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGhhdmUgYSBjdXN0b20gdHlwZSBhbmQgYSByZWdpc3RlcmVkIGNsYXNzLCBnaXZlIHRoZSBjdXN0b20gZGF0YSB0eXBlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmcm9tIHN0b3JhZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YVt4XSA9IG1hcHBpbmdbbmFtZV0uZnJvbVN0b3JhZ2UodGhpcy5kYXRhW3hdLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICB0aGlzLmRhdGFba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICB1bnNldChrZXkpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YVtrZXldO1xuICAgIH1cbiAgICBnZXQoa2V5LCBkZWZhdWx0VmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kYXRhW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoZGVmYXVsdFZhbHVlID09PSAwIHx8IGRlZmF1bHRWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZSB8fCBudWxsO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFVzZXIge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBVc2VyOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tEZWxldGUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZGlydHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZnJlc2ggPSB0cnVlO1xuICAgICAgICB0aGlzLl91bnNldCA9IHt9O1xuICAgICAgICB0aGlzLmRhdGEgPSBuZXcgVXNlckRhdGEoKTtcbiAgICB9XG4gICAgaXNEaXJ0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RpcnR5O1xuICAgIH1cbiAgICBpc0Fub255bW91cygpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpc0F1dGhlbnRpY2F0ZWQoKSB7XG4gICAgICAgIGlmICh0aGlzID09PSBVc2VyLmN1cnJlbnQoKSkge1xuICAgICAgICAgICAgcmV0dXJuIEF1dGguaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzdGF0aWMgY3VycmVudCh1c2VyID0gbnVsbCkge1xuICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSB1c2VyO1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmUoKTtcbiAgICAgICAgICAgIHJldHVybiBBcHBVc2VyQ29udGV4dDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghQXBwVXNlckNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBBcHBVc2VyQ29udGV4dCA9IFVzZXJDb250ZXh0LmxvYWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghQXBwVXNlckNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBBcHBVc2VyQ29udGV4dCA9IG5ldyBVc2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gQXBwVXNlckNvbnRleHQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIGZyb21Db250ZXh0KGRhdGEpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBuZXcgVXNlcigpO1xuICAgICAgICB1c2VyLmlkID0gZGF0YS5faWQ7XG4gICAgICAgIHVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShkYXRhLmRhdGEuZGF0YSk7XG4gICAgICAgIHVzZXIuZGV0YWlscyA9IGRhdGEuZGV0YWlscyB8fCB7fTtcbiAgICAgICAgdXNlci5fZnJlc2ggPSBkYXRhLl9mcmVzaDtcbiAgICAgICAgdXNlci5fZGlydHkgPSBkYXRhLl9kaXJ0eTtcbiAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgfVxuICAgIHN0YXRpYyBzZWxmKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB0ZW1wVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIGlmICghdGVtcFVzZXIuX2Jsb2NrTG9hZCkge1xuICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IHRydWU7XG4gICAgICAgICAgICBuZXcgQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMuc2VsZigpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnbG9hZGVkIHVzZXInKTtcbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGN1c3RvbSBkYXRhXG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuaWQgPSByZXN1bHQucGF5bG9hZC5kYXRhLnV1aWQ7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShyZXN1bHQucGF5bG9hZC5kYXRhLmN1c3RvbSk7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGV0YWlscyA9IHJlc3VsdC5wYXlsb2FkLmRhdGEuZGV0YWlscztcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBVc2VyLmN1cnJlbnQodGVtcFVzZXIpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodGVtcFVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oXCJhIGxvYWQgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yIFwiICsgdGhpcyArIFwiLlwiKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHN0YXRpYyBsb2FkKGlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHRlbXBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICAgICAgdGVtcFVzZXIuaWQgPSBpZDtcbiAgICAgICAgaWYgKCF0ZW1wVXNlci5fYmxvY2tMb2FkKSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gdHJ1ZTtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogdXNlckFQSUVuZHBvaW50cy5nZXQodGVtcFVzZXIpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnbG9hZGVkIHVzZXInKTtcbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGN1c3RvbSBkYXRhXG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShyZXN1bHQucGF5bG9hZC5kYXRhLmN1c3RvbSk7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuZGV0YWlscyA9IHJlc3VsdC5wYXlsb2FkLmRhdGEuZGV0YWlscztcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fZnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRlbXBVc2VyKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5pbmZvKFwiYSBsb2FkIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciBcIiArIHRoaXMgKyBcIi5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICBpc0ZyZXNoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZnJlc2g7XG4gICAgfVxuICAgIGlzVmFsaWQoKSB7XG4gICAgICAgIGlmICh0aGlzLmlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGdldEFQSUZvcm1hdCgpIHtcbiAgICAgICAgdmFyIGFwaUZvcm1hdCA9IHt9O1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kZXRhaWxzKSB7XG4gICAgICAgICAgICBhcGlGb3JtYXRba2V5XSA9IHRoaXMuZGV0YWlsc1trZXldO1xuICAgICAgICB9XG4gICAgICAgIGFwaUZvcm1hdC5jdXN0b20gPSB0aGlzLmRhdGEuZGF0YTtcbiAgICAgICAgcmV0dXJuIGFwaUZvcm1hdDtcbiAgICB9XG4gICAgZ2V0Rm9ybWF0KGZvcm1hdCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBudWxsO1xuICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgICAgY2FzZSAnYXBpLXNhdmUnOlxuICAgICAgICAgICAgICAgIGZvcm1hdHRlZCA9IHNlbGYuZ2V0QVBJRm9ybWF0KCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG4gICAgbWlncmF0ZSgpIHtcbiAgICAgICAgdmFyIHJhd0RhdGEgPSBVc2VyQ29udGV4dC5nZXRSYXdMZWdhY3lEYXRhKCk7XG4gICAgICAgIGlmIChyYXdEYXRhLl9faW9uaWNfdXNlcl9taWdyYXRlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJhd0RhdGEpIHtcbiAgICAgICAgICAgIHZhciBjdXJyZW50VXNlciA9IElvbmljLlVzZXIuY3VycmVudCgpO1xuICAgICAgICAgICAgdmFyIHVzZXJEYXRhID0gbmV3IFVzZXJEYXRhKHJhd0RhdGEuZGF0YS5kYXRhKTtcbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiB1c2VyRGF0YS5kYXRhKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFVzZXIuc2V0KGtleSwgdXNlckRhdGEuZGF0YVtrZXldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN1cnJlbnRVc2VyLnNldCgnX19pb25pY191c2VyX21pZ3JhdGVkJywgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZGVsZXRlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgaWYgKCFzZWxmLmlzVmFsaWQoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tEZWxldGUpIHtcbiAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlbGYuX2RlbGV0ZSgpO1xuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnJlbW92ZSh0aGlzKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ0RFTEVURScsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2RlbGV0ZWQgJyArIHNlbGYpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oXCJhIGRlbGV0ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgXCIgKyB0aGlzICsgXCIuXCIpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgX3N0b3JlKCkge1xuICAgICAgICBpZiAodGhpcyA9PT0gVXNlci5jdXJyZW50KCkpIHtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgX2RlbGV0ZSgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5kZWxldGUoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzYXZlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgaWYgKCFzZWxmLl9ibG9ja1NhdmUpIHtcbiAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLl9zdG9yZSgpO1xuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnNhdmUodGhpcyksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdQQVRDSCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiBzZWxmLmdldEZvcm1hdCgnYXBpLXNhdmUnKVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGlydHkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGYuaXNGcmVzaCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX3Vuc2V0ID0ge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGYuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc2F2ZWQgdXNlcicpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2RpcnR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImEgc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyBmb3IgXCIgKyB0aGlzICsgXCIuXCIpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgcmVzZXRQYXNzd29yZCgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnBhc3N3b3JkUmVzZXQodGhpcyksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncGFzc3dvcmQgcmVzZXQgZm9yIHVzZXInKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHNldCBpZCh2KSB7XG4gICAgICAgIHRoaXMuX2lkID0gdjtcbiAgICB9XG4gICAgZ2V0IGlkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faWQgfHwgbnVsbDtcbiAgICB9XG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiAnPElvbmljVXNlciBbXFwnJyArIHRoaXMuaWQgKyAnXFwnXT4nO1xuICAgIH1cbiAgICBzZXQoa2V5LCB2YWx1ZSkge1xuICAgICAgICBkZWxldGUgdGhpcy5fdW5zZXRba2V5XTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgfVxuICAgIGdldChrZXksIGRlZmF1bHRWYWx1ZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhLmdldChrZXksIGRlZmF1bHRWYWx1ZSk7XG4gICAgfVxuICAgIHVuc2V0KGtleSkge1xuICAgICAgICB0aGlzLl91bnNldFtrZXldID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS51bnNldChrZXkpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCIuLi9jb3JlL2V2ZW50c1wiO1xudmFyIE5PX1BMVUdJTiA9IFwiSU9OSUNfREVQTE9ZX01JU1NJTkdfUExVR0lOXCI7XG52YXIgSU5JVElBTF9ERUxBWSA9IDEgKiA1ICogMTAwMDtcbnZhciBXQVRDSF9JTlRFUlZBTCA9IDEgKiA2MCAqIDEwMDA7XG5leHBvcnQgY2xhc3MgRGVwbG95IHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBEZXBsb3k6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fcGx1Z2luID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY2hhbm5lbFRhZyA9ICdwcm9kdWN0aW9uJztcbiAgICAgICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbyhcImluaXRcIik7XG4gICAgICAgIElvbmljUGxhdGZvcm0ub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmluaXRpYWxpemUoKTtcbiAgICAgICAgICAgIHNlbGYuX2lzUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5lbWl0KCdpb25pY19kZXBsb3k6cmVhZHknKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBEZXBsb3kgUGx1Z2luXG4gICAgICpcbiAgICAgKiBJZiB0aGUgcGx1Z2luIGhhcyBub3QgYmVlbiBzZXQgeWV0LCBhdHRlbXB0IHRvIGZldGNoIGl0LCBvdGhlcndpc2UgbG9nXG4gICAgICogYSBtZXNzYWdlLlxuICAgICAqXG4gICAgICogQHJldHVybiB7SW9uaWNEZXBsb3l9IFJldHVybnMgdGhlIHBsdWdpbiBvciBmYWxzZVxuICAgICAqL1xuICAgIF9nZXRQbHVnaW4oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wbHVnaW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wbHVnaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBJb25pY0RlcGxveSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3BsdWdpbiBpcyBub3QgaW5zdGFsbGVkIG9yIGhhcyBub3QgbG9hZGVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgaW9uaWMtcGx1Z2luLWRlcGxveWAgeWV0PycpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IElvbmljRGVwbG95O1xuICAgICAgICByZXR1cm4gSW9uaWNEZXBsb3k7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgdGhlIERlcGxveSBQbHVnaW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluaXRpYWxpemUoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbml0KElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2hlY2sgZm9yIHVwZGF0ZXNcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFdpbGwgcmVzb2x2ZSB3aXRoIHRydWUgaWYgYW4gdXBkYXRlIGlzIGF2YWlsYWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLiBBIHN0cmluZyBvclxuICAgICAqICAgZXJyb3Igd2lsbCBiZSBwYXNzZWQgdG8gcmVqZWN0KCkgaW4gdGhlIGV2ZW50IG9mIGEgZmFpbHVyZS5cbiAgICAgKi9cbiAgICBjaGVjaygpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uY2hlY2soSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgc2VsZi5fY2hhbm5lbFRhZywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCA9PT0gXCJ0cnVlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FuIHVwZGF0ZSBpcyBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdubyB1cGRhdGVzIGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ2VuY291bnRlcmVkIGFuIGVycm9yIHdoaWxlIGNoZWNraW5nIGZvciB1cGRhdGVzJyk7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBEb3dubG9hZCBhbmQgYXZhaWxhYmxlIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGV4dHJhY3QoKVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSBwcm9taXNlIHdoaWNoIHdpbGwgcmVzb2x2ZSB3aXRoIHRydWUvZmFsc2Ugb3IgdXNlXG4gICAgICogICAgbm90aWZ5IHRvIHVwZGF0ZSB0aGUgZG93bmxvYWQgcHJvZ3Jlc3MuXG4gICAgICovXG4gICAgZG93bmxvYWQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRvd25sb2FkKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gJ3RydWUnICYmIHJlc3VsdCAhPT0gJ2ZhbHNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiZG93bmxvYWQgY29tcGxldGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCA9PT0gJ3RydWUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRXh0cmFjdCB0aGUgbGFzdCBkb3dubG9hZGVkIHVwZGF0ZVxuICAgICAqXG4gICAgICogVGhpcyBzaG91bGQgYmUgY2FsbGVkIGFmdGVyIGEgZG93bmxvYWQoKSBzdWNjZXNzZnVsbHkgcmVzb2x2ZXMuXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHByb21pc2Ugd2hpY2ggd2lsbCByZXNvbHZlIHdpdGggdHJ1ZS9mYWxzZSBvciB1c2VcbiAgICAgKiAgICAgICAgICAgICAgICAgICBub3RpZnkgdG8gdXBkYXRlIHRoZSBleHRyYWN0aW9uIHByb2dyZXNzLlxuICAgICAqL1xuICAgIGV4dHJhY3QoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmV4dHJhY3QoSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAnZG9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImV4dHJhY3Rpb24gY29tcGxldGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIExvYWQgdGhlIGxhdGVzdCBkZXBsb3llZCB2ZXJzaW9uXG4gICAgICogVGhpcyBpcyBvbmx5IG5lY2Vzc2FyeSB0byBjYWxsIGlmIHlvdSBoYXZlIG1hbnVhbGx5IGRvd25sb2FkZWQgYW5kIGV4dHJhY3RlZFxuICAgICAqIGFuIHVwZGF0ZSBhbmQgd2lzaCB0byByZWxvYWQgdGhlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95LiBUaGUgbGF0ZXN0IGRlcGxveVxuICAgICAqIHdpbGwgYXV0b21hdGljYWxseSBiZSBsb2FkZWQgd2hlbiB0aGUgYXBwIGlzIHN0YXJ0ZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGxvYWQoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5yZWRpcmVjdChJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdhdGNoIGNvbnN0YW50bHkgY2hlY2tzIGZvciB1cGRhdGVzLCBhbmQgdHJpZ2dlcnMgYW5cbiAgICAgKiBldmVudCB3aGVuIG9uZSBpcyByZWFkeS5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBXYXRjaCBjb25maWd1cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdpbGwgZ2V0IGEgbm90aWZ5KCkgY2FsbGJhY2sgd2hlbiBhbiB1cGRhdGUgaXMgYXZhaWxhYmxlXG4gICAgICovXG4gICAgd2F0Y2gob3B0aW9ucykge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodHlwZW9mIG9wdHMuaW5pdGlhbERlbGF5ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgb3B0cy5pbml0aWFsRGVsYXkgPSBJTklUSUFMX0RFTEFZO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5pbnRlcnZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG9wdHMuaW50ZXJ2YWwgPSBXQVRDSF9JTlRFUlZBTDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBjaGVja0ZvclVwZGF0ZXMoKSB7XG4gICAgICAgICAgICBzZWxmLmNoZWNrKCkudGhlbihmdW5jdGlvbiAoaGFzVXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhc1VwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoaGFzVXBkYXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5hYmxlIHRvIGNoZWNrIGZvciB1cGRhdGVzOiAnICsgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQ2hlY2sgb3VyIHRpbWVvdXQgdG8gbWFrZSBzdXJlIGl0IHdhc24ndCBjbGVhcmVkIHdoaWxlIHdlIHdlcmUgd2FpdGluZ1xuICAgICAgICAgICAgLy8gZm9yIGEgc2VydmVyIHJlc3BvbnNlXG4gICAgICAgICAgICBpZiAodGhpcy5fY2hlY2tUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbnRlcnZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgYWZ0ZXIgYW4gaW5pdGlhbCBzaG9ydCBkZXBsYXlcbiAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbml0aWFsRGVsYXkpO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU3RvcCBhdXRvbWF0aWNhbGx5IGxvb2tpbmcgZm9yIHVwZGF0ZXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVud2F0Y2goKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9jaGVja1RpbWVvdXQpO1xuICAgICAgICB0aGlzLl9jaGVja1RpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBJbmZvcm1hdGlvbiBhYm91dCB0aGUgY3VycmVudCBkZXBsb3lcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFRoZSByZXNvbHZlciB3aWxsIGJlIHBhc3NlZCBhbiBvYmplY3QgdGhhdCBoYXMga2V5L3ZhbHVlXG4gICAgICogICAgcGFpcnMgcGVydGFpbmluZyB0byB0aGUgY3VycmVudGx5IGRlcGxveWVkIHVwZGF0ZS5cbiAgICAgKi9cbiAgICBpbmZvKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5pbmZvKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBMaXN0IHRoZSBEZXBsb3kgdmVyc2lvbnMgdGhhdCBoYXZlIGJlZW4gaW5zdGFsbGVkIG9uIHRoaXMgZGV2aWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVzb2x2ZXIgd2lsbCBiZSBwYXNzZWQgYW4gYXJyYXkgb2YgZGVwbG95IHV1aWRzXG4gICAgICovXG4gICAgZ2V0VmVyc2lvbnMoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldFZlcnNpb25zKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYW4gaW5zdGFsbGVkIGRlcGxveSBvbiB0aGlzIGRldmljZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHV1aWQgVGhlIGRlcGxveSB1dWlkIHlvdSB3aXNoIHRvIHJlbW92ZSBmcm9tIHRoZSBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBTdGFuZGFyZCByZXNvbHZlL3JlamVjdCByZXNvbHV0aW9uXG4gICAgICovXG4gICAgZGVsZXRlVmVyc2lvbih1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmRlbGV0ZVZlcnNpb24oSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgdXVpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoZXMgdGhlIG1ldGFkYXRhIGZvciBhIGdpdmVuIGRlcGxveSB1dWlkLiBJZiBubyB1dWlkIGlzIGdpdmVuLCBpdCB3aWxsIGF0dGVtcHRcbiAgICAgKiB0byBncmFiIHRoZSBtZXRhZGF0YSBmb3IgdGhlIG1vc3QgcmVjZW50bHkga25vd24gdXBkYXRlIHZlcnNpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXVpZCBUaGUgZGVwbG95IHV1aWQgeW91IHdpc2ggdG8gZ3JhYiBtZXRhZGF0YSBmb3IsIGNhbiBiZSBsZWZ0IGJsYW5rIHRvIGdyYWIgbGF0ZXN0IGtub3duIHVwZGF0ZSBtZXRhZGF0YVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFN0YW5kYXJkIHJlc29sdmUvcmVqZWN0IHJlc29sdXRpb25cbiAgICAgKi9cbiAgICBnZXRNZXRhZGF0YSh1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldE1ldGFkYXRhKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIHV1aWQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQubWV0YWRhdGEpO1xuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGRlcGxveSBjaGFubmVsIHRoYXQgc2hvdWxkIGJlIGNoZWNrZWQgZm9yIHVwZGF0c2VcbiAgICAgKiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9kZXBsb3ktY2hhbm5lbHMgZm9yIG1vcmUgaW5mb3JtYXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsVGFnIFRoZSBjaGFubmVsIHRhZyB0byB1c2VcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldENoYW5uZWwoY2hhbm5lbFRhZykge1xuICAgICAgICB0aGlzLl9jaGFubmVsVGFnID0gY2hhbm5lbFRhZztcbiAgICB9XG4gICAgLyoqXG4gICAgICogVXBkYXRlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95XG4gICAgICogQHBhcmFtIHtib29sZWFufSBkZWZlckxvYWQgRGVmZXIgbG9hZGluZyB0aGUgYXBwbGllZCB1cGRhdGUgYWZ0ZXIgdGhlIGluc3RhbGxhdGlvblxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IEEgcHJvbWlzZSByZXN1bHRcbiAgICAgKi9cbiAgICB1cGRhdGUoZGVmZXJMb2FkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJMb2FkaW5nID0gZmFsc2U7XG4gICAgICAgIGlmICh0eXBlb2YgZGVmZXJMb2FkICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgZGVmZXJMb2FkaW5nID0gZGVmZXJMb2FkO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdXBkYXRlc1xuICAgICAgICAgICAgICAgIHNlbGYuY2hlY2soKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlcmUgYXJlIHVwZGF0ZXMsIGRvd25sb2FkIHRoZW1cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkb3dubG9hZFByb2dyZXNzID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuZG93bmxvYWQoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJkb3dubG9hZCBlcnJvclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5leHRyYWN0KCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoXCJleHRyYWN0aW9uIGVycm9yXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZGVmZXJMb2FkaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLnJlZGlyZWN0KElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICh1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHByb2dyZXNzID0gZG93bmxvYWRQcm9ncmVzcyArICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHByb2dyZXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAodXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWRQcm9ncmVzcyA9ICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoZG93bmxvYWRQcm9ncmVzcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBkZXBsb3kgaXMgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogZGVwbG95IGhhcyBhbHJlYWR5IGJlY29tZSBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb25SZWFkeShjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9pc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIub24oJ2lvbmljX2RlcGxveTpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0ICogZnJvbSBcIi4vZGVwbG95XCI7XG4iLCJleHBvcnQgKiBmcm9tIFwiLi9wdXNoLWRldlwiO1xuZXhwb3J0ICogZnJvbSBcIi4vcHVzaC1tZXNzYWdlXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wdXNoLXRva2VuXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9wdXNoXCI7XG4iLCJpbXBvcnQgeyBBUElSZXF1ZXN0IH0gZnJvbSBcIi4uL2NvcmUvcmVxdWVzdFwiO1xuaW1wb3J0IHsgSW9uaWNQbGF0Zm9ybSB9IGZyb20gXCIuLi9jb3JlL2NvcmVcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuLi9jb3JlL2xvZ2dlclwiO1xuaW1wb3J0IHsgUHVzaFRva2VuIH0gZnJvbSBcIi4vcHVzaC10b2tlblwiO1xuLyoqXG4gKiBQdXNoRGV2IFNlcnZpY2VcbiAqXG4gKiBUaGlzIHNlcnZpY2UgYWN0cyBhcyBhIG1vY2sgcHVzaCBzZXJ2aWNlIHRoYXQgaXMgaW50ZW5kZWQgdG8gYmUgdXNlZCBwcmUtc2V0dXAgb2ZcbiAqIEdDTS9BUE5TIGluIGFuIElvbmljLmlvIHByb2plY3QuXG4gKlxuICogSG93IGl0IHdvcmtzOlxuICpcbiAqICAgV2hlbiByZWdpc3RlcigpIGlzIGNhbGxlZCwgdGhpcyBzZXJ2aWNlIGlzIHVzZWQgdG8gZ2VuZXJhdGUgYSByYW5kb21cbiAqICAgZGV2ZWxvcG1lbnQgZGV2aWNlIHRva2VuLiBUaGlzIHRva2VuIGlzIG5vdCB2YWxpZCBmb3IgYW55IHNlcnZpY2Ugb3V0c2lkZSBvZlxuICogICBJb25pYyBQdXNoIHdpdGggYGRldl9wdXNoYCBzZXQgdG8gdHJ1ZS4gVGhlc2UgdG9rZW5zIGRvIG5vdCBsYXN0IGxvbmcgYW5kIGFyZSBub3RcbiAqICAgZWxpZ2libGUgZm9yIHVzZSBpbiBhIHByb2R1Y3Rpb24gYXBwLlxuICpcbiAqICAgVGhlIGRldmljZSB3aWxsIHRoZW4gcGVyaW9kaWNhbGx5IGNoZWNrIHRoZSBQdXNoIHNlcnZpY2UgZm9yIHB1c2ggbm90aWZpY2F0aW9ucyBzZW50XG4gKiAgIHRvIG91ciBkZXZlbG9wbWVudCB0b2tlbiAtLSBzbyB1bmxpa2UgYSB0eXBpY2FsIFwicHVzaFwiIHVwZGF0ZSwgdGhpcyBhY3R1YWxseSB1c2VzXG4gKiAgIFwicG9sbGluZ1wiIHRvIGZpbmQgbmV3IG5vdGlmaWNhdGlvbnMuIFRoaXMgbWVhbnMgeW91ICpNVVNUKiBoYXZlIHRoZSBhcHBsaWNhdGlvbiBvcGVuXG4gKiAgIGFuZCBpbiB0aGUgZm9yZWdyb3VuZCB0byByZXRyZWl2ZSBtZXNzc2FnZXMuXG4gKlxuICogICBUaGUgY2FsbGJhY2tzIHByb3ZpZGVkIGluIHlvdXIgaW5pdCgpIHdpbGwgc3RpbGwgYmUgdHJpZ2dlcmVkIGFzIG5vcm1hbCxcbiAqICAgYnV0IHdpdGggdGhlc2Ugbm90YWJsZSBleGNlcHRpb25zOlxuICpcbiAqICAgICAgLSBUaGVyZSBpcyBubyBwYXlsb2FkIGRhdGEgYXZhaWxhYmxlIHdpdGggbWVzc2FnZXNcbiAqICAgICAgLSBBbiBhbGVydCgpIGlzIGNhbGxlZCB3aGVuIGEgbm90aWZpY2F0aW9uIGlzIHJlY2VpdmVkIHVubGVzc3MgeW91IHJldHVybiBmYWxzZVxuICogICAgICAgIGluIHlvdXIgJ29uTm90aWZpY2F0aW9uJyBjYWxsYmFjay5cbiAqXG4gKi9cbmV4cG9ydCBjbGFzcyBQdXNoRGV2U2VydmljZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IExvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIFB1c2ggKGRldik6J1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc2VydmljZUhvc3QgPSBJb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9wdXNoJztcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl93YXRjaCA9IG51bGw7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGEgZGV2ZWxvcG1lbnQgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gZGV2ZWxvcG1lbnQgZGV2aWNlIHRva2VuXG4gICAgICovXG4gICAgZ2V0RGV2VG9rZW4oKSB7XG4gICAgICAgIC8vIFNvbWUgY3JhenkgYml0LXR3aWRkbGluZyB0byBnZW5lcmF0ZSBhIHJhbmRvbSBndWlkXG4gICAgICAgIHZhciB0b2tlbiA9ICdERVYteHh4eHh4eHgteHh4eC00eHh4LXl4eHgteHh4eHh4eHh4eHh4Jy5yZXBsYWNlKC9beHldL2csIGZ1bmN0aW9uIChjKSB7XG4gICAgICAgICAgICB2YXIgciA9IE1hdGgucmFuZG9tKCkgKiAxNiB8IDAsIHYgPSBjID09PSAneCcgPyByIDogKHIgJiAweDMgfCAweDgpO1xuICAgICAgICAgICAgcmV0dXJuIHYudG9TdHJpbmcoMTYpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbjtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgYSBkZXZlbG9wbWVudCB0b2tlbiB3aXRoIHRoZSBJb25pYyBQdXNoIHNlcnZpY2VcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7SW9uaWNQdXNoU2VydmljZX0gaW9uaWNQdXNoIEluc3RhbnRpYXRlZCBQdXNoIFNlcnZpY2VcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBSZWdpc3RyYXRpb24gQ2FsbGJhY2tcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluaXQoaW9uaWNQdXNoLCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9wdXNoID0gaW9uaWNQdXNoO1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gdGhpcy5fcHVzaC5fZW1pdHRlcjtcbiAgICAgICAgdmFyIHRva2VuID0gdGhpcy5fdG9rZW47XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmdldERldlRva2VuKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgXCJtZXRob2RcIjogJ1BPU1QnLFxuICAgICAgICAgICAgXCJ1cmlcIjogdGhpcy5fc2VydmljZUhvc3QgKyAnL2RldmVsb3BtZW50JyxcbiAgICAgICAgICAgIFwianNvblwiOiB7XG4gICAgICAgICAgICAgICAgXCJ0b2tlblwiOiB0b2tlblxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHsgXCJyZWdpc3RyYXRpb25JZFwiOiB0b2tlbiB9O1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncmVnaXN0ZXJlZCB3aXRoIGRldmVsb3BtZW50IHB1c2ggc2VydmljZTogJyArIHRva2VuKTtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIuZW1pdChcImlvbmljX3B1c2g6dG9rZW5cIiwgZGF0YSk7XG4gICAgICAgICAgICBpZiAoKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhuZXcgUHVzaFRva2VuKHNlbGYuX3Rva2VuKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxmLndhdGNoKCk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoXCJlcnJvciBjb25uZWN0aW5nIGRldmVsb3BtZW50IHB1c2ggc2VydmljZTogXCIgKyBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHB1c2ggc2VydmljZSBmb3Igbm90aWZpY2F0aW9ucyB0aGF0IHRhcmdldCB0aGUgY3VycmVudCBkZXZlbG9wbWVudCB0b2tlblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgY2hlY2tGb3JOb3RpZmljYXRpb25zKCkge1xuICAgICAgICBpZiAoIXRoaXMuX3Rva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVxdWVzdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICAnbWV0aG9kJzogJ0dFVCcsXG4gICAgICAgICAgICAndXJpJzogc2VsZi5fc2VydmljZUhvc3QgKyAnL2RldmVsb3BtZW50P3Rva2VuPScgKyBzZWxmLl90b2tlbixcbiAgICAgICAgICAgICdqc29uJzogdHJ1ZVxuICAgICAgICB9O1xuICAgICAgICBuZXcgQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucykudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0LnBheWxvYWQuZGF0YS5tZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSB7XG4gICAgICAgICAgICAgICAgICAgICdtZXNzYWdlJzogcmVzdWx0LnBheWxvYWQuZGF0YS5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAndGl0bGUnOiAnREVWRUxPUE1FTlQgUFVTSCdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLndhcm4oXCJJb25pYyBQdXNoOiBEZXZlbG9wbWVudCBQdXNoIHJlY2VpdmVkLiBEZXZlbG9wbWVudCBwdXNoZXMgd2lsbCBub3QgY29udGFpbiBwYXlsb2FkIGRhdGEuXCIpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIuZW1pdChcImlvbmljX3B1c2g6bm90aWZpY2F0aW9uXCIsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKFwidW5hYmxlIHRvIGNoZWNrIGZvciBkZXZlbG9wbWVudCBwdXNoZXM6IFwiICsgZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogS2lja3Mgb2ZmIHRoZSBcInBvbGxpbmdcIiBvZiB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlIGZvciBuZXcgcHVzaCBub3RpZmljYXRpb25zXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB3YXRjaCgpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBkZXYgcHVzaGVzIGV2ZXJ5IDUgc2Vjb25kc1xuICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCd3YXRjaGluZyBmb3IgbmV3IG5vdGlmaWNhdGlvbnMnKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoIXRoaXMuX3dhdGNoKSB7XG4gICAgICAgICAgICB0aGlzLl93YXRjaCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgc2VsZi5jaGVja0Zvck5vdGlmaWNhdGlvbnMoKTsgfSwgNTAwMCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogUHV0cyB0aGUgXCJwb2xsaW5nXCIgZm9yIG5ldyBub3RpZmljYXRpb25zIG9uIGhvbGQuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBoYWx0KCkge1xuICAgICAgICBpZiAodGhpcy5fd2F0Y2gpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5fd2F0Y2gpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIFB1c2hNZXNzYWdlQXBwU3RhdHVzIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5hc2xlZXAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jbG9zZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgZ2V0IHdhc0FzbGVlcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXNsZWVwO1xuICAgIH1cbiAgICBnZXQgd2FzQ2xvc2VkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jbG9zZWQ7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFB1c2hNZXNzYWdlIHtcbiAgICBjb25zdHJ1Y3RvcihyYXcpIHtcbiAgICAgICAgdGhpcy5fcmF3ID0gcmF3IHx8IHt9O1xuICAgICAgICBpZiAoIXRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YSkge1xuICAgICAgICAgICAgLy8gdGhpcyBzaG91bGQgb25seSBoaXQgaWYgd2UgYXJlIHNlcnZpbmcgdXAgYSBkZXZlbG9wbWVudCBwdXNoXG4gICAgICAgICAgICB0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEgPSB7XG4gICAgICAgICAgICAgICAgJ2NvbGRzdGFydCc6IGZhbHNlLFxuICAgICAgICAgICAgICAgICdmb3JlZ3JvdW5kJzogdHJ1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9wYXlsb2FkID0gbnVsbDtcbiAgICAgICAgdGhpcy5hcHAgPSBudWxsO1xuICAgICAgICB0aGlzLnRleHQgPSBudWxsO1xuICAgICAgICB0aGlzLnRpdGxlID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb3VudCA9IG51bGw7XG4gICAgICAgIHRoaXMuc291bmQgPSBudWxsO1xuICAgICAgICB0aGlzLmltYWdlID0gbnVsbDtcbiAgICB9XG4gICAgc3RhdGljIGZyb21QbHVnaW5KU09OKGpzb24pIHtcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBuZXcgUHVzaE1lc3NhZ2UoanNvbik7XG4gICAgICAgIG1lc3NhZ2UucHJvY2Vzc1JhdygpO1xuICAgICAgICByZXR1cm4gbWVzc2FnZTtcbiAgICB9XG4gICAgZ2V0IHBheWxvYWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXlsb2FkIHx8IHt9O1xuICAgIH1cbiAgICBwcm9jZXNzUmF3KCkge1xuICAgICAgICB0aGlzLnRleHQgPSB0aGlzLl9yYXcubWVzc2FnZSB8fCBudWxsO1xuICAgICAgICB0aGlzLnRpdGxlID0gdGhpcy5fcmF3LnRpdGxlIHx8IG51bGw7XG4gICAgICAgIHRoaXMuY291bnQgPSB0aGlzLl9yYXcuY291bnQgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5zb3VuZCA9IHRoaXMuX3Jhdy5zb3VuZCB8fCBudWxsO1xuICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5fcmF3LmltYWdlIHx8IG51bGw7XG4gICAgICAgIHRoaXMuYXBwID0gbmV3IFB1c2hNZXNzYWdlQXBwU3RhdHVzKCk7XG4gICAgICAgIGlmICghdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhLmZvcmVncm91bmQpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLmFzbGVlcCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5jb2xkc3RhcnQpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLmNsb3NlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5wYXlsb2FkKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXlsb2FkID0gdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhLnBheWxvYWQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0UmF3VmVyc2lvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JhdztcbiAgICB9XG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiAnPFB1c2hNZXNzYWdlIFtcXCcnICsgdGhpcy50aXRsZSArICdcXCddPic7XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIFB1c2hUb2tlbiB7XG4gICAgY29uc3RydWN0b3IodG9rZW4pIHtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbiB8fCBudWxsO1xuICAgIH1cbiAgICBzZXQgdG9rZW4odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB2YWx1ZTtcbiAgICB9XG4gICAgZ2V0IHRva2VuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdG9rZW47XG4gICAgfVxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICB2YXIgdG9rZW4gPSB0aGlzLl90b2tlbiB8fCAnbnVsbCc7XG4gICAgICAgIHJldHVybiAnPFB1c2hUb2tlbiBbXFwnJyArIHRva2VuICsgJ1xcJ10+JztcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBBcHAgfSBmcm9tIFwiLi4vY29yZS9hcHBcIjtcbmltcG9ydCB7IElvbmljUGxhdGZvcm0gfSBmcm9tIFwiLi4vY29yZS9jb3JlXCI7XG5pbXBvcnQgeyBMb2dnZXIgfSBmcm9tIFwiLi4vY29yZS9sb2dnZXJcIjtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCIuLi9jb3JlL2V2ZW50c1wiO1xuaW1wb3J0IHsgQVBJUmVxdWVzdCB9IGZyb20gXCIuLi9jb3JlL3JlcXVlc3RcIjtcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLi9jb3JlL3Byb21pc2VcIjtcbmltcG9ydCB7IFVzZXIgfSBmcm9tIFwiLi4vY29yZS91c2VyXCI7XG5pbXBvcnQgeyBQdXNoVG9rZW4gfSBmcm9tIFwiLi9wdXNoLXRva2VuXCI7XG5pbXBvcnQgeyBQdXNoTWVzc2FnZSB9IGZyb20gXCIuL3B1c2gtbWVzc2FnZVwiO1xuaW1wb3J0IHsgUHVzaERldlNlcnZpY2UgfSBmcm9tIFwiLi9wdXNoLWRldlwiO1xudmFyIERFRkVSX0lOSVQgPSBcIkRFRkVSX0lOSVRcIjtcbnZhciBwdXNoQVBJQmFzZSA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL3B1c2gnO1xudmFyIHB1c2hBUElFbmRwb2ludHMgPSB7XG4gICAgJ3NhdmVUb2tlbic6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHB1c2hBUElCYXNlICsgJy90b2tlbnMnO1xuICAgIH0sXG4gICAgJ2ludmFsaWRhdGVUb2tlbic6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHB1c2hBUElCYXNlICsgJy90b2tlbnMvaW52YWxpZGF0ZSc7XG4gICAgfVxufTtcbmV4cG9ydCBjbGFzcyBQdXNoIHtcbiAgICBjb25zdHJ1Y3Rvcihjb25maWcpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgUHVzaDonXG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgSW9uaWNBcHAgPSBuZXcgQXBwKElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBpX2tleScpKTtcbiAgICAgICAgSW9uaWNBcHAuZGV2UHVzaCA9IElvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnZGV2X3B1c2gnKTtcbiAgICAgICAgSW9uaWNBcHAuZ2NtS2V5ID0gSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdnY21fa2V5Jyk7XG4gICAgICAgIC8vIENoZWNrIGZvciB0aGUgcmVxdWlyZWQgdmFsdWVzIHRvIHVzZSB0aGlzIHNlcnZpY2VcbiAgICAgICAgaWYgKCFJb25pY0FwcC5pZCB8fCAhSW9uaWNBcHAuYXBpS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignbm8gYXBwX2lkIG9yIGFwaV9rZXkgZm91bmQuIChodHRwOi8vZG9jcy5pb25pYy5pby9kb2NzL2lvLWluc3RhbGwpJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoSW9uaWNQbGF0Zm9ybS5pc0FuZHJvaWREZXZpY2UoKSAmJiAhSW9uaWNBcHAuZGV2UHVzaCAmJiAhSW9uaWNBcHAuZ2NtS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignR0NNIHByb2plY3QgbnVtYmVyIG5vdCBmb3VuZCAoaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9wdXNoLWFuZHJvaWQtc2V0dXApJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hcHAgPSBJb25pY0FwcDtcbiAgICAgICAgdGhpcy5yZWdpc3RlckNhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgdGhpcy5ub3RpZmljYXRpb25DYWxsYmFjayA9IG51bGw7XG4gICAgICAgIHRoaXMuZXJyb3JDYWxsYmFjayA9IG51bGw7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5fbm90aWZpY2F0aW9uID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2RlYnVnID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdG9rZW5SZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1JlZ2lzdHJhdGlvbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9yZWdpc3RlcmVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IG51bGw7XG4gICAgICAgIGlmIChjb25maWcgIT09IERFRkVSX0lOSVQpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgICAgIElvbmljUGxhdGZvcm0ub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5pbml0KGNvbmZpZyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXQgdG9rZW4odmFsKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gSW9uaWNQbGF0Zm9ybS5nZXRTdG9yYWdlKCk7XG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBQdXNoVG9rZW4pIHtcbiAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nLCB7ICd0b2tlbic6IHZhbC50b2tlbiB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl90b2tlbiA9IHZhbDtcbiAgICB9XG4gICAgZ2V0U3RvcmFnZVRva2VuKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IElvbmljUGxhdGZvcm0uZ2V0U3RvcmFnZSgpO1xuICAgICAgICB2YXIgdG9rZW4gPSBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KCdpb25pY19pb19wdXNoX3Rva2VuJyk7XG4gICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQdXNoVG9rZW4odG9rZW4udG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjbGVhclN0b3JhZ2VUb2tlbigpIHtcbiAgICAgICAgdmFyIHN0b3JhZ2UgPSBJb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgc3RvcmFnZS5kZWxldGVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSW5pdCBtZXRob2QgdG8gc2V0dXAgcHVzaCBiZWhhdmlvci9vcHRpb25zXG4gICAgICpcbiAgICAgKiBUaGUgY29uZmlnIHN1cHBvcnRzIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICAgKiAgIC0gZGVidWcge0Jvb2xlYW59IEVuYWJsZXMgc29tZSBleHRyYSBsb2dnaW5nIGFzIHdlbGwgYXMgc29tZSBkZWZhdWx0IGNhbGxiYWNrIGhhbmRsZXJzXG4gICAgICogICAtIG9uTm90aWZpY2F0aW9uIHtGdW5jdGlvbn0gQ2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBpcyBwYXNzZWQgdGhlIG5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiAgIC0gb25SZWdpc3RlciB7RnVuY3Rpb259IENhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgaXMgcGFzc2VkIHRoZSByZWdpc3RyYXRpb24gb2JqZWN0XG4gICAgICogICAtIG9uRXJyb3Ige0Z1bmN0aW9ufSBDYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHBhc3NlZCB0aGUgZXJyb3Igb2JqZWN0XG4gICAgICogICAtIHBsdWdpbkNvbmZpZyB7T2JqZWN0fSBQbHVnaW4gY29uZmlndXJhdGlvbjogaHR0cHM6Ly9naXRodWIuY29tL3Bob25lZ2FwL3Bob25lZ2FwLXBsdWdpbi1wdXNoXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gY29uZmlnIENvbmZpZ3VyYXRpb24gb2JqZWN0XG4gICAgICogQHJldHVybiB7UHVzaH0gcmV0dXJucyB0aGUgY2FsbGVkIFB1c2ggaW5zdGFudGlhdGlvblxuICAgICAqL1xuICAgIGluaXQoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2dldFB1c2hQbHVnaW4oKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjb25maWcgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25maWcgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGNvbmZpZyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdpbml0KCkgcmVxdWlyZXMgYSB2YWxpZCBjb25maWcgb2JqZWN0LicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnKSB7XG4gICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnID0ge307XG4gICAgICAgIH1cbiAgICAgICAgaWYgKElvbmljUGxhdGZvcm0uaXNBbmRyb2lkRGV2aWNlKCkpIHtcbiAgICAgICAgICAgIC8vIGluamVjdCBnY20ga2V5IGZvciBQdXNoUGx1Z2luXG4gICAgICAgICAgICBpZiAoIWNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZCkge1xuICAgICAgICAgICAgICAgIGNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZCA9IHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQuc2VuZGVySWQpIHtcbiAgICAgICAgICAgICAgICBjb25maWcucGx1Z2luQ29uZmlnLmFuZHJvaWQuc2VuZGVySUQgPSBzZWxmLmFwcC5nY21LZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gU3RvcmUgQ2FsbGJhY2tzXG4gICAgICAgIGlmIChjb25maWcub25SZWdpc3Rlcikge1xuICAgICAgICAgICAgdGhpcy5zZXRSZWdpc3RlckNhbGxiYWNrKGNvbmZpZy5vblJlZ2lzdGVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLm9uTm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNldE5vdGlmaWNhdGlvbkNhbGxiYWNrKGNvbmZpZy5vbk5vdGlmaWNhdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbmZpZy5vbkVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLnNldEVycm9yQ2FsbGJhY2soY29uZmlnLm9uRXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5faXNSZWFkeSA9IHRydWU7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdCgnaW9uaWNfcHVzaDpyZWFkeScsIHsgXCJjb25maWdcIjogdGhpcy5fY29uZmlnIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgc2F2ZVRva2VuKHRva2VuLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIGlmICh0b2tlbi50b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0b2tlbi50b2tlbjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdG9rZW5EYXRhID0ge1xuICAgICAgICAgICAgJ3Rva2VuJzogdG9rZW4sXG4gICAgICAgICAgICAnYXBwX2lkJzogSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIW9wdHMuaWdub3JlX3VzZXIpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gVXNlci5jdXJyZW50KCk7XG4gICAgICAgICAgICBpZiAodXNlci5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgICAgIHRva2VuRGF0YS51c2VyX2lkID0gdXNlci5pZDsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tTYXZlVG9rZW4pIHtcbiAgICAgICAgICAgIG5ldyBBUElSZXF1ZXN0KHtcbiAgICAgICAgICAgICAgICAndXJpJzogcHVzaEFQSUVuZHBvaW50cy5zYXZlVG9rZW4oKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzogdG9rZW5EYXRhXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NhdmVkIHB1c2ggdG9rZW46ICcgKyB0b2tlbik7XG4gICAgICAgICAgICAgICAgaWYgKHRva2VuRGF0YS51c2VyX2lkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FkZGVkIHB1c2ggdG9rZW4gdG8gdXNlcjogJyArIHRva2VuRGF0YS51c2VyX2lkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbyhcImEgdG9rZW4gc2F2ZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyB0aGUgZGV2aWNlIHdpdGggR0NNL0FQTlMgdG8gZ2V0IGEgZGV2aWNlIHRva2VuXG4gICAgICogRmlyZXMgb2ZmIHRoZSAnb25SZWdpc3RlcicgY2FsbGJhY2sgaWYgb25lIGhhcyBiZWVuIHByb3ZpZGVkIGluIHRoZSBpbml0KCkgY29uZmlnXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2sgRnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlZ2lzdGVyKGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3JlZ2lzdGVyJyk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2Jsb2NrUmVnaXN0cmF0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKFwiYW5vdGhlciByZWdpc3RyYXRpb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYmxvY2tSZWdpc3RyYXRpb24gPSB0cnVlO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICB2YXIgSW9uaWNEZXZQdXNoID0gbmV3IFB1c2hEZXZTZXJ2aWNlKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbigpO1xuICAgICAgICAgICAgICAgIHNlbGYuX2NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgSW9uaWNEZXZQdXNoLmluaXQoc2VsZiwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5fdG9rZW5SZWFkeSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4gPSBzZWxmLl9nZXRQdXNoUGx1Z2luKCkuaW5pdChzZWxmLl9jb25maWcucGx1Z2luQ29uZmlnKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrUmVnaXN0cmF0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgUHVzaFRva2VuKGRhdGEucmVnaXN0cmF0aW9uSWQpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl90b2tlblJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmLl90b2tlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZWxmLl9kZWJ1Z0NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fY2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGYuX3JlZ2lzdGVyZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSW52YWxpZGF0ZSB0aGUgY3VycmVudCBHQ00vQVBOUyB0b2tlblxuICAgICAqXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gdGhlIHVucmVnaXN0ZXIgcmVzdWx0XG4gICAgICovXG4gICAgdW5yZWdpc3RlcigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBwbGF0Zm9ybSA9IG51bGw7XG4gICAgICAgIGlmIChJb25pY1BsYXRmb3JtLmlzQW5kcm9pZERldmljZSgpKSB7XG4gICAgICAgICAgICBwbGF0Zm9ybSA9ICdhbmRyb2lkJztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChJb25pY1BsYXRmb3JtLmlzSU9TRGV2aWNlKCkpIHtcbiAgICAgICAgICAgIHBsYXRmb3JtID0gJ2lvcyc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFwbGF0Zm9ybSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KFwiQ291bGQgbm90IGRldGVjdCB0aGUgcGxhdGZvcm0sIGFyZSB5b3Ugb24gYSBkZXZpY2U/XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5fYmxvY2tVbnJlZ2lzdGVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcGx1Z2luKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLnVucmVnaXN0ZXIoZnVuY3Rpb24gKCkgeyB9LCBmdW5jdGlvbiAoKSB7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbmV3IEFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiBwdXNoQVBJRW5kcG9pbnRzLmludmFsaWRhdGVUb2tlbigpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgICAgICdwbGF0Zm9ybSc6IHBsYXRmb3JtLFxuICAgICAgICAgICAgICAgICAgICAndG9rZW4nOiBzZWxmLmdldFN0b3JhZ2VUb2tlbigpLnRva2VuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tVbnJlZ2lzdGVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5yZWdpc3RlcmVkIHB1c2ggdG9rZW46ICcgKyBzZWxmLmdldFN0b3JhZ2VUb2tlbigpLnRva2VuKTtcbiAgICAgICAgICAgICAgICBzZWxmLmNsZWFyU3RvcmFnZVRva2VuKCk7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tVbnJlZ2lzdGVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oXCJhbiB1bnJlZ2lzdGVyIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlwiKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENvbnZlbmllbmNlIG1ldGhvZCB0byBncmFiIHRoZSBwYXlsb2FkIG9iamVjdCBmcm9tIGEgbm90aWZpY2F0aW9uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1B1c2hOb3RpZmljYXRpb259IG5vdGlmaWNhdGlvbiBQdXNoIE5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiBAcmV0dXJuIHtvYmplY3R9IFBheWxvYWQgb2JqZWN0IG9yIGFuIGVtcHR5IG9iamVjdFxuICAgICAqL1xuICAgIGdldFBheWxvYWQobm90aWZpY2F0aW9uKSB7XG4gICAgICAgIHJldHVybiBub3RpZmljYXRpb24ucGF5bG9hZDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSByZWdpc3RyYXRpb24gY2FsbGJhY2tcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFJlZ2lzdHJhdGlvbiBjYWxsYmFjayBmdW5jdGlvblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IHRydWUgaWYgc2V0IGNvcnJlY3RseSwgb3RoZXJ3aXNlIGZhbHNlXG4gICAgICovXG4gICAgc2V0UmVnaXN0ZXJDYWxsYmFjayhjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXRSZWdpc3RlckNhbGxiYWNrKCkgcmVxdWlyZXMgYSB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVnaXN0ZXJDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBub3RpZmljYXRpb24gY2FsbGJhY2tcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIE5vdGlmaWNhdGlvbiBjYWxsYmFjayBmdW5jdGlvblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IHRydWUgaWYgc2V0IGNvcnJlY3RseSwgb3RoZXJ3aXNlIGZhbHNlXG4gICAgICovXG4gICAgc2V0Tm90aWZpY2F0aW9uQ2FsbGJhY2soY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0Tm90aWZpY2F0aW9uQ2FsbGJhY2soKSByZXF1aXJlcyBhIHZhbGlkIGNhbGxiYWNrIGZ1bmN0aW9uJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ub3RpZmljYXRpb25DYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBlcnJvciBjYWxsYmFja1xuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgRXJyb3IgY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIHNldEVycm9yQ2FsbGJhY2soY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygnc2V0RXJyb3JDYWxsYmFjaygpIHJlcXVpcmVzIGEgdmFsaWQgY2FsbGJhY2sgZnVuY3Rpb24nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVycm9yQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIF9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGRhdGEpIHtcbiAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgUHVzaFRva2VuKGRhdGEucmVnaXN0cmF0aW9uSWQpO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnKGRlYnVnKSBkZXZpY2UgdG9rZW4gcmVnaXN0ZXJlZDogJyArIHNlbGYuX3Rva2VuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfVxuICAgIF9kZWJ1Z05vdGlmaWNhdGlvbkNhbGxiYWNrKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKG5vdGlmaWNhdGlvbikge1xuICAgICAgICAgICAgc2VsZi5fcHJvY2Vzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBQdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnKGRlYnVnKSBub3RpZmljYXRpb24gcmVjZWl2ZWQ6ICcgKyBtZXNzYWdlKTtcbiAgICAgICAgICAgIGlmICghc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjayAmJiBzZWxmLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQobWVzc2FnZS50ZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfVxuICAgIF9kZWJ1Z0Vycm9yQ2FsbGJhY2soKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2soZXJyKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignKGRlYnVnKSB1bmV4cGVjdGVkIGVycm9yIG9jY3VyZWQuJyk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9XG4gICAgX3JlZ2lzdGVyQ2FsbGJhY2soKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2soZGF0YSkge1xuICAgICAgICAgICAgc2VsZi50b2tlbiA9IG5ldyBQdXNoVG9rZW4oZGF0YS5yZWdpc3RyYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAoc2VsZi5yZWdpc3RlckNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYucmVnaXN0ZXJDYWxsYmFjayhzZWxmLl90b2tlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH1cbiAgICBfbm90aWZpY2F0aW9uQ2FsbGJhY2soKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2sobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLl9wcm9jZXNzTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9IFB1c2hNZXNzYWdlLmZyb21QbHVnaW5KU09OKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICBpZiAoc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLm5vdGlmaWNhdGlvbkNhbGxiYWNrKG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9XG4gICAgX2Vycm9yQ2FsbGJhY2soKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2soZXJyKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5lcnJvckNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuZXJyb3JDYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIHRoZSBkZWZhdWx0IGRlYnVnIGNhbGxiYWNrcyB3aXRoIHRoZSBQdXNoUGx1Z2luIHdoZW4gZGVidWcgaXMgZW5hYmxlZFxuICAgICAqIEludGVybmFsIE1ldGhvZFxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBfZGVidWdDYWxsYmFja1JlZ2lzdHJhdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5kZWJ1Zykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmFwcC5kZXZQdXNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdyZWdpc3RyYXRpb24nLCB0aGlzLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignbm90aWZpY2F0aW9uJywgdGhpcy5fZGVidWdOb3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ2Vycm9yJywgdGhpcy5fZGVidWdFcnJvckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9yZWdpc3RlcmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6dG9rZW4nLCB0aGlzLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOm5vdGlmaWNhdGlvbicsIHRoaXMuX2RlYnVnTm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6ZXJyb3InLCB0aGlzLl9kZWJ1Z0Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyB0aGUgdXNlciBzdXBwbGllZCBjYWxsYmFja3Mgd2l0aCB0aGUgUHVzaFBsdWdpblxuICAgICAqIEludGVybmFsIE1ldGhvZFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgX2NhbGxiYWNrUmVnaXN0cmF0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbigncmVnaXN0cmF0aW9uJywgdGhpcy5fcmVnaXN0ZXJDYWxsYmFjaygpKTtcbiAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignbm90aWZpY2F0aW9uJywgdGhpcy5fbm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ2Vycm9yJywgdGhpcy5fZXJyb3JDYWxsYmFjaygpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5fcmVnaXN0ZXJlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6dG9rZW4nLCB0aGlzLl9yZWdpc3RlckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6bm90aWZpY2F0aW9uJywgdGhpcy5fbm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDplcnJvcicsIHRoaXMuX2Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgbWlzYyBmZWF0dXJlcyBiYXNlZCBvbiB0aGUgY29udGVudHMgb2YgYSBwdXNoIG5vdGlmaWNhdGlvblxuICAgICAqIEludGVybmFsIE1ldGhvZFxuICAgICAqXG4gICAgICogQ3VycmVudGx5IGp1c3QgZG9lcyB0aGUgcGF5bG9hZCAkc3RhdGUgcmVkaXJlY3Rpb25cbiAgICAgKiBAcGFyYW0ge1B1c2hOb3RpZmljYXRpb259IG5vdGlmaWNhdGlvbiBQdXNoIE5vdGlmaWNhdGlvbiBvYmplY3RcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIF9wcm9jZXNzTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgICB0aGlzLl9ub3RpZmljYXRpb24gPSBub3RpZmljYXRpb247XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdCgnaW9uaWNfcHVzaDpwcm9jZXNzTm90aWZpY2F0aW9uJywgbm90aWZpY2F0aW9uKTtcbiAgICB9XG4gICAgLyogRGVwcmVjYXRlZCBpbiBmYXZvciBvZiBgZ2V0UHVzaFBsdWdpbmAgKi9cbiAgICBfZ2V0UHVzaFBsdWdpbigpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgUHVzaFBsdWdpbiA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBQdXNoUGx1Z2luID0gd2luZG93LlB1c2hOb3RpZmljYXRpb247XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ3NvbWV0aGluZyB3ZW50IHdyb25nIGxvb2tpbmcgZm9yIHRoZSBQdXNoTm90aWZpY2F0aW9uIHBsdWdpbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VsZi5hcHAuZGV2UHVzaCAmJiAhUHVzaFBsdWdpbiAmJiAoSW9uaWNQbGF0Zm9ybS5pc0lPU0RldmljZSgpIHx8IElvbmljUGxhdGZvcm0uaXNBbmRyb2lkRGV2aWNlKCkpKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihcIlB1c2hOb3RpZmljYXRpb24gcGx1Z2luIGlzIHJlcXVpcmVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgcGhvbmVnYXAtcGx1Z2luLXB1c2hgID9cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFB1c2hQbHVnaW47XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBwaG9uZWdhcC1wdXNoLXBsdWdpbiBpbnRlcmZhY2VcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1B1c2hOb3RpZmljYXRpb259IFB1c2hOb3RpZmljYXRpb24gaW5zdGFuY2VcbiAgICAgKi9cbiAgICBnZXRQdXNoUGx1Z2luKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGx1Z2luO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBQdXNoIGlzIHJlYWR5LiBUaGlzIHdpbGwgZmlyZSBpbW1lZGlhdGVseSBpZlxuICAgICAqIHRoZSBzZXJ2aWNlIGhhcyBhbHJlYWR5IGluaXRpYWxpemVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBvZmZcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uUmVhZHkoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodGhpcy5faXNSZWFkeSkge1xuICAgICAgICAgICAgY2FsbGJhY2soc2VsZik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLl9lbWl0dGVyLm9uKCdpb25pY19wdXNoOnJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJleHBvcnQgKiBmcm9tIFwiLi91dGlsXCI7XG4iLCJleHBvcnQgZnVuY3Rpb24gZGVlcEV4dGVuZCguLi5vdXQpIHtcbiAgICBvdXQgPSBvdXRbMF0gfHwge307XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIG9iaiA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dFtrZXldID0gZGVlcEV4dGVuZChvdXRba2V5XSwgb2JqW2tleV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0W2tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn1cbiIsIi8vIEJyb3dzZXIgUmVxdWVzdFxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cblxuLy8gVU1EIEhFQURFUiBTVEFSVCBcbihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxuICAgICAgICBkZWZpbmUoW10sIGZhY3RvcnkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIC8vIE5vZGUuIERvZXMgbm90IHdvcmsgd2l0aCBzdHJpY3QgQ29tbW9uSlMsIGJ1dFxuICAgICAgICAvLyBvbmx5IENvbW1vbkpTLWxpa2UgZW52aXJvbWVudHMgdGhhdCBzdXBwb3J0IG1vZHVsZS5leHBvcnRzLFxuICAgICAgICAvLyBsaWtlIE5vZGUuXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEJyb3dzZXIgZ2xvYmFscyAocm9vdCBpcyB3aW5kb3cpXG4gICAgICAgIHJvb3QucmV0dXJuRXhwb3J0cyA9IGZhY3RvcnkoKTtcbiAgfVxufSh0aGlzLCBmdW5jdGlvbiAoKSB7XG4vLyBVTUQgSEVBREVSIEVORFxuXG52YXIgWEhSID0gWE1MSHR0cFJlcXVlc3RcbmlmICghWEhSKSB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgWE1MSHR0cFJlcXVlc3QnKVxucmVxdWVzdC5sb2cgPSB7XG4gICd0cmFjZSc6IG5vb3AsICdkZWJ1Zyc6IG5vb3AsICdpbmZvJzogbm9vcCwgJ3dhcm4nOiBub29wLCAnZXJyb3InOiBub29wXG59XG5cbnZhciBERUZBVUxUX1RJTUVPVVQgPSAzICogNjAgKiAxMDAwIC8vIDMgbWludXRlc1xuXG4vL1xuLy8gcmVxdWVzdFxuLy9cblxuZnVuY3Rpb24gcmVxdWVzdChvcHRpb25zLCBjYWxsYmFjaykge1xuICAvLyBUaGUgZW50cnktcG9pbnQgdG8gdGhlIEFQSTogcHJlcCB0aGUgb3B0aW9ucyBvYmplY3QgYW5kIHBhc3MgdGhlIHJlYWwgd29yayB0byBydW5feGhyLlxuICBpZih0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdCYWQgY2FsbGJhY2sgZ2l2ZW46ICcgKyBjYWxsYmFjaylcblxuICBpZighb3B0aW9ucylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIG9wdGlvbnMgZ2l2ZW4nKVxuXG4gIHZhciBvcHRpb25zX29uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2U7IC8vIFNhdmUgdGhpcyBmb3IgbGF0ZXIuXG5cbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc307XG4gIGVsc2VcbiAgICBvcHRpb25zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRpb25zKSk7IC8vIFVzZSBhIGR1cGxpY2F0ZSBmb3IgbXV0YXRpbmcuXG5cbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9uc19vblJlc3BvbnNlIC8vIEFuZCBwdXQgaXQgYmFjay5cblxuICBpZiAob3B0aW9ucy52ZXJib3NlKSByZXF1ZXN0LmxvZyA9IGdldExvZ2dlcigpO1xuXG4gIGlmKG9wdGlvbnMudXJsKSB7XG4gICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVybDtcbiAgICBkZWxldGUgb3B0aW9ucy51cmw7XG4gIH1cblxuICBpZighb3B0aW9ucy51cmkgJiYgb3B0aW9ucy51cmkgIT09IFwiXCIpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgaXMgYSByZXF1aXJlZCBhcmd1bWVudFwiKTtcblxuICBpZih0eXBlb2Ygb3B0aW9ucy51cmkgIT0gXCJzdHJpbmdcIilcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBtdXN0IGJlIGEgc3RyaW5nXCIpO1xuXG4gIHZhciB1bnN1cHBvcnRlZF9vcHRpb25zID0gWydwcm94eScsICdfcmVkaXJlY3RzRm9sbG93ZWQnLCAnbWF4UmVkaXJlY3RzJywgJ2ZvbGxvd1JlZGlyZWN0J11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bnN1cHBvcnRlZF9vcHRpb25zLmxlbmd0aDsgaSsrKVxuICAgIGlmKG9wdGlvbnNbIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gXSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMuXCIgKyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldICsgXCIgaXMgbm90IHN1cHBvcnRlZFwiKVxuXG4gIG9wdGlvbnMuY2FsbGJhY2sgPSBjYWxsYmFja1xuICBvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnO1xuICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XG4gIG9wdGlvbnMuYm9keSAgICA9IG9wdGlvbnMuYm9keSB8fCBudWxsXG4gIG9wdGlvbnMudGltZW91dCA9IG9wdGlvbnMudGltZW91dCB8fCByZXF1ZXN0LkRFRkFVTFRfVElNRU9VVFxuXG4gIGlmKG9wdGlvbnMuaGVhZGVycy5ob3N0KVxuICAgIHRocm93IG5ldyBFcnJvcihcIk9wdGlvbnMuaGVhZGVycy5ob3N0IGlzIG5vdCBzdXBwb3J0ZWRcIik7XG5cbiAgaWYob3B0aW9ucy5qc29uKSB7XG4gICAgb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCA9IG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgfHwgJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgaWYob3B0aW9ucy5tZXRob2QgIT09ICdHRVQnKVxuICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJ1xuXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuanNvbiAhPT0gJ2Jvb2xlYW4nKVxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5qc29uKVxuICAgIGVsc2UgaWYodHlwZW9mIG9wdGlvbnMuYm9keSAhPT0gJ3N0cmluZycpXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmJvZHkpXG4gIH1cbiAgXG4gIC8vQkVHSU4gUVMgSGFja1xuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHN0ciA9IFtdO1xuICAgIGZvcih2YXIgcCBpbiBvYmopXG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xuICAgICAgfVxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XG4gIH1cbiAgXG4gIGlmKG9wdGlvbnMucXMpe1xuICAgIHZhciBxcyA9ICh0eXBlb2Ygb3B0aW9ucy5xcyA9PSAnc3RyaW5nJyk/IG9wdGlvbnMucXMgOiBzZXJpYWxpemUob3B0aW9ucy5xcyk7XG4gICAgaWYob3B0aW9ucy51cmkuaW5kZXhPZignPycpICE9PSAtMSl7IC8vbm8gZ2V0IHBhcmFtc1xuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKycmJytxcztcbiAgICB9ZWxzZXsgLy9leGlzdGluZyBnZXQgcGFyYW1zXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJz8nK3FzO1xuICAgIH1cbiAgfVxuICAvL0VORCBRUyBIYWNrXG4gIFxuICAvL0JFR0lOIEZPUk0gSGFja1xuICB2YXIgbXVsdGlwYXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgLy90b2RvOiBzdXBwb3J0IGZpbGUgdHlwZSAodXNlZnVsPylcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgcmVzdWx0LmJvdW5kcnkgPSAnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLScrTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKjEwMDAwMDAwMDApO1xuICAgIHZhciBsaW5lcyA9IFtdO1xuICAgIGZvcih2YXIgcCBpbiBvYmope1xuICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKFxuICAgICAgICAgICAgICAgICctLScrcmVzdWx0LmJvdW5kcnkrXCJcXG5cIitcbiAgICAgICAgICAgICAgICAnQ29udGVudC1EaXNwb3NpdGlvbjogZm9ybS1kYXRhOyBuYW1lPVwiJytwKydcIicrXCJcXG5cIitcbiAgICAgICAgICAgICAgICBcIlxcblwiK1xuICAgICAgICAgICAgICAgIG9ialtwXStcIlxcblwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgfVxuICAgIGxpbmVzLnB1c2goICctLScrcmVzdWx0LmJvdW5kcnkrJy0tJyApO1xuICAgIHJlc3VsdC5ib2R5ID0gbGluZXMuam9pbignJyk7XG4gICAgcmVzdWx0Lmxlbmd0aCA9IHJlc3VsdC5ib2R5Lmxlbmd0aDtcbiAgICByZXN1bHQudHlwZSA9ICdtdWx0aXBhcnQvZm9ybS1kYXRhOyBib3VuZGFyeT0nK3Jlc3VsdC5ib3VuZHJ5O1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbiAgXG4gIGlmKG9wdGlvbnMuZm9ybSl7XG4gICAgaWYodHlwZW9mIG9wdGlvbnMuZm9ybSA9PSAnc3RyaW5nJykgdGhyb3coJ2Zvcm0gbmFtZSB1bnN1cHBvcnRlZCcpO1xuICAgIGlmKG9wdGlvbnMubWV0aG9kID09PSAnUE9TVCcpe1xuICAgICAgICB2YXIgZW5jb2RpbmcgPSAob3B0aW9ucy5lbmNvZGluZyB8fCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IGVuY29kaW5nO1xuICAgICAgICBzd2l0Y2goZW5jb2Rpbmcpe1xuICAgICAgICAgICAgY2FzZSAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBzZXJpYWxpemUob3B0aW9ucy5mb3JtKS5yZXBsYWNlKC8lMjAvZywgXCIrXCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YSc6XG4gICAgICAgICAgICAgICAgdmFyIG11bHRpID0gbXVsdGlwYXJ0KG9wdGlvbnMuZm9ybSk7XG4gICAgICAgICAgICAgICAgLy9vcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBtdWx0aS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gbXVsdGkuYm9keTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gbXVsdGkudHlwZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQgOiB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGVuY29kaW5nOicrZW5jb2RpbmcpO1xuICAgICAgICB9XG4gICAgfVxuICB9XG4gIC8vRU5EIEZPUk0gSGFja1xuXG4gIC8vIElmIG9uUmVzcG9uc2UgaXMgYm9vbGVhbiB0cnVlLCBjYWxsIGJhY2sgaW1tZWRpYXRlbHkgd2hlbiB0aGUgcmVzcG9uc2UgaXMga25vd24sXG4gIC8vIG5vdCB3aGVuIHRoZSBmdWxsIHJlcXVlc3QgaXMgY29tcGxldGUuXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZSB8fCBub29wXG4gIGlmKG9wdGlvbnMub25SZXNwb25zZSA9PT0gdHJ1ZSkge1xuICAgIG9wdGlvbnMub25SZXNwb25zZSA9IGNhbGxiYWNrXG4gICAgb3B0aW9ucy5jYWxsYmFjayA9IG5vb3BcbiAgfVxuXG4gIC8vIFhYWCBCcm93c2VycyBkbyBub3QgbGlrZSB0aGlzLlxuICAvL2lmKG9wdGlvbnMuYm9keSlcbiAgLy8gIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG9wdGlvbnMuYm9keS5sZW5ndGg7XG5cbiAgLy8gSFRUUCBiYXNpYyBhdXRoZW50aWNhdGlvblxuICBpZighb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gJiYgb3B0aW9ucy5hdXRoKVxuICAgIG9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID0gJ0Jhc2ljICcgKyBiNjRfZW5jKG9wdGlvbnMuYXV0aC51c2VybmFtZSArICc6JyArIG9wdGlvbnMuYXV0aC5wYXNzd29yZCk7XG5cbiAgcmV0dXJuIHJ1bl94aHIob3B0aW9ucylcbn1cblxudmFyIHJlcV9zZXEgPSAwXG5mdW5jdGlvbiBydW5feGhyKG9wdGlvbnMpIHtcbiAgdmFyIHhociA9IG5ldyBYSFJcbiAgICAsIHRpbWVkX291dCA9IGZhbHNlXG4gICAgLCBpc19jb3JzID0gaXNfY3Jvc3NEb21haW4ob3B0aW9ucy51cmkpXG4gICAgLCBzdXBwb3J0c19jb3JzID0gKCd3aXRoQ3JlZGVudGlhbHMnIGluIHhocilcblxuICByZXFfc2VxICs9IDFcbiAgeGhyLnNlcV9pZCA9IHJlcV9zZXFcbiAgeGhyLmlkID0gcmVxX3NlcSArICc6ICcgKyBvcHRpb25zLm1ldGhvZCArICcgJyArIG9wdGlvbnMudXJpXG4gIHhoci5faWQgPSB4aHIuaWQgLy8gSSBrbm93IEkgd2lsbCB0eXBlIFwiX2lkXCIgZnJvbSBoYWJpdCBhbGwgdGhlIHRpbWUuXG5cbiAgaWYoaXNfY29ycyAmJiAhc3VwcG9ydHNfY29ycykge1xuICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGNyb3NzLW9yaWdpbiByZXF1ZXN0OiAnICsgb3B0aW9ucy51cmkpXG4gICAgY29yc19lcnIuY29ycyA9ICd1bnN1cHBvcnRlZCdcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxuICB9XG5cbiAgeGhyLnRpbWVvdXRUaW1lciA9IHNldFRpbWVvdXQodG9vX2xhdGUsIG9wdGlvbnMudGltZW91dClcbiAgZnVuY3Rpb24gdG9vX2xhdGUoKSB7XG4gICAgdGltZWRfb3V0ID0gdHJ1ZVxuICAgIHZhciBlciA9IG5ldyBFcnJvcignRVRJTUVET1VUJylcbiAgICBlci5jb2RlID0gJ0VUSU1FRE9VVCdcbiAgICBlci5kdXJhdGlvbiA9IG9wdGlvbnMudGltZW91dFxuXG4gICAgcmVxdWVzdC5sb2cuZXJyb3IoJ1RpbWVvdXQnLCB7ICdpZCc6eGhyLl9pZCwgJ21pbGxpc2Vjb25kcyc6b3B0aW9ucy50aW1lb3V0IH0pXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocilcbiAgfVxuXG4gIC8vIFNvbWUgc3RhdGVzIGNhbiBiZSBza2lwcGVkIG92ZXIsIHNvIHJlbWVtYmVyIHdoYXQgaXMgc3RpbGwgaW5jb21wbGV0ZS5cbiAgdmFyIGRpZCA9IHsncmVzcG9uc2UnOmZhbHNlLCAnbG9hZGluZyc6ZmFsc2UsICdlbmQnOmZhbHNlfVxuXG4gIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBvbl9zdGF0ZV9jaGFuZ2VcbiAgeGhyLm9wZW4ob3B0aW9ucy5tZXRob2QsIG9wdGlvbnMudXJpLCB0cnVlKSAvLyBhc3luY2hyb25vdXNcbiAgaWYoaXNfY29ycylcbiAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gISEgb3B0aW9ucy53aXRoQ3JlZGVudGlhbHNcbiAgeGhyLnNlbmQob3B0aW9ucy5ib2R5KVxuICByZXR1cm4geGhyXG5cbiAgZnVuY3Rpb24gb25fc3RhdGVfY2hhbmdlKGV2ZW50KSB7XG4gICAgaWYodGltZWRfb3V0KVxuICAgICAgcmV0dXJuIHJlcXVlc3QubG9nLmRlYnVnKCdJZ25vcmluZyB0aW1lZCBvdXQgc3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkfSlcblxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdTdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWQsICd0aW1lZF9vdXQnOnRpbWVkX291dH0pXG5cbiAgICBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLk9QRU5FRCkge1xuICAgICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3Qgc3RhcnRlZCcsIHsnaWQnOnhoci5pZH0pXG4gICAgICBmb3IgKHZhciBrZXkgaW4gb3B0aW9ucy5oZWFkZXJzKVxuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIG9wdGlvbnMuaGVhZGVyc1trZXldKVxuICAgIH1cblxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5IRUFERVJTX1JFQ0VJVkVEKVxuICAgICAgb25fcmVzcG9uc2UoKVxuXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkxPQURJTkcpIHtcbiAgICAgIG9uX3Jlc3BvbnNlKClcbiAgICAgIG9uX2xvYWRpbmcoKVxuICAgIH1cblxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5ET05FKSB7XG4gICAgICBvbl9yZXNwb25zZSgpXG4gICAgICBvbl9sb2FkaW5nKClcbiAgICAgIG9uX2VuZCgpXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25fcmVzcG9uc2UoKSB7XG4gICAgaWYoZGlkLnJlc3BvbnNlKVxuICAgICAgcmV0dXJuXG5cbiAgICBkaWQucmVzcG9uc2UgPSB0cnVlXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ0dvdCByZXNwb25zZScsIHsnaWQnOnhoci5pZCwgJ3N0YXR1cyc6eGhyLnN0YXR1c30pXG4gICAgY2xlYXJUaW1lb3V0KHhoci50aW1lb3V0VGltZXIpXG4gICAgeGhyLnN0YXR1c0NvZGUgPSB4aHIuc3RhdHVzIC8vIE5vZGUgcmVxdWVzdCBjb21wYXRpYmlsaXR5XG5cbiAgICAvLyBEZXRlY3QgZmFpbGVkIENPUlMgcmVxdWVzdHMuXG4gICAgaWYoaXNfY29ycyAmJiB4aHIuc3RhdHVzQ29kZSA9PSAwKSB7XG4gICAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0NPUlMgcmVxdWVzdCByZWplY3RlZDogJyArIG9wdGlvbnMudXJpKVxuICAgICAgY29yc19lcnIuY29ycyA9ICdyZWplY3RlZCdcblxuICAgICAgLy8gRG8gbm90IHByb2Nlc3MgdGhpcyByZXF1ZXN0IGZ1cnRoZXIuXG4gICAgICBkaWQubG9hZGluZyA9IHRydWVcbiAgICAgIGRpZC5lbmQgPSB0cnVlXG5cbiAgICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXG4gICAgfVxuXG4gICAgb3B0aW9ucy5vblJlc3BvbnNlKG51bGwsIHhocilcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uX2xvYWRpbmcoKSB7XG4gICAgaWYoZGlkLmxvYWRpbmcpXG4gICAgICByZXR1cm5cblxuICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXNwb25zZSBib2R5IGxvYWRpbmcnLCB7J2lkJzp4aHIuaWR9KVxuICAgIC8vIFRPRE86IE1heWJlIHNpbXVsYXRlIFwiZGF0YVwiIGV2ZW50cyBieSB3YXRjaGluZyB4aHIucmVzcG9uc2VUZXh0XG4gIH1cblxuICBmdW5jdGlvbiBvbl9lbmQoKSB7XG4gICAgaWYoZGlkLmVuZClcbiAgICAgIHJldHVyblxuXG4gICAgZGlkLmVuZCA9IHRydWVcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBkb25lJywgeydpZCc6eGhyLmlkfSlcblxuICAgIHhoci5ib2R5ID0geGhyLnJlc3BvbnNlVGV4dFxuICAgIGlmKG9wdGlvbnMuanNvbikge1xuICAgICAgdHJ5ICAgICAgICB7IHhoci5ib2R5ID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KSB9XG4gICAgICBjYXRjaCAoZXIpIHsgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocikgICAgICAgIH1cbiAgICB9XG5cbiAgICBvcHRpb25zLmNhbGxiYWNrKG51bGwsIHhociwgeGhyLmJvZHkpXG4gIH1cblxufSAvLyByZXF1ZXN0XG5cbnJlcXVlc3Qud2l0aENyZWRlbnRpYWxzID0gZmFsc2U7XG5yZXF1ZXN0LkRFRkFVTFRfVElNRU9VVCA9IERFRkFVTFRfVElNRU9VVDtcblxuLy9cbi8vIGRlZmF1bHRzXG4vL1xuXG5yZXF1ZXN0LmRlZmF1bHRzID0gZnVuY3Rpb24ob3B0aW9ucywgcmVxdWVzdGVyKSB7XG4gIHZhciBkZWYgPSBmdW5jdGlvbiAobWV0aG9kKSB7XG4gICAgdmFyIGQgPSBmdW5jdGlvbiAocGFyYW1zLCBjYWxsYmFjaykge1xuICAgICAgaWYodHlwZW9mIHBhcmFtcyA9PT0gJ3N0cmluZycpXG4gICAgICAgIHBhcmFtcyA9IHsndXJpJzogcGFyYW1zfTtcbiAgICAgIGVsc2Uge1xuICAgICAgICBwYXJhbXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBhcmFtcykpO1xuICAgICAgfVxuICAgICAgZm9yICh2YXIgaSBpbiBvcHRpb25zKSB7XG4gICAgICAgIGlmIChwYXJhbXNbaV0gPT09IHVuZGVmaW5lZCkgcGFyYW1zW2ldID0gb3B0aW9uc1tpXVxuICAgICAgfVxuICAgICAgcmV0dXJuIG1ldGhvZChwYXJhbXMsIGNhbGxiYWNrKVxuICAgIH1cbiAgICByZXR1cm4gZFxuICB9XG4gIHZhciBkZSA9IGRlZihyZXF1ZXN0KVxuICBkZS5nZXQgPSBkZWYocmVxdWVzdC5nZXQpXG4gIGRlLnBvc3QgPSBkZWYocmVxdWVzdC5wb3N0KVxuICBkZS5wdXQgPSBkZWYocmVxdWVzdC5wdXQpXG4gIGRlLmhlYWQgPSBkZWYocmVxdWVzdC5oZWFkKVxuICByZXR1cm4gZGVcbn1cblxuLy9cbi8vIEhUVFAgbWV0aG9kIHNob3J0Y3V0c1xuLy9cblxudmFyIHNob3J0Y3V0cyA9IFsgJ2dldCcsICdwdXQnLCAncG9zdCcsICdoZWFkJyBdO1xuc2hvcnRjdXRzLmZvckVhY2goZnVuY3Rpb24oc2hvcnRjdXQpIHtcbiAgdmFyIG1ldGhvZCA9IHNob3J0Y3V0LnRvVXBwZXJDYXNlKCk7XG4gIHZhciBmdW5jICAgPSBzaG9ydGN1dC50b0xvd2VyQ2FzZSgpO1xuXG4gIHJlcXVlc3RbZnVuY10gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgaWYodHlwZW9mIG9wdHMgPT09ICdzdHJpbmcnKVxuICAgICAgb3B0cyA9IHsnbWV0aG9kJzptZXRob2QsICd1cmknOm9wdHN9O1xuICAgIGVsc2Uge1xuICAgICAgb3B0cyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0cykpO1xuICAgICAgb3B0cy5tZXRob2QgPSBtZXRob2Q7XG4gICAgfVxuXG4gICAgdmFyIGFyZ3MgPSBbb3B0c10uY29uY2F0KEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShhcmd1bWVudHMsIFsxXSkpO1xuICAgIHJldHVybiByZXF1ZXN0LmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG59KVxuXG4vL1xuLy8gQ291Y2hEQiBzaG9ydGN1dFxuLy9cblxucmVxdWVzdC5jb3VjaCA9IGZ1bmN0aW9uKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9XG5cbiAgLy8gSnVzdCB1c2UgdGhlIHJlcXVlc3QgQVBJIHRvIGRvIEpTT04uXG4gIG9wdGlvbnMuanNvbiA9IHRydWVcbiAgaWYob3B0aW9ucy5ib2R5KVxuICAgIG9wdGlvbnMuanNvbiA9IG9wdGlvbnMuYm9keVxuICBkZWxldGUgb3B0aW9ucy5ib2R5XG5cbiAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBub29wXG5cbiAgdmFyIHhociA9IHJlcXVlc3Qob3B0aW9ucywgY291Y2hfaGFuZGxlcilcbiAgcmV0dXJuIHhoclxuXG4gIGZ1bmN0aW9uIGNvdWNoX2hhbmRsZXIoZXIsIHJlc3AsIGJvZHkpIHtcbiAgICBpZihlcilcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSlcblxuICAgIGlmKChyZXNwLnN0YXR1c0NvZGUgPCAyMDAgfHwgcmVzcC5zdGF0dXNDb2RlID4gMjk5KSAmJiBib2R5LmVycm9yKSB7XG4gICAgICAvLyBUaGUgYm9keSBpcyBhIENvdWNoIEpTT04gb2JqZWN0IGluZGljYXRpbmcgdGhlIGVycm9yLlxuICAgICAgZXIgPSBuZXcgRXJyb3IoJ0NvdWNoREIgZXJyb3I6ICcgKyAoYm9keS5lcnJvci5yZWFzb24gfHwgYm9keS5lcnJvci5lcnJvcikpXG4gICAgICBmb3IgKHZhciBrZXkgaW4gYm9keSlcbiAgICAgICAgZXJba2V5XSA9IGJvZHlba2V5XVxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcbiAgICB9XG5cbiAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xuICB9XG59XG5cbi8vXG4vLyBVdGlsaXR5XG4vL1xuXG5mdW5jdGlvbiBub29wKCkge31cblxuZnVuY3Rpb24gZ2V0TG9nZ2VyKCkge1xuICB2YXIgbG9nZ2VyID0ge31cbiAgICAsIGxldmVscyA9IFsndHJhY2UnLCAnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJ11cbiAgICAsIGxldmVsLCBpXG5cbiAgZm9yKGkgPSAwOyBpIDwgbGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG4gICAgbGV2ZWwgPSBsZXZlbHNbaV1cblxuICAgIGxvZ2dlcltsZXZlbF0gPSBub29wXG4gICAgaWYodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIGNvbnNvbGUgJiYgY29uc29sZVtsZXZlbF0pXG4gICAgICBsb2dnZXJbbGV2ZWxdID0gZm9ybWF0dGVkKGNvbnNvbGUsIGxldmVsKVxuICB9XG5cbiAgcmV0dXJuIGxvZ2dlclxufVxuXG5mdW5jdGlvbiBmb3JtYXR0ZWQob2JqLCBtZXRob2QpIHtcbiAgcmV0dXJuIGZvcm1hdHRlZF9sb2dnZXJcblxuICBmdW5jdGlvbiBmb3JtYXR0ZWRfbG9nZ2VyKHN0ciwgY29udGV4dCkge1xuICAgIGlmKHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0JylcbiAgICAgIHN0ciArPSAnICcgKyBKU09OLnN0cmluZ2lmeShjb250ZXh0KVxuXG4gICAgcmV0dXJuIG9ialttZXRob2RdLmNhbGwob2JqLCBzdHIpXG4gIH1cbn1cblxuLy8gUmV0dXJuIHdoZXRoZXIgYSBVUkwgaXMgYSBjcm9zcy1kb21haW4gcmVxdWVzdC5cbmZ1bmN0aW9uIGlzX2Nyb3NzRG9tYWluKHVybCkge1xuICB2YXIgcnVybCA9IC9eKFtcXHdcXCtcXC5cXC1dKzopKD86XFwvXFwvKFteXFwvPyM6XSopKD86OihcXGQrKSk/KT8vXG5cbiAgLy8galF1ZXJ5ICM4MTM4LCBJRSBtYXkgdGhyb3cgYW4gZXhjZXB0aW9uIHdoZW4gYWNjZXNzaW5nXG4gIC8vIGEgZmllbGQgZnJvbSB3aW5kb3cubG9jYXRpb24gaWYgZG9jdW1lbnQuZG9tYWluIGhhcyBiZWVuIHNldFxuICB2YXIgYWpheExvY2F0aW9uXG4gIHRyeSB7IGFqYXhMb2NhdGlvbiA9IGxvY2F0aW9uLmhyZWYgfVxuICBjYXRjaCAoZSkge1xuICAgIC8vIFVzZSB0aGUgaHJlZiBhdHRyaWJ1dGUgb2YgYW4gQSBlbGVtZW50IHNpbmNlIElFIHdpbGwgbW9kaWZ5IGl0IGdpdmVuIGRvY3VtZW50LmxvY2F0aW9uXG4gICAgYWpheExvY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggXCJhXCIgKTtcbiAgICBhamF4TG9jYXRpb24uaHJlZiA9IFwiXCI7XG4gICAgYWpheExvY2F0aW9uID0gYWpheExvY2F0aW9uLmhyZWY7XG4gIH1cblxuICB2YXIgYWpheExvY1BhcnRzID0gcnVybC5leGVjKGFqYXhMb2NhdGlvbi50b0xvd2VyQ2FzZSgpKSB8fCBbXVxuICAgICwgcGFydHMgPSBydXJsLmV4ZWModXJsLnRvTG93ZXJDYXNlKCkgKVxuXG4gIHZhciByZXN1bHQgPSAhIShcbiAgICBwYXJ0cyAmJlxuICAgICggIHBhcnRzWzFdICE9IGFqYXhMb2NQYXJ0c1sxXVxuICAgIHx8IHBhcnRzWzJdICE9IGFqYXhMb2NQYXJ0c1syXVxuICAgIHx8IChwYXJ0c1szXSB8fCAocGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSkgIT0gKGFqYXhMb2NQYXJ0c1szXSB8fCAoYWpheExvY1BhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpXG4gICAgKVxuICApXG5cbiAgLy9jb25zb2xlLmRlYnVnKCdpc19jcm9zc0RvbWFpbignK3VybCsnKSAtPiAnICsgcmVzdWx0KVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIE1JVCBMaWNlbnNlIGZyb20gaHR0cDovL3BocGpzLm9yZy9mdW5jdGlvbnMvYmFzZTY0X2VuY29kZTozNThcbmZ1bmN0aW9uIGI2NF9lbmMgKGRhdGEpIHtcbiAgICAvLyBFbmNvZGVzIHN0cmluZyB1c2luZyBNSU1FIGJhc2U2NCBhbGdvcml0aG1cbiAgICB2YXIgYjY0ID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiO1xuICAgIHZhciBvMSwgbzIsIG8zLCBoMSwgaDIsIGgzLCBoNCwgYml0cywgaSA9IDAsIGFjID0gMCwgZW5jPVwiXCIsIHRtcF9hcnIgPSBbXTtcblxuICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICB9XG5cbiAgICAvLyBhc3N1bWUgdXRmOCBkYXRhXG4gICAgLy8gZGF0YSA9IHRoaXMudXRmOF9lbmNvZGUoZGF0YSsnJyk7XG5cbiAgICBkbyB7IC8vIHBhY2sgdGhyZWUgb2N0ZXRzIGludG8gZm91ciBoZXhldHNcbiAgICAgICAgbzEgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcbiAgICAgICAgbzIgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcbiAgICAgICAgbzMgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcblxuICAgICAgICBiaXRzID0gbzE8PDE2IHwgbzI8PDggfCBvMztcblxuICAgICAgICBoMSA9IGJpdHM+PjE4ICYgMHgzZjtcbiAgICAgICAgaDIgPSBiaXRzPj4xMiAmIDB4M2Y7XG4gICAgICAgIGgzID0gYml0cz4+NiAmIDB4M2Y7XG4gICAgICAgIGg0ID0gYml0cyAmIDB4M2Y7XG5cbiAgICAgICAgLy8gdXNlIGhleGV0cyB0byBpbmRleCBpbnRvIGI2NCwgYW5kIGFwcGVuZCByZXN1bHQgdG8gZW5jb2RlZCBzdHJpbmdcbiAgICAgICAgdG1wX2FyclthYysrXSA9IGI2NC5jaGFyQXQoaDEpICsgYjY0LmNoYXJBdChoMikgKyBiNjQuY2hhckF0KGgzKSArIGI2NC5jaGFyQXQoaDQpO1xuICAgIH0gd2hpbGUgKGkgPCBkYXRhLmxlbmd0aCk7XG5cbiAgICBlbmMgPSB0bXBfYXJyLmpvaW4oJycpO1xuXG4gICAgc3dpdGNoIChkYXRhLmxlbmd0aCAlIDMpIHtcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0yKSArICc9PSc7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTEpICsgJz0nO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gZW5jO1xufVxuICAgIHJldHVybiByZXF1ZXN0O1xuLy9VTUQgRk9PVEVSIFNUQVJUXG59KSk7XG4vL1VNRCBGT09URVIgRU5EXG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfVxuICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9qYWtlYXJjaGliYWxkL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDMuMC4yXG4gKi9cblxuKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgKHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNNYXliZVRoZW5hYmxlKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheSA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXk7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPSAwO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkdG9TdHJpbmcgPSB7fS50b1N0cmluZztcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwID0gZnVuY3Rpb24gYXNhcChjYWxsYmFjaywgYXJnKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbl0gPSBjYWxsYmFjaztcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuICsgMV0gPSBhcmc7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuICs9IDI7XG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9PT0gMikge1xuICAgICAgICAvLyBJZiBsZW4gaXMgMiwgdGhhdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gc2NoZWR1bGUgYW4gYXN5bmMgZmx1c2guXG4gICAgICAgIC8vIElmIGFkZGl0aW9uYWwgY2FsbGJhY2tzIGFyZSBxdWV1ZWQgYmVmb3JlIHRoZSBxdWV1ZSBpcyBmbHVzaGVkLCB0aGV5XG4gICAgICAgIC8vIHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoaXMgZmx1c2ggdGhhdCB3ZSBhcmUgc2NoZWR1bGluZy5cbiAgICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbihsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0U2NoZWR1bGVyKHNjaGVkdWxlRm4pIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbiA9IHNjaGVkdWxlRm47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldEFzYXAoYXNhcEZuKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcCA9IGFzYXBGbjtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93IDogdW5kZWZpbmVkO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93IHx8IHt9O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbC5NdXRhdGlvbk9ic2VydmVyIHx8IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsLldlYktpdE11dGF0aW9uT2JzZXJ2ZXI7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc05vZGUgPSB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYge30udG9TdHJpbmcuY2FsbChwcm9jZXNzKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuXG4gICAgLy8gdGVzdCBmb3Igd2ViIHdvcmtlciBidXQgbm90IGluIElFMTBcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGlzV29ya2VyID0gdHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgdHlwZW9mIGltcG9ydFNjcmlwdHMgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09ICd1bmRlZmluZWQnO1xuXG4gICAgLy8gbm9kZVxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpIHtcbiAgICAgIC8vIG5vZGUgdmVyc2lvbiAwLjEwLnggZGlzcGxheXMgYSBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gbmV4dFRpY2sgaXMgdXNlZCByZWN1cnNpdmVseVxuICAgICAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jdWpvanMvd2hlbi9pc3N1ZXMvNDEwIGZvciBkZXRhaWxzXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2sobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gdmVydHhcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dChsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpIHtcbiAgICAgIHZhciBpdGVyYXRpb25zID0gMDtcbiAgICAgIHZhciBvYnNlcnZlciA9IG5ldyBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbm9kZS5kYXRhID0gKGl0ZXJhdGlvbnMgPSArK2l0ZXJhdGlvbnMgJSAyKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gd2ViIHdvcmtlclxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpIHtcbiAgICAgIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaDtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZXRUaW1lb3V0KGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCwgMSk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuOyBpKz0yKSB7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpXTtcbiAgICAgICAgdmFyIGFyZyA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpKzFdO1xuXG4gICAgICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2ldID0gdW5kZWZpbmVkO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaSsxXSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGF0dGVtcHRWZXJ0eCgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhciByID0gcmVxdWlyZTtcbiAgICAgICAgdmFyIHZlcnR4ID0gcigndmVydHgnKTtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dCA9IHZlcnR4LnJ1bk9uTG9vcCB8fCB2ZXJ0eC5ydW5PbkNvbnRleHQ7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaDtcbiAgICAvLyBEZWNpZGUgd2hhdCBhc3luYyBtZXRob2QgdG8gdXNlIHRvIHRyaWdnZXJpbmcgcHJvY2Vzc2luZyBvZiBxdWV1ZWQgY2FsbGJhY2tzOlxuICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNXb3JrZXIpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhdHRlbXB0VmVydHgoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3AoKSB7fVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgICA9IHZvaWQgMDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEID0gMTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQgID0gMjtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUiA9IG5ldyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkge1xuICAgICAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoXCJZb3UgY2Fubm90IHJlc29sdmUgYSBwcm9taXNlIHdpdGggaXRzZWxmXCIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdBIHByb21pc2VzIGNhbGxiYWNrIGNhbm5vdCByZXR1cm4gdGhhdCBzYW1lIHByb21pc2UuJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbihwcm9taXNlKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuO1xuICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvciA9IGVycm9yO1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1I7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5VGhlbih0aGVuLCB2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcik7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlLCB0aGVuKSB7XG4gICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAoZnVuY3Rpb24ocHJvbWlzZSkge1xuICAgICAgICB2YXIgc2VhbGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBlcnJvciA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdGhlbmFibGUsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgICAgIGlmICh0aGVuYWJsZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGlmIChzZWFsZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcblxuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9LCAnU2V0dGxlOiAnICsgKHByb21pc2UuX2xhYmVsIHx8ICcgdW5rbm93biBwcm9taXNlJykpO1xuXG4gICAgICAgIGlmICghc2VhbGVkICYmIGVycm9yKSB7XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9LCBwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSkge1xuICAgICAgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gICAgICB9IGVsc2UgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHRoZW5hYmxlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpIHtcbiAgICAgIGlmIChtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yID09PSBwcm9taXNlLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHRoZW4gPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKG1heWJlVGhlbmFibGUpO1xuXG4gICAgICAgIGlmICh0aGVuID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvcik7XG4gICAgICAgIH0gZWxzZSBpZiAodGhlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24odGhlbikpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkpO1xuICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJG9iamVjdE9yRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaFJlamVjdGlvbihwcm9taXNlKSB7XG4gICAgICBpZiAocHJvbWlzZS5fb25lcnJvcikge1xuICAgICAgICBwcm9taXNlLl9vbmVycm9yKHByb21pc2UuX3Jlc3VsdCk7XG4gICAgICB9XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSkge1xuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7IHJldHVybjsgfVxuXG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSB2YWx1ZTtcbiAgICAgIHByb21pc2UuX3N0YXRlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gsIHByb21pc2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykgeyByZXR1cm47IH1cbiAgICAgIHByb21pc2UuX3N0YXRlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQ7XG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSByZWFzb247XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2hSZWplY3Rpb24sIHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcGFyZW50Ll9zdWJzY3JpYmVycztcbiAgICAgIHZhciBsZW5ndGggPSBzdWJzY3JpYmVycy5sZW5ndGg7XG5cbiAgICAgIHBhcmVudC5fb25lcnJvciA9IG51bGw7XG5cbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aF0gPSBjaGlsZDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRF0gPSBvbkZ1bGZpbGxtZW50O1xuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoICsgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURURdICA9IG9uUmVqZWN0aW9uO1xuXG4gICAgICBpZiAobGVuZ3RoID09PSAwICYmIHBhcmVudC5fc3RhdGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaCwgcGFyZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoKHByb21pc2UpIHtcbiAgICAgIHZhciBzdWJzY3JpYmVycyA9IHByb21pc2UuX3N1YnNjcmliZXJzO1xuICAgICAgdmFyIHNldHRsZWQgPSBwcm9taXNlLl9zdGF0ZTtcblxuICAgICAgaWYgKHN1YnNjcmliZXJzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuICAgICAgdmFyIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsID0gcHJvbWlzZS5fcmVzdWx0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnNjcmliZXJzLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgIGNoaWxkID0gc3Vic2NyaWJlcnNbaV07XG4gICAgICAgIGNhbGxiYWNrID0gc3Vic2NyaWJlcnNbaSArIHNldHRsZWRdO1xuXG4gICAgICAgIGlmIChjaGlsZCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhkZXRhaWwpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKSB7XG4gICAgICB0aGlzLmVycm9yID0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SID0gbmV3IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCk7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZGV0YWlsKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IuZXJyb3IgPSBlO1xuICAgICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIHByb21pc2UsIGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgICAgIHZhciBoYXNDYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbihjYWxsYmFjayksXG4gICAgICAgICAgdmFsdWUsIGVycm9yLCBzdWNjZWVkZWQsIGZhaWxlZDtcblxuICAgICAgaWYgKGhhc0NhbGxiYWNrKSB7XG4gICAgICAgIHZhbHVlID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCk7XG5cbiAgICAgICAgaWYgKHZhbHVlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IpIHtcbiAgICAgICAgICBmYWlsZWQgPSB0cnVlO1xuICAgICAgICAgIGVycm9yID0gdmFsdWUuZXJyb3I7XG4gICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkY2Fubm90UmV0dXJuT3duKCkpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IGRldGFpbDtcbiAgICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAoaGFzQ2FsbGJhY2sgJiYgc3VjY2VlZGVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChmYWlsZWQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHByb21pc2UsIHJlc29sdmVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXNvbHZlcihmdW5jdGlvbiByZXNvbHZlUHJvbWlzZSh2YWx1ZSl7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIHJlamVjdFByb21pc2UocmVhc29uKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvcihDb25zdHJ1Y3RvciwgaW5wdXQpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICAgICAgZW51bWVyYXRvci5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICAgICAgZW51bWVyYXRvci5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoZW51bWVyYXRvci5fdmFsaWRhdGVJbnB1dChpbnB1dCkpIHtcbiAgICAgICAgZW51bWVyYXRvci5faW5wdXQgICAgID0gaW5wdXQ7XG4gICAgICAgIGVudW1lcmF0b3IubGVuZ3RoICAgICA9IGlucHV0Lmxlbmd0aDtcbiAgICAgICAgZW51bWVyYXRvci5fcmVtYWluaW5nID0gaW5wdXQubGVuZ3RoO1xuXG4gICAgICAgIGVudW1lcmF0b3IuX2luaXQoKTtcblxuICAgICAgICBpZiAoZW51bWVyYXRvci5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKGVudW1lcmF0b3IucHJvbWlzZSwgZW51bWVyYXRvci5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbnVtZXJhdG9yLmxlbmd0aCA9IGVudW1lcmF0b3IubGVuZ3RoIHx8IDA7XG4gICAgICAgICAgZW51bWVyYXRvci5fZW51bWVyYXRlKCk7XG4gICAgICAgICAgaWYgKGVudW1lcmF0b3IuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChlbnVtZXJhdG9yLnByb21pc2UsIGVudW1lcmF0b3IuX3Jlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QoZW51bWVyYXRvci5wcm9taXNlLCBlbnVtZXJhdG9yLl92YWxpZGF0aW9uRXJyb3IoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl92YWxpZGF0ZUlucHV0ID0gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoaW5wdXQpO1xuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3ZhbGlkYXRpb25FcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBFcnJvcignQXJyYXkgTWV0aG9kcyBtdXN0IGJlIHByb3ZpZGVkIGFuIEFycmF5Jyk7XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5faW5pdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fcmVzdWx0ID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcbiAgICB9O1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3I7XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VudW1lcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gICAgICB2YXIgbGVuZ3RoICA9IGVudW1lcmF0b3IubGVuZ3RoO1xuICAgICAgdmFyIHByb21pc2UgPSBlbnVtZXJhdG9yLnByb21pc2U7XG4gICAgICB2YXIgaW5wdXQgICA9IGVudW1lcmF0b3IuX2lucHV0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgcHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX2VhY2hFbnRyeShpbnB1dFtpXSwgaSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZWFjaEVudHJ5ID0gZnVuY3Rpb24oZW50cnksIGkpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcbiAgICAgIHZhciBjID0gZW51bWVyYXRvci5faW5zdGFuY2VDb25zdHJ1Y3RvcjtcblxuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNNYXliZVRoZW5hYmxlKGVudHJ5KSkge1xuICAgICAgICBpZiAoZW50cnkuY29uc3RydWN0b3IgPT09IGMgJiYgZW50cnkuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgICAgZW50cnkuX29uZXJyb3IgPSBudWxsO1xuICAgICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVudW1lcmF0b3IuX3dpbGxTZXR0bGVBdChjLnJlc29sdmUoZW50cnkpLCBpKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW51bWVyYXRvci5fcmVtYWluaW5nLS07XG4gICAgICAgIGVudW1lcmF0b3IuX3Jlc3VsdFtpXSA9IGVudHJ5O1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3NldHRsZWRBdCA9IGZ1bmN0aW9uKHN0YXRlLCBpLCB2YWx1ZSkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuICAgICAgdmFyIHByb21pc2UgPSBlbnVtZXJhdG9yLnByb21pc2U7XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICBlbnVtZXJhdG9yLl9yZW1haW5pbmctLTtcblxuICAgICAgICBpZiAoc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbnVtZXJhdG9yLl9yZXN1bHRbaV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZW51bWVyYXRvci5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgZW51bWVyYXRvci5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl93aWxsU2V0dGxlQXQgPSBmdW5jdGlvbihwcm9taXNlLCBpKSB7XG4gICAgICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQsIGksIHZhbHVlKTtcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQsIGksIHJlYXNvbik7XG4gICAgICB9KTtcbiAgICB9O1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkYWxsKGVudHJpZXMpIHtcbiAgICAgIHJldHVybiBuZXcgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJGRlZmF1bHQodGhpcywgZW50cmllcykucHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkYWxsO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJHJhY2UoZW50cmllcykge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoIWxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheShlbnRyaWVzKSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhbiBhcnJheSB0byByYWNlLicpKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9XG5cbiAgICAgIHZhciBsZW5ndGggPSBlbnRyaWVzLmxlbmd0aDtcblxuICAgICAgZnVuY3Rpb24gb25GdWxmaWxsbWVudCh2YWx1ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gb25SZWplY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBpID0gMDsgcHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShDb25zdHJ1Y3Rvci5yZXNvbHZlKGVudHJpZXNbaV0pLCB1bmRlZmluZWQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkcmFjZTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRyZXNvbHZlKG9iamVjdCkge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIGlmIChvYmplY3QgJiYgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0LmNvbnN0cnVjdG9yID09PSBDb25zdHJ1Y3Rvcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgb2JqZWN0KTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJHJlc29sdmU7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRyZWplY3QocmVhc29uKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkcmVqZWN0O1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRjb3VudGVyID0gMDtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc1Jlc29sdmVyKCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhIHJlc29sdmVyIGZ1bmN0aW9uIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgcHJvbWlzZSBjb25zdHJ1Y3RvcicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdQcm9taXNlJzogUGxlYXNlIHVzZSB0aGUgJ25ldycgb3BlcmF0b3IsIHRoaXMgb2JqZWN0IGNvbnN0cnVjdG9yIGNhbm5vdCBiZSBjYWxsZWQgYXMgYSBmdW5jdGlvbi5cIik7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2U7XG4gICAgLyoqXG4gICAgICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gICAgICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICAgICAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGUgcmVhc29uXG4gICAgICB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICAgICAgVGVybWlub2xvZ3lcbiAgICAgIC0tLS0tLS0tLS0tXG5cbiAgICAgIC0gYHByb21pc2VgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB3aXRoIGEgYHRoZW5gIG1ldGhvZCB3aG9zZSBiZWhhdmlvciBjb25mb3JtcyB0byB0aGlzIHNwZWNpZmljYXRpb24uXG4gICAgICAtIGB0aGVuYWJsZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHRoYXQgZGVmaW5lcyBhIGB0aGVuYCBtZXRob2QuXG4gICAgICAtIGB2YWx1ZWAgaXMgYW55IGxlZ2FsIEphdmFTY3JpcHQgdmFsdWUgKGluY2x1ZGluZyB1bmRlZmluZWQsIGEgdGhlbmFibGUsIG9yIGEgcHJvbWlzZSkuXG4gICAgICAtIGBleGNlcHRpb25gIGlzIGEgdmFsdWUgdGhhdCBpcyB0aHJvd24gdXNpbmcgdGhlIHRocm93IHN0YXRlbWVudC5cbiAgICAgIC0gYHJlYXNvbmAgaXMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aHkgYSBwcm9taXNlIHdhcyByZWplY3RlZC5cbiAgICAgIC0gYHNldHRsZWRgIHRoZSBmaW5hbCByZXN0aW5nIHN0YXRlIG9mIGEgcHJvbWlzZSwgZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuXG4gICAgICBBIHByb21pc2UgY2FuIGJlIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXM6IHBlbmRpbmcsIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQuXG5cbiAgICAgIFByb21pc2VzIHRoYXQgYXJlIGZ1bGZpbGxlZCBoYXZlIGEgZnVsZmlsbG1lbnQgdmFsdWUgYW5kIGFyZSBpbiB0aGUgZnVsZmlsbGVkXG4gICAgICBzdGF0ZS4gIFByb21pc2VzIHRoYXQgYXJlIHJlamVjdGVkIGhhdmUgYSByZWplY3Rpb24gcmVhc29uIGFuZCBhcmUgaW4gdGhlXG4gICAgICByZWplY3RlZCBzdGF0ZS4gIEEgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmV2ZXIgYSB0aGVuYWJsZS5cblxuICAgICAgUHJvbWlzZXMgY2FuIGFsc28gYmUgc2FpZCB0byAqcmVzb2x2ZSogYSB2YWx1ZS4gIElmIHRoaXMgdmFsdWUgaXMgYWxzbyBhXG4gICAgICBwcm9taXNlLCB0aGVuIHRoZSBvcmlnaW5hbCBwcm9taXNlJ3Mgc2V0dGxlZCBzdGF0ZSB3aWxsIG1hdGNoIHRoZSB2YWx1ZSdzXG4gICAgICBzZXR0bGVkIHN0YXRlLiAgU28gYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpbGxcbiAgICAgIGl0c2VsZiByZWplY3QsIGFuZCBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIHdpbGxcbiAgICAgIGl0c2VsZiBmdWxmaWxsLlxuXG5cbiAgICAgIEJhc2ljIFVzYWdlOlxuICAgICAgLS0tLS0tLS0tLS0tXG5cbiAgICAgIGBgYGpzXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAvLyBvbiBzdWNjZXNzXG4gICAgICAgIHJlc29sdmUodmFsdWUpO1xuXG4gICAgICAgIC8vIG9uIGZhaWx1cmVcbiAgICAgICAgcmVqZWN0KHJlYXNvbik7XG4gICAgICB9KTtcblxuICAgICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBZHZhbmNlZCBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICBQcm9taXNlcyBzaGluZSB3aGVuIGFic3RyYWN0aW5nIGF3YXkgYXN5bmNocm9ub3VzIGludGVyYWN0aW9ucyBzdWNoIGFzXG4gICAgICBgWE1MSHR0cFJlcXVlc3Rgcy5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGdldEpTT04odXJsKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICAgICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBoYW5kbGVyO1xuICAgICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICAgICAgeGhyLnNlbmQoKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSB0aGlzLkRPTkUpIHtcbiAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHRoaXMucmVzcG9uc2UpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2dldEpTT046IGAnICsgdXJsICsgJ2AgZmFpbGVkIHdpdGggc3RhdHVzOiBbJyArIHRoaXMuc3RhdHVzICsgJ10nKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZ2V0SlNPTignL3Bvc3RzLmpzb24nKS50aGVuKGZ1bmN0aW9uKGpzb24pIHtcbiAgICAgICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAvLyBvbiByZWplY3Rpb25cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFVubGlrZSBjYWxsYmFja3MsIHByb21pc2VzIGFyZSBncmVhdCBjb21wb3NhYmxlIHByaW1pdGl2ZXMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBQcm9taXNlLmFsbChbXG4gICAgICAgIGdldEpTT04oJy9wb3N0cycpLFxuICAgICAgICBnZXRKU09OKCcvY29tbWVudHMnKVxuICAgICAgXSkudGhlbihmdW5jdGlvbih2YWx1ZXMpe1xuICAgICAgICB2YWx1ZXNbMF0gLy8gPT4gcG9zdHNKU09OXG4gICAgICAgIHZhbHVlc1sxXSAvLyA9PiBjb21tZW50c0pTT05cblxuICAgICAgICByZXR1cm4gdmFsdWVzO1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQGNsYXNzIFByb21pc2VcbiAgICAgIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVyXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAY29uc3RydWN0b3JcbiAgICAqL1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKHJlc29sdmVyKSB7XG4gICAgICB0aGlzLl9pZCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRjb3VudGVyKys7XG4gICAgICB0aGlzLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX3Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX3N1YnNjcmliZXJzID0gW107XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wICE9PSByZXNvbHZlcikge1xuICAgICAgICBpZiAoIWxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbihyZXNvbHZlcikpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UodGhpcywgcmVzb2x2ZXIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLmFsbCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yYWNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZXNvbHZlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZWplY3QgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldFNjaGVkdWxlciA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRTY2hlZHVsZXI7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldEFzYXAgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0QXNhcDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fYXNhcCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwO1xuXG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucHJvdG90eXBlID0ge1xuICAgICAgY29uc3RydWN0b3I6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLFxuXG4gICAgLyoqXG4gICAgICBUaGUgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCxcbiAgICAgIHdoaWNoIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlXG4gICAgICByZWFzb24gd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcil7XG4gICAgICAgIC8vIHVzZXIgaXMgYXZhaWxhYmxlXG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyB1c2VyIGlzIHVuYXZhaWxhYmxlLCBhbmQgeW91IGFyZSBnaXZlbiB0aGUgcmVhc29uIHdoeVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQ2hhaW5pbmdcbiAgICAgIC0tLS0tLS0tXG5cbiAgICAgIFRoZSByZXR1cm4gdmFsdWUgb2YgYHRoZW5gIGlzIGl0c2VsZiBhIHByb21pc2UuICBUaGlzIHNlY29uZCwgJ2Rvd25zdHJlYW0nXG4gICAgICBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZmlyc3QgcHJvbWlzZSdzIGZ1bGZpbGxtZW50XG4gICAgICBvciByZWplY3Rpb24gaGFuZGxlciwgb3IgcmVqZWN0ZWQgaWYgdGhlIGhhbmRsZXIgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gdXNlci5uYW1lO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICByZXR1cm4gJ2RlZmF1bHQgbmFtZSc7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh1c2VyTmFtZSkge1xuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHVzZXJOYW1lYCB3aWxsIGJlIHRoZSB1c2VyJ3MgbmFtZSwgb3RoZXJ3aXNlIGl0XG4gICAgICAgIC8vIHdpbGwgYmUgYCdkZWZhdWx0IG5hbWUnYFxuICAgICAgfSk7XG5cbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jyk7XG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBpZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHJlYXNvbmAgd2lsbCBiZSAnRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknLlxuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIHJlamVjdGVkLCBgcmVhc29uYCB3aWxsIGJlICdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jy5cbiAgICAgIH0pO1xuICAgICAgYGBgXG4gICAgICBJZiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIGRvZXMgbm90IHNwZWNpZnkgYSByZWplY3Rpb24gaGFuZGxlciwgcmVqZWN0aW9uIHJlYXNvbnMgd2lsbCBiZSBwcm9wYWdhdGVkIGZ1cnRoZXIgZG93bnN0cmVhbS5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGVkYWdvZ2ljYWxFeGNlcHRpb24oJ1Vwc3RyZWFtIGVycm9yJyk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIFRoZSBgUGVkZ2Fnb2NpYWxFeGNlcHRpb25gIGlzIHByb3BhZ2F0ZWQgYWxsIHRoZSB3YXkgZG93biB0byBoZXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBc3NpbWlsYXRpb25cbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBTb21ldGltZXMgdGhlIHZhbHVlIHlvdSB3YW50IHRvIHByb3BhZ2F0ZSB0byBhIGRvd25zdHJlYW0gcHJvbWlzZSBjYW4gb25seSBiZVxuICAgICAgcmV0cmlldmVkIGFzeW5jaHJvbm91c2x5LiBUaGlzIGNhbiBiZSBhY2hpZXZlZCBieSByZXR1cm5pbmcgYSBwcm9taXNlIGluIHRoZVxuICAgICAgZnVsZmlsbG1lbnQgb3IgcmVqZWN0aW9uIGhhbmRsZXIuIFRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCB0aGVuIGJlIHBlbmRpbmdcbiAgICAgIHVudGlsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlzIHNldHRsZWQuIFRoaXMgaXMgY2FsbGVkICphc3NpbWlsYXRpb24qLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIFRoZSB1c2VyJ3MgY29tbWVudHMgYXJlIG5vdyBhdmFpbGFibGVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIElmIHRoZSBhc3NpbWxpYXRlZCBwcm9taXNlIHJlamVjdHMsIHRoZW4gdGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIGFsc28gcmVqZWN0LlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgZnVsZmlsbHMsIHdlJ2xsIGhhdmUgdGhlIHZhbHVlIGhlcmVcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCByZWplY3RzLCB3ZSdsbCBoYXZlIHRoZSByZWFzb24gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgU2ltcGxlIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIHJlc3VsdDtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzdWx0ID0gZmluZFJlc3VsdCgpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kUmVzdWx0KGZ1bmN0aW9uKHJlc3VsdCwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZFJlc3VsdCgpLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgRXhhbXBsZVxuICAgICAgLS0tLS0tLS0tLS0tLS1cblxuICAgICAgU3luY2hyb25vdXMgRXhhbXBsZVxuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICB2YXIgYXV0aG9yLCBib29rcztcblxuICAgICAgdHJ5IHtcbiAgICAgICAgYXV0aG9yID0gZmluZEF1dGhvcigpO1xuICAgICAgICBib29rcyAgPSBmaW5kQm9va3NCeUF1dGhvcihhdXRob3IpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG5cbiAgICAgIGZ1bmN0aW9uIGZvdW5kQm9va3MoYm9va3MpIHtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBmYWlsdXJlKHJlYXNvbikge1xuXG4gICAgICB9XG5cbiAgICAgIGZpbmRBdXRob3IoZnVuY3Rpb24oYXV0aG9yLCBlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZmluZEJvb29rc0J5QXV0aG9yKGF1dGhvciwgZnVuY3Rpb24oYm9va3MsIGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBmb3VuZEJvb2tzKGJvb2tzKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgZmFpbHVyZShyZWFzb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZEF1dGhvcigpLlxuICAgICAgICB0aGVuKGZpbmRCb29rc0J5QXV0aG9yKS5cbiAgICAgICAgdGhlbihmdW5jdGlvbihib29rcyl7XG4gICAgICAgICAgLy8gZm91bmQgYm9va3NcbiAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAbWV0aG9kIHRoZW5cbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uRnVsZmlsbGVkXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICB0aGVuOiBmdW5jdGlvbihvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgICB2YXIgcGFyZW50ID0gdGhpcztcbiAgICAgICAgdmFyIHN0YXRlID0gcGFyZW50Ll9zdGF0ZTtcblxuICAgICAgICBpZiAoc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCAmJiAhb25GdWxmaWxsbWVudCB8fCBzdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQgJiYgIW9uUmVqZWN0aW9uKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2hpbGQgPSBuZXcgdGhpcy5jb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgICAgdmFyIHJlc3VsdCA9IHBhcmVudC5fcmVzdWx0O1xuXG4gICAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3VtZW50c1tzdGF0ZSAtIDFdO1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCByZXN1bHQpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2hpbGQ7XG4gICAgICB9LFxuXG4gICAgLyoqXG4gICAgICBgY2F0Y2hgIGlzIHNpbXBseSBzdWdhciBmb3IgYHRoZW4odW5kZWZpbmVkLCBvblJlamVjdGlvbilgIHdoaWNoIG1ha2VzIGl0IHRoZSBzYW1lXG4gICAgICBhcyB0aGUgY2F0Y2ggYmxvY2sgb2YgYSB0cnkvY2F0Y2ggc3RhdGVtZW50LlxuXG4gICAgICBgYGBqc1xuICAgICAgZnVuY3Rpb24gZmluZEF1dGhvcigpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkbid0IGZpbmQgdGhhdCBhdXRob3InKTtcbiAgICAgIH1cblxuICAgICAgLy8gc3luY2hyb25vdXNcbiAgICAgIHRyeSB7XG4gICAgICAgIGZpbmRBdXRob3IoKTtcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9XG5cbiAgICAgIC8vIGFzeW5jIHdpdGggcHJvbWlzZXNcbiAgICAgIGZpbmRBdXRob3IoKS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCBjYXRjaFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3Rpb25cbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICAgKi9cbiAgICAgICdjYXRjaCc6IGZ1bmN0aW9uKG9uUmVqZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuICAgIH07XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRwb2x5ZmlsbCgpIHtcbiAgICAgIHZhciBsb2NhbDtcblxuICAgICAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgbG9jYWwgPSBnbG9iYWw7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsID0gc2VsZjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgbG9jYWwgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwb2x5ZmlsbCBmYWlsZWQgYmVjYXVzZSBnbG9iYWwgb2JqZWN0IGlzIHVuYXZhaWxhYmxlIGluIHRoaXMgZW52aXJvbm1lbnQnKTtcbiAgICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBQID0gbG9jYWwuUHJvbWlzZTtcblxuICAgICAgaWYgKFAgJiYgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKFAucmVzb2x2ZSgpKSA9PT0gJ1tvYmplY3QgUHJvbWlzZV0nICYmICFQLmNhc3QpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsb2NhbC5Qcm9taXNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQ7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJHBvbHlmaWxsO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2UgPSB7XG4gICAgICAnUHJvbWlzZSc6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0LFxuICAgICAgJ3BvbHlmaWxsJzogbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0XG4gICAgfTtcblxuICAgIC8qIGdsb2JhbCBkZWZpbmU6dHJ1ZSBtb2R1bGU6dHJ1ZSB3aW5kb3c6IHRydWUgKi9cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmVbJ2FtZCddKSB7XG4gICAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlOyB9KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZVsnZXhwb3J0cyddKSB7XG4gICAgICBtb2R1bGVbJ2V4cG9ydHMnXSA9IGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRoaXNbJ0VTNlByb21pc2UnXSA9IGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0KCk7XG59KS5jYWxsKHRoaXMpO1xuXG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJBbmFseXRpY3MgPSBudWxsO1xuXG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmFuYWx5dGljcycsIFsnaW9uaWMnXSlcblxuICAudmFsdWUoJ0lPTklDX0FOQUxZVElDU19WRVJTSU9OJywgSW9uaWMuQW5hbHl0aWNzLnZlcnNpb24pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0FuYWx5dGljcycsIFtmdW5jdGlvbigpIHtcbiAgICBpZiAoIUlvbmljQW5ndWxhckFuYWx5dGljcykge1xuICAgICAgSW9uaWNBbmd1bGFyQW5hbHl0aWNzID0gbmV3IElvbmljLkFuYWx5dGljcyhcIkRFRkVSX1JFR0lTVEVSXCIpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyQW5hbHl0aWNzO1xuICB9XSlcblxuICAuZmFjdG9yeSgnZG9tU2VyaWFsaXplcicsIFtmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IElvbmljLkFuYWx5dGljU2VyaWFsaXplcnMuRE9NU2VyaWFsaXplcigpO1xuICB9XSlcblxuICAucnVuKFsnJGlvbmljQW5hbHl0aWNzJywgJyRzdGF0ZScsIGZ1bmN0aW9uKCRpb25pY0FuYWx5dGljcywgJHN0YXRlKSB7XG4gICAgJGlvbmljQW5hbHl0aWNzLnNldEdsb2JhbFByb3BlcnRpZXMoZnVuY3Rpb24oZXZlbnRDb2xsZWN0aW9uLCBldmVudERhdGEpIHtcbiAgICAgIGlmICghZXZlbnREYXRhLl91aSkge1xuICAgICAgICBldmVudERhdGEuX3VpID0ge307XG4gICAgICB9XG4gICAgICBldmVudERhdGEuX3VpLmFjdGl2ZV9zdGF0ZSA9ICRzdGF0ZS5jdXJyZW50Lm5hbWU7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICB9KTtcbiAgfV0pO1xuXG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuYW5hbHl0aWNzJylcblxuICAucHJvdmlkZXIoJyRpb25pY0F1dG9UcmFjaycsW2Z1bmN0aW9uKCkge1xuXG4gICAgdmFyIHRyYWNrZXJzRGlzYWJsZWQgPSB7fSxcbiAgICAgIGFsbFRyYWNrZXJzRGlzYWJsZWQgPSBmYWxzZTtcblxuICAgIHRoaXMuZGlzYWJsZVRyYWNraW5nID0gZnVuY3Rpb24odHJhY2tlcikge1xuICAgICAgaWYgKHRyYWNrZXIpIHtcbiAgICAgICAgdHJhY2tlcnNEaXNhYmxlZFt0cmFja2VyXSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhbGxUcmFja2Vyc0Rpc2FibGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdGhpcy4kZ2V0ID0gW2Z1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgXCJpc0VuYWJsZWRcIjogZnVuY3Rpb24odHJhY2tlcikge1xuICAgICAgICAgIHJldHVybiAhYWxsVHJhY2tlcnNEaXNhYmxlZCAmJiAhdHJhY2tlcnNEaXNhYmxlZFt0cmFja2VyXTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfV0pXG5cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBBdXRvIHRyYWNrZXJzXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblxuICAucnVuKFsnJGlvbmljQXV0b1RyYWNrJywgJyRpb25pY0FuYWx5dGljcycsIGZ1bmN0aW9uKCRpb25pY0F1dG9UcmFjaywgJGlvbmljQW5hbHl0aWNzKSB7XG4gICAgaWYgKCEkaW9uaWNBdXRvVHJhY2suaXNFbmFibGVkKCdMb2FkJykpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKCdMb2FkJyk7XG4gIH1dKVxuXG4gIC5ydW4oW1xuICAgICckaW9uaWNBdXRvVHJhY2snLFxuICAgICckZG9jdW1lbnQnLFxuICAgICckaW9uaWNBbmFseXRpY3MnLFxuICAgICdkb21TZXJpYWxpemVyJyxcbiAgICBmdW5jdGlvbigkaW9uaWNBdXRvVHJhY2ssICRkb2N1bWVudCwgJGlvbmljQW5hbHl0aWNzLCBkb21TZXJpYWxpemVyKSB7XG4gICAgICBpZiAoISRpb25pY0F1dG9UcmFjay5pc0VuYWJsZWQoJ1RhcCcpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgJGRvY3VtZW50Lm9uKCdjbGljaycsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIC8vIHdhbnQgY29vcmRpbmF0ZXMgYXMgYSBwZXJjZW50YWdlIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgZWxlbWVudFxuICAgICAgICB2YXIgYm94ID0gZXZlbnQudGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuICAgICAgICAgIHdpZHRoID0gYm94LnJpZ2h0IC0gYm94LmxlZnQsXG4gICAgICAgICAgaGVpZ2h0ID0gYm94LmJvdHRvbSAtIGJveC50b3AsXG4gICAgICAgICAgbm9ybVggPSAoZXZlbnQucGFnZVggLSBib3gubGVmdCkgLyB3aWR0aCxcbiAgICAgICAgICBub3JtWSA9IChldmVudC5wYWdlWSAtIGJveC50b3ApIC8gaGVpZ2h0O1xuXG4gICAgICAgIHZhciBldmVudERhdGEgPSB7XG4gICAgICAgICAgXCJjb29yZGluYXRlc1wiOiB7XG4gICAgICAgICAgICBcInhcIjogZXZlbnQucGFnZVgsXG4gICAgICAgICAgICBcInlcIjogZXZlbnQucGFnZVlcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidGFyZ2V0XCI6IGRvbVNlcmlhbGl6ZXIuZWxlbWVudFNlbGVjdG9yKGV2ZW50LnRhcmdldCksXG4gICAgICAgICAgXCJ0YXJnZXRfaWRlbnRpZmllclwiOiBkb21TZXJpYWxpemVyLmVsZW1lbnROYW1lKGV2ZW50LnRhcmdldClcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaXNGaW5pdGUobm9ybVgpICYmIGlzRmluaXRlKG5vcm1ZKSkge1xuICAgICAgICAgIGV2ZW50RGF0YS5jb29yZGluYXRlcy54X25vcm0gPSBub3JtWDsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgIGV2ZW50RGF0YS5jb29yZGluYXRlcy55X25vcm0gPSBub3JtWTsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICB9XG5cbiAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrKCdUYXAnLCB7XG4gICAgICAgICAgXCJfdWlcIjogZXZlbnREYXRhXG4gICAgICAgIH0pO1xuXG4gICAgICB9KTtcbiAgICB9XG4gIF0pXG5cbiAgLnJ1bihbXG4gICAgJyRpb25pY0F1dG9UcmFjaycsXG4gICAgJyRpb25pY0FuYWx5dGljcycsXG4gICAgJyRyb290U2NvcGUnLFxuICAgIGZ1bmN0aW9uKCRpb25pY0F1dG9UcmFjaywgJGlvbmljQW5hbHl0aWNzLCAkcm9vdFNjb3BlKSB7XG4gICAgICBpZiAoISRpb25pY0F1dG9UcmFjay5pc0VuYWJsZWQoJ1N0YXRlIENoYW5nZScpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN1Y2Nlc3MnLCBmdW5jdGlvbihldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMsIGZyb21TdGF0ZSwgZnJvbVBhcmFtcykgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgICAgICRpb25pY0FuYWx5dGljcy50cmFjaygnU3RhdGUgQ2hhbmdlJywge1xuICAgICAgICAgIFwiZnJvbVwiOiBmcm9tU3RhdGUubmFtZSxcbiAgICAgICAgICBcInRvXCI6IHRvU3RhdGUubmFtZVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgXSlcblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBpb24tdHJhY2stJEVWRU5UXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAgICogQG5hbWUgaW9uVHJhY2tDbGlja1xuICAgKiBAbW9kdWxlIGlvbmljLnNlcnZpY2UuYW5hbHl0aWNzXG4gICAqIEByZXN0cmljdCBBXG4gICAqIEBwYXJlbnQgaW9uaWMuZGlyZWN0aXZlOmlvblRyYWNrQ2xpY2tcbiAgICpcbiAgICogQGRlc2NyaXB0aW9uXG4gICAqXG4gICAqIEEgY29udmVuaWVudCBkaXJlY3RpdmUgdG8gYXV0b21hdGljYWxseSB0cmFjayBhIGNsaWNrL3RhcCBvbiBhIGJ1dHRvblxuICAgKiBvciBvdGhlciB0YXBwYWJsZSBlbGVtZW50LlxuICAgKlxuICAgKiBAdXNhZ2VcbiAgICogYGBgaHRtbFxuICAgKiA8YnV0dG9uIGNsYXNzPVwiYnV0dG9uIGJ1dHRvbi1jbGVhclwiIGlvbi10cmFjay1jbGljayBpb24tdHJhY2stZXZlbnQ9XCJjdGEtdGFwXCI+VHJ5IG5vdyE8L2J1dHRvbj5cbiAgICogYGBgXG4gICAqL1xuXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrQ2xpY2snLCBpb25UcmFja0RpcmVjdGl2ZSgnY2xpY2snKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tUYXAnLCBpb25UcmFja0RpcmVjdGl2ZSgndGFwJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRG91YmxldGFwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RvdWJsZXRhcCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0hvbGQnLCBpb25UcmFja0RpcmVjdGl2ZSgnaG9sZCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1JlbGVhc2UnLCBpb25UcmFja0RpcmVjdGl2ZSgncmVsZWFzZScpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWcnLCBpb25UcmFja0RpcmVjdGl2ZSgnZHJhZycpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdMZWZ0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWdsZWZ0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrRHJhZ1JpZ2h0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ2RyYWdyaWdodCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja0RyYWdVcCcsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFndXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tEcmFnRG93bicsIGlvblRyYWNrRGlyZWN0aXZlKCdkcmFnZG93bicpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1N3aXBlTGVmdCcsIGlvblRyYWNrRGlyZWN0aXZlKCdzd2lwZWxlZnQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZVJpZ2h0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBlcmlnaHQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZVVwJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3N3aXBldXAnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tTd2lwZURvd24nLCBpb25UcmFja0RpcmVjdGl2ZSgnc3dpcGVkb3duJykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrVHJhbnNmb3JtJywgaW9uVHJhY2tEaXJlY3RpdmUoJ2hvbGQnKSlcbiAgLmRpcmVjdGl2ZSgnaW9uVHJhY2tQaW5jaCcsIGlvblRyYWNrRGlyZWN0aXZlKCdwaW5jaCcpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1BpbmNoSW4nLCBpb25UcmFja0RpcmVjdGl2ZSgncGluY2hpbicpKVxuICAuZGlyZWN0aXZlKCdpb25UcmFja1BpbmNoT3V0JywgaW9uVHJhY2tEaXJlY3RpdmUoJ3BpbmNob3V0JykpXG4gIC5kaXJlY3RpdmUoJ2lvblRyYWNrUm90YXRlJywgaW9uVHJhY2tEaXJlY3RpdmUoJ3JvdGF0ZScpKTtcblxuICAvKipcbiAgICogR2VuZXJpYyBkaXJlY3RpdmUgdG8gY3JlYXRlIGF1dG8gZXZlbnQgaGFuZGxpbmcgYW5hbHl0aWNzIGRpcmVjdGl2ZXMgbGlrZTpcbiAgICpcbiAgICogPGJ1dHRvbiBpb24tdHJhY2stY2xpY2s9XCJldmVudE5hbWVcIj5DbGljayBUcmFjazwvYnV0dG9uPlxuICAgKiA8YnV0dG9uIGlvbi10cmFjay1ob2xkPVwiZXZlbnROYW1lXCI+SG9sZCBUcmFjazwvYnV0dG9uPlxuICAgKiA8YnV0dG9uIGlvbi10cmFjay10YXA9XCJldmVudE5hbWVcIj5UYXAgVHJhY2s8L2J1dHRvbj5cbiAgICogPGJ1dHRvbiBpb24tdHJhY2stZG91YmxldGFwPVwiZXZlbnROYW1lXCI+RG91YmxlIFRhcCBUcmFjazwvYnV0dG9uPlxuICAgKlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZG9tRXZlbnROYW1lIFRoZSBET00gZXZlbnQgbmFtZVxuICAgKiBAcmV0dXJuIHthcnJheX0gQW5ndWxhciBEaXJlY3RpdmUgZGVjbGFyYXRpb25cbiAgICovXG4gIGZ1bmN0aW9uIGlvblRyYWNrRGlyZWN0aXZlKGRvbUV2ZW50TmFtZSkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lXG4gICAgcmV0dXJuIFsnJGlvbmljQW5hbHl0aWNzJywgJyRpb25pY0dlc3R1cmUnLCBmdW5jdGlvbigkaW9uaWNBbmFseXRpY3MsICRpb25pY0dlc3R1cmUpIHtcblxuICAgICAgdmFyIGdlc3R1cmVEcml2ZW4gPSBbXG4gICAgICAgICdkcmFnJywgJ2RyYWdzdGFydCcsICdkcmFnZW5kJywgJ2RyYWdsZWZ0JywgJ2RyYWdyaWdodCcsICdkcmFndXAnLCAnZHJhZ2Rvd24nLFxuICAgICAgICAnc3dpcGUnLCAnc3dpcGVsZWZ0JywgJ3N3aXBlcmlnaHQnLCAnc3dpcGV1cCcsICdzd2lwZWRvd24nLFxuICAgICAgICAndGFwJywgJ2RvdWJsZXRhcCcsICdob2xkJyxcbiAgICAgICAgJ3RyYW5zZm9ybScsICdwaW5jaCcsICdwaW5jaGluJywgJ3BpbmNob3V0JywgJ3JvdGF0ZSdcbiAgICAgIF07XG4gICAgICAvLyBDaGVjayBpZiB3ZSBuZWVkIHRvIHVzZSB0aGUgZ2VzdHVyZSBzdWJzeXN0ZW0gb3IgdGhlIERPTSBzeXN0ZW1cbiAgICAgIHZhciBpc0dlc3R1cmVEcml2ZW4gPSBmYWxzZTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ2VzdHVyZURyaXZlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZ2VzdHVyZURyaXZlbltpXSA9PT0gZG9tRXZlbnROYW1lLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICBpc0dlc3R1cmVEcml2ZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBcInJlc3RyaWN0XCI6ICdBJyxcbiAgICAgICAgXCJsaW5rXCI6IGZ1bmN0aW9uKCRzY29wZSwgJGVsZW1lbnQsICRhdHRyKSB7XG4gICAgICAgICAgdmFyIGNhcGl0YWxpemVkID0gZG9tRXZlbnROYW1lWzBdLnRvVXBwZXJDYXNlKCkgKyBkb21FdmVudE5hbWUuc2xpY2UoMSk7XG4gICAgICAgICAgLy8gR3JhYiBldmVudCBuYW1lIHdlIHdpbGwgc2VuZFxuICAgICAgICAgIHZhciBldmVudE5hbWUgPSAkYXR0clsnaW9uVHJhY2snICsgY2FwaXRhbGl6ZWRdO1xuXG4gICAgICAgICAgaWYgKGlzR2VzdHVyZURyaXZlbikge1xuICAgICAgICAgICAgdmFyIGdlc3R1cmUgPSAkaW9uaWNHZXN0dXJlLm9uKGRvbUV2ZW50TmFtZSwgaGFuZGxlciwgJGVsZW1lbnQpO1xuICAgICAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgJGlvbmljR2VzdHVyZS5vZmYoZ2VzdHVyZSwgZG9tRXZlbnROYW1lLCBoYW5kbGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkZWxlbWVudC5vbihkb21FdmVudE5hbWUsIGhhbmRsZXIpO1xuICAgICAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgJGVsZW1lbnQub2ZmKGRvbUV2ZW50TmFtZSwgaGFuZGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cblxuICAgICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoZSkge1xuICAgICAgICAgICAgdmFyIGV2ZW50RGF0YSA9ICRzY29wZS4kZXZhbCgkYXR0ci5pb25UcmFja0RhdGEpIHx8IHt9O1xuICAgICAgICAgICAgaWYgKGV2ZW50TmFtZSkge1xuICAgICAgICAgICAgICAkaW9uaWNBbmFseXRpY3MudHJhY2soZXZlbnROYW1lLCBldmVudERhdGEpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgJGlvbmljQW5hbHl0aWNzLnRyYWNrQ2xpY2soZS5wYWdlWCwgZS5wYWdlWSwgZS50YXJnZXQsIHtcbiAgICAgICAgICAgICAgICBcImRhdGFcIjogZXZlbnREYXRhXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XTtcbiAgfVxuXG59XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJBdXRoID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5hdXRoJywgW10pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0F1dGgnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJBdXRoKSB7XG4gICAgICBJb25pY0FuZ3VsYXJBdXRoID0gSW9uaWMuQXV0aDtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhckF1dGg7XG4gIH1dKTtcbn1cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmNvcmUnLCBbXSlcblxuICAvKipcbiAgICogQHByaXZhdGVcbiAgICogUHJvdmlkZXMgYSBzYWZlIGludGVyZmFjZSB0byBzdG9yZSBvYmplY3RzIGluIHBlcnNpc3RlbnQgbWVtb3J5XG4gICAqL1xuICAucHJvdmlkZXIoJ3BlcnNpc3RlbnRTdG9yYWdlJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICckZ2V0JzogW2Z1bmN0aW9uKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IElvbmljLmdldFNlcnZpY2UoJ1N0b3JhZ2UnKTtcbiAgICAgICAgaWYgKCFzdG9yYWdlKSB7XG4gICAgICAgICAgc3RvcmFnZSA9IG5ldyBJb25pYy5JTy5TdG9yYWdlKCk7XG4gICAgICAgICAgSW9uaWMuYWRkU2VydmljZSgnU3RvcmFnZScsIHN0b3JhZ2UsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdG9yYWdlO1xuICAgICAgfV1cbiAgICB9O1xuICB9KVxuXG4gIC5mYWN0b3J5KCckaW9uaWNDb3JlU2V0dGluZ3MnLCBbXG4gICAgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IElvbmljLklPLlNldHRpbmdzKCk7XG4gICAgfVxuICBdKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNVc2VyJywgW1xuICAgIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIElvbmljLlVzZXI7XG4gICAgfVxuICBdKVxuXG4gIC5ydW4oW2Z1bmN0aW9uKCkge1xuICAgIElvbmljLmlvKCk7XG4gIH1dKTtcbn1cblxuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyRGVwbG95ID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5kZXBsb3knLCBbXSlcblxuICAuZmFjdG9yeSgnJGlvbmljRGVwbG95JywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyRGVwbG95KSB7XG4gICAgICBJb25pY0FuZ3VsYXJEZXBsb3kgPSBuZXcgSW9uaWMuRGVwbG95KCk7XG4gICAgfVxuICAgIHJldHVybiBJb25pY0FuZ3VsYXJEZXBsb3k7XG4gIH1dKTtcbn1cbiIsImltcG9ydCB7IEFwcCB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvYXBwXCI7XG5pbXBvcnQgeyBJb25pY1BsYXRmb3JtIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9jb3JlXCI7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2V2ZW50c1wiO1xuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9sb2dnZXJcIjtcbmltcG9ydCB7IFByb21pc2UsIERlZmVycmVkUHJvbWlzZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvcHJvbWlzZVwiO1xuaW1wb3J0IHsgUmVxdWVzdCwgUmVzcG9uc2UsIEFQSVJlcXVlc3QsIEFQSVJlc3BvbnNlIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvY29yZS9yZXF1ZXN0XCI7XG5pbXBvcnQgeyBDb25maWcgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2NvbmZpZ1wiO1xuaW1wb3J0IHsgU3RvcmFnZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvc3RvcmFnZVwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2NvcmUvdXNlclwiO1xuaW1wb3J0IHsgRGF0YVR5cGUgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9jb3JlL2RhdGEtdHlwZXNcIjtcbmltcG9ydCB7IEFuYWx5dGljcyB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2FuYWx5dGljcy9hbmFseXRpY3NcIjtcbmltcG9ydCB7IEJ1Y2tldFN0b3JhZ2UgfSBmcm9tIFwiLi8uLi9kaXN0L2VzNi9hbmFseXRpY3Mvc3RvcmFnZVwiO1xuaW1wb3J0IHsgRE9NU2VyaWFsaXplciB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2FuYWx5dGljcy9zZXJpYWxpemVyc1wiO1xuaW1wb3J0IHsgQXV0aCB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L2F1dGgvYXV0aFwiO1xuaW1wb3J0IHsgRGVwbG95IH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvZGVwbG95L2RlcGxveVwiO1xuaW1wb3J0IHsgUHVzaCB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L3B1c2gvcHVzaFwiO1xuaW1wb3J0IHsgUHVzaFRva2VuIH0gZnJvbSBcIi4vLi4vZGlzdC9lczYvcHVzaC9wdXNoLXRva2VuXCI7XG5pbXBvcnQgeyBQdXNoTWVzc2FnZSB9IGZyb20gXCIuLy4uL2Rpc3QvZXM2L3B1c2gvcHVzaC1tZXNzYWdlXCI7XG5cbi8vIERlY2xhcmUgdGhlIHdpbmRvdyBvYmplY3RcbndpbmRvdy5Jb25pYyA9IHdpbmRvdy5Jb25pYyB8fCB7fTtcblxuLy8gSW9uaWMgTW9kdWxlc1xuSW9uaWMuQ29yZSA9IElvbmljUGxhdGZvcm07XG5Jb25pYy5Vc2VyID0gVXNlcjtcbklvbmljLkFuYWx5dGljcyA9IEFuYWx5dGljcztcbklvbmljLkF1dGggPSBBdXRoO1xuSW9uaWMuRGVwbG95ID0gRGVwbG95O1xuSW9uaWMuUHVzaCA9IFB1c2g7XG5Jb25pYy5QdXNoVG9rZW4gPSBQdXNoVG9rZW47XG5Jb25pYy5QdXNoTWVzc2FnZSA9IFB1c2hNZXNzYWdlO1xuXG4vLyBEYXRhVHlwZSBOYW1lc3BhY2VcbklvbmljLkRhdGFUeXBlID0gRGF0YVR5cGU7XG5Jb25pYy5EYXRhVHlwZXMgPSBEYXRhVHlwZS5nZXRNYXBwaW5nKCk7XG5cbi8vIElPIE5hbWVzcGFjZVxuSW9uaWMuSU8gPSB7fTtcbklvbmljLklPLkFwcCA9IEFwcDtcbklvbmljLklPLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcbklvbmljLklPLkxvZ2dlciA9IExvZ2dlcjtcbklvbmljLklPLlByb21pc2UgPSBQcm9taXNlO1xuSW9uaWMuSU8uRGVmZXJyZWRQcm9taXNlID0gRGVmZXJyZWRQcm9taXNlO1xuSW9uaWMuSU8uUmVxdWVzdCA9IFJlcXVlc3Q7XG5Jb25pYy5JTy5SZXNwb25zZSA9IFJlc3BvbnNlO1xuSW9uaWMuSU8uQVBJUmVxdWVzdCA9IEFQSVJlcXVlc3Q7XG5Jb25pYy5JTy5BUElSZXNwb25zZSA9IEFQSVJlc3BvbnNlO1xuSW9uaWMuSU8uU3RvcmFnZSA9IFN0b3JhZ2U7XG5Jb25pYy5JTy5Db25maWcgPSBDb25maWc7XG5cbi8vIEFuYWx5dGljIFN0b3JhZ2UgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1N0b3JhZ2UgPSB7fTtcbklvbmljLkFuYWx5dGljU3RvcmFnZS5CdWNrZXRTdG9yYWdlID0gQnVja2V0U3RvcmFnZTtcblxuLy8gQW5hbHl0aWMgU2VyaWFsaXplcnMgTmFtZXNwYWNlXG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzID0ge307XG5Jb25pYy5BbmFseXRpY1NlcmlhbGl6ZXJzLkRPTVNlcmlhbGl6ZXIgPSBET01TZXJpYWxpemVyO1xuXG5cbi8vIFByb3ZpZGVyIGEgc2luZ2xlIHN0b3JhZ2UgZm9yIHNlcnZpY2VzIHRoYXQgaGF2ZSBwcmV2aW91c2x5IGJlZW4gcmVnaXN0ZXJlZFxudmFyIHNlcnZpY2VTdG9yYWdlID0ge307XG5cbklvbmljLmlvID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBJb25pYy5Db3JlO1xufTtcblxuSW9uaWMuZ2V0U2VydmljZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgaWYgKHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9PT0gJ3VuZGVmaW5lZCcgfHwgIXNlcnZpY2VTdG9yYWdlW25hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBzZXJ2aWNlU3RvcmFnZVtuYW1lXTtcbn07XG5cbklvbmljLmFkZFNlcnZpY2UgPSBmdW5jdGlvbihuYW1lLCBzZXJ2aWNlLCBmb3JjZSkge1xuICBpZiAoc2VydmljZSAmJiB0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgc2VydmljZVN0b3JhZ2VbbmFtZV0gPSBzZXJ2aWNlO1xuICB9IGVsc2UgaWYgKHNlcnZpY2UgJiYgZm9yY2UpIHtcbiAgICBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9IHNlcnZpY2U7XG4gIH1cbn07XG5cbklvbmljLnJlbW92ZVNlcnZpY2UgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGlmICh0eXBlb2Ygc2VydmljZVN0b3JhZ2VbbmFtZV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZGVsZXRlIHNlcnZpY2VTdG9yYWdlW25hbWVdO1xuICB9XG59O1xuIiwiLy8gQWRkIEFuZ3VsYXIgaW50ZWdyYXRpb25zIGlmIEFuZ3VsYXIgaXMgYXZhaWxhYmxlXG5pZiAoKHR5cGVvZiBhbmd1bGFyID09PSAnb2JqZWN0JykgJiYgYW5ndWxhci5tb2R1bGUpIHtcblxuICB2YXIgSW9uaWNBbmd1bGFyUHVzaCA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UucHVzaCcsIFtdKVxuXG4gIC8qKlxuICAgKiBJb25pY1B1c2hBY3Rpb24gU2VydmljZVxuICAgKlxuICAgKiBBIHV0aWxpdHkgc2VydmljZSB0byBraWNrIG9mZiBtaXNjIGZlYXR1cmVzIGFzIHBhcnQgb2YgdGhlIElvbmljIFB1c2ggc2VydmljZVxuICAgKi9cbiAgLmZhY3RvcnkoJyRpb25pY1B1c2hBY3Rpb24nLCBbJyRzdGF0ZScsIGZ1bmN0aW9uKCRzdGF0ZSkge1xuXG4gICAgY2xhc3MgUHVzaEFjdGlvblNlcnZpY2Uge1xuXG4gICAgICAvKipcbiAgICAgICAqIFN0YXRlIE5hdmlnYXRpb25cbiAgICAgICAqXG4gICAgICAgKiBBdHRlbXB0cyB0byBuYXZpZ2F0ZSB0byBhIG5ldyB2aWV3IGlmIGEgcHVzaCBub3RpZmljYXRpb24gcGF5bG9hZCBjb250YWluczpcbiAgICAgICAqXG4gICAgICAgKiAgIC0gJHN0YXRlIHtTdHJpbmd9IFRoZSBzdGF0ZSBuYW1lIChlLmcgJ3RhYi5jaGF0cycpXG4gICAgICAgKiAgIC0gJHN0YXRlUGFyYW1zIHtPYmplY3R9IFByb3ZpZGVkIHN0YXRlICh1cmwpIHBhcmFtc1xuICAgICAgICpcbiAgICAgICAqIEZpbmQgbW9yZSBpbmZvIGFib3V0IHN0YXRlIG5hdmlnYXRpb24gYW5kIHBhcmFtczpcbiAgICAgICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyLXVpL3VpLXJvdXRlci93aWtpXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IG5vdGlmaWNhdGlvbiBOb3RpZmljYXRpb24gT2JqZWN0XG4gICAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAgICovXG4gICAgICBub3RpZmljYXRpb25OYXZpZ2F0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgICB2YXIgc3RhdGUgPSBub3RpZmljYXRpb24ucGF5bG9hZC4kc3RhdGUgfHwgZmFsc2U7XG4gICAgICAgIHZhciBzdGF0ZVBhcmFtcyA9IG5vdGlmaWNhdGlvbi5wYXlsb2FkLiRzdGF0ZVBhcmFtcyB8fCB7fTtcbiAgICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgICAgJHN0YXRlLmdvKHN0YXRlLCBzdGF0ZVBhcmFtcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFB1c2hBY3Rpb25TZXJ2aWNlKCk7XG4gIH1dKVxuXG4gIC5mYWN0b3J5KCckaW9uaWNQdXNoJywgW2Z1bmN0aW9uKCkge1xuICAgIGlmICghSW9uaWNBbmd1bGFyUHVzaCkge1xuICAgICAgSW9uaWNBbmd1bGFyUHVzaCA9IG5ldyBJb25pYy5QdXNoKFwiREVGRVJfSU5JVFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhclB1c2g7XG4gIH1dKVxuXG4gIC5ydW4oWyckaW9uaWNQdXNoJywgJyRpb25pY1B1c2hBY3Rpb24nLCBmdW5jdGlvbigkaW9uaWNQdXNoLCAkaW9uaWNQdXNoQWN0aW9uKSB7XG4gICAgLy8gVGhpcyBpcyB3aGF0IGtpY2tzIG9mZiB0aGUgc3RhdGUgcmVkaXJlY3Rpb24gd2hlbiBhIHB1c2ggbm90aWZpY2FpdG9uIGhhcyB0aGUgcmVsZXZhbnQgZGV0YWlsc1xuICAgICRpb25pY1B1c2guX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6cHJvY2Vzc05vdGlmaWNhdGlvbicsIGZ1bmN0aW9uKG5vdGlmaWNhdGlvbikge1xuICAgICAgbm90aWZpY2F0aW9uID0gSW9uaWMuUHVzaE1lc3NhZ2UuZnJvbVBsdWdpbkpTT04obm90aWZpY2F0aW9uKTtcbiAgICAgIGlmIChub3RpZmljYXRpb24gJiYgbm90aWZpY2F0aW9uLmFwcCkge1xuICAgICAgICBpZiAobm90aWZpY2F0aW9uLmFwcC5hc2xlZXAgPT09IHRydWUgfHwgbm90aWZpY2F0aW9uLmFwcC5jbG9zZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAkaW9uaWNQdXNoQWN0aW9uLm5vdGlmaWNhdGlvbk5hdmlnYXRpb24obm90aWZpY2F0aW9uKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gIH1dKTtcbn1cbiJdfQ==
