import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { getSocketIoCorsConfig } from './config/cors-origins';

/**
 * Adaptador Socket.IO con CORS y credenciales alineados al resto de la API
 * (cookies HttpOnly en handshake cross-origin).
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const cors = getSocketIoCorsConfig();
    return super.createIOServer(port, {
      ...options,
      cors,
    });
  }
}
