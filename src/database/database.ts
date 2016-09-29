import Horizon from '@horizon/client';
import { Observable } from 'rxjs';
import { DBSettings, IConfig, IEventEmitter, IClient, IStorage, DBDependencies } from '../definitions';


type HorizonAuthType = 'anonymous' | 'token' | 'unauthenticated';

interface HorizonSettings {
  lazyWrites?: boolean;
  authType: HorizonAuthType;
  host: string;
  secure: boolean;
  path: string;
}

interface QueryOperation {
  name: string;
  args: IArguments;
}

class TermBaseWrapper {
  private _hz: any;
  private _hz_reconnector: any;
  private _table: string;
  private _query_map: QueryOperation[];
  private _sub: any;

  constructor(reconnector: any, table: string, hz: any, sub: any) {
    this._hz_reconnector = reconnector;
    this._table = table;
    this._hz = hz;
    this._query_map = [];
    this._hz_reconnector.subscribe( (hz) => { this._hz = hz; });
    this._sub = sub;
  }

  find(): TermBaseWrapper {
    this._query_map.push({name: 'find', args: arguments});
    return this;
  }

  findAll(): TermBaseWrapper {
    this._query_map.push({name: 'findAll', args: arguments});
    return this;
  }

  order(): TermBaseWrapper {
    this._query_map.push({name: 'order', args: arguments});
    return this;
  }

  limit(): TermBaseWrapper {
    this._query_map.push({name: 'limit', args: arguments});
    return this;
  }

  above(): TermBaseWrapper {
    this._query_map.push({name: 'above', args: arguments});
    return this;
  }

  below(): TermBaseWrapper {
    this._query_map.push({name: 'below', args: arguments});
    return this;
  }

  fetch(): Observable<any> {
    let q = this._hz(this._table);
    for (let query in this._query_map) {
      q = q[this._query_map[query].name].apply(q, this._query_map[query].args);
    }
    return q.fetch();
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    const sub = this._hz_reconnector.distinctUntilChanged()
    .switchMap(this._query_builder(this._query_map, this._table, options));
    const obs = Observable.create( subscriber => {
      sub.subscribe( (data) => { subscriber.next(data); });
      this._sub.next(this._hz);
    });
    return obs;
  }

  private _query_builder(query_map: QueryOperation[], table: string, options?: { rawChanges: boolean }): any {
    return (hz) => {
      let q = hz(table);
      for (let query in query_map) {
        q = q[query_map[query].name].apply(q, query_map[query].args);
      }
      return q.watch(options);
    };
  }
}

export class Database {


  private config: IConfig;
  private client: IClient;
  public  emitter: IEventEmitter;
  private storage: IStorage<string>;
  private _hz_settings: HorizonSettings;
  private _raw_queries: any;
  private _queries: any;
  private _hzReconnector: any;
  private _subscriber: any;
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
    this.settings.retries = settings.retries || 500;
    this._raw_queries = {};
    this._queries = {};
  }

  connect(): void {
    if (this.settings.authType === 'ionic') {
      this.client.post('/db/login')
      .end( (err, res) => {
        if (err) {
           throw err;
        }else {
          this.storage.set('horizon-jwt', res.body.data);
          this._finish_connect();
        }
      });
    }else {
      this._finish_connect();
    }
  }

  private _finish_connect(): void {
    this._hzReconnector = Observable.create(subscriber => {
      this._subscriber = subscriber;
      const reconnector = () => {
        this.horizon = Horizon(this._hz_settings);
        this.horizon.onDisconnected(reconnector);
        subscriber.next(this.horizon);
        this.horizon.onReady( () => {
          console.log('woot connected');
        });
        this.horizon.connect();
      };
      reconnector();
    }).share();
    this._hzReconnector.subscribe( () => {
      this.emitter.emit('db:connected', this.horizon);
    });
  }

  table(name: string): any {
    return new TermBaseWrapper(this._hzReconnector, name, this.horizon, this._subscriber);
  }

}
