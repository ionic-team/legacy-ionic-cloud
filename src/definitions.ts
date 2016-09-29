import { Device as NativeDevice } from 'ionic-native';

/**
 * @hidden
 */
export interface SemanticVersion {
  major: number;
  minor?: number;
  patch?: number;
}

/**
 * Represents [`DetailedError`](/api/client/detailederror/).
 */
export interface IDetailedError<D> extends Error {

  /**
   * The error details.
   */
  details?: D;
}

/**
 * A function which [`Logger`](/api/client/logger/) uses to log messages. It
 * takes an optional message and any number of additional params.
 */
export type LogFn = (message?: any, ...optionalParams: any[]) => void;

/**
 * The options for [`Logger`](/api/client/logger/).
 */
export interface LoggerOptions {

  /**
   * If silent is `true`, the `Logger`'s `infofn` and `warnfn` will not be
   * called.
   */
  silent?: boolean;
}

/**
 * Represents a [`Logger`](/api/client/logger/).
 */
export interface ILogger {

  /**
   * The function to use to log info level messages.
   */
  infofn: LogFn;

  /**
   * The function to use to log warn level messages.
   */
  warnfn: LogFn;

  /**
   * The function to use to log error level messages.
   */
  errorfn: LogFn;

  /**
   * Send a log at info level.
   *
   * @param message - The message to log.
   */
  info(message?: any, ...optionalParams: any[]);

  /**
   * Send a log at warn level.
   *
   * @param message - The message to log.
   */
  warn(message?: any, ...optionalParams: any[]);

  /**
   * Send a log at error level.
   *
   * @param message - The message to log.
   */
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

export interface AuthOptions {
  /**
   * Your webClientId (aka, reverseId)
   */
  google: {
    webClientId: string;
    scope: GoogleScope[];
  };

  /**
   * Your facebook scopes.
   */
  facebook: {
    scope: FacebookScope[];
  };
}

/**
 * The settings object for the Cloud Client.
 *
 * `CloudSettings` contains various specific configuration sections, acting more
 * like a parent object for them.
 *
 * @featured
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
   * Settings for native auth.
   */
  auth?: AuthOptions;

  /**
   * Log settings.
   */
  logger?: LoggerOptions;
}

/**
 * @hidden
 */
export interface IConfig {
  settings: CloudSettings;

  register(settings: CloudSettings);
  get(name: string): any;
  getURL(name: string): string;
}

/**
 * Represents a [`Client`](/api/client/client/).
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
 * A function which [`EventEmitter`](/api/client/eventemitter/) uses to handle
 * events.
 *
 * All event handlers have a single parameter: `data`, which is always an
 * object and which will differ depending on the event.
 */
export type EventHandler = (data?: Object) => any;

/**
 * Represents an [`EventReceiver`](/api/client/eventreceiver/).
 */
export interface IEventReceiver {
  key: string | number;
  event: string;
  handler: EventHandler;
}

/**
 * Represents an [`EventEmitter`](/api/client/eventemitter/).
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
 * Represents a [`Storage`](/api/client/storage/).
 */
export interface IStorage<T> {

  /**
   * Get a value from the storage by the given key.
   *
   * @param key - The storage key to get.
   */
  get(key: string): T | null;

  /**
   * Set a value in the storage by the given key.
   *
   * @param key - The storage key to set.
   * @param value - The value to set. (Must be JSON-serializable).
   */
  set(key: string, value: T): void;

  /**
   * Delete a value from the storage by the given key.
   *
   * @param key - The storage key to delete.
   */
  delete(key: string): void;
}

/**
 * @hidden
 */
export interface IStorageStrategy {
  get(key: string): string | null;
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
  nativeDevice: typeof NativeDevice;
  emitter: IEventEmitter;
}

/**
 * @hidden
 */
export interface IDevice {
  native: typeof NativeDevice;
  type: string;

  isAndroid(): boolean;
  isIOS(): boolean;
}

/**
 * @hidden
 */
export interface CordovaDependencies {
  appStatus: AppStatus;
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
  app: AppStatus;

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

  load(user: IUser): IUser | null;
  store(user: IUser): void;
  unstore(): void;
}

/**
 * Represents a locally stored user (usually in local storage).
 */
