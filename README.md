# Ionic Cloud Client

The client for using the Ionic Cloud (powerful user & social authentication,
native push notifications, live deploys, etc.) in your app. Check out [our docs](http://docs.ionic.io/docs/io-introduction).

## Ionic 2

For Ionic 2, we recommend using the [Angular 2 wrapper for the Cloud Client](https://github.com/driftyco/ionic-cloud-angular).

## Ionic 1

### Installation

```bash
$ npm install --save @ionic/cloud
$ ionic io init
```

Manually copy the distribution file into your project.

```bash
$ cp node_modules/@ionic/cloud/dist/bundle/ionic.cloud.min.js www/lib
```

Include it in your `index.html`.

```html
<script src="lib/ionic-cloud.min.js"></script>
```

Enter your `app_id` (required) and `gcm_key` (if using Ionic Push).

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

### Usage

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
