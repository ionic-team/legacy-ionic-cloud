var Config = require('../dist/es5/config').Config;
var Core = require('../dist/es5/core').Core;
var Logger = require('../dist/es5/logger').Logger;
var EventEmitter = require('../dist/es5/events').EventEmitter;

describe("core", function() {

  it("should instantiate", function() {
    var config = new Config();
    var logger = new Logger();
    var emitter = new EventEmitter();
    var insightsSpy = jasmine.createSpyObj('insights', ['track']);

    var c = new Core({
      "config": config,
      "logger": logger,
      "emitter": emitter,
      "insights": insightsSpy
    });

    expect(c.config).toBeDefined();
    expect(c.logger).toBeDefined();
    expect(c.emitter).toBeDefined();
    expect(c.insights).toBeDefined();
    expect(c.version).toBeDefined();
  });

});
