declare module '@ionic/db' {
  import { Observable } from 'rxjs';

  interface Feed {
      watch (options?: { rawChanges: boolean }): Observable<any>;
      fetch (): Observable<any>;
  }

  type Bound = 'open' | 'closed';
  type Primitive = boolean | number | string | Date;
  type IdValue = Primitive | Primitive[] | Object;
  type WriteOp = Object | Object[];

  interface TermBase extends Feed {
      find (value: IdValue): TermBase;
      findAll (...values: IdValue[]): TermBase;

      order (...fields: string[]): TermBase;
      limit (size: Number): TermBase;
      above (spec: any, bound?: Bound): TermBase;
      below (spec: any, bound?: Bound): TermBase;
  }

  interface Collection extends TermBase {
      store (docs: WriteOp): Observable<any>;
      upsert (docs: WriteOp): Observable<any>;
      insert (docs: WriteOp): Observable<any>;
      replace (docs: WriteOp): Observable<any>;
      update (docs: WriteOp): Observable<any>;

      remove (docs: IdValue): Observable<any>;
      removeAll (docs: IdValue[]): Observable<any>;
  }

  interface User extends Feed {}

  export interface IonicDBInstance {
      (name: string): Collection;

      currentUser (): User;

      hasAuthToken (): boolean;
      authEndpoint (name: string): Observable<string>;

      aggregate (aggs: any): TermBase;
      model (fn: Function): Function;

      disconnect (): void;
      connect (): any;

      status (): Observable<any>;
      onReady (): Observable<any>;
      onDisconnected (): Observable<any>;
      onSocketError (): Observable<any>;

      useAuthentication (enable: boolean): void;
      _wrap_with($timeout: Function, $stringify: Function): void;
  }

  interface IonicDBOptions {
      host?: string;
      path?: string;
      secure?: boolean;

      authType?: string;
      lazyWrites?: boolean;
      keepalive?: number;

      WebSocketCtor?: any;
  }

  interface IonicDBCtor {
      (options: IonicDBOptions): IonicDBInstance;

      clearAuthTokens (): void;
  }

  export const IonicDB: IonicDBCtor;
}
