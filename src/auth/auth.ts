import { Client } from '../core/client';
import { DeferredPromise } from '../core/promise';
import { IonicCloud } from '../core/core';
import { IStorageStrategy, LocalStorageStrategy, SessionStorageStrategy } from '../core/storage';
import { User } from '../core/user';

declare var window: any;

var authModules: Object = {};
var authToken: string;

export interface ITokenContext {
  storage: IStorageStrategy;
  label: string;

  delete(): void;
  store(token: string): void;
  getRawData(): string;
}

export class TempTokenContext implements ITokenContext {

  storage: IStorageStrategy;

  constructor() {
    this.storage = new SessionStorageStrategy();
  }

  get label(): string {
    return 'ionic_io_auth_' + IonicCloud.config.get('app_id');
  }

  delete(): void {
    this.storage.remove(this.label);
  }

  store(token: string): void {
    this.storage.set(this.label, token);
  }

  getRawData(): string {
    return this.storage.get(this.label);
  }
}

export class TokenContext implements ITokenContext {

  storage: IStorageStrategy;

  constructor() {
    this.storage = new LocalStorageStrategy();
  }

  get label(): string {
    return 'ionic_io_auth_' + IonicCloud.config.get('app_id');
  }

  delete(): void {
    this.storage.remove(tokenContext.label);
  }

  store(token: string): void {
    this.storage.set(tokenContext.label, token);
  }

  getRawData(): string {
    return this.storage.get(tokenContext.label);
  }
}

let tempTokenContext = new TempTokenContext();
let tokenContext = new TokenContext();

export interface LoginOptions {
  remember?: boolean;
}

function storeToken(options: LoginOptions = {}, token: string) {
  let originalToken = authToken;
  authToken = token;
  if (options.remember) {
    tokenContext.store(authToken);
  } else {
    tempTokenContext.store(authToken);
  }
  IonicCloud.emitter.emit('auth:token-changed', {'old': originalToken, 'new': authToken});
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
    var token = tokenContext.getRawData();
    var tempToken = tempTokenContext.getRawData();
    if (tempToken || token) {
      return true;
    }
    return false;
  }

  static login(moduleId, options: LoginOptions = {}, data): Promise<User> {
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
    tokenContext.delete();
    tempTokenContext.delete();
    User.current().clear();
  }

  static register(moduleId, module): void {
    if (!authModules[moduleId]) {
      authModules[moduleId] = module;
    }
  }

  static getUserToken(): string {
    let usertoken = tokenContext.getRawData();
    let temptoken = tempTokenContext.getRawData();
    let token = temptoken || usertoken;

    return token;
  }

}

abstract class AuthType {
  constructor(public client: Client) {
    this.client = client;
  }

  abstract authenticate(options: LoginOptions, data): Promise<any>;

  protected inAppBrowserFlow(authOptions: LoginOptions = {}, options, data): Promise<any> {
    var deferred = new DeferredPromise();

    if (!window || !window.cordova || !window.cordova.InAppBrowser) {
      deferred.reject('Missing InAppBrowser plugin');
    } else {
      let method = options.uri_method ? options.uri_method : 'POST';
      let provider = options.provider ? '/' + options.provider : '';

      this.client.request(method, `/auth/login${provider}`)
        .send({
          'app_id': IonicCloud.config.get('app_id'),
          'callback': options.callback_uri || window.location.href,
          'data': data
        })
        .end((err, res) => {
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

  authenticate(options: LoginOptions = {}, data): Promise<any> {
    var deferred = new DeferredPromise();

    this.client.post('/auth/login')
      .send({
        'app_id': IonicCloud.config.get('app_id'),
        'email': data.email,
        'password': data.password
      })
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          storeToken(options, res.body.data.token);
          deferred.resolve(true);
        }
      });

    return deferred.promise;
  }

  signup(data): Promise<any> {
    var deferred = new DeferredPromise<boolean>();

    var userData: any = {
      'app_id': IonicCloud.config.get('app_id'),
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
      .end((err, res) => {
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
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'custom' }, data);
  }
}

class TwitterAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'twitter' }, data);
  }
}

class FacebookAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'facebook' }, data);
  }
}

class GithubAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'github' }, data);
  }
}

class GoogleAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'google' }, data);
  }
}

class InstagramAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'instagram' }, data);
  }
}

class LinkedInAuth extends AuthType {
  authenticate(options: LoginOptions = {}, data): Promise<any> {
    return this.inAppBrowserFlow(options, { 'provider': 'linkedin' }, data);
  }
}

Auth.register('basic', new BasicAuth(IonicCloud.client));
Auth.register('custom', new CustomAuth(IonicCloud.client));
Auth.register('facebook', new FacebookAuth(IonicCloud.client));
Auth.register('github', new GithubAuth(IonicCloud.client));
Auth.register('google', new GoogleAuth(IonicCloud.client));
Auth.register('instagram', new InstagramAuth(IonicCloud.client));
Auth.register('linkedin', new LinkedInAuth(IonicCloud.client));
Auth.register('twitter', new TwitterAuth(IonicCloud.client));
