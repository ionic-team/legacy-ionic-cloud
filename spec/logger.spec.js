var Logger = require('../dist/es5/logger.js').Logger;

describe('logger', function() {
  it('should call console functions', function() {
    var logger = new Logger();
    var infofnSpy = jasmine.createSpy('infofnSpy');
    var warnfnSpy = jasmine.createSpy('warnfnSpy');
    var errorfnSpy = jasmine.createSpy('errorfnSpy');
    logger.infofn = infofnSpy;
    logger.warnfn = warnfnSpy;
    logger.errorfn = errorfnSpy;
    logger.info('my info');
    logger.warn('my warning');
    logger.error('my error');
    expect(infofnSpy).toHaveBeenCalledTimes(1);
    expect(infofnSpy).toHaveBeenCalledWith('my info');
    expect(warnfnSpy).toHaveBeenCalledTimes(1);
    expect(warnfnSpy).toHaveBeenCalledWith('my warning');
    expect(errorfnSpy).toHaveBeenCalledTimes(1);
    expect(errorfnSpy).toHaveBeenCalledWith('my error');
  });
});
