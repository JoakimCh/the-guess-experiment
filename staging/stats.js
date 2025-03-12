
import {e, parallel, log, show, hide, disable, enable} from 'wrapped-elements'
import * as scoreDB from './scoreDatabase.js'

export const ui = {}

export const uiElements = [
  ui.textNoSession = e.text('Awaiting start...'),
  ui.showStatsFor = e.fieldset.id('showStatsFor')(
    e.legend('Show stats for:'),
    ui.form = e.form.class('horizontal')(
      e.label('Guesser:',
        e.input.type('radio').name('show').value('guesser')
      ),
      e.label('Both:',
        e.input.type('radio').name('show').value('both')
      ),
      e.label('Beyond session:',
        e.input.type('checkbox').name('beyondSession')
      ),
      ui.l_onlyWithPeer = e.label('Only with this peer:',
        e.input.type('checkbox').name('onlyWithPeer')
      )
    )
  ),
  ...((elements = []) => {
    for (const prefix of ['my', 'peer']) {
      elements.push(ui[prefix+'Stats'] = e.fieldset.class('vertical').style({width: '100%'})(
        e.legend(prefix.slice(0,1).toUpperCase()+prefix.slice(1)+' stats:'),
        e.div.class('horizontal')(
          e.div('Correct: ', ui[prefix+'_correct'] = e.text('0'), ' / ', ui[prefix+'_total'] = e.text('0'), ','),
          e.div('Z-score: ', ui[prefix+'_zScore'] = e.text('0')),
          ui[prefix+'_performance'] = e.text(),
        ),
        ui[prefix+'_canvas'] = e.canvas.width(500).height(200).style({width: '100%'})(),
      ))
    }
    return elements
  })()
]

hide(ui.showStatsFor, ui.myStats, ui.peerStats, ui.l_onlyWithPeer)
ui.form.show.value = 'guesser'

ui.form.onchange = ({target}) => {
  if (target.type == 'radio') {
    setShown(target.value)
  } else { // a checkbox
    update()
    if (ui.form.beyondSession.checked) {
      show(ui.l_onlyWithPeer)
    } else {
      hide(ui.l_onlyWithPeer)
    }
  }
}

export function setShown(shown) {
  hide(ui.myStats, ui.peerStats)
  if (shown == 'both') {
    show(ui.myStats, ui.peerStats)
  } else {
    if (mySide == 'guesser' && shown == 'guesser') {
      show(ui.myStats)
    } else {
      show(ui.peerStats)
    }
  }
}

export function calculateResults({total, correct, numCards}) {
  const prop = 1 / numCards // probability of guessing correctly
  const expected = total * prop // mean
  const stdDev = Math.sqrt(total * prop * (1 - prop))
  const zScore = (correct - expected) / stdDev
  return {
    total, correct, expected, 
    stdDev, zScore
  }
}

export function calculateMultiple(sessions) {
  let total = 0, correct = 0
  let expected = 0, variance = 0
  for (const s of sessions) {
    const prob = 1 / s.numCards
    total += s.total
    correct += s.correct
    expected += s.total * prob
    variance += s.total * prob * (1 - prob)
  }
  const stdDev = Math.sqrt(variance)
  const zScore = (correct - expected) / stdDev || 0
  return {
    total, correct, expected,
    stdDev, zScore, 
  }
}

export function zScoreComment(zScore) {
  if (Math.abs(zScore) < 1) {
    return '(within expected chance)'
  } else if (zScore > 1) {
    return '(above expected chance)'
  } else {
    return '(below expected chance)'
  }
}

function normalDistribution(x, mean, stdDev) {
  const coefficient = 1 / (stdDev * Math.sqrt(2 * Math.PI))
  const exponent = -((x - mean) ** 2) / (2 * stdDev ** 2)
  return coefficient * Math.exp(exponent)
}
function standardNormalDistribution(x) {
  const coefficient = 1 / Math.sqrt(2 * Math.PI)
  const exponent = -Math.pow(x, 2) / 2
  return coefficient * Math.exp(exponent)
}

/**
 * @param {HTMLCanvasElement} canvas 
 */
export function drawGraph(canvas, {zScore, scoreWindow = 3}) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  ctx.clearRect(0, 0, width, height)

  const zScoreSpan = scoreWindow * 2
  const pdfMax = standardNormalDistribution(0)
  const graphTop = 20 // leave a margin at top
  const xScale = width / zScoreSpan
  const yScale = (height-graphTop) / pdfMax
  const graphBottom = graphTop + pdfMax * yScale
  const oneStdDev = 1 * xScale
  const maxX = scoreWindow * xScale
  const minX = -scoreWindow * xScale

  ctx.translate(width / 2, 0) // make center x 0
  ctx.lineWidth = 3

  ctx.beginPath()
  ctx.strokeStyle = 'blue'
  const steps = 100
  for (let i = 0; i <= steps; i++) {
    const distX = -scoreWindow + (i / steps) * zScoreSpan
    const distY = standardNormalDistribution(distX)
    const pixelX = distX * xScale
    const pixelY = graphTop + (pdfMax-distY) * yScale
    if (i == 0) {
      ctx.moveTo(pixelX, pixelY)
    } else {
      ctx.lineTo(pixelX, pixelY)
    }
  }
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(0, graphTop)
  ctx.lineTo(0, graphBottom)
  ctx.moveTo(-oneStdDev, graphTop)
  ctx.lineTo(-oneStdDev, graphBottom)
  ctx.moveTo(oneStdDev, graphTop)
  ctx.lineTo(oneStdDev, graphBottom)
  ctx.strokeStyle = 'grey'
  ctx.setLineDash([4, 4])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  let scoreX = zScore * xScale
  scoreX = Math.max(minX, Math.min(scoreX, maxX))
  ctx.moveTo(scoreX, graphTop)
  ctx.lineTo(scoreX, graphBottom)
  ctx.strokeStyle = 'red'
  ctx.stroke()

  ctx.font = '14px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = prefersDark ? 'white' : 'black'
  const labelY = graphTop - 3
  ctx.fillText('-1σ', -oneStdDev, labelY)
  ctx.fillText('+1σ',  oneStdDev, labelY)
  ctx.fillText('Expected', 0, labelY)
  // ctx.fillText('Score', zPixelX, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0) // reset transform
}

let mySide
export function setSide(side) {
  mySide = side
  show(ui.showStatsFor)
  ui.textNoSession.data = ''
  setShown(ui.form.show.value)
}
// setSide('guesser')

export function update() {
  const {session, myTotal, peerTotal, myTotalWithPeer} = scoreDB.getScore()
  for (let total of [myTotal, peerTotal]) {
    const suffix = (total == myTotal ? 'my' : 'peer')
    const sessions = []
    if (ui.form.beyondSession.checked) {
      if (ui.form.onlyWithPeer.checked && suffix == 'my') {
        total = myTotalWithPeer // change it with this then
      }
      for (const numCards in total) {
        sessions.push({
          numCards,
          total: total[numCards].total,
          correct: total[numCards].correct,
        })
      }
    } else {
      if (session) {
        sessions.push({
          numCards: session.numCards,
          total: session[suffix+'Total'],
          correct: session[suffix+'Correct']
        })
      }
    }
    {
      const {zScore, total, correct} = calculateMultiple(sessions)
      ui[suffix+'_total'].textContent = total
      ui[suffix+'_correct'].textContent = correct
      ui[suffix+'_zScore'].textContent = zScore.toFixed(4)
      ui[suffix+'_performance'].textContent = zScoreComment(zScore)
      drawGraph(ui[suffix+'_canvas'], {zScore})
    }
  }
}
