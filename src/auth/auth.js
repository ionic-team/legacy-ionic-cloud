import { APIRequest } from "../core/request";
import { DeferredPromise } from "../core/promise";
import { Settings } from "../core/settings";
import { PlatformLocalStorageStrategy, LocalSessionStorageStrategy } from "../core/storage";

var settings = new Settings();
var storage = new PlatformLocalStorageStrategy();
var sessionStorage = new LocalSessionStorageStrategy();

var __authModules = {};
var __authToken = null;

var authAPIBase = settings.getURL('platform-api') + '/auth';
var authAPIEndpoints = {
  'login': function() {
    return authAPIBase + '/login';
  },
  'signup': function() {
    return authAPIBase + '/users';
  },
  'facebookLogin': function() {
    return authAPIBase + '/login/facebook';
  },
  'googleLogin': function() {
    return authAPIBase + '/login/google';
  },
  'instagramLogin': function() {
    return authAPIBase + '/login/instagram';
  },
  'linkedinLogin': function() {
    return authAPIBase + '/login/linkedin';
  },
  'twitterLogin': function() {
    return authAPIBase + '/login/twitter';
  }
};

class TempTokenContext {

  static get label() {
    return "ionic_io_auth_" + settings.get('app_id');
  }

  static delete() {
    sessionStorage.remove(TempTokenContext.label);
  }

  static store() {
    sessionStorage.set(TempTokenContext.label, __authToken);
  }

  static getRawData() {
    return sessionStorage.get(TempTokenContext.label) || false;
  }
}

class TokenContext {
  static get label() {
    return "ionic_io_auth_" + settings.get('app_id');
  }

  static delete() {
    storage.remove(TokenContext.label);
  }

  static store() {
    storage.set(TokenContext.label, __authToken);
  }

  static getRawData() {
    return storage.get(TokenContext.label) || false;
  }
}

function storeToken(options, token) {
  __authToken = token;
  if (typeof options === 'object' && options.remember) {
    TokenContext.store();
  } else {
    TempTokenContext.store();
  }
}

class InAppBrowserFlow {
  constructor(test) {
    
  }
}

export class Auth {

  static isAuthenticated() {
    var token = TokenContext.getRawData();
    var tempToken = TempTokenContext.getRawData();
    if (tempToken || token) {
      return true;
    }
    return false;
  }

  static login(moduleId, options, data) {
    var context = __authModules[moduleId] || false;
    if (!context) {
      throw new Error("Authentication class is invalid or missing:" + context);
    }

    if (typeof options === 'object' && options.remember) {
      TempTokenContext.store();
    } else {
      TempTokenContext.delete();
    }
    return context.authenticate.apply(context, [options, data]);
  }

  static signup(data) {
    var context = __authModules.basic || false;
    if (!context) {
      throw new Error("Authentication class is invalid or missing:" + context);
    }
    return context.signup.apply(context, [data]);
  }

  static logout() {
    TokenContext.delete();
    TempTokenContext.delete();
  }

  static register(moduleId, module) {
    if (!__authModules[moduleId]) {
      __authModules[moduleId] = module;
    }
  }

}


class BasicAuth {

  static authenticate(options, data) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.login(),
      'method': 'POST',
      'json': true,
      'headers': {
        'Accept': 'application/json'
      },
      'form': {
        'app_id': settings.get('app_id'),
        'email': data.email,
        'password': data.password
      }
    }).then(function(data) {
      storeToken(options, data.payload.data.token);
      deferred.resolve(true);
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }

  static signup(data) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.signup(),
      'method': 'POST',
      'json': true,
      'headers': {
        'Accept': 'application/json'
      },
      'form': {
        'app_id': settings.get('app_id'),
        'email': data.email,
        'password': data.password
      }
    }).then(function() {
      deferred.resolve(true);
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }
}

class TwitterAuth {

