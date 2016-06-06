export interface ILogger {
  silent: boolean;
  outfn: (message?: any, ...optionalParams: any[]) => void;
  errfn: (message?: any, ...optionalParams: any[]) => void;
  info(message?: any, ...optionalParams: any[]);
  warn(message?: any, ...optionalParams: any[]);
  error(message?: any, ...optionalParams: any[]);
}

export class Logger implements ILogger {

  public silent: boolean = false;
  public outfn = console.log.bind(console);
  public errfn = console.error.bind(console);

  info(message?: any, ...optionalParams: any[]) {
    if (!this.silent) {
      this.outfn(message, ...optionalParams);
    }
  }

  warn(message?: any, ...optionalParams: any[]) {
    if (!this.silent) {
      this.outfn(message, ...optionalParams);
    }
  }

  error(message?: any, ...optionalParams: any[]) {
    this.errfn(message, ...optionalParams);
  }
}
