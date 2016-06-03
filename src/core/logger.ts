export class Logger {

  public silent: boolean = false;
  public outfn = console.log.bind(console);
  public errfn = console.error.bind(console);

  constructor(public prefix: string) {
    this.prefix = prefix;
  }

  info(data) {
    if (!this.silent) {
      this.outfn(this.prefix, data);
    }
  }

  warn(data) {
    if (!this.silent) {
      this.outfn(this.prefix, data);
    }
  }

  error(data) {
    this.errfn(this.prefix, data);
  }
}
