import { Client } from '../core/client';
import { IonicCloud } from '../core/core';

import { DeferredPromise } from '../core/promise';

export class Links {

  constructor(public client: Client, public appId: string) {
    this.client = client;
    this.appId = appId;
  }

  static _post(url, data) {
    var q = new DeferredPromise<any>();

    let appId = IonicCloud.config.get('app_id');
    data.app_id = appId;

    let client = IonicCloud.client;

    client.post(url)
      .send(data)
      .end((err, res) => {
        if (err) {
          q.reject({
            error: err,
            response: res,
            data: (res.body && res.body.error) || {}
          });
        } else {
          q.resolve({
            response: res,
            data: (res.body && res.body.data) || {}
          });
        }
      });

    return q.promise;
  }

  static link(data): Promise<any> {
    return Links._post('/links/link', data);
  }

  static content(data): Promise<any> {
    return Links._post('/links/content', data);
  }
}
