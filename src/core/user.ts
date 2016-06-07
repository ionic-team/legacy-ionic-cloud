import { Auth } from '../auth/auth';
import { PromiseWithNotify, DeferredPromise } from './promise';
import { IonicPlatform } from './core';
import { Storage } from './storage';
import { DataType } from './data-types';

declare var Ionic: any;

var AppUserContext = null;
var storage = new Storage();

class UserContext {
  static get label() {
    return 'ionic_io_user_' + IonicPlatform.config.get('app_id');
  }

  static delete() {
    storage.deleteObject(UserContext.label);
  }

  static store() {
    if (UserContext.getRawData()) {
      UserContext.storeLegacyData(UserContext.getRawData());
    }
    if (User.current().data.data.__ionic_user_migrated) {
      storage.storeObject(UserContext.label + '_legacy', { '__ionic_user_migrated': true });
    }
    storage.storeObject(UserContext.label, User.current());
  }

  static storeLegacyData(data) {
    if (!UserContext.getRawLegacyData()) {
      storage.storeObject(UserContext.label + '_legacy', data);
    }
  }

  static getRawData() {
    return storage.retrieveObject(UserContext.label) || false;
  }

  static getRawLegacyData() {
    return storage.retrieveObject(UserContext.label + '_legacy') || false;
  }

  static load() {
    var data = storage.retrieveObject(UserContext.label) || false;
    if (data) {
      UserContext.storeLegacyData(data);
      return User.fromContext(data);
    }
    return;
  }
}

export class UserData {

  data: any;

  constructor(data = {}) {
    this.data = {};
    if ((typeof data === 'object')) {
      this.data = data;
      this.deserializerDataTypes();
    }
  }

  deserializerDataTypes() {
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

  set(key, value) {
    this.data[key] = value;
  }

  unset(key) {
    delete this.data[key];
  }

  get(key, defaultValue) {
    if (this.data.hasOwnProperty(key)) {
      return this.data[key];
    } else {
      if (defaultValue === 0 || defaultValue === false) {
        return defaultValue;
      }
      return defaultValue || null;
    }
  }
}

export class User {

  data: UserData;
  details: any;

  private _blockLoad: boolean;
  private _blockSave: boolean;
  private _blockDelete: boolean;
  private _dirty: boolean;
  private _fresh: boolean;
  private _unset: any;
  private _id: string;

  constructor() {
    this._blockLoad = false;
    this._blockSave = false;
    this._blockDelete = false;
    this._dirty = false;
    this._fresh = true;
    this._unset = {};
    this.data = new UserData();
  }

  isDirty(): boolean {
    return this._dirty;
  }

  isAnonymous(): boolean {
    if (!this.id) {
      return true;
    } else {
      return false;
    }
  }

  isAuthenticated(): boolean {
    if (this === User.current()) {
      return Auth.isAuthenticated();
    }
    return false;
  }

  static current(user?: User): User {
    if (user) {
      AppUserContext = user;
      UserContext.store();
      return AppUserContext;
    } else {
      if (!AppUserContext) {
        AppUserContext = UserContext.load();
      }
      if (!AppUserContext) {
        AppUserContext = new User();
      }
      return AppUserContext;
    }
  }

  static fromContext(data): User {
    var user = new User();
    user.id = data._id;
    user.data = new UserData(data.data.data);
    user.details = data.details || {};
    user._fresh = data._fresh;
    user._dirty = data._dirty;
    return user;
  }

  static self(): Promise<User> {
    var deferred = new DeferredPromise();
    var tempUser = new User();

    if (!tempUser._blockLoad) {
      tempUser._blockLoad = true;
      IonicPlatform.client.get('/auth/users/self')
        .end((err, res) => {
          if (err) {
            tempUser._blockLoad = false;
            IonicPlatform.logger.error('Ionic User:', err);
            deferred.reject(err);
          } else {
            tempUser._blockLoad = false;
            IonicPlatform.logger.info('Ionic User: loaded user');

            // set the custom data
            tempUser.id = res.body.data.uuid;
            tempUser.data = new UserData(res.body.data.custom);
            tempUser.details = res.body.data.details;
            tempUser._fresh = false;

            User.current(tempUser);
            deferred.resolve(tempUser);
          }
        });
    } else {
      IonicPlatform.logger.info('Ionic User: a load operation is already in progress for ' + this + '.');
      deferred.reject(false);
    }

    return deferred.promise;
  }

