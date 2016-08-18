import { EventHandler, IEventReceiver, IEventEmitter } from './definitions';

/**
 * A registered event receiver.
 */
export class EventReceiver implements IEventReceiver {
  constructor(
    /**
     * An registered identifier for this event receiver.
     */
    public key: string | number,

    /**
     * The registered name of the event.
     */
    public event: string,

    /**
     * The actual callback.
     */
    public handler: EventHandler
  ) {}
}

/**
 * Stores callbacks for registered events.
 */
export class EventEmitter implements IEventEmitter {

  /**
   * @private
   */
  private n: number = 0;

  /**
   * @private
   */
  private eventReceivers: {
    [key: string]: {
      [key: number]: IEventReceiver;
    };
  } = {};

  /**
   * @private
   */
  private eventsEmitted: {
    [key: string]: number;
  }  = {};

  /**
   * Register an event callback which gets triggered every time the event is
   * fired.
   *
   * @param event
   *  The event name.
   * @param callback
   *  A callback to attach to this event.
   */
  public on(event: string, callback: EventHandler): IEventReceiver {
    if (typeof this.eventReceivers[event] === 'undefined') {
      this.eventReceivers[event] = {};
    }

    let receiver = new EventReceiver(this.n, event, callback);
    this.n++;
    this.eventReceivers[event][receiver.key] = receiver;
    return receiver;
  }

  /**
   * Unregister an event receiver returned from
   * [`on()`](/api/client/eventemitter#on).
   *
   * @param receiver
   *  The event receiver.
   */
  public off(receiver: IEventReceiver): void {
    if (
      typeof this.eventReceivers[receiver.event] === 'undefined' ||
      typeof this.eventReceivers[receiver.event][receiver.key] === 'undefined'
    ) {
      throw new Error('unknown event receiver');
    }

    delete this.eventReceivers[receiver.event][receiver.key];
  }

  /**
   * Register an event callback that gets triggered only once. If the event was
   * triggered before your callback is registered, it calls your callback
   * immediately.
   *
   * @note TODO: Fix the docs for () => void syntax.
   *
   * @param event
   *  The event name.
   * @param callback
   *  A callback to attach to this event. It takes no arguments.
   */
  public once(event: string, callback: () => void): void {
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
   * @param event
   *  The event name.
   * @param data
   *  An object to pass to every callback.
   */
  public emit(event: string, data: Object = null) {
    if (typeof this.eventReceivers[event] === 'undefined') {
      this.eventReceivers[event] = {};
    }

    if (typeof this.eventsEmitted[event] === 'undefined') {
      this.eventsEmitted[event] = 0;
    }

    for (let k in this.eventReceivers[event]) {
      this.eventReceivers[event][k].handler(data);
    }

    this.eventsEmitted[event] += 1;
  }

  /**
   * Return a count of the number of times an event has been triggered.
   *
   * @param event
   *  The event name.
   */
  public emitted(event: string): number {
    if (typeof this.eventsEmitted[event] === 'undefined') {
      return 0;
    }

    return this.eventsEmitted[event];
  }

}
