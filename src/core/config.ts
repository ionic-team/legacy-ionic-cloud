export class IonicPlatformConfig {

  private _settings: any;
  private _locations: any;
  private _devLocations: any;

  constructor() {
    this._settings = {};
    this._devLocations = {};
    this._locations = {
      'api': 'https://apps.ionic.io',
      'push': 'https://push.ionic.io',
      'analytics': 'https://analytics.ionic.io',
      'deploy': 'https://apps.ionic.io',
      'platform-api': 'https://api.ionic.io'
    };
  }

  get(name) {
    return this._settings[name];
  }

  getURL(name) {
    if (this._devLocations[name]) {
      return this._devLocations[name];
    } else if (this._locations[name]) {
      return this._locations[name];
    } else {
      return null;
    }
  }

  register(settings: any = {}) {
    this._settings = settings;
    this._devLocations = settings.dev_locations || {};
  }
}

export var Config = new IonicPlatformConfig();
