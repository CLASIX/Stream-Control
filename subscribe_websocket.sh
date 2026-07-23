#!/bin/bash
# SC-test-44: Create Twitch EventSub subscription using WebSocket transport
# No public URL / ngrok needed — connects outbound from desktop to Twitch.

# You need a USER access token (not app token) for WebSocket subscriptions.
# Get one via Twitch OAuth or https://twitchapps.com/tokengen/ (requires authorization code).
# Example authorization URL (after logging in via browser):
# https://id.twitch.tv/oauth2/authorize?client_id=ithqdie1713rs7i5trcgpcngtdric&redirect_uri=http://localhost:8080/auth/callback&response_type=code&scope=channel:read:redemptions

# Replace these variables:
USER_TOKEN="YOUR_USER_ACCESS_TOKEN"
BROADCASTER_USER_ID="YOUR_NUMERIC_TWITCH_ID"
SESSION_ID="YOUR_SESSION_ID_FROM_EVENTSUB"

curl -X POST 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H 'Authorization: Bearer '$USER_TOKEN \
  -H 'Client-Id: ithqdie1713rs7i5trcgpcngtdric' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "channel.channel_points_custom_reward_redemption.add",
    "version": "1",
    "condition": {"broadcaster_user_id":"'"$BROADCASTER_USER_ID"'"},
    "transport": {"method":"websocket","session_id":"'"$SESSION_ID"'"}
  }'

echo ""
echo "Subscription created (if no errors). The desktop app connects to"
echo "wss://eventsub.wss.twitch.tv/ws and receives notifications directly."
echo "No ngrok. No public URL. 100% free."
