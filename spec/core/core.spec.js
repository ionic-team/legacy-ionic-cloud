var core = require('../../dist/es5/core/core');

describe("ionic platform core", function() {

  it("should instantiate", function() {
    var c = new core.IonicPlatformCore();
    expect(c.cordovaPlatformUnknown).toBe(true);
  });

});
