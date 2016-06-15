var App = require("../../dist/es5/core/app").App;

describe("app", function() {

  it("should instantiate", function() {
    var app = new App("1234abc");
    expect(app.id).toBe("1234abc");
  });

  it("should accept gcmKey", function() {
    var app = new App("1234abc");
    app.gcmKey = "something";
    expect(app.gcmKey).toBe("something");
  });

  it("should accept devPush", function() {
    var app = new App("1234abc");
    app.devPush = true;
    expect(app.devPush).toBe(true);
  });

});
