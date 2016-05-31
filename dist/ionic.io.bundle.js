(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
var request_1 = require('../core/request');
var promise_1 = require('../core/promise');
var core_1 = require('../core/core');
var storage_1 = require('../core/storage');
var user_1 = require('../core/user');
var storage = new storage_1.PlatformLocalStorageStrategy();
var sessionStorage = new storage_1.LocalSessionStorageStrategy();
var __authModules = {};
var __authToken = null;
var authAPIBase = core_1.IonicPlatform.config.getURL('platform-api') + '/auth';
var authAPIEndpoints = {
    'login': function (provider) {
        if (provider === void 0) { provider = null; }
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
        sessionStorage.set(TempTokenContext.label, __authToken);
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
        storage.set(TokenContext.label, __authToken);
    };
    TokenContext.getRawData = function () {
        return storage.get(TokenContext.label) || false;
    };
    return TokenContext;
}());
exports.TokenContext = TokenContext;
function storeToken(options, token) {
    __authToken = token;
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
            new request_1.APIRequest({
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
        var context = __authModules[moduleId] || false;
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
        var context = __authModules.basic || false;
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
        if (!__authModules[moduleId]) {
            __authModules[moduleId] = module;
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
        new request_1.APIRequest({
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
        new request_1.APIRequest({
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

},{"../core/core":5,"../core/promise":10,"../core/request":11,"../core/storage":12,"../core/user":13}],2:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./auth'));

},{"./auth":1}],3:[function(require,module,exports){
"use strict";
var logger_1 = require('./logger');
var App = (function () {
    function App(appId) {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic App:'
        });
        if (!appId || appId === '') {
            this.logger.info('No app_id was provided');
            return;
        }
        this._id = appId;
        // other config value reference
        this.devPush = null;
        this.gcmKey = null;
    }
    Object.defineProperty(App.prototype, "id", {
        get: function () {
            return this._id;
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

},{"./logger":9}],4:[function(require,module,exports){
"use strict";
var IonicPlatformConfig = (function () {
    function IonicPlatformConfig() {
        this._settings = {};
        this._devLocations = {};
        this._locations = {
            'api': 'https://apps.ionic.io',
            'push': 'https://push.ionic.io',
            'deploy': 'https://apps.ionic.io',
            'platform-api': 'https://api.ionic.io'
        };
    }
    IonicPlatformConfig.prototype.get = function (name) {
        return this._settings[name];
    };
    IonicPlatformConfig.prototype.getURL = function (name) {
        if (this._devLocations[name]) {
            return this._devLocations[name];
        }
        else if (this._locations[name]) {
            return this._locations[name];
        }
        else {
            return null;
        }
    };
    IonicPlatformConfig.prototype.register = function (settings) {
        if (settings === void 0) { settings = {}; }
        this._settings = settings;
        this._devLocations = settings.dev_locations || {};
    };
    return IonicPlatformConfig;
}());
exports.IonicPlatformConfig = IonicPlatformConfig;
exports.Config = new IonicPlatformConfig();

},{}],5:[function(require,module,exports){
"use strict";
var events_1 = require('./events');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var config_1 = require('./config');
var eventEmitter = new events_1.EventEmitter();
var mainStorage = new storage_1.Storage();
var IonicPlatformCore = (function () {
    function IonicPlatformCore() {
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

},{"./config":4,"./events":7,"./logger":9,"./storage":12}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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

},{"./app":3,"./config":4,"./core":5,"./data-types":6,"./events":7,"./logger":9,"./promise":10,"./request":11,"./storage":12,"./user":13}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
"use strict";
var es6_promise_1 = require('es6-promise');
var DeferredPromise = (function () {
    function DeferredPromise() {
        var _this = this;
        this.notifyValues = [];
        this.promise = new es6_promise_1.Promise(function (resolve, reject) {
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

},{"es6-promise":27}],11:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var promise_1 = require('./promise');
var auth_1 = require('../auth/auth');
var request = require('superagent');
var Request = (function () {
    function Request() {
    }
    return Request;
}());
exports.Request = Request;
var Response = (function () {
    function Response() {
    }
    return Response;
}());
exports.Response = Response;
var APIResponse = (function (_super) {
    __extends(APIResponse, _super);
    function APIResponse() {
        _super.call(this);
    }
    return APIResponse;
}(Response));
exports.APIResponse = APIResponse;
var APIRequest = (function (_super) {
    __extends(APIRequest, _super);
    function APIRequest(options) {
        _super.call(this);
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
    return APIRequest;
}(Request));
exports.APIRequest = APIRequest;

},{"../auth/auth":1,"./promise":10,"superagent":30}],12:[function(require,module,exports){
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

},{"./promise":10}],13:[function(require,module,exports){
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
        if (user === void 0) { user = null; }
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
            new request_1.APIRequest({
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
            new request_1.APIRequest({
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
        if (!self.isValid()) {
            return false;
        }
        if (!self._blockDelete) {
            self._blockDelete = true;
            self._delete();
            new request_1.APIRequest({
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
            new request_1.APIRequest({
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
        new request_1.APIRequest({
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

},{"../auth/auth":1,"./core":5,"./data-types":6,"./logger":9,"./promise":10,"./request":11,"./storage":12}],14:[function(require,module,exports){
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

},{"../core/core":5,"../core/events":7,"../core/logger":9,"../core/promise":10}],15:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./deploy'));

},{"./deploy":14}],16:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./auth/index'));
__export(require('./core/index'));
__export(require('./deploy/index'));
__export(require('./insights/index'));
__export(require('./push/index'));
__export(require('./util/index'));

},{"./auth/index":2,"./core/index":8,"./deploy/index":15,"./insights/index":17,"./push/index":19,"./util/index":24}],17:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./insights'));

},{"./insights":18}],18:[function(require,module,exports){
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

},{"../core/logger":9}],19:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./push-dev'));
__export(require('./push-message'));
__export(require('./push-token'));
__export(require('./push'));

},{"./push":23,"./push-dev":20,"./push-message":21,"./push-token":22}],20:[function(require,module,exports){
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
        new request_1.APIRequest(requestOptions).then(function () {
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
        new request_1.APIRequest(requestOptions).then(function (result) {
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

},{"../core/core":5,"../core/logger":9,"../core/request":11,"../util/util":25,"./push-token":22}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
"use strict";
var PushToken = (function () {
    function PushToken(token) {
        this._token = token || null;
    }
    Object.defineProperty(PushToken.prototype, "token", {
        get: function () {
            return this._token;
        },
        set: function (value) {
            this._token = value;
        },
        enumerable: true,
        configurable: true
    });
    PushToken.prototype.toString = function () {
        var token = this._token || 'null';
        return '<PushToken [\'' + token + '\']>';
    };
    return PushToken;
}());
exports.PushToken = PushToken;

},{}],23:[function(require,module,exports){
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
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic Push:'
        });
        var app = new app_1.App(core_1.IonicPlatform.config.get('app_id'));
        app.devPush = core_1.IonicPlatform.config.get('dev_push');
        app.gcmKey = core_1.IonicPlatform.config.get('gcm_key');
        // Check for the required values to use this service
        if (!app.id) {
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
        this._token = null;
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
                tokenData.user_id = user.id; // eslint-disable-line
            }
        }
        if (!self._blockSaveToken) {
            new request_1.APIRequest({
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
            new request_1.APIRequest({
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

},{"../core/app":3,"../core/core":5,"../core/events":7,"../core/logger":9,"../core/promise":10,"../core/request":11,"../core/user":13,"./push-dev":20,"./push-message":21,"./push-token":22}],24:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
__export(require('./util'));

},{"./util":25}],25:[function(require,module,exports){
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

},{}],26:[function(require,module,exports){

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

},{}],27:[function(require,module,exports){
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

},{"_process":28}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){

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
},{}],30:[function(require,module,exports){
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

},{"./is-object":31,"./request":33,"./request-base":32,"emitter":26,"reduce":29}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
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

},{"./is-object":31}],33:[function(require,module,exports){
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

},{}],34:[function(require,module,exports){
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

},{}],35:[function(require,module,exports){
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


},{}],36:[function(require,module,exports){
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

},{}],37:[function(require,module,exports){
var App = require("./../dist/es5/core/app").App;
var Auth = require("./../dist/es5/auth/auth").Auth;
var Config = require("./../dist/es5/core/config").Config;
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
var request = require("./../dist/es5/core/request");

// Declare the window object
window.Ionic = window.Ionic || {};

// Ionic Modules
Ionic.Core = IonicPlatform;
Ionic.User = User;
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
Ionic.IO.Request = request.Request;
Ionic.IO.Response = request.Response;
Ionic.IO.APIRequest = request.APIRequest;
Ionic.IO.APIResponse = request.APIResponse;
Ionic.IO.Storage = Storage;
Ionic.IO.Config = Config;

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

},{"./../dist/es5/auth/auth":1,"./../dist/es5/core/app":3,"./../dist/es5/core/config":4,"./../dist/es5/core/core":5,"./../dist/es5/core/data-types":6,"./../dist/es5/core/events":7,"./../dist/es5/core/logger":9,"./../dist/es5/core/promise":10,"./../dist/es5/core/request":11,"./../dist/es5/core/storage":12,"./../dist/es5/core/user":13,"./../dist/es5/deploy/deploy":14,"./../dist/es5/push/push":23,"./../dist/es5/push/push-message":21,"./../dist/es5/push/push-token":22}],38:[function(require,module,exports){
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

},{}]},{},[37,35,34,38,36,16])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2VzNS9hdXRoL2F1dGguanMiLCJkaXN0L2VzNS9hdXRoL2luZGV4LmpzIiwiZGlzdC9lczUvY29yZS9hcHAuanMiLCJkaXN0L2VzNS9jb3JlL2NvbmZpZy5qcyIsImRpc3QvZXM1L2NvcmUvY29yZS5qcyIsImRpc3QvZXM1L2NvcmUvZGF0YS10eXBlcy5qcyIsImRpc3QvZXM1L2NvcmUvZXZlbnRzLmpzIiwiZGlzdC9lczUvY29yZS9pbmRleC5qcyIsImRpc3QvZXM1L2NvcmUvbG9nZ2VyLmpzIiwiZGlzdC9lczUvY29yZS9wcm9taXNlLmpzIiwiZGlzdC9lczUvY29yZS9yZXF1ZXN0LmpzIiwiZGlzdC9lczUvY29yZS9zdG9yYWdlLmpzIiwiZGlzdC9lczUvY29yZS91c2VyLmpzIiwiZGlzdC9lczUvZGVwbG95L2RlcGxveS5qcyIsImRpc3QvZXM1L2RlcGxveS9pbmRleC5qcyIsImRpc3QvZXM1L2luZGV4LmpzIiwiZGlzdC9lczUvaW5zaWdodHMvaW5kZXguanMiLCJkaXN0L2VzNS9pbnNpZ2h0cy9pbnNpZ2h0cy5qcyIsImRpc3QvZXM1L3B1c2gvaW5kZXguanMiLCJkaXN0L2VzNS9wdXNoL3B1c2gtZGV2LmpzIiwiZGlzdC9lczUvcHVzaC9wdXNoLW1lc3NhZ2UuanMiLCJkaXN0L2VzNS9wdXNoL3B1c2gtdG9rZW4uanMiLCJkaXN0L2VzNS9wdXNoL3B1c2guanMiLCJkaXN0L2VzNS91dGlsL2luZGV4LmpzIiwiZGlzdC9lczUvdXRpbC91dGlsLmpzIiwibm9kZV9tb2R1bGVzL2NvbXBvbmVudC1lbWl0dGVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2VzNi1wcm9taXNlL2Rpc3QvZXM2LXByb21pc2UuanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3JlZHVjZS1jb21wb25lbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvc3VwZXJhZ2VudC9saWIvY2xpZW50LmpzIiwibm9kZV9tb2R1bGVzL3N1cGVyYWdlbnQvbGliL2lzLW9iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9zdXBlcmFnZW50L2xpYi9yZXF1ZXN0LWJhc2UuanMiLCJub2RlX21vZHVsZXMvc3VwZXJhZ2VudC9saWIvcmVxdWVzdC5qcyIsInNyYy9hdXRoL2FuZ3VsYXIuanMiLCJzcmMvY29yZS9hbmd1bGFyLmpzIiwic3JjL2RlcGxveS9hbmd1bGFyLmpzIiwic3JjL2VzNS5qcyIsInNyYy9wdXNoL2FuZ3VsYXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ25LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMvN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmpDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgcmVxdWVzdF8xID0gcmVxdWlyZSgnLi4vY29yZS9yZXF1ZXN0Jyk7XG52YXIgcHJvbWlzZV8xID0gcmVxdWlyZSgnLi4vY29yZS9wcm9taXNlJyk7XG52YXIgY29yZV8xID0gcmVxdWlyZSgnLi4vY29yZS9jb3JlJyk7XG52YXIgc3RvcmFnZV8xID0gcmVxdWlyZSgnLi4vY29yZS9zdG9yYWdlJyk7XG52YXIgdXNlcl8xID0gcmVxdWlyZSgnLi4vY29yZS91c2VyJyk7XG52YXIgc3RvcmFnZSA9IG5ldyBzdG9yYWdlXzEuUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneSgpO1xudmFyIHNlc3Npb25TdG9yYWdlID0gbmV3IHN0b3JhZ2VfMS5Mb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3koKTtcbnZhciBfX2F1dGhNb2R1bGVzID0ge307XG52YXIgX19hdXRoVG9rZW4gPSBudWxsO1xudmFyIGF1dGhBUElCYXNlID0gY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL2F1dGgnO1xudmFyIGF1dGhBUElFbmRwb2ludHMgPSB7XG4gICAgJ2xvZ2luJzogZnVuY3Rpb24gKHByb3ZpZGVyKSB7XG4gICAgICAgIGlmIChwcm92aWRlciA9PT0gdm9pZCAwKSB7IHByb3ZpZGVyID0gbnVsbDsgfVxuICAgICAgICBpZiAocHJvdmlkZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBhdXRoQVBJQmFzZSArICcvbG9naW4vJyArIHByb3ZpZGVyO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhdXRoQVBJQmFzZSArICcvbG9naW4nO1xuICAgIH0sXG4gICAgJ3NpZ251cCc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGF1dGhBUElCYXNlICsgJy91c2Vycyc7XG4gICAgfVxufTtcbnZhciBUZW1wVG9rZW5Db250ZXh0ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBUZW1wVG9rZW5Db250ZXh0KCkge1xuICAgIH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoVGVtcFRva2VuQ29udGV4dCwgXCJsYWJlbFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdpb25pY19pb19hdXRoXycgKyBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgVGVtcFRva2VuQ29udGV4dC5kZWxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnJlbW92ZShUZW1wVG9rZW5Db250ZXh0LmxhYmVsKTtcbiAgICB9O1xuICAgIFRlbXBUb2tlbkNvbnRleHQuc3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnNldChUZW1wVG9rZW5Db250ZXh0LmxhYmVsLCBfX2F1dGhUb2tlbik7XG4gICAgfTtcbiAgICBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzZXNzaW9uU3RvcmFnZS5nZXQoVGVtcFRva2VuQ29udGV4dC5sYWJlbCkgfHwgZmFsc2U7XG4gICAgfTtcbiAgICByZXR1cm4gVGVtcFRva2VuQ29udGV4dDtcbn0oKSk7XG5leHBvcnRzLlRlbXBUb2tlbkNvbnRleHQgPSBUZW1wVG9rZW5Db250ZXh0O1xudmFyIFRva2VuQ29udGV4dCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVG9rZW5Db250ZXh0KCkge1xuICAgIH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoVG9rZW5Db250ZXh0LCBcImxhYmVsXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2lvbmljX2lvX2F1dGhfJyArIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBUb2tlbkNvbnRleHQuZGVsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdG9yYWdlLnJlbW92ZShUb2tlbkNvbnRleHQubGFiZWwpO1xuICAgIH07XG4gICAgVG9rZW5Db250ZXh0LnN0b3JlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzdG9yYWdlLnNldChUb2tlbkNvbnRleHQubGFiZWwsIF9fYXV0aFRva2VuKTtcbiAgICB9O1xuICAgIFRva2VuQ29udGV4dC5nZXRSYXdEYXRhID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5nZXQoVG9rZW5Db250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICB9O1xuICAgIHJldHVybiBUb2tlbkNvbnRleHQ7XG59KCkpO1xuZXhwb3J0cy5Ub2tlbkNvbnRleHQgPSBUb2tlbkNvbnRleHQ7XG5mdW5jdGlvbiBzdG9yZVRva2VuKG9wdGlvbnMsIHRva2VuKSB7XG4gICAgX19hdXRoVG9rZW4gPSB0b2tlbjtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmIG9wdGlvbnMucmVtZW1iZXIpIHtcbiAgICAgICAgVG9rZW5Db250ZXh0LnN0b3JlKCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBUZW1wVG9rZW5Db250ZXh0LnN0b3JlKCk7XG4gICAgfVxufVxudmFyIEluQXBwQnJvd3NlckZsb3cgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEluQXBwQnJvd3NlckZsb3coYXV0aE9wdGlvbnMsIG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgaWYgKCF3aW5kb3cgfHwgIXdpbmRvdy5jb3Jkb3ZhIHx8ICF3aW5kb3cuY29yZG92YS5JbkFwcEJyb3dzZXIpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCgnTWlzc2luZyBJbkFwcEJyb3dzZXIgcGx1Z2luJyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiBhdXRoQVBJRW5kcG9pbnRzLmxvZ2luKG9wdGlvbnMucHJvdmlkZXIpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiBvcHRpb25zLnVyaV9tZXRob2QgfHwgJ1BPU1QnLFxuICAgICAgICAgICAgICAgICdqc29uJzoge1xuICAgICAgICAgICAgICAgICAgICAnYXBwX2lkJzogY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksXG4gICAgICAgICAgICAgICAgICAgICdjYWxsYmFjayc6IG9wdGlvbnMuY2FsbGJhY2tfdXJpIHx8IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IGRhdGFcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxvYyA9IGRhdGEucGF5bG9hZC5kYXRhLnVybDtcbiAgICAgICAgICAgICAgICB2YXIgdGVtcEJyb3dzZXIgPSB3aW5kb3cuY29yZG92YS5JbkFwcEJyb3dzZXIub3Blbihsb2MsICdfYmxhbmsnLCAnbG9jYXRpb249bm8sY2xlYXJjYWNoZT15ZXMsY2xlYXJzZXNzaW9uY2FjaGU9eWVzJyk7XG4gICAgICAgICAgICAgICAgdGVtcEJyb3dzZXIuYWRkRXZlbnRMaXN0ZW5lcignbG9hZHN0YXJ0JywgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEudXJsLnNsaWNlKDAsIDIwKSA9PT0gJ2h0dHA6Ly9hdXRoLmlvbmljLmlvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHF1ZXJ5U3RyaW5nID0gZGF0YS51cmwuc3BsaXQoJyMnKVswXS5zcGxpdCgnPycpWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmFtUGFydHMgPSBxdWVyeVN0cmluZy5zcGxpdCgnJicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmFtcyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJhbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcnQgPSBwYXJhbVBhcnRzW2ldLnNwbGl0KCc9Jyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1zW3BhcnRbMF1dID0gcGFydFsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0b3JlVG9rZW4oYXV0aE9wdGlvbnMsIHBhcmFtcy50b2tlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wQnJvd3Nlci5jbG9zZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGVtcEJyb3dzZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfVxuICAgIHJldHVybiBJbkFwcEJyb3dzZXJGbG93O1xufSgpKTtcbmZ1bmN0aW9uIGdldEF1dGhFcnJvckRldGFpbHMoZXJyKSB7XG4gICAgdmFyIGRldGFpbHMgPSBbXTtcbiAgICB0cnkge1xuICAgICAgICBkZXRhaWxzID0gZXJyLnJlc3BvbnNlLmJvZHkuZXJyb3IuZGV0YWlscztcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgZTtcbiAgICB9XG4gICAgcmV0dXJuIGRldGFpbHM7XG59XG52YXIgQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQXV0aCgpIHtcbiAgICB9XG4gICAgQXV0aC5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB0b2tlbiA9IFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIHZhciB0ZW1wVG9rZW4gPSBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgaWYgKHRlbXBUb2tlbiB8fCB0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgQXV0aC5sb2dpbiA9IGZ1bmN0aW9uIChtb2R1bGVJZCwgb3B0aW9ucywgZGF0YSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgY29udGV4dCA9IF9fYXV0aE1vZHVsZXNbbW9kdWxlSWRdIHx8IGZhbHNlO1xuICAgICAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gY2xhc3MgaXMgaW52YWxpZCBvciBtaXNzaW5nOicgKyBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBjb250ZXh0LmF1dGhlbnRpY2F0ZS5hcHBseShjb250ZXh0LCBbb3B0aW9ucywgZGF0YV0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdXNlcl8xLlVzZXIuc2VsZigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHVzZXIpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBBdXRoLnNpZ251cCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBjb250ZXh0ID0gX19hdXRoTW9kdWxlcy5iYXNpYyB8fCBmYWxzZTtcbiAgICAgICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0F1dGhlbnRpY2F0aW9uIGNsYXNzIGlzIGludmFsaWQgb3IgbWlzc2luZzonICsgY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbnRleHQuc2lnbnVwLmFwcGx5KGNvbnRleHQsIFtkYXRhXSk7XG4gICAgfTtcbiAgICBBdXRoLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgVG9rZW5Db250ZXh0LmRlbGV0ZSgpO1xuICAgICAgICBUZW1wVG9rZW5Db250ZXh0LmRlbGV0ZSgpO1xuICAgIH07XG4gICAgQXV0aC5yZWdpc3RlciA9IGZ1bmN0aW9uIChtb2R1bGVJZCwgbW9kdWxlKSB7XG4gICAgICAgIGlmICghX19hdXRoTW9kdWxlc1ttb2R1bGVJZF0pIHtcbiAgICAgICAgICAgIF9fYXV0aE1vZHVsZXNbbW9kdWxlSWRdID0gbW9kdWxlO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBBdXRoLmdldFVzZXJUb2tlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHVzZXJ0b2tlbiA9IFRva2VuQ29udGV4dC5nZXRSYXdEYXRhKCk7XG4gICAgICAgIHZhciB0ZW1wdG9rZW4gPSBUZW1wVG9rZW5Db250ZXh0LmdldFJhd0RhdGEoKTtcbiAgICAgICAgdmFyIHRva2VuID0gdGVtcHRva2VuIHx8IHVzZXJ0b2tlbjtcbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIEF1dGg7XG59KCkpO1xuZXhwb3J0cy5BdXRoID0gQXV0aDtcbnZhciBCYXNpY0F1dGggPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEJhc2ljQXV0aCgpIHtcbiAgICB9XG4gICAgQmFzaWNBdXRoLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIG5ldyByZXF1ZXN0XzEuQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAndXJpJzogYXV0aEFQSUVuZHBvaW50cy5sb2dpbigpLFxuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICdqc29uJzoge1xuICAgICAgICAgICAgICAgICdhcHBfaWQnOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICAgICAnZW1haWwnOiBkYXRhLmVtYWlsLFxuICAgICAgICAgICAgICAgICdwYXNzd29yZCc6IGRhdGEucGFzc3dvcmRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgc3RvcmVUb2tlbihvcHRpb25zLCBkYXRhLnBheWxvYWQuZGF0YS50b2tlbik7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgQmFzaWNBdXRoLnNpZ251cCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB1c2VyRGF0YSA9IHtcbiAgICAgICAgICAgICdhcHBfaWQnOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSxcbiAgICAgICAgICAgICdlbWFpbCc6IGRhdGEuZW1haWwsXG4gICAgICAgICAgICAncGFzc3dvcmQnOiBkYXRhLnBhc3N3b3JkXG4gICAgICAgIH07XG4gICAgICAgIC8vIG9wdGlvbmFsIGRldGFpbHNcbiAgICAgICAgaWYgKGRhdGEudXNlcm5hbWUpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLnVzZXJuYW1lID0gZGF0YS51c2VybmFtZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5pbWFnZSkge1xuICAgICAgICAgICAgdXNlckRhdGEuaW1hZ2UgPSBkYXRhLmltYWdlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLm5hbWUpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLm5hbWUgPSBkYXRhLm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEuY3VzdG9tKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS5jdXN0b20gPSBkYXRhLmN1c3RvbTtcbiAgICAgICAgfVxuICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgJ3VyaSc6IGF1dGhBUElFbmRwb2ludHMuc2lnbnVwKCksXG4gICAgICAgICAgICAnbWV0aG9kJzogJ1BPU1QnLFxuICAgICAgICAgICAgJ2pzb24nOiB1c2VyRGF0YVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIHZhciBlcnJvcnMgPSBbXTtcbiAgICAgICAgICAgIHZhciBkZXRhaWxzID0gZ2V0QXV0aEVycm9yRGV0YWlscyhlcnIpO1xuICAgICAgICAgICAgaWYgKGRldGFpbHMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGV0YWlscy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGV0YWlsID0gZGV0YWlsc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZXRhaWwgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGV0YWlsLmVycm9yX3R5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChkZXRhaWwuZXJyb3JfdHlwZSArICdfJyArIGRldGFpbC5wYXJhbWV0ZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KHsgJ2Vycm9ycyc6IGVycm9ycyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgcmV0dXJuIEJhc2ljQXV0aDtcbn0oKSk7XG52YXIgQ3VzdG9tQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gQ3VzdG9tQXV0aCgpIHtcbiAgICB9XG4gICAgQ3VzdG9tQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnY3VzdG9tJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBDdXN0b21BdXRoO1xufSgpKTtcbnZhciBUd2l0dGVyQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVHdpdHRlckF1dGgoKSB7XG4gICAgfVxuICAgIFR3aXR0ZXJBdXRoLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICd0d2l0dGVyJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBUd2l0dGVyQXV0aDtcbn0oKSk7XG52YXIgRmFjZWJvb2tBdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBGYWNlYm9va0F1dGgoKSB7XG4gICAgfVxuICAgIEZhY2Vib29rQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZmFjZWJvb2snIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIEZhY2Vib29rQXV0aDtcbn0oKSk7XG52YXIgR2l0aHViQXV0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gR2l0aHViQXV0aCgpIHtcbiAgICB9XG4gICAgR2l0aHViQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnZ2l0aHViJyB9LCBkYXRhKTtcbiAgICB9O1xuICAgIHJldHVybiBHaXRodWJBdXRoO1xufSgpKTtcbnZhciBHb29nbGVBdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBHb29nbGVBdXRoKCkge1xuICAgIH1cbiAgICBHb29nbGVBdXRoLmF1dGhlbnRpY2F0ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBkYXRhKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5BcHBCcm93c2VyRmxvdyhvcHRpb25zLCB7ICdwcm92aWRlcic6ICdnb29nbGUnIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIEdvb2dsZUF1dGg7XG59KCkpO1xudmFyIEluc3RhZ3JhbUF1dGggPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEluc3RhZ3JhbUF1dGgoKSB7XG4gICAgfVxuICAgIEluc3RhZ3JhbUF1dGguYXV0aGVudGljYXRlID0gZnVuY3Rpb24gKG9wdGlvbnMsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBJbkFwcEJyb3dzZXJGbG93KG9wdGlvbnMsIHsgJ3Byb3ZpZGVyJzogJ2luc3RhZ3JhbScgfSwgZGF0YSk7XG4gICAgfTtcbiAgICByZXR1cm4gSW5zdGFncmFtQXV0aDtcbn0oKSk7XG52YXIgTGlua2VkSW5BdXRoID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBMaW5rZWRJbkF1dGgoKSB7XG4gICAgfVxuICAgIExpbmtlZEluQXV0aC5hdXRoZW50aWNhdGUgPSBmdW5jdGlvbiAob3B0aW9ucywgZGF0YSkge1xuICAgICAgICByZXR1cm4gbmV3IEluQXBwQnJvd3NlckZsb3cob3B0aW9ucywgeyAncHJvdmlkZXInOiAnbGlua2VkaW4nIH0sIGRhdGEpO1xuICAgIH07XG4gICAgcmV0dXJuIExpbmtlZEluQXV0aDtcbn0oKSk7XG5BdXRoLnJlZ2lzdGVyKCdiYXNpYycsIEJhc2ljQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdjdXN0b20nLCBDdXN0b21BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2ZhY2Vib29rJywgRmFjZWJvb2tBdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2dpdGh1YicsIEdpdGh1YkF1dGgpO1xuQXV0aC5yZWdpc3RlcignZ29vZ2xlJywgR29vZ2xlQXV0aCk7XG5BdXRoLnJlZ2lzdGVyKCdpbnN0YWdyYW0nLCBJbnN0YWdyYW1BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ2xpbmtlZGluJywgTGlua2VkSW5BdXRoKTtcbkF1dGgucmVnaXN0ZXIoJ3R3aXR0ZXInLCBUd2l0dGVyQXV0aCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2F1dGgnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4vbG9nZ2VyJyk7XG52YXIgQXBwID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBBcHAoYXBwSWQpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgQXBwOidcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICghYXBwSWQgfHwgYXBwSWQgPT09ICcnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdObyBhcHBfaWQgd2FzIHByb3ZpZGVkJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5faWQgPSBhcHBJZDtcbiAgICAgICAgLy8gb3RoZXIgY29uZmlnIHZhbHVlIHJlZmVyZW5jZVxuICAgICAgICB0aGlzLmRldlB1c2ggPSBudWxsO1xuICAgICAgICB0aGlzLmdjbUtleSA9IG51bGw7XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBcHAucHJvdG90eXBlLCBcImlkXCIsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIEFwcC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAnPEFwcCBbXFwnJyArIHRoaXMuaWQgKyAnXFwnPic7XG4gICAgfTtcbiAgICByZXR1cm4gQXBwO1xufSgpKTtcbmV4cG9ydHMuQXBwID0gQXBwO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgSW9uaWNQbGF0Zm9ybUNvbmZpZyA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gSW9uaWNQbGF0Zm9ybUNvbmZpZygpIHtcbiAgICAgICAgdGhpcy5fc2V0dGluZ3MgPSB7fTtcbiAgICAgICAgdGhpcy5fZGV2TG9jYXRpb25zID0ge307XG4gICAgICAgIHRoaXMuX2xvY2F0aW9ucyA9IHtcbiAgICAgICAgICAgICdhcGknOiAnaHR0cHM6Ly9hcHBzLmlvbmljLmlvJyxcbiAgICAgICAgICAgICdwdXNoJzogJ2h0dHBzOi8vcHVzaC5pb25pYy5pbycsXG4gICAgICAgICAgICAnZGVwbG95JzogJ2h0dHBzOi8vYXBwcy5pb25pYy5pbycsXG4gICAgICAgICAgICAncGxhdGZvcm0tYXBpJzogJ2h0dHBzOi8vYXBpLmlvbmljLmlvJ1xuICAgICAgICB9O1xuICAgIH1cbiAgICBJb25pY1BsYXRmb3JtQ29uZmlnLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2V0dGluZ3NbbmFtZV07XG4gICAgfTtcbiAgICBJb25pY1BsYXRmb3JtQ29uZmlnLnByb3RvdHlwZS5nZXRVUkwgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBpZiAodGhpcy5fZGV2TG9jYXRpb25zW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZGV2TG9jYXRpb25zW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX2xvY2F0aW9uc1tuYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xvY2F0aW9uc1tuYW1lXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBJb25pY1BsYXRmb3JtQ29uZmlnLnByb3RvdHlwZS5yZWdpc3RlciA9IGZ1bmN0aW9uIChzZXR0aW5ncykge1xuICAgICAgICBpZiAoc2V0dGluZ3MgPT09IHZvaWQgMCkgeyBzZXR0aW5ncyA9IHt9OyB9XG4gICAgICAgIHRoaXMuX3NldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMuX2RldkxvY2F0aW9ucyA9IHNldHRpbmdzLmRldl9sb2NhdGlvbnMgfHwge307XG4gICAgfTtcbiAgICByZXR1cm4gSW9uaWNQbGF0Zm9ybUNvbmZpZztcbn0oKSk7XG5leHBvcnRzLklvbmljUGxhdGZvcm1Db25maWcgPSBJb25pY1BsYXRmb3JtQ29uZmlnO1xuZXhwb3J0cy5Db25maWcgPSBuZXcgSW9uaWNQbGF0Zm9ybUNvbmZpZygpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgZXZlbnRzXzEgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xudmFyIHN0b3JhZ2VfMSA9IHJlcXVpcmUoJy4vc3RvcmFnZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi9sb2dnZXInKTtcbnZhciBjb25maWdfMSA9IHJlcXVpcmUoJy4vY29uZmlnJyk7XG52YXIgZXZlbnRFbWl0dGVyID0gbmV3IGV2ZW50c18xLkV2ZW50RW1pdHRlcigpO1xudmFyIG1haW5TdG9yYWdlID0gbmV3IHN0b3JhZ2VfMS5TdG9yYWdlKCk7XG52YXIgSW9uaWNQbGF0Zm9ybUNvcmUgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIElvbmljUGxhdGZvcm1Db3JlKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnXzEuQ29uZmlnO1xuICAgICAgICB0aGlzLmxvZ2dlciA9IG5ldyBsb2dnZXJfMS5Mb2dnZXIoe1xuICAgICAgICAgICAgJ3ByZWZpeCc6ICdJb25pYyBDb3JlOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICAgICAgdGhpcy5fcGx1Z2luc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZW1pdHRlciA9IHRoaXMuZ2V0RW1pdHRlcigpO1xuICAgICAgICB0aGlzLl9ib290c3RyYXAoKTtcbiAgICAgICAgaWYgKHNlbGYuY29yZG92YVBsYXRmb3JtVW5rbm93bikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYXR0ZW1wdGluZyB0byBtb2NrIHBsdWdpbnMnKTtcbiAgICAgICAgICAgIHNlbGYuX3BsdWdpbnNSZWFkeSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZXJlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdwbHVnaW5zIGFyZSByZWFkeScpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW5zUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXR0ZXIuZW1pdCgnaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5Jyk7XG4gICAgICAgICAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCd1bmFibGUgdG8gbGlzdGVuIGZvciBjb3Jkb3ZhIHBsdWdpbnMgdG8gYmUgcmVhZHknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUuaW5pdCA9IGZ1bmN0aW9uIChjZmcpIHtcbiAgICAgICAgdGhpcy5jb25maWcucmVnaXN0ZXIoY2ZnKTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUsIFwiVmVyc2lvblwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdWRVJTSU9OX1NUUklORyc7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5nZXRFbWl0dGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZXZlbnRFbWl0dGVyO1xuICAgIH07XG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLmdldFN0b3JhZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBtYWluU3RvcmFnZTtcbiAgICB9O1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5faXNDb3Jkb3ZhQXZhaWxhYmxlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NlYXJjaGluZyBmb3IgY29yZG92YS5qcycpO1xuICAgICAgICBpZiAodHlwZW9mIGNvcmRvdmEgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdjb3Jkb3ZhLmpzIGhhcyBhbHJlYWR5IGJlZW4gbG9hZGVkJyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcbiAgICAgICAgdmFyIGxlbiA9IHNjcmlwdHMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgc2NyaXB0ID0gc2NyaXB0c1tpXS5nZXRBdHRyaWJ1dGUoJ3NyYycpO1xuICAgICAgICAgICAgaWYgKHNjcmlwdCkge1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0cyA9IHNjcmlwdC5zcGxpdCgnLycpO1xuICAgICAgICAgICAgICAgIHZhciBwYXJ0c0xlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHNMZW5ndGggPSBwYXJ0cy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0c1twYXJ0c0xlbmd0aCAtIDFdID09PSAnY29yZG92YS5qcycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2NvcmRvdmEuanMgaGFzIHByZXZpb3VzbHkgYmVlbiBpbmNsdWRlZC4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2VuY291bnRlcmVkIGVycm9yIHdoaWxlIHRlc3RpbmcgZm9yIGNvcmRvdmEuanMgcHJlc2VuY2UsICcgKyBlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUubG9hZENvcmRvdmEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0aGlzLl9pc0NvcmRvdmFBdmFpbGFibGUoKSkge1xuICAgICAgICAgICAgdmFyIGNvcmRvdmFTY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgIHZhciBjb3Jkb3ZhU3JjID0gJ2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgc3dpdGNoICh0aGlzLmdldERldmljZVR5cGVCeU5hdmlnYXRvcigpKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnYW5kcm9pZCc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24uaHJlZi5zdWJzdHJpbmcoMCwgNCkgPT09ICdmaWxlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29yZG92YVNyYyA9ICdmaWxlOi8vL2FuZHJvaWRfYXNzZXQvd3d3L2NvcmRvdmEuanMnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lwYWQnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2lwaG9uZSc6XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVzb3VyY2UgPSB3aW5kb3cubG9jYXRpb24uc2VhcmNoLm1hdGNoKC9jb3Jkb3ZhX2pzX2Jvb3RzdHJhcF9yZXNvdXJjZT0oLio/KSgmfCN8JCkvaSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3Jkb3ZhU3JjID0gZGVjb2RlVVJJKHJlc291cmNlWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnY291bGQgbm90IGZpbmQgY29yZG92YV9qc19ib290c3RyYXBfcmVzb3VyY2UgcXVlcnkgcGFyYW0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAndW5rbm93bic6XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuY29yZG92YVBsYXRmb3JtVW5rbm93biA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvcmRvdmFTY3JpcHQuc2V0QXR0cmlidXRlKCdzcmMnLCBjb3Jkb3ZhU3JjKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoY29yZG92YVNjcmlwdCk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdpbmplY3RpbmcgY29yZG92YS5qcycpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmUgdGhlIGRldmljZSB0eXBlIHZpYSB0aGUgdXNlciBhZ2VudCBzdHJpbmdcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IG5hbWUgb2YgZGV2aWNlIHBsYXRmb3JtIG9yICd1bmtub3duJyBpZiB1bmFibGUgdG8gaWRlbnRpZnkgdGhlIGRldmljZVxuICAgICAqL1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5nZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG4gICAgICAgIHZhciBpcGFkID0gYWdlbnQubWF0Y2goL2lQYWQvaSk7XG4gICAgICAgIGlmIChpcGFkICYmIChpcGFkWzBdLnRvTG93ZXJDYXNlKCkgPT09ICdpcGFkJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBhZCc7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGlwaG9uZSA9IGFnZW50Lm1hdGNoKC9pUGhvbmUvaSk7XG4gICAgICAgIGlmIChpcGhvbmUgJiYgKGlwaG9uZVswXS50b0xvd2VyQ2FzZSgpID09PSAnaXBob25lJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnaXBob25lJztcbiAgICAgICAgfVxuICAgICAgICB2YXIgYW5kcm9pZCA9IGFnZW50Lm1hdGNoKC9BbmRyb2lkL2kpO1xuICAgICAgICBpZiAoYW5kcm9pZCAmJiAoYW5kcm9pZFswXS50b0xvd2VyQ2FzZSgpID09PSAnYW5kcm9pZCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gJ2FuZHJvaWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAndW5rbm93bic7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiB0aGUgZGV2aWNlIGlzIGFuIEFuZHJvaWQgZGV2aWNlXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiBBbmRyb2lkLCBmYWxzZSBvdGhlcndpc2VcbiAgICAgKi9cbiAgICBJb25pY1BsYXRmb3JtQ29yZS5wcm90b3R5cGUuaXNBbmRyb2lkRGV2aWNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGV2aWNlID0gdGhpcy5nZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKTtcbiAgICAgICAgaWYgKGRldmljZSA9PT0gJ2FuZHJvaWQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiB0aGUgZGV2aWNlIGlzIGFuIGlPUyBkZXZpY2VcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIGlPUywgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLmlzSU9TRGV2aWNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGV2aWNlID0gdGhpcy5nZXREZXZpY2VUeXBlQnlOYXZpZ2F0b3IoKTtcbiAgICAgICAgaWYgKGRldmljZSA9PT0gJ2lwaG9uZScgfHwgZGV2aWNlID09PSAnaXBhZCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEJvb3RzdHJhcCBJb25pYyBDb3JlXG4gICAgICpcbiAgICAgKiBIYW5kbGVzIHRoZSBjb3Jkb3ZhLmpzIGJvb3RzdHJhcFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLl9ib290c3RyYXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMubG9hZENvcmRvdmEoKTtcbiAgICB9O1xuICAgIElvbmljUGxhdGZvcm1Db3JlLnByb3RvdHlwZS5kZXZpY2VDb25uZWN0ZWRUb05ldHdvcmsgPSBmdW5jdGlvbiAoc3RyaWN0TW9kZSkge1xuICAgICAgICBpZiAoc3RyaWN0TW9kZSA9PT0gdm9pZCAwKSB7IHN0cmljdE1vZGUgPSBudWxsOyB9XG4gICAgICAgIGlmICh0eXBlb2Ygc3RyaWN0TW9kZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHN0cmljdE1vZGUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5hdmlnYXRvci5jb25uZWN0aW9uID09PSAndW5kZWZpbmVkJyB8fFxuICAgICAgICAgICAgdHlwZW9mIG5hdmlnYXRvci5jb25uZWN0aW9uLnR5cGUgPT09ICd1bmRlZmluZWQnIHx8XG4gICAgICAgICAgICB0eXBlb2YgQ29ubmVjdGlvbiA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGlmICghc3RyaWN0TW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAobmF2aWdhdG9yLmNvbm5lY3Rpb24udHlwZSkge1xuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkVUSEVSTkVUOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLldJRkk6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTF8yRzpcbiAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvbi5DRUxMXzNHOlxuICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uLkNFTExfNEc6XG4gICAgICAgICAgICBjYXNlIENvbm5lY3Rpb24uQ0VMTDpcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBGaXJlIGEgY2FsbGJhY2sgd2hlbiBjb3JlICsgcGx1Z2lucyBhcmUgcmVhZHkuIFRoaXMgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IGlmXG4gICAgICogdGhlIGNvbXBvbmVudHMgaGF2ZSBhbHJlYWR5IGJlY29tZSBhdmFpbGFibGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9mZlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgSW9uaWNQbGF0Zm9ybUNvcmUucHJvdG90eXBlLm9uUmVhZHkgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodGhpcy5fcGx1Z2luc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdHRlci5vbignaW9uaWNfY29yZTpwbHVnaW5zX3JlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBJb25pY1BsYXRmb3JtQ29yZTtcbn0oKSk7XG5leHBvcnRzLklvbmljUGxhdGZvcm1Db3JlID0gSW9uaWNQbGF0Zm9ybUNvcmU7XG5leHBvcnRzLklvbmljUGxhdGZvcm0gPSBuZXcgSW9uaWNQbGF0Zm9ybUNvcmUoKTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGRhdGFUeXBlTWFwcGluZyA9IHt9O1xudmFyIERhdGFUeXBlU2NoZW1hID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBEYXRhVHlwZVNjaGVtYShwcm9wZXJ0aWVzKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IHt9O1xuICAgICAgICB0aGlzLnNldFByb3BlcnRpZXMocHJvcGVydGllcyk7XG4gICAgfVxuICAgIERhdGFUeXBlU2NoZW1hLnByb3RvdHlwZS5zZXRQcm9wZXJ0aWVzID0gZnVuY3Rpb24gKHByb3BlcnRpZXMpIHtcbiAgICAgICAgaWYgKHByb3BlcnRpZXMgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHggaW4gcHJvcGVydGllcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YVt4XSA9IHByb3BlcnRpZXNbeF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIERhdGFUeXBlU2NoZW1hLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5kYXRhO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ19fSW9uaWNfRGF0YVR5cGVTY2hlbWEnOiBkYXRhLm5hbWUsXG4gICAgICAgICAgICAndmFsdWUnOiBkYXRhLnZhbHVlXG4gICAgICAgIH07XG4gICAgfTtcbiAgICBEYXRhVHlwZVNjaGVtYS5wcm90b3R5cGUuaXNWYWxpZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5uYW1lICYmIHRoaXMuZGF0YS52YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgcmV0dXJuIERhdGFUeXBlU2NoZW1hO1xufSgpKTtcbmV4cG9ydHMuRGF0YVR5cGVTY2hlbWEgPSBEYXRhVHlwZVNjaGVtYTtcbnZhciBEYXRhVHlwZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gRGF0YVR5cGUoKSB7XG4gICAgfVxuICAgIERhdGFUeXBlLmdldCA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSkge1xuICAgICAgICBpZiAoZGF0YVR5cGVNYXBwaW5nW25hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IGRhdGFUeXBlTWFwcGluZ1tuYW1lXSh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH07XG4gICAgRGF0YVR5cGUuZ2V0TWFwcGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGRhdGFUeXBlTWFwcGluZztcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShEYXRhVHlwZSwgXCJTY2hlbWFcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBEYXRhVHlwZVNjaGVtYTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgRGF0YVR5cGUucmVnaXN0ZXIgPSBmdW5jdGlvbiAobmFtZSwgY2xzKSB7XG4gICAgICAgIGRhdGFUeXBlTWFwcGluZ1tuYW1lXSA9IGNscztcbiAgICB9O1xuICAgIHJldHVybiBEYXRhVHlwZTtcbn0oKSk7XG5leHBvcnRzLkRhdGFUeXBlID0gRGF0YVR5cGU7XG52YXIgVW5pcXVlQXJyYXkgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFVuaXF1ZUFycmF5KHZhbHVlKSB7XG4gICAgICAgIHRoaXMuZGF0YSA9IFtdO1xuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgZm9yICh2YXIgeCBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMucHVzaCh2YWx1ZVt4XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgVW5pcXVlQXJyYXkucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmRhdGE7XG4gICAgICAgIHZhciBzY2hlbWEgPSBuZXcgRGF0YVR5cGVTY2hlbWEoeyAnbmFtZSc6ICdVbmlxdWVBcnJheScsICd2YWx1ZSc6IGRhdGEgfSk7XG4gICAgICAgIHJldHVybiBzY2hlbWEudG9KU09OKCk7XG4gICAgfTtcbiAgICBVbmlxdWVBcnJheS5mcm9tU3RvcmFnZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gbmV3IFVuaXF1ZUFycmF5KHZhbHVlKTtcbiAgICB9O1xuICAgIFVuaXF1ZUFycmF5LnByb3RvdHlwZS5wdXNoID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuaW5kZXhPZih2YWx1ZSkgPT09IC0xKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFVuaXF1ZUFycmF5LnByb3RvdHlwZS5wdWxsID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuZGF0YS5pbmRleE9mKHZhbHVlKTtcbiAgICAgICAgdGhpcy5kYXRhLnNwbGljZShpbmRleCwgMSk7XG4gICAgfTtcbiAgICByZXR1cm4gVW5pcXVlQXJyYXk7XG59KCkpO1xuZXhwb3J0cy5VbmlxdWVBcnJheSA9IFVuaXF1ZUFycmF5O1xuRGF0YVR5cGUucmVnaXN0ZXIoJ1VuaXF1ZUFycmF5JywgVW5pcXVlQXJyYXkpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgRXZlbnRFbWl0dGVyID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gICAgICAgIHRoaXMuZXZlbnRIYW5kbGVycyA9IHt9O1xuICAgIH1cbiAgICBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKGV2ZW50LCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdID0gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XS5wdXNoKGNhbGxiYWNrKTtcbiAgICB9O1xuICAgIEV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uIChldmVudCwgZGF0YSkge1xuICAgICAgICBpZiAoZGF0YSA9PT0gdm9pZCAwKSB7IGRhdGEgPSBudWxsOyB9XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBfaSA9IDAsIF9hID0gdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XTsgX2kgPCBfYS5sZW5ndGg7IF9pKyspIHtcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IF9hW19pXTtcbiAgICAgICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gRXZlbnRFbWl0dGVyO1xufSgpKTtcbmV4cG9ydHMuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9hcHAnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2NvcmUnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2RhdGEtdHlwZXMnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2V2ZW50cycpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vbG9nZ2VyJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9wcm9taXNlJykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9yZXF1ZXN0JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9jb25maWcnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3N0b3JhZ2UnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3VzZXInKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBMb2dnZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIExvZ2dlcihvcHRzKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gb3B0cyB8fCB7fTtcbiAgICAgICAgdGhpcy5fc2lsZW5jZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9wcmVmaXggPSBudWxsO1xuICAgICAgICB0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgdGhpcy5fYm9vdHN0cmFwKCk7XG4gICAgfVxuICAgIExvZ2dlci5wcm90b3R5cGUuc2lsZW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fc2lsZW5jZSA9IHRydWU7XG4gICAgfTtcbiAgICBMb2dnZXIucHJvdG90eXBlLnZlcmJvc2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX3NpbGVuY2UgPSBmYWxzZTtcbiAgICB9O1xuICAgIExvZ2dlci5wcm90b3R5cGUuX2Jvb3RzdHJhcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX29wdGlvbnMucHJlZml4KSB7XG4gICAgICAgICAgICB0aGlzLl9wcmVmaXggPSB0aGlzLl9vcHRpb25zLnByZWZpeDtcbiAgICAgICAgfVxuICAgIH07XG4gICAgTG9nZ2VyLnByb3RvdHlwZS5pbmZvID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zaWxlbmNlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcHJlZml4KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5fcHJlZml4LCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBMb2dnZXIucHJvdG90eXBlLndhcm4gPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAoIXRoaXMuX3NpbGVuY2UpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wcmVmaXgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyh0aGlzLl9wcmVmaXgsIGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIExvZ2dlci5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAodGhpcy5fcHJlZml4KSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKHRoaXMuX3ByZWZpeCwgZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGRhdGEpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gTG9nZ2VyO1xufSgpKTtcbmV4cG9ydHMuTG9nZ2VyID0gTG9nZ2VyO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgZXM2X3Byb21pc2VfMSA9IHJlcXVpcmUoJ2VzNi1wcm9taXNlJyk7XG52YXIgRGVmZXJyZWRQcm9taXNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBEZWZlcnJlZFByb21pc2UoKSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgICAgIHRoaXMubm90aWZ5VmFsdWVzID0gW107XG4gICAgICAgIHRoaXMucHJvbWlzZSA9IG5ldyBlczZfcHJvbWlzZV8xLlByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgX3RoaXMucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgICAgICBfdGhpcy5yZWplY3QgPSByZWplY3Q7XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgb3JpZ2luYWxUaGVuID0gdGhpcy5wcm9taXNlLnRoZW47XG4gICAgICAgIHRoaXMucHJvbWlzZS50aGVuID0gZnVuY3Rpb24gKG9rLCBmYWlsLCBub3RpZnkpIHtcbiAgICAgICAgICAgIF90aGlzLl9ub3RpZnkgPSBub3RpZnk7XG4gICAgICAgICAgICBmb3IgKHZhciBfaSA9IDAsIF9hID0gX3RoaXMubm90aWZ5VmFsdWVzOyBfaSA8IF9hLmxlbmd0aDsgX2krKykge1xuICAgICAgICAgICAgICAgIHZhciB2ID0gX2FbX2ldO1xuICAgICAgICAgICAgICAgIF90aGlzLl9ub3RpZnkodik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxUaGVuLmNhbGwoX3RoaXMucHJvbWlzZSwgb2ssIGZhaWwpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBEZWZlcnJlZFByb21pc2UucHJvdG90eXBlLm5vdGlmeSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuX25vdGlmeSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhpcy5ub3RpZnlWYWx1ZXMucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9ub3RpZnkodmFsdWUpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gRGVmZXJyZWRQcm9taXNlO1xufSgpKTtcbmV4cG9ydHMuRGVmZXJyZWRQcm9taXNlID0gRGVmZXJyZWRQcm9taXNlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgX19leHRlbmRzID0gKHRoaXMgJiYgdGhpcy5fX2V4dGVuZHMpIHx8IGZ1bmN0aW9uIChkLCBiKSB7XG4gICAgZm9yICh2YXIgcCBpbiBiKSBpZiAoYi5oYXNPd25Qcm9wZXJ0eShwKSkgZFtwXSA9IGJbcF07XG4gICAgZnVuY3Rpb24gX18oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBkOyB9XG4gICAgZC5wcm90b3R5cGUgPSBiID09PSBudWxsID8gT2JqZWN0LmNyZWF0ZShiKSA6IChfXy5wcm90b3R5cGUgPSBiLnByb3RvdHlwZSwgbmV3IF9fKCkpO1xufTtcbnZhciBwcm9taXNlXzEgPSByZXF1aXJlKCcuL3Byb21pc2UnKTtcbnZhciBhdXRoXzEgPSByZXF1aXJlKCcuLi9hdXRoL2F1dGgnKTtcbnZhciByZXF1ZXN0ID0gcmVxdWlyZSgnc3VwZXJhZ2VudCcpO1xudmFyIFJlcXVlc3QgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFJlcXVlc3QoKSB7XG4gICAgfVxuICAgIHJldHVybiBSZXF1ZXN0O1xufSgpKTtcbmV4cG9ydHMuUmVxdWVzdCA9IFJlcXVlc3Q7XG52YXIgUmVzcG9uc2UgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFJlc3BvbnNlKCkge1xuICAgIH1cbiAgICByZXR1cm4gUmVzcG9uc2U7XG59KCkpO1xuZXhwb3J0cy5SZXNwb25zZSA9IFJlc3BvbnNlO1xudmFyIEFQSVJlc3BvbnNlID0gKGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAgICBfX2V4dGVuZHMoQVBJUmVzcG9uc2UsIF9zdXBlcik7XG4gICAgZnVuY3Rpb24gQVBJUmVzcG9uc2UoKSB7XG4gICAgICAgIF9zdXBlci5jYWxsKHRoaXMpO1xuICAgIH1cbiAgICByZXR1cm4gQVBJUmVzcG9uc2U7XG59KFJlc3BvbnNlKSk7XG5leHBvcnRzLkFQSVJlc3BvbnNlID0gQVBJUmVzcG9uc2U7XG52YXIgQVBJUmVxdWVzdCA9IChmdW5jdGlvbiAoX3N1cGVyKSB7XG4gICAgX19leHRlbmRzKEFQSVJlcXVlc3QsIF9zdXBlcik7XG4gICAgZnVuY3Rpb24gQVBJUmVxdWVzdChvcHRpb25zKSB7XG4gICAgICAgIF9zdXBlci5jYWxsKHRoaXMpO1xuICAgICAgICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XG4gICAgICAgIGlmICghb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24pIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IGF1dGhfMS5BdXRoLmdldFVzZXJUb2tlbigpO1xuICAgICAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyB0b2tlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVxdWVzdEluZm8gPSB7fTtcbiAgICAgICAgdmFyIHAgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgcmVxdWVzdF9tZXRob2QgPSAob3B0aW9ucy5tZXRob2QgfHwgJ2dldCcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHZhciByZXEgPSByZXF1ZXN0W3JlcXVlc3RfbWV0aG9kXShvcHRpb25zLnVyaSB8fCBvcHRpb25zLnVybCk7XG4gICAgICAgIGlmIChvcHRpb25zLmpzb24pIHtcbiAgICAgICAgICAgIHJlcSA9IHJlcS5zZW5kKG9wdGlvbnMuanNvbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdGlvbnMuaGVhZGVycykge1xuICAgICAgICAgICAgcmVxID0gcmVxLnNldChvcHRpb25zLmhlYWRlcnMpO1xuICAgICAgICB9XG4gICAgICAgIHJlcSA9IHJlcS5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICByZXF1ZXN0SW5mby5fbGFzdEVycm9yID0gZXJyO1xuICAgICAgICAgICAgcmVxdWVzdEluZm8uX2xhc3RSZXN1bHQgPSByZXM7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChyZXMuc3RhdHVzIDwgMjAwIHx8IHJlcy5zdGF0dXMgPj0gNDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfZXJyID0gbmV3IEVycm9yKCdSZXF1ZXN0IEZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlIG9mICcgKyByZXMuc3RhdHVzKTtcbiAgICAgICAgICAgICAgICAgICAgcC5yZWplY3QoeyAncmVzcG9uc2UnOiByZXMsICdlcnJvcic6IF9lcnIgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwLnJlc29sdmUoeyAncmVzcG9uc2UnOiByZXMsICdwYXlsb2FkJzogcmVzLmJvZHkgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcC5yZXF1ZXN0SW5mbyA9IHJlcXVlc3RJbmZvO1xuICAgICAgICByZXR1cm4gcC5wcm9taXNlO1xuICAgIH1cbiAgICByZXR1cm4gQVBJUmVxdWVzdDtcbn0oUmVxdWVzdCkpO1xuZXhwb3J0cy5BUElSZXF1ZXN0ID0gQVBJUmVxdWVzdDtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4vcHJvbWlzZScpO1xudmFyIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3kgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3koKSB7XG4gICAgfVxuICAgIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3kucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH07XG4gICAgUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneS5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XG4gICAgfTtcbiAgICBQbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgdmFsdWUpO1xuICAgIH07XG4gICAgcmV0dXJuIFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3k7XG59KCkpO1xuZXhwb3J0cy5QbGF0Zm9ybUxvY2FsU3RvcmFnZVN0cmF0ZWd5ID0gUGxhdGZvcm1Mb2NhbFN0b3JhZ2VTdHJhdGVneTtcbnZhciBMb2NhbFNlc3Npb25TdG9yYWdlU3RyYXRlZ3kgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIExvY2FsU2Vzc2lvblN0b3JhZ2VTdHJhdGVneSgpIHtcbiAgICB9XG4gICAgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXkpO1xuICAgIH07XG4gICAgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuICAgIH07XG4gICAgTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gd2luZG93LnNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG4gICAgfTtcbiAgICByZXR1cm4gTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5O1xufSgpKTtcbmV4cG9ydHMuTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5ID0gTG9jYWxTZXNzaW9uU3RvcmFnZVN0cmF0ZWd5O1xudmFyIG9iamVjdENhY2hlID0ge307XG52YXIgbWVtb3J5TG9ja3MgPSB7fTtcbnZhciBTdG9yYWdlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBTdG9yYWdlKCkge1xuICAgICAgICB0aGlzLnN0cmF0ZWd5ID0gbmV3IFBsYXRmb3JtTG9jYWxTdG9yYWdlU3RyYXRlZ3koKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogU3RvcmVzIGFuIG9iamVjdCBpbiBsb2NhbCBzdG9yYWdlIHVuZGVyIHRoZSBnaXZlbiBrZXlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2V5IE5hbWUgb2YgdGhlIGtleSB0byBzdG9yZSB2YWx1ZXMgaW5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gc3RvcmUgd2l0aCB0aGUga2V5XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBTdG9yYWdlLnByb3RvdHlwZS5zdG9yZU9iamVjdCA9IGZ1bmN0aW9uIChrZXksIG9iamVjdCkge1xuICAgICAgICAvLyBDb252ZXJ0IG9iamVjdCB0byBKU09OIGFuZCBzdG9yZSBpbiBsb2NhbFN0b3JhZ2VcbiAgICAgICAgdmFyIGpzb24gPSBKU09OLnN0cmluZ2lmeShvYmplY3QpO1xuICAgICAgICB0aGlzLnN0cmF0ZWd5LnNldChrZXksIGpzb24pO1xuICAgICAgICAvLyBUaGVuIHN0b3JlIGl0IGluIHRoZSBvYmplY3QgY2FjaGVcbiAgICAgICAgb2JqZWN0Q2FjaGVba2V5XSA9IG9iamVjdDtcbiAgICB9O1xuICAgIFN0b3JhZ2UucHJvdG90eXBlLmRlbGV0ZU9iamVjdCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgdGhpcy5zdHJhdGVneS5yZW1vdmUoa2V5KTtcbiAgICAgICAgZGVsZXRlIG9iamVjdENhY2hlW2tleV07XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBFaXRoZXIgcmV0cmlldmVzIHRoZSBjYWNoZWQgY29weSBvZiBhbiBvYmplY3QsXG4gICAgICogb3IgdGhlIG9iamVjdCBpdHNlbGYgZnJvbSBsb2NhbFN0b3JhZ2UuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUgbmFtZSBvZiB0aGUga2V5IHRvIHB1bGwgZnJvbVxuICAgICAqIEByZXR1cm4ge21peGVkfSBSZXR1cm5zIHRoZSBwcmV2aW91c2x5IHN0b3JlZCBPYmplY3Qgb3IgbnVsbFxuICAgICAqL1xuICAgIFN0b3JhZ2UucHJvdG90eXBlLnJldHJpZXZlT2JqZWN0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAvLyBGaXJzdCBjaGVjayB0byBzZWUgaWYgaXQncyB0aGUgb2JqZWN0IGNhY2hlXG4gICAgICAgIHZhciBjYWNoZWQgPSBvYmplY3RDYWNoZVtrZXldO1xuICAgICAgICBpZiAoY2FjaGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkO1xuICAgICAgICB9XG4gICAgICAgIC8vIERlc2VyaWFsaXplIHRoZSBvYmplY3QgZnJvbSBKU09OXG4gICAgICAgIHZhciBqc29uID0gdGhpcy5zdHJhdGVneS5nZXQoa2V5KTtcbiAgICAgICAgLy8gbnVsbCBvciB1bmRlZmluZWQgLS0+IHJldHVybiBudWxsLlxuICAgICAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKGpzb24pO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBMb2NrcyB0aGUgYXN5bmMgY2FsbCByZXByZXNlbnRlZCBieSB0aGUgZ2l2ZW4gcHJvbWlzZSBhbmQgbG9jayBrZXkuXG4gICAgICogT25seSBvbmUgYXN5bmNGdW5jdGlvbiBnaXZlbiBieSB0aGUgbG9ja0tleSBjYW4gYmUgcnVubmluZyBhdCBhbnkgdGltZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsb2NrS2V5IHNob3VsZCBiZSBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIG5hbWUgb2YgdGhpcyBhc3luYyBjYWxsLlxuICAgICAqICAgICAgICBUaGlzIGlzIHJlcXVpcmVkIGZvciBwZXJzaXN0ZW5jZS5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBhc3luY0Z1bmN0aW9uIFJldHVybnMgYSBwcm9taXNlIG9mIHRoZSBhc3luYyBjYWxsLlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfSBBIG5ldyBwcm9taXNlLCBpZGVudGljYWwgdG8gdGhlIG9uZSByZXR1cm5lZCBieSBhc3luY0Z1bmN0aW9uLFxuICAgICAqICAgICAgICAgIGJ1dCB3aXRoIHR3byBuZXcgZXJyb3JzOiAnaW5fcHJvZ3Jlc3MnLCBhbmQgJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcuXG4gICAgICovXG4gICAgU3RvcmFnZS5wcm90b3R5cGUubG9ja2VkQXN5bmNDYWxsID0gZnVuY3Rpb24gKGxvY2tLZXksIGFzeW5jRnVuY3Rpb24pIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICAvLyBJZiB0aGUgbWVtb3J5IGxvY2sgaXMgc2V0LCBlcnJvciBvdXQuXG4gICAgICAgIGlmIChtZW1vcnlMb2Nrc1tsb2NrS2V5XSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdpbl9wcm9ncmVzcycpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzdG9yZWQgbG9jayBidXQgbm8gbWVtb3J5IGxvY2ssIGZsYWcgYSBwZXJzaXN0ZW5jZSBlcnJvclxuICAgICAgICBpZiAodGhpcy5zdHJhdGVneS5nZXQobG9ja0tleSkgPT09ICdsb2NrZWQnKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2xhc3RfY2FsbF9pbnRlcnJ1cHRlZCcpO1xuICAgICAgICAgICAgZGVmZXJyZWQucHJvbWlzZS50aGVuKG51bGwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU2V0IHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgIG1lbW9yeUxvY2tzW2xvY2tLZXldID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5zdHJhdGVneS5zZXQobG9ja0tleSwgJ2xvY2tlZCcpO1xuICAgICAgICAvLyBQZXJmb3JtIHRoZSBhc3luYyBvcGVyYXRpb25cbiAgICAgICAgYXN5bmNGdW5jdGlvbigpLnRoZW4oZnVuY3Rpb24gKHN1Y2Nlc3NEYXRhKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHN1Y2Nlc3NEYXRhKTtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdG9yZWQgYW5kIG1lbW9yeSBsb2Nrc1xuICAgICAgICAgICAgZGVsZXRlIG1lbW9yeUxvY2tzW2xvY2tLZXldO1xuICAgICAgICAgICAgc2VsZi5zdHJhdGVneS5yZW1vdmUobG9ja0tleSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvckRhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvckRhdGEpO1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHN0b3JlZCBhbmQgbWVtb3J5IGxvY2tzXG4gICAgICAgICAgICBkZWxldGUgbWVtb3J5TG9ja3NbbG9ja0tleV07XG4gICAgICAgICAgICBzZWxmLnN0cmF0ZWd5LnJlbW92ZShsb2NrS2V5KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5vdGlmeURhdGEpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShub3RpZnlEYXRhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgcmV0dXJuIFN0b3JhZ2U7XG59KCkpO1xuZXhwb3J0cy5TdG9yYWdlID0gU3RvcmFnZTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGF1dGhfMSA9IHJlcXVpcmUoJy4uL2F1dGgvYXV0aCcpO1xudmFyIHJlcXVlc3RfMSA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4vcHJvbWlzZScpO1xudmFyIGNvcmVfMSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIHN0b3JhZ2VfMSA9IHJlcXVpcmUoJy4vc3RvcmFnZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi9sb2dnZXInKTtcbnZhciBkYXRhX3R5cGVzXzEgPSByZXF1aXJlKCcuL2RhdGEtdHlwZXMnKTtcbnZhciBBcHBVc2VyQ29udGV4dCA9IG51bGw7XG52YXIgc3RvcmFnZSA9IG5ldyBzdG9yYWdlXzEuU3RvcmFnZSgpO1xudmFyIHVzZXJBUElCYXNlID0gY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldFVSTCgncGxhdGZvcm0tYXBpJykgKyAnL2F1dGgvdXNlcnMnO1xudmFyIHVzZXJBUElFbmRwb2ludHMgPSB7XG4gICAgJ3NlbGYnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvc2VsZic7XG4gICAgfSxcbiAgICAnZ2V0JzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAncmVtb3ZlJzogZnVuY3Rpb24gKHVzZXJNb2RlbCkge1xuICAgICAgICByZXR1cm4gdXNlckFQSUJhc2UgKyAnLycgKyB1c2VyTW9kZWwuaWQ7XG4gICAgfSxcbiAgICAnc2F2ZSc6IGZ1bmN0aW9uICh1c2VyTW9kZWwpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJBUElCYXNlICsgJy8nICsgdXNlck1vZGVsLmlkO1xuICAgIH0sXG4gICAgJ3Bhc3N3b3JkUmVzZXQnOiBmdW5jdGlvbiAodXNlck1vZGVsKSB7XG4gICAgICAgIHJldHVybiB1c2VyQVBJQmFzZSArICcvJyArIHVzZXJNb2RlbC5pZCArICcvcGFzc3dvcmQtcmVzZXQnO1xuICAgIH1cbn07XG52YXIgVXNlckNvbnRleHQgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFVzZXJDb250ZXh0KCkge1xuICAgIH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoVXNlckNvbnRleHQsIFwibGFiZWxcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnaW9uaWNfaW9fdXNlcl8nICsgY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyk7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFVzZXJDb250ZXh0LmRlbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc3RvcmFnZS5kZWxldGVPYmplY3QoVXNlckNvbnRleHQubGFiZWwpO1xuICAgIH07XG4gICAgVXNlckNvbnRleHQuc3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChVc2VyQ29udGV4dC5nZXRSYXdEYXRhKCkpIHtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlTGVnYWN5RGF0YShVc2VyQ29udGV4dC5nZXRSYXdEYXRhKCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChVc2VyLmN1cnJlbnQoKS5kYXRhLmRhdGEuX19pb25pY191c2VyX21pZ3JhdGVkKSB7XG4gICAgICAgICAgICBzdG9yYWdlLnN0b3JlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsICsgJ19sZWdhY3knLCB7ICdfX2lvbmljX3VzZXJfbWlncmF0ZWQnOiB0cnVlIH0pO1xuICAgICAgICB9XG4gICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwsIFVzZXIuY3VycmVudCgpKTtcbiAgICB9O1xuICAgIFVzZXJDb250ZXh0LnN0b3JlTGVnYWN5RGF0YSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIGlmICghVXNlckNvbnRleHQuZ2V0UmF3TGVnYWN5RGF0YSgpKSB7XG4gICAgICAgICAgICBzdG9yYWdlLnN0b3JlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsICsgJ19sZWdhY3knLCBkYXRhKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlckNvbnRleHQuZ2V0UmF3RGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHN0b3JhZ2UucmV0cmlldmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwpIHx8IGZhbHNlO1xuICAgIH07XG4gICAgVXNlckNvbnRleHQuZ2V0UmF3TGVnYWN5RGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHN0b3JhZ2UucmV0cmlldmVPYmplY3QoVXNlckNvbnRleHQubGFiZWwgKyAnX2xlZ2FjeScpIHx8IGZhbHNlO1xuICAgIH07XG4gICAgVXNlckNvbnRleHQubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRhdGEgPSBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KFVzZXJDb250ZXh0LmxhYmVsKSB8fCBmYWxzZTtcbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlTGVnYWN5RGF0YShkYXRhKTtcbiAgICAgICAgICAgIHJldHVybiBVc2VyLmZyb21Db250ZXh0KGRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9O1xuICAgIHJldHVybiBVc2VyQ29udGV4dDtcbn0oKSk7XG52YXIgVXNlckRhdGEgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFVzZXJEYXRhKGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEgPT09IHZvaWQgMCkgeyBkYXRhID0ge307IH1cbiAgICAgICAgdGhpcy5kYXRhID0ge307XG4gICAgICAgIGlmICgodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSkge1xuICAgICAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICAgICAgICAgIHRoaXMuZGVzZXJpYWxpemVyRGF0YVR5cGVzKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgVXNlckRhdGEucHJvdG90eXBlLmRlc2VyaWFsaXplckRhdGFUeXBlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZm9yICh2YXIgeCBpbiB0aGlzLmRhdGEpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgYW4gb2JqZWN0LCBsZXQncyBjaGVjayBmb3IgY3VzdG9tIGRhdGEgdHlwZXNcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhW3hdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIC8vIGRvIHdlIGhhdmUgYSBjdXN0b20gdHlwZT9cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhW3hdLl9fSW9uaWNfRGF0YVR5cGVTY2hlbWEpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5hbWUgPSB0aGlzLmRhdGFbeF0uX19Jb25pY19EYXRhVHlwZVNjaGVtYTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1hcHBpbmcgPSBkYXRhX3R5cGVzXzEuRGF0YVR5cGUuZ2V0TWFwcGluZygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWFwcGluZ1tuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgaGF2ZSBhIGN1c3RvbSB0eXBlIGFuZCBhIHJlZ2lzdGVyZWQgY2xhc3MsIGdpdmUgdGhlIGN1c3RvbSBkYXRhIHR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZyb20gc3RvcmFnZVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kYXRhW3hdID0gbWFwcGluZ1tuYW1lXS5mcm9tU3RvcmFnZSh0aGlzLmRhdGFbeF0udmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyRGF0YS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgdGhpcy5kYXRhW2tleV0gPSB2YWx1ZTtcbiAgICB9O1xuICAgIFVzZXJEYXRhLnByb3RvdHlwZS51bnNldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YVtrZXldO1xuICAgIH07XG4gICAgVXNlckRhdGEucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXksIGRlZmF1bHRWYWx1ZSkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRhdGFba2V5XTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmIChkZWZhdWx0VmFsdWUgPT09IDAgfHwgZGVmYXVsdFZhbHVlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlIHx8IG51bGw7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBVc2VyRGF0YTtcbn0oKSk7XG5leHBvcnRzLlVzZXJEYXRhID0gVXNlckRhdGE7XG52YXIgVXNlciA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gVXNlcigpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgVXNlcjonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tTYXZlID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2RpcnR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2ZyZXNoID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fdW5zZXQgPSB7fTtcbiAgICAgICAgdGhpcy5kYXRhID0gbmV3IFVzZXJEYXRhKCk7XG4gICAgfVxuICAgIFVzZXIucHJvdG90eXBlLmlzRGlydHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kaXJ0eTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmlzQW5vbnltb3VzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMuaWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzID09PSBVc2VyLmN1cnJlbnQoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGF1dGhfMS5BdXRoLmlzQXV0aGVudGljYXRlZCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIFVzZXIuY3VycmVudCA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIGlmICh1c2VyID09PSB2b2lkIDApIHsgdXNlciA9IG51bGw7IH1cbiAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgIEFwcFVzZXJDb250ZXh0ID0gdXNlcjtcbiAgICAgICAgICAgIFVzZXJDb250ZXh0LnN0b3JlKCk7XG4gICAgICAgICAgICByZXR1cm4gQXBwVXNlckNvbnRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoIUFwcFVzZXJDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSBVc2VyQ29udGV4dC5sb2FkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIUFwcFVzZXJDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgQXBwVXNlckNvbnRleHQgPSBuZXcgVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIEFwcFVzZXJDb250ZXh0O1xuICAgICAgICB9XG4gICAgfTtcbiAgICBVc2VyLmZyb21Db250ZXh0ID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBuZXcgVXNlcigpO1xuICAgICAgICB1c2VyLmlkID0gZGF0YS5faWQ7XG4gICAgICAgIHVzZXIuZGF0YSA9IG5ldyBVc2VyRGF0YShkYXRhLmRhdGEuZGF0YSk7XG4gICAgICAgIHVzZXIuZGV0YWlscyA9IGRhdGEuZGV0YWlscyB8fCB7fTtcbiAgICAgICAgdXNlci5fZnJlc2ggPSBkYXRhLl9mcmVzaDtcbiAgICAgICAgdXNlci5fZGlydHkgPSBkYXRhLl9kaXJ0eTtcbiAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgfTtcbiAgICBVc2VyLnNlbGYgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciB0ZW1wVXNlciA9IG5ldyBVc2VyKCk7XG4gICAgICAgIGlmICghdGVtcFVzZXIuX2Jsb2NrTG9hZCkge1xuICAgICAgICAgICAgdGVtcFVzZXIuX2Jsb2NrTG9hZCA9IHRydWU7XG4gICAgICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnNlbGYoKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ0dFVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2xvYWRlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZSBjdXN0b20gZGF0YVxuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmlkID0gcmVzdWx0LnBheWxvYWQuZGF0YS51dWlkO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRhdGEgPSBuZXcgVXNlckRhdGEocmVzdWx0LnBheWxvYWQuZGF0YS5jdXN0b20pO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRldGFpbHMgPSByZXN1bHQucGF5bG9hZC5kYXRhLmRldGFpbHM7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgVXNlci5jdXJyZW50KHRlbXBVc2VyKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRlbXBVc2VyKTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLl9ibG9ja0xvYWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRlbXBVc2VyLmxvZ2dlci5pbmZvKCdhIGxvYWQgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yICcgKyB0aGlzICsgJy4nKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBVc2VyLmxvYWQgPSBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHRlbXBVc2VyID0gbmV3IFVzZXIoKTtcbiAgICAgICAgdGVtcFVzZXIuaWQgPSBpZDtcbiAgICAgICAgaWYgKCF0ZW1wVXNlci5fYmxvY2tMb2FkKSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gdHJ1ZTtcbiAgICAgICAgICAgIG5ldyByZXF1ZXN0XzEuQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMuZ2V0KHRlbXBVc2VyKSxcbiAgICAgICAgICAgICAgICAnbWV0aG9kJzogJ0dFVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmluZm8oJ2xvYWRlZCB1c2VyJyk7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZSBjdXN0b20gZGF0YVxuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRhdGEgPSBuZXcgVXNlckRhdGEocmVzdWx0LnBheWxvYWQuZGF0YS5jdXN0b20pO1xuICAgICAgICAgICAgICAgIHRlbXBVc2VyLmRldGFpbHMgPSByZXN1bHQucGF5bG9hZC5kYXRhLmRldGFpbHM7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0ZW1wVXNlcik7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0ZW1wVXNlci5fYmxvY2tMb2FkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGVtcFVzZXIubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0ZW1wVXNlci5sb2dnZXIuaW5mbygnYSBsb2FkIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciAnICsgdGhpcyArICcuJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuaXNGcmVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZyZXNoO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuaXNWYWxpZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuaWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmdldEFQSUZvcm1hdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFwaUZvcm1hdCA9IHt9O1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kZXRhaWxzKSB7XG4gICAgICAgICAgICBhcGlGb3JtYXRba2V5XSA9IHRoaXMuZGV0YWlsc1trZXldO1xuICAgICAgICB9XG4gICAgICAgIGFwaUZvcm1hdC5jdXN0b20gPSB0aGlzLmRhdGEuZGF0YTtcbiAgICAgICAgcmV0dXJuIGFwaUZvcm1hdDtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLmdldEZvcm1hdCA9IGZ1bmN0aW9uIChmb3JtYXQpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZm9ybWF0dGVkID0gbnVsbDtcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgICAgIGNhc2UgJ2FwaS1zYXZlJzpcbiAgICAgICAgICAgICAgICBmb3JtYXR0ZWQgPSBzZWxmLmdldEFQSUZvcm1hdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb3JtYXR0ZWQ7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5taWdyYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcmF3RGF0YSA9IFVzZXJDb250ZXh0LmdldFJhd0xlZ2FjeURhdGEoKTtcbiAgICAgICAgaWYgKHJhd0RhdGEuX19pb25pY191c2VyX21pZ3JhdGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmF3RGF0YSkge1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRVc2VyID0gSW9uaWMuVXNlci5jdXJyZW50KCk7XG4gICAgICAgICAgICB2YXIgdXNlckRhdGEgPSBuZXcgVXNlckRhdGEocmF3RGF0YS5kYXRhLmRhdGEpO1xuICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIHVzZXJEYXRhLmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50VXNlci5zZXQoa2V5LCB1c2VyRGF0YS5kYXRhW2tleV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3VycmVudFVzZXIuc2V0KCdfX2lvbmljX3VzZXJfbWlncmF0ZWQnLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuZGVsZXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIGlmICghc2VsZi5pc1ZhbGlkKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrRGVsZXRlKSB7XG4gICAgICAgICAgICBzZWxmLl9ibG9ja0RlbGV0ZSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLl9kZWxldGUoKTtcbiAgICAgICAgICAgIG5ldyByZXF1ZXN0XzEuQVBJUmVxdWVzdCh7XG4gICAgICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMucmVtb3ZlKHRoaXMpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnREVMRVRFJyxcbiAgICAgICAgICAgICAgICAnanNvbic6IHRydWVcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrRGVsZXRlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZGVsZXRlZCAnICsgc2VsZik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tEZWxldGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYSBkZWxldGUgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MgZm9yICcgKyB0aGlzICsgJy4nKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICBVc2VyLnByb3RvdHlwZS5fc3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzID09PSBVc2VyLmN1cnJlbnQoKSkge1xuICAgICAgICAgICAgVXNlckNvbnRleHQuc3RvcmUoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuX2RlbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMgPT09IFVzZXIuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBVc2VyQ29udGV4dC5kZWxldGUoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuc2F2ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrU2F2ZSkge1xuICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlbGYuX3N0b3JlKCk7XG4gICAgICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiB1c2VyQVBJRW5kcG9pbnRzLnNhdmUodGhpcyksXG4gICAgICAgICAgICAgICAgJ21ldGhvZCc6ICdQQVRDSCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiBzZWxmLmdldEZvcm1hdCgnYXBpLXNhdmUnKVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fZGlydHkgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGYuaXNGcmVzaCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX3Vuc2V0ID0ge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGYuX2ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tTYXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc2F2ZWQgdXNlcicpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHNlbGYuX2RpcnR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYSBzYXZlIG9wZXJhdGlvbiBpcyBhbHJlYWR5IGluIHByb2dyZXNzIGZvciAnICsgdGhpcyArICcuJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUucmVzZXRQYXNzd29yZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgJ3VyaSc6IHVzZXJBUElFbmRwb2ludHMucGFzc3dvcmRSZXNldCh0aGlzKSxcbiAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCdcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdwYXNzd29yZCByZXNldCBmb3IgdXNlcicpO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShVc2VyLnByb3RvdHlwZSwgXCJpZFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2lkIHx8IG51bGw7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuX2lkID0gdjtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgVXNlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAnPElvbmljVXNlciBbXFwnJyArIHRoaXMuaWQgKyAnXFwnXT4nO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuX3Vuc2V0W2tleV07XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEuc2V0KGtleSwgdmFsdWUpO1xuICAgIH07XG4gICAgVXNlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGEuZ2V0KGtleSwgZGVmYXVsdFZhbHVlKTtcbiAgICB9O1xuICAgIFVzZXIucHJvdG90eXBlLnVuc2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICB0aGlzLl91bnNldFtrZXldID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS51bnNldChrZXkpO1xuICAgIH07XG4gICAgcmV0dXJuIFVzZXI7XG59KCkpO1xuZXhwb3J0cy5Vc2VyID0gVXNlcjtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIGxvZ2dlcl8xID0gcmVxdWlyZSgnLi4vY29yZS9sb2dnZXInKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBldmVudHNfMSA9IHJlcXVpcmUoJy4uL2NvcmUvZXZlbnRzJyk7XG52YXIgTk9fUExVR0lOID0gJ0lPTklDX0RFUExPWV9NSVNTSU5HX1BMVUdJTic7XG52YXIgSU5JVElBTF9ERUxBWSA9IDEgKiA1ICogMTAwMDtcbnZhciBXQVRDSF9JTlRFUlZBTCA9IDEgKiA2MCAqIDEwMDA7XG52YXIgRGVwbG95ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBEZXBsb3koKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgRGVwbG95OidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3BsdWdpbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2NoYW5uZWxUYWcgPSAncHJvZHVjdGlvbic7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgZXZlbnRzXzEuRXZlbnRFbWl0dGVyKCk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICAgICAgY29yZV8xLklvbmljUGxhdGZvcm0ub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmluaXRpYWxpemUoKTtcbiAgICAgICAgICAgIHNlbGYuX2lzUmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5lbWl0KCdpb25pY19kZXBsb3k6cmVhZHknKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBEZXBsb3kgUGx1Z2luXG4gICAgICpcbiAgICAgKiBJZiB0aGUgcGx1Z2luIGhhcyBub3QgYmVlbiBzZXQgeWV0LCBhdHRlbXB0IHRvIGZldGNoIGl0LCBvdGhlcndpc2UgbG9nXG4gICAgICogYSBtZXNzYWdlLlxuICAgICAqXG4gICAgICogQHJldHVybiB7SW9uaWNEZXBsb3l9IFJldHVybnMgdGhlIHBsdWdpbiBvciBmYWxzZVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuX2dldFBsdWdpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BsdWdpbikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BsdWdpbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIElvbmljRGVwbG95ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygncGx1Z2luIGlzIG5vdCBpbnN0YWxsZWQgb3IgaGFzIG5vdCBsb2FkZWQuIEhhdmUgeW91IHJ1biBgaW9uaWMgcGx1Z2luIGFkZCBpb25pYy1wbHVnaW4tZGVwbG95YCB5ZXQ/Jyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fcGx1Z2luID0gSW9uaWNEZXBsb3k7XG4gICAgICAgIHJldHVybiBJb25pY0RlcGxveTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemUgdGhlIERlcGxveSBQbHVnaW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuaW5pdGlhbGl6ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmluaXQoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBDaGVjayBmb3IgdXBkYXRlc1xuICAgICAqXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gV2lsbCByZXNvbHZlIHdpdGggdHJ1ZSBpZiBhbiB1cGRhdGUgaXMgYXZhaWxhYmxlLCBmYWxzZSBvdGhlcndpc2UuIEEgc3RyaW5nIG9yXG4gICAgICogICBlcnJvciB3aWxsIGJlIHBhc3NlZCB0byByZWplY3QoKSBpbiB0aGUgZXZlbnQgb2YgYSBmYWlsdXJlLlxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuY2hlY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5jaGVjayhjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgc2VsZi5fY2hhbm5lbFRhZywgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhbiB1cGRhdGUgaXMgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnbm8gdXBkYXRlcyBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKCdlbmNvdW50ZXJlZCBhbiBlcnJvciB3aGlsZSBjaGVja2luZyBmb3IgdXBkYXRlcycpO1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIERvd25sb2FkIGFuZCBhdmFpbGFibGUgdXBkYXRlXG4gICAgICpcbiAgICAgKiBUaGlzIHNob3VsZCBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggZXh0cmFjdCgpXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gVGhlIHByb21pc2Ugd2hpY2ggd2lsbCByZXNvbHZlIHdpdGggdHJ1ZS9mYWxzZSBvciB1c2VcbiAgICAgKiAgICBub3RpZnkgdG8gdXBkYXRlIHRoZSBkb3dubG9hZCBwcm9ncmVzcy5cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmRvd25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uZG93bmxvYWQoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gJ3RydWUnICYmIHJlc3VsdCAhPT0gJ2ZhbHNlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdkb3dubG9hZCBjb21wbGV0ZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQgPT09ICd0cnVlJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHRoZSBsYXN0IGRvd25sb2FkZWQgdXBkYXRlXG4gICAgICpcbiAgICAgKiBUaGlzIHNob3VsZCBiZSBjYWxsZWQgYWZ0ZXIgYSBkb3dubG9hZCgpIHN1Y2Nlc3NmdWxseSByZXNvbHZlcy5cbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcHJvbWlzZSB3aGljaCB3aWxsIHJlc29sdmUgd2l0aCB0cnVlL2ZhbHNlIG9yIHVzZVxuICAgICAqICAgICAgICAgICAgICAgICAgIG5vdGlmeSB0byB1cGRhdGUgdGhlIGV4dHJhY3Rpb24gcHJvZ3Jlc3MuXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5leHRyYWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uZXh0cmFjdChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAnZG9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnZXh0cmFjdGlvbiBjb21wbGV0ZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogTG9hZCB0aGUgbGF0ZXN0IGRlcGxveWVkIHZlcnNpb25cbiAgICAgKiBUaGlzIGlzIG9ubHkgbmVjZXNzYXJ5IHRvIGNhbGwgaWYgeW91IGhhdmUgbWFudWFsbHkgZG93bmxvYWRlZCBhbmQgZXh0cmFjdGVkXG4gICAgICogYW4gdXBkYXRlIGFuZCB3aXNoIHRvIHJlbG9hZCB0aGUgYXBwIHdpdGggdGhlIGxhdGVzdCBkZXBsb3kuIFRoZSBsYXRlc3QgZGVwbG95XG4gICAgICogd2lsbCBhdXRvbWF0aWNhbGx5IGJlIGxvYWRlZCB3aGVuIHRoZSBhcHAgaXMgc3RhcnRlZC5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4ucmVkaXJlY3QoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFdhdGNoIGNvbnN0YW50bHkgY2hlY2tzIGZvciB1cGRhdGVzLCBhbmQgdHJpZ2dlcnMgYW5cbiAgICAgKiBldmVudCB3aGVuIG9uZSBpcyByZWFkeS5cbiAgICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBXYXRjaCBjb25maWd1cmF0aW9uIG9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdpbGwgZ2V0IGEgbm90aWZ5KCkgY2FsbGJhY2sgd2hlbiBhbiB1cGRhdGUgaXMgYXZhaWxhYmxlXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS53YXRjaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodHlwZW9mIG9wdHMuaW5pdGlhbERlbGF5ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgb3B0cy5pbml0aWFsRGVsYXkgPSBJTklUSUFMX0RFTEFZO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5pbnRlcnZhbCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIG9wdHMuaW50ZXJ2YWwgPSBXQVRDSF9JTlRFUlZBTDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBjaGVja0ZvclVwZGF0ZXMoKSB7XG4gICAgICAgICAgICBzZWxmLmNoZWNrKCkudGhlbihmdW5jdGlvbiAoaGFzVXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhc1VwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoaGFzVXBkYXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5hYmxlIHRvIGNoZWNrIGZvciB1cGRhdGVzOiAnICsgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQ2hlY2sgb3VyIHRpbWVvdXQgdG8gbWFrZSBzdXJlIGl0IHdhc24ndCBjbGVhcmVkIHdoaWxlIHdlIHdlcmUgd2FpdGluZ1xuICAgICAgICAgICAgLy8gZm9yIGEgc2VydmVyIHJlc3BvbnNlXG4gICAgICAgICAgICBpZiAodGhpcy5fY2hlY2tUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbnRlcnZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgYWZ0ZXIgYW4gaW5pdGlhbCBzaG9ydCBkZXBsYXlcbiAgICAgICAgdGhpcy5fY2hlY2tUaW1lb3V0ID0gc2V0VGltZW91dChjaGVja0ZvclVwZGF0ZXMuYmluZChzZWxmKSwgb3B0cy5pbml0aWFsRGVsYXkpO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFN0b3AgYXV0b21hdGljYWxseSBsb29raW5nIGZvciB1cGRhdGVzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLnVud2F0Y2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9jaGVja1RpbWVvdXQpO1xuICAgICAgICB0aGlzLl9jaGVja1RpbWVvdXQgPSBudWxsO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogSW5mb3JtYXRpb24gYWJvdXQgdGhlIGN1cnJlbnQgZGVwbG95XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVzb2x2ZXIgd2lsbCBiZSBwYXNzZWQgYW4gb2JqZWN0IHRoYXQgaGFzIGtleS92YWx1ZVxuICAgICAqICAgIHBhaXJzIHBlcnRhaW5pbmcgdG8gdGhlIGN1cnJlbnRseSBkZXBsb3llZCB1cGRhdGUuXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5pbmZvID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uaW5mbyhjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBMaXN0IHRoZSBEZXBsb3kgdmVyc2lvbnMgdGhhdCBoYXZlIGJlZW4gaW5zdGFsbGVkIG9uIHRoaXMgZGV2aWNlXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBUaGUgcmVzb2x2ZXIgd2lsbCBiZSBwYXNzZWQgYW4gYXJyYXkgb2YgZGVwbG95IHV1aWRzXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5nZXRWZXJzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuX2dldFBsdWdpbigpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fcGx1Z2luLmdldFZlcnNpb25zKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2FwcF9pZCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KE5PX1BMVUdJTik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJlbW92ZSBhbiBpbnN0YWxsZWQgZGVwbG95IG9uIHRoaXMgZGV2aWNlXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdXVpZCBUaGUgZGVwbG95IHV1aWQgeW91IHdpc2ggdG8gcmVtb3ZlIGZyb20gdGhlIGRldmljZVxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IFN0YW5kYXJkIHJlc29sdmUvcmVqZWN0IHJlc29sdXRpb25cbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLmRlbGV0ZVZlcnNpb24gPSBmdW5jdGlvbiAodXVpZCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgcHJvbWlzZV8xLkRlZmVycmVkUHJvbWlzZSgpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4uZGVsZXRlVmVyc2lvbihjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgdXVpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBGZXRjaGVzIHRoZSBtZXRhZGF0YSBmb3IgYSBnaXZlbiBkZXBsb3kgdXVpZC4gSWYgbm8gdXVpZCBpcyBnaXZlbiwgaXQgd2lsbCBhdHRlbXB0XG4gICAgICogdG8gZ3JhYiB0aGUgbWV0YWRhdGEgZm9yIHRoZSBtb3N0IHJlY2VudGx5IGtub3duIHVwZGF0ZSB2ZXJzaW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHV1aWQgVGhlIGRlcGxveSB1dWlkIHlvdSB3aXNoIHRvIGdyYWIgbWV0YWRhdGEgZm9yLCBjYW4gYmUgbGVmdCBibGFuayB0byBncmFiIGxhdGVzdCBrbm93biB1cGRhdGUgbWV0YWRhdGFcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBTdGFuZGFyZCByZXNvbHZlL3JlamVjdCByZXNvbHV0aW9uXG4gICAgICovXG4gICAgRGVwbG95LnByb3RvdHlwZS5nZXRNZXRhZGF0YSA9IGZ1bmN0aW9uICh1dWlkKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLl9nZXRQbHVnaW4oKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5nZXRNZXRhZGF0YShjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKSwgdXVpZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdC5tZXRhZGF0YSk7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChOT19QTFVHSU4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGRlcGxveSBjaGFubmVsIHRoYXQgc2hvdWxkIGJlIGNoZWNrZWQgZm9yIHVwZGF0c2VcbiAgICAgKiBTZWUgaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9kZXBsb3ktY2hhbm5lbHMgZm9yIG1vcmUgaW5mb3JtYXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsVGFnIFRoZSBjaGFubmVsIHRhZyB0byB1c2VcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUuc2V0Q2hhbm5lbCA9IGZ1bmN0aW9uIChjaGFubmVsVGFnKSB7XG4gICAgICAgIHRoaXMuX2NoYW5uZWxUYWcgPSBjaGFubmVsVGFnO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogVXBkYXRlIGFwcCB3aXRoIHRoZSBsYXRlc3QgZGVwbG95XG4gICAgICogQHBhcmFtIHtib29sZWFufSBkZWZlckxvYWQgRGVmZXIgbG9hZGluZyB0aGUgYXBwbGllZCB1cGRhdGUgYWZ0ZXIgdGhlIGluc3RhbGxhdGlvblxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IEEgcHJvbWlzZSByZXN1bHRcbiAgICAgKi9cbiAgICBEZXBsb3kucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIChkZWZlckxvYWQpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZGVmZXJMb2FkaW5nID0gZmFsc2U7XG4gICAgICAgIGlmICh0eXBlb2YgZGVmZXJMb2FkICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgZGVmZXJMb2FkaW5nID0gZGVmZXJMb2FkO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5fZ2V0UGx1Z2luKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdXBkYXRlc1xuICAgICAgICAgICAgICAgIHNlbGYuY2hlY2soKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlcmUgYXJlIHVwZGF0ZXMsIGRvd25sb2FkIHRoZW1cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkb3dubG9hZFByb2dyZXNzID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuZG93bmxvYWQoKS50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoJ2Rvd25sb2FkIGVycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuZXh0cmFjdCgpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KCdleHRyYWN0aW9uIGVycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFkZWZlckxvYWRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9wbHVnaW4ucmVkaXJlY3QoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICh1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHByb2dyZXNzID0gZG93bmxvYWRQcm9ncmVzcyArICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHByb2dyZXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAodXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG93bmxvYWRQcm9ncmVzcyA9ICh1cGRhdGUgLyAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoZG93bmxvYWRQcm9ncmVzcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoTk9fUExVR0lOKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRmlyZSBhIGNhbGxiYWNrIHdoZW4gZGVwbG95IGlzIHJlYWR5LiBUaGlzIHdpbGwgZmlyZSBpbW1lZGlhdGVseSBpZlxuICAgICAqIGRlcGxveSBoYXMgYWxyZWFkeSBiZWNvbWUgYXZhaWxhYmxlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBvZmZcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIERlcGxveS5wcm90b3R5cGUub25SZWFkeSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICh0aGlzLl9pc1JlYWR5KSB7XG4gICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIub24oJ2lvbmljX2RlcGxveTpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gRGVwbG95O1xufSgpKTtcbmV4cG9ydHMuRGVwbG95ID0gRGVwbG95O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi9kZXBsb3knKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2F1dGgvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2NvcmUvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL2RlcGxveS9pbmRleCcpKTtcbl9fZXhwb3J0KHJlcXVpcmUoJy4vaW5zaWdodHMvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gvaW5kZXgnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3V0aWwvaW5kZXgnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL2luc2lnaHRzJykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgbG9nZ2VyXzEgPSByZXF1aXJlKCcuLi9jb3JlL2xvZ2dlcicpO1xudmFyIFN0YXQgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFN0YXQoYXBwSWQsIHN0YXQsIHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7IHZhbHVlID0gMTsgfVxuICAgICAgICB0aGlzLmFwcElkID0gYXBwSWQ7XG4gICAgICAgIHRoaXMuc3RhdCA9IHN0YXQ7XG4gICAgICAgIHRoaXMudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLnN0YXQgPSBzdGF0O1xuICAgICAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gICAgICAgIHRoaXMuY3JlYXRlZCA9IG5ldyBEYXRlKCk7XG4gICAgfVxuICAgIFN0YXQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFwcF9pZDogdGhpcy5hcHBJZCxcbiAgICAgICAgICAgIHN0YXQ6IHRoaXMuc3RhdCxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnZhbHVlLFxuICAgICAgICAgICAgY3JlYXRlZDogdGhpcy5jcmVhdGVkLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgfTtcbiAgICByZXR1cm4gU3RhdDtcbn0oKSk7XG52YXIgSW5zaWdodHMgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIEluc2lnaHRzKGFwcElkKSB7XG4gICAgICAgIHRoaXMuYXBwSWQgPSBhcHBJZDtcbiAgICAgICAgdGhpcy5hcHBJZCA9IGFwcElkO1xuICAgICAgICB0aGlzLmJhdGNoID0gW107XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIEluc2lnaHRzOidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ2luaXQnKTtcbiAgICB9XG4gICAgSW5zaWdodHMucHJvdG90eXBlLnRyYWNrID0gZnVuY3Rpb24gKHN0YXQsIHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7IHZhbHVlID0gMTsgfVxuICAgICAgICB0aGlzLmJhdGNoLnB1c2gobmV3IFN0YXQodGhpcy5hcHBJZCwgc3RhdCwgdmFsdWUpKTtcbiAgICAgICAgdGhpcy5zdWJtaXQoKTtcbiAgICB9O1xuICAgIEluc2lnaHRzLnByb3RvdHlwZS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmJhdGNoLmxlbmd0aCA+PSBJbnNpZ2h0cy5TVUJNSVRfQ09VTlQpIHtcbiAgICAgICAgfVxuICAgIH07XG4gICAgSW5zaWdodHMuU1VCTUlUX0NPVU5UID0gMTAwO1xuICAgIHJldHVybiBJbnNpZ2h0cztcbn0oKSk7XG5leHBvcnRzLkluc2lnaHRzID0gSW5zaWdodHM7XG4iLCJcInVzZSBzdHJpY3RcIjtcbmZ1bmN0aW9uIF9fZXhwb3J0KG0pIHtcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmICghZXhwb3J0cy5oYXNPd25Qcm9wZXJ0eShwKSkgZXhwb3J0c1twXSA9IG1bcF07XG59XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gtZGV2JykpO1xuX19leHBvcnQocmVxdWlyZSgnLi9wdXNoLW1lc3NhZ2UnKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gtdG9rZW4nKSk7XG5fX2V4cG9ydChyZXF1aXJlKCcuL3B1c2gnKSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciByZXF1ZXN0XzEgPSByZXF1aXJlKCcuLi9jb3JlL3JlcXVlc3QnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgdXRpbF8xID0gcmVxdWlyZSgnLi4vdXRpbC91dGlsJyk7XG52YXIgcHVzaF90b2tlbl8xID0gcmVxdWlyZSgnLi9wdXNoLXRva2VuJyk7XG4vKipcbiAqIFB1c2hEZXYgU2VydmljZVxuICpcbiAqIFRoaXMgc2VydmljZSBhY3RzIGFzIGEgbW9jayBwdXNoIHNlcnZpY2UgdGhhdCBpcyBpbnRlbmRlZCB0byBiZSB1c2VkIHByZS1zZXR1cCBvZlxuICogR0NNL0FQTlMgaW4gYW4gSW9uaWMuaW8gcHJvamVjdC5cbiAqXG4gKiBIb3cgaXQgd29ya3M6XG4gKlxuICogICBXaGVuIHJlZ2lzdGVyKCkgaXMgY2FsbGVkLCB0aGlzIHNlcnZpY2UgaXMgdXNlZCB0byBnZW5lcmF0ZSBhIHJhbmRvbVxuICogICBkZXZlbG9wbWVudCBkZXZpY2UgdG9rZW4uIFRoaXMgdG9rZW4gaXMgbm90IHZhbGlkIGZvciBhbnkgc2VydmljZSBvdXRzaWRlIG9mXG4gKiAgIElvbmljIFB1c2ggd2l0aCBgZGV2X3B1c2hgIHNldCB0byB0cnVlLiBUaGVzZSB0b2tlbnMgZG8gbm90IGxhc3QgbG9uZyBhbmQgYXJlIG5vdFxuICogICBlbGlnaWJsZSBmb3IgdXNlIGluIGEgcHJvZHVjdGlvbiBhcHAuXG4gKlxuICogICBUaGUgZGV2aWNlIHdpbGwgdGhlbiBwZXJpb2RpY2FsbHkgY2hlY2sgdGhlIFB1c2ggc2VydmljZSBmb3IgcHVzaCBub3RpZmljYXRpb25zIHNlbnRcbiAqICAgdG8gb3VyIGRldmVsb3BtZW50IHRva2VuIC0tIHNvIHVubGlrZSBhIHR5cGljYWwgXCJwdXNoXCIgdXBkYXRlLCB0aGlzIGFjdHVhbGx5IHVzZXNcbiAqICAgXCJwb2xsaW5nXCIgdG8gZmluZCBuZXcgbm90aWZpY2F0aW9ucy4gVGhpcyBtZWFucyB5b3UgKk1VU1QqIGhhdmUgdGhlIGFwcGxpY2F0aW9uIG9wZW5cbiAqICAgYW5kIGluIHRoZSBmb3JlZ3JvdW5kIHRvIHJldHJlaXZlIG1lc3NzYWdlcy5cbiAqXG4gKiAgIFRoZSBjYWxsYmFja3MgcHJvdmlkZWQgaW4geW91ciBpbml0KCkgd2lsbCBzdGlsbCBiZSB0cmlnZ2VyZWQgYXMgbm9ybWFsLFxuICogICBidXQgd2l0aCB0aGVzZSBub3RhYmxlIGV4Y2VwdGlvbnM6XG4gKlxuICogICAgICAtIFRoZXJlIGlzIG5vIHBheWxvYWQgZGF0YSBhdmFpbGFibGUgd2l0aCBtZXNzYWdlc1xuICogICAgICAtIEFuIGFsZXJ0KCkgaXMgY2FsbGVkIHdoZW4gYSBub3RpZmljYXRpb24gaXMgcmVjZWl2ZWQgdW5sZXNzcyB5b3UgcmV0dXJuIGZhbHNlXG4gKiAgICAgICAgaW4geW91ciAnb25Ob3RpZmljYXRpb24nIGNhbGxiYWNrLlxuICpcbiAqL1xudmFyIFB1c2hEZXZTZXJ2aWNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBQdXNoRGV2U2VydmljZSgpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIgPSBuZXcgbG9nZ2VyXzEuTG9nZ2VyKHtcbiAgICAgICAgICAgICdwcmVmaXgnOiAnSW9uaWMgUHVzaCAoZGV2KTonXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9zZXJ2aWNlSG9zdCA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXRVUkwoJ3BsYXRmb3JtLWFwaScpICsgJy9wdXNoJztcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl93YXRjaCA9IG51bGw7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGEgZGV2ZWxvcG1lbnQgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gZGV2ZWxvcG1lbnQgZGV2aWNlIHRva2VuXG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmdldERldlRva2VuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgdG9rZW4gPSB1dGlsXzEuZ2VuZXJhdGVVVUlEKCk7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gJ0RFVi0nICsgdG9rZW47XG4gICAgICAgIHJldHVybiB0aGlzLl90b2tlbjtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyBhIGRldmVsb3BtZW50IHRva2VuIHdpdGggdGhlIElvbmljIFB1c2ggc2VydmljZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtJb25pY1B1c2hTZXJ2aWNlfSBpb25pY1B1c2ggSW5zdGFudGlhdGVkIFB1c2ggU2VydmljZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFJlZ2lzdHJhdGlvbiBDYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLmluaXQgPSBmdW5jdGlvbiAoaW9uaWNQdXNoLCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9wdXNoID0gaW9uaWNQdXNoO1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gdGhpcy5fcHVzaC5fZW1pdHRlcjtcbiAgICAgICAgdmFyIHRva2VuID0gdGhpcy5fdG9rZW47XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmdldERldlRva2VuKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlcXVlc3RPcHRpb25zID0ge1xuICAgICAgICAgICAgJ21ldGhvZCc6ICdQT1NUJyxcbiAgICAgICAgICAgICd1cmknOiB0aGlzLl9zZXJ2aWNlSG9zdCArICcvZGV2ZWxvcG1lbnQnLFxuICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgJ3Rva2VuJzogdG9rZW5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgbmV3IHJlcXVlc3RfMS5BUElSZXF1ZXN0KHJlcXVlc3RPcHRpb25zKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0geyAncmVnaXN0cmF0aW9uSWQnOiB0b2tlbiB9O1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygncmVnaXN0ZXJlZCB3aXRoIGRldmVsb3BtZW50IHB1c2ggc2VydmljZTogJyArIHRva2VuKTtcbiAgICAgICAgICAgIHNlbGYuX2VtaXR0ZXIuZW1pdCgnaW9uaWNfcHVzaDp0b2tlbicsIGRhdGEpO1xuICAgICAgICAgICAgaWYgKCh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobmV3IHB1c2hfdG9rZW5fMS5QdXNoVG9rZW4oc2VsZi5fdG9rZW4pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGYud2F0Y2goKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignZXJyb3IgY29ubmVjdGluZyBkZXZlbG9wbWVudCBwdXNoIHNlcnZpY2U6ICcgKyBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHRoZSBwdXNoIHNlcnZpY2UgZm9yIG5vdGlmaWNhdGlvbnMgdGhhdCB0YXJnZXQgdGhlIGN1cnJlbnQgZGV2ZWxvcG1lbnQgdG9rZW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2hEZXZTZXJ2aWNlLnByb3RvdHlwZS5jaGVja0Zvck5vdGlmaWNhdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5fdG9rZW4pIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICdtZXRob2QnOiAnR0VUJyxcbiAgICAgICAgICAgICd1cmknOiBzZWxmLl9zZXJ2aWNlSG9zdCArICcvZGV2ZWxvcG1lbnQ/dG9rZW49JyArIHNlbGYuX3Rva2VuLFxuICAgICAgICAgICAgJ2pzb24nOiB0cnVlXG4gICAgICAgIH07XG4gICAgICAgIG5ldyByZXF1ZXN0XzEuQVBJUmVxdWVzdChyZXF1ZXN0T3B0aW9ucykudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0LnBheWxvYWQuZGF0YS5tZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSB7XG4gICAgICAgICAgICAgICAgICAgICdtZXNzYWdlJzogcmVzdWx0LnBheWxvYWQuZGF0YS5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAndGl0bGUnOiAnREVWRUxPUE1FTlQgUFVTSCdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLndhcm4oJ0lvbmljIFB1c2g6IERldmVsb3BtZW50IFB1c2ggcmVjZWl2ZWQuIERldmVsb3BtZW50IHB1c2hlcyB3aWxsIG5vdCBjb250YWluIHBheWxvYWQgZGF0YS4nKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9lbWl0dGVyLmVtaXQoJ2lvbmljX3B1c2g6bm90aWZpY2F0aW9uJywgbWVzc2FnZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBjaGVjayBmb3IgZGV2ZWxvcG1lbnQgcHVzaGVzOiAnICsgZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEtpY2tzIG9mZiB0aGUgXCJwb2xsaW5nXCIgb2YgdGhlIElvbmljIFB1c2ggc2VydmljZSBmb3IgbmV3IHB1c2ggbm90aWZpY2F0aW9uc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaERldlNlcnZpY2UucHJvdG90eXBlLndhdGNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBDaGVjayBmb3IgbmV3IGRldiBwdXNoZXMgZXZlcnkgNSBzZWNvbmRzXG4gICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3dhdGNoaW5nIGZvciBuZXcgbm90aWZpY2F0aW9ucycpO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghdGhpcy5fd2F0Y2gpIHtcbiAgICAgICAgICAgIHRoaXMuX3dhdGNoID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyBzZWxmLmNoZWNrRm9yTm90aWZpY2F0aW9ucygpOyB9LCA1MDAwKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLyoqXG4gICAgICogUHV0cyB0aGUgXCJwb2xsaW5nXCIgZm9yIG5ldyBub3RpZmljYXRpb25zIG9uIGhvbGQuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoRGV2U2VydmljZS5wcm90b3R5cGUuaGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3dhdGNoKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuX3dhdGNoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIFB1c2hEZXZTZXJ2aWNlO1xufSgpKTtcbmV4cG9ydHMuUHVzaERldlNlcnZpY2UgPSBQdXNoRGV2U2VydmljZTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIFB1c2hNZXNzYWdlQXBwU3RhdHVzID0gKGZ1bmN0aW9uICgpIHtcbiAgICBmdW5jdGlvbiBQdXNoTWVzc2FnZUFwcFN0YXR1cygpIHtcbiAgICAgICAgdGhpcy5hc2xlZXAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jbG9zZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFB1c2hNZXNzYWdlQXBwU3RhdHVzLnByb3RvdHlwZSwgXCJ3YXNBc2xlZXBcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFzbGVlcDtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFB1c2hNZXNzYWdlQXBwU3RhdHVzLnByb3RvdHlwZSwgXCJ3YXNDbG9zZWRcIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlZDtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgfSk7XG4gICAgcmV0dXJuIFB1c2hNZXNzYWdlQXBwU3RhdHVzO1xufSgpKTtcbmV4cG9ydHMuUHVzaE1lc3NhZ2VBcHBTdGF0dXMgPSBQdXNoTWVzc2FnZUFwcFN0YXR1cztcbnZhciBQdXNoTWVzc2FnZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUHVzaE1lc3NhZ2UocmF3KSB7XG4gICAgICAgIHRoaXMuX3JhdyA9IHJhdyB8fCB7fTtcbiAgICAgICAgaWYgKCF0aGlzLl9yYXcuYWRkaXRpb25hbERhdGEpIHtcbiAgICAgICAgICAgIC8vIHRoaXMgc2hvdWxkIG9ubHkgaGl0IGlmIHdlIGFyZSBzZXJ2aW5nIHVwIGEgZGV2ZWxvcG1lbnQgcHVzaFxuICAgICAgICAgICAgdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhID0ge1xuICAgICAgICAgICAgICAgICdjb2xkc3RhcnQnOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAnZm9yZWdyb3VuZCc6IHRydWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fcGF5bG9hZCA9IG51bGw7XG4gICAgICAgIHRoaXMuYXBwID0gbnVsbDtcbiAgICAgICAgdGhpcy50ZXh0ID0gbnVsbDtcbiAgICAgICAgdGhpcy50aXRsZSA9IG51bGw7XG4gICAgICAgIHRoaXMuY291bnQgPSBudWxsO1xuICAgICAgICB0aGlzLnNvdW5kID0gbnVsbDtcbiAgICAgICAgdGhpcy5pbWFnZSA9IG51bGw7XG4gICAgfVxuICAgIFB1c2hNZXNzYWdlLmZyb21QbHVnaW5KU09OID0gZnVuY3Rpb24gKGpzb24pIHtcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBuZXcgUHVzaE1lc3NhZ2UoanNvbik7XG4gICAgICAgIG1lc3NhZ2UucHJvY2Vzc1JhdygpO1xuICAgICAgICByZXR1cm4gbWVzc2FnZTtcbiAgICB9O1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQdXNoTWVzc2FnZS5wcm90b3R5cGUsIFwicGF5bG9hZFwiLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BheWxvYWQgfHwge307XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFB1c2hNZXNzYWdlLnByb3RvdHlwZS5wcm9jZXNzUmF3ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnRleHQgPSB0aGlzLl9yYXcubWVzc2FnZSB8fCBudWxsO1xuICAgICAgICB0aGlzLnRpdGxlID0gdGhpcy5fcmF3LnRpdGxlIHx8IG51bGw7XG4gICAgICAgIHRoaXMuY291bnQgPSB0aGlzLl9yYXcuY291bnQgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5zb3VuZCA9IHRoaXMuX3Jhdy5zb3VuZCB8fCBudWxsO1xuICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5fcmF3LmltYWdlIHx8IG51bGw7XG4gICAgICAgIHRoaXMuYXBwID0gbmV3IFB1c2hNZXNzYWdlQXBwU3RhdHVzKCk7XG4gICAgICAgIGlmICghdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhLmZvcmVncm91bmQpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLmFzbGVlcCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5jb2xkc3RhcnQpIHtcbiAgICAgICAgICAgIHRoaXMuYXBwLmNsb3NlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX3Jhdy5hZGRpdGlvbmFsRGF0YS5wYXlsb2FkKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXlsb2FkID0gdGhpcy5fcmF3LmFkZGl0aW9uYWxEYXRhLnBheWxvYWQ7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIFB1c2hNZXNzYWdlLnByb3RvdHlwZS5nZXRSYXdWZXJzaW9uID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmF3O1xuICAgIH07XG4gICAgUHVzaE1lc3NhZ2UucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJzxQdXNoTWVzc2FnZSBbXFwnJyArIHRoaXMudGl0bGUgKyAnXFwnXT4nO1xuICAgIH07XG4gICAgcmV0dXJuIFB1c2hNZXNzYWdlO1xufSgpKTtcbmV4cG9ydHMuUHVzaE1lc3NhZ2UgPSBQdXNoTWVzc2FnZTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIFB1c2hUb2tlbiA9IChmdW5jdGlvbiAoKSB7XG4gICAgZnVuY3Rpb24gUHVzaFRva2VuKHRva2VuKSB7XG4gICAgICAgIHRoaXMuX3Rva2VuID0gdG9rZW4gfHwgbnVsbDtcbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFB1c2hUb2tlbi5wcm90b3R5cGUsIFwidG9rZW5cIiwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl90b2tlbjtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIHRoaXMuX3Rva2VuID0gdmFsdWU7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuICAgIFB1c2hUb2tlbi5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB0b2tlbiA9IHRoaXMuX3Rva2VuIHx8ICdudWxsJztcbiAgICAgICAgcmV0dXJuICc8UHVzaFRva2VuIFtcXCcnICsgdG9rZW4gKyAnXFwnXT4nO1xuICAgIH07XG4gICAgcmV0dXJuIFB1c2hUb2tlbjtcbn0oKSk7XG5leHBvcnRzLlB1c2hUb2tlbiA9IFB1c2hUb2tlbjtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGFwcF8xID0gcmVxdWlyZSgnLi4vY29yZS9hcHAnKTtcbnZhciBjb3JlXzEgPSByZXF1aXJlKCcuLi9jb3JlL2NvcmUnKTtcbnZhciBsb2dnZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvbG9nZ2VyJyk7XG52YXIgZXZlbnRzXzEgPSByZXF1aXJlKCcuLi9jb3JlL2V2ZW50cycpO1xudmFyIHJlcXVlc3RfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcmVxdWVzdCcpO1xudmFyIHByb21pc2VfMSA9IHJlcXVpcmUoJy4uL2NvcmUvcHJvbWlzZScpO1xudmFyIHVzZXJfMSA9IHJlcXVpcmUoJy4uL2NvcmUvdXNlcicpO1xudmFyIHB1c2hfdG9rZW5fMSA9IHJlcXVpcmUoJy4vcHVzaC10b2tlbicpO1xudmFyIHB1c2hfbWVzc2FnZV8xID0gcmVxdWlyZSgnLi9wdXNoLW1lc3NhZ2UnKTtcbnZhciBwdXNoX2Rldl8xID0gcmVxdWlyZSgnLi9wdXNoLWRldicpO1xudmFyIERFRkVSX0lOSVQgPSAnREVGRVJfSU5JVCc7XG52YXIgcHVzaEFQSUJhc2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0VVJMKCdwbGF0Zm9ybS1hcGknKSArICcvcHVzaCc7XG52YXIgcHVzaEFQSUVuZHBvaW50cyA9IHtcbiAgICAnc2F2ZVRva2VuJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gcHVzaEFQSUJhc2UgKyAnL3Rva2Vucyc7XG4gICAgfSxcbiAgICAnaW52YWxpZGF0ZVRva2VuJzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gcHVzaEFQSUJhc2UgKyAnL3Rva2Vucy9pbnZhbGlkYXRlJztcbiAgICB9XG59O1xudmFyIFB1c2ggPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIFB1c2goY29uZmlnKSB7XG4gICAgICAgIHRoaXMubG9nZ2VyID0gbmV3IGxvZ2dlcl8xLkxvZ2dlcih7XG4gICAgICAgICAgICAncHJlZml4JzogJ0lvbmljIFB1c2g6J1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIGFwcCA9IG5ldyBhcHBfMS5BcHAoY29yZV8xLklvbmljUGxhdGZvcm0uY29uZmlnLmdldCgnYXBwX2lkJykpO1xuICAgICAgICBhcHAuZGV2UHVzaCA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmNvbmZpZy5nZXQoJ2Rldl9wdXNoJyk7XG4gICAgICAgIGFwcC5nY21LZXkgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdnY21fa2V5Jyk7XG4gICAgICAgIC8vIENoZWNrIGZvciB0aGUgcmVxdWlyZWQgdmFsdWVzIHRvIHVzZSB0aGlzIHNlcnZpY2VcbiAgICAgICAgaWYgKCFhcHAuaWQpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdubyBhcHBfaWQgZm91bmQuIChodHRwOi8vZG9jcy5pb25pYy5pby9kb2NzL2lvLWluc3RhbGwpJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY29yZV8xLklvbmljUGxhdGZvcm0uaXNBbmRyb2lkRGV2aWNlKCkgJiYgIWFwcC5kZXZQdXNoICYmICFhcHAuZ2NtS2V5KSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignR0NNIHByb2plY3QgbnVtYmVyIG5vdCBmb3VuZCAoaHR0cDovL2RvY3MuaW9uaWMuaW8vZG9jcy9wdXNoLWFuZHJvaWQtc2V0dXApJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMucmVnaXN0ZXJDYWxsYmFjayA9IG51bGw7XG4gICAgICAgIHRoaXMubm90aWZpY2F0aW9uQ2FsbGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLmVycm9yQ2FsbGJhY2sgPSBudWxsO1xuICAgICAgICB0aGlzLl90b2tlbiA9IG51bGw7XG4gICAgICAgIHRoaXMuX25vdGlmaWNhdGlvbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9kZWJ1ZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc1JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3Rva2VuUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tSZWdpc3RyYXRpb24gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmxvY2tTYXZlVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fcmVnaXN0ZXJlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9lbWl0dGVyID0gbmV3IGV2ZW50c18xLkV2ZW50RW1pdHRlcigpO1xuICAgICAgICB0aGlzLl9wbHVnaW4gPSBudWxsO1xuICAgICAgICBpZiAoY29uZmlnICE9PSBERUZFUl9JTklUKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmluaXQoY29uZmlnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQdXNoLnByb3RvdHlwZSwgXCJ0b2tlblwiLCB7XG4gICAgICAgIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgICAgdmFyIHN0b3JhZ2UgPSBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5nZXRTdG9yYWdlKCk7XG4gICAgICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgcHVzaF90b2tlbl8xLlB1c2hUb2tlbikge1xuICAgICAgICAgICAgICAgIHN0b3JhZ2Uuc3RvcmVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nLCB7ICd0b2tlbic6IHZhbC50b2tlbiB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX3Rva2VuID0gdmFsO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcbiAgICBQdXNoLnByb3RvdHlwZS5nZXRTdG9yYWdlVG9rZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzdG9yYWdlID0gY29yZV8xLklvbmljUGxhdGZvcm0uZ2V0U3RvcmFnZSgpO1xuICAgICAgICB2YXIgdG9rZW4gPSBzdG9yYWdlLnJldHJpZXZlT2JqZWN0KCdpb25pY19pb19wdXNoX3Rva2VuJyk7XG4gICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBwdXNoX3Rva2VuXzEuUHVzaFRva2VuKHRva2VuLnRva2VuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLmNsZWFyU3RvcmFnZVRva2VuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmdldFN0b3JhZ2UoKTtcbiAgICAgICAgc3RvcmFnZS5kZWxldGVPYmplY3QoJ2lvbmljX2lvX3B1c2hfdG9rZW4nKTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEluaXQgbWV0aG9kIHRvIHNldHVwIHB1c2ggYmVoYXZpb3Ivb3B0aW9uc1xuICAgICAqXG4gICAgICogVGhlIGNvbmZpZyBzdXBwb3J0cyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAgICogICAtIGRlYnVnIHtCb29sZWFufSBFbmFibGVzIHNvbWUgZXh0cmEgbG9nZ2luZyBhcyB3ZWxsIGFzIHNvbWUgZGVmYXVsdCBjYWxsYmFjayBoYW5kbGVyc1xuICAgICAqICAgLSBvbk5vdGlmaWNhdGlvbiB7RnVuY3Rpb259IENhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgaXMgcGFzc2VkIHRoZSBub3RpZmljYXRpb24gb2JqZWN0XG4gICAgICogICAtIG9uUmVnaXN0ZXIge0Z1bmN0aW9ufSBDYWxsYmFjayBmdW5jdGlvbiB0aGF0IGlzIHBhc3NlZCB0aGUgcmVnaXN0cmF0aW9uIG9iamVjdFxuICAgICAqICAgLSBvbkVycm9yIHtGdW5jdGlvbn0gQ2FsbGJhY2sgZnVuY3Rpb24gdGhhdCBpcyBwYXNzZWQgdGhlIGVycm9yIG9iamVjdFxuICAgICAqICAgLSBwbHVnaW5Db25maWcge09iamVjdH0gUGx1Z2luIGNvbmZpZ3VyYXRpb246IGh0dHBzOi8vZ2l0aHViLmNvbS9waG9uZWdhcC9waG9uZWdhcC1wbHVnaW4tcHVzaFxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGNvbmZpZyBDb25maWd1cmF0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge1B1c2h9IHJldHVybnMgdGhlIGNhbGxlZCBQdXNoIGluc3RhbnRpYXRpb25cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5pbml0ID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICB0aGlzLl9nZXRQdXNoUGx1Z2luKCk7XG4gICAgICAgIGlmICh0eXBlb2YgY29uZmlnID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uZmlnID0ge307XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcignaW5pdCgpIHJlcXVpcmVzIGEgdmFsaWQgY29uZmlnIG9iamVjdC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmICghY29uZmlnLnBsdWdpbkNvbmZpZykge1xuICAgICAgICAgICAgY29uZmlnLnBsdWdpbkNvbmZpZyA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5pc0FuZHJvaWREZXZpY2UoKSkge1xuICAgICAgICAgICAgLy8gaW5qZWN0IGdjbSBrZXkgZm9yIFB1c2hQbHVnaW5cbiAgICAgICAgICAgIGlmICghY29uZmlnLnBsdWdpbkNvbmZpZy5hbmRyb2lkKSB7XG4gICAgICAgICAgICAgICAgY29uZmlnLnBsdWdpbkNvbmZpZy5hbmRyb2lkID0ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZC5zZW5kZXJJZCkge1xuICAgICAgICAgICAgICAgIGNvbmZpZy5wbHVnaW5Db25maWcuYW5kcm9pZC5zZW5kZXJJRCA9IHNlbGYuYXBwLmdjbUtleTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBTdG9yZSBDYWxsYmFja3NcbiAgICAgICAgaWYgKGNvbmZpZy5vblJlZ2lzdGVyKSB7XG4gICAgICAgICAgICB0aGlzLnNldFJlZ2lzdGVyQ2FsbGJhY2soY29uZmlnLm9uUmVnaXN0ZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb25maWcub25Ob3RpZmljYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Tm90aWZpY2F0aW9uQ2FsbGJhY2soY29uZmlnLm9uTm90aWZpY2F0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29uZmlnLm9uRXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0RXJyb3JDYWxsYmFjayhjb25maWcub25FcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fY29uZmlnID0gY29uZmlnO1xuICAgICAgICB0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KCdpb25pY19wdXNoOnJlYWR5JywgeyAnY29uZmlnJzogdGhpcy5fY29uZmlnIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLnNhdmVUb2tlbiA9IGZ1bmN0aW9uICh0b2tlbiwgb3B0aW9ucykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IG5ldyBwcm9taXNlXzEuRGVmZXJyZWRQcm9taXNlKCk7XG4gICAgICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgaWYgKHRva2VuLnRva2VuKSB7XG4gICAgICAgICAgICB0b2tlbiA9IHRva2VuLnRva2VuO1xuICAgICAgICB9XG4gICAgICAgIHZhciB0b2tlbkRhdGEgPSB7XG4gICAgICAgICAgICAndG9rZW4nOiB0b2tlbixcbiAgICAgICAgICAgICdhcHBfaWQnOiBjb3JlXzEuSW9uaWNQbGF0Zm9ybS5jb25maWcuZ2V0KCdhcHBfaWQnKVxuICAgICAgICB9O1xuICAgICAgICBpZiAoIW9wdHMuaWdub3JlX3VzZXIpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gdXNlcl8xLlVzZXIuY3VycmVudCgpO1xuICAgICAgICAgICAgaWYgKHVzZXIuaXNBdXRoZW50aWNhdGVkKCkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbkRhdGEudXNlcl9pZCA9IHVzZXIuaWQ7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNlbGYuX2Jsb2NrU2F2ZVRva2VuKSB7XG4gICAgICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiBwdXNoQVBJRW5kcG9pbnRzLnNhdmVUb2tlbigpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB0b2tlbkRhdGFcbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2Jsb2NrU2F2ZVRva2VuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc2F2ZWQgcHVzaCB0b2tlbjogJyArIHRva2VuKTtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5EYXRhLnVzZXJfaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnYWRkZWQgcHVzaCB0b2tlbiB0byB1c2VyOiAnICsgdG9rZW5EYXRhLnVzZXJfaWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9ibG9ja1NhdmVUb2tlbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYubG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCdhIHRva2VuIHNhdmUgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogUmVnaXN0ZXJzIHRoZSBkZXZpY2Ugd2l0aCBHQ00vQVBOUyB0byBnZXQgYSBkZXZpY2UgdG9rZW5cbiAgICAgKiBGaXJlcyBvZmYgdGhlICdvblJlZ2lzdGVyJyBjYWxsYmFjayBpZiBvbmUgaGFzIGJlZW4gcHJvdmlkZWQgaW4gdGhlIGluaXQoKSBjb25maWdcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBDYWxsYmFjayBGdW5jdGlvblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUucmVnaXN0ZXIgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5sb2dnZXIuaW5mbygncmVnaXN0ZXInKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAodGhpcy5fYmxvY2tSZWdpc3RyYXRpb24pIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2Fub3RoZXIgcmVnaXN0cmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYmxvY2tSZWdpc3RyYXRpb24gPSB0cnVlO1xuICAgICAgICB0aGlzLm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHNlbGYuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICB2YXIgSW9uaWNEZXZQdXNoID0gbmV3IHB1c2hfZGV2XzEuUHVzaERldlNlcnZpY2UoKTtcbiAgICAgICAgICAgICAgICBzZWxmLl9kZWJ1Z0NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fY2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgICAgICBJb25pY0RldlB1c2guaW5pdChzZWxmLCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tSZWdpc3RyYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLl90b2tlblJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbiA9IHNlbGYuX2dldFB1c2hQbHVnaW4oKS5pbml0KHNlbGYuX2NvbmZpZy5wbHVnaW5Db25maWcpO1xuICAgICAgICAgICAgICAgIHNlbGYuX3BsdWdpbi5vbigncmVnaXN0cmF0aW9uJywgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tSZWdpc3RyYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi50b2tlbiA9IG5ldyBwdXNoX3Rva2VuXzEuUHVzaFRva2VuKGRhdGEucmVnaXN0cmF0aW9uSWQpO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl90b2tlblJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmLl90b2tlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzZWxmLl9kZWJ1Z0NhbGxiYWNrUmVnaXN0cmF0aW9uKCk7XG4gICAgICAgICAgICAgICAgc2VsZi5fY2FsbGJhY2tSZWdpc3RyYXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGYuX3JlZ2lzdGVyZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEludmFsaWRhdGUgdGhlIGN1cnJlbnQgR0NNL0FQTlMgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IHRoZSB1bnJlZ2lzdGVyIHJlc3VsdFxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnVucmVnaXN0ZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IHByb21pc2VfMS5EZWZlcnJlZFByb21pc2UoKTtcbiAgICAgICAgdmFyIHBsYXRmb3JtID0gbnVsbDtcbiAgICAgICAgaWYgKGNvcmVfMS5Jb25pY1BsYXRmb3JtLmlzQW5kcm9pZERldmljZSgpKSB7XG4gICAgICAgICAgICBwbGF0Zm9ybSA9ICdhbmRyb2lkJztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5pc0lPU0RldmljZSgpKSB7XG4gICAgICAgICAgICBwbGF0Zm9ybSA9ICdpb3MnO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcGxhdGZvcm0pIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCgnQ291bGQgbm90IGRldGVjdCB0aGUgcGxhdGZvcm0sIGFyZSB5b3Ugb24gYSBkZXZpY2U/Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWxmLl9ibG9ja1VucmVnaXN0ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9wbHVnaW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4udW5yZWdpc3RlcihmdW5jdGlvbiAoKSB7IH0sIGZ1bmN0aW9uICgpIHsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZXcgcmVxdWVzdF8xLkFQSVJlcXVlc3Qoe1xuICAgICAgICAgICAgICAgICd1cmknOiBwdXNoQVBJRW5kcG9pbnRzLmludmFsaWRhdGVUb2tlbigpLFxuICAgICAgICAgICAgICAgICdtZXRob2QnOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgJ2pzb24nOiB7XG4gICAgICAgICAgICAgICAgICAgICdwbGF0Zm9ybSc6IHBsYXRmb3JtLFxuICAgICAgICAgICAgICAgICAgICAndG9rZW4nOiBzZWxmLmdldFN0b3JhZ2VUb2tlbigpLnRva2VuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tVbnJlZ2lzdGVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygndW5yZWdpc3RlcmVkIHB1c2ggdG9rZW46ICcgKyBzZWxmLmdldFN0b3JhZ2VUb2tlbigpLnRva2VuKTtcbiAgICAgICAgICAgICAgICBzZWxmLmNsZWFyU3RvcmFnZVRva2VuKCk7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYmxvY2tVbnJlZ2lzdGVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJ2FuIHVucmVnaXN0ZXIgb3BlcmF0aW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogQ29udmVuaWVuY2UgbWV0aG9kIHRvIGdyYWIgdGhlIHBheWxvYWQgb2JqZWN0IGZyb20gYSBub3RpZmljYXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UHVzaE5vdGlmaWNhdGlvbn0gbm90aWZpY2F0aW9uIFB1c2ggTm90aWZpY2F0aW9uIG9iamVjdFxuICAgICAqIEByZXR1cm4ge29iamVjdH0gUGF5bG9hZCBvYmplY3Qgb3IgYW4gZW1wdHkgb2JqZWN0XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuZ2V0UGF5bG9hZCA9IGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIG5vdGlmaWNhdGlvbi5wYXlsb2FkO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogU2V0IHRoZSByZWdpc3RyYXRpb24gY2FsbGJhY2tcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFJlZ2lzdHJhdGlvbiBjYWxsYmFjayBmdW5jdGlvblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IHRydWUgaWYgc2V0IGNvcnJlY3RseSwgb3RoZXJ3aXNlIGZhbHNlXG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuc2V0UmVnaXN0ZXJDYWxsYmFjayA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXRSZWdpc3RlckNhbGxiYWNrKCkgcmVxdWlyZXMgYSB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVnaXN0ZXJDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFNldCB0aGUgbm90aWZpY2F0aW9uIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBOb3RpZmljYXRpb24gY2FsbGJhY2sgZnVuY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHNldCBjb3JyZWN0bHksIG90aGVyd2lzZSBmYWxzZVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLnNldE5vdGlmaWNhdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMubG9nZ2VyLmluZm8oJ3NldE5vdGlmaWNhdGlvbkNhbGxiYWNrKCkgcmVxdWlyZXMgYSB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubm90aWZpY2F0aW9uQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGVycm9yIGNhbGxiYWNrXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBFcnJvciBjYWxsYmFjayBmdW5jdGlvblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IHRydWUgaWYgc2V0IGNvcnJlY3RseSwgb3RoZXJ3aXNlIGZhbHNlXG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuc2V0RXJyb3JDYWxsYmFjayA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ2dlci5pbmZvKCdzZXRFcnJvckNhbGxiYWNrKCkgcmVxdWlyZXMgYSB2YWxpZCBjYWxsYmFjayBmdW5jdGlvbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZXJyb3JDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLl9kZWJ1Z1JlZ2lzdHJhdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGRhdGEpIHtcbiAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgcHVzaF90b2tlbl8xLlB1c2hUb2tlbihkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmluZm8oJyhkZWJ1ZykgZGV2aWNlIHRva2VuIHJlZ2lzdGVyZWQ6ICcgKyBzZWxmLl90b2tlbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrO1xuICAgIH07XG4gICAgUHVzaC5wcm90b3R5cGUuX2RlYnVnTm90aWZpY2F0aW9uQ2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2sobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLl9wcm9jZXNzTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9IHB1c2hfbWVzc2FnZV8xLlB1c2hNZXNzYWdlLmZyb21QbHVnaW5KU09OKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5pbmZvKCcoZGVidWcpIG5vdGlmaWNhdGlvbiByZWNlaXZlZDogJyArIG1lc3NhZ2UpO1xuICAgICAgICAgICAgaWYgKCFzZWxmLm5vdGlmaWNhdGlvbkNhbGxiYWNrICYmIHNlbGYuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICBhbGVydChtZXNzYWdlLnRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLl9kZWJ1Z0Vycm9yQ2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2soZXJyKSB7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcignKGRlYnVnKSB1bmV4cGVjdGVkIGVycm9yIG9jY3VyZWQuJyk7XG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLl9yZWdpc3RlckNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGRhdGEpIHtcbiAgICAgICAgICAgIHNlbGYudG9rZW4gPSBuZXcgcHVzaF90b2tlbl8xLlB1c2hUb2tlbihkYXRhLnJlZ2lzdHJhdGlvbklkKTtcbiAgICAgICAgICAgIGlmIChzZWxmLnJlZ2lzdGVyQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5yZWdpc3RlckNhbGxiYWNrKHNlbGYuX3Rva2VuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICBQdXNoLnByb3RvdHlwZS5fbm90aWZpY2F0aW9uQ2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gY2FsbGJhY2sobm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgICBzZWxmLl9wcm9jZXNzTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9IHB1c2hfbWVzc2FnZV8xLlB1c2hNZXNzYWdlLmZyb21QbHVnaW5KU09OKG5vdGlmaWNhdGlvbik7XG4gICAgICAgICAgICBpZiAoc2VsZi5ub3RpZmljYXRpb25DYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLm5vdGlmaWNhdGlvbkNhbGxiYWNrKG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjYWxsYmFjaztcbiAgICB9O1xuICAgIFB1c2gucHJvdG90eXBlLl9lcnJvckNhbGxiYWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKGVycikge1xuICAgICAgICAgICAgaWYgKHNlbGYuZXJyb3JDYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLmVycm9yQ2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBSZWdpc3RlcnMgdGhlIGRlZmF1bHQgZGVidWcgY2FsbGJhY2tzIHdpdGggdGhlIFB1c2hQbHVnaW4gd2hlbiBkZWJ1ZyBpcyBlbmFibGVkXG4gICAgICogSW50ZXJuYWwgTWV0aG9kXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2gucHJvdG90eXBlLl9kZWJ1Z0NhbGxiYWNrUmVnaXN0cmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5fY29uZmlnLmRlYnVnKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ3JlZ2lzdHJhdGlvbicsIHRoaXMuX2RlYnVnUmVnaXN0cmF0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGx1Z2luLm9uKCdub3RpZmljYXRpb24nLCB0aGlzLl9kZWJ1Z05vdGlmaWNhdGlvbkNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignZXJyb3InLCB0aGlzLl9kZWJ1Z0Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX3JlZ2lzdGVyZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDp0b2tlbicsIHRoaXMuX2RlYnVnUmVnaXN0cmF0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6bm90aWZpY2F0aW9uJywgdGhpcy5fZGVidWdOb3RpZmljYXRpb25DYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDplcnJvcicsIHRoaXMuX2RlYnVnRXJyb3JDYWxsYmFjaygpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFJlZ2lzdGVycyB0aGUgdXNlciBzdXBwbGllZCBjYWxsYmFja3Mgd2l0aCB0aGUgUHVzaFBsdWdpblxuICAgICAqIEludGVybmFsIE1ldGhvZFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgUHVzaC5wcm90b3R5cGUuX2NhbGxiYWNrUmVnaXN0cmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMuYXBwLmRldlB1c2gpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbigncmVnaXN0cmF0aW9uJywgdGhpcy5fcmVnaXN0ZXJDYWxsYmFjaygpKTtcbiAgICAgICAgICAgIHRoaXMuX3BsdWdpbi5vbignbm90aWZpY2F0aW9uJywgdGhpcy5fbm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB0aGlzLl9wbHVnaW4ub24oJ2Vycm9yJywgdGhpcy5fZXJyb3JDYWxsYmFjaygpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5fcmVnaXN0ZXJlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6dG9rZW4nLCB0aGlzLl9yZWdpc3RlckNhbGxiYWNrKCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIub24oJ2lvbmljX3B1c2g6bm90aWZpY2F0aW9uJywgdGhpcy5fbm90aWZpY2F0aW9uQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5vbignaW9uaWNfcHVzaDplcnJvcicsIHRoaXMuX2Vycm9yQ2FsbGJhY2soKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIG1pc2MgZmVhdHVyZXMgYmFzZWQgb24gdGhlIGNvbnRlbnRzIG9mIGEgcHVzaCBub3RpZmljYXRpb25cbiAgICAgKiBJbnRlcm5hbCBNZXRob2RcbiAgICAgKlxuICAgICAqIEN1cnJlbnRseSBqdXN0IGRvZXMgdGhlIHBheWxvYWQgJHN0YXRlIHJlZGlyZWN0aW9uXG4gICAgICogQHBhcmFtIHtQdXNoTm90aWZpY2F0aW9ufSBub3RpZmljYXRpb24gUHVzaCBOb3RpZmljYXRpb24gb2JqZWN0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5fcHJvY2Vzc05vdGlmaWNhdGlvbiA9IGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgdGhpcy5fbm90aWZpY2F0aW9uID0gbm90aWZpY2F0aW9uO1xuICAgICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoJ2lvbmljX3B1c2g6cHJvY2Vzc05vdGlmaWNhdGlvbicsIG5vdGlmaWNhdGlvbik7XG4gICAgfTtcbiAgICAvKiBEZXByZWNhdGVkIGluIGZhdm9yIG9mIGBnZXRQdXNoUGx1Z2luYCAqL1xuICAgIFB1c2gucHJvdG90eXBlLl9nZXRQdXNoUGx1Z2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBQdXNoUGx1Z2luID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIFB1c2hQbHVnaW4gPSB3aW5kb3cuUHVzaE5vdGlmaWNhdGlvbjtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuaW5mbygnc29tZXRoaW5nIHdlbnQgd3JvbmcgbG9va2luZyBmb3IgdGhlIFB1c2hOb3RpZmljYXRpb24gcGx1Z2luJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWxmLmFwcC5kZXZQdXNoICYmICFQdXNoUGx1Z2luICYmIChjb3JlXzEuSW9uaWNQbGF0Zm9ybS5pc0lPU0RldmljZSgpIHx8IGNvcmVfMS5Jb25pY1BsYXRmb3JtLmlzQW5kcm9pZERldmljZSgpKSkge1xuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoJ1B1c2hOb3RpZmljYXRpb24gcGx1Z2luIGlzIHJlcXVpcmVkLiBIYXZlIHlvdSBydW4gYGlvbmljIHBsdWdpbiBhZGQgcGhvbmVnYXAtcGx1Z2luLXB1c2hgID8nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUHVzaFBsdWdpbjtcbiAgICB9O1xuICAgIC8qKlxuICAgICAqIEZldGNoIHRoZSBwaG9uZWdhcC1wdXNoLXBsdWdpbiBpbnRlcmZhY2VcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1B1c2hOb3RpZmljYXRpb259IFB1c2hOb3RpZmljYXRpb24gaW5zdGFuY2VcbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5nZXRQdXNoUGx1Z2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGx1Z2luO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogRmlyZSBhIGNhbGxiYWNrIHdoZW4gUHVzaCBpcyByZWFkeS4gVGhpcyB3aWxsIGZpcmUgaW1tZWRpYXRlbHkgaWZcbiAgICAgKiB0aGUgc2VydmljZSBoYXMgYWxyZWFkeSBpbml0aWFsaXplZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb2ZmXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBQdXNoLnByb3RvdHlwZS5vblJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKHRoaXMuX2lzUmVhZHkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHNlbGYpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpyZWFkeScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhzZWxmKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gUHVzaDtcbn0oKSk7XG5leHBvcnRzLlB1c2ggPSBQdXNoO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBfX2V4cG9ydChtKSB7XG4gICAgZm9yICh2YXIgcCBpbiBtKSBpZiAoIWV4cG9ydHMuaGFzT3duUHJvcGVydHkocCkpIGV4cG9ydHNbcF0gPSBtW3BdO1xufVxuX19leHBvcnQocmVxdWlyZSgnLi91dGlsJykpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5mdW5jdGlvbiBkZWVwRXh0ZW5kKCkge1xuICAgIHZhciBvdXQgPSBbXTtcbiAgICBmb3IgKHZhciBfaSA9IDA7IF9pIDwgYXJndW1lbnRzLmxlbmd0aDsgX2krKykge1xuICAgICAgICBvdXRbX2kgLSAwXSA9IGFyZ3VtZW50c1tfaV07XG4gICAgfVxuICAgIG91dCA9IG91dFswXSB8fCB7fTtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgb2JqID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBpZiAoIW9iaikge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0W2tleV0gPSBkZWVwRXh0ZW5kKG91dFtrZXldLCBvYmpba2V5XSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvdXRba2V5XSA9IG9ialtrZXldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufVxuZXhwb3J0cy5kZWVwRXh0ZW5kID0gZGVlcEV4dGVuZDtcbmZ1bmN0aW9uIGdlbmVyYXRlVVVJRCgpIHtcbiAgICByZXR1cm4gJ3h4eHh4eHh4LXh4eHgtNHh4eC15eHh4LXh4eHh4eHh4eHh4eCcucmVwbGFjZSgvW3h5XS9nLCBmdW5jdGlvbiAoYykge1xuICAgICAgICB2YXIgciA9IE1hdGgucmFuZG9tKCkgKiAxNiB8IDAsIHYgPSBjID09PSAneCcgPyByIDogKHIgJiAweDMgfCAweDgpO1xuICAgICAgICByZXR1cm4gdi50b1N0cmluZygxNik7XG4gICAgfSk7XG59XG5leHBvcnRzLmdlbmVyYXRlVVVJRCA9IGdlbmVyYXRlVVVJRDtcbiIsIlxyXG4vKipcclxuICogRXhwb3NlIGBFbWl0dGVyYC5cclxuICovXHJcblxyXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICBtb2R1bGUuZXhwb3J0cyA9IEVtaXR0ZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbml0aWFsaXplIGEgbmV3IGBFbWl0dGVyYC5cclxuICpcclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5mdW5jdGlvbiBFbWl0dGVyKG9iaikge1xyXG4gIGlmIChvYmopIHJldHVybiBtaXhpbihvYmopO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIE1peGluIHRoZSBlbWl0dGVyIHByb3BlcnRpZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcclxuICogQHJldHVybiB7T2JqZWN0fVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5mdW5jdGlvbiBtaXhpbihvYmopIHtcclxuICBmb3IgKHZhciBrZXkgaW4gRW1pdHRlci5wcm90b3R5cGUpIHtcclxuICAgIG9ialtrZXldID0gRW1pdHRlci5wcm90b3R5cGVba2V5XTtcclxuICB9XHJcbiAgcmV0dXJuIG9iajtcclxufVxyXG5cclxuLyoqXHJcbiAqIExpc3RlbiBvbiB0aGUgZ2l2ZW4gYGV2ZW50YCB3aXRoIGBmbmAuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxyXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLm9uID1cclxuRW1pdHRlci5wcm90b3R5cGUuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XHJcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xyXG4gICh0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSB8fCBbXSlcclxuICAgIC5wdXNoKGZuKTtcclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBBZGRzIGFuIGBldmVudGAgbGlzdGVuZXIgdGhhdCB3aWxsIGJlIGludm9rZWQgYSBzaW5nbGVcclxuICogdGltZSB0aGVuIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXHJcbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XHJcbiAqIEBhcGkgcHVibGljXHJcbiAqL1xyXG5cclxuRW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XHJcbiAgZnVuY3Rpb24gb24oKSB7XHJcbiAgICB0aGlzLm9mZihldmVudCwgb24pO1xyXG4gICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuICB9XHJcblxyXG4gIG9uLmZuID0gZm47XHJcbiAgdGhpcy5vbihldmVudCwgb24pO1xyXG4gIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbW92ZSB0aGUgZ2l2ZW4gY2FsbGJhY2sgZm9yIGBldmVudGAgb3IgYWxsXHJcbiAqIHJlZ2lzdGVyZWQgY2FsbGJhY2tzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cclxuICogQHJldHVybiB7RW1pdHRlcn1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5vZmYgPVxyXG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9XHJcbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9XHJcbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbihldmVudCwgZm4pe1xyXG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcclxuXHJcbiAgLy8gYWxsXHJcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xyXG4gICAgdGhpcy5fY2FsbGJhY2tzID0ge307XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIC8vIHNwZWNpZmljIGV2ZW50XHJcbiAgdmFyIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XHJcbiAgaWYgKCFjYWxsYmFja3MpIHJldHVybiB0aGlzO1xyXG5cclxuICAvLyByZW1vdmUgYWxsIGhhbmRsZXJzXHJcbiAgaWYgKDEgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xyXG4gICAgZGVsZXRlIHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIC8vIHJlbW92ZSBzcGVjaWZpYyBoYW5kbGVyXHJcbiAgdmFyIGNiO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjYiA9IGNhbGxiYWNrc1tpXTtcclxuICAgIGlmIChjYiA9PT0gZm4gfHwgY2IuZm4gPT09IGZuKSB7XHJcbiAgICAgIGNhbGxiYWNrcy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFbWl0IGBldmVudGAgd2l0aCB0aGUgZ2l2ZW4gYXJncy5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEBwYXJhbSB7TWl4ZWR9IC4uLlxyXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbihldmVudCl7XHJcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xyXG4gIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXHJcbiAgICAsIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XHJcblxyXG4gIGlmIChjYWxsYmFja3MpIHtcclxuICAgIGNhbGxiYWNrcyA9IGNhbGxiYWNrcy5zbGljZSgwKTtcclxuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBjYWxsYmFja3MubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcclxuICAgICAgY2FsbGJhY2tzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJuIGFycmF5IG9mIGNhbGxiYWNrcyBmb3IgYGV2ZW50YC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XHJcbiAqIEByZXR1cm4ge0FycmF5fVxyXG4gKiBAYXBpIHB1YmxpY1xyXG4gKi9cclxuXHJcbkVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcclxuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XHJcbiAgcmV0dXJuIHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gfHwgW107XHJcbn07XHJcblxyXG4vKipcclxuICogQ2hlY2sgaWYgdGhpcyBlbWl0dGVyIGhhcyBgZXZlbnRgIGhhbmRsZXJzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcclxuICogQHJldHVybiB7Qm9vbGVhbn1cclxuICogQGFwaSBwdWJsaWNcclxuICovXHJcblxyXG5FbWl0dGVyLnByb3RvdHlwZS5oYXNMaXN0ZW5lcnMgPSBmdW5jdGlvbihldmVudCl7XHJcbiAgcmV0dXJuICEhIHRoaXMubGlzdGVuZXJzKGV2ZW50KS5sZW5ndGg7XHJcbn07XHJcbiIsIi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9qYWtlYXJjaGliYWxkL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDMuMi4xXG4gKi9cblxuKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgKHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNNYXliZVRoZW5hYmxlKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheSA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXk7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPSAwO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkdmVydHhOZXh0O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm47XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAgPSBmdW5jdGlvbiBhc2FwKGNhbGxiYWNrLCBhcmcpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuXSA9IGNhbGxiYWNrO1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2xpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gKyAxXSA9IGFyZztcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gKz0gMjtcbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuID09PSAyKSB7XG4gICAgICAgIC8vIElmIGxlbiBpcyAyLCB0aGF0IG1lYW5zIHRoYXQgd2UgbmVlZCB0byBzY2hlZHVsZSBhbiBhc3luYyBmbHVzaC5cbiAgICAgICAgLy8gSWYgYWRkaXRpb25hbCBjYWxsYmFja3MgYXJlIHF1ZXVlZCBiZWZvcmUgdGhlIHF1ZXVlIGlzIGZsdXNoZWQsIHRoZXlcbiAgICAgICAgLy8gd2lsbCBiZSBwcm9jZXNzZWQgYnkgdGhpcyBmbHVzaCB0aGF0IHdlIGFyZSBzY2hlZHVsaW5nLlxuICAgICAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2goKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRTY2hlZHVsZXIoc2NoZWR1bGVGbikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuID0gc2NoZWR1bGVGbjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0QXNhcChhc2FwRm4pIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwID0gYXNhcEZuO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB3aW5kb3cgOiB1bmRlZmluZWQ7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgfHwge307XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRCcm93c2VyTXV0YXRpb25PYnNlcnZlciA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsLk11dGF0aW9uT2JzZXJ2ZXIgfHwgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwuV2ViS2l0TXV0YXRpb25PYnNlcnZlcjtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGlzTm9kZSA9IHR5cGVvZiBzZWxmID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYge30udG9TdHJpbmcuY2FsbChwcm9jZXNzKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuXG4gICAgLy8gdGVzdCBmb3Igd2ViIHdvcmtlciBidXQgbm90IGluIElFMTBcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGlzV29ya2VyID0gdHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgdHlwZW9mIGltcG9ydFNjcmlwdHMgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09ICd1bmRlZmluZWQnO1xuXG4gICAgLy8gbm9kZVxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpIHtcbiAgICAgIC8vIG5vZGUgdmVyc2lvbiAwLjEwLnggZGlzcGxheXMgYSBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gbmV4dFRpY2sgaXMgdXNlZCByZWN1cnNpdmVseVxuICAgICAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jdWpvanMvd2hlbi9pc3N1ZXMvNDEwIGZvciBkZXRhaWxzXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2sobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gdmVydHhcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dChsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpIHtcbiAgICAgIHZhciBpdGVyYXRpb25zID0gMDtcbiAgICAgIHZhciBvYnNlcnZlciA9IG5ldyBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbm9kZS5kYXRhID0gKGl0ZXJhdGlvbnMgPSArK2l0ZXJhdGlvbnMgJSAyKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gd2ViIHdvcmtlclxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpIHtcbiAgICAgIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaDtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZXRUaW1lb3V0KGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCwgMSk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuOyBpKz0yKSB7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpXTtcbiAgICAgICAgdmFyIGFyZyA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpKzFdO1xuXG4gICAgICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2ldID0gdW5kZWZpbmVkO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaSsxXSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGF0dGVtcHRWZXJ0eCgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhciByID0gcmVxdWlyZTtcbiAgICAgICAgdmFyIHZlcnR4ID0gcigndmVydHgnKTtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dCA9IHZlcnR4LnJ1bk9uTG9vcCB8fCB2ZXJ0eC5ydW5PbkNvbnRleHQ7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaDtcbiAgICAvLyBEZWNpZGUgd2hhdCBhc3luYyBtZXRob2QgdG8gdXNlIHRvIHRyaWdnZXJpbmcgcHJvY2Vzc2luZyBvZiBxdWV1ZWQgY2FsbGJhY2tzOlxuICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNXb3JrZXIpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhdHRlbXB0VmVydHgoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdGhlbiQkdGhlbihvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgdmFyIHBhcmVudCA9IHRoaXM7XG5cbiAgICAgIHZhciBjaGlsZCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoY2hpbGRbbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRtYWtlUHJvbWlzZShjaGlsZCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBzdGF0ZSA9IHBhcmVudC5fc3RhdGU7XG5cbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmd1bWVudHNbc3RhdGUgLSAxXTtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAoZnVuY3Rpb24oKXtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCBwYXJlbnQuX3Jlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNoaWxkO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHRoZW4kJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkdGhlbiQkdGhlbjtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRyZXNvbHZlKG9iamVjdCkge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIGlmIChvYmplY3QgJiYgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0LmNvbnN0cnVjdG9yID09PSBDb25zdHJ1Y3Rvcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgb2JqZWN0KTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJHJlc29sdmU7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSUQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMTYpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCgpIHt9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORyAgID0gdm9pZCAwO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQgPSAxO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCAgPSAyO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SID0gbmV3IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCk7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzZWxmRnVsZmlsbG1lbnQoKSB7XG4gICAgICByZXR1cm4gbmV3IFR5cGVFcnJvcihcIllvdSBjYW5ub3QgcmVzb2x2ZSBhIHByb21pc2Ugd2l0aCBpdHNlbGZcIik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkY2Fubm90UmV0dXJuT3duKCkge1xuICAgICAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoJ0EgcHJvbWlzZXMgY2FsbGJhY2sgY2Fubm90IHJldHVybiB0aGF0IHNhbWUgcHJvbWlzZS4nKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKHByb21pc2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBwcm9taXNlLnRoZW47XG4gICAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SLmVycm9yID0gZXJyb3I7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlUaGVuKHRoZW4sIHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHRoZW4uY2FsbCh2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICByZXR1cm4gZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUsIHRoZW4pIHtcbiAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChmdW5jdGlvbihwcm9taXNlKSB7XG4gICAgICAgIHZhciBzZWFsZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGVycm9yID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5VGhlbih0aGVuLCB0aGVuYWJsZSwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBpZiAoc2VhbGVkKSB7IHJldHVybjsgfVxuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICAgICAgaWYgKHRoZW5hYmxlICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuXG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0sICdTZXR0bGU6ICcgKyAocHJvbWlzZS5fbGFiZWwgfHwgJyB1bmtub3duIHByb21pc2UnKSk7XG5cbiAgICAgICAgaWYgKCFzZWFsZWQgJiYgZXJyb3IpIHtcbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH0sIHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlKSB7XG4gICAgICBpZiAodGhlbmFibGUuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgICAgIH0gZWxzZSBpZiAodGhlbmFibGUuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUodGhlbmFibGUsIHVuZGVmaW5lZCwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbikge1xuICAgICAgaWYgKG1heWJlVGhlbmFibGUuY29uc3RydWN0b3IgPT09IHByb21pc2UuY29uc3RydWN0b3IgJiZcbiAgICAgICAgICB0aGVuID09PSBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCAmJlxuICAgICAgICAgIGNvbnN0cnVjdG9yLnJlc29sdmUgPT09IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodGhlbiA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKHRoZW4pKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKSB7XG4gICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHNlbGZGdWxmaWxsbWVudCgpKTtcbiAgICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRvYmplY3RPckZ1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIHZhbHVlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKHZhbHVlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgICAgIGlmIChwcm9taXNlLl9vbmVycm9yKSB7XG4gICAgICAgIHByb21pc2UuX29uZXJyb3IocHJvbWlzZS5fcmVzdWx0KTtcbiAgICAgIH1cblxuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaChwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKSB7XG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHsgcmV0dXJuOyB9XG5cbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHZhbHVlO1xuICAgICAgcHJvbWlzZS5fc3RhdGUgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQ7XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggIT09IDApIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaCwgcHJvbWlzZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbikge1xuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7IHJldHVybjsgfVxuICAgICAgcHJvbWlzZS5fc3RhdGUgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRDtcbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHJlYXNvbjtcblxuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaFJlamVjdGlvbiwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gICAgICB2YXIgc3Vic2NyaWJlcnMgPSBwYXJlbnQuX3N1YnNjcmliZXJzO1xuICAgICAgdmFyIGxlbmd0aCA9IHN1YnNjcmliZXJzLmxlbmd0aDtcblxuICAgICAgcGFyZW50Ll9vbmVycm9yID0gbnVsbDtcblxuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoXSA9IGNoaWxkO1xuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoICsgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEXSA9IG9uRnVsZmlsbG1lbnQ7XG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGggKyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRF0gID0gb25SZWplY3Rpb247XG5cbiAgICAgIGlmIChsZW5ndGggPT09IDAgJiYgcGFyZW50Ll9zdGF0ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoLCBwYXJlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSkge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcHJvbWlzZS5fc3Vic2NyaWJlcnM7XG4gICAgICB2YXIgc2V0dGxlZCA9IHByb21pc2UuX3N0YXRlO1xuXG4gICAgICBpZiAoc3Vic2NyaWJlcnMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG4gICAgICB2YXIgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwgPSBwcm9taXNlLl9yZXN1bHQ7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3Vic2NyaWJlcnMubGVuZ3RoOyBpICs9IDMpIHtcbiAgICAgICAgY2hpbGQgPSBzdWJzY3JpYmVyc1tpXTtcbiAgICAgICAgY2FsbGJhY2sgPSBzdWJzY3JpYmVyc1tpICsgc2V0dGxlZF07XG5cbiAgICAgICAgaWYgKGNoaWxkKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoID0gMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpIHtcbiAgICAgIHRoaXMuZXJyb3IgPSBudWxsO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IgPSBuZXcgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKTtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhkZXRhaWwpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUi5lcnJvciA9IGU7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1I7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgcHJvbWlzZSwgY2FsbGJhY2ssIGRldGFpbCkge1xuICAgICAgdmFyIGhhc0NhbGxiYWNrID0gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKGNhbGxiYWNrKSxcbiAgICAgICAgICB2YWx1ZSwgZXJyb3IsIHN1Y2NlZWRlZCwgZmFpbGVkO1xuXG4gICAgICBpZiAoaGFzQ2FsbGJhY2spIHtcbiAgICAgICAgdmFsdWUgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKTtcblxuICAgICAgICBpZiAodmFsdWUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUikge1xuICAgICAgICAgIGZhaWxlZCA9IHRydWU7XG4gICAgICAgICAgZXJyb3IgPSB2YWx1ZS5lcnJvcjtcbiAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRjYW5ub3RSZXR1cm5Pd24oKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlID0gZGV0YWlsO1xuICAgICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmIChoYXNDYWxsYmFjayAmJiBzdWNjZWVkZWQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGZhaWxlZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UocHJvbWlzZSwgcmVzb2x2ZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmVyKGZ1bmN0aW9uIHJlc29sdmVQcm9taXNlKHZhbHVlKXtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gcmVqZWN0UHJvbWlzZShyZWFzb24pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpZCA9IDA7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbmV4dElkKCkge1xuICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGlkKys7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbWFrZVByb21pc2UocHJvbWlzZSkge1xuICAgICAgcHJvbWlzZVtsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGlkKys7XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgICAgIHByb21pc2UuX3N1YnNjcmliZXJzID0gW107XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRhbGwoZW50cmllcykge1xuICAgICAgcmV0dXJuIG5ldyBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkZGVmYXVsdCh0aGlzLCBlbnRyaWVzKS5wcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRhbGw7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkcmFjZShlbnRyaWVzKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICAgICAgaWYgKCFsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoZW50cmllcykpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICByZWplY3QobmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhbiBhcnJheSB0byByYWNlLicpKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgIHZhciBsZW5ndGggPSBlbnRyaWVzLmxlbmd0aDtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBDb25zdHJ1Y3Rvci5yZXNvbHZlKGVudHJpZXNbaV0pLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJHJhY2U7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRyZWplY3QocmVhc29uKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkcmVqZWN0O1xuXG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYSByZXNvbHZlciBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIHByb21pc2UgY29uc3RydWN0b3InKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNOZXcoKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnUHJvbWlzZSc6IFBsZWFzZSB1c2UgdGhlICduZXcnIG9wZXJhdG9yLCB0aGlzIG9iamVjdCBjb25zdHJ1Y3RvciBjYW5ub3QgYmUgY2FsbGVkIGFzIGEgZnVuY3Rpb24uXCIpO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlO1xuICAgIC8qKlxuICAgICAgUHJvbWlzZSBvYmplY3RzIHJlcHJlc2VudCB0aGUgZXZlbnR1YWwgcmVzdWx0IG9mIGFuIGFzeW5jaHJvbm91cyBvcGVyYXRpb24uIFRoZVxuICAgICAgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCwgd2hpY2hcbiAgICAgIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlIHJlYXNvblxuICAgICAgd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIFRlcm1pbm9sb2d5XG4gICAgICAtLS0tLS0tLS0tLVxuXG4gICAgICAtIGBwcm9taXNlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gd2l0aCBhIGB0aGVuYCBtZXRob2Qgd2hvc2UgYmVoYXZpb3IgY29uZm9ybXMgdG8gdGhpcyBzcGVjaWZpY2F0aW9uLlxuICAgICAgLSBgdGhlbmFibGVgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgYSBgdGhlbmAgbWV0aG9kLlxuICAgICAgLSBgdmFsdWVgIGlzIGFueSBsZWdhbCBKYXZhU2NyaXB0IHZhbHVlIChpbmNsdWRpbmcgdW5kZWZpbmVkLCBhIHRoZW5hYmxlLCBvciBhIHByb21pc2UpLlxuICAgICAgLSBgZXhjZXB0aW9uYCBpcyBhIHZhbHVlIHRoYXQgaXMgdGhyb3duIHVzaW5nIHRoZSB0aHJvdyBzdGF0ZW1lbnQuXG4gICAgICAtIGByZWFzb25gIGlzIGEgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2h5IGEgcHJvbWlzZSB3YXMgcmVqZWN0ZWQuXG4gICAgICAtIGBzZXR0bGVkYCB0aGUgZmluYWwgcmVzdGluZyBzdGF0ZSBvZiBhIHByb21pc2UsIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cblxuICAgICAgQSBwcm9taXNlIGNhbiBiZSBpbiBvbmUgb2YgdGhyZWUgc3RhdGVzOiBwZW5kaW5nLCBmdWxmaWxsZWQsIG9yIHJlamVjdGVkLlxuXG4gICAgICBQcm9taXNlcyB0aGF0IGFyZSBmdWxmaWxsZWQgaGF2ZSBhIGZ1bGZpbGxtZW50IHZhbHVlIGFuZCBhcmUgaW4gdGhlIGZ1bGZpbGxlZFxuICAgICAgc3RhdGUuICBQcm9taXNlcyB0aGF0IGFyZSByZWplY3RlZCBoYXZlIGEgcmVqZWN0aW9uIHJlYXNvbiBhbmQgYXJlIGluIHRoZVxuICAgICAgcmVqZWN0ZWQgc3RhdGUuICBBIGZ1bGZpbGxtZW50IHZhbHVlIGlzIG5ldmVyIGEgdGhlbmFibGUuXG5cbiAgICAgIFByb21pc2VzIGNhbiBhbHNvIGJlIHNhaWQgdG8gKnJlc29sdmUqIGEgdmFsdWUuICBJZiB0aGlzIHZhbHVlIGlzIGFsc28gYVxuICAgICAgcHJvbWlzZSwgdGhlbiB0aGUgb3JpZ2luYWwgcHJvbWlzZSdzIHNldHRsZWQgc3RhdGUgd2lsbCBtYXRjaCB0aGUgdmFsdWUnc1xuICAgICAgc2V0dGxlZCBzdGF0ZS4gIFNvIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aWxsXG4gICAgICBpdHNlbGYgcmVqZWN0LCBhbmQgYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCBmdWxmaWxscyB3aWxsXG4gICAgICBpdHNlbGYgZnVsZmlsbC5cblxuXG4gICAgICBCYXNpYyBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBgYGBqc1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgLy8gb24gc3VjY2Vzc1xuICAgICAgICByZXNvbHZlKHZhbHVlKTtcblxuICAgICAgICAvLyBvbiBmYWlsdXJlXG4gICAgICAgIHJlamVjdChyZWFzb24pO1xuICAgICAgfSk7XG5cbiAgICAgIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAvLyBvbiBmdWxmaWxsbWVudFxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIC8vIG9uIHJlamVjdGlvblxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgVXNhZ2U6XG4gICAgICAtLS0tLS0tLS0tLS0tLS1cblxuICAgICAgUHJvbWlzZXMgc2hpbmUgd2hlbiBhYnN0cmFjdGluZyBhd2F5IGFzeW5jaHJvbm91cyBpbnRlcmFjdGlvbnMgc3VjaCBhc1xuICAgICAgYFhNTEh0dHBSZXF1ZXN0YHMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmdW5jdGlvbiBnZXRKU09OKHVybCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICAgICAgICB4aHIub3BlbignR0VUJywgdXJsKTtcbiAgICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gaGFuZGxlcjtcbiAgICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgICAgICAgIHhoci5zZW5kKCk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gdGhpcy5ET05FKSB7XG4gICAgICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdnZXRKU09OOiBgJyArIHVybCArICdgIGZhaWxlZCB3aXRoIHN0YXR1czogWycgKyB0aGlzLnN0YXR1cyArICddJykpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGdldEpTT04oJy9wb3N0cy5qc29uJykudGhlbihmdW5jdGlvbihqc29uKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBVbmxpa2UgY2FsbGJhY2tzLCBwcm9taXNlcyBhcmUgZ3JlYXQgY29tcG9zYWJsZSBwcmltaXRpdmVzLlxuXG4gICAgICBgYGBqc1xuICAgICAgUHJvbWlzZS5hbGwoW1xuICAgICAgICBnZXRKU09OKCcvcG9zdHMnKSxcbiAgICAgICAgZ2V0SlNPTignL2NvbW1lbnRzJylcbiAgICAgIF0pLnRoZW4oZnVuY3Rpb24odmFsdWVzKXtcbiAgICAgICAgdmFsdWVzWzBdIC8vID0+IHBvc3RzSlNPTlxuICAgICAgICB2YWx1ZXNbMV0gLy8gPT4gY29tbWVudHNKU09OXG5cbiAgICAgICAgcmV0dXJuIHZhbHVlcztcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBjbGFzcyBQcm9taXNlXG4gICAgICBAcGFyYW0ge2Z1bmN0aW9ufSByZXNvbHZlclxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQGNvbnN0cnVjdG9yXG4gICAgKi9cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZShyZXNvbHZlcikge1xuICAgICAgdGhpc1tsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5leHRJZCgpO1xuICAgICAgdGhpcy5fcmVzdWx0ID0gdGhpcy5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9zdWJzY3JpYmVycyA9IFtdO1xuXG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCAhPT0gcmVzb2x2ZXIpIHtcbiAgICAgICAgdHlwZW9mIHJlc29sdmVyICE9PSAnZnVuY3Rpb24nICYmIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc1Jlc29sdmVyKCk7XG4gICAgICAgIHRoaXMgaW5zdGFuY2VvZiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZSA/IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHRoaXMsIHJlc29sdmVyKSA6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLmFsbCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yYWNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZXNvbHZlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZWplY3QgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldFNjaGVkdWxlciA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRTY2hlZHVsZXI7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldEFzYXAgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0QXNhcDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fYXNhcCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwO1xuXG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucHJvdG90eXBlID0ge1xuICAgICAgY29uc3RydWN0b3I6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLFxuXG4gICAgLyoqXG4gICAgICBUaGUgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCxcbiAgICAgIHdoaWNoIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlXG4gICAgICByZWFzb24gd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcil7XG4gICAgICAgIC8vIHVzZXIgaXMgYXZhaWxhYmxlXG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyB1c2VyIGlzIHVuYXZhaWxhYmxlLCBhbmQgeW91IGFyZSBnaXZlbiB0aGUgcmVhc29uIHdoeVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQ2hhaW5pbmdcbiAgICAgIC0tLS0tLS0tXG5cbiAgICAgIFRoZSByZXR1cm4gdmFsdWUgb2YgYHRoZW5gIGlzIGl0c2VsZiBhIHByb21pc2UuICBUaGlzIHNlY29uZCwgJ2Rvd25zdHJlYW0nXG4gICAgICBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZmlyc3QgcHJvbWlzZSdzIGZ1bGZpbGxtZW50XG4gICAgICBvciByZWplY3Rpb24gaGFuZGxlciwgb3IgcmVqZWN0ZWQgaWYgdGhlIGhhbmRsZXIgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gdXNlci5uYW1lO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICByZXR1cm4gJ2RlZmF1bHQgbmFtZSc7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh1c2VyTmFtZSkge1xuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHVzZXJOYW1lYCB3aWxsIGJlIHRoZSB1c2VyJ3MgbmFtZSwgb3RoZXJ3aXNlIGl0XG4gICAgICAgIC8vIHdpbGwgYmUgYCdkZWZhdWx0IG5hbWUnYFxuICAgICAgfSk7XG5cbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jyk7XG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBpZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHJlYXNvbmAgd2lsbCBiZSAnRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknLlxuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIHJlamVjdGVkLCBgcmVhc29uYCB3aWxsIGJlICdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jy5cbiAgICAgIH0pO1xuICAgICAgYGBgXG4gICAgICBJZiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIGRvZXMgbm90IHNwZWNpZnkgYSByZWplY3Rpb24gaGFuZGxlciwgcmVqZWN0aW9uIHJlYXNvbnMgd2lsbCBiZSBwcm9wYWdhdGVkIGZ1cnRoZXIgZG93bnN0cmVhbS5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGVkYWdvZ2ljYWxFeGNlcHRpb24oJ1Vwc3RyZWFtIGVycm9yJyk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIFRoZSBgUGVkZ2Fnb2NpYWxFeGNlcHRpb25gIGlzIHByb3BhZ2F0ZWQgYWxsIHRoZSB3YXkgZG93biB0byBoZXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBc3NpbWlsYXRpb25cbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBTb21ldGltZXMgdGhlIHZhbHVlIHlvdSB3YW50IHRvIHByb3BhZ2F0ZSB0byBhIGRvd25zdHJlYW0gcHJvbWlzZSBjYW4gb25seSBiZVxuICAgICAgcmV0cmlldmVkIGFzeW5jaHJvbm91c2x5LiBUaGlzIGNhbiBiZSBhY2hpZXZlZCBieSByZXR1cm5pbmcgYSBwcm9taXNlIGluIHRoZVxuICAgICAgZnVsZmlsbG1lbnQgb3IgcmVqZWN0aW9uIGhhbmRsZXIuIFRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCB0aGVuIGJlIHBlbmRpbmdcbiAgICAgIHVudGlsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlzIHNldHRsZWQuIFRoaXMgaXMgY2FsbGVkICphc3NpbWlsYXRpb24qLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIFRoZSB1c2VyJ3MgY29tbWVudHMgYXJlIG5vdyBhdmFpbGFibGVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIElmIHRoZSBhc3NpbWxpYXRlZCBwcm9taXNlIHJlamVjdHMsIHRoZW4gdGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIGFsc28gcmVqZWN0LlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgZnVsZmlsbHMsIHdlJ2xsIGhhdmUgdGhlIHZhbHVlIGhlcmVcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCByZWplY3RzLCB3ZSdsbCBoYXZlIHRoZSByZWFzb24gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgU2ltcGxlIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIHJlc3VsdDtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzdWx0ID0gZmluZFJlc3VsdCgpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kUmVzdWx0KGZ1bmN0aW9uKHJlc3VsdCwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZFJlc3VsdCgpLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgRXhhbXBsZVxuICAgICAgLS0tLS0tLS0tLS0tLS1cblxuICAgICAgU3luY2hyb25vdXMgRXhhbXBsZVxuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICB2YXIgYXV0aG9yLCBib29rcztcblxuICAgICAgdHJ5IHtcbiAgICAgICAgYXV0aG9yID0gZmluZEF1dGhvcigpO1xuICAgICAgICBib29rcyAgPSBmaW5kQm9va3NCeUF1dGhvcihhdXRob3IpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG5cbiAgICAgIGZ1bmN0aW9uIGZvdW5kQm9va3MoYm9va3MpIHtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBmYWlsdXJlKHJlYXNvbikge1xuXG4gICAgICB9XG5cbiAgICAgIGZpbmRBdXRob3IoZnVuY3Rpb24oYXV0aG9yLCBlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZmluZEJvb29rc0J5QXV0aG9yKGF1dGhvciwgZnVuY3Rpb24oYm9va3MsIGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBmb3VuZEJvb2tzKGJvb2tzKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgZmFpbHVyZShyZWFzb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZEF1dGhvcigpLlxuICAgICAgICB0aGVuKGZpbmRCb29rc0J5QXV0aG9yKS5cbiAgICAgICAgdGhlbihmdW5jdGlvbihib29rcyl7XG4gICAgICAgICAgLy8gZm91bmQgYm9va3NcbiAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAbWV0aG9kIHRoZW5cbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uRnVsZmlsbGVkXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICB0aGVuOiBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCxcblxuICAgIC8qKlxuICAgICAgYGNhdGNoYCBpcyBzaW1wbHkgc3VnYXIgZm9yIGB0aGVuKHVuZGVmaW5lZCwgb25SZWplY3Rpb24pYCB3aGljaCBtYWtlcyBpdCB0aGUgc2FtZVxuICAgICAgYXMgdGhlIGNhdGNoIGJsb2NrIG9mIGEgdHJ5L2NhdGNoIHN0YXRlbWVudC5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGZpbmRBdXRob3IoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZG4ndCBmaW5kIHRoYXQgYXV0aG9yJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIHN5bmNocm9ub3VzXG4gICAgICB0cnkge1xuICAgICAgICBmaW5kQXV0aG9yKCk7XG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfVxuXG4gICAgICAvLyBhc3luYyB3aXRoIHByb21pc2VzXG4gICAgICBmaW5kQXV0aG9yKCkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBtZXRob2QgY2F0Y2hcbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0aW9uXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICAnY2F0Y2gnOiBmdW5jdGlvbihvblJlamVjdGlvbikge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yKENvbnN0cnVjdG9yLCBpbnB1dCkge1xuICAgICAgdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICAgICAgdGhpcy5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoIXRoaXMucHJvbWlzZVtsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRtYWtlUHJvbWlzZSh0aGlzLnByb21pc2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0FycmF5KGlucHV0KSkge1xuICAgICAgICB0aGlzLl9pbnB1dCAgICAgPSBpbnB1dDtcbiAgICAgICAgdGhpcy5sZW5ndGggICAgID0gaW5wdXQubGVuZ3RoO1xuICAgICAgICB0aGlzLl9yZW1haW5pbmcgPSBpbnB1dC5sZW5ndGg7XG5cbiAgICAgICAgdGhpcy5fcmVzdWx0ID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcblxuICAgICAgICBpZiAodGhpcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmxlbmd0aCA9IHRoaXMubGVuZ3RoIHx8IDA7XG4gICAgICAgICAgdGhpcy5fZW51bWVyYXRlKCk7XG4gICAgICAgICAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QodGhpcy5wcm9taXNlLCBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkdmFsaWRhdGlvbkVycm9yKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCR2YWxpZGF0aW9uRXJyb3IoKSB7XG4gICAgICByZXR1cm4gbmV3IEVycm9yKCdBcnJheSBNZXRob2RzIG11c3QgYmUgcHJvdmlkZWQgYW4gQXJyYXknKTtcbiAgICB9XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VudW1lcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGxlbmd0aCAgPSB0aGlzLmxlbmd0aDtcbiAgICAgIHZhciBpbnB1dCAgID0gdGhpcy5faW5wdXQ7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyB0aGlzLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORyAmJiBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy5fZWFjaEVudHJ5KGlucHV0W2ldLCBpKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9lYWNoRW50cnkgPSBmdW5jdGlvbihlbnRyeSwgaSkge1xuICAgICAgdmFyIGMgPSB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yO1xuICAgICAgdmFyIHJlc29sdmUgPSBjLnJlc29sdmU7XG5cbiAgICAgIGlmIChyZXNvbHZlID09PSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0KSB7XG4gICAgICAgIHZhciB0aGVuID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbihlbnRyeSk7XG5cbiAgICAgICAgaWYgKHRoZW4gPT09IGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0ICYmXG4gICAgICAgICAgICBlbnRyeS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgICB0aGlzLl9zZXR0bGVkQXQoZW50cnkuX3N0YXRlLCBpLCBlbnRyeS5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhlbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuICAgICAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IGVudHJ5O1xuICAgICAgICB9IGVsc2UgaWYgKGMgPT09IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0KSB7XG4gICAgICAgICAgdmFyIHByb21pc2UgPSBuZXcgYyhsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIGVudHJ5LCB0aGVuKTtcbiAgICAgICAgICB0aGlzLl93aWxsU2V0dGxlQXQocHJvbWlzZSwgaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KG5ldyBjKGZ1bmN0aW9uKHJlc29sdmUpIHsgcmVzb2x2ZShlbnRyeSk7IH0pLCBpKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KHJlc29sdmUoZW50cnkpLCBpKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9zZXR0bGVkQXQgPSBmdW5jdGlvbihzdGF0ZSwgaSwgdmFsdWUpIHtcbiAgICAgIHZhciBwcm9taXNlID0gdGhpcy5wcm9taXNlO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG5cbiAgICAgICAgaWYgKHN0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fcmVzdWx0W2ldID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fd2lsbFNldHRsZUF0ID0gZnVuY3Rpb24ocHJvbWlzZSwgaSkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocHJvbWlzZSwgdW5kZWZpbmVkLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVELCBpLCB2YWx1ZSk7XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgZW51bWVyYXRvci5fc2V0dGxlZEF0KGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVELCBpLCByZWFzb24pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJHBvbHlmaWxsKCkge1xuICAgICAgdmFyIGxvY2FsO1xuXG4gICAgICBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBsb2NhbCA9IGdsb2JhbDtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgbG9jYWwgPSBzZWxmO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBsb2NhbCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3BvbHlmaWxsIGZhaWxlZCBiZWNhdXNlIGdsb2JhbCBvYmplY3QgaXMgdW5hdmFpbGFibGUgaW4gdGhpcyBlbnZpcm9ubWVudCcpO1xuICAgICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIFAgPSBsb2NhbC5Qcm9taXNlO1xuXG4gICAgICBpZiAoUCAmJiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoUC5yZXNvbHZlKCkpID09PSAnW29iamVjdCBQcm9taXNlXScgJiYgIVAuY2FzdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGxvY2FsLlByb21pc2UgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdDtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkcG9seWZpbGw7XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZSA9IHtcbiAgICAgICdQcm9taXNlJzogbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQsXG4gICAgICAncG9seWZpbGwnOiBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHRcbiAgICB9O1xuXG4gICAgLyogZ2xvYmFsIGRlZmluZTp0cnVlIG1vZHVsZTp0cnVlIHdpbmRvdzogdHJ1ZSAqL1xuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZVsnYW1kJ10pIHtcbiAgICAgIGRlZmluZShmdW5jdGlvbigpIHsgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7IH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlWydleHBvcnRzJ10pIHtcbiAgICAgIG1vZHVsZVsnZXhwb3J0cyddID0gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhpc1snRVM2UHJvbWlzZSddID0gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTtcbiAgICB9XG5cbiAgICBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHQoKTtcbn0pLmNhbGwodGhpcyk7XG5cbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiXG4vKipcbiAqIFJlZHVjZSBgYXJyYCB3aXRoIGBmbmAuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHBhcmFtIHtNaXhlZH0gaW5pdGlhbFxuICpcbiAqIFRPRE86IGNvbWJhdGlibGUgZXJyb3IgaGFuZGxpbmc/XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihhcnIsIGZuLCBpbml0aWFsKXsgIFxuICB2YXIgaWR4ID0gMDtcbiAgdmFyIGxlbiA9IGFyci5sZW5ndGg7XG4gIHZhciBjdXJyID0gYXJndW1lbnRzLmxlbmd0aCA9PSAzXG4gICAgPyBpbml0aWFsXG4gICAgOiBhcnJbaWR4KytdO1xuXG4gIHdoaWxlIChpZHggPCBsZW4pIHtcbiAgICBjdXJyID0gZm4uY2FsbChudWxsLCBjdXJyLCBhcnJbaWR4XSwgKytpZHgsIGFycik7XG4gIH1cbiAgXG4gIHJldHVybiBjdXJyO1xufTsiLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEVtaXR0ZXIgPSByZXF1aXJlKCdlbWl0dGVyJyk7XG52YXIgcmVkdWNlID0gcmVxdWlyZSgncmVkdWNlJyk7XG52YXIgcmVxdWVzdEJhc2UgPSByZXF1aXJlKCcuL3JlcXVlc3QtYmFzZScpO1xudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9pcy1vYmplY3QnKTtcblxuLyoqXG4gKiBSb290IHJlZmVyZW5jZSBmb3IgaWZyYW1lcy5cbiAqL1xuXG52YXIgcm9vdDtcbmlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgeyAvLyBCcm93c2VyIHdpbmRvd1xuICByb290ID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHsgLy8gV2ViIFdvcmtlclxuICByb290ID0gc2VsZjtcbn0gZWxzZSB7IC8vIE90aGVyIGVudmlyb25tZW50c1xuICByb290ID0gdGhpcztcbn1cblxuLyoqXG4gKiBOb29wLlxuICovXG5cbmZ1bmN0aW9uIG5vb3AoKXt9O1xuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGEgaG9zdCBvYmplY3QsXG4gKiB3ZSBkb24ndCB3YW50IHRvIHNlcmlhbGl6ZSB0aGVzZSA6KVxuICpcbiAqIFRPRE86IGZ1dHVyZSBwcm9vZiwgbW92ZSB0byBjb21wb2VudCBsYW5kXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlzSG9zdChvYmopIHtcbiAgdmFyIHN0ciA9IHt9LnRvU3RyaW5nLmNhbGwob2JqKTtcblxuICBzd2l0Y2ggKHN0cikge1xuICAgIGNhc2UgJ1tvYmplY3QgRmlsZV0nOlxuICAgIGNhc2UgJ1tvYmplY3QgQmxvYl0nOlxuICAgIGNhc2UgJ1tvYmplY3QgRm9ybURhdGFdJzpcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBFeHBvc2UgYHJlcXVlc3RgLlxuICovXG5cbnZhciByZXF1ZXN0ID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3JlcXVlc3QnKS5iaW5kKG51bGwsIFJlcXVlc3QpO1xuXG4vKipcbiAqIERldGVybWluZSBYSFIuXG4gKi9cblxucmVxdWVzdC5nZXRYSFIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChyb290LlhNTEh0dHBSZXF1ZXN0XG4gICAgICAmJiAoIXJvb3QubG9jYXRpb24gfHwgJ2ZpbGU6JyAhPSByb290LmxvY2F0aW9uLnByb3RvY29sXG4gICAgICAgICAgfHwgIXJvb3QuQWN0aXZlWE9iamVjdCkpIHtcbiAgICByZXR1cm4gbmV3IFhNTEh0dHBSZXF1ZXN0O1xuICB9IGVsc2Uge1xuICAgIHRyeSB7IHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTWljcm9zb2Z0LlhNTEhUVFAnKTsgfSBjYXRjaChlKSB7fVxuICAgIHRyeSB7IHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTXN4bWwyLlhNTEhUVFAuNi4wJyk7IH0gY2F0Y2goZSkge31cbiAgICB0cnkgeyByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01zeG1sMi5YTUxIVFRQLjMuMCcpOyB9IGNhdGNoKGUpIHt9XG4gICAgdHJ5IHsgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNc3htbDIuWE1MSFRUUCcpOyB9IGNhdGNoKGUpIHt9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLyoqXG4gKiBSZW1vdmVzIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UsIGFkZGVkIHRvIHN1cHBvcnQgSUUuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnZhciB0cmltID0gJycudHJpbVxuICA/IGZ1bmN0aW9uKHMpIHsgcmV0dXJuIHMudHJpbSgpOyB9XG4gIDogZnVuY3Rpb24ocykgeyByZXR1cm4gcy5yZXBsYWNlKC8oXlxccyp8XFxzKiQpL2csICcnKTsgfTtcblxuLyoqXG4gKiBTZXJpYWxpemUgdGhlIGdpdmVuIGBvYmpgLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZShvYmopIHtcbiAgaWYgKCFpc09iamVjdChvYmopKSByZXR1cm4gb2JqO1xuICB2YXIgcGFpcnMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChudWxsICE9IG9ialtrZXldKSB7XG4gICAgICBwdXNoRW5jb2RlZEtleVZhbHVlUGFpcihwYWlycywga2V5LCBvYmpba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgcmV0dXJuIHBhaXJzLmpvaW4oJyYnKTtcbn1cblxuLyoqXG4gKiBIZWxwcyAnc2VyaWFsaXplJyB3aXRoIHNlcmlhbGl6aW5nIGFycmF5cy5cbiAqIE11dGF0ZXMgdGhlIHBhaXJzIGFycmF5LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhaXJzXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqL1xuXG5mdW5jdGlvbiBwdXNoRW5jb2RlZEtleVZhbHVlUGFpcihwYWlycywga2V5LCB2YWwpIHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsKSkge1xuICAgIHJldHVybiB2YWwuZm9yRWFjaChmdW5jdGlvbih2KSB7XG4gICAgICBwdXNoRW5jb2RlZEtleVZhbHVlUGFpcihwYWlycywga2V5LCB2KTtcbiAgICB9KTtcbiAgfVxuICBwYWlycy5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChrZXkpXG4gICAgKyAnPScgKyBlbmNvZGVVUklDb21wb25lbnQodmFsKSk7XG59XG5cbi8qKlxuICogRXhwb3NlIHNlcmlhbGl6YXRpb24gbWV0aG9kLlxuICovXG5cbiByZXF1ZXN0LnNlcmlhbGl6ZU9iamVjdCA9IHNlcmlhbGl6ZTtcblxuIC8qKlxuICAqIFBhcnNlIHRoZSBnaXZlbiB4LXd3dy1mb3JtLXVybGVuY29kZWQgYHN0cmAuXG4gICpcbiAgKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gICogQHJldHVybiB7T2JqZWN0fVxuICAqIEBhcGkgcHJpdmF0ZVxuICAqL1xuXG5mdW5jdGlvbiBwYXJzZVN0cmluZyhzdHIpIHtcbiAgdmFyIG9iaiA9IHt9O1xuICB2YXIgcGFpcnMgPSBzdHIuc3BsaXQoJyYnKTtcbiAgdmFyIHBhcnRzO1xuICB2YXIgcGFpcjtcblxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gcGFpcnMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBwYWlyID0gcGFpcnNbaV07XG4gICAgcGFydHMgPSBwYWlyLnNwbGl0KCc9Jyk7XG4gICAgb2JqW2RlY29kZVVSSUNvbXBvbmVudChwYXJ0c1swXSldID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdKTtcbiAgfVxuXG4gIHJldHVybiBvYmo7XG59XG5cbi8qKlxuICogRXhwb3NlIHBhcnNlci5cbiAqL1xuXG5yZXF1ZXN0LnBhcnNlU3RyaW5nID0gcGFyc2VTdHJpbmc7XG5cbi8qKlxuICogRGVmYXVsdCBNSU1FIHR5cGUgbWFwLlxuICpcbiAqICAgICBzdXBlcmFnZW50LnR5cGVzLnhtbCA9ICdhcHBsaWNhdGlvbi94bWwnO1xuICpcbiAqL1xuXG5yZXF1ZXN0LnR5cGVzID0ge1xuICBodG1sOiAndGV4dC9odG1sJyxcbiAganNvbjogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICB4bWw6ICdhcHBsaWNhdGlvbi94bWwnLFxuICB1cmxlbmNvZGVkOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyxcbiAgJ2Zvcm0nOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyxcbiAgJ2Zvcm0tZGF0YSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnXG59O1xuXG4vKipcbiAqIERlZmF1bHQgc2VyaWFsaXphdGlvbiBtYXAuXG4gKlxuICogICAgIHN1cGVyYWdlbnQuc2VyaWFsaXplWydhcHBsaWNhdGlvbi94bWwnXSA9IGZ1bmN0aW9uKG9iail7XG4gKiAgICAgICByZXR1cm4gJ2dlbmVyYXRlZCB4bWwgaGVyZSc7XG4gKiAgICAgfTtcbiAqXG4gKi9cblxuIHJlcXVlc3Quc2VyaWFsaXplID0ge1xuICAgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6IHNlcmlhbGl6ZSxcbiAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnlcbiB9O1xuXG4gLyoqXG4gICogRGVmYXVsdCBwYXJzZXJzLlxuICAqXG4gICogICAgIHN1cGVyYWdlbnQucGFyc2VbJ2FwcGxpY2F0aW9uL3htbCddID0gZnVuY3Rpb24oc3RyKXtcbiAgKiAgICAgICByZXR1cm4geyBvYmplY3QgcGFyc2VkIGZyb20gc3RyIH07XG4gICogICAgIH07XG4gICpcbiAgKi9cblxucmVxdWVzdC5wYXJzZSA9IHtcbiAgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6IHBhcnNlU3RyaW5nLFxuICAnYXBwbGljYXRpb24vanNvbic6IEpTT04ucGFyc2Vcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGhlYWRlciBgc3RyYCBpbnRvXG4gKiBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgbWFwcGVkIGZpZWxkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZUhlYWRlcihzdHIpIHtcbiAgdmFyIGxpbmVzID0gc3RyLnNwbGl0KC9cXHI/XFxuLyk7XG4gIHZhciBmaWVsZHMgPSB7fTtcbiAgdmFyIGluZGV4O1xuICB2YXIgbGluZTtcbiAgdmFyIGZpZWxkO1xuICB2YXIgdmFsO1xuXG4gIGxpbmVzLnBvcCgpOyAvLyB0cmFpbGluZyBDUkxGXG5cbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgbGluZSA9IGxpbmVzW2ldO1xuICAgIGluZGV4ID0gbGluZS5pbmRleE9mKCc6Jyk7XG4gICAgZmllbGQgPSBsaW5lLnNsaWNlKDAsIGluZGV4KS50b0xvd2VyQ2FzZSgpO1xuICAgIHZhbCA9IHRyaW0obGluZS5zbGljZShpbmRleCArIDEpKTtcbiAgICBmaWVsZHNbZmllbGRdID0gdmFsO1xuICB9XG5cbiAgcmV0dXJuIGZpZWxkcztcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBgbWltZWAgaXMganNvbiBvciBoYXMgK2pzb24gc3RydWN0dXJlZCBzeW50YXggc3VmZml4LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtaW1lXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNKU09OKG1pbWUpIHtcbiAgcmV0dXJuIC9bXFwvK11qc29uXFxiLy50ZXN0KG1pbWUpO1xufVxuXG4vKipcbiAqIFJldHVybiB0aGUgbWltZSB0eXBlIGZvciB0aGUgZ2l2ZW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gdHlwZShzdHIpe1xuICByZXR1cm4gc3RyLnNwbGl0KC8gKjsgKi8pLnNoaWZ0KCk7XG59O1xuXG4vKipcbiAqIFJldHVybiBoZWFkZXIgZmllbGQgcGFyYW1ldGVycy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJhbXMoc3RyKXtcbiAgcmV0dXJuIHJlZHVjZShzdHIuc3BsaXQoLyAqOyAqLyksIGZ1bmN0aW9uKG9iaiwgc3RyKXtcbiAgICB2YXIgcGFydHMgPSBzdHIuc3BsaXQoLyAqPSAqLylcbiAgICAgICwga2V5ID0gcGFydHMuc2hpZnQoKVxuICAgICAgLCB2YWwgPSBwYXJ0cy5zaGlmdCgpO1xuXG4gICAgaWYgKGtleSAmJiB2YWwpIG9ialtrZXldID0gdmFsO1xuICAgIHJldHVybiBvYmo7XG4gIH0sIHt9KTtcbn07XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgUmVzcG9uc2VgIHdpdGggdGhlIGdpdmVuIGB4aHJgLlxuICpcbiAqICAtIHNldCBmbGFncyAoLm9rLCAuZXJyb3IsIGV0YylcbiAqICAtIHBhcnNlIGhlYWRlclxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICBBbGlhc2luZyBgc3VwZXJhZ2VudGAgYXMgYHJlcXVlc3RgIGlzIG5pY2U6XG4gKlxuICogICAgICByZXF1ZXN0ID0gc3VwZXJhZ2VudDtcbiAqXG4gKiAgV2UgY2FuIHVzZSB0aGUgcHJvbWlzZS1saWtlIEFQSSwgb3IgcGFzcyBjYWxsYmFja3M6XG4gKlxuICogICAgICByZXF1ZXN0LmdldCgnLycpLmVuZChmdW5jdGlvbihyZXMpe30pO1xuICogICAgICByZXF1ZXN0LmdldCgnLycsIGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogIFNlbmRpbmcgZGF0YSBjYW4gYmUgY2hhaW5lZDpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInKVxuICogICAgICAgIC5zZW5kKHsgbmFtZTogJ3RqJyB9KVxuICogICAgICAgIC5lbmQoZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiAgT3IgcGFzc2VkIHRvIGAuc2VuZCgpYDpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInKVxuICogICAgICAgIC5zZW5kKHsgbmFtZTogJ3RqJyB9LCBmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqICBPciBwYXNzZWQgdG8gYC5wb3N0KClgOlxuICpcbiAqICAgICAgcmVxdWVzdFxuICogICAgICAgIC5wb3N0KCcvdXNlcicsIHsgbmFtZTogJ3RqJyB9KVxuICogICAgICAgIC5lbmQoZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiBPciBmdXJ0aGVyIHJlZHVjZWQgdG8gYSBzaW5nbGUgY2FsbCBmb3Igc2ltcGxlIGNhc2VzOlxuICpcbiAqICAgICAgcmVxdWVzdFxuICogICAgICAgIC5wb3N0KCcvdXNlcicsIHsgbmFtZTogJ3RqJyB9LCBmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqIEBwYXJhbSB7WE1MSFRUUFJlcXVlc3R9IHhoclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIFJlc3BvbnNlKHJlcSwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdGhpcy5yZXEgPSByZXE7XG4gIHRoaXMueGhyID0gdGhpcy5yZXEueGhyO1xuICAvLyByZXNwb25zZVRleHQgaXMgYWNjZXNzaWJsZSBvbmx5IGlmIHJlc3BvbnNlVHlwZSBpcyAnJyBvciAndGV4dCcgYW5kIG9uIG9sZGVyIGJyb3dzZXJzXG4gIHRoaXMudGV4dCA9ICgodGhpcy5yZXEubWV0aG9kICE9J0hFQUQnICYmICh0aGlzLnhoci5yZXNwb25zZVR5cGUgPT09ICcnIHx8IHRoaXMueGhyLnJlc3BvbnNlVHlwZSA9PT0gJ3RleHQnKSkgfHwgdHlwZW9mIHRoaXMueGhyLnJlc3BvbnNlVHlwZSA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgID8gdGhpcy54aHIucmVzcG9uc2VUZXh0XG4gICAgIDogbnVsbDtcbiAgdGhpcy5zdGF0dXNUZXh0ID0gdGhpcy5yZXEueGhyLnN0YXR1c1RleHQ7XG4gIHRoaXMuc2V0U3RhdHVzUHJvcGVydGllcyh0aGlzLnhoci5zdGF0dXMpO1xuICB0aGlzLmhlYWRlciA9IHRoaXMuaGVhZGVycyA9IHBhcnNlSGVhZGVyKHRoaXMueGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKTtcbiAgLy8gZ2V0QWxsUmVzcG9uc2VIZWFkZXJzIHNvbWV0aW1lcyBmYWxzZWx5IHJldHVybnMgXCJcIiBmb3IgQ09SUyByZXF1ZXN0cywgYnV0XG4gIC8vIGdldFJlc3BvbnNlSGVhZGVyIHN0aWxsIHdvcmtzLiBzbyB3ZSBnZXQgY29udGVudC10eXBlIGV2ZW4gaWYgZ2V0dGluZ1xuICAvLyBvdGhlciBoZWFkZXJzIGZhaWxzLlxuICB0aGlzLmhlYWRlclsnY29udGVudC10eXBlJ10gPSB0aGlzLnhoci5nZXRSZXNwb25zZUhlYWRlcignY29udGVudC10eXBlJyk7XG4gIHRoaXMuc2V0SGVhZGVyUHJvcGVydGllcyh0aGlzLmhlYWRlcik7XG4gIHRoaXMuYm9keSA9IHRoaXMucmVxLm1ldGhvZCAhPSAnSEVBRCdcbiAgICA/IHRoaXMucGFyc2VCb2R5KHRoaXMudGV4dCA/IHRoaXMudGV4dCA6IHRoaXMueGhyLnJlc3BvbnNlKVxuICAgIDogbnVsbDtcbn1cblxuLyoqXG4gKiBHZXQgY2FzZS1pbnNlbnNpdGl2ZSBgZmllbGRgIHZhbHVlLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24oZmllbGQpe1xuICByZXR1cm4gdGhpcy5oZWFkZXJbZmllbGQudG9Mb3dlckNhc2UoKV07XG59O1xuXG4vKipcbiAqIFNldCBoZWFkZXIgcmVsYXRlZCBwcm9wZXJ0aWVzOlxuICpcbiAqICAgLSBgLnR5cGVgIHRoZSBjb250ZW50IHR5cGUgd2l0aG91dCBwYXJhbXNcbiAqXG4gKiBBIHJlc3BvbnNlIG9mIFwiQ29udGVudC1UeXBlOiB0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCJcbiAqIHdpbGwgcHJvdmlkZSB5b3Ugd2l0aCBhIGAudHlwZWAgb2YgXCJ0ZXh0L3BsYWluXCIuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGhlYWRlclxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVzcG9uc2UucHJvdG90eXBlLnNldEhlYWRlclByb3BlcnRpZXMgPSBmdW5jdGlvbihoZWFkZXIpe1xuICAvLyBjb250ZW50LXR5cGVcbiAgdmFyIGN0ID0gdGhpcy5oZWFkZXJbJ2NvbnRlbnQtdHlwZSddIHx8ICcnO1xuICB0aGlzLnR5cGUgPSB0eXBlKGN0KTtcblxuICAvLyBwYXJhbXNcbiAgdmFyIG9iaiA9IHBhcmFtcyhjdCk7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHRoaXNba2V5XSA9IG9ialtrZXldO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYm9keSBgc3RyYC5cbiAqXG4gKiBVc2VkIGZvciBhdXRvLXBhcnNpbmcgb2YgYm9kaWVzLiBQYXJzZXJzXG4gKiBhcmUgZGVmaW5lZCBvbiB0aGUgYHN1cGVyYWdlbnQucGFyc2VgIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtNaXhlZH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS5wYXJzZUJvZHkgPSBmdW5jdGlvbihzdHIpe1xuICB2YXIgcGFyc2UgPSByZXF1ZXN0LnBhcnNlW3RoaXMudHlwZV07XG4gIGlmICghcGFyc2UgJiYgaXNKU09OKHRoaXMudHlwZSkpIHtcbiAgICBwYXJzZSA9IHJlcXVlc3QucGFyc2VbJ2FwcGxpY2F0aW9uL2pzb24nXTtcbiAgfVxuICByZXR1cm4gcGFyc2UgJiYgc3RyICYmIChzdHIubGVuZ3RoIHx8IHN0ciBpbnN0YW5jZW9mIE9iamVjdClcbiAgICA/IHBhcnNlKHN0cilcbiAgICA6IG51bGw7XG59O1xuXG4vKipcbiAqIFNldCBmbGFncyBzdWNoIGFzIGAub2tgIGJhc2VkIG9uIGBzdGF0dXNgLlxuICpcbiAqIEZvciBleGFtcGxlIGEgMnh4IHJlc3BvbnNlIHdpbGwgZ2l2ZSB5b3UgYSBgLm9rYCBvZiBfX3RydWVfX1xuICogd2hlcmVhcyA1eHggd2lsbCBiZSBfX2ZhbHNlX18gYW5kIGAuZXJyb3JgIHdpbGwgYmUgX190cnVlX18uIFRoZVxuICogYC5jbGllbnRFcnJvcmAgYW5kIGAuc2VydmVyRXJyb3JgIGFyZSBhbHNvIGF2YWlsYWJsZSB0byBiZSBtb3JlXG4gKiBzcGVjaWZpYywgYW5kIGAuc3RhdHVzVHlwZWAgaXMgdGhlIGNsYXNzIG9mIGVycm9yIHJhbmdpbmcgZnJvbSAxLi41XG4gKiBzb21ldGltZXMgdXNlZnVsIGZvciBtYXBwaW5nIHJlc3BvbmQgY29sb3JzIGV0Yy5cbiAqXG4gKiBcInN1Z2FyXCIgcHJvcGVydGllcyBhcmUgYWxzbyBkZWZpbmVkIGZvciBjb21tb24gY2FzZXMuIEN1cnJlbnRseSBwcm92aWRpbmc6XG4gKlxuICogICAtIC5ub0NvbnRlbnRcbiAqICAgLSAuYmFkUmVxdWVzdFxuICogICAtIC51bmF1dGhvcml6ZWRcbiAqICAgLSAubm90QWNjZXB0YWJsZVxuICogICAtIC5ub3RGb3VuZFxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBzdGF0dXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS5zZXRTdGF0dXNQcm9wZXJ0aWVzID0gZnVuY3Rpb24oc3RhdHVzKXtcbiAgLy8gaGFuZGxlIElFOSBidWc6IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTAwNDY5NzIvbXNpZS1yZXR1cm5zLXN0YXR1cy1jb2RlLW9mLTEyMjMtZm9yLWFqYXgtcmVxdWVzdFxuICBpZiAoc3RhdHVzID09PSAxMjIzKSB7XG4gICAgc3RhdHVzID0gMjA0O1xuICB9XG5cbiAgdmFyIHR5cGUgPSBzdGF0dXMgLyAxMDAgfCAwO1xuXG4gIC8vIHN0YXR1cyAvIGNsYXNzXG4gIHRoaXMuc3RhdHVzID0gdGhpcy5zdGF0dXNDb2RlID0gc3RhdHVzO1xuICB0aGlzLnN0YXR1c1R5cGUgPSB0eXBlO1xuXG4gIC8vIGJhc2ljc1xuICB0aGlzLmluZm8gPSAxID09IHR5cGU7XG4gIHRoaXMub2sgPSAyID09IHR5cGU7XG4gIHRoaXMuY2xpZW50RXJyb3IgPSA0ID09IHR5cGU7XG4gIHRoaXMuc2VydmVyRXJyb3IgPSA1ID09IHR5cGU7XG4gIHRoaXMuZXJyb3IgPSAoNCA9PSB0eXBlIHx8IDUgPT0gdHlwZSlcbiAgICA/IHRoaXMudG9FcnJvcigpXG4gICAgOiBmYWxzZTtcblxuICAvLyBzdWdhclxuICB0aGlzLmFjY2VwdGVkID0gMjAyID09IHN0YXR1cztcbiAgdGhpcy5ub0NvbnRlbnQgPSAyMDQgPT0gc3RhdHVzO1xuICB0aGlzLmJhZFJlcXVlc3QgPSA0MDAgPT0gc3RhdHVzO1xuICB0aGlzLnVuYXV0aG9yaXplZCA9IDQwMSA9PSBzdGF0dXM7XG4gIHRoaXMubm90QWNjZXB0YWJsZSA9IDQwNiA9PSBzdGF0dXM7XG4gIHRoaXMubm90Rm91bmQgPSA0MDQgPT0gc3RhdHVzO1xuICB0aGlzLmZvcmJpZGRlbiA9IDQwMyA9PSBzdGF0dXM7XG59O1xuXG4vKipcbiAqIFJldHVybiBhbiBgRXJyb3JgIHJlcHJlc2VudGF0aXZlIG9mIHRoaXMgcmVzcG9uc2UuXG4gKlxuICogQHJldHVybiB7RXJyb3J9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS50b0Vycm9yID0gZnVuY3Rpb24oKXtcbiAgdmFyIHJlcSA9IHRoaXMucmVxO1xuICB2YXIgbWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgdmFyIHVybCA9IHJlcS51cmw7XG5cbiAgdmFyIG1zZyA9ICdjYW5ub3QgJyArIG1ldGhvZCArICcgJyArIHVybCArICcgKCcgKyB0aGlzLnN0YXR1cyArICcpJztcbiAgdmFyIGVyciA9IG5ldyBFcnJvcihtc2cpO1xuICBlcnIuc3RhdHVzID0gdGhpcy5zdGF0dXM7XG4gIGVyci5tZXRob2QgPSBtZXRob2Q7XG4gIGVyci51cmwgPSB1cmw7XG5cbiAgcmV0dXJuIGVycjtcbn07XG5cbi8qKlxuICogRXhwb3NlIGBSZXNwb25zZWAuXG4gKi9cblxucmVxdWVzdC5SZXNwb25zZSA9IFJlc3BvbnNlO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFJlcXVlc3RgIHdpdGggdGhlIGdpdmVuIGBtZXRob2RgIGFuZCBgdXJsYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFJlcXVlc3QobWV0aG9kLCB1cmwpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB0aGlzLl9xdWVyeSA9IHRoaXMuX3F1ZXJ5IHx8IFtdO1xuICB0aGlzLm1ldGhvZCA9IG1ldGhvZDtcbiAgdGhpcy51cmwgPSB1cmw7XG4gIHRoaXMuaGVhZGVyID0ge307IC8vIHByZXNlcnZlcyBoZWFkZXIgbmFtZSBjYXNlXG4gIHRoaXMuX2hlYWRlciA9IHt9OyAvLyBjb2VyY2VzIGhlYWRlciBuYW1lcyB0byBsb3dlcmNhc2VcbiAgdGhpcy5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICB2YXIgZXJyID0gbnVsbDtcbiAgICB2YXIgcmVzID0gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICByZXMgPSBuZXcgUmVzcG9uc2Uoc2VsZik7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICBlcnIgPSBuZXcgRXJyb3IoJ1BhcnNlciBpcyB1bmFibGUgdG8gcGFyc2UgdGhlIHJlc3BvbnNlJyk7XG4gICAgICBlcnIucGFyc2UgPSB0cnVlO1xuICAgICAgZXJyLm9yaWdpbmFsID0gZTtcbiAgICAgIC8vIGlzc3VlICM2NzU6IHJldHVybiB0aGUgcmF3IHJlc3BvbnNlIGlmIHRoZSByZXNwb25zZSBwYXJzaW5nIGZhaWxzXG4gICAgICBlcnIucmF3UmVzcG9uc2UgPSBzZWxmLnhociAmJiBzZWxmLnhoci5yZXNwb25zZVRleHQgPyBzZWxmLnhoci5yZXNwb25zZVRleHQgOiBudWxsO1xuICAgICAgLy8gaXNzdWUgIzg3NjogcmV0dXJuIHRoZSBodHRwIHN0YXR1cyBjb2RlIGlmIHRoZSByZXNwb25zZSBwYXJzaW5nIGZhaWxzXG4gICAgICBlcnIuc3RhdHVzQ29kZSA9IHNlbGYueGhyICYmIHNlbGYueGhyLnN0YXR1cyA/IHNlbGYueGhyLnN0YXR1cyA6IG51bGw7XG4gICAgICByZXR1cm4gc2VsZi5jYWxsYmFjayhlcnIpO1xuICAgIH1cblxuICAgIHNlbGYuZW1pdCgncmVzcG9uc2UnLCByZXMpO1xuXG4gICAgaWYgKGVycikge1xuICAgICAgcmV0dXJuIHNlbGYuY2FsbGJhY2soZXJyLCByZXMpO1xuICAgIH1cblxuICAgIGlmIChyZXMuc3RhdHVzID49IDIwMCAmJiByZXMuc3RhdHVzIDwgMzAwKSB7XG4gICAgICByZXR1cm4gc2VsZi5jYWxsYmFjayhlcnIsIHJlcyk7XG4gICAgfVxuXG4gICAgdmFyIG5ld19lcnIgPSBuZXcgRXJyb3IocmVzLnN0YXR1c1RleHQgfHwgJ1Vuc3VjY2Vzc2Z1bCBIVFRQIHJlc3BvbnNlJyk7XG4gICAgbmV3X2Vyci5vcmlnaW5hbCA9IGVycjtcbiAgICBuZXdfZXJyLnJlc3BvbnNlID0gcmVzO1xuICAgIG5ld19lcnIuc3RhdHVzID0gcmVzLnN0YXR1cztcblxuICAgIHNlbGYuY2FsbGJhY2sobmV3X2VyciwgcmVzKTtcbiAgfSk7XG59XG5cbi8qKlxuICogTWl4aW4gYEVtaXR0ZXJgIGFuZCBgcmVxdWVzdEJhc2VgLlxuICovXG5cbkVtaXR0ZXIoUmVxdWVzdC5wcm90b3R5cGUpO1xuZm9yICh2YXIga2V5IGluIHJlcXVlc3RCYXNlKSB7XG4gIFJlcXVlc3QucHJvdG90eXBlW2tleV0gPSByZXF1ZXN0QmFzZVtrZXldO1xufVxuXG4vKipcbiAqIEFib3J0IHRoZSByZXF1ZXN0LCBhbmQgY2xlYXIgcG90ZW50aWFsIHRpbWVvdXQuXG4gKlxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYWJvcnQgPSBmdW5jdGlvbigpe1xuICBpZiAodGhpcy5hYm9ydGVkKSByZXR1cm47XG4gIHRoaXMuYWJvcnRlZCA9IHRydWU7XG4gIHRoaXMueGhyLmFib3J0KCk7XG4gIHRoaXMuY2xlYXJUaW1lb3V0KCk7XG4gIHRoaXMuZW1pdCgnYWJvcnQnKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBDb250ZW50LVR5cGUgdG8gYHR5cGVgLCBtYXBwaW5nIHZhbHVlcyBmcm9tIGByZXF1ZXN0LnR5cGVzYC5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgIHN1cGVyYWdlbnQudHlwZXMueG1sID0gJ2FwcGxpY2F0aW9uL3htbCc7XG4gKlxuICogICAgICByZXF1ZXN0LnBvc3QoJy8nKVxuICogICAgICAgIC50eXBlKCd4bWwnKVxuICogICAgICAgIC5zZW5kKHhtbHN0cmluZylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiAgICAgIHJlcXVlc3QucG9zdCgnLycpXG4gKiAgICAgICAgLnR5cGUoJ2FwcGxpY2F0aW9uL3htbCcpXG4gKiAgICAgICAgLnNlbmQoeG1sc3RyaW5nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUudHlwZSA9IGZ1bmN0aW9uKHR5cGUpe1xuICB0aGlzLnNldCgnQ29udGVudC1UeXBlJywgcmVxdWVzdC50eXBlc1t0eXBlXSB8fCB0eXBlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCByZXNwb25zZVR5cGUgdG8gYHZhbGAuIFByZXNlbnRseSB2YWxpZCByZXNwb25zZVR5cGVzIGFyZSAnYmxvYicgYW5kIFxuICogJ2FycmF5YnVmZmVyJy5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgIHJlcS5nZXQoJy8nKVxuICogICAgICAgIC5yZXNwb25zZVR5cGUoJ2Jsb2InKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5yZXNwb25zZVR5cGUgPSBmdW5jdGlvbih2YWwpe1xuICB0aGlzLl9yZXNwb25zZVR5cGUgPSB2YWw7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgQWNjZXB0IHRvIGB0eXBlYCwgbWFwcGluZyB2YWx1ZXMgZnJvbSBgcmVxdWVzdC50eXBlc2AuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICBzdXBlcmFnZW50LnR5cGVzLmpzb24gPSAnYXBwbGljYXRpb24vanNvbic7XG4gKlxuICogICAgICByZXF1ZXN0LmdldCgnL2FnZW50JylcbiAqICAgICAgICAuYWNjZXB0KCdqc29uJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiAgICAgIHJlcXVlc3QuZ2V0KCcvYWdlbnQnKVxuICogICAgICAgIC5hY2NlcHQoJ2FwcGxpY2F0aW9uL2pzb24nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBhY2NlcHRcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hY2NlcHQgPSBmdW5jdGlvbih0eXBlKXtcbiAgdGhpcy5zZXQoJ0FjY2VwdCcsIHJlcXVlc3QudHlwZXNbdHlwZV0gfHwgdHlwZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgQXV0aG9yaXphdGlvbiBmaWVsZCB2YWx1ZSB3aXRoIGB1c2VyYCBhbmQgYHBhc3NgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzc1xuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgd2l0aCAndHlwZScgcHJvcGVydHkgJ2F1dG8nIG9yICdiYXNpYycgKGRlZmF1bHQgJ2Jhc2ljJylcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24odXNlciwgcGFzcywgb3B0aW9ucyl7XG4gIGlmICghb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSB7XG4gICAgICB0eXBlOiAnYmFzaWMnXG4gICAgfVxuICB9XG5cbiAgc3dpdGNoIChvcHRpb25zLnR5cGUpIHtcbiAgICBjYXNlICdiYXNpYyc6XG4gICAgICB2YXIgc3RyID0gYnRvYSh1c2VyICsgJzonICsgcGFzcyk7XG4gICAgICB0aGlzLnNldCgnQXV0aG9yaXphdGlvbicsICdCYXNpYyAnICsgc3RyKTtcbiAgICBicmVhaztcblxuICAgIGNhc2UgJ2F1dG8nOlxuICAgICAgdGhpcy51c2VybmFtZSA9IHVzZXI7XG4gICAgICB0aGlzLnBhc3N3b3JkID0gcGFzcztcbiAgICBicmVhaztcbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuKiBBZGQgcXVlcnktc3RyaW5nIGB2YWxgLlxuKlxuKiBFeGFtcGxlczpcbipcbiogICByZXF1ZXN0LmdldCgnL3Nob2VzJylcbiogICAgIC5xdWVyeSgnc2l6ZT0xMCcpXG4qICAgICAucXVlcnkoeyBjb2xvcjogJ2JsdWUnIH0pXG4qXG4qIEBwYXJhbSB7T2JqZWN0fFN0cmluZ30gdmFsXG4qIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuKiBAYXBpIHB1YmxpY1xuKi9cblxuUmVxdWVzdC5wcm90b3R5cGUucXVlcnkgPSBmdW5jdGlvbih2YWwpe1xuICBpZiAoJ3N0cmluZycgIT0gdHlwZW9mIHZhbCkgdmFsID0gc2VyaWFsaXplKHZhbCk7XG4gIGlmICh2YWwpIHRoaXMuX3F1ZXJ5LnB1c2godmFsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFF1ZXVlIHRoZSBnaXZlbiBgZmlsZWAgYXMgYW4gYXR0YWNobWVudCB0byB0aGUgc3BlY2lmaWVkIGBmaWVsZGAsXG4gKiB3aXRoIG9wdGlvbmFsIGBmaWxlbmFtZWAuXG4gKlxuICogYGBgIGpzXG4gKiByZXF1ZXN0LnBvc3QoJy91cGxvYWQnKVxuICogICAuYXR0YWNoKG5ldyBCbG9iKFsnPGEgaWQ9XCJhXCI+PGIgaWQ9XCJiXCI+aGV5ITwvYj48L2E+J10sIHsgdHlwZTogXCJ0ZXh0L2h0bWxcIn0pKVxuICogICAuZW5kKGNhbGxiYWNrKTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICogQHBhcmFtIHtCbG9ifEZpbGV9IGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uKGZpZWxkLCBmaWxlLCBmaWxlbmFtZSl7XG4gIHRoaXMuX2dldEZvcm1EYXRhKCkuYXBwZW5kKGZpZWxkLCBmaWxlLCBmaWxlbmFtZSB8fCBmaWxlLm5hbWUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cblJlcXVlc3QucHJvdG90eXBlLl9nZXRGb3JtRGF0YSA9IGZ1bmN0aW9uKCl7XG4gIGlmICghdGhpcy5fZm9ybURhdGEpIHtcbiAgICB0aGlzLl9mb3JtRGF0YSA9IG5ldyByb290LkZvcm1EYXRhKCk7XG4gIH1cbiAgcmV0dXJuIHRoaXMuX2Zvcm1EYXRhO1xufTtcblxuLyoqXG4gKiBTZW5kIGBkYXRhYCBhcyB0aGUgcmVxdWVzdCBib2R5LCBkZWZhdWx0aW5nIHRoZSBgLnR5cGUoKWAgdG8gXCJqc29uXCIgd2hlblxuICogYW4gb2JqZWN0IGlzIGdpdmVuLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgIC8vIG1hbnVhbCBqc29uXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnR5cGUoJ2pzb24nKVxuICogICAgICAgICAuc2VuZCgne1wibmFtZVwiOlwidGpcIn0nKVxuICogICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqICAgICAgIC8vIGF1dG8ganNvblxuICogICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgIC5zZW5kKHsgbmFtZTogJ3RqJyB9KVxuICogICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqICAgICAgIC8vIG1hbnVhbCB4LXd3dy1mb3JtLXVybGVuY29kZWRcbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAudHlwZSgnZm9ybScpXG4gKiAgICAgICAgIC5zZW5kKCduYW1lPXRqJylcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBhdXRvIHgtd3d3LWZvcm0tdXJsZW5jb2RlZFxuICogICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgIC50eXBlKCdmb3JtJylcbiAqICAgICAgICAgLnNlbmQoeyBuYW1lOiAndGonIH0pXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gZGVmYXVsdHMgdG8geC13d3ctZm9ybS11cmxlbmNvZGVkXG4gICogICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAgKiAgICAgICAgLnNlbmQoJ25hbWU9dG9iaScpXG4gICogICAgICAgIC5zZW5kKCdzcGVjaWVzPWZlcnJldCcpXG4gICogICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8T2JqZWN0fSBkYXRhXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uKGRhdGEpe1xuICB2YXIgb2JqID0gaXNPYmplY3QoZGF0YSk7XG4gIHZhciB0eXBlID0gdGhpcy5faGVhZGVyWydjb250ZW50LXR5cGUnXTtcblxuICAvLyBtZXJnZVxuICBpZiAob2JqICYmIGlzT2JqZWN0KHRoaXMuX2RhdGEpKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGRhdGEpIHtcbiAgICAgIHRoaXMuX2RhdGFba2V5XSA9IGRhdGFba2V5XTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGRhdGEpIHtcbiAgICBpZiAoIXR5cGUpIHRoaXMudHlwZSgnZm9ybScpO1xuICAgIHR5cGUgPSB0aGlzLl9oZWFkZXJbJ2NvbnRlbnQtdHlwZSddO1xuICAgIGlmICgnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyA9PSB0eXBlKSB7XG4gICAgICB0aGlzLl9kYXRhID0gdGhpcy5fZGF0YVxuICAgICAgICA/IHRoaXMuX2RhdGEgKyAnJicgKyBkYXRhXG4gICAgICAgIDogZGF0YTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fZGF0YSA9ICh0aGlzLl9kYXRhIHx8ICcnKSArIGRhdGE7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRoaXMuX2RhdGEgPSBkYXRhO1xuICB9XG5cbiAgaWYgKCFvYmogfHwgaXNIb3N0KGRhdGEpKSByZXR1cm4gdGhpcztcbiAgaWYgKCF0eXBlKSB0aGlzLnR5cGUoJ2pzb24nKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEBkZXByZWNhdGVkXG4gKi9cblJlc3BvbnNlLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uIHNlcmlhbGl6ZShmbil7XG4gIGlmIChyb290LmNvbnNvbGUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJDbGllbnQtc2lkZSBwYXJzZSgpIG1ldGhvZCBoYXMgYmVlbiByZW5hbWVkIHRvIHNlcmlhbGl6ZSgpLiBUaGlzIG1ldGhvZCBpcyBub3QgY29tcGF0aWJsZSB3aXRoIHN1cGVyYWdlbnQgdjIuMFwiKTtcbiAgfVxuICB0aGlzLnNlcmlhbGl6ZShmbik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuUmVzcG9uc2UucHJvdG90eXBlLnNlcmlhbGl6ZSA9IGZ1bmN0aW9uIHNlcmlhbGl6ZShmbil7XG4gIHRoaXMuX3BhcnNlciA9IGZuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIGBlcnJgIGFuZCBgcmVzYFxuICogYW5kIGhhbmRsZSBhcml0eSBjaGVjay5cbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcbiAqIEBwYXJhbSB7UmVzcG9uc2V9IHJlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuY2FsbGJhY2sgPSBmdW5jdGlvbihlcnIsIHJlcyl7XG4gIHZhciBmbiA9IHRoaXMuX2NhbGxiYWNrO1xuICB0aGlzLmNsZWFyVGltZW91dCgpO1xuICBmbihlcnIsIHJlcyk7XG59O1xuXG4vKipcbiAqIEludm9rZSBjYWxsYmFjayB3aXRoIHgtZG9tYWluIGVycm9yLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNyb3NzRG9tYWluRXJyb3IgPSBmdW5jdGlvbigpe1xuICB2YXIgZXJyID0gbmV3IEVycm9yKCdSZXF1ZXN0IGhhcyBiZWVuIHRlcm1pbmF0ZWRcXG5Qb3NzaWJsZSBjYXVzZXM6IHRoZSBuZXR3b3JrIGlzIG9mZmxpbmUsIE9yaWdpbiBpcyBub3QgYWxsb3dlZCBieSBBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4sIHRoZSBwYWdlIGlzIGJlaW5nIHVubG9hZGVkLCBldGMuJyk7XG4gIGVyci5jcm9zc0RvbWFpbiA9IHRydWU7XG5cbiAgZXJyLnN0YXR1cyA9IHRoaXMuc3RhdHVzO1xuICBlcnIubWV0aG9kID0gdGhpcy5tZXRob2Q7XG4gIGVyci51cmwgPSB0aGlzLnVybDtcblxuICB0aGlzLmNhbGxiYWNrKGVycik7XG59O1xuXG4vKipcbiAqIEludm9rZSBjYWxsYmFjayB3aXRoIHRpbWVvdXQgZXJyb3IuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUudGltZW91dEVycm9yID0gZnVuY3Rpb24oKXtcbiAgdmFyIHRpbWVvdXQgPSB0aGlzLl90aW1lb3V0O1xuICB2YXIgZXJyID0gbmV3IEVycm9yKCd0aW1lb3V0IG9mICcgKyB0aW1lb3V0ICsgJ21zIGV4Y2VlZGVkJyk7XG4gIGVyci50aW1lb3V0ID0gdGltZW91dDtcbiAgdGhpcy5jYWxsYmFjayhlcnIpO1xufTtcblxuLyoqXG4gKiBFbmFibGUgdHJhbnNtaXNzaW9uIG9mIGNvb2tpZXMgd2l0aCB4LWRvbWFpbiByZXF1ZXN0cy5cbiAqXG4gKiBOb3RlIHRoYXQgZm9yIHRoaXMgdG8gd29yayB0aGUgb3JpZ2luIG11c3Qgbm90IGJlXG4gKiB1c2luZyBcIkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblwiIHdpdGggYSB3aWxkY2FyZCxcbiAqIGFuZCBhbHNvIG11c3Qgc2V0IFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHNcIlxuICogdG8gXCJ0cnVlXCIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS53aXRoQ3JlZGVudGlhbHMgPSBmdW5jdGlvbigpe1xuICB0aGlzLl93aXRoQ3JlZGVudGlhbHMgPSB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSW5pdGlhdGUgcmVxdWVzdCwgaW52b2tpbmcgY2FsbGJhY2sgYGZuKHJlcylgXG4gKiB3aXRoIGFuIGluc3RhbmNlb2YgYFJlc3BvbnNlYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgeGhyID0gdGhpcy54aHIgPSByZXF1ZXN0LmdldFhIUigpO1xuICB2YXIgcXVlcnkgPSB0aGlzLl9xdWVyeS5qb2luKCcmJyk7XG4gIHZhciB0aW1lb3V0ID0gdGhpcy5fdGltZW91dDtcbiAgdmFyIGRhdGEgPSB0aGlzLl9mb3JtRGF0YSB8fCB0aGlzLl9kYXRhO1xuXG4gIC8vIHN0b3JlIGNhbGxiYWNrXG4gIHRoaXMuX2NhbGxiYWNrID0gZm4gfHwgbm9vcDtcblxuICAvLyBzdGF0ZSBjaGFuZ2VcbiAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCl7XG4gICAgaWYgKDQgIT0geGhyLnJlYWR5U3RhdGUpIHJldHVybjtcblxuICAgIC8vIEluIElFOSwgcmVhZHMgdG8gYW55IHByb3BlcnR5IChlLmcuIHN0YXR1cykgb2ZmIG9mIGFuIGFib3J0ZWQgWEhSIHdpbGxcbiAgICAvLyByZXN1bHQgaW4gdGhlIGVycm9yIFwiQ291bGQgbm90IGNvbXBsZXRlIHRoZSBvcGVyYXRpb24gZHVlIHRvIGVycm9yIGMwMGMwMjNmXCJcbiAgICB2YXIgc3RhdHVzO1xuICAgIHRyeSB7IHN0YXR1cyA9IHhoci5zdGF0dXMgfSBjYXRjaChlKSB7IHN0YXR1cyA9IDA7IH1cblxuICAgIGlmICgwID09IHN0YXR1cykge1xuICAgICAgaWYgKHNlbGYudGltZWRvdXQpIHJldHVybiBzZWxmLnRpbWVvdXRFcnJvcigpO1xuICAgICAgaWYgKHNlbGYuYWJvcnRlZCkgcmV0dXJuO1xuICAgICAgcmV0dXJuIHNlbGYuY3Jvc3NEb21haW5FcnJvcigpO1xuICAgIH1cbiAgICBzZWxmLmVtaXQoJ2VuZCcpO1xuICB9O1xuXG4gIC8vIHByb2dyZXNzXG4gIHZhciBoYW5kbGVQcm9ncmVzcyA9IGZ1bmN0aW9uKGUpe1xuICAgIGlmIChlLnRvdGFsID4gMCkge1xuICAgICAgZS5wZXJjZW50ID0gZS5sb2FkZWQgLyBlLnRvdGFsICogMTAwO1xuICAgIH1cbiAgICBlLmRpcmVjdGlvbiA9ICdkb3dubG9hZCc7XG4gICAgc2VsZi5lbWl0KCdwcm9ncmVzcycsIGUpO1xuICB9O1xuICBpZiAodGhpcy5oYXNMaXN0ZW5lcnMoJ3Byb2dyZXNzJykpIHtcbiAgICB4aHIub25wcm9ncmVzcyA9IGhhbmRsZVByb2dyZXNzO1xuICB9XG4gIHRyeSB7XG4gICAgaWYgKHhoci51cGxvYWQgJiYgdGhpcy5oYXNMaXN0ZW5lcnMoJ3Byb2dyZXNzJykpIHtcbiAgICAgIHhoci51cGxvYWQub25wcm9ncmVzcyA9IGhhbmRsZVByb2dyZXNzO1xuICAgIH1cbiAgfSBjYXRjaChlKSB7XG4gICAgLy8gQWNjZXNzaW5nIHhoci51cGxvYWQgZmFpbHMgaW4gSUUgZnJvbSBhIHdlYiB3b3JrZXIsIHNvIGp1c3QgcHJldGVuZCBpdCBkb2Vzbid0IGV4aXN0LlxuICAgIC8vIFJlcG9ydGVkIGhlcmU6XG4gICAgLy8gaHR0cHM6Ly9jb25uZWN0Lm1pY3Jvc29mdC5jb20vSUUvZmVlZGJhY2svZGV0YWlscy84MzcyNDUveG1saHR0cHJlcXVlc3QtdXBsb2FkLXRocm93cy1pbnZhbGlkLWFyZ3VtZW50LXdoZW4tdXNlZC1mcm9tLXdlYi13b3JrZXItY29udGV4dFxuICB9XG5cbiAgLy8gdGltZW91dFxuICBpZiAodGltZW91dCAmJiAhdGhpcy5fdGltZXIpIHtcbiAgICB0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHNlbGYudGltZWRvdXQgPSB0cnVlO1xuICAgICAgc2VsZi5hYm9ydCgpO1xuICAgIH0sIHRpbWVvdXQpO1xuICB9XG5cbiAgLy8gcXVlcnlzdHJpbmdcbiAgaWYgKHF1ZXJ5KSB7XG4gICAgcXVlcnkgPSByZXF1ZXN0LnNlcmlhbGl6ZU9iamVjdChxdWVyeSk7XG4gICAgdGhpcy51cmwgKz0gfnRoaXMudXJsLmluZGV4T2YoJz8nKVxuICAgICAgPyAnJicgKyBxdWVyeVxuICAgICAgOiAnPycgKyBxdWVyeTtcbiAgfVxuXG4gIC8vIGluaXRpYXRlIHJlcXVlc3RcbiAgaWYgKHRoaXMudXNlcm5hbWUgJiYgdGhpcy5wYXNzd29yZCkge1xuICAgIHhoci5vcGVuKHRoaXMubWV0aG9kLCB0aGlzLnVybCwgdHJ1ZSwgdGhpcy51c2VybmFtZSwgdGhpcy5wYXNzd29yZCk7XG4gIH0gZWxzZSB7XG4gICAgeGhyLm9wZW4odGhpcy5tZXRob2QsIHRoaXMudXJsLCB0cnVlKTtcbiAgfVxuXG4gIC8vIENPUlNcbiAgaWYgKHRoaXMuX3dpdGhDcmVkZW50aWFscykgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWU7XG5cbiAgLy8gYm9keVxuICBpZiAoJ0dFVCcgIT0gdGhpcy5tZXRob2QgJiYgJ0hFQUQnICE9IHRoaXMubWV0aG9kICYmICdzdHJpbmcnICE9IHR5cGVvZiBkYXRhICYmICFpc0hvc3QoZGF0YSkpIHtcbiAgICAvLyBzZXJpYWxpemUgc3R1ZmZcbiAgICB2YXIgY29udGVudFR5cGUgPSB0aGlzLl9oZWFkZXJbJ2NvbnRlbnQtdHlwZSddO1xuICAgIHZhciBzZXJpYWxpemUgPSB0aGlzLl9wYXJzZXIgfHwgcmVxdWVzdC5zZXJpYWxpemVbY29udGVudFR5cGUgPyBjb250ZW50VHlwZS5zcGxpdCgnOycpWzBdIDogJyddO1xuICAgIGlmICghc2VyaWFsaXplICYmIGlzSlNPTihjb250ZW50VHlwZSkpIHNlcmlhbGl6ZSA9IHJlcXVlc3Quc2VyaWFsaXplWydhcHBsaWNhdGlvbi9qc29uJ107XG4gICAgaWYgKHNlcmlhbGl6ZSkgZGF0YSA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgfVxuXG4gIC8vIHNldCBoZWFkZXIgZmllbGRzXG4gIGZvciAodmFyIGZpZWxkIGluIHRoaXMuaGVhZGVyKSB7XG4gICAgaWYgKG51bGwgPT0gdGhpcy5oZWFkZXJbZmllbGRdKSBjb250aW51ZTtcbiAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihmaWVsZCwgdGhpcy5oZWFkZXJbZmllbGRdKTtcbiAgfVxuXG4gIGlmICh0aGlzLl9yZXNwb25zZVR5cGUpIHtcbiAgICB4aHIucmVzcG9uc2VUeXBlID0gdGhpcy5fcmVzcG9uc2VUeXBlO1xuICB9XG5cbiAgLy8gc2VuZCBzdHVmZlxuICB0aGlzLmVtaXQoJ3JlcXVlc3QnLCB0aGlzKTtcblxuICAvLyBJRTExIHhoci5zZW5kKHVuZGVmaW5lZCkgc2VuZHMgJ3VuZGVmaW5lZCcgc3RyaW5nIGFzIFBPU1QgcGF5bG9hZCAoaW5zdGVhZCBvZiBub3RoaW5nKVxuICAvLyBXZSBuZWVkIG51bGwgaGVyZSBpZiBkYXRhIGlzIHVuZGVmaW5lZFxuICB4aHIuc2VuZCh0eXBlb2YgZGF0YSAhPT0gJ3VuZGVmaW5lZCcgPyBkYXRhIDogbnVsbCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIEV4cG9zZSBgUmVxdWVzdGAuXG4gKi9cblxucmVxdWVzdC5SZXF1ZXN0ID0gUmVxdWVzdDtcblxuLyoqXG4gKiBHRVQgYHVybGAgd2l0aCBvcHRpb25hbCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZHxGdW5jdGlvbn0gZGF0YSBvciBmblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QuZ2V0ID0gZnVuY3Rpb24odXJsLCBkYXRhLCBmbil7XG4gIHZhciByZXEgPSByZXF1ZXN0KCdHRVQnLCB1cmwpO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgZGF0YSkgZm4gPSBkYXRhLCBkYXRhID0gbnVsbDtcbiAgaWYgKGRhdGEpIHJlcS5xdWVyeShkYXRhKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG5cbi8qKlxuICogSEVBRCBgdXJsYCB3aXRoIG9wdGlvbmFsIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfEZ1bmN0aW9ufSBkYXRhIG9yIGZuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5oZWFkID0gZnVuY3Rpb24odXJsLCBkYXRhLCBmbil7XG4gIHZhciByZXEgPSByZXF1ZXN0KCdIRUFEJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEuc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG5cbi8qKlxuICogREVMRVRFIGB1cmxgIHdpdGggb3B0aW9uYWwgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBkZWwodXJsLCBmbil7XG4gIHZhciByZXEgPSByZXF1ZXN0KCdERUxFVEUnLCB1cmwpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcblxucmVxdWVzdFsnZGVsJ10gPSBkZWw7XG5yZXF1ZXN0WydkZWxldGUnXSA9IGRlbDtcblxuLyoqXG4gKiBQQVRDSCBgdXJsYCB3aXRoIG9wdGlvbmFsIGBkYXRhYCBhbmQgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR9IGRhdGFcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LnBhdGNoID0gZnVuY3Rpb24odXJsLCBkYXRhLCBmbil7XG4gIHZhciByZXEgPSByZXF1ZXN0KCdQQVRDSCcsIHVybCk7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiBkYXRhKSBmbiA9IGRhdGEsIGRhdGEgPSBudWxsO1xuICBpZiAoZGF0YSkgcmVxLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxLmVuZChmbik7XG4gIHJldHVybiByZXE7XG59O1xuXG4vKipcbiAqIFBPU1QgYHVybGAgd2l0aCBvcHRpb25hbCBgZGF0YWAgYW5kIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfSBkYXRhXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5wb3N0ID0gZnVuY3Rpb24odXJsLCBkYXRhLCBmbil7XG4gIHZhciByZXEgPSByZXF1ZXN0KCdQT1NUJywgdXJsKTtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGRhdGEpIGZuID0gZGF0YSwgZGF0YSA9IG51bGw7XG4gIGlmIChkYXRhKSByZXEuc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXEuZW5kKGZuKTtcbiAgcmV0dXJuIHJlcTtcbn07XG5cbi8qKlxuICogUFVUIGB1cmxgIHdpdGggb3B0aW9uYWwgYGRhdGFgIGFuZCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZHxGdW5jdGlvbn0gZGF0YSBvciBmblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QucHV0ID0gZnVuY3Rpb24odXJsLCBkYXRhLCBmbil7XG4gIHZhciByZXEgPSByZXF1ZXN0KCdQVVQnLCB1cmwpO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgZGF0YSkgZm4gPSBkYXRhLCBkYXRhID0gbnVsbDtcbiAgaWYgKGRhdGEpIHJlcS5zZW5kKGRhdGEpO1xuICBpZiAoZm4pIHJlcS5lbmQoZm4pO1xuICByZXR1cm4gcmVxO1xufTtcbiIsIi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYW4gb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBpc09iamVjdChvYmopIHtcbiAgcmV0dXJuIG51bGwgIT0gb2JqICYmICdvYmplY3QnID09IHR5cGVvZiBvYmo7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3Q7XG4iLCIvKipcbiAqIE1vZHVsZSBvZiBtaXhlZC1pbiBmdW5jdGlvbnMgc2hhcmVkIGJldHdlZW4gbm9kZSBhbmQgY2xpZW50IGNvZGVcbiAqL1xudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9pcy1vYmplY3QnKTtcblxuLyoqXG4gKiBDbGVhciBwcmV2aW91cyB0aW1lb3V0LlxuICpcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmNsZWFyVGltZW91dCA9IGZ1bmN0aW9uIF9jbGVhclRpbWVvdXQoKXtcbiAgdGhpcy5fdGltZW91dCA9IDA7XG4gIGNsZWFyVGltZW91dCh0aGlzLl90aW1lcik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBGb3JjZSBnaXZlbiBwYXJzZXJcbiAqXG4gKiBTZXRzIHRoZSBib2R5IHBhcnNlciBubyBtYXR0ZXIgdHlwZS5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24gcGFyc2UoZm4pe1xuICB0aGlzLl9wYXJzZXIgPSBmbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0aW1lb3V0IHRvIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy50aW1lb3V0ID0gZnVuY3Rpb24gdGltZW91dChtcyl7XG4gIHRoaXMuX3RpbWVvdXQgPSBtcztcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEZhdXggcHJvbWlzZSBzdXBwb3J0XG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVsZmlsbFxuICogQHBhcmFtIHtGdW5jdGlvbn0gcmVqZWN0XG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICovXG5cbmV4cG9ydHMudGhlbiA9IGZ1bmN0aW9uIHRoZW4oZnVsZmlsbCwgcmVqZWN0KSB7XG4gIHJldHVybiB0aGlzLmVuZChmdW5jdGlvbihlcnIsIHJlcykge1xuICAgIGVyciA/IHJlamVjdChlcnIpIDogZnVsZmlsbChyZXMpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBBbGxvdyBmb3IgZXh0ZW5zaW9uXG4gKi9cblxuZXhwb3J0cy51c2UgPSBmdW5jdGlvbiB1c2UoZm4pIHtcbiAgZm4odGhpcyk7XG4gIHJldHVybiB0aGlzO1xufVxuXG5cbi8qKlxuICogR2V0IHJlcXVlc3QgaGVhZGVyIGBmaWVsZGAuXG4gKiBDYXNlLWluc2Vuc2l0aXZlLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmdldCA9IGZ1bmN0aW9uKGZpZWxkKXtcbiAgcmV0dXJuIHRoaXMuX2hlYWRlcltmaWVsZC50b0xvd2VyQ2FzZSgpXTtcbn07XG5cbi8qKlxuICogR2V0IGNhc2UtaW5zZW5zaXRpdmUgaGVhZGVyIGBmaWVsZGAgdmFsdWUuXG4gKiBUaGlzIGlzIGEgZGVwcmVjYXRlZCBpbnRlcm5hbCBBUEkuIFVzZSBgLmdldChmaWVsZClgIGluc3RlYWQuXG4gKlxuICogKGdldEhlYWRlciBpcyBubyBsb25nZXIgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBzdXBlcmFnZW50IGNvZGUgYmFzZSlcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICogQGRlcHJlY2F0ZWRcbiAqL1xuXG5leHBvcnRzLmdldEhlYWRlciA9IGV4cG9ydHMuZ2V0O1xuXG4vKipcbiAqIFNldCBoZWFkZXIgYGZpZWxkYCB0byBgdmFsYCwgb3IgbXVsdGlwbGUgZmllbGRzIHdpdGggb25lIG9iamVjdC5cbiAqIENhc2UtaW5zZW5zaXRpdmUuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAuc2V0KCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpXG4gKiAgICAgICAgLnNldCgnWC1BUEktS2V5JywgJ2Zvb2JhcicpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAuc2V0KHsgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicsICdYLUFQSS1LZXknOiAnZm9vYmFyJyB9KVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gZmllbGRcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLnNldCA9IGZ1bmN0aW9uKGZpZWxkLCB2YWwpe1xuICBpZiAoaXNPYmplY3QoZmllbGQpKSB7XG4gICAgZm9yICh2YXIga2V5IGluIGZpZWxkKSB7XG4gICAgICB0aGlzLnNldChrZXksIGZpZWxkW2tleV0pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICB0aGlzLl9oZWFkZXJbZmllbGQudG9Mb3dlckNhc2UoKV0gPSB2YWw7XG4gIHRoaXMuaGVhZGVyW2ZpZWxkXSA9IHZhbDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJlbW92ZSBoZWFkZXIgYGZpZWxkYC5cbiAqIENhc2UtaW5zZW5zaXRpdmUuXG4gKlxuICogRXhhbXBsZTpcbiAqXG4gKiAgICAgIHJlcS5nZXQoJy8nKVxuICogICAgICAgIC51bnNldCgnVXNlci1BZ2VudCcpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpZWxkXG4gKi9cbmV4cG9ydHMudW5zZXQgPSBmdW5jdGlvbihmaWVsZCl7XG4gIGRlbGV0ZSB0aGlzLl9oZWFkZXJbZmllbGQudG9Mb3dlckNhc2UoKV07XG4gIGRlbGV0ZSB0aGlzLmhlYWRlcltmaWVsZF07XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBXcml0ZSB0aGUgZmllbGQgYG5hbWVgIGFuZCBgdmFsYCBmb3IgXCJtdWx0aXBhcnQvZm9ybS1kYXRhXCJcbiAqIHJlcXVlc3QgYm9kaWVzLlxuICpcbiAqIGBgYCBqc1xuICogcmVxdWVzdC5wb3N0KCcvdXBsb2FkJylcbiAqICAgLmZpZWxkKCdmb28nLCAnYmFyJylcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtTdHJpbmd8QmxvYnxGaWxlfEJ1ZmZlcnxmcy5SZWFkU3RyZWFtfSB2YWxcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuZXhwb3J0cy5maWVsZCA9IGZ1bmN0aW9uKG5hbWUsIHZhbCkge1xuICB0aGlzLl9nZXRGb3JtRGF0YSgpLmFwcGVuZChuYW1lLCB2YWwpO1xuICByZXR1cm4gdGhpcztcbn07XG4iLCIvLyBUaGUgbm9kZSBhbmQgYnJvd3NlciBtb2R1bGVzIGV4cG9zZSB2ZXJzaW9ucyBvZiB0aGlzIHdpdGggdGhlXG4vLyBhcHByb3ByaWF0ZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiBib3VuZCBhcyBmaXJzdCBhcmd1bWVudFxuLyoqXG4gKiBJc3N1ZSBhIHJlcXVlc3Q6XG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgcmVxdWVzdCgnR0VUJywgJy91c2VycycpLmVuZChjYWxsYmFjaylcbiAqICAgIHJlcXVlc3QoJy91c2VycycpLmVuZChjYWxsYmFjaylcbiAqICAgIHJlcXVlc3QoJy91c2VycycsIGNhbGxiYWNrKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXRob2RcbiAqIEBwYXJhbSB7U3RyaW5nfEZ1bmN0aW9ufSB1cmwgb3IgY2FsbGJhY2tcbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHJlcXVlc3QoUmVxdWVzdENvbnN0cnVjdG9yLCBtZXRob2QsIHVybCkge1xuICAvLyBjYWxsYmFja1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgdXJsKSB7XG4gICAgcmV0dXJuIG5ldyBSZXF1ZXN0Q29uc3RydWN0b3IoJ0dFVCcsIG1ldGhvZCkuZW5kKHVybCk7XG4gIH1cblxuICAvLyB1cmwgZmlyc3RcbiAgaWYgKDIgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIHJldHVybiBuZXcgUmVxdWVzdENvbnN0cnVjdG9yKCdHRVQnLCBtZXRob2QpO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBSZXF1ZXN0Q29uc3RydWN0b3IobWV0aG9kLCB1cmwpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVlc3Q7XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJBdXRoID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5hdXRoJywgW10pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0F1dGgnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJBdXRoKSB7XG4gICAgICBJb25pY0FuZ3VsYXJBdXRoID0gSW9uaWMuQXV0aDtcbiAgICB9XG4gICAgcmV0dXJuIElvbmljQW5ndWxhckF1dGg7XG4gIH1dKTtcbn1cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG4gIGFuZ3VsYXIubW9kdWxlKCdpb25pYy5zZXJ2aWNlLmNvcmUnLCBbXSlcblxuICAvKipcbiAgICogQHByaXZhdGVcbiAgICogUHJvdmlkZXMgYSBzYWZlIGludGVyZmFjZSB0byBzdG9yZSBvYmplY3RzIGluIHBlcnNpc3RlbnQgbWVtb3J5XG4gICAqL1xuICAucHJvdmlkZXIoJ3BlcnNpc3RlbnRTdG9yYWdlJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICckZ2V0JzogW2Z1bmN0aW9uKCkge1xuICAgICAgICB2YXIgc3RvcmFnZSA9IElvbmljLmdldFNlcnZpY2UoJ1N0b3JhZ2UnKTtcbiAgICAgICAgaWYgKCFzdG9yYWdlKSB7XG4gICAgICAgICAgc3RvcmFnZSA9IG5ldyBJb25pYy5JTy5TdG9yYWdlKCk7XG4gICAgICAgICAgSW9uaWMuYWRkU2VydmljZSgnU3RvcmFnZScsIHN0b3JhZ2UsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdG9yYWdlO1xuICAgICAgfV1cbiAgICB9O1xuICB9KVxuXG4gIC5mYWN0b3J5KCckaW9uaWNDb3JlU2V0dGluZ3MnLCBbXG4gICAgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gSW9uaWMuSU8uQ29uZmlnO1xuICAgIH1cbiAgXSlcblxuICAuZmFjdG9yeSgnJGlvbmljVXNlcicsIFtcbiAgICBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBJb25pYy5Vc2VyO1xuICAgIH1cbiAgXSlcblxuICAucnVuKFtmdW5jdGlvbigpIHtcbiAgICBJb25pYy5pbygpO1xuICB9XSk7XG59XG5cbiIsIi8vIEFkZCBBbmd1bGFyIGludGVncmF0aW9ucyBpZiBBbmd1bGFyIGlzIGF2YWlsYWJsZVxuaWYgKCh0eXBlb2YgYW5ndWxhciA9PT0gJ29iamVjdCcpICYmIGFuZ3VsYXIubW9kdWxlKSB7XG5cbiAgdmFyIElvbmljQW5ndWxhckRlcGxveSA9IG51bGw7XG5cbiAgYW5ndWxhci5tb2R1bGUoJ2lvbmljLnNlcnZpY2UuZGVwbG95JywgW10pXG5cbiAgLmZhY3RvcnkoJyRpb25pY0RlcGxveScsIFtmdW5jdGlvbigpIHtcbiAgICBpZiAoIUlvbmljQW5ndWxhckRlcGxveSkge1xuICAgICAgSW9uaWNBbmd1bGFyRGVwbG95ID0gbmV3IElvbmljLkRlcGxveSgpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyRGVwbG95O1xuICB9XSk7XG59XG4iLCJ2YXIgQXBwID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9hcHBcIikuQXBwO1xudmFyIEF1dGggPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9hdXRoL2F1dGhcIikuQXV0aDtcbnZhciBDb25maWcgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL2NvbmZpZ1wiKS5Db25maWc7XG52YXIgRGF0YVR5cGUgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL2RhdGEtdHlwZXNcIikuRGF0YVR5cGU7XG52YXIgRGVwbG95ID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvZGVwbG95L2RlcGxveVwiKS5EZXBsb3k7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9ldmVudHNcIikuRXZlbnRFbWl0dGVyO1xudmFyIElvbmljUGxhdGZvcm0gPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL2NvcmVcIikuSW9uaWNQbGF0Zm9ybTtcbnZhciBMb2dnZXIgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL2xvZ2dlclwiKS5Mb2dnZXI7XG52YXIgUHVzaCA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L3B1c2gvcHVzaFwiKS5QdXNoO1xudmFyIFB1c2hNZXNzYWdlID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvcHVzaC9wdXNoLW1lc3NhZ2VcIikuUHVzaE1lc3NhZ2U7XG52YXIgUHVzaFRva2VuID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvcHVzaC9wdXNoLXRva2VuXCIpLlB1c2hUb2tlbjtcbnZhciBTdG9yYWdlID0gcmVxdWlyZShcIi4vLi4vZGlzdC9lczUvY29yZS9zdG9yYWdlXCIpLlN0b3JhZ2U7XG52YXIgVXNlciA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvdXNlclwiKS5Vc2VyO1xudmFyIHByb21pc2UgPSByZXF1aXJlKFwiLi8uLi9kaXN0L2VzNS9jb3JlL3Byb21pc2VcIik7XG52YXIgcmVxdWVzdCA9IHJlcXVpcmUoXCIuLy4uL2Rpc3QvZXM1L2NvcmUvcmVxdWVzdFwiKTtcblxuLy8gRGVjbGFyZSB0aGUgd2luZG93IG9iamVjdFxud2luZG93LklvbmljID0gd2luZG93LklvbmljIHx8IHt9O1xuXG4vLyBJb25pYyBNb2R1bGVzXG5Jb25pYy5Db3JlID0gSW9uaWNQbGF0Zm9ybTtcbklvbmljLlVzZXIgPSBVc2VyO1xuSW9uaWMuQXV0aCA9IEF1dGg7XG5Jb25pYy5EZXBsb3kgPSBEZXBsb3k7XG5Jb25pYy5QdXNoID0gUHVzaDtcbklvbmljLlB1c2hUb2tlbiA9IFB1c2hUb2tlbjtcbklvbmljLlB1c2hNZXNzYWdlID0gUHVzaE1lc3NhZ2U7XG5cbi8vIERhdGFUeXBlIE5hbWVzcGFjZVxuSW9uaWMuRGF0YVR5cGUgPSBEYXRhVHlwZTtcbklvbmljLkRhdGFUeXBlcyA9IERhdGFUeXBlLmdldE1hcHBpbmcoKTtcblxuLy8gSU8gTmFtZXNwYWNlXG5Jb25pYy5JTyA9IHt9O1xuSW9uaWMuSU8uQXBwID0gQXBwO1xuSW9uaWMuSU8uRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuSW9uaWMuSU8uTG9nZ2VyID0gTG9nZ2VyO1xuSW9uaWMuSU8uUHJvbWlzZSA9IHByb21pc2UuUHJvbWlzZTtcbklvbmljLklPLkRlZmVycmVkUHJvbWlzZSA9IHByb21pc2UuRGVmZXJyZWRQcm9taXNlO1xuSW9uaWMuSU8uUmVxdWVzdCA9IHJlcXVlc3QuUmVxdWVzdDtcbklvbmljLklPLlJlc3BvbnNlID0gcmVxdWVzdC5SZXNwb25zZTtcbklvbmljLklPLkFQSVJlcXVlc3QgPSByZXF1ZXN0LkFQSVJlcXVlc3Q7XG5Jb25pYy5JTy5BUElSZXNwb25zZSA9IHJlcXVlc3QuQVBJUmVzcG9uc2U7XG5Jb25pYy5JTy5TdG9yYWdlID0gU3RvcmFnZTtcbklvbmljLklPLkNvbmZpZyA9IENvbmZpZztcblxuLy8gUHJvdmlkZXIgYSBzaW5nbGUgc3RvcmFnZSBmb3Igc2VydmljZXMgdGhhdCBoYXZlIHByZXZpb3VzbHkgYmVlbiByZWdpc3RlcmVkXG52YXIgc2VydmljZVN0b3JhZ2UgPSB7fTtcblxuSW9uaWMuaW8gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIElvbmljLkNvcmU7XG59O1xuXG5Jb25pYy5nZXRTZXJ2aWNlID0gZnVuY3Rpb24obmFtZSkge1xuICBpZiAodHlwZW9mIHNlcnZpY2VTdG9yYWdlW25hbWVdID09PSAndW5kZWZpbmVkJyB8fCAhc2VydmljZVN0b3JhZ2VbbmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHNlcnZpY2VTdG9yYWdlW25hbWVdO1xufTtcblxuSW9uaWMuYWRkU2VydmljZSA9IGZ1bmN0aW9uKG5hbWUsIHNlcnZpY2UsIGZvcmNlKSB7XG4gIGlmIChzZXJ2aWNlICYmIHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBzZXJ2aWNlU3RvcmFnZVtuYW1lXSA9IHNlcnZpY2U7XG4gIH0gZWxzZSBpZiAoc2VydmljZSAmJiBmb3JjZSkge1xuICAgIHNlcnZpY2VTdG9yYWdlW25hbWVdID0gc2VydmljZTtcbiAgfVxufTtcblxuSW9uaWMucmVtb3ZlU2VydmljZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgaWYgKHR5cGVvZiBzZXJ2aWNlU3RvcmFnZVtuYW1lXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBkZWxldGUgc2VydmljZVN0b3JhZ2VbbmFtZV07XG4gIH1cbn07XG4iLCIvLyBBZGQgQW5ndWxhciBpbnRlZ3JhdGlvbnMgaWYgQW5ndWxhciBpcyBhdmFpbGFibGVcbmlmICgodHlwZW9mIGFuZ3VsYXIgPT09ICdvYmplY3QnKSAmJiBhbmd1bGFyLm1vZHVsZSkge1xuXG4gIHZhciBJb25pY0FuZ3VsYXJQdXNoID0gbnVsbDtcblxuICBhbmd1bGFyLm1vZHVsZSgnaW9uaWMuc2VydmljZS5wdXNoJywgW10pXG5cbiAgLyoqXG4gICAqIElvbmljUHVzaEFjdGlvbiBTZXJ2aWNlXG4gICAqXG4gICAqIEEgdXRpbGl0eSBzZXJ2aWNlIHRvIGtpY2sgb2ZmIG1pc2MgZmVhdHVyZXMgYXMgcGFydCBvZiB0aGUgSW9uaWMgUHVzaCBzZXJ2aWNlXG4gICAqL1xuICAuZmFjdG9yeSgnJGlvbmljUHVzaEFjdGlvbicsIFsnJHN0YXRlJywgZnVuY3Rpb24oJHN0YXRlKSB7XG5cbiAgICBmdW5jdGlvbiBQdXNoQWN0aW9uU2VydmljZSgpIHt9XG5cbiAgICAvKipcbiAgICAgKiBTdGF0ZSBOYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKiBBdHRlbXB0cyB0byBuYXZpZ2F0ZSB0byBhIG5ldyB2aWV3IGlmIGEgcHVzaCBub3RpZmljYXRpb24gcGF5bG9hZCBjb250YWluczpcbiAgICAgKlxuICAgICAqICAgLSAkc3RhdGUge1N0cmluZ30gVGhlIHN0YXRlIG5hbWUgKGUuZyAndGFiLmNoYXRzJylcbiAgICAgKiAgIC0gJHN0YXRlUGFyYW1zIHtPYmplY3R9IFByb3ZpZGVkIHN0YXRlICh1cmwpIHBhcmFtc1xuICAgICAqXG4gICAgICogRmluZCBtb3JlIGluZm8gYWJvdXQgc3RhdGUgbmF2aWdhdGlvbiBhbmQgcGFyYW1zOlxuICAgICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyLXVpL3VpLXJvdXRlci93aWtpXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gbm90aWZpY2F0aW9uIE5vdGlmaWNhdGlvbiBPYmplY3RcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIFB1c2hBY3Rpb25TZXJ2aWNlLnByb3RvdHlwZS5ub3RpZmljYXRpb25OYXZpZ2F0aW9uID0gZnVuY3Rpb24obm90aWZpY2F0aW9uKSB7XG4gICAgICB2YXIgc3RhdGUgPSBub3RpZmljYXRpb24ucGF5bG9hZC4kc3RhdGUgfHwgZmFsc2U7XG4gICAgICB2YXIgc3RhdGVQYXJhbXMgPSBub3RpZmljYXRpb24ucGF5bG9hZC4kc3RhdGVQYXJhbXMgfHwge307XG4gICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgJHN0YXRlLmdvKHN0YXRlLCBzdGF0ZVBhcmFtcyk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBuZXcgUHVzaEFjdGlvblNlcnZpY2UoKTtcbiAgfV0pXG5cbiAgLmZhY3RvcnkoJyRpb25pY1B1c2gnLCBbZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFJb25pY0FuZ3VsYXJQdXNoKSB7XG4gICAgICBJb25pY0FuZ3VsYXJQdXNoID0gbmV3IElvbmljLlB1c2goXCJERUZFUl9JTklUXCIpO1xuICAgIH1cbiAgICByZXR1cm4gSW9uaWNBbmd1bGFyUHVzaDtcbiAgfV0pXG5cbiAgLnJ1bihbJyRpb25pY1B1c2gnLCAnJGlvbmljUHVzaEFjdGlvbicsIGZ1bmN0aW9uKCRpb25pY1B1c2gsICRpb25pY1B1c2hBY3Rpb24pIHtcbiAgICAvLyBUaGlzIGlzIHdoYXQga2lja3Mgb2ZmIHRoZSBzdGF0ZSByZWRpcmVjdGlvbiB3aGVuIGEgcHVzaCBub3RpZmljYWl0b24gaGFzIHRoZSByZWxldmFudCBkZXRhaWxzXG4gICAgJGlvbmljUHVzaC5fZW1pdHRlci5vbignaW9uaWNfcHVzaDpwcm9jZXNzTm90aWZpY2F0aW9uJywgZnVuY3Rpb24obm90aWZpY2F0aW9uKSB7XG4gICAgICBub3RpZmljYXRpb24gPSBJb25pYy5QdXNoTWVzc2FnZS5mcm9tUGx1Z2luSlNPTihub3RpZmljYXRpb24pO1xuICAgICAgaWYgKG5vdGlmaWNhdGlvbiAmJiBub3RpZmljYXRpb24uYXBwKSB7XG4gICAgICAgIGlmIChub3RpZmljYXRpb24uYXBwLmFzbGVlcCA9PT0gdHJ1ZSB8fCBub3RpZmljYXRpb24uYXBwLmNsb3NlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICRpb25pY1B1c2hBY3Rpb24ubm90aWZpY2F0aW9uTmF2aWdhdGlvbihub3RpZmljYXRpb24pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgfV0pO1xufVxuIl19
