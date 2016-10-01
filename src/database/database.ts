import { Collection, HorizonOptions, HorizonInstance, TermBase, User }  from '../definitions';
import Horizon from '@horizon/client';
import { Observable, Observer, Subscription } from 'rxjs';
import { DBSettings, IConfig, IEventEmitter, IClient, IStorage, DBDependencies } from '../definitions';


type HorizonAuthType = 'anonymous' | 'token' | 'unauthenticated';


interface QueryOperation {
  name: string;
  args: IArguments;
}

interface TermType {
  table?: string;
  fnc: string;
  args?: IArguments;
}

class TermBaseWrapper implements TermBase {
  term: TermType;
  db_internals: IDBInternals;
  query_map: QueryOperation[];

  constructor(term: TermType, internal: IDBInternals, query?: QueryOperation[]) {
    this.db_internals = internal;
    this.term = term;
    this.query_map = query || [];
  }

  find(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'find', args: arguments});
    return new TermBaseWrapper(this.term, this.db_internals, new_map);
  }

  findAll(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'findAll', args: arguments});
    return new TermBaseWrapper(this.term, this.db_internals, new_map);
  }

  order(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'order', args: arguments});
    return new TermBaseWrapper(this.term, this.db_internals, new_map);
  }

  limit(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'limit', args: arguments});
    return new TermBaseWrapper(this.term, this.db_internals, new_map);
  }

  above(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'above', args: arguments});
    return new TermBaseWrapper(this.term, this.db_internals, new_map);
  }

  below(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'below', args: arguments});
    return new TermBaseWrapper(this.term, this.db_internals, new_map);
  }

  fetch(): Observable<any> {
    let q: any;
    if (this.term.table) {
      q = this.db_internals.hz(this.term.table);
    } else {
      q = this.db_internals.hz[this.term.fnc].apply(this.term.args);
    }
    for (let query in this.query_map) {
      q = q[this.query_map[query].name].apply(q, this.query_map[query].args);
    }
    return q.fetch();
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    return Observable.create( subscriber => {
      this.db_internals.hzReconnector.distinctUntilChanged()
      .switchMap(this._query_builder(this.query_map, this.term, options))
      .subscribe( (data) => { subscriber.next(data); });
      this.db_internals.subscriber.next(this.db_internals.hz);
    });
  }

  private _query_builder(query_map: QueryOperation[], term: TermType, options?: { rawChanges: boolean }): any {
    return (hz) => {
      let q: any;
      if (term.table) {
        q = hz(term.table);
      } else {
        q = hz[term.fnc].apply(term.args);
      }
      for (let query in query_map) {
        q = q[query_map[query].name].apply(q, query_map[query].args);
      }
      return q.watch(options);
    };
  }
}

class UserWrapper implements User {
  db_internals: IDBInternals;

  constructor(internal: IDBInternals) {
    this.db_internals = internal;
  }

  fetch(): Observable<any> {
    return this.db_internals.hz.currentUser().fetch();
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    return Observable.create( subscriber => {
      this.db_internals.hzReconnector.distinctUntilChanged()
      .switchMap( (hz) => { return hz.currentUser().watch(options); })
      .subscribe( (data) => { subscriber.next(data); });
      this.db_internals.subscriber.next(this.db_internals.hz);
    });
  }
}

class CollectionWrapper extends TermBaseWrapper {
  table: string;

  constructor(table: string, internal: IDBInternals) {
    const term: TermType = {table: table, fnc: 'none'};
    super(term, internal);
    this.table = table;
  }

  store(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.store.apply(table, arguments);
  }

  upsert(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.upsert.apply(table, arguments);
  }

  insert(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.insert.apply(table, arguments);
  }

  replace(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.replace.apply(table, arguments);
  }

  update(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.update.apply(table, arguments);
  }

  remove(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.remove.apply(table, arguments);
  }

  removeAll(): Observable<any> {
    const table = this.db_internals.hz(this.table);
    return table.removeAll.apply(table, arguments);
  }
}

interface IDBInternals {
  config: IConfig;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<string>;
  hz_settings: HorizonOptions;
  connect_called: boolean;
  hzReconnector: Observable<any>;
  onDisconnect: Observable<any>;
  onReady: Observable<any>;
  onSocketError: Observable<any>;
  status: Observable<any>;
  subscriber: Observer<any>;
  disconnect_sub?: Observer<any>;
  ready_sub?: Observer<any>;
  error_sub?: Observer<any>;
  status_sub?: Observer<any>;
  hz: HorizonInstance;
}

class DBInternals implements IDBInternals {

  config: IConfig;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<string>;
  hz_settings: HorizonOptions;
  connect_called: boolean;
  hzReconnector: Observable<any>;
  onDisconnect: Observable<any>;
  onReady: Observable<any>;
  onSocketError: Observable<any>;
  status: Observable<any>;
  subscriber: Observer<any>;
  disconnect_sub?: Observer<any>;
  ready_sub?: Observer<any>;
  error_sub?: Observer<any>;
  status_sub?: Observer<any>;
  hz: HorizonInstance;

