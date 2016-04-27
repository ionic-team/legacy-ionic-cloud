declare module 'es6-promise' {
    var foo: typeof Promise; // Temp variable to reference Promise in local context
    namespace rsvp {
        export var Promise: typeof foo;
    }
    export = rsvp;
}
