/**
 * @hidden
 */
export class DeferredPromise<T, E extends Error> {
  public resolve: (value?: T) => void;
  public reject: (err?: E) => void;

  public promise: Promise<T>;

  constructor() {
    this.init();
  }

  public init() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  public static immediatelyReject<T, E extends Error>(err?: E): Promise<T> {
    return new Promise((resolve, reject) => {
      reject(err);
    });
  }
}
