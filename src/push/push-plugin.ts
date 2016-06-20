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
