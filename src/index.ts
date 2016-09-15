export * from './definitions';

export {
  Auth,
  AuthType,
  BasicAuth,
  CustomAuth,
  FacebookAuth,
  GithubAuth,
  GoogleAuth,
  InstagramAuth,
  LinkedInAuth,
  TwitterAuth
} from './auth';

export { Client } from './client';
export { Config } from './config';
export { Cordova } from './cordova';
export { Core } from './core';
export { Deploy } from './deploy/deploy';
export { Device } from './device';
export { Database } from './database/database';
export { Exception, DetailedError } from './errors';
export { Container as DIContainer } from './di';
export { EventEmitter } from './events';
export { Insights } from './insights';
export { Logger } from './logger';
export { Push } from './push/push';
export { PushMessage } from './push/message';
export { Storage, LocalStorageStrategy, SessionStorageStrategy } from './storage';
export { UserContext, User, SingleUserService } from './user/user';

import { bootstrapAngular1 } from './angular';
bootstrapAngular1();
