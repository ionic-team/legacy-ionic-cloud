import { Device } from './device';
import { Logger } from './logger';

declare var cordova: any;

export class Cordova {

  logger: Logger;

  constructor(public device: Device) {
    this.device = device;
    this.logger = new Logger({
      'prefix': 'Ionic Cordova:'
    });
  }

  public load() {
    var self = this;
    if (!this.isAvailable()) {
      var cordovaScript = document.createElement('script');
      var cordovaSrc = 'cordova.js';
      switch (this.device.deviceType) {
        case 'android':
          if (window.location.href.substring(0, 4) === 'file') {
            cordovaSrc = 'file:///android_asset/www/cordova.js';
          }
          break;

        case 'ipad':
        case 'iphone':
          try {
            var resource = window.location.search.match(/cordova_js_bootstrap_resource=(.*?)(&|#|$)/i);
            if (resource) {
              cordovaSrc = decodeURI(resource[1]);
            }
          } catch (e) {
            self.logger.info('could not find cordova_js_bootstrap_resource query param');
            self.logger.info(e);
          }
          break;

        default:
          break;
      }
      cordovaScript.setAttribute('src', cordovaSrc);
      document.head.appendChild(cordovaScript);
      self.logger.info('injecting cordova.js');
    }
  }

  private isAvailable() {
    var self = this;
    this.logger.info('searching for cordova.js');

    if (typeof cordova !== 'undefined') {
      this.logger.info('cordova.js has already been loaded');
      return true;
    }

    var scripts = document.getElementsByTagName('script');
    var len = scripts.length;
    for (var i = 0; i < len; i++) {
      var script = scripts[i].getAttribute('src');
      if (script) {
        var parts = script.split('/');
        var partsLength = 0;
        try {
          partsLength = parts.length;
          if (parts[partsLength - 1] === 'cordova.js') {
            self.logger.info('cordova.js has previously been included.');
            return true;
          }
        } catch (e) {
          self.logger.info('encountered error while testing for cordova.js presence, ' + e.toString());
        }
      }
    }

    return false;
  }

}
