import { IPushMessage, IAppStatus, IPluginNotification } from '../definitions';

/**
 * Represents a push notification sent to the device.
 */
export class PushMessage implements IPushMessage {

  public app: IAppStatus;
  public text: string;
  public title: string;
  public count: number;
  public sound: string;
  public image: string;
  public raw: IPluginNotification;
  public payload: Object;

  /**
   * Create a PushMessage from the push plugin's format.
   *
   * @param data - The plugin's notification object.
   */
  static fromPluginData(data: IPluginNotification): PushMessage {
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

  toString(): string {
    return `<PushMessage ["${this.title}"]>`;
  }
}
