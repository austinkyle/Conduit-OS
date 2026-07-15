import { Client } from 'pg';
import type { CoreEvent } from './notify.js';

export function startCoreEventListener(onEvent: (event: CoreEvent) => void): void {
  let retryTimer: NodeJS.Timeout | undefined;

  const scheduleReconnect = (): void => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, 2_000);
  };

  const connect = async (): Promise<void> => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });

    client.on('notification', (msg) => {
      try {
        const event = JSON.parse(msg.payload ?? '') as CoreEvent;
        onEvent(event);
      } catch (error) {
        console.warn('conduit-reply core event listener received invalid payload', error);
      }
    });

    client.on('error', (error) => {
      console.warn('conduit-reply core event listener error', error);
      scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query('LISTEN conduit_events');
      console.log('conduit-reply core event listener connected');
    } catch (error) {
      console.warn('conduit-reply core event listener error', error);
      await client.end().catch(() => undefined);
      scheduleReconnect();
    }
  };

  void connect();
}
