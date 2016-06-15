export class App {

  public devPush: boolean;
  public gcmKey: string;

  constructor(public id: string) {
    this.id = id;
  }

  toString() {
    return '<App [\'' + this.id + '\'>';
  }
}
