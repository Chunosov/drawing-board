import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

//let drawData: string[] = []

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(
      `Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`
    );

    return onConnect(conn, this.room, {
    });

    // conn.send(JSON.stringify({
    //   cmd: 'init',
    //   data: drawData
    // }))
  }

  // onMessage(message: string, sender: Party.Connection) {
  //   try {
  //     let cmd = JSON.parse(message)
  //     console.log('DRAW', sender.id, cmd.cmd)
  //     if (cmd.cmd === 'clear') {
  //       drawData = []
  //     } else {
  //       drawData.push(message)
  //     }
  //     this.room.broadcast(message, [sender.id]);
  //   } catch {
  //     console.error('Unsupported message', message)
  //   }
  // }
}

Server satisfies Party.Worker;
