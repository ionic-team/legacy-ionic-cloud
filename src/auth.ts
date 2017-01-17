import { Facebook, FacebookLoginResponse, GooglePlus } from 'ionic-native';

import {
  APIResponseErrorDetails,
  AuthDependencies,
  AuthLoginOptions,
  AuthLoginResult,
  AuthModuleId,
  AuthTypeDependencies,
  NativeAuthDependencies,
  BasicLoginCredentials,
  CombinedTokenContextDependencies,
  IAuth,
  IAuthModules,
  IAuthType,
  IBasicAuthType,
  IClient,
  ICombinedTokenContext,
  ICombinedTokenContextStoreOptions,
  IConfig,
  IEventEmitter,
  IFacebookAuth,
  IGoogleAuth,
  ISingleUserService,
  IStorage,
  ITokenContext,
  InAppBrowserPluginOptions,
  TokenContextDependencies,
  SuperAgentResponse,
  UserDetails
} from './definitions';

import { isAPIResponseError } from './guards';
import { DetailedError } from './errors';
import { DeferredPromise } from './promise';
import { isValidEmail } from './util';

declare var window: any;

/**
 * @hidden
 */
export class AuthTokenContext implements ITokenContext {

  /**
   * @private
   */
  private storage: IStorage<string>;

  constructor(deps: TokenContextDependencies, public label: string) {
    this.storage = deps.storage;
  }

  public get(): string | null {
    return this.storage.get(this.label);
  }

  public store(token: string): void {
    this.storage.set(this.label, token);
  }

  public delete(): void {
    this.storage.delete(this.label);
  }
}

/**
 * @hidden
 */
export class CombinedAuthTokenContext implements ICombinedTokenContext {

  /**
   * @private
   */
  private storage: IStorage<string>;

  /**
   * @private
   */
  private tempStorage: IStorage<string>;

  constructor(deps: CombinedTokenContextDependencies, public label: string) {
    this.storage = deps.storage;
    this.tempStorage = deps.tempStorage;
  }

  public get(): string | null {
    let permToken = this.storage.get(this.label);
    let tempToken = this.tempStorage.get(this.label);
    let token = tempToken || permToken;
    return token;
  }

  public store(token: string, options: ICombinedTokenContextStoreOptions = {'permanent': true}): void {
    if (options.permanent) {
      this.storage.set(this.label, token);
    } else {
      this.tempStorage.set(this.label, token);
    }
  }

  public delete(): void {
    this.storage.delete(this.label);
    this.tempStorage.delete(this.label);
  }
}

/**
 * `Auth` handles authentication of a single user, such as signing up, logging
 * in & out, social provider authentication, etc.
 *
 * @featured
 */
export class Auth implements IAuth {

  /**
   * @private
   */
  private config: IConfig;

  /**
   * @private
   */
  private emitter: IEventEmitter;

  /**
   * @private
   */
  private authModules: IAuthModules;

  /**
   * @private
   */
  private tokenContext: ICombinedTokenContext;

  /**
   * @private
   */
  private userService: ISingleUserService;

  /**
   * @private
   */
  private storage: IStorage<string>;

  /**
   * @private
   */
  private authToken: string;

  constructor(
    deps: AuthDependencies,
  ) {
    this.config = deps.config;
    this.emitter = deps.emitter;
    this.authModules = deps.authModules;
    this.tokenContext = deps.tokenContext;
    this.userService = deps.userService;
    this.storage = deps.storage;
  }

  /**
   * Link the user to this URL for password resets. Only for email/password
   * authentication.
   *
   * Use this if you want to use our password reset forms instead of creating
   * your own in your app.
   */
  public get passwordResetUrl(): string {
    return `${this.config.getURL('web')}/password/reset/${this.config.get('app_id')}`;
  }

  /**
   * Check whether the user is logged in or not.
   *
   * If an auth token exists in local storage, the user is logged in.
   */
  public isAuthenticated(): boolean {
    let token = this.tokenContext.get();
    if (token) {
      this.emitter.emit('auth:login', {token: token});
      return true;
    }
    return false;
  }