  constructor(deps: DBDependencies, hz_options: HorizonOptions) {
    this.config = deps.config;
    this.client = deps.client;
    this.storage = deps.storage;
    this.emitter = deps.emitter;
    this.hz_settings = hz_options;
    this.connect_called = false;

    this._new_horizon();

    this.hzReconnector = Observable.create(subscriber => {
      this.subscriber = subscriber;
      this.subscriber.next(this.hz);
    }).share();

    this.onDisconnect = Observable.create(subscriber => {
      this.disconnect_sub = subscriber;
    }).share();

    this.onReady = Observable.create(subscriber => {
      this.ready_sub = subscriber;
    }).share();

    this.onSocketError = Observable.create(subscriber => {
      this.error_sub = subscriber;
    }).share();

    this.status = Observable.create(subscriber => {
      this.status_sub = subscriber;
    }).share();

  }

  private _new_horizon(): void {
    this.hz = Horizon(this.hz_settings);

    this.hz.onDisconnected().subscribe(this._reconnector.bind(this));

    this.hz.onReady().subscribe( (...args) => {
      if (this.ready_sub) {
        this.ready_sub.next.apply(this.ready_sub, args);
      }
    });

    this.hz.onSocketError().subscribe( (...args) => {
      if (this.error_sub) {
        this.error_sub.next.apply(this.error_sub, args);
      }
    });

    this.hz.status().subscribe( (...args) => {
      if (this.status_sub) {
        this.status_sub.next.apply(this.status_sub, args);
      }
    });
  }

  private _reconnector(): void {
    if (this.disconnect_sub) {
      this.disconnect_sub.next.apply(this.disconnect_sub, arguments);
    }
    this._new_horizon();
    this.subscriber.next(this.hz);
    this.hz.connect();
  }

}

class Database {

  private _internals: IDBInternals;

  constructor(deps: DBDependencies, private settings: DBSettings ) {
    this.settings = settings;
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
    const options = {
      lazyWrites: settings.lazyWrites || false,
      authType: authType,
      host: settings.host || 'db.ionic.io',
      path: settings.path || 'horizon/' + deps.config.get('app_id') + '/horizon',
      secure: settings.secure,
      keepalive: settings.keepalive || 50 // Load balancer kills at 60
    };
    this._internals = new DBInternals(deps, options);

  }

  table(name: string): Collection {
    return new CollectionWrapper(name, this._internals);
  }

  connect(): void {
    if (this.settings.authType === 'ionic') {
      this._internals.client.post('/db/login')
      .end( (err, res) => {
        if (err) {
           throw err;
        }else {
          this._internals.storage.set('horizon-jwt', res.body.data);
          this._internals.hz.connect();
        }
      });
    }else {
      this._internals.hz.connect();
    }
  }

  disconnect(): void {
    if (this.settings.authType === 'ionic') {
      Horizon.clearAuthTokens();
    }
    this._internals.hz.disconnect();
  }

  currentUser(): User {
    return new UserWrapper(this._internals);
  }

  hasAuthToken(): boolean {
    return this._internals.hz.hasAuthToken();
  }

  authEndpoint(name: string): Observable<string> {
    return Observable.create( subscriber => {
      this._internals.hzReconnector.distinctUntilChanged()
      .switchMap( (hz) => { return hz.authEndpoint(name); })
      .subscribe( (data) => { subscriber.next(data); });
      this._internals.subscriber.next(this._internals.hz);
    });
  }

  aggregate(aggs: any): TermBase {
    return new TermBaseWrapper({fnc: 'aggregate', args: arguments}, this._internals);
  }

  model(fn: Function): TermBase {
    return new TermBaseWrapper({fnc: 'model', args: arguments}, this._internals);
  }

  status(): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.status).apply(this, arguments);
  }

  onReady(): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.onReady).apply(this, arguments);
  }

  onDisconnected(): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.onDisconnect).apply(this, arguments);
  }

  onSocketError(): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.onSocketError).apply(this, arguments);
  }

  private _subOrObserve(observable: Observable<any>): Function {
    return function(next?: (value: any) => void, error?: (error: any) => void, complete?: () => void): Observable<any> | Subscription {
      if (arguments.length > 0) {
        return observable.subscribe(next, error, complete);
      } else {
        return observable;
      }
    };
  }
}

export class IonicDB {
  public horizon: HorizonInstance;
  private _db: Database;

  constructor(private deps: DBDependencies, private settings: DBSettings) {
    this._db = new Database(deps, settings);
    const hz: any = this._db.table.bind(this._db);
    hz.connect = this._db.connect.bind(this._db);
    hz.currentUser = this._db.currentUser.bind(this._db);
    hz.hasAuthToken = this._db.hasAuthToken.bind(this._db);
    hz.authEndpoint = this._db.authEndpoint.bind(this._db);
    hz.aggregate = this._db.aggregate.bind(this._db);
    hz.model = this._db.model.bind(this._db);
    hz.disconnect = this._db.disconnect.bind(this._db);
    hz.status = this._db.status.bind(this._db);
    hz.onReady = this._db.onReady.bind(this._db);
    hz.onDisconnected = this._db.onDisconnected.bind(this._db);
    hz.onSocketError = this._db.onSocketError.bind(this._db);
    this.horizon = hz;
  }
}
