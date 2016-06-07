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
