import { Collection, DBSettings, DBOptions, IDatabase, TermBase, User }  from '../definitions';
import { IonicDB, IonicDBInstance } from '@ionic/db';
import { BehaviorSubject, Observable } from 'rxjs';
import { IConfig, IEventEmitter, IStorage, DBDependencies } from '../definitions';

type DBAuthType = 'token' | 'unauthenticated';


interface ConnStatus {
  type: 'unconnected' | 'connected' | 'disconnected';
}

const UNCONNECTED: ConnStatus = {type: 'unconnected'};
const DISCONNECTED: ConnStatus = {type: 'disconnected'};
const CONNECTED: ConnStatus = {type: 'connected'};

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

  find(id: string | {id: string}): TermBaseWrapper {
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
    return this.db_internals.whenReady( () => {
      let q = this.db_internals.db(this.table);
      for (let query in this.query_map) {
        q = q[this.query_map[query].name].apply(q, this.query_map[query].args);
      }
      return q.fetch().do(() => this.db_internals.$apply());
    });
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    return this.db_internals.whenReady( () => {
      return Observable.create( subscriber => {
        let refSub = this.db_internals.currentDbRef.subscribe( (db) => {
          this._query_builder(this.query_map, this.table, db, options)
          .subscribe( (data) => {
            subscriber.next(data);
          }, (err) => {
            if (this.db_internals.connStatus === CONNECTED) {
              subscriber.error(err);
            }
          });
        });

        // trigger cleanup in case of manual disconnect/logout
        this.db_internals.disconnectCalled.subscribe( () => {
          refSub.unsubscribe();
          subscriber.complete();
        });

      }).distinctUntilChanged(this.db_internals.$compare.bind(this.db_internals))
      .do(() => this.db_internals.$apply());
    });
  }

  private _query_builder(query_map: QueryOperation[], table: string, db: any, options?: { rawChanges: boolean }): Observable<any> {
    let q = db(table);
    for (let query in query_map) {
      q = q[query_map[query].name].apply(q, query_map[query].args);
    }
    return q.watch(options);
  }
}

class UserWrapper implements User {
  db_internals: IDBInternals;
  user_table: CollectionWrapper;


  constructor(internal: IDBInternals) {
    this.db_internals = internal;
    this.user_table =  new CollectionWrapper('users', this.db_internals);
  }

  fetch(): Observable<any> {
    let user = this.db_internals.storage.get('ionic_user_' + this.db_internals.config.get('app_id'));
    if (this.db_internals.db_settings.authType === 'unauthenticated' || !user || !user.id) {
      return Observable.throw('Unauthenticated users do not have a user object.');
    }else {
      return this.user_table.find(user.id).fetch();
    }
  }

  watch(options?: { rawChanges: boolean }): Observable<any> {
    let user = this.db_internals.storage.get('ionic_user_' + this.db_internals.config.get('app_id'));
    if (this.db_internals.db_settings.authType === 'unauthenticated' || !user || !user.id) {
      return Observable.throw('Unauthenticated users do not have a user object.');
    } else {
      return this.user_table.find(user.id).watch();
    }
  }
}

class CollectionWrapper extends TermBaseWrapper {
  table: string;

  constructor(table: string, internal: IDBInternals) {
    super(table, internal);
  }

  make_call(op: string, args: IArguments): Observable<any> {
    return this.db_internals.whenReady( () => {
      const table = this.db_internals.db(this.table);
      return table[op].apply(table, args);
    });
  }

  store(): Observable<any> {
    return this.make_call('store', arguments);
  }

  upsert(): Observable<any> {
    return this.make_call('upsert', arguments);
  }

  insert(): Observable<any> {
    return this.make_call('insert', arguments);
  }

  replace(): Observable<any> {
    return this.make_call('replace', arguments);
  }

  update(): Observable<any> {
    return this.make_call('update', arguments);
  }

  remove(): Observable<any> {
    return this.make_call('remove', arguments);
  }

  removeAll(): Observable<any> {
    return this.make_call('removeAll', arguments);
  }
}

