var core = require('../../core/core');

describe("ionic platform core", function() {

  it("should instantiate", function() {
    var c = new core.Core();
    expect(c.version).toBe('VERSION_STRING');
  });

});
