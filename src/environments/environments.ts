import { IonicCloud } from '../core/core';
import { DeferredPromise } from '../core/promise';

export class Environment {
  /**
   * Environment constructor
   *
   * @param {object} config Configuration object
   */

  constructor() {}

  /**
   * Load an environment, calls loadEnvFromAPI
   *
   * @param {string} tag Environment tag
   * @return {Promise} will resolve/reject with the config object or error
   */
  public load(tag): Promise<Object> {
    var deferred = new DeferredPromise();

    this.loadEnvFromAPI(tag).then(function(env) {
      deferred.resolve(env['config']);
    }, function(err) {
      deferred.reject(err);
    });

    return deferred.promise;
  }

  /**
   * Load an environment from the API
   *
   * @param {string} tag Environment tag
   * @return {Promise} will resolve/reject with the config object or error
   */
  private loadEnvFromAPI(tag): Promise<any> {
    var deferred = new DeferredPromise();
    let appId = IonicCloud.config.get('app_id');

    IonicCloud.client.get(`/apps/${appId}/env/${tag}`)
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else if (res.ok) {
          deferred.resolve(res.body.data);
        }
      });

    return deferred.promise;
  }
}
