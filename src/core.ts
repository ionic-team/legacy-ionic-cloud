import { ICore, IConfig, ISettings, ILogger, IEventEmitter, IClient, IPushNotificationEvent } from './interfaces';
import { App } from './app';
import { Insights } from './insights';

export class Core implements ICore {

  app: App;
  insights: Insights;

  private _version = 'VERSION_STRING';

  constructor(
    public config: IConfig,
    public logger: ILogger,
    public emitter: IEventEmitter,
    public client: IClient
  ) {
    this.registerEventHandlers();
  }

  public init(cfg?: ISettings) {
    if (cfg) {
      this.config.register(cfg);
    }

    this.emitter.emit('core:init');
    this.client.baseUrl = this.config.getURL('api');
    this.app = new App(this.config.get('app_id'));
    this.insights = new Insights({ logger: this.logger, intervalSubmit: 60 * 1000 }, this.client, this.app);
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
