import {
  DeviceDependencies,
  DeviceIsConnectedToNetworkOptions,
  IDevice,
  IEventEmitter
} from './definitions';

declare var Connection: any;
declare var navigator: any;

/**
 * @hidden
 */
export class Device implements IDevice {

  public native: any;

  public type: string;

  /**
   * @private
   */
  private emitter: IEventEmitter;

  constructor(public deps: DeviceDependencies) {
    this.native = this.deps.nativeDevice;
    this.emitter = this.deps.emitter;
    this.type = this.determineDeviceType();
    this.registerEventHandlers();
  }

  public isAndroid(): boolean {
    return this.type === 'android';
  }

  public isIOS(): boolean {
    return this.type === 'iphone' || this.type === 'ipad';
  }

  public isConnectedToNetwork(options: DeviceIsConnectedToNetworkOptions = {}): boolean {
    if (typeof navigator.connection === 'undefined' ||
        typeof navigator.connection.type === 'undefined' ||
        typeof Connection === 'undefined') {
      if (!options.strictMode) {
        return true;
      }
      return false;
    }

    switch (navigator.connection.type) {
      case Connection.ETHERNET:
      case Connection.WIFI:
      case Connection.CELL_2G:
      case Connection.CELL_3G:
      case Connection.CELL_4G:
      case Connection.CELL:
        return true;

      default:
        return false;
    }
  }

  /**
   * @private
   */
  private registerEventHandlers(): void {
    if (this.type === 'unknown') {
      this.emitter.emit('device:ready');
    } else {
      this.emitter.once('cordova:deviceready', () => {
        this.emitter.emit('device:ready');
      });
    }
  }

  /**
   * @private
   */
  private determineDeviceType(): string {
    var agent = navigator.userAgent;

    var ipad = agent.match(/iPad/i);
    if (ipad && (ipad[0].toLowerCase() === 'ipad')) {
      return 'ipad';
    }

    var iphone = agent.match(/iPhone/i);
    if (iphone && (iphone[0].toLowerCase() === 'iphone')) {
      return 'iphone';
    }

    var android = agent.match(/Android/i);
    if (android && (android[0].toLowerCase() === 'android')) {
      return 'android';
    }

    return 'unknown';
  }

}
