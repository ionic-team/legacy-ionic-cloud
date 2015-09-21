class BaseSettings {

  constructor() {
    this._settings = null;
    return this;
  }

  factory(name, func) {
    this._settings = func();
    return this;
  }

  get(name) {
    return this._settings.get(name);
  }

  finish() {
    return this;
  }
}

var temp = new BaseSettings()

// Auto-generated configuration factory
.factory('$ionicCoreSettings', function() {
  var settings = {};
  return {
    "get": function(setting) {
      if (settings[setting]) {
        return settings[setting];
      }
      return null;
    }
  };
})
// Auto-generated configuration factory

.finish();

export class Settings {

  constructor() {
    this._locations = {
      'api': 'https://apps.ionic.io',
      'push': 'https://push.ionic.io',
      'analytics': 'https://analytics.ionic.io'
    };
    this._devLocations = this.get('dev_locations');
    if (!this._devLocations) { this._devLocations = {}; }
  }

  get(name) {
    return temp.get(name);
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
}
