import {
  IAppStatus,
  IClient,
  IConfig,
  IInsights,
  ILogger,
  IStatSerialized,
  IStorage,
  InsightsDependencies,
  InsightsOptions
} from './definitions';

/**
 * @hidden
 */
export class Stat {

  public created: Date;

  constructor(public appId: string, public stat: string, public value: number = 1) {
    this.appId = appId;
    this.stat = stat;
    this.value = value;
    this.created = new Date();
  }

  public toJSON(): IStatSerialized {
    return {
      app_id: this.appId,
      stat: this.stat,
      value: this.value,
      created: this.created.toISOString(),
    };
  }

}

/**
 * A client for Insights that handles batching, user activity insight, and
 * sending insights at an interval.
 *
 * @hidden
 */
export class Insights implements IInsights {

  /**
   * @private
   */
  private app: IAppStatus;

  /**
   * @private
   */
  private storage: IStorage<string>;

  /**
   * @private
   */
  private config: IConfig;

  /**
   * @private
   */
  private client: IClient;

  /**
   * @private
   */
  private logger: ILogger;

  /**
   * @private
   */
  private batch: Stat[];

  constructor(
    deps: InsightsDependencies,
    public options: InsightsOptions = {
      'intervalSubmit': 60 * 1000,
      'intervalActiveCheck': 1000,
      'submitCount': 100
    }
  ) {
    this.app = deps.appStatus;
    this.storage = deps.storage;
    this.config = deps.config;
    this.client = deps.client;
    this.logger = deps.logger;
    this.batch = [];

    setInterval(() => {
      this.submit();
    }, this.options.intervalSubmit);

    setInterval(() => {
      if (!this.app.closed) {
        this.checkActivity();
      }
    }, this.options.intervalActiveCheck);
  }

  /**
   * Track an insight.
   *
   * @param stat - The insight name.
   * @param value - The number by which to increment this insight.
   */
  public track(stat: string, value: number = 1): void {
    this.trackStat(new Stat(this.config.get('app_id'), stat, value));
  }

  protected checkActivity() {
    let session = this.storage.get('insights_session');

    if (!session) {
      this.markActive();
    } else {
      let d = new Date(session);
      let hour = 60 * 60 * 1000;

      if (d.getTime() + hour < new Date().getTime()) {
        this.markActive();
      }
    }
  }

  protected markActive() {
    this.storage.set('insights_session', new Date().toISOString());
    this.track('mobileapp.active');
  }

  protected trackStat(stat: Stat): void {
    this.batch.push(stat);

    if (this.shouldSubmit()) {
      this.submit();
    }
  }

  protected shouldSubmit(): boolean {
    return this.batch.length >= this.options.submitCount;
  }

  protected submit() {
    if (this.batch.length === 0) {
      return;
    }

    let insights: IStatSerialized[] = [];

    for (let stat of this.batch) {
      insights.push(stat.toJSON());
    }

    this.client.post('/insights')
      .send({'insights': insights})
      .end((err, res) => {
        if (err) {
          this.logger.error('Ionic Insights: Could not send insights.', err);
        } else {
          this.logger.info('Ionic Insights: Sent insights.');
        }
      });

    this.batch = [];
  }

}
