import { App } from './app';
import { Client } from './client';
import { Cordova } from './cordova';
import { Device } from './device';
import { EventEmitter } from './events';
import { Insights } from './insights';
import { Storage } from './storage';
import { ILogger, Logger } from './logger';
import { ISettings, Config, config } from './config';

export class Core {

  app: App;
  client: Client;
  config: Config;
  cordova: Cordova;
  device: Device;
  emitter: EventEmitter;
  insights: Insights;
  logger: ILogger;
  storage: Storage;

  private pluginsReady: boolean = false;
  private _version = 'VERSION_STRING';

  constructor() {
    this.config = config;
    this.logger = new Logger();
    this.client = new Client(this.config.getURL('api'));
    this.device = new Device();
    this.cordova = new Cordova(this.device, this.logger);
    this.emitter = new EventEmitter();
    this.storage = new Storage();
    this.cordova.load();
    this.registerEventHandlers();
  }

  public init(cfg: ISettings) {
    this.config.register(cfg);
    this.emitter.emit('core:init');
    this.client.baseUrl = this.config.getURL('api');
    this.app = new App(this.config.get('app_id'));
    this.insights = new Insights(this.client, this.app);
    this.insights.track('mobileapp.opened');
  }

  public get version(): string {
    return this._version;
  }

  private registerEventHandlers() {
    this.emitter.on('auth:token-changed', (data) => {
      this.client.token = data['new'];
    });

    if (this.device.deviceType === 'unknown') {
      this.logger.info('Ionic Core: attempting to mock plugins');
      this.pluginsReady = true;
      this.emitter.emit('device:ready');
    } else {
      document.addEventListener('deviceready', () => {
        this.logger.info('Ionic Core: plugins are ready');
        this.pluginsReady = true;
        this.emitter.emit('device:ready');
      }, false);

      document.addEventListener('resume', () => {
        this.insights.track('mobileapp.opened');
      }, false);
    }
  }

  /**
   * Fire a callback when core + plugins are ready. This will fire immediately if
   * the components have already become available.
   *
   * @param {function} callback function to fire off
   * @return {void}
   */
  onReady(callback) {
    if (this.pluginsReady) {
      callback(this);
    } else {
      this.emitter.on('device:ready', () => {
        callback(this);
      });
    }
  }
}

export let IonicCloud = new Core();
