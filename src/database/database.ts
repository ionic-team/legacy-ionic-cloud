import * as Horizon from '@horizon/client';


enum AuthType {
  unauthenticated,
  anonymous,
  token
}

export interface DBSettings {
  app_id: string;
  lazyWrites?: boolean;
  authType?: string;
  host?: string;
  secure?: boolean;
  retries?: number;
}

interface HorizonSettings {
  lazyWrites?: boolean;
  authType: string;
  host: string;
  secure: boolean;
  path: string;
}

export class Database {

  private _failed: boolean;
  private _curr_retry: number;
  private _hz_settings: HorizonSettings;
  horizon: any;

  constructor(private settings: DBSettings) {
    this._hz_settings = {
      lazyWrites: settings.lazyWrites || false,
      authType: AuthType[AuthType[settings.authType]] || AuthType[AuthType.anonymous],
      host: settings.host || 'horizon.ionicjs.com:35100',
      path: 'horizon/' + settings.app_id + '/horizon',
      secure: true
    }; 

    if (settings.secure !== undefined) {
      this._hz_settings.secure = settings.secure;
    }
    this.settings.retries = settings.retries || 10;
    this._curr_retry = 0;
  }

  connect(): any {
    if (this.horizon) {
      return this;
    }
    this.horizon = Horizon(this._hz_settings);
    this._registerListeners();
    this.horizon.connect();
    return this;
  }

  private _registerListeners(): void {
    this.horizon.onReady( () => {
      console.log('connected to horizon');
      this._curr_retry = 0;
    });

    this.horizon.onDisconnected( () => {
      this._reconnect();
    });
  }

  private _reconnect(): void {
    this._curr_retry++;
    if (this._curr_retry > this.settings.retries) {
      console.log('Retry Limit Reached. Failed to connect to DB.');
      this._failed = true;
    }else {
      setTimeout( () => {
        console.log('Retrying connection. Remaining attempts: ' + (this.settings.retries - this._curr_retry));
        this.horizon.connect();
      }, 50 * Math.pow(2, this._curr_retry));
    }
  }

}

