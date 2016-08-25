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
 * An error with generic error details.
 *
 * Error details can be extracted depending on the type of `D`. For instance,
 * if the type of `D` is `string[]`, you can do this:
 *
 * ```typescript
 * function handleError(err: IDetailedError<string[]>) {
 *   for (let i in err.details) {
 *     console.error('got error code: ' + i);
 *   }
 * }
 * ```
 *
 * @featured
 */
export class DetailedError<D> extends Exception implements IDetailedError<D> {

  constructor(
    /**
     * The error message.
     */
    public message?: string,

    /**
     * The error details.
     */
    public details?: D
  ) {
    super(message);
    this.name = 'DetailedError';
  }

}
