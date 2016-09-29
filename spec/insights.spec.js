var insights = require('../dist/es5/insights');
var Config = require('../dist/es5/config').Config;

describe("stat", function() {

  it("should store attributes", function() {
    var baseTime = new Date();
    jasmine.clock().mockDate(baseTime);
    var stat = new insights.Stat('abcd', 'name', 5);
    expect(stat.appId).toBe('abcd');
    expect(stat.stat).toBe('name');
    expect(stat.value).toBe(5);
    expect(stat.created).toEqual(baseTime);
  });

  it("should default value to 1", function() {
    var stat = new insights.Stat('abcd', 'name');
    expect(stat.value).toBe(1);
  });

  it("should serialize", function() {
    var baseTime = new Date('2016-09-28T00:00:00.000Z');
    jasmine.clock().mockDate(baseTime);
    var stat = new insights.Stat('abcd', 'name');
    expect(stat.toJSON()).toEqual({
      'app_id': 'abcd',
      'stat': 'name',
      'value': 1,
      'created': '2016-09-28T00:00:00.000Z'
    });
  });

});

describe("insights", function() {

  var i;
  var appStatusSpy;
  var storageSpy;
  var configSpy;
  var clientSpy;
  var deviceSpy;
  var loggerSpy;

  function instantiateWithOptions(options) {
    return new insights.Insights({
      'appStatus': appStatusSpy,
      'storage': storageSpy,
      'config': configSpy,
      'client': clientSpy,
      'device': deviceSpy,
      'logger': loggerSpy
    }, options);
  }

  beforeEach(function() {
    jasmine.clock().install();
    jasmine.clock().mockDate();

    appStatusSpy = {};
    storageSpy = jasmine.createSpyObj('storageSpy', ['get', 'set']);
    configSpy = new Config();
    clientSpy = {};
    deviceSpy = {};
    loggerSpy = jasmine.createSpyObj('loggerSpy', ['info', 'warn', 'error']);

    appStatusSpy.closed = false;
    configSpy.register({ 'core': { 'app_id': 'abcd' } });
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });

  it("should instantiate", function() {
    i = instantiateWithOptions();
    expect(i.options.intervalSubmit).toBe(60 * 1000);
    expect(i.options.intervalActiveCheck).toBe(1000);
    expect(i.options.submitCount).toBe(100);
  });

  it("should call submit on submit interval", function() {
    i = instantiateWithOptions({ 'intervalActiveCheck': false });
    spyOn(i, "submit");
    expect(i.submit).not.toHaveBeenCalled();
    jasmine.clock().tick(i.options.intervalSubmit);
    expect(i.submit).toHaveBeenCalledTimes(1);
    jasmine.clock().tick(i.options.intervalSubmit);
    expect(i.submit).toHaveBeenCalledTimes(2);
  });

  it("should check activity on active check interval", function() {
    i = instantiateWithOptions({ 'intervalSubmit': false });
    spyOn(i, "checkActivity");
    expect(i.checkActivity).not.toHaveBeenCalled();
    jasmine.clock().tick(i.options.intervalActiveCheck);
    expect(i.checkActivity).toHaveBeenCalledTimes(1);
    jasmine.clock().tick(i.options.intervalActiveCheck);
    expect(i.checkActivity).toHaveBeenCalledTimes(2);
  });

  it("should mark active immediately", function() {
    i = instantiateWithOptions({ 'intervalSubmit': false });
    spyOn(i, "markActive");
    jasmine.clock().tick(i.options.intervalActiveCheck);
    expect(i.markActive).toHaveBeenCalled();
  });

  it("should mark active immediately and then again every hour", function() {
    i = instantiateWithOptions({ 'intervalSubmit': false });
    spyOn(i, "markActive");
    jasmine.clock().tick(i.options.intervalActiveCheck);
    expect(i.markActive).toHaveBeenCalledTimes(1);
    i.storage.get.and.returnValue(String(new Date()));
    jasmine.clock().tick(60 * 60 * 1000);
    expect(i.markActive).toHaveBeenCalledTimes(2);
    i.storage.get.and.returnValue(String(new Date()));
    jasmine.clock().tick(60 * 60 * 1000);
    expect(i.markActive).toHaveBeenCalledTimes(3);
  });

  it("should normalize device platforms", function() {
    i = instantiateWithOptions({ 'intervalSubmit': false, 'intervalActiveCheck': false });
    expect(i.normalizeDevicePlatform('Android')).toBe('android');
    expect(i.normalizeDevicePlatform('iOS')).toBe('ios');
    expect(i.normalizeDevicePlatform('Mac OS X')).toBe('mac_os_x');
  });

  it("should normalize versions", function() {
    i = instantiateWithOptions({ 'intervalSubmit': false, 'intervalActiveCheck': false });
    expect(i.normalizeVersion('2.2')).toBe('2');
    expect(i.normalizeVersion('2.1-update1')).toBe('2');
    expect(i.normalizeVersion('6.0.0.600')).toBe('6');
    expect(i.normalizeVersion('TIZEN_20120425_2')).toBe('unknown');
  });

  it("should track active stats", function() {
    i = instantiateWithOptions({ 'intervalSubmit': false, 'intervalActiveCheck': false });
    i.device.native = { 'device': { 'platform': 'Android', 'version': '2.2', 'cordova': '6.2.1' } };
    expect(i.batch).toEqual([]);
    i.markActive();

    var collectedStats = i.batch.map(function(stat) {
      return stat.stat;
    });

    expect(collectedStats.length).toBe(4);
    expect(collectedStats).toEqual(jasmine.arrayContaining([
      'mobileapp.active',
      'mobileapp.active.platform.android',
      'mobileapp.active.platform.android.2',
      'mobileapp.active.cordova.6'
    ]));
  });

});
