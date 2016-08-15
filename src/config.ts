import { ISettingsUrls, ISettings, IConfig } from './definitions';

/**
 * @hidden
 */
export class Config implements IConfig {

  /**
   * The cloud config.
   */
  public settings: ISettings;

  /**
   * @private
   */
  private urls: ISettingsUrls = {
    'api': 'https://api.ionic.io'
  };

  /**
   * Register a new config.
   */
  public register(settings: ISettings) {
    this.settings = settings;
  }

  /**
   * Get a value from the core settings. You should use `settings` attribute
   * directly for core settings and other settings.
   *
   * @deprecated
   *
   * @param name - The settings key to get.
   */
  public get(name: string): any {
    if (!this.settings || !this.settings.core) {
      return undefined;
    }

    return this.settings.core[name];
  }

  /**
   * @hidden
   */
  public getURL(name: string): string {
    let urls = (this.settings && this.settings.core && this.settings.core.urls) || {};

    if (urls[name]) {
      return urls[name];
    }

    return this.urls[name];
  }

}
