var DeferredPromise = require("../dist/es5/promise").DeferredPromise;

describe("promise", function() {

  it("should instantiate", function() {
    var deferred = new DeferredPromise();
    expect(deferred.resolve).toBeDefined();
    expect(deferred.reject).toBeDefined();
    expect(deferred.promise).toBeDefined();
  });

  it("should resolve", function() {
    var spy = jasmine.createSpy('spy');

    function doIt() {
      var deferred = new DeferredPromise();
      deferred.resolve('msg');
      return deferred.promise;
    }

    doIt().then(function(result) {
      expect(result).toBe('msg');
    }, spy);

    expect(spy).not.toHaveBeenCalled();
  });

  it("should reject", function() {
    var spy = jasmine.createSpy('spy');

    function doIt() {
      var deferred = new DeferredPromise();
      deferred.reject('msg');
      return deferred.promise;
    }

    doIt().then(spy, function(err) {
      expect(err).toBe('msg');
    });

    expect(spy).not.toHaveBeenCalled();
  });

});
