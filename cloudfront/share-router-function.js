// CloudFront Function (cloudfront-js-2.0) attached to the default cache
// behavior on viewer-request. It does two jobs.
//
// 1. Rewrites /s/<id> to /share.html so share links stay short enough to paste
//    into a message. The browser's URL is unchanged by an origin-side rewrite,
//    so public/js/share.js still reads the id from location.pathname. The key
//    after the '#' is never sent to CloudFront at all -- fragments stay in the
//    browser.
//
// 2. Rewrites any unrecognized path to /index.html. This one is a security
//    control, not routing. CloudFront does not invoke viewer-response functions
//    when the ORIGIN returns HTTP 400 or higher, so a 404 from the S3 website
//    endpoint shipped with no CSP, no HSTS, and no X-Frame-Options. That made
//    the notes app framable at any 404 URL. Pointing unknown paths at a real
//    object makes the origin answer 200, which lets scratchpad-security-headers
//    run on viewer-response. See SECURITY-REVIEW.md, SP-03.
//
//    An earlier attempt used CloudFront CustomErrorResponses instead. That does
//    not work: the skip is keyed on the status the ORIGIN returned, not the one
//    the viewer receives. It also applies distribution-wide and swallowed the
//    share API's legitimate 404. Both are recorded in SECURITY-REVIEW.md 10.2.
//
// /api/share* is a separate cache behavior with no function association, so it
// never reaches this code and cannot be affected by rule 2.
//
// Paths under /public/ pass through untouched. A missing asset must stay a 404
// rather than resolve to HTML, or a broken script tag would silently receive a
// page instead of an error.
//
// This is a SEPARATE function from security-headers-function.js, which runs at
// viewer-response. One behavior can carry one function per event type.
//
// Publish with update-function then publish-function; see share-infra/README.md
// step 5. No update-distribution and no invalidation are needed.

var SHARE_PATH = /^\/s\/[A-Za-z0-9_-]{12}\/?$/;

// Every root-level object the bucket actually serves. '/' is deliberately NOT
// listed: it falls through to the catch-all and becomes /index.html. The S3
// website endpoint used to resolve '/' on its own, but the REST endpoint behind
// Origin Access Control does not, and relying on DefaultRootObject would leave
// the result dependent on whether CloudFront applies it before or after this
// function. Rewriting it here makes the outcome explicit either way.
var ROOT_FILES = {
    '/index.html': true,
    '/about.html': true,
    '/guide.html': true,
    '/privacy.html': true,
    '/terms.html': true,
    '/share.html': true,
    '/service-worker.js': true
};

function handler(event) {
    var request = event.request;
    var uri = request.uri;

    if (SHARE_PATH.test(uri)) {
        request.uri = '/share.html';
        return request;
    }

    if (ROOT_FILES[uri] === true) {
        return request;
    }

    if (uri.indexOf('/public/') === 0) {
        return request;
    }

    request.uri = '/index.html';
    return request;
}
