import { CoreDependencies, ICore, IConfig, ISettings, ILogger, IEventEmitter, IInsights, IPushNotificationEvent } from './definitions';

export class Core implements ICore {

  public config: IConfig;
  public logger: ILogger;
  public emitter: IEventEmitter;
  public insights: IInsights;

  private _version = 'VERSION_STRING';

  constructor(
    deps: CoreDependencies,
    public cfg?: ISettings
  ) {
    this.config = deps.config;
    this.config.register(cfg);
    this.logger = deps.logger;
    this.emitter = deps.emitter;
    this.insights = deps.insights;
    this.registerEventHandlers();
    this.insights.track('mobileapp.opened');
  }

  public get version(): string {
    return this._version;
  }

  private registerEventHandlers(): void {
    this.emitter.on('cordova:resume', (data) => {
      this.insights.track('mobileapp.opened');
    });

    this.emitter.on('push:notification', (data: IPushNotificationEvent) => {
      if (data.message.app.asleep || data.message.app.closed) {
        this.insights.track('mobileapp.opened.push');
      }
    });
  }
}