  static authenticate(options) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.twitterLogin(),
      'method': 'POST',
      'json': true,
      'form': {
        'app_id': settings.get('app_id'),
        'callback': window.location.href
      }
    }).then(function(data) {
      var loc = data.payload.data.url;
      var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no');
      tempBrowser.addEventListener('loadstart', function(data) {
        if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
          var queryString = data.url.split('?')[1];
          var paramParts = queryString.split('&');
          var params = {};
          for (var i = 0; i < paramParts.length; i++) {
            var part = paramParts[i].split('=');
            params[part[0]] = part[1];
          }
          storeToken(options, params.token);
          tempBrowser.close();
          deferred.resolve(true);
        }
      });
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }
}

class FacebookAuth {

  static authenticate(options) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.facebookLogin(),
      'method': 'POST',
      'json': true,
      'form': {
        'app_id': settings.get('app_id')
      }
    }).then(function(data) {
      var loc = data.payload.data.url;
      var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no');
      tempBrowser.addEventListener('loadstart', function(data) {
        if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
          var queryString = data.url.split('?')[1];
          var paramParts = queryString.split('&');
          var params = {};
          for (var i = 0; i < paramParts.length; i++) {
            var part = paramParts[i].split('=');
            params[part[0]] = part[1];
          }
          storeToken(options, params.token);
          tempBrowser.close();
          deferred.resolve(true);
        }
      });
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }
}

class GoogleAuth {

  static authenticate(options) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.googleLogin(),
      'method': 'POST',
      'json': true,
      'form': {
        'app_id': settings.get('app_id')
      }
    }).then(function(data) {
      var loc = data.payload.data.url;
      var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no');
      tempBrowser.addEventListener('loadstart', function(data) {
        if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
          var queryString = data.url.split('?')[1];
          var paramParts = queryString.split('&');
          var params = {};
          for (var i = 0; i < paramParts.length; i++) {
            var part = paramParts[i].split('=');
            params[part[0]] = part[1];
          }
          storeToken(options, params.token);
          tempBrowser.close();
          deferred.resolve(true);
        }
      });
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }
}


class InstagramAuth {

  static authenticate(options) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.instagramLogin(),
      'method': 'POST',
      'json': true,
      'form': {
        'app_id': settings.get('app_id')
      }
    }).then(function(data) {
      var loc = data.payload.data.url;
      var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no');
      tempBrowser.addEventListener('loadstart', function(data) {
        if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
          var queryString = data.url.split('?')[1];
          var paramParts = queryString.split('&');
          var params = {};
          for (var i = 0; i < paramParts.length; i++) {
            var part = paramParts[i].split('=');
            params[part[0]] = part[1];
          }
          storeToken(options, params.token);
          tempBrowser.close();
          deferred.resolve(true);
        }
      });
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }
}

class LinkedInAuth {

  static authenticate(options) {
    var deferred = new DeferredPromise();

    new APIRequest({
      'uri': authAPIEndpoints.linkedinLogin(),
      'method': 'POST',
      'json': true,
      'form': {
        'app_id': settings.get('app_id')
      }
    }).then(function(data) {
      var loc = data.payload.data.url;
      var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no');
      tempBrowser.addEventListener('loadstart', function(data) {
        if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
          var queryString = data.url.split('?')[1];
          var paramParts = queryString.split('&');
          var params = {};
          for (var i = 0; i < paramParts.length; i++) {
            var part = paramParts[i].split('=');
            params[part[0]] = part[1];
          }
          storeToken(options, params.token);
          tempBrowser.close();
          deferred.resolve(true);
        }
      });
    }, function(err) {
      console.log('error');
      console.log(err);
      deferred.reject(false);
    });

    return deferred.promise;
  }
}

Auth.register('basic', BasicAuth);
Auth.register('facebook', FacebookAuth);
Auth.register('google', GoogleAuth);
Auth.register('instagram', InstagramAuth);
Auth.register('linkedin', LinkedInAuth);
Auth.register('twitter', TwitterAuth);
