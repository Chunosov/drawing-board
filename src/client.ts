import "./styles.css";

import YPartyKitProvider from "y-partykit/provider";
import * as Y from "yjs";

declare const PARTYKIT_HOST: string;
const ROOM_NAME = 'my-new-room'

interface Point { x: number, y: number }

interface DrawCmd {
  clientId: string
  lineWidth: number
  erasing: boolean
  penColor: string
  points: Point[]
}

// Let's append all the messages we get into this DOM element
//const output = document.getElementById("app") as HTMLDivElement;

// Helper function to add a new line to the DOM
// function add(text: string) {
//   output.appendChild(document.createTextNode(text));
//   output.appendChild(document.createElement("br"));
// }

// A PartySocket is like a WebSocket, except it's a bit more magical.
// It handles reconnection logic, buffering messages while it's offline, and more.
// const conn = new PartySocket({
//   host: PARTYKIT_HOST,
//   room: "my-new-room",
// });

const yDoc = new Y.Doc();
const provider = new YPartyKitProvider(PARTYKIT_HOST, ROOM_NAME, yDoc);
let penColor = 'blue'
const lineCap = 'round'
const penWidth = 4
const eraserWidth = 30
let pressed = false
let mode: 'pen'|'erase'|'pan' = 'pen'
let timerDraw = false
let drawPoints = false
let prevPoint: Point = {x: 0, y: 0}
let points: {x: number, y: number}[] = []
let offset: Point = {x: 0, y: 0}
let drawnCmds = 0

let yCmds = yDoc.getArray('commands')
yCmds.observe(() => {
  replayCommands(yCmds.length === 0 ? 0: drawnCmds)
})

function replayCommands(startIndex: number, allClients = false) {
  requestAnimationFrame(() => {
    if (startIndex === 0) {
      ctx?.reset()
    }
    for (let i = startIndex; i < yCmds.length; i++) {
      const cmd = yCmds.get(i) as DrawCmd
      if (cmd.clientId === provider.id && !allClients) {
        continue
      }
      remoteDraw(cmd)
    }
    drawnCmds = yCmds.length
  })
}

/*
// You can even start sending messages before the connection is open!
conn.addEventListener("message", (event) => {
  try {
    const cmd = JSON.parse(event.data)
    console.log('DRAW', cmd.cmd)
    if (cmd.cmd === 'clear') {
      clearDraw()
    } else if (cmd.cmd === 'pen') {
      remoteDraw(cmd)
    } else if (cmd.cmd === 'init') {
      remoteInit(cmd)
    }
  } catch {
    console.log(`RECIEVE ${event.data}`);
  }
});

// Let's listen for when the connection opens
// And send a ping every 2 seconds right after
conn.addEventListener("open", () => {
  console.log("Connected!", conn.id);
  // add("Sending a ping every 2 seconds...");
  // // TODO: make this more interesting / nice
  // clearInterval(pingInterval);
  // pingInterval = setInterval(() => {
  //   conn.send("ping");
  // }, 1000);
});
*/

const mouseOverlay = document.getElementById("mouse-overlay") as HTMLDivElement
const canvas = document.getElementById("board-canvas") as HTMLCanvasElement
canvas.width = mouseOverlay.clientWidth
canvas.height = mouseOverlay.clientHeight
const ctx = canvas.getContext("2d")

const paintCursor = document.getElementById("paint-cursor") as HTMLDivElement
updatePaintCursor()

function checkButton(button: HTMLDivElement, on: boolean) {
  if (on) {
    button.classList.add('btn-selected')
  } else {
    button.classList.remove('btn-selected')
  }
}

const colors = ['red', 'green', 'blue', 'yellow', 'orange', 'black']
for (const color of colors) {
  const button = document.getElementById('btn-color-' + color) as HTMLDivElement
  if (button) {
    button.addEventListener('click', () => {
      for (const color of colors) {
        const b1 = document.getElementById('btn-color-' + color) as HTMLDivElement
        if (b1) {
          checkButton(b1, false)
        }
      }
      penColor = color
      updatePaintCursor()
      checkButton(button, true)
    })
    if (color === penColor) {
      updatePaintCursor()
      checkButton(button, true)
    }
  }
}

const btnClear = document.getElementById('btn-clear') as HTMLDivElement
btnClear.addEventListener('click', () => {
  clearDraw()
})

