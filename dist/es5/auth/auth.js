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
