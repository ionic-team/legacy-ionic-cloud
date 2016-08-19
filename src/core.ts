import {
  CoreDependencies,
  IConfig,
  ICore,
  IEventEmitter,
  IInsights,
  ILogger,
  IPushNotificationEvent,
} from './definitions';

/**
 * @hidden
 */
export class Core implements ICore {

  /**
   * @private
   */
  private config: IConfig;

  /**
   * @private
   */
  private logger: ILogger;

  /**
   * @private
   */
  private emitter: IEventEmitter;

  /**
   * @private
   */
  private insights: IInsights;

  /**
   * @private
   */
  private _version = 'VERSION_STRING';

  constructor(
    deps: CoreDependencies
  ) {
    this.config = deps.config;
    this.logger = deps.logger;
    this.emitter = deps.emitter;
    this.insights = deps.insights;
  }

  public init(): void {
    this.registerEventHandlers();
    this.onResume();
  }

  public get version(): string {
    return this._version;
  }

  /**
   * @private
   */
  private onResume(): void {
    this.insights.track('mobileapp.opened');
  }

  /**
   * @private
   */
  private registerEventHandlers(): void {
    this.emitter.on('cordova:resume', () => {
      this.onResume();
    });

    this.emitter.on('push:notification', (data: IPushNotificationEvent) => {
      if (data.message.app.asleep || data.message.app.closed) {
        this.insights.track('mobileapp.opened.push');
      }
    });
  }

}