const btnPen = document.getElementById('btn-pen') as HTMLDivElement
btnPen.addEventListener('click', () => {
  if (mode === 'pen') {
    return
  }
  endDraw()
  mode = 'pen'
  checkButton(btnPen, true)
  checkButton(btnErase, false)
  checkButton(btnPan, false)
  updatePaintCursor()
})

const btnErase = document.getElementById('btn-erase') as HTMLDivElement
btnErase.addEventListener('click', () => {
  if (mode === 'erase') {
    return
  }
  endDraw()
  mode = 'erase'
  checkButton(btnPen, false)
  checkButton(btnErase, true)
  checkButton(btnPan, false)
  updatePaintCursor()
})

const btnPan = document.getElementById('btn-pan') as HTMLDivElement
btnPan.addEventListener('click', () => {
  if (mode === 'pan') {
    return
  }
  endDraw()
  mode = 'pan'
  checkButton(btnPen, false)
  checkButton(btnErase, false)
  checkButton(btnPan, true)
  updatePaintCursor()
})

let testT = 0
const testA = 5
const testB = 6
const testD = Math.PI / 2
let testSize: number
let testInterval: number

const btnTimerDraw = document.getElementById('btn-timer-draw') as HTMLDivElement
btnTimerDraw.addEventListener('click', () => {
  timerDraw = !timerDraw
  checkButton(btnTimerDraw, timerDraw)
  if (timerDraw) {
    testSize = Math.min(canvas.width, canvas.height) * 0.45
    points = [{
      x: canvas.width/2 + Math.sin(testA * testT + testD)*testSize,
      y: canvas.height/2 + Math.cos(testB * testT)*testSize
    }]
    testInterval = setInterval(() => {
      testT += 0.01
      const x = canvas.width/2 + Math.sin(testA * testT + testD)*testSize
      const y = canvas.height/2 + Math.cos(testB * testT)*testSize
      processDraw(x, y)
    }, 100);
  } else {
    clearInterval(testInterval)
  }
})

const btnDrawPoints = document.getElementById('btn-draw-points') as HTMLDivElement
btnDrawPoints.addEventListener('click', () => {
  drawPoints = !drawPoints
  checkButton(btnDrawPoints, drawPoints)
})

btnPen.classList.add('btn-selected')

function isPainting(): boolean {
  return (mode === 'pen' || mode === 'erase')
}

function updatePaintCursor() {
  if (isPainting()) {
    mouseOverlay.style.cursor = 'none'
    const erasing = mode === 'erase'
    const w = erasing ? eraserWidth : penWidth*2
    paintCursor.style.background = erasing ? 'none' : penColor
    paintCursor.style.border = erasing? '1px solid silver' : 'none'
    paintCursor.style.width = `${w}px`
    paintCursor.style.height = `${w}px`
  } else if (mode === 'pan') {
    mouseOverlay.style.cursor = 'move'
  }
}

mouseOverlay.addEventListener("mousedown", (e) => {
  e.preventDefault()
  if (!ctx) {
    return
  }
  pressed = true
  const x = e.offsetX
  const y = e.offsetY
  prevPoint = {x, y}
  if (isPainting()) {
    points = [{x: x - offset.x, y: y - offset.y}]
  }
})

mouseOverlay.addEventListener("mousemove", (e) => {
  e.preventDefault()
  const x = e.offsetX
  const y = e.offsetY

  if (isPainting()) {
    const w = (mode === 'erase' ? eraserWidth : penWidth*2)/2
    paintCursor.style.left = `${x-w}px`
    paintCursor.style.top = `${y-w}px`

    if (pressed) {
      processDraw(x, y)
    }
  }

  if (pressed && mode === 'pan') {
    offset.x += x - prevPoint.x
    offset.y += y - prevPoint.y
    prevPoint = {x, y}
    replayCommands(0, true)
  }
})

mouseOverlay.addEventListener("mouseup", (e) => {
  e.preventDefault()
  if (pressed) {
    if (isPainting()) {
      sendDraw()
    }
    pressed = false
  }
})

mouseOverlay.addEventListener("mouseenter", (e) => {
  if (isPainting()) {
    paintCursor.style.visibility = 'visible'
  }
})

mouseOverlay.addEventListener("mouseleave", (e) => {
  paintCursor.style.visibility = 'hidden'
  if (pressed) {
    if (isPainting()) {
      sendDraw()
    }
    pressed = false
  }
})

