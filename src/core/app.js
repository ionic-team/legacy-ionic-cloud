import { Logger } from "./logger";

export class App {

  constructor(appId, apiKey) {
    this.logger = new Logger({
      'prefix': 'Ionic App:'
    });
    if (!appId || appId === '') {
      this.logger.info('No app_id was provided');
      return false;
    }

    if (!apiKey || apiKey === '') {
      this.logger.info('No api_key was provided');
      return false;
    }

    var privateData = {
      'id': appId,
      'apiKey': apiKey
    };

    this.privateVar = function(name) {
      return privateData[name] || null;
    };

    // other config value reference
    this.devPush = null;
    this.gcmKey = null;
  }

  get id() {
    return this.privateVar('id');
  }

  get apiKey() {
    return this.privateVar('apiKey');
  }

  toString() {
    return '<IonicApp [\'' + this.id + '\'>';
  }
}