  /**
   * Sign up a user with the given data. Only for email/password
   * authentication.
   *
   * `signup` does not affect local data or the current user until `login` is
   * called. This means you'll likely want to log in your users manually after
   * signup.
   *
   * If a signup fails, the promise rejects with a [`IDetailedError`
   * object](/api/client/idetailederror) that contains an array of error codes
   * from the cloud.
   *
   * @param details - The details that describe a user.
   */
  public signup(details: UserDetails): Promise<void> {
    return this.authModules.basic.signup(details);
  }

  /**
   * Attempt to log the user in with the given credentials. For custom & social
   * logins, kick-off the authentication process.
   *
   * After login, the full user is loaded from the cloud and saved in local
   * storage along with their auth token.
   *
   * @note TODO: Better error handling docs.
   *
   * @param moduleId
   *  The authentication provider module ID to use with this login.
   * @param credentials
   *  For email/password authentication, give an email and password. For social
   *  authentication, exclude this parameter. For custom authentication, send
   *  whatever you need.
   * @param options
   *  Options for this login, such as whether to remember the login and
   *  InAppBrowser window options for authentication providers that make use of
   *  it.
   */
  public login(moduleId: AuthModuleId, credentials?: Object, options: AuthLoginOptions = {}): Promise<AuthLoginResult> {
    if (typeof options.remember === 'undefined') {
      options.remember = true;
    }

    if (typeof options.inAppBrowserOptions === 'undefined') {
      options.inAppBrowserOptions = {};
    }

    if (typeof options.inAppBrowserOptions.location === 'undefined') {
      options.inAppBrowserOptions.location = false;
    }

    if (typeof options.inAppBrowserOptions.clearcache === 'undefined') {
      options.inAppBrowserOptions.clearcache = true;
    }

    if (typeof options.inAppBrowserOptions.clearsessioncache === 'undefined') {
      options.inAppBrowserOptions.clearsessioncache = true;
    }

    let context = this.authModules[moduleId];
    if (!context) {
      throw new Error('Authentication class is invalid or missing:' + context);
    }

    return context.authenticate(credentials, options).then((r: AuthLoginResult) => {
      this.storeToken(options, r.token);

      return this.userService.load().then(() => {
        let user = this.userService.current();
        user.store();
        return r;
      });
    });
  }

  /**
   * Log the user out of the app.
   *
   * This clears the auth token out of local storage and restores the user to
   * an unauthenticated state.
   */
  public logout(): void {
    this.emitter.emit('auth:token-changed', {'old': this.tokenContext.get(), 'new': undefined});
    this.emitter.emit('auth:logout', {});
    this.tokenContext.delete();
    let user = this.userService.current();
    user.unstore();
    user.clear();
  }

  /**
   * Kick-off the password reset process. Only for email/password
   * authentication.
   *
   * An email will be sent to the user with a short password reset code, which
   * they can copy back into your app and use the [`confirmPasswordReset()`
   * method](#confirmPasswordReset).
   *
   * @param email - The email address to which to send a code.
   */
  public requestPasswordReset(email: string): Promise<void> {
    this.storage.set('auth_password_reset_email', email);
    return this.authModules.basic.requestPasswordReset(email);
  }

  /**
   * Confirm a password reset.
   *
   * When the user gives you their password reset code into your app and their
   * requested changed password, call this method.
   *
   * @param code - The password reset code from the user.
   * @param newPassword - The requested changed password from the user.
   */
  public confirmPasswordReset(code: number, newPassword: string): Promise<void> {
    let email = this.storage.get('auth_password_reset_email');

    if (!email) {
      return DeferredPromise.rejectImmediately<void, Error>(new Error('email address not found in local storage'));
    } else {
      return this.authModules.basic.confirmPasswordReset(email, code, newPassword);
    }
  }

  /**
   * Get the raw auth token of the active user from local storage.
   */
  public getToken(): string | null {
    return this.tokenContext.get();
  }

  /**
   * @hidden
   */
  public storeToken(options: AuthLoginOptions = {'remember': true}, token: string) {
    let originalToken = this.authToken;
    this.authToken = token;
    this.tokenContext.store(this.authToken, {'permanent': options.remember});
    this.emitter.emit('auth:token-changed', {'old': originalToken, 'new': this.authToken});
    this.emitter.emit('auth:login', {token: this.authToken});
  }

