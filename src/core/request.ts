import { DeferredPromise } from "./promise";
import { Auth } from "../auth/auth";
import request from "browser-request";

export class Request {
  then: any;
  reject: any;
  resolve: any;

  constructor() {

  }
}

export class Response {
  constructor() {

  }
}

export class APIResponse extends Response {
  constructor() {
    super();
  }
}

export class APIRequest extends Request {
  constructor(options) {
    super();
    options.headers = options.headers || {};
    if (!options.headers.Authorization) {
      var token = Auth.getUserToken();
      if (token) {
        options.headers.Authorization = 'Bearer ' + token;
      }
    }
    var requestInfo:any = {};
    var p: any = new DeferredPromise();
    request(options, function(err, response, result) {
      requestInfo._lastError = err;
      requestInfo._lastResponse = response;
      requestInfo._lastResult = result;
      if (err) {
        p.reject(err);
      } else {
        if (response.statusCode < 200 || response.statusCode >= 400) {
          var _err = new Error("Request Failed with status code of " + response.statusCode);
          p.reject({ 'response': response, 'error': _err });
        } else {
          p.resolve({ 'response': response, 'payload': result });
        }
      }
    });
    p.requestInfo = requestInfo;
    return p.promise;
  }
}
