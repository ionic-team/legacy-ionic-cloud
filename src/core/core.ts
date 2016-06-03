import { Client } from './client';
import { Cordova } from './cordova';
import { Device } from './device';
import { EventEmitter } from './events';
import { Storage } from './storage';
import { Logger } from './logger';
import { IonicPlatformConfig, Config, ISettings } from './config';

declare var Ionic: any;

export class Core {

  client: Client;
  cordova: Cordova;
  device: Device;
  logger: Logger;
  emitter: EventEmitter;
  storage: Storage;
  config: IonicPlatformConfig;

  private pluginsReady: boolean = false;
  private _version = 'VERSION_STRING';

  constructor() {
    this.config = Config;
    this.client = new Client(this.config.getURL('platform-api'));
    this.device = new Device();
    this.cordova = new Cordova(this.device);
    this.logger = new Logger({
      'prefix': 'Ionic Core:'
    });
    this.logger.info('init');
    this.emitter = new EventEmitter();
    this.storage = new Storage();
    this.cordova.load();
    this.registerEventHandlers();
  }

  public init(cfg: ISettings) {
    this.config.register(cfg);
  }

  public get version() {
    return this._version;
  }

  private registerEventHandlers() {
    if (this.device.deviceType === 'unknown') {
      this.logger.info('attempting to mock plugins');
      this.pluginsReady = true;
      this.emitter.emit('device:ready');
    } else {
      document.addEventListener('deviceready', () => {
        this.logger.info('plugins are ready');
        this.pluginsReady = true;
        this.emitter.emit('device:ready');
      }, false);
    }

    // this.client = new Client
    // this.insights = new Insights(this.config.get('app_id'));
  }

  /**
   * Fire a callback when core + plugins are ready. This will fire immediately if
   * the components have already become available.
   *
   * @param {function} callback function to fire off
   * @return {void}
   */
  onReady(callback) {
    var self = this;
    if (this.pluginsReady) {
      callback(self);
    } else {
      self.emitter.on('device:ready', function() {
        callback(self);
      });
    }
  }
}

export let IonicPlatform = new Core();
