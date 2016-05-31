export declare class DataTypeSchema {
    data: any;
    constructor(properties: any);
    setProperties(properties: any): void;
    toJSON(): {
        '__Ionic_DataTypeSchema': any;
        'value': any;
    };
    isValid(): boolean;
}
export declare class DataType {
    static get(name: any, value: any): any;
    static getMapping(): {};
    static Schema: typeof DataTypeSchema;
    static register(name: any, cls: any): void;
}
export declare class UniqueArray {
    data: Array<any>;
    constructor(value: any);
    toJSON(): {
        '__Ionic_DataTypeSchema': any;
        'value': any;
    };
    static fromStorage(value: any): UniqueArray;
    push(value: any): void;
    pull(value: any): void;
}
