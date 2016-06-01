"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var es6_promise_1 = require('es6-promise');
var PromiseWithNotify = (function (_super) {
    __extends(PromiseWithNotify, _super);
    function PromiseWithNotify() {
        _super.apply(this, arguments);
    }
    PromiseWithNotify.prototype.then = function (onFulfilled, onRejected, onNotified) {
        this.onNotify = onNotified;
        return _super.prototype.then.call(this, onFulfilled, onRejected);
    };
    return PromiseWithNotify;
}(es6_promise_1.Promise));
exports.PromiseWithNotify = PromiseWithNotify;
var DeferredPromise = (function () {
    function DeferredPromise() {
        var _this = this;
        this.notifyValues = [];
        this.promise = new PromiseWithNotify(function (resolve, reject) {
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
