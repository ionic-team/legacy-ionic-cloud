var DeferredPromise = require("../../core/promise").DeferredPromise;

describe("client", function() {

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

  it("should notify without delay", function(done) {
    var resolveSpy = jasmine.createSpy('resolveSpy');
    var notifySpy = jasmine.createSpy('notifySpy');

    function doIt() {
      var deferred = new DeferredPromise();
      deferred.notify(0);
      deferred.notify(0.5);
      deferred.notify(1);
      deferred.resolve('msg');
      return deferred.promise;
    }

    doIt().then(resolveSpy, undefined, notifySpy).then(function() {
      expect(resolveSpy).toHaveBeenCalled();
      expect(notifySpy.calls.allArgs()).toEqual([[0], [0.5], [1]]);
      done();
    }).catch(function() {
      expect(true).toBe(false);
      done();
    });
  });

  it("should notify", function(done) {
    var resolveSpy = jasmine.createSpy('resolveSpy');
    var notifySpy = jasmine.createSpy('notifySpy');

    function doIt() {
      var deferred = new DeferredPromise();
      setTimeout(function() {
        deferred.notify(0);
        deferred.notify(0.5);
        deferred.notify(1);
        deferred.resolve('msg');
      }, 10);
      return deferred.promise;
    }

    doIt().then(resolveSpy, undefined, notifySpy).then(function() {
      expect(resolveSpy).toHaveBeenCalled();
      expect(notifySpy.calls.allArgs()).toEqual([[0], [0.5], [1]]);
      done();
    }).catch(function() {
      expect(true).toBe(false);
      done();
    });
  });

});
