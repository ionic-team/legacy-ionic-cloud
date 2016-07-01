export interface IDetailedError<D> extends Error {
  details?: D;
}

export interface IApp {
  id: string;
  gcmKey: string;
}

export interface ILogger {
  silent: boolean;

  infofn: (message?: any, ...optionalParams: any[]) => void;
  warnfn: (message?: any, ...optionalParams: any[]) => void;
  errorfn: (message?: any, ...optionalParams: any[]) => void;
  info(message?: any, ...optionalParams: any[]);
  warn(message?: any, ...optionalParams: any[]);
  error(message?: any, ...optionalParams: any[]);
}

export interface ISettingsUrls {
  api?: string;
}

export interface ISettings {
  app_id: string;
  gcm_key?: string;
  urls?: any;
  [key: string]: any;
}

export interface IConfig {
  register(settings: ISettings);
  get(name: string): any;
  getURL(name: string): string;
}

export interface IClient {
  baseUrl: string;

  get(endpoint: string);
  post(endpoint: string);
  put(endpoint: string);
  patch(endpoint: string);
  delete(endpoint: string);
  request(method: string, endpoint: string);
}

export type EventHandler = (data: Object) => any;

export interface IEventEmitter {
  on(event: string, callback: EventHandler);
  once(event: string, callback: () => void);
  emit(event: string, data?: Object);
  emitted(event: string): number;
}

export interface StorageDependencies {
  strategy: IStorageStrategy;
}

export interface StorageOptions {
  cache?: boolean;
}

export interface IStorage {
  get(key: string): any;
  set(key: string, value: any): void;
  delete(key: string): void;
}

export interface IStorageStrategy {
  get(key: string): string;
  remove(key: string): void;
  set(key: string, value: string): void;
}

export interface DeviceDependencies {
  emitter: IEventEmitter;
}

export interface IDevice {
  deviceType: string;

  isAndroid(): boolean;
  isIOS(): boolean;
}

export interface CordovaDependencies {
  device: IDevice;
  emitter: IEventEmitter;
  logger: ILogger;
}

export interface CordovaOptions {}

export interface ICordova {
  bootstrap(): void;
}

export interface CoreDependencies {
  config: IConfig;
  logger: ILogger;
  emitter: IEventEmitter;
  insights: IInsights;
}

export interface ICore {
  version: string;
}

export interface UserContextDependencies {
  config: IConfig;
  storage: IStorage;
}

export interface IUserContext {
  label: string;

  load(user: IUser): IUser;
  store(user: IUser): void;
  unstore(): void;
}

export interface StoredUser {
  id: string;
  data: Object;
  details: Object;
  fresh: boolean;
}

export interface IUserData {
  data: Object;

  get(key: string, defaultValue: any);
  set(key: string, value: any);
  unset(key: string);
}

export interface UserDetails {
  email?: string;
  password?: string;
  username?: string;
  image?: string;
  name?: string;
  custom?: Object;
}

export interface UserDependencies {
  service: ISingleUserService;
}

export interface IUser {
  id: string;
  fresh: boolean;
  details: UserDetails;
  data: IUserData;

  isAnonymous(): boolean;
  get(key: string, defaultValue: any);
  set(key: string, value: any);
  unset(key: string);
  clear();
  store();
  unstore();
  save(): Promise<void>;
  delete(): Promise<void>;
  serializeForAPI(): Object;
  serializeForStorage(): Object;
}

export interface SingleUserServiceDependencies {
  client: IClient;
  context: IUserContext;
}

export interface SingleUserServiceOptions {}

export interface ISingleUserService {
  current(): IUser;
  store();
  unstore();
  load(id?: string): Promise<void>;
  delete(): Promise<void>;
  save(): Promise<void>;
}

export interface TokenContextDependencies {
  storage: IStorageStrategy;
}

export interface ITokenContextStoreOptions {}

export interface ITokenContext {
  label: string;

  get(): string;
  store(token: string, options: ITokenContextStoreOptions): void;
  delete(): void;
}

export interface CombinedTokenContextDependencies {
  storage: IStorageStrategy;
  tempStorage: IStorageStrategy;
}

export interface ICombinedTokenContextStoreOptions extends ITokenContextStoreOptions {
  permanent?: boolean;
}

