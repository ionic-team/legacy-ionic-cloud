import {
  APIResponse,
  APIResponseError,
  APIResponseSuccess
} from './definitions';

export function isAPIResponseSuccess(x: APIResponse): x is APIResponseSuccess {
  return x.meta.status < 400;
}

export function isAPIResponseError(x: APIResponse): x is APIResponseError {
  return x.meta.status >= 400;
}
