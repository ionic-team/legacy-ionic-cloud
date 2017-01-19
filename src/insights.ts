import {
  AppStatus,
  IClient,
  IConfig,
  IDevice,
  IInsights,
  ILogger,
  IStatSerialized,
  IStorage,
  InsightsDependencies,
  InsightsOptions
} from './definitions';

import { parseSemanticVersion } from './util';

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
  private app: AppStatus;

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
  private device: IDevice;

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
    public options: InsightsOptions = {}
  ) {
    this.app = deps.appStatus;
    this.storage = deps.storage;
    this.config = deps.config;
    this.client = deps.client;
    this.device = deps.device;
    this.logger = deps.logger;
    this.batch = [];

    if (typeof this.options.intervalSubmit === 'undefined') {
      this.options.intervalSubmit = 60 * 1000;
    }

    if (typeof this.options.intervalActiveCheck === 'undefined') {
      this.options.intervalActiveCheck = 1000;
    }

    if (typeof this.options.submitCount === 'undefined') {
      this.options.submitCount = 100;
    }

    if (this.options.intervalSubmit) {
      setInterval(() => {
        this.submit();
      }, this.options.intervalSubmit);
    }

    if (this.options.intervalActiveCheck) {
      setInterval(() => {
        if (!this.app.closed) {
          this.checkActivity();
        }
      }, this.options.intervalActiveCheck);
    }
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

  protected checkActivity(): void {
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

  protected markActive(): void {
    this.track('mobileapp.active');

    if (!this.device.native || typeof this.device.native.platform !== 'string') {
      this.logger.warn('Ionic Insights: Device information unavailable.');
    } else {
      let device = this.device.native;
      let platform = this.normalizeDevicePlatform(device.platform);
      let platformVersion = this.normalizeVersion(device.version);
      let cordovaVersion = this.normalizeVersion(device.cordova);

      this.track(`mobileapp.active.platform.${platform}`);
      this.track(`mobileapp.active.platform.${platform}.${platformVersion}`);
      this.track(`mobileapp.active.cordova.${cordovaVersion}`);
    }

    this.storage.set('insights_session', new Date().toISOString());
  }

  protected normalizeDevicePlatform(platform: string): string {
    return platform.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  protected normalizeVersion(s: string): string {
    let v: string;

    try {
      v = String(parseSemanticVersion(s).major);
    } catch (e)  {
      v = 'unknown';
    }

    return v;
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
        }
      });

    this.batch = [];
  }

}
