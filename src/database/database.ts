import { Collection, DBSettings, DBOptions, IDatabase, TermBase, User }  from '../definitions';
import { IonicDB, IonicDBInstance } from '@ionic/db';
import { Observable, Observer, Subscription } from 'rxjs';
import { IConfig, IEventEmitter, IClient, IStorage, DBDependencies } from '../definitions';

type DBAuthType = 'anonymous' | 'token' | 'unauthenticated';


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
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    let q = this.db_internals.db(this.table);
    for (let query in this.query_map) {
      q = q[this.query_map[query].name].apply(q, this.query_map[query].args);
    }
    return q.fetch().do(() => this.db_internals.$apply());
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    return Observable.create( subscriber => {
      this.db_internals.dbReconnector.distinctUntilChanged()
      .subscribe( (db) => {
        this._query_builder(this.query_map, this.table, db, options)
        .subscribe( (data) => {
          subscriber.next(data);
        }, (err) => { subscriber.error(err); });
      }, (err) => {
        subscriber.error(err);
      }, () => {
        subscriber.complete();
      });
      this.db_internals.subscriber.next(this.db_internals.db);
    }).distinctUntilChanged(this.db_internals.$compare.bind(this.db_internals))
    .do(() => this.db_internals.$apply());
  }

  private _query_builder(query_map: QueryOperation[], table: string, db: any, options?: { rawChanges: boolean }): any {
    let q = db(table);
    for (let query in query_map) {
      q = q[query_map[query].name].apply(q, query_map[query].args);
    }
    return q.watch(options);
  }
}

class UserWrapper implements User {
  db_internals: IDBInternals;

  constructor(internal: IDBInternals) {
    this.db_internals = internal;
  }

  fetch(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    return this.db_internals.db.currentUser().fetch().do(() => this.db_internals.$apply());
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    return Observable.create( subscriber => {
      this.db_internals.dbReconnector.distinctUntilChanged()
      .subscribe( (db) => {
        db.currentUser().watch(options)
        .subscribe( (data) => {
          subscriber.next(data);
        }, (err) => { subscriber.error(err); });
      }, (err) => {
        subscriber.error(err);
      }, () => {
        subscriber.complete();
      });
      this.db_internals.subscriber.next(this.db_internals.db);
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
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.store.apply(table, arguments);
  }

  upsert(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.upsert.apply(table, arguments);
  }

  insert(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.insert.apply(table, arguments);
  }

  replace(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.replace.apply(table, arguments);
  }

  update(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.update.apply(table, arguments);
  }

  remove(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.remove.apply(table, arguments);
  }

  removeAll(): Observable<any> {
    if (!this.db_internals.allowConnect()) {
      return Observable.throw('Must be logged in to connect to db.');
    }
    const table = this.db_internals.db(this.table);
    return table.removeAll.apply(table, arguments);
  }
}

interface IDBInternals {
  config: IConfig;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<any>;
  db_settings: DBOptions;
  dbReconnector: Observable<any>;
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
  db: IonicDBInstance;
  reconnect(): void;
  $timeout?: Function;
  $stringify?: Function;
  wrap_with($timeout: Function, $stringify: Function): void;
  $apply(): void;
  $compare(oldVal: any, newVal: any): boolean;
  allowConnect(): boolean;
  disconnect(): void;
}

class DBInternals implements IDBInternals {

  config: IConfig;
  client: IClient;
  emitter: IEventEmitter;
  storage: IStorage<any>;
  db_settings: DBOptions;
  dbReconnector: Observable<any>;
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
  db: IonicDBInstance;
  $timeout?: Function;
  $stringify?: Function;

  constructor(deps: DBDependencies, db_options: DBOptions) {
    this.config = deps.config;
    this.client = deps.client;
    this.storage = deps.storage;
    this.emitter = deps.emitter;
    this.db_settings = db_options;
    this.autoreconnect = true;

    this._new_connection();

    this.dbReconnector = Observable.create(subscriber => {
      this.subscriber = subscriber;
      this.subscriber.next(this.db);
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

    this.emitter.on('auth:token-changed', (token) => {
      IonicDB.clearAuthTokens();
      if (!token || !token['new']) {
        // Ionic logout
        this.storage.delete('ionicdb-jwt');
        if (this.db_settings.authType === 'token') {
          this.disconnect();
        }
      } else if (this.db_settings.authType === 'token') {
        // Ionic login
        let path: string = this.db_settings.path || 'ionicdb';
        let credential = {};
        credential[path] = token['new'];
        this.storage.set('ionicdb-jwt', credential);
      }
    });

  }

  allowConnect(): boolean {
    if (this.db_settings.authType === 'unauthenticated' || !!this.storage.get('ionicdb-jwt')) {
        this.autoreconnect = true;
        return true;
    }
    return false;
  }

  disconnect(): void {
    IonicDB.clearAuthTokens();
    this.autoreconnect = false;
    this.db.disconnect();
  }

  private _new_connection(): void {
    this.db = IonicDB(this.db_settings);

    this.db.onDisconnected().subscribe(this._reconnector.bind(this));

    this.db.onReady().subscribe( (...args) => {
      if (this.ready_sub) {
        this.ready_sub.next.apply(this.ready_sub, args);
      }
    });

    this.db.onSocketError().subscribe( (...args) => {
      if (this.error_sub) {
        this.error_sub.next.apply(this.error_sub, args);
      }
    });

    this.db.status().subscribe( (...args) => {
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

  reconnect(): void {
    this._new_connection();
    this.subscriber.next(this.db);
    this.db.connect();
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

export class Database implements IDatabase {

  private _internals: IDBInternals;

  constructor(private deps: DBDependencies, private settings: DBSettings ) {
    this.settings = settings;
    let authType: DBAuthType = 'unauthenticated';
    if (settings.authType === 'authenticated') {
      authType = 'token';
    }
    const options = {
      lazyWrites: settings.lazyWrites || false,
      authType: authType,
      host: settings.host || 'db.ionic.io',
      path: settings.path || 'ionicdb/' + deps.config.get('app_id') + '/horizon',
      secure: (settings.secure === undefined) ? true : settings.secure,
      keepalive: settings.keepalive || 50, // Load balancer kills at 60
    };
    this._internals = new DBInternals(deps, options);

  }

  collection(name: string): Collection {
    return new CollectionWrapper(name, this._internals);
  }

  connect(): void {
    if (!this._internals.allowConnect()) {
      console.error('Must be logged in to connect to db.');
      return;
    }
    this._internals.db.connect();
  }

  disconnect(): void {
    this._internals.disconnect();
  }

  currentUser(): User {
    return new UserWrapper(this._internals);
  }

  hasAuthToken(): boolean {
    return this._internals.db.hasAuthToken();
  }

  aggregate(aggs: any): TermBase {
    return this._internals.db.aggregate(aggs);
  }

  model(fn: Function): Function {
    return this._internals.db.model(fn);
  }

  status(sub?: Function): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.status).apply(this, arguments);
  }

  onReady(sub?: Function): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.onReady).apply(this, arguments);
  }

  onDisconnected(sub?: Function): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.onDisconnect).apply(this, arguments);
  }

  onSocketError(sub?: Function): Observable<any> | Subscription {
    return this._subOrObserve(this._internals.onSocketError).apply(this, arguments);
  }

  _wrap_with($timeout: Function, $stringify: Function): void {
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
