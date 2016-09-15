/**
 * @hidden
 */
export class DeferredPromise<T, E extends Error> {
  public resolve: (value?: T) => Promise<T>;
  public reject: (err?: E) => Promise<T>;

  public promise: Promise<T>;

  constructor() {
    this.init();
  }

  public init() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = (v) => {
        resolve(v);
        return this.promise;
      };

      this.reject = (e) => {
        reject(e);
        return this.promise;
      };
    });
  }

  public static rejectImmediately<T, E extends Error>(err?: E): Promise<T> {
    return new Promise((resolve, reject) => {
      reject(err);
    });
  }
}