interface IDBInternals {
  config: IConfig;
  emitter: IEventEmitter;
  storage: IStorage<any>;
  db_settings: DBOptions;
  currentDbRef: BehaviorSubject<any>;
  status: BehaviorSubject<ConnStatus>;
  disconnectCalled: Observable<ConnStatus>;
  connStatus: ConnStatus;
  db: IonicDBInstance;
  $timeout?: Function;
  $stringify?: Function;
  wrap_with($timeout: Function, $stringify: Function): void;
  $apply(): void;
  $compare(oldVal: any, newVal: any): boolean;
  disconnect(): void;
  connect(): void;
  whenReady(sub: (value: any) => Observable<any>): Observable<any>;
}

class DBInternals implements IDBInternals {

  config: IConfig;
  emitter: IEventEmitter;
  storage: IStorage<any>;
  db_settings: DBOptions;
  currentDbRef: BehaviorSubject<any>;
  status: BehaviorSubject<ConnStatus>;
  disconnectCalled: Observable<ConnStatus>;
  connStatus: ConnStatus;
  db: IonicDBInstance;
  $timeout?: Function;
  $stringify?: Function;
  private backoff: number;

  constructor(deps: DBDependencies, db_options: DBOptions) {
    this.config = deps.config;
    this.storage = deps.storage;
    this.emitter = deps.emitter;
    this.db_settings = db_options;
    this.backoff = 0;

    this._new_connection();

    this.currentDbRef = new BehaviorSubject(this.db);

    this.status = new BehaviorSubject(UNCONNECTED);

    this.status.subscribe( (state) => {
      this.connStatus = state;
    });

    this.disconnectCalled = this.status.first( state => state === UNCONNECTED);

    this.emitter.on('auth:token-changed', (token) => {
      IonicDB.clearAuthTokens();
      if (!token || !token['new']) {
        // Ionic logout event
        if (this.db_settings.authType === 'token') {
          this.disconnect();
        }
      }
    });

  }

  whenReady(sub: (value: any) => Observable<any>): Observable<any> {
    return this.status.first( state => state !== DISCONNECTED)
    .switchMap( (state) => {
      if (state === UNCONNECTED) {
        return Observable.throw(new Error('Connect must be called before attempting to use the db.'));
      } else {
        return sub(state);
      }
    });
  }

  connect(): void {
    if (this.db_settings.authType === 'unauthenticated') {
        IonicDB.clearAuthTokens();
        this.status.next(DISCONNECTED);
        this.storage.set('ionicdb-jwt', {});
        this.backoff = 0;
        return this._reconnector();
    } else {
        // Ionic login
        let token = this.storage.get('ionic_auth_' + this.config.get('app_id'));
        if (!token) {
          console.error('Must be logged in to connect to db.');
          return;
        }
        this.status.next(DISCONNECTED);
        let path: string = this.db_settings.path || 'ionicdb';
        let credential = {};
        credential[path] = token;
        this.storage.set('ionicdb-jwt', credential);
        this.backoff = 0;
        return this._reconnector();
    }
  }

  disconnect(): void {
    IonicDB.clearAuthTokens();
    this.status.next(UNCONNECTED);
    this.db.disconnect();
  }

  private _new_connection(): void {
    this.db = IonicDB(this.db_settings);

    this.db.onDisconnected().subscribe( () => {
      if (this.backoff < 10000) {
        this.backoff += 300;
      }
      this._reconnector();
    });

    this.db.onReady().subscribe( () => {
      this.currentDbRef.next(this.db);
      this.status.next(CONNECTED);
    });

  }

  private _reconnector(): void {
    if (this.connStatus !== UNCONNECTED) {
      if (this.connStatus === DISCONNECTED) {
      }
      this.status.next(DISCONNECTED);
      this._new_connection();
      setTimeout( () => {
      this.db.connect();
      }, this.backoff);
    }
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
    this._internals.connect();
  }

  disconnect(): void {
    this._internals.disconnect();
  }

  currentUser(): User {
    return new UserWrapper(this._internals);
  }

  aggregate(aggs: any): TermBase {
    return this._internals.db.aggregate(aggs);
  }

  model(fn: Function): Function {
    return this._internals.db.model(fn);
  }


  status(): Observable<any> {
    return this._internals.status.do(() => this._internals.$apply());
  }

  _wrap_with($timeout: Function, $stringify: Function): void {
    this._internals.wrap_with($timeout, $stringify);
  }
}
