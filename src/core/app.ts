export class App {

  public gcmKey: string;

  constructor(public id: string) {
    this.id = id;
  }

  toString() {
    return '<App [\'' + this.id + '\'>';
  }
}
