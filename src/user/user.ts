import {
  IClient,
  IConfig,
  ISingleUserService,
  IStorage,
  IUser,
  IUserContext,
  IUserData,
  SingleUserServiceDependencies,
  SingleUserServiceOptions,
  StoredUser,
  UserContextDependencies,
  UserDependencies,
  UserDetails
} from '../definitions';

import { DeferredPromise } from '../promise';
import { DataType } from './data-types';

/**
 * @private
 */
export class UserContext implements IUserContext {
  private storage: IStorage<StoredUser>;
  private config: IConfig;

  constructor(deps: UserContextDependencies) {
    this.config = deps.config;
    this.storage = deps.storage;
  }

  get label(): string {
    return 'user_' + this.config.get('app_id');
  }

  unstore(): void {
    this.storage.delete(this.label);
  }

  store(user: IUser): void {
    this.storage.set(this.label, user.serializeForStorage());
  }

  load(user: IUser): IUser {
    let data = this.storage.get(this.label);

    if (data) {
      user.id = data.id;
      user.data = new UserData(data.data);
      user.details = data.details || {};
      user.fresh = data.fresh;
      return user;
    }

    return;
  }
}

/**
 * A storage class for a user's custom data.
 */
export class UserData implements IUserData {

  data: Object;

  constructor(data = {}) {
    this.data = {};
    if ((typeof data === 'object')) {
      this.data = data;
      this.deserializerDataTypes();
    }
  }

  deserializerDataTypes() {
    if (this.data) {
      for (var x in this.data) {
        // if we have an object, let's check for custom data types
        if (typeof this.data[x] === 'object') {
          // do we have a custom type?
          if (this.data[x].__Ionic_DataTypeSchema) {
            var name = this.data[x].__Ionic_DataTypeSchema;
            var mapping = DataType.getMapping();
            if (mapping[name]) {
              // we have a custom type and a registered class, give the custom data type
              // from storage
              this.data[x] = mapping[name].fromStorage(this.data[x].value);
            }
          }
        }
      }
    }
  }

  get(key: string, defaultValue: any) {
    if (this.data.hasOwnProperty(key)) {
      return this.data[key];
    } else {
      if (defaultValue === 0 || defaultValue === false) {
        return defaultValue;
      }
      return defaultValue || null;
    }
  }

  set(key: string, value: any) {
    this.data[key] = value;
  }

  unset(key: string) {
    delete this.data[key];
  }
}

/**
 * Represents a user of this app.
 */
export class User implements IUser {

  private service: ISingleUserService;

  public id: string;
  public fresh: boolean; // user has not yet been persisted
  public details: UserDetails = {};
  public data: IUserData;

  private _unset: any;

  constructor(deps: UserDependencies) {
    this.service = deps.service;
    this.fresh = true;
    this._unset = {};
    this.data = new UserData();
  }

  /**
   * Check whether this user is anonymous or not.
   *
   * If the `id` property is set, the user is no longer anonymous.
   */
  isAnonymous(): boolean {
    if (!this.id) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Get a value from this user's custom data.
   *
   * Optionally, a default value can be provided.
   *
   * @param key - The data key to get.
   * @param defaultValue - The value to return if the key is absent.
   */
  get(key: string, defaultValue: any) {
    return this.data.get(key, defaultValue);
  }

  /**
   * Set a value in this user's custom data.
   *
   * @param key - The data key to set.
   * @param value - The value to set.
   */
  set(key: string, value: any) {
    delete this._unset[key];
    return this.data.set(key, value);
  }

  /**
   * Delete a value from this user's custom data.
   *
   * @param key - The data key to delete.
   */
  unset(key: string) {
    this._unset[key] = true;
    return this.data.unset(key);
  }

  /**
   * Revert this user to a fresh, anonymous state.
   */
  clear() {
    this.id = null;
    this.data = new UserData();
    this.details = {};
    this.fresh = true;
  }

  /**
   * Save this user to the API.
   */
  save(): Promise<void> {
    this._unset = {};
    return this.service.save();
  }

  /**
   * Delete this user from the API.
   */
  delete(): Promise<void> {
    return this.service.delete();
  }

  /**
   * Load the user from the API, overwriting the local user's data.
   *
   * @param id - The user ID to load into this user.
   */
  load(id?: string): Promise<void> {
    return this.service.load(id);
  }

  /**
   * Store this user in local storage.
   */
  store() {
    this.service.store();
  }

  /**
   * Remove this user from local storage.
   */
  unstore() {
    this.service.unstore();
  }

  /**
   * @private
   */
  serializeForAPI(): UserDetails {
    return {
      'email': this.details.email,
      'password': this.details.password,
      'username': this.details.username,
      'image': this.details.image,
      'name': this.details.name,
      'custom': this.data.data
    };
  }

  /**
   * @private
   */
  serializeForStorage(): StoredUser {
    return {
      'id': this.id,
      'data': this.data.data,
      'details': this.details,
      'fresh': this.fresh
    };
  }

  toString(): string {
    return `<User [${this.isAnonymous() ? 'anonymous' : this.id}]>`;
  }

}

/**
 * @private
 */
export class SingleUserService implements ISingleUserService {

  private client: IClient;
  private context: IUserContext;
  private user: IUser;

  constructor(deps: SingleUserServiceDependencies, public config: SingleUserServiceOptions = {}) {
    this.client = deps.client;
    this.context = deps.context;
  }

  current(): IUser {
    if (!this.user) {
      this.user = this.context.load(new User({'service': this}));
    }

    if (!this.user) {
      this.user = new User({'service': this});
    }

    return this.user;
  }

  store() {
    this.context.store(this.current());
  }

  unstore() {
    this.context.unstore();
  }

  load(id: string = 'self'): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();
    let user = this.current();

    this.client.get(`/users/${id}`)
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          user.id = res.body.data.uuid;
          user.data = new UserData(res.body.data.custom);
          user.details = res.body.data.details;
          user.fresh = false;

          deferred.resolve();
        }
      });

    return deferred.promise;
  }

  delete(): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (this.user.isAnonymous()) {
      deferred.reject(new Error('User is anonymous and cannot be deleted from the API.'));
    } else {
      this.unstore();
      this.client.delete(`/users/${this.user.id}`)
        .end((err, res) => {
          if (err) {
            deferred.reject(err);
          } else {
            deferred.resolve();
          }
        });
    }

    return deferred.promise;
  }

  save(): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    this.store();

    if (this.user.isAnonymous()) {
      deferred.reject(new Error('User is anonymous and cannot be updated in the API. Use load(<id>) or signup a user using auth.'));
    } else {
      this.client.patch(`/users/${this.user.id}`)
        .send(this.user.serializeForAPI())
        .end((err, res) => {
          if (err) {
            deferred.reject(err);
          } else {
            this.user.fresh = false;
            deferred.resolve();
          }
        });
    }

    return deferred.promise;
  }

}
