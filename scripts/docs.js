var pkg = require('../package.json');
var Dgeni = require('dgeni');

var ionicPackage = require('./docs/dgeni-config')(pkg.version);
var dgeni = new Dgeni([ionicPackage]);

dgeni.generate();
