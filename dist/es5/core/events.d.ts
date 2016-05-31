export declare type EventHandler = (data: Object) => any;
export declare class EventEmitter {
    private eventHandlers;
    constructor();
    on(event: string, callback: EventHandler): void;
    emit(event: string, data?: Object): void;
}
