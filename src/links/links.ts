import { IonicCloud } from '../core/core';

import { DeferredPromise } from '../core/promise';

export class Links {
  constructor() {
    this.init();
  }

  init() {
    this.checkInstall({}).then((resp) => {
    }, (err) => {
    });
  }

  _post(url, data) {
    var q = new DeferredPromise<any>();

    let appId = IonicCloud.config.get('app_id');
    data.app_id = appId;

    IonicCloud.client.post(url)
      .send(data)
      .end((err, res) => {
        if (err) {
          q.reject({
            error: err,
            response: res,
            data: (res && res.body && res.body.error) || {}
          });
        } else {
          q.resolve({
            response: res,
            data: (res && res.body && res.body.data) || {}
          });
        }
      });

    return q.promise;
  }

  checkInstall(data): Promise<any> {
    return this._post('/links/install', data);
  }

  link(data): Promise<any> {
    return this._post('/links/link', data);
  }

  content(data): Promise<any> {
    return this._post('/links/content', data);
  }
}
