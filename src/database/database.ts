import * as Horizon from '@horizon/client';
import { DBSettings, IConfig, IEventEmitter, IClient, IStorage, DBDependencies } from '../definitions';


type HorizonAuthType = 'anonymous' | 'token' | 'unauthenticated';

interface HorizonSettings {
  lazyWrites?: boolean;
  authType: HorizonAuthType;
  host: string;
  secure: boolean;
  path: string;
}

export class Database {


  private config: IConfig;
  private client: IClient;
  private emitter: IEventEmitter;
  private storage: IStorage<string>;
  private _curr_retry: number;
  private _hz_settings: HorizonSettings;
  private _retrying: boolean;
  horizon: any;

  constructor(deps: DBDependencies, private settings: DBSettings ) {
    this.config = deps.config;
    this.client = deps.client;
    this.storage = deps.storage;
    this.emitter = deps.emitter;
    let authType: HorizonAuthType = 'anonymous';
    switch (settings.authType) {
      case 'unauthenticated':
        authType = 'unauthenticated';
        break;
      case 'ionic':
        authType = 'token';
        break;
      case 'token':
        authType = 'token';
        break;
    }
    this._hz_settings = {
      lazyWrites: settings.lazyWrites || false,
      authType: authType,
      host: settings.host || 'db.ionic.io', // TODO: This will eventually be api.ionic.io!
      path: settings.path || 'horizon/' + this.config.get('app_id') + '/horizon',
      secure: true
    };

    if (settings.secure !== undefined) {
      this._hz_settings.secure = settings.secure;
    }
    this.settings.retries = settings.retries || 10;
    this._curr_retry = 0;
  }

  connect(): void {
    this.horizon = Horizon(this._hz_settings);
    this._registerListeners();
    if (this.settings.authType === 'ionic') {
      this.client.post('/db/login')
      .end( (err, res) => {
        if (err) {
           throw err;
        }else {
          this.storage.set('horizon-jwt', res.body.data);
          this._retrying = false;
          this.horizon.connect();
        }
      });
    }else {
      this._retrying = false;
      this.horizon.connect();
    }
  }

  private _registerListeners(): void {
    this.horizon.onReady( () => {
      this._curr_retry = 0;
      this.emitter.emit('db:connected', this.horizon);
    });

    this.horizon.onDisconnected( () => {
      if (!this._retrying) {
        this._reconnect();
      }
    });
  }

  private _reconnect(): void {
      this._retrying = true;
      this._curr_retry++;
      let shouldRetry = this._curr_retry <= this.settings.retries;
      let message = '';
      let remain = 0;
      let delay = 0;
      if (!shouldRetry) {
        message = 'Retry Limit Reached. Failed to connect to DB.';
        this.emitter.emit('db:connection-failed',
          {'message': message,
           'retrying': false
          }
        );
      }else {
        remain = this.settings.retries - this._curr_retry;
        message = 'Retrying connection. Remaining attempts: ' + remain;
        delay = 50 * Math.pow(2, this._curr_retry);
        this.emitter.emit('db:disconnected',
          { 'retrying': shouldRetry,
            'message': message,
            'attempts-remaining': remain,
            'delay': delay
          }
        );
        setTimeout( () => {
          this.connect();
        }, delay);
      }
  }

}
