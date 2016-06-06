import { Client } from '../core/client';

export interface IStatSerialized {
  app_id: string;
  stat: string;
  value: number;
  created: string;
}

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

export class Insights {

  public static SUBMIT_COUNT = 100;
  public submitCount = Insights.SUBMIT_COUNT;

  private batch: Stat[];

  constructor(public client: Client, public appId: string) {
    this.client = client;
    this.appId = appId;
    this.batch = [];
  }

  track(stat: string, value: number = 1): void {
    this.trackStat(new Stat(this.appId, stat, value));
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
    let insights: IStatSerialized[] = [];

    for (let stat of this.batch) {
      insights.push(stat.toJSON());
    }

    return this.client.post('/insights')
      .send({'insights': insights});
  }

}
