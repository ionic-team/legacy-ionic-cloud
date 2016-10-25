import { Collection, HorizonOptions, HorizonInstance, TermBase, User }  from '../definitions';
import Horizon from '@horizon/client';
import { Observable, Observer, Subscription } from 'rxjs';
import { DBSettings, IConfig, IEventEmitter, IClient, IStorage, DBDependencies } from '../definitions';


type HorizonAuthType = 'anonymous' | 'token' | 'unauthenticated';


interface QueryOperation {
  name: string;
  args: IArguments;
}

class TermBaseWrapper implements TermBase {
  table: string;
  db_internals: IDBInternals;
  query_map: QueryOperation[];

  constructor(table: string, internal: IDBInternals, query?: QueryOperation[]) {
    this.db_internals = internal;
    this.table = table;
    this.query_map = query || [];
  }

  find(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'find', args: arguments});
    return new TermBaseWrapper(this.table, this.db_internals, new_map);
  }

  findAll(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'findAll', args: arguments});
    return new TermBaseWrapper(this.table, this.db_internals, new_map);
  }

  order(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'order', args: arguments});
    return new TermBaseWrapper(this.table, this.db_internals, new_map);
  }

  limit(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'limit', args: arguments});
    return new TermBaseWrapper(this.table, this.db_internals, new_map);
  }

  above(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'above', args: arguments});
    return new TermBaseWrapper(this.table, this.db_internals, new_map);
  }

  below(): TermBaseWrapper {
    let new_map = this.query_map.slice();
    new_map.push({name: 'below', args: arguments});
    return new TermBaseWrapper(this.table, this.db_internals, new_map);
  }

  fetch(): Observable<any> {
    this.db_internals.login();
    let q = this.db_internals.hz(this.table);
    for (let query in this.query_map) {
      q = q[this.query_map[query].name].apply(q, this.query_map[query].args);
    }
    return q.fetch().do(() => this.db_internals.$apply());
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    this.db_internals.login();
    return Observable.create( subscriber => {
      this.db_internals.hzReconnector.distinctUntilChanged()
      .switchMap(this._query_builder(this.query_map, this.table, options))
      .subscribe( (data) => { subscriber.next(data); },
                  (data) => { subscriber.error(data); },
                  () => { subscriber.complete(); });
      this.db_internals.subscriber.next(this.db_internals.hz);
    }).distinctUntilChanged(this.db_internals.$compare.bind(this.db_internals))
    .do(() => this.db_internals.$apply());
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

class UserWrapper implements User {
  db_internals: IDBInternals;

  constructor(internal: IDBInternals) {
    this.db_internals = internal;
  }

  fetch(): Observable<any> {
    this.db_internals.login();
    return this.db_internals.hz.currentUser().fetch().do(() => this.db_internals.$apply());
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    this.db_internals.login();
    return Observable.create( subscriber => {
      this.db_internals.hzReconnector.distinctUntilChanged()
      .switchMap( (hz) => { return hz.currentUser().watch(options); })
      .distinctUntilChanged()
      .subscribe( (data) => { subscriber.next(data); },
                  (data) => { subscriber.error(data); },
                  () => { subscriber.complete(); });
      this.db_internals.subscriber.next(this.db_internals.hz);
    }).distinctUntilChanged(this.db_internals.$compare.bind(this.db_internals))
    .do(() => this.db_internals.$apply());
  }
}

class CollectionWrapper extends TermBaseWrapper {
  table: string;

  constructor(table: string, internal: IDBInternals) {
    super(table, internal);
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
  storage: IStorage<any>;
  hz_settings: HorizonOptions;
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
  autoreconnect: boolean;
  hz: HorizonInstance;
  reconnect(): void;
  set_auth(enable: boolean): void;
  $timeout?: Function;
  $stringify?: Function;
  wrap_with($timeout: Function, $stringify: Function): void;
  $apply(): void;
  $compare(oldVal: any, newVal: any): boolean;
  login(): void;
}

class DBInternals implements IDBInternals {

  config: IConfig;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<any>;
  hz_settings: HorizonOptions;
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
  autoreconnect: boolean;
  hz: HorizonInstance;
  $timeout?: Function;
  $stringify?: Function;

  constructor(deps: DBDependencies, hz_options: HorizonOptions) {
    this.config = deps.config;
    this.client = deps.client;
    this.storage = deps.storage;
    this.emitter = deps.emitter;
    this.hz_settings = hz_options;
    this.autoreconnect = true;

    this._new_horizon();

    this.hzReconnector = Observable.create(subscriber => {
      this.subscriber = subscriber;
      this.subscriber.next(this.hz);
    }).share();

    // this.hzReconnector.subscribe( () => {});

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

  set_auth(enable: boolean): void {
    Horizon.clearAuthTokens();
    if (enable) {
      this.hz_settings.authType = 'token';
    } else {
      this.hz_settings.authType = 'unauthenticated';
    }
    this._new_horizon();
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
    if (this.autoreconnect) {
      this.reconnect();
    }
  }

  login(): void {
    if (this.hz_settings.authType === 'token') {
      let token = this.storage.get('ionic_auth_' + this.config.get('app_id'));
      if (!token) {
        throw new Error('No token for user found. Must login or turn authentication off');
      }
      let path: string = this.hz_settings.path || 'horizon';
      let credential = {};
      credential[path] = token;
      this.storage.set('horizon-jwt', credential);
    }
  }

  reconnect(): void {
    if (!this.autoreconnect) {
      this.autoreconnect = true;
    }
    this._new_horizon();
    this.subscriber.next(this.hz);
    this.hz.connect();
  }

  wrap_with($timeout: Function, $stringify: Function): void {
    this.$timeout = $timeout;
    this.$stringify = $stringify;
  }

  $apply(): void {
    if (this.$timeout) {
      this.$timeout( () => { return; }, 0);
    }
  }

  $compare(oldVal, newVal): boolean {
    if (this.$stringify) {
      return this.$stringify(oldVal) === this.$stringify(newVal);
    } else {
      return JSON.stringify(oldVal) === JSON.stringify(newVal);
    }
  }


}

class Database {

  private _internals: IDBInternals;

  constructor(deps: DBDependencies, private settings: DBSettings ) {
    this.settings = settings;
    let authType: HorizonAuthType = 'unauthenticated';
    if (settings.authType === 'authenticated') {
      authType = 'token';
    }
    const options = {
      lazyWrites: settings.lazyWrites || false,
      authType: authType,
      host: settings.host || 'db.ionic.io',
      path: settings.path || 'horizon/' + deps.config.get('app_id') + '/horizon',
      secure: (settings.secure === undefined) ? true : settings.secure,
      keepalive: settings.keepalive || 50 // Load balancer kills at 60
    };
    this._internals = new DBInternals(deps, options);

  }

  useAuthentication(enable: boolean): void {
    this._internals.set_auth(enable);
  }

  table(name: string): Collection {
    return new CollectionWrapper(name, this._internals);
  }

  connect(): void {
    this._internals.login();
    this._internals.hz.connect();
  }

  disconnect(): void {
    Horizon.clearAuthTokens();
    this._internals.autoreconnect = false;
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
    }).do(() => this._internals.$apply());
  }

  aggregate(aggs: any): TermBase {
    return this._internals.hz.aggregate(aggs);
  }

  model(fn: Function): Function {
    return this._internals.hz.model(fn);
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

  wrap_with($timeout: Function, $stringify: Function): void {
    this._internals.wrap_with($timeout, $stringify);
  }


  private _subOrObserve(observable: Observable<any>): Function {
    return function(next?: (value: any) => void, error?: (error: any) => void, complete?: () => void): Observable<any> | Subscription {
      if (arguments.length > 0) {
        return observable.do(() => this._internals.$apply()).subscribe(next, error, complete);
      } else {
        return observable.do(() => this._internals.$apply());
      }
    };
  }
}

export class IonicDB {
  public hz: HorizonInstance;
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
    hz.useAuthentication = this._db.useAuthentication.bind(this._db);
    this.hz = hz;
  }


  _wrap_with($timeout: Function, $stringify: Function): void {
    this._db.wrap_with($timeout, $stringify);
  }
}
