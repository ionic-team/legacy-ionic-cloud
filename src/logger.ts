import { ILogger, LoggerOptions } from './definitions';

/**
 * Simple console logger.
 */
export class Logger implements ILogger {

  public infofn = console.log.bind(console);
  public warnfn = console.warn.bind(console);
  public errorfn = console.error.bind(console);

  constructor(public options: LoggerOptions = {}) {}

  /**
   * Send a log at info level.
   *
   * @param message - The message to log.
   */
  info(message?: any, ...optionalParams: any[]) {
    if (!this.options.silent) {
      this.infofn(message, ...optionalParams);
    }
  }

  /**
   * Send a log at warn level.
   *
   * @param message - The message to log.
   */
  warn(message?: any, ...optionalParams: any[]) {
    if (!this.options.silent) {
      this.warnfn(message, ...optionalParams);
    }
  }

  /**
   * Send a log at error level.
   *
   * @param message - The message to log.
   */
  error(message?: any, ...optionalParams: any[]) {
    this.errorfn(message, ...optionalParams);
  }

}
