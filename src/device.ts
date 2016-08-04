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

  public deviceType: string;

  private emitter: IEventEmitter;

  constructor(public deps: DeviceDependencies) {
    this.emitter = this.deps.emitter;
    this.deviceType = this.determineDeviceType();
    this.registerEventHandlers();
  }

  public isAndroid(): boolean {
    return this.deviceType === 'android';
  }

  public isIOS(): boolean {
    return this.deviceType === 'iphone' || this.deviceType === 'ipad';
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

  private registerEventHandlers(): void {
    if (this.deviceType === 'unknown') {
      this.emitter.emit('device:ready');
    } else {
      this.emitter.once('cordova:deviceready', () => {
        this.emitter.emit('device:ready');
      });
    }
  }

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
