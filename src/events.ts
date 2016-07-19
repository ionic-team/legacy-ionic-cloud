import { EventHandler, IEventEmitter } from './definitions';

/**
 * Stores callbacks for registered events.
 */
export class EventEmitter implements IEventEmitter {

  private eventHandlers: { [key: string]: EventHandler[]; } = {};
  private eventsEmitted: { [key: string]: number; }  = {};

  /**
   * Register an event callback which gets triggered every time the event is
   * fired.
   *
   * @param event - The event name.
   * @param callback - A callback to attach to this event.
   */
  on(event: string, callback: EventHandler) {
    if (typeof this.eventHandlers[event] === 'undefined') {
      this.eventHandlers[event] = [];
    }

    this.eventHandlers[event].push(callback);
  }

  /**
   * Register an event callback that gets triggered only once. If the event was
   * triggered before your callback is registered, it calls your callback
   * immediately.
   *
   * @param event - The event name.
   * @param callback - A callback to attach to this event.
   */
  once(event: string, callback: () => void) {
    if (this.emitted(event)) {
      callback();
    } else {
      this.on(event, () => {
        if (!this.emitted(event)) {
          callback();
        }
      });
    }
  }

  /**
   * Trigger an event. Call all callbacks in the order they were registered.
   *
   * @param event - The event name.
   * @param data - An object to pass to every callback.
   */
  emit(event: string, data: Object = null) {
    if (typeof this.eventHandlers[event] === 'undefined') {
      this.eventHandlers[event] = [];
    }

    if (typeof this.eventsEmitted[event] === 'undefined') {
      this.eventsEmitted[event] = 0;
    }

    for (let callback of this.eventHandlers[event]) {
      callback(data);
    }

    this.eventsEmitted[event] += 1;
  }

  /**
   * Return a count of the number of times an event has been triggered.
   *
   * @param event - The event name.
   */
  emitted(event: string): number {
    if (typeof this.eventsEmitted[event] === 'undefined') {
      return 0;
    }

    return this.eventsEmitted[event];
  }

}
