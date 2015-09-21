import { APIRequest } from "../core/request";
import { Settings } from "../core/settings";
import { IonicPlatform } from "../core/core";
import { Logger } from "../core/logger";

var settings = new Settings();

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
  constructor() {
    this.logger = new Logger({
      'prefix': 'Ionic Push (dev):'
    });
    this._serviceHost = settings.getURL('push');
    this._token = false;
    this._watch = false;
    this._emitter = IonicPlatform.getEmitter();
  }

  /**
   * Generate a development token
   *
   * @return {String} development device token
   */
  getDevToken() {
    // Some crazy bit-twiddling to generate a random guid
    var token = 'DEV-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    this._token = token;
    return this._token;
  }


  /**
   * Registers a development token with the Ionic Push service
   *
   * @param {IonicPushService} ionicPush Instantiated Push Service
   * @return {void}
   */
  init(ionicPush) {
    this._push = ionicPush;
    var token = this._token;
    var self = this;
    if (!token) {
      token = this.getDevToken();
    }

    var requestOptions = {
      "method": 'POST',
      "uri": this._serviceHost + '/dev/push',
      'headers': {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      "body": JSON.stringify({
        "dev_token": token
      })
    };

    new APIRequest(requestOptions).then(function() {
      self.logger.info('registered with development push service', token);
      self._emitter.emit("ionic_push:token", { "token": token });
      if (self.registerCallback) {
        self.registerCallback({
          "registrationId": token
        });
      }
      self.watch();
    }, function(error) {
      self.logger.error("error connecting development push service.", error);
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
      'uri': this._serviceHost + '/dev/push/check',
      'headers': {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Ionic-Dev-Token': this._token
      },
      'json': true
    };

    new APIRequest(requestOptions).then(function(result) {
      if (result.payload.messages.length > 0) {
        var notification = {
          'message': result.payload.messages[0],
          'title': 'DEVELOPMENT PUSH'
        };

        console.warn("Ionic Push: Development Push received. Development pushes will not contain payload data.");

        var callbackRet = self._push.notificationCallback && self._push.notificationCallback(notification);
        // If the custom handler returns false, don't handle this at all in our code
        if (callbackRet === false) {
          return;
        }

        // If the user callback did not return false, prompt an alert to show the notification
        alert(notification.message);
      }
    }, function(error) {
      self.logger.error("unable to check for development pushes.", error);
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
