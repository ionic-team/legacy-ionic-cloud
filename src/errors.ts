import { IDetailedError } from './definitions';

/**
 * @hidden
 */
export class Exception extends Error {

  public name: string;
  public stack: string;

  constructor(public message?: string) {
    super(message);
    this.name = 'Exception';
    this.stack = (<any>new Error()).stack;
  }

  public toString() {
    return `${this.name}: ${this.message}`;
  }

}

/**
 * An error with generic details.
 */
export class DetailedError<D> extends Exception implements IDetailedError<D> {

  /**
   * @param message - The error message.
   * @param details - The error details.
   */
  constructor(public message?: string, public details?: D) {
    super(message);
    this.name = 'DetailedError';
  }

}
