import { IConfig, IClient, IEventEmitter, ITokenContext, IStorageStrategy, ISingleUserService, AuthModuleId, LoginOptions, IAuth, IUser, IAuthType, BasicAuthSignupData, IBasicAuthType, IAuthModules } from '../interfaces';
import { DetailedError, DeferredPromise } from '../promise';

declare var window: any;

export class TempTokenContext implements ITokenContext {
  constructor(public storage: IStorageStrategy, public config: IConfig) {}

  get label(): string {
    return 'ionic_io_auth_' + this.config.get('app_id');
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

function getAuthErrorDetails(err) {
  var details = [];
  try {
    details = err.response.body.error.details;
  } catch (e) { e; }
  return details;
}

export class Auth implements IAuth {

  private authToken: string;

  constructor(
    public emitter: IEventEmitter,
    public authModules: IAuthModules,
    public tokenContext: ITokenContext,
    public tempTokenContext: ITokenContext,
    public userService: ISingleUserService
  ) {}

  isAuthenticated(): boolean {
    let token = this.tokenContext.getRawData();
    let tempToken = this.tempTokenContext.getRawData();

    if (tempToken || token) {
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

  signup(data: BasicAuthSignupData): Promise<void> {
    let context = this.authModules.basic;
    if (!context) {
      throw new Error('Authentication class is invalid or missing:' + context);
    }
    return context.signup.apply(context, [data]);
  }

  logout(): void {
    this.tokenContext.delete();
    this.tempTokenContext.delete();
    let user = this.userService.current();
    user.unstore();
    user.clear();
  }

  getUserToken(): string {
    let usertoken = this.tokenContext.getRawData();
    let temptoken = this.tempTokenContext.getRawData();
    let token = temptoken || usertoken;

    return token;
  }

  storeToken(options: LoginOptions = {}, token: string) {
    let originalToken = this.authToken;
    this.authToken = token;
    if (options.remember) {
      this.tokenContext.store(this.authToken);
    } else {
      this.tempTokenContext.store(this.authToken);
    }
    this.emitter.emit('auth:token-changed', {'old': originalToken, 'new': this.authToken});
  }

}

abstract class AuthType implements IAuthType {
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

class BasicAuth extends AuthType implements IBasicAuthType {

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

  signup(data: BasicAuthSignupData): Promise<void> {
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

class CustomAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'custom' }, data);
  }
}

class TwitterAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'twitter' }, data);
  }
}

class FacebookAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'facebook' }, data);
  }
}

class GithubAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'github' }, data);
  }
}

class GoogleAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'google' }, data);
  }
}

class InstagramAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'instagram' }, data);
  }
}

class LinkedInAuth extends AuthType {
  authenticate(data): Promise<any> {
    return this.inAppBrowserFlow({ 'provider': 'linkedin' }, data);
  }
}
