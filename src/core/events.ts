export type EventHandler = (data: Object) => any;

interface EventHandlers {
  [key: string]: EventHandler[];
}

export class EventEmitter {

  private eventHandlers: EventHandlers;

  constructor() {
    this.eventHandlers = {};
  }

  on(event: string, callback: EventHandler) {
    if (typeof this.eventHandlers[event] === 'undefined') {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push(callback);
  }

  emit(event: string, data: Object = null) {
    if (typeof this.eventHandlers[event] === 'undefined') {
      this.eventHandlers[event] = [];
    }

    for (let callback of this.eventHandlers[event]) {
      callback(data);
    }
  }
}