  /**
   * @hidden
   */
  public static getDetailedErrorFromResponse(res: SuperAgentResponse): DetailedError<string[]> {
    let errors: string[] = [];
    let details: APIResponseErrorDetails[] = [];

    if (isAPIResponseError(res.body) && typeof res.body.error.details !== 'undefined') {
      details = res.body.error.details;
    }

    for (let i = 0; i < details.length; i++) {
      let detail = details[i];
      if (detail.error_type) {
        errors.push(detail.error_type + '_' + detail.parameter);
      }
    }

    return new DetailedError<string[]>('Error creating user', errors);
  }

}

/**
 * @hidden
 */
export abstract class AuthType implements IAuthType {
  protected config: IConfig;
  protected client: IClient;
  protected emitter: IEventEmitter;

  constructor(deps: AuthTypeDependencies) {
    this.config = deps.config;
    this.client = deps.client;
    this.emitter = deps.emitter;
  }

  public abstract authenticate(data?: Object, options?: AuthLoginOptions): Promise<AuthLoginResult>;

  protected parseInAppBrowserOptions(opts?: InAppBrowserPluginOptions): string {
    if (!opts) {
      return '';
    }

    let p: string[] = [];

    for (let k in opts) {
      let v: string;

      if (typeof opts[k] === 'boolean') {
        v = opts[k] ? 'yes' : 'no';
      } else {
        v = opts[k];
      }

      p.push(`${k}=${v}`);
    }

    return p.join(',');
  }

  protected inAppBrowserFlow(
    moduleId: AuthModuleId,
    data: Object = {},
    options: AuthLoginOptions = {}
  ): Promise<AuthLoginResult> {
    let deferred = new DeferredPromise<AuthLoginResult, Error>();


    if (!window || !window.cordova) {
      return deferred.reject(new Error('Cordova is missing--can\'t login with InAppBrowser flow.'));
    }

    this.emitter.once('cordova:deviceready', () => {
      if (!window.cordova.InAppBrowser) {
        deferred.reject(new Error('InAppBrowser plugin missing'));
        return;
      }

      this.client.post(`/auth/login/${moduleId}`)
        .send({
          'app_id': this.config.get('app_id'),
          'callback': window.location.href,
          'data': data
        })
        .end((err, res) => {
          if (err) {
            deferred.reject(err);
          } else {
            let w = window.cordova.InAppBrowser.open(
              res.body.data.url,
              '_blank',
              this.parseInAppBrowserOptions(options.inAppBrowserOptions)
            );

            let onExit = () => {
              deferred.reject(new Error('InAppBrowser exit'));
            };

            let onLoadError = () => {
              deferred.reject(new Error('InAppBrowser loaderror'));
            };

            let onLoadStart = (data) => {
              if (data.url.slice(0, 20) === 'http://auth.ionic.io') {
                let queryString = data.url.split('#')[0].split('?')[1];
                let paramParts = queryString.split('&');
                let params = {};
                for (let i = 0; i < paramParts.length; i++) {
                  let part = paramParts[i].split('=');
                  params[part[0]] = part[1];
                }

                w.removeEventListener('exit', onExit);
                w.removeEventListener('loaderror', onLoadError);
                w.close();

                if (params['error']) {
                  deferred.reject(new Error(decodeURIComponent(params['error'])));
                } else {
                  deferred.resolve({
                    'token': params['token'],
                    'signup': Boolean(parseInt(params['signup'], 10))
                  });
                }
              }
            };

            w.addEventListener('exit', onExit);
            w.addEventListener('loaderror', onLoadError);
            w.addEventListener('loadstart', onLoadStart);
          }
        });
    });

    return deferred.promise;
  }

}

/**
 * @hidden
 */
export class BasicAuthType extends AuthType implements IBasicAuthType {

