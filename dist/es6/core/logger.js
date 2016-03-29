export class Logger {
    constructor(opts) {
        var options = opts || {};
        this._silence = false;
        this._prefix = null;
        this._options = options;
        this._bootstrap();
    }
    silence() {
        this._silence = true;
    }
    verbose() {
        this._silence = false;
    }
    _bootstrap() {
        if (this._options.prefix) {
            this._prefix = this._options.prefix;
        }
    }
    info(data) {
        if (!this._silence) {
            if (this._prefix) {
                console.log(this._prefix, data);
            }
            else {
                console.log(data);
            }
        }
    }
    warn(data) {
        if (!this._silence) {
            if (this._prefix) {
                console.log(this._prefix, data);
            }
            else {
                console.log(data);
            }
        }
    }
    error(data) {
        if (this._prefix) {
            console.error(this._prefix, data);
        }
        else {
            console.error(data);
        }
    }
}
