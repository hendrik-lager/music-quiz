/**
 * Spotify Web Playback SDK initialisation for Beatify standalone.
 *
 * Loaded after the Spotify SDK script. Initialises the Player once a
 * Spotify access token is available, then sends the resulting device_id
 * to the backend via WebSocket (register_device message) so the backend
 * can control playback via the Spotify Web API.
 */
(function () {
    'use strict';

    var spotifyPlayer = null;
    var deviceId = null;

    /**
     * Called by the Spotify SDK once it is ready to accept a Player instance.
     * Attached to window so the SDK can find it.
     */
    window.onSpotifyWebPlaybackSDKReady = function () {
        initSpotifyPlayer();
    };

    async function initSpotifyPlayer() {
        var token = await BeatifyAuth.getAccessToken();
        if (!token) {
            console.warn('[Spotify] No access token — player not initialised');
            showSpotifyConnectPrompt();
            return;
        }

        spotifyPlayer = new Spotify.Player({
            name: 'Beatify',
            getOAuthToken: async function (cb) {
                // Called by SDK when token needs refreshing
                var t = await BeatifyAuth.getAccessToken();
                cb(t || '');
            },
            volume: 0.5,
        });

        spotifyPlayer.addListener('ready', function (ref) {
            deviceId = ref.device_id;
            console.log('[Spotify] Player ready, device_id:', deviceId);
            sendDeviceId(deviceId);
            showSpotifyStatus('connected');
        });

        spotifyPlayer.addListener('not_ready', function (ref) {
            console.warn('[Spotify] Device went offline:', ref.device_id);
            showSpotifyStatus('offline');
        });

        spotifyPlayer.addListener('initialization_error', function (ref) {
            console.error('[Spotify] Initialization error:', ref.message);
            showSpotifyStatus('error');
        });

        spotifyPlayer.addListener('authentication_error', function (ref) {
            console.error('[Spotify] Authentication error:', ref.message);
            showSpotifyStatus('auth_error');
            // Token may have expired — let the user re-authenticate
            BeatifyAuth.login();
        });

        spotifyPlayer.addListener('account_error', function (ref) {
            console.error('[Spotify] Account error (Premium required?):', ref.message);
            showSpotifyStatus('account_error');
        });

        spotifyPlayer.connect();
    }

    function sendDeviceId(id) {
        // Try the global adminWs used by admin.js; fall back to a polling
        // approach in case the WS isn't open yet when the SDK fires ready.
        var attempts = 0;
        var maxAttempts = 20;

        function trySend() {
            if (window.adminWs && window.adminWs.readyState === WebSocket.OPEN) {
                window.adminWs.send(JSON.stringify({
                    type: 'register_device',
                    device_id: id,
                }));
                console.log('[Spotify] Sent register_device to backend');
                return;
            }
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(trySend, 500);
            } else {
                console.warn('[Spotify] Could not send device_id — WebSocket not open');
            }
        }

        trySend();
    }

    function showSpotifyStatus(status) {
        var el = document.getElementById('spotify-status');
        if (!el) return;
        var labels = {
            connected: '🟢 Spotify connected',
            offline: '🟡 Spotify device offline',
            error: '🔴 Spotify error',
            auth_error: '🔴 Spotify auth error — reconnecting…',
            account_error: '🔴 Spotify Premium required',
        };
        el.textContent = labels[status] || status;
    }

    function showSpotifyConnectPrompt() {
        var el = document.getElementById('spotify-connect-prompt');
        if (el) {
            el.style.display = '';
        }
    }

    // Expose for debugging
    window.BeatifySpotify = {
        getDeviceId: function () { return deviceId; },
        getPlayer: function () { return spotifyPlayer; },
    };
})();
