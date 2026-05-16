// CloudFront Function (cloudfront-js-2.0) attached to the default cache
// behavior on viewer-response. Emits the same security headers the
// response-headers-policy.json declared, because the Free flat-rate
// pricing plan on this distribution forbids custom response-headers
// policies. CloudFront Functions are allowed on every tier.
//
// CSP hashes for the inline <script> blocks in index.html / privacy.html
// / terms.html must stay in sync with the literal strings below.
// Re-run `bash cloudfront/recompute-csp-hashes.sh` after editing any
// inline <script> in the HTML pages.

function handler(event) {
    var response = event.response;
    var headers = response.headers;

    headers['content-security-policy'] = {
        value: "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'sha256-r1R/ruozP4Z6nw+BW6YtAVTEk8XQaf9Ctb6MfgfpJqA=' 'sha256-vDmdL+Cz3w4FloW65uXC82DALsAR0WVW33MMO+89nx4=' 'sha256-3TGInlul3ZC86Fo4jG0ZzRDsxNWzG/U3dWJUkd0pork='; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    };
    headers['strict-transport-security'] = {
        value: 'max-age=63072000; includeSubDomains; preload'
    };
    headers['x-content-type-options'] = { value: 'nosniff' };
    headers['x-frame-options'] = { value: 'DENY' };
    headers['referrer-policy'] = { value: 'no-referrer' };
    headers['permissions-policy'] = {
        value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()'
    };
    headers['cross-origin-opener-policy'] = { value: 'same-origin' };
    headers['cross-origin-resource-policy'] = { value: 'same-origin' };
    headers['x-permitted-cross-domain-policies'] = { value: 'none' };

    return response;
}
