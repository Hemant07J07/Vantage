"""
Single websocket consumer the Next.js dashboard connects to for live
updates. It doesn't accept messages from the client beyond the initial
connection — it's a one-way broadcast channel fed by tasks.py.
"""
import json

from channels.generic.websocket import AsyncWebsocketConsumer


class DashboardConsumer(AsyncWebsocketConsumer):
    GROUP_NAME = "dashboard"

    async def connect(self):
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({"event": "connected"}))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def dashboard_event(self, event):
        """Handler name must match the 'type' sent via group_send
        ('dashboard.event' -> 'dashboard_event')."""
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "payload": event["payload"],
        }))
