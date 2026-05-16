/* Root shim so the service worker can control the whole static app scope. */
importScripts('/public/service-worker.js' + self.location.search);
