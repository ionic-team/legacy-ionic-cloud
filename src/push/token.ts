import { IPushToken } from '../definitions';

/**
 * Represents a push token, which is constructed from a device token from
 * APNS/GCM.
 */
export class PushToken implements IPushToken {

  /**
   * The token ID on the API.
   */
  public id: string;

  /**
   * The token type (or platform), e.g. 'android' or 'ios'
   */
  public type: 'android' | 'ios';

  /**
   * Has the push token been registered with APNS/GCM?
   */
  public registered: boolean = false;

  /**
   * Has the push token been saved to the API?
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
