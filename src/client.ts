import * as request from 'superagent';
import { IClient, ITokenContext } from './definitions';

export class Client implements IClient {

  public req: any;

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

  get(endpoint: string) {
    return this.supplement(this.req.get, endpoint);
  }

  post(endpoint: string) {
    return this.supplement(this.req.post, endpoint);
  }

  put(endpoint: string) {
    return this.supplement(this.req.put, endpoint);
  }

  patch(endpoint: string) {
    return this.supplement(this.req.patch, endpoint);
  }

  delete(endpoint: string) {
    return this.supplement(this.req.delete, endpoint);
  }

  request(method: string, endpoint: string) {
    return this.supplement(this.req.bind(this.req, method), endpoint);
  }

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
