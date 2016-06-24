import { ILogger } from './definitions';

export class Logger implements ILogger {

  public silent: boolean = false;
  public infofn = console.log.bind(console);
  public warnfn = console.warn.bind(console);
  public errorfn = console.error.bind(console);

  info(message?: any, ...optionalParams: any[]) {
    if (!this.silent) {
      this.infofn(message, ...optionalParams);
    }
  }

  warn(message?: any, ...optionalParams: any[]) {
    if (!this.silent) {
      this.warnfn(message, ...optionalParams);
    }
  }

  error(message?: any, ...optionalParams: any[]) {
    this.errorfn(message, ...optionalParams);
  }
}
