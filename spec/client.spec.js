var Client = require("../../dist/es5/client").Client;

describe("client", function() {

  it("should instantiate", function() {
    var spy = jasmine.createSpy('spy');
    var c = new Client("url", "token", spy);
    expect(c.baseUrl).toBe("url");
    expect(c.token).toBe("token");
    expect(c.req).toBe(spy);
  });

  it("should supplement", function() {
    var c = new Client("url", "token");
    var req = c.get('/test');
    expect(req.get('Authorization')).toBe("Bearer token");
    expect(req.url).toBe("url/test");
  });

  it("should supplement but not add auth header", function() {
    var c = new Client("url");
    var req = c.get('/test');
    expect(req.get('Authorization')).toBe(undefined);
    expect(req.url).toBe("url/test");
  });

  it("should supplement with request method", function() {
    var c = new Client('url', 'token');
    var req = c.request('get', '/test');
    expect(req.get('Authorization')).toBe('Bearer token');
    expect(req.url).toBe("url/test");
    expect(req.method).toBe("GET");
  });

  it("should throw error about not having a leading slash", function() {
    var c = new Client("url", "token");
    expect(c.get.bind(c, 'test')).toThrowError("endpoint must start with leading slash");
  });

});