export interface ICombinedTokenContext extends ITokenContext {
  store(token: string, options: ICombinedTokenContextStoreOptions): void;
}

export type AuthModuleId = "basic" | "custom" | "facebook" | "github" | "google" | "instagram" | "linkedin" | "twitter";

export interface AuthTypeDependencies {
  config: IConfig;
  client: IClient;
}

export interface IAuthType {
  authenticate(data): Promise<any>;
}

export interface BasicLoginCredentials {
  email: string;
  password: string;
}

export interface IBasicAuthType extends IAuthType {
  signup(data: UserDetails): Promise<void>;
}

export interface IAuthModules {
  basic: IBasicAuthType;
  custom: IAuthType;
  facebook: IAuthType;
  github: IAuthType;
  google: IAuthType;
  instagram: IAuthType;
  linkedin: IAuthType;
  twitter: IAuthType;
}

export interface LoginOptions {
  remember?: boolean;
}

export interface AuthDependencies {
  emitter: IEventEmitter;
  authModules: IAuthModules;
  tokenContext: ICombinedTokenContext;
  userService: ISingleUserService;
}

export interface AuthOptions {}

export interface IAuth {
  isAuthenticated(): boolean;
  login(moduleId: AuthModuleId, options: LoginOptions, data): Promise<IUser>;
  logout(): void;
  signup(data: UserDetails): Promise<void>;
}

export interface IAppStatus {
  asleep?: boolean;
  closed?: boolean;
}

export interface IPluginRegistration {
  registrationId: string;
}

export interface IPluginNotificationAdditionalData {
  foreground: boolean;
  coldstart: boolean;
  [key: string]: any;
}

export interface IPluginNotification {
  message: string;
  title: string;
  count: number;
  sound: string;
  image: string;
  launchArgs: string;
  additionalData: IPluginNotificationAdditionalData;
}

export interface IPushMessage {
  app: IAppStatus;
  text: string;
  title: string;
  count: number;
  sound: string;
  image: string;
  raw: IPluginNotification;
  payload: Object;
}

export interface IPushNotificationEvent {
  message: IPushMessage;
  data: IPluginNotification;
}

export interface SaveTokenOptions {
  ignore_user?: boolean;
}

export interface PushDependencies {
  app: IApp;
  config: IConfig;
  auth: IAuth;
  userService: ISingleUserService;
  device: IDevice;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage;
  logger: ILogger;
}

export interface PushOptions {
  debug?: boolean;
  pluginConfig?: any;
}

export interface IPushToken {
  registered: boolean;
  saved: boolean;
  token: string;
}

export interface IPush {
  plugin: any;
  token: IPushToken;

  saveToken(token: IPushToken, options: SaveTokenOptions): Promise<IPushToken>;
  register(): Promise<IPushToken>;
  unregister(): Promise<void>;
}

export interface DeployWatchOptions {
  interval?: number;
  initialDelay?: number;
}

export interface DeployDownloadOptions {
  onProgress?: (p: number) => void;
}

export interface DeployExtractOptions {
  onProgress?: (p: number) => void;
}

export interface DeployUpdateOptions {
  deferLoad?: boolean;
  onProgress?: (p: number) => void;
}

export interface DeployOptions {}

export interface DeployDependencies {
  config: IConfig;
  emitter: IEventEmitter;
  logger: ILogger;
}

export interface IDeploy {
  check(): Promise<boolean>;
  download(options?: DeployDownloadOptions): Promise<boolean>;
  extract(options?: DeployExtractOptions): Promise<boolean>;
  update(options?: DeployUpdateOptions): Promise<boolean>;
  watch(options?: DeployWatchOptions): void;
  unwatch(): void;
  load();
  info(): Promise<any>;
  getVersions(): Promise<any>;
  deleteVersion(uuid: string): Promise<any>;
  getMetadata(uuid: string): Promise<any>;
  setChannel(channelTag: string): void;
}

export interface IStatSerialized {
  app_id: string;
  stat: string;
  value: number;
  created: string;
}

export interface InsightsDependencies {
  app: IApp;
  client: IClient;
  logger: ILogger;
}

export interface InsightsOptions {
  intervalSubmit?: number;
  submitCount?: number;
}

export interface IInsights {
  submitCount: number;

  track(stat: string, value?: number): void;
}
