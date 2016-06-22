var Config = require('../dist/es5/config').Config;

describe("config", function() {

  it("should instantiate", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc'
    });
  });

  it("should get default locations", function() {
    var c = new Config();
    expect(c.getURL('api')).toBe('https://api.ionic.io');
  });

  it("should get custom locations", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc',
      'urls': {
        'api': 'api'
      }
    });
    expect(c.getURL('api')).toBe('api');
  });

  it("should get configs", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc',
      'gcm_key': 'gcm_key_123'
    });
    expect(c.get('app_id')).toBe('1234abc');
    expect(c.get('gcm_key')).toBe('gcm_key_123');
  });

  it("should return undefined for configs that aren't there", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc'
    });
    expect(c.get('garbage')).toBeUndefined();
  });

});
