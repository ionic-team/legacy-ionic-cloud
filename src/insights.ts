import { ILogger, IStatSerialized } from './interfaces';
import { App } from './app';
import { Client } from './client';

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

export interface InsightsOptions {
  intervalSubmit?: number;
  logger?: ILogger;
  submitCount?: number;
}

export class Insights {

  public static SUBMIT_COUNT = 100;
  public submitCount = Insights.SUBMIT_COUNT;
  public logger: ILogger;

  private batch: Stat[];

  constructor(public client: Client, public app: App, public options: InsightsOptions = {}) {
    this.client = client;
    this.app = app;
    this.options = options;
    this.logger = this.options.logger;
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
          if (this.logger) {
            this.logger.error('Ionic Insights: Could not send insights.', err);
          }
        } else {
          if (this.logger) {
            this.logger.info('Ionic Insights: Sent insights.');
          }
        }
      });

    this.batch = [];
  }

}
