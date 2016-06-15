export interface ISettingsUrls {
  api?: string;
}

export interface ISettings {
  app_id: string;
  gcm_key?: string;
  dev_push?: boolean;
  urls?: any;
  [key: string]: any;
}

export class Config {

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

export let config = new Config();
