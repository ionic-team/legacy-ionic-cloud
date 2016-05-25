import { APIRequest } from '../core/request';
import { EventEmitter } from '../core/events';
import { IonicPlatform } from '../core/core';
import { Logger } from '../core/logger';
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
  logger: Logger;

  private _serviceHost: string;
  private _token: string;
  private _watch: any;
  private _push: any;
  private _emitter: EventEmitter;

  constructor() {
    this.logger = new Logger({
      'prefix': 'Ionic Push (dev):'
    });
    this._serviceHost = IonicPlatform.config.getURL('platform-api') + '/push';
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
    this._emitter = this._push._emitter;
    var token = this._token;
    var self = this;
    if (!token) {
      token = this.getDevToken();
    }

    var requestOptions = {
      'method': 'POST',
      'uri': this._serviceHost + '/development',
      'json': {
        'token': token
      }
    };

    new APIRequest(requestOptions).then(function() {
      var data = { 'registrationId': token };
      self.logger.info('registered with development push service: ' + token);
      self._emitter.emit('ionic_push:token', data);
      if ((typeof callback === 'function')) {
        callback(new PushToken(self._token));
      }
      self.watch();
    }, function(error) {
      self.logger.error('error connecting development push service: ' + error);
    });
  }

  /**
   * Checks the push service for notifications that target the current development token
   * @return {void}
   */
  checkForNotifications() {
    if (!this._token) {
      return false;
    }

    var self = this;
    var requestOptions = {
      'method': 'GET',
      'uri': self._serviceHost + '/development?token=' + self._token,
      'json': true
    };

    new APIRequest(requestOptions).then(function(result) {
      if (result.payload.data.message) {
        var message = {
          'message': result.payload.data.message,
          'title': 'DEVELOPMENT PUSH'
        };

        self.logger.warn('Ionic Push: Development Push received. Development pushes will not contain payload data.');
        self._emitter.emit('ionic_push:notification', message);
      }
    }, function(error) {
      self.logger.error('unable to check for development pushes: ' + error);
    });
  }

  /**
   * Kicks off the "polling" of the Ionic Push service for new push notifications
   * @return {void}
   */
  watch() {
    // Check for new dev pushes every 5 seconds
    this.logger.info('watching for new notifications');
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
