import { IPushToken } from '../definitions';

export class PushToken implements IPushToken {

  constructor(public token: string) {
    this.token = token;
  }

  toString() {
    return `<PushToken [${this.token}]>`;
  }

}
