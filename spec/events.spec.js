var EventEmitter = require("../dist/es5/events").EventEmitter;

describe("event emitter", function() {

  var emitter;

  beforeEach(function() {
    emitter = new EventEmitter();
  });

  it("should emit", function() {
    emitter.emit('cool-event');
    emitter.emit('cool-event-with-data', {});
  });

  it("should work", function() {
    var spy = jasmine.createSpy('spy');

    emitter.on('cool-event', spy);
    emitter.emit('cool-event');
    emitter.emit('cool-event', {});
    emitter.emit('cool-event', { 'foo': 'bar' });
    expect(spy.calls.allArgs()).toEqual([[undefined], [{}], [{ 'foo': 'bar' }]]);
  });

  it("should work with multiple events", function() {
    var spy1 = jasmine.createSpy('spy1');
    var spy2 = jasmine.createSpy('spy2');

    emitter.on('event-1', spy1);
    emitter.on('event-2', spy2);
    emitter.emit('event-1', { 'data': true });
    emitter.emit('event-2', { 'data': false });
    expect(spy1.calls.allArgs()).toEqual([[{ 'data': true }]]);
    expect(spy2.calls.allArgs()).toEqual([[{ 'data': false }]]);
  });

  it("should count events", function() {
    emitter.emit('event-1');
    emitter.emit('event-1');
    emitter.emit('event-1');
    emitter.emit('event-2');
    expect(emitter.emitted('event-1')).toBe(3);
    expect(emitter.emitted('event-2')).toBe(1);
  });

  it("should unregister events", function() {
    var spy = jasmine.createSpy('spy');
    var r = emitter.on('my-event', spy);
    emitter.off(r);
    emitter.emit('my-event');
    expect(spy).not.toHaveBeenCalled();
  });

  it("should throw error when unregistering unknown receivers", function() {
    var otherEmitter = new EventEmitter();
    var r = otherEmitter.on('my-event', function() {});
    expect(emitter.off.bind(emitter, r)).toThrowError("unknown event receiver");
  });

});
