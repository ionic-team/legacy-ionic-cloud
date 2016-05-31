"use strict";
var es6_promise_1 = require('es6-promise');
var DeferredPromise = (function () {
    function DeferredPromise() {
        var _this = this;
        this.notifyValues = [];
        this.promise = new es6_promise_1.Promise(function (resolve, reject) {
            _this.resolve = resolve;
            _this.reject = reject;
        });
        var originalThen = this.promise.then;
        this.promise.then = function (ok, fail, notify) {
            _this._notify = notify;
            for (var _i = 0, _a = _this.notifyValues; _i < _a.length; _i++) {
                var v = _a[_i];
                _this._notify(v);
            }
            return originalThen.call(_this.promise, ok, fail);
        };
    }
    DeferredPromise.prototype.notify = function (value) {
        if (typeof this._notify !== 'function') {
            this.notifyValues.push(value);
        }
        else {
            this._notify(value);
        }
    };
    return DeferredPromise;
}());
exports.DeferredPromise = DeferredPromise;
