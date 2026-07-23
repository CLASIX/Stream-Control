#!/bin/bash
# SC-test-44: WebSocket test instructions (no webhook / ngrok needed).
# The desktop app connects to wss://eventsub.wss.twitch.tv/ws automatically.
# 1. Start the app: npm start
# 2. Check console for: "[EventSub] WebSocket connected"
# 3. Check console for session ID after "session_welcome"
# 4. Create subscription using subscribe_websocket.sh (needs user token + session ID)
# 5. When Twitch sends a notification, the redemptions tab triggers automatically.
# No external tunnel. No public URL. Zero cost.
echo "WebSocket mode active. See subscribe_websocket.sh for subscription creation."
echo "Client ID: ithqdie1713rs7i5trcgpcngtdric"
