import request from 'superagent';
import { IClient, ITokenContext } from './definitions';

/**
 * `Client` is for making HTTP requests to the API.
 *
 * Under the hood, it uses
 * [superagent](http://visionmedia.github.io/superagent/). When a method is
 * called, you can call any number of superagent functions on it and then call
 * `end()` to complete and send the request.
 *
 * @featured
 */
export class Client implements IClient {

  /**
   * @private
   */
  private req: any;

  constructor(
    /**
     * @hidden
     */
    public tokenContext: ITokenContext,

    /**
     * @hidden
     */
    public baseUrl: string,

    req?: any  // TODO: use superagent types
  ) {
    if (typeof req === 'undefined') {
      req = request;
    }

    this.req = req;
  }

  /**
   * GET request for retrieving a resource from the API.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public get(endpoint: string) {
    return this.supplement(this.req.get, endpoint);
  }

  /**
   * POST request for sending a new resource to the API.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public post(endpoint: string) {
    return this.supplement(this.req.post, endpoint);
  }

  /**
   * PUT request for replacing a resource in the API.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public put(endpoint: string) {
    return this.supplement(this.req.put, endpoint);
  }

  /**
   * PATCH request for performing partial updates to a resource in the API.
   *
   * @param endpoint - The path of the API endpoint.
   */
  public patch(endpoint: string) {
    return this.supplement(this.req.patch, endpoint);
  }

  /**
   * DELETE request for deleting a resource from the API.
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
