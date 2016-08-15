import * as request from 'superagent';
import { IClient, ITokenContext } from './definitions';

/**
 * Client is for making HTTP requests to the API.
 *
 * Under the hood, it uses superagent. When a method is called, you can call
 * any number of superagent functions on it and then call the `end` method.
 *
 * TODO: link to superagent
 */
export class Client implements IClient {

  /**
   * @private
   */
  private req: any;

  constructor(
    public tokenContext: ITokenContext,
    public baseUrl: string,
    req?: any  // TODO: use superagent types
  ) {
    if (typeof req === 'undefined') {
      req = request;
    }

    this.req = req;
  }

  /**
   * GET request.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public get(endpoint: string) {
    return this.supplement(this.req.get, endpoint);
  }

  /**
   * POST request.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public post(endpoint: string) {
    return this.supplement(this.req.post, endpoint);
  }

  /**
   * PUT request.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public put(endpoint: string) {
    return this.supplement(this.req.put, endpoint);
  }

  /**
   * PATCH request.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public patch(endpoint: string) {
    return this.supplement(this.req.patch, endpoint);
  }

  /**
   * DELETE request.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public delete(endpoint: string) {
    return this.supplement(this.req.delete, endpoint);
  }

  /**
   * @hidden
   */
  public request(method: string, endpoint: string) {
    return this.supplement(this.req.bind(this.req, method), endpoint);
  }

  /**
   * @private
   */
  private supplement(
    fn: (url: string) => any,
    endpoint: string
  ): any {
    if (endpoint.substring(0, 1) !== '/') {
      throw Error('endpoint must start with leading slash');
    }

    let req = fn(this.baseUrl + endpoint);
    let token = this.tokenContext.get();

    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }

    return req;
  }

}
