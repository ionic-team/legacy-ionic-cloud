import { ILogger, LoggerOptions } from './definitions';

export class Logger implements ILogger {

  public infofn = console.log.bind(console);
  public warnfn = console.warn.bind(console);
  public errorfn = console.error.bind(console);

  constructor(public options: LoggerOptions = {}) {}

  info(message?: any, ...optionalParams: any[]) {
    if (!this.options.silent) {
      this.infofn(message, ...optionalParams);
    }
  }

  warn(message?: any, ...optionalParams: any[]) {
    if (!this.options.silent) {
      this.warnfn(message, ...optionalParams);
    }
  }

  error(message?: any, ...optionalParams: any[]) {
    this.errorfn(message, ...optionalParams);
  }
}
