import { DBDependencies }  from './definitions';
import { IonicDB, IonicDBOptions } from '@ionic/db';

export class Database extends IonicDB {

  public _digest: Function;

  constructor(private deps: DBDependencies, private settings: IonicDBOptions ) {
    super(settings);

    if (this.settings.authType === 'authenticated') {
      this.deps.emitter.on('auth:login', (login) => {
        if (login && login['token']) {
          this.setToken(login['token']);
        }
      });

      this.deps.emitter.on('auth:logout', () => {
        this.removeToken();
        this.disconnect();
      });
    }
  }
}
