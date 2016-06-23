var Config = require('../dist/es5/config').Config;
var Core = require('../dist/es5/core').Core;
var Logger = require('../dist/es5/logger').Logger;
var Device = require('../dist/es5/device').Device;
var Cordova = require('../dist/es5/cordova').Cordova;
var EventEmitter = require('../dist/es5/events').EventEmitter;
var Storage = require('../dist/es5/storage').Storage;
var LocalStorageStrategy = require('../dist/es5/storage').LocalStorageStrategy;

describe("core", function() {

  it("should instantiate", function() {
    var config = new Config();
    var logger = new Logger();
    var emitter = new EventEmitter();
    var device = new Device(emitter);
    var cordova = new Cordova({}, device, emitter, logger);
    var storage = new Storage({}, new LocalStorageStrategy());
    var c = new Core(config, logger, emitter, device, cordova, storage);
    expect(c.version).toBe('VERSION_STRING');
  });

});
