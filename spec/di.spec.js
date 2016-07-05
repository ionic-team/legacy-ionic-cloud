var Container = require('../dist/es5/di.js').Container;

describe('di', function() {
  var container;

  beforeEach(function() {
    container = new Container();
  });

  it("should get cached config", function() {
    var c1 = container.config;
    var c2 = container.config;
    expect(c1).toBe(c2);
  });
});
