"use strict";
var EventEmitter = (function () {
    function EventEmitter() {
        this.eventHandlers = {};
    }
    EventEmitter.prototype.on = function (event, callback) {
        if (typeof this.eventHandlers[event] === 'undefined') {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(callback);
    };
    EventEmitter.prototype.emit = function (event, data) {
        if (data === void 0) { data = null; }
        if (typeof this.eventHandlers[event] === 'undefined') {
            this.eventHandlers[event] = [];
        }
        for (var _i = 0, _a = this.eventHandlers[event]; _i < _a.length; _i++) {
            var callback = _a[_i];
            callback(data);
        }
    };
    return EventEmitter;
}());
exports.EventEmitter = EventEmitter;
