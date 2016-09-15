var Container = require('../dist/es5/di.js').Container;

describe('di', function() {
  var container;

  beforeEach(function() {
    container = new Container();
  });

  it("should get a cached value", function() {
    var c1 = container.config;
    var c2 = container.config;
    expect(c1).toBe(c2);
  });

  it("should get appStatus", function() {
    expect(container.appStatus).toEqual({ 'asleep': false, 'closed': false });
  });

  it("should get config", function() {
    var config = container.config;
    expect(config.settings).toBeUndefined();
  });

  it("should get logger", function() {
    var logger = container.logger;
    expect(logger.options).toEqual({});
  });

  it("should get push", function() {
    var push = container.push;
    expect(push.options).toEqual({ 'pluginConfig': {} });
  });
});
