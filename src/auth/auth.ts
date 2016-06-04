import { Client } from '../core/client';
import { PromiseWithNotify, DeferredPromise } from '../core/promise';
import { IonicPlatform } from '../core/core';
import { PlatformLocalStorageStrategy, LocalSessionStorageStrategy } from '../core/storage';
import { User } from '../core/user';

declare var window: any;

var storage = new PlatformLocalStorageStrategy();
var sessionStorage = new LocalSessionStorageStrategy();

var authModules: Object = {};
var authToken: string;

export class TempTokenContext {

  static get label() {
    return 'ionic_io_auth_' + IonicPlatform.config.get('app_id');
  }

  static delete() {
    sessionStorage.remove(TempTokenContext.label);
  }

  static store() {
    sessionStorage.set(TempTokenContext.label, authToken);
  }

  static getRawData() {
    return sessionStorage.get(TempTokenContext.label) || false;
  }
}

export class TokenContext {
  static get label() {
    return 'ionic_io_auth_' + IonicPlatform.config.get('app_id');
  }

  static delete() {
    storage.remove(TokenContext.label);
  }

  static store() {
    storage.set(TokenContext.label, authToken);
  }

  static getRawData() {
    return storage.get(TokenContext.label) || false;
  }
}

export interface LoginOptions {
  remember?: boolean;
}

function storeToken(options: LoginOptions = {}, token: string) {
  let originalToken = authToken;
  authToken = token;
  if (options.remember) {
    TokenContext.store();
  } else {
    TempTokenContext.store();
  }
}

function getAuthErrorDetails(err) {
  var details = [];
  try {
    details = err.response.body.error.details;
  } catch (e) { e; }
  return details;
}

export class Auth {

  static isAuthenticated(): boolean {
    var token = TokenContext.getRawData();
    var tempToken = TempTokenContext.getRawData();
    if (tempToken || token) {
      return true;
    }
    return false;
  }

  static login(moduleId, options: LoginOptions = {}, data): PromiseWithNotify<User> {
    var deferred = new DeferredPromise<User>();
    var context = authModules[moduleId] || false;
    if (!context) {
      throw new Error('Authentication class is invalid or missing:' + context);
    }
    context.authenticate.apply(context, [options, data]).then(function() {
      User.self().then(function(user) {
        deferred.resolve(user);
      }, function(err) {
        deferred.reject(err);
      });
    }, function(err) {
      deferred.reject(err);
    });
    return deferred.promise;
  }

  static signup(data) {
    var context = authModules['basic'] || false;
    if (!context) {
      throw new Error('Authentication class is invalid or missing:' + context);
    }
    return context.signup.apply(context, [data]);
  }

  static logout(): void {
    TokenContext.delete();
    TempTokenContext.delete();
  }

  static register(moduleId, module): void {
    if (!authModules[moduleId]) {
      authModules[moduleId] = module;
    }
  }

  static getUserToken() {
    var usertoken = TokenContext.getRawData();
    var temptoken = TempTokenContext.getRawData();
    var token = temptoken || usertoken;
    if (token) {
      return token;
    }
    return false;
  }

}

abstract class AuthType {
  constructor(public client: Client) {
    this.client = client;
  }

  abstract authenticate(options: LoginOptions, data): PromiseWithNotify<any>;

  protected inAppBrowserFlow(authOptions: LoginOptions = {}, options, data): PromiseWithNotify<any> {
    var deferred = new DeferredPromise();

    if (!window || !window.cordova || !window.cordova.InAppBrowser) {
      deferred.reject('Missing InAppBrowser plugin');
    } else {
      let method = options.uri_method ? options.uri_method : 'POST';
      let provider = options.provider ? '/' + options.provider : '';

      this.client.request(method, `/auth/login${provider}`)
        .send({
          'app_id': IonicPlatform.config.get('app_id'),
          'callback': options.callback_uri || window.location.href,
          'data': data
        })
        .end(function(err, res) {
          if (err) {
            deferred.reject(err);
          } else {
            var loc = res.payload.data.url;
            var tempBrowser = window.cordova.InAppBrowser.open(loc, '_blank', 'location=no,clearcache=yes,clearsessioncache=yes');
            tempBrowser.addEventListener('loadstart', function(data) {
              if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
                var queryString = data.url.split('#')[0].split('?')[1];
                var paramParts = queryString.split('&');
                var params: any = {};
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
  }

}

class BasicAuth extends AuthType {

  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    var deferred = new DeferredPromise();

    this.client.post('/auth/login')
      .send({
        'app_id': IonicPlatform.config.get('app_id'),
        'email': data.email,
        'password': data.password
      })
      .end(function(err, res) {
        if (err) {
          deferred.reject(err);
        } else {
          storeToken(options, res.body.data.token);
          deferred.resolve(true);
        }
      });

    return deferred.promise;
  }

  signup(data): PromiseWithNotify<any> {
    var deferred = new DeferredPromise<boolean>();

    var userData: any = {
      'app_id': IonicPlatform.config.get('app_id'),
      'email': data.email,
      'password': data.password
    };

    // optional details
    if (data.username) { userData.username = data.username; }
    if (data.image) { userData.image = data.image; }
    if (data.name) { userData.name = data.name; }
    if (data.custom) { userData.custom = data.custom; }

    this.client.post('/auth/users')
      .send(userData)
      .end(function(err, res) {
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
        } else {
          deferred.resolve(true);
        }
      });

    return deferred.promise;
  }
}

class CustomAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'custom' }, data);
  }
}

class TwitterAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'twitter' }, data);
  }
}

class FacebookAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'facebook' }, data);
  }
}

class GithubAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'github' }, data);
  }
}

class GoogleAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'google' }, data);
  }
}

class InstagramAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'instagram' }, data);
  }
}

class LinkedInAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): PromiseWithNotify<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'linkedin' }, data);
  }
}

Auth.register('basic', new BasicAuth(IonicPlatform.client));
Auth.register('custom', new CustomAuth(IonicPlatform.client));
Auth.register('facebook', new FacebookAuth(IonicPlatform.client));
Auth.register('github', new GithubAuth(IonicPlatform.client));
Auth.register('google', new GoogleAuth(IonicPlatform.client));
Auth.register('instagram', new InstagramAuth(IonicPlatform.client));
Auth.register('linkedin', new LinkedInAuth(IonicPlatform.client));
Auth.register('twitter', new TwitterAuth(IonicPlatform.client));
