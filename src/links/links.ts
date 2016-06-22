import { IonicCloud } from '../core/core';

import { deepExtend } from '../util/util';

import { DeferredPromise } from '../core/promise';

declare var navigator;
declare var window;

export class Links {
  constructor() {
    this.init();
  }

  init() {
    this.checkInstall().then((resp) => {
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

  _getHardwareInfo() {
    var w = window,
    d = document,
    e = d.documentElement,
    g = d.getElementsByTagName('body')[0];

    var info = {
      x: w.innerWidth || e.clientWidth || g.clientWidth,
      y: w.innerHeight || e.clientHeight || g.clientHeight,
      tzOffset: new Date().getTimezoneOffset(),
      cpuClass: navigator.cpuClass,
      platform: navigator.platform,
      doNotTrack: navigator.doNotTrack
    };

    return info;
  }

  checkInstall(): Promise<any> {
    let data = this._getHardwareInfo();

    if (window.IonicDeeplink) {
      return new Promise((resolve, reject) => {
        window.IonicDeeplink.getHardwareInfo((info) => {
          console.log('Got native hardware info', info);
          let newData = deepExtend(data, info);

          this._post('/links/install', {
            data: newData
          }).then((resp) => {
            resolve(resp);
          }, (err) => {
            reject(err);
          });
        });
      });
    } else {
      console.warn('Ionic Links: ionic-plugin-deeplinks is not installed, device fingerprinting will be inaccurate.');
      return this._post('/links/install', {
        data: data
      });
    }
  }

  link(data): Promise<any> {
    return this._post('/links/link', data);
  }

  content(data): Promise<any> {
    return this._post('/links/content', data);
  }
}