export interface StoredUser {
  id?: string;
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
   * The access token of the user.
   */
  access_token: string;

  /**
   * More general information from the social network.
   */
  data: UserSocialProviderDetailsData;
}

/**
 * Represents a [`User`](/api/client/user/).
 */
export interface IUser {

  /**
   * The UUID of this user.
   */
  id?: string;

  /**
   * Is this user fresh, meaning they haven't been persisted?
   */
  fresh: boolean;

  /**
   * The details (email, password, etc) of this user.
   */
  details: UserDetails;

  /**
   * The social details of this user.
   */
  social: UserSocialDetails;

  /**
   * The custom data of this user.
   */
  data: IUserData;


  /**
   * Check whether this user is anonymous or not.
   */
  isAnonymous(): boolean;

  /**
   * Get a value from this user's custom data.
   *
   * Optionally, a default value can be provided.
   *
   * @param key - The data key to get.
   * @param defaultValue - The value to return if the key is absent.
   */
  get(key: string, defaultValue: any);

  /**
   * Set a value in this user's custom data.
   *
   * @param key - The data key to set.
   * @param value - The value to set.
   */
  set(key: string, value: any);

  /**
   * Delete a value from this user's custom data.
   *
   * @param key - The data key to delete.
   */
  unset(key: string);

  /**
   * Revert this user to a fresh, anonymous state.
   */
  clear();

  /**
   * Store this user in local storage.
   */
  store();

  /**
   * Remove this user from local storage.
   */
  unstore();

  /**
   * Save this user to the API.
   */
  save(): Promise<void>;

  /**
   * Delete this user from the API.
   */
  delete(): Promise<void>;

  /**
   * Load the user from the API, overwriting the local user's data.
   *
   * @param id - The user ID to load into this user.
   */
  load(id?: string): Promise<void>;

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

  get(): string | null;
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
 * Facebook native login field permissions
 */
export type FacebookScope = 'basic' | 'public_profile' | 'email';

/**
 * Google native login field permissions.
 */
export type GoogleScope = 'profile' | 'email';

/**
 * These are the IDs of the valid [authentication
 * providers](/services/users/#providers).
 *
 * @featured
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
 * Options for [`login()`](/api/client/auth/#login).
 *
 * [`Auth`](/api/client/auth/) uses the InAppBrowser plugin to redirect the
 * user through authentication. We expose settings for when we open a plugin
 * window.
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
export interface NativeAuthDependencies {
  config: IConfig;
  userService: ISingleUserService;
  client: IClient;
  storage: IStorage<string>;
  tokenContext: ICombinedTokenContext;
  emitter: IEventEmitter;
}

/**
 * @hidden
 */
export interface IGoogleData {
  webClientId: string;
}

/**
 * Represents Facebook Auth, which uses native login via cordova-plugin-facebook4.
 */
export interface IFacebookAuth {
  login(): Promise<any>;
}

/**
 * Represents Google Auth, which uses native login via cordova-plugin-googleplus.
 */
export interface IGoogleAuth {
  login(): Promise<any>;
}

/**
 * Represents [`Auth`](/api/client/auth/).
 */
export interface IAuth {

  /**
   * Link the user to this URL for password resets. Only for email/password
   * authentication.
   */
  passwordResetUrl: string;

  /**
   * Check whether the user is logged in or not.
   */
  isAuthenticated(): boolean;

  /**
   * Attempt to log the user in with the given credentials.
   *
   * @param moduleId
   *  The authentication provider module ID to use with this login.
   * @param credentials
   *  Email and password object.
   * @param options
   *  Options for this login such as whether to remember the login.
   */
  login(moduleId: 'basic', credentials: BasicLoginCredentials, options?: AuthLoginOptions): Promise<AuthLoginResult>;

  /**
   * Kick-off the custom authentication process.
   *
   * @param moduleId
   *  The authentication provider module ID to use with this login.
   * @param credentials
   *  Send whatever details you need to authenticate your custom users.
   * @param options
   *  Options for this login, such as whether to remember the login and
   *  InAppBrowser window options.
   */
  login(moduleId: 'custom', credentials: Object, options?: AuthLoginOptions): Promise<AuthLoginResult>;

