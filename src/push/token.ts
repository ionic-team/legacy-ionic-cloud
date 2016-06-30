import { IPushToken } from '../definitions';

export class PushToken implements IPushToken {

  public registered: boolean = false;
  public saved: boolean = false;

  constructor(public token: string) {
    this.token = token;
  }

  toString() {
    return `<PushToken [${this.token}]>`;
  }

}
