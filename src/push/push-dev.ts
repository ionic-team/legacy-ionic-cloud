import { IonicCloud } from '../core/core';
import { Client } from '../core/client';
import { generateUUID } from '../util/util';
import { PushToken } from './push-token';

/**
 * PushDev Service
 *
 * This service acts as a mock push service that is intended to be used pre-setup of
 * GCM/APNS in an Ionic.io project.
 *
 * How it works:
 *
 *   When register() is called, this service is used to generate a random
 *   development device token. This token is not valid for any service outside of
 *   Ionic Push with `dev_push` set to true. These tokens do not last long and are not
 *   eligible for use in a production app.
 *
 *   The device will then periodically check the Push service for push notifications sent
 *   to our development token -- so unlike a typical "push" update, this actually uses
 *   "polling" to find new notifications. This means you *MUST* have the application open
 *   and in the foreground to retreive messsages.
 *
 *   The callbacks provided in your init() will still be triggered as normal,
 *   but with these notable exceptions:
 *
 *      - There is no payload data available with messages
 *      - An alert() is called when a notification is received unlesss you return false
 *        in your 'onNotification' callback.
 *
 */
export class PushDevService {
  client: Client;

  private _token: string;
  private _watch: any;
  private _push: any;

  constructor() {
    this.client = IonicCloud.client;
    this._token = null;
    this._watch = null;
  }

  /**
   * Generate a development token
   *
   * @return {String} development device token
   */
  getDevToken() {
    let token = generateUUID();
    this._token = 'DEV-' + token;
    return this._token;
  }

  /**
   * Registers a development token with the Ionic Push service
   *
   * @param {IonicPushService} ionicPush Instantiated Push Service
   * @param {function} callback Registration Callback
   * @return {void}
   */
  init(ionicPush, callback) {
    this._push = ionicPush;
    var token = this._token;
    if (!token) {
      token = this.getDevToken();
    }

    this.client.post('/push/development')
      .send({'token': token})
      .end((err, res) => {
        if (err) {
          IonicCloud.logger.error('Ionic Push (dev): error connecting development push service: ' + err);
        } else {
          var data = { 'registrationId': token };
          IonicCloud.logger.info('Ionic Push (dev): registered with development push service: ' + token);
          IonicCloud.emitter.emit('push:token', data);
          if (typeof callback === 'function') {
            callback(new PushToken(this._token));
          }
          this.watch();
        }
      });
  }

  /**
   * Checks the push service for notifications that target the current development token
   * @return {void}
   */
  checkForNotifications() {
    if (!this._token) {
      return;
    }

    this.client.get('/push/development')
      .query({'token': this._token})
      .end((err, res) => {
        if (err) {
          IonicCloud.logger.error('Ionic Push (dev): unable to check for development pushes: ' + err);
        } else {
          if (res.body.data.message) {
            var message = {
              'message': res.body.data.message,
              'title': 'DEVELOPMENT PUSH'
            };

            IonicCloud.logger.warn('Ionic Push (dev): Development Push received. Development pushes will not contain payload data.');
            IonicCloud.emitter.emit('push:notification', message);
          }
        }
      });
  }

  /**
   * Kicks off the "polling" of the Ionic Push service for new push notifications
   * @return {void}
   */
  watch() {
    // Check for new dev pushes every 5 seconds
    IonicCloud.logger.info('Ionic Push (dev): watching for new notifications');
    var self = this;
    if (!this._watch) {
      this._watch = setInterval(function() { self.checkForNotifications(); }, 5000);
    }
  }

  /**
   * Puts the "polling" for new notifications on hold.
   * @return {void}
   */
  halt() {
    if (this._watch) {
      clearInterval(this._watch);
    }
  }

}
