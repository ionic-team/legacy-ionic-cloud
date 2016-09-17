import { Device as NativeDevice } from 'ionic-native';

import {
  AppStatus,
  IAuth,
  IAuthModules,
  IClient,
  ICombinedTokenContext,
  IConfig,
  ICordova,
  ICore,
  IDeploy,
  IDevice,
  IEventEmitter,
  IInsights,
  ILogger,
  IFacebookAuth,
  IGoogleAuth,
  IPush,
  ISingleUserService,
  IStorageStrategy,
  IUserContext,
  LoggerOptions,
  PushOptions,
  PushToken,
  StoredUser
} from './definitions';

import {
  Auth,
  BasicAuth,
  CombinedAuthTokenContext,
  CustomAuth,
  FacebookAuth,
  FacebookAuthType,
  GithubAuth,
  GoogleAuth,
  GoogleAuthType,
  InstagramAuth,
  LinkedInAuth,
  TwitterAuth
} from './auth';

import { Client } from './client';
import { Config } from './config';
import { Cordova } from './cordova';
import { Core } from './core';
import { Deploy } from './deploy/deploy';
import { Device } from './device';
import { EventEmitter } from './events';
import { Insights } from './insights';
import { Logger } from './logger';
import { Push } from './push/push';
import { Storage, LocalStorageStrategy, SessionStorageStrategy } from './storage';
import { UserContext, SingleUserService } from './user/user';

interface Modules {
  [key: string]: any;
}

let modules: Modules = {};

function cache<T>(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T>) {
  let method = descriptor.get;

  descriptor.get = function(): T {
    if (typeof method !== 'undefined' && typeof modules[propertyKey] === 'undefined') {
      let value = method.apply(this, arguments);
      modules[propertyKey] = value;
    }

    return modules[propertyKey];
  };

  descriptor.set = (value: T): void => {};
}

/**
 * @hidden
 */
export class Container {

  @cache
  public get appStatus(): AppStatus {
    return {'asleep': false, 'closed': false};
  }

  @cache
  public get config(): IConfig {
    return new Config();
  }

  @cache
  public get eventEmitter(): IEventEmitter {
    return new EventEmitter();
  }

  @cache
  public get logger(): ILogger {
    let config = this.config;
    let c: LoggerOptions = {};

    if (typeof config.settings !== 'undefined' && typeof config.settings.logger !== 'undefined') {
      c = config.settings.logger;
    }

    return new Logger(c);
  }

  @cache
  public get localStorageStrategy(): IStorageStrategy {
    return new LocalStorageStrategy();
  }

  @cache
  public get sessionStorageStrategy(): IStorageStrategy {
    return new SessionStorageStrategy();
  }

  @cache
  public get authTokenContext(): ICombinedTokenContext {
    let label = 'auth_' + this.config.get('app_id');
    return new CombinedAuthTokenContext({
      'storage': new Storage<string>({'strategy': this.localStorageStrategy}),
      'tempStorage': new Storage<string>({'strategy': this.sessionStorageStrategy})
    }, label);
  }

  @cache
  public get client(): IClient {
    return new Client(this.authTokenContext, this.config.getURL('api'));
  }

  @cache
  public get insights(): IInsights {
    return new Insights({
      'appStatus': this.appStatus,
      'storage': new Storage<string>({'strategy': this.localStorageStrategy}),
      'config': this.config,
      'client': this.client,
      'logger': this.logger
    });
  }

  @cache
  public get core(): ICore {
    return new Core({
      'config': this.config,
      'logger': this.logger,
      'emitter': this.eventEmitter,
      'insights': this.insights
    });
  }

  @cache
  public get device(): IDevice {
    return new Device({'nativeDevice': NativeDevice, 'emitter': this.eventEmitter});
  }

  @cache
  public get cordova(): ICordova {
    return new Cordova({
      'appStatus': this.appStatus,
      'device': this.device,
      'emitter': this.eventEmitter,
      'logger': this.logger
    });
  }

  @cache
  public get userContext(): IUserContext {
    return new UserContext({'storage': new Storage<StoredUser>({'strategy': this.localStorageStrategy}), 'config': this.config});
  }

  @cache
  public get singleUserService(): ISingleUserService {
    return new SingleUserService({'client': this.client, 'context': this.userContext});
  }

  @cache
  public get authModules(): IAuthModules {
    return {
      'basic': new BasicAuth({'config': this.config, 'client': this.client}),
      'custom': new CustomAuth({'config': this.config, 'client': this.client}),
      'twitter': new TwitterAuth({'config': this.config, 'client': this.client}),
      'facebook': new FacebookAuthType({'config': this.config, 'client': this.client}),
      'github': new GithubAuth({'config': this.config, 'client': this.client}),
      'google': new GoogleAuthType({'config': this.config, 'client': this.client}),
      'instagram': new InstagramAuth({'config': this.config, 'client': this.client}),
      'linkedin': new LinkedInAuth({'config': this.config, 'client': this.client})
    };
  }

  @cache
  public get auth(): IAuth {
    return new Auth({
      'config': this.config,
      'emitter': this.eventEmitter,
      'authModules': this.authModules,
      'tokenContext': this.authTokenContext,
      'userService': this.singleUserService,
      'storage': new Storage<string>({'strategy': this.localStorageStrategy})
    });
  }

  @cache
  public get facebookAuth(): IFacebookAuth {
    return new FacebookAuth({
      'config': this.config,
      'client': this.client,
      'userService': this.singleUserService,
      'storage': new Storage<string>({'strategy': this.localStorageStrategy}),
      'tokenContext': this.authTokenContext,
      'emitter': this.eventEmitter
    });
  }

  @cache
  public get googleAuth(): IGoogleAuth {
    return new GoogleAuth({
      'config': this.config,
      'client': this.client,
      'userService': this.singleUserService,
      'storage': new Storage<string>({'strategy': this.localStorageStrategy}),
      'tokenContext': this.authTokenContext,
      'emitter': this.eventEmitter
    });
  }

  @cache
  public get push(): IPush {
    let config = this.config;
    let c: PushOptions = {};

    if (typeof config.settings !== 'undefined' && typeof config.settings.push !== 'undefined') {
      c = config.settings.push;
    }

    return new Push({
      'config': config,
      'auth': this.auth,
      'userService': this.singleUserService,
      'device': this.device,
      'client': this.client,
      'emitter': this.eventEmitter,
      'storage': new Storage<PushToken>({'strategy': this.localStorageStrategy}),
      'logger': this.logger
    }, c);
  }

  @cache
  public get deploy(): IDeploy {
    return new Deploy({
      'config': this.config,
      'emitter': this.eventEmitter,
      'logger': this.logger
    });
  }

}
