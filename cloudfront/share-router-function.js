// CloudFront Function (cloudfront-js-2.0) attached to the default cache
// behavior on viewer-request. Rewrites /s/<id> to /share.html so share links
// stay short enough to paste into a message.
//
// The browser's URL is unchanged by an origin-side rewrite, so public/js/share.js
// still reads the id from location.pathname. The key after the '#' is never sent
// to CloudFront at all -- fragments stay in the browser.
//
// This is a SEPARATE function from security-headers-function.js, which runs at
// viewer-response. One behavior can carry one function per event type.
//
// Publish with update-function then publish-function; see share-infra/README.md
// step 5. No update-distribution and no invalidation are needed.

function handler(event) {
    var request = event.request;
    if (/^\/s\/[A-Za-z0-9_-]{12}\/?$/.test(request.uri)) {
        request.uri = '/share.html';
    }
    return request;
}
