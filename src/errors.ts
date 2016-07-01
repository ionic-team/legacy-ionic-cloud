import { IDetailedError } from './definitions';

export class Exception extends Error {
  public name: string;
  public stack: string;

  constructor(public message?: string) {
    super(message);
    this.name = 'Exception';
    this.stack = (<any>new Error()).stack;
  }

  toString() {
    return `${this.name}: ${this.message}`;
  }
}

export class DetailedError<D> extends Exception implements IDetailedError<D> {
  constructor(public message?: string, public details?: D) {
    super(message);
    this.name = 'DetailedError';
  }
}