  static load(id) {
    var deferred = new DeferredPromise();

    var tempUser = new User();
    tempUser.id = id;

    if (!tempUser._blockLoad) {
      tempUser._blockLoad = true;
      IonicPlatform.client.get(`/auth/users/${tempUser.id}`)
        .end((err, res) => {
          if (err) {
            tempUser._blockLoad = false;
            IonicPlatform.logger.error('Ionic User:', err);
            deferred.reject(err);
          } else {
            tempUser._blockLoad = false;
            IonicPlatform.logger.info('Ionic User: loaded user');

            // set the custom data
            tempUser.data = new UserData(res.body.data.custom);
            tempUser.details = res.body.data.details;
            tempUser._fresh = false;

            deferred.resolve(tempUser);
          }
        });
    } else {
      IonicPlatform.logger.info('Ionic User: a load operation is already in progress for ' + this + '.');
      deferred.reject(false);
    }

    return deferred.promise;
  }

  isFresh() {
    return this._fresh;
  }

  isValid() {
    if (this.id) {
      return true;
    }
    return false;
  }

  getAPIFormat() {
    var apiFormat: any = {};
    for (var key in this.details) {
      apiFormat[key] = this.details[key];
    }
    apiFormat.custom = this.data.data;
    return apiFormat;
  }

  getFormat(format) {
    var formatted = null;
    switch (format) {
      case 'api-save':
        formatted = this.getAPIFormat();
        break;
    }
    return formatted;
  }

  migrate() {
    var rawData = UserContext.getRawLegacyData();
    if (rawData) {
      if (!rawData.__ionic_user_migrated) {
        var currentUser = Ionic.User.current();
        var userData = new UserData(rawData.data.data);
        for (var key in userData.data) {
          currentUser.set(key, userData.data[key]);
        }
        currentUser.set('__ionic_user_migrated', true);
      }
    }
  }

  delete(): PromiseWithNotify<any> {
    var deferred = new DeferredPromise();

    if (this.isValid()) {
      if (!this._blockDelete) {
        this._blockDelete = true;
        this._delete();
        IonicPlatform.client.delete(`/auth/users/${this.id}`)
          .end((err, res) => {
            if (err) {
              this._blockDelete = false;
              IonicPlatform.logger.error('Ionic User:', err);
              deferred.reject(err);
            } else {
              this._blockDelete = false;
              IonicPlatform.logger.info('Ionic User: deleted ' + this);
              deferred.resolve(res);
            }
          });
      } else {
        IonicPlatform.logger.info('Ionic User: a delete operation is already in progress for ' + this + '.');
        deferred.reject(false);
      }
    } else {
      deferred.reject(false);
    }

    return deferred.promise;
  }

  _store() {
    if (this === User.current()) {
      UserContext.store();
    }
  }

  _delete() {
    if (this === User.current()) {
      UserContext.delete();
    }
  }

  save() {
    var deferred = new DeferredPromise();

    if (!this._blockSave) {
      this._blockSave = true;
      this._store();
      IonicPlatform.client.patch(`/auth/users/${this.id}`)
        .send(this.getFormat('api-save'))
        .end((err, res) => {
          if (err) {
            this._dirty = true;
            this._blockSave = false;
            IonicPlatform.logger.error('Ionic User:', err);
            deferred.reject(err);
          } else {
            this._dirty = false;
            if (!this.isFresh()) {
              this._unset = {};
            }
            this._fresh = false;
            this._blockSave = false;
            IonicPlatform.logger.info('Ionic User: saved user');
            deferred.resolve(res);
          }
        });
    } else {
      IonicPlatform.logger.info('Ionic User: a save operation is already in progress for ' + this + '.');
      deferred.reject(false);
    }

    return deferred.promise;
  }

  resetPassword() {
    var deferred = new DeferredPromise();

    IonicPlatform.client.post(`/auth/users/${this.id}/password-reset`)
      .end((err, res) => {
        if (err) {
          IonicPlatform.logger.error('Ionic User:', err);
          deferred.reject(err);
        } else {
          IonicPlatform.logger.info('Ionic User: password reset for user');
          deferred.resolve(res);
        }
      });

    return deferred.promise;
  }

  set id(v: string) {
    this._id = v;
  }

  get id() {
    return this._id || null;
  }

  toString() {
    return '<IonicUser [\'' + this.id + '\']>';
  }

  set(key, value) {
    delete this._unset[key];
    return this.data.set(key, value);
  }

  get(key, defaultValue) {
    return this.data.get(key, defaultValue);
  }

  unset(key) {
    this._unset[key] = true;
    return this.data.unset(key);
  }
}
