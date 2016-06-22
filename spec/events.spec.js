var EventEmitter = require("../dist/es5/events").EventEmitter;

describe("event emitter", function() {

  it("should emit", function() {
    var emitter = new EventEmitter();
    emitter.emit('cool-event');
    emitter.emit('cool-event-with-data', {});
  });

  it("should work", function() {
    var spy = jasmine.createSpy('spy');
    var emitter = new EventEmitter();

    emitter.on('cool-event', spy);
    emitter.emit('cool-event');
    emitter.emit('cool-event', {});
    emitter.emit('cool-event', { 'foo': 'bar' });
    expect(spy.calls.allArgs()).toEqual([[null], [{}], [{ 'foo': 'bar' }]]);
  });

  it("should work with multiple events", function() {
    var spy1 = jasmine.createSpy('spy1');
    var spy2 = jasmine.createSpy('spy2');
    var emitter = new EventEmitter();

    emitter.on('event-1', spy1);
    emitter.on('event-2', spy2);
    emitter.emit('event-1', { 'data': true });
    emitter.emit('event-2', { 'data': false });
    expect(spy1.calls.allArgs()).toEqual([[{ 'data': true }]]);
    expect(spy2.calls.allArgs()).toEqual([[{ 'data': false }]]);
  });

  it("should count events", function() {
    var emitter = new EventEmitter();

    emitter.emit('event-1');
    emitter.emit('event-1');
    emitter.emit('event-1');
    emitter.emit('event-2');
    expect(emitter.emitted('event-1')).toBe(3);
    expect(emitter.emitted('event-2')).toBe(1);
  });

});
