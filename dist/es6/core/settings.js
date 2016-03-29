export class BaseSettings {
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
        }
        else if (this._locations[name]) {
            return this._locations[name];
        }
        else {
            return null;
        }
    }
    register(settings = {}) {
        this._settings = settings;
        this._devLocations = settings.dev_locations || {};
    }
}
let settingsSingleton = new BaseSettings();
export class Settings extends BaseSettings {
    constructor() {
        super();
        return settingsSingleton;
    }
}