  /**
   * Attempt to log the user in with the given credentials. For custom & social
   * logins, kick-off the authentication process.
   *
   * After login, the full user is loaded from the cloud and saved in local
   * storage along with their auth token.
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
  login(moduleId: AuthModuleId, credentials?: Object, options?: AuthLoginOptions): Promise<AuthLoginResult>;

  /**
   * Log the user out of the app.
   *
   * This clears the auth token out of local storage and restores the user to
   * an unauthenticated state.
   */
  logout(): void;

  /**
   * Sign up a user with the given data. Only for email/password
   * authentication.
   *
   * @param details - The details that describe a user.
   */
  signup(data: UserDetails): Promise<void>;

  /**
   * Kick-off the password reset process. Only for email/password
   * authentication.
   *
   * @param email - The email address to which to send a code.
   */
  requestPasswordReset(email: string): Promise<void>;

  /**
   * Confirm a password reset.
   *
   * @param code - The password reset code from the user.
   * @param newPassword - The requested changed password from the user.
   */
  confirmPasswordReset(code: number, newPassword: string): Promise<void>;
}

/**
 * Simple status flags of an app.
 */
export interface AppStatus {

  /**
   * When `true`, the app was asleep.
   */
  asleep?: boolean;

  /**
   * When `true`, the app was closed.
   */
  closed?: boolean;
}

/**
 * @hidden
 */
export interface PushPluginRegistration {
  registrationId: string;
}

/**
 * Additional data from the Push Plugin.
 */
export interface PushPluginNotificationAdditionalData {

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
export interface PushPluginNotification {

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
  additionalData: PushPluginNotificationAdditionalData;
}

/**
 * Represents a [`PushMessage`](/api/client/pushmessage/).
 */
export interface IPushMessage {

  /**
   * Native information about the app when the push message was received.
   */
  app: AppStatus;

  /**
   * The message of this push message.
   */
  text: string;

  /**
   * The title of this push message.
   */
  title: string;

  /**
   * The badge count that was set by this push message.
   */
  count: number;

  /**
   * The sound that was played by this push message.
   */
  sound: string;

  /**
   * The image of this push message.
   */
  image: string;

  /**
   * The custom payload of this push message.
   */
  payload: Object;

  raw: PushPluginNotification;
}

/**
 * The object received when your app is sent a push notification. To learn how
 * to handle push notifications, [go to the Push
 * docs](/services/push/#handling-notifications).
 *
 * Internally, this is the object for the `push:notification` event from the
 * [`EventEmitter`](/api/client/eventemitter/).
 *
 * @featured
 */
export interface PushNotificationEvent {

  /**
   * The push message.
   */
  message: IPushMessage;

  /**
   * The raw push notification from the Push Plugin.
   */
  raw: PushPluginNotification;
}

/**
 * Options for [`saveToken()`](/api/client/push/#saveToken).
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
export interface PushDependencies {
  config: IConfig;
  auth: IAuth;
  userService: ISingleUserService;
  device: IDevice;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<PushToken>;
  logger: ILogger;
}

export interface PushPluginConfigAndroid {
  senderID?: string;
  icon?: string;
  iconColor?: string;
  sound?: boolean;
  vibrate?: boolean;
  clearBadge?: boolean;
  clearNotifications?: boolean;
  forceShow?: boolean;
  topics?: string[];
}

export interface PushPluginConfigiOS {
  alert?: boolean | string;
  badge?: boolean | string;
  sound?: boolean | string;
  clearBadge?: boolean | string;
  categories?: any;
}

/**
 * The configuration options for the Push Plugin.
 *
 * Full documentation and examples can be found on the Push Plugin's
 * [README](https://github.com/phonegap/phonegap-plugin-push/blob/master/docs/API.md#pushnotificationinitoptions).
 */
export interface PushPluginConfig {
  android?: PushPluginConfigAndroid;
  ios?: PushPluginConfigiOS;
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
  presentationstyle?: 'pagesheet' | 'formsheet' | 'fullscreen';
  transitionstyle?: 'fliphorizontal' | 'crossdissolve' | 'coververtical';
  toolbarposition?: 'top' | 'bottom';
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
 * A push token which is constructed from a APNS/GCM device token.
 *
 * @featured
 */
export interface PushToken {

  /**
   * The token ID on the API.
   */
  id?: string;

