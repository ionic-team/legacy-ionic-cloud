import { Logger } from './logger';

export class App {

  public devPush: boolean;
  public gcmKey: string;

  private logger: Logger;
  private _id: string;

  constructor(appId: string) {
    this.logger = new Logger({
      'prefix': 'Ionic App:'
    });
    if (!appId || appId === '') {
      this.logger.info('No app_id was provided');
      return;
    }

    this._id = appId;

    // other config value reference
    this.devPush = null;
    this.gcmKey = null;
  }

  get id() {
    return this._id;
  }

  toString() {
    return '<IonicApp [\'' + this.id + '\'>';
  }
}
