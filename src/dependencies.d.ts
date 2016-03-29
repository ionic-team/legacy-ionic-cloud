declare module "browser-request" {
    export default function request(options: any, callback?: any) : any; 
}

declare module 'es6-promise' {
    var foo: typeof Promise; // Temp variable to reference Promise in local context
    namespace rsvp {
        export var Promise: typeof foo;
    }
    export = rsvp;
}