  /**
   * The token type (or platform), e.g. 'android' or 'ios'
   */
  type?: 'android' | 'ios';

  /**
   * Has the push token been registered with APNS/GCM?
   */
  registered: boolean;

  /**
   * Has the push token been saved to the API?
   */
  saved: boolean;

  /**
   * The raw push device token.
   */
  token: string;
}

/**
 * Represents [`Push`](/api/client/push/).
 */
export interface IPush {
  options: PushOptions;

  /**
   * The push plugin (window.PushNotification).
   */
  plugin: any;

  /**
   * The push token of the device.
   */
  token?: PushToken;

  /**
   * Register a token with the API.
   *
   * When a token is saved, you can send push notifications to it. If a user is
   * logged in, the token is linked to them by their ID.
   *
   * @param token - The token.
   * @param options
   */
  saveToken(token: PushToken, options?: PushSaveTokenOptions): Promise<PushToken>;

  /**
   * Registers the device with GCM/APNS to get a push token.
   */
  register(): Promise<PushToken>;

  /**
   * Invalidate the current push token.
   */
  unregister(): Promise<void>;
}

/**
 * Options for [`download()`](/api/client/deploy/#download).
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
 * Options for [`extract()`](/api/client/deploy/#extract).
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
 *
 * @featured
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
 * Represents a [`Deploy`](/api/client/deploy/).
 */
export interface IDeploy {
  options: DeployOptions;

  /**
   * The active deploy channel. Set this to change the channel on which
   * `Deploy` operates.
   */
  channel: DeployChannel;

  /**
   * Check for updates on the active channel.
   *
   * The promise resolves with a boolean. When `true`, a new snapshot exists on
   * the channel.
   */
  check(): Promise<boolean>;

  /**
   * Download the available snapshot.
   *
   * @param options
   *  Options for this download, such as a progress callback.
   */
  download(options?: DeployDownloadOptions): Promise<void>;

  /**
   * Extract the downloaded snapshot.
   *
   * @param options
   *  Options for this extract, such as a progress callback.
   */
  extract(options?: DeployExtractOptions): Promise<void>;

  /**
   * Immediately reload the app with the latest deployed snapshot.
   */
  load();

  /**
   * Get information about the current snapshot.
   */
  info(): Promise<any>;

  /**
   * List the snapshots that have been installed on this device.
   *
   * The promise is resolved with an array of snapshot UUIDs.
   */
  getSnapshots(): Promise<any>;

  /**
   * Remove a snapshot from this device.
   *
   * @param uuid
   *  The snapshot UUID to remove from the device.
   */
  deleteSnapshot(uuid: string): Promise<any>;

  /**
   * Fetches the metadata for a given snapshot. If no UUID is given, it will
   * attempt to grab the metadata for the most recently known snapshot.
   *
   * @param uuid
   *  The snapshot from which to grab metadata.
   */
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
  appStatus: AppStatus;
  storage: IStorage<string>;
  config: IConfig;
  client: IClient;
  device: IDevice;
  logger: ILogger;
}

/**
 * @hidden
 */
export interface InsightsOptions {
  intervalSubmit?: number | boolean;
  intervalActiveCheck?: number | boolean;
  submitCount?: number;
}

/**
 * @hidden
 */
export interface IInsights {
  track(stat: string, value?: number): void;
}

/**
 * @hidden
 */
export interface SuperAgentResponse {
  body: APIResponse;
}

/**
 * @hidden
 */
export type APIResponse = APIResponseSuccess | APIResponseError;

/**
 * @hidden
 */
export interface APIResponseMeta {
  status: number;
  version: string;
  request_id: string;
}

/**
 * @hidden
 */
export type APIResponseData = Object | Object[];

/**
 * @hidden
 */
export interface APIResponseErrorDetails {
  error_type: string;
  parameter: string;
  errors: string[];
}

/**
 * @hidden
 */
export interface APIResponseError {
  error: APIResponseErrorError;
  meta: APIResponseMeta;
}

/**
 * @hidden
 */
export interface APIResponseErrorError {
  message: string;
  link: string;
  type: string;
  details?: APIResponseErrorDetails[];
}

/**
 * @hidden
 */
export interface APIResponseSuccess {
  data: APIResponseData;
  meta: APIResponseMeta;
}
