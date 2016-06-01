export class PushToken {

  constructor(public token: string) {
    this.token = token;
  }

  toString() {
    return `<PushToken [${this.token}]>`;
  }

}
