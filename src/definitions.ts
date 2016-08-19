/** Represents an error with generic details.
 *
 * Error details can be extracted depending on the type of `D`. For instance,
 * if the type of `D` is `string[]`, you can do this:
 *
 * ```typescript
 * function handleError(err: IDetailedError<string[]>) {
 *   for (let i in err.details) {
 *     console.error('got error code: ' + i);
 *   }
 * }
 * ```
 */
export interface IDetailedError<D> extends Error {

  /**
   * The error details.
   */
  details?: D;
}

/**
 * A function which `Logger` uses to log messages. It takes an optional message
 * and any number of additional params.
 */
export type LogFn = (message?: any, ...optionalParams: any[]) => void;

/**
 * The options for `Logger`.
 */
export interface LoggerOptions {

  /**
   * If silent is `true`, the `Logger`'s `infofn` and `warnfn` will not be
   * called.
   */
  silent?: boolean;
}

/**
 * Represents a `Logger`.
 */
export interface ILogger {
  infofn: LogFn;
  warnfn: LogFn;
  errorfn: LogFn;
  info(message?: any, ...optionalParams: any[]);
  warn(message?: any, ...optionalParams: any[]);
  error(message?: any, ...optionalParams: any[]);
}

/**
 * @hidden
 */
export interface CloudSettingsUrls {
  api?: string;
  web?: string;
}

/**
 * General settings for the Cloud Client.
 */
export interface CoreSettings {
  /**
   * Your app ID.
   */
  app_id: string;

  /**
   * @hidden
   */
  urls?: CloudSettingsUrls;
}

/**
 * The settings object for the Cloud Client.
 *
 * `CloudSettings` contains various specific configuration sections, acting more
 * like a parent object for them.
 */
export interface CloudSettings {

  /**
   * General settings for the Cloud Client.
   */
  core: CoreSettings;

  /**
   * Settings for Push Notifications.
   */
  push?: PushOptions;

  /**
   * Log settings.
   */
  logger?: LoggerOptions;
}

/**
 * Represents a `Config`.
 */
export interface IConfig {
  settings: CloudSettings;

  register(settings: CloudSettings);
  get(name: string): any;
  getURL(name: string): string;
}

/**
 * Represents a `Client`.
 */
export interface IClient {
  baseUrl: string;

  get(endpoint: string);
  post(endpoint: string);
  put(endpoint: string);
  patch(endpoint: string);
  delete(endpoint: string);
  request(method: string, endpoint: string);
}

/**
 * A function which `EventEmitter` uses to handle events.
 *
 * All event handlers have a single parameter: `data`, which is always an
 * object and which will differ depending on the event.
 */
export type EventHandler = (data: Object) => any;

/**
 * Represents an `EventReceiver`.
 */
export interface IEventReceiver {
  key: string | number;
  event: string;
  handler: EventHandler;
}

/**
 * Represents an `EventEmitter`.
 */
export interface IEventEmitter {
  on(event: string, callback: EventHandler);
  off(receiver: IEventReceiver);
  once(event: string, callback: () => void);
  emit(event: string, data?: Object);
  emitted(event: string): number;
}

/**
 * @hidden
 */
export interface StorageDependencies {
  strategy: IStorageStrategy;
}

/**
 * @hidden
 */
export interface StorageOptions {
  prefix?: string;
  cache?: boolean;
}

/**
 * Represents a `Storage`.
 */
export interface IStorage<T> {
  get(key: string): T;
  set(key: string, value: T): void;
  delete(key: string): void;
}

/**
 * @hidden
 */
export interface IStorageStrategy {
  get(key: string): string;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/**
 * @hidden
 */
export interface DeviceIsConnectedToNetworkOptions {
  strictMode?: boolean;
}

/**
 * @hidden
 */
export interface DeviceDependencies {
  emitter: IEventEmitter;
}

/**
 * @hidden
 */
export interface IDevice {
  deviceType: string;

