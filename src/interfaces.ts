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

export interface IStorageStrategy {
  get(key: string): string;
  remove(key: string): void;
  set(key: string, value: string): void;
}

export interface ITokenContext {
  storage: IStorageStrategy;
  label: string;

  delete(): void;
  store(token: string): void;
  getRawData(): string;
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
