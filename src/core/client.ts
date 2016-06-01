import { Auth } from '../auth/auth';
import { IonicPlatform } from '../core/core';
import * as request from 'superagent';

export class Client {

  constructor(
    public baseUrl: string,
    public token: string,
    public req?: any
  ) {
    if (typeof req === 'undefined') {
      req = request;
    }

    this.baseUrl = baseUrl;
    this.token = token;
    this.req = req;
  }

  get(endpoint: string): any {
    return this.supplement(this.req.get, endpoint);
  }

  post(endpoint: string): any {
    return this.supplement(this.req.post, endpoint);
  }

  put(endpoint: string): any {
    return this.supplement(this.req.put, endpoint);
  }

  patch(endpoint: string): any {
    return this.supplement(this.req.patch, endpoint);
  }

  delete(endpoint: string): any {
    return this.supplement(this.req.delete, endpoint);
  }

  private supplement(
    fn: (url: string) => any,
    endpoint: string
  ): any {
    if (endpoint.substring(0, 1) !== '/') {
      throw Error('endpoint must start with leading slash');
    }

    return fn(this.baseUrl + endpoint).set('Authorization', `Bearer ${this.token}`);
  }
}

export let client = new Client(
  IonicPlatform.config.getURL('platform-api'),
  Auth.getUserToken(),
  request
);
