var Config = require('../../dist/es5/core/config').Config;

describe("ionic platform config", function() {

  it("should instantiate", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc'
    });
  });

  it("should get default locations", function() {
    var c = new Config();
    expect(c.getURL('api')).toBe('https://apps.ionic.io');
    expect(c.getURL('push')).toBe('https://push.ionic.io');
    expect(c.getURL('deploy')).toBe('https://apps.ionic.io');
    expect(c.getURL('platform-api')).toBe('https://api.ionic.io');
  });

  it("should get custom locations", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc',
      'dev_locations': {
        'api': 'api',
        'push': 'push',
        'deploy': 'deploy',
        'platform-api': 'platform-api'
      }
    });
    expect(c.getURL('api')).toBe('api');
    expect(c.getURL('push')).toBe('push');
    expect(c.getURL('deploy')).toBe('deploy');
    expect(c.getURL('platform-api')).toBe('platform-api');
  });

  it("should get configs", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc',
      'gcm_key': 'gcm_key_123',
      'api_key': 'api_key_123'
    });
    expect(c.get('app_id')).toBe('1234abc');
    expect(c.get('gcm_key')).toBe('gcm_key_123');
    expect(c.get('api_key')).toBe('api_key_123');
  });

  it("should return undefined for configs that aren't there", function() {
    var c = new Config();
    c.register({
      'app_id': '1234abc'
    });
    expect(c.get('garbage')).toBeUndefined();
  });

});
