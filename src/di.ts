import { IConfig, IEventEmitter, ILogger, IStorageStrategy, IClient, ICore, IDevice, ICordova, IStorage, ISingleUserService, IAuthModules, IAuth } from './interfaces';
import { Auth, CombinedAuthTokenContext, BasicAuth, CustomAuth, TwitterAuth, FacebookAuth, GithubAuth, GoogleAuth, InstagramAuth, LinkedInAuth } from './auth';
import { Client } from './client';
import { Config } from './config';
import { Cordova } from './cordova';
import { Core } from './core';
import { Deploy } from './deploy/deploy';
import { Device } from './device';
import { EventEmitter } from './events';
import { Logger } from './logger';
import { Push } from './push/push';
import { Storage, LocalStorageStrategy, SessionStorageStrategy } from './storage';
import { UserContext, SingleUserService } from './user/user';

interface Modules {
  [key: string]: any;
}

let modules: Modules = {};

function cache(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  let method = descriptor.get;

  descriptor.get = function() {
    if (typeof modules[propertyKey] === 'undefined') {
      let value = method.apply(this, arguments);
      modules[propertyKey] = value;
    }

    return modules[propertyKey];
  };

  descriptor.set = (value) => {};
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
  get localStorageStrategy(): IStorageStrategy {
    return new LocalStorageStrategy();
  }

  @cache
  get sessionStorageStrategy(): IStorageStrategy {
    return new SessionStorageStrategy();
  }

  @cache
  get authTokenContext(): CombinedAuthTokenContext {
    let label = 'ionic_io_auth_' + this.config.get('app_id');
    return new CombinedAuthTokenContext(label, this.localStorageStrategy, this.sessionStorageStrategy);
  }

  @cache
  get client(): IClient {
    return new Client(this.authTokenContext, this.config.getURL('api'));
  }

  @cache
  get core(): ICore {
    return new Core(this.config, this.logger, this.eventEmitter, this.client);
  }

  @cache
  get device(): IDevice {
    return new Device(this.eventEmitter);
  }

  @cache
  get cordova(): ICordova {
    return new Cordova({}, this.device, this.eventEmitter, this.logger);
  }

  @cache
  get storage(): IStorage {
    return new Storage({}, this.localStorageStrategy);
  }

  @cache
  get userContext(): UserContext {
    return new UserContext(this.storage, this.config);
  }

  @cache
  get singleUserService(): ISingleUserService {
    return new SingleUserService({}, this.client, this.userContext);
  }

  @cache
  get authModules(): IAuthModules {
    return {
      'basic': new BasicAuth(this.config, this.client),
      'custom': new CustomAuth(this.config, this.client),
      'twitter': new TwitterAuth(this.config, this.client),
      'facebook': new FacebookAuth(this.config, this.client),
      'github': new GithubAuth(this.config, this.client),
      'google': new GoogleAuth(this.config, this.client),
      'instagram': new InstagramAuth(this.config, this.client),
      'linkedin': new LinkedInAuth(this.config, this.client)
    };
  }

  @cache
  get auth(): IAuth {
    return new Auth({}, this.eventEmitter, this.authModules, this.authTokenContext, this.singleUserService);
  }

  @cache
  get push(): Push {
    return new Push({}, this.config, this.auth, this.device, this.client, this.eventEmitter, this.storage, this.logger);
  }

  @cache
  get deploy(): Deploy {
    return new Deploy({}, this.config, this.eventEmitter, this.logger);
  }

}
