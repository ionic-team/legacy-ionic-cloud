import { IConfig, IClient, IStorage, IUserData, UserDetails, StoredUser, IUser, ISingleUserService } from '../definitions';
import { DeferredPromise } from '../promise';
import { DataType } from './data-types';

declare var Ionic: any;

export class UserContext {
  constructor(public storage: IStorage, public config: IConfig) {}

  get label() {
    return 'ionic_io_user_' + this.config.get('app_id');
  }

  unstore() {
    this.storage.delete(this.label);
  }

  store(user: IUser) {
    this.storage.set(this.label, user.serializeForStorage());
  }

  load(user: IUser): IUser {
    let data = this.storage.get(this.label);

    if (data) {
      user.id = data.id;
      user.data = new UserData(data.data.data);
      user.details = data.details || {};
      user.fresh = data.fresh;
      return user;
    }

    return;
  }
}

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

export class User implements IUser {

  public id: string;
  public fresh: boolean; // user has not yet been persisted
  public details: UserDetails;
  public data: IUserData;

  private _unset: any;

  constructor(public service: ISingleUserService) {
    this.fresh = true;
    this._unset = {};
    this.data = new UserData();
  }

  isAnonymous(): boolean {
    if (!this.id) {
      return true;
    } else {
      return false;
    }
  }

  get(key: string, defaultValue: any) {
    return this.data.get(key, defaultValue);
  }

  set(key: string, value: any) {
    delete this._unset[key];
    return this.data.set(key, value);
  }

  unset(key: string) {
    this._unset[key] = true;
    return this.data.unset(key);
  }

  clear() {
    this.id = null;
    this.data = new UserData();
    this.details = {};
    this.fresh = true;
  }

  save(): Promise<void> {
    this._unset = {};
    return this.service.save();
  }

  delete(): Promise<void> {
    return this.service.delete();
  }

  store() {
    this.service.store();
  }

  unstore() {
    this.service.unstore();
  }

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

  serializeForStorage(): StoredUser {
    return {
      'id': this.id,
      'data': this.data.data,
      'details': this.details,
      'fresh': this.fresh
    };
  }

  toString() {
    return '<IonicUser [\'' + this.id + '\']>';
  }
}

export interface SingleUserServiceOptions {}

export class SingleUserService implements ISingleUserService {

  private user: IUser;

  constructor(public config: SingleUserServiceOptions = {}, public client: IClient, public context: UserContext) {}

  current(): IUser {
    if (!this.user) {
      this.user = this.context.load(new User(this));
    }

    if (!this.user) {
      this.user = new User(this);
    }

    return this.user;
  }

  store() {
    this.context.store(this.current());
  }

  unstore() {
    this.context.unstore();
  }

  self(): Promise<IUser> {
    let deferred = new DeferredPromise<IUser, Error>();
    let user = this.current();

    this.client.get('/auth/users/self')
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          user.id = res.body.data.uuid;
          user.data = new UserData(res.body.data.custom);
          user.details = res.body.data.details;
          user.fresh = false;

          deferred.resolve(user);
        }
      });

    return deferred.promise;
  }

  load(id: string) {
    let deferred = new DeferredPromise<IUser, Error>();
    let user = this.current();
    user.id = id;

    this.client.get(`/auth/users/${user.id}`)
      .end((err, res) => {
        if (err) {
          deferred.reject(err);
        } else {
          user.data = new UserData(res.body.data.custom);
          user.details = res.body.data.details;
          user.fresh = false;

          deferred.resolve(user);
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
      this.client.delete(`/auth/users/${this.user.id}`)
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
      this.client.patch(`/auth/users/${this.user.id}`)
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

  resetPassword(): Promise<void> {
    let deferred = new DeferredPromise<void, Error>();

    if (this.user.isAnonymous()) {
      deferred.reject(new Error('User is anonymous; password cannot be reset using the API.'));
    } else {
      this.client.post(`/auth/users/${this.user.id}/password-reset`)
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

}
