import { APIRequest } from '../core/request';
import { Logger } from '../core/logger';

interface IStatSerialized {
  app_id: string;
  stat: string;
  value: number;
  created: string;
}

class Stat {
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
  private batch: Stat[];
  protected logger: Logger;

  constructor(public appId: string) {
    this.appId = appId;
    this.batch = [];
    this.logger = new Logger({
      'prefix': 'Ionic Insights:'
    });
    this.logger.info('init');
  }

  track(stat: string, value: number = 1) {
    this.batch.push(new Stat(this.appId, stat, value));
    this.submit();
  }

  protected submit() {
    if (this.batch.length >= Insights.SUBMIT_COUNT) {
    }
  }

}