  isAndroid(): boolean;
  isIOS(): boolean;
}

/**
 * @hidden
 */
export interface CordovaDependencies {
  appStatus: IAppStatus;
  device: IDevice;
  emitter: IEventEmitter;
  logger: ILogger;
}

/**
 * @hidden
 */
export interface CordovaOptions {}

/**
 * @hidden
 */
export interface ICordova {
  app: IAppStatus;

  bootstrap(): void;
}

/**
 * @hidden
 */
export interface CoreDependencies {
  config: IConfig;
  logger: ILogger;
  emitter: IEventEmitter;
  insights: IInsights;
}

/**
 * @hidden
 */
export interface ICore {
  version: string;

  init(): void;
}

/**
 * @hidden
 */
export interface UserContextDependencies {
  config: IConfig;
  storage: IStorage<StoredUser>;
}

/**
 * @hidden
 */
export interface IUserContext {
  label: string;

  load(user: IUser): IUser;
  store(user: IUser): void;
  unstore(): void;
}

/**
 * Represents a locally stored user (usually in local storage).
 */
export interface StoredUser {
  id: string;
  data: Object;
  details: Object;
  social: Object;
  fresh: boolean;
}

/**
 * @hidden
 */
export interface IUserData {
  data: Object;

  get(key: string, defaultValue: any);
  set(key: string, value: any);
  unset(key: string);
}

/**
 * The user details common to us and you, used in email/password
 * authentication.
 *
 * We store common fields such as `email` and `password` separate from your
 * custom data to avoid name clashes.
 */
export interface UserDetails {

  /**
   * The user's email address.
   *
   * We enforce email address correctness server-side.
   */
  email?: string;

  /**
   * The user's password.
   *
   * We enforce no password requirements and expect you to implement
   * client-side password requirements that best suit your app.
   */
  password?: string;

  /**
   * A username unique to the user.
   *
   * You can use it in addition to `email` to identify your users. Uniqueness
   * is enforced on this field.
   */
  username?: string;

  /**
   * A URL to an image for the user.
   *
   * `image` defaults to a generic user avatar hosted by us.
   */
  image?: string;

  /**
   * The user's full (first + last) name, generally used for display.
   */
  name?: string;

  /**
   * TODO: Better way to handle this?
   *
   * @hidden
   */
  custom?: Object;
}

/**
 * @hidden
 */
export interface UserDependencies {
  service: ISingleUserService;
}

/**
 * The user social details we collect from the social networks for social
 * authentication.
 *
 * `UserSocialDetails` is a container. Depending on which social providers you
 * use, the details are accessible as their respective fields.
 */
export interface UserSocialDetails {

  /**
   * The provider details for Facebook Authentication.
   */
  facebook?: UserSocialProviderDetails;

  /**
   * The provider details for Github Authentication.
   */
  github?: UserSocialProviderDetails;

  /**
   * The provider details for Twitter Authentication.
   */
  twitter?: UserSocialProviderDetails;

  /**
   * The provider details for Instagram Authentication.
   */
  instagram?: UserSocialProviderDetails;

  /**
   * The provider details for Google Authentication.
   */
  google?: UserSocialProviderDetails;

  /**
   * The provider details for LinkedIn Authentication.
   */
  linkedin?: UserSocialProviderDetails;
}

/**
 * More general information from the social network.
 *
 * Although these details have the same keys and types regardless of the social
 * providers you use, we don't guarantee every field has a value. Some networks
 * don't give us `email`, others don't give us `username`.
 */
export interface UserSocialProviderDetailsData {

  /**
   * The email address of the user on the social network.
   */
  email: string;

  /**
   * The username of the user on the social network.
   */
  username: string;

  /**
   * The full (first + last) name of the user on the social network.
   */
  full_name: string;

  /**
   * A URL to the profile picture of the user on the social network.
   */
  profile_picture: string;

