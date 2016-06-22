var CombinedAuthTokenContext = require("../dist/es5/auth").CombinedAuthTokenContext;
var LocalStorageStrategy = require("../dist/es5/storage").LocalStorageStrategy;
var SessionStorageStrategy = require("../dist/es5/storage").SessionStorageStrategy;
var Client = require("../dist/es5/client").Client;

describe("client", function() {

  var tokenContext = new CombinedAuthTokenContext("test", new LocalStorageStrategy(), new SessionStorageStrategy());

  beforeEach(function() {
    tokenContext.delete();
  });

  it("should instantiate", function() {
    var spy = jasmine.createSpy('spy');
    var c = new Client(tokenContext, "url", spy);
    expect(c.baseUrl).toBe("url");
    expect(c.req).toBe(spy);
  });

  it("should supplement", function() {
    tokenContext.store("token");
    var c = new Client(tokenContext, "url");
    var req = c.get('/test');
    expect(req.get('Authorization')).toBe("Bearer token");
    expect(req.url).toBe("url/test");
  });

  it("should supplement but not add auth header", function() {
    var c = new Client(tokenContext, "url");
    var req = c.get('/test');
    expect(req.get('Authorization')).toBe(undefined);
    expect(req.url).toBe("url/test");
  });

  it("should supplement with request method", function() {
    tokenContext.store("token");
    var c = new Client(tokenContext, 'url');
    var req = c.request('get', '/test');
    expect(req.get('Authorization')).toBe('Bearer token');
    expect(req.url).toBe("url/test");
    expect(req.method).toBe("GET");
  });

  it("should throw error about not having a leading slash", function() {
    var c = new Client(tokenContext, "url");
    expect(c.get.bind(c, 'test')).toThrowError("endpoint must start with leading slash");
  });

});
