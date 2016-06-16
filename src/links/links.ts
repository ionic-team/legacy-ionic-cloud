import { Client } from '../core/client';
import { IonicPlatform } from '../core/core';

import { DeferredPromise, PromiseWithNotify } from '../core/promise';

export class Links {

  constructor(public client: Client, public appId: string) {
    this.client = client;
    this.appId = appId;
  }

  static create(data): PromiseWithNotify<any> {
    var q = new DeferredPromise();

    let client = IonicPlatform.client;
    client.post('/links/link')
      .send(data)
      .end((err, res) => {
        if (err) {
          q.reject(err);
        } else {
          q.resolve(res);
        }
      });

    return q.promise;
  }
}
