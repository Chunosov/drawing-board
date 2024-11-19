import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(
      `Connected:` +
      `\n  id: ${conn.id}` +
      `\n  room: ${this.room.id}` +
      `\n  url: ${new URL(ctx.request.url).pathname}`
    );

    return onConnect(conn, this.room, {
    });
  }
}

Server satisfies Party.Worker;