  /**
   * Raw data about this user from the network.
   *
   * It is generally unsafe to rely on raw data, as we can't promise social
   * networks won't change the format. For developers that like to live on the
   * wild side, enjoy.
   */
  raw_data: Object;
}

/**
 * The provider-specific user social details.
 *
 * These details have the same keys and types no matter what social providers
 * you use.
 */
export interface UserSocialProviderDetails {

  /**
   * The ID of the user in the social network.
   */
  uid: string;

  /**
   * More general information from the social network.
   */
  data: UserSocialProviderDetailsData;
}

/**
 * Represents a `User`.
 */
export interface IUser {
  id: string;
  fresh: boolean;
  details: UserDetails;
  social: UserSocialDetails;
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
  serializeForAPI(): UserDetails;
  serializeForStorage(): StoredUser;
}

/**
 * @hidden
 */
export interface SingleUserServiceDependencies {
  client: IClient;
  context: IUserContext;
}

/**
 * @hidden
 */
export interface SingleUserServiceOptions {}

/**
 * @hidden
 */
export interface ISingleUserService {
  current(): IUser;
  store();
  unstore();
  load(id?: string): Promise<void>;
  delete(): Promise<void>;
  save(): Promise<void>;
}

/**
 * @hidden
 */
export interface TokenContextDependencies {
  storage: IStorage<string>;
}

/**
 * @hidden
 */
export interface ITokenContextStoreOptions {}

/**
 * @hidden
 */
export interface ITokenContext {
  label: string;

  get(): string;
  store(token: string, options: ITokenContextStoreOptions): void;
  delete(): void;
}

/**
 * @hidden
 */
export interface CombinedTokenContextDependencies extends TokenContextDependencies {
  tempStorage: IStorage<string>;
}

/**
 * @hidden
 */
export interface ICombinedTokenContextStoreOptions extends ITokenContextStoreOptions {
  permanent?: boolean;
}

/**
 * @hidden
 */
export interface ICombinedTokenContext extends ITokenContext {
  store(token: string, options: ICombinedTokenContextStoreOptions): void;
}

/**
 * These are the valid [authentication providers](/services/users/#providers).
 */
export type AuthModuleId = 'basic' | 'custom' | 'facebook' | 'github' | 'google' | 'instagram' | 'linkedin' | 'twitter';

/**
 * @hidden
 */
export interface AuthTypeDependencies {
  config: IConfig;
  client: IClient;
}

/**
 * A container object that [`login()`](/api/client/auth#login) resolves with.
 */
export interface AuthLoginResult {

  /**
   * The raw auth token string.
   */
  token: string;

  /**
   * For social authentication, we create a user account the first time a user
   * logs in. When `true`, this flag indicates the user has just signed up for
   * the first time.
   */
  signup?: boolean;
}

/**
 * @hidden
 */
export interface IAuthType {
  authenticate(data, options?: AuthLoginOptions): Promise<AuthLoginResult>;
}

/**
 * @hidden
 */
export interface BasicLoginCredentials {
  email: string;
  password: string;
}

/**
 * @hidden
 */
export interface IBasicAuthType extends IAuthType {
  signup(data: UserDetails): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(email: string, code: number, newPassword: string): Promise<void>;
}

/**
 * @hidden
 */
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

/**
 * Options for `login()` in `Auth`.
 *
 * `Auth` uses the InAppBrowser plugin to redirect the user through
 * authentication. We expose settings for when we open a plugin window.
 */
export interface AuthLoginOptions {

  /**
   * If `true`, the user's session is persisted in local storage, but not
   * guaranteed to be remembered.
   */
  remember?: boolean;

