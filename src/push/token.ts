import { IPushToken } from '../definitions';

/**
 * Represents a push device token from APNS/GCM.
 */
export class PushToken implements IPushToken {

  /**
   * Has the push token been registered in the API?
   */
  public registered: boolean = false;

  /**
   * Has the push token been saved locally?
   */
  public saved: boolean = false;

  /**
   * @param token - The raw push token.
   */
  constructor(public token: string) {
    this.token = token;
  }

  public toString(): string {
    return `<PushToken [${this.token}]>`;
  }

}
