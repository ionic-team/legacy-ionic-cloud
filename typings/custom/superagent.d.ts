// copied from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/superagent/superagent.d.ts
// I don't like the dependency on node definitions, so I removed them
declare module "superagent" {
  type CallbackHandler = (err: any, res: request.Response) => void;

  var request: request.SuperAgentStatic;

  namespace request {
    interface SuperAgentStatic extends SuperAgent<SuperAgentRequest> {
      (url: string): SuperAgentRequest;
      (method: string, url: string): SuperAgentRequest;

      agent(): SuperAgent<SuperAgentRequest>;
    }

    interface SuperAgent<Req extends Request<any>> {
      get(url: string): Req;
      post(url: string): Req;
      put(url: string): Req;
      patch(url: string): Req;
      delete(url: string): Req;
      head(url: string): Req;
      options(url: string): Req;
    }

    interface Response {
      text: string;
      body: any;
      files: any;
      header: any;
      type: string;
      charset: string;
      status: number;
      statusType: number;
      info: boolean;
      ok: boolean;
      redirect: boolean;
      clientError: boolean;
      serverError: boolean;
      error: Error;
      accepted: boolean;
      noContent: boolean;
      badRequest: boolean;
      unauthorized: boolean;
      notAcceptable: boolean;
      notFound: boolean;
      forbidden: boolean;
      get(header: string): string;
    }

    interface Request<Req extends Request<any>> {
      abort(): void;
      accept(type: string): Req;
      attach(field: string, file: string, filename?: string): Req;
      auth(user: string, name: string): Req;
      buffer(val: boolean): Req;
      clearTimeout(): Req;
      end(callback?: CallbackHandler): Req;
      field(name: string, val: string): Req;
      get(field: string): string;
      on(name: string, handler: Function): Req;
      on(name: 'error', handler: (err: any) => void): Req;
      part(): Req;
      query(val: Object): Req;
      redirects(n: number): Req;
      send(data: string): Req;
      send(data: Object): Req;
      send(): Req;
      set(field: string, val: string): Req;
      set(field: Object): Req;
      timeout(ms: number): Req;
      type(val: string): Req;
      use(fn: Function): Req;
      withCredentials(): Req;
      write(data: string, encoding?: string): Req;
    }
    interface SuperAgentRequest extends Request<Request<Request<Request<any>>>> {}

  }

  export = request;
}