  public authenticate(data: BasicLoginCredentials, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    var deferred = new DeferredPromise<AuthLoginResult, Error>();

    if (!data.email || !data.password) {
      return deferred.reject(new Error('email and password are required for basic authentication'));
    }

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
          deferred.resolve({
            'token': res.body.data.token
          });
        }
      });

    return deferred.promise;
  }

  public requestPasswordReset(email: string): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (!email) {
      return deferred.reject(new Error('Email is required for password reset request.'));
    }

    this.client.post('/auth/users/password/reset')
      .send({
        'app_id': this.config.get('app_id'),
        'email': email,
        'flow': 'app'
      })
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          deferred.resolve();
        }
      });

    return deferred.promise;
  }

  public confirmPasswordReset(email: string, code: number, newPassword: string): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (!code || !email || !newPassword) {
      return deferred.reject(new Error('Code, new password, and email are required.'));
    }

    this.client.post('/auth/users/password')
      .send({
        'reset_token': code,
        'new_password': newPassword,
        'email': email
      })
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          deferred.resolve();
        }
      });

    return deferred.promise;
  }

  public signup(data: UserDetails): Promise<void> {
    let deferred = new DeferredPromise<void, DetailedError<string[]>>();

    if (data.email) {
      if (!isValidEmail(data.email)) {
        return deferred.reject(new DetailedError('Invalid email supplied.', ['invalid_email']));
      }
    } else {
      return deferred.reject(new DetailedError('Email is required for email/password auth signup.', ['required_email']));
    }

    if (!data.password) {
      return deferred.reject(new DetailedError('Password is required for email/password auth signup.', ['required_password']));
    }

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
          deferred.reject(Auth.getDetailedErrorFromResponse(err.response));
        } else {
          deferred.resolve();
        }
      });

    return deferred.promise;
  }
}

/**
 * hidden
 */
export abstract class NativeAuth {
  protected config: IConfig;
  protected client: IClient;
  protected userService: ISingleUserService;
  protected tokenContext: ICombinedTokenContext;
  protected emitter: IEventEmitter;
  protected authToken: string;

  constructor(deps: NativeAuthDependencies) {
    this.config = deps.config;
    this.client = deps.client;
    this.userService = deps.userService;
    this.tokenContext = deps.tokenContext;
    this.emitter = deps.emitter;
  }

  /**
   * Get the raw auth token of the active user from local storage.
   * @hidden
   */
  public getToken(): string | null {
    return this.tokenContext.get();
  }

  /**
   * @hidden
   */
  public storeToken(token: string) {
    let originalToken = this.authToken;
    this.authToken = token;
    this.tokenContext.store(this.authToken, {'permanent': true});
    this.emitter.emit('auth:token-changed', {'old': originalToken, 'new': this.authToken});
    this.emitter.emit('auth:login', {token: this.authToken});
  }

}

/**
 * GoogleNativeAuth handles logging into googleplus through the cordova-plugin-googleplus plugin.'
 * @featured
 */
export class GoogleAuth extends NativeAuth implements IGoogleAuth {

  public logout(): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();
    this.emitter.emit('auth:token-changed', {'old': this.tokenContext.get(), 'new': undefined});
    this.emitter.emit('auth:logout', {});
    this.tokenContext.delete();
    let user = this.userService.current();
    user.unstore();
    user.clear();

    GooglePlus.logout().then( () => {
      deferred.resolve();
    }, (err) => {
      deferred.reject(err);
    });

    return deferred.promise;
  }

  public login(): Promise<AuthLoginResult> {
    let deferred = new DeferredPromise<AuthLoginResult, Error>();
    const authConfig = this.config.settings.auth;

    this.emitter.once('cordova:deviceready', () => {
      let scope = ['profile', 'email'];

      if (!GooglePlus) {
        deferred.reject(new Error('Ionic native is not installed'));
        return;
      }

      if (!window || !window.cordova) {
        deferred.reject(new Error('Cordova is missing'));
        return;
      }

      if (!window.plugins || !window.plugins.googleplus) {
        deferred.reject(new Error('GooglePlus cordova plugin is missing.'));
        return;
      }

      if (!authConfig || !authConfig.google || !authConfig.google.webClientId) {
          deferred.reject(new Error('Missing google web client id. Please visit http://docs.ionic.io/services/users/google-auth.html#native'));
          return;
      }

      if (authConfig.google.scope) {
        authConfig.google.scope.forEach((item) => {
          if (scope.indexOf(item) === -1) {
            scope.push(item);
          }
        });
      }

      GooglePlus.login({'webClientId': authConfig.google.webClientId, 'offline': true, 'scopes': scope.join(' ')}).then((success) => {
        if (!success.serverAuthCode) {
          deferred.reject(new Error('Failed to retrieve offline access token.'));
          return;
        }
        let request_object = {
          'app_id': this.config.get('app_id'),
          'serverAuthCode': success.serverAuthCode,
          'additional_fields': scope,
          'flow': 'native-mobile'
        };

        this.client.post('/auth/login/google')
          .send(request_object)
          .end((err, res) => {
            if (err) {
              deferred.reject(err);
            } else {
              this.storeToken(res.body.data.token);
              this.userService.load().then(() => {
                let user = this.userService.current();
                user.store();
                deferred.resolve({
                  'token': res.body.data.token,
                  'signup': Boolean(parseInt(res.body.data.signup, 10))
                });
              });
            }
          });
      }, (err) => {
        deferred.reject(err);
      });
    });
    return deferred.promise;
  }
}

