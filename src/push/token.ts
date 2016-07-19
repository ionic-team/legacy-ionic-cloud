import { IPushToken } from '../definitions';

/**
 * Represents a push device token from APNS/GCM.
 */
export class PushToken implements IPushToken {

  public registered: boolean = false;
  public saved: boolean = false;

  /**
   * @param token - The raw push token.
   */
  constructor(public token: string) {
    this.token = token;
  }

  toString(): string {
    return `<PushToken [${this.token}]>`;
  }

}
