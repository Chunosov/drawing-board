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

const boardElement = document.getElementById("board") as HTMLDivElement
const canvas = document.getElementById("board-canvas") as HTMLCanvasElement
canvas.width = boardElement.clientWidth
canvas.height = boardElement.clientHeight
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D

const canvasCursor = document.getElementById("canvas-cursor") as HTMLDivElement
updateCanvasCursor()

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
    button.onclick = () => {
      for (const color of colors) {
        const b1 = document.getElementById('btn-color-' + color) as HTMLDivElement
        if (b1) {
          checkButton(b1, false)
        }
      }
      penColor = color
      updateCanvasCursor()
      checkButton(button, true)
    }
    if (color === penColor) {
      updateCanvasCursor()
      checkButton(button, true)
    }
  }
}

const btnClear = document.getElementById('btn-clear') as HTMLDivElement
btnClear.onclick = () => {
  clearDraw()
}

const btnPen = document.getElementById('btn-pen') as HTMLDivElement
btnPen.onclick = () => {
  if (mode === 'pen') {
    return
  }
  endDraw()
  mode = 'pen'
  checkButton(btnPen, true)
  checkButton(btnErase, false)
  checkButton(btnPan, false)
  updateCanvasCursor()
}

const btnErase = document.getElementById('btn-erase') as HTMLDivElement
btnErase.onclick = () => {
  if (mode === 'erase') {
    return
  }
  endDraw()
  mode = 'erase'
  checkButton(btnPen, false)
  checkButton(btnErase, true)
  checkButton(btnPan, false)
  updateCanvasCursor()
}

const btnPan = document.getElementById('btn-pan') as HTMLDivElement
btnPan.onclick = () => {
  if (mode === 'pan') {
    return
  }
  endDraw()
  mode = 'pan'
  checkButton(btnPen, false)
  checkButton(btnErase, false)
  checkButton(btnPan, true)
  updateCanvasCursor()
}

// Simulate the case when someone is darwing in one window
// Then drag/draw/erase in another window and check if all changes as expected
const btnTimerDraw = document.getElementById('btn-timer-draw') as HTMLDivElement
btnTimerDraw.onclick = () => {
  timerDraw = !timerDraw
  checkButton(btnTimerDraw, timerDraw)
  let timerId: number|null = null
  if (timerDraw) {
    let t = 0
    const a = 5
    const b = 6
    const d = Math.PI / 2
    const sz = Math.min(canvas.width, canvas.height) * 0.45
    points = [{
      x: canvas.width/2 + Math.sin(a*t + d)*sz,
      y: canvas.height/2 + Math.cos(b*t)*sz
    }]
    timerId = setInterval(() => {
      t += 0.01
      const x = canvas.width/2 + Math.sin(a*t + d)*sz
      const y = canvas.height/2 + Math.cos(b*t)*sz
      processDraw(x, y)
    }, 100);
  } else {
    if (timerId) {
      clearInterval(timerId)
    }
  }
}

const btnDrawPoints = document.getElementById('btn-draw-points') as HTMLDivElement
btnDrawPoints.onclick = () => {
  drawPoints = !drawPoints
  checkButton(btnDrawPoints, drawPoints)
}

checkButton(btnPen, true)

function isPainting(): boolean {
  return (mode === 'pen' || mode === 'erase')
}

function updateCanvasCursor() {
  if (isPainting()) {
    canvas.style.cursor = 'none'
    const erasing = mode === 'erase'
    const w = erasing ? eraserWidth : penWidth*2
    canvasCursor.style.background = erasing ? 'none' : penColor
    canvasCursor.style.border = erasing? '1px solid silver' : 'none'
    canvasCursor.style.width = `${w}px`
    canvasCursor.style.height = `${w}px`
  } else if (mode === 'pan') {
    canvas.style.cursor = 'move'
  } else {
    canvas.style.cursor = 'default'
  }
}

canvas.onpointerdown = e => {
  canvas.setPointerCapture(e.pointerId)
  e.preventDefault()
  pressed = true
  const x = e.offsetX
  const y = e.offsetY
  prevPoint = {x, y}
  if (isPainting()) {
    points = [{x: x - offset.x, y: y - offset.y}]
  }
};

canvas.onpointermove = e => {
  e.preventDefault()
  const x = e.offsetX
  const y = e.offsetY

  if (isPainting()) {
    const w = (mode === 'erase' ? eraserWidth : penWidth*2)/2
    canvasCursor.style.left = `${x-w}px`
    canvasCursor.style.top = `${y-w}px`

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
}

canvas.onpointerup = e => {
  canvas.releasePointerCapture(e.pointerId)
  e.preventDefault()
  if (pressed) {
    if (isPainting()) {
      sendDraw()
    }
    pressed = false
  }
}

canvas.onpointerenter = _ => {
  if (isPainting()) {
    canvasCursor.style.visibility = 'visible'
  }
}

canvas.onpointerleave = _ => {
  canvasCursor.style.visibility = 'hidden'
  if (pressed) {
    if (isPainting()) {
      sendDraw()
    }
    pressed = false
  }
}

function processDraw(x: number, y: number) {
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
