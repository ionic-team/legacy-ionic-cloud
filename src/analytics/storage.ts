import { Settings } from "../core/settings";
import { IonicPlatformCore } from "../core/core";

var settings = new Settings();

export class BucketStorage {
  baseStorage: any;
  name: string;

  constructor(name) {
    this.name = name;
    this.baseStorage = IonicPlatformCore.getStorage();
  }

  get(key) {
    return this.baseStorage.retrieveObject(this.scopedKey(key));
  }

  set(key, value) {
    return this.baseStorage.storeObject(this.scopedKey(key), value);
  }

  scopedKey(key) {
    return this.name + '_' + key + '_' + settings.get('app_id');
  }
}
