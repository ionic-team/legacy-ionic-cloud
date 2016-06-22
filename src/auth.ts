import { IConfig, IClient, IEventEmitter, TokenContextStoreOptions, ITokenContext, IStorageStrategy, ISingleUserService, AuthModuleId, LoginOptions, IAuth, IUser, IAuthType, UserDetails, IBasicAuthType, IAuthModules } from './interfaces';
import { DetailedError, DeferredPromise } from './promise';

declare var window: any;

export class AuthTokenContext implements ITokenContext {
  constructor(public label: string, public storage: IStorageStrategy) {}

  get(): string {
    return this.storage.get(this.label);
  }

  store(token: string, options: TokenContextStoreOptions = {}): void {
    this.storage.set(this.label, token);
  }

  delete(): void {
    this.storage.remove(this.label);
  }
}

export interface CombinedAuthTokenContextStoreOptions extends TokenContextStoreOptions {
  permanent?: boolean;
}

export class CombinedAuthTokenContext implements ITokenContext {
  constructor(public label: string, public storage: IStorageStrategy, public tempStorage: IStorageStrategy) {}

  get(): string {
    let permToken = this.storage.get(this.label);
    let tempToken = this.tempStorage.get(this.label);
    let token = tempToken || permToken;
    return token;
  }

  store(token: string, options: CombinedAuthTokenContextStoreOptions = {'permanent': true}): void {
    if (options.permanent) {
      this.storage.set(this.label, token);
    } else {
      this.tempStorage.set(this.label, token);
    }
  }

  delete(): void {
    this.storage.remove(this.label);
    this.tempStorage.remove(this.label);
  }
}

function getAuthErrorDetails(err) {
  var details = [];
  try {
    details = err.response.body.error.details;
  } catch (e) { e; }
  return details;
}

export interface AuthOptions {}

export class Auth implements IAuth {

  private authToken: string;

  constructor(
    public config: AuthOptions = {},
    public emitter: IEventEmitter,
    public authModules: IAuthModules,
    public tokenContext: CombinedAuthTokenContext,
    public userService: ISingleUserService
  ) {}

  isAuthenticated(): boolean {
    let token = this.tokenContext.get();
    if (token) {
      return true;
    }
    return false;
  }

  login(moduleId: AuthModuleId, options: LoginOptions = {}, data): Promise<IUser> {
    let context = this.authModules[moduleId];
    if (!context) {
      throw new Error('Authentication class is invalid or missing:' + context);
    }

    return context.authenticate(data).then((token: string) => {
      this.storeToken(options, token);

      return this.userService.self().then((user) => {
        user.store();
        return user;
      });
    });
  }

  signup(data: UserDetails): Promise<void> {
    let context = this.authModules.basic;
    if (!context) {
      throw new Error('Authentication class is invalid or missing:' + context);
    }
    return context.signup.apply(context, [data]);
  }

  logout(): void {
    this.tokenContext.delete();
    let user = this.userService.current();
    user.unstore();
    user.clear();
  }

  getToken(): string {
    return this.tokenContext.get();
  }

  storeToken(options: LoginOptions = {}, token: string) {
    let originalToken = this.authToken;
    this.authToken = token;
    this.tokenContext.store(this.authToken, {'permanent': options.remember});
    this.emitter.emit('auth:token-changed', {'old': originalToken, 'new': this.authToken});
  }

}

export abstract class AuthType implements IAuthType {
  constructor(public config: IConfig, public client: IClient) {}

  abstract authenticate(data): Promise<any>;

  protected inAppBrowserFlow(options, data): Promise<string> {
    let deferred = new DeferredPromise<string, Error>();

    if (!window || !window.cordova || !window.cordova.InAppBrowser) {
      deferred.reject(new Error('InAppBrowser plugin missing'));
    } else {
      let method = options.uri_method ? options.uri_method : 'POST';
      let provider = options.provider ? '/' + options.provider : '';

      this.client.request(method, `/auth/login${provider}`)
        .send({
          'app_id': this.config.get('app_id'),
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
                tempBrowser.close();
                tempBrowser = null;
                deferred.resolve(params.token);
              }
            });
          }
        });
    }

    return deferred.promise;
  }

}

export class BasicAuth extends AuthType implements IBasicAuthType {

  authenticate(data): Promise<string> {
    var deferred = new DeferredPromise<string, Error>();

    this.client.post('/auth/login')
      .send({
        'app_id': this.config.get('app_id'),
        'email': data.email,
        'password': data.password
      })
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          deferred.resolve(res.body.data.token);
        }
      });

    return deferred.promise;
  }

  signup(data: UserDetails): Promise<void> {
    var deferred = new DeferredPromise<void, DetailedError<string[]>>();

    var userData: any = {
      'app_id': this.config.get('app_id'),
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
          deferred.reject(new DetailedError('Error creating user', errors));
        } else {
          deferred.resolve();
        }
      });

    return deferred.promise;
  }
}

export class CustomAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'custom' }, data);
  }
}

export class TwitterAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'twitter' }, data);
  }
}

export class FacebookAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'facebook' }, data);
  }
}

export class GithubAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'github' }, data);
  }
}

export class GoogleAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'google' }, data);
  }
}

export class InstagramAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'instagram' }, data);
  }
}

export class LinkedInAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'linkedin' }, data);
  }
}
