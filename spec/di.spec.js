var di = require('../dist/es5/di.js').di;

describe('di', function() {
  it("should get cached config", function() {
    var c1 = di.config;
    var c2 = di.config;
    expect(c1).toBe(c2);
  });
});
