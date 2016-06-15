var core = require('../../dist/es5/core/core');

describe("core", function() {

  it("should instantiate", function() {
    var c = new core.Core();
    expect(c.version).toBe('VERSION_STRING');
  });

});
