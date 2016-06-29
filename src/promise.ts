export class DeferredPromise<T, E extends Error> {
  public resolve: (value?: T) => void;
  public reject: (err?: E) => void;

  public promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
