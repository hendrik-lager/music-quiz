/**
 * BeatifyAuth stub for standalone mode.
 *
 * Replaces the original HA OAuth client. Authentication is handled by
 * Spotify OAuth on the backend; the admin token is the Spotify access
 * token served by /auth/spotify/token.
 */
window.BeatifyAuth = (function () {
    'use strict';

    var _token = null;
    var _expiresAt = 0;
    var _fetchingToken = false;
    var _pendingResolvers = [];

    async function _refreshFromServer() {
        if (_fetchingToken) {
            return new Promise(function (resolve) { _pendingResolvers.push(resolve); });
        }
        _fetchingToken = true;
        try {
            var resp = await fetch('/auth/spotify/token');
            if (resp.ok) {
                var data = await resp.json();
                _token = data.access_token || null;
                _expiresAt = data.expires_at || 0;
            } else {
                _token = null;
            }
        } catch (e) {
            _token = null;
        } finally {
            _fetchingToken = false;
            var t = _token;
            _pendingResolvers.forEach(function (r) { r(t); });
            _pendingResolvers = [];
        }
        return _token;
    }

    async function getAccessToken() {
        var now = Math.floor(Date.now() / 1000);
        if (_token && now < _expiresAt - 30) {
            return _token;
        }
        return _refreshFromServer();
    }

    async function ensureAuthenticated() {
        var token = await getAccessToken();
        if (!token) {
            // Redirect to Spotify login
            window.location.href = '/auth/spotify/login';
            return null;
        }
        return token;
    }

    async function init(options) {
        var requireAuth = options && options.requireAuth;
        var token = await getAccessToken();
        if (requireAuth && !token) {
            // Not authenticated — show Spotify login prompt instead of redirecting
            // immediately so the user can see the page first.
            console.log('[BeatifyAuth] No Spotify token — standalone mode, login required');
        }
        return token;
    }

    async function fetch(url, options) {
        var token = await getAccessToken();
        var opts = Object.assign({}, options || {});
        opts.headers = Object.assign({}, opts.headers || {});
        if (token) {
            opts.headers['Authorization'] = 'Bearer ' + token;
        }
        return window.fetch(url, opts);
    }

    function logout() {
        _token = null;
        _expiresAt = 0;
    }

    function login() {
        window.location.href = '/auth/spotify/login';
    }

    // Called when the server rejects an admin_connect due to a bad token.
    async function handleServerRejection() {
        _token = null;
        _expiresAt = 0;
        return _refreshFromServer();
    }

    return {
        init: init,
        getAccessToken: getAccessToken,
        ensureAuthenticated: ensureAuthenticated,
        fetch: fetch,
        logout: logout,
        login: login,
        handleServerRejection: handleServerRejection,
    };
})();
