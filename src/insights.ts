import { InsightsDependencies, InsightsOptions, IInsights, IApp, IClient, ILogger, IStatSerialized } from './definitions';

export class Stat {
  public created: Date;

  constructor(public appId: string, public stat: string, public value: number = 1) {
    this.appId = appId;
    this.stat = stat;
    this.value = value;
    this.created = new Date();
  }

  toJSON(): IStatSerialized {
    return {
      app_id: this.appId,
      stat: this.stat,
      value: this.value,
      created: this.created.toISOString(),
    };
  }
}

export class Insights implements IInsights {

  public static SUBMIT_COUNT = 100;
  public submitCount = Insights.SUBMIT_COUNT;

  private app: IApp;
  private client: IClient;
  private logger: ILogger;

  private batch: Stat[];

  constructor(deps: InsightsDependencies, public options: InsightsOptions = {}) {
    this.app = deps.app;
    this.client = deps.client;
    this.logger = deps.logger;
    this.batch = [];

    if (options.intervalSubmit) {
      setInterval(() => {
        this.submit();
      }, options.intervalSubmit);
    }

    if (options.submitCount) {
      this.submitCount = options.submitCount;
    }
  }

  track(stat: string, value: number = 1): void {
    this.trackStat(new Stat(this.app.id, stat, value));
  }

  protected trackStat(stat: Stat): void {
    this.batch.push(stat);

    if (this.shouldSubmit()) {
      this.submit();
    }
  }

  protected shouldSubmit(): boolean {
    return this.batch.length >= this.submitCount;
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
