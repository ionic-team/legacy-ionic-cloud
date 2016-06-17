export type EventHandler = (data: Object) => any;

interface EventsEmitted {
  [key: string]: number;
}

interface EventHandlers {
  [key: string]: EventHandler[];
}

export class EventEmitter {

  private eventHandlers: EventHandlers = {};
  private eventsEmitted: EventsEmitted = {};

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

    if (typeof this.eventsEmitted[event] === 'undefined') {
      this.eventsEmitted[event] = 0;
    }

    this.eventsEmitted[event] += 1;

    for (let callback of this.eventHandlers[event]) {
      callback(data);
    }
  }

  emitted(event: string): number {
    if (typeof this.eventsEmitted[event] === 'undefined') {
      return 0;
    }

    return this.eventsEmitted[event];
  }
}
