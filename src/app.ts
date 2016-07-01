import { IApp } from './definitions';

export class App implements IApp {

  public gcmKey: string;

  constructor(public id: string) {
    this.id = id;
  }

  toString() {
    return `<App [${this.id}]>`;
  }
}
