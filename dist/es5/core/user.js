"use strict";
var auth_1 = require('../auth/auth');
var request_1 = require('./request');
var promise_1 = require('./promise');
var core_1 = require('./core');
var storage_1 = require('./storage');
var logger_1 = require('./logger');
var data_types_1 = require('./data-types');
var AppUserContext = null;
var storage = new storage_1.Storage();
var userAPIBase = core_1.IonicPlatform.config.getURL('platform-api') + '/auth/users';
var userAPIEndpoints = {
    'self': function () {
        return userAPIBase + '/self';
    },
    'get': function (userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'remove': function (userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'save': function (userModel) {
        return userAPIBase + '/' + userModel.id;
    },
    'passwordReset': function (userModel) {
        return userAPIBase + '/' + userModel.id + '/password-reset';
    }
};
var UserContext = (function () {
    function UserContext() {
    }
    Object.defineProperty(UserContext, "label", {
        get: function () {
            return 'ionic_io_user_' + core_1.IonicPlatform.config.get('app_id');
        },
        enumerable: true,
        configurable: true
    });
    UserContext.delete = function () {
        storage.deleteObject(UserContext.label);
    };
    UserContext.store = function () {
        if (UserContext.getRawData()) {
            UserContext.storeLegacyData(UserContext.getRawData());
        }
        if (User.current().data.data.__ionic_user_migrated) {
            storage.storeObject(UserContext.label + '_legacy', { '__ionic_user_migrated': true });
        }
        storage.storeObject(UserContext.label, User.current());
    };
    UserContext.storeLegacyData = function (data) {
        if (!UserContext.getRawLegacyData()) {
            storage.storeObject(UserContext.label + '_legacy', data);
        }
    };
    UserContext.getRawData = function () {
        return storage.retrieveObject(UserContext.label) || false;
    };
    UserContext.getRawLegacyData = function () {
        return storage.retrieveObject(UserContext.label + '_legacy') || false;
    };
    UserContext.load = function () {
        var data = storage.retrieveObject(UserContext.label) || false;
        if (data) {
            UserContext.storeLegacyData(data);
            return User.fromContext(data);
        }
        return;
    };
    return UserContext;
}());
var UserData = (function () {
    function UserData(data) {
        if (data === void 0) { data = {}; }
        this.data = {};
        if ((typeof data === 'object')) {
            this.data = data;
            this.deserializerDataTypes();
        }
    }
    UserData.prototype.deserializerDataTypes = function () {
        for (var x in this.data) {
            // if we have an object, let's check for custom data types
            if (typeof this.data[x] === 'object') {
                // do we have a custom type?
                if (this.data[x].__Ionic_DataTypeSchema) {
                    var name = this.data[x].__Ionic_DataTypeSchema;
                    var mapping = data_types_1.DataType.getMapping();
                    if (mapping[name]) {
                        // we have a custom type and a registered class, give the custom data type
                        // from storage
                        this.data[x] = mapping[name].fromStorage(this.data[x].value);
                    }
                }
            }
        }
    };
    UserData.prototype.set = function (key, value) {
        this.data[key] = value;
    };
    UserData.prototype.unset = function (key) {
        delete this.data[key];
    };
    UserData.prototype.get = function (key, defaultValue) {
        if (this.data.hasOwnProperty(key)) {
            return this.data[key];
        }
        else {
            if (defaultValue === 0 || defaultValue === false) {
                return defaultValue;
            }
            return defaultValue || null;
        }
    };
    return UserData;
}());
exports.UserData = UserData;
var User = (function () {
    function User() {
        this.logger = new logger_1.Logger({
            'prefix': 'Ionic User:'
        });
        this._blockLoad = false;
        this._blockSave = false;
        this._blockDelete = false;
        this._dirty = false;
        this._fresh = true;
        this._unset = {};
        this.data = new UserData();
    }
    User.prototype.isDirty = function () {
        return this._dirty;
    };
    User.prototype.isAnonymous = function () {
        if (!this.id) {
            return true;
        }
        else {
            return false;
        }
    };
    User.prototype.isAuthenticated = function () {
        if (this === User.current()) {
            return auth_1.Auth.isAuthenticated();
        }
        return false;
    };
    User.current = function (user) {
        if (user === void 0) { user = null; }
        if (user) {
            AppUserContext = user;
            UserContext.store();
            return AppUserContext;
        }
        else {
            if (!AppUserContext) {
                AppUserContext = UserContext.load();
            }
            if (!AppUserContext) {
                AppUserContext = new User();
            }
            return AppUserContext;
        }
    };
    User.fromContext = function (data) {
        var user = new User();
        user.id = data._id;
        user.data = new UserData(data.data.data);
        user.details = data.details || {};
        user._fresh = data._fresh;
        user._dirty = data._dirty;
        return user;
    };
    User.self = function () {
        var deferred = new promise_1.DeferredPromise();
        var tempUser = new User();
        if (!tempUser._blockLoad) {
            tempUser._blockLoad = true;
            new request_1.APIRequest({
                'uri': userAPIEndpoints.self(),
                'method': 'GET',
                'json': true
            }).then(function (result) {
                tempUser._blockLoad = false;
                tempUser.logger.info('loaded user');
                // set the custom data
                tempUser.id = result.payload.data.uuid;
                tempUser.data = new UserData(result.payload.data.custom);
                tempUser.details = result.payload.data.details;
                tempUser._fresh = false;
                User.current(tempUser);
                deferred.resolve(tempUser);
            }, function (error) {
                tempUser._blockLoad = false;
                tempUser.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            tempUser.logger.info('a load operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.load = function (id) {
        var deferred = new promise_1.DeferredPromise();
        var tempUser = new User();
        tempUser.id = id;
        if (!tempUser._blockLoad) {
            tempUser._blockLoad = true;
            new request_1.APIRequest({
                'uri': userAPIEndpoints.get(tempUser),
                'method': 'GET',
                'json': true
            }).then(function (result) {
                tempUser._blockLoad = false;
                tempUser.logger.info('loaded user');
                // set the custom data
                tempUser.data = new UserData(result.payload.data.custom);
                tempUser.details = result.payload.data.details;
                tempUser._fresh = false;
                deferred.resolve(tempUser);
            }, function (error) {
                tempUser._blockLoad = false;
                tempUser.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            tempUser.logger.info('a load operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.prototype.isFresh = function () {
        return this._fresh;
    };
    User.prototype.isValid = function () {
        if (this.id) {
            return true;
        }
        return false;
    };
    User.prototype.getAPIFormat = function () {
        var apiFormat = {};
        for (var key in this.details) {
            apiFormat[key] = this.details[key];
        }
        apiFormat.custom = this.data.data;
        return apiFormat;
    };
    User.prototype.getFormat = function (format) {
        var self = this;
        var formatted = null;
        switch (format) {
            case 'api-save':
                formatted = self.getAPIFormat();
                break;
        }
        return formatted;
    };
    User.prototype.migrate = function () {
        var rawData = UserContext.getRawLegacyData();
        if (rawData.__ionic_user_migrated) {
            return true;
        }
        if (rawData) {
            var currentUser = Ionic.User.current();
            var userData = new UserData(rawData.data.data);
            for (var key in userData.data) {
                currentUser.set(key, userData.data[key]);
            }
            currentUser.set('__ionic_user_migrated', true);
        }
    };
    User.prototype.delete = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        if (!self.isValid()) {
            return false;
        }
        if (!self._blockDelete) {
            self._blockDelete = true;
            self._delete();
            new request_1.APIRequest({
                'uri': userAPIEndpoints.remove(this),
                'method': 'DELETE',
                'json': true
            }).then(function (result) {
                self._blockDelete = false;
                self.logger.info('deleted ' + self);
                deferred.resolve(result);
            }, function (error) {
                self._blockDelete = false;
                self.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            self.logger.info('a delete operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.prototype._store = function () {
        if (this === User.current()) {
            UserContext.store();
        }
    };
    User.prototype._delete = function () {
        if (this === User.current()) {
            UserContext.delete();
        }
    };
    User.prototype.save = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        if (!self._blockSave) {
            self._blockSave = true;
            self._store();
            new request_1.APIRequest({
                'uri': userAPIEndpoints.save(this),
                'method': 'PATCH',
                'json': self.getFormat('api-save')
            }).then(function (result) {
                self._dirty = false;
                if (!self.isFresh()) {
                    self._unset = {};
                }
                self._fresh = false;
                self._blockSave = false;
                self.logger.info('saved user');
                deferred.resolve(result);
            }, function (error) {
                self._dirty = true;
                self._blockSave = false;
                self.logger.error(error);
                deferred.reject(error);
            });
        }
        else {
            self.logger.info('a save operation is already in progress for ' + this + '.');
            deferred.reject(false);
        }
        return deferred.promise;
    };
    User.prototype.resetPassword = function () {
        var self = this;
        var deferred = new promise_1.DeferredPromise();
        new request_1.APIRequest({
            'uri': userAPIEndpoints.passwordReset(this),
            'method': 'POST'
        }).then(function (result) {
            self.logger.info('password reset for user');
            deferred.resolve(result);
        }, function (error) {
            self.logger.error(error);
            deferred.reject(error);
        });
        return deferred.promise;
    };
    Object.defineProperty(User.prototype, "id", {
        get: function () {
            return this._id || null;
        },
        set: function (v) {
            this._id = v;
        },
        enumerable: true,
        configurable: true
    });
    User.prototype.toString = function () {
        return '<IonicUser [\'' + this.id + '\']>';
    };
    User.prototype.set = function (key, value) {
        delete this._unset[key];
        return this.data.set(key, value);
    };
    User.prototype.get = function (key, defaultValue) {
        return this.data.get(key, defaultValue);
    };
    User.prototype.unset = function (key) {
        this._unset[key] = true;
        return this.data.unset(key);
    };
    return User;
}());
exports.User = User;
