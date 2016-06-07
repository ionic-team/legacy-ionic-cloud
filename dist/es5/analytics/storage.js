"use strict";
var core_1 = require('../core/core');
var BucketStorage = (function () {
    function BucketStorage(name) {
        this.name = name;
        this.baseStorage = core_1.IonicPlatform.storage;
    }
    BucketStorage.prototype.get = function (key) {
        return this.baseStorage.retrieveObject(this.scopedKey(key));
    };
    BucketStorage.prototype.set = function (key, value) {
        return this.baseStorage.storeObject(this.scopedKey(key), value);
    };
    BucketStorage.prototype.scopedKey = function (key) {
        return this.name + '_' + key + '_' + core_1.IonicPlatform.config.get('app_id');
    };
    return BucketStorage;
}());
exports.BucketStorage = BucketStorage;