function processDraw(x: number, y: number) {
  if (!ctx) {
    return
  }
  window.requestAnimationFrame(() => {
    points.push({x: x - offset.x, y: y - offset.y})

    if (points.length > 1) {
      const prevPos = points[points.length - 2]
      const curPos = points[points.length - 1]
      const erasing = mode === 'erase'

      ctx.beginPath()
      ctx.strokeStyle = penColor
      ctx.lineCap = lineCap
      ctx.lineWidth = erasing ? eraserWidth : penWidth
      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
      ctx.moveTo(prevPos.x + offset.x, prevPos.y + offset.y)
      ctx.lineTo(curPos.x + offset.x, curPos.y + offset.y);
      ctx.stroke()

      if (drawPoints) {
        ctx.beginPath()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'black'
        ctx.ellipse(curPos.x, curPos.y, penWidth, penWidth, 0, 0, Math.PI*2)
        ctx.stroke()
      }

      if (points.length === 10) {
        sendDraw()
        points = [curPos]
      }
    }

    /*
    if (points.length < 3) {
      return
    }

    const prevPos1 = points[points.length - 3]
    const prevPos2 = points[points.length - 2]
    const curPos = points[points.length - 1]
    // const xc = (prevPos2.x + curPos.x) / 2
    // const yc = (prevPos2.y + curPos.y) / 2
    // const xc = (prevPos2.x + prevPos1.x) / 2
    // const yc = (prevPos2.y + prevPos1.y) / 2

    // ctx.font = "16px serif";
    // ctx.beginPath()
    // ctx.lineWidth = 1
    // ctx.strokeStyle = 'black'
    // ctx.ellipse(prevPos1.x, prevPos1.y, 2*penWidth, 2*penWidth, 0, 0, Math.PI*2)
    // ctx.fillText(`${points.length - 3}`, prevPos1.x, prevPos1.y)
    // ctx.strokeStyle = 'red'
    // ctx.ellipse(prevPos2.x, prevPos2.y, 2*penWidth, 2*penWidth, 0, 0, Math.PI*2)
    // ctx.fillText(`${points.length - 2}`, prevPos2.x, prevPos2.y)
    // ctx.stroke()


    ctx.beginPath()
    ctx.strokeStyle = penColor
    ctx.lineCap = lineCap
    ctx.lineWidth = erasing ? eraserWidth : penWidth
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
    ctx.moveTo(prevPos1.x, prevPos1.y)
    //ctx.quadraticCurveTo(prevPos2.x, prevPos2.y, xc, yc);
    //ctx.quadraticCurveTo(xc, yc, prevPos2.x, prevPos2.y);
    //ctx.quadraticCurveTo(prevPos2.x, prevPos2.y, curPos.x, curPos.y);
    ctx.lineTo(prevPos2.x, prevPos2.y);
    ctx.lineTo(curPos.x, curPos.y);
    ctx.stroke()
    ctx.closePath()

    //points = [curPos]*/
  })
}

function endDraw() {
  if (!isPainting()) {
    return
  }
  pressed = false
  sendDraw()
}

function sendDraw() {
  if (points.length > 1) {
    const erasing = mode === 'erase'
    const cmd: DrawCmd = {
      clientId: provider.id,
      lineWidth: erasing ? eraserWidth : penWidth,
      erasing,
      penColor,
      points
    }
    yCmds.push([cmd])
  }
}

function clearDraw() {
  yCmds.delete(0, yCmds.length)
}

function remoteDraw(cmd: DrawCmd) {
  if (!ctx) {
    return
  }
  ctx.beginPath()
  ctx.strokeStyle = cmd.penColor
  ctx.lineWidth = cmd.lineWidth
  ctx.lineCap = lineCap
  ctx.globalCompositeOperation = cmd.erasing ? 'destination-out' : 'source-over'
  ctx.moveTo(cmd.points[0].x + offset.x, cmd.points[0].y + offset.y)
  for (let i = 1; i < cmd.points.length; i++) {
    ctx.lineTo(cmd.points[i].x + offset.x, cmd.points[i].y + offset.y);
  }
  // ctx.moveTo(cmd.points[0].x, cmd.points[0].y)
  // for (let i = 1; i < cmd.points.length; i++) {
  //   ctx.lineTo(cmd.points[i].x, cmd.points[i].y);
  // }

  // for (let i = 1; i < cmd.points.length-1; i++) {
  //   const xc = (cmd.points[i].x + cmd.points[i + 1].x) / 2
  //   const yc = (cmd.points[i].y + cmd.points[i + 1].y) / 2
  //   ctx.quadraticCurveTo(cmd.points[i].x, cmd.points[i].y, xc, yc);
  // }
  ctx.stroke()
}
