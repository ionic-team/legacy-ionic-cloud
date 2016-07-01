import { IConfig, IApp, IUserContext, IEventEmitter, ILogger, ICombinedTokenContext, IStorageStrategy, IClient, ICore, IDevice, ICordova, IStorage, ISingleUserService, IAuthModules, IAuth, IPush, IDeploy, IInsights } from './definitions';
import { CombinedAuthTokenContext, Auth, BasicAuth, CustomAuth, TwitterAuth, FacebookAuth, GithubAuth, GoogleAuth, InstagramAuth, LinkedInAuth } from './auth';
import { App } from './app';
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
    if (typeof modules[propertyKey] === 'undefined') {
      let value = method.apply(this, arguments);
      modules[propertyKey] = value;
    }

    return modules[propertyKey];
  };

  descriptor.set = (value: T) => {};
}

export class Container {

  @cache
  get config(): IConfig {
    return new Config();
  }

  @cache
  get eventEmitter(): IEventEmitter {
    return new EventEmitter();
  }

  @cache
  get logger(): ILogger {
    return new Logger();
  }

  @cache
  get app(): IApp {
    let config = this.config;
    let app = new App(config.get('app_id'));
    app.gcmKey = config.get('gcm_key');
    return app;
  }

  @cache
  get localStorageStrategy(): IStorageStrategy {
    return new LocalStorageStrategy();
  }

  @cache
  get sessionStorageStrategy(): IStorageStrategy {
    return new SessionStorageStrategy();
  }

  @cache
  get authTokenContext(): ICombinedTokenContext {
    let label = 'ionic_io_auth_' + this.config.get('app_id');
    return new CombinedAuthTokenContext({'storage': this.localStorageStrategy, 'tempStorage': this.sessionStorageStrategy}, label);
  }

  @cache
  get client(): IClient {
    return new Client(this.authTokenContext, this.config.getURL('api'));
  }

  @cache
  get insights(): IInsights {
    return new Insights({ 'app': this.app, 'client': this.client, 'logger': this.logger }, { 'intervalSubmit': 60 * 1000 });
  }

  @cache
  get core(): ICore {
    return new Core({'config': this.config, 'logger': this.logger, 'emitter': this.eventEmitter, 'insights': this.insights});
  }

  @cache
  get device(): IDevice {
    return new Device({'emitter': this.eventEmitter});
  }

  @cache
  get cordova(): ICordova {
    return new Cordova({'device': this.device, 'emitter': this.eventEmitter, 'logger': this.logger});
  }

  @cache
  get storage(): IStorage {
    return new Storage({'strategy': this.localStorageStrategy});
  }

  @cache
  get userContext(): IUserContext {
    return new UserContext({'storage': this.storage, 'config': this.config});
  }

  @cache
  get singleUserService(): ISingleUserService {
    return new SingleUserService({'client': this.client, 'context': this.userContext});
  }

  @cache
  get authModules(): IAuthModules {
    return {
      'basic': new BasicAuth({'config': this.config, 'client': this.client}),
      'custom': new CustomAuth({'config': this.config, 'client': this.client}),
      'twitter': new TwitterAuth({'config': this.config, 'client': this.client}),
      'facebook': new FacebookAuth({'config': this.config, 'client': this.client}),
      'github': new GithubAuth({'config': this.config, 'client': this.client}),
      'google': new GoogleAuth({'config': this.config, 'client': this.client}),
      'instagram': new InstagramAuth({'config': this.config, 'client': this.client}),
      'linkedin': new LinkedInAuth({'config': this.config, 'client': this.client})
    };
  }

  @cache
  get auth(): IAuth {
    return new Auth({
      'emitter': this.eventEmitter,
      'authModules': this.authModules,
      'tokenContext': this.authTokenContext,
      'userService': this.singleUserService
    });
  }

  @cache
  get push(): IPush {
    return new Push({
      'config': this.config,
      'app': this.app,
      'auth': this.auth,
      'userService': this.singleUserService,
      'device': this.device,
      'client': this.client,
      'emitter': this.eventEmitter,
      'storage': this.storage,
      'logger': this.logger
    });
  }

  @cache
  get deploy(): IDeploy {
    return new Deploy({
      'config': this.config,
      'emitter': this.eventEmitter,
      'logger': this.logger
    });
  }

}