  /**
   * The options for the InAppBrowser window that is opened.
   */
  inAppBrowserOptions?: InAppBrowserPluginOptions;
}

/**
 * @hidden
 */
export interface AuthDependencies {
  config: IConfig;
  emitter: IEventEmitter;
  authModules: IAuthModules;
  tokenContext: ICombinedTokenContext;
  userService: ISingleUserService;
  storage: IStorage<string>;
}

/**
 * @hidden
 */
export interface AuthOptions {}

/**
 * Represents `Auth`.
 */
export interface IAuth {
  options: AuthOptions;
  passwordResetUrl: string;
  isAuthenticated(): boolean;
  login(moduleId: 'basic', credentials: BasicLoginCredentials, options?: AuthLoginOptions): Promise<AuthLoginResult>;
  login(moduleId: 'custom', credentials: Object, options?: AuthLoginOptions): Promise<AuthLoginResult>;
  login(moduleId: AuthModuleId, credentials?: Object, options?: AuthLoginOptions): Promise<AuthLoginResult>;
  logout(): void;
  signup(data: UserDetails): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(code: number, newPassword: string): Promise<void>;
}

/**
 * Simple status flags of an app.
 */
export interface IAppStatus {

  /**
   * When `true`, the app was asleep when this was constructed.
   */
  asleep?: boolean;

  /**
   * When `true`, the app was closed when this was constructed.
   */
  closed?: boolean;
}

/**
 * @hidden
 */
export interface IPluginRegistration {
  registrationId: string;
}

/**
 * Additional data from the Push Plugin.
 */
export interface IPluginNotificationAdditionalData {

  /**
   * Whether the notification was received while the app was in the foreground.
   */
  foreground: boolean;

  /**
   * Will be `true` if the application is started by clicking on the push
   * notification, `false` if the app is already started.
   */
  coldstart: boolean;

  [key: string]: any;
}

/**
 * The notification object received from the Push Plugin.
 *
 * Full documentation and examples can be found on the Push Plugin's
 * [README](https://github.com/phonegap/phonegap-plugin-push/blob/master/docs/API.md#pushonnotification-callback).
 */
export interface IPluginNotification {

  /**
   * The text of the push message sent from the 3rd party service.
   */
  message: string;

  /**
   * The optional title of the push message sent from the 3rd party service.
   */
  title: string;

  /**
   * The number of messages to be displayed in the badge in iOS/Android or
   * message count in the notification shade in Android. For windows, it
   * represents the value in the badge notification which could be a number or
   * a status glyph.
   */
  count: number;

  /**
   * The name of the sound file to be played upon receipt of the notification.
   */
  sound: string;

  /**
   * The path of the image file to be displayed in the notification.
   */
  image: string;

  /**
   * The args to be passed to the application on launch from push notification.
   * This works when notification is received in background. (Windows Only)
   */
  launchArgs: string;

  /**
   * An optional collection of data sent by the 3rd party push service that
   * does not fit in the above properties.
   */
  additionalData: IPluginNotificationAdditionalData;
}

/**
 * Represents a `PushMessage`.
 */
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

/**
 * The interface to which the `push:notification` event adheres.
 */
export interface IPushNotificationEvent {

  /**
   * The push message.
   */
  message: IPushMessage;

  /**
   * The raw push notification from the Push Plugin.
   */
  data: IPluginNotification;
}

/**
 * Options for `saveToken()` in `Push`.
 */
export interface PushSaveTokenOptions {

