import { ISettingsUrls, ISettings, IConfig } from './definitions';

export class Config implements IConfig {

  public settings: ISettings;
  private urls: ISettingsUrls = {
    'api': 'https://api.ionic.io'
  };

  register(settings: ISettings) {
    this.settings = settings;
  }

  get(name: string): any {
    if (!this.settings || !this.settings.core) {
      return undefined;
    }

    return this.settings.core[name];
  }

  getURL(name: string): string {
    let urls = (this.settings && this.settings.core && this.settings.core.urls) || {};

    if (urls[name]) {
      return urls[name];
    }

    return this.urls[name];
  }

}
