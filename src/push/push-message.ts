import { IPluginNotification } from './push-plugin';

export interface IAppStatus {
  asleep?: boolean;
  closed?: boolean;
}

export class PushMessage {

  app: IAppStatus;
  text: string;
  title: string;
  count: number;
  sound: string;
  image: string;
  raw: IPluginNotification;
  payload: Object;

  static fromPluginData(data: IPluginNotification) {
    let message = new PushMessage();

    message.raw = data;
    message.text = data.message;
    message.title = data.title;
    message.count = data.count;
    message.sound = data.sound;
    message.image = data.image;
    message.app = {
      'asleep': !data.additionalData.foreground,
      'closed': data.additionalData.coldstart
    };
    message.payload = data.additionalData['payload'];

    return message;
  }

  toString() {
    return '<PushMessage [\'' + this.title + '\']>';
  }
}
