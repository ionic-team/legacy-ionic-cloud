var Config = require('../dist/es5/config').Config;
var Core = require('../dist/es5/core').Core;
var Logger = require('../dist/es5/logger').Logger;
var EventEmitter = require('../dist/es5/events').EventEmitter;

describe("core", function() {
  var configSpy;
  var loggerSpy;
  var emitterSpy;
  var insightsSpy;

  beforeEach(function() {
    configSpy = new Config();
    loggerSpy = new Logger();
    emitterSpy = new EventEmitter();
    insightsSpy = jasmine.createSpyObj('insights', ['track']);

    configSpy.register({ 'core': { 'app_id': 'abcd' } });
  });

  it("should instantiate", function() {
    var c = new Core({
      "config": configSpy,
      "logger": loggerSpy,
      "emitter": emitterSpy,
      "insights": insightsSpy
    });

    expect(c.config).toBeDefined();
    expect(c.logger).toBeDefined();
    expect(c.emitter).toBeDefined();
    expect(c.insights).toBeDefined();
    expect(c.version).toBeDefined();
  });

});
