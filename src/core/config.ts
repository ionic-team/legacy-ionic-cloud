export interface ISettings {
  app_id: string;
  gcm_key?: string;
  api_key?: string;
  dev_push?: boolean;
  dev_locations?: any;
  [key: string]: any;
}

export class IonicPlatformConfig {

  private settings: ISettings;
  private locations: any;

  constructor() {
    this.locations = {
      'api': 'https://apps.ionic.io',
      'push': 'https://push.ionic.io',
      'analytics': 'https://analytics.ionic.io',
      'deploy': 'https://apps.ionic.io',
      'platform-api': 'https://api.ionic.io'
    };
  }

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
    let devLocations = this.settings && this.settings['dev_locations'] || {};

    if (devLocations[name]) {
      return devLocations[name];
    } else if (this.locations[name]) {
      return this.locations[name];
    }
  }

}

export let Config = new IonicPlatformConfig();
