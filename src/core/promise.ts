import { Promise as ES6Promise } from "es6-promise";

export class DeferredPromise {
  then: any;
  resolve: any;
  reject: any;
  promise: any;

  private _update: any;

  constructor() {
    var self = this;
    this._update = false;
    this.promise = new ES6Promise(function(resolve, reject) {
      self.resolve = resolve;
      self.reject = reject;
    });
    var originalThen = this.promise.then;
    this.promise.then = function(ok, fail, update) {
      self._update = update;
      return originalThen.call(self.promise, ok, fail);
    };
  }

  notify(value) {
    if (this._update && (typeof this._update === 'function')) {
      this._update(value);
    }
  }
}
