var storage = require('../dist/es5/storage');

describe("storage with localStorage", function() {

  var strategies = [new storage.LocalStorageStrategy(), new storage.SessionStorageStrategy()];

  for (var i in strategies) {
    var s;
    var strategy = strategies[i];
    var cacheOptions = [undefined, true, false];

    for (i in cacheOptions) {
      var options = { 'cache': cacheOptions[i] };

      beforeEach(function() {
        s = new storage.Storage(options, strategy);
      });

      it("should store and retrieve", function() {
        s.set("a", null);
        s.set("b", "foo");
        s.set("c", 5);
        s.set("d", true);
        s.set("e", false);
        s.set("f", [1, 2, 3, 5, 7]);
        expect(s.get("a")).toBe(null);
        expect(s.get("b")).toBe("foo");
        expect(s.get("c")).toBe(5);
        expect(s.get("d")).toBe(true);
        expect(s.get("e")).toBe(false);
        expect(s.get("f")).toEqual([1, 2, 3, 5, 7]);
      });

      it("should store and delete", function() {
        s.set("a", 1);
        s.delete("a");
        expect(s.get("a")).toBe(null);
      });

      it("should store and retrieve objects", function() {
        s.set("a", {});
        s.set("b", { "foo": "bar" });
        s.set("c", { "nums": [1, 2, 3] });
        expect(s.get("a")).toEqual({});
        expect(s.get("b")).toEqual({ "foo": "bar" });
        expect(s.get("c")).toEqual({ "nums": [1, 2, 3] });
      });
    }
  }

});
