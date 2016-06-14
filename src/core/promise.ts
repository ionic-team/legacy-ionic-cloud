export class DeferredPromise<U> {
  public resolve: (value: any) => any;
  public reject: (value: any) => any;

  public promise: Promise<U>;

  constructor() {
    this.promise = new Promise<U>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
