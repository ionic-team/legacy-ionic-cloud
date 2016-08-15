import {
  AuthDependencies,
  AuthModuleId,
  AuthOptions,
  AuthTypeDependencies,
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
  ISingleUserService,
  IStorage,
  ITokenContext,
  IUser,
  InAppBrowserPluginOptions,
  LoginOptions,
  TokenContextDependencies,
  UserDetails
} from './definitions';

import { DetailedError } from './errors';
import { DeferredPromise } from './promise';

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

  public get(): string {
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

  public get(): string {
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
 * Auth handles authentication of a single user, such as signing up, logging in
 * & out, social provider authentication, etc.
 * @summary TODO A Quick Summary
 */
export class Auth implements IAuth {

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
    public options: AuthOptions = {}
  ) {
    this.emitter = deps.emitter;
    this.authModules = deps.authModules;
    this.tokenContext = deps.tokenContext;
    this.userService = deps.userService;
    this.storage = deps.storage;
  }

  /**
   * Check whether the user is logged in or not.
   *
   * If an auth token exists in local storage, the user is logged in.
   */
  public isAuthenticated(): boolean {
    let token = this.tokenContext.get();
    if (token) {
      return true;
    }
    return false;
  }

  /**
   * Attempt to log the user in with the given credentials. For custom & social
   * logins, kick-off the authentication process.
   *
   * After login, the full user is loaded from the cloud and saved in local
   * storage along with their auth token.
   *
   * @param credentials
   *  For email/password, give an email and password. For custom, send whatever
   *  you need.
   * @param options
   */
  public login(moduleId: AuthModuleId, credentials?: Object, options: LoginOptions = {}): Promise<IUser> {
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

    return context.authenticate(credentials, options).then((token: string) => {
      this.storeToken(options, token);

      return this.userService.load().then(() => {
        let user = this.userService.current();
        user.store();
        return user;
      });
    });
  }

  /**
   * Sign up a user with the given data. Only for email/password
   * authentication.
   *
   * `signup` does not affect local data or the current user until `login` is
   * called. This means you'll likely want to log in your users manually after
   * signup.
   *
   * If a signup fails, the promise rejects with a `DetailedError` containing
   * an array of error codes from the cloud.
   *
   * TODO: Link to DetailedError
   *
   * @param details - The details that describe a user.
   */
  public signup(details: UserDetails): Promise<void> {
    return this.authModules.basic.signup(details);
  }

  /**
   * Kick-off the password reset process. Only for email/password
   * authentication.
   *
   * An email will be sent to the user with a short password reset code, which
   * they can copy back into your app and use `confirmPasswordReset`.
   *
   * TODO: Link to confirmPasswordReset
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
    return this.authModules.basic.confirmPasswordReset(email, code, newPassword);
  }

  /**
   * Log the user out of the app.
   *
   * This clears the auth token out of local storage and restores the user to
   * an unauthenticated state.
   */
  public logout(): void {
    this.tokenContext.delete();
    let user = this.userService.current();
    user.unstore();
    user.clear();
  }

  /**
   * Get the raw auth token from local storage.
   */
  public getToken(): string {
    return this.tokenContext.get();
  }

  /**
   * Overwrite the raw auth token in local storage.
   */
  public storeToken(options: LoginOptions = {'remember': true}, token: string) {
    let originalToken = this.authToken;
    this.authToken = token;
    this.tokenContext.store(this.authToken, {'permanent': options.remember});
    this.emitter.emit('auth:token-changed', {'old': originalToken, 'new': this.authToken});
  }

  /**
   * @hidden
   */
  public static getDetailedErrorFromResponse(res): DetailedError<string[]> {
    let errors = [];
    let details = [];

    try {
      details = res.body.error.details;
    } catch (e) {}

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

  constructor(deps: AuthTypeDependencies) {
    this.config = deps.config;
    this.client = deps.client;
  }

  public abstract authenticate(data?: Object, options?: LoginOptions): Promise<any>;

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
    options?: LoginOptions
  ): Promise<string> {
    let deferred = new DeferredPromise<string, Error>();

    if (!window || !window.cordova || !window.cordova.InAppBrowser) {
      deferred.reject(new Error('InAppBrowser plugin missing'));
    } else {
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
                deferred.resolve(params['token']);
              }
            };

            w.addEventListener('exit', onExit);
            w.addEventListener('loaderror', onLoadError);
            w.addEventListener('loadstart', onLoadStart);
          }
        });
    }

    return deferred.promise;
  }

}

/**
 * @hidden
 */
export class BasicAuth extends AuthType implements IBasicAuthType {

  public authenticate(data: BasicLoginCredentials, options?: LoginOptions): Promise<string> {
    var deferred = new DeferredPromise<string, Error>();

    if (!data.email || !data.password) {
      deferred.reject(new Error('email and password are required for basic authentication'));
    } else {
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
    }

    return deferred.promise;
  }

  public requestPasswordReset(email: string): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (!email) {
      deferred.reject(new Error('Email is required for password reset request.'));
    } else {
      this.client.post('/users/password/reset')
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
    }

    return deferred.promise;
  }

  public confirmPasswordReset(email: string, code: number, newPassword: string): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (!code || !email || !newPassword) {
      deferred.reject(new Error('Code, new password, and email are required.'));
    } else {
      this.client.post('/users/password')
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
    }

    return deferred.promise;
  }

  public signup(data: UserDetails): Promise<void> {
    let deferred = new DeferredPromise<void, DetailedError<string[]>>();

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

    this.client.post('/users')
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
 * @hidden
 */
export class CustomAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('custom', data, options);
  }
}

/**
 * @hidden
 */
export class TwitterAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('twitter', data, options);
  }
}

/**
 * @hidden
 */
export class FacebookAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('facebook', data, options);
  }
}

/**
 * @hidden
 */
export class GithubAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('github', data, options);
  }
}

/**
 * @hidden
 */
export class GoogleAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('google', data, options);
  }
}

/**
 * @hidden
 */
export class InstagramAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('instagram', data, options);
  }
}

/**
 * @hidden
 */
export class LinkedInAuth extends AuthType {
  public authenticate(data: Object = {}, options?: LoginOptions): Promise<any> {
    return this.inAppBrowserFlow('linkedin', data, options);
  }
}