/**
 * FacebookNative handles logging into facebook through the cordova-plugin-facebook4 plugin.
 * @featured
 */
export class FacebookAuth extends NativeAuth implements IFacebookAuth {

  public logout(): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();
    this.emitter.emit('auth:token-changed', {'old': this.tokenContext.get(), 'new': undefined});
    this.emitter.emit('auth:logout', {});
    this.tokenContext.delete();
    let user = this.userService.current();
    user.unstore();
    user.clear();

    // Clear the facebook auth.
    Facebook.logout().then( () => {
      deferred.resolve();
    }, (err) => {
      deferred.reject(err);
    });

    return deferred.promise;
  }

  public login(): Promise<AuthLoginResult> {
    let deferred = new DeferredPromise<AuthLoginResult, Error>();
    const authConfig = this.config.settings.auth;
    let scope = ['public_profile', 'email'];

    if (authConfig && authConfig.facebook && authConfig.facebook.scope) {
      authConfig.facebook.scope.forEach((item) => {
        if (scope.indexOf(item) === -1) {
          scope.push(item);
        }
      });
    }

    this.emitter.once('cordova:deviceready', () => {
      if (!Facebook) {
        deferred.reject(new Error('Ionic native is not installed'));
        return;
      }

      if (!window || !window.cordova) {
        deferred.reject(new Error('Cordova is missing.'));
        return;
      }

      if (!window.facebookConnectPlugin) {
        deferred.reject(new Error('Please install the cordova-plugin-facebook4 plugin'));
        return;
      }

      Facebook.login(scope).then((r: FacebookLoginResponse) => {
        scope.splice(scope.indexOf('public_profile'), 1);
        const request_object = {
          'app_id': this.config.get('app_id'),
          'access_token': r.authResponse.accessToken,
          'additional_fields': scope,
          'flow': 'native-mobile'
        };

        this.client.post('/auth/login/facebook')
          .send(request_object)
          .end((err, res) => {
            if (err) {
              deferred.reject(err);
            } else {
              this.storeToken(res.body.data.token);
              this.userService.load().then(() => {
                let user = this.userService.current();
                user.store();
                deferred.resolve({
                  'token': res.body.data.token,
                  'signup': Boolean(parseInt(res.body.data.signup, 10))
                });
              });
            }
          });
      }, (err: Error) => {
        deferred.reject(err);
      });
    });
    return deferred.promise;
  }
}

/**
 * @hidden
 */
export class CustomAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('custom', data, options);
  }
}

/**
 * @hidden
 */
export class TwitterAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('twitter', data, options);
  }
}

/**
 * @hidden
 */
export class FacebookAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('facebook', data, options);
  }
}

/**
 * @hidden
 */
export class GithubAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('github', data, options);
  }
}

/**
 * @hidden
 */
export class GoogleAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('google', data, options);
  }
}

/**
 * @hidden
 */
export class InstagramAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('instagram', data, options);
  }
}

/**
 * @hidden
 */
export class LinkedInAuthType extends AuthType {
  public authenticate(data: Object = {}, options?: AuthLoginOptions): Promise<AuthLoginResult> {
    return this.inAppBrowserFlow('linkedin', data, options);
  }
}
