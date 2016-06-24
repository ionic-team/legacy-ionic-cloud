import { ISettingsUrls, ISettings, IConfig } from './definitions';

export class Config implements IConfig {

  private settings: ISettings;
  private urls: ISettingsUrls = {
    'api': 'https://api.ionic.io'
  };

  register(settings: ISettings) {
    this.settings = settings;
  }

  get(name: string): any {
    if (!this.settings) {
      return undefined;
    }

    return this.settings[name];
  }

  getURL(name: string): string {
    let urls = this.settings && this.settings['urls'] || {};

    if (urls[name]) {
      return urls[name];
    }

    return this.urls[name];
  }

}
