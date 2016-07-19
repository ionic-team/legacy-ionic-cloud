import { ILogger, LoggerOptions } from './definitions';

/**
 * Simple console logger.
 */
export class Logger implements ILogger {

  /**
   * The function to use to log info level messages.
   */
  public infofn = console.log.bind(console);

  /**
   * The function to use to log warn level messages.
   */
  public warnfn = console.warn.bind(console);

  /**
   * The function to use to log error level messages.
   */
  public errorfn = console.error.bind(console);

  constructor(public options: LoggerOptions = {}) {}

  /**
   * Send a log at info level.
   *
   * @param message - The message to log.
   */
  public info(message?: any, ...optionalParams: any[]) {
    if (!this.options.silent) {
      this.infofn(message, ...optionalParams);
    }
  }

  /**
   * Send a log at warn level.
   *
   * @param message - The message to log.
   */
  public warn(message?: any, ...optionalParams: any[]) {
    if (!this.options.silent) {
      this.warnfn(message, ...optionalParams);
    }
  }

  /**
   * Send a log at error level.
   *
   * @param message - The message to log.
   */
  public error(message?: any, ...optionalParams: any[]) {
    this.errorfn(message, ...optionalParams);
  }

}
