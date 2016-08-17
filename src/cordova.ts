import {
  CordovaDependencies,
  CordovaOptions,
  IAppStatus,
  ICordova,
  IDevice,
  IEventEmitter,
  ILogger
} from './definitions';

declare var cordova: any;

/**
 * @hidden
 */
export class Cordova implements ICordova {

  /**
   * Native information about the app.
   */
  public app: IAppStatus;

  /**
   * @private
   */
  private device: IDevice;

  /**
   * @private
   */
  private emitter: IEventEmitter;

  /**
   * @private
   */
  private logger: ILogger;

  constructor(deps: CordovaDependencies, protected options: CordovaOptions = {}) {
    this.app = deps.appStatus;
    this.device = deps.device;
    this.emitter = deps.emitter;
    this.logger = deps.logger;
    this.registerEventHandlers();
  }

  public bootstrap(): void {
    let events = ['pause', 'resume'];

    document.addEventListener('deviceready', (...args) => {
      this.emitter.emit('cordova:deviceready', {'args': args});

      for (let e of events) {
        document.addEventListener(e, (...args) => {
          this.emitter.emit('cordova:' + e, {'args': args});
        }, false);
      }
    }, false);
  }

  /**
   * @private
   */
  private registerEventHandlers(): void {
    this.emitter.on('cordova:pause', () => {
      this.app.closed = true;
    });

    this.emitter.on('cordova:resume', () => {
      this.app.closed = false;
    });
  }

}
