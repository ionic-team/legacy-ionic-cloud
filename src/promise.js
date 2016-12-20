"use strict";
/**
 * @hidden
 */
var DeferredPromise = (function () {
    function DeferredPromise() {
        this.init();
    }
    DeferredPromise.prototype.init = function () {
        var _this = this;
        this.promise = new Promise(function (resolve, reject) {
            _this.resolve = function (v) {
                resolve(v);
                return _this.promise;
            };
            _this.reject = function (e) {
                reject(e);
                return _this.promise;
            };
        });
    };
    DeferredPromise.rejectImmediately = function (err) {
        return new Promise(function (resolve, reject) {
            reject(err);
        });
    };
    return DeferredPromise;
}());
exports.DeferredPromise = DeferredPromise;
