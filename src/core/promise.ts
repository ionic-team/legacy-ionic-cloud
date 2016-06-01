import { Promise } from 'es6-promise';

export interface ThenableWithNotify<T> {
  then<U>(onFulfilled?: (value: T) => U | ThenableWithNotify<U>, onRejected?: (error: any) => U | ThenableWithNotify<U>, onNotified?: (value: number) => U | ThenableWithNotify<U>): ThenableWithNotify<U>;
  catch<U>(onRejected?: (error: any) => U | ThenableWithNotify<U>): ThenableWithNotify<U>;
}

export class PromiseWithNotify<T> extends Promise<T> implements ThenableWithNotify<T> {
  private onNotify: (value: number) => any;

  then<U>(onFulfilled?: (value: T) => U, onRejected?: (error: any) => U, onNotified?: (value: number) => U): ThenableWithNotify<U> {
    this.onNotify = onNotified;
    return super.then(onFulfilled, onRejected);
  }
}

export class DeferredPromise<U> {
  public resolve: (value: any) => any;
  public reject: (value: any) => any;
  private _notify: (value: any) => any;

  public promise: PromiseWithNotify<U>;

  private notifyValues: any[] = [];

  constructor() {
    this.promise = new PromiseWithNotify<U>((resolve, reject) => {
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
