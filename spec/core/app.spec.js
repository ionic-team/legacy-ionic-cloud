var App = require("../../core/app").App;

describe("app", function() {

  it("should instantiate", function() {
    var app = new App("1234abc", "stupid_api_key");
    expect(app.id).toBe("1234abc");
    expect(app.apiKey).toBe("stupid_api_key");
  });

  it("should accept gcmKey", function() {
    var app = new App("1234abc", "stupid_api_key");
    app.gcmKey = "something";
    expect(app.gcmKey).toBe("something");
  });

  it("should accept devPush", function() {
    var app = new App("1234abc", "stupid_api_key");
    app.devPush = true;
    expect(app.devPush).toBe(true);
  });

});
