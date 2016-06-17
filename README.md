# Ionic Cloud Client

The client for using the Ionic Cloud in your app. Check out [our docs](http://docs.ionic.io/docs/io-introduction).

## Installation

Using the latest [Ionic CLI](https://github.com/driftyco/ionic-cli), run the following commands in terminal:

```bash
$ npm install --save @ionic/cloud
$ ionic io init
```

For Ionic 1 apps, manually copy the distribution file into your project.

```bash
$ cp node_modules/@ionic/cloud/dist/bundle/ionic.cloud.min.js www/lib
```

Include it in your `index.html`.

```html
<script src="lib/ionic-cloud.min.js"></script>
```

### Ionic 2

For Ionic 2, we recommend using the [Angular 2 wrapper for the Cloud Client](https://github.com/driftyco/ionic-cloud-angular).

### Ionic 1

```javascript
angular.module('myapp', ['ionic', 'ionic.cloud'])

.config(function($ionicCloudProvider) {
  $ionicCloudProvider.init({
    "core": {
      "app_id": "YOUR-APP-ID",
      "gcm_key": "123456789" // GCM Project ID
    }
  });
})
```

## Usage

```javascript
angular.module('myapp.controllers', ['ionic.cloud'])

.controller('DashCtrl', function($scope, $ionicAuth, $ionicCurrentUser) {
  $ionicAuth.signup({ 'email': 'hi@ionic.io', 'password': 'puppies123' }).then(function() {
    // `$ionicCurrentUser` is now the authenticated user
  }, function(err) {
    // something went wrong!
  });
})
```

## Issues & Local Development

See [`CONTRIBUTING.md`](https://github.com/driftyco/ionic-cloud/blob/master/CONTRIBUTING.md).
