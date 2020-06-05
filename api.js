var prop = require('showtime/prop');
var http = require('showtime/http');
var credentials = require('showtime/store').create('credentials');
var io = require('native/io'); // XXX: Bad to require('native/')

var KEY = 'AIzaSyAZMIkfbAVZZopeIRlhOGnV91zk3t5dH3M';
var CLIENT_ID = '1014238784586-9ruvt1i4kq5j6h7i2954juse5k7vgbcc.apps.googleusercontent.com'

//-----------------------------------------------------------------------
// API authenticiation
//-----------------------------------------------------------------------
io.httpInspectorCreate('https://www.googleapis.com/youtube/v3/.*', function(ctrl) {

  // Youtube API key is configured to require movian.tv as Referer
  ctrl.setHeader('Referer', 'https://movian.tv/');

  // authFailed is set if your HTTP client retries a request due to HTTP 401 Unauthorized
  if(!ctrl.authFailed) {
    // No auth problems, however, we want to set our Authorization header if we have one
    if(credentials.apiauth)
      ctrl.setHeader('Authorization', credentials.apiauth);
    ctrl.proceed();
    return;
  }

  // Ok, we are not authorized
  credentials.apiauth = null; // Clear out our access token

  console.log("Auth failed for: " + ctrl.url);

  // If we have an oauth refresh token, try to use it to get a new access token
  if(credentials.refresh_token) {
    console.log("Refreshing access token");
    try {
      // In order to protect the plugins client-secret a Oauth proxy
      // runs at https://movian.tv which will append the oauth secret
      // and forward the request to Google's servers
      var token = JSON.parse(http.request("https://movian.tv/oauthproxy/token", {
        headers: {
          referer: 'https://movian.tv/'
        },
        postdata: {
          client_id: CLIENT_ID,
          refresh_token: credentials.refresh_token,
          grant_type: 'refresh_token'
        }
      }));

      if(token.token_type && token.access_token) {
        // Got a new access token, remember it and set it as Authorization header
        credentials.apiauth = token.token_type + ' ' + token.access_token;
        ctrl.setHeader('Authorization', credentials.apiauth);
        ctrl.proceed();
        return;
      }

    } catch(err) {
      // Something failed with out refresh token, clear it
      console.error(err);
      credentials.refresh_token = null;
    }
  }

  // Use Google's device oauth endpoint to ask user to enter a code on another device
  var response = JSON.parse(http.request("https://accounts.google.com/o/oauth2/device/code", {
    postdata: {
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/youtube'
    }
  }));

  // Create a popup
  // We do this manually using properties because we want to wait for event asyncronously
  popup = prop.createRoot();
  popup.type = 'message';
  prop.setRichStr(popup, 'message',
                  'To give Movian access to your Youtube account,\n' +
                  'open a web browser on your computer or smartphone and visit:\n\n<font size="6">' +
                  response.verification_url +
                  '</font>\n\nWhen asked, enter the code:\n\n<font size="7">' +
                  response.user_code +
                  '</font>\n\nThis popup will close automatically once the authentication is completed.');
  popup.cancel = true; // Show the cancel button

  // Insert the popup in the global popup tree (this will display it to the user)
  prop.setParent(popup, prop.global.popups);

  var timer = null;
  var interval = 3000;

  // Check if user have accepted in a loop
  function checktoken() {
    // In order to protect the plugins client-secret a Oauth proxy
    // runs at https://movian.tv which will append the oauth secret
    // and forward the request to Google's servers
    var token = JSON.parse(http.request("https://movian.tv/oauthproxy/token", {
      headers: {
        referer: 'https://movian.tv/'
      },
      postdata: {
        client_id: CLIENT_ID,
        code: response.device_code,
        grant_type: 'http://oauth.net/grant_type/device/1.0'
      }
    }));

    if(token.error == 'authorization_pending') {
      // Nothing happened yet
      timer = setTimeout(checktoken, interval);
      return;
    }

    if(token.error == 'slow_down') {
      // Google think we're too fast, relax a bit
      interval += 1000;
      timer = setTimeout(checktoken, interval);
      return;
    }

    // Ok, we're done (in one way or another). Destroy the popup
    prop.destroy(popup);

    if(token.error) {
      // It was an error, fail the request and clear our refresh token
      ctrl.fail(token.error);
      credentials.refresh_token = null;
      return;
    }

    // All looks good
    credentials.refresh_token = token.refresh_token;
    credentials.apiauth = token.token_type + ' ' + token.access_token;
    ctrl.setHeader('Authorization', credentials.apiauth);
    ctrl.proceed();
    return;
  }

  // Start the refresh loop
  timer = setTimeout(checktoken, 10000);

  // Subscribe to the popup eventSink to detect if user presses cancel
  prop.subscribe(popup.eventSink, function(event, data) {
    if(event == 'action' && data == 'Cancel') {
      prop.destroy(popup);
      clearTimeout(timer);
      ctrl.fail('Cancelled by user');
    }
  }, {
    // This will make the subscription destroy itself when the popup
    // is destroyed. Without this we will retain references to captured
    // variables indefinitely
    autoDestroy: true
  });
}, true /* Run the inspector in async mode */);



//-----------------------------------------------------------------------
// Youtube API request wrapper
//
// Invokes an async HTTP request with extra query parametres for our key,
// and decode json, etc
//
// Also set page in error mode if something goes wrong (including if
// the result callback throws)
//-----------------------------------------------------------------------
exports.call = function(endpoint, params, page, cb) {
  var URL = 'https://www.googleapis.com/youtube/v3/' + endpoint;

  var opts = {
    args: [{key: KEY}, params || {}],
    noFail: true,       // Don't throw on HTTP errors (400- status code)
    compression: true,  // Will send 'Accept-Encoding: gzip' in request
    caching: true,      // Enables Movian's built-in HTTP cache
//    verifySSL: true,    // Verify that remote SSL cert is valid
  };

  http.request(URL, opts, function(err, result) {
    if(page)
      page.loading = false;
    if(err) {
      if(page)
        page.error(err);
    } else {
      try {
        var r = JSON.parse(result);
        if(r.error) {
          console.error("Request failed: " + URL);
          console.error(r.error.errors[0].message);
          if(page)
            page.error(r.error.errors[0].reason);
          throw(new Error("Request failed: " + r.error.errors[0].reason));
        }
        cb(r);
      } catch(e) {
        if(page)
          page.error(e);
        throw(e);
      }
    }
  });
}

exports.rate = function(video, rating, cb) {
  var URL = 'https://www.googleapis.com/youtube/v3/videos/rate';

  var opts = {
    args: {
      key: KEY,
      id: video,
      rating: rating
    },
    postdata: "",
    noFail: true,       // Don't throw on HTTP errors (400- status code)
    verifySSL: true,    // Verify that remote SSL cert is valid
  };

  http.request(URL, opts, function(err, result) {
    if(err) {
      cb(false);
    } else {
      cb(result.statuscode == 204);
    }
  });
}
