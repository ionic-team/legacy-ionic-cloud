import { Client } from '../core/client';

export class Links {

  constructor(public client: Client, public appId: string) {
    this.client = client;
    this.appId = appId;
  }

  start() {
    
  }

}
