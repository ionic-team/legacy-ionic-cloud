import * as request from 'superagent';
import { IClient } from './interfaces';

export class Client implements IClient {

  private req: any;

  constructor(
    public baseUrl: string,
    public token?: string,
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
    return this.supplement(this.req.bind(method), endpoint);
  }

  private supplement(
    fn: (url: string) => any,
    endpoint: string
  ): any {
    if (endpoint.substring(0, 1) !== '/') {
      throw Error('endpoint must start with leading slash');
    }

    let req = fn(this.baseUrl + endpoint);

    if (this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }

    return req;
  }
}
