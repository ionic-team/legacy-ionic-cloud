import {
  AppStatus,
  IPushMessage,
  PushPluginNotification
} from '../definitions';

/**
 * Represents a push notification sent to the device.
 */
export class PushMessage implements IPushMessage {

  /**
   * Native information about the app when the push message was received.
   */
  public app: AppStatus;

  /**
   * The message of this push message.
   */
  public text: string;

  /**
   * The title of this push message.
   */
  public title: string;

  /**
   * The badge count to set.
   */
  public count: number;

  /**
   * The sound to play.
   */
  public sound: string;

  /**
   * The notification image.
   */
  public image: string;

  /**
   * The raw notification object from the push plugin callback.
   */
  public raw: PushPluginNotification;

  /**
   * The custom payload of this push message.
   */
  public payload: Object;

  /**
   * Create a PushMessage from the push plugin's format.
   *
   * @param data - The plugin's notification object.
   */
  public static fromPluginData(data: PushPluginNotification): PushMessage {
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

  public toString(): string {
    return `<PushMessage ["${this.title}"]>`;
  }
}
