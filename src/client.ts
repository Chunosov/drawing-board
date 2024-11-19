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

const yDoc = new Y.Doc();
const provider = new YPartyKitProvider(PARTYKIT_HOST, ROOM_NAME, yDoc);
let penColor = 'blue'
const lineCap = 'round'
const penWidth = 4
const eraserWidth = 30
const minLineLength = 6
let smoothLine = true
let pressed = false
let mode: 'pen'|'erase'|'pan' = 'pen'
let timerDraw = false
let drawPoints = false
let prevPoint: Point = {x: 0, y: 0}
let points: Point[] = []
let offset: Point = {x: 0, y: 0}
let drawnCmds = 0

let yCmds = yDoc.getArray('commands')
yCmds.observe(() => {
  if (yCmds.length === 0) {
    ctx.reset()
    offset = {x: 0, y: 0}
    drawnCmds = 0
    return
  }
  requestAnimationFrame(() => {
    replayCommands(drawnCmds)
  })
})

function replayCommands(startIndex: number, allClients = false) {
  for (let i = startIndex; i < yCmds.length; i++) {
    const cmd = yCmds.get(i) as DrawCmd
    if (cmd.clientId === provider.id && !allClients) {
      continue
    }
    remoteDraw(cmd)
  }
  drawnCmds = yCmds.length
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

// Simulate the case when someone is drawing in one window
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

const btnSmoothLine = document.getElementById('btn-smooth-line') as HTMLDivElement
btnSmoothLine.onclick = () => {
  smoothLine = !smoothLine
  checkButton(btnSmoothLine, smoothLine)
}

const btnRefresh = document.getElementById('btn-refresh') as HTMLDivElement
btnRefresh.onclick = () => {
  ctx.reset()
  ctx.translate(offset.x, offset.y)
  replayCommands(0, true)
}

checkButton(btnPen, true)
checkButton(btnSmoothLine, smoothLine)

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
      if (smoothLine && Math.hypot(prevPoint.x - x, prevPoint.y - y) < minLineLength) {
        return
      }
      processDraw(x, y)
      prevPoint = {x, y}
    }
  }

  if (pressed && mode === 'pan') {
    requestAnimationFrame(() => {
      offset.x += x - prevPoint.x
      offset.y += y - prevPoint.y
      prevPoint = {x, y}
      ctx.reset()
      ctx.translate(offset.x, offset.y)
      replayCommands(0, true)
    })
  }
}

canvas.onpointerup = e => {
  canvas.releasePointerCapture(e.pointerId)
  e.preventDefault()
  if (pressed) {
    if (isPainting()) {
      const x = e.offsetX
      const y = e.offsetY
      processDraw(x, y, true)
      sendDraw()
    }
    pressed = false
  }
}

canvas.onpointerenter = () => {
  if (isPainting()) {
    canvasCursor.style.visibility = 'visible'
  }
}

canvas.onpointerleave = () => {
  if (isPainting()) {
    canvasCursor.style.visibility = 'hidden'
  }
}

function avgPoint(p1: Point, p2: Point): Point {
  return {x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 }
}

function processDraw(x: number, y: number, lastPoint = false) {
  window.requestAnimationFrame(() => {
    points.push({x: x - offset.x, y: y - offset.y})
    const cnt = points.length
    if (cnt > 1) {
      const curPos = points[cnt-1]
      const prevPos = points[cnt-2]
      const erasing = mode === 'erase'

      ctx.beginPath()
      ctx.strokeStyle = penColor
      ctx.lineCap = lineCap
      ctx.lineWidth = erasing ? eraserWidth : penWidth
      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
      if (smoothLine) {
        const avg = avgPoint(prevPos, curPos)
        if (cnt === 2) {
          ctx.moveTo(prevPos.x, prevPos.y)
          if (lastPoint) {
            ctx.lineTo(curPos.x, curPos.y);
          } else {
            ctx.quadraticCurveTo(curPos.x, curPos.y, avg.x, avg.y)
          }
        } else {
          const prevAvg = avgPoint(points[cnt-3], prevPos)
          ctx.moveTo(prevAvg.x, prevAvg.y)
          if (lastPoint) {
            ctx.quadraticCurveTo(prevPos.x, prevPos.y, curPos.x, curPos.y)
          } else {
            ctx.quadraticCurveTo(prevPos.x, prevPos.y, avg.x, avg.y)
          }
        }
      } else {
        ctx.moveTo(prevPos.x, prevPos.y)
        ctx.lineTo(curPos.x, curPos.y);
      }
      ctx.stroke()

      if (drawPoints && !erasing) {
        ctx.beginPath()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'black'
        ctx.ellipse(curPos.x, curPos.y, penWidth, penWidth, 0, 0, Math.PI*2)
        ctx.stroke()
      }
    }
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
  const cnt = cmd.points.length
  if (cnt < 2) {
    return
  }
  ctx.beginPath()
  ctx.strokeStyle = cmd.penColor
  ctx.lineWidth = cmd.lineWidth
  ctx.lineCap = lineCap
  ctx.globalCompositeOperation = cmd.erasing ? 'destination-out' : 'source-over'
  if (cnt === 2) {
    const curPos = cmd.points[cnt-1]
    const prevPos = cmd.points[cnt-2]
    ctx.moveTo(prevPos.x, prevPos.y)
    ctx.lineTo(curPos.x, curPos.y)
  } else {
    for (let i = 1; i < cnt; i++) {
      const curPos = cmd.points[i]
      const prevPos = cmd.points[i-1]
      if (smoothLine) {
        const avg = avgPoint(prevPos, curPos)
        if (i === 1) {
          ctx.moveTo(prevPos.x, prevPos.y)
          ctx.quadraticCurveTo(curPos.x, curPos.y, avg.x, avg.y)
        } else {
          const prevAvg = avgPoint(cmd.points[i-2], prevPos)
          ctx.moveTo(prevAvg.x, prevAvg.y)
          if (i === cnt-1) {
            ctx.quadraticCurveTo(prevPos.x, prevPos.y, curPos.x, curPos.y)
          } else {
            ctx.quadraticCurveTo(prevPos.x, prevPos.y, avg.x, avg.y)
          }
        }
      } else {
        ctx.moveTo(prevPos.x, prevPos.y)
        ctx.lineTo(curPos.x, curPos.y)
      }
    }
  }
  ctx.stroke()
}