  /**
   * When `true`, do not attempt to save the token to the active user.
   */
  ignore_user?: boolean;
}

/**
 * @hidden
 */
export interface PushStorageObject {
  token: string;
}

/**
 * @hidden
 */
export interface PushDependencies {
  config: IConfig;
  auth: IAuth;
  userService: ISingleUserService;
  device: IDevice;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<PushStorageObject>;
  logger: ILogger;
}

/**
 * The configuration options for the Push Plugin.
 *
 * Full documentation and examples can be found on the Push Plugin's
 * [README](https://github.com/phonegap/phonegap-plugin-push/blob/master/docs/API.md#pushnotificationinitoptions).
 */
export interface PushPluginConfig {
  android?: {
    senderID?: string;
    icon?: string;
    iconColor?: string;
    sound?: boolean;
    vibrate?: boolean;
    clearBadge?: boolean;
    clearNotifications?: boolean;
    forceShow?: boolean;
    topics?: string[];
  };
  ios?: {
    alert?: boolean | string;
    badge?: boolean | string;
    sound?: boolean | string;
    clearBadge?: boolean | string;
    categories?: any;
  };
}

/**
 * The configuration options for an InAppBrowser window.
 *
 * Full documentation and examples can be found on the InAppBrowser Plugin's
 * [README](https://github.com/apache/cordova-plugin-inappbrowser#cordovainappbrowseropen).
 */
export interface InAppBrowserPluginOptions {
  location?: boolean;
  hidden?: boolean;
  clearcache?: boolean;
  clearsessioncache?: boolean;
  zoom?: boolean;
  hardwareback?: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  closebuttoncaption?: string;
  disallowoverscroll?: boolean;
  toolbar?: boolean;
  enableViewportScale?: boolean;
  allowInlineMediaPlayback?: boolean;
  keyboardDisplayRequiresUserAction?: boolean;
  suppressesIncrementalRendering?: boolean;
  presentationstyle?: "pagesheet" | "formsheet" | "fullscreen";
  transitionstyle?: "fliphorizontal" | "crossdissolve" | "coververtical";
  toolbarposition?: "top" | "bottom";
  fullscreen?: boolean;
}

/**
 * Settings for Push Notifications.
 */
export interface PushOptions {

  /**
   * The GCM project ID.
   */
  sender_id?: string;

  /**
   * When `true`, debug logs for push notifications are enabled.
   */
  debug?: boolean;

  /**
   * Configuration options to pass onto the Push Plugin.
   */
  pluginConfig?: PushPluginConfig;
}

/**
 * Represents `PushToken`.
 */
export interface IPushToken {
  registered: boolean;
  saved: boolean;
  token: string;
}

/**
 * Represents `Push`.
 */
export interface IPush {
  options: PushOptions;
  plugin: any;
  token: IPushToken;

  saveToken(token: IPushToken, options: PushSaveTokenOptions): Promise<IPushToken>;
  register(): Promise<IPushToken>;
  unregister(): Promise<void>;
}

/**
 * Options for `download()` in `Deploy`.
 */
export interface DeployDownloadOptions {

  /**
   * Attach a progress handler for the download.
   *
   * `p` is a number from 0 to 100, representing the download progress.
   */
  onProgress?: (p: number) => void;
}

/**
 * Options for `extract()` in `Deploy`.
 */
export interface DeployExtractOptions {

  /**
   * Attach a progress handler for the extraction process.
   *
   * `p` is a number from 0 to 100, representing the extraction progress.
   */
  onProgress?: (p: number) => void;
}

/**
 * These are the valid deploy channels. `DeployChannel` can also be any string,
 * allowing for custom channel tags.
 */
export type DeployChannel = 'dev' | 'staging' | 'production' | string;

/**
 * @hidden
 */
export interface DeployOptions {}

/**
 * @hidden
 */
export interface DeployDependencies {
  config: IConfig;
  emitter: IEventEmitter;
  logger: ILogger;
}

/**
 * Represents a `Deploy`.
 */
export interface IDeploy {
  channel: DeployChannel;
  options: DeployOptions;

  check(): Promise<boolean>;
  download(options?: DeployDownloadOptions): Promise<boolean>;
  extract(options?: DeployExtractOptions): Promise<boolean>;
  load();
  info(): Promise<any>;
  getSnapshots(): Promise<any>;
  deleteSnapshot(uuid: string): Promise<any>;
  getMetadata(uuid: string): Promise<any>;
}

/**
 * @hidden
 */
export interface IStatSerialized {
  app_id: string;
  stat: string;
  value: number;
  created: string;
}

/**
 * @hidden
 */
export interface InsightsDependencies {
  appStatus: IAppStatus;
  storage: IStorage<string>;
  config: IConfig;
  client: IClient;
  logger: ILogger;
}

/**
 * @hidden
 */
export interface InsightsOptions {
  intervalSubmit?: number;
  intervalActiveCheck?: number;
  submitCount?: number;
}

/**
 * @hidden
 */
export interface IInsights {
  track(stat: string, value?: number): void;
}
