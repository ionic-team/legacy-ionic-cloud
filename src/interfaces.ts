export interface IDetailedError<D> extends Error {
  details?: D;
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

export interface IDevice {
  deviceType: string;

  isAndroid(): boolean;
  isIOS(): boolean;
}

export interface ICordova {
  load(): void;
}

export interface ICore {
  version: string;
  config: IConfig;
  logger: ILogger;
  emitter: IEventEmitter;
  client: IClient;
  device: IDevice;
  cordova: ICordova;
  storage: IStorage;

  init(cfg: ISettings);
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

export interface ISingleUserService {
  current(): IUser;
  store();
  unstore();
  self(): Promise<IUser>;
  load(id: string);
  delete(): Promise<void>;
  save(): Promise<void>;
  resetPassword(): Promise<void>;
}

export interface TokenContextStoreOptions {}

export interface ITokenContext {
  label: string;
  storage: IStorageStrategy;

  get(): string;
  store(token: string, options?: TokenContextStoreOptions): void;
  delete(): void;
}

export type AuthModuleId = "basic" | "custom" | "facebook" | "github" | "google" | "instagram" | "linkedin" | "twitter";

export interface IAuthType {
  authenticate(data): Promise<any>;
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

export interface IAuth {
  authModules: IAuthModules;
  tokenContext: ITokenContext;
  userService: ISingleUserService;

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

export interface IStatSerialized {
  app_id: string;
  stat: string;
  value: number;
  created: string;
}
