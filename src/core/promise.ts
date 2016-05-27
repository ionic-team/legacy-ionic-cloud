import { Promise } from 'es6-promise';

export class DeferredPromise {
  public resolve: (value: any) => any;
  public reject: (value: any) => any;
  private _notify: (value: any) => any;

  public promise: any;

  private notifyValues: any[] = [];

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });

    let originalThen = this.promise.then;

    this.promise.then = (ok, fail, notify) => {
      this._notify = notify;

      for (let v of this.notifyValues) {
        this._notify(v);
      }

      return originalThen.call(this.promise, ok, fail);
    };
  }

  notify(value: any) {
    if (typeof this._notify !== 'function') {
      this.notifyValues.push(value);
    } else {
      this._notify(value);
    }
  }
}
