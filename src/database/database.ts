import * as Horizon from '@horizon/client';
import { DBSettings, IConfig, IEventEmitter, IClient, IStorage, DBDependencies, IDatabase } from '../definitions';
import { DeferredPromise } from '../promise';


type HorizonAuthType = "anonymous" | "token" | "unauthenticated";

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
  horizon: any;

  constructor(deps: DBDependencies, private settings: DBSettings ) {
    this.config = deps.config;
    this.client = deps.client;
    this.storage = deps.storage;
    this.emitter = deps.emitter;
    let authType:HorizonAuthType = 'token';
    switch(settings.authType){
      case 'anonymous':
        authType = 'anonymous';
        break;
      case 'unauthenticated':
        authType = 'unauthenticated';
    }
    this._hz_settings = {
      lazyWrites: settings.lazyWrites || false,
      authType: authType,
      host: settings.host || 'db.ionic.io', //TODO: This will eventually be api.ionic.io!
      path: 'horizon/' + this.config.get('app_id') + '/horizon',
      secure: true
    }; 

    if (settings.secure !== undefined) {
      this._hz_settings.secure = settings.secure;
    }
    this.settings.retries = settings.retries || 10;
    this._curr_retry = 0;
  }

  connect(): IDatabase {
    this.horizon = Horizon(this._hz_settings);
    this._registerListeners();
    if(this.settings.authType === 'ionic'){
      this.client.post('/db/login')
      .end( (err, res) => {
        if(err){
           throw err; 
        }else{
          console.log(res);
          this.storage.set('horizon-jwt', res.body.data);
          this.horizon.connect();
        }
      });
    }else{
      this.horizon.connect();
    }
    return;
  }

  private _registerListeners(): void {
    this.horizon.onReady( () => {
      console.log('connected to horizon');
      this._curr_retry = 0;
      this.emitter.emit('db:connected', this.horizon);
    });

    this.horizon.onDisconnected( () => {
      this._reconnect();
    });
  }

  private _reconnect(): void {
      this._curr_retry++;
      let shouldRetry = this._curr_retry <= this.settings.retries;
      let message = '';
      let remain = 0;
      let delay = 0;
      if(!shouldRetry){
        message = 'Retry Limit Reached. Failed to connect to DB.';
        this.emitter.emit('db:connection-failed', this.horizon);
      }else{
        remain = this.settings.retries - this._curr_retry;
        message = 'Retrying connection. Remaining attempts: ' + remain;
        delay = 1000;// * Math.pow(2, this._curr_retry);
        this.emitter.emit('db:disconnected',
          { retrying: shouldRetry,
            message: message,
            'attempts-remaining': remain,
            delay: delay
          }
        );
        setTimeout( () => {
          this.connect();
        }, delay);
      }
  }

}

