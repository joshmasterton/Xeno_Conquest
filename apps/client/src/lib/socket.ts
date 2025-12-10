import { io, Socket } from "socket.io-client";

export function createSocket(url = "http://localhost:3001") {
  const socket: Socket = io(url, { transports: ["websocket"] });
  return socket;
}
